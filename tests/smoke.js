// node tests/smoke.js [carId] [trackIdx] — прогон игры целиком с заглушкой Three.js и DOM.
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

const carId = process.argv[2] || "f1", trackIdx = +(process.argv[3] || 0);
const wx = process.argv[4] || "clear", hud = process.argv[5] === "hud";   // 4-й аргумент: rain; 5-й: hud (проверка экранной приборки)
vm.runInContext(`G.carId=${JSON.stringify(carId)}; G.trackIdx=${trackIdx}; G.laps=2; G.opp=5; G.vr=${!hud}; G.weather=${JSON.stringify(wx)}; G.touch=${hud}; startRace();`, ctx);
vm.runInContext(`G.player.isAI=true; G.player.ai=newAI(G.player.def,0.99,0); G.player.ai.base=0;`, ctx);   // автопилот вместо человека
let now = 0;
const step = ms => { now += ms; rafCb(now); };
// игрок: держит газ, руль ведёт простой регулятор по d и psi
const steerCtl = vm.runInContext(`(function(){ const P=G.player; input.steerSeen=true; input.steerTarget=Math.max(-1,Math.min(1,-0.06*P.d-1.0*P.psi+ (typeof kappaAt==='function'? kappaAt(P.s+10)*P.def.wb*8:0))); input.gas=1; input.brake=0; })`, ctx);
let finished = false;
for (let i = 0; i < 60 * 400 && !finished; i++) {
  steerCtl(); step(16.667);
  if (vm.runInContext("G.state", ctx) === "finish") finished = true;
}
console.log(vm.runInContext(`(function(){
  const P=G.player, o=[];
  o.push('state '+G.state+' t='+G.t.toFixed(1)+' car '+P.def.name+' track '+TRACKS[G.trackIdx].id);
  for (const c of G.cars.slice().sort((a,b)=>b.s-a.s)) o.push((c.name||'?').padEnd(12)+' s='+c.s.toFixed(0)+' lap '+(c.prevLap+1)+' finish '+(c.finishT==null?'-':c.finishT.toFixed(1))+' rec '+(c.recovered||0)+' v '+(c.vx*3.6).toFixed(0));
  o.push('player best '+(P.best==null?'-':P.best.toFixed(1)));
  return o.join('\\n'); })()`, ctx));
console.log(finished ? "OK: гонка дошла до финиша без исключений" : "ВНИМАНИЕ: игрок не финишировал за отведённое время");
// призрак лучшего круга: после первого круга траектория записана
console.log("ghost trace:", vm.runInContext("G.player.bestTr ? G.player.bestTr.length : 0", ctx), "точек (ожидается > 100)");
