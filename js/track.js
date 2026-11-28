"use strict";
/* Замкнутая трасса. Строится из гладкой замкнутой кривой, затем пересэмплируется
   по длине дуги. Кривизна K > 0 — правый поворот; трасса идёт по часовой стрелке. */
let ROAD_W = 12, KERB_W = 1.2, RUNOFF = 12, WALL_D = ROAD_W / 2 + KERB_W + RUNOFF;
/* Свободная езда: дорога шире (36 м), чтобы было где дрифтить. Вызывать до buildTrack/buildWorld. */
function setRoadWidth(wide) { ROAD_W = wide ? 36 : 12; RUNOFF = wide ? 8 : 12; WALL_D = ROAD_W / 2 + KERB_W + RUNOFF; }

/* Трассы по опорным точкам (метры, по часовой стрелке, старт на прямой в начале списка).
   env — оформление окружения: sky, fog, ground, trees ("pine"|"palm"|"none"), city, wall. */
const TRACKS = [
  { id: "ring",   name: "Proma Ring (длинная, быстрая)", seed: 7,  R0: 450, sx: 1.6, minR: 42 },
  { id: "sprint", name: "Proma Sprint (короткая, техничная)", seed: 21, R0: 300, sx: 1.25, minR: 32 },
  { id: "forest", name: "Proma Forest (лес, быстрые повороты)", minR: 30,
    pts: [[-450,-300],[0,-300],[500,-300],[800,-260],[930,-110],[900,40],[790,90],[640,60],[540,150],[540,330],[420,450],[170,440],[0,500],[-230,470],[-420,350],[-560,150],[-640,-60],[-600,-220]],
    env: { sky: 0x9cc4e8, fog: 0xb9d3e6, ground: 0x2f5a2a, trees: "pine", city: false, wall: "armco" } },
  { id: "city", name: "Proma Streets (городская, стены)", minR: 18,
    pts: [[-200,-200],[0,-200],[250,-200],[330,-150],[350,-50],[300,40],[200,60],[140,130],[170,230],[260,290],[250,390],[130,430],[0,380],[-60,280],[-170,260],[-260,320],[-370,280],[-380,150],[-300,80],[-310,-40],[-290,-140]],
    env: { sky: 0xa9c7e3, fog: 0xc3d3e0, ground: 0x6d6f73, trees: "none", city: true, wall: "concrete" } },
  { id: "coast", name: "Proma Coast (побережье, пальмы)", minR: 28,
    pts: [[-500,-250],[-100,-250],[400,-250],[700,-220],[860,-100],[850,60],[700,130],[560,100],[450,170],[480,330],[380,430],[150,420],[-50,350],[-250,420],[-480,380],[-640,230],[-660,20],[-620,-150]],
    env: { sky: 0x8fd0f0, fog: 0xcfe6f2, ground: 0xc9b27a, trees: "palm", city: false, wall: "tire" } }
];

const TRACK = { N: 0, L: 0, DS: 2, X: null, Z: null, H: null, K: null, minR: 0, info: null };

/* Замкнутый центростремительный Catmull-Rom по опорным точкам. */
function splineDense(pts, M) {
  const n = pts.length, P = [];
  const at = i => pts[((i % n) + n) % n];
  const per = Math.ceil(M / n);
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      P.push([0, 1].map(d => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return P;
}

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

  if (def.pts) {
    let P = splineDense(def.pts, 6000);
    for (let pass = 0; pass < 3; pass++) {           // сглаживание: убирает изломы сплайна, кривизна меняется плавно
      const M = P.length, Q = new Array(M), w = 45;
      for (let i = 0; i < M; i++) { let x = 0, z = 0; for (let o = -w; o <= w; o++) { const q = P[(i + o + M) % M]; x += q[0]; z += q[1]; } Q[i] = [x / (2 * w + 1), z / (2 * w + 1)]; }
      P = Q;
    }
    const t = resample(P);
    Object.assign(TRACK, { N: t.N, L: t.L, DS: t.ds, X: t.X, Z: t.Z, H: t.H, K: t.K, minR: t.minR, info: def });
    return TRACK;
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

/* ---------- Город для свободной езды ----------
   Сетка кварталов 60x60 м и улиц 16 м (шаг 76 м). В центре большая площадь для дрифта,
   по краям высокая стена-граница. Здания хранятся как прямоугольники для столкновений. */
const CITY = { P: 76, N: 15, ROAD: 16, boxes: [], spawn: { x: 0, z: 0, hd: 0 }, half: 0 };
function buildCity() {
  const { P, N, ROAD } = CITY, B = P - ROAD, half = N * P / 2;
  let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  CITY.boxes = []; CITY.half = half;
  const mid = (N - 1) / 2;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = (i - mid) * P, cz = (j - mid) * P, dc = Math.max(Math.abs(i - mid), Math.abs(j - mid));
    if (dc <= 1) continue;                                   // центральная площадь 3x3 квартала (~220 м)
    if (rnd() < 0.1) continue;                               // пустырь / парковка
    const parts = rnd() < 0.5 ? 1 : 2, tall = 14 + rnd() * rnd() * 90 * (1.3 - dc / (N / 2) * 0.6);
    for (let k = 0; k < parts; k++) {
      const w = parts === 1 ? B - 4 : (B - 6) / 2, d = B - 4 - rnd() * 14;
      const x = cx + (parts === 1 ? 0 : (k ? 1 : -1) * (w / 2 + 1.5)), z = cz + (rnd() - 0.5) * (B - 4 - d);
      CITY.boxes.push({ x, z, hw: w / 2, hd: d / 2, h: Math.max(8, tall * (0.6 + rnd() * 0.7)), tint: 0.7 + rnd() * 0.5 });
    }
  }
  const wallT = 2, h = 4;                                     // граница города
  for (const s of [-1, 1]) {
    CITY.boxes.push({ x: 0, z: s * (half + wallT / 2), hw: half + wallT, hd: wallT / 2, h, tint: 0.9, wall: true });
    CITY.boxes.push({ x: s * (half + wallT / 2), z: 0, hw: wallT / 2, hd: half + wallT, h, tint: 0.9, wall: true });
  }
  CITY.spawn = { x: 0, z: P * 0.5 + 40, hd: -Math.PI / 2 };   // у края площади, смотрим вдоль улицы
  CITY.spawn = { x: -60, z: 0, hd: Math.PI / 2 };
  return CITY;
}
