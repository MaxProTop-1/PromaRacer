# PromaRacer

Гоночная игра в браузере: телефон в картонных VR-очках (гироскоп для обзора), руль и педали на M5Stack Cardputer ADV.

## Файлы
- `index.html` — игра (один файл, Three.js с CDN).
- `firmware/PromaWheel/PromaWheel.ino` — прошивка Cardputer ADV.

## 1. Игра

### Тест с клавиатуры (без Cardputer)
Открой `index.html` в браузере на компьютере. Enter — старт, стрелки влево/вправо — руль, вверх — газ, вниз — тормоз, X / Z — передача выше / ниже. Зажатая мышь — осмотреться.

### Игра на телефоне
Гироскопу iPhone нужен HTTPS, поэтому выложи игру на GitHub Pages: репозиторий -> Settings -> Pages -> Source: Deploy from a branch -> Branch: `main`, папка `/ (root)` -> Save. Через минуту игра будет на `https://maxprotop-1.github.io/promaracer/`.

## 2. Как прошить Cardputer ADV

1. Установи Arduino IDE 2.x.
2. File -> Preferences -> Additional boards manager URLs, добавь `https://static-cdn.m5stack.com/resource/arduino/package_m5stack_index.json`.
3. Boards Manager: установи пакет **M5Stack**. Tools -> Board -> M5Stack -> **M5Cardputer**.
4. Library Manager: установи **M5Unified**, **M5GFX**, **M5Cardputer**, **SparkFun BMI270 Arduino Library**.
5. Библиотека BLE-клавиатуры (класс `BleKeyboard`):
   - ядро ESP32 2.0.x: **ESP32 BLE Keyboard** (T-vK);
   - ядро ESP32 3.x (пакет M5Stack 3.x): версия на NimBLE, **ESP32-NimBLE-Keyboard** (wakwak-koba) вместе с **NimBLE-Arduino 1.4.x**. Ставятся из ZIP с GitHub: Sketch -> Include Library -> Add .ZIP Library.
6. Открой `firmware/PromaWheel/PromaWheel.ino` (папка должна называться `PromaWheel`).
7. Tools -> **USB CDC On Boot: Enabled** (чтобы видеть логи в Serial Monitor, 115200).
8. Подключи Cardputer кабелем USB-C, выбери порт в Tools -> Port, нажми Upload.
9. Если порт не появился: выключи Cardputer, зажми кнопку G0, включи питание боковым переключателем, отпусти G0 и снова выбери порт.

## 3. Подключение и запуск
1. На экране Cardputer должно быть `BT: waiting for phone`.
2. iPhone: Настройки -> Bluetooth -> **PromaRacer Wheel**. После подключения на Cardputer будет `BT: connected`.
3. Открой игру в Safari, телефон горизонтально. В меню видно последнюю клавишу и положение руля: покрути руль и нажми 9, o, 0, p.
4. «Старт (VR очки)», разреши доступ к датчикам движения. Тап по экрану — выровнять взгляд вперёд.

## Управление Cardputer
| Клавиша | Действие |
|---|---|
| `9` (держать) | газ |
| `o` (держать) | тормоз |
| `0` / `p` | передача выше / ниже |
| Enter | текущее положение руля = «прямо» |
| Del | поменять направление руля |
| `1` | сменить ось измерения (если руль не реагирует) |
| `[` / `]` | угол поворота руля до упора (по умолчанию 90 градусов) |

## Как устроена связь
Cardputer по BLE работает как клавиатура. Газ, тормоз и передачи уходят как обычные нажатия `9`, `o`, `0`, `p`. Положение руля уходит буквами `a`..`m` (13 уровней, `g` — центр). Угол руля считается по направлению гравитации в плоскости датчика, поэтому руль должен вращаться вокруг оси, не лежащей горизонтально.

## Не проверено на железе
Игра прогнана в симуляции физики (0-100 км/ч за 3,6 с), прошивка на устройстве ещё не запускалась. Датчик и клавиатура подключены по тому же принципу, что и в примере `imuFishingGame` (`M5.In_I2C` и Bosch API, без `Wire`).
