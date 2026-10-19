// Printable MPIR-LF-068 Rev.01 (verification report). Opens a print window;
// the browser's "Save as PDF" produces the file. Signature boxes are left
// blank — the report is signed on paper and filed (lab decision).
import { LOGO_DATA_URI } from "./logo.js";
import { mpirCodes } from "./calc.js";
import { num, fmt, fmtSigned, fmtDate, digitsFor, certSummary, verifySummary, isBefore, isAfter, refOf, VERIFY_MAX_READS } from "./calc.js";

// Registered document codes of the printed forms.
export const DAILY_DOC = { code: "MPIR-LF-058", rev: "02" };

export const VERIFY_REASONS = [["cal", "หลังสอบเทียบ"], ["rep", "หลังซ่อม"], ["new", "เครื่องมือใหม่"], ["out", "นำออกนอกการควบคุม (อื่นๆ)"]];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Same content and layout as the registered paper form (RDI-LF-068 Rev.00):
// framed pages, "ชื่อเครื่องมือ", sections 1–6, calibration table (5.1),
// verification readings R1–R10 (5.2), conclusion and two blank signatures.
const LF068_DOC = { code: "MPIR-LF-068", rev: "01" };
const longDate = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }); };
const REASON_TEXT = { new: "เพื่อตรวจสอบความใช้ได้ของเครื่องมือที่รับเข้ามาใหม่" };
const REASON_DEFAULT = "เพื่อตรวจสอบความเบี่ยงเบนของเครื่องมือวัดเมื่อได้มีการนำเครื่องมือออกไปจากการควบคุม";

export function lf068Html(round, instrument) {
  const e = instrument;
  const v0 = round.verification || null;
  const v = v0 ? { ...v0, wi: mpirCodes(v0.wi), stdName: mpirCodes(v0.stdName) } : null;
  const cs = certSummary(round.points, e);
  const vs = v0 ? verifySummary(v0, e, round.points) : null;
  const dg = digitsFor(v?.resolution || e.resolution);
  const unit = esc(e.calUnit || round.points[0]?.unit || "");
  const crit = vs?.crit || (cs.current[0] && { tolerance: cs.current[0].tol });
  const tolTxt = crit?.tolerance != null ? `± ${esc(crit.tolerance)} ${unit}` : "–";
  const ident = `${esc(e.name || "")} [${esc([e.brand, e.model, e.serialNo ? `Serial number ${e.serialNo}` : ""].filter(Boolean).join(", "))}]`;
  const le = (ok) => (ok ? "≤" : ">");
  const certOk = cs.pass;
  const verOk = vs ? vs.measOk : null;
  const inRange = vs && verOk && vs.maxTot <= cs.maxTot + 1e-9;
  const allOk = certOk && (vs ? verOk : true);
  const std = v ? `${esc(v.stdName || "มาตรฐานอ้างอิง")}${v.stdCert ? ` (Certificate no. ${esc(v.stdCert)})` : ""}` : "";
  const refs = (vs?.pts || []).map(x => esc(x.p.reference)).join(", ");
  const nMax = Math.max(0, ...(vs?.pts || []).map(x => x.r.n || 0));
  const method22 = v ? `ทวนสอบค่าการวัดของเครื่องมือ เทียบกับค่ามาตรฐาน โดยใช้ ${std}${refs ? ` ค่า ${refs} ${unit}` : ""}${nMax ? ` จำนวน ${nMax} ซ้ำ` : ""}${v.wi ? ` [${esc(v.wi)}]` : ""}` : "";

  const certRows = cs.current.map(x => `<tr><td>${esc(refOf(x.c))}</td><td>${esc(x.c.indication ?? "")}</td><td>${fmt(x.err == null ? null : -x.err, dg)}</td><td>${fmt(x.U, dg)}</td><td>${fmt(x.err == null ? null : Math.abs(x.err), dg)}</td><td>${fmt(x.tot, dg)}</td></tr>`).join("");
  const R = VERIFY_MAX_READS;
  const readRows = (vs?.pts || []).map(({ p, r }) => `<tr><td>${esc(p.reference)} ${unit}</td>${Array.from({ length: R }, (_, j) => `<td>${esc((p.readings || [])[j] ?? "")}</td>`).join("")}<td>${fmt(r.sd, dg + 1)}</td><td>${fmt(r.U, dg + 1)}</td><td>${fmt(r.err == null ? null : Math.abs(r.err), dg + 1)}</td><td>${fmt(r.tot, dg + 1)}</td></tr>`).join("");

  const body1 = `<p class="nmh">ชื่อเครื่องมือ</p>
<p><b>${esc(e.name || "")}</b> [${esc([e.brand, e.model, e.serialNo ? `Serial number ${e.serialNo}` : ""].filter(Boolean).join(", "))}]</p>
<h3>1 สาเหตุ และวัตถุประสงค์ในการทวนสอบ:</h3><p class="i1">${REASON_TEXT[v?.reason] || REASON_DEFAULT}</p>
<h3>2 วิธีทวนสอบ:</h3>
<p class="i1 hg">2.1 ตรวจสอบผลการสอบเทียบของเครื่องมือ เทียบกับเกณฑ์การยอมรับที่กำหนดไว้</p>
${v ? `<p class="i1 hg">2.2 ${method22}</p>` : ""}
<h3>3 ผู้ดำเนินการทดสอบ: ${esc(v?.verifiedBy || "")}</h3>
<h3>4 เกณฑ์การประเมินผล:</h3>
<p class="i1">-&nbsp;&nbsp;ค่าความผิดพลาดรวม ≤ เกณฑ์การยอมรับ = ผ่าน</p>
<p class="i1">-&nbsp;&nbsp;ค่าความผิดพลาดรวม &gt; เกณฑ์การยอมรับ = ไม่ผ่าน</p>
<p class="i2">โดยเกณฑ์การยอมรับ: ${tolTxt}</p>
<h3>5 ผลการทวนสอบ:</h3>
<p class="i1">5.1 ทวนสอบผลการสอบเทียบของเครื่องมือ</p>
<p class="i2">รายงานผลการสอบเทียบ ${esc(longDate(round.calibrationDate))} อ้างอิง Certificate No.: ${esc(round.certificateNo || "")} แสดงดังตาราง</p>
<table class="t"><tr><th>Reference (${unit})</th><th>UUC Reading (${unit})</th><th>Correction (${unit})</th><th>Uncertainty (±${unit})</th><th>Error (${unit})</th><th>Error + U (${unit})</th></tr>${certRows}</table>
<p class="i2">สรุปผล: ค่าความผิดพลาดรวม (Error+U) ${le(certOk)} เกณฑ์การยอมรับ (${tolTxt})</p>`;

  const body2 = `${v ? `<p class="i1">5.2 ผลการทวนสอบค่าการวัดของเครื่องมือ เทียบกับค่ามาตรฐาน โดยใช้ ${std} (ทวนสอบวันที่ ${"&nbsp;.".repeat(18)})${v.wi ? ` [${esc(v.wi)}]` : ""}</p>
<table class="t rd"><tr><th rowspan="2">Reference</th><th colspan="${R}">UUC (${unit})</th><th rowspan="2">SD</th><th rowspan="2">U</th><th rowspan="2">Error</th><th rowspan="2">Error+U (${unit})</th></tr>
<tr>${Array.from({ length: R }, (_, i) => `<th>R${i + 1}</th>`).join("")}</tr>${readRows}</table>
<p class="i2">สรุปผล: ค่าความผิดพลาดรวม (Error+U) ${le(verOk)} เกณฑ์การยอมรับ${inRange ? " และอยู่ในช่วงค่าความผิดพลาดรวม ตามรายงานผลการสอบเทียบ" : ""}</p>` : ""}
<h3 style="margin-top:12pt">6 สรุปผลการทวนสอบ</h3>
<p class="i2">ผลการทวนสอบผลการสอบเทียบ${v ? " และทวนสอบค่าการวัด" : ""}ของ${/^เครื่อง/.test(e.name || "") ? "" : "เครื่อง "}${ident} <b>${allOk ? "ผ่าน" : "ไม่ผ่าน"}</b> เกณฑ์ที่กำหนด</p>
<p style="margin-top:14pt">หมายเหตุ: วิธีการทวนสอบ อ้างอิงเอกสารเผยแพร่ สถาบันมาตรวิทยา</p>
<table class="sig"><tr><td><u>จัดทำโดย</u><div class="sg"></div><div class="nm">(${"&nbsp;".repeat(60)})</div></td><td><u>อนุมัติโดย</u><div class="sg"></div><div class="nm">(${"&nbsp;".repeat(60)})</div></td></tr>
<tr><td><u>วันที่</u></td><td><u>วันที่</u></td></tr></table>`;

  const pages = [body1, body2];
  const page = (n, body) => `<section class="pg"><div class="hd"><img src="${LOGO_DATA_URI}" alt="MITR PHOL"><span class="code">${LF068_DOC.code} Rev.:${LF068_DOC.rev} Page <b>${n}</b> of ${pages.length}</span><div class="ttl">รายงานผลการทวนสอบเครื่องมือ</div></div><div class="box">${body}</div></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>LF-068 ${esc(e.code)} ${esc(round.certificateNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:Sarabun,sans-serif;font-size:9.6pt;color:#000;margin:0;line-height:1.5}
.pg{width:210mm;min-height:297mm;padding:9mm 12mm 10mm 13mm;page-break-after:always;display:flex;flex-direction:column}.pg:last-child{page-break-after:auto}
.hd{position:relative;height:17mm;flex:none}.hd img{position:absolute;left:0;top:0;height:8mm}.hd .code{position:absolute;right:0;top:1mm;font-size:8.4pt}.hd .ttl{position:absolute;left:0;right:0;top:7.5mm;text-align:center;font-size:10.4pt;font-weight:700}
.box{flex:1;border:.8pt solid #000;padding:5mm 7mm}
p{margin:0 0 2pt}h3{font-size:9.6pt;font-weight:400;margin:8pt 0 2pt}.nmh{text-align:center;font-weight:700;text-decoration:underline;margin-bottom:4pt}
.i1{margin-left:6mm}.i2{margin-left:10mm;margin-top:3pt}.hg{padding-left:6mm;text-indent:-6mm;margin-left:12mm}
table{border-collapse:collapse}.t{width:100%;margin:4pt 0 6pt}.t td,.t th{border:.6pt solid #000;padding:2pt 4pt;text-align:center;font-weight:400;font-size:9pt}.t th{font-weight:700}
.rd td,.rd th{font-size:8.2pt;padding:2pt 2pt}
.sig{width:84%;margin:20pt 0 0 6mm}.sig td{border:.6pt solid #000;width:50%;padding:3pt 6pt;vertical-align:top}.sig .sg{height:26pt}.sig .nm{text-align:center}.sig tr:last-child td{height:30pt}</style></head><body>
${pages.map((b, i) => page(i + 1, b)).join("")}
<script>document.fonts.ready.then(function(){setTimeout(function(){window.print()},300)});</script></body></html>`;
}

export function printLf068(round, instrument) {
  const w = window.open("", "_blank");
  if (!w) { alert("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up แล้วลองอีกครั้ง"); return false; }
  w.document.open(); w.document.write(lf068Html(round, instrument)); w.document.close();
  return true;
}

/* ---------- monthly Daily / Intermediate check log (signed on paper) ---------- */
// rows: [{ date, time, item, standard, unit, reading, pass, by, note }] for daily;
// IC rows: [{ date, item, standard, mean, bias, range, result, by, note }].
export function checkLogHtml({ instrument, monthLabel, kind, rows }) {
  const daily = kind === "daily";
  const title = daily ? "บันทึกการตรวจสอบเครื่องมือประจำวัน (Daily check)" : "บันทึกการตรวจสอบระหว่างใช้งาน (Intermediate check)";
  const head = daily
    ? "<tr><th>วันที่</th><th>เวลา</th><th>รายการ</th><th>ค่ามาตรฐาน</th><th>ค่าที่อ่านได้</th><th>ผล</th><th>ผู้ตรวจ</th><th>หมายเหตุ</th></tr>"
    : "<tr><th>วันที่</th><th>รายการ</th><th>ค่าอ้างอิง</th><th>ค่าเฉลี่ย (หลังแก้)</th><th>Bias</th><th>ช่วงยอมรับ</th><th>ผล</th><th>ผู้ตรวจ</th><th>หมายเหตุ</th></tr>";
  const res = (ok, txt) => `<td class="${ok === false || txt === "FAIL" ? "f" : ok === true || txt === "PASS" ? "p" : ""}">${txt === "WARNING" ? "เฝ้าระวัง" : ok === true || txt === "PASS" ? "ผ่าน" : ok === false || txt === "FAIL" ? "ไม่ผ่าน" : "–"}</td>`;
  const body = rows.length ? rows.map(r => daily
    ? `<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.time)}</td><td>${esc(r.item)}</td><td>${esc(r.standard ?? "")} ${esc(r.unit || "")}</td><td>${esc(r.reading ?? "")}</td>${res(r.pass)}<td>${esc(r.by)}</td><td>${esc(r.note)}</td></tr>`
    : `<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.item)}</td><td>${esc(r.standard ?? "")}</td><td>${esc(r.mean ?? "")}</td><td>${esc(r.bias ?? "")}</td><td>${esc(r.range ?? "")}</td>${res(null, r.result)}<td>${esc(r.by)}</td><td>${esc(r.note)}</td></tr>`).join("")
    : `<tr><td colspan="9">ไม่มีบันทึกในเดือนนี้</td></tr>`;
  const nFail = rows.filter(r => r.pass === false || r.result === "FAIL").length;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(instrument.code || instrument.name)} ${esc(monthLabel)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:10mm 12mm}*{box-sizing:border-box}body{font-family:Sarabun,sans-serif;font-size:9.6pt;color:#111;margin:0}
table{border-collapse:collapse;width:100%}td,th{border:.6pt solid #222;padding:2.5pt 4pt;text-align:center}th{background:#E8EEF3;font-weight:600;font-size:8.8pt}
.hd td{text-align:left}.t{text-align:center !important;font-weight:700;font-size:13pt}.t small{display:block;font-weight:400;font-size:9pt}.lg{width:30mm;text-align:center !important}.lg img{height:14mm}.dc{width:58mm;font-size:8.8pt}.l{background:#F4F7F9;font-weight:600;width:28mm}
.p{color:#1E7A4A;font-weight:700}.f{color:#B42318;font-weight:700}.sig{margin-top:14pt}.sig td{border:none;width:50%;height:56pt;vertical-align:bottom}
.line{border-bottom:.6pt dotted #333;margin:0 24pt 4pt;height:26pt}.note{font-size:8.2pt;color:#333;margin-top:4pt}</style></head><body>
<table class="hd"><tr><td class="lg" rowspan="2"><img src="${LOGO_DATA_URI}" alt="MITR PHOL"></td><td class="t" colspan="2" rowspan="2">${title}<small>${daily ? "Daily Check Record" : "Intermediate Check Record"}</small></td><td class="dc">${daily ? `รหัสเอกสาร: <b>${DAILY_DOC.code}</b> แก้ไขครั้งที่ (Rev.): <b>${DAILY_DOC.rev}</b>` : ""}</td></tr><tr><td class="dc">ประจำเดือน ${esc(monthLabel)}</td></tr></table><table class="hd" style="margin-top:4pt">
<tr><td class="l">เครื่องมือ</td><td>${esc([instrument.code, instrument.name].filter(Boolean).join(" — "))}</td><td class="l">ประจำเดือน</td><td>${esc(monthLabel)}</td></tr>
<tr><td class="l">ยี่ห้อ / รุ่น / S/N</td><td>${esc([instrument.brand, instrument.model, instrument.serialNo && `S/N ${instrument.serialNo}`].filter(Boolean).join(" · "))}</td><td class="l">สรุป</td><td>${rows.length} รายการ · ไม่ผ่าน ${nFail}</td></tr></table>
<table style="margin-top:6pt">${head}${body}</table>
${nFail ? `<div class="note">มีรายการไม่ผ่าน — ดำเนินการตาม MPIR-LP-012 และบันทึกเลขที่ NC ในหมายเหตุ</div>` : ""}
<table class="sig"><tr><td><div class="line"></div>ผู้ทบทวน (TM/QM)<br>วันที่ ........./........./.........</td><td><div class="line"></div>ผู้อนุมัติ (Lab manager)<br>วันที่ ........./........./.........</td></tr></table>
<div class="note">พิมพ์จากระบบ LabTrack เมื่อ ${esc(new Date().toLocaleString("th-TH"))} · ฉบับที่ลงนามเก็บตามระบบเอกสาร</div>
<script>document.fonts.ready.then(function(){setTimeout(function(){window.print()},300)});</script></body></html>`;
}
export function printCheckLog(args) {
  const w = window.open("", "_blank");
  if (!w) { alert("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up แล้วลองอีกครั้ง"); return false; }
  w.document.open(); w.document.write(checkLogHtml(args)); w.document.close();
  return true;
}
