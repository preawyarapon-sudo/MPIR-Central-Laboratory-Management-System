// Instrument register inside Instrument Assurance System: add / edit one
// instrument (general info, measurement spec, calibration criteria, type-
// specific Daily check limits) and a read-only "ข้อมูลเครื่อง" view. Same
// equipment records as LabTrack; bookings and usage logs stay in LabTrack.
import { useState, useMemo } from "react";
import { ChevronLeft, Check, X, Trash2, QrCode, Pencil } from "lucide-react";
import { num, fmtDate, addMonthsISO } from "./calc.js";
import { toDisplayImageUrl, driveFileId, isDriveFolderUrl, resolveEquipGroup, EQUIP_GROUP_LABEL, printAllEquipQR } from "../labtrack/LabTrackApp.jsx";

const uid = () => Math.random().toString(36).slice(2, 10);
export const STATUS_LABEL = { active: "ใช้งานอยู่", maintenance: "ซ่อมบำรุง / งดใช้ชั่วคราว", inactive: "ปิดใช้งาน" };
const TYPES = ["เครื่องชั่ง", "Refractometer", "Polarimeter", "Oven", "Cooling Bath", "เครื่องควบคุมความชื้น", "Glass Thermometer", "pH Meter", "EC Meter", "ตุ้มน้ำหนักมาตรฐาน", "เครื่องปรับอากาศ"];
const TOL_TYPES = [["absolute", "ค่าคงที่ (±)"], ["% of reading", "% ของค่าที่อ่าน"], ["% of full scale", "% ของเต็มสเกล"]];

// Field layout shared by the editor and the read-only view.
// t: kind of input; when(e): show only for some types.
const SECTIONS = [
  { title: "ข้อมูลทั่วไป", fields: [
    { k: "code", l: "รหัสเครื่องมือ *", ph: "เช่น MPIR-091" },
    { k: "name", l: "ชื่อเครื่องมือ *", ph: "เช่น เครื่องชั่ง 2 ตำแหน่ง" },
    { k: "type", l: "ประเภท", t: "list", opts: "types", ph: "เช่น เครื่องชั่ง, Polarimeter" },
    { k: "group", l: "หมวดหมู่", t: "list", opts: "groups" },
    { k: "brand", l: "ยี่ห้อ" }, { k: "model", l: "รุ่น (Model)" }, { k: "serialNo", l: "Serial No." },
    { k: "softwareVersion", l: "Version ซอฟต์แวร์/เฟิร์มแวร์" },
    { k: "location", l: "ตำแหน่งที่ตั้ง", ph: "เช่น C5-1" }, { k: "assetNo", l: "เลขทรัพย์สิน (Asset No.)" },
    { k: "custodian", l: "ผู้รับผิดชอบ (Custodian)" },
  ] },
  { title: "ข้อกำหนดการวัด", fields: [
    { k: "measuredParameter", l: "พารามิเตอร์ที่วัด", ph: "เช่น Mass, Brix, Optical rotation" },
    { k: "calUnit", l: "หน่วย", ph: "เช่น g, %Brix, °Z, °C" },
    { k: "resolution", l: "ความละเอียด (d)", t: "num" },
    { k: "workingRangeMin", l: "ช่วงใช้งาน — ต่ำสุด", t: "num" }, { k: "workingRangeMax", l: "ช่วงใช้งาน — สูงสุด", t: "num" },
    { k: "relatedTestMethod", l: "วิธีทดสอบที่เกี่ยวข้อง", ph: "เช่น MPIR-WI-002-06" },
    { k: "scopeOfUse", l: "ขอบข่ายการใช้งาน" },
  ] },
  { title: "สอบเทียบและเกณฑ์การยอมรับ", note: "กฎการตัดสิน: TER (Conservative) — ผ่านเมื่อ |Error| + U ≤ เกณฑ์ · เกณฑ์ในใบรับรองแต่ละรอบมีผลก่อนค่านี้", fields: [
    { k: "intervalMonths", l: "รอบสอบเทียบ (เดือน)", t: "num", ph: "เช่น 12" },
    { k: "nextDue", l: "ครบกำหนดสอบเทียบครั้งถัดไป", t: "date" },
    { k: "tolerance", l: "เกณฑ์ ± (Tolerance/MPE)", t: "num" },
    { k: "toleranceType", l: "ชนิดเกณฑ์", t: "select", opts: "tol" },
    { k: "basisOfCriteria", l: "ที่มาของเกณฑ์", ph: "เช่น ICUMSA GS5/7-1, คู่มือผู้ผลิต" },
    { k: "referenceDocument", l: "เอกสารอ้างอิงของเกณฑ์" },
  ] },
  { title: "บำรุงรักษาและการตรวจระหว่างใช้", fields: [
    { k: "checkFrequency", l: "ความถี่ Daily / Intermediate check", ph: "เช่น ทุกวันที่ใช้งาน" },
    { k: "maintenanceIntervalMonths", l: "รอบบำรุงรักษา (เดือน)", t: "num" },
    { k: "maintenancePlan", l: "แผนบำรุงรักษา", wide: true },
  ] },
  { title: "เกณฑ์ Daily check เฉพาะประเภท", when: (e) => ["Polarimeter", "Oven", "Cooling Bath", "เครื่องควบคุมความชื้น"].includes(e.type), fields: [
    { k: "quartzNo", l: "แผ่นควอตซ์มาตรฐาน (No.)", when: (e) => e.type === "Polarimeter" },
    { k: "wavelengthNm", l: "ความยาวคลื่น (nm)", when: (e) => e.type === "Polarimeter" },
    { k: "quartzMin", l: "ค่าควอตซ์ต่ำสุด (°Z)", t: "num", when: (e) => e.type === "Polarimeter" },
    { k: "quartzMax", l: "ค่าควอตซ์สูงสุด (°Z)", t: "num", when: (e) => e.type === "Polarimeter" },
    { k: "ovenMin", l: "อุณหภูมิต่ำสุด (°C)", t: "num", when: (e) => e.type === "Oven" },
    { k: "ovenMax", l: "อุณหภูมิสูงสุด (°C)", t: "num", when: (e) => e.type === "Oven" },
    { k: "coolingBathMin", l: "อุณหภูมิต่ำสุด (°C)", t: "num", when: (e) => e.type === "Cooling Bath" },
    { k: "coolingBathMax", l: "อุณหภูมิสูงสุด (°C)", t: "num", when: (e) => e.type === "Cooling Bath" },
    { k: "humidityMin", l: "ความชื้นต่ำสุด (%RH)", t: "num", when: (e) => e.type === "เครื่องควบคุมความชื้น" },
    { k: "humidityMax", l: "ความชื้นสูงสุด (%RH)", t: "num", when: (e) => e.type === "เครื่องควบคุมความชื้น" },
  ] },
];

export function blankInstrument() {
  return { id: uid(), code: "", name: "", brand: "", model: "", serialNo: "", type: "", group: "", location: "", status: "active",
    lastCalibration: "", nextDue: "", intervalMonths: "12", notes: "", imageUrl: "", toleranceType: "absolute" };
}

export function InstrumentPhoto({ e, size = 96 }) {
  const [err, setErr] = useState(false);
  const src = e.imageUrl ? toDisplayImageUrl(e.imageUrl) : "";
  return (
    <div className="ca-photo" style={{ width: size, height: size }}>
      {src && !err ? <img src={src} alt={e.name || ""} onError={() => setErr(true)} /> : <span>{(e.code || e.name || "?").slice(0, 8)}</span>}
    </div>
  );
}

export function printQr(e, mode) { printAllEquipQR([e], mode, e.code || e.name); }

/* ---------------- read-only view (tab "ข้อมูลเครื่อง") ---------------- */
export function InstrumentInfo({ instrument: e, guest, onEdit, due = "" }) {
  const show = (f) => {
    if (f.k === "group") return resolveEquipGroup(e);
    const v = f.k === "nextDue" ? (e.nextDue || due) : e[f.k];
    if (v == null || v === "") return "–";
    if (f.t === "date") return fmtDate(v);
    if (f.opts === "tol") return (TOL_TYPES.find(t => t[0] === v) || [, v])[1];
    return String(v);
  };
  return (
    <div className="ca-stack">
      {!guest && (
        <div className="ca-row ca-wrap">
          <button className="ca-btn ca-btn-primary" onClick={onEdit}><Pencil size={15} /> แก้ไขข้อมูลเครื่อง</button>
          <button className="ca-btn" onClick={() => printQr(e, "dailyCheck")}><QrCode size={15} /> พิมพ์ QR Daily check</button>
          <button className="ca-btn" onClick={() => printQr(e, "equipmentView")}><QrCode size={15} /> พิมพ์ QR ดูข้อมูลเครื่อง</button>
        </div>
      )}
      {SECTIONS.filter(s => !s.when || s.when(e)).map(s => (
        <section key={s.title} className="ca-card ca-stack-sm">
          <h2>{s.title}</h2>
          <dl className="ca-dl">
            {s.fields.filter(f => !f.when || f.when(e)).map(f => (<div key={f.k}><dt>{f.l.replace(" *", "")}</dt><dd>{show(f)}</dd></div>))}
            {s.title === "ข้อมูลทั่วไป" && <>
              <div><dt>สถานะ</dt><dd>{STATUS_LABEL[e.status] || e.status || "–"}{e.unavailableReason ? ` · ${e.unavailableReason}` : ""}</dd></div>
              <div><dt>การจอง/ยืม</dt><dd>{e.labOnly ? "ใช้ในแลปเท่านั้น" : "เปิดให้จอง/ยืม (ที่ LabTrack)"}</dd></div>
            </>}
          </dl>
          {s.note && <p className="ca-small ca-muted">{s.note}</p>}
        </section>
      ))}
      {e.notes && <section className="ca-card"><h2>หมายเหตุ</h2><p style={{ whiteSpace: "pre-wrap" }}>{e.notes}</p></section>}
    </div>
  );
}

/* ---------------- editor ---------------- */
export function EquipmentEditor({ instrument, equipment, hasRecords, onCancel, onSave, onDelete, due = "" }) {
  const isNew = !equipment.some(x => x.id === instrument.id);
  const [d, setD] = useState(instrument);
  const [saving, setSaving] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const types = useMemo(() => [...new Set([...TYPES, ...equipment.map(x => x.type).filter(Boolean)])], [equipment]);
  const groups = useMemo(() => [...new Set([...Object.values(EQUIP_GROUP_LABEL), ...equipment.map(resolveEquipGroup)])], [equipment]);
  const set = (k, v) => setD(x => {
    const next = { ...x, [k]: v };
    // next due follows the interval from the last calibration unless typed in
    if (k === "intervalMonths" && x.lastCalibration && num(v)) next.nextDue = addMonthsISO(x.lastCalibration, num(v));
    return next;
  });
  const dupCode = d.code.trim() && equipment.some(x => x.id !== d.id && String(x.code || "").trim().toLowerCase() === d.code.trim().toLowerCase());
  const problems = [!d.code.trim() && "รหัสเครื่องมือ", !d.name.trim() && "ชื่อเครื่องมือ", dupCode && "รหัสซ้ำกับเครื่องอื่น"].filter(Boolean);

  const input = (f) => {
    const v = d[f.k] ?? "";
    if (f.t === "select") return <select value={v || "absolute"} onChange={ev => set(f.k, ev.target.value)}>{TOL_TYPES.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>;
    if (f.t === "list") return <><input list={`dl-${f.k}`} value={f.k === "group" ? (v || (d.type ? resolveEquipGroup(d) : "")) : v} onChange={ev => set(f.k, ev.target.value)} placeholder={f.ph} />
      <datalist id={`dl-${f.k}`}>{(f.opts === "types" ? types : groups).map(o => <option key={o} value={o} />)}</datalist></>;
    return <input type={f.t === "date" ? "date" : "text"} inputMode={f.t === "num" ? "decimal" : undefined} value={v} onChange={ev => set(f.k, ev.target.value)} placeholder={f.ph} />;
  };
  const commitImage = (raw) => {
    const v = String(raw || "").trim();
    set("imageUrl", driveFileId(v) && !/\/thumbnail\?/.test(v) ? toDisplayImageUrl(v) : v);
  };

  return (
    <div className="ca-stack">
      <button className="ca-link ca-back" onClick={onCancel}><ChevronLeft size={16} /> กลับ (ไม่บันทึก)</button>
      <header className="ca-head"><div>
        <h1>{isNew ? "เพิ่มเครื่องมือใหม่" : `แก้ไขข้อมูลเครื่อง · ${instrument.code || instrument.name}`}</h1>
        <p className="ca-muted">ทะเบียนเครื่องมือชุดเดียวกับ LabTrack · การจอง/ยืมและบันทึกการใช้งานยังทำที่ LabTrack</p>
      </div></header>

      {SECTIONS.filter(s => !s.when || s.when(d)).map(s => (
        <section key={s.title} className="ca-card ca-stack-sm">
          <h2>{s.title}</h2>
          {s.note && <p className="ca-small ca-muted">{s.note}</p>}
          <div className="ca-grid3">
            {s.fields.filter(f => !f.when || f.when(d)).map(f => (
              <label key={f.k} className={`ca-field ${f.wide ? "ca-span2" : ""}`}><span>{f.l}{f.k === "tolerance" && d.calUnit ? ` (${d.calUnit})` : ""}</span>{input(f)}
                {f.k === "nextDue" && (d.nextDue ? <small className="ca-muted">ลบค่าออกเพื่อให้คำนวณจากรอบสอบเทียบล่าสุด</small> : due ? <small className="ca-muted">เว้นว่างไว้ = ใช้ {fmtDate(due)} ที่คำนวณจากรอบสอบเทียบ</small> : null)}
                {f.k === "code" && dupCode && <small className="ca-warn">รหัสนี้มีอยู่แล้ว</small>}
              </label>
            ))}
            {s.title === "ข้อมูลทั่วไป" && <>
              <label className="ca-field"><span>สถานะ</span>
                <select value={d.status || "active"} onChange={ev => set("status", ev.target.value)}>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {d.status !== "active" && <label className="ca-field ca-span2"><span>เหตุผลที่ปิด/งดใช้</span><input value={d.unavailableReason || ""} onChange={ev => set("unavailableReason", ev.target.value)} placeholder="เช่น รอซ่อม, ผลสอบเทียบไม่ผ่าน" /></label>}
              {d.status === "active" && <label className="ca-check"><input type="checkbox" checked={!!d.labOnly} onChange={ev => set("labOnly", ev.target.checked)} /> ใช้ในแลปเท่านั้น (ไม่เปิดให้จอง/ยืม)</label>}
            </>}
          </div>
        </section>
      ))}

      <section className="ca-card ca-stack-sm">
        <h2>รูปภาพและหมายเหตุ</h2>
        <div className="ca-row ca-wrap" style={{ alignItems: "flex-start" }}>
          <div className="ca-photo" style={{ width: 120, height: 120 }}>{d.imageUrl && !imgErr && !isDriveFolderUrl(d.imageUrl) ? <img src={toDisplayImageUrl(d.imageUrl)} alt="" onError={() => setImgErr(true)} /> : <span>ไม่มีรูป</span>}</div>
          <label className="ca-field" style={{ flex: 1, minWidth: 240 }}><span>ลิงก์รูปภาพ (วางลิงก์แชร์จาก Google Drive ได้)</span>
            <input value={d.imageUrl || ""} onChange={ev => { setImgErr(false); set("imageUrl", ev.target.value); }} onBlur={ev => commitImage(ev.target.value)} placeholder="https://drive.google.com/file/d/…" />
            <small className={isDriveFolderUrl(d.imageUrl) || imgErr ? "ca-warn" : "ca-muted"}>{isDriveFolderUrl(d.imageUrl) ? "นี่คือลิงก์โฟลเดอร์ — ต้องใช้ลิงก์ของไฟล์รูป" : imgErr ? "โหลดรูปไม่ได้ — ตั้งค่าแชร์ไฟล์เป็น “ทุกคนที่มีลิงก์”" : "ตั้งค่าแชร์ไฟล์เป็น “ทุกคนที่มีลิงก์” ก่อนคัดลอกลิงก์"}</small>
          </label>
        </div>
        <label className="ca-field"><span>หมายเหตุ</span><textarea rows={3} value={d.notes || ""} onChange={ev => set("notes", ev.target.value)} /></label>
      </section>

      {!isNew && onDelete && (
        <section className="ca-card ca-row ca-wrap" style={{ justifyContent: "space-between" }}>
          <span className="ca-muted ca-small">{hasRecords ? "เครื่องนี้มีใบรับรองหรือบันทึกการตรวจแล้ว ลบไม่ได้ — ใช้สถานะ “ปิดใช้งาน” แทน เพื่อเก็บประวัติไว้" : "ลบเครื่องมือออกจากทะเบียน (ยังไม่มีบันทึกใด ๆ)"}</span>
          <button className="ca-btn" disabled={hasRecords} onClick={() => { if (window.confirm(`ลบ ${d.code || d.name} ออกจากทะเบียน?`)) onDelete(d.id); }}><Trash2 size={15} /> ลบเครื่องมือ</button>
        </section>
      )}

      <div className="ca-savebar">
        <span className={problems.length ? "ca-warn" : "ca-muted"}>{problems.length ? `ยังขาด: ${problems.join(", ")}` : "ข้อมูลครบ บันทึกได้"}</span>
        <div className="ca-row">
          <button className="ca-btn" onClick={onCancel}><X size={15} /> ยกเลิก</button>
          <button className="ca-btn ca-btn-primary" disabled={problems.length > 0 || saving} onClick={async () => {
            setSaving(true);
            const out = { ...d, code: d.code.trim(), name: d.name.trim() };
            try { if (!(await onSave(out, isNew))) setSaving(false); } catch (err) { alert("บันทึกไม่สำเร็จ: " + (err?.message || err)); setSaving(false); }
          }}><Check size={16} /> {saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </div>
    </div>
  );
}
