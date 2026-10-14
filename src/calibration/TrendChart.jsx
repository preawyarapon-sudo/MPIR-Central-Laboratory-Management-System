// Calibration trend (drift) chart for one instrument: how the error at each
// calibration point, or the worst |Error| + U, moves from certificate to
// certificate against the acceptance limit. Plain SVG, no chart library.
import { useState, useMemo, useRef, useEffect } from "react";
import { num, fmt, fmtSigned, fmtDate, certSummary, refOf, digitsFor } from "./calc.js";

const C = { line: "#0E6FBA", found: "#0E6FBA", limit: "#B42318", grid: "#E6EEF6", axis: "#4F6E8C", ink: "#0B2A4A", fail: "#B42318" };
const nominal = (c) => num(c.calibrationPoint) ?? refOf(c);

// Certificates of different years list slightly different reference values
// (19.996 / 20.00 %Brix); points within 1 % of each other are the same point.
function groupPoints(rounds) {
  const groups = [];
  const keyOf = (c) => {
    const v = nominal(c), rg = String(c.rangeId || "");
    if (v == null) return null;
    let g = groups.find(x => x.range === rg && (Math.abs(x.v - v) <= Math.max(1e-9, Math.abs(x.v) * 0.01)));
    if (!g) { g = { key: `${rg}|${v}`, range: rg, v }; groups.push(g); }
    return g.key;
  };
  return { groups, keyOf };
}

export default function TrendChart({ rounds, instrument }) {
  const chrono = useMemo(() => [...rounds].sort((a, b) => (a.calibrationDate || "").localeCompare(b.calibrationDate || "")), [rounds]);
  const unit = instrument.calUnit || chrono[0]?.points[0]?.unit || "";
  const dg = Math.min(4, digitsFor(instrument.resolution, 2));

  const { groups, rows } = useMemo(() => {
    const { groups, keyOf } = groupPoints(chrono);
    const rows = chrono.map(r => {
      const cs = certSummary(r.points, instrument);
      const byKey = {};
      cs.current.forEach(x => { const k = keyOf(x.c); if (k) byKey[k] = { ...(byKey[k] || {}), cur: x }; });
      cs.found.forEach(x => { const k = keyOf(x.c); if (k) byKey[k] = { ...(byKey[k] || {}), found: x }; });
      const worst = cs.current.reduce((m, x) => (x.tot != null && (!m || x.tot > m.tot) ? x : m), null);
      return { r, cs, byKey, worst };
    });
    groups.sort((a, b) => a.range.localeCompare(b.range) || a.v - b.v);
    return { groups, rows };
  }, [chrono, instrument]);

  const [mode, setMode] = useState("worst");
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState(null);
  const wrap = useRef(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    if (!wrap.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([en]) => setW(Math.max(300, Math.round(en.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  if (!rows.length) return null;
  const g = groups.find(x => x.key === mode);
  const pts = rows.map((row, i) => {
    if (mode === "worst") {
      const w = row.worst;
      return { i, row, y: w?.tot ?? null, tol: w?.tol ?? row.cs.tol, ok: w?.ok, at: w ? refOf(w.c) : null, err: w?.err, U: w?.U };
    }
    const cur = row.byKey[mode]?.cur, found = row.byKey[mode]?.found;
    return { i, row, y: cur?.err ?? null, U: cur?.U, tol: cur?.tol, ok: cur?.ok, tot: cur?.tot, at: cur ? refOf(cur.c) : null,
      fy: found?.err ?? null, fU: found?.U, fok: found?.ok };
  });
  const has = pts.filter(p => p.y != null);

  // scales
  const H = 260, m = { l: 74, r: 40, t: 18, b: 46 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xs = (i) => m.l + (rows.length === 1 ? iw / 2 : (iw * i) / (rows.length - 1));
  let lo, hi;
  if (mode === "worst") {
    hi = Math.max(...pts.map(p => Math.max(p.y ?? 0, p.tol ?? 0)), 1e-9) * 1.18; lo = 0;
  } else {
    const ext = Math.max(...pts.map(p => Math.max(Math.abs(p.y ?? 0) + (p.U ?? 0), Math.abs(p.fy ?? 0) + (p.fU ?? 0), p.tol ?? 0)), 1e-9) * 1.18;
    hi = ext; lo = -ext;
  }
  const ys = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks = (() => {
    const span = hi - lo, raw = span / 5, p10 = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(k => k * p10).find(s => s >= raw) || raw;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return out;
  })();
  const tickDec = Math.max(0, Math.min(5, -Math.floor(Math.log10((hi - lo) / 5)) + 1));
  const path = (arr, f) => arr.filter(p => f(p) != null).map((p, k) => `${k ? "L" : "M"}${xs(p.i)},${ys(f(p))}`).join("");
  const tolPath = (sign) => path(pts.filter(p => p.tol != null), p => sign * p.tol);
  const maxLabels = Math.max(2, Math.floor(iw / 92));
  const labelEvery = Math.ceil(rows.length / maxLabels);

  // headline
  const last = has[has.length - 1], prev = has[has.length - 2];
  const used = mode === "worst" && last?.tol ? last.y / last.tol : (last?.tol && last.tot != null ? last.tot / last.tol : null);
  const delta = last && prev ? (mode === "worst" ? last.y - prev.y : Math.abs(last.y) - Math.abs(prev.y)) : null;

  const hp = hover != null ? pts[hover] : null;
  return (
    <section className="ca-card ca-stack-sm">
      <div className="ca-sub-head ca-pad0" style={{ marginTop: 0 }}>
        <h2>แนวโน้มผลสอบเทียบ</h2>
        <div className="ca-row ca-wrap">
          <label className="ca-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><span>แสดง</span>
            <select value={mode} onChange={ev => { setMode(ev.target.value); setHover(null); }} aria-label="เลือกจุดสอบเทียบ">
              <option value="worst">|Error| + U สูงสุดของทุกจุด</option>
              {groups.map(x => <option key={x.key} value={x.key}>Error ที่จุด {x.range ? `${x.range} · ` : ""}{Number(x.v.toPrecision(3))} {unit}</option>)}
            </select></label>
          <button className="ca-link" onClick={() => setAsTable(!asTable)}>{asTable ? "ดูเป็นกราฟ" : "ดูเป็นตาราง"}</button>
        </div>
      </div>
      {used != null && (
        <p className="ca-small">
          รอบล่าสุด ({fmtDate(last.row.r.calibrationDate)}) {mode === "worst" ? "|Error| + U" : "|Error| + U ที่จุดนี้"} ใช้ไป <b style={{ color: used > 1 ? C.fail : used > 0.8 ? "#8A5200" : "#187A52" }}>{Math.round(used * 100)}%</b> ของเกณฑ์
          {delta != null && <> · {Math.abs(delta) < 1e-12 ? "เท่ากับรอบก่อน" : `${delta > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${fmt(Math.abs(delta), dg)} ${unit} จากรอบก่อน`}</>}
          {used > 0.8 && used <= 1 && " · ใกล้เกณฑ์ ควรเฝ้าระวัง/พิจารณาลดรอบสอบเทียบ"}
        </p>
      )}
      {asTable ? (
        <div className="ca-scroll">
          <table className="ca-table ca-num">
            <thead><tr><th>วันที่สอบเทียบ</th><th>ใบรับรอง</th><th>จุด</th>{mode === "worst" ? <th>|Error| + U</th> : <><th>Error</th><th>U</th><th>|Error| + U</th><th>ก่อนปรับ (Error)</th></>}<th>เกณฑ์ ±</th><th>ผล</th></tr></thead>
            <tbody>{pts.map(p => (
              <tr key={p.i}><td style={{ fontFamily: "inherit" }}>{fmtDate(p.row.r.calibrationDate)}</td><td>{p.row.r.certificateNo || "–"}</td><td>{p.at ?? "–"}</td>
                {mode === "worst" ? <td>{fmt(p.y, dg)}</td> : <><td>{fmtSigned(p.y, dg)}</td><td>{fmt(p.U, dg)}</td><td>{fmt(p.tot, dg)}</td><td>{p.fy != null ? fmtSigned(p.fy, dg) : "–"}</td></>}
                <td>{fmt(p.tol, dg)}</td><td style={{ fontFamily: "inherit", color: p.ok === false ? C.fail : undefined, fontWeight: 600 }}>{p.ok == null ? "–" : p.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} style={{ position: "relative" }}>
          <svg width={W} height={H} role="img" aria-label={`กราฟแนวโน้ม ${mode === "worst" ? "|Error| + U สูงสุด" : `Error ที่จุด ${g ? Number(g.v.toPrecision(3)) : ""}`} ของ ${instrument.code || instrument.name}`} style={{ display: "block", fontFamily: "inherit" }}>
            {ticks.map(v => (
              <g key={v}><line x1={m.l} x2={W - m.r} y1={ys(v)} y2={ys(v)} stroke={v === 0 && mode !== "worst" ? "#B9D3EA" : C.grid} strokeWidth={1} />
                <text x={m.l - 8} y={ys(v) + 4} textAnchor="end" fontSize="11.5" fill={C.axis}>{v.toFixed(tickDec)}</text></g>
            ))}
            <text x={12} y={m.t + ih / 2} transform={`rotate(-90 12 ${m.t + ih / 2})`} textAnchor="middle" fontSize="11.5" fill={C.axis}>{mode === "worst" ? "|Error| + U" : "Error"} ({unit})</text>
            {rows.map((row, i) => (i % labelEvery === 0 || i === rows.length - 1) && (
              <text key={i} x={xs(i)} y={H - m.b + 18} textAnchor={rows.length > 1 && i === rows.length - 1 && W < 520 ? "end" : "middle"} fontSize="11.5" fill={C.axis}>{fmtDate(row.r.calibrationDate)}</text>
            ))}
            {/* acceptance limit */}
            <path d={tolPath(1)} fill="none" stroke={C.limit} strokeWidth={1.5} strokeDasharray="6 4" />
            {mode !== "worst" && <path d={tolPath(-1)} fill="none" stroke={C.limit} strokeWidth={1.5} strokeDasharray="6 4" />}
            {pts.some(p => p.tol != null) && (() => { const p = [...pts].reverse().find(q => q.tol != null); return (
              <text x={Math.min(xs(p.i) + 6, W - m.r - 4)} y={ys(p.tol) - 6} textAnchor={xs(p.i) + 60 > W - m.r ? "end" : "start"} fontSize="11.5" fill={C.limit}>เกณฑ์ ±{fmt(p.tol, dg)}</text>); })()}
            {/* as-found (before adjustment) */}
            {mode !== "worst" && pts.filter(p => p.fy != null).map(p => (
              <g key={`f${p.i}`} transform={`translate(${-10} 0)`}>
                {p.fU != null && <line x1={xs(p.i)} x2={xs(p.i)} y1={ys(p.fy - p.fU)} y2={ys(p.fy + p.fU)} stroke={C.found} strokeWidth={1.2} strokeDasharray="2 2" />}
                <circle cx={xs(p.i)} cy={ys(p.fy)} r={4.5} fill="#fff" stroke={p.fok === false ? C.fail : C.found} strokeWidth={2} />
              </g>
            ))}
            {/* series */}
            <path d={path(pts, p => p.y)} fill="none" stroke={C.line} strokeWidth={2} />
            {pts.filter(p => p.y != null).map(p => (
              <g key={p.i}>
                {mode !== "worst" && p.U != null && <><line x1={xs(p.i)} x2={xs(p.i)} y1={ys(p.y - p.U)} y2={ys(p.y + p.U)} stroke={C.line} strokeWidth={1.5} />
                  <line x1={xs(p.i) - 5} x2={xs(p.i) + 5} y1={ys(p.y - p.U)} y2={ys(p.y - p.U)} stroke={C.line} strokeWidth={1.5} />
                  <line x1={xs(p.i) - 5} x2={xs(p.i) + 5} y1={ys(p.y + p.U)} y2={ys(p.y + p.U)} stroke={C.line} strokeWidth={1.5} /></>}
                <circle cx={xs(p.i)} cy={ys(p.y)} r={hover === p.i ? 6.5 : 5} fill={p.ok === false ? C.fail : C.line} stroke="#fff" strokeWidth={2} />
                {p.ok === false && <text x={xs(p.i)} y={ys(p.y) - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.fail}>ไม่ผ่าน</text>}
              </g>
            ))}
            {hp && <line x1={xs(hp.i)} x2={xs(hp.i)} y1={m.t} y2={m.t + ih} stroke="#8FB3D6" strokeWidth={1} pointerEvents="none" />}
            {/* hit targets */}
            {rows.map((_, i) => {
              const half = rows.length === 1 ? iw / 2 : iw / (rows.length - 1) / 2;
              return <rect key={i} x={xs(i) - half} y={m.t} width={half * 2} height={ih} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)} />;
            })}
          </svg>
          {hp && (
            <div className="ca-tip" style={{ left: Math.min(Math.max(xs(hp.i) - 110, 4), W - 224), top: 6 }}>
              <div className="ca-strong">{fmtDate(hp.row.r.calibrationDate)} · {hp.row.r.certificateNo || "–"}</div>
              {hp.y == null ? <div>ไม่มีข้อมูลที่จุดนี้</div> : mode === "worst" ? (<>
                <div>จุดที่แย่ที่สุด: {hp.at} {unit}</div>
                <div>Error {fmtSigned(hp.err, dg)} · U {fmt(hp.U, dg)}</div>
                <div>|Error| + U = <b>{fmt(hp.y, dg)}</b> / เกณฑ์ {fmt(hp.tol, dg)}</div>
              </>) : (<>
                <div>Error <b>{fmtSigned(hp.y, dg)}</b> ± U {fmt(hp.U, dg)}</div>
                <div>|Error| + U = {fmt(hp.tot, dg)} / เกณฑ์ {fmt(hp.tol, dg)}</div>
                {hp.fy != null && <div>ก่อนปรับ: Error {fmtSigned(hp.fy, dg)}{hp.fok === false ? " (ไม่ผ่าน)" : ""}</div>}
              </>)}
              {hp.y != null && <div style={{ color: hp.ok === false ? C.fail : "#187A52", fontWeight: 600 }}>{hp.ok == null ? "" : hp.ok ? "ผ่าน" : "ไม่ผ่าน"}</div>}
            </div>
          )}
          <div className="ca-legend">
            <span><i style={{ background: C.line }} />{mode === "worst" ? "|Error| + U สูงสุด (หลังปรับ)" : "Error ± U (หลังปรับ)"}</span>
            {mode !== "worst" && pts.some(p => p.fy != null) && <span><i style={{ background: "#fff", border: `2px solid ${C.found}` }} />ก่อนปรับ</span>}
            <span><i className="dash" style={{ borderColor: C.limit }} />เกณฑ์การยอมรับ</span>
          </div>
        </div>
      )}
      {rows.length < 2 && <p className="ca-small ca-muted">มีใบรับรองรอบเดียว — กราฟจะเห็นแนวโน้มเมื่อมีตั้งแต่ 2 รอบขึ้นไป</p>}
    </section>
  );
}
