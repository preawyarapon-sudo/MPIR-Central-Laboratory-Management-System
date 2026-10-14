// Calculations for the calibration app. Pure functions only — no React, no
// storage — so every number on screen and in the printed LF-068 / LF-069 comes
// from one place.
//
// Acceptance rule (lab decision): TER — |Error| + U ≤ Tolerance (Conservative).
// Users type only what is read from the certificate / the instrument; Error,
// SD, u, U and the verdicts are always calculated here.

export const VERIFY_MAX_READS = 10;
export const VERIFY_MIN_READS = 5;
// Rounds calibrated on/after this date need a verification (LF-068 section 4).
export const VERIFICATION_REQUIRED_FROM = "2026-10-09";

export function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}
const EPS = (tol) => 1e-9 * Math.max(1, Math.abs(tol || 0));

export function fmt(x, d = 4) {
  if (x == null || isNaN(x)) return "–";
  if (Math.abs(x) < 1e-12) x = 0; // floating-point noise (10.00 − 10.000000)
  if (x !== 0 && Math.abs(x) < 0.5 * 10 ** -d) return Number(x).toPrecision(2);
  return Number(x).toFixed(d);
}
export function fmtSigned(x, d = 4) {
  if (x == null || isNaN(x)) return "–";
  if (Math.abs(x) < 1e-12) x = 0;
  return (x >= 0 ? "+" : "") + fmt(x, d);
}
// Decimals to show for results: a little finer than the instrument's resolution.
export function digitsFor(resolution, min = 4) {
  const dec = (String(resolution ?? "").split(".")[1] || "").replace(/\D.*$/, "").length;
  return Math.max(min, dec + 2);
}

/* ---------- dates ---------- */
export const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function addMonthsISO(iso, months) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + Number(months || 0));
  if (d.getDate() < day) d.setDate(0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function daysUntil(iso, today = todayISO()) {
  if (!iso) return null;
  return Math.round((new Date(iso + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
}
export function fmtDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
export const beYear = (iso) => (iso ? Number(iso.slice(0, 4)) + 543 : "");

/* ---------- certificate points (stored as one row per point) ---------- */
export const isBefore = (c) => /before adjustment|ก่อนปรับ/i.test(c?.adjustmentStatus || "");
export const isAfter = (c) => /after adjustment|หลังปรับ/i.test(c?.adjustmentStatus || "");
export const refOf = (c) => num(c.referenceValue) ?? num(c.calibrationPoint);
// Error = reading − reference; older rows may carry the certificate's own
// Error or Correction instead of a reading.
export function errorOf(c) {
  const ref = num(c.referenceValue) ?? num(c.calibrationPoint), ind = num(c.indication);
  if (ref != null && ind != null) return ind - ref;
  const rep = num(c.reportedError);
  if (rep != null) return rep;
  const corr = num(c.reportedCorrection);
  return corr != null ? -corr : null;
}
export function uOf(c) {
  const u = num(c.reportedU);
  if (u == null) return null;
  if (c.uReportedAs === "Relative (%)") {
    const basis = num(c.indication) ?? refOf(c);
    return basis == null ? null : Math.abs(basis) * (u / 100);
  }
  return u;
}

/* ---------- criteria ---------- */
// The certificate's own criteria win; otherwise the instrument's.
export function criteriaOf(instrument, point) {
  const t = num(point?.pointTolerance) ?? num(point?.certTolerance);
  if (t != null) {
    return { tolerance: t, type: point.pointToleranceType || point.certToleranceType || "absolute",
      basis: point.certCriteriaBasis || "", source: "certificate" };
  }
  const it = num(instrument?.tolerance);
  return it == null ? null : { tolerance: it, type: instrument.toleranceType || "absolute", basis: instrument.basisOfCriteria || "", source: "instrument" };
}
export function toleranceAt(crit, instrument, reading) {
  if (!crit) return null;
  if (crit.type === "% of reading") return reading == null ? null : Math.abs(reading) * crit.tolerance / 100;
  if (crit.type === "% of full scale") { const fs = num(instrument?.workingRangeMax); return fs == null ? null : Math.abs(fs) * crit.tolerance / 100; }
  return crit.tolerance;
}
// TER verdict for one certificate point.
export function evalPoint(c, instrument) {
  const err = errorOf(c), U = uOf(c);
  const crit = criteriaOf(instrument, c);
  const tol = toleranceAt(crit, instrument, num(c.indication) ?? refOf(c));
  const tot = err != null && U != null ? Math.abs(err) + U : null;
  const ok = tot == null || tol == null ? null : tot <= tol + EPS(tol);
  return { err, U, tot, tol, ok };
}

/* ---------- rounds ---------- */
export const roundKey = (certNo, date) => `${certNo || ""}|||${date || ""}`;
export function roundsOf(certificates, instrumentId, verifications = []) {
  const map = new Map();
  certificates.filter(c => c.instrumentId === instrumentId).forEach(c => {
    const k = roundKey(c.certificateNo, c.calibrationDate);
    if (!map.has(k)) map.set(k, { key: k, certificateNo: c.certificateNo || "", calibrationDate: c.calibrationDate || "", points: [] });
    map.get(k).points.push(c);
  });
  const rounds = [...map.values()].sort((a, b) => (b.calibrationDate || "").localeCompare(a.calibrationDate || ""));
  rounds.forEach(r => {
    r.points.sort((a, b) => String(a.rangeId || "").localeCompare(String(b.rangeId || "")) || (refOf(a) ?? 0) - (refOf(b) ?? 0) || (isBefore(a) ? -1 : 1));
    r.verification = verifications.find(v => v.instrumentId === instrumentId && (v.certificateNo || "") === r.certificateNo && (v.calibrationDate || "") === r.calibrationDate) || null;
  });
  return rounds;
}
// Verdict of a whole certificate: current (as-left) points; as-found kept apart.
export function certSummary(points, instrument) {
  const current = points.filter(c => !isBefore(c)).map(c => ({ c, ...evalPoint(c, instrument) }));
  const found = points.filter(isBefore).map(c => ({ c, ...evalPoint(c, instrument) }));
  const judged = current.filter(x => x.ok != null);
  return {
    current, found,
    pass: judged.length > 0 && judged.every(x => x.ok) && judged.length === current.length,
    failCount: current.filter(x => x.ok === false).length,
    incomplete: current.some(x => x.ok == null),
    foundFail: found.some(x => x.ok === false),
    maxTot: current.reduce((m, x) => (x.tot != null && x.tot > m ? x.tot : m), 0),
    tol: current.find(x => x.tol != null)?.tol ?? null,
  };
}

/* ---------- verification (LF-068 section 4) ---------- */
// u_rep = SD/√n, u_std = U_std/2, u_res = d/(2√3), U = 2·√(Σu²); pass when |Error| + U ≤ Tolerance.
// readingCorrection: the standard's own correction, added when the readings
// are taken on the standard itself (a thermometer in a bath).
export function verifyPoint(p, v, tol) {
  const reads = (p.readings || []).map(num).filter(x => x != null);
  const ref = num(p.reference), n = reads.length;
  if (ref == null || n < 2) return { n, ok: null, tol };
  const raw = reads.reduce((a, b) => a + b, 0) / n;
  const mean = raw + (num(v.readingCorrection) || 0);
  const sd = Math.sqrt(reads.reduce((a, b) => a + (b - raw) ** 2, 0) / (n - 1));
  const uStdK2 = num(p.stdU) ?? num(v.stdU) ?? 0;
  const uRep = sd / Math.sqrt(n), uStd = uStdK2 / 2, uRes = (num(v.resolution) || 0) / (2 * Math.sqrt(3));
  const uc = Math.sqrt(uRep ** 2 + uStd ** 2 + uRes ** 2), U = 2 * uc, err = mean - ref, tot = Math.abs(err) + U;
  return { n, mean, sd, uRep, uStd, uRes, uc, U, err, tot, tol, ok: tol == null ? null : tot <= tol + EPS(tol) };
}
export function verifySummary(v, instrument, certPoints) {
  if (!v) return null;
  const crit = criteriaOf(instrument, certPoints[0] || {});
  const pts = (v.points || []).filter(p => num(p.reference) != null)
    .map(p => ({ p, r: verifyPoint(p, v, toleranceAt(crit, instrument, num(p.reference))) }));
  const fewReads = pts.some(x => x.r.n < VERIFY_MAX_READS);
  const tooFew = pts.some(x => x.r.n < VERIFY_MIN_READS);
  const reasonOk = !fewReads || !!String(v.fewReason || "").trim();
  const measOk = pts.length > 0 && pts.every(x => x.r.ok === true);
  return { pts, crit, fewReads, tooFew, reasonOk, measOk,
    noStdU: num(v.stdU) == null && !(v.points || []).some(p => num(p.stdU) != null),
    maxTot: pts.reduce((m, x) => (x.r.tot != null && x.r.tot > m ? x.r.tot : m), 0) };
}

/* ---------- instrument status ---------- */
export function nextDueOf(e, rounds) {
  if (e.nextDue) return e.nextDue;
  const last = e.lastCalibration || rounds[0]?.calibrationDate;
  return last ? addMonthsISO(last, num(e.intervalMonths) || 12) : "";
}
// One status per instrument for the register: what someone at the bench needs to know.
export function instrumentStatus(e, rounds, today = todayISO()) {
  if (e.status === "maintenance") return { key: "off", label: "งดใช้งาน", tone: "red", sort: 0 };
  const due = nextDueOf(e, rounds), days = daysUntil(due, today);
  const latest = rounds[0];
  if (latest) {
    const cs = certSummary(latest.points, e);
    if (cs.failCount) return { key: "fail", label: "ใบรับรองไม่ผ่าน", tone: "red", sort: 1, due, days };
    if ((latest.calibrationDate || "") >= VERIFICATION_REQUIRED_FROM) {
      if (!latest.verification) return { key: "verify", label: "รอทวนสอบ", tone: "blue", sort: 3, due, days };
      if (!latest.verification.downloadedAt) return { key: "report", label: "รอดาวน์โหลดรายงาน", tone: "blue", sort: 3, due, days };
    }
  }
  if (days == null) return { key: "nodate", label: "ยังไม่มีกำหนด", tone: "grey", sort: 5, due, days };
  if (days < 0) return { key: "overdue", label: `เกินกำหนด ${-days} วัน`, tone: "red", sort: 2, due, days };
  if (days <= 30) return { key: "soon", label: `ครบกำหนดใน ${days} วัน`, tone: "amber", sort: 4, due, days };
  return { key: "ok", label: "พร้อมใช้งาน", tone: "green", sort: 6, due, days };
}

/* ---------- uncertainty (LF-069, per test method) ---------- */
export function typeA(readings) {
  const x = (readings || []).map(num).filter(v => v != null), n = x.length;
  if (n < 2) return { n, mean: n ? x[0] : null, sd: null, u: null };
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return { n, mean, sd, u: sd / Math.sqrt(n) };
}
