"use strict";
/* Интерфейс: загрузка, вход, лобби, гараж, профиль, настройки, выбор режима, онлайн-комнаты, друзья и чат.
   Запускается последним: использует G, CARS, TRACKS, NET и 3D-фон lobby3d.js. */
const UI = { cur: "loader", sel: "gtr", chatWith: null, authTab: "in", joinErr: "" };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SCREENS = ["auth", "lobby", "garage", "profile", "settings", "play", "setup", "join", "room"];
const coinStr = n => Math.round(n).toLocaleString("ru-RU");
const back = (to, title) => `<div class="head"><button class="back" data-act="go" data-to="${to}">←</button><h2>${title}</h2><div class="grow"></div><div class="pill"><span class="coin">●</span>${coinStr(NET.profile.coins)}</div></div>`;

function toast(msg, ms) {
  const t = $("toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = "none", ms || 2600);
}
function optRow(items, key, cur, scope) {
  return '<div class="row">' + items.map(it => `<button class="opt${cur === it.v ? " on" : ""}" data-act="opt" data-scope="${scope || "g"}" data-k="${key}" data-v='${JSON.stringify(it.v)}'>${it.l}</button>`).join("") + "</div>";
}
const ownedIds = () => Object.keys(NET.profile.garage || { gtr: {} });
const owns = id => !!(NET.profile.garage && NET.profile.garage[id]);

function syncCar() {
  let id = NET.profile.selected_car;
  if (!owns(id)) id = ownedIds()[0] || "gtr";
  G.carId = id;
}

/* ---------- Показ экранов ---------- */
UI.show = function (name) {
  UI.cur = name;
  for (const s of ["loader"].concat(SCREENS)) $(s).classList.toggle("on", s === name);
  $("ui").classList.remove("off");
  $("bg3d").style.display = name === "auth" || name === "loader" ? "none" : "block";
  if (name !== "loader" && name !== "auth") { l3Start(); UI.syncBg(); }
  UI.render();
};
UI.hide = function () { $("ui").classList.add("off"); $("bg3d").style.display = "none"; l3Stop(); UI.closeFriends(); };
UI.syncBg = function () {
  L3.shift = UI.cur === "garage" ? 0.2 : 0;
  const id = UI.cur === "garage" ? UI.sel : G.carId, D = upgradedDef(id, (NET.profile.garage || {})[id]);
  l3SetCar(D, CARS[id].color);
};
UI.refresh = function () { if ($("ui").classList.contains("off")) return; UI.render(); UI.renderFriends(); };
UI.afterRace = function () {
  UI.show(G.online && NET.room ? "room" : "lobby");
  if (G.online && NET.room) NET.trackMe();
  if (!G.online) syncCar();
};

UI.render = function () {
  syncCar();
  const f = { auth: rAuth, lobby: rLobby, garage: rGarage, profile: rProfile, settings: rSettings, play: rPlay, setup: rSetup, join: rJoin, room: rRoom }[UI.cur];
  if (f) f();
};

/* ---------- Вход ---------- */
function rAuth() {
  const up = UI.authTab === "up";
  $("auth").innerHTML = `<div class="speed">${Array.from({ length: 8 }, (_, i) => `<i style="top:${8 + i * 12}%;animation-delay:${i * 0.17}s"></i>`).join("")}</div>
  <div style="flex:1;display:flex;overflow:auto;pointer-events:auto;touch-action:pan-y;padding:10px"><div class="card" style="width:min(92vw,380px);display:flex;flex-direction:column;gap:8px;margin:auto">
    <h1 style="font-size:22px;text-align:center">PROMA<span>RACER</span></h1>
    ${NET.ready ? `<div class="tabs"><button class="${up ? "" : "on"}" data-act="authtab" data-v="in">Войти</button><button class="${up ? "on" : ""}" data-act="authtab" data-v="up">Создать аккаунт</button></div>
    ${up ? '<input id="aName" type="text" placeholder="Ник (латиница, цифры)" autocomplete="username" autocapitalize="off" maxlength="16">' : ""}
    <input id="aMail" type="email" placeholder="E-mail" autocomplete="email" autocapitalize="off" style="width:100%;background:#12141a;border:1px solid #333;border-radius:10px;color:#fff;padding:11px 12px;font-size:16px;outline:none">
    <input id="aPass" type="password" placeholder="Пароль" autocomplete="${up ? "new-password" : "current-password"}">
    ${up ? '<input id="aPass2" type="password" placeholder="Повтори пароль" autocomplete="new-password">' : ""}
    <div class="err" id="aErr"></div>
    <button class="btn" data-act="doauth">${up ? "Создать аккаунт" : "Войти"}</button>` :
    `<div class="small">Онлайн пока недоступен: в js/config.js не вписан ключ Supabase. Можно играть офлайн.</div>`}
    <button class="btn alt sm" data-act="guest">Играть как гость (без онлайна)</button>
  </div></div>`;
}

/* ---------- Лобби ---------- */
function rLobby() {
  const p = NET.profile, D = CARS[G.carId], up = (p.garage || {})[G.carId] || {};
  const hp = Math.round(upgradedDef(G.carId, up).hp);
  const n = NET.incoming.length + Object.values(NET.unread).reduce((a, b) => a + b, 0);
  $("lobby").innerHTML = `
    <div class="top"><div class="avatar">${esc((p.username || "?")[0].toUpperCase())}</div>
      <div class="who"><b>${esc(p.username)}</b><span class="small">${NET.guest ? "гость · только офлайн" : "гонок " + p.races + " · побед " + p.wins}</span></div>
      <div class="grow"></div><div class="pill"><span class="coin">●</span>${coinStr(p.coins)}</div></div>
    <div class="mid"><div id="carTag"><div>${esc(D.name)} · ${hp} л.с.</div></div></div>
    <div class="dock">
      <button class="btn big" data-act="go" data-to="play">Играть</button>
      <div class="grow"></div>
      <button class="tile" data-act="go" data-to="garage"><span class="ic">🏎</span>Гараж</button>
      <button class="tile" data-act="go" data-to="profile"><span class="ic">👤</span>Профиль</button>
      <button class="tile" data-act="friends"><span class="ic">👥</span>Друзья${n ? `<span class="badge">${n}</span>` : ""}</button>
      <button class="tile" data-act="go" data-to="settings"><span class="ic">⚙️</span>Настройки</button>
    </div><div class="checker"></div>`;
}

/* ---------- Гараж ---------- */
function bars(D) {
  const best = CARS.f1, vm = d => Math.cbrt(d.hp / d.CdA), acc = d => d.hp / d.mass, hand = d => d.mu + d.ClA * 0.4, br = d => d.brakeMax / d.mass;
  const row = (n, v, max) => `<div class="stat"><span>${n}</span><i><u style="width:${Math.min(100, Math.round(v / max * 100))}%"></u></i></div>`;
  return row("Скорость", vm(D), vm(best) * 1.15) + row("Разгон", acc(D), acc(best) * 1.15) + row("Управление", hand(D), hand(best) * 1.15) + row("Торможение", br(D), br(best) * 1.15);
}
function rGarage() {
  const p = NET.profile, id = UI.sel, own = owns(id), up = (p.garage || {})[id] || { e: 0, t: 0, a: 0 }, D = upgradedDef(id, up);
  const cards = CAR_ORDER.map(cid => {
    const o = owns(cid);
    return `<button class="gcar${cid === id ? " sel" : ""}" data-act="pick" data-id="${cid}"><span class="lock">${o ? (p.selected_car === cid ? "✅" : "") : "🔒"}</span>
      <b>${esc(CARS[cid].name.replace(/ \(.*/, ""))}</b><span class="st">${CARS[cid].hp} л.с.</span><br><span class="st">${o ? "в гараже" : coinStr(CAR_PRICE[cid]) + " ●"}</span></button>`;
  }).join("");
  const upg = own ? Object.keys(UPG).map(k => {
    const lvl = up[k] || 0, max = lvl >= UPG_MAX, cost = upgCost(id, lvl);
    return `<div class="upg"><div style="width:130px"><b>${UPG[k].name}</b><div class="small">${UPG[k].hint} ${Math.round(UPG[k].step * 100)}%/ур.</div></div>
      <div class="pips">${Array.from({ length: UPG_MAX }, (_, i) => `<u class="${i < lvl ? "f" : ""}"></u>`).join("")}</div><div class="grow"></div>
      <button class="btn sm" data-act="upg" data-k="${k}" ${max || p.coins < cost ? "disabled" : ""}>${max ? "МАКС" : coinStr(cost) + " ●"}</button></div>`;
  }).join("") : "";
  $("garage").innerHTML = back("lobby", "Гараж") + `<div class="list">${cards}</div>
    <div class="body"><div class="card" style="width:min(56vw,480px)">
      <div class="row"><b style="font-size:20px;font-style:italic;text-transform:uppercase">${esc(CARS[id].name)}</b><div class="grow"></div>
        ${own ? (p.selected_car === id ? '<span class="tag">выбрана</span>' : `<button class="btn sm" data-act="selcar" data-id="${id}">Выбрать</button>`) :
        `<button class="btn sm" data-act="buy" data-id="${id}" ${p.coins < CAR_PRICE[id] ? "disabled" : ""}>Купить · ${coinStr(CAR_PRICE[id])} ●</button>`}</div>
      <div class="small" style="margin:4px 0 8px">${Math.round(D.hp)} л.с. · ${D.mass} кг · ${D.ratios.length} передач · ${D.abs ? "ABS" : "без ABS"}</div>
      ${bars(D)}${upg ? "<h3>Апгрейд</h3>" + upg : '<div class="small" style="margin-top:8px">Купи машину, чтобы её улучшать.</div>'}
    </div></div><div class="checker"></div>`;
}

/* ---------- Профиль ---------- */
function rProfile() {
  const p = NET.profile, rows = Object.keys(G.bests || {}).map(k => {
    const [cid, tid] = k.split("|"), tr = TRACKS.find(t => t.id === tid);
    return CARS[cid] && tr ? `<div class="li"><b>${esc(CARS[cid].name.replace(/ \(.*/, ""))}</b><span class="small">${esc(tr.name.replace(/ \(.*/, ""))}</span><div class="grow"></div><b>${fmt(G.bests[k])}</b></div>` : "";
  }).join("");
  $("profile").innerHTML = back("lobby", "Профиль") + `<div class="body"><div class="card" style="max-width:520px">
    <div class="row"><div class="avatar">${esc((p.username || "?")[0].toUpperCase())}</div><div><b style="font-size:20px">${esc(p.username)}</b><div class="small">${NET.guest ? "Гостевой профиль хранится на этом устройстве" : "Аккаунт онлайн"}</div></div></div>
    <h3>Статистика</h3>
    <div class="row"><div class="pill">Гонок: <b>${p.races}</b></div><div class="pill">Побед: <b>${p.wins}</b></div><div class="pill"><span class="coin">●</span><b>${coinStr(p.coins)}</b></div><div class="pill">Машин: <b>${ownedIds().length}</b></div><div class="pill">Рекорд дрифта: <b>${Math.round(G.driftBest || 0)}</b></div></div>
    <h3>Промокод</h3><div class="row"><input id="promo" placeholder="Введи код" autocomplete="off" autocapitalize="off" style="flex:1;min-width:0;padding:10px;border-radius:8px;border:1px solid #444;background:#1a1d24;color:#fff"><button class="btn sm" data-act="promo">Применить</button></div>
    <h3>Лучшие круги</h3>${rows || '<div class="small">Пока нет заездов.</div>'}
    <div style="margin-top:14px">${NET.guest ? '<button class="btn" data-act="login">Войти / создать аккаунт</button>' : '<button class="btn alt" data-act="logout">Выйти из аккаунта</button>'}</div>
  </div></div><div class="checker"></div>`;
}

/* ---------- Настройки ---------- */
function rSettings() {
  $("settings").innerHTML = back("lobby", "Настройки") + `<div class="body"><div class="card" style="max-width:640px">
    <h3 style="margin-top:0">Экран</h3>${optRow([{ l: "Телефон, касанием", v: "touch" }, { l: "VR очки", v: "vr" }, { l: "Один экран", v: "mono" }], "screen", G.screen)}
    <h3>Коробка</h3>${optRow([{ l: "Авто", v: true }, { l: "Ручная", v: false }], "auto", G.auto)}
    <h3>Руль на телефоне</h3>${optRow([{ l: "Руль на экране", v: "wheel" }, { l: "Наклон телефона", v: "tilt" }, { l: "Кнопки ◀ ▶", v: "btn" }], "touchSteer", G.touchSteer)}
    ${optRow([{ l: "Наклон обычный", v: false }, { l: "Инверсия руля", v: true }], "tiltInv", G.tiltInv)}
    <h3>Графика</h3>${optRow([{ l: "🎬 Кино-эффекты", v: "cine" }, { l: "Простая (быстрее)", v: "off" }], "fx", G.fx)}
    ${optRow([{ l: "🪞 Зеркала: ВКЛ", v: true }, { l: "Зеркала: ВЫКЛ (быстрее)", v: false }], "mirrors", G.mirrors)}
    <h3>Погода (офлайн)</h3>${optRow([{ l: "☀ Ясно", v: "clear" }, { l: "🌧 Дождь", v: "rain" }], "weather", G.weather)}
    <h3>Помощь</h3>${optRow([{ l: "Помощники: ВКЛ", v: true }, { l: "Помощники: ВЫКЛ", v: false }], "assist", G.assist)}
    ${optRow([{ l: "Обзор гироскопом: ВКЛ", v: true }, { l: "Обзор гироскопом: ВЫКЛ", v: false }], "gyroLook", G.gyroLook)}
    <h3>Cardputer</h3><div id="mon"></div>
    <div class="small" style="margin-top:6px">Сначала подключи «PromaRacer Wheel» в Bluetooth телефона.</div>
    <h3>Клавиатура</h3>
    <div class="small">W газ · S тормоз · A / D руль · E / Q передачи · N авто/ручная · R на трассу · V вид · Пробел помощники · Shift ручник · Esc пауза · Enter выход после финиша.<br>Cardputer: 9 газ · o тормоз · 0 / p передачи · руль наклоном.</div>
  </div></div><div class="checker"></div>`;
  updateMon();
}
function updateMon() {
  const m = $("mon"); if (!m) return;
  m.innerHTML = (input.steerSeen ? "руль " + input.steerTarget.toFixed(2) : "руль: нет сигнала") + "<br>Последняя клавиша: " + esc(input.lastKey) + "<br>Газ " + input.gas + " · Тормоз " + input.brake;
}
setInterval(() => { if (UI.cur === "settings" && !$("ui").classList.contains("off")) updateMon(); }, 150);

/* ---------- Играть: Online / Offline ---------- */
function rPlay() {
  const ok = NET.ready && !NET.guest;
  $("play").innerHTML = back("lobby", "Играть") + `<div class="body" style="display:flex;align-items:center;justify-content:center"><div class="row c" style="gap:18px">
    <button class="card" data-act="${ok ? "createRoom" : "needLogin"}" style="width:min(42vw,250px);text-align:center;padding:22px 10px;${ok ? "" : "opacity:.55"}"><div style="font-size:38px">🌐</div><b style="font-size:20px;font-style:italic">ONLINE</b><div class="small">Создать комнату</div></button>
    <button class="card" data-act="${ok ? "go" : "needLogin"}" data-to="join" style="width:min(42vw,250px);text-align:center;padding:22px 10px;${ok ? "" : "opacity:.55"}"><div style="font-size:38px">🔑</div><b style="font-size:20px;font-style:italic">ВОЙТИ</b><div class="small">В комнату по коду</div></button>
    <button class="card" data-act="go" data-to="setup" style="width:min(42vw,250px);text-align:center;padding:22px 10px"><div style="font-size:38px">🏁</div><b style="font-size:20px;font-style:italic">OFFLINE</b><div class="small">Против ИИ или на время</div></button>
  </div>${ok ? "" : '<div class="small" style="text-align:center;margin-top:14px;width:100%">Онлайн требует аккаунт: Профиль → Войти.</div>'}</div><div class="checker"></div>`;
}

/* ---------- Выбор режима (офлайн) ---------- */
function setupFields(cfg, scope, edit, noFree) {
  const row = (title, items, key) => `<h3>${title}</h3>` + (edit ? optRow(items, key, cfg[key], scope) : `<div class="small" style="color:#fff">${items.find(i => i.v === cfg[key]) ? items.find(i => i.v === cfg[key]).l : ""}</div>`);
  const modes = [{ l: "🏁 Гонка", v: "race" }, { l: "⏱ На время (без столкновений)", v: "time" }];
  if (!noFree) modes.push({ l: "🌆 Свободная езда (город, дрифт)", v: "free" }, { l: "🏙 Открытый город (без трассы)", v: "open" });
  if (cfg.mode === "free" || cfg.mode === "open") return row("Режим", modes, "mode");
  return row("Режим", modes, "mode") +
    row("Трасса", TRACKS.map((t, i) => ({ l: t.name, v: i })), "trackIdx") +
    row("Круги", [1, 3, 5, 10].map(n => ({ l: n + " кр.", v: n })), "laps");
}
function rSetup() {
  $("setup").innerHTML = back("play", "Выбор режима") + `<div class="body"><div class="card" style="max-width:640px">
    ${setupFields(G, "g", true)}
    ${G.mode === "open" ? `<h3>Открытый город</h3><div class="small" style="color:#fff">Город 1,1 км без трассы: улицы, кварталы, большая площадь в центре и здания, в которые можно врезаться. Задний ход (тормоз у остановки), ручник (Shift / кнопка РУЧНИК), дым и следы шин. Очки за дрифт: угол × скорость, серия до ×6.</div>` : ""}
    ${G.mode === "free" ? `<h3>Город Proma Streets</h3><div class="small" style="color:#fff">Без кругов, соперников и столкновений. Дорога шире, катайся где хочешь и дрифти: очки идут за боковое скольжение, серия растёт до ×5, удар об стену обнуляет её.</div>
      <h3>Дрифт-настройка</h3>${optRow([{ l: "Вкл: задний привод, мягче зад", v: true }, { l: "Выкл: машина как есть", v: false }], "driftTune", G.driftTune)}
      <div class="small" style="margin-top:6px">Газ + руль, ручник (Shift или кнопка РУЧНИК) для заноса. Помощники в этом режиме выключены. Рекорд серии: <b style="color:#ffcc00">${Math.round(G.driftBest || 0)}</b></div>` : ""}
    ${G.mode === "race" ? "<h3>Соперники (ИИ)</h3>" + optRow([0, 3, 5, 7].map(n => ({ l: n === 0 ? "Один" : n + " соп.", v: n })), "opp", G.opp) : ""}
    <div style="margin-top:16px;display:flex;gap:10px;align-items:center"><button class="btn big" style="font-size:24px;padding:12px 40px" data-act="startOffline">Старт</button><span class="small">${esc(CARS[G.carId].name)}</span></div>
  </div></div><div class="checker"></div>`;
}

/* ---------- Онлайн: вход по коду и комната ---------- */
function rJoin() {
  $("join").innerHTML = back("play", "Вход в комнату") + `<div class="body" style="display:flex;align-items:center;justify-content:center"><div class="card" style="width:min(92vw,340px);display:flex;flex-direction:column;gap:10px">
    <input id="jCode" type="text" placeholder="Код комнаты" maxlength="5" autocapitalize="characters" style="text-align:center;font-size:28px;letter-spacing:6px;text-transform:uppercase">
    <div class="err" id="jErr">${esc(UI.joinErr)}</div><button class="btn" data-act="joinRoom">Войти</button></div></div>`;
}
function roomCfg() { return NET.room.cfg; }
function rRoom() {
  const R = NET.room; if (!R) { UI.show("play"); return; }
  const c = R.cfg || {}, mem = Object.keys(R.members).sort(), host = R.host;
  const list = mem.map(id => { const m = R.members[id]; return `<div class="li"><span class="dot on"></span><b>${esc(m.name)}</b>${m.host ? '<span class="tag">хост</span>' : ""}<div class="grow"></div><span class="small">${esc(CARS[m.car] ? CARS[m.car].name.replace(/ \(.*/, "") : "")}</span></div>`; }).join("");
  const edit = host;
  $("room").innerHTML = `<div class="head"><button class="back" data-act="leaveRoom">←</button><h2>Комната</h2><div class="grow"></div><div class="code" style="font-size:30px;letter-spacing:5px">${esc(R.code)}</div></div>
    <div class="body"><div class="row" style="align-items:flex-start">
      <div class="card" style="flex:1;min-width:250px"><h3 style="margin-top:0">Игроки ${mem.length}/8</h3>${list}</div>
      <div class="card" style="flex:1;min-width:250px">
        ${c.mode ? `${setupFields({ mode: c.mode, trackIdx: c.track, laps: c.laps }, "room", edit, true).replace(/data-k="trackIdx"/g, 'data-k="track"')}
        <h3>Машины</h3>${edit ? optRow([{ l: "Свои", v: "" }, { l: "Все GT3", v: "gt3" }, { l: "Все F3", v: "f3" }], "lock", c.lock || "", "room") : `<div class="small" style="color:#fff">${c.lock ? "Все " + esc(CARS[c.lock].name) : "Свои"}</div>`}` : '<div class="small">Ждём настройки хоста…</div>'}
        <div style="margin-top:14px">${host ? `<button class="btn big" style="font-size:24px;padding:12px 40px" data-act="hostStart" ${mem.length < 2 ? "disabled" : ""}>Старт</button>${mem.length < 2 ? '<div class="small" style="margin-top:6px">Нужен хотя бы ещё один игрок. Отправь ему код.</div>' : ""}` : '<div class="small">Хост запустит гонку.</div>'}</div>
      </div></div></div><div class="checker"></div>`;
}

/* ---------- Друзья и чат ---------- */
UI.openFriends = function () { if (NET.guest) { toast("Войди в аккаунт, чтобы добавлять друзей"); return; } UI.chatWith = null; $("friends").classList.add("on"); NET.loadFriends().then(() => UI.renderFriends()); UI.renderFriends(); };
UI.closeFriends = function () { $("friends").classList.remove("on"); UI.chatWith = null; };
UI.renderFriends = function () {
  const el = $("friends"); if (!el.classList.contains("on")) return;
  if (UI.chatWith) return;                           // не трогаем открытый чат
  const f = NET.friends.map(x => { const on = NET.isOnline(x.id), u = NET.unread[x.id] || 0;
    return `<button class="li" style="width:100%;background:none;border:0;border-bottom:1px solid var(--line);text-align:left" data-act="chat" data-id="${x.id}"><span class="dot${on ? " on" : ""}"></span><b>${esc(x.username)}</b><div class="grow"></div><span class="small">${on ? "онлайн" : "офлайн"}</span>${u ? `<span class="badge" style="position:static">${u}</span>` : ""}</button>`; }).join("");
  const inc = NET.incoming.map(x => `<div class="li"><b>${esc(x.username)}</b><span class="small">хочет дружить</span><div class="grow"></div><button class="btn sm" data-act="accept" data-id="${x.fid}">Принять</button><button class="btn sm alt" data-act="decline" data-id="${x.fid}">✕</button></div>`).join("");
  const out = NET.outgoing.map(x => `<div class="li"><b>${esc(x.username)}</b><span class="small">заявка отправлена</span><div class="grow"></div><button class="btn sm alt" data-act="decline" data-id="${x.fid}">✕</button></div>`).join("");
  el.innerHTML = `<div class="head"><h2 style="font-size:20px">Друзья</h2><div class="grow"></div><button class="back" data-act="closeFriends">✕</button></div>
    <div class="row" style="padding:0 14px 8px;flex-wrap:nowrap"><input id="fName" type="text" placeholder="Ник друга" autocapitalize="off" maxlength="16"><button class="btn sm" data-act="addFriend">+</button></div>
    <div class="err" id="fErr" style="padding:0 14px"></div>
    <div class="body" style="padding:0">${inc ? "<h3 style='padding:0 14px'>Заявки</h3>" + inc : ""}${f || '<div class="small" style="padding:14px">Пока никого. Добавь друга по нику.</div>'}${out ? "<h3 style='padding:0 14px'>Исходящие</h3>" + out : ""}</div>`;
};
function chatLine(m) { return `<div class="msg${m.from_id === NET.user.id ? " me" : ""}">${esc(m.body)}</div>`; }
async function openChat(id) {
  const fr = NET.friends.find(x => x.id === id); if (!fr) return;
  UI.chatWith = id; NET.unread[id] = 0;
  $("friends").innerHTML = `<div class="head"><button class="back" data-act="friends">←</button><span class="dot${NET.isOnline(id) ? " on" : ""}" style="margin:0"></span><h2 style="font-size:18px">${esc(fr.username)}</h2><div class="grow"></div><button class="back" data-act="closeFriends">✕</button></div>
    <div id="chat"></div><div class="row" style="padding:10px;flex-wrap:nowrap"><input id="cIn" type="text" placeholder="Сообщение…" maxlength="500"><button class="btn sm" data-act="sendMsg">➤</button></div>`;
  const hist = await NET.history(id), box = $("chat");
  box.innerHTML = hist.map(chatLine).join(""); box.scrollTop = box.scrollHeight;
  NET.onChange();
}
NET.onChat = m => {
  if (UI.chatWith === m.from_id && $("chat")) { $("chat").insertAdjacentHTML("beforeend", chatLine(m)); $("chat").scrollTop = $("chat").scrollHeight; return true; }
  const fr = NET.friends.find(x => x.id === m.from_id); if (fr) toast("💬 " + fr.username + ": " + m.body.slice(0, 40));
  return false;
};
let _cd = null;
NET.onChange = () => { clearTimeout(_cd); _cd = setTimeout(() => { if (UI.cur === "lobby" || UI.cur === "profile" || UI.cur === "play") UI.render(); UI.renderFriends(); }, 120); };

/* ---------- Действия ---------- */
function roomHooks() {
  return {
    onMembers: R => {
      if (R.host && R.cfg) NET.roomSend("cfg", R.cfg);          // новичкам: актуальные настройки
      if (!R.host && !R.hostId && UI.cur === "room" && !G.player) { toast("Хост вышел из комнаты"); UI.leaveRoom(); return; }
      if (UI.cur === "room") rRoom();
    },
    onCfg: () => { if (UI.cur === "room") rRoom(); },
    onStart: p => launchOnline(p),
    onState: m => onRemoteState(m),
    onEnd: () => { if (G.state === "finish") toMenu(); }
  };
}
UI.leaveRoom = function () { NET.leaveRoom(); G.online = false; G.roster = null; G.lockCar = null; UI.show("play"); };
function launchOnline(p) {
  if (!NET.room) return;
  G.online = true; G.mode = p.cfg.mode; G.trackIdx = p.cfg.track; G.laps = p.cfg.laps; G.opp = 0; G.lockCar = p.cfg.lock || null;
  syncCar();
  G.roster = p.roster.map((r, i) => ({ id: r.id, name: r.name, car: r.car, slot: i, me: r.id === NET.user.id }));
  if (!G.roster.some(r => r.me)) return;
  begin();
}
UI.hostStart = function () {
  const R = NET.room; if (!R || !R.host) return;
  const ids = Object.keys(R.members).sort();
  if (ids.length < 2) { toast("Нужен ещё хотя бы один игрок"); return; }
  const payload = { cfg: R.cfg, roster: ids.map(id => ({ id, name: R.members[id].name, car: R.members[id].car })) };
  NET.roomSend("start", payload);
  launchOnline(payload);
};

const ACT = {
  go: d => UI.show(d.to),
  back: () => UI.show("lobby"),
  friends: () => UI.openFriends(),
  closeFriends: () => UI.closeFriends(),
  authtab: d => { UI.authTab = d.v; rAuth(); },
  login: () => { UI.authTab = "in"; UI.show("auth"); },
  guest: () => { try { localStorage.setItem("promaracer.guestok", "1"); } catch (e) {} UI.show("lobby"); },
  needLogin: () => toast("Онлайн требует аккаунт: Профиль → Войти"),
  async doauth() {
    const mail = $("aMail").value.trim(), pass = $("aPass").value, err = $("aErr");
    err.style.color = ""; err.textContent = "Подключаемся…";
    const up = UI.authTab === "up";
    const e = up ? await NET.signUp($("aName").value.trim(), mail, pass, $("aPass2").value) : await NET.signIn(mail, pass);
    if (e && e[0] === "!") { UI.authTab = "in"; rAuth(); $("aErr").style.color = "#7dff9a"; $("aErr").textContent = e.slice(1); return; }
    if (e) { err.textContent = e; return; }
    syncCar(); UI.show("lobby");
  },
  async logout() { await NET.signOut(); try { localStorage.removeItem("promaracer.guestok"); } catch (e) {} syncCar(); UI.show("auth"); },
  opt: d => {
    const v = JSON.parse(d.v);
    if (d.scope === "room") {
      const R = NET.room; if (!R || !R.host) return;
      R.cfg[d.k] = v; NET.roomSend("cfg", R.cfg); rRoom(); return;
    }
    G[d.k] = v; saveSettings(); UI.render();
  },
  pick: d => { UI.sel = d.id; UI.syncBg(); rGarage(); },
  async selcar(d) { await NET.setSelected(d.id); syncCar(); UI.render(); },
  async buy(d) {
    const cost = CAR_PRICE[d.id], g = Object.assign({}, NET.profile.garage); g[d.id] = { e: 0, t: 0, a: 0 };
    const e = await NET.spend(cost, g); if (e) { toast(e); return; }
    await NET.setSelected(d.id); syncCar(); toast("Машина куплена!"); UI.render();
  },
  async promo() {
    const el = $("promo"), g = applyPromo(el && el.value, NET.profile.garage);
    if (!g) { toast("Неверный промокод"); return; }
    const e = await NET.spend(0, g); if (e) { toast(e); return; }
    syncCar(); UI.syncBg(); toast("Промокод активирован!"); UI.render();
  },
  async upg(d) {
    const id = UI.sel, g = JSON.parse(JSON.stringify(NET.profile.garage)), lvl = g[id][d.k] || 0;
    if (lvl >= UPG_MAX) return;
    g[id][d.k] = lvl + 1;
    const e = await NET.spend(upgCost(id, lvl), g); if (e) { toast(e); return; }
    UI.syncBg(); rGarage();
  },
  startOffline: () => {
    G.online = false; G.roster = null; G.lockCar = null; saveSettings(); syncCar();
    if (G.mode === "free") { G.tBack = G.trackIdx; G.trackIdx = Math.max(0, TRACKS.findIndex(t => t.id === "city")); }
    begin();
  },
  async createRoom() {
    const code = roomCode();
    const cfg = { mode: "race", track: G.trackIdx, laps: G.laps, lock: "" };
    toast("Создаём комнату…");
    const ok = await NET.openRoom(code, true, cfg, roomHooks());
    if (!ok) { toast("Не удалось создать комнату"); return; }
    UI.show("room");
  },
  async joinRoom() {
    const code = ($("jCode").value || "").toUpperCase().trim();
    if (code.length !== 5) { $("jErr").textContent = "Код из 5 символов"; return; }
    $("jErr").textContent = "Ищем комнату…";
    const ok = await NET.openRoom(code, false, null, roomHooks());
    if (!ok) { $("jErr").textContent = "Нет связи с сервером"; return; }
    await new Promise(r => setTimeout(r, 1800));                  // ждём, пока придёт список участников
    const R = NET.room;
    if (!R || !R.hostId) { NET.leaveRoom(); UI.joinErr = "Комната не найдена"; rJoin(); return; }
    if (Object.keys(R.members).length > 8) { NET.leaveRoom(); UI.joinErr = "Комната заполнена"; rJoin(); return; }
    UI.joinErr = ""; UI.show("room");
  },
  leaveRoom: () => UI.leaveRoom(),
  hostStart: () => UI.hostStart(),
  async addFriend() {
    const e = await NET.addFriend($("fName").value.trim());
    if ($("fErr")) $("fErr").textContent = e || ""; if (!e) { $("fName").value = ""; UI.renderFriends(); }
  },
  accept: d => NET.acceptFriend(+d.id),
  decline: d => NET.removeFriend(+d.id),
  chat: d => openChat(d.id),
  async sendMsg() {
    const inp = $("cIn"), m = await NET.send(UI.chatWith, inp.value);
    if (m && $("chat")) { inp.value = ""; $("chat").insertAdjacentHTML("beforeend", chatLine(m)); $("chat").scrollTop = $("chat").scrollHeight; }
  }
};
$("ui").addEventListener("click", e => {
  const a = e.target.closest("[data-act]"); if (!a || a.disabled) return;
  const f = ACT[a.dataset.act]; if (f) f(a.dataset);
});
$("ui").addEventListener("keydown", e => {
  e.stopPropagation();                               // в полях ввода клавиши не должны управлять машиной
  if (e.key !== "Enter") return;
  if (e.target.id === "cIn") ACT.sendMsg(); else if (e.target.id === "fName") ACT.addFriend();
  else if (e.target.id === "jCode") ACT.joinRoom(); else if (/^a(Pass2?|Mail|Name)$/.test(e.target.id)) ACT.doauth();
}, true);
$("ui").addEventListener("keyup", e => e.stopPropagation(), true);

/* ---------- Загрузка ---------- */
(async function boot() {
  const bar = $("loadBar"), tip = $("loadTip"), t0 = performance.now();
  const step = (p, t) => { bar.style.width = p + "%"; if (t) tip.textContent = t; };
  step(15, "ПОДНИМАЕМ МАШИНУ…");
  if (!window.THREE) return;
  try { l3Init($("bg3d")); } catch (e) { console.warn("3D фон не запустился", e); }
  step(40, "МЕНЯЕМ КОЛЁСА…");
  const net = NET.init();
  let logged = false;
  if (net) logged = await NET.restore();
  step(80, "ПРОВЕРЯЕМ ДАВЛЕНИЕ В ШИНАХ…");
  syncCar(); UI.sel = G.carId;
  const wait = 2200 - (performance.now() - t0); if (wait > 0) await new Promise(r => setTimeout(r, wait));
  step(100, "ПИТ-СТОП ГОТОВ!");
  await new Promise(r => setTimeout(r, 250));
  let guestOk = false; try { guestOk = localStorage.getItem("promaracer.guestok") === "1"; } catch (e) {}
  UI.show(logged || guestOk ? "lobby" : "auth");
  setInterval(() => NET.touch && NET.touch(), 120000);
})();
