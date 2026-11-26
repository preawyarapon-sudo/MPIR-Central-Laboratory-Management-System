// MPIR Central Lab — user & permission management (Release 5, option 1).
//
// Permissions are checked in the app (menus/buttons hidden, and every save
// path checks before writing). The database itself is NOT locked by this —
// that was option 3, not chosen (see the UI/UX proposal, Revision 2).
//
// A permission is "module.action". A user's permissions = their role's
// defaults, plus their own extra grants, minus their own restrictions
// (a restriction always wins). The settings live in labtrack/access.

export const ACTIONS = [
  { key: "view", label: "ดู", short: "V" },
  { key: "create", label: "สร้าง", short: "C" },
  { key: "edit", label: "แก้ไข", short: "E" },
  { key: "delete", label: "ลบ", short: "D" },
  { key: "approve", label: "อนุมัติ", short: "A" },
  { key: "export", label: "ส่งออก/พิมพ์", short: "P" },
];
const VCEDP = ["view", "create", "edit", "delete", "export"];
const VCEDAP = ["view", "create", "edit", "delete", "approve", "export"];

export const MODULES = [
  { key: "dashboard", area: "จัดการห้องแล็บ", label: "แดชบอร์ด", actions: ["view"] },
  { key: "equipment", area: "จัดการห้องแล็บ", label: "เครื่องมือ", actions: VCEDP },
  { key: "items", area: "จัดการห้องแล็บ", label: "อุปกรณ์", actions: VCEDP },
  { key: "bookings", area: "จัดการห้องแล็บ", label: "จอง/ยืมเครื่องมือ", actions: VCEDAP },
  { key: "calendar", area: "จัดการห้องแล็บ", label: "ปฏิทิน · รายการที่ยืมได้", actions: ["view"] },
  { key: "chemicals", area: "จัดการห้องแล็บ", label: "สารเคมี", actions: VCEDP },
  { key: "consumables", area: "จัดการห้องแล็บ", label: "พัสดุสิ้นเปลือง", actions: VCEDP },
  { key: "purchase", area: "จัดการห้องแล็บ", label: "ใบขอซื้อ (PR)", actions: VCEDP },
  { key: "reports", area: "จัดการห้องแล็บ", label: "รายงาน", actions: ["view", "export"] },
  { key: "instruments", area: "Instrument Assurance System", label: "ทะเบียนเครื่องมือ", actions: VCEDP },
  { key: "history", area: "Instrument Assurance System", label: "ประวัติเครื่องมือ (LF-033)", actions: VCEDP },
  { key: "calibration", area: "Instrument Assurance System", label: "สอบเทียบ/ทวนสอบ (LF-068)", actions: VCEDAP },
  { key: "dailyCheck", area: "Instrument Assurance System", label: "Daily check", actions: VCEDAP },
  { key: "intermediateCheck", area: "Instrument Assurance System", label: "Intermediate check", actions: VCEDAP },
  { key: "uncertainty", area: "Instrument Assurance System", label: "ความไม่แน่นอน", actions: VCEDP },
  { key: "qr", area: "Instrument Assurance System", label: "พิมพ์ QR", actions: ["view", "export"] },
  { key: "jobs", area: "ติดตามงานวิเคราะห์", label: "งานวิเคราะห์", actions: VCEDP },
  { key: "analysisProgress", area: "ติดตามงานวิเคราะห์", label: "ความคืบหน้า (Parameters/Analysts)", actions: ["view", "edit"] },
  { key: "analysisReports", area: "ติดตามงานวิเคราะห์", label: "LF-045 · Excel", actions: ["view", "export"] },
  { key: "users", area: "ผู้ดูแลระบบ", label: "ผู้ใช้และสิทธิ์", actions: ["view", "edit"] },
];
export const ROLE_LABEL = { admin: "Admin", approver: "Approver", booking: "Booking", guest: "QR guest" };

const all = (except = []) => MODULES.filter(m => !except.includes(m.key)).flatMap(m => m.actions.map(a => `${m.key}.${a}`));

// Starting point = what each role could do before Release 5, so nothing
// changes for anyone until an admin edits it.
export const DEFAULT_ROLES = {
  admin: all(["users"]),
  approver: all(["users"]),
  booking: ["dashboard.view", "bookings.view", "bookings.create", "bookings.edit", "calendar.view", "jobs.view", "analysisProgress.view"],
  guest: ["dailyCheck.view", "dailyCheck.create", "instruments.view", "history.view"],
};
// Lab decision 26 พ.ย. 2569: yaraponp is the only admin of users/permissions;
// the shared lab account mpirlab cannot approve or delete.
export const DEFAULT_USERS = {
  yaraponp: { grant: ["users.view", "users.edit"], deny: [] },
  mpirlab: { grant: [], deny: MODULES.flatMap(m => m.actions.filter(a => a === "approve" || a === "delete").map(a => `${m.key}.${a}`)) },
};

// ---- the current user and settings (one per browser tab) ----
const state = { user: null, role: "guest", config: null, listeners: new Set() };
export function configOrDefault() {
  const c = state.config || {};
  return { roles: { ...DEFAULT_ROLES, ...(c.roles || {}) }, users: { ...DEFAULT_USERS, ...(c.users || {}) }, log: c.log || [] };
}
export function effectivePermissions(username, role, config = configOrDefault()) {
  const set = new Set(config.roles[role] || []);
  const u = config.users[username] || {};
  (u.grant || []).forEach(k => set.add(k));
  (u.deny || []).forEach(k => set.delete(k));
  return set;
}
export function setCurrentUser(username, role) {
  state.user = username || null; state.role = role || "guest"; emit();
}
export function primeCurrentUser(username, role) { state.user = username || null; state.role = role || "guest"; }
export function setAccessConfig(config) { state.config = config || null; emit(); }
export function getAccessState() { return { user: state.user, role: state.role, config: configOrDefault() }; }
// An admin can move an account to another role in ผู้ใช้และสิทธิ์.
export function effectiveRole(username, accountRole, config = configOrDefault()) {
  return (username && config.users[username]?.role) || accountRole;
}
export function currentRole() { return effectiveRole(state.user, state.role); }
export function can(module, action = "view") {
  return effectivePermissions(state.user, currentRole()).has(`${module}.${action}`);
}
export function subscribeAccess(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
function emit() { state.listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } }); }

// Load / save the settings (labtrack/access). Missing = defaults.
export async function loadAccessConfig() {
  try { const r = await window.storage.get("access"); setAccessConfig(JSON.parse(r.value)); }
  catch { setAccessConfig(null); }
}
export async function saveAccessConfig(next) {
  await window.storage.set("access", JSON.stringify(next));
  setAccessConfig(next);
}

// ---- message shown when something is not allowed ----
const ACTION_TH = Object.fromEntries(ACTIONS.map(a => [a.key, a.label]));
export function deniedText(module, action) {
  const m = MODULES.find(x => x.key === module);
  return `ไม่มีสิทธิ์${ACTION_TH[action] || action}${m ? ` (${m.label})` : ""}`;
}
let notifier = (msg) => { try { window.alert(msg); } catch { /* ignore */ } };
export function setDeniedNotifier(fn) { notifier = fn; }
export function guard(module, action) {
  if (can(module, action)) return true;
  notifier(deniedText(module, action));
  return false;
}

// ---- classify a whole-list save into create / edit / delete / approve ----
const APPROVAL_KEYS = new Set(["approved", "approvedBy", "approvedByName", "approvedByUsername", "approvedAt", "approvalDate",
  "evaluatedBy", "evaluationDate", "reviewedBy", "reviewDate", "rejected", "rejectedBy", "rejectReason", "approverName", "decidedAt", "decidedBy"]);
const IGNORE_KEYS = new Set(["editLog", "updatedAt", "_notice"]);
function changedKeys(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].filter(k => !IGNORE_KEYS.has(k) && JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
}
export function listActions(prev = [], next = []) {
  const prevById = new Map((prev || []).map(x => [x?.id, x]));
  const nextIds = new Set((next || []).map(x => x?.id));
  const acts = new Set();
  (next || []).forEach(x => {
    const old = prevById.get(x?.id);
    if (!old) { acts.add("create"); return; }
    if (old === x) return;
    const ch = changedKeys(old, x);
    if (!ch.length) return;
    const statusDecision = ch.includes("status") && old.status === "pending" && ["approved", "rejected"].includes(x.status);
    const approvalOnly = ch.every(k => APPROVAL_KEYS.has(k) || (k === "status" && statusDecision) || k.toLowerCase().includes("approv"));
    if (ch.some(k => APPROVAL_KEYS.has(k)) || statusDecision) acts.add("approve");
    if (!approvalOnly) acts.add("edit");
  });
  (prev || []).forEach(x => { if (!nextIds.has(x?.id)) acts.add("delete"); });
  return [...acts];
}
// True when every action in this save is allowed; otherwise tells the user.
export function guardList(module, prev, next) {
  // A module with no separate "approve" (or other) action treats it as edit.
  const own = MODULES.find(m => m.key === module)?.actions || [];
  const acts = [...new Set(listActions(prev, next).map(a => own.includes(a) ? a : "edit"))];
  const missing = acts.filter(a => !can(module, a));
  if (!missing.length) return true;
  notifier(deniedText(module, missing[0]));
  return false;
}
