// Printable MPIR-LF-068 Rev.01 (verification report). Opens a print window;
// the browser's "Save as PDF" produces the file. Signature boxes are left
// blank — the report is signed on paper and filed (lab decision).
import { LOGO_DATA_URI } from "./logo.js";
import { num, fmt, fmtSigned, fmtDate, digitsFor, certSummary, verifySummary, isBefore, isAfter, refOf, VERIFY_MAX_READS } from "./calc.js";

// Registered document codes of the printed forms.
export const DAILY_DOC = { code: "MPIR-LF-058", rev: "02" };

export const VERIFY_REASONS = [["cal", "หลังสอบเทียบ"], ["rep", "หลังซ่อม"], ["new", "เครื่องมือใหม่"], ["out", "นำออกนอกการควบคุม (อื่นๆ)"]];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function lf068Html(round, instrument) {
  const v = round.verification || {};
  const cs = certSummary(round.points, instrument);
  const vs = verifySummary(round.verification, instrument, round.points);
  const dg = digitsFor(v.resolution || instrument.resolution);
  const unit = esc(instrument.calUnit || round.points[0]?.unit || "");
  const head = round.points[0] || {};
  const crit = vs?.crit || (cs.current[0] && { tolerance: cs.current[0].tol });
  const tolTxt = crit?.tolerance != null ? `± ${esc(crit.tolerance)} ${unit}${crit.type && crit.type !== "absolute" ? ` (${esc(crit.type)})` : ""}` : "–";
  const box = (on) => (on ? "☑" : "☐");
  const reason = VERIFY_REASONS.map(([k, l]) => `<span class="o">${box(k === (v.reason || "cal"))} ${l}</span>`).join("");
  const certRows = [...cs.found, ...cs.current].map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.c.rangeId || "")}</td><td>${esc(refOf(x.c))}</td><td>${esc(x.c.indication ?? "")}</td><td>${isBefore(x.c) ? "ก่อนปรับ" : isAfter(x.c) ? "หลังปรับ" : "–"}</td><td>${fmtSigned(x.err, dg)}</td><td>${fmt(x.U, dg)}</td><td>${fmt(x.tot, dg)}</td><td class="${x.ok === false ? "f" : "p"}">${x.ok == null ? "ข้อมูลไม่ครบ" : x.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>`).join("");
  const readRows = (vs?.pts || []).map(({ p, r }) => `<tr><td>${esc(p.reference)}</td>${Array.from({ length: VERIFY_MAX_READS }, (_, j) => `<td>${esc((p.readings || [])[j] ?? "")}</td>`).join("")}<td>${fmt(r.mean, dg)}</td></tr>`).join("");
  const calcRows = (vs?.pts || []).map(({ p, r }) => `<tr><td>${esc(p.reference)}</td><td>${r.n}</td><td>${fmt(r.sd, dg)}</td><td>${fmt(r.uRep, dg)}</td><td>${fmt(r.uStd, dg)}</td><td>${fmt(r.uRes, dg)}</td><td>${fmt(r.U, dg)}</td><td>${fmtSigned(r.err, dg)}</td><td>${fmt(r.tot, dg)}</td><td class="${r.ok ? "p" : "f"}">${r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>`).join("");
  const stdUTxt = (v.points || []).some(p => num(p.stdU) != null)
    ? (v.points || []).filter(p => num(p.reference) != null).map(p => `${esc(p.reference)} → ${esc(p.stdU || v.stdU || "–")}`).join(", ")
    : esc(v.stdU || "–");
  const pass = cs.pass && (!round.verification || (vs && vs.measOk && !vs.tooFew));
  const sign = (title, name) => `<td><div class="line"></div>(${name ? esc(name) : "&nbsp;".repeat(40)})<br>${title}<br>วันที่ ........./........./.........</td>`;
  const hdr = (pg) => `<table class="hd"><tr><td class="brand" rowspan="2"><img src="${LOGO_DATA_URI}" alt="MITR PHOL Innovation &amp; Research Center"></td><td class="t" rowspan="2">รายงานผลการทวนสอบเครื่องมือ<small>Equipment Verification Report</small></td><td class="m">รหัสเอกสาร: <b>MPIR-LF-068</b> Rev.: <b>01</b></td></tr><tr><td class="m">หน้า ${pg} / 2</td></tr></table>`;
  const p1 = `${hdr(1)}
<h3><b>1</b>ข้อมูลเครื่องมือ</h3><table><tr><td class="l">รหัสเครื่องมือ</td><td>${esc(instrument.code)}</td><td class="l">ชื่อเครื่องมือ</td><td>${esc(instrument.name)}</td></tr>
<tr><td class="l">ยี่ห้อ / รุ่น</td><td>${esc([instrument.brand, instrument.model].filter(Boolean).join(" / "))}</td><td class="l">Serial No.</td><td>${esc(instrument.serialNo)}</td></tr>
<tr><td class="l">ตำแหน่งที่ตั้ง</td><td>${esc(instrument.location)}</td><td class="l">ความละเอียด (d)</td><td>${esc(v.resolution ?? instrument.resolution ?? "")} ${unit}</td></tr>
<tr><td class="l">เหตุที่ทวนสอบ</td><td colspan="3">${reason}</td></tr>
<tr><td class="l">วันที่รับเครื่องคืน</td><td>${esc(fmtDate(v.returnedDate))}</td><td class="l">ตรวจสภาพเครื่อง</td><td>${v.condition === "abnormal" ? `☑ พบความผิดปกติ: ${esc(v.conditionNote)}` : "☑ สมบูรณ์"}</td></tr></table>
<h3><b>2</b>เกณฑ์การยอมรับและกฎการตัดสิน</h3><table><tr><td class="l">เกณฑ์ (Tolerance)</td><td>${tolTxt}</td></tr>
<tr><td class="l">ที่มาของเกณฑ์</td><td>${esc(crit?.basis || head.certCriteriaBasis || "")}</td></tr>
<tr><td class="l">Decision Rule</td><td><b>TER (Conservative):</b> ผ่าน เมื่อ |Error| + U ≤ Tolerance <span class="note">(U = ความไม่แน่นอนขยาย k = 2)</span></td></tr></table>
<h3><b>3</b>ทวนสอบผลการสอบเทียบเทียบกับเกณฑ์</h3><table><tr><td class="l">เลขที่ใบรับรอง</td><td>${esc(round.certificateNo)}</td><td class="l">วันที่สอบเทียบ</td><td>${esc(fmtDate(round.calibrationDate))}</td></tr>
<tr><td class="l">หน่วยงานสอบเทียบ</td><td>${esc(head.provider)}</td><td class="l">รับรอง ISO/IEC 17025</td><td>${/ได้รับการรับรอง ISO\/IEC 17025 ในขอบข่าย/.test(head.providerAccreditationStatus || "") ? "☑ ได้รับการรับรองในขอบข่ายนี้" : esc(head.providerAccreditationStatus || "☐ ไม่ระบุ")}</td></tr></table>
<table class="n" style="margin-top:4pt"><tr><th>ลำดับ</th><th>ช่วง</th><th>ค่าอ้างอิง (${unit})</th><th>ค่าที่อ่านได้</th><th>ก่อน/หลังปรับ</th><th>Error</th><th>U (k=2)</th><th>|Error| + U</th><th>ผล</th></tr>${certRows}</table>
<table style="margin-top:4pt"><tr><td class="l">สรุปข้อ 3</td><td>${box(cs.pass)} ทุกจุด (ค่าปัจจุบัน) ผ่านเกณฑ์ <span class="o"></span>${box(cs.foundFail)} ค่าก่อนปรับไม่ผ่าน → ประเมินผลกระทบย้อนหลังตาม MPIR-LP-012</td></tr></table>
<div class="note">Error = ค่าที่อ่านได้ − ค่าอ้างอิง · ตัดสินสถานะเครื่องจากค่าหลังปรับ · ค่าก่อนปรับใช้ประเมินผลกระทบย้อนหลัง · คำนวณโดยระบบ LabTrack</div>`;
  const p2 = `${hdr(2)}
<h3><b>4</b>ทวนสอบค่าการวัดกับมาตรฐานอ้างอิง</h3>${round.verification ? `<table><tr><td class="l">มาตรฐานอ้างอิง</td><td colspan="3">${esc(v.stdName)}</td></tr>
<tr><td class="l">เลขที่ใบรับรอง</td><td>${esc(v.stdCert)}</td><td class="l">ครบกำหนดสอบเทียบ</td><td>${esc(v.stdDue)}</td></tr>
<tr><td class="l">U ของมาตรฐาน (k=2)</td><td>${stdUTxt} ${unit}</td><td class="l">วิธีปฏิบัติ</td><td>${esc(v.wi)}</td></tr>
<tr><td class="l">วันที่ทวนสอบ</td><td>${esc(fmtDate(v.verifyDate))}</td><td class="l">สภาวะแวดล้อม</td><td>${esc(v.environment)}</td></tr></table>
<table class="n" style="margin-top:4pt;table-layout:fixed"><tr><th style="width:13%">ค่าอ้างอิง</th>${Array.from({ length: VERIFY_MAX_READS }, (_, i) => `<th>${i + 1}</th>`).join("")}<th style="width:13%">ค่าเฉลี่ย</th></tr>${readRows}</table>
<table class="n" style="margin-top:4pt"><tr><th>ค่าอ้างอิง</th><th>n</th><th>SD</th><th>u<sub>rep</sub></th><th>u<sub>std</sub></th><th>u<sub>res</sub></th><th>U = 2u<sub>c</sub></th><th>Error</th><th>|Error| + U</th><th>ผล</th></tr>${calcRows}</table>
<div class="note" style="margin-top:3pt">u<sub>rep</sub> = SD/√n · u<sub>std</sub> = U<sub>std</sub>/2 · u<sub>res</sub> = d/(2√3) · U = 2√(u<sub>rep</sub>² + u<sub>std</sub>² + u<sub>res</sub>²)${num(v.readingCorrection) ? ` · ค่าเฉลี่ยรวมค่าแก้ของมาตรฐาน ${esc(v.readingCorrection)}` : ""}${vs?.fewReads ? ` · ทวนสอบน้อยกว่า 10 ครั้ง เนื่องจาก: ${esc(v.fewReason)}` : ""}${vs?.noStdU ? " · <b>ไม่ได้ระบุ U ของมาตรฐาน</b>" : ""} · คำนวณโดยระบบ LabTrack</div>` : `<div class="note">ไม่มีการทวนสอบค่าการวัดในรอบนี้</div>`}
<h3><b>5</b>สรุปผล</h3><table><tr><td class="l">ผลการทวนสอบ</td><td>${box(pass)} <b>ผ่าน</b> <span class="o"></span>${box(!pass)} <b>ไม่ผ่าน</b> → ห้ามใช้งาน ดำเนินการตาม MPIR-LP-012 (เลขที่ NC: ${esc(v.ncNo || "............")})</td></tr>
<tr><td class="l">สถานะการใช้งาน</td><td>${esc(v.usage || "")}</td></tr><tr><td class="l">ทบทวน WI</td><td>${box(!!v.wiReview)} ${esc(v.wiReview || "")}</td></tr><tr><td class="l">หมายเหตุ</td><td>${esc(v.remark || "")}</td></tr></table>
<h3><b>6</b>ลงนาม</h3><table class="sig"><tr>${sign("ผู้ทวนสอบ", v.verifiedBy)}${sign("ผู้ประเมินผล (TM/QM)", "")}${sign("ผู้อนุมัติให้ใช้งาน (Lab manager)", "")}</tr></table>
<div class="note" style="margin-top:3pt">พิมพ์จากระบบ LabTrack เมื่อ ${esc(new Date().toLocaleString("th-TH"))} · ฉบับที่ลงนามเก็บตามระบบเอกสาร</div>`;
  const foot = `<div class="ft"><span>อ้างอิง MPIR-LP-002 ข้อ 6.3.3 · ISO/IEC 17025:2017 ข้อ 6.4.4</span><span>MPIR-LF-068 Rev.01</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>LF-068 ${esc(instrument.code)} ${esc(round.certificateNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:10mm 12mm}*{box-sizing:border-box}body{font-family:Sarabun,sans-serif;font-size:9.6pt;color:#111;margin:0;line-height:1.35}
table{border-collapse:collapse;width:100%}td,th{border:.6pt solid #222;padding:2.2pt 4pt}th{background:#E8EEF3;font-weight:600;font-size:8.8pt}
.hd td{padding:3pt 6pt}.t{text-align:center;font-weight:700;font-size:13.5pt}.t small{display:block;font-weight:400;font-size:9pt}
.brand{width:30mm;text-align:center;font-weight:700;color:#1F4E6E;font-size:9pt;line-height:1.15}.brand img{height:15mm;display:block;margin:0 auto}.m{width:52mm;font-size:8.8pt}
h3{margin:7pt 0 3pt;font-size:10.4pt}h3 b{background:#1F4E6E;color:#fff;border-radius:3pt;padding:0 5pt;margin-right:5pt;font-size:9pt}
.l{background:#F4F7F9;font-weight:600;width:30mm;font-size:8.8pt}.n td{text-align:center}.o{margin-right:10pt;white-space:nowrap}
.p{color:#1E7A4A;font-weight:700}.f{color:#B42318;font-weight:700}.note{font-size:8.2pt;color:#333}
.sig td{width:33%;height:70pt;vertical-align:bottom;text-align:center;font-size:9pt}.line{border-bottom:.6pt dotted #333;margin:0 10pt 4pt;height:28pt}
.pb{page-break-before:always}.ft{margin-top:8pt;font-size:7.6pt;color:#444;border-top:.5pt solid #999;padding-top:2pt;display:flex;justify-content:space-between}</style></head><body>
<div>${p1}${foot}</div><div class="pb">${p2}${foot}</div>
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
