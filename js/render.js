"use strict";
/* Графика (Three.js r128): трасса, окружение, машины соперников, кокпит игрока, приборка, стерео для VR. */
const R = { inited: false, view: "cockpit", ai: [], cockpitKey: null };
const SKY = 0x9cc4ec, IPD = 0.064;

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));

function initRender() {
  if (R.inited) return;
  R.inited = true;
  R.renderer = new THREE.WebGLRenderer({ antialias: true });
  R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  document.body.appendChild(R.renderer.domElement);
  R.scene = new THREE.Scene();
  R.scene.background = new THREE.Color(SKY);
  R.scene.fog = new THREE.Fog(SKY, 150, 1300);
  R.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5a3a, 0.95));
  const sun = new THREE.DirectionalLight(0xfff2d8, 0.8); sun.position.set(-60, 120, 40); R.scene.add(sun);

  R.player = new THREE.Group(); R.scene.add(R.player);
  R.head = new THREE.Group(); R.player.add(R.head);
  R.camL = new THREE.PerspectiveCamera(80, 1, 0.05, 2800);
  R.camR = new THREE.PerspectiveCamera(80, 1, 0.05, 2800);
  R.camL.position.x = -IPD / 2; R.camR.position.x = IPD / 2;
  R.head.add(R.camL, R.camR);

  // приборка и большие надписи
  R.hudCanvas = document.createElement("canvas"); R.hudCanvas.width = 512; R.hudCanvas.height = 256;
  R.hudCtx = R.hudCanvas.getContext("2d");
  R.hudTex = new THREE.CanvasTexture(R.hudCanvas);
  R.msgCanvas = document.createElement("canvas"); R.msgCanvas.width = 512; R.msgCanvas.height = 160;
  R.msgCtx = R.msgCanvas.getContext("2d");
  R.msgTex = new THREE.CanvasTexture(R.msgCanvas);
  R.msgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: R.msgTex, transparent: true }));
  R.msgMesh.visible = false;

  // трава едет за игроком
  const grassTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#3f7a2c"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < 0.5 ? "#356a25" : "#4b8a35"; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  R.grassTex = grassTex; R.GRASS = 6000; R.TILE = 8;
  grassTex.repeat.set(R.GRASS / R.TILE, R.GRASS / R.TILE);
  R.grass = new THREE.Mesh(new THREE.PlaneGeometry(R.GRASS, R.GRASS), new THREE.MeshLambertMaterial({ map: grassTex }));
  R.grass.rotation.x = -Math.PI / 2; R.grass.position.y = -0.03; R.scene.add(R.grass);
}

/* ---------- Трасса ---------- */
function trackStrip(inner, outer, y, tex, vTile, scene) {
  const N = TRACK.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4);
  for (let i = 0; i <= N; i++) {
    const j = i % N, c = Math.cos(TRACK.H[j]), s = Math.sin(TRACK.H[j]);
    pos.set([TRACK.X[j] + c * inner, y, TRACK.Z[j] + s * inner], i * 6);
    pos.set([TRACK.X[j] + c * outer, y, TRACK.Z[j] + s * outer], i * 6 + 3);
    uv.set([0, i * TRACK.DS / vTile, 1, i * TRACK.DS / vTile], i * 4);
  }
  const idx = [];
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  scene.add(m); return m;
}
function wallStrip(side, h, tex, vTile, scene) {
  const N = TRACK.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), o = side * WALL_D;
  for (let i = 0; i <= N; i++) {
    const j = i % N, c = Math.cos(TRACK.H[j]), s = Math.sin(TRACK.H[j]);
    pos.set([TRACK.X[j] + c * o, 0, TRACK.Z[j] + s * o], i * 6);
    pos.set([TRACK.X[j] + c * o, h, TRACK.Z[j] + s * o], i * 6 + 3);
    uv.set([0, i * TRACK.DS / vTile, 1, i * TRACK.DS / vTile], i * 4);
  }
  const idx = [];
  for (let i = 0; i < TRACK.N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  scene.add(m); return m;
}

function buildWorld() {
  initRender();
  if (R.world) R.scene.remove(R.world);
  const W = R.world = new THREE.Group(); R.scene.add(W);
  const tile = (len) => TRACK.L / Math.max(1, Math.round(TRACK.L / len));
  const roadTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = "#3b3b3f"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { const l = i % 2 ? 255 : 0; g.fillStyle = "rgba(" + l + "," + l + "," + l + ",0.04)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = "#f2f2f2"; g.fillRect(w * 0.03, 0, w * 0.025, h); g.fillRect(w * 0.945, 0, w * 0.025, h);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(w * 0.30, 0, w * 0.40, h);            // гоночная линия темнее
  });
  const kerbTex = canvasTex(16, 32, (g, w, h) => { g.fillStyle = "#d01010"; g.fillRect(0, 0, w, h / 2); g.fillStyle = "#f4f4f4"; g.fillRect(0, h / 2, w, h / 2); });
  const runTex = canvasTex(32, 32, (g, w, h) => { g.fillStyle = "#5b5b60"; g.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) { g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  const wallTex = canvasTex(64, 32, (g, w, h) => { g.fillStyle = "#e8e8e8"; g.fillRect(0, 0, w, h); g.fillStyle = "#d01010"; g.fillRect(0, 0, w / 2, h); g.fillStyle = "#222"; g.fillRect(0, h - 4, w, 4); });
  const e = ROAD_W / 2;
  trackStrip(-e, e, 0.01, roadTex, tile(12), W);
  trackStrip(e, e + KERB_W, 0.02, kerbTex, tile(6), W);
  trackStrip(-e - KERB_W, -e, 0.02, kerbTex, tile(6), W);
  trackStrip(e + KERB_W, e + KERB_W + 2, 0.005, runTex, tile(8), W);
  trackStrip(-e - KERB_W - 2, -e - KERB_W, 0.005, runTex, tile(8), W);
  wallStrip(1, 1.1, wallTex, tile(8), W); wallStrip(-1, 1.1, wallTex, tile(8), W);

  // стартовая линия и портал
  const t0 = trackAt(0), line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 1.2), new THREE.MeshBasicMaterial({
    map: canvasTex(64, 8, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? "#fff" : "#111"; g.fillRect(x * 4, y * 4, 4, 4); } })
  }));
  line.rotation.x = -Math.PI / 2; line.position.set(t0.x, 0.035, t0.z); line.rotation.z = t0.h; W.add(line);
  const gantry = new THREE.Group(), dk = lam(0x222226);
  const pl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), dk); pl.position.set(-WALL_D + 0.5, 4, 0);
  const pr = pl.clone(); pr.position.x = WALL_D - 0.5;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(WALL_D * 2, 1.6, 0.8), lam(0xffffff, { map: canvasTex(128, 16, (g, w, h) => { for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? "#fff" : "#111"; g.fillRect(x * 4, y * 4, 4, 4); } }) }));
  bar.position.set(0, 7.4, 0);
  gantry.add(pl, pr, bar); gantry.position.set(t0.x, 0, t0.z); gantry.rotation.y = -t0.h; W.add(gantry);

  // трибуны на старте
  const stand = new THREE.Mesh(new THREE.BoxGeometry(60, 9, 8), lam(0x8a8f99, { map: canvasTex(64, 32, (g, w, h) => { g.fillStyle = "#777"; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = ["#e33", "#36e", "#ee3", "#3c3", "#fff"][i % 5]; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }) }));
  const ts = trackAt(80); stand.position.set(ts.x + Math.cos(ts.h) * (WALL_D + 10), 4.5, ts.z + Math.sin(ts.h) * (WALL_D + 10)); stand.rotation.y = -ts.h;
  W.add(stand);

  // деревья вдали от трассы
  const count = 1500;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), lam(0x5a3b22), count);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 7, 7), lam(0x1f5a2a), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let placed = 0;
  for (let tries = 0; tries < 6000 && placed < count; tries++) {
    const i = Math.floor(rnd() * TRACK.N), side = rnd() < 0.5 ? -1 : 1, off = side * (WALL_D + 6 + rnd() * 110);
    const x = TRACK.X[i] + Math.cos(TRACK.H[i]) * off, z = TRACK.Z[i] + Math.sin(TRACK.H[i]) * off;
    let ok = true;
    for (let k = 0; k < TRACK.N; k += 3) if (Math.hypot(TRACK.X[k] - x, TRACK.Z[k] - z) < WALL_D + 5) { ok = false; break; }
    if (!ok) continue;
    const s = 0.8 + rnd() * 0.9; sc.set(s, s, s);
    m4.compose(p.set(x, 1.5 * s, z), q, sc); trunk.setMatrixAt(placed, m4);
    m4.compose(p.set(x, 6.5 * s, z), q, sc); crown.setMatrixAt(placed, m4);
    placed++;
  }
  trunk.count = crown.count = placed;
  W.add(trunk, crown);
}

/* ---------- Машины ---------- */
function wheelMesh(r, w) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), lam(0x111113));
  m.rotation.z = Math.PI / 2;
  const g = new THREE.Group(); g.add(m);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 1.02, 10), lam(0xb9bcc2));
  rim.rotation.z = Math.PI / 2; g.add(rim);
  return g;
}

function buildCarMesh(def, color, exterior) {
  const g = new THREE.Group(), body = lam(color), dark = lam(0x161618), glass = lam(0x223344);
  const wheels = [];
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const wb = def.wb;
  if (def.cls === "gt") {
    add(new THREE.BoxGeometry(1.9, 0.55, 4.7), body, 0, 0.55, 0);
    add(new THREE.BoxGeometry(1.5, 0.5, 2.1), glass, 0, 1.05, 0.25);
    add(new THREE.BoxGeometry(1.4, 0.06, 1.8), body, 0, 1.31, 0.25);
    add(new THREE.BoxGeometry(1.9, 0.08, 0.5), dark, 0, 0.28, -2.4);                  // сплиттер
    if (def.id === "gt3") add(new THREE.BoxGeometry(1.9, 0.06, 0.35), dark, 0, 1.2, 2.25);     // антикрыло
    const wd = def.id === "gt3" ? 0.32 : 0.26;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = wheelMesh(def.wheelR, wd); w.position.set(sx * 0.93, def.wheelR, sz * wb / 2); g.add(w); wheels.push({ m: w, front: sz < 0 });
    }
  } else {
    add(new THREE.BoxGeometry(0.65, 0.42, 3.4), body, 0, 0.42, 0.2);
    add(new THREE.BoxGeometry(0.36, 0.26, 1.8), body, 0, 0.32, -2.1);                   // нос
    add(new THREE.BoxGeometry(0.55, 0.34, 1.7), body, -0.62, 0.36, 0.3);                // зоны радиаторов
    add(new THREE.BoxGeometry(0.55, 0.34, 1.7), body, 0.62, 0.36, 0.3);
    add(new THREE.BoxGeometry(1.7, 0.05, 0.55), dark, 0, 0.1, -3.05);                   // переднее крыло
    add(new THREE.BoxGeometry(1.0, 0.06, 0.5), dark, 0, 1.0, 2.0);                      // заднее крыло
    add(new THREE.BoxGeometry(0.05, 0.55, 0.55), dark, -0.5, 0.78, 2.0);
    add(new THREE.BoxGeometry(0.05, 0.55, 0.55), dark, 0.5, 0.78, 2.0);
    add(new THREE.SphereGeometry(0.15, 10, 8), lam(0xffd400), 0, 0.78, 0.35);         // шлем
    add(new THREE.BoxGeometry(0.06, 0.06, 0.9), dark, 0, 0.98, 0.0);                    // хало
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wd = sz < 0 ? 0.36 : 0.46, r = def.wheelR;
      const w = wheelMesh(r, wd); w.position.set(sx * 0.82, r, sz * wb / 2 + (sz > 0 ? -0.3 : 0.0)); g.add(w); wheels.push({ m: w, front: sz < 0 });
    }
  }
  g.userData.wheels = wheels;
  return g;
}

function setAICars(list) {
  for (const a of R.ai) R.scene.remove(a);
  R.ai = list.map(c => { const m = buildCarMesh(c.def, c.color || c.def.color); R.scene.add(m); return m; });
  if (R.playerExt) R.player.remove(R.playerExt);
}

/* ---------- Кокпит игрока ---------- */
function buildCockpit(def) {
  if (R.cockpit) R.player.remove(R.cockpit);
  if (R.playerExt) R.player.remove(R.playerExt);
  const C = R.cockpit = new THREE.Group(); R.player.add(C);
  const dark = lam(0x141416), mid = lam(0x2a2a30), paint = lam(def.color), carbon = lam(0x1b1c20);
  const ex = def.eye[0], ey = def.eye[1], ez = def.eye[2];
  const box = (w, h, d, x, y, z, mat, rx) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; C.add(m); return m; };
  R.wheelRot = def.wheelRot;
  if (def.look === "closed") {
    box(1.8, 0.12, 2.6, 0, 0.3, 0, dark);
    box(1.7, 0.35, 0.6, 0, ey - 0.35, ez - 0.95, mid, -0.25);             // торпедо
    box(1.6, 0.14, 2.0, 0, ey - 0.3, ez - 2.1, paint, 0.03);               // капот
    box(0.1, 0.65, 0.12, -0.82, ey + 0.15, ez - 0.55, dark, 0.5);          // стойки
    box(0.1, 0.65, 0.12, 0.82, ey + 0.15, ez - 0.55, dark, 0.5);
    box(1.8, 0.08, 1.3, 0, ey + 0.55, ez + 0.05, dark);                    // крыша
    box(0.1, 0.5, 1.5, -0.9, ey - 0.45, ez + 0.4, mid);
    box(0.1, 0.5, 1.5, 0.9, ey - 0.45, ez + 0.4, mid);
    box(0.28, 0.16, 0.05, -0.98, ey + 0.05, ez - 0.45, dark);              // зеркала
    box(0.28, 0.16, 0.05, 0.98, ey + 0.05, ez - 0.45, dark);
    box(0.7, 0.55, 0.15, ex, ey - 0.35, ez + 0.55, mid);                   // сиденье
  } else {
    box(0.7, 0.5, 1.4, 0, ey - 0.3, ez + 0.4, carbon);                     // монокок вокруг
    box(0.5, 0.28, 2.6, 0, ey - 0.3, ez - 1.5, paint);                     // нос
    box(1.7, 0.05, 0.55, 0, ey - 0.5, ez - 2.9, dark);                     // переднее крыло
    for (const s of [-1, 1]) {
      const w = wheelMesh(def.wheelR, 0.4); w.position.set(s * 0.85, def.wheelR - ey + ey, ez - 1.6); C.add(w);
      box(0.5, 0.3, 1.5, s * 0.6, ey - 0.28, ez + 0.2, paint);             // боковые зоны
    }
    box(0.07, 0.07, 1.1, 0, ey + 0.42, ez - 0.45, dark);                   // хало (центральная стойка и дуга)
    box(0.05, 0.4, 0.05, 0, ey + 0.22, ez - 0.95, dark, 0.5);
    box(0.9, 0.05, 0.05, 0, ey + 0.4, ez - 0.02, dark);
  }
  // руль
  const tilt = new THREE.Group(); tilt.position.set(ex, ey - 0.40, ez - 0.55); tilt.rotation.x = -0.35; C.add(tilt);
  R.wheel = new THREE.Group(); tilt.add(R.wheel);
  if (def.look === "closed") {
    R.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 10, 36), lam(0x0b0b0b)));
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.02), mid); R.wheel.add(sp);
    const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.17, 0.02), mid); sp2.position.y = -0.085; R.wheel.add(sp2);
  } else {
    R.wheel.add(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.17, 0.04), carbon));
    for (const s of [-1, 1]) { const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.05), lam(0x0b0b0b)); grip.position.x = s * 0.18; R.wheel.add(grip); }
  }
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.025), new THREE.MeshBasicMaterial({ color: 0xff2020 })); mark.position.y = def.look === "closed" ? 0.18 : 0.09; R.wheel.add(mark);
  // приборка
  R.hud = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: R.hudTex }));
  if (def.look === "closed") { R.hud.position.set(ex, ey - 0.17, ez - 0.78); R.hud.rotation.x = -0.35; C.add(R.hud); }
  else { R.hud.position.set(0, 0, 0.026); R.hud.scale.set(0.62, 0.62, 1); R.hud.rotation.x = 0; R.wheel.add(R.hud); R.hud.position.y = 0.0; }
  // надпись по центру ветрового стекла
  R.msgMesh.position.set(ex, ey + 0.1, ez - 2.2); R.msgMesh.scale.set(1, 1, 1); R.player.add(R.msgMesh);
  R.head.position.set(ex, ey, ez);

  // внешний вид машины игрока (для вида сзади)
  R.playerExt = buildCarMesh(def, def.color); R.playerExt.visible = false; R.player.add(R.playerExt);
}

/* ---------- Приборка ---------- */
let _hudAt = 0;
function drawHud(S, now) {
  if (now - _hudAt < 50) return; _hudAt = now;
  const g = R.hudCtx, W = 512, H = 256;
  g.fillStyle = "#06080c"; g.fillRect(0, 0, W, H);
  g.textAlign = "left"; g.fillStyle = "#fff"; g.font = "bold 92px system-ui"; g.fillText(String(Math.round(S.kmh)), 16, 98);
  g.font = "24px system-ui"; g.fillStyle = "#9aa"; g.fillText("км/ч", 20, 130);
  g.textAlign = "right"; g.fillStyle = S.shifting ? "#888" : "#ffcc00"; g.font = "bold 118px system-ui"; g.fillText(S.gear, W - 20, 110);
  g.font = "20px system-ui"; g.fillStyle = "#9aa"; g.fillText((S.auto ? "AUTO" : "MANUAL") + (S.assist ? " · ПОМ" : ""), W - 24, 136);
  // тахометр с шифт-лампами
  const frac = Math.min(1, S.rpm / S.redline);
  g.fillStyle = "#1c2128"; g.fillRect(16, 148, W - 32, 22);
  const cols = 15, cw = (W - 32) / cols;
  for (let i = 0; i < cols; i++) {
    const on = frac * cols > i + 0.4, f = i / cols;
    g.fillStyle = !on ? "#222a33" : (f < 0.55 ? "#2ad47a" : (f < 0.8 ? "#ffcc33" : "#ff3030"));
    if (S.limiter && on) g.fillStyle = "#4aa8ff";
    g.fillRect(16 + i * cw + 1, 150, cw - 2, 18);
  }
  g.textAlign = "left"; g.font = "20px system-ui"; g.fillStyle = "#9aa"; g.fillText(Math.round(S.rpm / 100) * 100 + " об/мин", 16, 192);
  // шины: температура и износ
  const tcol = (T, opt) => { const d = T - opt; return Math.abs(d) < 8 ? "#4cff7a" : (d < 0 ? "#6ab7ff" : (d < 25 ? "#ffcc33" : "#ff4a3a")); };
  g.font = "bold 22px system-ui";
  g.fillStyle = tcol(S.tF, S.opt); g.fillText("П " + Math.round(S.tF) + "°", 16, 226);
  g.fillStyle = tcol(S.tR, S.opt); g.fillText("З " + Math.round(S.tR) + "°", 110, 226);
  g.fillStyle = "#9aa"; g.font = "18px system-ui"; g.fillText("износ " + Math.round(Math.max(S.wF, S.wR) * 100) + "%", 200, 226);
  // гонка
  g.textAlign = "right"; g.font = "bold 24px system-ui"; g.fillStyle = "#fff";
  g.fillText("P" + S.pos + "/" + S.total + "  круг " + Math.min(S.lap, S.laps) + "/" + S.laps, W - 16, 196);
  g.font = "22px system-ui"; g.fillStyle = S.surface ? "#ff6a3a" : "#9aa";
  g.fillText(S.surface ? "ВНЕ ТРАССЫ" : (S.timeStr + (S.bestStr ? "  лучш " + S.bestStr : "")), W - 16, 226);
  R.hudTex.needsUpdate = true;

  // надпись по центру
  const m = R.msgCtx; m.clearRect(0, 0, 512, 160);
  if (S.msg) {
    m.fillStyle = "rgba(0,0,0,0.55)"; m.fillRect(40, 20, 432, 120);
    m.textAlign = "center"; m.fillStyle = S.msgColor || "#fff"; m.font = "bold " + (S.msgSize || 80) + "px system-ui";
    m.fillText(S.msg, 256, 105);
    if (S.msg2) { m.font = "28px system-ui"; m.fillStyle = "#fff"; m.fillText(S.msg2, 256, 132); }
  }
  R.msgTex.needsUpdate = true; R.msgMesh.visible = !!S.msg && R.view === "cockpit";
}

/* ---------- Кадр ---------- */
function applyCarTransform(obj, c, now) {
  const t = trackAt(c.s), heading = t.h + c.psi;
  obj.position.set(t.x + Math.cos(t.h) * c.d, 0, t.z + Math.sin(t.h) * c.d);
  obj.rotation.set(Math.max(-0.05, Math.min(0.05, c.ax * 0.004)), -heading, Math.max(-0.07, Math.min(0.07, -c.ay * 0.004)), "YXZ");
}

function renderFrame(playerCar, cars, S, dt, vr) {
  const now = performance.now();
  applyCarTransform(R.player, playerCar, now);
  if (R.wheel) R.wheel.rotation.z = -input.steer * R.wheelRot;
  const shake = (playerCar.onGrass ? 0.014 : 0.002) * Math.min(1, playerCar.vx / 30) + (playerCar.wall ? 0.05 : 0);
  R.player.position.y = Math.sin(now * 0.05) * shake;
  const chase = R.view === "chase";
  if (R.cockpit) R.cockpit.visible = !chase;
  if (R.playerExt) R.playerExt.visible = chase;
  headQuaternion(R.head.quaternion);
  if (chase) { R.head.position.set(0, 2.4, 7.5); R.head.quaternion.setFromEuler(new THREE.Euler(-0.12, 0, 0)); }
  else if (R.cockpit) R.head.position.set(playerCar.def.eye[0], playerCar.def.eye[1], playerCar.def.eye[2]);

  // соперники
  let k = 0;
  for (const c of cars) {
    if (c === playerCar) continue;
    const mesh = R.ai[k++]; if (!mesh) continue;
    applyCarTransform(mesh, c, now);
    for (const w of mesh.userData.wheels) { w.m.rotation.x -= c.vx * dt / c.def.wheelR; if (w.front) w.m.rotation.y = -c.delta * 0.8; }
  }
  if (chase && R.playerExt) for (const w of R.playerExt.userData.wheels) { w.m.rotation.x -= playerCar.vx * dt / playerCar.def.wheelR; if (w.front) w.m.rotation.y = -playerCar.delta * 0.8; }

  const p = R.player.position;
  R.grass.position.set(p.x, -0.03, p.z);
  R.grassTex.offset.set(p.x / R.TILE, -p.z / R.TILE);

  drawHud(S, now);

  const w = innerWidth, h = innerHeight, r = R.renderer;
  r.setScissorTest(true);
  if (vr) {
    const asp = (w / 2) / h; R.camL.aspect = R.camR.aspect = asp; R.camL.updateProjectionMatrix(); R.camR.updateProjectionMatrix();
    r.setViewport(0, 0, w / 2, h); r.setScissor(0, 0, w / 2, h); r.render(R.scene, R.camL);
    r.setViewport(w / 2, 0, w / 2, h); r.setScissor(w / 2, 0, w / 2, h); r.render(R.scene, R.camR);
  } else {
    R.camL.aspect = w / h; R.camL.updateProjectionMatrix(); R.camL.position.x = 0;
    r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h); r.render(R.scene, R.camL);
    R.camL.position.x = -IPD / 2;
  }
}
function resizeRender() { if (R.renderer) R.renderer.setSize(innerWidth, innerHeight); }
addEventListener("resize", resizeRender);
