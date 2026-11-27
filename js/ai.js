"use strict";
/* Соперники: те же физика и машина, что и у игрока. Водитель ИИ едет по "гоночной линии"
   со смещением, скорость берётся из профиля, посчитанного по кривизне трассы с учётом
   прижимной силы, торможения и разгона (проходы вперёд и назад по кругу). */

const _profCache = {};

function speedProfile(def, skill) {
  const key = def.id + "|" + TRACK.info.id + "|" + skill + "|" + WET;
  if (_profCache[key]) return _profCache[key];
  const N = TRACK.N, ds = TRACK.DS, m = def.mass;
  const mu = def.mu * 0.9 * skill * (1 - WET * (def.cls === "formula" ? 0.40 : 0.52));                     // запас по шинам и навыку
  const aeroK = 0.5 * RHO * def.ClA / m;                // прижим на единицу массы на (м/с)^2
  const dragK = 0.5 * RHO * def.CdA / m;
  const vmax = wheelRpm({ vx: 1, def }, def.gearMax) > 0 ? def.redline * Math.PI / 30 * def.wheelR / (def.ratios[def.gearMax - 1] * def.final) : 100;
  const v = new Float64Array(N);
  for (let i = 0; i < N; i++) {                         // предел по боковому ускорению
    const k = Math.abs(TRACK.K[i]), den = k - mu * aeroK;
    v[i] = den <= 1e-9 ? vmax : Math.min(vmax, Math.sqrt(mu * GRAV / den));
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 2 * N - 1; i >= 0; i--) {              // торможение: назад по трассе
      const a = i % N, b = (i + 1) % N, vb = v[b];
      const abr = mu * (GRAV + aeroK * vb * vb) * (def.cls === "gt" ? 0.7 : 0.92) * (1 - WET * 0.4) + dragK * vb * vb;
      v[a] = Math.min(v[a], Math.sqrt(vb * vb + 2 * abr * ds));
    }
    for (let i = 0; i < 2 * N; i++) {                   // разгон: вперёд по трассе
      const a = i % N, b = (i + 1) % N, va = Math.max(v[a], 6);
      const aPow = def.hp * 745.7 * 0.85 / (m * va) - dragK * va * va;
      const aTrac = mu * GRAV * (def.drive === "awd" ? 0.95 : 0.55) + mu * aeroK * va * va * 0.5;
      const acc = Math.max(0.5, Math.min(aPow, aTrac));
      v[b] = Math.min(v[b], Math.sqrt(va * va + 2 * acc * ds));
    }
  }
  return (_profCache[key] = v);
}

function newAI(def, skill, offset) {
  return { skill, offset, prof: speedProfile(def, skill), lastSteer: 0 };
}

function aiDrive(c, ai, dt) {
  const D = c.def, L = D.wb, v = Math.max(c.vx, 1);
  const Ld = 8 + 0.55 * v;
  const kNow = kappaAt(c.s + 6), kAhead = kappaAt(c.s + Ld * 0.6);
  // линия: слегка смещаемся к внутренней стороне поворота (kappa > 0 — вправо, d > 0 — вправо)
  const line = ai.offset + Math.max(-3.2, Math.min(3.2, kNow * 220));
  const psiDes = Math.atan2(line - c.d, Ld);
  const understeer = 1 + 0.0009 * v * v * (D.ClA > 1 ? 0.35 : 1);
  let delta = L * kAhead * understeer + 1.5 * (psiDes - c.psi) + 0.35 * (c.r * 0 );
  const dLim = D.steerLock;
  delta = Math.max(-dLim, Math.min(dLim, delta));

  const N = TRACK.N, idx = Math.floor((((c.s + 0.25 * v) % TRACK.L) + TRACK.L) % TRACK.L / TRACK.DS) % N;
  const vt = ai.prof[idx];
  const err = vt - c.vx;
  let gas = Math.max(0, Math.min(1, err / 3 + 0.3));
  let brake = Math.max(0, Math.min(WET ? 0.55 : 1, -err / (WET ? 1.8 : 4)));
  // антипробуксовка и стабилизация: скольжение задней оси — сразу убираем газ
  const slideR = Math.abs(c.alphaR);
  const sl0 = WET ? 0.03 : 0.07;
  if (slideR > sl0) gas *= Math.max(0, 1 - (slideR - sl0) * 9);
  if (c.spinR) gas *= 0.5;
  if (Math.abs(c.alphaF) > 0.18) { gas *= 0.5; brake = Math.max(brake, 0.15); }
  if (Math.abs(c.d) > ROAD_W / 2 + 1.5) { gas *= 0.6; }
  return { delta, gas, brake };
}
