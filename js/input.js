"use strict";
/* Ввод. Cardputer (BLE-клавиатура): 9 = газ, o = тормоз, 0 = передача выше, p = передача ниже,
   буквы a..m = положение руля (g = центр). Для проверки на компьютере: стрелки, X / Z, R, V, N, Esc. */
const STEER_KEYS = "abcdefghijklm";
const input = {
  gas: 0, brake: 0, steerTarget: 0, steer: 0, kbLeft: 0, kbRight: 0,
  lastKey: "—", steerSeen: false, pendingGear: 0, pendingReset: false, pendingView: false, pendingAuto: false,
  pendingPause: false, onEnter: null
};

function onKey(e, down) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (down && k === "Enter") { if (input.onEnter) { input.onEnter(); e.preventDefault(); } return; }
  let used = true;
  if (k === "9" || k === "ArrowUp") input.gas = down ? 1 : 0;
  else if (k === "o" || k === "ArrowDown") input.brake = down ? 1 : 0;
  else if (k === "0" || k === "x") { if (down) input.pendingGear = 1; }
  else if (k === "p" || k === "z") { if (down) input.pendingGear = -1; }
  else if (k === "ArrowLeft") input.kbLeft = down ? 1 : 0;
  else if (k === "ArrowRight") input.kbRight = down ? 1 : 0;
  else if (k === "r") { if (down) input.pendingReset = true; }
  else if (k === "v") { if (down) input.pendingView = true; }
  else if (k === "n") { if (down) input.pendingAuto = true; }
  else if (k === "Escape") { if (down) input.pendingPause = true; }
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
  if (input.kbLeft || input.kbRight) { target = input.kbRight - input.kbLeft; rate = 5; }
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
    gyro.enabled = true; return true;
  } catch (err) { return false; }
}
const look = { yaw: 0, pitch: 0, drag: false, x: 0, y: 0, moved: false };
addEventListener("pointerdown", e => { look.drag = true; look.x = e.clientX; look.y = e.clientY; look.moved = false; });
addEventListener("pointermove", e => {
  if (!look.drag || gyro.haveData) return;
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
