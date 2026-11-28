// node tests/ui.js — проверка интерфейса и онлайн-логики без браузера: заглушки DOM, Three.js и Supabase.
// Прогоняет загрузку, все экраны лобби, гараж (покупка/апгрейд), офлайн-старт и онлайн-старт двух игроков.
const fs = require("fs"), vm = require("vm"), path = require("path");
const stub = new Proxy(function () {}, {
  get: (t, p) => p === Symbol.toPrimitive ? () => 0 : (p === "then" ? undefined : (p === "length" ? 0 : stub)),
  apply: () => stub, construct: () => stub, set: () => true
});
const store = {};
const els = {}, handlers = {};
const mkEl = id => {
  const cls = new Set();
  const el = { id, style: {}, innerHTML: "", textContent: "", value: "", dataset: {}, children: [],
    classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) },
    addEventListener: (ev, fn) => { (handlers[id + ":" + ev] = handlers[id + ":" + ev] || []).push(fn); },
    insertAdjacentHTML() {}, scrollTop: 0, scrollHeight: 0, getContext: () => stub, closest: () => null };
  return el;
};
const $el = id => els[id] || (els[id] = mkEl(id));
let rafCb = null;
const ctx = {
  console, Math, Float64Array, Float32Array, Date, Promise, setTimeout, clearTimeout, JSON, Object, Array, Set, String, Number, parseInt,
  THREE: stub, supabase: undefined, performance: { now: () => Date.now() }, screen: {}, navigator: { maxTouchPoints: 5 },
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] },
  document: { getElementById: $el, createElement: () => mkEl("x"), body: stub },
  addEventListener() {}, setInterval() {}, requestAnimationFrame: cb => { rafCb = cb; }, innerWidth: 800, innerHeight: 400, devicePixelRatio: 1
};
ctx.window = ctx; ctx.ontouchstart = null; vm.createContext(ctx);
for (const f of ["config", "cars", "track", "physics", "ai", "input", "audio", "render", "net", "lobby3d", "main", "ui"])
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", f + ".js"), "utf8"), ctx, { filename: f });
const run = c => vm.runInContext(c, ctx);
const click = (act, data) => { const a = Object.assign({ act }, data || {}); const t = { closest: () => ({ dataset: a, disabled: false }) }; for (const h of handlers["ui:click"]) h({ target: t }); };
const fail = m => { console.log("FAIL:", m); process.exitCode = 1; };
const ok = (c, m) => c ? console.log("ok  ", m) : fail(m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(2800);                                           // загрузка
  ok(run("UI.cur") === "auth", "после загрузки открыт экран входа (ключа нет)");
  click("guest"); ok(run("UI.cur") === "lobby", "гость попадает в лобби");
  for (const s of ["garage", "profile", "settings", "play", "setup"]) { click("go", { to: s }); ok(run("UI.cur") === s && els[s].innerHTML.length > 50, "экран " + s + " отрисован"); }
  click("go", { to: "garage" });
  click("pick", { id: "gt3" }); click("buy", { id: "gt3" }); await sleep(20);
  ok(!run("owns('gt3')") && run("NET.profile.coins") === 10000, "GT3 за 12000 не куплена при 10000 монет");
  run("NET.profile.coins=20000"); click("buy", { id: "gt3" }); await sleep(20);
  ok(run("owns('gt3')") && run("NET.profile.coins") === 8000, "GT3 куплена, монеты списаны");
  click("pick", { id: "gtr" }); const c0 = run("NET.profile.coins"); click("upg", { k: "e" }); await sleep(20);
  ok(run("NET.profile.garage.gtr.e") === 1 && run("NET.profile.coins") < c0, "апгрейд двигателя списал монеты");
  ok(run("upgradedDef('gtr',NET.profile.garage.gtr).hp") > run("CARS.gtr.hp"), "апгрейд повысил мощность");
  // офлайн-старт
  click("go", { to: "setup" }); click("opt", { scope: "g", k: "mode", v: '"race"' }); click("opt", { scope: "g", k: "opp", v: "3" });
  click("startOffline"); await sleep(50);
  ok(run("G.state") === "grid" && run("G.cars.length") === 4, "офлайн: гонка стартовала с 3 соперниками");
  run("toMenu()"); ok(run("UI.cur") === "lobby" && run("G.state") === "menu", "возврат в лобби после гонки");
  // режим «на время»
  click("go", { to: "setup" }); click("opt", { scope: "g", k: "mode", v: '"time"' }); click("startOffline"); await sleep(50);
  ok(run("G.cars.length") === 1, "режим на время: без соперников");
  run("toMenu()");
  // свободная езда: город, без соперников, трасса возвращается после выхода
  click("go", { to: "setup" }); click("opt", { scope: "g", k: "trackIdx", v: "1" }); click("opt", { scope: "g", k: "mode", v: '"free"' });
  ok(els.setup.innerHTML.indexOf("Дрифт-настройка") > 0, "в выборе режима есть дрифт-настройка");
  click("startOffline"); await sleep(50);
  ok(run("G.mode") === "free" && run("TRACKS[G.trackIdx].id") === "city" && run("G.cars.length") === 1 && run("ROAD_W") === 36, "свободная езда: город, один игрок, широкая дорога");
  run("toMenu()");
  ok(run("G.trackIdx") === 1 && run("ROAD_W") === 36, "после выхода выбранная трасса восстановлена");
  click("go", { to: "setup" }); click("opt", { scope: "g", k: "mode", v: '"race"' }); click("startOffline"); await sleep(50);
  ok(run("ROAD_W") === 12, "в обычной гонке дорога снова 12 м"); run("toMenu()");
  // онлайн: два игрока (имитация комнаты)
  ctx.__q = { update() { return ctx.__q; }, eq() { return ctx.__q; }, then(f) { f && f(); } };
  ctx.__sb = { from: () => ctx.__q, rpc: () => Promise.resolve({ data: null }) };
  run(`NET.sb=__sb; NET.guest=false; NET.user={id:"bbb"}; NET.profile.username="Ann"; NET.room={host:false,ch:{},cfg:null,members:{},code:"ABCDE",hostId:null};
       NET.roomSend=(e,p)=>{ (globalThis.__sent=globalThis.__sent||[]).push([e,p]); };`);
  const payload = { cfg: { mode: "race", track: 1, laps: 2, lock: "gt3" }, roster: [{ id: "aaa", name: "Bob", car: "f1" }, { id: "bbb", name: "Ann", car: "gtr" }] };
  run("launchOnline(" + JSON.stringify(payload) + ")"); await sleep(50);
  ok(run("G.online") && run("G.cars.length") === 2 && run("G.cars.filter(c=>c.remote).length") === 1, "онлайн: свой + удалённый игрок на решётке");
  ok(run("G.player.def.id") === "gt3" && run("G.cars.find(c=>c.remote).def.id") === "gt3", "онлайн: одинаковый класс машин по настройке хоста");
  ok(run("G.trackIdx") === 1 && run("G.laps") === 2, "онлайн: трасса и круги от хоста");
  // приём пакетов удалённого игрока и симуляция
  run(`onRemoteState({u:"aaa",s:50,d:1,psi:0,vx:40,dl:0,ax:0,ay:0,rpm:9000,fin:null}); G.state="race"; G.t=1; for(let i=0;i<240;i++) simStep(HSTEP);`);
  ok(run("G.cars.find(c=>c.remote).s") > 30, "удалённая машина подтягивается к пакету (s=" + run("G.cars.find(c=>c.remote).s").toFixed(1) + ")");
  run("G.t=0; G.player.s=0; sendNet(1); sendNet(1);");
  ok((run("globalThis.__sent")||[]).some(x => x[0] === "st" && x[1].u === "bbb"), "свои пакеты уходят в комнату");
  // финиш и результаты
  run(`const rc=G.cars.find(c=>c.remote); rc.tgt={s:99999,d:0,psi:0,vx:0,dl:0,ax:0,ay:0,rpm:5000,fin:70,at:performance.now()}; G.player.finishT=80; G.state="finish"; showResults();`);
  ok(run("G.coinsEarned") > 0, "награда за гонку начислена: " + run("G.coinsEarned"));
  ok(els.resList.innerHTML.indexOf("Bob") > 0, "таблица результатов содержит удалённого игрока");
  console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЕ ПРОВЕРКИ ПРОШЛИ");
  process.exit(process.exitCode || 0);
})().catch(e => { console.log("EXCEPTION", e); process.exit(1); });
