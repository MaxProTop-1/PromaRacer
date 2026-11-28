// node tests/free.js [carId] — свободная езда: ручник и дрифт-очки без браузера.
const fs = require("fs"), vm = require("vm"), path = require("path");
const stub = new Proxy(function () {}, { get: (t, p) => p === Symbol.toPrimitive ? () => 0 : (p === "then" ? undefined : (p === "length" ? 0 : stub)), apply: () => stub, construct: () => stub, set: () => true });
let rafCb = null; const els = {};
const ctx = { console, Math, Float64Array, Float32Array, Date, Promise, setTimeout, THREE: stub, window: null, performance: { now: () => 0 }, screen: {}, navigator: {},
  document: { getElementById: id => els[id] || (els[id] = new Proxy({ style: {}, innerHTML: "", textContent: "" }, { get: (t, p) => p in t ? t[p] : stub, set: (t, p, v) => (t[p] = v, true) })), createElement: () => stub, body: stub },
  addEventListener() {}, setInterval() {}, requestAnimationFrame: cb => { rafCb = cb; }, innerWidth: 800, innerHeight: 400, devicePixelRatio: 1, localStorage: { getItem: () => null, setItem() {} } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ["config", "cars", "track", "physics", "ai", "input", "audio", "render", "main"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", f + ".js"), "utf8"), ctx, { filename: f });
const run = c => vm.runInContext(c, ctx);
const car = process.argv[2] || "gtr";
run(`G.mode="free"; G.carId=${JSON.stringify(car)}; G.trackIdx=TRACKS.findIndex(t=>t.id==="city"); G.driftTune=true; startRace();`);
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) process.exitCode = 1; };
ok(run("ROAD_W") === 36 && run("G.cars.length") === 1 && run("G.player.drift") === true && run("G.player.def.drive") === "rwd", "режим: дорога 36 м, один игрок, дрифт-настройка");
run(`G.state="race"; G.t=0; G.player.s=100; G.player.d=0; G.player.vx=22; G.player.gear=3; input.gas=1; input.gasSm=1; input.brakeSm=0;`);
if (process.env.DBG) console.log(run("JSON.stringify({ax:G.player.ax,mu:G.player.def.mu,mass:G.player.def.mass,Iz:G.player.def.Iz,wb:G.player.def.wb,wdF:G.player.def.wdF,hcg:G.player.def.hcg,tq:G.player.def.torque(5000),tp:G.player.def.Tpeak,WET:WET,kap:kappaAt(100),N:TRACK.N})"));
if (process.env.DBG) console.log(run("(function(){const c=G.player; const keys=Object.keys(c).filter(k=>typeof c[k]==='number'&&!isFinite(c[k])); return 'nonfinite before: '+keys+' | '+JSON.stringify({hand:input.hand,steer:input.steer,gas:input.gasSm,brake:input.brakeSm})})()"));
if (process.env.DBG) for (let i = 0; i < 4; i++) { run("simStep(HSTEP)"); console.log(JSON.stringify(run("({vx:G.player.vx,vy:G.player.vy,r:G.player.r,aR:G.player.alphaR,d:G.player.d,s:G.player.s,dl:G.player.delta,tF:G.player.tempF,gear:G.player.gear,rpm:G.player.rpm,ax:G.player.ax})"))); }
// 1) физика: на скорости руль + ручник вводят машину в занос, авто-контруль не даёт уйти в вертушку
let maxA = 0, maxPsi = 0, minVx = 99;
for (let i = 0; i < 120 * 5; i++) {
  const t = i / 120;
  run(`input.steer=${t < 1 ? 0 : t < 1.4 ? 0.6 : 0}; input.hand=${t >= 1 && t < 1.4 ? 1 : 0}; input.gas=1; input.brakeSm=0; input.gasSm=0.9;`);
  run("simStep(HSTEP)");
  maxA = Math.max(maxA, Math.abs(run("G.player.alphaR"))); maxPsi = Math.max(maxPsi, Math.abs(run("G.player.psi")));
  if (!isFinite(run("G.player.vx"))) { ok(false, "NaN в физике"); break; }
}
ok(maxA > (car === "f1" ? 0.15 : 0.25), "ручник и руль вводят в занос: макс. угол увода " + maxA.toFixed(2) + " рад");
ok(maxPsi < 2.2, "авто-контруль не даёт уйти в вертушку: макс. угол к дороге " + maxPsi.toFixed(2) + " рад");
// 2) очки: имитируем устойчивый занос 4 с, потом выход
run(`startRace(); G.state="race"; const P=G.player; P.vx=20; P.wall=0; P.onGrass=false; P.psi=0.3; P.alphaR=-0.4;`);
for (let i = 0; i < 120 * 4.2; i++) run("driftStep(G.player, HSTEP)");
const mid = run("({cur:G.dr.cur, mult:G.dr.mult, active:G.dr.active})");
ok(mid.active && mid.cur > 300 && mid.mult >= 3, "очки растут, множитель увеличивается: " + Math.round(mid.cur) + " x" + mid.mult);
run("G.player.alphaR=0.0"); for (let i = 0; i < 120 * 1.5; i++) run("driftStep(G.player, HSTEP)");
const dr = run("G.dr");
ok(!dr.active && dr.total > 300 && run("G.driftBest") >= dr.total - 1, "серия засчитана после паузы: всего " + Math.round(dr.total));
run("G.player.alphaR=-0.4; for (let i=0;i<240;i++) driftStep(G.player, HSTEP); G.player.wall=0.5; driftStep(G.player, HSTEP);");
ok(run("G.dr.cur") === 0 && run("G.dr.crash") > 0, "удар об стену обнуляет серию");
// без ручника на той же скорости занос не должен начинаться от лёгкого руля
run(`startRace(); G.state="race"; G.t=0; G.player.s=100; G.player.vx=22; G.player.gear=3;`);
let a2 = 0;
for (let i = 0; i < 120 * 4; i++) { run("input.steer=0.2; input.hand=0; input.gas=0.5; input.brakeSm=0; input.gasSm=0.5; simStep(HSTEP)"); a2 = Math.max(a2, Math.abs(run("G.player.alphaR"))); }
ok(a2 < 0.17, "лёгкий руль без ручника не даёт дрифт-очков: " + a2.toFixed(2));
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЕ ПРОВЕРКИ ПРОШЛИ");
