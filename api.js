import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) console.error("Вкажіть VITE_SUPABASE_URL і VITE_SUPABASE_ANON_KEY у файлі .env");
export const supabase = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });

const ok = ({ data, error }) => { if (error) throw error; return data; };

// Єдиний сервісний шар: весь UI працює з даними лише через apiService.
export const api = {
  /* ---- Auth ---- */
  session: () => supabase.auth.getSession().then((r) => r.data.session),
  onAuth: (cb) => supabase.auth.onAuthStateChange((event, s) => cb(event, s)),
  // Логін без пошти: технічна адреса login@ordo.app (листи не надсилаються)
  signUp: (login, password, first_name, last_name) =>
    supabase.auth.signUp({ email: login + "@ordo.app", password,
      options: { data: { login, first_name, last_name, full_name: first_name + " " + last_name } } }).then(ok),
  signIn: (login, password) =>
    supabase.auth.signInWithPassword({ email: login + "@ordo.app", password }).then(ok),
  regStatus: () => supabase.rpc("registration_status").then(ok),
  requestRegistration: (login, name) => supabase.rpc("request_registration", { p_login: login, p_name: name }).then(ok),
  regRequests: () => supabase.from("registration_requests").select("*").eq("handled", false).order("created_at", { ascending: false }).then(ok),
  setMaxUsers: (n) => supabase.rpc("set_max_users", { p_max: n }).then(ok),
  markRequestHandled: (id) => supabase.rpc("mark_request_handled", { p_id: id }).then(ok),
  markOnboarded: (id) => supabase.from("profiles").update({ onboarded: true }).eq("id", id).then(ok),
  signOut: () => supabase.auth.signOut(),
  resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin }).then(ok),
  setPassword: (password) => supabase.auth.updateUser({ password }).then(ok),

  /* ---- Дані ---- */
  async loadAll() {
    const [p, t, m, n] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,global_role,is_blocked,login,onboarded"),
      supabase.from("teams").select("*").order("created_at"),
      supabase.from("team_members").select("team_id,user_id"),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    return { profiles: ok(p), teams: ok(t), members: ok(m), notifs: ok(n) };
  },
  schedules: (from, to) =>
    supabase.from("schedules").select("team_id,user_id,work_date,status,pending_notify")
      .gte("work_date", from).lte("work_date", to).then(ok),
  orders: (from, to) =>
    supabase.from("remote_orders").select("team_id,work_date,note").gte("work_date", from).lte("work_date", to).then(ok),
  // Журнал: лише останні 3 дні (додатково до цього діє політика RLS)
  audit: () =>
    supabase.from("audit_logs").select("*")
      .gte("created_at", new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false }).then(ok),

  /* ---- Графік ---- */
  setStatus: (team_id, user_id, work_date, status) =>
    supabase.from("schedules").upsert({ team_id, user_id, work_date, status }, { onConflict: "team_id,user_id,work_date" }).then(ok),
  // Відпустка / лікарняний / зняти (status: vacation | sick | office) на діапазон дат
  setRange: (team, user, from, to, status) =>
    supabase.rpc("set_range", { p_team: team, p_user: user, p_from: from, p_to: to, p_status: status }).then(ok),
  // Наказ про дистанційну роботу для всієї команди
  setOrder: (team, from, to, note, enabled) =>
    supabase.rpc("set_remote_order", { p_team: team, p_from: from, p_to: to, p_note: note || null, p_enabled: enabled }).then(ok),
  confirmChanges: (team) => supabase.rpc("confirm_changes", { p_team: team }).then(ok),
  remind: (team) => supabase.rpc("remind_team", { p_team: team }).then(ok),

  /* ---- Команди ---- */
  createTeam: (name, owner_id) => supabase.from("teams").insert({ name, owner_id }).select().single().then(ok),
  updateTeam: (id, patch) => supabase.from("teams").update(patch).eq("id", id).then(ok),
  joinTeam: (token) => supabase.rpc("join_team", { p_token: token }).then(ok),
  addByEmail: (team, email) => supabase.rpc("add_member_by_email", { p_team: team, p_email: email }).then(ok),
  removeMember: (team_id, user_id) => supabase.from("team_members").delete().eq("team_id", team_id).eq("user_id", user_id).then(ok),

  /* ---- Сповіщення ---- */
  markRead: (ids) => supabase.from("notifications").update({ read: true }).in("id", ids).then(ok),
  savePush: (sub) => supabase.rpc("save_push", { p_endpoint: sub.endpoint, p_sub: sub }).then(ok),

  /* ---- Адміністрування (Edge Function admin-users, лише суперадмін) ---- */
  async admin(action, userId, role, password) {
    const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, userId, role, password } });
    if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error || error.message);
    return data;
  },

  /* ---- Realtime ---- */
  subscribe(uid, h) {
    let ch = supabase.channel("ordo-" + uid);
    ch = ch.on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, h.schedules)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + uid }, h.notification)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, h.other)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, h.other)
      .on("postgres_changes", { event: "*", schema: "public", table: "remote_orders" }, h.other);
    ch.subscribe();
    return ch;
  },
  unsubscribe: (ch) => ch && supabase.removeChannel(ch),
};
