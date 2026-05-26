// SENAQ Operations Console — live data layer
// ----------------------------------------------------------------------------
// Reads from Supabase (anon role, read-only via RLS) and re-renders every
// section whenever the underlying tables change (postgres_changes events on
// the supabase_realtime publication).
//
// Setup steps:
//   1. copy dashboard/config.example.js → dashboard/config.js + fill in values
//   2. run supabase/migrations/0003_dashboard_realtime.sql in Supabase SQL Editor
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ─── config ─────────────────────────────────────────────────────────────────
const cfg = window.__SENAQ_CONFIG__ || {};
if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY
    || cfg.SUPABASE_URL.includes("YOUR-PROJECT")
    || cfg.SUPABASE_ANON_KEY.includes("paste-anon")) {
  showSetupCard();
  throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in dashboard/config.js");
}

const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 5 } },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ─── helpers ────────────────────────────────────────────────────────────────
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[m]);

function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], {
    day: "2-digit", month: "short",
  });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}

function maskPhone(p) {
  if (!p) return "";
  if (p.length < 8) return p;
  return `${p.slice(0, -7)} ${p.slice(-7, -4).replace(/./g, "•")} ${p.slice(-4)}`;
}

const SERVICE = {
  cockroach: "Cockroach treatment",
  bed_bugs:  "Bed-bugs · heat",
  general:   "General pest",
  amc_visit: "AMC visit",
};
const serviceLabel = (s) => SERVICE[s] || s || "—";

// WaStage → conversation filter category
const STAGE_CATEGORY = {
  menu: "booking", choose_service: "booking",
  choose_date: "booking", choose_slot: "booking", confirm_slot: "booking",
  awaiting_payment: "invoice", payment_defer: "invoice",
  review_pending: "review", review_positive: "review", review_negative: "review",
  complaint_triage: "complaint", escalated: "complaint",
  reminder_ack: "amc", followup_pending: "amc",
  done: "idle", idle: "idle",
};
const categoryOf = (stage) => STAGE_CATEGORY[stage] || "idle";

function describeStage(stage, ctx) {
  const svc = serviceLabel(ctx?.service_type);
  const amt = ctx?.invoice_amount;
  switch (stage) {
    case "menu":             return "On main menu";
    case "choose_service":   return "Choosing service type";
    case "choose_date":      return `Choosing date · ${svc}`;
    case "choose_slot":      return `Choosing time slot · ${svc}`;
    case "confirm_slot":     return `Confirming slot · ${svc}`;
    case "awaiting_payment": return `Awaiting payment · $${amt ?? "?"}`;
    case "payment_defer":    return "Payment deferred";
    case "review_pending":   return "Awaiting service review";
    case "review_positive":  return "Positive review captured";
    case "review_negative":  return "Negative review · routing";
    case "complaint_triage": return "Complaint triage in progress";
    case "escalated":        return "Escalated to ops";
    case "reminder_ack":     return "Reminder acknowledged";
    case "followup_pending": return "Re-engagement nudge sent";
    case "done":             return "Conversation closed";
    default:                 return stage;
  }
}

// ─── tiny toast ─────────────────────────────────────────────────────────────
const toastEl = $("#toast");
let toastTimer;
function toast(html) {
  if (!toastEl) return;
  toastEl.innerHTML = html;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), 1800);
}

// ─── connection indicator ──────────────────────────────────────────────────
function setConn(state, msg) {
  const live = $(".live");
  if (!live) return;
  live.dataset.state = state;
  const text = live.querySelector(".live-text");
  if (text) text.textContent = msg;
}

// ─── stats ──────────────────────────────────────────────────────────────────
function setStat(id, n, sub, delta) {
  const el = $(`#stat-${id}`);
  if (!el) return;
  const valEl = el.querySelector(".num-val");
  if (valEl) valEl.textContent = String(n).padStart(2, "0");
  if (sub != null) {
    const subEl = el.querySelector(".sub .sub-val");
    if (subEl) subEl.textContent = sub;
  }
  if (delta != null) {
    const dEl = el.querySelector(".delta");
    if (dEl) dEl.textContent = delta;
  }
}

async function loadStats() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
  const in30       = new Date(todayStart); in30.setDate(in30.getDate() + 30);
  const todayISO   = todayStart.toISOString().slice(0, 10);
  const in30ISO    = in30.toISOString().slice(0, 10);

  const [active, jobs, amc, overdue] = await Promise.all([
    sb.from("customers").select("id", { count: "exact", head: true })
      .not("wa_stage", "in", "(idle,done)"),
    sb.from("jobs").select("id, status")
      .gte("slot_iso", todayStart.toISOString())
      .lt("slot_iso", todayEnd.toISOString()),
    sb.from("amc_contracts").select("id, tier")
      .gte("renewal_iso", todayISO).lte("renewal_iso", in30ISO),
    sb.from("invoices").select("id, amount, due_date")
      .lt("due_date", todayISO).eq("status", "pending"),
  ]);

  setStat("active-conv", active.count ?? 0, "currently in flow");

  const jrows = jobs.data ?? [];
  const sched = jrows.filter((j) => j.status === "scheduled").length;
  const done  = jrows.filter((j) => j.status === "completed").length;
  setStat("jobs-today", jrows.length, `${sched} scheduled · ${done} done`);

  const amcs = amc.data ?? [];
  const prem = amcs.filter((a) => a.tier === "premium").length;
  const bas  = amcs.filter((a) => a.tier === "basic").length;
  setStat("amc-expiring", amcs.length, `${prem} premium · ${bas} basic`);

  const inv = overdue.data ?? [];
  const total = inv.reduce((s, i) => s + Number(i.amount || 0), 0);
  setStat("overdue-invoices", inv.length, `$${total.toLocaleString()} outstanding`);
}

// ─── conversations ──────────────────────────────────────────────────────────
let convCache = [];
let convFilter = "all";

async function loadConversations() {
  const { data, error } = await sb
    .from("customers")
    .select("*")
    .not("wa_stage", "in", "(idle,done)")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) { console.error(error); return; }
  convCache = data ?? [];
  renderConversations();
}

function renderConversations() {
  const feed = $("#conv-feed");
  if (!feed) return;

  const rows = convCache.filter((r) =>
    convFilter === "all" ? true : categoryOf(r.wa_stage) === convFilter);

  if (!rows.length) {
    feed.innerHTML = `<div class="empty"><b>No active conversations</b><br/>matching <em>${esc(convFilter)}</em>.</div>`;
    return;
  }

  feed.innerHTML = rows.map((r) => {
    const cat  = categoryOf(r.wa_stage);
    const initial = (r.name?.[0] || r.phone.slice(-2)).toUpperCase();
    return `
      <div class="row-conv" data-id="${esc(r.id)}" data-cat="${esc(cat)}">
        <span class="ava">${esc(initial)}</span>
        <div class="conv-who">
          <div class="nm">${esc(r.name || "Unknown customer")}</div>
          <div class="ph">${esc(maskPhone(r.phone))}</div>
        </div>
        <div class="conv-msg"><span class="quote">›</span> ${esc(describeStage(r.wa_stage, r.wa_context))}</div>
        <span class="stage ${esc(cat)}">${esc(r.wa_stage.replace(/_/g, " "))}</span>
        <div class="timeago"><span class="ago">${esc(timeAgo(r.updated_at))}</span><br/>${esc(fmtTime(r.updated_at))}</div>
      </div>
    `;
  }).join("");
}

// ─── today's jobs ───────────────────────────────────────────────────────────
async function loadTodayJobs() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(start); end.setDate(end.getDate() + 1);
  const { data } = await sb
    .from("jobs")
    .select("*, customer:customers(name, phone, address)")
    .gte("slot_iso", start.toISOString())
    .lt("slot_iso", end.toISOString())
    .order("slot_iso", { ascending: true });
  renderTodayJobs(data ?? []);
}

function renderTodayJobs(rows) {
  const el = $("#today-jobs");
  if (!el) return;

  const subEl = $("#today-jobs-sub");
  if (subEl) {
    const done = rows.filter((r) => r.status === "completed").length;
    subEl.textContent = `${fmtDate(new Date().toISOString())} · ${rows.length} jobs · ${done} done`;
  }

  if (!rows.length) {
    el.innerHTML = `<div class="empty"><b>No jobs scheduled today.</b></div>`;
    return;
  }

  const now = Date.now();
  el.innerHTML = `<div class="ttl-head"><span>Slot</span><span>Status</span></div>` +
    rows.map((j) => {
      const dt = new Date(j.slot_iso);
      const diff = dt.getTime() - now;
      const isLive = j.status === "scheduled" && diff < 0 && diff > -60 * 60 * 1000;
      let badge, sub;
      if (j.status === "completed") { badge = "Done";      sub = "complete"; }
      else if (j.status === "cancelled") { badge = "Cancelled"; sub = "void"; }
      else if (isLive) { badge = "Live"; sub = "on-site"; }
      else if (diff > 0) {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        badge = h ? `${h} h ${m} m` : `${m} min`;
        sub = "scheduled";
      } else { badge = "—"; sub = "past"; }
      return `
        <div class="job ${isLive ? "now" : ""}" data-id="${esc(j.id)}">
          <div class="when">${esc(fmtTime(j.slot_iso))}<small>${esc(sub)}</small></div>
          <div class="what">
            <div class="svc">${esc(serviceLabel(j.service_type))}</div>
            <div class="addr">${esc(j.address || j.customer?.address || "—")}</div>
            <div class="tech">${esc(j.customer?.name || "Customer")}</div>
          </div>
          <span class="badge">${esc(badge)}</span>
        </div>
      `;
    }).join("");
}

// ─── alerts (derived from real data) ────────────────────────────────────────
async function loadAlerts() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const todayISO = today.toISOString().slice(0, 10);
  const in7ISO = in7.toISOString().slice(0, 10);

  const [openComp, overdue, expiring] = await Promise.all([
    sb.from("complaints").select("*, customer:customers(name)")
      .neq("status", "resolved").order("created_at", { ascending: false }).limit(4),
    sb.from("invoices").select("*, customer:customers(name)")
      .eq("status", "pending").lt("due_date", todayISO)
      .order("due_date", { ascending: true }).limit(4),
    sb.from("amc_contracts").select("*, customer:customers(name)")
      .gte("renewal_iso", todayISO).lte("renewal_iso", in7ISO).limit(4),
  ]);

  const alerts = [];
  for (const c of (openComp.data ?? [])) {
    alerts.push({
      sev:  c.severity === "high" ? "high" : c.severity === "medium" ? "med" : "low",
      title: `${c.customer?.name || "Customer"} — ${c.reason}`,
      sub:   `Complaint #${c.id.slice(0, 8)} · ${timeAgo(c.created_at)} ago · ${c.severity}`,
      action: "OPEN",
    });
  }
  for (const i of (overdue.data ?? [])) {
    const days = Math.floor((today.getTime() - new Date(i.due_date).getTime()) / 86400000);
    alerts.push({
      sev:   days > 7 ? "high" : "med",
      title: `Invoice #${i.id.slice(0, 8)} — ${days} d overdue · $${i.amount}`,
      sub:   `${i.customer?.name || "—"} · ${i.status}`,
      action: "OPEN",
    });
  }
  for (const a of (expiring.data ?? [])) {
    const days = Math.ceil((new Date(a.renewal_iso).getTime() - today.getTime()) / 86400000);
    alerts.push({
      sev:   days <= 3 ? "high" : "med",
      title: `AMC renewal · ${a.customer?.name || "Customer"} — expires in ${days} d`,
      sub:   `${a.tier} tier · renewal ${a.renewal_iso}`,
      action: "OPEN",
    });
  }

  renderAlerts(alerts);
}

function renderAlerts(items) {
  const el = $("#alerts");
  if (!el) return;
  const high = items.filter((a) => a.sev === "high").length;
  const chip = $("#alerts-chip");
  if (chip) chip.textContent = `${high} high`;
  if (!items.length) {
    el.innerHTML = `<div class="empty"><b>All clear.</b><br/>No active alerts.</div>`;
    return;
  }
  el.innerHTML = items.map((a) => `
    <div class="alert ${esc(a.sev)}">
      <span class="ico">${a.sev === "high" ? "!" : a.sev === "med" ? "⚠" : "i"}</span>
      <div class="msg">
        <div class="ttl">${esc(a.title)}</div>
        <div class="sub">${esc(a.sub)}</div>
      </div>
      <span class="go">${esc(a.action)} →</span>
    </div>
  `).join("");
}

// ─── data tables ────────────────────────────────────────────────────────────
function renderTable(name, html, cols) {
  const tbody = $(`#tb-${name}`);
  if (!tbody) return;
  tbody.innerHTML = html || `<tr><td colspan="${cols}" class="empty"><b>No ${esc(name)}.</b></td></tr>`;
}
function setCount(name, n) {
  const el = $(`#count-${name}`);
  if (el) el.textContent = n;
}

async function loadJobs() {
  const { data } = await sb.from("jobs")
    .select("*, customer:customers(name, phone)")
    .order("slot_iso", { ascending: false }).limit(50);
  const rows = data ?? [];
  renderTable("jobs", rows.map((j) => `
    <tr>
      <td class="mono">${esc(fmtDateTime(j.slot_iso))}</td>
      <td><span class="pri">${esc(j.customer?.name || "Customer")}</span><br/><span class="mono" style="color:var(--muted); font-size:11px;">${esc(maskPhone(j.customer?.phone || ""))}</span></td>
      <td>${esc(serviceLabel(j.service_type))}</td>
      <td>${esc(j.address || "—")}</td>
      <td>—</td>
      <td><span class="pill ${esc(j.status)}">${esc(j.status)}</span></td>
      <td class="mono" style="text-align:right;">#${esc(j.id.slice(0, 8))}</td>
    </tr>
  `).join(""), 7);
  setCount("jobs", rows.length);
}

async function loadAmc() {
  const { data } = await sb.from("amc_contracts")
    .select("*, customer:customers(name, phone, address)")
    .order("renewal_iso", { ascending: true }).limit(50);
  const rows = data ?? [];
  const today = Date.now();
  renderTable("amc", rows.map((a) => {
    const days = Math.ceil((new Date(a.renewal_iso).getTime() - today) / 86400000);
    return `
      <tr>
        <td>
          <span class="pri">${esc(a.customer?.name || "Customer")}</span><br/>
          <span class="mono" style="color:var(--muted); font-size:11px;">${esc(maskPhone(a.customer?.phone || ""))} · ${esc(a.customer?.address || "—")}</span>
        </td>
        <td><span class="pill ${esc(a.tier)}">${esc(a.tier)}</span></td>
        <td class="mono">${esc(a.renewal_iso)}</td>
        <td class="mono">${days} d</td>
        <td class="mono">${esc(fmtDate(a.updated_at))}</td>
        <td class="mono" style="color:var(--muted);">${days <= 7 ? "due" : "scheduled"}</td>
      </tr>
    `;
  }).join(""), 6);
  setCount("amc", rows.length);
}

async function loadInvoices() {
  const { data } = await sb.from("invoices")
    .select("*, customer:customers(name, phone), job:jobs(id)")
    .order("due_date", { ascending: false }).limit(50);
  const rows = data ?? [];
  renderTable("invoices", rows.map((i) => `
    <tr>
      <td class="mono pri">#${esc(i.id.slice(0, 8))}</td>
      <td><span class="pri">${esc(i.customer?.name || "Customer")}</span><br/><span class="mono" style="color:var(--muted); font-size:11px;">${esc(maskPhone(i.customer?.phone || ""))}</span></td>
      <td class="mono">${i.job?.id ? `#${esc(i.job.id.slice(0, 8))}` : "—"}</td>
      <td class="mono">${esc(i.due_date)}</td>
      <td style="text-align:right;"><span class="amt">$${Number(i.amount).toLocaleString()}</span></td>
      <td><span class="pill ${esc(i.status)}">${esc(i.status)}</span></td>
    </tr>
  `).join(""), 6);
  setCount("invoices", rows.length);
}

async function loadComplaints() {
  const { data } = await sb.from("complaints")
    .select("*, customer:customers(name, phone)")
    .order("created_at", { ascending: false }).limit(50);
  const rows = data ?? [];
  renderTable("complaints", rows.map((c) => `
    <tr>
      <td class="mono pri">#${esc(c.id.slice(0, 8))}</td>
      <td><span class="pri">${esc(c.customer?.name || "Unknown")}</span><br/><span class="mono" style="color:var(--muted); font-size:11px;">${esc(maskPhone(c.customer?.phone || ""))}</span></td>
      <td>${esc(c.reason)}</td>
      <td><span class="pill ${esc(c.severity)}">${esc(c.severity)}</span></td>
      <td><span class="pill ${esc(c.status)}">${esc(c.status.replace(/_/g, " "))}</span></td>
      <td class="mono">${esc(fmtDateTime(c.created_at))}</td>
    </tr>
  `).join(""), 6);
  setCount("complaints", rows.length);
}

async function loadReminders() {
  const { data } = await sb.from("reminders")
    .select("*, customer:customers(name)")
    .order("fire_at_iso", { ascending: true }).limit(50);
  const rows = data ?? [];
  renderTable("reminders", rows.map((r) => `
    <tr>
      <td class="mono">${esc(fmtDateTime(r.fire_at_iso))}</td>
      <td><span class="pri">${esc(r.customer?.name || "Customer")}</span></td>
      <td><span class="pill ${r.kind === "invoice" ? "pending" : "scheduled"}">${esc(r.kind)}</span></td>
      <td><span class="mono" style="color:var(--ink-dim); font-size:11px;">${esc(JSON.stringify(r.payload || {}).slice(0, 80))}</span></td>
      <td><span class="pill ${r.fired_at ? "completed" : "pending"}">${r.fired_at ? "fired" : "queued"}</span></td>
    </tr>
  `).join(""), 5);
  setCount("reminders", rows.length);
}

async function loadCustomers() {
  const { data } = await sb.from("customers")
    .select("*")
    .order("updated_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  renderTable("customers", rows.map((c) => {
    const tier = c.amc_tier || "none";
    return `
      <tr>
        <td><span class="pri">${esc(c.name || "Unknown")}</span></td>
        <td class="mono" style="font-size:12px;">${esc(maskPhone(c.phone))}</td>
        <td><span class="pill ${esc(tier)}">${esc(tier)}</span></td>
        <td class="mono">${esc(c.wa_stage.replace(/_/g, " "))}</td>
        <td class="mono">${esc(fmtDateTime(c.created_at))}</td>
        <td class="mono">${esc(fmtDateTime(c.updated_at))}</td>
      </tr>
    `;
  }).join(""), 6);
  setCount("customers", rows.length);
}

// ─── realtime subscriptions ────────────────────────────────────────────────
function subscribe() {
  const channels = [
    { tbl: "customers",     onChange: () => { loadConversations(); loadCustomers(); loadStats(); } },
    { tbl: "jobs",          onChange: () => { loadTodayJobs(); loadJobs(); loadStats(); } },
    { tbl: "amc_contracts", onChange: () => { loadAmc(); loadStats(); loadAlerts(); } },
    { tbl: "invoices",      onChange: () => { loadInvoices(); loadStats(); loadAlerts(); } },
    { tbl: "complaints",    onChange: () => { loadComplaints(); loadAlerts(); } },
    { tbl: "reminders",     onChange: () => { loadReminders(); } },
  ];

  let subscribed = 0;
  for (const { tbl, onChange } of channels) {
    sb.channel(`rt:${tbl}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tbl }, (payload) => {
        toast(`<b>${esc(tbl)}</b> ${esc(payload.eventType.toLowerCase())}`);
        onChange();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed++;
          if (subscribed === channels.length) setConn("ok", "Live · realtime ok");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConn("err", "Disconnected");
        }
      });
  }
}

// ─── UI interactions (event delegation) ─────────────────────────────────────
function setupInteractions() {
  // breadcrumb nav — scroll to section + switch data tab when applicable
  const NAV_TARGETS = {
    "dashboard":     { kind: "top" },
    "conversations": { kind: "scroll", selector: ".grid" },
    "jobs":          { kind: "tab", tab: "jobs" },
    "amc":           { kind: "tab", tab: "amc" },
    "invoices":      { kind: "tab", tab: "invoices" },
    "customers":     { kind: "tab", tab: "customers" },
  };
  $$(".crumb a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      $$(".crumb a").forEach((x) => x.classList.remove("active"));
      a.classList.add("active");

      const label = a.textContent.trim().toLowerCase();
      const target = NAV_TARGETS[label];
      if (!target) return;

      if (target.kind === "top") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (target.kind === "scroll") {
        document.querySelector(target.selector)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (target.kind === "tab") {
        const tabBtn = document.querySelector(`.tab[data-tab="${target.tab}"]`);
        if (tabBtn) {
          tabBtn.click();
          document.querySelector(".tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });

  // conversation filter chips
  $$('[data-group="conv-filter"] .chip').forEach((c) => {
    c.addEventListener("click", () => {
      $$('[data-group="conv-filter"] .chip').forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
      convFilter = c.dataset.filter || "all";
      renderConversations();
    });
  });

  // conversation row clicks (delegated — rows are re-rendered)
  $("#conv-feed")?.addEventListener("click", (e) => {
    const row = e.target.closest(".row-conv");
    if (!row) return;
    row.classList.add("flash");
    setTimeout(() => row.classList.remove("flash"), 600);
    const nm = row.querySelector(".nm")?.textContent || "Customer";
    const st = row.querySelector(".stage")?.textContent || "—";
    toast(`<b>Open</b> ${esc(nm)} · ${esc(st)}`);
  });

  // alerts (delegated)
  $("#alerts")?.addEventListener("click", (e) => {
    const go = e.target.closest(".go");
    if (!go) return;
    const a = go.closest(".alert");
    a.classList.add("flash");
    setTimeout(() => a.classList.remove("flash"), 600);
    const ttl = a.querySelector(".ttl")?.textContent || "";
    toast(`<b>${esc(go.textContent.replace("→", "").trim())}</b> ${esc(ttl.slice(0, 48))}…`);
  });

  // today-jobs (delegated)
  $("#today-jobs")?.addEventListener("click", (e) => {
    const j = e.target.closest(".job");
    if (!j) return;
    j.classList.add("flash");
    setTimeout(() => j.classList.remove("flash"), 600);
    const svc = j.querySelector(".svc")?.textContent || "Job";
    toast(`<b>Job</b> ${esc(svc)}`);
  });

  // tabs
  const tabs   = $$(".tabs-list .tab");
  const panels = $$(".tab-panel");
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("on"));
      t.classList.add("on");
      const name = t.dataset.tab;
      panels.forEach((p) => p.classList.toggle("on", p.dataset.panel === name));
      applySearch();
    });
  });

  // search
  const search = $(".tab-actions input");
  if (search) {
    let st;
    search.addEventListener("input", () => {
      clearTimeout(st);
      st = setTimeout(applySearch, 120);
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { search.value = ""; applySearch(); }
    });
  }
  function applySearch() {
    const q = (search?.value || "").trim().toLowerCase();
    const active = $(".tab-panel.on");
    if (!active) return;
    active.querySelectorAll("tbody tr").forEach((tr) => {
      const match = !q || tr.textContent.toLowerCase().includes(q);
      tr.classList.toggle("hide", !match);
    });
  }

  // export CSV
  $$(".tab-actions .chip").forEach((c) => {
    c.addEventListener("click", () => {
      const panel = $(".tab-panel.on");
      if (!panel) return;
      const tab = $(".tab.on")?.dataset.tab || "data";
      const csv = [...panel.querySelectorAll("tr")]
        .filter((tr) => !tr.classList.contains("hide"))
        .map((tr) => [...tr.querySelectorAll("th,td")]
          .map((td) => `"${td.innerText.replace(/\s+/g, " ").trim().replace(/"/g, '""')}"`)
          .join(",")).join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `senaq-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`<b>Export</b> ${esc(tab)}.csv`);
    });
  });

  // panel chips (jobs/alerts) — visual toggle + feedback
  $$(".panel-actions .chip").forEach((c) => {
    if (c.closest('[data-group="conv-filter"]')) return;
    c.addEventListener("click", () => {
      const group = c.parentElement.querySelectorAll(".chip");
      group.forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
    });
  });

  // live indicator + avatar + footer
  $(".live")?.addEventListener("click", () => toast(`<b>Realtime</b> ${esc($(".live")?.dataset.state || "—")}`));
  $(".avatar")?.addEventListener("click", async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    if (confirm(`Sign out ${session.user.email}?`)) {
      await sb.auth.signOut();
    }
  });
  $$(".footnote span").forEach((s) => {
    s.style.cursor = "pointer";
    s.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  });

  // keyboard: / focuses search
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      $(".tab-actions input")?.focus();
    }
  });
}

// ─── clock ──────────────────────────────────────────────────────────────────
function setupClock() {
  const el = $("#clk");
  if (!el) return;
  const pad = (n) => String(n).padStart(2, "0");
  const tick = () => {
    const now = new Date();
    el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);

  // page-head: date + last-sync labels
  const dateEl = $("#page-date");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString([], {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
  }
  const syncEl = $("#page-sync");
  if (syncEl) {
    syncEl.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    setInterval(() => {
      syncEl.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      });
    }, 1000);
  }
}

// ─── timeago tick (refresh relative times every 30s without re-fetching) ────
function setupAgoTick() {
  setInterval(() => {
    $$(".row-conv .ago").forEach((el) => {
      const id = el.closest(".row-conv")?.dataset.id;
      const c = convCache.find((x) => x.id === id);
      if (c) el.textContent = timeAgo(c.updated_at);
    });
  }, 30 * 1000);
}

// ─── setup card when config is missing ──────────────────────────────────────
function showSetupCard() {
  const card = document.createElement("div");
  card.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99;display:flex;align-items:center;justify-content:center;padding:24px;";
  card.innerHTML = `
    <div style="max-width:560px;border:1px solid #2E2E2E;background:#0A0A0A;padding:36px;border-radius:12px;font-family:system-ui;color:#E8EEEA;">
      <div style="font-size:24px;margin-bottom:8px;">Setup required</div>
      <div style="color:#808080;font-size:13px;margin-bottom:24px;">The dashboard needs Supabase credentials to read data.</div>
      <ol style="line-height:1.7;color:#C8C8C8;font-size:13px;padding-left:20px;">
        <li>Run <code style="background:#1A1A1A;padding:2px 6px;border-radius:3px;">supabase/migrations/0003_dashboard_realtime.sql</code> in your Supabase SQL editor.</li>
        <li>Copy <code style="background:#1A1A1A;padding:2px 6px;border-radius:3px;">dashboard/config.example.js</code> → <code style="background:#1A1A1A;padding:2px 6px;border-radius:3px;">dashboard/config.js</code>.</li>
        <li>Fill in <b>SUPABASE_URL</b> and <b>SUPABASE_ANON_KEY</b> (Supabase dashboard → Project Settings → API).</li>
        <li>Reload this page.</li>
      </ol>
      <div style="margin-top:24px;font-size:11px;color:#4D4D4D;font-family:ui-monospace,monospace;">
        See dashboard/README.md for details.
      </div>
    </div>
  `;
  document.body.appendChild(card);
}

// ─── auth ───────────────────────────────────────────────────────────────────
function showLogin(email = "") {
  $("#login")?.classList.add("on");
  $(".shell")?.classList.add("locked");
  const inp = $("#login-email");
  if (inp && email) inp.value = email;
}
function hideLogin() {
  $("#login")?.classList.remove("on");
  $(".shell")?.classList.remove("locked");
}
function setLoginStatus(msg, kind = "info") {
  const el = $("#login-status");
  if (!el) return;
  el.textContent = msg;
  el.dataset.kind = kind;
}

async function signInWithPassword(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    setLoginStatus(error.message || "Sign-in failed.", "err");
    return false;
  }
  // onAuthStateChange handles the rest (UI swap + data load)
  return true;
}

async function sendMagicLink(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
      shouldCreateUser: false,
    },
  });
  if (error) {
    setLoginStatus(error.message || "Could not send link.", "err");
    return false;
  }
  setLoginStatus(`Link sent to ${email}. Check your inbox.`, "ok");
  return true;
}

function setupLoginForm() {
  const form = $("#login-form");
  if (!form) return;

  const emailInput = $("#login-email");
  const pwInput = $("#login-password");

  // primary submit → password sign-in
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = pwInput.value;
    if (!email || !email.includes("@")) {
      setLoginStatus("Enter a valid email address.", "err");
      return;
    }
    if (!password) {
      setLoginStatus("Enter your password, or use the magic-link option below.", "err");
      return;
    }
    setLoginStatus("Signing in…", "info");
    await signInWithPassword(email, password);
  });

  // secondary → magic link (no password needed)
  $("#login-magic")?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email || !email.includes("@")) {
      setLoginStatus("Enter your email first.", "err");
      return;
    }
    setLoginStatus("Sending link…", "info");
    await sendMagicLink(email);
  });

  $("#sign-out")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    // onAuthStateChange handles the redirect to login
  });
}

let dataLoaded = false;
async function loadAllAndSubscribe() {
  if (dataLoaded) return;
  dataLoaded = true;
  setConn("pending", "Connecting…");
  try {
    await Promise.all([
      loadStats(),
      loadConversations(),
      loadTodayJobs(),
      loadAlerts(),
      loadJobs(),
      loadAmc(),
      loadInvoices(),
      loadComplaints(),
      loadReminders(),
      loadCustomers(),
    ]);
  } catch (err) {
    console.error("Initial load failed", err);
    setConn("err", "Load failed");
    toast(`<b>Error</b> ${esc(err.message || "load failed")}`);
  }
  subscribe();
}

function displayNameFromSession(session) {
  const u = session?.user;
  if (!u) return null;
  // Prefer explicit display name set in user_metadata; fall back to the
  // local-part of the email (everything before the @).
  const meta = u.user_metadata || {};
  const explicit = meta.name || meta.full_name || meta.display_name;
  if (explicit && typeof explicit === "string") return explicit.trim();
  if (u.email) {
    const local = u.email.split("@")[0] || u.email;
    // Title-case "first.last" or "first_last" → "First Last"
    return local
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  return null;
}

function setSignedInUI(session) {
  hideLogin();
  const av = $(".avatar");
  const name = displayNameFromSession(session);

  if (av && session?.user?.email) {
    av.textContent = (name?.[0] || session.user.email[0]).toUpperCase();
    av.title = `${name || session.user.email} · click to sign out`;
  }

  const pageUser = $("#page-user");
  if (pageUser) pageUser.textContent = name || "there";
}

// ─── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  setupClock();
  setupInteractions();
  setupAgoTick();
  setupLoginForm();

  // initial session check
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    setSignedInUI(session);
    await loadAllAndSubscribe();
  } else {
    showLogin();
    setLoginStatus("Sign in with the email your administrator added in Supabase.", "info");
  }

  // react to auth state changes (sign-in via magic link, sign-out, refresh)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session) {
      setSignedInUI(session);
      toast(`<b>Signed in</b> ${esc(session.user.email)}`);
      await loadAllAndSubscribe();
      // strip the access_token from the URL hash so a refresh stays clean
      if (window.location.hash.includes("access_token")) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } else if (event === "SIGNED_OUT") {
      dataLoaded = false;
      window.location.reload();
    }
  });
}

boot();
