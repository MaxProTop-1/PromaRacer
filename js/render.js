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

/* Купол неба: градиент от зенита к горизонту и солнечное свечение. Он же служит картой отражений для кузова. */
function skyCanvas(env) {
  const top = (env && env.sky) || SKY, hor = (env && env.fog) || 0xb9d3e6;
  return canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, hexCss(shadeHex(top, 0.62))); gr.addColorStop(0.5, hexCss(top)); gr.addColorStop(0.62, hexCss(hor)); gr.addColorStop(1, hexCss(shadeHex(hor, 0.75)));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sx = w * 0.30, sy = h * 0.34, rg = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.5);
    rg.addColorStop(0, "rgba(255,248,220,1)"); rg.addColorStop(0.06, "rgba(255,244,210,0.95)"); rg.addColorStop(0.25, "rgba(255,230,170,0.35)"); rg.addColorStop(1, "rgba(255,230,170,0)");
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.fillStyle = "rgba(255,255,255," + (0.05 + Math.random() * 0.1) + ")"; g.beginPath(); g.ellipse(Math.random() * w, h * (0.25 + Math.random() * 0.3), 20 + Math.random() * 50, 3 + Math.random() * 6, 0, 0, 7); g.fill(); }
  });
}
function makeSky(env) {
  if (R.sky) { R.scene.remove(R.sky); R.sky.material.map.dispose(); }
  const tex = skyCanvas(env); tex.wrapS = THREE.ClampToEdgeWrapping; tex.repeat.set(1, 1);
  R.sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  R.sky.renderOrder = -10; R.scene.add(R.sky);
  try {                                             // отражения на кузове
    const eq = skyCanvas(env); eq.mapping = THREE.EquirectangularReflectionMapping;
    if (!R.pmrem) R.pmrem = new THREE.PMREMGenerator(R.renderer);
    if (R.env) R.env.dispose();
    R.env = R.pmrem.fromEquirectangular(eq).texture;
  } catch (e) { R.env = null; }
}

function initRender() {
  if (R.inited) return;
  R.inited = true;
  R.renderer = new THREE.WebGLRenderer({ antialias: true });
  R.renderer.shadowMap.enabled = true; R.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  document.body.appendChild(R.renderer.domElement);
  R.scene = new THREE.Scene();
  R.scene.background = new THREE.Color(SKY);
  R.scene.fog = new THREE.Fog(SKY, 150, 1300);
  R.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5a3a, 0.95));
  const sun = R.sun = new THREE.DirectionalLight(0xfff2d8, 0.85); sun.position.set(-60, 120, 40);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 400 });
  R.scene.add(sun, sun.target);
  R.sunDir = [-60, 120, 40];
  makeSky();

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

const hexCss = h => "#" + ("000000" + h.toString(16)).slice(-6);
function shadeHex(h, f) { const r = Math.min(255, ((h >> 16) & 255) * f | 0), g = Math.min(255, ((h >> 8) & 255) * f | 0), b = Math.min(255, (h & 255) * f | 0); return (r << 16) | (g << 8) | b; }

/* Небо, туман и земля под выбранную трассу. */
function applyEnv(env) {
  env = env || { sky: SKY, fog: 0xb9d3e6, ground: 0x3f7a2c };
  if (WET) env = Object.assign({}, env, { sky: shadeHex(0x7d8794, 1), fog: 0x8c949e, ground: shadeHex(env.ground, 0.7) });
  R.scene.background = new THREE.Color(env.sky);
  R.scene.fog = new THREE.Fog(env.fog, WET ? 60 : 150, WET ? 650 : 1300);
  if (R.sun) R.sun.intensity = WET ? 0.25 : 0.85;
  makeSky(env);
  makeRain();
  const gt = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = hexCss(env.ground); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { g.fillStyle = hexCss(shadeHex(env.ground, Math.random() < 0.5 ? 0.88 : 1.12)); g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  gt.repeat.set(R.GRASS / R.TILE, R.GRASS / R.TILE);
  R.grassTex = gt; R.grass.material.map = gt; R.grass.material.needsUpdate = true;
}

/* Дождь: полосы, падающие вокруг камеры; скорость машины наклоняет их назад. */
function makeRain() {
  if (R.rain) { R.scene.remove(R.rain); R.rain = null; }
  if (!WET) return;
  const n = 1800, pos = new Float32Array(n * 6);
  R.rainP = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) R.rainP.set([(Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 60], i * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  R.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc9d4e0, transparent: true, opacity: 0.45, fog: false }));
  R.rain.frustumCulled = false; R.scene.add(R.rain);
}
function updateRain(p, v, dt) {
  if (!R.rain) return;
  const P = R.rainP, pos = R.rain.geometry.attributes.position.array, n = P.length / 3, fall = 14, slant = v * 0.04;
  for (let i = 0; i < n; i++) {
    let y = P[i * 3 + 1] - fall * dt; if (y < 0) y += 30; P[i * 3 + 1] = y;
    const x = p.x + P[i * 3], z = p.z + P[i * 3 + 2];
    pos.set([x, y, z, x, y + 0.6, z + slant * 0.15], i * 6);
  }
  R.rain.geometry.attributes.position.needsUpdate = true;
}

function buildWorld() {
  initRender();
  const env = (TRACK.info && TRACK.info.env) || null;
  applyEnv(env);
  if (R.world) R.scene.remove(R.world);
  const W = R.world = new THREE.Group(); R.scene.add(W);
  const tile = (len) => TRACK.L / Math.max(1, Math.round(TRACK.L / len));
  const roadTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = WET ? "#26272b" : "#3b3b3f"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { const l = i % 2 ? 255 : 0; g.fillStyle = "rgba(" + l + "," + l + "," + l + ",0.04)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = "#f2f2f2"; g.fillRect(w * 0.03, 0, w * 0.025, h); g.fillRect(w * 0.945, 0, w * 0.025, h);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(w * 0.30, 0, w * 0.40, h);            // гоночная линия темнее
  });
  const kerbTex = canvasTex(16, 32, (g, w, h) => { g.fillStyle = "#d01010"; g.fillRect(0, 0, w, h / 2); g.fillStyle = "#f4f4f4"; g.fillRect(0, h / 2, w, h / 2); });
  const runTex = canvasTex(32, 32, (g, w, h) => { g.fillStyle = "#5b5b60"; g.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) { g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  const wk = env ? env.wall : "armco";
  const wallTex = canvasTex(64, 32, (g, w, h) => {
    if (wk === "concrete") { g.fillStyle = "#a9abaf"; g.fillRect(0, 0, w, h); g.fillStyle = "#f2f2f2"; g.fillRect(0, h * 0.35, w, h * 0.2); g.fillStyle = "#d01010"; g.fillRect(0, h * 0.55, w / 2, h * 0.2); g.fillStyle = "#6b6d71"; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 1, h); }
    else if (wk === "tire") { for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? "#f2f2f2" : "#16161a"; g.fillRect(x * 16, y * 16, 15, 15); } }
    else { g.fillStyle = "#e8e8e8"; g.fillRect(0, 0, w, h); g.fillStyle = "#d01010"; g.fillRect(0, 0, w / 2, h); g.fillStyle = "#222"; g.fillRect(0, h - 4, w, 4); }
  });
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

  // окружение: лес, пальмы или городская застройка
  W.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  const kind = env ? (env.city ? "city" : env.trees) : "pine";
  let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const farFrom = (x, z, d) => { for (let k = 0; k < TRACK.N; k += 3) if (Math.hypot(TRACK.X[k] - x, TRACK.Z[k] - z) < d) return false; return true; };
  const spot = (minOff, span) => {
    const i = Math.floor(rnd() * TRACK.N), side = rnd() < 0.5 ? -1 : 1, off = side * (WALL_D + minOff + rnd() * span);
    return [TRACK.X[i] + Math.cos(TRACK.H[i]) * off, TRACK.Z[i] + Math.sin(TRACK.H[i]) * off];
  };
  if (kind === "pine" || kind === "palm") {
    const count = kind === "pine" ? 1500 : 500, palm = kind === "palm";
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(palm ? 0.18 : 0.25, 0.35, palm ? 7 : 3, 6), lam(palm ? 0x8a6a45 : 0x5a3b22), count);
    const crown = new THREE.InstancedMesh(palm ? new THREE.SphereGeometry(2.4, 7, 5) : new THREE.ConeGeometry(2.2, 7, 7), lam(palm ? 0x3f9a3a : 0x1f5a2a), count);
    let placed = 0;
    for (let tries = 0; tries < 6000 && placed < count; tries++) {
      const [x, z] = spot(6, palm ? 60 : 110);
      if (!farFrom(x, z, WALL_D + 5)) continue;
      const s = 0.8 + rnd() * 0.9; sc.set(s, s, s);
      m4.compose(p.set(x, (palm ? 3.5 : 1.5) * s, z), q, sc); trunk.setMatrixAt(placed, m4);
      if (palm) sc.set(s, s * 0.45, s);
      m4.compose(p.set(x, (palm ? 7.2 : 6.5) * s, z), q, sc); crown.setMatrixAt(placed, m4);
      placed++;
    }
    trunk.count = crown.count = placed;
    W.add(trunk, crown);
  } else if (kind === "city") {
    const count = 420, winTex = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = "#9a9da3"; g.fillRect(0, 0, w, h);
      for (let y = 4; y < h - 6; y += 10) for (let x = 5; x < w - 6; x += 10) { g.fillStyle = rnd() < 0.2 ? "#ffe9a0" : "#27384a"; g.fillRect(x, y, 6, 6); }
    });
    const bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff, { map: winTex }), count);
    let placed = 0;
    for (let tries = 0; tries < 4000 && placed < count; tries++) {
      const [x, z] = spot(4, 70);
      if (!farFrom(x, z, WALL_D + 3)) continue;
      const w = 14 + rnd() * 22, d = 14 + rnd() * 22, h = 18 + rnd() * rnd() * 110;
      sc.set(w, h, d); m4.compose(p.set(x, h / 2, z), q, sc); bld.setMatrixAt(placed++, m4);
    }
    bld.count = placed;
    W.add(bld);
  }
}

/* ---------- Машины ---------- */
function wheelMesh(r, w) {                     // простое колесо (используется в кокпите формул)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), lam(0x111113));
  m.rotation.z = Math.PI / 2;
  const g = new THREE.Group(); g.add(m);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 1.02, 10), lam(0xb9bcc2));
  rim.rotation.z = Math.PI / 2; g.add(rim);
  return g;
}

/* Склейка статичных деталей по материалам: на машину остаётся ~8 вызовов отрисовки вместо сотен. */
function bakeGroup(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const by = new Map(), all = [];
  root.traverse(o => { if (o.isMesh && o !== root && !(o.material && o.material.map) && !o.userData.keep) all.push(o); });
  for (const o of all) { const a = by.get(o.material) || []; a.push(o); by.set(o.material, a); }
  for (const o of all) if (o.parent) o.parent.remove(o);
  by.forEach((meshes, mat) => {
    const geos = []; let n = 0;
    for (const o of meshes) {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      geos.push(g); n += g.attributes.position.count;
    }
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let off = 0;
    for (const g of geos) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    root.add(new THREE.Mesh(out, mat));
  });
}

/* Кузов как выдавленный боковой профиль (l — вдоль машины, нос = +l; y — высота), затем сужение по taper(l, y). */
function extrudeProfile(pts, width, bevel, taper) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const b = bevel || 0.05;
  const geo = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(Math.PI / 2);                          // x профиля -> -z машины (нос вперёд = -z), глубина -> ширина (x)
  if (taper) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * taper(-pos.getZ(i), pos.getY(i)));
    pos.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return geo;
}
const clamp01 = v => Math.max(0, Math.min(1, v));

function carMaterials(color) {
  const phong = (c, sh, sp, extra) => new THREE.MeshPhongMaterial(Object.assign({ color: c, shininess: sh, specular: sp }, extra || {}));
  return {
    paint: R.env ? new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.28, envMap: R.env, envMapIntensity: 1.1 }) : phong(color, 110, 0x666666),
    glass: phong(0x1a2530, 140, 0xaaaaaa, { transparent: true, opacity: 0.82 }),
    carbon: phong(0x16171b, 50, 0x333333),
    plastic: lam(0x0d0d0f),
    chrome: phong(0xdcdcdc, 160, 0xffffff),
    white: phong(0xf2f2f2, 80, 0x555555),
    head: new THREE.MeshBasicMaterial({ color: 0xfff4d0 }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff1c1c }),
    tire: lam(0x0c0c0d),
    rim: phong(0xc4c7cc, 130, 0xffffff),
    disc: phong(0x6d6f73, 60, 0x888888),
    caliper: lam(0xd01010),
    helmet: phong(0xffd400, 120, 0xffffff),
    visor: phong(0x10161c, 150, 0xffffff)
  };
}

/* Колесо: поворотная ось (p) -> вращение (m). Шина, диск со спицами, тормозной диск и суппорт. */
function makeWheel(M, r, w, x, z, front, parent, wheels) {
  const pivot = new THREE.Group(); pivot.position.set(x, r, z);
  const spin = new THREE.Group(); pivot.add(spin);
  const cyl = (rad, len, mat, ox) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 26), mat); m.rotation.z = Math.PI / 2; m.position.x = ox || 0; spin.add(m); return m; };
  cyl(r, w, M.tire);                               // шина
  cyl(r * 0.66, w * 1.03, M.rim);                  // диск
  cyl(r * 0.58, w * 1.05, M.plastic);              // ниша диска
  const out = x > 0 ? 1 : -1;
  for (let k = 0; k < 6; k++) {                    // спицы
    const sp = new THREE.Group(); sp.rotation.x = k * Math.PI / 3; spin.add(sp);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * 0.1, r * 0.54, r * 0.09), M.rim); m.position.set(out * w * 0.5, r * 0.3, 0); sp.add(m);
  }
  cyl(r * 0.1, w * 1.08, M.chrome);                // ступица
  cyl(r * 0.5, w * 0.14, M.disc, -out * w * 0.2);  // тормозной диск
  const cal = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, r * 0.3, r * 0.24), M.caliper); cal.position.set(-out * w * 0.2, r * 0.42, r * 0.05); spin.add(cal);
  bakeGroup(spin);
  parent.add(pivot); wheels.push({ m: spin, p: pivot, front });
  return pivot;
}

function strut(M, a, b, rad, parent) {            // тонкая стойка между двумя точками (подвеска)
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 6), M.carbon);
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.rotation.order = "ZXY";                        // цилиндр вдоль Y -> направление (dx,dy,dz)
  m.rotation.x = Math.atan2(dz, dy);
  m.rotation.z = -Math.asin(dx / len);
  parent.add(m);
}

function buildCarMesh(def, color, exterior) {
  const g = new THREE.Group(), M = carMaterials(color), wheels = [];
  const L = (z) => -z;                              // l (нос +) -> z (нос -z)
  const box = (w, h, d, x, y, l, mat, rx, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, L(l)); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; g.add(m); return m; };
  const part = (geo, mat, x, y, l) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, L(l || 0)); g.add(m); return m; };
  const A = def.wb / 2;

  if (def.cls === "gt") {
    const gt3 = def.id === "gt3";
    // кузов и остекление
    part(extrudeProfile([[-2.30, 0.30], [-2.36, 0.55], [-2.28, 0.86], [-1.75, 0.95], [-0.9, 0.93], [-0.25, 0.92], [0.55, 0.90], [1.35, 0.80], [1.95, 0.66], [2.30, 0.52], [2.36, 0.36], [2.25, 0.26], [1.0, 0.24], [-1.0, 0.24], [-2.1, 0.26]],
      1.78, 0.06, (l, y) => (1 - 0.30 * Math.pow(clamp01((l - 1.5) / 0.9), 2)) * (1 - 0.20 * Math.pow(clamp01((-1.6 - l) / 0.8), 2)) * (1 - 0.10 * clamp01((y - 0.78) / 0.17))), M.paint);
    part(extrudeProfile([[-1.30, 0.88], [-0.78, 1.28], [-0.05, 1.33], [0.45, 1.27], [1.02, 0.88]], 1.42, 0.03, (l, y) => 1 - 0.26 * clamp01((y - 0.88) / 0.45)), M.glass);
    part(extrudeProfile([[-0.80, 1.27], [-0.05, 1.36], [0.43, 1.285], [0.38, 1.24], [-0.7, 1.24]], 1.0, 0.02, (l, y) => 1), M.paint);
    // свет, решётка, воздухозаборники
    for (const s of [-1, 1]) {
      box(0.36, 0.09, 0.07, s * 0.62, 0.64, 2.27, M.head);
      box(0.5, 0.07, 0.06, s * 0.55, 0.80, -2.33, M.tail);
      box(0.14, 0.1, 0.08, s * 0.9, 0.42, 2.2, M.plastic);
    }
    box(0.8, 0.14, 0.06, 0, 0.44, 2.33, M.plastic);
    box(0.5, 0.05, 0.06, 0, 0.80, -2.34, M.tail);
    box(1.8, 0.06, 0.05, 0, 0.34, 2.34, M.plastic);
    // зеркала
    for (const s of [-1, 1]) { box(0.14, 0.04, 0.05, s * 0.9, 1.0, 0.9, M.plastic); part(new THREE.BoxGeometry(0.22, 0.12, 0.1), M.paint, s * 1.02, 1.02, 0.85); box(0.03, 0.09, 0.08, s * 1.02, 1.02, 0.79, M.glass); }
    // пороги, сплиттер, диффузор, выхлоп
    for (const s of [-1, 1]) box(0.05, 0.09, 2.5, s * 0.93, 0.3, 0, M.plastic);
    box(gt3 ? 2.0 : 1.9, 0.04, gt3 ? 0.5 : 0.35, 0, 0.22, 2.2, M.carbon);
    box(1.4, 0.13, 0.5, 0, 0.3, -2.1, M.carbon);
    if (gt3) {                                       // антикрыло, капот с жабрами
      box(1.9, 0.05, 0.42, 0, 1.24, -2.1, M.carbon, -0.08);
      for (const s of [-1, 1]) { box(0.04, 0.3, 0.14, s * 0.5, 1.07, -2.1, M.carbon); box(0.03, 0.22, 0.52, s * 0.95, 1.2, -2.1, M.paint); }
      for (const s of [-1, 1]) box(0.3, 0.02, 0.5, s * 0.35, 0.83, 1.0, M.plastic);
    } else {
      box(1.6, 0.04, 0.2, 0, 0.99, -2.3, M.paint, -0.15);
      for (const x of [-0.5, -0.25, 0.25, 0.5]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), M.chrome); t.rotation.x = Math.PI / 2; t.position.set(x, 0.4, L(-2.4)); g.add(t); }
    }
    bakeGroup(g);
    const wd = gt3 ? 0.32 : 0.27;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) makeWheel(M, def.wheelR, wd, sx * 0.93, sz * A, sz < 0, g, wheels);
  } else {
    const tipL = A + 1.05, tailL = -(A + 0.85), r = def.wheelR;
    // монокок, мотор, боковые зоны
    part(extrudeProfile([[tailL, 0.30], [tailL + 0.5, 0.42], [-1.5, 0.60], [-1.0, 0.80], [-0.8, 0.80], [-0.7, 0.60], [-0.35, 0.58], [0.15, 0.58], [0.45, 0.46], [A - 0.3, 0.40], [tipL, 0.30], [tipL, 0.16], [A, 0.12], [-A, 0.12], [tailL, 0.16]],
      0.42, 0.05, (l, y) => (1 - 0.6 * clamp01((l - (A - 0.3)) / (tipL - A + 0.3))) * (1 - 0.35 * clamp01((y - 0.6) / 0.2)) * (1 - 0.3 * clamp01((tailL + 0.8 - l) / 0.8))), M.paint);
    for (const s of [-1, 1]) {
      part(extrudeProfile([[0.95, 0.14], [0.95, 0.40], [0.4, 0.52], [-0.8, 0.46], [-1.6, 0.30], [-1.65, 0.14]], 0.34, 0.05, (l, y) => 1 - 0.45 * clamp01((-0.5 - l) / 1.2)), M.paint, s * 0.5, 0, 0);
      box(0.14, 0.06, 0.05, s * 0.5, 0.7, 0.35, M.plastic, 0, 0);            // стойка зеркала
      part(new THREE.BoxGeometry(0.2, 0.1, 0.04), M.paint, s * 0.62, 0.72, 0.38);
      box(0.18, 0.08, 0.02, s * 0.62, 0.72, 0.355, M.glass);
    }
    box(1.5, 0.03, 3.7, 0, 0.09, 0, M.carbon);                                // днище
    // переднее крыло: два элемента + концевые пластины
    box(1.9, 0.025, 0.42, 0, 0.1, tipL - 0.05, M.carbon);
    box(1.9, 0.02, 0.24, 0, 0.17, tipL - 0.2, M.carbon, 0.15);
    box(0.06, 0.16, 0.3, 0, 0.2, tipL - 0.3, M.carbon);
    for (const s of [-1, 1]) box(0.025, 0.2, 0.6, s * 0.95, 0.17, tipL - 0.1, M.paint);
    // заднее крыло, пластины, балка, стойка, фонарь
    box(1.0, 0.03, 0.36, 0, 0.95, tailL + 0.15, M.carbon, -0.05);
    box(1.0, 0.025, 0.22, 0, 1.03, tailL + 0.1, M.carbon, -0.22);
    for (const s of [-1, 1]) box(0.03, 0.36, 0.55, s * 0.52, 0.85, tailL + 0.15, M.paint);
    box(0.06, 0.5, 0.08, 0, 0.66, tailL + 0.2, M.carbon);
    box(0.8, 0.02, 0.2, 0, 0.42, tailL + 0.1, M.carbon);
    box(0.12, 0.05, 0.03, 0, 0.5, tailL - 0.02, M.tail);
    // кабина: шлем, визор, хало, воздухозаборник
    part(new THREE.SphereGeometry(0.15, 14, 10), M.helmet, 0, 0.78, -0.05);
    box(0.2, 0.06, 0.12, 0, 0.8, 0.1, M.visor);
    box(0.04, 0.04, 0.9, 0.17, 0.88, 0.05, M.carbon, 0.0); box(0.04, 0.04, 0.9, -0.17, 0.88, 0.05, M.carbon, 0.0);
    box(0.34, 0.04, 0.04, 0, 0.92, 0.45, M.carbon);
    box(0.04, 0.3, 0.04, 0, 0.77, 0.45, M.carbon, 0.45);
    box(0.3, 0.18, 0.12, 0, 0.72, -0.78, M.plastic);
    // подвеска
    const tr = 0.82;
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      const l = sz * A;
      strut(M, [sx * 0.25, 0.3, l + 0.25], [sx * (tr - 0.08), r, l], 0.012, g);
      strut(M, [sx * 0.25, 0.3, l - 0.25], [sx * (tr - 0.08), r, l], 0.012, g);
      strut(M, [sx * 0.25, 0.18, l], [sx * (tr - 0.08), r * 0.6, l], 0.012, g);
    }
    bakeGroup(g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) makeWheel(M, r, sz < 0 ? 0.36 : 0.46, sx * tr, sz * A, sz < 0, g, wheels);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
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
    for (const w of mesh.userData.wheels) { w.m.rotation.x -= c.vx * dt / c.def.wheelR; if (w.front) (w.p || w.m).rotation.y = -c.delta * 0.8; }
  }
  if (chase && R.playerExt) for (const w of R.playerExt.userData.wheels) { w.m.rotation.x -= playerCar.vx * dt / playerCar.def.wheelR; if (w.front) (w.p || w.m).rotation.y = -playerCar.delta * 0.8; }

  const p = R.player.position;
  R.grass.position.set(p.x, -0.03, p.z);
  if (R.sky) R.sky.position.set(p.x, 0, p.z);
  updateRain(p, playerCar.vx, dt);
  if (R.sun) { R.sun.target.position.set(p.x, 0, p.z); R.sun.position.set(p.x + R.sunDir[0], R.sunDir[1], p.z + R.sunDir[2]); R.sun.target.updateMatrixWorld(); }
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
