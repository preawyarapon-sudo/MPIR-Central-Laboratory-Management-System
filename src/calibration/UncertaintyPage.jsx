// LF-069 · ความไม่แน่นอนของการวัด (ประจำปี) inside Instrument Assurance System.
// One record per yearly report; laid out like the paper form. Users type the
// repeat results and pick the certificate — the app calculates the rest
// (see uncertainty.js) and the report is downloaded and signed on paper.
import { useState, useMemo } from "react";
import { ChevronLeft, Plus, FileDown, Check, X, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { num, fmt, fmtDate, todayISO, beYear } from "./calc.js";
import { TESTS, calcReport, roundsFor, printLf069, DEFAULT_REPEATS, MAX_REPEATS } from "./uncertainty.js";

const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_OBJECTIVE = "ประเมินค่าความไม่แน่นอนของการตรวจทดสอบค่าบริกซ์และโพล ในน้ำอ้อย และไฟเบอร์ในชานอ้อยย่อย";
const DEFAULT_REFS = ["RDI-WI-02 วิธีวัดค่าองศาบริกซ์ (Brix) และโพลาไรเซชัน (Pol) ในตัวอย่างน้ำอ้อย",
  "RDI-WI-03 การวิเคราะห์ค่าเส้นใยไฟเบอร์ (Fibre) ในตัวอย่างชานอ้อยย่อย", "RDI-WI-08 การประเมินค่าความไม่แน่นอนของการวัด",
  "รายงานผลการทวนสอบเครื่องมือ (LF-068) ของ Refractometer, Polarimeter และเครื่องชั่ง 2 ตำแหน่ง"].join("\n");
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
    objective: prev?.objective || DEFAULT_OBJECTIVE, testers: prev?.testers || "", supervisor: prev?.supervisor || "",
    sampleNote: "", references: prev?.references || DEFAULT_REFS, preparedBy: me || "", example: {},
  };
  for (const T of TESTS) {
    const instrumentId = prev?.[T.key]?.instrumentId || guessInstrument(T, equipment);
    rep[T.key] = { instrumentId, source: "cert", certKey: latestRoundKey(certificates, instrumentId, date),
      readings: Array(DEFAULT_REPEATS).fill(""), ...(T.key === "fiber" ? { m1: prev?.fiber?.m1 || "100" } : {}) };
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
      if (T.key === "fiber") rep.fiber.m1 = "100";
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
        <div><h1>ความไม่แน่นอนของการวัด (LF-069)</h1><p className="ca-muted">รายงานประจำปีของวิธีทดสอบ Brix, Pol และ Fibre · กรอกผลทดสอบซ้ำและเลือกใบรับรอง ระบบคำนวณให้ทั้งหมด</p></div>
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
        const R = calcReport(rep, certificates);
        return (
          <section key={rep.id} className="ca-card ca-stack-sm">
            <div className="ca-sub-head ca-pad0" style={{ marginTop: 0 }}>
              <div>
                <h2>ประจำปี {rep.year || beYear(rep.reportDate)} <span className="ca-muted ca-small">· ลงวันที่ {fmtDate(rep.reportDate)}</span></h2>
                <div className="ca-small ca-muted">{rep.legacyLabel ? `นำเข้าจาก ${rep.legacyLabel} · คำนวณใหม่` : rep.downloadedAt ? `ดาวน์โหลดล่าสุด ${fmtDate(rep.downloadedAt.slice(0, 10))}${rep.downloadedBy ? ` โดย ${rep.downloadedBy}` : ""}${rep.reprintNeeded ? " · มีการแก้ไขหลังดาวน์โหลด ต้องพิมพ์ใหม่" : ""}` : "ยังไม่ได้ดาวน์โหลด"}</div>
              </div>
              <div className="ca-row ca-wrap">
                <button className="ca-btn" onClick={() => onOpen(rep.id)}><Pencil size={15} /> เปิด / แก้ไข</button>
                <button className="ca-btn ca-btn-primary" disabled={TESTS.some(T => !R[T.key].complete)} onClick={() => onDownload(rep)}><FileDown size={15} /> ดาวน์โหลด LF-069</button>
                <button className="ca-icon" aria-label="ลบรายงาน" onClick={() => onDelete(rep)}><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="ca-scroll">
              <table className="ca-table ca-num">
                <thead><tr><th>รายการ</th><th>n</th><th>ค่าเฉลี่ย</th><th>u_A</th><th>u_B (สอบเทียบ)</th><th>U (k=2)</th><th>รายงาน ±</th>{rep.paperU && <th>รายงานเดิม (กระดาษ)</th>}</tr></thead>
                <tbody>{TESTS.map(T => { const r = R[T.key]; return (
                  <tr key={T.key}><td style={{ fontFamily: "inherit" }}>{T.label}</td><td>{r.A.n}</td><td>{fmt(r.A.mean, r.dec)}</td><td>{fmt(r.A.uA, 4)}</td><td>{fmt(r.uB, 4)}</td><td>{fmt(r.U, 4)}</td>
                    <td className="ca-strong">{r.complete ? `${fmt(r.Ur, r.dec)} ${T.unit}` : <span className="ca-warn">ขาด{r.missing.join(", ")}</span>}</td>
                    {rep.paperU && <td className="ca-muted">{rep.paperU[T.short === "Fibre" ? "Fiber" : T.short] || "–"}</td>}</tr>); })}</tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="ca-small ca-muted">วิธีคำนวณ: u_A = SD/√n · u_B = U ของใบรับรอง ÷ k (Pol แปลง °Z → %Pol ด้วย 26/(100ρ) · Fibre รวมการชั่ง M0, M1, M2) · U = 2√(u_A² + u_B²) · ค่ารายงานปัดขึ้นตามความละเอียดของผล</p>
    </div>
  );
}

/* ---------------- editor ---------------- */
export function UncertaintyEditor({ report, certificates, equipment, onCancel, onSave }) {
  const [d, setD] = useState(report);
  const [saving, setSaving] = useState(false);
  const R = useMemo(() => calcReport(d, certificates), [d, certificates]);
  const set = (k) => (ev) => {
    const v = ev.target.value;
    setD(x => ({ ...x, [k]: v, ...(k === "reportDate" && v ? { year: String(beYear(v)) } : {}) }));
  };
  const setT = (tk, patch) => setD(x => ({ ...x, [tk]: { ...x[tk], ...patch } }));
  const setEx = (k) => (ev) => setD(x => ({ ...x, example: { ...(x.example || {}), [k]: ev.target.value } }));
  const eqLabel = (e) => `${e.code || ""} — ${e.name || ""}${e.serialNo ? ` (S/N ${e.serialNo})` : ""}`;
  const sortedEq = useMemo(() => [...equipment].sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), "th", { numeric: true })), [equipment]);

  function setReading(tk, i, val) {
    const parts = String(val).split(/[\s\t\n,;]+/).filter(Boolean);
    setD(x => {
      const reads = [...(x[tk].readings || [])];
      if (parts.length > 1) {
        parts.forEach((p, j) => { if (i + j < MAX_REPEATS) reads[i + j] = p; });
      } else reads[i] = val;
      return { ...x, [tk]: { ...x[tk], readings: reads } };
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
      {d.legacyLabel && <p className="ca-chips"><span className="ca-muted">นำเข้าจาก:</span><span>{d.legacyLabel}</span><span className="ca-muted">— ผลทดสอบซ้ำตามรายงานเดิม · ตัวเลขคำนวณใหม่</span></p>}

      <section className="ca-card ca-stack-sm">
        <h2>1–3 ข้อมูลรายงาน</h2>
        <div className="ca-grid3">
          <label className="ca-field"><span>วันที่รายงาน *</span><input type="date" value={d.reportDate} onChange={set("reportDate")} /></label>
          <label className="ca-field"><span>ประจำปี (พ.ศ.)</span><input value={d.year} onChange={set("year")} inputMode="numeric" /></label>
          <label className="ca-field"><span>วันที่ทดสอบซ้ำ</span><input type="date" value={d.testDate || ""} onChange={set("testDate")} /></label>
        </div>
        <label className="ca-field"><span>1 วัตถุประสงค์</span><textarea rows={2} value={d.objective} onChange={set("objective")} /></label>
        <div className="ca-grid3">
          <label className="ca-field"><span>2 ผู้ทดสอบซ้ำ (เจ้าหน้าที่วิเคราะห์)</span><input value={d.testers} onChange={set("testers")} placeholder="เช่น นายชัชวาล แก่นภูเขียว และนางสาวเมขลา ผางสา" /></label>
          <label className="ca-field"><span>ผู้ดูแลการทดสอบและประเมิน</span><input value={d.supervisor} onChange={set("supervisor")} placeholder="ชื่อ / ตำแหน่ง" /></label>
          <label className="ca-field"><span>จัดทำโดย (พิมพ์ในช่องลงนาม)</span><input value={d.preparedBy} onChange={set("preparedBy")} /></label>
        </div>
        <label className="ca-field"><span>หมายเหตุเกี่ยวกับตัวอย่าง</span><input value={d.sampleNote} onChange={set("sampleNote")} placeholder="เช่น ใช้น้ำอ้อย/ชานอ้อยแช่แข็ง เนื่องจากไม่มีอ้อยเข้าหีบ" /></label>
        <label className="ca-field"><span>3 เอกสารอ้างอิง (บรรทัดละ 1 รายการ)</span><textarea rows={4} value={d.references} onChange={set("references")} /></label>
      </section>

      {TESTS.map((T, ti) => {
        const t = d[T.key] || {}, r = R[T.key];
        const rounds = t.instrumentId ? roundsFor(certificates, t.instrumentId, d.reportDate) : [];
        const reads = t.readings || [];
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
              {T.key === "fiber" && <label className="ca-field"><span>น้ำหนักชานก่อนอบ M1 (g)</span><input value={t.m1 || ""} onChange={ev => setT(T.key, { m1: ev.target.value })} inputMode="decimal" /></label>}
            </div>
            {t.source === "cert" && t.instrumentId && !rounds.length && <p className="ca-warn">เครื่องนี้ยังไม่มีใบรับรองในระบบ — บันทึกรอบสอบเทียบก่อน หรือเลือก “กรอกเอง”</p>}

            <div className="ca-sub-head"><h3>ผลทดสอบซ้ำ ({T.unit})</h3><span className="ca-small ca-muted">วางค่าหลายค่าจาก Excel ลงช่องแรกได้</span></div>
            <div className="ca-scroll">
              <table className="ca-table ca-edit ca-reads">
                <thead><tr>{reads.map((_, i) => <th key={i}>ซ้ำ {i + 1}</th>)}<th></th></tr></thead>
                <tbody><tr>
                  {reads.map((x, i) => <td key={i}><input className="w-r" aria-label={`${T.short} ซ้ำที่ ${i + 1}`} value={x} inputMode="decimal"
                    onChange={ev => setReading(T.key, i, ev.target.value)}
                    onPaste={ev => { const txt = ev.clipboardData.getData("text"); if (/[\s\t\n,;]/.test(txt.trim())) { ev.preventDefault(); setReading(T.key, i, txt); } }} /></td>)}
                  <td style={{ whiteSpace: "nowrap" }}>
                    {reads.length < MAX_REPEATS && <button className="ca-icon" aria-label="เพิ่มซ้ำ" onClick={() => setT(T.key, { readings: [...reads, ""] })}><Plus size={15} /></button>}
                    {reads.length > 2 && <button className="ca-icon" aria-label="ลดซ้ำ" onClick={() => setT(T.key, { readings: reads.slice(0, -1) })}><X size={15} /></button>}
                  </td>
                </tr></tbody>
              </table>
            </div>
            <div className="ca-scroll">
              <table className="ca-table ca-num ca-calcbox">
                <thead><tr><th>n</th><th>ค่าเฉลี่ย</th><th>SD</th><th>u_A = SD/√n</th><th>u_B (สอบเทียบ)</th><th>u_c</th><th>U = 2u_c</th><th>รายงาน ±</th></tr></thead>
                <tbody><tr><td>{r.A.n}</td><td>{fmt(r.A.mean, r.dec)}</td><td>{fmt(r.A.sd, 4)}</td><td>{fmt(r.A.uA, 4)}</td><td>{fmt(r.uB, 4)}</td><td>{fmt(r.uc, 4)}</td><td>{fmt(r.U, 4)}</td>
                  <td className="ca-strong">{r.complete ? `${fmt(r.Ur, r.dec)} ${T.unit}` : "–"}</td></tr></tbody>
              </table>
            </div>
            <p className="ca-small ca-muted">
              {r.B ? <>u_B: {r.B.text} → U/k = {fmt(r.B.u, 4)} {T.instUnit}</> : "u_B: ยังไม่ได้เลือกใบรับรอง"}
              {T.key === "pol" && r.B && <> · × c = 26/(100 × {fmt(r.rho, 5)}) = {fmt(r.c, 4)} (ρ ที่ {fmt(r.brixUsed, 2)} %Brix) → {fmt(r.uB, 4)} %Pol</>}
              {T.key === "fiber" && r.B && <> · ชั่ง 3 ครั้ง (M0, M1, M2): √[2(100/M1 · u)² + (%F/M1 · u)²] = {fmt(r.uB, 4)} %</>}
            </p>
            {d.paperU && <p className="ca-small ca-muted">รายงานเดิม (กระดาษ): ± {d.paperU[T.short === "Fibre" ? "Fiber" : T.short] || "–"}</p>}
            {ti === 0 && r.A.n > 1 && r.A.sd === 0 && <p className="ca-warn"><AlertTriangle size={14} /> ค่าซ้ำทุกค่าเท่ากัน (SD = 0) — ตรวจว่าความละเอียดของการอ่านค่าเพียงพอหรือไม่</p>}
          </section>
        );
      })}

      <section className="ca-card ca-stack-sm">
        <h2>6 ตัวอย่างการรายงานผล <span className="ca-muted ca-small">(ไม่บังคับ)</span></h2>
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
