// LF-069 · Measurement uncertainty of the test methods (Brix, Pol in cane juice,
// Fibre in prepared cane). Same layout as the yearly paper form; users type only
// the repeat results and pick the calibration certificate — everything else is
// calculated here (MPIR-WI-008 / GUM):
//   Relative method (lab decision 2569): every component is turned into a
//   relative standard uncertainty u/x̄ before combining, Repeatability as
//          u_A,rel = RSD/√m   (RSD = SD/x̄, m = n repeats by default — the
//          uncertainty of the instrument, not of a 2-replicate customer result)
//   u_c,rel = √(Σ u_rel²),  u_c = u_c,rel × x̄  (identical to the absolute GUM sum)
//   u_B  = U_cert / k                  (certificate U is an expanded value)
//   u_res = d/(2√3)                    (resolution of the instrument)
//   Pol  : u(%Pol) = u(°Z) × 26/(100·ρ)            ρ = density of the juice at its Brix
//          + Pol factor: Pol·(dρ/dBrix)/ρ · u_c(Brix)
//   Fibre (MPIR-WI-003): %F = 100(M2 − M0)/(M1 − M0), M0 = cloth bag, M1 = bag + wet sample,
//          M2 = bag + dried sample, m = M1 − M0 (200 ± 10 g):
//          u = (u_w/m)·√[100² + F² + (100 − F)²] for each weighing u_w
//   U = k·u_c (k = 2, ~95 %)
import { mpirCodes, num, fmt, roundsOf, isBefore, refOf, uOf, fmtDate, beYear } from "./calc.js";
import { LOGO_DATA_URI } from "./logo.js";

export const LF069_DOC = { code: "MPIR-LF-069", rev: "01" };
export const UNC_KEY = "uncertaintyReports";
export const DEFAULT_REPEATS = 3; // rows offered for a new report (minimum)
export const MIN_REPEATS = 3;
export const MAX_REPEATS = 30;
// m defaults to the number of repeats n (instrument uncertainty).

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
    const mRep = Math.max(1, Math.round(num(t.mRep) || A0.n || DEFAULT_REPEATS));
    const rsd = A0.sd != null && A0.mean ? A0.sd / Math.abs(A0.mean) : null;
    const A = { ...A0, m: mRep, rsd, uArel: rsd == null ? null : rsd / Math.sqrt(mRep), uA: A0.sd == null ? null : A0.sd / Math.sqrt(mRep) };
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
      // form equation %F = 100(M2 − M0)/M1, M1 = sample before drying:
      // ∂F/∂M2 = 100/M1, ∂F/∂M0 = −100/M1, ∂F/∂M1 = −F/M1
      const F = A.mean ?? 0, m = extra.M1, c2 = 100 / m, c1 = F / m, c0 = 100 / m;
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
    // relative components (u / x̄) — combined as relatives, then × x̄
    const xb = A.mean ? Math.abs(A.mean) : null, rel = (u) => (u == null || !xb ? null : u / xb);
    const rCal = rel(uCal), rRes = rel(uRes), rPF = rel(uPF);
    // Calibration + Repeatability only, as in the registered form (resolution
    // is reflected in the repeat readings; Pol factor not counted).
    const ucRel = rCal != null && A.uArel != null ? Math.sqrt(rCal ** 2 + A.uArel ** 2) : null;
    const uc = ucRel == null ? null : ucRel * xb;
    const U = uc == null ? null : 2 * uc;
    out[T.key] = { T, A, B, c, d, uR, uCal, uRes, uPF, uB, rCal, rRes, rPF, ucRel, uc, U, Ur: roundUp(U, dec), dec, level, ...extra,
      complete: uc != null, missing: [A.n < MIN_REPEATS ? `ค่าที่วัดได้อย่างน้อย ${MIN_REPEATS} ซ้ำ` : "", !B ? "ใบรับรองของเครื่องมือ" : ""].filter(Boolean) };
  }
  return out;
}

/* ---------------- printable report ---------------- */
// Same layout as the registered paper form (RDI-LF-069 Rev.00, 6 pages):
// small logo + "code Rev. Page x of 6" + centred title above a framed page,
// numbered headings 1–6, tables and fishbones in the same places.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const f4 = (x) => fmt(x, 4);
const f5 = (x) => fmt(x, 5); // relative (u/x̄)

// Sources of uncertainty per test, drawn as in the paper form. Every branch is
// either calculated or included in Repeatability.
export const FISHBONES = {
  brix: { effect: "Brix (%)", top: [{ name: "ค่า Brix ที่อ่านได้จากการวัด", sub: ["Calibration"] }], bottom: [{ name: "Repeatability", sub: [] }] },
  pol: { effect: "Pol (%)", top: [{ name: "Pol Reading (°Z)", sub: ["Calibration"] }], bottom: [{ name: "Pol Factor", sub: [] }, { name: "Repeatability", sub: [] }] },
  fiber: { effect: "ไฟเบอร์ (%)", top: [{ name: "M1", sub: ["Linearity", "Resolution"] }, { name: "M0", sub: ["Linearity", "Resolution"] }], bottom: [{ name: "M2", sub: ["Temperature", "Linearity"] }, { name: "Repeatability", sub: [] }] },
};
// Cause-and-effect diagram in the paper form's style (black lines, open triangle head).
export function fishbone({ effect, top, bottom }) {
  const W = 470, H = 150, y = 75, x1 = 330;
  const slots = Math.max(top.length, bottom.length);
  const step = (x1 - 40) / slots;
  const bone = (b, i, up) => {
    const xe = 40 + step * (i + 1) - 10, xs = xe - 70, ys = up ? y - 58 : y + 58;
    const subs = b.sub.map((s, j) => {
      const f = 0.3 + j * (0.55 / Math.max(b.sub.length, 1)), yy = ys + (y - ys) * f, xx = xs + (xe - xs) * f;
      return `<line x1="${xx - 46}" y1="${yy}" x2="${xx - 3}" y2="${yy}" stroke="#000" stroke-width=".7" marker-end="url(#ah)"/><text x="${xx - 48}" y="${yy + 3}" text-anchor="end" font-size="8.5">${esc(s)}</text>`;
    }).join("");
    return `<line x1="${xs}" y1="${ys}" x2="${xe}" y2="${y}" stroke="#000" stroke-width="1"/><text x="${xs}" y="${up ? ys - 5 : ys + 11}" text-anchor="middle" font-size="9">${esc(b.name)}</text>${subs}`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" width="128mm" style="display:block;margin:3pt 0 3pt 12mm" font-family="Sarabun, sans-serif">
<defs><marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#000"/></marker></defs>
<line x1="20" y1="${y}" x2="${x1}" y2="${y}" stroke="#000" stroke-width="1.2" marker-end="url(#ah)"/>
<polygon points="${x1 + 2},${y - 32} ${x1 + 82},${y} ${x1 + 2},${y + 32}" fill="#fff" stroke="#000" stroke-width="1.2"/>
<text x="${x1 + 30}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="700">${esc(effect)}</text>
${top.map((b, i) => bone(b, i, true)).join("")}${bottom.map((b, i) => bone(b, i, false)).join("")}</svg>`;
}

// Section 3: the user's references + the instrument verification report of
// that year, added automatically ("รายงานผลการทวนสอบเครื่องมือ ปี 69").
const VERIFY_REF = /^รายงาน(ผลการ)?ทวนสอบเครื่องมือ/;
export function verifyRefOf(rep) {
  const y = String(rep.year || beYear(rep.reportDate) || "");
  return `รายงานผลการทวนสอบเครื่องมือ ปี ${y.slice(-2)}`;
}
export function referencesOf(rep) {
  const own = mpirCodes(rep.references || "").split(/\n/).map(s => s.trim()).filter(s => s && !VERIFY_REF.test(s));
  return [...own, verifyRefOf(rep)];
}
const longDate = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }); };

export function lf069Html(rep, certificates, equipment) {
  const R = calcReport(rep, certificates, equipment);
  const b = R.brix, p = R.pol, fb = R.fiber;
  const year = rep.year || beYear(rep.reportDate);
  const TOT = 6;
  const page = (n, body) => `<section class="pg"><div class="hd"><img src="${LOGO_DATA_URI}" alt="MITR PHOL"><span class="code">${LF069_DOC.code} Rev.${LF069_DOC.rev} Page <b>${n}</b> of ${TOT}</span><div class="ttl">รายงานผลการประเมินความไม่แน่นอนของการวัด</div></div><div class="box">${body}</div></section>`;
  const refs = referencesOf(rep);
  const xbar = (r) => fmt(r.A.mean, r.dec);
  const nLbl = (r) => r.A.m === r.A.n ? "n" : "m";
  const readRows = (cols, short) => {
    const n = Math.max(...cols.map(c => c.A.n), 0);
    return Array.from({ length: n }, (_, i) => `<tr><td>${i + 1}</td>${cols.map(c => `<td>${esc(c.A.x[i] ?? "")}</td>`).join("")}</tr>`).join("")
      + `<tr><td class="l">Average</td>${cols.map(c => `<td>${xbar(c)}</td>`).join("")}</tr>`
      + `<tr><td class="l">SD</td>${cols.map(c => `<td>${f4(c.A.sd)}</td>`).join("")}</tr>`
      + `<tr><td class="l">${short ? "RSD" : "RSD (SD/Ave)"}</td>${cols.map(c => `<td>${f5(c.A.rsd)}</td>`).join("")}</tr>`
      + `<tr><td class="l">${short ? "UA(x)" : `UA (x) = (RSD/√${nLbl(cols[0])})`}</td>${cols.map(c => `<td>${f5(c.A.uArel)}</td>`).join("")}</tr>`;
  };
  // Combined table: certificate U → relative (U/Ave) → ÷ k. Pol U is in °Z,
  // converted to %Pol with 26/(100ρ) first.
  const calUconv = (r) => (r.B ? r.B.U * (r.T.key === "pol" ? r.c : 1) : null);
  const calU = (r) => !r.B ? "–" : r.T.key === "pol" ? `${esc(r.B.U)} °Z = ${f4(calUconv(r))}` : esc(r.B.U);
  const calRsd = (r) => (r.B && r.A.mean ? calUconv(r) / Math.abs(r.A.mean) : null);
  const kLbl = b.B && p.B && b.B.k === p.B.k ? ` (k = ${esc(b.B.k)})` : "";
  const ex = rep.example || {};
  const exVal = (v, r, unit) => `${num(v) != null ? esc(v) : "........"}${unit} ± ${fmt(r.Ur, r.dec)}${unit} ที่ระดับความเชื่อมั่น 95%`;

  const p1 = page(1, `<p class="yr">ประจำปี ${esc(year)}</p>
<h3><span>1</span>วัตถุประสงค์</h3><p class="i1">${esc(rep.objective)}</p>
<h3><span>2</span>ผู้ดำเนินการ:</h3>
<p class="i1 blt">▪&nbsp;&nbsp;ทดสอบซ้ำ ตามวิธีวัดค่าองศาบริกซ์ (Brix) และโพลาไรเซชัน (Pol) ในตัวอย่างน้ำอ้อย และการวิเคราะห์ค่าเส้นใยไฟเบอร์ (Fibre) ในตัวอย่างชานอ้อยย่อย โดย เจ้าหน้าที่วิเคราะห์<br>ชื่อ ${esc(rep.testers || "..............................")}</p>
<p class="i1 blt">▪&nbsp;&nbsp;ดูแลการทดสอบ และประเมินความไม่แน่นอนของการวัด โดย ${esc(rep.supervisorRole ?? "ผู้จัดการด้านวิชาการ")}<br>ชื่อ ${esc(rep.supervisor || "..............................")}</p>
<h3><span>3</span>เอกสารอ้างอิง</h3>${refs.map(r => `<p class="i1">-&nbsp;&nbsp;${esc(r)}</p>`).join("")}
<h3><span>4</span>ผลการประเมินความไม่แน่นอนของการวัด</h3>
<h4>4.1 ความไม่แน่นอนของวิธีวัดค่าองศาบริกซ์ (Brix) และโพลาไรเซชัน (Pol) ในตัวอย่างน้ำอ้อย</h4>
<h5>4.1.1&nbsp;&nbsp;สมการ และแผนภูมิก้างปลา แสดงแหล่งที่มาของความไม่แน่นอนของการวัดค่าบริกซ์</h5>
<div class="eqbox">บริกซ์ (Brix)&nbsp;&nbsp;&nbsp;&nbsp;= ค่า Brix ที่วัดได้จากเครื่อง Refractometer</div>
${fishbone(FISHBONES.brix)}`);

  const p2 = page(2, `<h5>4.1.2&nbsp;&nbsp;สมการ และแผนภูมิก้างปลา แสดงแหล่งที่มาของความไม่แน่นอนของการวัดค่าโพล</h5>
<table class="eq"><tr><td>โพล (%)</td><td>= ได้จากการเปิดตาราง Schmitz'Table using the °Brix and Pol Reading<br>หรือได้จากการคำนวน โดยที่</td></tr>
<tr><td>โพล (%)</td><td>= Pol Reading (°Z) / Pol Factor</td></tr>
<tr><td>Pol Factor</td><td>= <span class="frac"><span>100 * Appearance Density at 20°C of Sucrose per 100 g. of Sugar Solution</span><span>26.000</span></span></td></tr></table>
${fishbone(FISHBONES.pol)}
<h5>4.1.3&nbsp;&nbsp;แหล่งของ Uncertainty และสรุปการคำนวณค่า Uncertainty ของค่าบริกซ์ และ โพล (%)</h5>
<table class="t"><tr><th style="width:42%">หัวข้อ</th><th>Brix</th><th>Pol (%)</th><th style="width:30%">หมายเหตุ</th></tr>
<tr><td class="l">1 Standard Uncertainty of Component</td><td></td><td></td><td></td></tr>
<tr><td class="l i">1.1 Calibration</td><td>${f5(b.rCal)}</td><td>${f5(p.rCal)}</td><td class="l">Brix = Calibration of Refractometer<br>Pol = Calibration of Polarimeter</td></tr>
<tr><td class="l i">1.2 Repeatability</td><td>${f5(b.A.uArel)}</td><td>${f5(p.A.uArel)}</td><td class="l">${b.A.n} ซ้ำ</td></tr>
<tr><td class="l">2. Combined Uncertainty</td><td>${f5(b.uc)}</td><td>${f5(p.uc)}</td><td></td></tr>
<tr><td class="l">3. Expanded Uncertainty</td><td>${f5(b.U)}</td><td>${f5(p.U)}</td><td class="l">ที่ระดับความเชื่อมั่น 95%</td></tr></table>
<h5>4.1.4&nbsp;&nbsp;รายละเอียดการคำนวณ Uncertainty</h5>
<p class="i2">4.1.4.1</p>
<table class="t w"><tr><th>Uncertainty Component</th><th>Source of Uncertainty</th></tr>
<tr><td class="l">ค่าความไม่แน่นอนของวัสดุอ้างอิงหรือมาตรฐานอ้างอิง และค่าความไม่แน่นอนจากเครื่องมือ สภาวะแวดล้อม</td><td class="l">Uncertainty จากการสอบเทียบ Refractometer และ Polarimeter</td></tr>
<tr><td class="l">การชักตัวอย่าง วิธีวิเคราะห์และผู้วิเคราะห์</td><td class="l">Uncertainty ของการวิเคราะห์ซ้ำ</td></tr></table>
<p class="i2">4.1.4.2&nbsp;&nbsp;&nbsp;Standard Uncertainty ของแต่ละ Component</p>
<p class="i3">- Uncertainty จากการสอบเทียบ Refractometer = ± ${b.B ? esc(b.B.U) : "–"}</p>
<p class="i3">- Uncertainty จากการสอบเทียบ Polarimeter = ± ${p.B ? esc(p.B.U) : "–"}</p>
<p class="i3">- UA(x) = Standard Deviation of Mean ของการวัดบริกซ์และโพล<br>&nbsp;&nbsp;&nbsp;ของตัวอย่างเดียวกันที่เป็นตัวแทน ${b.A.n} ซ้ำ</p>`);

  const p3 = page(3, `<table class="t rd"><tr><th>ตัวอย่างซ้ำที่</th><th>Brix (บริกซ์)</th><th>% Pol (โพล)</th></tr>${readRows([b, p])}</table>
<p class="i2">4.1.4.3&nbsp;&nbsp;&nbsp;Combined Uncertainty</p>
<table class="t cm"><tr><th>Uncertainty Component</th><th>บริกซ์</th><th>โพล</th></tr>
<tr><td class="l">Calibration (U ใบรับรอง)</td><td>${calU(b)}</td><td>${calU(p)}</td></tr>
<tr><td class="l">RSD (U/Ave)</td><td>${f5(calRsd(b))}</td><td>${f5(calRsd(p))}</td></tr>
<tr><td class="l">U/k${kLbl}</td><td>${f5(b.rCal)}</td><td>${f5(p.rCal)}</td></tr>
<tr><td class="l">UA(x)</td><td>${f5(b.A.uArel)}</td><td>${f5(p.A.uArel)}</td></tr></table>
<table class="eq f"><tr><td>Uc [Brix]</td><td>= √[(${f5(b.rCal)})² + (${f5(b.A.uArel)})²] × ${xbar(b)}</td></tr><tr><td></td><td>= ${f5(b.ucRel)} × ${xbar(b)} = ${f5(b.uc)}</td></tr>
<tr><td>Uc [Pol]</td><td>= √[(${f5(p.rCal)})² + (${f5(p.A.uArel)})²] × ${xbar(p)}</td></tr><tr><td></td><td>= ${f5(p.ucRel)} × ${xbar(p)} = ${f5(p.uc)}</td></tr></table>
<p class="i2">4.1.4.4&nbsp;&nbsp;&nbsp;Calculate Expanded Uncertainty โดยคูณค่า Combined Uncertainty ด้วย Coverage Factor<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(k)=2&nbsp;&nbsp;ที่ระดับความเชื่อมั่น 95%</p>
<table class="eq f"><tr><td>Uc [Brix]</td><td>= ${f5(b.uc)} x 2 = ${f5(b.U)}</td></tr><tr><td>Uc [Pol]</td><td>= ${f5(p.uc)} x 2 = ${f5(p.U)}</td></tr></table>
<h5>4.1.5&nbsp;&nbsp;การรายงานผล พร้อมค่า Uncertainty</h5>
<table class="eq f"><tr><td>Brix ในน้ำอ้อย</td><td>= ค่าที่ได้จากการตรวจทดสอบ ± ${fmt(b.Ur, b.dec)}</td></tr><tr><td>%Pol ในน้ำอ้อย</td><td>= ค่าที่ได้จากการตรวจทดสอบ (%) ± ${fmt(p.Ur, p.dec)} (%)</td></tr></table>`);

  const p4 = page(4, `<h4>4.2&nbsp;&nbsp;&nbsp;การหาค่าความไม่แน่นอนของการวัดไฟเบอร์ในชานอ้อยย่อย</h4>
<h5>4.2.1&nbsp;&nbsp;สมการ</h5>
<table class="eq"><tr><td>%ไฟเบอร์</td><td>= 100 * <span class="frac"><span>M2 - M0</span><span>M1</span></span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;โดยที่</td></tr></table>
<p class="i3" style="margin-top:6pt">M0 = น้ำหนักภาชนะเปล่า</p>
<p class="i3">M1 = น้ำหนักชานอ้อยย่อยก่อนอบ</p>
<p class="i3">M2 = น้ำหนักชานอ้อยย่อยรวมกับน้ำหนักภาชนะเปล่า หลังอบ</p>
<h5>4.2.2&nbsp;&nbsp;แผนภูมิก้างปลา แสดงแหล่งที่มาของความไม่แน่นอนของการวัด</h5>
${fishbone(FISHBONES.fiber)}
<h5>4.2.3&nbsp;&nbsp;แหล่งของ Uncertainty และสรุปการคำนวณค่า Uncertainty</h5>
<table class="t w"><tr><th style="width:48%">หัวข้อ</th><th></th><th>หมายเหตุ</th></tr>
<tr><td class="l">1 Standard Uncertainty of Component</td><td></td><td></td></tr>
<tr><td class="l i">1.1 การชั่งน้ำหนัก</td><td>${f5(fb.rCal)}</td><td></td></tr>
<tr><td class="l i">1.2 Repeatability</td><td>${f5(fb.A.uArel)}</td><td></td></tr>
<tr><td class="l">2. Combined Uncertainty</td><td>${f5(fb.uc)}</td><td></td></tr>
<tr><td class="l">3. Expanded Uncertainty</td><td>${f5(fb.U)}</td><td class="l">ที่ระดับความเชื่อมั่น 95%</td></tr></table>
<h5>4.2.4&nbsp;&nbsp;รายละเอียดการคำนวณ Uncertainty</h5>
<p class="i2">4.2.4.1&nbsp;&nbsp;แหล่งของ Uncertainty</p>
<table class="t w"><tr><th>Uncertainty Component</th><th>Source of Uncertainty</th></tr>
<tr><td class="l">ค่าความไม่แน่นอนของวัสดุอ้างอิงหรือมาตรฐานอ้างอิง และค่าความไม่แน่นอนจากเครื่องมือ สภาวะแวดล้อม</td><td class="l">น้ำหนักไฟเบอร์ เกิดจากการชั่งถุงไฟเบอร์ และการชั่งน้ำหนักตัวอย่าง โดย Uncertainty ของเครื่องชั่ง = ${fb.B ? esc(fb.B.U) : "–"}</td></tr>
<tr><td class="l">การชักตัวอย่าง วิธีวิเคราะห์และผู้วิเคราะห์</td><td class="l">Uncertainty ของการวิเคราะห์ซ้ำ</td></tr></table>`);

  const p5 = page(5, `<p class="i2">4.2.4.2&nbsp;&nbsp;&nbsp;Standard Uncertainty ของแต่ละ Component</p>
<p class="i3">1)&nbsp;&nbsp;การชั่งน้ำหนักไฟเบอร์ โดยการชั่งถุงไฟเบอร์ และการชั่งน้ำหนักตัวอย่าง<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;โดยเครื่องชั่งมีค่า Uncertainty ${fb.B ? esc(fb.B.U) : "–"}</p>
<p class="i3">2)&nbsp;&nbsp;Standard Deviation of Mean: UA(x)<br>&nbsp;&nbsp;&nbsp;&nbsp;ของการวัดไฟเบอร์ตัวอย่างเดียวกันที่เป็นตัวแทน ${fb.A.n} ซ้ำ</p>
<table class="t rd fb"><tr><th>ตัวอย่างซ้ำที่</th><th>%ไฟเบอร์ในชานอ้อยย่อย</th></tr>${readRows([fb], true)}</table>
<p class="i2">4.2.4.3&nbsp;&nbsp;&nbsp;Combined Uncertainty</p>
<table class="t cm"><tr><th>Uncertainty Component</th><th>%ไฟเบอร์ในชานอ้อยย่อย</th></tr>
<tr><td class="l">การชั่งน้ำหนักไฟเบอร์</td><td>${f5(fb.rCal)}</td></tr><tr><td class="l">UA(x)</td><td>${f5(fb.A.uArel)}</td></tr></table>
<table class="eq f"><tr><td>Uc [Fiber]</td><td>= √[(${f5(fb.rCal)})² + (${f5(fb.A.uArel)})²] × ${xbar(fb)}</td></tr><tr><td></td><td>= ${f5(fb.ucRel)} × ${xbar(fb)} = ${f5(fb.uc)}</td></tr></table>
<p class="i2">4.2.4.4 Expanded Uncertainty โดยคูณค่า Combined Uncertainty ด้วย Coverage Factor (k)=2 ที่ระดับความเชื่อมั่น 95%</p>
<table class="eq f"><tr><td>U<sub>E</sub> [Fiber]</td><td>= ${f5(fb.uc)} x 2 = ${f5(fb.U)}</td></tr></table>
<h5>4.2.5&nbsp;&nbsp;การรายงานผล พร้อมค่า Uncertainty</h5>
<table class="eq f"><tr><td>%ไฟเบอร์ในชานอ้อยย่อย</td><td>= ค่าที่ได้จากการตรวจทดสอบ (%) ± ${fmt(fb.Ur, fb.dec)} (%)</td></tr></table>`);

  const sig = (title) => `<td><u>${title}</u><div class="sg"></div><div class="nm">(${"&nbsp;".repeat(60)})</div></td>`;
  const p6 = page(6, `<h3><span>5</span>สรุปผล</h3>
<p class="i2">-&nbsp;&nbsp;Uncertainty ของการวิเคราะห์ค่าองศาบริกซ์ (Brix) ในตัวอย่างน้ำอ้อย คือ ± ${fmt(b.Ur, b.dec)}</p>
<p class="i2">-&nbsp;&nbsp;Uncertainty ของการวิเคราะห์ค่า%โพลาไรเซชัน (Pol) ในตัวอย่างน้ำอ้อย คือ ± ${fmt(p.Ur, p.dec)}%</p>
<p class="i2">-&nbsp;&nbsp;Uncertainty ของการวิเคราะห์ค่า%เส้นใยไฟเบอร์ (Fibre) ในตัวอย่างชานอ้อยย่อย คือ ± ${fmt(fb.Ur, fb.dec)}%</p>
<h3 style="margin-top:22pt"><span>6</span>ตัวอย่างการรายงานผล</h3>
<p class="i2">ผลวิเคราะห์ตัวอย่าง หมายเลข ${esc(ex.sampleNo || "........")} รายงานดังนี้</p>
<p class="i2">-&nbsp;&nbsp;ค่าบริกซ์ ${exVal(ex.brix, b, "")}</p>
<p class="i2">-&nbsp;&nbsp;ค่าโพล ${exVal(ex.pol, p, "%")}</p>
<p class="i2">-&nbsp;&nbsp;ค่าไฟเบอร์ ${exVal(ex.fiber, fb, "%")}</p>
<table class="sig"><tr>${sig("จัดทำโดย")}${sig("อนุมัติโดย")}</tr>
<tr><td><u>วันที่</u></td><td><u>วันที่</u></td></tr></table>`);

  return `<!doctype html><html><head><meta charset="utf-8"><title>LF-069 ประจำปี ${esc(year)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:Sarabun,sans-serif;font-size:9.3pt;color:#000;margin:0;line-height:1.45}
.pg{width:210mm;height:297mm;padding:9mm 12mm 10mm 13mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}.pg:last-child{page-break-after:auto}
.hd{position:relative;height:17mm;flex:none}.hd img{position:absolute;left:0;top:0;height:8mm}.hd .code{position:absolute;right:0;top:1mm;font-size:8.4pt}.hd .ttl{position:absolute;left:0;right:0;top:7.5mm;text-align:center;font-size:10.4pt;font-weight:700}
.box{flex:1;border:.8pt solid #000;padding:5mm 7mm}
p{margin:0 0 2pt}.yr{margin-bottom:8pt}h3{font-size:9.3pt;font-weight:400;margin:9pt 0 3pt}h3 span{display:inline-block;width:8mm}
h4{font-size:9.3pt;font-weight:400;margin:6pt 0 2pt 3mm}h5{font-size:9.3pt;font-weight:400;margin:6pt 0 3pt 6mm}
.i1{margin-left:8mm}.i2{margin-left:10mm;margin-top:3pt}.i3{margin-left:16mm}.blt{padding-left:5mm;text-indent:-5mm}
table{border-collapse:collapse}.t{margin:3pt 0 5pt 6mm;width:calc(100% - 6mm)}.t.w{margin-left:10mm;width:calc(100% - 10mm)}
.t td,.t th{border:.6pt solid #000;padding:1.5pt 5pt;text-align:center;font-weight:400;vertical-align:top}.t .l{text-align:left}.t .i{padding-left:16pt}
.rd{width:62%!important;margin-left:16mm!important}.rd td:first-child{text-align:center}.rd .l{text-align:left!important}.fb{width:45%!important;margin-left:30mm!important}.fb th{background:#FFF2CC}
.cm{width:62%!important;margin-left:16mm!important}
.eqbox{border:.8pt solid #000;display:inline-block;padding:7pt 12pt;margin:4pt 0 4pt 12mm;min-width:95mm}
.eq{margin:3pt 0 3pt 16mm}.eq td{padding:1pt 6pt 1pt 0;vertical-align:middle}.eq td:first-child{white-space:nowrap;min-width:22mm}.eq.f{margin-left:18mm}
.frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle}.frac span:first-child{border-bottom:.6pt solid #000;padding:0 3pt}
.sig{width:84%;margin:26pt 0 0 6mm}.sig td{border:.6pt solid #000;width:50%;padding:3pt 6pt;vertical-align:top}.sig .sg{height:26pt}.sig tr:last-child td{height:30pt}.sig .nm{text-align:center}
.nt{margin-top:16pt;font-size:7.6pt;color:#333}</style></head><body>
${p1}${p2}${p3}${p4}${p5}${p6}
<script>document.fonts.ready.then(function(){setTimeout(function(){window.print()},300)});</script></body></html>`;
}

export function printLf069(rep, certificates, equipment) {
  const w = window.open("", "_blank");
  if (!w) { alert("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up แล้วลองอีกครั้ง"); return false; }
  w.document.open(); w.document.write(lf069Html(rep, certificates, equipment)); w.document.close();
  return true;
}
