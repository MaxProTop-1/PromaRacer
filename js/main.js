"use strict";
/* Игра: меню, гонка, круги, позиции, соперники, результаты. */
const HSTEP = 1 / 120;
const G = {
  state: "menu", vr: true, touch: false, screen: "", mode: "race", online: false, roster: null, lockCar: null, rewarded: false,
  coinsEarned: 0, assist: true, gyroLook: true, flash: "", touchSteer: "wheel", tiltInv: false, carId: "f1", trackIdx: 0, laps: 3, opp: 5, auto: true, weather: "clear", fx: "cine", mirrors: true, driftTune: true, driftBest: 0, tBack: null, dr: null,
  cars: [], player: null, t: 0, accum: 0, paused: false, msgT: 0, msgText: "", autoMsgT: 0, bests: {}
};
const AI_COLORS = [0x1d6fe0, 0xf2a900, 0x20a050, 0xa020c0, 0xe0e0e0, 0xff6a00, 0x00b8c8];

try { Object.assign(G, JSON.parse(localStorage.getItem("promaracer.settings") || "{}")); G.bests = JSON.parse(localStorage.getItem("promaracer.bests") || "{}"); if (G.steerVer !== 2) G.touchSteer = "wheel"; } catch (e) {}
if (!G.screen) { try { G.screen = ("ontouchstart" in window || navigator.maxTouchPoints > 0) ? "touch" : "mono"; } catch (e) { G.screen = "mono"; } }
function saveSettings() {
  try {
    localStorage.setItem("promaracer.settings", JSON.stringify({ screen: G.screen, mode: G.mode, carId: G.carId, trackIdx: G.trackIdx, laps: G.laps, opp: G.opp, auto: G.auto, touchSteer: G.touchSteer, tiltInv: G.tiltInv, assist: G.assist, gyroLook: G.gyroLook, weather: G.weather, fx: G.fx, mirrors: G.mirrors, driftTune: G.driftTune, driftBest: G.driftBest, steerVer: 2 }));
    localStorage.setItem("promaracer.bests", JSON.stringify(G.bests));
  } catch (e) {}
}
const $ = id => document.getElementById(id);
const fmt = t => { if (t == null) return ""; const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };

/* ---------- Старт гонки ---------- */
function playerDef() {
  const id = G.lockCar || G.carId;
  const up = (typeof NET !== "undefined" && !G.lockCar && NET.profile.garage) ? NET.profile.garage[id] : null;
  return upgradedDef(id, up);
}
function placeOnGrid(c, slot) { c.s = -10 - 9 * slot; c.d = slot % 2 ? 2.6 : -2.6; c.prevLap = -1; c.lapStart = 0; }

/* Свободная езда по городу: без кругов и соперников, очки за дрифт. */
function startOpen() {
  OPENW = true; WET = G.weather === "rain" ? 1 : 0;
  buildCity(); buildCityWorld();
  if (R.skid) { R.skidN = 0; R.skid.count = 0; R.skidLast = [null, null]; }
  const D = playerDef(), p = newVehicle(D); p.auto = G.auto; p.assist = false; p.name = "Ты";
  p.x = CITY.spawn.x; p.z = CITY.spawn.z; p.hd = CITY.spawn.hd; p.prevLap = -1; p.lapStart = 0;
  G.cars = [p]; G.player = p; G.open = true; G.t = 0; G.accum = 0; G.paused = false; G.state = "race"; G.rewarded = true; G.coinsEarned = 0; G.netT = 0;
  G.drift = { cur: 0, total: 0, best: 0, mult: 1, ang: 0, active: false, hold: 0, chain: 0, idle: 0 };
  setAICars([]); buildCockpit(D); setGhost(D); R.ghost.visible = false;
  $("results").style.display = "none";
  R.view = "chase";
  G.msgT = 3; G.msgText = "СВОБОДНАЯ ЕЗДА";
}

function openStep(h) {
  const P = G.player, dr = G.drift;
  const inp = { steer: input.steer, gas: input.gasSm, brake: input.brakeSm, hand: input.hand };
  physStep(P, inp, h);
  const hit = freeCollide(P, CITY.boxes);
  G.t += h;
  // очки за дрифт: угол скольжения кузова и скорость; серия копится, пока занос не оборвался
  const ang = P.vx > 3 ? Math.abs(Math.atan2(P.vy, P.vx)) : 0;
  dr.ang = ang;
  const sliding = P.vx > 7 && ang > 0.24 && ang < 1.45;
  if (sliding) {
    dr.active = true; dr.idle = 0; dr.chain += h; dr.hold = 1;
    dr.mult = 1 + Math.min(5, dr.chain / 2.5);
    dr.cur += P.vx * Math.min(ang, 1.0) * h * 3.2 * dr.mult;
  } else {
    dr.active = false; dr.idle += h; dr.hold = Math.max(0, 1 - dr.idle / 1.2);
    if (dr.idle > 1.2 && dr.cur > 0) { dr.total += dr.cur; dr.best = Math.max(dr.best, dr.cur); dr.cur = 0; dr.chain = 0; dr.mult = 1; }
  }
  if (hit > 0.2) { dr.cur = 0; dr.chain = 0; dr.mult = 1; }
}

function startRace() {
  if (G.mode === "open" && !G.online) { startOpen(); return; }
  OPENW = false; G.open = false;
  setRoadWidth(G.mode === "free");
  WET = (!G.online && G.weather === "rain") ? 1 : 0;
  buildTrack(TRACKS[G.trackIdx]);
  buildWorld();
  const D = playerDef(), cars = [];
  let me;
  if (G.roster) {                                   // онлайн: все слоты — люди, одинаковая решётка у всех
    for (const r of G.roster) {
      if (r.me) continue;
      const rd = G.lockCar ? D : CARS[r.car] || CARS.gtr;
      const c = newVehicle(rd); c.remote = true; c.isAI = false; c.color = AI_COLORS[r.slot % AI_COLORS.length]; c.name = r.name; c.uid = r.id; c.tgt = null;
      placeOnGrid(c, r.slot); cars.push(c);
    }
    me = G.roster.find(r => r.me);
  } else {
    const n = G.mode === "time" || G.mode === "free" ? 0 : G.opp;
    for (let i = 0; i < n; i++) {
      const c = newVehicle(D); c.auto = true; c.color = AI_COLORS[i % AI_COLORS.length]; c.isAI = true;
      c.ai = newAI(D, 1.0 - i * 0.012 - (i % 3) * 0.006, [-2.2, 2.2][i % 2]);
      c.ai.base = c.ai.offset; c.name = "Соперник " + (i + 1);
      placeOnGrid(c, i); c.s = -10 - 9 * i; cars.push(c);
    }
    me = { slot: n, name: "Ты" };
  }
  const free = G.mode === "free" && !G.online;
  const PD = free && G.driftTune ? Object.assign({}, D, { drive: "rwd" }) : D;           // дрифт-настройка: задний привод
  const p = newVehicle(PD); p.auto = G.auto; p.assist = free ? false : G.assist;
  if (free && G.driftTune) { p.drift = true; p.rearK = 0.88; }
  driftReset(); p.name = me.name || "Ты"; placeOnGrid(p, me.slot);
  cars.push(p);
  G.cars = cars; G.player = p; G.t = -6; G.accum = 0; G.paused = false; G.state = "grid"; if (G.mode === "free") G.t = -1.5; G.rewarded = false; G.coinsEarned = 0; G.netT = 0;
  p.best = (G.bests[G.carId + "|" + TRACKS[G.trackIdx].id]) || null;
  setAICars(cars.filter(c => c !== p));
  buildCockpit(D); setGhost(D);
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
  if (G.mode === "time" || G.mode === "free") return;
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

/* Удалённый игрок: плавно подтягиваем машину к последнему пакету с экстраполяцией по скорости. */
function remoteStep(c, h) {
  const t = c.tgt; if (!t) { c.rpm += (c.def.idle + (c.def.redline - c.def.idle) * 0.4 - c.rpm) * Math.min(1, h * 6); return; }
  const age = Math.min(0.4, (performance.now() - t.at) / 1000), k = Math.min(1, h * 14);
  c.s += (t.s + t.vx * age - c.s) * k; c.d += (t.d - c.d) * k; c.psi += (t.psi - c.psi) * k;
  c.vx = t.vx; c.delta = t.dl; c.ax = t.ax; c.ay = t.ay; c.rpm = t.rpm; c.finishT = t.fin;
}
function sendNet(dt) {
  if (!G.online || typeof NET === "undefined" || !NET.room) return;
  G.netT = (G.netT || 0) - dt; if (G.netT > 0) return; G.netT = 0.05;
  const P = G.player, r = (v, n) => Math.round(v * n) / n;
  NET.roomSend("st", { u: NET.user.id, s: r(P.s, 100), d: r(P.d, 100), psi: r(P.psi, 1000), vx: r(P.vx, 100), dl: r(P.delta, 1000), ax: Math.round(P.ax), ay: Math.round(P.ay), rpm: Math.round(P.rpm), fin: P.finishT == null ? null : r(P.finishT, 100) });
}
function onRemoteState(m) {
  for (const c of G.cars) if (c.uid === m.u) { m.at = performance.now(); c.tgt = m; if (c.s < -20 && m.s > c.s) c.s = m.s; break; }
}

/* ---------- Дрифт: очки за боковое скольжение задней оси ---------- */
function driftReset() { G.dr = { total: 0, cur: 0, t: 0, mult: 1, grace: 0, active: false, crash: 0, bank: 0, bankT: 0, hudKey: "" }; }
function driftStep(P, h) {
  const d = G.dr; if (!d) return;
  const a = Math.abs(P.alphaR), v = P.vx;
  const sliding = a > 0.17 && v > 7 && !P.wall && !P.onGrass && Math.abs(P.psi) < 1.8;
  d.crash = Math.max(0, d.crash - h); d.bankT = Math.max(0, d.bankT - h);
  if (P.wall > 0 && (d.active || d.cur > 0)) { d.cur = 0; d.active = false; d.t = 0; d.mult = 1; d.grace = 0; d.crash = 1.5; return; }
  if (sliding) {
    d.active = true; d.grace = 1.2; d.t += h;
    d.mult = 1 + Math.min(4, Math.floor(d.t / 2));
    d.cur += 20 * v * Math.min(a, 0.8) * d.mult * h;
  } else if (d.active) {
    d.grace -= h;
    if (d.grace <= 0) {
      const got = Math.round(d.cur); d.total += got; d.bank = got; d.bankT = 2.5;
      if (got > G.driftBest) { G.driftBest = got; saveSettings(); }
      d.cur = 0; d.active = false; d.t = 0; d.mult = 1;
    }
  }
}
function driftHud() {
  const el = $("drift"), d = G.dr;
  if (!el) return;
  if (G.mode !== "free" || !d || G.state === "menu") { el.style.display = "none"; return; }
  let cls = "", label, val;
  if (d.crash > 0) { cls = "crash"; label = "АВАРИЯ"; val = "серия потеряна"; }
  else if (d.active) { cls = "on"; label = "ДРИФТ"; val = "<i>x" + d.mult + "</i>" + Math.round(d.cur); }
  else if (d.bankT > 0) { label = "СЕРИЯ ЗАЧТЕНА"; val = "+" + d.bank; }
  else { label = "ДРИФТ"; val = "—"; }
  const key = cls + label + val + Math.round(d.total) + G.driftBest;
  if (key === d.hudKey) return;
  d.hudKey = key;
  el.className = cls; el.style.display = "block";
  el.innerHTML = '<div class="dl">' + label + '</div><div class="dv">' + val + '</div><div class="ds">Всего ' + Math.round(d.total) + ' · рекорд серии ' + Math.round(G.driftBest) + "</div>";
}

function simStep(h) {
  if (G.open) { openStep(h); return; }
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
    if (c.remote) { remoteStep(c, h); continue; }
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
      inp = { hand: input.hand, steer: input.steer, gas: fin ? 0 : input.gasSm, brake: fin ? Math.max(0.3, input.brakeSm) : input.brakeSm };
      const lead = laneAhead(c);
      c.draft = lead && lead.gap < 25 ? 0.22 * (1 - lead.gap / 25) : 0;
    }
    physStep(c, inp, h);
    if (c === P && G.mode === "free") driftStep(P, h);
    if (c === P && c.s >= 0 && G.t > 0) {                 // отсечки по кругу для дельты к лучшему
      const fr = Math.floor(((c.s % TRACK.L) / TRACK.L) * 100);
      (P.cur || (P.cur = []))[fr] = G.t - c.lapStart;
      (P.tr || (P.tr = []))[Math.floor((G.t - c.lapStart) / 0.1)] = [c.s, c.d, c.psi];
    }
    // круги
    const li = Math.floor(c.s / TRACK.L);
    if (li > c.prevLap) {
      if (c.prevLap >= 0) {
        const lt = G.t - c.lapStart;
        if (c === P) {
          if (G.mode !== "free" && (P.best == null || lt < P.best)) { P.best = lt; G.bests[G.carId + "|" + TRACKS[G.trackIdx].id] = lt; saveSettings(); }
          if (P.best === lt && P.cur) { P.bestSplits = P.cur.slice(); P.bestTr = (P.tr || []).slice(); }
          P.last = lt; P.cur = []; P.tr = [];
        }
        c.lapStart = G.t;
        if (G.mode !== "free" && li >= G.laps && c.finishT == null) c.finishT = G.t;
      }
      c.prevLap = li;
      if (c !== P || li > 0) c.lapStart = G.t;
    }
  }
  G.t += h;
  collide();
  if (G.state === "race" && P.finishT != null) { G.state = "finish"; showResults(); }
}

function resultOrder() {
  return G.cars.slice().sort((a, b) => {
    if (a.finishT != null && b.finishT != null) return a.finishT - b.finishT;
    if (a.finishT != null) return -1; if (b.finishT != null) return 1;
    return b.s - a.s;
  });
}
function drawResults() {
  const order = resultOrder(), tw = order[0].finishT;
  $("resList").innerHTML = order.map((c, i) =>
    "<tr" + (c === G.player ? ' class="me"' : "") + "><td>" + (i + 1) + "</td><td>" + String(c.name).replace(/</g, "&lt;") + "</td><td>" +
    (c.finishT != null ? (i === 0 ? fmt(c.finishT) : "+" + (c.finishT - tw).toFixed(1) + " с") : "едет") + "</td></tr>").join("");
}
function raceReward(pos, total) {
  const lapK = Math.max(0.5, Math.min(2.5, G.laps / 3));
  if (total <= 1) return Math.round(150 * lapK);
  return Math.round(((total - pos + 1) / total * 600 + (pos === 1 ? 800 : 0)) * lapK);
}
/* Призрак лучшего круга: позиция по записанной траектории на тот же момент круга. */
function ghostAt(P) {
  if (!P.bestTr || G.state !== "race" || G.t <= 0 || G.mode === "race" && G.online) return null;
  const f = (G.t - P.lapStart) / 0.1, i = Math.floor(f), a = P.bestTr[i], b = P.bestTr[i + 1];
  if (!a || !b) return null;
  const k = f - i;
  return { s: a[0] + (b[0] - a[0]) * k, d: a[1] + (b[1] - a[1]) * k, psi: a[2] + (b[2] - a[2]) * k, ax: 0, ay: 0 };
}
function showResults() {
  drawResults();
  $("resBest").textContent = G.player.best != null ? "Лучший круг: " + fmt(G.player.best) : "";
  const pos = rank(G.player);
  if (!G.rewarded) {
    G.rewarded = true;
    G.coinsEarned = raceReward(pos, G.cars.length);
    if (typeof NET !== "undefined") { NET.award(G.coinsEarned, pos === 1 && G.cars.length > 1).then(() => { if (typeof UI !== "undefined") UI.refresh(); }); NET.saveBests(G.bests); }
  }
  $("resCoins").textContent = "+" + G.coinsEarned + " монет";
  $("bAgain").style.display = G.online && !(NET.room && NET.room.host) ? "none" : "";
  $("results").style.display = "flex";
}
setInterval(() => { if (G.state === "finish" && $("results").style.display === "flex") drawResults(); }, 700);

/* ---------- Кадр ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === "menu" || !G.player) return;
  const P = G.player;
  updateControls(dt);
  if (gyro.enabled && gyro.haveData && !G.gyroRef) { recenter(); G.gyroRef = true; }   // «прямо» = как держишь телефон при старте
  if (input.pendingPause) { input.pendingPause = false; G.paused = !G.paused; }
  $("pauseMenu").style.display = G.paused && G.state !== "finish" ? "flex" : "none";
  if (input.pendingView) { input.pendingView = false; R.view = R.view === "cockpit" ? "chase" : "cockpit"; }
  if (input.pendingReset) { input.pendingReset = false; if (G.state === "race") recoverVehicle(P); }
  if (input.pendingAuto) { input.pendingAuto = false; P.auto = !P.auto; G.autoMsgT = 1.5; G.flash = P.auto ? "АВТО" : "РУЧНАЯ"; }
  if (input.pendingAssist) { input.pendingAssist = false; P.assist = !P.assist; G.autoMsgT = 1.5; G.flash = P.assist ? "ПОМОЩНИКИ ВКЛ" : "ПОМОЩНИКИ ВЫКЛ"; }
  if (input.pendingGear) {
    if (!P.auto && G.state !== "menu") shiftGear(P, input.pendingGear);
    input.pendingGear = 0;
  }
  if (!G.paused) {
    G.accum += dt; let n = 0;
    while (G.accum >= HSTEP && n < 8) { simStep(HSTEP); G.accum -= HSTEP; n++; }
    if (n === 8) G.accum = 0;
    G.msgT = Math.max(0, G.msgT - dt); G.autoMsgT = Math.max(0, G.autoMsgT - dt);
    sendNet(dt);
  }

  // данные приборки
  const D = P.def, S = {
    kmh: P.vx * 3.6, gear: G.state === "grid" ? "N" : String(P.gear), shifting: P.shiftT > 0, auto: P.auto, assist: P.assist,
    rpm: P.rpm, redline: D.redline, limiter: P.rpmWheel >= D.redline && input.gasSm > 0.3,
    tF: P.tempF, tR: P.tempR, wF: P.wearF, wR: P.wearR, opt: D.tireOpt,
    pos: rank(P), total: G.cars.length, lap: P.prevLap + 1, laps: G.laps,
    lastStr: P.last != null ? fmt(P.last) : "", session: G.t > 0 ? fmt(G.t) : "", curT: G.t > 0 ? G.t - P.lapStart : 0,
    delta: (P.bestSplits && P.cur && P.cur[Math.floor(((P.s % TRACK.L) / TRACK.L) * 100)] != null && P.bestSplits[Math.floor(((P.s % TRACK.L) / TRACK.L) * 100)] != null) ? P.cur[Math.floor(((P.s % TRACK.L) / TRACK.L) * 100)] - P.bestSplits[Math.floor(((P.s % TRACK.L) / TRACK.L) * 100)] : null,
    ghost: G.open ? null : ghostAt(P), free: G.mode === "free", open: !!G.open, drift: G.open ? G.drift : null,
    gasV: input.gasSm || 0, brakeV: input.brakeSm || 0,
    timeStr: G.t > 0 ? fmt(G.t - P.lapStart) : "", bestStr: P.best != null ? fmt(P.best) : "", surface: P.onGrass && P.vx > 3
  };
  if (G.paused) { S.msg = "ПАУЗА"; S.msgSize = 80; }
  else if (G.state === "grid") {
    const c = Math.ceil(-G.t);
    S.msg = c > 5 ? "" : String(Math.min(c, 5)); S.msgColor = "#ff5050"; S.msg2 = D.name + " · " + TRACKS[G.trackIdx].name;
    if (c > 5) S.msg = "";
  }
  else if (G.msgT > 0) { S.msg = G.msgText; S.msgColor = "#7dff9a"; }
  else if (G.autoMsgT > 0) { S.msg = G.flash; S.msgSize = G.flash.length > 8 ? 44 : 60; }
  else if (G.state === "finish") { S.msg = "ФИНИШ P" + S.pos; S.msgColor = "#7dff9a"; S.msgSize = 70; S.msg2 = "Enter — лобби"; }

  const throttle = G.state === "grid" ? input.gasSm : (G.state === "finish" ? 0 : input.gasSm);
  updateAudio(P, !G.paused, throttle);
  driftHud();
  renderFrame(P, G.cars, S, dt, G.vr);
  if (G.touch) {
    $("tHud").textContent = Math.round(S.kmh) + " км/ч · " + S.gear + " · P" + S.pos + "/" + S.total + " · круг " + Math.min(S.lap, S.laps) + "/" + S.laps +
      (S.surface ? " · ТРАВА" : "") + (G.touchSteer === "tilt" && !tilt.have ? " · нет данных наклона" : "");
  }
}

/* ---------- Запуск ---------- */
async function begin() {
  const mode = G.screen;
  G.vr = mode === "vr"; G.touch = mode === "touch";
  input.touchMode = G.touch; input.touchSteer = G.touchSteer; tilt.invert = G.tiltInv;
  await enableGyro();
  // обзор гироскопом работает в виде из кокпита; только руль-наклоном занимает телефон, тогда обзор отключён
  if (!G.gyroLook || (G.touch && G.touchSteer === "tilt")) gyro.enabled = false;
  look.yaw = look.pitch = 0; G.gyroRef = false;
  $("touch").style.display = G.touch ? "block" : "none";
  $("tL").style.display = $("tR").style.display = G.touch && G.touchSteer === "btn" ? "block" : "none";
  $("tHand").style.display = G.touch && (G.mode === "free" || G.mode === "open") && !G.online ? "block" : "none";
  $("tWheel").style.display = G.touch && G.touchSteer === "wheel" ? "block" : "none";
  $("tCal").style.display = G.touch && (G.touchSteer === "tilt" || gyro.enabled) ? "block" : "none";
  wheelUI.v = 0; wheelUI.held = false;
  $("tAssist").style.display = G.touch ? "block" : "none";
  $("tHand").style.display = G.touch && (G.mode === "free" || G.mode === "open") && !G.online ? "block" : "none";
  startAudio();
  try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch (e) {}
  if (typeof UI !== "undefined") UI.hide();
  initRender(); resizeRender();
  R.renderer.domElement.style.display = "block"; R.renderer.domElement.style.zIndex = 2;
  startRace();
  recenter();
  if (G.touch) setTimeout(calibrateTilt, 400);
}
function toMenu() {
  OPENW = false; G.open = false; $("tHand").style.display = "none";
  if (G.tBack != null) { G.trackIdx = G.tBack; G.tBack = null; }
  G.mode === "free" && $("drift") && ($("drift").style.display = "none");
  input.hand = 0;
  if (R.hud2) R.hud2.style.display = "none";
  $("results").style.display = "none"; $("touch").style.display = "none";
  input.touchMode = false; input.gas = input.brake = input.kbLeft = input.kbRight = 0;
  G.state = "menu"; updateAudio(G.player || { def: CARS.gtr, rpm: 1000, vx: 0, alphaF: 0, alphaR: 0, shiftT: 0, rpmWheel: 0 }, false, 0);
  if (R.inited) R.renderer.domElement.style.display = "none";
  if (typeof UI !== "undefined") UI.afterRace();
}
input.onEnter = () => { if (G.state === "finish") toMenu(); };
$("bResume").onclick = () => { G.paused = false; $("pauseMenu").style.display = "none"; };
$("bQuit").onclick = () => { G.paused = false; $("pauseMenu").style.display = "none"; if (G.online && typeof NET !== "undefined" && NET.room && NET.room.host) NET.roomSend("end", {}); toMenu(); };
$("bMenu").onclick = () => { if (G.online && typeof NET !== "undefined" && NET.room && NET.room.host) NET.roomSend("end", {}); toMenu(); };
$("bAgain").onclick = () => {
  $("results").style.display = "none";
  if (G.online && typeof UI !== "undefined") UI.hostStart(); else startRace();
};
addEventListener("pointerup", () => { if (G.state !== "menu" && !G.touch && !look.moved) { if (gyro.enabled) recenter(); else look.yaw = look.pitch = 0; } });
requestAnimationFrame(frame);
