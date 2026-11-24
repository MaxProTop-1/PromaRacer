"use strict";
/* Классы машин: от дорожного GT (GTR) до Формулы 1.
   Числа близки к реальным по порядку величины; все параметры в СИ, если не сказано иное. */
const RHO = 1.2, GRAV = 9.81;

const CARS = {
  gtr: {
    id: "gtr", name: "Road GT (GTR)", cls: "gt", cyl: 6,
    mass: 1750, hp: 565, powerRpm: 6500, idle: 900, redline: 7000,
    ratios: [4.06, 2.30, 1.59, 1.25, 1.00, 0.80], final: 3.7, wheelR: 0.34, drive: "awd",
    CdA: 0.75, ClA: 0.15, aeroF: 0.5, mu: 1.05, brakeMax: 20000, abs: true,
    wb: 2.78, wdF: 0.54, hcg: 0.52, steerLock: 0.60, wheelRot: Math.PI * 1.5, shiftTime: 0.22,
    tireOpt: 75, tireHeat: 1.0, wear: 1.0, color: 0xc7c9cc, eye: [-0.35, 1.12, 0.15], look: "closed"
  },
  gt3: {
    id: "gt3", name: "GT3 (гоночный)", cls: "gt", cyl: 8,
    mass: 1280, hp: 550, powerRpm: 7000, idle: 1000, redline: 7800,
    ratios: [3.10, 2.30, 1.80, 1.45, 1.20, 1.00], final: 3.9, wheelR: 0.33, drive: "rwd",
    CdA: 0.95, ClA: 1.2, aeroF: 0.42, mu: 1.5, brakeMax: 24000, abs: true,
    wb: 2.65, wdF: 0.46, hcg: 0.45, steerLock: 0.45, wheelRot: Math.PI * 1.0, shiftTime: 0.12,
    tireOpt: 88, tireHeat: 1.0, wear: 1.0, color: 0x0a58ca, eye: [-0.35, 1.0, 0.1], look: "closed"
  },
  f4: {
    id: "f4", name: "Формула 4", cls: "formula", cyl: 4,
    mass: 570, hp: 165, powerRpm: 6500, idle: 1200, redline: 7200,
    ratios: [2.92, 2.00, 1.54, 1.25, 1.04, 0.90], final: 4.1, wheelR: 0.30, drive: "rwd",
    CdA: 0.75, ClA: 1.0, aeroF: 0.4, mu: 1.6, brakeMax: 9000, abs: false,
    wb: 2.65, wdF: 0.42, hcg: 0.28, steerLock: 0.32, wheelRot: Math.PI * 0.75, shiftTime: 0.14,
    tireOpt: 72, tireHeat: 2.2, wear: 1.1, color: 0xd91f1f, eye: [0, 0.62, 0.35], look: "open"
  },
  f3: {
    id: "f3", name: "Формула 3", cls: "formula", cyl: 6,
    mass: 680, hp: 380, powerRpm: 8000, idle: 1500, redline: 8500,
    ratios: [2.70, 1.95, 1.55, 1.30, 1.12, 1.00], final: 4.2, wheelR: 0.31, drive: "rwd",
    CdA: 0.85, ClA: 2.2, aeroF: 0.43, mu: 1.7, brakeMax: 13000, abs: false,
    wb: 2.8, wdF: 0.44, hcg: 0.27, steerLock: 0.30, wheelRot: Math.PI * 0.7, shiftTime: 0.10,
    tireOpt: 80, tireHeat: 1.7, wear: 1.15, color: 0x1ea84b, eye: [0, 0.60, 0.35], look: "open"
  },
  f2: {
    id: "f2", name: "Формула 2", cls: "formula", cyl: 6,
    mass: 770, hp: 620, powerRpm: 9000, idle: 2000, redline: 10000,
    ratios: [2.55, 1.85, 1.50, 1.28, 1.12, 1.00], final: 4.4, wheelR: 0.32, drive: "rwd",
    CdA: 0.95, ClA: 3.0, aeroF: 0.44, mu: 1.8, brakeMax: 17000, abs: false,
    wb: 3.1, wdF: 0.43, hcg: 0.27, steerLock: 0.28, wheelRot: Math.PI * 0.65, shiftTime: 0.07,
    tireOpt: 92, tireHeat: 1.15, wear: 1.2, color: 0x1a2a8c, eye: [0, 0.60, 0.35], look: "open"
  },
  f1: {
    id: "f1", name: "Формула 1", cls: "formula", cyl: 6,
    mass: 800, hp: 1000, powerRpm: 12500, idle: 4000, redline: 15000,
    ratios: [2.60, 2.05, 1.70, 1.45, 1.27, 1.12, 1.00, 0.90], final: 5.9, wheelR: 0.34, drive: "rwd",
    CdA: 1.10, ClA: 4.0, aeroF: 0.45, mu: 1.9, brakeMax: 32000, abs: false,
    wb: 3.6, wdF: 0.445, hcg: 0.27, steerLock: 0.25, wheelRot: Math.PI * 0.6, shiftTime: 0.04,
    tireOpt: 98, tireHeat: 1.2, wear: 1.2, color: 0xe10600, eye: [0, 0.62, 0.35], look: "open"
  }
};
const CAR_ORDER = ["gtr", "gt3", "f4", "f3", "f2", "f1"];

/* Кривая момента: форма задаётся относительно powerRpm, масштаб подбирается так,
   чтобы максимальная мощность в диапазоне idle..redline равнялась hp. */
(function(){
  const shape = x => Math.max(0.32, 0.6 + 0.4 * (1 - Math.pow((x - 0.8) / 0.8, 2)));
  for (const id of CAR_ORDER) {
    const D = CARS[id];
    let best = 0;
    for (let r = D.idle; r <= D.redline; r += 50) best = Math.max(best, shape(r / D.powerRpm) * r * Math.PI / 30);
    D.Tpeak = D.hp * 745.7 / best;
    D.shape = shape;
    D.torque = rpm => D.Tpeak * shape(Math.max(rpm, D.idle) / D.powerRpm);
    D.Iz = D.mass * D.wb * D.wb * 0.22;          // момент инерции рыскания
    D.gearMax = D.ratios.length;
  }
})();

/* ---------- Гараж: цены и апгрейды ---------- */
const CAR_PRICE = { gtr: 0, gt3: 12000, f4: 20000, f3: 40000, f2: 80000, f1: 150000 };
const UPG = {
  e: { name: "Двигатель", hint: "+мощность", step: 0.04 },
  t: { name: "Шины", hint: "+сцепление", step: 0.03 },
  a: { name: "Аэродинамика", hint: "+прижим", step: 0.06 }
};
const UPG_MAX = 5;
const upgCost = (id, lvl) => Math.round(CAR_PRICE[id] * 0.06 + 1500) * (lvl + 1);

/* Копия класса машины с учётом апгрейдов garage[id] = {e,t,a}. Оригинал не меняется. */
function upgradedDef(id, up) {
  const B = CARS[id]; up = up || {};
  const d = Object.assign({}, B);
  d.hp = B.hp * (1 + UPG.e.step * (up.e || 0));
  d.mu = B.mu * (1 + UPG.t.step * (up.t || 0));
  d.ClA = B.ClA * (1 + UPG.a.step * (up.a || 0));
  let best = 0;
  for (let r = d.idle; r <= d.redline; r += 50) best = Math.max(best, B.shape(r / d.powerRpm) * r * Math.PI / 30);
  d.Tpeak = d.hp * 745.7 / best;
  d.torque = rpm => d.Tpeak * B.shape(Math.max(rpm, d.idle) / d.powerRpm);
  return d;
}
