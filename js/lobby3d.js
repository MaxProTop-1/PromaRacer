"use strict";
/* Фон лобби: 3D-гараж пит-стопа. Машина на домкратах, бригада меняет колёса, камера медленно плывёт.
   Использует buildCarMesh из render.js. Свой рендерер на отдельном canvas, во время гонки не работает. */
const L3 = { on: false, inited: false, t: 0, crew: [], car: null, carKey: "" };

function l3Init(canvas) {
  if (L3.inited) return;
  L3.inited = true;
  const r = L3.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const sc = L3.scene = new THREE.Scene();
  sc.background = new THREE.Color(0x07080b);
  sc.fog = new THREE.Fog(0x07080b, 14, 40);
  L3.cam = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  sc.add(new THREE.HemisphereLight(0xbcc8ff, 0x201010, 0.55));
  const key = new THREE.DirectionalLight(0xfff0e0, 0.9); key.position.set(-6, 9, 8); sc.add(key);
  const rim = new THREE.PointLight(0xe10600, 1.4, 22); rim.position.set(5, 3, -5); sc.add(rim);
  const rim2 = new THREE.PointLight(0x2255ff, 0.8, 20); rim2.position.set(-6, 2.5, -4); sc.add(rim2);

  // пол: плитка с разметкой пит-лейна
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#15171c"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1b1e25"; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
    g.strokeStyle = "#0a0b0e"; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  });
  tex.repeat.set(14, 14);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; sc.add(floor);
  // пит-бокс: жёлтая рамка вокруг машины
  const box = new THREE.Mesh(new THREE.RingGeometry(3.7, 3.85, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide }));
  box.rotation.x = -Math.PI / 2; box.position.y = 0.02; box.scale.set(1, 1.5, 1); sc.add(box);

  // задняя стена: тёмные панели и красные световые полосы
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), new THREE.MeshLambertMaterial({ color: 0x0d0f14 }));
  wall.position.set(0, 4.5, -9); sc.add(wall);
  for (let i = 0; i < 6; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xe10600 : 0xffffff }));
    strip.position.set(-12.5 + i * 5, 7.2, -8.9); sc.add(strip);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({
    map: canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = "#e10600"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff";
      g.font = "900 64px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("PROMA PIT", w / 2, h / 2 + 3);
    })
  }));
  sign.material.map.wrapS = sign.material.map.wrapT = THREE.ClampToEdgeWrapping;
  sign.position.set(0, 5.4, -8.85); sc.add(sign);
  // шкафы с шинами по краям
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.32, 16), lam(i % 2 ? 0x181818 : 0x222222));
    t.position.set(sx * 8.5, 0.2 + i * 0.34, -6 + (i % 2) * 0.2); sc.add(t);
  }

  // бригада: тело-капсула, шлем, цвет комбинезона
  const suit = [0xe10600, 0xffffff, 0x0a58ca, 0xffcc00];
  const person = (x, z, face, col, role) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 10), lam(col)); body.position.y = 0.85; g.add(body);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.5, 10), lam(0x111114)); legs.position.y = 0.25; g.add(legs);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), lam(0xf5f5f5)); head.position.y = 1.43; g.add(head);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.1), lam(0x111122)); vis.position.set(0, 1.45, 0.14); g.add(vis);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), lam(col)); arm.position.set(0.22, 1.0, 0.3); g.add(arm);
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.34), lam(0x666a72)); tool.position.set(0.22, 1.0, 0.68); g.add(tool);
    g.position.set(x, 0, z); g.rotation.y = face;
    sc.add(g); L3.crew.push({ g, role, base: new THREE.Vector3(x, 0, z), ph: Math.random() * 6, arm, tool });
  };
  const wbx = 0.95, wz = 1.4;
  // у каждого колеса: «гайковёрт» и «снимающий»
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    person(sx * 1.75, sz * wz, -sx * Math.PI / 2, suit[i % 4], "wheel");
    person(sx * 2.4, sz * wz + 0.3, -sx * Math.PI / 2, 0xffffff, "wheel");
  });
  person(0, 3.6, Math.PI, 0xffcc00, "jack");       // передний домкрат (нос машины смотрит к камере, +z)
  person(0, -3.8, 0, 0xffcc00, "jack");            // задний домкрат
  person(-2.6, 4.6, Math.PI * 0.8, 0xe10600, "lolly");  // «леденец» перед машиной
}

function l3SetCar(def, color) {
  if (!L3.inited) return;
  const key = def.id + ":" + color;
  if (L3.carKey === key) return;
  L3.carKey = key;
  if (L3.car) L3.scene.remove(L3.car);
  L3.car = buildCarMesh(def, color, true);
  L3.car.rotation.y = Math.PI;                 // нос к камере-«боку»: развернём общим вращением
  L3.carGroup = L3.carGroup || new THREE.Group();
  L3.carGroup.children.slice().forEach(c => L3.carGroup.remove(c));
  L3.carGroup.add(L3.car);
  L3.scene.add(L3.carGroup);
  L3.def = def;
}

function l3Frame(now) {
  if (!L3.on) return;
  requestAnimationFrame(l3Frame);
  const t = L3.t = now / 1000;
  const w = innerWidth, h = innerHeight, r = L3.renderer;
  if (L3.w !== w || L3.h !== h) { L3.w = w; L3.h = h; r.setSize(w, h, false); L3.cam.aspect = w / h; L3.cam.updateProjectionMatrix(); }
  // цикл пит-стопа ~ 8 с: подъём — смена — опускание
  const cyc = (t % 8) / 8;
  const lift = cyc < 0.15 ? cyc / 0.15 : cyc < 0.75 ? 1 : cyc < 0.9 ? 1 - (cyc - 0.75) / 0.15 : 0;
  if (L3.carGroup) {
    L3.carGroup.position.y = lift * 0.22;
    L3.carGroup.position.z = 0;
    L3.carGroup.rotation.x = 0;
    const spin = cyc > 0.2 && cyc < 0.7;
    if (L3.car) for (const wh of L3.car.userData.wheels) wh.m.rotation.x += spin ? 0.5 : 0.01;
  }
  for (const p of L3.crew) {
    const act = lift > 0.8;
    if (p.role === "wheel") {
      p.g.position.y = act ? Math.abs(Math.sin(t * 12 + p.ph)) * 0.05 : 0;
      p.tool.position.z = 0.68 + (act ? Math.sin(t * 30 + p.ph) * 0.04 : 0);
      p.g.position.x = p.base.x + (act ? 0 : Math.sign(p.base.x) * 0.5 * (cyc < 0.5 ? (cyc < 0.1 ? 1 - cyc * 10 : 0) : Math.min(1, (cyc - 0.9) * 10)));
    } else if (p.role === "jack") {
      p.g.position.y = lift * 0.0;
      p.g.rotation.x = Math.sin(t * 2 + p.ph) * 0.03 + (lift > 0.1 && lift < 0.9 ? 0.12 : 0);
    } else {
      p.arm.rotation.x = cyc > 0.85 || cyc < 0.1 ? -1.2 : -0.3;      // «леденец» поднят перед стартом
    }
  }
  // камера плавно качается вокруг машины
  const a = Math.sin(t * 0.12) * 0.55 + 0.35, rad = L3.def && L3.def.cls === "gt" ? 9.6 : 9;
  L3.cam.position.set(Math.sin(a) * rad, 2.6 + Math.sin(t * 0.2) * 0.25, Math.cos(a) * rad);
  L3.cam.lookAt(0, 0.7, 0);
  if (L3.shift) L3.cam.setViewOffset(w, h, -w * L3.shift, 0, w, h); else L3.cam.clearViewOffset();
  r.render(L3.scene, L3.cam);
}
function l3Start() { if (!L3.inited || L3.on) return; L3.on = true; requestAnimationFrame(l3Frame); }
function l3Stop() { L3.on = false; }
