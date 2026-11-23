/*
 * PromaWheel: руль для PromaRacer на M5Stack Cardputer ADV (BMI270)
 *
 * Cardputer выглядит для телефона как обычная Bluetooth-клавиатура "PromaRacer Wheel".
 * Подключается в Настройки -> Bluetooth, браузеру Web Bluetooth не нужен: игра просто
 * получает нажатия клавиш.
 *
 * Что уходит в игру:
 *   клавиша 9 (пока зажата)  -> газ
 *   клавиша o (пока зажата)  -> тормоз
 *   клавиша 0                -> передача выше
 *   клавиша p                -> передача ниже
 *   буквы "bcfghijklmtuy"    -> положение руля: b = до упора влево, i = центр, y = до упора вправо
 *                            (буквы подобраны так, чтобы не пересекаться с W A S D Q E R V N на компьютере)
 *
 * Клавиши только для самого Cardputer (в игру не уходят):
 *   Enter -> текущее положение руля считать "прямо"
 *   Del   -> поменять направление поворота (если руль крутится наоборот)
 *   1     -> сменить ось измерения (0, 1, 2) - подобрать, пока руль не заработает правильно
 *   [ и ] -> уменьшить / увеличить угол поворота руля до упора (по умолчанию 90 градусов)
 *
 * Библиотеки (Arduino IDE, Library Manager):
 *   - M5Unified, M5GFX, M5Cardputer
 *   - SparkFun BMI270 Arduino Library (нужна только из-за встроенного Bosch API)
 *   - BLE-клавиатура с API класса BleKeyboard (см. README: для ядра ESP32 3.x нужна
 *     версия на NimBLE, например ESP32-NimBLE-Keyboard + NimBLE-Arduino 1.4.x)
 * Плата: M5Cardputer (пакет M5Stack). Tools -> USB CDC On Boot: Enabled, чтобы видеть Serial.
 *
 * ВАЖНО про I2C (так же сделано в CardputerADV_BMI270_events): BMI270 сидит на внутренней
 * шине (SDA=G8, SCL=G9) вместе с клавиатурой. Arduino Wire на этих пинах не поднимать, все
 * обращения к датчику идут через M5.In_I2C. Датчик ведётся напрямую через Bosch API
 * (bmi270_legacy_*), как в примере, поэтому cfg.internal_imu = false.
 */

#include <M5Cardputer.h>
#include <BleKeyboard.h>
#include "SparkFun_BMI270_Arduino_Library.h"   // нужен, чтобы IDE подключила библиотеку с Bosch API
#include "bmi270_api/bmi270_legacy.h"

#define DEBUG_LOG 1
#if DEBUG_LOG
#define LOG(...) Serial.printf(__VA_ARGS__)
#else
#define LOG(...) do {} while (0)
#endif

// ---------- Настройки (подбираются опытным путём) ----------
const char*  BLE_NAME      = "PromaRacer Wheel";
const char   STEER_KEYS[]  = "bcfghijklmtuy";   // 13 уровней, центр = 'i'
const int    LEVELS        = 13;
const float  ANGLE_SMOOTH  = 0.25f;     // 1 = без сглаживания, меньше = плавнее руль, но с задержкой
const float  DEFAULT_RANGE = 90.0f;     // градусов поворота до упора
const uint32_t STEER_MIN_INTERVAL_MS = 25;   // не чаще, чтобы не забить BLE
const uint32_t STEER_REPEAT_MS       = 400;  // повторять текущий уровень, если игра пропустила пакет
const uint32_t IMU_POLL_MS           = 10;   // 100 Гц

// Педали: клавиша Cardputer -> клавиша в игре (одна и та же), передаётся как нажатие/отпускание
struct PedalKey { char key; bool down; };
PedalKey pedals[] = { {'9', false}, {'o', false}, {'0', false}, {'p', false} };

// ---------- Доступ к BMI270 через M5.In_I2C (как в CardputerADV_BMI270_events) ----------
uint8_t        bmiAddr  = BMI2_I2C_PRIM_ADDR;   // 0x68, при старте проверяется и 0x69
const uint32_t BMI_FREQ = 400000;
const float    ACC_LSB_PER_G = 4096.0f;         // диапазон 8G

static BMI2_INTF_RETURN_TYPE bmiRead(uint8_t reg, uint8_t* data, uint32_t len, void*) {
  return M5.In_I2C.readRegister(bmiAddr, reg, data, len, BMI_FREQ) ? BMI2_INTF_RET_SUCCESS : BMI2_E_COM_FAIL;
}
static BMI2_INTF_RETURN_TYPE bmiWrite(uint8_t reg, const uint8_t* data, uint32_t len, void*) {
  return M5.In_I2C.writeRegister(bmiAddr, reg, data, len, BMI_FREQ) ? BMI2_INTF_RET_SUCCESS : BMI2_E_COM_FAIL;
}
static void bmiDelayUs(uint32_t us, void*) {
  if (us >= 1000) delay(us / 1000);
  delayMicroseconds(us % 1000);
}

bmi2_dev bmi;
M5Canvas canvas(&M5.Display);
BleKeyboard ble(BLE_NAME, "Proma", 100);

bool imuOk = false;
uint32_t i2cErrors = 0;

bool setupImu() {
  uint8_t chipId = 0;
  for (uint8_t addr : { BMI2_I2C_PRIM_ADDR, BMI2_I2C_SEC_ADDR }) {
    chipId = M5.In_I2C.readRegister8(addr, 0x00, BMI_FREQ);
    LOG("BMI270 @0x%02X CHIP_ID = 0x%02X (expected 0x24)\n", addr, chipId);
    if (chipId == 0x24) { bmiAddr = addr; break; }
  }
  if (chipId != 0x24) return false;

  memset(&bmi, 0, sizeof(bmi));
  bmi.intf = BMI2_I2C_INTF;
  bmi.read = bmiRead;
  bmi.write = bmiWrite;
  bmi.delay_us = bmiDelayUs;
  bmi.intf_ptr = nullptr;
  bmi.read_write_len = 128;
  bmi.config_file_ptr = nullptr;   // встроенный legacy-конфиг

  int tries = 0;
  int8_t r;
  while ((r = bmi270_legacy_init(&bmi)) != BMI2_OK) {
    LOG("bmi270_legacy_init failed: %d, retry...\n", r);
    if (++tries >= 5) return false;
    delay(500);
  }
  r = bmi2_set_adv_power_save(BMI2_DISABLE, &bmi);
  if (r != BMI2_OK) LOG("adv_power_save FAILED: %d\n", r);

  // Акселерометр: 100 Гц, диапазон 8G (как в примере)
  bmi2_sens_config acc;
  acc.type = BMI2_ACCEL;
  r = bmi270_legacy_get_sensor_config(&acc, 1, &bmi);
  if (r == BMI2_OK) {
    acc.cfg.acc.odr = BMI2_ACC_ODR_100HZ;
    acc.cfg.acc.range = BMI2_ACC_RANGE_8G;
    acc.cfg.acc.bwp = BMI2_ACC_NORMAL_AVG4;
    acc.cfg.acc.filter_perf = BMI2_PERF_OPT_MODE;
    r = bmi270_legacy_set_sensor_config(&acc, 1, &bmi);
  }
  if (r != BMI2_OK) { LOG("accel config FAILED: %d\n", r); return false; }

  uint8_t id = BMI2_ACCEL;
  r = bmi270_legacy_sensor_enable(&id, 1, &bmi);
  if (r != BMI2_OK) { LOG("enable(accel) FAILED: %d\n", r); return false; }
  LOG("BMI270 OK\n");
  return true;
}

bool readAccel(float& x, float& y, float& z) {
  bmi2_sens_data d;
  memset(&d, 0, sizeof(d));
  if (bmi2_get_sensor_data(&d, &bmi) != BMI2_OK) { i2cErrors++; return false; }
  x = d.acc.x / ACC_LSB_PER_G;
  y = d.acc.y / ACC_LSB_PER_G;
  z = d.acc.z / ACC_LSB_PER_G;
  return true;
}

// ---------- Руль ----------
float rangeDeg = DEFAULT_RANGE;     // градусов до упора
int   axisMode = 2;                 // 0: atan2(x,z)  1: atan2(y,z)  2: atan2(x,y)
float steerSign = 1.0f;
float zeroDeg = 0.0f;               // угол, который считается "прямо"
float rawDeg = 0.0f;                // угол по гравитации, градусы
float angle = 0.0f;                 // сглаженный угол относительно zeroDeg, с учётом знака
float fx = 0, fy = 0, fz = 1;       // сглаженный вектор гравитации
float lastAx = 0, lastAy = 0, lastAz = 0;

static float wrap180(float a) {
  while (a > 180.0f) a -= 360.0f;
  while (a <= -180.0f) a += 360.0f;
  return a;
}

float angleFromGravity(float x, float y, float z) {
  float a;
  switch (axisMode) {
    case 0:  a = atan2f(x, z); break;
    case 1:  a = atan2f(y, z); break;
    default: a = atan2f(x, y); break;
  }
  return a * 180.0f / (float)PI;
}

void updateSteering() {
  float x, y, z;
  if (!readAccel(x, y, z)) return;
  lastAx = x; lastAy = y; lastAz = z;
  // сначала сглаживаем сам вектор: так нет проблем со скачком угла на границе +-180
  fx += (x - fx) * 0.3f; fy += (y - fy) * 0.3f; fz += (z - fz) * 0.3f;
  rawDeg = angleFromGravity(fx, fy, fz);
  float target = wrap180(steerSign * (rawDeg - zeroDeg));
  angle = wrap180(angle + wrap180(target - angle) * ANGLE_SMOOTH);
}

// ---------- Клавиши Cardputer ----------
bool wordHas(const std::vector<char>& w, char c) {
  for (char x : w) if (x == c) return true;
  return false;
}

String lastKeys = "";
bool prevOne = false, prevL = false, prevR = false, prevEnter = false, prevDel = false;

void handleKeys(bool connected) {
  auto st = M5Cardputer.Keyboard.keysState();
  lastKeys = "";
  for (char c : st.word) lastKeys += c;

  // педали -> нажатие/отпускание клавиши в игре
  for (auto& p : pedals) {
    bool now = wordHas(st.word, p.key);
    if (now != p.down) {
      p.down = now;
      LOG("pedal %c %s\n", p.key, now ? "down" : "up");
      if (connected) { if (now) ble.press(p.key); else ble.release(p.key); }
    }
  }

  // служебные клавиши: срабатывают один раз при нажатии
  bool one = wordHas(st.word, '1'), l = wordHas(st.word, '['), r = wordHas(st.word, ']');
  if (st.enter && !prevEnter) { zeroDeg = rawDeg; angle = 0; LOG("zero = %.1f\n", zeroDeg); }
  if (st.del && !prevDel) steerSign = -steerSign;
  if (one && !prevOne) { axisMode = (axisMode + 1) % 3; zeroDeg = angleFromGravity(fx, fy, fz); angle = 0; }
  if (l && !prevL) rangeDeg = max(20.0f, rangeDeg - 10.0f);
  if (r && !prevR) rangeDeg = min(180.0f, rangeDeg + 10.0f);
  prevEnter = st.enter; prevDel = st.del; prevOne = one; prevL = l; prevR = r;
}

// ---------- Отправка положения руля ----------
int lastLevel = -1;
uint32_t lastSend = 0;
int      sentCount = 0;

void sendSteering(bool connected, uint32_t now) {
  float n = constrain(angle / rangeDeg, -1.0f, 1.0f);
  float pos = (n + 1.0f) * 0.5f * (LEVELS - 1);
  bool changed = (lastLevel < 0) || fabsf(pos - lastLevel) > 0.65f;   // небольшой гистерезис против дребезга
  if (changed) lastLevel = (int)lroundf(pos);
  if (!connected) return;
  if (now - lastSend >= STEER_MIN_INTERVAL_MS && (changed || now - lastSend >= STEER_REPEAT_MS)) {
    ble.write((uint8_t)STEER_KEYS[lastLevel]);
    lastSend = now;
    sentCount++;
  }
}

// ---------- Экран ----------
void draw(bool connected) {
  canvas.fillSprite(TFT_BLACK);
  canvas.setFont(&fonts::Font2);
  canvas.setTextDatum(top_left);
  canvas.setTextColor(connected ? TFT_GREEN : TFT_ORANGE);
  canvas.drawString(connected ? "BT: connected" : "BT: waiting for phone", 2, 2);
  canvas.setTextColor(TFT_WHITE);
  if (!imuOk) {
    canvas.setTextColor(TFT_RED);
    canvas.drawString("BMI270 NOT FOUND (see Serial)", 2, 24);
    canvas.pushSprite(0, 0);
    return;
  }
  char buf[64];
  snprintf(buf, sizeof(buf), "angle %4.0f  level %c  sent %d", angle, lastLevel >= 0 ? STEER_KEYS[lastLevel] : '-', sentCount);
  canvas.drawString(buf, 2, 24);
  snprintf(buf, sizeof(buf), "axis %d  sign %c  range %.0f", axisMode, steerSign > 0 ? '+' : '-', rangeDeg);
  canvas.drawString(buf, 2, 44);
  snprintf(buf, sizeof(buf), "keys: %s%s%s%s", pedals[0].down ? "GAS " : "", pedals[1].down ? "BRK " : "",
           pedals[2].down ? "UP " : "", pedals[3].down ? "DOWN" : "");
  canvas.drawString(buf, 2, 64);

  // шкала руля
  int x0 = 10, w = canvas.width() - 20, y = 92;
  canvas.drawRect(x0, y, w, 14, TFT_WHITE);
  canvas.drawFastVLine(x0 + w / 2, y - 4, 22, TFT_DARKGREY);
  float n = constrain(angle / rangeDeg, -1.0f, 1.0f);
  int cx = x0 + (int)((n + 1.0f) * 0.5f * w);
  canvas.fillRect(cx - 3, y - 4, 7, 22, TFT_RED);
  canvas.setTextColor(TFT_DARKGREY);
  canvas.drawString("Enter=zero Del=flip 1=axis [ ]=range", 2, 118);
  canvas.pushSprite(0, 0);
}

// ---------- Arduino ----------
void setup() {
  auto cfg = M5.config();
  cfg.serial_baudrate = 115200;
  cfg.internal_imu = false;   // IMU ведём сами через Bosch API
  cfg.internal_spk = false;
  cfg.internal_mic = false;
  M5Cardputer.begin(cfg, true);   // true = включить клавиатуру

#if DEBUG_LOG
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 2000) delay(10);
#endif
  LOG("\n=== PromaWheel (Cardputer ADV) ===\nBoard id: %d\n", (int)M5.getBoard());

  M5.Display.setRotation(1);
  M5.Display.setBrightness(80);
  canvas.createSprite(M5.Display.width(), M5.Display.height());
  canvas.fillSprite(TFT_BLACK);
  canvas.setFont(&fonts::Font2);
  canvas.setTextColor(TFT_WHITE);
  canvas.drawString("BMI270 init...", 2, 2);
  canvas.pushSprite(0, 0);

  imuOk = setupImu();
  ble.begin();
}

void loop() {
  M5Cardputer.update();
  uint32_t now = millis();
  bool connected = ble.isConnected();

  static uint32_t lastImu = 0, lastDraw = 0;
  if (imuOk && now - lastImu >= IMU_POLL_MS) {
    lastImu = now;
    updateSteering();
  }
  handleKeys(connected);
  if (imuOk) sendSteering(connected, now);

  if (now - lastDraw >= 100) {
    lastDraw = now;
    draw(connected);
  }
}
