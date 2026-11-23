"use strict";
/* Игра: меню, гонка, круги, позиции, соперники, результаты. */
const HSTEP = 1 / 120;
const G = {
  state: "menu", vr: true, touch: false, touchSteer: "tilt", tiltInv: false, carId: "f1", trackIdx: 0, laps: 3, opp: 5, auto: true,
  cars: [], player: null, t: 0, accum: 0, paused: false, msgT: 0, msgText: "", autoMsgT: 0, bests: {}
};
const AI_COLORS = [0x1d6fe0, 0xf2a900, 0x20a050, 0xa020c0, 0xe0e0e0, 0xff6a00, 0x00b8c8];

try { Object.assign(G, JSON.parse(localStorage.getItem("promaracer.settings") || "{}")); G.bests = JSON.parse(localStorage.getItem("promaracer.bests") || "{}"); } catch (e) {}
function saveSettings() {
  try {
    localStorage.setItem("promaracer.settings", JSON.stringify({ carId: G.carId, trackIdx: G.trackIdx, laps: G.laps, opp: G.opp, auto: G.auto, touchSteer: G.touchSteer, tiltInv: G.tiltInv }));
    localStorage.setItem("promaracer.bests", JSON.stringify(G.bests));
  } catch (e) {}
}
const $ = id => document.getElementById(id);
const fmt = t => { if (t == null) return ""; const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };

/* ---------- Меню ---------- */
function group(id, items, get, set) {
  const el = $(id); el.innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.textContent = it.label; b.className = "opt" + (get() === it.value ? " on" : "");
    b.onclick = () => { set(it.value); saveSettings(); buildMenu(); };
    el.appendChild(b);
  }
}
function buildMenu() {
  group("carBtns", CAR_ORDER.map(id => ({ label: CARS[id].name, value: id })), () => G.carId, v => G.carId = v);
  group("trackBtns", TRACKS.map((t, i) => ({ label: t.name, value: i })), () => G.trackIdx, v => G.trackIdx = v);
  group("lapBtns", [1, 3, 5, 10].map(n => ({ label: n + " кр.", value: n })), () => G.laps, v => G.laps = v);
  group("oppBtns", [0, 3, 5, 7].map(n => ({ label: n === 0 ? "Один" : n + " соп.", value: n })), () => G.opp, v => G.opp = v);
  group("gearBtns", [{ label: "Авто", value: true }, { label: "Ручная", value: false }], () => G.auto, v => G.auto = v);
  group("steerBtns", [{ label: "Руль: наклон телефона", value: "tilt" }, { label: "Руль: кнопки ◀ ▶", value: "btn" }], () => G.touchSteer, v => G.touchSteer = v);
  group("invBtns", [{ label: "Наклон обычный", value: false }, { label: "Инверсия руля", value: true }], () => G.tiltInv, v => G.tiltInv = v);
  const D = CARS[G.carId];
  $("carInfo").textContent = D.hp + " л.с. · " + D.mass + " кг · " + D.ratios.length + " передач · до " + D.redline + " об/мин · " +
    (D.ClA > 1.5 ? "много прижимной силы" : "мало прижимной силы") + (D.abs ? " · ABS" : " · без ABS");
}
function updateMonitor() {
  $("mon").innerHTML = (input.steerSeen ? "руль " + input.steerTarget.toFixed(2) : "руль: нет сигнала") +
    "<br>Последняя клавиша: " + input.lastKey + "<br>Газ " + input.gas + " · Тормоз " + input.brake;
}
setInterval(() => { if (G.state === "menu") updateMonitor(); }, 100);

/* ---------- Старт гонки ---------- */
function startRace() {
  buildTrack(TRACKS[G.trackIdx]);
  buildWorld();
  const D = CARS[G.carId], cars = [], n = G.opp;
  for (let i = 0; i < n; i++) {
    const c = newVehicle(D); c.auto = true; c.color = AI_COLORS[i % AI_COLORS.length]; c.isAI = true;
    c.ai = newAI(D, 1.0 - i * 0.012 - (i % 3) * 0.006, [-2.2, 2.2][i % 2]);
    c.ai.base = c.ai.offset; c.name = "Соперник " + (i + 1);
    c.s = -10 - 9 * i; c.d = i % 2 ? 2.6 : -2.6; c.prevLap = -1; c.lapStart = 0; cars.push(c);
  }
  const p = newVehicle(D); p.auto = G.auto; p.name = "Ты"; p.s = -10 - 9 * n; p.d = n % 2 ? 2.6 : -2.6; p.prevLap = -1; p.lapStart = 0;
  cars.push(p);
  G.cars = cars; G.player = p; G.t = -6; G.accum = 0; G.paused = false; G.state = "grid";
  p.best = (G.bests[G.carId + "|" + TRACKS[G.trackIdx].id]) || null;
  setAICars(cars.filter(c => c.isAI));
  buildCockpit(D);
  $("results").style.display = "none";
  R.view = "cockpit";
}

function rank(c) { let r = 1; for (const o of G.cars) if (o !== c && o.s > c.s) r++; return r; }

/* ---------- Шаг симуляции ---------- */
function laneAhead(c) {
  let best = null, gap = 1e9;
  for (const o of G.cars) {
    if (o === c) continue;
    const g = (((o.s - c.s) % TRACK.L) + TRACK.L) % TRACK.L;
    if (g < gap && g < 40 && Math.abs(o.d - c.d) < 2.8) { gap = g; best = o; }
  }
  return best ? { o: best, gap } : null;
}
function collide() {
  const L = TRACK.L, cs = G.cars;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    let ds = (b.s - a.s) % L; if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L;
    if (Math.abs(ds) > 4.6) continue;
    const dd = b.d - a.d; if (Math.abs(dd) > 1.95) continue;
    const front = ds > 0 ? b : a, rear = ds > 0 ? a : b;
    const push = (1.95 - Math.abs(dd)) * 0.5 * (dd >= 0 ? 1 : -1);
    b.d += push; a.d -= push;
    const rv = rear.vx - front.vx;
    if (rv > 0) { rear.vx -= rv * 0.45; front.vx += rv * 0.12; rear.r += (Math.random() - 0.5) * 0.15; }
    a.contact = b.contact = 0.3;
  }
}

function simStep(h) {
  const cs = G.cars, P = G.player;
  if (G.state === "grid") {                 // стоим на решётке, двигатель крутится
    G.t += h;
    const gasWant = input.gasSm > 0.1;
    P.rpm += ((gasWant ? P.def.idle + (P.def.redline - P.def.idle) * 0.4 : P.def.idle) - P.rpm) * Math.min(1, h * 6);
    for (const c of cs) if (c.isAI) c.rpm += ((c.def.idle + (c.def.redline - c.def.idle) * 0.4) - c.rpm) * Math.min(1, h * 6);
    if (G.t >= 0) { G.state = "race"; G.t = 0; G.msgT = 1.2; G.msgText = "GO!"; if (G.touch) calibrateTilt(); }
    return;
  }
  for (const c of cs) {
    let inp;
    if (c.isAI) {
      const lead = laneAhead(c);
      if (lead) {                                        // обгон: смещаемся на свободную сторону
        const side = c.d >= lead.o.d ? 1 : -1;
        const want = Math.max(-4.8, Math.min(4.8, lead.o.d + side * 3.4));
        c.ai.offset += Math.max(-2.5 * h, Math.min(2.5 * h, want - c.ai.offset));
      } else c.ai.offset += Math.max(-1.5 * h, Math.min(1.5 * h, c.ai.base - c.ai.offset));
      inp = aiDrive(c, c.ai, h);
      if (lead && lead.gap < 7 && lead.o.vx < c.vx) { inp.brake = Math.max(inp.brake, 0.5); inp.gas = 0; }
      c.draft = lead && lead.gap < 25 ? 0.22 * (1 - lead.gap / 25) : 0;
    } else {
      const fin = G.state === "finish";
      inp = { steer: input.steer, gas: fin ? 0 : input.gasSm, brake: fin ? Math.max(0.3, input.brakeSm) : input.brakeSm };
      const lead = laneAhead(c);
      c.draft = lead && lead.gap < 25 ? 0.22 * (1 - lead.gap / 25) : 0;
    }
    physStep(c, inp, h);
    // круги
    const li = Math.floor(c.s / TRACK.L);
    if (li > c.prevLap) {
      if (c.prevLap >= 0) {
        const lt = G.t - c.lapStart;
        if (c === P) {
          if (P.best == null || lt < P.best) { P.best = lt; G.bests[G.carId + "|" + TRACKS[G.trackIdx].id] = lt; saveSettings(); }
          P.last = lt;
        }
        c.lapStart = G.t;
        if (li >= G.laps && c.finishT == null) c.finishT = G.t;
      }
      c.prevLap = li;
      if (c !== P || li > 0) c.lapStart = G.t;
    }
  }
  G.t += h;
  collide();
  if (G.state === "race" && P.finishT != null) { G.state = "finish"; showResults(); }
}

function showResults() {
  const order = G.cars.slice().sort((a, b) => {
    if (a.finishT != null && b.finishT != null) return a.finishT - b.finishT;
    if (a.finishT != null) return -1; if (b.finishT != null) return 1;
    return b.s - a.s;
  });
  const tw = order[0].finishT;
  $("resList").innerHTML = order.map((c, i) =>
    "<tr" + (c === G.player ? ' class="me"' : "") + "><td>" + (i + 1) + "</td><td>" + c.name + "</td><td>" +
    (c.finishT != null ? (i === 0 ? fmt(c.finishT) : "+" + (c.finishT - tw).toFixed(1) + " с") : "едет") + "</td></tr>").join("");
  $("resBest").textContent = G.player.best != null ? "Лучший круг: " + fmt(G.player.best) : "";
  $("results").style.display = "flex";
}

/* ---------- Кадр ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === "menu" || !G.player) return;
  const P = G.player;
  updateControls(dt);
  if (input.pendingPause) { input.pendingPause = false; G.paused = !G.paused; }
  if (input.pendingView) { input.pendingView = false; R.view = R.view === "cockpit" ? "chase" : "cockpit"; }
  if (input.pendingReset) { input.pendingReset = false; if (G.state === "race") recoverVehicle(P); }
  if (input.pendingAuto) { input.pendingAuto = false; P.auto = !P.auto; G.autoMsgT = 1.5; }
  if (input.pendingGear) {
    if (!P.auto && G.state !== "menu") shiftGear(P, input.pendingGear);
    input.pendingGear = 0;
  }
  if (!G.paused) {
    G.accum += dt; let n = 0;
    while (G.accum >= HSTEP && n < 8) { simStep(HSTEP); G.accum -= HSTEP; n++; }
    if (n === 8) G.accum = 0;
    G.msgT = Math.max(0, G.msgT - dt); G.autoMsgT = Math.max(0, G.autoMsgT - dt);
  }

  // данные приборки
  const D = P.def, S = {
    kmh: P.vx * 3.6, gear: G.state === "grid" ? "N" : String(P.gear), shifting: P.shiftT > 0, auto: P.auto,
    rpm: P.rpm, redline: D.redline, limiter: P.rpmWheel >= D.redline && input.gasSm > 0.3,
    tF: P.tempF, tR: P.tempR, wF: P.wearF, wR: P.wearR, opt: D.tireOpt,
    pos: rank(P), total: G.cars.length, lap: P.prevLap + 1, laps: G.laps,
    timeStr: G.t > 0 ? fmt(G.t - P.lapStart) : "", bestStr: P.best != null ? fmt(P.best) : "", surface: P.onGrass && P.vx > 3
  };
  if (G.paused) { S.msg = "ПАУЗА"; S.msgSize = 80; }
  else if (G.state === "grid") {
    const c = Math.ceil(-G.t);
    S.msg = c > 5 ? "" : String(Math.min(c, 5)); S.msgColor = "#ff5050"; S.msg2 = D.name + " · " + TRACKS[G.trackIdx].name;
    if (c > 5) S.msg = "";
  }
  else if (G.msgT > 0) { S.msg = G.msgText; S.msgColor = "#7dff9a"; }
  else if (G.autoMsgT > 0) { S.msg = P.auto ? "АВТО" : "РУЧНАЯ"; S.msgSize = 60; }
  else if (G.state === "finish") { S.msg = "ФИНИШ P" + S.pos; S.msgColor = "#7dff9a"; S.msgSize = 70; S.msg2 = "Enter — меню"; }

  const throttle = G.state === "grid" ? input.gasSm : (G.state === "finish" ? 0 : input.gasSm);
  updateAudio(P, !G.paused, throttle);
  renderFrame(P, G.cars, S, dt, G.vr);
  if (G.touch) {
    $("tHud").textContent = Math.round(S.kmh) + " км/ч · " + S.gear + " · P" + S.pos + "/" + S.total + " · круг " + Math.min(S.lap, S.laps) + "/" + S.laps +
      (S.surface ? " · ТРАВА" : "") + (G.touchSteer === "tilt" && !tilt.have ? " · нет данных наклона" : "");
  }
}

/* ---------- Запуск ---------- */
async function begin(mode) {
  G.vr = mode === "vr"; G.touch = mode === "touch";
  input.touchMode = G.touch; input.touchSteer = G.touchSteer; tilt.invert = G.tiltInv;
  await enableGyro();
  if (G.touch) gyro.enabled = false;                    // телефон — руль, обзор головой не нужен
  $("touch").style.display = G.touch ? "block" : "none";
  $("tL").style.display = $("tR").style.display = G.touch && G.touchSteer === "btn" ? "block" : "none";
  $("tCal").style.display = G.touch && G.touchSteer === "tilt" ? "block" : "none";
  startAudio();
  try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch (e) {}
  $("menu").style.display = "none";
  initRender(); resizeRender();
  startRace();
  recenter();
  if (G.touch) setTimeout(calibrateTilt, 400);
}
function toMenu() {
  $("results").style.display = "none"; $("menu").style.display = "flex"; $("touch").style.display = "none";
  input.touchMode = false; input.gas = input.brake = input.kbLeft = input.kbRight = 0;
  G.state = "menu"; updateAudio(G.player || { def: CARS.gtr, rpm: 1000, vx: 0, alphaF: 0, alphaR: 0, shiftT: 0, rpmWheel: 0 }, false, 0);
  buildMenu();
}
input.onEnter = () => {
  if (G.state === "menu") begin("mono");
  else if (G.state === "finish") toMenu();
};
$("bVR").onclick = () => begin("vr");
$("bMono").onclick = () => begin("mono");
$("bTouch").onclick = () => begin("touch");
$("bMenu").onclick = toMenu;
$("bAgain").onclick = () => { $("results").style.display = "none"; startRace(); };
addEventListener("pointerup", () => { if (G.state !== "menu" && !G.touch && !look.moved) recenter(); });
buildMenu();
requestAnimationFrame(frame);
