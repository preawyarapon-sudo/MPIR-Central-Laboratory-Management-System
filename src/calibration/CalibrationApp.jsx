// LabTrack · Instrument Assurance System
// Opens in its own browser tab (/?app=calibration) with its own menu, on the
// same Firebase data and login as LabTrack. One calibration round =
// certificate table + verification (LF-068) + download the report; signing
// happens on the printed report (lab decision — no approvals in the app).
import { useState, useEffect, useMemo } from "react";
import {
  LayoutGrid, ChevronLeft, Plus, Trash2, FileDown, AlertTriangle, Search, Pencil, X,
  ClipboardList, ExternalLink, Gauge, Calculator, ClipboardCheck, Check,
} from "lucide-react";
import {
  num, fmt, fmtSigned, fmtDate, todayISO, addMonthsISO, digitsFor, roundKey, roundsOf, certSummary,
  verifySummary, instrumentStatus, isBefore, refOf, uOf, VERIFY_MAX_READS, VERIFY_MIN_READS,
  VERIFICATION_REQUIRED_FROM, criteriaOf,
} from "./calc.js";
import { printLf068, printCheckLog, VERIFY_REASONS } from "./report.js";
import {
  LABTRACK_CSS, DailyCheckTab, IntermediateCheckForm, CheckHistoryTable, newIntermediateCheckFor,
  saveIntermediateCheckInto, calcIntermediateCheck, hasDailyForm, dailyCheckPoints,
} from "../labtrack/LabTrackApp.jsx";

/* ---------- storage (same keys as LabTrack) ---------- */
async function loadKey(key) {
  try {
    const res = await window.storage.get(key, true);
    const v = JSON.parse(res.value);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
async function saveKey(key, list) {
  await window.storage.set(key, JSON.stringify(list), true);
}
const uid = () => Math.random().toString(36).slice(2, 10);

const ACCRED_YES = "ได้รับการรับรอง ISO/IEC 17025 ในขอบข่ายนี้";
const ACCRED_NO = "ไม่ได้รับการรับรองในขอบข่ายนี้ / ไม่ระบุ";
const ADJ_BEFORE = "ก่อนปรับแก้ (Before adjustment)";
const ADJ_AFTER = "หลังปรับแก้ (After adjustment)";
const USAGE = ["ใช้งานได้ปกติ (In use)", "ใช้งานโดยต้องใช้ Correction (In use with correction)", "ใช้งานแบบจำกัดช่วง (Restricted use)", "งดใช้งาน (Out of service)"];
const TONE = {
  green: { fg: "#187A52", bg: "#E7F5EE" }, amber: { fg: "#8A5200", bg: "#FFF3DC" }, red: { fg: "#B42318", bg: "#FDECEA" },
  blue: { fg: "#0A4F9B", bg: "#E3EFFA" }, grey: { fg: "#4F6E8C", bg: "#EEF2F6" },
};
const isCalibrated = (e, rounds) => e.type !== "เครื่องปรับอากาศ" && (rounds.length > 0 || num(e.intervalMonths) != null || !!e.nextDue || num(e.tolerance) != null);

/* =================================================================== */
const KEYS = ["equipment", "certificates", "verifications", "dailyChecks", "intermediateChecks"];
// guest: opened from a scanned QR code without a staff login — Daily check
// form and read-only instrument info only (same as the former QR pages).
export default function CalibrationApp({ currentUsername = "", currentDisplayName = "", guest = false, initial = null, onLogin = null }) {
  const [data, setData] = useState({ equipment: [], certificates: [], verifications: [], dailyChecks: [], intermediateChecks: [] });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(initial || { name: "overview" });
  const [toast, setToastState] = useState({ text: "", ms: 3500 });
  const setToast = (text, ms = 3500) => setToastState({ text, ms });
  const me = currentDisplayName || currentUsername || "";

  async function reload() {
    const lists = await Promise.all(KEYS.map(loadKey));
    setData(Object.fromEntries(KEYS.map((k, i) => [k, lists[i]])));
  }
  useEffect(() => { const prev = document.title; document.title = "Instrument Assurance System"; return () => { document.title = prev; }; }, []);
  useEffect(() => { reload().finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!toast.text) return; const t = setTimeout(() => setToastState({ text: "", ms: 3500 }), toast.ms); return () => clearTimeout(t); }, [toast]);

  // Read the newest copy, change it, write it back — LabTrack may be open in
  // another tab writing the same lists.
  async function mutate(key, fn) {
    const fresh = await loadKey(key);
    const next = fn(fresh);
    await saveKey(key, next);
    setData(d => ({ ...d, [key]: next }));
    return next;
  }

  // Shared LabTrack components hand back a whole new list; apply only what
  // they changed onto the newest stored copy.
  async function setListSmart(key, nextList) {
    const prev = data[key] || [];
    const prevById = new Map(prev.map(x => [x.id, x]));
    const nextIds = new Set(nextList.map(x => x.id));
    const changed = nextList.filter(x => prevById.get(x.id) !== x);
    const removed = prev.filter(x => !nextIds.has(x.id)).map(x => x.id);
    await mutate(key, fresh => {
      const ch = new Map(changed.map(x => [x.id, x]));
      const kept = fresh.filter(x => !removed.includes(x.id)).map(x => ch.has(x.id) ? ch.get(x.id) : x);
      const added = changed.filter(x => !fresh.some(f => f.id === x.id));
      return [...added, ...kept];
    });
  }
  const notify = (msg, ms) => setToast(msg, ms);

  const roundsById = useMemo(() => {
    const m = {};
    data.equipment.forEach(e => { m[e.id] = roundsOf(data.certificates, e.id, data.verifications); });
    return m;
  }, [data]);

  // A guest (QR scan, no staff login) only ever sees the Daily check form or
  // one instrument read-only.
  useEffect(() => {
    if (guest && !["guestDaily", "instrument"].includes(page.name)) setPage({ name: "guestDaily" });
  }, [guest, page.name]);
  const instrument = page.instrumentId ? data.equipment.find(e => e.id === page.instrumentId) : null;
  const go = (p) => { setPage(p); window.scrollTo(0, 0); };

  return (
    <div className="ca-root">
      <style>{LABTRACK_CSS}</style>
      <style>{CSS}</style>
      <nav className="ca-side" aria-label="เมนู Instrument Assurance System">
        <div className="ca-brand">
          <img src="/logo.png" alt="" width="36" height="36" />
          <div><div className="ca-brand-name">Instrument Assurance System</div><div className="ca-brand-sub">MPIR Central Lab</div></div>
        </div>
        {guest ? (<>
          <div className="ca-side-foot" style={{ marginTop: 0 }}>โหมดผู้เยี่ยมชม (สแกน QR) · ไม่ต้องเข้าสู่ระบบ</div>
          {onLogin && <button className="ca-btn" onClick={onLogin}>เข้าสู่ระบบ</button>}
        </>) : (<>
          <button className={`ca-nav ${["overview", "instrument", "edit"].includes(page.name) ? "on" : ""}`} onClick={() => go({ name: "overview" })}><LayoutGrid size={17} /> ภาพรวมและทะเบียน</button>
          <button className={`ca-nav ${page.name === "dailyAll" ? "on" : ""}`} onClick={() => go({ name: "dailyAll" })}><ClipboardCheck size={17} /> Daily check (ทุกเครื่อง)</button>
          <div className="ca-nav-group">ยังอยู่ในหน้า LabTrack เดิม</div>
          <a className="ca-nav" href="/?tab=calibrationRecords" target="_blank" rel="noreferrer"><Calculator size={17} /> ความไม่แน่นอน <ExternalLink size={13} className="ca-ext" /></a>
          <div className="ca-side-foot">{me ? `ผู้ใช้: ${me}` : ""}<br />ข้อมูลชุดเดียวกับ LabTrack</div>
        </>)}
      </nav>
      <main className="ca-main">
        {loading ? <div className="ca-empty">กำลังโหลดข้อมูล…</div> : (<>
          {page.name === "overview" && (
            <Overview equipment={data.equipment} roundsById={roundsById} onOpen={(id) => go({ name: "instrument", instrumentId: id })} />
          )}
          {(page.name === "dailyAll" || page.name === "guestDaily") && (
            <div className="ca-stack">
              <header className="ca-head"><div><h1>Daily check</h1><p className="ca-muted">{guest ? "บันทึกผลตรวจเช็คประจำวัน · ระบุชื่อผู้ตรวจทุกครั้ง" : "เลือกเครื่องแล้วบันทึกผล · ดาวน์โหลดบันทึกรายเดือนได้ที่หน้าเครื่องมือ แท็บ Daily check"}</p></div></header>
              <div className="ca-lt"><DailyCheckTab equipment={data.equipment} certificates={data.certificates}
                dailyChecks={data.dailyChecks} setDailyChecks={(l) => setListSmart("dailyChecks", l)}
                intermediateChecks={data.intermediateChecks} setIntermediateChecks={null}
                notify={notify} initialCheckId={page.instrumentId} focusRequest={page.instrumentId ? { id: page.instrumentId, at: 1 } : null}
                guestMode={guest} canApprove={false} currentUsername={currentUsername} currentDisplayName={guest ? "ผู้เยี่ยมชม (สแกน QR)" : currentDisplayName} /></div>
            </div>
          )}
          {page.name === "instrument" && instrument && (
            <InstrumentPage instrument={instrument} rounds={roundsById[instrument.id] || []} selectedKey={page.roundKey}
              guest={guest} me={me} currentUsername={currentUsername} notify={notify} initialTab={page.tab} openDaily={page.openDaily}
              certificates={data.certificates} dailyChecks={data.dailyChecks} intermediateChecks={data.intermediateChecks}
              setDailyChecks={(l) => setListSmart("dailyChecks", l)} setIntermediateChecks={(l) => setListSmart("intermediateChecks", l)}
              onSaveInstrument={async (id, patch) => { await mutate("equipment", list => list.map(x => x.id === id ? { ...x, ...patch } : x)); setToast("บันทึกเกณฑ์แล้ว"); }}
              onBack={guest ? null : () => go({ name: "overview" })}
              onSelect={(k) => setPage({ ...page, roundKey: k })}
              onNew={() => go({ name: "edit", instrumentId: instrument.id, roundKey: null })}
              onEdit={(k) => go({ name: "edit", instrumentId: instrument.id, roundKey: k })}
              onDownload={async (round, usage) => {
                if (!printLf068({ ...round, verification: round.verification ? { ...round.verification, usage } : null }, instrument)) return;
                const at = new Date().toISOString();
                if (round.verification) {
                  await mutate("verifications", list => list.map(v => v.id === round.verification.id
                    ? { ...v, usage, downloadedAt: at, downloadedBy: me, reprintNeeded: false, editLog: [...(v.editLog || []), { at, by: me, note: "ดาวน์โหลดรายงาน LF-068" }] } : v));
                }
                const isLatest = (roundsById[instrument.id] || [])[0]?.key === round.key;
                if (isLatest) await mutate("equipment", list => list.map(e => e.id === instrument.id ? { ...e, currentStatus: usage, statusApprovalDate: todayISO() } : e));
                setToast("ดาวน์โหลดรายงานแล้ว · นำไปลงนามและเก็บตามระบบเอกสาร");
              }} />
          )}
          {page.name === "edit" && instrument && (
            <RoundEditor instrument={instrument} rounds={roundsById[instrument.id] || []} roundKeyToEdit={page.roundKey} me={me}
              onCancel={() => go({ name: "instrument", instrumentId: instrument.id, roundKey: page.roundKey })}
              onSave={async ({ points, verification, oldKey, newKey, calDate }) => {
                const at = new Date().toISOString();
                const clash = (roundsById[instrument.id] || []).some(r => r.key === newKey && r.key !== oldKey);
                if (clash) { alert("มีใบรับรองเลขที่และวันที่นี้อยู่แล้ว"); return false; }
                await mutate("certificates", list => {
                  const old = list.filter(c => c.instrumentId === instrument.id && roundKey(c.certificateNo, c.calibrationDate) === oldKey);
                  const byId = Object.fromEntries(old.map(c => [c.id, c]));
                  const logged = points.map(p => {
                    const prev = byId[p.id];
                    if (!prev) return { ...p, editLog: [{ at, by: me, changes: [{ field: "สร้าง", from: "", to: "บันทึกจาก Instrument Assurance System" }] }] };
                    const changes = ["referenceValue", "indication", "reportedU", "adjustmentStatus", "rangeId", "certificateNo", "calibrationDate", "provider", "certTolerance"]
                      .filter(f => String(prev[f] ?? "") !== String(p[f] ?? "")).map(f => ({ field: f, from: prev[f] ?? "", to: p[f] ?? "" }));
                    return changes.length ? { ...p, editLog: [...(prev.editLog || []), { at, by: me, changes }] } : { ...p, editLog: prev.editLog };
                  });
                  return [...list.filter(c => !(c.instrumentId === instrument.id && roundKey(c.certificateNo, c.calibrationDate) === oldKey)), ...logged];
                });
                if (!verification && oldKey && oldKey !== newKey) {
                  // keep an existing verification attached to the renamed round
                  await mutate("verifications", list => list.map(v => v.instrumentId === instrument.id && roundKey(v.certificateNo, v.calibrationDate) === oldKey
                    ? { ...v, certificateNo: newKey.split("|||")[0], calibrationDate: calDate } : v));
                }
                if (verification) {
                  await mutate("verifications", list => {
                    const prev = list.find(v => v.id === verification.id);
                    const v = { ...verification, reprintNeeded: prev?.downloadedAt ? true : false,
                      editLog: [...(prev?.editLog || []), { at, by: me, note: prev ? "แก้ไขผลทวนสอบ" : "บันทึกผลทวนสอบ" }] };
                    return prev ? list.map(x => x.id === v.id ? v : x) : [...list, v];
                  });
                }
                const latest = [...(roundsById[instrument.id] || []).filter(r => r.key !== oldKey).map(r => r.calibrationDate), calDate].sort().pop();
                if (latest === calDate) {
                  await mutate("equipment", list => list.map(e => e.id === instrument.id
                    ? { ...e, lastCalibration: calDate, nextDue: addMonthsISO(calDate, num(e.intervalMonths) || 12) } : e));
                }
                setToast("บันทึกแล้ว");
                go({ name: "instrument", instrumentId: instrument.id, roundKey: newKey });
                return true;
              }} />
          )}
        </>)}
      </main>
      {toast.text && <div className="ca-toast" role="status"><Check size={16} /> {toast.text}</div>}
    </div>
  );
}

/* =================================================================== */
function Pill({ tone = "grey", children }) {
  const t = TONE[tone] || TONE.grey;
  return <span className="ca-pill" style={{ color: t.fg, background: t.bg }}>{children}</span>;
}

function Overview({ equipment, roundsById, onOpen }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => equipment.map(e => {
    const rounds = roundsById[e.id] || [];
    return { e, rounds, st: instrumentStatus(e, rounds), cal: isCalibrated(e, rounds) };
  }), [equipment, roundsById]);
  const cal = rows.filter(r => r.cal);
  const count = (keys) => cal.filter(r => keys.includes(r.st.key)).length;
  const kpis = [
    { label: "เครื่องมือที่ต้องสอบเทียบ", value: cal.length, sub: "ในทะเบียน", color: "#0B2A4A", f: "all" },
    { label: "พร้อมใช้งาน", value: count(["ok", "soon"]), sub: "ผลผ่านและยังไม่ถึงกำหนด", color: "#187A52", f: "ok" },
    { label: "ครบกำหนดใน 30 วัน", value: count(["soon"]), sub: "วางแผนส่งสอบเทียบ", color: "#8A5200", f: "soon" },
    { label: "เกินกำหนด / ไม่ผ่าน", value: count(["overdue", "fail", "off"]), sub: "งดใช้จนกว่าจะแก้ไข", color: "#B42318", f: "bad" },
    { label: "รอทำรอบให้ครบ", value: count(["verify", "report"]), sub: "รอทวนสอบหรือดาวน์โหลด", color: "#0A4F9B", f: "todo" },
  ];
  const groups = { all: null, ok: ["ok", "soon"], soon: ["soon"], bad: ["overdue", "fail", "off"], todo: ["verify", "report"], action: ["soon", "overdue", "fail", "off", "verify", "report"] };
  const ql = q.trim().toLowerCase();
  const shown = (showAll ? rows : cal)
    .filter(r => !groups[filter] || groups[filter].includes(r.st.key))
    .filter(r => !ql || [r.e.code, r.e.name, r.e.brand, r.e.model, r.e.serialNo, r.e.location].some(x => String(x || "").toLowerCase().includes(ql)))
    .sort((a, b) => a.st.sort - b.st.sort || String(a.e.code || "").localeCompare(String(b.e.code || ""), "th", { numeric: true }));
  const nOver = count(["overdue", "fail", "off"]), nSoon = count(["soon"]);
  return (
    <div className="ca-stack">
      <header className="ca-head"><div><h1>ภาพรวมเครื่องมือ</h1><p className="ca-muted">ทะเบียนเครื่องมือที่ต้องสอบเทียบ · กดรหัสเครื่องเพื่อดูรอบสอบเทียบ</p></div></header>
      <div className="ca-kpis">
        {kpis.map(k => (
          <button key={k.label} className={`ca-kpi ${filter === k.f ? "on" : ""}`} onClick={() => setFilter(filter === k.f ? "all" : k.f)}>
            <span className="ca-muted">{k.label}</span><span className="ca-kpi-v" style={{ color: k.color }}>{k.value}</span><span className="ca-small ca-muted">{k.sub}</span>
          </button>
        ))}
      </div>
      {(nOver > 0 || nSoon > 0) && (
        <div className="ca-alert">
          <AlertTriangle size={18} />
          <span>{[nOver ? `${nOver} เครื่องเกินกำหนดหรือไม่ผ่าน` : "", nSoon ? `${nSoon} เครื่องครบกำหนดภายใน 30 วัน` : ""].filter(Boolean).join(" · ")}</span>
          <button className="ca-btn ca-btn-amber" onClick={() => setFilter("action")}>ดูเฉพาะเครื่องที่ต้องดำเนินการ</button>
        </div>
      )}
      <section className="ca-card ca-flush">
        <div className="ca-card-head">
          <h2>ทะเบียนเครื่องมือ</h2>
          <div className="ca-row">
            <label className="ca-search"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา รหัส ชื่อ S/N" aria-label="ค้นหาเครื่องมือ" /></label>
            {filter !== "all" && <button className="ca-link" onClick={() => setFilter("all")}>แสดงทั้งหมด</button>}
          </div>
        </div>
        <div className="ca-scroll">
          <table className="ca-table">
            <thead><tr><th>รหัส</th><th>เครื่องมือ</th><th className="ca-hide-sm">ยี่ห้อ / รุ่น</th><th className="ca-hide-sm">สอบเทียบล่าสุด</th><th>ครบกำหนด</th><th>สถานะ</th></tr></thead>
            <tbody>
              {shown.map(({ e, rounds, st }) => (
                <tr key={e.id}>
                  <td><button className="ca-link ca-strong" onClick={() => onOpen(e.id)}>{e.code || e.name}</button></td>
                  <td>{e.name}{e.location ? <div className="ca-small ca-muted">{e.location}</div> : null}</td>
                  <td className="ca-muted ca-hide-sm">{[e.brand, e.model].filter(Boolean).join(" / ") || "–"}{e.serialNo ? <div className="ca-small">S/N {e.serialNo}</div> : null}</td>
                  <td className="ca-hide-sm">{fmtDate(rounds[0]?.calibrationDate || e.lastCalibration)}</td>
                  <td style={{ color: st.days != null && st.days < 0 ? "#B42318" : undefined, fontWeight: st.days != null && st.days < 0 ? 600 : 400 }}>{fmtDate(st.due)}</td>
                  <td><Pill tone={st.tone}>{st.label}</Pill></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={6} className="ca-empty">ไม่พบเครื่องมือ</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ca-card-foot"><button className="ca-link" onClick={() => setShowAll(!showAll)}>{showAll ? "ซ่อนเครื่องที่ไม่ต้องสอบเทียบ" : `แสดงเครื่องที่ไม่ต้องสอบเทียบด้วย (${rows.length - cal.length})`}</button></div>
      </section>
    </div>
  );
}

/* =================================================================== */
function InstrumentPage({ instrument: e, rounds, selectedKey, onBack, onSelect, onNew, onEdit, onDownload,
  guest = false, me = "", currentUsername = "", notify, initialTab, openDaily,
  certificates, dailyChecks, intermediateChecks, setDailyChecks, setIntermediateChecks, onSaveInstrument }) {
  const st = instrumentStatus(e, rounds);
  const sel = rounds.find(r => r.key === selectedKey) || rounds[0] || null;
  const crit = rounds[0] ? criteriaOf(e, rounds[0].points[0]) : criteriaOf(e, {});
  const timeline = [...rounds].reverse();
  const hasDaily = hasDailyForm(e);
  const myDaily = dailyChecks.filter(c => c.equipmentId === e.id);
  const myIc = intermediateChecks.filter(c => c.instrumentId === e.id);
  const tabs = [["rounds", `รอบสอบเทียบ (${rounds.length})`], ...(hasDaily ? [["daily", `Daily check (${myDaily.length})`]] : []), ...(!guest ? [["ic", `Intermediate check (${myIc.length})`]] : [])];
  const [tab, setTab] = useState(() => tabs.some(t => t[0] === initialTab) ? initialTab : "rounds");
  const [editingIc, setEditingIc] = useState(null);
  return (
    <div className="ca-stack">
      {onBack && <button className="ca-link ca-back" onClick={onBack}><ChevronLeft size={16} /> ทะเบียนเครื่องมือ</button>}
      <header className="ca-head">
        <div>
          <h1>{e.code ? `${e.code} — ` : ""}{e.name}</h1>
          <p className="ca-muted">{[[e.brand, e.model].filter(Boolean).join(" "), e.serialNo && `S/N ${e.serialNo}`, e.location].filter(Boolean).join(" · ") || "–"}</p>
          <p className="ca-muted">เกณฑ์ {crit ? `± ${crit.tolerance} ${e.calUnit || ""} · TER (|Error| + U ≤ เกณฑ์)` : "ยังไม่กำหนด"} · ครบกำหนด {fmtDate(st.due)}</p>
        </div>
        <div className="ca-row"><Pill tone={st.tone}>{st.label}</Pill>{!guest && tab === "rounds" && <button className="ca-btn ca-btn-primary" onClick={onNew}><Plus size={16} /> บันทึกรอบสอบเทียบใหม่</button>}</div>
      </header>
      <div className="ca-tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "rounds" && (<>
        <section className="ca-card">
          <h2>ประวัติสอบเทียบ</h2>
          {timeline.length ? (
            <ol className="ca-timeline">
              {timeline.map(r => {
                const cs = certSummary(r.points, e);
                const tone = cs.failCount ? "red" : cs.incomplete ? "grey" : "green";
                const on = sel && sel.key === r.key;
                return (
                  <li key={r.key}>
                    <button className={`ca-tl ${on ? "on" : ""}`} onClick={() => onSelect(r.key)} aria-pressed={on}>
                      <span className="ca-dot" style={{ background: TONE[tone].fg, borderColor: TONE[tone].fg }} />
                      <span className="ca-strong">{fmtDate(r.calibrationDate)}</span>
                      <span className="ca-small ca-muted">{r.certificateNo || "–"}</span>
                      <span className="ca-small ca-strong" style={{ color: TONE[tone].fg }}>{cs.failCount ? `ไม่ผ่าน ${cs.failCount} จุด` : cs.incomplete ? "ข้อมูลไม่ครบ" : "ผ่าน"}</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <div className="ca-tl">
                  <span className="ca-dot" style={{ background: "#FFFFFF", borderColor: TONE[st.tone]?.fg || "#4F6E8C" }} />
                  <span className="ca-strong">{fmtDate(st.due)}</span>
                  <span className="ca-small ca-muted">ครบกำหนดครั้งถัดไป</span>
                  <span className="ca-small ca-strong" style={{ color: TONE[st.tone]?.fg }}>{st.days == null ? "–" : st.days < 0 ? `เกิน ${-st.days} วัน` : `อีก ${st.days} วัน`}</span>
                </div>
              </li>
            </ol>
          ) : <p className="ca-muted">ยังไม่มีใบรับรองของเครื่องนี้{guest ? "" : ' — กด "บันทึกรอบสอบเทียบใหม่"'}</p>}
        </section>
        {sel && <RoundView key={sel.key} round={sel} instrument={e} isLatest={rounds[0]?.key === sel.key} readOnly={guest} onEdit={() => onEdit(sel.key)} onDownload={onDownload} />}
      </>)}

      {tab === "daily" && (<>
        {!guest && <CheckCriteria instrument={e} onSave={onSaveInstrument} />}
        {!guest && <LogDownload kind="daily" instrument={e} records={myDaily} />}
        <div className="ca-lt"><DailyCheckTab equipment={[e]} certificates={certificates}
          dailyChecks={dailyChecks} setDailyChecks={setDailyChecks} intermediateChecks={intermediateChecks} setIntermediateChecks={null}
          notify={notify} initialCheckId={openDaily ? e.id : undefined} focusRequest={{ id: e.id, at: 1 }} guestMode={guest}
          canApprove={false} currentUsername={currentUsername} currentDisplayName={guest ? "ผู้เยี่ยมชม (สแกน QR)" : me} /></div>
      </>)}

      {tab === "ic" && (<>
        <CheckCriteria instrument={e} onSave={onSaveInstrument} />
        <LogDownload kind="ic" instrument={e} records={myIc}
          extra={<button className="ca-btn ca-btn-primary" onClick={() => setEditingIc(newIntermediateCheckFor(e, intermediateChecks, certificates.filter(c => c.instrumentId === e.id), me))}><Plus size={16} /> บันทึก Intermediate check</button>} />
        <section className="ca-card ca-lt">
          {myIc.length ? (
            <CheckHistoryTable instrument={e} checks={myIc} certificates={certificates.filter(c => c.instrumentId === e.id)} hideKindSwitch
              onEditIc={(c) => setEditingIc(c)}
              onDeleteIc={(id) => { setIntermediateChecks(intermediateChecks.filter(x => x.id !== id)); notify("ลบแล้ว"); }} />
          ) : <p className="ca-muted">ยังไม่มีบันทึก Intermediate check ของเครื่องนี้</p>}
        </section>
        {editingIc && (
          <IntermediateCheckForm row={editingIc} equipment={[e]} certificates={certificates.filter(c => c.instrumentId === e.id)} currentDisplayName={me}
            onCancel={() => setEditingIc(null)}
            onSave={(row) => { setIntermediateChecks(saveIntermediateCheckInto(intermediateChecks, row, e)); notify("บันทึก Intermediate check แล้ว"); setEditingIc(null); }} />
        )}
      </>)}
    </div>
  );
}

// Tolerance used by Daily check (e.g. Refractometer 20 ± T) and the
// warning/action limits of Intermediate check. Calibration certificates
// carry their own TER criteria, so this one is for the routine checks only.
function CheckCriteria({ instrument: e, onSave }) {
  const [t, setT] = useState(e.tolerance ?? "");
  const [type, setType] = useState(e.toleranceType || "absolute");
  const dirty = String(t) !== String(e.tolerance ?? "") || type !== (e.toleranceType || "absolute");
  return (
    <div className="ca-download" style={{ marginTop: 0 }}>
      <label className="ca-field"><span>เกณฑ์ Daily / Intermediate check ± ({e.calUnit || "หน่วยของเครื่อง"})</span><input value={t} onChange={ev => setT(ev.target.value)} inputMode="decimal" placeholder="เช่น 0.09" /></label>
      <label className="ca-field"><span>ชนิด</span><select value={type} onChange={ev => setType(ev.target.value)}><option value="absolute">ค่าคงที่</option><option value="% of reading">% ของค่าที่อ่าน</option></select></label>
      <span className="ca-muted ca-small" style={{ flex: 1, minWidth: 180 }}>ใช้คำนวณช่วงยอมรับของการตรวจประจำวันและระหว่างใช้งาน (Warning = ⅔ ของเกณฑ์) · ช่วงของ Oven, Polarimeter, Cooling Bath ตั้งที่หน้าเครื่องมือใน LabTrack</span>
      <button className="ca-btn" disabled={!dirty} onClick={() => onSave(e.id, { tolerance: num(t) ?? "", toleranceType: type })}><Check size={15} /> บันทึกเกณฑ์</button>
    </div>
  );
}

// Month picker + "download the month's log" — the paper copy is signed and filed.
function LogDownload({ kind, instrument: e, records, extra = null }) {
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const inMonth = records.filter(c => String((kind === "daily" ? c.date : c.checkDate) || "").startsWith(month));
  const [y, m] = month.split("-").map(Number);
  const monthLabel = month ? new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" }) : "";
  function download() {
    const sorted = inMonth.slice().sort((a, b) => ((kind === "daily" ? a.date + (a.time || "") : a.checkDate) || "").localeCompare((kind === "daily" ? b.date + (b.time || "") : b.checkDate) || ""));
    const rows = kind === "daily"
      ? sorted.flatMap(c => dailyCheckPoints(c).map((p, i) => ({ date: i === 0 ? c.date : "", time: i === 0 ? c.time || "" : "", item: p.item, standard: p.standard, unit: p.unit,
          reading: p.reading, pass: p.pass, by: i === 0 ? c.checkedBy || "" : "", note: i === 0 ? c.remarks || "" : "" })))
      : sorted.map(c => {
          const k = calcIntermediateCheck(c, e);
          return { date: c.checkDate, item: [c.parameter, c.checkItem].filter(Boolean).join(" · "), standard: c.referenceValue,
            mean: k.correctedMean != null ? k.correctedMean.toFixed(4) : "", bias: k.bias != null ? k.bias.toFixed(4) : "",
            range: k.lal != null ? `${k.lal.toFixed(3)} – ${k.ual.toFixed(3)}` : "", result: k.result, by: c.checkedBy || "", note: c.remarks || "" };
        });
    printCheckLog({ instrument: e, monthLabel, kind, rows });
  }
  return (
    <div className="ca-download" style={{ marginTop: 0 }}>
      <label className="ca-field"><span>ดาวน์โหลดบันทึกประจำเดือน</span><input type="month" value={month} onChange={ev => setMonth(ev.target.value)} /></label>
      <span className="ca-muted ca-small" style={{ flex: 1, minWidth: 160 }}>{inMonth.length} รายการในเดือนนี้ · ลงนามบนเอกสารแล้วเก็บตามระบบเอกสาร</span>
      <div className="ca-row ca-wrap">
        <button className="ca-btn" disabled={!month} onClick={download}><FileDown size={16} /> ดาวน์โหลด (PDF)</button>
        {extra}
      </div>
    </div>
  );
}

function RoundView({ round, instrument: e, isLatest, readOnly = false, onEdit, onDownload }) {
  const cs = certSummary(round.points, e);
  const v = round.verification;
  const vs = verifySummary(v, e, round.points);
  const required = (round.calibrationDate || "") >= VERIFICATION_REQUIRED_FROM;
  const dg = digitsFor(v?.resolution || e.resolution);
  const passAll = cs.pass && (!v || (vs && vs.measOk && !vs.tooFew));
  const [usage, setUsage] = useState(v?.usage || (passAll ? USAGE[0] : USAGE[3]));
  const head = round.points[0] || {};
  const steps = [
    { t: "บันทึกใบรับรอง", done: round.points.length > 0 && !cs.incomplete },
    { t: "ทวนสอบ", done: !!v, skip: !v && !required },
    { t: "ดาวน์โหลดรายงาน", done: !!v?.downloadedAt && !v?.reprintNeeded },
  ];
  return (
    <section className="ca-card ca-stack-sm">
      <div className="ca-card-head ca-pad0">
        <div><h2>รอบสอบเทียบ {fmtDate(round.calibrationDate)}</h2><p className="ca-muted">ใบรับรอง {round.certificateNo || "–"} · {head.provider || "–"}{/ในขอบข่ายนี้/.test(head.providerAccreditationStatus || "") ? " · ISO/IEC 17025" : ""}</p></div>
        {!readOnly && <button className="ca-btn" onClick={onEdit}><Pencil size={15} /> แก้ไข</button>}
      </div>
      <ol className="ca-steps">
        {steps.map((s, i) => (
          <li key={s.t} className={s.done ? "done" : s.skip ? "skip" : ""}><span className="ca-step-n">{s.done ? <Check size={14} /> : i + 1}</span>{s.t}{s.skip ? " (ไม่บังคับสำหรับรอบนี้)" : ""}</li>
        ))}
      </ol>

      <div className="ca-sub-head"><h3>ผลสอบเทียบตามใบรับรอง</h3><Pill tone={cs.failCount ? "red" : cs.incomplete ? "grey" : "green"}>{cs.failCount ? `ไม่ผ่าน ${cs.failCount} จุด` : cs.incomplete ? "ข้อมูลไม่ครบ" : `ผ่าน ${cs.current.length}/${cs.current.length} จุด`}</Pill></div>
      <div className="ca-scroll">
        <table className="ca-table ca-num">
          <thead><tr><th>ช่วง</th><th>ค่าอ้างอิง</th><th>ค่าที่อ่านได้</th><th>ก่อน/หลังปรับ</th><th className="calc">Error</th><th className="calc">U</th><th className="calc">|Error| + U</th><th className="calc">เกณฑ์</th><th className="calc">ผล</th></tr></thead>
          <tbody>
            {[...cs.found, ...cs.current].map(x => (
              <tr key={x.c.id} className={isBefore(x.c) ? "ca-found" : ""}>
                <td>{x.c.rangeId || ""}</td><td>{refOf(x.c) ?? "–"}</td><td>{x.c.indication ?? "–"}</td><td>{isBefore(x.c) ? "ก่อนปรับ" : /หลังปรับ|after/i.test(x.c.adjustmentStatus || "") ? "หลังปรับ" : "–"}</td>
                <td className="calc">{fmtSigned(x.err, dg)}</td><td className="calc">{fmt(x.U, dg)}</td><td className="calc">{fmt(x.tot, dg)}</td><td className="calc">{x.tol == null ? "–" : `± ${x.tol}`}</td>
                <td className="calc ca-strong" style={{ color: x.ok == null ? "#4F6E8C" : x.ok ? "#187A52" : "#B42318" }}>{x.ok == null ? "–" : x.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cs.foundFail && <p className="ca-warn">ค่าก่อนปรับไม่ผ่านเกณฑ์ — ประเมินผลกระทบย้อนหลังตาม MPIR-LP-012</p>}

      <div className="ca-sub-head"><h3>ทวนสอบก่อนใช้งาน</h3>{vs ? <Pill tone={vs.measOk ? "green" : "red"}>{vs.measOk ? `ผ่าน ${vs.pts.length}/${vs.pts.length} จุด` : "ไม่ผ่าน"}</Pill> : <Pill tone={required ? "blue" : "grey"}>{required ? "ยังไม่ได้ทวนสอบ" : "ไม่มีข้อมูล"}</Pill>}</div>
      {vs ? (<>
        <p className="ca-muted ca-small">{fmtDate(v.verifyDate)} · {v.stdName || "–"}{v.stdCert ? ` (${v.stdCert})` : ""} · d = {v.resolution || "–"}{v.legacyApprover ? ` · รายงานเดิมลงนามโดย ${v.legacyApprover}` : ""}</p>
        <div className="ca-scroll">
          <table className="ca-table ca-num">
            <thead><tr><th>ค่าอ้างอิง</th><th>n</th><th className="calc">ค่าเฉลี่ย</th><th className="calc">SD</th><th className="calc">u_rep</th><th className="calc">u_std</th><th className="calc">u_res</th><th className="calc">U = 2u_c</th><th className="calc">Error</th><th className="calc">|Error| + U</th><th className="calc">ผล</th></tr></thead>
            <tbody>{vs.pts.map(({ p, r }, i) => (
              <tr key={i}><td>{p.reference}</td><td>{r.n}</td><td className="calc">{fmt(r.mean, dg)}</td><td className="calc">{fmt(r.sd, dg)}</td><td className="calc">{fmt(r.uRep, dg)}</td><td className="calc">{fmt(r.uStd, dg)}</td><td className="calc">{fmt(r.uRes, dg)}</td><td className="calc">{fmt(r.U, dg)}</td><td className="calc">{fmtSigned(r.err, dg)}</td><td className="calc">{fmt(r.tot, dg)}</td>
                <td className="calc ca-strong" style={{ color: r.ok ? "#187A52" : "#B42318" }}>{r.ok == null ? "–" : r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {vs.noStdU && <p className="ca-warn">ยังไม่ได้ระบุ U ของมาตรฐานอ้างอิง — ผลยังไม่รวม u_std</p>}
        {v.remark && <p className="ca-small ca-muted">หมายเหตุ: {v.remark}</p>}
      </>) : required ? <p className="ca-muted">รอบนี้ต้องทวนสอบก่อนนำเครื่องกลับมาใช้ — กด "แก้ไข" เพื่อกรอกผลทวนสอบ</p> : null}

      {!readOnly && <div className="ca-download">
        <div className="ca-stack-sm" style={{ flex: 1, minWidth: 240 }}>
          <h3>ดาวน์โหลดรายงาน LF-068</h3>
          <p className="ca-small ca-muted">รายงานมีช่องลงนามผู้ทวนสอบ ผู้ประเมิน (TM/QM) และผู้อนุมัติ (Lab manager) ว่างไว้ ลงนามบนเอกสารแล้วเก็บตามระบบเอกสาร</p>
          {v?.downloadedAt && !v.reprintNeeded && <p className="ca-small" style={{ color: "#187A52" }}>ดาวน์โหลดแล้ว {new Date(v.downloadedAt).toLocaleString("th-TH")}{v.downloadedBy ? ` โดย ${v.downloadedBy}` : ""}</p>}
          {v?.reprintNeeded && <p className="ca-warn">ข้อมูลถูกแก้หลังดาวน์โหลด — ดาวน์โหลดใหม่และลงนามฉบับใหม่</p>}
          {isLatest && (
            <label className="ca-field" style={{ maxWidth: 440 }}><span>สถานะการใช้งานของเครื่อง</span>
              <select value={usage} onChange={ev => setUsage(ev.target.value)}>{USAGE.map(u => <option key={u}>{u}</option>)}</select>
            </label>
          )}
        </div>
        <button className="ca-btn ca-btn-primary" disabled={required && !v} onClick={() => onDownload(round, usage)}><FileDown size={16} /> ดาวน์โหลด LF-068 (PDF)</button>
      </div>}
    </section>
  );
}

/* =================================================================== */
const emptyReads = () => Array(VERIFY_MAX_READS).fill("");
function draftFrom(instrument, rounds, roundKeyToEdit, me) {
  const r = rounds.find(x => x.key === roundKeyToEdit) || null;
  const prev = r ? null : rounds[0] || null;
  const src = r || prev;
  const head = src?.points[0] || {};
  const crit = criteriaOf(instrument, head);
  const pairRows = (points, keepReadings) => {
    const after = points.filter(c => !isBefore(c)), before = points.filter(isBefore);
    return after.map(c => {
      const b = before.find(x => String(x.rangeId || "") === String(c.rangeId || "") && refOf(x) === refOf(c));
      return { id: keepReadings ? c.id : null, beforeId: keepReadings ? b?.id || null : null, range: c.rangeId || "", ref: String(refOf(c) ?? ""),
        reading: keepReadings ? String(c.indication ?? (num(c.reportedError) != null && refOf(c) != null ? (refOf(c) + num(c.reportedError)) : "")) : "",
        before: keepReadings && b ? String(b.indication ?? "") : "", U: String(uOf(c) ?? ""), k: c.coverageFactor ?? 2 };
    });
  };
  const rows = src ? pairRows(src.points, !!r) : [];
  while (rows.length < 3) rows.push({ id: null, beforeId: null, range: "", ref: "", reading: "", before: "", U: "", k: 2 });
  const pv = src?.verification || null;
  const v = r?.verification ? { ...r.verification, points: (r.verification.points || []).map(p => ({ ...p, readings: [...(p.readings || []), ...emptyReads()].slice(0, VERIFY_MAX_READS) })) } : {
    id: uid(), reason: "cal", returnedDate: "", condition: "ok", conditionNote: "", verifyDate: todayISO(), environment: "",
    stdName: pv?.stdName || "", stdCert: pv?.stdCert || "", stdDue: pv?.stdDue || "", stdU: pv?.stdU || "", readingCorrection: "",
    resolution: pv?.resolution || String(instrument.resolution ?? "").match(/\d*\.?\d+/)?.[0] || "", wi: pv?.wi || "",
    fewReason: "", ncNo: "", remark: "", wiReview: "", verifiedBy: me,
    points: (pv?.points?.length ? pv.points.map(p => ({ reference: p.reference, stdU: p.stdU || "", readings: emptyReads() })) : [{ reference: "", stdU: "", readings: emptyReads() }]),
  };
  return {
    certificateNo: r ? r.certificateNo : "", calibrationDate: r ? r.calibrationDate : "",
    provider: head.provider || "", iso: src ? /ในขอบข่ายนี้/.test(head.providerAccreditationStatus || "") : true,
    issueDate: r ? head.issueDate || "" : "", method: head.calibrationMethod || "", refStd: r ? head.referenceStandardUsed || "" : "", note: r ? head.limitationsNotes || "" : "",
    parameter: head.parameter || instrument.measuredParameter || "", unit: head.unit || instrument.calUnit || "",
    tolerance: crit ? String(crit.tolerance) : "", toleranceType: crit?.type || "absolute", basis: crit?.basis || "",
    adjusted: r ? r.points.some(isBefore) : false,
    rows, doVerify: r ? !!r.verification : true, v,
    fromPrev: !r && !!prev,
  };
}

function RoundEditor({ instrument, rounds, roundKeyToEdit, me, onCancel, onSave }) {
  const [d, setD] = useState(() => draftFrom(instrument, rounds, roundKeyToEdit, me));
  const [showMore, setShowMore] = useState(false);
  const [paste, setPaste] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (ev) => setD({ ...d, [k]: ev.target.type === "checkbox" ? ev.target.checked : ev.target.value });
  const setV = (k) => (ev) => setD({ ...d, v: { ...d.v, [k]: ev.target.value } });
  const setRow = (i, k, val) => setD({ ...d, rows: d.rows.map((r, j) => j === i ? { ...r, [k]: val } : r) });
  const setVP = (i, k, val) => setD({ ...d, v: { ...d.v, points: d.v.points.map((p, j) => j === i ? { ...p, [k]: val } : p) } });
  const setRead = (i, j, val) => setD({ ...d, v: { ...d.v, points: d.v.points.map((p, k) => k === i ? { ...p, readings: p.readings.map((x, m) => m === j ? val : x) } : p) } });
  const unit = d.unit || instrument.calUnit || "";

  // Preview with the same calculations as the saved record.
  const preview = useMemo(() => buildRecords(d, instrument, roundKeyToEdit), [d, instrument, roundKeyToEdit]);
  const cs = certSummary(preview.points, instrument);
  const vs = d.doVerify ? verifySummary(preview.verification, instrument, preview.points) : null;
  const dg = digitsFor(d.v.resolution || instrument.resolution);
  const calcByRow = (i) => {
    const r = d.rows[i];
    const p = preview.points.find(c => c._row === i && !isBefore(c));
    return p ? cs.current.find(x => x.c === p) : null;
  };

  const problems = [];
  if (!d.certificateNo.trim()) problems.push("เลขที่ใบรับรอง");
  if (!d.calibrationDate) problems.push("วันที่สอบเทียบ");
  if (!d.provider.trim()) problems.push("ผู้สอบเทียบ");
  if (num(d.tolerance) == null) problems.push("เกณฑ์การยอมรับ");
  if (!preview.points.some(c => !isBefore(c))) problems.push("ตารางผลสอบเทียบอย่างน้อย 1 แถว (ค่าอ้างอิง ค่าที่อ่านได้ และ U)");
  if (d.doVerify) {
    if (!d.v.verifyDate) problems.push("วันที่ทวนสอบ");
    if (!vs || !vs.pts.length) problems.push("ค่าที่อ่านได้จากการทวนสอบ");
    else if (vs.tooFew) problems.push(`ค่าที่อ่านได้อย่างน้อย ${VERIFY_MIN_READS} ครั้งต่อจุด`);
    else if (!vs.reasonOk) problems.push("เหตุผลที่ทวนสอบน้อยกว่า 10 ครั้ง");
  }

  function applyPaste() {
    const lines = String(paste || "").split(/\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(/\t|\s{2,}|;|\s(?=[-+]?\d)/).map(x => x.trim()).filter(Boolean));
    const rows = lines.filter(p => p.length >= 3 && num(p[0]) != null).map(p => d.adjusted && p.length >= 4
      ? { id: null, beforeId: null, range: "", ref: p[0], before: p[1], reading: p[2], U: p[3], k: 2 }
      : { id: null, beforeId: null, range: "", ref: p[0], reading: p[1], U: p[2], before: "", k: 2 });
    if (!rows.length) { alert("อ่านข้อมูลไม่ได้ — วางทีละบรรทัด: ค่าอ้างอิง ค่าที่อ่านได้ U"); return; }
    setD({ ...d, rows }); setPaste(null);
  }

  return (
    <div className="ca-stack">
      <button className="ca-link ca-back" onClick={onCancel}><ChevronLeft size={16} /> กลับ (ไม่บันทึก)</button>
      <header className="ca-head"><div>
        <h1>{roundKeyToEdit ? "แก้ไขรอบสอบเทียบ" : "บันทึกรอบสอบเทียบใหม่"} · {instrument.code || instrument.name}</h1>
        <p className="ca-muted">หน้าเดียวตามแบบฟอร์ม LF-068 · กรอกเฉพาะช่องสีขาว ช่องสีฟ้าระบบคำนวณให้</p>
      </div></header>
      {d.fromPrev && <p className="ca-chips"><span className="ca-muted">ดึงจากรอบก่อน:</span><span>เกณฑ์</span><span>ผู้สอบเทียบ</span><span>จุดสอบเทียบและ U</span><span>มาตรฐานอ้างอิง</span><span>ความละเอียด</span><span className="ca-muted">— ตรวจให้ตรงกับใบรับรองใหม่</span></p>}

      <section className="ca-card ca-stack-sm">
        <h2>ใบรับรอง</h2>
        <div className="ca-grid3">
          <label className="ca-field"><span>เลขที่ใบรับรอง *</span><input value={d.certificateNo} onChange={set("certificateNo")} /></label>
          <label className="ca-field"><span>วันที่สอบเทียบ *</span><input type="date" value={d.calibrationDate} onChange={set("calibrationDate")} /></label>
          <label className="ca-field"><span>ผู้สอบเทียบ *</span><input value={d.provider} onChange={set("provider")} /></label>
        </div>
        <div className="ca-row ca-wrap">
          <label className="ca-check"><input type="checkbox" checked={d.iso} onChange={set("iso")} /> ผู้สอบเทียบได้รับการรับรอง ISO/IEC 17025 ในขอบข่ายนี้</label>
          <label className="ca-check"><input type="checkbox" checked={d.adjusted} onChange={set("adjusted")} /> มีการปรับเครื่อง (เพิ่มคอลัมน์ค่าก่อนปรับ)</label>
          <button className="ca-link" onClick={() => setShowMore(!showMore)}>{showMore ? "ซ่อนข้อมูลเพิ่มเติม" : "ข้อมูลเพิ่มเติม (ไม่บังคับ) ›"}</button>
        </div>
        {showMore && (
          <div className="ca-grid3 ca-soft">
            <label className="ca-field"><span>วันออกใบรับรอง</span><input type="date" value={d.issueDate} onChange={set("issueDate")} /></label>
            <label className="ca-field"><span>วิธีสอบเทียบ</span><input value={d.method} onChange={set("method")} /></label>
            <label className="ca-field"><span>มาตรฐานที่ผู้สอบเทียบใช้</span><input value={d.refStd} onChange={set("refStd")} /></label>
            <label className="ca-field"><span>พารามิเตอร์</span><input value={d.parameter} onChange={set("parameter")} placeholder="เช่น Mass, Brix" /></label>
            <label className="ca-field"><span>หน่วย</span><input value={d.unit} onChange={set("unit")} /></label>
            <label className="ca-field"><span>หมายเหตุ</span><input value={d.note} onChange={set("note")} /></label>
          </div>
        )}
        <div className="ca-grid3">
          <label className="ca-field"><span>เกณฑ์การยอมรับ ± ({unit}) *</span><input value={d.tolerance} onChange={set("tolerance")} inputMode="decimal" /></label>
          <label className="ca-field"><span>ชนิดเกณฑ์</span><select value={d.toleranceType} onChange={set("toleranceType")}><option value="absolute">ค่าคงที่</option><option value="% of reading">% ของค่าที่อ่าน</option></select></label>
          <label className="ca-field"><span>ที่มาของเกณฑ์</span><input value={d.basis} onChange={set("basis")} placeholder="เช่น ICUMSA GS5/7-1, คู่มือผู้ผลิต" /></label>
        </div>

        <div className="ca-sub-head"><h3>ผลสอบเทียบ (ตามตารางในใบรับรอง)</h3><button className="ca-btn" onClick={() => setPaste(paste == null ? "" : null)}><ClipboardList size={15} /> วางจาก Excel / ใบรับรอง</button></div>
        {paste != null && (
          <div className="ca-soft ca-stack-sm">
            <label className="ca-field"><span>วางทีละบรรทัด: ค่าอ้างอิง{d.adjusted ? "  ค่าก่อนปรับ" : ""}  ค่าที่อ่านได้  U (คั่นด้วยแท็บ)</span>
              <textarea rows={5} value={paste} onChange={ev => setPaste(ev.target.value)} className="ca-mono" /></label>
            <div className="ca-row"><button className="ca-btn ca-btn-primary" onClick={applyPaste}>ใส่ลงตาราง</button><button className="ca-link" onClick={() => setPaste(null)}>ยกเลิก</button></div>
          </div>
        )}
        <div className="ca-scroll">
          <table className="ca-table ca-edit">
            <thead><tr><th>ช่วง (ถ้ามี)</th><th>ค่าอ้างอิง *</th>{d.adjusted && <th>ก่อนปรับ</th>}<th>ค่าที่อ่านได้{d.adjusted ? " (หลังปรับ)" : ""} *</th><th>U (±) *</th><th className="calc">Error</th><th className="calc">|Error| + U</th><th className="calc">ผล</th><th></th></tr></thead>
            <tbody>
              {d.rows.map((r, i) => {
                const x = calcByRow(i);
                return (
                  <tr key={i}>
                    <td><input aria-label={`ช่วง แถว ${i + 1}`} value={r.range} onChange={ev => setRow(i, "range", ev.target.value)} className="w-s" /></td>
                    <td><input aria-label={`ค่าอ้างอิง แถว ${i + 1}`} value={r.ref} onChange={ev => setRow(i, "ref", ev.target.value)} inputMode="decimal" /></td>
                    {d.adjusted && <td><input aria-label={`ค่าก่อนปรับ แถว ${i + 1}`} value={r.before} onChange={ev => setRow(i, "before", ev.target.value)} inputMode="decimal" /></td>}
                    <td><input aria-label={`ค่าที่อ่านได้ แถว ${i + 1}`} value={r.reading} onChange={ev => setRow(i, "reading", ev.target.value)} inputMode="decimal" /></td>
                    <td><input aria-label={`U แถว ${i + 1}`} value={r.U} onChange={ev => setRow(i, "U", ev.target.value)} inputMode="decimal" /></td>
                    <td className="calc">{x ? fmtSigned(x.err, dg) : "–"}</td><td className="calc">{x ? fmt(x.tot, dg) : "–"}</td>
                    <td className="calc ca-strong" style={{ color: !x || x.ok == null ? "#4F6E8C" : x.ok ? "#187A52" : "#B42318" }}>{!x || x.ok == null ? "–" : x.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
                    <td><button className="ca-icon" aria-label={`ลบแถว ${i + 1}`} onClick={() => setD({ ...d, rows: d.rows.filter((_, j) => j !== i) })}><Trash2 size={15} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ca-row ca-wrap">
          <button className="ca-btn" onClick={() => setD({ ...d, rows: [...d.rows, { id: null, beforeId: null, range: "", ref: "", reading: "", before: "", U: d.rows[d.rows.length - 1]?.U || "", k: 2 }] })}><Plus size={15} /> เพิ่มแถว</button>
          <span className="ca-strong" style={{ color: cs.failCount ? "#B42318" : "#187A52" }}>{cs.current.length ? (cs.failCount ? `ไม่ผ่าน ${cs.failCount} จุด` : cs.incomplete ? "ยังกรอกไม่ครบ" : `ผ่าน ${cs.current.length}/${cs.current.length} จุด`) : ""}</span>
          {cs.foundFail && <span className="ca-warn">ค่าก่อนปรับไม่ผ่าน — ประเมินผลกระทบตาม MPIR-LP-012</span>}
        </div>
      </section>

      <section className="ca-card ca-stack-sm">
        <div className="ca-sub-head ca-pad0"><h2>ทวนสอบก่อนใช้งาน</h2>
          <label className="ca-check"><input type="checkbox" checked={d.doVerify} onChange={set("doVerify")} /> บันทึกผลทวนสอบในรอบนี้</label></div>
        {!d.doVerify && <p className="ca-muted">{(d.calibrationDate || "") >= VERIFICATION_REQUIRED_FROM ? "รอบที่สอบเทียบตั้งแต่ 9 ต.ค. 2569 ต้องทวนสอบก่อนใช้งาน — บันทึกภายหลังได้ แต่จะดาวน์โหลดรายงานไม่ได้จนกว่าจะทวนสอบ" : "ไม่บังคับสำหรับรอบก่อน 9 ต.ค. 2569"}</p>}
        {d.doVerify && (<>
          <div className="ca-grid4">
            <label className="ca-field"><span>วันที่ทวนสอบ *</span><input type="date" value={d.v.verifyDate} onChange={setV("verifyDate")} /></label>
            <label className="ca-field"><span>เหตุที่ทวนสอบ</span><select value={d.v.reason} onChange={setV("reason")}>{VERIFY_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="ca-field"><span>วันที่รับเครื่องคืน</span><input type="date" value={d.v.returnedDate} onChange={setV("returnedDate")} /></label>
            <label className="ca-field"><span>สภาพเครื่อง</span><select value={d.v.condition} onChange={setV("condition")}><option value="ok">สมบูรณ์</option><option value="abnormal">พบความผิดปกติ</option></select></label>
            {d.v.condition === "abnormal" && <label className="ca-field ca-span2"><span>ความผิดปกติที่พบ</span><input value={d.v.conditionNote} onChange={setV("conditionNote")} /></label>}
            <label className="ca-field ca-span2"><span>มาตรฐานอ้างอิง</span><input value={d.v.stdName} onChange={setV("stdName")} placeholder="เช่น ตุ้มน้ำหนัก MPIR-023" /></label>
            <label className="ca-field"><span>เลขที่ใบรับรองมาตรฐาน</span><input value={d.v.stdCert} onChange={setV("stdCert")} /></label>
            <label className="ca-field"><span>U ของมาตรฐาน (k=2)</span><input value={d.v.stdU} onChange={setV("stdU")} inputMode="decimal" placeholder="ใช้เมื่อทุกจุดเท่ากัน" /></label>
            <label className="ca-field"><span>ความละเอียด d ({unit})</span><input value={d.v.resolution} onChange={setV("resolution")} inputMode="decimal" /></label>
            <label className="ca-field"><span>ค่าแก้ของมาตรฐาน</span><input value={d.v.readingCorrection} onChange={setV("readingCorrection")} inputMode="decimal" placeholder="เมื่ออ่านค่าจากมาตรฐาน" /></label>
            <label className="ca-field"><span>วิธีปฏิบัติ (WI)</span><input value={d.v.wi} onChange={setV("wi")} /></label>
            <label className="ca-field"><span>สภาวะแวดล้อม</span><input value={d.v.environment} onChange={setV("environment")} placeholder="เช่น 25 °C · 55 %RH" /></label>
          </div>
          <div className="ca-scroll">
            <table className="ca-table ca-edit ca-reads">
              <thead><tr><th>ค่าอ้างอิง</th><th>U มาตรฐาน</th>{Array.from({ length: VERIFY_MAX_READS }, (_, i) => <th key={i}>R{i + 1}</th>)}<th></th></tr></thead>
              <tbody>{d.v.points.map((p, i) => (
                <tr key={i}>
                  <td><input aria-label={`ค่าอ้างอิงทวนสอบ แถว ${i + 1}`} value={p.reference} onChange={ev => setVP(i, "reference", ev.target.value)} inputMode="decimal" /></td>
                  <td><input aria-label={`U มาตรฐาน แถว ${i + 1}`} value={p.stdU} onChange={ev => setVP(i, "stdU", ev.target.value)} placeholder={d.v.stdU || ""} inputMode="decimal" /></td>
                  {p.readings.map((x, j) => <td key={j}><input aria-label={`R${j + 1} แถว ${i + 1}`} value={x} onChange={ev => setRead(i, j, ev.target.value)} inputMode="decimal" className="w-r" /></td>)}
                  <td><button className="ca-icon" aria-label={`ลบจุดทวนสอบ ${i + 1}`} onClick={() => setD({ ...d, v: { ...d.v, points: d.v.points.filter((_, j) => j !== i) } })}><Trash2 size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {d.v.points.length < 5 && <button className="ca-btn" style={{ alignSelf: "flex-start" }} onClick={() => setD({ ...d, v: { ...d.v, points: [...d.v.points, { reference: "", stdU: "", readings: emptyReads() }] } })}><Plus size={15} /> เพิ่มจุดทวนสอบ</button>}
          {vs && vs.pts.length > 0 && (
            <div className="ca-scroll">
              <table className="ca-table ca-num ca-calcbox">
                <thead><tr><th>ค่าอ้างอิง</th><th>n</th><th>ค่าเฉลี่ย</th><th>SD</th><th>u_rep</th><th>u_std</th><th>u_res</th><th>U = 2u_c</th><th>Error</th><th>|Error| + U</th><th>ผล</th></tr></thead>
                <tbody>{vs.pts.map(({ p, r }, i) => (
                  <tr key={i}><td>{p.reference}</td><td>{r.n}</td><td>{fmt(r.mean, dg)}</td><td>{fmt(r.sd, dg)}</td><td>{fmt(r.uRep, dg)}</td><td>{fmt(r.uStd, dg)}</td><td>{fmt(r.uRes, dg)}</td><td>{fmt(r.U, dg)}</td><td>{fmtSigned(r.err, dg)}</td><td>{fmt(r.tot, dg)}</td>
                    <td className="ca-strong" style={{ color: r.ok == null ? "#4F6E8C" : r.ok ? "#187A52" : "#B42318" }}>{r.ok == null ? "–" : r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="ca-small ca-muted">u_rep = SD/√n · u_std = U มาตรฐาน/2 · u_res = d/(2√3) · U = 2√(u_rep² + u_std² + u_res²) · ผ่านเมื่อ |Error| + U ≤ เกณฑ์</p>
          {vs?.fewReads && <label className="ca-field"><span>เหตุผลที่ทวนสอบน้อยกว่า 10 ครั้ง *</span><input value={d.v.fewReason} onChange={setV("fewReason")} placeholder="เช่น ใช้เวลาทดสอบนาน / ใช้สารมาก" /></label>}
          <div className="ca-grid3">
            <label className="ca-field"><span>ทบทวน WI ที่เกี่ยวข้อง</span><input value={d.v.wiReview} onChange={setV("wiReview")} /></label>
            <label className="ca-field"><span>เลขที่ NC (กรณีไม่ผ่าน)</span><input value={d.v.ncNo} onChange={setV("ncNo")} /></label>
            <label className="ca-field"><span>หมายเหตุ</span><input value={d.v.remark} onChange={setV("remark")} /></label>
          </div>
        </>)}
      </section>

      <div className="ca-savebar">
        <span className={problems.length ? "ca-warn" : "ca-muted"}>{problems.length ? `ยังขาด: ${problems.join(", ")}` : "ข้อมูลครบ บันทึกได้"}</span>
        <div className="ca-row">
          <button className="ca-btn" onClick={onCancel}><X size={15} /> ยกเลิก</button>
          <button className="ca-btn ca-btn-primary" disabled={problems.length > 0 || saving} onClick={async () => {
            setSaving(true);
            try {
              const out = buildRecords(d, instrument, roundKeyToEdit, true);
              const ok = await onSave({ points: out.points, verification: d.doVerify ? out.verification : null, oldKey: roundKeyToEdit, newKey: roundKey(d.certificateNo.trim(), d.calibrationDate), calDate: d.calibrationDate });
              if (!ok) setSaving(false);
            } catch (err) { alert("บันทึกไม่สำเร็จ: " + (err?.message || err)); setSaving(false); }
          }}><Check size={16} /> {saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </div>
    </div>
  );
}

// Draft → stored records (certificate point rows + verification record).
function buildRecords(d, instrument, roundKeyToEdit, final = false) {
  const certNo = d.certificateNo.trim();
  const header = {
    instrumentId: instrument.id, certificateNo: certNo, calibrationDate: d.calibrationDate, issueDate: d.issueDate,
    provider: d.provider.trim(), providerAccreditationStatus: d.iso ? ACCRED_YES : ACCRED_NO,
    calibrationMethod: d.method, referenceStandardUsed: d.refStd, limitationsNotes: d.note,
    parameter: d.parameter, unit: d.unit || instrument.calUnit || "",
    certTolerance: num(d.tolerance) ?? "", certToleranceType: d.toleranceType || "absolute", certDecisionRule: "conservative", certGuardBandFactor: "", certCriteriaBasis: d.basis,
    reportedAs: "Reading + Reference", reportedError: "", reportedCorrection: "", uReportedAs: "Absolute", coverageProbabilityPct: 95,
    recordStatus: "Verified", missingItems: "",
  };
  const points = [];
  d.rows.forEach((r, i) => {
    const ref = num(r.ref), rd = num(r.reading), U = num(r.U);
    if (ref == null || rd == null || U == null) return;
    const base = { ...header, rangeId: r.range || "", calibrationPoint: ref, referenceValue: ref, reportedU: U, uAbsolute: U, coverageFactor: r.k ?? 2 };
    points.push({ ...base, id: r.id || (final ? uid() : `p${i}`), _row: i, indication: rd, adjustmentStatus: d.adjusted ? ADJ_AFTER : "", source: "calibration-app" });
    if (d.adjusted && num(r.before) != null) points.push({ ...base, id: r.beforeId || (final ? uid() : `b${i}`), _row: i, indication: num(r.before), adjustmentStatus: ADJ_BEFORE, source: "calibration-app" });
  });
  if (final) points.forEach(p => delete p._row);
  const v = d.v;
  const verification = {
    ...v, instrumentId: instrument.id, certificateNo: certNo, calibrationDate: d.calibrationDate,
    reportNo: v.reportNo || `VR-${Number((d.calibrationDate || todayISO()).slice(0, 4)) + 543}-${(instrument.code || "").replace(/\s+/g, "")}`,
    points: (v.points || []).filter(p => num(p.reference) != null || (final ? false : true)).map(p => ({ ...p, readings: (p.readings || []).slice(0, VERIFY_MAX_READS) })),
  };
  return { points, verification };
}

/* =================================================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
.ca-root{--ink:#0B2A4A;--muted:#4F6E8C;--line:#D3E6F5;--teal:#0E6FBA;--teal-dark:#0A4F9B;--paper:#F3F8FD;
  font-family:'Prompt',ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;display:flex;flex-wrap:wrap;align-items:stretch}
.ca-root *{box-sizing:border-box}
.ca-root button,.ca-root input,.ca-root select,.ca-root textarea{font-family:inherit}
.ca-root input,.ca-root select,.ca-root textarea{color:var(--ink)}
.ca-root h1{margin:0;font-size:23px;font-weight:600}.ca-root h2{margin:0;font-size:17px;font-weight:600}.ca-root h3{margin:0;font-size:15px;font-weight:600}
.ca-root p{margin:0}
.ca-side{flex:1 1 230px;max-width:100%;background:#fff;border-right:1px solid var(--line);padding:20px 12px;display:flex;flex-direction:column;gap:4px}
.ca-brand{display:flex;align-items:center;gap:10px;padding:0 8px 16px}.ca-brand img{border-radius:8px;object-fit:contain}
.ca-brand-name{font-weight:700;font-size:16px}.ca-brand-sub{font-size:12.5px;color:var(--muted)}
.ca-nav{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;font-size:14.5px;border:none;background:none;text-align:left;cursor:pointer;color:var(--ink);text-decoration:none;min-height:44px}
.ca-nav:hover{background:var(--paper)}.ca-nav.on{background:#E3EFFA;color:var(--teal-dark);font-weight:600}
.ca-ext{margin-left:auto;color:var(--muted)}
.ca-nav-group{font-size:12px;color:var(--muted);padding:14px 12px 4px}
.ca-side-foot{margin-top:auto;padding:16px 12px 0;font-size:12.5px;color:var(--muted);line-height:1.6}
.ca-main{flex:999 1 640px;min-width:0;padding:24px 22px 64px}
.ca-main>*{max-width:1120px;margin:0 auto}
.ca-stack{display:flex;flex-direction:column;gap:16px}.ca-stack-sm{display:flex;flex-direction:column;gap:10px}
.ca-row{display:flex;align-items:center;gap:10px}.ca-wrap{flex-wrap:wrap}
.ca-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px}.ca-head p{margin-top:4px}
.ca-muted{color:var(--muted)}.ca-small{font-size:12.5px}.ca-strong{font-weight:600}
.ca-mono,.ca-num td,.calc{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px}
.ca-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px}
.ca-card.ca-flush{padding:16px 0 0}.ca-card-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:0 20px 12px}
.ca-card-head.ca-pad0{padding:0}.ca-card-foot{padding:10px 20px;border-top:1px solid #E6EEF6}
.ca-sub-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-top:6px}
.ca-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.ca-kpi{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:2px;text-align:left;cursor:pointer;font-size:13.5px}
.ca-kpi.on{border-color:var(--teal);box-shadow:0 0 0 2px #CFE3F6}.ca-kpi-v{font-size:28px;font-weight:700;line-height:1.2}
.ca-alert{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:#FFF3DC;border:1px solid #F0C978;border-radius:12px;padding:10px 14px;color:#7A4A00;font-weight:600;font-size:14.5px}
.ca-alert span{flex:1;min-width:200px}
.ca-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #B9D3EA;background:#fff;color:var(--teal-dark);border-radius:10px;padding:9px 16px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px;white-space:nowrap}
.ca-btn:disabled{opacity:.5;cursor:not-allowed}
.ca-btn-primary{background:var(--teal);border-color:var(--teal);color:#fff;font-weight:600}
.ca-btn-amber{background:#9A5B00;border-color:#9A5B00;color:#fff;font-weight:600}
.ca-link{background:none;border:none;color:var(--teal-dark);cursor:pointer;font-size:14px;padding:8px 0;text-align:left;display:inline-flex;align-items:center;gap:4px;min-height:40px}
.ca-back{align-self:flex-start}
.ca-icon{background:none;border:none;color:var(--muted);cursor:pointer;width:40px;height:40px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center}
.ca-icon:hover{background:#FDECEA;color:#B42318}
.ca-search{display:flex;align-items:center;gap:6px;border:1px solid #B9D3EA;border-radius:10px;padding:0 10px;min-height:42px;color:var(--muted);background:#fff}
.ca-search input{border:none;outline:none;font-size:14px;min-width:180px;background:none}
.ca-scroll{overflow-x:auto}
.ca-table{width:100%;border-collapse:collapse;font-size:14px}
.ca-table th{text-align:left;font-weight:600;font-size:12.5px;color:var(--muted);background:var(--paper);padding:9px 10px;white-space:nowrap}
.ca-card.ca-flush .ca-table th:first-child,.ca-card.ca-flush .ca-table td:first-child{padding-left:20px}
.ca-table td{padding:7px 10px;border-top:1px solid #E6EEF6;vertical-align:middle}
.ca-table th.calc{background:#E3EFFA}.ca-table td.calc{background:#F3F8FD}
.ca-found td{color:var(--muted);font-style:italic}
.ca-edit td{padding:3px 4px}.ca-edit input{width:100%;min-width:84px;border:1px solid var(--line);border-radius:8px;padding:8px 8px;font-size:14px;font-family:'JetBrains Mono',monospace;min-height:40px;background:#fff}
.ca-edit input.w-s{min-width:90px;font-family:inherit}.ca-reads input.w-r{min-width:64px;text-align:center}
.ca-calcbox{background:var(--paper);border-radius:10px}.ca-calcbox th{background:#E3EFFA}
.ca-pill{display:inline-block;font-size:12.5px;font-weight:600;border-radius:999px;padding:3px 10px;white-space:nowrap}
.ca-empty{text-align:center;color:var(--muted);padding:28px}
.ca-field{display:flex;flex-direction:column;gap:5px;font-size:13.5px;color:var(--muted)}
.ca-field input,.ca-field select,.ca-field textarea{border:1px solid #B9D3EA;border-radius:10px;padding:9px 12px;font-size:15px;color:var(--ink);background:#fff;min-height:44px}
.ca-check{display:flex;align-items:center;gap:8px;font-size:14.5px;min-height:44px;cursor:pointer}.ca-check input{width:20px;height:20px}
.ca-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.ca-grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.ca-span2{grid-column:span 2}
.ca-soft{background:#F7FAFD;border-radius:12px;padding:14px}
.ca-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}.ca-chips span:not(.ca-muted){background:#E6EEF6;border-radius:999px;padding:3px 12px}
.ca-warn{color:#9A3412;font-size:13.5px;font-weight:500}
.ca-timeline{list-style:none;margin:14px 0 0;padding:0;display:flex;overflow-x:auto;gap:0}
.ca-timeline li{flex:1 0 150px;position:relative}
.ca-timeline li:not(:last-child)::after{content:"";position:absolute;top:22px;left:50%;right:-50%;height:3px;background:#B9D3EA;z-index:0}
.ca-tl{position:relative;z-index:1;width:100%;display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;border-radius:12px;padding:12px 6px;cursor:pointer;font-size:14px}
div.ca-tl{cursor:default}.ca-tl.on{background:#E3EFFA}
.ca-dot{width:18px;height:18px;border-radius:50%;border:3px solid;margin-bottom:6px;background:#fff}
.ca-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ca-steps li{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--muted);border-top:5px solid var(--line);padding-top:8px}
.ca-steps li.done{color:var(--ink);border-color:#187A52}.ca-steps li.skip{border-color:#E6EEF6}
.ca-step-n{width:24px;height:24px;border-radius:50%;background:#E6EEF6;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;flex:none}
.ca-steps li.done .ca-step-n{background:#187A52;color:#fff}
.ca-download{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;justify-content:space-between;background:var(--paper);border-radius:12px;padding:14px 16px;margin-top:6px}
.ca-savebar{position:sticky;bottom:0;display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 14px;box-shadow:0 -4px 16px rgba(11,42,74,.08)}
.ca-tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);overflow-x:auto}
.ca-tabs button{background:none;border:none;border-bottom:3px solid transparent;margin-bottom:-1px;padding:11px 16px;font-size:15px;color:var(--muted);white-space:nowrap;cursor:pointer;min-height:44px}
.ca-tabs button.on{border-bottom-color:var(--teal);color:var(--teal-dark);font-weight:700}
.ca-lt{min-width:0}
.ca-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0B2A4A;color:#fff;border-radius:12px;padding:12px 18px;font-size:14px;display:flex;gap:8px;align-items:center;z-index:50}
.ca-hide-sm{}
@media (max-width:640px){.ca-hide-sm{display:none}.ca-pill{white-space:normal}}
@media (max-width:760px){.ca-side{border-right:none;border-bottom:1px solid var(--line);flex-direction:row;flex-wrap:wrap;padding:10px}.ca-brand{padding:0 8px 0 0}.ca-nav-group,.ca-side-foot{display:none}.ca-main{padding:16px 12px 64px}.ca-steps{grid-template-columns:1fr}.ca-span2{grid-column:auto}}
`;
