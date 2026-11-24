"use strict";
/* Сеть: аккаунты, профиль, друзья, чат и онлайн-комнаты через Supabase (Auth, Postgres, Realtime).
   Без ключа или без интернета всё работает офлайн: профиль гостя лежит в localStorage. */
const NET = {
  sb: null, ready: false, user: null, profile: null, guest: true,
  friends: [], incoming: [], outgoing: [], onlineIds: new Set(), unread: {},
  lobbyCh: null, msgCh: null, room: null, onChange: () => {}, onChat: null
};
const emailOf = name => name.toLowerCase() + "@promaracer.game";
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

/* ---------- Профиль гостя ---------- */
function guestProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem("promaracer.guest") || "null"); } catch (e) {}
  return p || { id: null, username: "Гость", coins: 10000, races: 0, wins: 0, garage: { gtr: { e: 0, t: 0, a: 0 } }, selected_car: "gtr", bests: {} };
}
function saveGuest() { try { localStorage.setItem("promaracer.guest", JSON.stringify(NET.profile)); } catch (e) {} }
NET.profile = guestProfile();

NET.init = function () {
  if (typeof supabase === "undefined" || !SUPABASE_ANON_KEY) return false;
  try {
    NET.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 30 } } });
    NET.ready = true;
  } catch (e) { NET.ready = false; }
  return NET.ready;
};

/* ---------- Аккаунт ---------- */
NET.restore = async function () {
  if (!NET.ready) return false;
  try {
    const { data } = await NET.sb.auth.getSession();
    if (data && data.session) { await NET.afterLogin(data.session.user); return true; }
  } catch (e) {}
  return false;
};
NET.signUp = async function (name, pass) {
  if (!NET.ready) return "Нет подключения к серверу";
  if (!NAME_RE.test(name)) return "Ник: 3–16 символов, латиница, цифры и _";
  if (pass.length < 6) return "Пароль минимум 6 символов";
  const { data, error } = await NET.sb.auth.signUp({ email: emailOf(name), password: pass, options: { data: { username: name } } });
  if (error) return /registered|exists/i.test(error.message) ? "Этот ник уже занят" : error.message;
  if (!data.session) return NET.signIn(name, pass);      // если сервер не создал сессию сразу
  await NET.afterLogin(data.user, name);
  return null;
};
NET.signIn = async function (name, pass) {
  if (!NET.ready) return "Нет подключения к серверу";
  const { data, error } = await NET.sb.auth.signInWithPassword({ email: emailOf(name), password: pass });
  if (error) return /confirm/i.test(error.message) ? "Сервер требует подтверждение почты: выключи «Confirm email» в Supabase" : "Неверный ник или пароль";
  await NET.afterLogin(data.user, name);
  return null;
};
NET.signOut = async function () {
  try { if (NET.lobbyCh) NET.sb.removeChannel(NET.lobbyCh); if (NET.msgCh) NET.sb.removeChannel(NET.msgCh); await NET.sb.auth.signOut(); } catch (e) {}
  NET.lobbyCh = NET.msgCh = null; NET.user = null; NET.guest = true; NET.profile = guestProfile();
  NET.friends = []; NET.incoming = []; NET.outgoing = []; NET.onlineIds = new Set(); NET.unread = {};
  NET.onChange();
};
NET.afterLogin = async function (user, name) {
  NET.user = user; NET.guest = false;
  const uname = name || (user.user_metadata && user.user_metadata.username) || (user.email || "").split("@")[0];
  let { data } = await NET.sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) {
    const ins = await NET.sb.from("profiles").insert({ id: user.id, username: uname }).select().single();
    data = ins.data;
  }
  if (data) NET.profile = data;
  NET.touch();
  await NET.loadFriends();
  NET.joinLobby();
  NET.listenMessages();
  NET.onChange();
};
NET.touch = function () { if (!NET.guest) NET.sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", NET.user.id).then(() => {}); };

/* ---------- Монеты, гараж, награды ---------- */
NET.setSelected = async function (id) {
  NET.profile.selected_car = id;
  if (NET.guest) saveGuest(); else await NET.sb.from("profiles").update({ selected_car: id }).eq("id", NET.user.id);
};
NET.spend = async function (cost, garage) {
  if (NET.profile.coins < cost) return "Не хватает монет";
  if (NET.guest) { NET.profile.coins -= cost; NET.profile.garage = garage; saveGuest(); return null; }
  const { data, error } = await NET.sb.rpc("spend_coins", { p_cost: cost, p_garage: garage });
  if (error) return "Не хватает монет";
  if (data) NET.profile = data;
  return null;
};
NET.award = async function (coins, won) {
  if (NET.guest) { const p = NET.profile; p.coins += coins; p.races++; if (won) p.wins++; saveGuest(); return; }
  const { data } = await NET.sb.rpc("award_race", { p_coins: coins, p_won: !!won });
  if (data) NET.profile = data;
};
NET.saveBests = function (bests) {
  NET.profile.bests = bests;
  if (NET.guest) saveGuest(); else NET.sb.from("profiles").update({ bests }).eq("id", NET.user.id).then(() => {});
};

/* ---------- Друзья ---------- */
NET.loadFriends = async function () {
  if (NET.guest) return;
  const me = NET.user.id;
  const { data: rows } = await NET.sb.from("friendships").select("*").or(`requester.eq.${me},addressee.eq.${me}`);
  const ids = new Set(); (rows || []).forEach(r => { ids.add(r.requester); ids.add(r.addressee); }); ids.delete(me);
  let profs = {};
  if (ids.size) {
    const { data } = await NET.sb.from("profiles").select("id,username,last_seen,selected_car").in("id", [...ids]);
    (data || []).forEach(p => profs[p.id] = p);
  }
  NET.friends = []; NET.incoming = []; NET.outgoing = [];
  for (const r of rows || []) {
    const other = profs[r.requester === me ? r.addressee : r.requester]; if (!other) continue;
    const item = Object.assign({ fid: r.id }, other);
    if (r.status === "accepted") NET.friends.push(item);
    else if (r.addressee === me) NET.incoming.push(item); else NET.outgoing.push(item);
  }
  NET.friends.sort((a, b) => NET.isOnline(b.id) - NET.isOnline(a.id) || a.username.localeCompare(b.username));
};
NET.isOnline = id => NET.onlineIds.has(id);
NET.addFriend = async function (name) {
  if (NET.guest) return "Войди в аккаунт";
  const { data: p } = await NET.sb.from("profiles").select("id,username").ilike("username", name).maybeSingle();
  if (!p) return "Игрок не найден";
  if (p.id === NET.user.id) return "Это ты";
  const { error } = await NET.sb.from("friendships").insert({ requester: NET.user.id, addressee: p.id });
  if (error) return "Заявка уже есть";
  await NET.loadFriends(); NET.onChange(); return null;
};
NET.acceptFriend = async function (fid) { await NET.sb.from("friendships").update({ status: "accepted" }).eq("id", fid); await NET.loadFriends(); NET.onChange(); };
NET.removeFriend = async function (fid) { await NET.sb.from("friendships").delete().eq("id", fid); await NET.loadFriends(); NET.onChange(); };

/* Кто онлайн: общий канал присутствия. */
NET.joinLobby = function () {
  if (NET.lobbyCh) NET.sb.removeChannel(NET.lobbyCh);
  const ch = NET.sb.channel("lobby", { config: { presence: { key: NET.user.id } } });
  ch.on("presence", { event: "sync" }, () => { NET.onlineIds = new Set(Object.keys(ch.presenceState())); NET.onChange(); });
  ch.subscribe(st => { if (st === "SUBSCRIBED") ch.track({ name: NET.profile.username, at: Date.now() }); });
  NET.lobbyCh = ch;
};

/* ---------- Чат ---------- */
NET.history = async function (fid) {
  const me = NET.user.id;
  const { data } = await NET.sb.from("messages").select("*")
    .or(`and(from_id.eq.${me},to_id.eq.${fid}),and(from_id.eq.${fid},to_id.eq.${me})`).order("created_at", { ascending: true }).limit(100);
  return data || [];
};
NET.send = async function (fid, body) {
  body = body.trim().slice(0, 500); if (!body) return null;
  const { data, error } = await NET.sb.from("messages").insert({ from_id: NET.user.id, to_id: fid, body }).select().single();
  return error ? null : data;
};
NET.listenMessages = function () {
  if (NET.msgCh) NET.sb.removeChannel(NET.msgCh);
  NET.msgCh = NET.sb.channel("msg-" + NET.user.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "to_id=eq." + NET.user.id }, p => {
      const m = p.new;
      if (NET.onChat && NET.onChat(m)) return;
      NET.unread[m.from_id] = (NET.unread[m.from_id] || 0) + 1; NET.onChange();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => { NET.loadFriends().then(() => NET.onChange()); })
    .subscribe();
};

/* ---------- Онлайн-комнаты ---------- */
/* Код комнаты из 5 символов. Все клиенты в одном канале room:КОД. Хост хранит настройки и жмёт «Старт». */
const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomCode = () => Array.from({ length: 5 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");

NET.openRoom = function (code, host, cfg, hooks) {
  NET.leaveRoom();
  const me = NET.user.id;
  const ch = NET.sb.channel("room:" + code, { config: { presence: { key: me }, broadcast: { self: false, ack: false } } });
  const R = NET.room = { code, host, cfg, ch, members: {}, hostId: host ? me : null, hooks };
  ch.on("presence", { event: "sync" }, () => {
    const st = ch.presenceState(); R.members = {};
    for (const k of Object.keys(st)) R.members[k] = st[k][st[k].length - 1];
    const h = Object.keys(R.members).find(k => R.members[k].host);
    R.hostId = h || null;
    hooks.onMembers && hooks.onMembers(R);
  });
  ch.on("broadcast", { event: "cfg" }, e => { R.cfg = e.payload; hooks.onCfg && hooks.onCfg(R.cfg); });
  ch.on("broadcast", { event: "start" }, e => hooks.onStart && hooks.onStart(e.payload));
  ch.on("broadcast", { event: "st" }, e => hooks.onState && hooks.onState(e.payload));
  ch.on("broadcast", { event: "end" }, () => hooks.onEnd && hooks.onEnd());
  return new Promise(res => {
    ch.subscribe(async st => {
      if (st !== "SUBSCRIBED") { if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") res(false); return; }
      await NET.trackMe();
      res(true);
    });
  });
};
NET.trackMe = function () {
  const R = NET.room; if (!R) return;
  const p = NET.profile;
  return R.ch.track({ name: p.username, car: p.selected_car, host: R.host, ready: !!R.ready, at: Date.now() });
};
NET.setReady = function (v) { if (NET.room) { NET.room.ready = v; NET.trackMe(); } };
NET.roomSend = function (event, payload) { if (NET.room) NET.room.ch.send({ type: "broadcast", event, payload }); };
NET.leaveRoom = function () {
  if (NET.room) { try { NET.sb.removeChannel(NET.room.ch); } catch (e) {} NET.room = null; }
};
