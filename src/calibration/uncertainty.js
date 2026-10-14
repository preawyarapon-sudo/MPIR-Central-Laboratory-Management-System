// LF-069 · Measurement uncertainty of the test methods (Brix, Pol in cane juice,
// Fibre in prepared cane). Same layout as the yearly paper form; users type only
// the repeat results and pick the calibration certificate — everything else is
// calculated here (MPIR-WI-008 / GUM):
//   u_A  = SD/√m                       (same unit as the result). SD comes from the
//          n repeats of this study; m = number of measurements averaged for a
//          reported result (routine: 2) — the uncertainty is for what the
//          customer receives, not for the mean of the n study repeats.
//   u_B  = U_cert / k                  (certificate U is an expanded value)
//   u_res = d/(2√3)                    (resolution of the instrument)
//   Pol  : u(%Pol) = u(°Z) × 26/(100·ρ)            ρ = density of the juice at its Brix
//          + Pol factor: Pol·(dρ/dBrix)/ρ · u_c(Brix)
//   Fibre (MPIR-WI-003): %F = 100(M2 − M0)/(M1 − M0), M0 = cloth bag, M1 = bag + wet sample,
//          M2 = bag + dried sample, m = M1 − M0 (200 ± 10 g):
//          u = (u_w/m)·√[100² + F² + (100 − F)²] for each weighing u_w
//   u_c  = √(Σu²),  U = k·u_c (k = 2, ~95 %)
import { mpirCodes, num, fmt, roundsOf, isBefore, refOf, uOf, fmtDate, beYear } from "./calc.js";
import { LOGO_DATA_URI } from "./logo.js";

export const LF069_DOC = { code: "MPIR-LF-069", rev: "01" };
export const UNC_KEY = "uncertaintyReports";
export const DEFAULT_REPEATS = 7;
export const MAX_REPEATS = 10;
// Routine results are the mean of 2 measurements (lab practice).
export const DEFAULT_REPORT_REPEATS = 2;

export const TESTS = [
  { key: "brix", label: "บริกซ์ (Brix)", short: "Brix", unit: "%Brix", inst: /refract|รีแฟรก/i, instLabel: "Refractometer", instUnit: "%Brix" },
  { key: "pol", label: "โพล (Pol)", short: "Pol", unit: "%Pol", inst: /polari|โพลา/i, instLabel: "Polarimeter", instUnit: "°Z" },
  { key: "fiber", label: "ไฟเบอร์ (Fibre)", short: "Fibre", unit: "%Fibre", inst: /ชั่ง.*2|2.*ตำแหน่ง|ML3002|balance/i, instLabel: "เครื่องชั่ง 2 ตำแหน่ง", instUnit: "g" },
];

// True density of sucrose solutions at 20 °C (g/cm³, ICUMSA SPS-4).
const DENSITY_20C = [[0, 0.99820], [5, 1.01785], [10, 1.03814], [15, 1.05917], [20, 1.08096], [25, 1.10356], [30, 1.12698]];
export function sucroseDensity20(brix) {
  const t = DENSITY_20C, b = Math.min(Math.max(num(brix) ?? 15, t[0][0]), t[t.length - 1][0]);
  for (let i = 0; i < t.length - 1; i++) if (b <= t[i + 1][0]) return t[i][1] + (b - t[i][0]) / (t[i + 1][0] - t[i][0]) * (t[i + 1][1] - t[i][1]);
  return t[t.length - 1][1];
}

function stats(readings) {
  const x = (readings || []).map(num).filter(v => v != null), n = x.length;
  if (!n) return { n, x };
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return { n, x, mean, sd, uA: sd == null ? null : sd / Math.sqrt(n), max: Math.max(...x), min: Math.min(...x) };
}
const decimalsOf = (readings) => Math.max(0, ...(readings || []).filter(r => num(r) != null).map(r => (String(r).split(".")[1] || "").length));
// Report U rounded UP to the resolution of the results (never understated).
export function roundUp(x, d) { if (x == null) return null; const f = 10 ** d; return Math.ceil(x * f - 1e-9) / f; }

// Calibration rounds of an instrument usable for a report date (newest first).
export function roundsFor(certificates, instrumentId, reportDate) {
  const r = roundsOf(certificates, instrumentId);
  return reportDate ? [...r.filter(x => (x.calibrationDate || "") <= reportDate), ...r.filter(x => (x.calibrationDate || "") > reportDate)] : r;
}
// Certificate point nearest the working level, current (as-left) values only.
function certPointAt(certificates, instrumentId, certKey, level) {
  const round = roundsOf(certificates, instrumentId).find(r => r.key === certKey);
  if (!round) return null;
  const pts = round.points.filter(c => !isBefore(c) && uOf(c) != null);
  if (!pts.length) return null;
  const best = pts.slice().sort((a, b) => Math.abs((refOf(a) ?? 0) - (level ?? 0)) - Math.abs((refOf(b) ?? 0) - (level ?? 0)))[0];
  return { round, point: best, U: uOf(best), k: num(best.coverageFactor) || 2 };
}
// Type B source: a certificate in the register, or values typed from the
// paper certificate when it is not in the register (older years).
function typeB(t, certificates, level) {
  if (t.source === "manual") {
    const U = num(t.manualU), k = num(t.manualK) || 2;
    return U == null ? null : { U, k, u: U / k, text: `${t.manualNote || "ค่าจากใบรับรอง (กรอกเอง)"} · U = ${t.manualU}, k = ${k}`, certNo: t.manualCertNo || "", at: "" };
  }
  const cp = t.instrumentId && t.certKey ? certPointAt(certificates, t.instrumentId, t.certKey, level) : null;
  if (!cp) return null;
  return { U: cp.U, k: cp.k, u: cp.U / cp.k, certNo: cp.round.certificateNo, calDate: cp.round.calibrationDate, at: refOf(cp.point),
    text: `ใบรับรอง ${cp.round.certificateNo} (${fmtDate(cp.round.calibrationDate)}) ที่จุด ${refOf(cp.point)} · U = ${cp.U}, k = ${cp.k}` };
}

const DEFAULT_RES = { brix: 0.01, pol: 0.01, fiber: 0.01 };
// Resolution of the instrument used: typed in the report, else the register.
export function resolutionOf(t, T, equipment = []) {
  const e = equipment.find(x => x.id === t?.instrumentId);
  return num(t?.res) ?? num(e?.resolution) ?? DEFAULT_RES[T.key];
}
export function calcReport(rep, certificates, equipment = []) {
  const out = {};
  const brixS = stats(rep.brix?.readings);
  const r3 = 2 * Math.sqrt(3);
  for (const T of TESTS) {
    const t = rep[T.key] || {};
    const A0 = stats(t.readings);
    const mRep = Math.max(1, Math.round(num(t.mRep) || DEFAULT_REPORT_REPEATS));
    const A = { ...A0, m: mRep, uA: A0.sd == null ? null : A0.sd / Math.sqrt(mRep) };
    const dec = Math.max(2, decimalsOf(t.readings));
    const d = resolutionOf(t, T, equipment);
    let level = A.mean ?? null, c = 1, extra = {};
    if (T.key === "pol") {
      const b = brixS.mean ?? 15, rho = sucroseDensity20(b), polFactor = 100 * rho / 26;
      const slope = sucroseDensity20(b + 0.5) - sucroseDensity20(b - 0.5); // dρ/dBrix per %Brix
      c = 26 / (100 * rho); level = A.mean != null ? A.mean * polFactor : null;
      extra = { rho, polFactor, brixUsed: brixS.mean ?? null, slope };
    }
    if (T.key === "fiber") {
      const M1 = num(t.m1) || 200; // sample mass m = M1 − M0 (WI: 200 ± 10 g)
      extra = { M1 };
      level = M1;
    }
    const B = typeB(t, certificates, level);
    const uR = d / r3; // resolution, instrument unit
    let uCal = null, uRes = null, uPF = null;
    if (T.key === "fiber") {
      // ∂F/∂M2 = 100/m, ∂F/∂M1 = −F/m, ∂F/∂M0 = −(100 − F)/m
      const F = A.mean ?? 0, m = extra.M1, c2 = 100 / m, c1 = F / m, c0 = (100 - F) / m;
      const prop = (u) => Math.sqrt((c2 * u) ** 2 + (c1 * u) ** 2 + (c0 * u) ** 2);
      uCal = B ? prop(B.u) : null; uRes = prop(uR);
      extra = { ...extra, c2, c1, c0 };
    } else {
      uCal = B ? c * B.u : null; uRes = c * uR;
      if (T.key === "pol") {
        const ucBrix = out.brix?.uc;
        // Pol % = °Z·26/(100ρ): ∂Pol/∂ρ = −Pol/ρ, ρ from Brix → u = Pol·(dρ/dBrix)/ρ·u_c(Brix)
        uPF = A.mean != null && ucBrix != null ? A.mean * (extra.slope / extra.rho) * ucBrix : null;
      }
    }
    const uB = uCal == null || (T.key === "pol" && uPF == null) ? null : Math.sqrt(uCal ** 2 + uRes ** 2 + (uPF || 0) ** 2);
    const uc = uB != null && A.uA != null ? Math.sqrt(uB ** 2 + A.uA ** 2) : null;
    const U = uc == null ? null : 2 * uc;
    out[T.key] = { T, A, B, c, d, uR, uCal, uRes, uPF, uB, uc, U, Ur: roundUp(U, dec), dec, level, ...extra,
      complete: uc != null, missing: [A.n < 2 ? "ผลทดสอบซ้ำอย่างน้อย 2 ค่า" : "", !B ? "ใบรับรองของเครื่องมือ" : "", T.key === "pol" && out.brix && !out.brix.complete ? "ผล Brix (ใช้หา Pol factor)" : ""].filter(Boolean) };
  }
  return out;
}

/* ---------------- printable report ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const f4 = (x) => fmt(x, 4);

// Sources of uncertainty per test (cause-and-effect). Same in the printed
// report and the registered Word form; every branch is either calculated or
// stated as included in Repeatability.
export const FISHBONES = {
  brix: { effect: "Brix (%)", bones: [{ name: "Calibration", sub: ["ใบรับรอง Refractometer"] }, { name: "Repeatability", sub: ["ตัวอย่าง / ผู้วิเคราะห์", "อุณหภูมิ (ATC)"] }, { name: "Resolution", sub: ["d/(2√3)"] }] },
  pol: { effect: "Pol (%)", bones: [{ name: "Pol Reading (°Z)", sub: ["Calibration", "Resolution"] }, { name: "Repeatability", sub: ["ตัวอย่าง / ผู้วิเคราะห์", "อุณหภูมิ"] }, { name: "Pol Factor", sub: ["Brix → ρ20"] }] },
  fiber: { effect: "ไฟเบอร์ (%)", bones: [{ name: "M1", sub: ["Calibration", "Resolution"] }, { name: "M2", sub: ["Calibration", "Resolution"] }, { name: "M0", sub: ["Calibration", "Resolution"] }, { name: "Repeatability", sub: ["การอบ (อุณหภูมิ/เวลา)", "ความชื้นขณะชั่ง", "ผู้วิเคราะห์"] }] },
};
// Cause-and-effect (fishbone) diagram as inline SVG.
export function fishbone(effect, bones) {
  const W = 520, H = 150, y = 75, x0 = 20, x1 = 400;
  const top = bones.filter((_, i) => i % 2 === 0), bot = bones.filter((_, i) => i % 2 === 1);
  const step = (x1 - x0 - 40) / Math.max(top.length, bot.length, 1);
  const bone = (b, i, up) => {
    const xe = x0 + 60 + i * step + step * 0.6, xs = xe - 40, ys = up ? y - 56 : y + 56;
    const subs = (b.sub || []).map((s, j) => { const yy = ys + (up ? 1 : -1) * (14 + j * 13), xx = xs + 40 * ((yy - ys) / (y - ys));
      return `<line x1="${xx - 46}" y1="${yy}" x2="${xx}" y2="${yy}" stroke="#555" stroke-width=".7"/><text x="${xx - 48}" y="${yy - 2}" text-anchor="end" font-size="8.5">${esc(s)}</text>`; }).join("");
    return `<line x1="${xs}" y1="${ys}" x2="${xe}" y2="${y}" stroke="#1F4E6E" stroke-width="1.3"/><text x="${xs}" y="${up ? ys - 5 : ys + 12}" text-anchor="middle" font-size="9.5" font-weight="600">${esc(b.name)}</text>${subs}`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:150mm;display:block;margin:2pt auto" font-family="Sarabun, sans-serif">
<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#1F4E6E" stroke-width="2"/><polygon points="${x1},${y - 5} ${x1 + 10},${y} ${x1},${y + 5}" fill="#1F4E6E"/>
<rect x="${x1 + 12}" y="${y - 15}" width="${W - x1 - 14}" height="30" rx="4" fill="#E8EEF3" stroke="#1F4E6E"/><text x="${(x1 + 12 + W - 2) / 2}" y="${y + 4}" text-anchor="middle" font-size="10.5" font-weight="700">${esc(effect)}</text>
${top.map((b, i) => bone(b, i, true)).join("")}${bot.map((b, i) => bone(b, i, false)).join("")}</svg>`;
}

function readingsTable(cols, rowsN) {
  const n = Math.max(...cols.map(c => c.r.A.n), 0);
  const body = Array.from({ length: n }, (_, i) => `<tr><td>${i + 1}</td>${cols.map(c => `<td>${esc(c.r.A.x[i] ?? "")}</td>`).join("")}</tr>`).join("");
  const stat = (label, f) => `<tr class="s"><td>${label}</td>${cols.map(c => `<td>${f(c.r)}</td>`).join("")}</tr>`;
  return `<table class="n w60"><tr><th>ตัวอย่างซ้ำที่</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr>${body}
${stat("Average", r => fmt(r.A.mean, r.dec))}${rowsN.includes("max") ? stat("Max", r => fmt(r.A.max, r.dec)) + stat("Min", r => fmt(r.A.min, r.dec)) : ""}
${stat("SD", r => f4(r.A.sd))}${stat(`u<sub>A</sub>(x) = SD/√m`, r => `${f4(r.A.uA)} <span style="font-weight:400">(m = ${r.A.m})</span>`)}</table>`;
}

export function lf069Html(rep, certificates, equipment) {
  const R = calcReport(rep, certificates, equipment);
  const b = R.brix, p = R.pol, fb = R.fiber;
  const inst = (id) => equipment.find(e => e.id === id);
  const instTxt = (t) => { const e = inst(rep[t]?.instrumentId); return e ? `${e.code || ""} ${e.name || ""}${e.brand || e.model ? ` [${[e.brand, e.model].filter(Boolean).join(", ")}${e.serialNo ? `, S/N ${e.serialNo}` : ""}]` : ""}`.trim() : ""; };
  const year = rep.year || beYear(rep.reportDate);
  const Bline = (r, what) => r.B ? `${what}: ${esc(r.B.text)} → u = U/k = ${f4(r.B.u)} ${esc(r.T.instUnit)}` : `${what}: <b>ยังไม่ได้ระบุใบรับรอง</b>`;
  const hdr = (pg, tot) => `<table class="hd"><tr><td class="brand" rowspan="2"><img src="${LOGO_DATA_URI}" alt="MITR PHOL Innovation &amp; Research Center"></td><td class="t" rowspan="2">รายงานผลการประเมินความไม่แน่นอนของการวัด<small>Measurement Uncertainty Evaluation Report · ประจำปี ${esc(year)}</small></td><td class="m">รหัสเอกสาร: <b>${LF069_DOC.code}</b> Rev.: <b>${LF069_DOC.rev}</b></td></tr><tr><td class="m">หน้า ${pg} / ${tot}</td></tr></table>`;
  const refs = mpirCodes(rep.references || "").split(/\n/).map(s => s.trim()).filter(Boolean);
  const sumRow = (label, fn, note = "") => `<tr><td class="lft">${label}</td>${fn}<td class="lft">${note}</td></tr>`;

  const ex = rep.example || {};
  const exLine = (v, r, unit) => num(v) == null ? "" : `<p class="ind2">- ค่า${r.T.key === "brix" ? "บริกซ์" : r.T.key === "pol" ? "โพล" : "ไฟเบอร์"} ${esc(v)} ± ${fmt(r.Ur, r.dec)} ${unit} ที่ระดับความเชื่อมั่น 95%</p>`;
  const sign = (title, name) => `<td><div class="line"></div>(${name ? esc(name) : "&nbsp;".repeat(40)})<br>${title}<br>วันที่ ........./........./.........</td>`;
  const p1 = `${hdr(1, 5)}
<h3><b>1</b>วัตถุประสงค์</h3><p>${esc(rep.objective)}</p>
<h3><b>2</b>ผู้ดำเนินการ</h3>
<p>▪ ทดสอบซ้ำตามวิธีวัดค่าองศาบริกซ์ (Brix) และโพลาไรเซชัน (Pol) ในตัวอย่างน้ำอ้อย และการวิเคราะห์ค่าเส้นใย (Fibre) ในตัวอย่างชานอ้อยย่อย โดยเจ้าหน้าที่วิเคราะห์ ชื่อ ${esc(rep.testers || "....................")}${rep.testDate ? ` วันที่ทดสอบ ${esc(fmtDate(rep.testDate))}` : ""}</p>
${rep.sampleNote ? `<p class="ind">หมายเหตุ: ${esc(rep.sampleNote)}</p>` : ""}
<p>▪ ดูแลการทดสอบ และประเมินความไม่แน่นอนของการวัด โดย ${esc(rep.supervisor || "....................")}</p>
<h3><b>3</b>เอกสารอ้างอิง</h3>${refs.map(r => `<p class="ind">- ${esc(r)}</p>`).join("")}
<h3><b>4</b>ผลการประเมินความไม่แน่นอนของการวัด</h3>
<h4>4.1 ความไม่แน่นอนของวิธีวัดค่าองศาบริกซ์ (Brix) และโพลาไรเซชัน (Pol) ในตัวอย่างน้ำอ้อย</h4>
<h5>4.1.1 สมการ และแผนภูมิก้างปลา — บริกซ์</h5>
<p class="ind">บริกซ์ (Brix) = ค่า Brix ที่วัดได้จากเครื่อง Refractometer ${esc(instTxt("brix"))}</p>
${fishbone(FISHBONES.brix.effect, FISHBONES.brix.bones)}
<p class="ind note">อุณหภูมิ: เครื่องมีระบบชดเชยอุณหภูมิ (ATC) ผลที่เหลือรวมอยู่ใน Repeatability</p>
<h5>4.1.2 สมการ และแผนภูมิก้างปลา — โพล</h5>
<p class="ind">%Pol = Pol reading (°Z) × Pol Factor &nbsp;(MPIR-WI-002 ข้อ 7.5.2) &nbsp;·&nbsp; Pol Factor = 26.000 / (100 × ρ<sub>20</sub>) &nbsp;(ρ<sub>20</sub> = ความหนาแน่นของน้ำอ้อยที่ 20 °C ตามค่า Brix)</p>
<p class="ind">Polarimeter ${esc(instTxt("pol"))}</p>
${fishbone(FISHBONES.pol.effect, FISHBONES.pol.bones)}
`;
  const p2 = `${hdr(2, 5)}
<h5>4.1.3 แหล่งของ Uncertainty และสรุปการคำนวณ</h5>
<table class="n"><tr><th class="lft">หัวข้อ</th><th>Brix (%Brix)</th><th>Pol (%Pol)</th><th class="lft">หมายเหตุ</th></tr>
${sumRow("1 Standard Uncertainty of Component", "<td></td><td></td>")}
${sumRow("&nbsp;&nbsp;1.1 Calibration", `<td>${f4(b.uCal)}</td><td>${f4(p.uCal)}</td>`, "Brix = Refractometer · Pol = Polarimeter (°Z → %Pol)")}
${sumRow("&nbsp;&nbsp;1.2 Resolution", `<td>${f4(b.uRes)}</td><td>${f4(p.uRes)}</td>`, `d = ${esc(b.d)} %Brix / ${esc(p.d)} °Z`)}
${sumRow("&nbsp;&nbsp;1.3 Pol Factor (จาก Brix)", `<td>–</td><td>${f4(p.uPF)}</td>`, "ρ<sub>20</sub> ขึ้นกับค่า Brix")}
${sumRow("&nbsp;&nbsp;1.4 Repeatability (u<sub>A</sub>)", `<td>${f4(b.A.uA)}</td><td>${f4(p.A.uA)}</td>`, `SD จาก ${b.A.n} / ${p.A.n} ซ้ำ · รายงานเฉลี่ย m = ${b.A.m} / ${p.A.m} ครั้ง · รวมผลของอุณหภูมิ`)}
${sumRow("2 Combined Uncertainty (u<sub>c</sub>)", `<td>${f4(b.uc)}</td><td>${f4(p.uc)}</td>`)}
${sumRow("3 Expanded Uncertainty (U, k = 2)", `<td><b>${f4(b.U)}</b></td><td><b>${f4(p.U)}</b></td>`, "ที่ระดับความเชื่อมั่น 95%")}</table>

<h5>4.1.4 รายละเอียดการคำนวณ Uncertainty</h5>
<p class="ind"><b>4.1.4.1 แหล่งของ Uncertainty</b></p>
<table class="w80"><tr><th class="lft">Uncertainty Component</th><th class="lft">Source of Uncertainty</th></tr>
<tr><td>ค่าความไม่แน่นอนของมาตรฐานอ้างอิง และของเครื่องมือ</td><td>Uncertainty จากการสอบเทียบ Refractometer และ Polarimeter (Type B)</td></tr>
<tr><td>ความละเอียดของเครื่องมือ (Resolution)</td><td>u = d/(2√3) (Type B, rectangular)</td></tr>
<tr><td>Pol Factor</td><td>ความหนาแน่นของน้ำอ้อยขึ้นกับค่า Brix ที่วัดได้ (Type B)</td></tr>
<tr><td>การชักตัวอย่าง วิธีวิเคราะห์ และผู้วิเคราะห์</td><td>Uncertainty ของการวิเคราะห์ซ้ำ (Type A)</td></tr></table>
<p class="ind"><b>4.1.4.2 Standard Uncertainty ของแต่ละ Component</b></p>
<p class="ind2">- Calibration: ${Bline(b, "Refractometer")}</p>
<p class="ind2">- Resolution: u = d/(2√3) = ${esc(b.d)}/3.4641 = <b>${f4(b.uRes)}</b> %Brix</p>
<p class="ind2">- Calibration: ${Bline(p, "Polarimeter")}<br>&nbsp;&nbsp;แปลงเป็น %Pol ด้วย Pol Factor: c = 26/(100 × ρ<sub>20</sub>) = 26/(100 × ${fmt(p.rho, 5)}) = ${f4(p.c)} (ρ<sub>20</sub> ที่ ${fmt(p.brixUsed, 2)} %Brix) → ${f4(p.B?.u)} × ${f4(p.c)} = <b>${f4(p.uCal)}</b> %Pol</p>
<p class="ind2">- Resolution: u = ${esc(p.d)}/3.4641 × ${f4(p.c)} = <b>${f4(p.uRes)}</b> %Pol</p>
<p class="ind2">- Pol Factor: u = %Pol × (dρ/dBrix)/ρ<sub>20</sub> × u<sub>c</sub>[Brix] = ${fmt(p.A.mean, p.dec)} × ${fmt(p.slope, 5)}/${fmt(p.rho, 5)} × ${f4(b.uc)} = <b>${f4(p.uPF)}</b> %Pol</p>
`;
  const p3 = `${hdr(3, 5)}
<p class="ind2">- Repeatability: SD จากการวัดบริกซ์และโพลของตัวอย่างเดียวกัน ${b.A.n} ซ้ำ · u<sub>A</sub>(x) = SD/√m โดย m = จำนวนครั้งที่วัดแล้วเฉลี่ยเป็นผลที่รายงานลูกค้า (Brix m = ${b.A.m}, Pol m = ${p.A.m})</p>
${readingsTable([{ label: "Brix (บริกซ์)", r: b }, { label: "% Pol (โพล)", r: p }], [])}
<p class="ind"><b>4.1.4.3 Combined Uncertainty</b></p>
<p class="ind2">u<sub>c</sub>[Brix] = √[(${f4(b.uCal)})² + (${f4(b.uRes)})² + (${f4(b.A.uA)})²] = <b>${f4(b.uc)}</b> %Brix</p>
<p class="ind2">u<sub>c</sub>[Pol] = √[(${f4(p.uCal)})² + (${f4(p.uRes)})² + (${f4(p.uPF)})² + (${f4(p.A.uA)})²] = <b>${f4(p.uc)}</b> %Pol</p>
<p class="ind"><b>4.1.4.4 Expanded Uncertainty</b> (Coverage Factor k = 2 ที่ระดับความเชื่อมั่น 95%)</p>
<p class="ind2">U[Brix] = ${f4(b.uc)} × 2 = <b>${f4(b.U)}</b> %Brix &nbsp;&nbsp; U[Pol] = ${f4(p.uc)} × 2 = <b>${f4(p.U)}</b> %Pol</p>
<h5>4.1.5 การรายงานผล พร้อมค่า Uncertainty</h5>
<p class="ind2">Brix ในน้ำอ้อย = ค่าที่ได้จากการตรวจทดสอบ ± ${fmt(b.Ur, b.dec)} %Brix</p>
<p class="ind2">%Pol ในน้ำอ้อย = ค่าที่ได้จากการตรวจทดสอบ ± ${fmt(p.Ur, p.dec)} %Pol</p>
<h4>4.2 ความไม่แน่นอนของการวัดไฟเบอร์ในชานอ้อยย่อย</h4>
<h5>4.2.1 สมการ</h5>
<p class="ind">%ไฟเบอร์ = 100 × (M2 − M0) / (M1 − M0) &nbsp;(MPIR-WI-003 ข้อ 7.5)</p>
<p class="ind">M0 = น้ำหนักถุงผ้า · M1 = น้ำหนักถุงผ้า + ชานอ้อยย่อยก่อนอบ · M2 = น้ำหนักถุงผ้า + ชานอ้อยย่อยหลังอบ · m = M1 − M0 = ${esc(fb.M1)} g (ตาม WI 200 ± 10 g)</p>
<p class="ind">เครื่องชั่ง ${esc(instTxt("fiber"))}</p>
<h5>4.2.2 แผนภูมิก้างปลา</h5>
${fishbone(FISHBONES.fiber.effect, FISHBONES.fiber.bones)}
<p class="ind note">อุณหภูมิ/เวลาอบ ความชื้นขณะชั่ง และผู้วิเคราะห์ รวมอยู่ใน Repeatability · Linearity ของเครื่องชั่งรวมอยู่ใน U ของใบรับรอง</p>

`;
  const p4 = `${hdr(4, 5)}
<h5>4.2.3 แหล่งของ Uncertainty และสรุปการคำนวณ</h5>
<table class="n w80"><tr><th class="lft">หัวข้อ</th><th>%Fibre</th><th class="lft">หมายเหตุ</th></tr>
${sumRow("1 Standard Uncertainty of Component", "<td></td>")}
${sumRow("&nbsp;&nbsp;1.1 การชั่งน้ำหนัก — Calibration", `<td>${f4(fb.uCal)}</td>`, "M0, M1, M2")}
${sumRow("&nbsp;&nbsp;1.2 การชั่งน้ำหนัก — Resolution", `<td>${f4(fb.uRes)}</td>`, `d = ${esc(fb.d)} g`)}
${sumRow("&nbsp;&nbsp;1.3 Repeatability (u<sub>A</sub>)", `<td>${f4(fb.A.uA)}</td>`, `SD จาก ${fb.A.n} ซ้ำ · รายงานเฉลี่ย m = ${fb.A.m} ครั้ง · รวมผลของการอบ/ความชื้น`)}
${sumRow("2 Combined Uncertainty (u<sub>c</sub>)", `<td>${f4(fb.uc)}</td>`)}
${sumRow("3 Expanded Uncertainty (U, k = 2)", `<td><b>${f4(fb.U)}</b></td>`, "ที่ระดับความเชื่อมั่น 95%")}</table>
<h5>4.2.4 รายละเอียดการคำนวณ Uncertainty</h5>
<p class="ind"><b>4.2.4.1 Standard Uncertainty ของการชั่งน้ำหนัก</b></p>
<p class="ind2">- ${Bline(fb, "เครื่องชั่ง")}</p>
<p class="ind2">- c<sub>M2</sub> = 100/m = ${f4(fb.c2)} · c<sub>M1</sub> = %F/m = ${fmt(fb.A.mean, fb.dec)}/${esc(fb.M1)} = ${f4(fb.c1)} · c<sub>M0</sub> = (100 − %F)/m = ${f4(fb.c0)} &nbsp;(%/g)</p>
<p class="ind2">- Calibration: u × √[c<sub>M2</sub>² + c<sub>M1</sub>² + c<sub>M0</sub>²] = ${f4(fb.B?.u)} × √[(${f4(fb.c2)})² + (${f4(fb.c1)})² + (${f4(fb.c0)})²] = <b>${f4(fb.uCal)}</b> %Fibre</p>
<p class="ind2">- Resolution: u = d/(2√3) = ${esc(fb.d)}/3.4641 = ${f4(fb.uR)} g ต่อการชั่ง → ${f4(fb.uR)} × √[(${f4(fb.c2)})² + (${f4(fb.c1)})² + (${f4(fb.c0)})²] = <b>${f4(fb.uRes)}</b> %Fibre</p>
<p class="ind"><b>4.2.4.2 Repeatability: u<sub>A</sub>(x) = SD/√m</b> · SD จากการวัดไฟเบอร์ตัวอย่างเดียวกัน ${fb.A.n} ซ้ำ · m = ${fb.A.m} (จำนวนถุงที่เฉลี่ยเป็นผลที่รายงาน)</p>
${readingsTable([{ label: "%ไฟเบอร์ในชานอ้อยย่อย", r: fb }], ["max"])}
`;
  const p5 = `${hdr(5, 5)}
<p class="ind"><b>4.2.4.3 Combined Uncertainty</b> &nbsp; u<sub>c</sub>[Fibre] = √[(${f4(fb.uCal)})² + (${f4(fb.uRes)})² + (${f4(fb.A.uA)})²] = <b>${f4(fb.uc)}</b></p>
<p class="ind"><b>4.2.4.4 Expanded Uncertainty</b> &nbsp; U[Fibre] = ${f4(fb.uc)} × 2 = <b>${f4(fb.U)}</b> %Fibre</p>
<h5>4.2.5 การรายงานผล พร้อมค่า Uncertainty</h5>
<p class="ind2">%ไฟเบอร์ในชานอ้อยย่อย = ค่าที่ได้จากการตรวจทดสอบ ± ${fmt(fb.Ur, fb.dec)} %</p>
<h3><b>5</b>สรุปผล</h3>
<table class="n w80"><tr><th class="lft">รายการทดสอบ</th><th>U (k = 2)</th><th>ค่าที่ใช้รายงาน (ปัดขึ้น)</th></tr>
<tr><td class="lft">องศาบริกซ์ (Brix) ในตัวอย่างน้ำอ้อย</td><td>${f4(b.U)}</td><td><b>± ${fmt(b.Ur, b.dec)} %Brix</b></td></tr>
<tr><td class="lft">%โพลาไรเซชัน (Pol) ในตัวอย่างน้ำอ้อย</td><td>${f4(p.U)}</td><td><b>± ${fmt(p.Ur, p.dec)} %Pol</b></td></tr>
<tr><td class="lft">%เส้นใย (Fibre) ในตัวอย่างชานอ้อยย่อย</td><td>${f4(fb.U)}</td><td><b>± ${fmt(fb.Ur, fb.dec)} %</b></td></tr></table>
${ex.sampleNo || num(ex.brix) != null || num(ex.pol) != null || num(ex.fiber) != null ? `<h3><b>6</b>ตัวอย่างการรายงานผล</h3><p class="ind">ผลวิเคราะห์ตัวอย่าง หมายเลข ${esc(ex.sampleNo || "....")} รายงานดังนี้</p>${exLine(ex.brix, b, "%Brix")}${exLine(ex.pol, p, "%Pol")}${exLine(ex.fiber, fb, "%")}` : ""}
<table class="sig"><tr>${sign("จัดทำโดย", rep.preparedBy)}${sign("ทบทวนโดย (TM/QM)", "")}${sign("อนุมัติโดย (Lab manager)", "")}</tr></table>
<div class="note">u<sub>A</sub> = SD/√m (SD จากการทดสอบซ้ำ n ครั้ง, m = จำนวนครั้งที่เฉลี่ยเป็นผลที่รายงาน) · Calibration = U ของใบรับรอง ÷ k · Resolution = d/(2√3) · คูณ sensitivity coefficient ให้เป็นหน่วยของผล · U = 2u<sub>c</sub> · ค่าที่ใช้รายงานปัดขึ้นตามความละเอียดของผล · คำนวณโดยระบบ LabTrack (Instrument Assurance System) พิมพ์เมื่อ ${esc(new Date().toLocaleString("th-TH"))} · ฉบับที่ลงนามเก็บตามระบบเอกสาร</div>`;
  const foot = `<div class="ft"><span>อ้างอิง ISO/IEC 17025:2017 ข้อ 7.6 · MPIR-WI-008</span><span>${LF069_DOC.code} Rev.${LF069_DOC.rev}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>LF-069 ประจำปี ${esc(year)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:10mm 12mm}*{box-sizing:border-box}body{font-family:Sarabun,sans-serif;font-size:9.8pt;color:#111;margin:0;line-height:1.4}
table{border-collapse:collapse;width:100%;margin:3pt 0}td,th{border:.6pt solid #222;padding:2pt 5pt}th{background:#E8EEF3;font-weight:600;font-size:9pt}
.hd td{padding:3pt 6pt}.t{text-align:center;font-weight:700;font-size:13pt}.t small{display:block;font-weight:400;font-size:9pt}
.brand{width:30mm;text-align:center;font-weight:700;color:#1F4E6E;font-size:9pt;line-height:1.15}.brand img{height:15mm;display:block;margin:0 auto}.m{width:50mm;font-size:8.8pt}
h3{margin:7pt 0 3pt;font-size:10.6pt}h3 b{background:#1F4E6E;color:#fff;border-radius:3pt;padding:0 5pt;margin-right:5pt;font-size:9pt}
h4{margin:6pt 0 2pt;font-size:10.2pt}h5{margin:5pt 0 2pt 8pt;font-size:9.8pt}p{margin:1pt 0 1pt 8pt}.ind{margin-left:16pt}.ind2{margin-left:26pt}
.n td{text-align:center}.n .lft,.lft{text-align:left}.n tr.s td{background:#F4F7F9;font-weight:600}.w60{width:62%;margin-left:26pt}.w80{width:88%;margin-left:16pt}
.note{font-size:8pt;color:#333;margin-top:4pt}.sig{margin-top:12pt}.sig td{border:none;width:33%;height:64pt;vertical-align:bottom;text-align:center;font-size:9pt}.line{border-bottom:.6pt dotted #333;margin:0 10pt 4pt;height:26pt}
.pg{page-break-after:always}.ft{margin-top:6pt;font-size:7.6pt;color:#444;border-top:.5pt solid #999;padding-top:2pt;display:flex;justify-content:space-between}</style></head><body>
<div class="pg">${p1}${foot}</div><div class="pg">${p2}${foot}</div><div class="pg">${p3}${foot}</div><div class="pg">${p4}${foot}</div><div>${p5}${foot}</div>
<script>document.fonts.ready.then(function(){setTimeout(function(){window.print()},300)});</script></body></html>`;
}

export function printLf069(rep, certificates, equipment) {
  const w = window.open("", "_blank");
  if (!w) { alert("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up แล้วลองอีกครั้ง"); return false; }
  w.document.open(); w.document.write(lf069Html(rep, certificates, equipment)); w.document.close();
  return true;
}
