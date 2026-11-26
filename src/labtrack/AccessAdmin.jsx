// ผู้ใช้และสิทธิ์ — admin page for per-user and per-role permissions
// (Release 5). Accounts, usernames and passwords are not shown or changed
// here; only what each account may do. See access.js for the rules.
import { useState, useEffect } from "react";
import {
  ACTIONS, MODULES, ROLE_LABEL, DEFAULT_ROLES, configOrDefault,
  saveAccessConfig, subscribeAccess,
} from "./access.js";
import { mpirConfirm, mpirAlert } from "./LabTrackApp.jsx";

const T = {
  primary: "var(--mpir-primary, #1F5FA8)", light: "var(--mpir-primary-light, #EAF2FB)", border: "var(--mpir-border, #D9E1EA)",
  text: "var(--mpir-text, #1B2430)", muted: "var(--mpir-text-2, #5B6675)", good: "#1E8E5A", bad: "#C0392B",
};
const card = { background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 };
const btn = (primary) => ({ minHeight: 38, padding: "0 14px", borderRadius: 8, border: primary ? "none" : `1px solid ${T.border}`, background: primary ? T.primary : "#fff", color: primary ? "#fff" : T.text, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer" });
const AREAS = [...new Set(MODULES.map(m => m.area))];

function useAccessTick() {
  const [, set] = useState(0);
  useEffect(() => subscribeAccess(() => set(x => x + 1)), []);
}

// One cell of the grid. state: "role" (from role), "grant", "deny", "none", "na"
function Cell({ state, onClick, disabled, title }) {
  if (state === "na") return <td style={{ textAlign: "center", color: "#C5CDD6" }}>·</td>;
  const s = {
    role: { bg: T.primary, fg: "#fff", txt: "✓", bd: T.primary },
    grant: { bg: "#E6F4EC", fg: T.good, txt: "+", bd: T.good },
    deny: { bg: "#FBEAE8", fg: T.bad, txt: "–", bd: T.bad },
    none: { bg: "#fff", fg: "#B0B9C3", txt: "", bd: T.border },
  }[state];
  return (
    <td style={{ textAlign: "center", padding: "4px 2px" }}>
      <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
        style={{ width: 30, height: 30, borderRadius: 999, border: `1.5px solid ${s.bd}`, background: s.bg, color: s.fg, fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: "inherit" }}>{s.txt}</button>
    </td>
  );
}

function PermissionGrid({ cellState, onToggle, isDisabled = () => false }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560, fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F5F8FB" }}>
            <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: T.muted }}>โมดูล</th>
            {ACTIONS.map(a => <th key={a.key} style={{ padding: "8px 4px", fontWeight: 600, color: T.muted, whiteSpace: "nowrap" }} title={a.label}>{a.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {AREAS.map(area => [
            <tr key={area}><td colSpan={7} style={{ padding: "10px 10px 4px", fontSize: 11.5, fontWeight: 700, color: T.primary }}>{area}</td></tr>,
            ...MODULES.filter(m => m.area === area).map(m => (
              <tr key={m.key} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: "6px 10px" }}>{m.label}</td>
                {ACTIONS.map(a => {
                  const k = `${m.key}.${a.key}`;
                  if (!m.actions.includes(a.key)) return <Cell key={k} state="na" />;
                  return <Cell key={k} state={cellState(k)} onClick={() => onToggle(k)} disabled={isDisabled(k)} title={`${m.label} · ${a.label}`} />;
                })}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function Legend({ forRole = false }) {
  const item = (bg, bd, fg, txt, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 14 }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: bg, border: `1.5px solid ${bd}`, color: fg, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{txt}</span>{label}
    </span>
  );
  return (
    <div style={{ fontSize: 12, color: T.muted, margin: "8px 0 10px" }}>
      {item(T.primary, T.primary, "#fff", "✓", forRole ? "บทบาทนี้ทำได้" : "ตามบทบาท")}
      {!forRole && item("#E6F4EC", T.good, T.good, "+", "เพิ่มสิทธิ์ให้คนนี้")}
      {!forRole && item("#FBEAE8", T.bad, T.bad, "–", "จำกัดสิทธิ์คนนี้")}
      {item("#fff", T.border, "#fff", "", "ไม่มีสิทธิ์")}
      <span>· กดที่วงกลมเพื่อเปลี่ยน</span>
    </div>
  );
}

export default function AccessAdmin({ accounts, me }) {
  useAccessTick();
  const [tab, setTab] = useState("users");
  const cfg = configOrDefault();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, color: T.text }}>ผู้ใช้และสิทธิ์</h2>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>กำหนดว่าแต่ละบัญชีทำอะไรได้บ้าง · ชื่อผู้ใช้และรหัสผ่านไม่แสดงและไม่เปลี่ยนในหน้านี้ · สิทธิ์ตรวจในแอป (ซ่อนปุ่มและตรวจก่อนบันทึก)</div>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[["users", "ผู้ใช้"], ["roles", "บทบาท"], ["log", "ประวัติการเปลี่ยนแปลง"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ ...btn(false), borderRadius: 999, background: tab === k ? T.light : "#fff", borderColor: tab === k ? T.primary : T.border, color: tab === k ? T.primary : T.text }}>{l}</button>
        ))}
      </div>
      {tab === "users" && <UsersTab accounts={accounts} me={me} cfg={cfg} />}
      {tab === "roles" && <RolesTab accounts={accounts} me={me} cfg={cfg} />}
      {tab === "log" && <LogTab cfg={cfg} />}
    </div>
  );
}

// Save the whole settings object with one log line (newest first, last 500).
async function commit(cfg, change, me) {
  const entry = { at: new Date().toISOString(), by: me, ...change.log };
  await saveAccessConfig({ roles: cfg.roles, users: cfg.users, ...change.patch(cfg), log: [entry, ...(cfg.log || [])].slice(0, 500) });
}

function UsersTab({ accounts, me, cfg }) {
  const [q, setQ] = useState("");
  const [roleF, setRoleF] = useState("all");
  const [sel, setSel] = useState(accounts[0]?.username || "");
  const [draft, setDraft] = useState(null); // { role, grant:Set, deny:Set }
  const acc = accounts.find(a => a.username === sel);
  const saved = cfg.users[sel] || {};
  const base = { role: saved.role || acc?.role || "booking", grant: new Set(saved.grant || []), deny: new Set(saved.deny || []) };
  const cur = draft || base;
  useEffect(() => { setDraft(null); }, [sel]);
  const roleSet = new Set(cfg.roles[cur.role] || []);
  const overrides = (u) => { const x = cfg.users[u] || {}; return (x.grant || []).length + (x.deny || []).length; };
  const shown = accounts.filter(a => (roleF === "all" || (cfg.users[a.username]?.role || a.role) === roleF)
    && (!q.trim() || `${a.name || ""} ${a.username}`.toLowerCase().includes(q.trim().toLowerCase())));
  const state = (k) => cur.deny.has(k) ? "deny" : cur.grant.has(k) ? "grant" : roleSet.has(k) ? "role" : "none";
  const selfUsers = (k) => sel === me && k.startsWith("users.");
  function toggle(k) {
    const grant = new Set(cur.grant), deny = new Set(cur.deny);
    if (roleSet.has(k)) { if (deny.has(k)) deny.delete(k); else deny.add(k); grant.delete(k); }
    else { if (grant.has(k)) grant.delete(k); else grant.add(k); deny.delete(k); }
    setDraft({ ...cur, grant, deny });
  }
  const dirty = !!draft;
  async function save() {
    const added = [...cur.grant].filter(k => !base.grant.has(k)), removedG = [...base.grant].filter(k => !cur.grant.has(k));
    const denied = [...cur.deny].filter(k => !base.deny.has(k)), undenied = [...base.deny].filter(k => !cur.deny.has(k));
    const roleChanged = cur.role !== base.role;
    const lines = [
      roleChanged && `บทบาท: ${ROLE_LABEL[base.role] || base.role} → ${ROLE_LABEL[cur.role] || cur.role}`,
      added.length && `เพิ่มสิทธิ์: ${added.join(", ")}`, removedG.length && `เลิกเพิ่มสิทธิ์: ${removedG.join(", ")}`,
      denied.length && `จำกัดสิทธิ์: ${denied.join(", ")}`, undenied.length && `เลิกจำกัด: ${undenied.join(", ")}`,
    ].filter(Boolean);
    if (!lines.length) { setDraft(null); return; }
    if (!(await mpirConfirm(`บันทึกสิทธิ์ของ ${acc?.name || sel} (${sel})?\n\n${lines.join("\n")}`))) return;
    try {
      await commit(cfg, {
        log: { target: sel, changes: lines },
        patch: (c) => ({ users: { ...c.users, [sel]: { ...(c.users[sel] || {}), role: cur.role !== acc?.role ? cur.role : undefined, grant: [...cur.grant], deny: [...cur.deny] } } }),
      }, me);
      setDraft(null);
    } catch (e) { mpirAlert("บันทึกไม่สำเร็จ: " + (e?.message || e)); }
  }
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ ...card, flex: "1 1 260px", maxWidth: 340, padding: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ / username" aria-label="ค้นหาผู้ใช้"
          style={{ width: "100%", boxSizing: "border-box", height: 38, border: `1px solid ${T.border}`, borderRadius: 8, padding: "0 10px", fontFamily: "inherit", fontSize: 13.5 }} />
        <select value={roleF} onChange={e => setRoleF(e.target.value)} aria-label="กรองบทบาท"
          style={{ width: "100%", height: 36, marginTop: 8, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13 }}>
          <option value="all">ทุกบทบาท ({accounts.length})</option>
          {["admin", "approver", "booking"].map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <div style={{ marginTop: 8, maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {shown.map(a => {
            const on = a.username === sel; const n = overrides(a.username); const r = cfg.users[a.username]?.role || a.role;
            return (
              <button key={a.username} onClick={() => setSel(a.username)}
                style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: `1px solid ${on ? T.primary : "transparent"}`, background: on ? T.light : "transparent", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{a.name || a.username}</div>
                <div style={{ fontSize: 11.5, color: T.muted }}>{a.username} · {ROLE_LABEL[r] || r}{n ? ` · ข้อยกเว้น ${n}` : ""}</div>
              </button>
            );
          })}
          {!shown.length && <div style={{ fontSize: 12.5, color: T.muted, padding: 8 }}>ไม่พบผู้ใช้</div>}
        </div>
      </div>
      {acc && (
        <div style={{ ...card, flex: "3 1 520px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{acc.name || acc.username} <span style={{ fontWeight: 400, color: T.muted, fontSize: 13 }}>· {acc.username}</span></div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, marginLeft: "auto" }}>บทบาท
              <select value={cur.role} onChange={e => setDraft({ ...cur, role: e.target.value })} disabled={sel === me}
                style={{ height: 34, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13 }}>
                {["admin", "approver", "booking"].map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
          </div>
          <Legend />
          <PermissionGrid cellState={state} onToggle={toggle} isDisabled={selfUsers} />
          {sel === me && <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>สิทธิ์ "ผู้ใช้และสิทธิ์" และบทบาทของบัญชีตัวเองแก้ไม่ได้ เพื่อไม่ให้ระบบไม่มีผู้ดูแล</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button style={btn(false)} disabled={!dirty} onClick={() => setDraft(null)}>ยกเลิก</button>
            <button style={{ ...btn(true), opacity: dirty ? 1 : 0.5 }} disabled={!dirty} onClick={save}>บันทึก</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RolesTab({ accounts, me, cfg }) {
  const [role, setRole] = useState("approver");
  const [draft, setDraft] = useState(null);
  useEffect(() => { setDraft(null); }, [role]);
  const base = new Set(cfg.roles[role] || []);
  const cur = draft || base;
  const affected = accounts.filter(a => (cfg.users[a.username]?.role || a.role) === role).length;
  function toggle(k) { const s = new Set(cur); if (s.has(k)) s.delete(k); else s.add(k); setDraft(s); }
  async function save() {
    const added = [...cur].filter(k => !base.has(k)), removed = [...base].filter(k => !cur.has(k));
    const lines = [added.length && `เพิ่ม: ${added.join(", ")}`, removed.length && `ตัดออก: ${removed.join(", ")}`].filter(Boolean);
    if (!lines.length) { setDraft(null); return; }
    if (!(await mpirConfirm(`เปลี่ยนสิทธิ์ตั้งต้นของบทบาท ${ROLE_LABEL[role]} (มีผลกับ ${role === "guest" ? "ผู้สแกน QR ทุกคน" : `${affected} บัญชี`})?\n\n${lines.join("\n")}`))) return;
    try {
      await commit(cfg, { log: { target: `บทบาท ${ROLE_LABEL[role]}`, changes: lines }, patch: (c) => ({ roles: { ...c.roles, [role]: [...cur] } }) }, me);
      setDraft(null);
    } catch (e) { mpirAlert("บันทึกไม่สำเร็จ: " + (e?.message || e)); }
  }
  async function reset() {
    if (!(await mpirConfirm(`คืนค่าบทบาท ${ROLE_LABEL[role]} เป็นค่าตั้งต้น (เหมือนก่อนมีระบบสิทธิ์)?`))) return;
    await commit(cfg, { log: { target: `บทบาท ${ROLE_LABEL[role]}`, changes: ["คืนค่าตั้งต้น"] }, patch: (c) => ({ roles: { ...c.roles, [role]: DEFAULT_ROLES[role] } }) }, me);
    setDraft(null);
  }
  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {["admin", "approver", "booking", "guest"].map(r => (
          <button key={r} onClick={() => setRole(r)} style={{ ...btn(false), borderRadius: 999, background: role === r ? T.light : "#fff", borderColor: role === r ? T.primary : T.border, color: role === r ? T.primary : T.text }}>
            {ROLE_LABEL[r]} {r !== "guest" && <span style={{ fontWeight: 400, color: T.muted }}>({accounts.filter(a => (cfg.users[a.username]?.role || a.role) === r).length})</span>}
          </button>
        ))}
        <button style={{ ...btn(false), marginLeft: "auto" }} onClick={reset}>คืนค่าตั้งต้น</button>
      </div>
      <Legend forRole />
      <PermissionGrid cellState={(k) => cur.has(k) ? "role" : "none"} onToggle={toggle} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button style={btn(false)} disabled={!draft} onClick={() => setDraft(null)}>ยกเลิก</button>
        <button style={{ ...btn(true), opacity: draft ? 1 : 0.5 }} disabled={!draft} onClick={save}>บันทึก</button>
      </div>
    </div>
  );
}

function LogTab({ cfg }) {
  const log = cfg.log || [];
  return (
    <div style={card}>
      {!log.length ? <div style={{ color: T.muted, fontSize: 13 }}>ยังไม่มีการเปลี่ยนแปลงสิทธิ์ · ทุกบัญชีใช้ค่าตั้งต้น</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#F5F8FB", textAlign: "left" }}>
              {["วันเวลา", "โดย", "บัญชี/บทบาท", "การเปลี่ยนแปลง"].map(h => <th key={h} style={{ padding: "8px 10px", color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${T.border}`, verticalAlign: "top" }}>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td style={{ padding: "8px 10px" }}>{e.by}</td>
                  <td style={{ padding: "8px 10px" }}>{e.target}</td>
                  <td style={{ padding: "8px 10px", whiteSpace: "pre-line" }}>{(e.changes || []).join("\n")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
