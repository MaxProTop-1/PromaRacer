// node tests/open.js [carId] — открытый город: разгон, ручник и занос, дрифт-очки, здания, задний ход
// Проверяет логику (старт, круги, ИИ, результаты) и отсутствие исключений. Картинку не проверяет.
const fs = require("fs"), vm = require("vm"), path = require("path");
const stub = new Proxy(function () {}, {
  get: (t, p) => p === Symbol.toPrimitive ? () => 0 : (p === "then" ? undefined : (p === "length" ? 0 : stub)),
  apply: () => stub, construct: () => stub, set: () => true
});
let rafCb = null;
const els = {};
const ctx = {
  console, Math, Float64Array, Float32Array, Date, Promise, setTimeout,
  THREE: stub, window: null, performance: { now: () => 0 }, screen: {}, navigator: {},
  document: { getElementById: id => els[id] || (els[id] = new Proxy({ style: {}, innerHTML: "", textContent: "" }, { get: (t, p) => p in t ? t[p] : stub, set: (t, p, v) => (t[p] = v, true) })), createElement: () => stub, body: stub },
  addEventListener() {}, setInterval() {}, requestAnimationFrame: cb => { rafCb = cb; }, innerWidth: 800, innerHeight: 400, devicePixelRatio: 1
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ["cars", "track", "physics", "ai", "input", "audio", "render", "main"])
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", f + ".js"), "utf8"), ctx, { filename: f });

const carId = process.argv[2] || "gt3";
vm.runInContext(`G.carId=${JSON.stringify(carId)}; G.mode="open"; G.online=false; G.vr=false; G.screen="mono"; startRace();`, ctx);
const q = s => vm.runInContext(s, ctx);
let now = 0; const step = ms => { now += ms; rafCb(now); };
const frames = n => { for (let i = 0; i < n; i++) step(16.667); };
console.log("режим:", q("G.open"), "OPENW:", q("OPENW"), "зданий:", q("CITY.boxes.length"));
// 1. разгон по прямой
q("input.gasSm=1; input.gas=1; input.steerSeen=true; input.steerTarget=0;"); frames(60 * 5);
console.log("после 5 с газа: v=" + (q("G.player.vx") * 3.6).toFixed(0) + " км/ч x=" + q("G.player.x").toFixed(0) + " z=" + q("G.player.z").toFixed(0));
// 2. поворот с ручником: должен быть занос и очки
q("input.steerTarget=0.9; input.hb=1;"); let maxAng = 0, maxDrift = 0;
for (let i = 0; i < 60 * 3; i++) { step(16.667); maxAng = Math.max(maxAng, q("G.drift.ang")); maxDrift = Math.max(maxDrift, q("G.drift.cur")); }
q("input.hb=0; input.steerTarget=0; input.gasSm=0; input.gas=0;"); frames(60 * 2);
console.log("занос: макс. угол " + (maxAng * 57.3).toFixed(0) + "°, очки серии " + maxDrift.toFixed(0) + ", всего " + q("G.drift.total").toFixed(0));
// 3. едем в здание: не проходим сквозь, скорость гасится
q("input.gasSm=1; input.gas=1; input.steerTarget=0;"); frames(60 * 40);
const sx = q("G.player.x"), sz = q("G.player.z"), half = q("CITY.half");
console.log("после 40 с газа: x=" + sx.toFixed(0) + " z=" + sz.toFixed(0) + " в границах города:", Math.abs(sx) < half && Math.abs(sz) < half);
// 4. задний ход
q("input.gasSm=0; input.gas=0; input.brakeSm=1; input.brake=1;"); frames(60 * 8);
console.log("тормоз/задний ход: vx=" + q("G.player.vx").toFixed(1) + " (ожидается < 0 после остановки), rev=" + q("G.player.rev"));
q("input.brakeSm=0; input.brake=0; toMenu();");
console.log("после выхода: OPENW=" + q("OPENW") + " free=" + q("G.open"));
