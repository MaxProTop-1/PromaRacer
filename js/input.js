"use strict";
/* Ввод. Cardputer (BLE-клавиатура): 9 = газ, o = тормоз, 0 = передача выше, p = передача ниже,
   13 букв "bcfghijklmtuy" = положение руля (b = до упора влево, i = центр, y = до упора вправо);
   эти буквы не пересекаются с клавишами компьютера.
   Компьютер: W газ, S тормоз, A / D руль, E / Q передачи, R, V, N, Пробел (помощники), Esc, Enter (стрелки и X / Z тоже работают). */
const STEER_KEYS = "bcfghijklmtuy";
const input = {
  gas: 0, brake: 0, hand: 0, steerTarget: 0, steer: 0, kbLeft: 0, kbRight: 0,
  lastKey: "—", steerSeen: false, pendingGear: 0, pendingReset: false, pendingView: false, pendingAuto: false,
  pendingPause: false, pendingAssist: false, onEnter: null
};

function onKey(e, down) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (down && k === "Enter") { if (input.onEnter) { input.onEnter(); e.preventDefault(); } return; }
  let used = true;
  if (k === "9" || k === "w" || k === "ArrowUp") input.gas = down ? 1 : 0;
  else if (k === "o" || k === "s" || k === "ArrowDown") input.brake = down ? 1 : 0;
  else if (k === "0" || k === "e" || k === "x") { if (down) input.pendingGear = 1; }
  else if (k === "p" || k === "q" || k === "z") { if (down) input.pendingGear = -1; }
  else if (k === "a" || k === "ArrowLeft") input.kbLeft = down ? 1 : 0;
  else if (k === "d" || k === "ArrowRight") input.kbRight = down ? 1 : 0;
  else if (k === "r") { if (down) input.pendingReset = true; }
  else if (k === "v") { if (down) input.pendingView = true; }
  else if (k === "n") { if (down) input.pendingAuto = true; }
  else if (k === "Escape") { if (down) input.pendingPause = true; }
  else if (k === " ") { if (down) input.pendingAssist = true; }
  else if (k === "Shift" || k === ".") input.hand = down ? 1 : 0;
  else if (down && k.length === 1 && STEER_KEYS.indexOf(k) >= 0) {
    input.steerTarget = (STEER_KEYS.indexOf(k) - 6) / 6;
    input.steerSeen = true;
  } else used = false;
  if (used) { input.lastKey = k; e.preventDefault(); }
}
addEventListener("keydown", e => { if (!e.repeat) onKey(e, true); else if (/^Arrow/.test(e.key)) e.preventDefault(); });
addEventListener("keyup", e => onKey(e, false));

/* Руль и педали с реалистичной инерцией: цифровые клавиши плавно нарастают. */
function updateControls(dt) {
  let target = input.steerTarget, rate = 14;
  if (input.touchMode && input.touchSteer === "tilt") { target = tiltSteer(); rate = 12; }
  else if (input.touchMode && input.touchSteer === "wheel") {
    if (!wheelUI.held) wheelUI.v += (0 - wheelUI.v) * Math.min(1, dt * 7);          // руль сам возвращается в центр
    target = wheelUI.v; rate = 18; drawWheelUI();
  }
  else if (input.kbLeft || input.kbRight) { target = input.kbRight - input.kbLeft; rate = 5; }
  else if (!input.steerSeen) { target = 0; rate = 6; }
  input.steer += (target - input.steer) * Math.min(1, dt * rate);
  input.gasSm = (input.gasSm || 0) + ((input.gas ? 1 : 0) - (input.gasSm || 0)) * Math.min(1, dt * (input.gas ? 7 : 12));
  input.brakeSm = (input.brakeSm || 0) + ((input.brake ? 1 : 0) - (input.brakeSm || 0)) * Math.min(1, dt * (input.brake ? 9 : 14));
}

/* ---------- Гироскоп (обзор головой) ---------- */
const gyro = { enabled: false, yawRef: 0, haveData: false, a: 0, b: 0, g: 0 };
const _zee = new THREE.Vector3(0, 0, 1), _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === "number") return screen.orientation.angle;
  return typeof window.orientation === "number" ? window.orientation : 90;
}
addEventListener("deviceorientation", e => {
  if (e.alpha == null) return;
  gyro.a = e.alpha; gyro.b = e.beta; gyro.g = e.gamma; gyro.haveData = true;
});
function gyroQuat() {
  const d = Math.PI / 180;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(gyro.b * d, gyro.a * d, -gyro.g * d, "YXZ"));
  q.multiply(_q1);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(_zee, -screenAngle() * d));
  return q;
}
function recenter() {
  if (!gyro.haveData) return;
  gyro.yawRef = new THREE.Euler().setFromQuaternion(gyroQuat(), "YXZ").y;
}
async function enableGyro() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return false;
    }
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      try { await DeviceMotionEvent.requestPermission(); } catch (e) {}
    }
    gyro.enabled = true; return true;
  } catch (err) { return false; }
}
const look = { yaw: 0, pitch: 0, drag: false, x: 0, y: 0, moved: false };
addEventListener("pointerdown", e => { if (input.touchMode) return; look.drag = true; look.x = e.clientX; look.y = e.clientY; look.moved = false; });
addEventListener("pointermove", e => {
  if (input.touchMode || !look.drag || (gyro.enabled && gyro.haveData)) return;
  look.yaw -= (e.clientX - look.x) * 0.005;
  look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - (e.clientY - look.y) * 0.005));
  look.x = e.clientX; look.y = e.clientY; look.moved = true;
});
addEventListener("pointerup", () => { look.drag = false; });
function headQuaternion(out) {
  if (gyro.enabled && gyro.haveData) {
    out.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -gyro.yawRef).multiply(gyroQuat());
  } else out.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, "YXZ"));
}

/* ---------- Режим "Телефон, касанием": руль наклоном телефона (как баранка) или кнопками ---------- */
const tilt = { have: false, ang: 0, ref: 0, range: 55 * Math.PI / 180, invert: false };
addEventListener("devicemotion", e => {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null) return;
  if (Math.hypot(a.x, a.y) < 3) return;                   // телефон лежит плашмя: угол не определён
  tilt.ang = Math.atan2(a.x, a.y); tilt.have = true;      // поворот вокруг оси, перпендикулярной экрану
});
function calibrateTilt() { tilt.ref = tilt.ang; }
function tiltSteer() {
  let d = tilt.ang - tilt.ref;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  let v = Math.max(-1, Math.min(1, d / tilt.range));
  if (Math.abs(v) < 0.03) v = 0;
  return tilt.invert ? -v : v;
}
/* ---------- Руль на экране: тяни обод по кругу, как настоящий; отпустил — вернулся в центр ---------- */
const wheelUI = { v: 0, held: false, pid: null, a0: 0, v0: 0, max: 135 * Math.PI / 180 };
function drawWheelUI() {
  const el = document.getElementById("tWheelSvg"); if (!el) return;
  el.style.transform = "rotate(" + (wheelUI.v * 135).toFixed(1) + "deg)";
}
function setupWheelUI() {
  const el = document.getElementById("tWheel"); if (!el) return;
  const ang = e => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  el.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    wheelUI.held = true; wheelUI.pid = e.pointerId; wheelUI.a0 = ang(e); wheelUI.v0 = wheelUI.v;
    try { el.setPointerCapture(e.pointerId); } catch (x) {}
  });
  el.addEventListener("pointermove", e => {
    if (!wheelUI.held || e.pointerId !== wheelUI.pid) return;
    let d = ang(e) - wheelUI.a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    wheelUI.v = Math.max(-1, Math.min(1, wheelUI.v0 + d / wheelUI.max));
    input.lastKey = "touch:руль";
  });
  const up = e => { if (e.pointerId === wheelUI.pid) wheelUI.held = false; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("contextmenu", e => e.preventDefault());
}
setupWheelUI();
function holdButton(id, on, off) {
  const el = document.getElementById(id); if (!el) return;
  const down = e => { e.preventDefault(); e.stopPropagation(); el.classList.add("down"); on(); };
  const up = e => { e.stopPropagation(); el.classList.remove("down"); if (off) off(); };
  el.addEventListener("pointerdown", down);
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(ev, up);
  el.addEventListener("contextmenu", e => e.preventDefault());
}
function setupTouchUI() {
  holdButton("tGas", () => { input.gas = 1; input.lastKey = "touch:газ"; }, () => { input.gas = 0; });
  holdButton("tBrake", () => { input.brake = 1; input.lastKey = "touch:тормоз"; }, () => { input.brake = 0; });
  holdButton("tL", () => { input.kbLeft = 1; }, () => { input.kbLeft = 0; });
  holdButton("tR", () => { input.kbRight = 1; }, () => { input.kbRight = 0; });
  holdButton("tUp", () => { input.pendingGear = 1; });
  holdButton("tDown", () => { input.pendingGear = -1; });
  holdButton("tPause", () => { input.pendingPause = true; });
  holdButton("tView", () => { input.pendingView = true; });
  holdButton("tAuto", () => { input.pendingAuto = true; });
  holdButton("tReset", () => { input.pendingReset = true; });
  holdButton("tCal", () => { calibrateTilt(); recenter(); });
  holdButton("tAssist", () => { input.pendingAssist = true; });
  holdButton("tHand", () => { input.hand = 1; input.lastKey = "touch:ручник"; }, () => { input.hand = 0; });
}
setupTouchUI();
