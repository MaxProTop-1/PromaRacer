"use strict";
/* Замкнутая трасса. Строится из гладкой замкнутой кривой, затем пересэмплируется
   по длине дуги. Кривизна K > 0 — правый поворот; трасса идёт по часовой стрелке. */
const ROAD_W = 12, KERB_W = 1.2, RUNOFF = 12, WALL_D = ROAD_W / 2 + KERB_W + RUNOFF;

const TRACKS = [
  { id: "ring",   name: "Proma Ring (длинная, быстрая)", seed: 7,  R0: 450, sx: 1.6, minR: 42 },
  { id: "sprint", name: "Proma Sprint (короткая, техничная)", seed: 21, R0: 300, sx: 1.25, minR: 32 }
];

const TRACK = { N: 0, L: 0, DS: 2, X: null, Z: null, H: null, K: null, minR: 0, info: null };

function buildTrack(def) {
  let seed = def.seed >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const harm = [2, 3, 4, 5, 7, 9].map(k => ({ k, a: 0.4 + rnd(), ph: rnd() * Math.PI * 2 }));

  function dense(scale) {
    const M = 4000, P = new Array(M);
    for (let i = 0; i < M; i++) {
      const th = i / M * Math.PI * 2;
      let r = 1;
      for (const h of harm) r += scale * h.a * 0.14 / h.k * Math.cos(h.k * th + h.ph);
      r *= def.R0;
      P[i] = [def.sx * r * Math.sin(th), -r * Math.cos(th)];
    }
    return P;
  }
  function resample(P) {
    const M = P.length, cum = new Float64Array(M + 1);
    for (let i = 0; i < M; i++) {
      const a = P[i], b = P[(i + 1) % M];
      cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const L = cum[M], N = Math.round(L / 2), ds = L / N;
    const X = new Float64Array(N), Z = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * ds;
      while (cum[j + 1] < s) j++;
      const a = P[j % M], b = P[(j + 1) % M], f = (s - cum[j]) / (cum[j + 1] - cum[j]);
      X[i] = a[0] + (b[0] - a[0]) * f; Z[i] = a[1] + (b[1] - a[1]) * f;
    }
    // курс и кривизна по центральным разностям
    const H = new Float64Array(N), K = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const p = (i + N - 1) % N, n = (i + 1) % N;
      H[i] = Math.atan2(X[n] - X[p], -(Z[n] - Z[p]));
    }
    for (let i = 0; i < N; i++) {
      const n = (i + 1) % N, p = (i + N - 1) % N;
      let dh = H[n] - H[p];
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      K[i] = dh / (2 * ds);
    }
    const Ks = new Float64Array(N);
    for (let i = 0; i < N; i++) {          // сглаживание по 7 точкам (14 м)
      let sum = 0;
      for (let o = -3; o <= 3; o++) sum += K[(i + o + N) % N];
      Ks[i] = sum / 7;
    }
    // непрерывный курс: интеграл кривизны от начального курса
    let h = H[0];
    for (let i = 0; i < N; i++) { H[i] = h; h += Ks[i] * ds; }
    let kmax = 0;
    for (let i = 0; i < N; i++) kmax = Math.max(kmax, Math.abs(Ks[i]));
    return { N, L, ds, X, Z, H, K: Ks, minR: 1 / kmax };
  }

  // подбор амплитуды: минимальный радиус должен получиться равным def.minR
  let lo = 0, hi = 3, best = null;
  for (let it = 0; it < 14; it++) {
    const mid = (lo + hi) / 2, t = resample(dense(mid));
    if (t.minR > def.minR) lo = mid; else hi = mid;
    best = t;
  }
  best = resample(dense(lo));
  Object.assign(TRACK, { N: best.N, L: best.L, DS: best.ds, X: best.X, Z: best.Z, H: best.H, K: best.K, minR: best.minR, info: def });
  return TRACK;
}

function _idx(s) {
  const T = TRACK;
  s = ((s % T.L) + T.L) % T.L;
  const f = s / T.DS, i = Math.floor(f);
  return [i % T.N, (i + 1) % T.N, f - i];
}
function kappaAt(s) { const [i, j, f] = _idx(s); return TRACK.K[i] + (TRACK.K[j] - TRACK.K[i]) * f; }
function trackAt(s) {
  const [i, j, f] = _idx(s), T = TRACK;
  let dh = T.H[j] - T.H[i];
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  return { x: T.X[i] + (T.X[j] - T.X[i]) * f, z: T.Z[i] + (T.Z[j] - T.Z[i]) * f, h: T.H[i] + dh * f };
}
