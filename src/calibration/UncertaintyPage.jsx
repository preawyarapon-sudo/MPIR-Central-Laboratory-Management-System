// LF-069 · ความไม่แน่นอนของการวัด (ประจำปี) inside Instrument Assurance System.
// One record per yearly report; laid out like the paper form. Users type the
// repeat results and pick the certificate — the app calculates the rest
// (see uncertainty.js) and the report is downloaded and signed on paper.
import { useState, useMemo } from "react";
import { ChevronLeft, Plus, FileDown, Check, X, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { num, fmt, fmtDate, todayISO, beYear, mpirCodes } from "./calc.js";
import { TESTS, calcReport, roundsFor, printLf069, DEFAULT_REPEATS, MIN_REPEATS, MAX_REPEATS, verifyRefOf } from "./uncertainty.js";

const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_OBJECTIVE = "ประเมินค่าความไม่แน่นอนของการวัดของเครื่องมือที่ใช้ตรวจทดสอบค่าบริกซ์และโพลในน้ำอ้อย และไฟเบอร์ในชานอ้อยย่อย";
const DEFAULT_REFS = ["MPIR-WI-002 วิธีวัดค่าองศาบริกซ์ (Brix) และโพลาไรเซชัน (Pol) ในตัวอย่างน้ำอ้อย",
  "MPIR-WI-003 การวิเคราะห์ค่าเส้นใยไฟเบอร์ (Fibre) ในตัวอย่างชานอ้อยย่อย", "MPIR-WI-008 การประเมินค่าความไม่แน่นอนของการวัด"].join("\n");
// the yearly verification report line is added automatically (verifyRefOf)
const ownRefs = (txt) => mpirCodes(txt || "").split(/\n/).filter(l => !/^\s*รายงาน(ผลการ)?ทวนสอบเครื่องมือ/.test(l)).join("\n");
const normNo = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");

function guessInstrument(T, equipment) {
  return equipment.find(e => T.inst.test(`${e.name || ""} ${e.type || ""} ${e.model || ""}`))?.id || "";
}
function latestRoundKey(certificates, instrumentId, date) {
  if (!instrumentId) return "";
  const r = roundsFor(certificates, instrumentId, date).find(x => !date || (x.calibrationDate || "") <= date);
  return r?.key || "";
}
export function newReport(prev, equipment, certificates, me) {
  const date = todayISO();
  const rep = {
    id: uid(), reportDate: date, testDate: "", year: String(beYear(date)),
    objective: prev?.objective || DEFAULT_OBJECTIVE, testers: prev?.testers || "", supervisor: prev?.supervisor || "", supervisorRole: prev?.supervisorRole || "ผู้จัดการด้านวิชาการ",
    sampleNote: "", references: prev?.references ? ownRefs(prev.references) : DEFAULT_REFS, preparedBy: me || "", example: {},
  };
  for (const T of TESTS) {
    const instrumentId = prev?.[T.key]?.instrumentId || guessInstrument(T, equipment);
    rep[T.key] = { instrumentId, source: "cert", certKey: latestRoundKey(certificates, instrumentId, date),
      readings: Array(DEFAULT_REPEATS).fill(""), ...(T.key === "fiber" ? { m1: prev?.fiber?.m1 || "200" } : {}) };
  }
  return rep;
}

// Former paper reports 2566–2568: only the raw repeat results and the
// certificate used are taken; all numbers are recalculated.
export function legacyReports(LEGACY, existing, equipment, certificates, me) {
  const out = [];
  const findCert = (no) => {
    const c = no && certificates.find(x => normNo(x.certificateNo) === normNo(no));
    return c ? { instrumentId: c.instrumentId, certKey: `${c.certificateNo || ""}|||${c.calibrationDate || ""}` } : null;
  };
  for (const r of LEGACY || []) {
    if (existing.some(x => x.legacyKey === r.key)) continue;
    const rep = { id: uid(), legacyKey: r.key, legacyLabel: r.label, paperU: r.paper, reportDate: r.date, testDate: "", year: String(beYear(r.date)),
      objective: DEFAULT_OBJECTIVE, testers: "", supervisor: r.by || "", sampleNote: r.note || "", references: DEFAULT_REFS,
      preparedBy: r.by || "", legacyApprover: r.approver || "", example: {}, createdBy: me, createdAt: new Date().toISOString() };
    const map = { brix: ["refr", r.brix], pol: ["pol", r.pol], fiber: ["bal2", r.fiber] };
    for (const T of TESTS) {
      const [ck, reads] = map[T.key];
      const ref = r.certs?.[ck] || {};
      const hit = findCert(ref.no);
      rep[T.key] = hit
        ? { ...hit, source: "cert", readings: reads.map(String) }
        : { instrumentId: guessInstrument(T, equipment), source: "manual", manualCertNo: ref.no || "", manualU: ref.U != null ? String(ref.U) : "", manualK: "2",
          manualNote: ref.note || (ref.no ? `ใบรับรอง ${ref.no} ไม่อยู่ในระบบ` : "ค่าจากรายงานเดิม"), readings: reads.map(String) };
      if (T.key === "fiber") rep.fiber.m1 = "200";
    }
    out.push(rep);
  }
  return out;
}

/* ---------------- list ---------------- */
export function UncertaintyList({ reports, certificates, equipment, onNew, onOpen, onDownload, onDelete, legacyCount, onImportLegacy }) {
  const sorted = [...reports].sort((a, b) => (b.reportDate || "").localeCompare(a.reportDate || ""));
  return (
    <div className="ca-stack">
      <header className="ca-head">
        <div><h1>ความไม่แน่นอนของการวัด</h1><p className="ca-muted">รายงานประจำปีของวิธีทดสอบ Brix, Pol และ Fibre · กรอกผลทดสอบซ้ำและเลือกใบรับรอง ระบบคำนวณให้ทั้งหมด</p></div>
        <button className="ca-btn ca-btn-primary" onClick={onNew}><Plus size={16} /> สร้างรายงานปีใหม่</button>
      </header>
      {legacyCount > 0 && (
        <div className="ca-alert" style={{ background: "#E3EFFA", borderColor: "#B9D3EA", color: "#0A4F9B" }}>
          <span>มีรายงาน LF-069 เดิม {legacyCount} ฉบับ (2566–2568) ที่ยังไม่ได้นำเข้า · ระบบจะใช้เฉพาะผลทดสอบซ้ำและใบรับรอง แล้วคำนวณใหม่ให้ถูกต้อง</span>
          <button className="ca-btn" onClick={onImportLegacy}>นำเข้ารายงานเดิม</button>
        </div>
      )}
      {!sorted.length && <section className="ca-card ca-empty">ยังไม่มีรายงาน · กด “สร้างรายงานปีใหม่”</section>}
      {sorted.map(rep => {
        const R = calcReport(rep, certificates, equipment);
        return (
          <section key={rep.id} className="ca-card ca-stack-sm">
            <div className="ca-sub-head ca-pad0" style={{ marginTop: 0 }}>
              <div>
                <h2>ประจำปี {rep.year || beYear(rep.reportDate)} <span className="ca-muted ca-small">· ลงวันที่ {fmtDate(rep.reportDate)}</span></h2>
                <div className="ca-small ca-muted">{rep.legacyLabel ? `นำเข้าจาก ${mpirCodes(rep.legacyLabel)} · คำนวณใหม่` : rep.reprintNeeded ? "มีการแก้ไขหลังดาวน์โหลด ต้องพิมพ์ใหม่" : ""}</div>
              </div>
              <div className="ca-row ca-wrap">
                <button className="ca-btn" onClick={() => onOpen(rep.id)}><Pencil size={15} /> เปิด / แก้ไข</button>
                <button className="ca-btn ca-btn-primary" disabled={TESTS.some(T => !R[T.key].complete)} onClick={() => onDownload(rep)}><FileDown size={15} /> ดาวน์โหลด LF-069</button>
                <button className="ca-icon" aria-label="ลบรายงาน" onClick={() => onDelete(rep)}><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="ca-scroll">
              <table className="ca-table ca-num">
                <thead><tr><th>รายการ</th><th>n</th><th>ค่าเฉลี่ย</th><th>RSD</th><th>u_c,rel</th><th>u_c</th><th>U (k=2)</th><th>ค่าที่ใช้ ±</th>{rep.paperU && <th>รายงานเดิม (กระดาษ)</th>}</tr></thead>
                <tbody>{TESTS.map(T => { const r = R[T.key]; return (
                  <tr key={T.key}><td style={{ fontFamily: "inherit" }}>{T.label}</td><td>{r.A.n}</td><td>{fmt(r.A.mean, r.dec)}</td><td>{fmt(r.A.rsd, 5)}</td><td>{fmt(r.ucRel, 5)}</td><td>{fmt(r.uc, 4)}</td><td>{fmt(r.U, 4)}</td>
                    <td className="ca-strong">{r.complete ? `${fmt(r.Ur, r.dec)} ${T.unit}` : <span className="ca-warn">ขาด{r.missing.join(", ")}</span>}</td>
                    {rep.paperU && <td className="ca-muted">{rep.paperU[T.short === "Fibre" ? "Fiber" : T.short] || "–"}</td>}</tr>); })}</tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="ca-small ca-muted">วิธีคำนวณ (ค่าความไม่แน่นอนของเครื่องมือ · แบบสัมพัทธ์ทั้งชุด): ทุกองค์ประกอบหารด้วยค่าเฉลี่ย (u/x̄) ก่อนรวม — Calibration = (U ของใบรับรอง ÷ k)/x̄ (Pol แปลง °Z → %Pol ด้วย 26/(100ρ) · Fibre การชั่ง M0, M1, M2) · Repeatability = RSD/√m (m = จำนวนครั้งที่ทดสอบซ้ำ n) · u_c = √Σ(u/x̄)² × x̄ · U = 2u_c · ปัดขึ้นตามความละเอียดของผล</p>
    </div>
  );
}

/* ---------------- editor ---------------- */
export function UncertaintyEditor({ report, certificates, equipment, onCancel, onSave }) {
  const [d, setD] = useState(report);
  const [saving, setSaving] = useState(false);
  const R = useMemo(() => calcReport(d, certificates, equipment), [d, certificates, equipment]);
  const set = (k) => (ev) => {
    const v = ev.target.value;
    setD(x => ({ ...x, [k]: v, ...(k === "reportDate" && v ? { year: String(beYear(v)) } : {}) }));
  };
  const setT = (tk, patch) => setD(x => ({ ...x, [tk]: { ...x[tk], ...patch } }));
  const setEx = (k) => (ev) => setD(x => ({ ...x, example: { ...(x.example || {}), [k]: ev.target.value } }));
  const eqLabel = (e) => `${e.code || ""} — ${e.name || ""}${e.serialNo ? ` (S/N ${e.serialNo})` : ""}`;
  const sortedEq = useMemo(() => [...equipment].sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), "th", { numeric: true })), [equipment]);

  // Grids of verification readings: rows = repeats, columns = tests.
  // Card 2 = Brix + Pol, card 3 = Fibre; each grows on its own.
  // Pasting from Excel fills down (one column) or across (tab-separated).
  const GROUPS = [
    { title: "ค่าที่วัดได้จากการทวนสอบเครื่องมือ — บริกซ์ และ โพล", tests: TESTS.filter(T => T.key !== "fiber"), cols: ["%Brix (บริกซ์)", "% Pol (โพล)"] },
    { title: "ค่าที่วัดได้จากการทวนสอบเครื่องมือ — ไฟเบอร์", tests: TESTS.filter(T => T.key === "fiber"), cols: ["%ไฟเบอร์ในชานอ้อยย่อย"] },
  ];
  const rowsOf = (g) => Math.max(MIN_REPEATS, ...g.tests.map(T => (d[T.key]?.readings || []).length));
  function setCell(g, row, col, val) {
    const lines = String(val).replace(/\r/g, "").split("\n").filter((l, i, arr) => l.trim() !== "" || i < arr.length - 1);
    const grid = lines.length > 1 || /\t/.test(val) ? lines.map(l => l.split("\t")) : [[val]];
    setD(x => {
      const next = { ...x };
      grid.forEach((cells, r) => cells.forEach((v, c) => {
        const T = g.tests[col + c], i = row + r;
        if (!T || i >= MAX_REPEATS) return;
        const reads = [...(next[T.key].readings || [])];
        while (reads.length <= i) reads.push("");
        reads[i] = v.trim();
        next[T.key] = { ...next[T.key], readings: reads };
      }));
      return next;
    });
  }
  function resize(g, n) {
    setD(x => {
      const next = { ...x };
      g.tests.forEach(T => { const r = [...(x[T.key].readings || [])]; while (r.length < n) r.push(""); next[T.key] = { ...x[T.key], readings: r.slice(0, n) }; });
      return next;
    });
  }

  const problems = [];
  if (!d.reportDate) problems.push("วันที่รายงาน");
  TESTS.forEach(T => { if (!R[T.key].complete) problems.push(`${T.short}: ${R[T.key].missing.join(", ")}`); });

  async function save(download) {
    setSaving(true);
    try { const ok = await onSave(d, download); if (!ok) setSaving(false); }
    catch (err) { alert("บันทึกไม่สำเร็จ: " + (err?.message || err)); setSaving(false); }
  }

  return (
    <div className="ca-stack">
      <button className="ca-link ca-back" onClick={onCancel}><ChevronLeft size={16} /> กลับ (ไม่บันทึก)</button>
      <header className="ca-head"><div>
        <h1>รายงานความไม่แน่นอน ประจำปี {d.year || beYear(d.reportDate)}</h1>
        <p className="ca-muted">ตามแบบฟอร์ม LF-069 · กรอกเฉพาะช่องสีขาว ช่องสีฟ้าระบบคำนวณให้</p>
      </div></header>
      {d.legacyLabel && <p className="ca-chips"><span className="ca-muted">นำเข้าจาก:</span><span>{mpirCodes(d.legacyLabel)}</span><span className="ca-muted">— ผลทดสอบซ้ำตามรายงานเดิม · ตัวเลขคำนวณใหม่</span></p>}

      <section className="ca-card ca-stack-sm">
        <h2>1–3 ข้อมูลรายงาน</h2>
        <div className="ca-grid3">
          <label className="ca-field"><span>วันที่รายงาน *</span><input type="date" value={d.reportDate} onChange={set("reportDate")} /></label>
          <label className="ca-field"><span>ประจำปี (พ.ศ.)</span><input value={d.year} onChange={set("year")} inputMode="numeric" /></label>
        </div>
        <label className="ca-field"><span>1 วัตถุประสงค์</span><textarea rows={2} value={d.objective} onChange={set("objective")} /></label>
        <h3 style={{ margin: "4px 0 0" }}>2 ผู้ดำเนินการ</h3>
        <label className="ca-field"><span>ทดสอบซ้ำ โดย เจ้าหน้าที่วิเคราะห์ — ชื่อ</span><input value={d.testers} onChange={set("testers")} placeholder="เช่น นายชัชวาล แก่นภูเขียว และนายเจษฎาภรณ์ ฮุยสูงเนิน" /></label>
        <div className="ca-grid3">
          <label className="ca-field"><span>ดูแลการทดสอบและประเมิน โดย (ตำแหน่ง)</span><input value={d.supervisorRole ?? "ผู้จัดการด้านวิชาการ"} onChange={set("supervisorRole")} /></label>
          <label className="ca-field ca-span2"><span>ชื่อผู้ดูแลการทดสอบและประเมิน</span><input value={d.supervisor} onChange={set("supervisor")} placeholder="เช่น นางสาวพิสิทธินี ชาปัญญา" /></label>
        </div>
        <label className="ca-field"><span>3 เอกสารอ้างอิง (บรรทัดละ 1 รายการ)</span><textarea rows={3} value={ownRefs(d.references)} onChange={set("references")} /></label>
        <p className="ca-small ca-muted" style={{ marginTop: -6 }}>บรรทัดสุดท้ายใส่ให้อัตโนมัติตามปีของรายงาน: <b>- {verifyRefOf(d)}</b></p>
      </section>

      {GROUPS.map(g => { const nRows = rowsOf(g); return (
      <section key={g.title} className="ca-card ca-stack-sm">
        <div className="ca-sub-head ca-pad0" style={{ marginTop: 0 }}>
          <h2>{g.title}</h2>
          <span className="ca-small ca-muted">ขั้นต่ำ {MIN_REPEATS} ซ้ำ · วางค่าจาก Excel ได้ทั้งคอลัมน์หรือทั้งตาราง</span>
        </div>
        <div className="ca-scroll">
          <table className="ca-table ca-edit ca-reads" style={{ maxWidth: g.tests.length > 1 ? 520 : 340 }}>
            <thead><tr><th style={{ width: 90 }}>ซ้ำที่</th>{g.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: nRows }, (_, i) => (
                <tr key={i}><td className="ca-muted" style={{ textAlign: "center" }}>{i + 1}</td>
                  {g.tests.map((T, ci) => <td key={T.key}><input className="w-r" aria-label={`${T.short} ซ้ำที่ ${i + 1}`} value={d[T.key]?.readings?.[i] ?? ""} inputMode="decimal"
                    onChange={ev => setCell(g, i, ci, ev.target.value)}
                    onPaste={ev => { const txt = ev.clipboardData.getData("text"); if (/[\t\n]/.test(txt.trim())) { ev.preventDefault(); setCell(g, i, ci, txt); } }} /></td>)}
                </tr>))}
              <tr className="ca-muted"><td>ค่าเฉลี่ย</td>{g.tests.map(T => <td key={T.key} style={{ textAlign: "center" }}>{fmt(R[T.key].A.mean, R[T.key].dec)} <span className="ca-small">(n = {R[T.key].A.n})</span></td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="ca-row ca-wrap">
          <button className="ca-btn" disabled={nRows >= MAX_REPEATS} onClick={() => resize(g, nRows + 1)}><Plus size={15} /> เพิ่มซ้ำ</button>
          <button className="ca-btn" disabled={nRows <= MIN_REPEATS} onClick={() => resize(g, nRows - 1)}><X size={15} /> ลบซ้ำสุดท้าย</button>
        </div>
      </section>); })}

      {TESTS.map((T, ti) => {
        const t = d[T.key] || {}, r = R[T.key];
        const rounds = t.instrumentId ? roundsFor(certificates, t.instrumentId, d.reportDate) : [];
        return (
          <section key={T.key} className="ca-card ca-stack-sm">
            <h2>4.{T.key === "fiber" ? "2" : "1"} {T.label} <span className="ca-muted ca-small">({T.unit})</span></h2>
            <div className="ca-grid3">
              <label className="ca-field"><span>{T.instLabel} ที่ใช้</span>
                <select value={t.instrumentId || ""} onChange={ev => setT(T.key, { instrumentId: ev.target.value, certKey: latestRoundKey(certificates, ev.target.value, d.reportDate) })}>
                  <option value="">— เลือกเครื่องมือ —</option>{sortedEq.map(e => <option key={e.id} value={e.id}>{eqLabel(e)}</option>)}
                </select></label>
              <label className="ca-field"><span>ค่า U จาก</span>
                <select value={t.source || "cert"} onChange={ev => setT(T.key, { source: ev.target.value })}>
                  <option value="cert">ใบรับรองในระบบ</option><option value="manual">กรอกเอง (ใบรับรองไม่อยู่ในระบบ)</option>
                </select></label>
              {(t.source || "cert") === "cert" ? (
                <label className="ca-field"><span>ใบรับรอง</span>
                  <select value={t.certKey || ""} onChange={ev => setT(T.key, { certKey: ev.target.value })}>
                    <option value="">— เลือกใบรับรอง —</option>
                    {rounds.map(x => <option key={x.key} value={x.key}>{x.certificateNo || "(ไม่มีเลขที่)"} · {fmtDate(x.calibrationDate)}{d.reportDate && (x.calibrationDate || "") > d.reportDate ? " (หลังวันที่รายงาน)" : ""}</option>)}
                  </select></label>
              ) : (
                <div className="ca-grid3" style={{ gridColumn: "1 / -1" }}>
                  <label className="ca-field"><span>เลขที่ใบรับรอง</span><input value={t.manualCertNo || ""} onChange={ev => setT(T.key, { manualCertNo: ev.target.value })} /></label>
                  <label className="ca-field"><span>U ({T.instUnit})</span><input value={t.manualU || ""} onChange={ev => setT(T.key, { manualU: ev.target.value })} inputMode="decimal" /></label>
                  <label className="ca-field"><span>k</span><input value={t.manualK || "2"} onChange={ev => setT(T.key, { manualK: ev.target.value })} inputMode="decimal" /></label>
                  <label className="ca-field ca-span2"><span>หมายเหตุที่มา</span><input value={t.manualNote || ""} onChange={ev => setT(T.key, { manualNote: ev.target.value })} /></label>
                </div>
              )}
              <label className="ca-field"><span>ตัวหาร m ของ RSD/√m</span><input value={t.mRep ?? ""} onChange={ev => setT(T.key, { mRep: ev.target.value })} inputMode="numeric" placeholder={`${r.A.n || "n"} (= จำนวนซ้ำ n)`} /></label>
              {T.key === "fiber" && <label className="ca-field"><span>น้ำหนักชานอ้อยย่อยก่อนอบ M1 (g) · WI: 200 ± 10</span><input value={t.m1 || ""} onChange={ev => setT(T.key, { m1: ev.target.value })} inputMode="decimal" /></label>}
            </div>
            {t.source === "cert" && t.instrumentId && !rounds.length && <p className="ca-warn">เครื่องนี้ยังไม่มีใบรับรองในระบบ — บันทึกรอบสอบเทียบก่อน หรือเลือก “กรอกเอง”</p>}

            <div className="ca-scroll">
              <table className="ca-table ca-num ca-calcbox">
                <thead><tr><th>n</th><th>ค่าเฉลี่ย x̄</th><th>SD</th><th>RSD</th><th>RSD/√m</th><th>Calibration u/x̄</th><th>u_c,rel</th><th>u_c = u_c,rel × x̄</th><th>U = 2u_c</th><th>ค่าที่ใช้ ±</th></tr></thead>
                <tbody><tr><td>{r.A.n}</td><td>{fmt(r.A.mean, r.dec)}</td><td>{fmt(r.A.sd, 4)}</td><td>{fmt(r.A.rsd, 5)}</td><td>{fmt(r.A.uArel, 5)}</td><td>{fmt(r.rCal, 5)}</td><td>{fmt(r.ucRel, 5)}</td><td>{fmt(r.uc, 4)}</td><td>{fmt(r.U, 4)}</td>
                  <td className="ca-strong">{r.complete ? `${fmt(r.Ur, r.dec)} ${T.unit}` : "–"}</td></tr></tbody>
              </table>
            </div>
            <p className="ca-small ca-muted">
              {r.B ? <>Calibration: {r.B.text} → U/k = {fmt(r.B.u, 4)} {T.instUnit}</> : "Calibration: ยังไม่ได้เลือกใบรับรอง"}
              {T.key === "pol" && r.B && <> · × c = 26/(100 × {fmt(r.rho, 5)}) = {fmt(r.c, 4)} (ρ ที่ {fmt(r.brixUsed, 2)} %Brix)</>}
              {T.key === "fiber" && <> · ชั่ง 3 ครั้ง (ภาชนะ M0, ก่อนอบ M1, หลังอบ M2): u·√[(100/M1)² + (100/M1)² + (%F/M1)²]</>}
            </p>
            {d.paperU && <p className="ca-small ca-muted">รายงานเดิม (กระดาษ): ± {d.paperU[T.short === "Fibre" ? "Fiber" : T.short] || "–"}</p>}
            {ti === 0 && r.A.n > 1 && r.A.sd === 0 && <p className="ca-warn"><AlertTriangle size={14} /> ค่าซ้ำทุกค่าเท่ากัน (SD = 0) — ตรวจว่าความละเอียดของการอ่านค่าเพียงพอหรือไม่</p>}
          </section>
        );
      })}

      <section className="ca-card ca-stack-sm">
        <h2>6 ตัวอย่างการรายงานผล <span className="ca-muted ca-small">(ไม่บังคับ · ถ้าเว้นว่าง รายงานจะพิมพ์เป็นช่องว่างให้เขียน)</span></h2>
        <div className="ca-grid4">
          <label className="ca-field"><span>หมายเลขตัวอย่าง</span><input value={d.example?.sampleNo || ""} onChange={setEx("sampleNo")} /></label>
          <label className="ca-field"><span>Brix</span><input value={d.example?.brix || ""} onChange={setEx("brix")} inputMode="decimal" /></label>
          <label className="ca-field"><span>%Pol</span><input value={d.example?.pol || ""} onChange={setEx("pol")} inputMode="decimal" /></label>
          <label className="ca-field"><span>%Fibre</span><input value={d.example?.fiber || ""} onChange={setEx("fiber")} inputMode="decimal" /></label>
        </div>
      </section>

      <div className="ca-savebar">
        <span className={problems.length ? "ca-warn" : "ca-muted"}>{problems.length ? `ยังขาด: ${problems.join(" · ")}` : "ข้อมูลครบ บันทึกและดาวน์โหลดได้"}</span>
        <div className="ca-row ca-wrap">
          <button className="ca-btn" onClick={onCancel}><X size={15} /> ยกเลิก</button>
          <button className="ca-btn" disabled={saving || !d.reportDate} onClick={() => save(false)}><Check size={16} /> บันทึก</button>
          <button className="ca-btn ca-btn-primary" disabled={saving || problems.length > 0} onClick={() => save(true)}><FileDown size={16} /> บันทึกและดาวน์โหลด</button>
        </div>
      </div>
    </div>
  );
}

export { printLf069 };
