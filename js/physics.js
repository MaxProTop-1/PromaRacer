"use strict";
/* Динамика машины: велосипедная модель с боковым скольжением, нагрузкой на оси
   (перенос веса, прижимная сила), "кругом трения" на каждой оси, температурой и износом шин,
   коробкой передач с временем переключения и ограничителем оборотов.
   Система координат тела: x вперёд, y вправо, рыскание r > 0 — поворот вправо.
   Положение на трассе: s — путь вдоль центра, d — смещение вправо, psi — угол к касательной. */

function newVehicle(def) {
  return {
    def, s: 0, d: 0, psi: 0, vx: 0, vy: 0, r: 0,
    gear: 1, rpm: def.idle, shiftT: 0, auto: false, hitRev: false,
    delta: 0, steerSm: 0,
    tempF: def.tireOpt * 0.78, tempR: def.tireOpt * 0.78, wearF: 0, wearR: 0,
    lockF: false, lockR: false, spinR: false,
    alphaF: 0, alphaR: 0, ax: 0, ay: 0, gripF: 1, gripR: 1, tireF: 1, tireR: 1,
    onGrass: false, wall: 0, lap: 0, drs: false, fz: [0, 0]
  };
}

const tireFactor = (T, opt, wear) =>
  Math.max(0.68, 1 - 0.00028 * (T - opt) * (T - opt)) * (1 - 0.28 * wear);

function wheelRpm(c, gear) {
  const D = c.def;
  return c.vx / D.wheelR * 30 / Math.PI * D.ratios[gear - 1] * D.final;
}

/* Коробка: запросы переключения передач и автомат. */
function shiftGear(c, dir) {
  const D = c.def, g = c.gear + dir;
  if (g < 1 || g > D.gearMax || c.shiftT > 0) return false;
  if (dir < 0 && wheelRpm(c, g) > D.redline * 1.03) { c.hitRev = true; return false; }   // защита от перекрутки
  c.gear = g; c.shiftT = D.shiftTime;
  return true;
}
function autoShift(c, dt) {
  const D = c.def;
  c.autoT = Math.max(0, (c.autoT || 0) - dt);
  if (c.autoT > 0 || c.shiftT > 0) return;
  const wr = wheelRpm(c, c.gear);
  if (wr > D.redline * 0.95 && c.gear < D.gearMax) { shiftGear(c, 1); c.autoT = 0.5; }
  else if (c.gear > 1) {
    const down = wheelRpm(c, c.gear - 1);
    if (wr < D.idle * 1.6 + D.redline * 0.18 && down < D.redline * 0.88) { shiftGear(c, -1); c.autoT = 0.5; }
  }
}

/* inp: { steer: -1..1, gas: 0..1, brake: 0..1, delta?: прямой угол колёс (для ИИ) } */
function physStep(c, inp, dt) {
  const D = c.def, T = TRACK, m = D.mass, W = m * GRAV, L = D.wb;
  const lf = L * (1 - D.wdF), lr = L * D.wdF;
  const vxp = Math.max(c.vx, 0);

  // --- поверхность ---
  const ad = Math.abs(c.d), edge = ROAD_W / 2 + KERB_W;
  c.onGrass = ad > ROAD_W / 2 + 0.3;
  const muSurf = ad <= ROAD_W / 2 + 0.3 ? 1 : (ad <= edge + 2 ? 0.8 : 0.5);

  // --- аэродинамика ---
  const q = 0.5 * RHO * vxp * vxp;
  const drag = q * D.CdA * (c.drs ? 0.72 : 1), down = q * D.ClA * (c.drs ? 0.8 : 1);

  // --- нагрузки на оси ---
  const trans = m * c.ax * D.hcg / L;      // ускорение переносит вес назад, торможение вперёд
  const FzF = Math.max(0.12 * W, W * D.wdF - trans + down * D.aeroF);
  const FzR = Math.max(0.12 * W, W * (1 - D.wdF) + trans + down * (1 - D.aeroF));
  c.fz[0] = FzF; c.fz[1] = FzR;

  // --- шины ---
  c.tireF = tireFactor(c.tempF, D.tireOpt, c.wearF);
  c.tireR = tireFactor(c.tempR, D.tireOpt, c.wearR);
  const muF = D.mu * c.tireF * muSurf, muR = D.mu * c.tireR * muSurf;
  c.gripF = muF; c.gripR = muR;

  // --- руль: скорость поворота ограничена, на скорости угол уменьшается помощью ---
  let deltaWanted;
  if (inp.delta !== undefined) deltaWanted = inp.delta;
  else {
    const assist = 1 / (1 + Math.pow(vxp / (D.assistV || 38), 2));
    deltaWanted = inp.steer * D.steerLock * (0.25 + 0.75 * assist);
  }
  const maxRate = 2.2;                          // рад/с
  const dd = Math.max(-maxRate * dt, Math.min(maxRate * dt, deltaWanted - c.delta));
  c.delta += dd;
  const delta = c.delta, cd = Math.cos(delta), sd = Math.sin(delta);

  // --- трансмиссия ---
  c.shiftT = Math.max(0, c.shiftT - dt);
  if (c.auto) autoShift(c, dt);
  const ratio = D.ratios[c.gear - 1] * D.final;
  const wr = wheelRpm(c, c.gear);
  const launch = D.idle + (D.redline - D.idle) * 0.38;
  let rpmEng = Math.max(wr, inp.gas > 0.05 ? launch : D.idle);
  rpmEng = Math.min(rpmEng, D.redline * 1.02);
  let Fdrive = 0;
  const limiter = wr >= D.redline;
  if (inp.gas > 0.02) {
    if (c.shiftT <= 0 && !limiter) Fdrive = D.torque(rpmEng) * ratio * 0.92 / D.wheelR * inp.gas;
  } else if (vxp > 0.5) {
    Fdrive = -D.Tpeak * 0.10 * (wr / D.redline) * ratio / D.wheelR;       // торможение двигателем
  }
  c.rpm += (rpmEng - c.rpm) * Math.min(1, dt * 14);

  // --- продольные силы по осям ---
  const driveF = D.drive === "awd" ? 0.4 : 0, driveR = 1 - driveF;
  const bf = 0.62;                                                       // баланс тормозов
  let FxF = Fdrive * driveF - D.brakeMax * inp.brake * bf;
  let FxR = Fdrive * driveR - D.brakeMax * inp.brake * (1 - bf);
  const limF = muF * FzF, limR = muR * FzR;
  c.lockF = c.lockR = c.spinR = false;
  let latF = 1, latR = 1;
  if (Math.abs(FxF) > limF) {
    if (FxF < 0 && !D.abs) { c.lockF = true; latF = 0.35; FxF = -0.85 * limF; }
    else FxF = Math.sign(FxF) * limF * (D.abs ? 0.97 : 1);
  }
  if (Math.abs(FxR) > limR) {
    if (FxR < 0 && !D.abs) { c.lockR = true; latR = 0.5; FxR = -0.85 * limR; }
    else { if (FxR > 0) c.spinR = true; FxR = Math.sign(FxR) * limR * (D.abs && FxR < 0 ? 0.97 : 1); }
  }

  // --- боковые силы (формула типа "магической" + круг трения) ---
  const vxs = Math.max(c.vx, 3);
  const aF = Math.atan2(c.vy + lf * c.r, vxs) - delta;
  const aR = Math.atan2(c.vy - lr * c.r, vxs);
  c.alphaF = aF; c.alphaR = aR;
  const fyMaxF = Math.sqrt(Math.max(0, limF * limF - FxF * FxF)) * latF;
  const fyMaxR = Math.sqrt(Math.max(0, limR * limR - FxR * FxR)) * latR;
  const mag = a => Math.sin(1.4 * Math.atan(12 * a));
  const FyF = -fyMaxF * mag(aF), FyR = -fyMaxR * mag(aR);

  // --- сопротивление ---
  const roll = vxp > 0.1 ? (0.016 + (c.onGrass ? 0.18 : 0)) * W : 0;
  const Ftot = FxR + FxF * cd - FyF * sd - drag - roll;
  const Fytot = FyR + FyF * cd + FxF * sd;
  const Mz = lf * (FyF * cd + FxF * sd) - lr * FyR;

  c.ax = Ftot / m;
  c.ay = Fytot / m;
  c.vx += (c.ax + c.vy * c.r) * dt;
  c.vy += (c.ay - c.vx * c.r) * dt;
  c.r += (Mz / D.Iz - c.r * 0.15) * dt;
  if (c.vx < 0) { c.vx = 0; }

  // на малой скорости — кинематическая модель (иначе скольжение расходится)
  const w = Math.max(0, Math.min(1, (c.vx - 2) / 4));
  const rKin = c.vx * Math.tan(delta) / L;
  c.vy *= w;
  c.r = c.r * w + rKin * (1 - w);

  // --- шины: нагрев и износ ---
  // мощность трения в пятне контакта (Вт): боковое скольжение + продольные нагрузки (разгон/торможение)
  const slipPF = Math.abs(FyF * Math.sin(aF)) * vxs + Math.abs(FxF) * vxp * 0.012;
  const slipPR = Math.abs(FyR * Math.sin(aR)) * vxs + Math.abs(FxR) * vxp * 0.012 * (c.spinR ? 2.5 : 1);
  const coolK = 0.012 * (1 + vxp / 50);
  const coolF = coolK * (1 + (c.tempF - 25) / 50) * (c.tempF - 25);
  const coolR = coolK * (1 + (c.tempR - 25) / 50) * (c.tempR - 25);
  c.tempF += (D.tireHeat * slipPF / 7e3 - coolF) * dt;
  c.tempR += (D.tireHeat * slipPR / 7e3 - coolR) * dt;
  c.wearF += D.wear * slipPF / 1.5e8 * dt;
  c.wearR += D.wear * slipPR / 1.5e8 * dt;
  c.wearF = Math.min(c.wearF, 1); c.wearR = Math.min(c.wearR, 1);
  c.tempF = Math.max(20, Math.min(160, c.tempF)); c.tempR = Math.max(20, Math.min(160, c.tempR));

  // --- движение по трассе ---
  const kap = kappaAt(c.s);
  const sdot = (c.vx * Math.cos(c.psi) - c.vy * Math.sin(c.psi)) / (1 - kap * c.d);
  c.s += sdot * dt;
  c.d += (c.vx * Math.sin(c.psi) + c.vy * Math.cos(c.psi)) * dt;
  c.psi += (c.r - kap * sdot) * dt;
  while (c.psi > Math.PI) c.psi -= 2 * Math.PI;
  while (c.psi < -Math.PI) c.psi += 2 * Math.PI;

  // --- отбойник ---
  c.wall = 0;
  if (Math.abs(c.d) > WALL_D) {
    const side = Math.sign(c.d);
    c.d = side * WALL_D;
    const into = c.vx * Math.sin(c.psi) + c.vy * Math.cos(c.psi);
    if (into * side > 0) {                      // удар: гасим скорость, разворачиваем вдоль стены
      c.wall = Math.min(1, Math.abs(into) / 20);
      c.vx *= 0.55; c.vy *= 0.2; c.r *= 0.3;
      c.psi *= 0.4;
    }
  }
  c.rpmWheel = wr;

  // --- "маршалы": если машина застряла (развёрнута или стоит на траве), возвращаем на трассу ---
  const stuck = (c.vx < 6 && (Math.abs(c.d) > ROAD_W / 2 + KERB_W || Math.abs(c.psi) > 1.2)) || (c.vx < 1.5 && Math.abs(c.psi) > 0.6);
  c.stuckT = stuck ? (c.stuckT || 0) + dt : 0;
  if (c.stuckT > 3) recoverVehicle(c);
}

function recoverVehicle(c) {
  c.d = Math.max(-2, Math.min(2, c.d * 0.2)); c.psi = 0; c.vx = 10; c.vy = 0; c.r = 0; c.delta = 0;
  c.gear = Math.max(1, Math.min(c.gear, 3)); c.stuckT = 0; c.recovered = (c.recovered || 0) + 1;
}
