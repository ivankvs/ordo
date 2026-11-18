import "./style.css";
import { api } from "./api.js";

// Пошта вимкнена, поки не налаштовано SMTP. Увімкнути: VITE_EMAIL_ENABLED=true у .env
const EMAIL_ON = import.meta.env.VITE_EMAIL_ENABLED === "true";
const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const STANDALONE = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const PLAT = IOS ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "desktop";
const LOGIN_RE = /^[A-Za-z0-9._-]{3,30}$/;
const NAME_RE = /^[A-Za-zА-Яа-яІіЇїЄєҐґ-]{2,40}$/;
const PASS_CHARS = /^[\x21-\x7E]+$/;
function passwordError(pw) {
  if (!PASS_CHARS.test(pw)) return "Пароль: лише латиниця, цифри та символи, без пробілів і кирилиці";
  if (pw.length < 8) return "Пароль має містити мінімум 8 символів";
  if (!/[a-z]/.test(pw)) return "Додайте хоча б одну малу літеру";
  if (!/[A-Z]/.test(pw)) return "Додайте хоча б одну велику літеру";
  if (!/\d/.test(pw)) return "Додайте хоча б одну цифру";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Додайте хоча б один спецсимвол (наприклад, ! @ # $ %)";
  return null;
}
function helpSteps() {
  if (PLAT === "android") return ["Відкрийте сайт Ordo у браузері Chrome.", "Натисніть ⋮ (три крапки вгорі праворуч) → «Додати на головний екран» або «Установити застосунок».", "Відкрийте Ordo з іконки на головному екрані.", "Натисніть «🔔 Увімкнути push» і виберіть «Дозволити»."];
  if (PLAT === "ios") return ["Відкрийте сайт Ordo в Safari. У Chrome на iPhone push не працює.", "Натисніть «Поділитися» (квадрат зі стрілкою вгору) → «На початковий екран» → «Додати».", "Відкрийте Ordo з іконки на головному екрані, а не з Safari.", "Натисніть «🔔 Увімкнути push» і виберіть «Дозволити». Потрібен iOS 16.4 або новіший."];
  return ["Натисніть «🔔 Увімкнути push» у шапці сайту.", "У вікні браузера виберіть «Дозволити».", "Якщо випадково відхилили: натисніть значок замка ліворуч від адреси → «Сповіщення» → «Дозволити».", "За бажанням встановіть Ordo як застосунок: значок «Встановити» в адресному рядку (Chrome, Edge)."];
}
function helpBody() { return `<ol style="padding-left:20px;line-height:1.6">${helpSteps().map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`; }
function helpModal() { return `<div class="mod" data-a="close"><div class="mb" data-stop><div class="row"><h2>Як увімкнути push</h2><button class="sp" data-a="close">Закрити</button></div><p class="mu">Сповіщення приходять навіть коли сайт закритий, якщо ви дозволили push.</p>${helpBody()}</div></div>`; }
function onboardView() { return `<div class="mod"><div class="mb" data-stop><h2>Ласкаво просимо до Ordo</h2><p class="mu">Щоб одразу отримувати сповіщення про зміни в графіку, налаштуйте push. Це займе хвилину. Цю інструкцію завжди можна знайти в шапці, кнопка ❔.</p>${helpBody()}<div class="row" style="margin-top:14px">${import.meta.env.VITE_VAPID_PUBLIC_KEY && !(IOS && !STANDALONE) ? `<button data-a="push">🔔 Увімкнути push зараз</button>` : ""}<button class="pri sp" data-a="onb-ok">ОК</button></div></div></div>`; }

const DN = ["Понеділок", "Вівторок", "Середа", "Четвер", "П’ятниця"], DS = ["Пн", "Вт", "Ср", "Чт", "Пт"];
const PLURAL = ["понеділок", "вівторок", "середу", "четвер", "п’ятницю"];
const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const LBL = { office: "В офісі", remote: "Віддалено", vacation: "Відпустка", sick: "Лікарняний" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fT = (t) => new Date(t).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const toD = (s) => new Date(s + "T12:00:00");
const short = (s) => s.split("-").reverse().slice(0, 2).join(".");
function mon(off) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d; }
function wdays(off) { const m = mon(off); return [0, 1, 2, 3, 4].map((i) => { const d = new Date(m); d.setDate(m.getDate() + i); return { iso: iso(d), s: short(iso(d)) }; }); }
function eachWorkday(a, b, cb) { for (let d = toD(a); iso(d) <= b; d.setDate(d.getDate() + 1)) { const w = (d.getDay() + 6) % 7; if (w < 5) cb(iso(d), w); } }

// Відкрите запрошення /invite/:token — запам’ятовуємо, щоб приєднати після входу
const inv = location.pathname.match(/^\/invite\/([\w-]+)/);
if (inv) { sessionStorage.setItem("ordo_invite", inv[1]); history.replaceState(null, "", "/"); }

/* ---------- стан ---------- */
const EMPTY = () => ({ me: null, users: {}, teams: [], sched: {}, orders: {}, notifs: [], audit: [] });
let S = EMPTY();
let ui = { boot: true, wk: 0, team: null, modal: null, bell: false, toast: "", err: "", msg: "", mode: "login", recover: false, cal: null, awayUser: null, awayType: "vacation" };
let channel = null, started = false, reloadTimer = null;

const usr = (id) => S.users[id];
const isSuper = () => S.me?.role === "superadmin";
const curTeam = () => S.teams.find((t) => t.id === ui.team) || S.teams[0];
const active = (t) => [...(t.includeOwner ? [t.ownerId] : []), ...t.members].map(usr).filter(Boolean);
const key = (t, u, d) => t + "|" + u + "|" + d;
const stored = (t, u, d) => S.sched[key(t.id, u, d)]?.s || "office";
const isOrd = (t, d) => S.orders[t.id + "|" + d] !== undefined;
// Ефективний статус: відпустка/лікарняний сильніші за наказ про дистанційку
function eff(t, u, d) { const s = stored(t, u, d); if (s === "vacation" || s === "sick") return s; return isOrd(t, d) ? "order" : s; }
const pendOf = (t) => Object.entries(S.sched).filter(([k, v]) => v.p && k.startsWith(t.id + "|"));
const mapNotif = (n) => ({ id: n.id, to: n.user_id, ts: Date.parse(n.created_at), title: n.title, text: n.body, read: n.read });
const ERR = {
  mandatory_office_day: "У цей день обов’язковий офіс — віддалена робота заборонена",
  invite_not_found: "Посилання недійсне. Перевірте його у власника команди",
  user_not_found: "Користувача з таким email не знайдено. Попросіть його зареєструватися в Ordo",
  already_member: "Цей користувач уже в команді", not_owner: "Цю дію може виконати лише власник команди",
  forbidden: "Недостатньо прав для цієї дії", bad_range: "Оберіть діапазон дат (до 3 місяців)",
  cannot_target_self: "Не можна виконати цю дію щодо себе",
  "Invalid login credentials": "Невірний email або пароль", "User already registered": "Цей email уже зареєстровано. Увійдіть у акаунт",
  "Email not confirmed": "Підтвердьте email: натисніть «ОК» у листі, який ми надіслали", "User is banned": "Акаунт заблоковано адміністратором",
  "rate limit": "Забагато спроб. Зачекайте кілька хвилин і повторіть",
  profiles_login_key: "Такий логін уже зайнятий", "Password should": "Пароль не відповідає вимогам: мінімум 8 символів, великі й малі літери, цифра і спецсимвол",
  registration_closed: "Реєстрація наразі обмежена адміністратором", login_taken: "Такий логін уже зайнятий",
  bad_login: "Логін: 3–30 символів, латиниця, цифри, крапка або підкреслення", too_many_requests: "Забагато запитів. Спробуйте пізніше",
  last_superadmin: "Не можна видалити або понизити останнього адміністратора. Спершу призначте іншого адміна",
  bad_name: "Ім’я та прізвище: від 2 до 40 літер (кирилиця або латиниця), можна дефіс",
  "Database error deleting user": "Не вдалося видалити користувача. Можливо, це останній адміністратор",
  weak_password: "Пароль не відповідає вимогам: мінімум 8 символів, великі й малі літери, цифра і спецсимвол",
};
const errText = (e) => { const m = e?.message || String(e); const k = Object.keys(ERR).find((x) => m.includes(x)); return k ? ERR[k] : "Не вдалося виконати дію: " + m; };

/* ---------- завантаження ---------- */
async function loadRange(from, to) {
  const [rows, ords] = await Promise.all([api.schedules(from, to), api.orders(from, to)]);
  Object.keys(S.orders).forEach((k) => { const d = k.split("|")[1]; if (d >= from && d <= to) delete S.orders[k]; });
  ords.forEach((o) => { S.orders[o.team_id + "|" + o.work_date] = o.note || ""; });
  rows.forEach((r) => { S.sched[key(r.team_id, r.user_id, r.work_date)] = { s: r.status, p: r.pending_notify }; });
}
const loadWeek = () => { const ds = wdays(ui.wk); return loadRange(ds[0].iso, ds[4].iso); };
async function loadAll() {
  const d = await api.loadAll();
  S.users = Object.fromEntries(d.profiles.map((p) => [p.id, { id: p.id, name: p.full_name || p.login || p.email, login: p.login, email: p.email, role: p.global_role, blocked: p.is_blocked, onboarded: p.onboarded }]));
  S.me = S.users[S.me.id];
  S.teams = d.teams.map((t) => ({
    id: t.id, name: t.name, ownerId: t.owner_id, token: t.invite_token, includeOwner: t.include_owner,
    maxRemote: t.max_remote_days, minOffice: t.min_office_count, planDay: t.planning_day - 1,
    mandatory: t.mandatory_office_days.map((x) => x - 1), members: d.members.filter((m) => m.team_id === t.id).map((m) => m.user_id),
  }));
  S.notifs = d.notifs.map(mapNotif);
  if (isSuper()) {
    ui.wk = 0;
    S.regInfo = await api.regStatus(); S.regReq = await api.regRequests();
    S.audit = (await api.audit()).map((a) => ({ ts: Date.parse(a.created_at), a: a.actor_id, to: a.target_user_id, t: a.team_id, d: a.work_date, f: a.old_status, n: a.new_status, txt: a.details }));
  }
  await loadWeek();
}
function debLoad() { clearTimeout(reloadTimer); reloadTimer = setTimeout(async () => { try { await loadAll(); render(); } catch (e) { /* мережа */ } }, 300); }

async function start(uid) {
  if (started) return; started = true;
  S.me = { id: uid };
  try {
    const pendingInvite = sessionStorage.getItem("ordo_invite");
    if (pendingInvite) {
      sessionStorage.removeItem("ordo_invite");
      try { ui.team = await api.joinTeam(pendingInvite); toastMsg("Вас додано до команди"); } catch (e) { ui.err = errText(e); }
    }
    await loadAll();
    ui.onboard = !S.me.onboarded;
    channel = api.subscribe(uid, {
      schedules: (p) => {
        const r = p.new; if (!r || !r.team_id) return;
        S.sched[key(r.team_id, r.user_id, r.work_date)] = { s: r.status, p: r.pending_notify };
        if (isSuper()) debLoad(); else render();
      },
      notification: (p) => { S.notifs.unshift(mapNotif(p.new)); toastMsg("Нове сповіщення: " + p.new.title); },
      other: debLoad,
    });
  } catch (e) { ui.err = errText(e); }
  ui.boot = false; render();
}
function stop() { api.unsubscribe(channel); channel = null; started = false; S = EMPTY(); ui.team = null; ui.bell = false; ui.modal = null; ui.cal = null; }

/* ---------- валідація тижня ---------- */
function validate(t, wk) {
  const ds = wdays(wk), ms = active(t), n = ms.length, issues = [], rem = {};
  ms.forEach((m) => {
    rem[m.id] = ds.filter((d) => !isOrd(t, d.iso) && eff(t, m.id, d.iso) === "remote").length;   // дні наказу в ліміт не входять
    if (rem[m.id] > t.maxRemote) issues.push(m.name + " перевищив ліміт віддалених днів: " + rem[m.id] + " із " + t.maxRemote);
  });
  const days = ds.map((d, i) => {
    const ord = isOrd(t, d.iso), mand = t.mandatory.includes(i); let o = 0, r = 0, a = 0, bad = false;
    ms.forEach((m) => { const e = eff(t, m.id, d.iso); if (e === "office") o++; else if (e === "remote" || e === "order") r++; else a++; });
    if (!ord && mand && r > 0) { bad = true; issues.push(DN[i] + ": обов’язковий день в офісі для всієї команди (віддалено: " + r + ")"); }
    if (!ord && n > 0 && o < t.minOffice) {
      bad = true;
      issues.push("У " + PLURAL[i] + " в офісі " + (o === 1 ? "лише 1 людина" : "лише " + o + " людей") + " (мінімум " + t.minOffice + ")" + (a ? ", відсутні (відпустка/лікарняний): " + a : ""));
    }
    return { iso: d.iso, s: d.s, o, r, a, ord, bad, mand };
  });
  return { days, issues, rem, n };
}

/* ---------- дії ---------- */
function toastMsg(m) { ui.toast = m; render(); setTimeout(() => { ui.toast = ""; render(); }, 2800); }
async function toggle(uid, di) {
  const t = curTeam(), d = wdays(ui.wk)[di], owner = t.ownerId === S.me.id;
  if (!owner && uid !== S.me.id) return;
  const k = key(t.id, uid, d.iso), prev = S.sched[k], n = stored(t, uid, d.iso) === "office" ? "remote" : "office";
  if (t.mandatory.includes(di) && n === "remote" && !isOrd(t, d.iso)) return;
  S.sched[k] = { s: n, p: owner && uid !== S.me.id }; render();
  try { await api.setStatus(t.id, uid, d.iso, n); }
  catch (e) { if (prev) S.sched[k] = prev; else delete S.sched[k]; toastMsg(errText(e)); }
}
const urlB64 = (b) => { const p = "=".repeat((4 - (b.length % 4)) % 4), r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
async function enablePush() {
  const vk = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (IOS && !STANDALONE) return toastMsg("На iPhone: натисніть «Поділитися» → «На початковий екран», відкрийте Ordo з іконки і ще раз увімкніть Push");
  if (!vk || !("serviceWorker" in navigator) || !("PushManager" in window)) return toastMsg("Push недоступний у цьому браузері. Відкрийте Ordo через Chrome (Android) або з іконки на головному екрані (iPhone)");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return toastMsg("Дозвольте сповіщення для Ordo у налаштуваннях телефону або браузера");
  const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(vk) });
  await api.savePush(sub.toJSON());
  toastMsg("Push увімкнено на цьому пристрої");
  ui.pushOn = true; render();
}
/* календар */
function openCal(modal, user) {
  const n = new Date(); ui.cal = { y: n.getFullYear(), m: n.getMonth(), from: null, to: null };
  ui.modal = modal; ui.awayUser = user; ui.awayType = "vacation"; ui.err = "";
  render(); loadMonth();
}
async function loadMonth() { const { y, m } = ui.cal; await loadRange(iso(new Date(y, m, 1, 12)), iso(new Date(y, m + 1, 0, 12))); render(); }
const calRange = () => (ui.cal?.from ? [ui.cal.from, ui.cal.to || ui.cal.from] : null);
function conflicts(t, uid) {
  const r = calRange(), out = []; if (!r || ui.awayType === "office") return out;
  eachWorkday(r[0], r[1], (d) => {
    if (isOrd(t, d)) return;
    const others = active(t).filter((m) => m.id !== uid && eff(t, m.id, d) === "office").length;
    if (others < t.minOffice) out.push(short(d) + " (буде " + others + " із " + t.minOffice + ")");
  });
  return out;
}

/* ---------- відображення ---------- */
function authView() {
  if (ui.mode === "reg" && ui.regInfo && !ui.regInfo.open) return closedView();
  const reg = ui.mode === "reg";
  return `<div class="auth card"><h2 class="logo" style="font-size:30px">Ordo</h2><p class="mu">Гібридний графік команди без таблиць Excel.</p>
 ${reg ? `<div class="row"><div class="fld" style="flex:1"><label>Ім’я</label><input id="fn" autocomplete="given-name" placeholder="Іван"></div><div class="fld" style="flex:1"><label>Прізвище</label><input id="ln" autocomplete="family-name" placeholder="Іванов"></div></div>` : ""}
 <div class="fld"><label>Логін</label><input id="lg" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="ivan.i"></div>
 <div class="fld"><label>Пароль</label><input id="pw" type="password" autocomplete="${reg ? "new-password" : "current-password"}"></div>
 ${reg ? `<p class="mu">Ім’я й прізвище: кирилиця або латиниця. Логін: латиниця, цифри, крапка, підкреслення або дефіс, 3–30 символів. Пароль: лише латиниця, цифри та символи, мінімум 8 символів, з великими й малими літерами, цифрою і спецсимволом (наприклад, ! @ # $ %).</p>` : ""}
 ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ""}${ui.msg ? `<div class="okm">${esc(ui.msg)}</div>` : ""}
 <button class="pri" style="width:100%" data-a="auth">${reg ? "Створити акаунт" : "Увійти"}</button>
 <p class="mu" style="text-align:center"><button style="border:0;background:none;text-decoration:underline" data-a="mode" data-m="${reg ? "login" : "reg"}">${reg ? "Уже є акаунт? Увійти" : "Немає акаунта? Зареєструватися"}</button></p></div>`;
}
function closedView() {
  const i = ui.regInfo;
  return `<div class="auth card"><h2 class="logo" style="font-size:30px">Ordo</h2>
 <div class="ban no" style="margin:0 0 12px"><b>Реєстрація тимчасово обмежена</b></div>
 <p>Наразі кількість користувачів обмежена (${i.count} з ${i.max}). Якщо бажаєте зареєструватись, введіть ім’я та логін і натисніть кнопку «Сповістити адміністрацію».</p>
 <div class="row"><div class="fld" style="flex:1"><label>Ім’я</label><input id="fn"></div><div class="fld" style="flex:1"><label>Прізвище</label><input id="ln"></div></div>
 <div class="fld"><label>Бажаний логін</label><input id="rl" autocapitalize="off" spellcheck="false"></div>
 ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ""}${ui.msg ? `<div class="okm">${esc(ui.msg)}</div>` : ""}
 <button class="pri" style="width:100%" data-a="notify-admin">Сповістити адміністрацію</button>
 <p class="mu" style="text-align:center"><button style="border:0;background:none;text-decoration:underline" data-a="mode" data-m="login">Назад до входу</button></p></div>`;
}
const recoverView = () => `<div class="auth card"><h2>Новий пароль</h2><div class="fld"><label>Пароль (мінімум 6 символів)</label><input id="np" type="password" autocomplete="new-password"></div>${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ""}<button class="pri" style="width:100%" data-a="setpw">Зберегти пароль</button></div>`;

function cellHtml(t, m, i, d, owner, v) {
  const e = eff(t, m.id, d.iso), mand = t.mandatory.includes(i), can = owner || m.id === S.me.id;
  const pd = owner && S.sched[key(t.id, m.id, d.iso)]?.p, away = e === "vacation" || e === "sick";
  const lock = mand && e === "office", viol = mand && e === "remote";
  const cls = e === "order" ? "ord" : away ? (e === "vacation" ? "v" : "k") : lock ? "l" : e === "remote" ? "r" : "o";
  const txt = e === "order" ? "🏛 Наказ: дистанційно" : e === "vacation" ? "🌴 Відпустка" : e === "sick" ? "🤒 Лікарняний" : lock ? "🔒 Офіс (Обов’язково)" : e === "remote" ? "🏠 Віддалено" : "🏢 В офісі";
  const act = away ? "away" : "cell", dis = !can || lock || e === "order";
  return `<td><button class="c ${cls} ${viol ? "bad" : ""} ${pd ? "pend" : ""}" ${dis ? "disabled" : ""} data-a="${act}" data-u="${m.id}" data-i="${i}" aria-label="${esc(m.name)}, ${DN[i]}: ${txt}">${txt}</button></td>`;
}
function grid(t) {
  const v = validate(t, ui.wk), ds = wdays(ui.wk), ms = active(t), owner = t.ownerId === S.me.id, pend = owner ? pendOf(t) : [];
  const ordDays = ds.filter((d) => isOrd(t, d.iso));
  const rows = ms.map((m) => `<tr><td class="n">${esc(m.name)}${m.id === t.ownerId ? ' <span class="tag">власник</span>' : ""}<br><span class="tag ${v.rem[m.id] > t.maxRemote ? "bad" : ""}">Віддалено ${v.rem[m.id]}/${t.maxRemote}</span></td>${ds.map((d, i) => cellHtml(t, m, i, d, owner, v)).join("")}</tr>`).join("");
  return `${ordDays.length ? `<div class="ordb">🏛 Наказ про дистанційну роботу: ${ordDays.map((d) => DS[ds.indexOf(d)] + " " + d.s).join(", ")}${S.orders[t.id + "|" + ordDays[0].iso] ? " — " + esc(S.orders[t.id + "|" + ordDays[0].iso]) : ""}. У ці дні мінімум в офісі не перевіряється.</div>` : ""}
 <div class="scr" style="margin-top:8px"><table class="g"><thead><tr><th></th>${v.days.map((d, i) => `<th class="${d.bad ? "colbad" : ""}">${DN[i]}${d.ord ? " 🏛" : ""}<small>${DS[i]} ${d.s}</small></th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="6" class="mu">У графіку немає учасників. Додайте їх у налаштуваннях команди.</td></tr>`}</tbody>
 <tfoot><tr class="sum"><td class="n" style="background:none;text-align:left">Підсумок</td>${v.days.map((d) => `<td class="${!d.ord && d.o < t.minOffice && v.n > 0 ? "bad" : ""}">${d.ord ? "Наказ: дистанційно" : `В офісі: ${d.o} | Віддалено: ${d.r}`}${d.a ? `<br>Відсутні: ${d.a}` : ""}<br><span class="mu">${d.ord ? "&nbsp;" : "мін. " + t.minOffice}</span></td>`).join("")}</tr></tfoot></table></div>
 ${pend.length ? `<div class="card row" style="margin-top:12px"><span>Змін, про які ще не сповіщено: <b>${pend.length}</b></span><button class="pri sp" data-a="confirm">Підтвердити зміни та сповістити</button></div>` : ""}
 ${v.issues.length ? `<div class="ban no"><b>Тиждень НЕ ОК</b><ul>${v.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>` : `<div class="ban ok"><b>Тиждень ОК — усі правила дотримано</b></div>`}`;
}
function schedView() {
  const t = curTeam();
  if (!t) return `<div class="card"><h2>Ви ще не в команді</h2><p class="mu">Створіть команду або вставте запрошувальне посилання.</p>
 <div class="row"><input id="tn" placeholder="Назва команди" style="max-width:260px"><button class="pri" data-a="newteam">Створити команду</button></div>
 <div class="row" style="margin-top:10px"><input id="tk" placeholder="ordo.app/invite/abc123def456" style="max-width:260px"><button data-a="join">Приєднатися</button></div>${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ""}</div>`;
  const owner = t.ownerId === S.me.id, ds = wdays(ui.wk);
  return `<div class="card"><div class="row"><div><h2>${esc(t.name)}</h2><div class="mu">${ds[0].s} – ${ds[4].s} · ${owner ? "Ви власник команди" : "Ви учасник"}</div></div>
 <div class="row sp">${S.teams.length > 1 ? `<select data-c="team" style="width:auto">${S.teams.map((x) => `<option value="${x.id}" ${x.id === t.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}
 ${owner ? `<button data-a="modal" data-m="set">⚙ Налаштування</button>` : ""}<button data-a="modal" data-m="new">+ Команда</button><button data-a="modal" data-m="join">Приєднатися</button></div></div>
 <div class="row" style="margin:12px 0"><button data-a="wk" data-i="-1">‹ Попередній тиждень</button><button class="${ui.wk === 0 ? "pri" : ""}" data-a="wk" data-i="0">Поточний тиждень</button><button data-a="wk" data-i="1">Наступний тиждень ›</button>
 <button class="sp" data-a="away" data-u="${S.me.id}">🌴 Відпустка / лікарняний</button>${owner ? `<button data-a="order">🏛 Наказ про дистанційку</button>` : ""}</div>${grid(t)}</div>`;
}
function superView() {
  const T = S.teams.map((t) => { const v = validate(t, 0), tot = v.n * 5, off = v.days.reduce((a, d) => a + d.o, 0); return { t, v, pct: tot ? Math.round((off / tot) * 100) : 0 }; });
  const avg = T.length ? Math.round(T.reduce((a, x) => a + x.pct, 0) / T.length) : 0, ok = T.filter((x) => !x.v.issues.length).length;
  const users = Object.values(S.users).sort((a, b) => a.name.localeCompare(b.name, "uk"));
  return `<div class="stats"><div class="card"><div class="mu">Команд</div><div class="big">${S.teams.length}</div></div><div class="card"><div class="mu">Користувачів</div><div class="big">${users.length}</div></div><div class="card"><div class="mu">Відвідуваність офісу, цей тиждень</div><div class="big">${avg}%</div></div><div class="card"><div class="mu">Валідних графіків</div><div class="big">${ok}/${T.length}</div></div></div>
 <div class="card"><h3>Реєстрація</h3>
 <div class="row"><span>Зареєстровано: <b>${S.regInfo?.count ?? 0}</b> з <b>${S.regInfo?.max ?? 0}</b></span><span class="sp"></span><input id="mx" type="number" min="1" value="${S.regInfo?.max ?? 15}" style="width:110px"><button class="pri" data-a="setmax">Зберегти ліміт</button></div>
 <h3 style="margin-top:14px">Запити на реєстрацію</h3>
 ${(S.regReq || []).map((r) => `<div class="nt"><b>${esc(r.full_name || "—")}</b> · логін <b>${esc(r.login)}</b> · <span class="mu">${fT(Date.parse(r.created_at))}</span> <button data-a="reqdone" data-id="${r.id}" style="min-height:30px">Оброблено</button></div>`).join("") || `<p class="mu">Нових запитів немає.</p>`}
 <p class="mu">Щоб прийняти людину, збільште ліміт, і вона зможе зареєструватись. Ліміт можна змінити в будь-який момент.</p></div>
 <div class="card"><h3>Користувачі</h3><div class="scr"><table class="t"><thead><tr><th>Ім’я</th><th>Логін</th><th>Роль</th><th>Статус</th><th></th></tr></thead><tbody>${users.map((u) => {
    const me = u.id === S.me.id;
    return `<tr><td>${esc(u.name)}</td><td>${esc(u.login || "")}</td><td>${u.role === "superadmin" ? "Суперадмін" : "Користувач"}</td><td>${u.blocked ? `<span class="tag bad">Заблоковано</span>` : `<span class="tag">Активний</span>`}</td><td>${me ? `<div class="row"><span class="mu">це ви</span><button data-a="adm" data-act="delete" data-u="${u.id}" style="min-height:32px;color:var(--bad)">Видалити себе</button></div>` : `<div class="row">
 <button data-a="adm" data-act="${u.blocked ? "unban" : "ban"}" data-u="${u.id}" style="min-height:32px">${u.blocked ? "Розблокувати" : "Заблокувати"}</button>
 <button data-a="adm" data-act="set_role" data-r="${u.role === "superadmin" ? "user" : "superadmin"}" data-u="${u.id}" style="min-height:32px">${u.role === "superadmin" ? "Зняти права адміна" : "Зробити адміном"}</button>
 <button data-a="adm" data-act="set_password" data-u="${u.id}" style="min-height:32px">Змінити пароль</button>
 <button data-a="adm" data-act="delete" data-u="${u.id}" style="min-height:32px;color:var(--bad)">Видалити</button></div>`}</td></tr>`;
  }).join("")}</tbody></table></div></div>
 <div class="card"><h3>Усі команди</h3><div class="scr"><table class="t"><thead><tr><th>Команда</th><th>Власник</th><th>Люди</th>${DS.map((d) => `<th>${d}</th>`).join("")}<th>Статус</th></tr></thead><tbody>${T.map((x) => `<tr><td>${esc(x.t.name)}</td><td>${esc(usr(x.t.ownerId)?.name)}</td><td>${x.v.n}</td>${x.v.days.map((d) => `<td class="${d.bad ? "colbad" : ""}">${d.ord ? "наказ" : d.o + "/" + x.v.n}</td>`).join("")}<td>${x.v.issues.length ? `<span class="tag bad">Не ОК (${x.v.issues.length})</span>` : `<span class="tag">ОК</span>`}</td></tr>`).join("")}</tbody></table></div></div>
 <div class="card"><h3>Журнал змін за останні 3 дні</h3><div class="scr"><table class="t"><thead><tr><th>Час</th><th>Хто змінив</th><th>Кому</th><th>Команда</th><th>Дата</th><th>Було → Стало</th></tr></thead><tbody>${S.audit.map((a) => `<tr><td>${fT(a.ts)}</td><td>${esc(usr(a.a)?.name || "—")}</td><td>${a.to ? esc(usr(a.to)?.name || "—") : "—"}</td><td>${esc(S.teams.find((t) => t.id === a.t)?.name || "—")}</td><td>${a.d ? short(a.d) : "—"}</td><td>${a.txt ? esc(a.txt) : LBL[a.f] + " → " + LBL[a.n]}</td></tr>`).join("") || `<tr><td colspan="6" class="mu">Змін за 72 години немає</td></tr>`}</tbody></table></div><p class="mu">Записи старші за 72 години видаляються автоматично.</p></div>`;
}
function bellPanel() {
  const t = curTeam(), owner = t && t.ownerId === S.me.id;
  return `<div class="card pan"><h3>Сповіщення</h3>
 ${owner ? `<button class="pri" style="width:100%;margin:6px 0 10px" data-a="remind">Нагадати команді заповнити графік на наступний тиждень</button>` : ""}
 ${S.notifs.map((n) => `<div class="nt ${n.unread ? "un" : ""}"><b>${esc(n.title)}</b><div>${esc(n.text)}</div><div class="mu">${fT(n.ts)} · Email + Push</div></div>`).join("") || `<p class="mu">Нових сповіщень немає.</p>`}</div>`;
}
function calendar(t, uid) {
  const { y, m } = ui.cal, r = calRange(), off = (new Date(y, m, 1, 12).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
  let cells = ""; for (let i = 0; i < off; i++) cells += "<span></span>";
  for (let d = 1; d <= dim; d++) {
    const dt = iso(new Date(y, m, d, 12)), we = (off + d - 1) % 7 > 4, st = uid ? S.sched[key(t.id, uid, dt)]?.s : null;
    const mark = st === "vacation" ? "🌴" : st === "sick" ? "🤒" : isOrd(t, dt) ? "🏛" : "";
    cells += `<button class="cd ${r && dt >= r[0] && dt <= r[1] ? "sel" : ""} ${we ? "we" : ""}" data-a="cd" data-d="${dt}">${d}<i>${mark}</i></button>`;
  }
  return `<div class="row" style="margin:8px 0"><button data-a="cm" data-i="-1" aria-label="Попередній місяць">‹</button><b style="flex:1;text-align:center">${MONTHS[m]} ${y}</b><button data-a="cm" data-i="1" aria-label="Наступний місяць">›</button></div>
 <div class="cal">${DS.map((d) => `<b>${d}</b>`).join("")}<b>Сб</b><b>Нд</b>${cells}</div>
 <p class="mu">${r ? "Обрано: " + short(r[0]) + (r[1] !== r[0] ? " – " + short(r[1]) : "") + " (вихідні пропускаються)" : "Натисніть першу, а потім останню дату періоду."}</p>`;
}
function modal() {
  if (ui.modal === "help") return helpModal();
  if (ui.modal === "new" || ui.modal === "join") {
    const nw = ui.modal === "new";
    return `<div class="mod" data-a="close"><div class="mb" data-stop><h2>${nw ? "Нова команда" : "Приєднатися до команди"}</h2><div class="fld"><label>${nw ? "Назва" : "Запрошувальне посилання"}</label><input id="${nw ? "tn" : "tk"}"></div>${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ""}<div class="row"><button class="pri" data-a="${nw ? "newteam" : "join"}">${nw ? "Створити" : "Приєднатися"}</button><button data-a="close">Скасувати</button></div></div></div>`;
  }
  const t = curTeam(); if (!t) return "";
  if (ui.modal === "away") {
    const owner = t.ownerId === S.me.id, uid = owner ? ui.awayUser || S.me.id : S.me.id, cf = conflicts(t, uid);
    const opts = active(t); if (!opts.some((m) => m.id === uid) && usr(uid)) opts.unshift(usr(uid));
    return `<div class="mod" data-a="close"><div class="mb" data-stop><div class="row"><h2>Відпустка / лікарняний</h2><button class="sp" data-a="close">Закрити</button></div>
 ${owner ? `<div class="fld"><label>Співробітник</label><select data-c="awayuser">${opts.map((m) => `<option value="${m.id}" ${m.id === uid ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>` : ""}
 <div class="row" style="margin:10px 0">${[["vacation", "🌴 Відпустка"], ["sick", "🤒 Лікарняний"], ["office", "Зняти (повернути «В офісі»)"]].map(([k, l]) => `<button class="chip ${ui.awayType === k ? "on" : ""}" data-a="atype" data-t="${k}">${l}</button>`).join("")}</div>
 ${calendar(t, uid)}
 ${cf.length ? `<div class="warn">Увага: мінімум в офісі (${t.minOffice}) не буде дотримано: ${cf.join(", ")}. Відсутність усе одно можна зберегти, але тиждень буде позначено «НЕ ОК».</div>` : ""}
 ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ""}
 <div class="row" style="margin-top:12px"><button class="pri" data-a="applyaway" ${calRange() ? "" : "disabled"}>Зберегти</button><button data-a="close">Скасувати</button></div></div></div>`;
  }
  if (ui.modal === "order") {
    return `<div class="mod" data-a="close"><div class="mb" data-stop><div class="row"><h2>Наказ про дистанційну роботу</h2><button class="sp" data-a="close">Закрити</button></div>
 <p class="mu">Для всієї команди на обрані дні. Мінімум в офісі й обов’язкові офісні дні в ці дні не перевіряються; відпустка і лікарняний залишаються.</p>
 <div class="row" style="margin:8px 0"><button data-a="preset" data-i="0">Поточний тиждень</button><button data-a="preset" data-i="1">Наступний тиждень</button></div>
 ${calendar(t, null)}
 <div class="fld"><label>Підстава (необов’язково)</label><input id="on" placeholder="Наприклад: наказ №12 від 18.11"></div>
 ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ""}
 <div class="row"><button class="pri" data-a="applyorder" data-e="1" ${calRange() ? "" : "disabled"}>Оголосити дистанційку</button><button data-a="applyorder" data-e="0" ${calRange() ? "" : "disabled"}>Скасувати наказ</button></div></div></div>`;
  }
  return `<div class="mod" data-a="close"><div class="mb" data-stop><div class="row"><h2>Налаштування команди</h2><button class="sp" data-a="close">Готово</button></div>
 <div class="fld row"><label style="margin:0;flex:1">Враховувати мене (власника) у графіку команди</label><input type="checkbox" data-c="inc" ${t.includeOwner ? "checked" : ""} style="width:24px;min-height:24px"></div>
 <div class="fld"><label>Максимум віддалених днів на тиждень (на 1 людину)</label><input type="number" min="0" max="5" value="${t.maxRemote}" data-c="max"></div>
 <div class="fld"><label>Мінімум людей в офісі щодня</label><input type="number" min="0" max="50" value="${t.minOffice}" data-c="min"></div>
 <div class="fld"><label>Обов’язкові офісні дні</label><div class="row">${DN.map((d, i) => `<button class="chip ${t.mandatory.includes(i) ? "on" : ""}" data-a="mand" data-i="${i}">${DS[i]}</button>`).join("")}</div></div>
 <div class="fld"><label>День нагадування про планування наступного тижня</label><select data-c="plan">${DN.map((d, i) => `<option value="${i}" ${t.planDay === i ? "selected" : ""}>${d}</option>`).join("")}</select></div>
 <div class="fld"><label>Запрошувальне посилання</label><div class="row"><input readonly value="${esc(location.origin)}/invite/${esc(t.token)}" style="flex:1"><button data-a="copy">Копіювати</button><button data-a="regen">Оновити</button></div></div>
 <div class="fld"><label>Додати за email</label><div class="row"><input id="ae" type="email" placeholder="email@company.com" style="flex:1"><button class="pri" data-a="add">Додати</button></div>${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ""}</div>
 <div class="fld"><label>Учасники</label>${t.members.map((id) => `<div class="row nt"><span>${esc(usr(id)?.name)}</span><span class="mu">${esc(usr(id)?.email)}</span><button class="sp" data-a="rm" data-u="${id}" style="min-height:32px">Видалити</button></div>`).join("") || `<p class="mu">Поки нікого. Поділіться посиланням або додайте за email.</p>`}</div></div></div>`;
}
function render() {
  const app = document.getElementById("app"), toast = ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : "";
  if (ui.boot) { app.innerHTML = `<div class="boot">Завантаження…</div>`; return; }
  if (ui.recover) { app.innerHTML = recoverView() + toast; return; }
  if (!S.me) { app.innerHTML = authView() + toast; return; }
  if (!ui.pushChecked && "serviceWorker" in navigator && "PushManager" in window) { ui.pushChecked = true; navigator.serviceWorker.register("/sw.js").then((r) => r.pushManager.getSubscription()).then((sub) => { if (sub) ui.pushOn = true; render(); }).catch(() => {}); }
  const t = curTeam(), role = isSuper() ? "Суперадмін" : t && t.ownerId === S.me.id ? "Власник команди" : "Учасник";
  S.notifs.forEach((n) => { n.unread = !n.read; });
  const unread = S.notifs.filter((n) => !n.read).length;
  const canPush = import.meta.env.VITE_VAPID_PUBLIC_KEY && !ui.pushOn && (("Notification" in window && Notification.permission !== "granted") || (IOS && !STANDALONE));
  app.innerHTML = `<div class="wrap"><div class="bar"><div class="logo">Ordo</div><span class="mu">${esc(S.me.name)} · ${role}</span>
 ${canPush ? `<button data-a="push">🔔 Увімкнути push</button>` : ""}
 <button data-a="modal" data-m="help" aria-label="Інструкція push">❔</button>
 <button data-a="bell" aria-label="Сповіщення">🔔${unread ? `<span class="bdg">${unread}</span>` : ""}</button><button data-a="logout">Вийти</button></div>
 ${isSuper() ? `<div class="tabs row"><button class="on">Суперадмін</button></div><div style="margin-top:12px">${superView()}</div>` : schedView()}</div>
 ${ui.bell ? bellPanel() : ""}${ui.modal ? modal() : ""}${ui.onboard && S.me ? onboardView() : ""}${toast}`;
}

/* ---------- події ---------- */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-a]"); if (!el) return;
  if (el.classList.contains("mod") && e.target.closest("[data-stop]")) return;
  const a = el.dataset.a, t = S.me ? curTeam() : null;
  try {
    if (a === "auth") {
      const lg = document.getElementById("lg").value.trim().toLowerCase(), pw = document.getElementById("pw").value; ui.err = ""; ui.msg = "";
      if (ui.mode === "reg") {
        const fn = document.getElementById("fn").value.trim(), ln = document.getElementById("ln").value.trim();
        if (!NAME_RE.test(fn) || !NAME_RE.test(ln)) { ui.err = "Ім’я та прізвище: від 2 до 40 літер (кирилиця або латиниця)"; return render(); }
        if (!LOGIN_RE.test(lg)) { ui.err = "Логін: 3–30 символів, латиниця, цифри, крапка, підкреслення або дефіс"; return render(); }
        const pe = passwordError(pw); if (pe) { ui.err = pe; return render(); }
        try { await api.signUp(lg, pw, fn, ln); }
        catch (e) {
          if (/registration_closed|Database error saving/i.test(e.message)) { ui.regInfo = await api.regStatus(); return render(); }
          throw e;
        }
      } else await api.signIn(lg, pw);
      return render();
    }
    if (a === "setpw") {
      const np = document.getElementById("np").value; if (np.length < 6) { ui.err = "Мінімум 6 символів"; return render(); }
      await api.setPassword(np); ui.recover = false; ui.err = ""; return toastMsg("Пароль змінено");
    }
    if (a === "mode") {
      ui.mode = el.dataset.m; ui.err = ""; ui.msg = ""; ui.regInfo = null;
      if (ui.mode === "reg") ui.regInfo = await api.regStatus().catch(() => null);
      return render();
    }
    if (a === "notify-admin") {
      const fn = document.getElementById("fn").value.trim(), ln = document.getElementById("ln").value.trim(), rl = document.getElementById("rl").value.trim().toLowerCase();
      ui.err = ""; ui.msg = "";
      if (!NAME_RE.test(fn) || !NAME_RE.test(ln)) { ui.err = "Ім’я та прізвище: від 2 до 40 літер (кирилиця або латиниця)"; return render(); }
      if (!LOGIN_RE.test(rl)) { ui.err = "Логін: 3–30 символів, латиниця, цифри, крапка, підкреслення або дефіс"; return render(); }
      const sent = await api.requestRegistration(rl, fn + " " + ln);
      ui.msg = sent ? "Адміністрацію сповіщено. Ми повідомимо, коли з’являться місця." : "Запит уже надіслано. Очікуйте, адміністрація в курсі.";
      return render();
    }
    if (a === "setmax") {
      const n = parseInt(document.getElementById("mx").value, 10);
      if (!n || n < 1) return toastMsg("Вкажіть ціле число від 1");
      await api.setMaxUsers(n); await loadAll(); render(); return toastMsg("Ліміт змінено: " + n);
    }
    if (a === "reqdone") { await api.markRequestHandled(el.dataset.id); await loadAll(); return render(); }
    if (a === "logout") { await api.signOut(); return; }
    if (a === "wk") { const i = +el.dataset.i; ui.wk = i === 0 ? 0 : ui.wk + i; render(); await loadWeek(); return render(); }
    if (a === "cell") return toggle(el.dataset.u, +el.dataset.i);
    if (a === "away") return openCal("away", el.dataset.u);
    if (a === "order") return openCal("order");
    if (a === "cm") { const c = ui.cal, d = new Date(c.y, c.m + +el.dataset.i, 1); c.y = d.getFullYear(); c.m = d.getMonth(); render(); return loadMonth(); }
    if (a === "cd") { const c = ui.cal, d = el.dataset.d; if (!c.from || c.to) { c.from = d; c.to = null; } else if (d < c.from) { c.to = c.from; c.from = d; } else c.to = d; return render(); }
    if (a === "atype") { ui.awayType = el.dataset.t; return render(); }
    if (a === "preset") { const ds = wdays(+el.dataset.i), c = ui.cal; c.from = ds[0].iso; c.to = ds[4].iso; const d = toD(c.from); c.y = d.getFullYear(); c.m = d.getMonth(); render(); return loadMonth(); }
    if (a === "applyaway") {
      const owner = t.ownerId === S.me.id, uid = owner ? ui.awayUser || S.me.id : S.me.id, r = calRange();
      await api.setRange(t.id, uid, r[0], r[1], ui.awayType); await loadRange(r[0], r[1]);
      ui.modal = null; ui.cal = null; return toastMsg("Збережено: " + LBL[ui.awayType] + ", " + short(r[0]) + (r[1] !== r[0] ? "–" + short(r[1]) : ""));
    }
    if (a === "applyorder") {
      const r = calRange(), en = el.dataset.e === "1", note = document.getElementById("on").value;
      await api.setOrder(t.id, r[0], r[1], note, en); await loadRange(r[0], r[1]);
      ui.modal = null; ui.cal = null; return toastMsg(en ? "Наказ оголошено, команду сповіщено" : "Наказ скасовано, команду сповіщено");
    }
    if (a === "adm") {
      const u = usr(el.dataset.u), act = el.dataset.act;
      if (act === "set_password") {
        const pw = window.prompt("Новий пароль для " + u.name + " (мінімум 8 символів, великі й малі літери, цифра, спецсимвол):");
        if (!pw) return;
        const pe = passwordError(pw); if (pe) return toastMsg(pe);
        await api.admin(act, u.id, undefined, pw);
        return toastMsg("Пароль змінено. Передайте його користувачу особисто");
      }
      const q = { ban: "Заблокувати", unban: "Розблокувати", delete: u.id === S.me.id ? "Видалити ВЛАСНИЙ акаунт? Вас буде відразу вийдено" : "Видалити назавжди (разом із командами й графіками)", set_role: "Змінити роль для" }[act];
      if (!window.confirm(q + " " + u.name + "?")) return;
      if (u.id === S.me.id && act === "delete") { await api.admin(act, u.id); return api.signOut(); }
      await api.admin(act, u.id, el.dataset.r); await loadAll(); render(); return toastMsg("Готово");
    }
    if (a === "onb-ok") { await api.markOnboarded(S.me.id); S.me.onboarded = true; ui.onboard = false; return render(); }
    if (a === "confirm") { const n = await api.confirmChanges(t.id); Object.values(S.sched).forEach((v) => { v.p = false; }); return toastMsg("Сповіщення надіслано: " + n); }
    if (a === "bell") { ui.bell = !ui.bell; const ids = S.notifs.filter((n) => !n.read).map((n) => n.id); render(); if (ui.bell && ids.length) { await api.markRead(ids); S.notifs.forEach((n) => { n.read = true; }); } return; }
    if (a === "remind") { const n = await api.remind(t.id); return toastMsg("Нагадування надіслано: " + n); }
    if (a === "push") return enablePush();
    if (a === "modal") { ui.modal = el.dataset.m; ui.err = ""; return render(); }
    if (a === "close") { ui.modal = null; ui.cal = null; ui.err = ""; return render(); }
    if (a === "newteam") {
      const n = document.getElementById("tn").value.trim(); if (!n) { ui.err = "Вкажіть назву команди"; return render(); }
      const nt = await api.createTeam(n, S.me.id); ui.team = nt.id; ui.modal = null; ui.err = ""; await loadAll(); return render();
    }
    if (a === "join") {
      const tk = document.getElementById("tk").value.trim().split("/").pop(); ui.err = "";
      ui.team = await api.joinTeam(tk); ui.modal = null; await loadAll(); return render();
    }
    if (a === "mand") { const i = +el.dataset.i, m = t.mandatory.includes(i) ? t.mandatory.filter((x) => x !== i) : [...t.mandatory, i].sort(); t.mandatory = m; render(); await api.updateTeam(t.id, { mandatory_office_days: m.map((x) => x + 1) }); return; }
    if (a === "copy") { try { await navigator.clipboard.writeText(location.origin + "/invite/" + t.token); } catch (x) { /* ігноруємо */ } return toastMsg("Посилання скопійовано"); }
    if (a === "regen") { const tok = crypto.randomUUID().replace(/-/g, "").slice(0, 12); await api.updateTeam(t.id, { invite_token: tok }); t.token = tok; return render(); }
    if (a === "add") { ui.err = ""; await api.addByEmail(t.id, document.getElementById("ae").value); await loadAll(); return render(); }
    if (a === "rm") { await api.removeMember(t.id, el.dataset.u); t.members = t.members.filter((x) => x !== el.dataset.u); return render(); }
  } catch (x) {
    if (["auth", "setpw", "add", "join", "newteam", "applyaway", "applyorder"].includes(a)) { ui.err = errText(x); render(); } else toastMsg(errText(x));
  }
});
document.addEventListener("change", async (e) => {
  const c = e.target.dataset.c; if (!c) return; const t = curTeam(), v = e.target.value;
  if (c === "team") { ui.team = v; return render(); }
  if (c === "awayuser") { ui.awayUser = v; return render(); }
  const patch = { inc: () => ({ include_owner: e.target.checked }), max: () => ({ max_remote_days: Math.max(0, Math.min(5, +v || 0)) }), min: () => ({ min_office_count: Math.max(0, +v || 0) }), plan: () => ({ planning_day: +v + 1 }) }[c]();
  if (c === "inc") t.includeOwner = e.target.checked;
  if (c === "max") t.maxRemote = patch.max_remote_days;
  if (c === "min") t.minOffice = patch.min_office_count;
  if (c === "plan") t.planDay = +v;
  render();
  try { await api.updateTeam(t.id, patch); } catch (x) { toastMsg(errText(x)); }
});

/* ---------- запуск ---------- */
api.onAuth((event, session) => {
  if (event === "PASSWORD_RECOVERY") { ui.recover = true; ui.boot = false; render(); }
  if (event === "SIGNED_OUT") { stop(); ui.boot = false; render(); }
  else if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) { setTimeout(() => start(session.user.id), 0); }
  else if (event === "INITIAL_SESSION") { ui.boot = false; render(); }
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
render();
