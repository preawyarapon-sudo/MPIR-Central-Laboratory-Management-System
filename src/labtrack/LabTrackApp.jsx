import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Wrench, FlaskConical, Package, FileDown,
  Search, Plus, X, Trash2, Pencil, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, ChevronLeft, MapPin, CalendarClock, ClipboardList,
  CalendarCheck, XCircle, Undo2, Box, ExternalLink, ImageOff, User,
  LayoutGrid, ZoomIn
} from "lucide-react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";

/* ---------- Lab Analysis Tracker (separate Firebase project) ----------
   Read-only connection into the analysis-job database so the dashboard can
   show live "ล่าช้า / ใกล้ครบกำหนด / งานที่ต้องทำ" counts. This app and the
   analysis tracker keep separate databases by design (see labtrack notes) —
   this is a second, independently-initialized Firebase app instance, not a
   merge of the data itself. */
const ANALYSIS_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCWgyRZEXzJXkftXpJSvHTOCPWWnDsE33U",
  authDomain: "planning-with-ai-a162c.firebaseapp.com",
  databaseURL: "https://planning-with-ai-a162c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "planning-with-ai-a162c",
  storageBucket: "planning-with-ai-a162c.firebasestorage.app",
  messagingSenderId: "137382280837",
  appId: "1:137382280837:web:01d67c8821bc736983b3ec",
};
function getAnalysisDb() {
  const existing = getApps().find(a => a.name === "analysis");
  const app = existing || initializeApp(ANALYSIS_FIREBASE_CONFIG, "analysis");
  return getDatabase(app);
}
// Subscribes to every job in the analysis tracker's "jobs" node. Returns an
// unsubscribe function (mirrors the analysis app's own subscribeJobs).
function subscribeAnalysisJobs(callback) {
  try {
    const jobsRef = ref(getAnalysisDb(), "jobs");
    return onValue(
      jobsRef,
      (snap) => {
        const val = snap.val() || {};
        callback(Object.values(val));
      },
      () => callback([])
    );
  } catch (e) {
    console.error("analysis jobs subscribe failed", e);
    callback([]);
    return () => {};
  }
}
// Mirrors the analysis app's own STATUS / deadline thresholds so the counts
// shown here agree with what that app itself calls "late" / "warn".
const ANALYSIS_STATUS = { WAIT: "Waiting", RUN: "Running", DONE: "Complete" };
const ANALYSIS_WARN_DAYS = 10;
const ANALYSIS_LATE_DAYS = 15;
function analysisJobOverallStatus(job) {
  const params = job.parameters || [];
  const total = params.length;
  const complete = params.filter(p => p.status === ANALYSIS_STATUS.DONE).length;
  const running = params.filter(p => p.status === ANALYSIS_STATUS.RUN).length;
  return total > 0 && complete === total ? ANALYSIS_STATUS.DONE : running > 0 ? ANALYSIS_STATUS.RUN : ANALYSIS_STATUS.WAIT;
}
// Buckets every not-yet-complete job into late / warn / ok (still "to do"),
// using the same day thresholds as the analysis tracker itself.
function analysisJobBuckets(jobs) {
  let late = 0, warn = 0, todo = 0;
  const now = Date.now();
  for (const job of jobs) {
    if (analysisJobOverallStatus(job) === ANALYSIS_STATUS.DONE) continue;
    const days = job.createdAt ? Math.floor((now - job.createdAt) / 86400000) : 0;
    if (days >= ANALYSIS_LATE_DAYS) late++;
    else if (days >= ANALYSIS_WARN_DAYS) warn++;
    else todo++;
  }
  return { late, warn, todo };
}
// Per-job deadline status — mirrors the analysis tracker's own deadlineInfo,
// used to show a single job's own "ปกติ / ใกล้ครบกำหนด / ล่าช้า" state (and
// how many days it's been since it was received) on the tracking page.
function analysisJobDeadlineInfo(job) {
  const days = job.createdAt ? Math.floor((Date.now() - job.createdAt) / 86400000) : 0;
  if (analysisJobOverallStatus(job) === ANALYSIS_STATUS.DONE) return { level: "done", days };
  if (days >= ANALYSIS_LATE_DAYS) return { level: "late", days };
  if (days >= ANALYSIS_WARN_DAYS) return { level: "warn", days };
  return { level: "ok", days };
}
// Per-job progress — mirrors the analysis tracker's own computeJobStats, so
// the % shown here always agrees with what that app itself would show.
function computeAnalysisJobStats(job) {
  const params = job.parameters || [];
  const total = params.length;
  const complete = params.filter(p => p.status === ANALYSIS_STATUS.DONE).length;
  const running = params.filter(p => p.status === ANALYSIS_STATUS.RUN).length;
  const progress = total === 0 ? 0 : Math.round((complete / total) * 100);
  const status = total > 0 && complete === total ? ANALYSIS_STATUS.DONE : running > 0 ? ANALYSIS_STATUS.RUN : ANALYSIS_STATUS.WAIT;
  return { total, complete, running, progress, status };
}
// Where a specific job's still-waiting parameter sits in that parameter's
// FIFO queue across the whole lab (oldest job first — same assumption the
// analysts work under). A count only — never exposes another job's number.
function analysisParamQueuePosition(jobs, paramName, targetJobNo) {
  const waiting = [];
  for (const job of jobs) {
    for (const p of job.parameters || []) {
      if (p.name === paramName && p.status === ANALYSIS_STATUS.WAIT) {
        waiting.push({ jobNo: job.jobNo, ts: job.createdAt || 0 });
      }
    }
  }
  waiting.sort((a, b) => a.ts - b.ts);
  const idx = waiting.findIndex(w => w.jobNo === targetJobNo);
  return { position: idx === -1 ? null : idx + 1, total: waiting.length };
}
const ANALYSIS_STATUS_LABEL = { Waiting: "รอดำเนินการ", Running: "กำลังวิเคราะห์", Complete: "เสร็จสิ้น" };
// Prefix pre-filled into the job-tracking search box so people only need to
// type the digits after it — kept in sync with the same constant in
// AnalysisApp.jsx. Update this once a year when the numbering rolls over
// (e.g. "RD26-" -> "RD27-"); it's still a normal, fully-editable text
// input, so it can be cleared/changed if a job number uses a different
// prefix.
const DEFAULT_JOB_PREFIX = "RD26-";
const ANALYSIS_STATUS_TAG_COLOR = { Waiting: "var(--muted)", Running: "var(--amber)", Complete: "var(--green)" };
const ANALYSIS_DEADLINE_LABEL = { done: "เสร็จสิ้นแล้ว", late: "ล่าช้า", warn: "ใกล้ครบกำหนด", ok: "งานปกติ" };
const ANALYSIS_DEADLINE_COLOR = { done: "var(--green)", late: "var(--red)", warn: "var(--amber)", ok: "var(--teal)" };

// Customer-facing, read-only tracking page for restricted (booking-only)
// accounts — search-first by design, same as the analysis tracker's own
// customer view: knowing the job number is what proves it's your own job,
// so there's no browsable list of every job here, and "queue position" is
// always a count, never another job's number.
function AnalysisTrackView({ jobs }) {
  const [query, setQuery] = useState(DEFAULT_JOB_PREFIX);
  const [searched, setSearched] = useState(false);

  const job = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return jobs.find(j => (j.jobNo || "").toLowerCase() === q) || null;
  }, [jobs, query]);

  const stats = job ? computeAnalysisJobStats(job) : null;

  // Lab-wide overview shown at the top of this page — aggregate counts and
  // percentages only, computed fresh from `jobs` every render. Deliberately
  // never surfaces a job number, sample code, or any other per-job detail
  // here — that's what the search box below is for, and only once someone
  // proves it's their own job by typing its exact number. This keeps the
  // "home" overview genuinely safe to show to every restricted account
  // without one customer being able to see another's job info.
  const overview = useMemo(() => {
    let waiting = 0, running = 0, complete = 0;
    for (const j of jobs) {
      const st = computeAnalysisJobStats(j).status;
      if (st === ANALYSIS_STATUS.WAIT) waiting++;
      else if (st === ANALYSIS_STATUS.RUN) running++;
      else complete++;
    }
    return { total: jobs.length, waiting, running, complete };
  }, [jobs]);
  const buckets = useMemo(() => analysisJobBuckets(jobs), [jobs]);
  const topParams = useMemo(() => {
    const tally = {};
    for (const j of jobs) {
      for (const p of (j.parameters || [])) {
        if (!p.name) continue;
        // ICP-OES gets run across a few sub-channels (ICP-A / ICP-B / ICP-P
        // etc.) that show up as separately-named parameters — group them
        // back into one "ICP-OES" bucket here so this chart reflects its
        // real combined workload instead of splitting it three ways.
        const key = /ICP-?A|ICP-?B|ICP-?P/i.test(p.name) ? "ICP-OES" : p.name;
        tally[key] = (tally[key] || 0) + 1;
      }
    }
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [jobs]);
  const maxParamCount = topParams.length ? topParams[0][1] : 1;

  return (
    <div>
      <TabHeader title="ติดตามงานวิเคราะห์" sub="ภาพรวมงานวิเคราะห์ของห้องปฏิบัติการ และค้นหาความคืบหน้างานของคุณ" />

      {jobs.length > 0 && (
        <>
          <div style={S.statGrid} className="statGrid">
            {[
              { label: "งานทั้งหมด", value: overview.total, icon: ClipboardList, color: "var(--teal)", tint: "#E9F1FB" },
              { label: "กำลังวิเคราะห์", value: overview.running, icon: FlaskConical, color: "var(--amber)", tint: "#FDF3E3" },
              { label: "เสร็จสิ้นแล้ว", value: overview.complete, icon: CheckCircle2, color: "var(--green)", tint: "#E7F5EC" },
              { label: "ใกล้ครบกำหนด", value: buckets.warn, icon: Clock, color: "var(--amber)", tint: "#FDF3E3" },
              { label: "ล่าช้า", value: buckets.late, icon: AlertTriangle, color: "var(--red)", tint: "#FBEAE8" },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} style={S.statCard} className="statCard">
                  <div className="statIconTile" style={{ width: 38, height: 38, borderRadius: 10, background: s.tint, display: "none", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={18} color={s.color} />
                  </div>
                  <div>
                    <div style={S.statTop} className="statTop">
                      <Icon size={16} color="var(--teal)" className="statTopIcon" />
                      <span style={S.statLabel}>{s.label}</span>
                    </div>
                    <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) minmax(260px,1.3fr)", gap: 14, marginBottom: 24 }} className="ltAnalysisOverviewGrid">
            <div style={S.panel}>
              <div style={S.panelTitle}>สถานะงานโดยรวม</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>สัดส่วนงานทั้งหมดในระบบตามสถานะ</div>
              <DonutChart
                segs={[
                  { value: overview.waiting, color: "var(--muted)", label: "รอดำเนินการ" },
                  { value: overview.running, color: "var(--amber)", label: "กำลังวิเคราะห์" },
                  { value: overview.complete, color: "var(--green)", label: "เสร็จสิ้น" },
                ]}
                centerLabel="ทั้งหมด"
              />
            </div>
            <div style={S.panel}>
              <div style={S.panelTitle}>พารามิเตอร์ที่มีงานมากที่สุด</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, marginBottom: 12 }}>นับรวมทุกงานในระบบ ไม่ระบุเลขทะเบียนรายตัว</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topParams.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>ยังไม่มีข้อมูล</div>}
                {topParams.map(([name, count]) => (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                      <span>{name}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}>{count}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "#EEF2F6", overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((count / maxParamCount) * 100)}%`, height: "100%", background: "var(--teal)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...S.panelTitle, marginBottom: 10 }}>ค้นหางานของคุณ</div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20, maxWidth: 480 }}>
        <input
          style={S.input}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearched(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") setSearched(true); }}
          placeholder={`เช่น ${DEFAULT_JOB_PREFIX}05171`}
        />
        <button style={S.primaryBtn} onClick={() => setSearched(true)}><Search size={14} /> ค้นหา</button>
      </div>

      {searched && !job && <EmptyState text="ไม่พบข้อมูลรหัสงานนี้ กรุณาตรวจสอบเลขทะเบียนอีกครั้ง" />}

      {job && stats && (() => {
        const dl = analysisJobDeadlineInfo(job);
        return (
        <div style={{ maxWidth: 640 }}>
          <div style={{ ...S.panel, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: "var(--teal)" }}>{job.jobNo}</span>
              <Tag color={ANALYSIS_STATUS_TAG_COLOR[stats.status]}>{ANALYSIS_STATUS_LABEL[stats.status]}</Tag>
            </div>
            {job.sample && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>{job.sample}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {job.createdAt && (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>วันที่รับงาน {fmtTimestamp(job.createdAt)}</span>
              )}
              <Tag color={ANALYSIS_DEADLINE_COLOR[dl.level]}>
                {ANALYSIS_DEADLINE_LABEL[dl.level]}{dl.level !== "done" ? ` · รับมาแล้ว ${dl.days} วัน` : ""}
              </Tag>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 10, borderRadius: 6, background: "#EEF2F6", border: "1px solid var(--line)", overflow: "hidden" }}>
                <div style={{ width: `${stats.progress}%`, height: "100%", background: "var(--green)" }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, minWidth: 46, textAlign: "right" }}>{stats.progress}%</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
              เสร็จแล้ว {stats.complete} จากทั้งหมด {stats.total} พารามิเตอร์
            </div>
          </div>

          <div style={{ ...S.panelTitle, marginBottom: 10 }}>รายละเอียดแต่ละพารามิเตอร์</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(job.parameters || []).map((p) => {
              const q = p.status === ANALYSIS_STATUS.WAIT ? analysisParamQueuePosition(jobs, p.name, job.jobNo) : null;
              return (
                <div key={p.id} style={{ ...S.eqCard, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13.5 }}>{p.name}</span>
                  <div style={{ textAlign: "right" }}>
                    <Tag color={ANALYSIS_STATUS_TAG_COLOR[p.status]}>{ANALYSIS_STATUS_LABEL[p.status]}</Tag>
                    {q && q.total > 0 && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                        คิวที่ {q.position} จาก {q.total} งาน
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

/* ---------- helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(todayISO() + "T00:00:00");
  return Math.round((d - t) / 86400000);
};
const fmtDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
};
// Same as fmtDate but for raw millisecond timestamps (job.createdAt etc.,
// which come from the analysis tracker's Date.now()-based fields, not the
// "YYYY-MM-DD" strings LabTrackApp's own records use).
function fmtTimestamp(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
}
// Adds N months to a YYYY-MM-DD date string, used to auto-calculate the next
// calibration/maintenance due date from an equipment's recurrence interval.
function addMonths(dateStr, months) {
  if (!dateStr || !months) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + Number(months));
  return d.toISOString().slice(0, 10);
}
function statusOf(days) {
  if (days === null) return "none";
  if (days < 0) return "danger";
  if (days <= 30) return "warn";
  return "ok";
}
const STATUS_COLOR = { ok: "var(--green)", warn: "var(--amber)", danger: "var(--red)", none: "var(--muted)" };
const STATUS_LABEL = { ok: "ปกติ", warn: "ใกล้ถึงกำหนด", danger: "เลยกำหนด", none: "-" };
const PR_CATEGORY_LABEL = { chemical: "สารเคมี", consumable: "พัสดุสิ้นเปลือง", equipment: "ซ่อม/บำรุงเครื่องมือ", other: "อื่นๆ" };
// Soonest expiry date for a chemical, considering both the legacy single
// expiryDate field and any per-batch expiry dates recorded on "receive"
// transactions — so items with any near-expiry stock surface first.
function earliestExpiry(item) {
  const dates = [item.expiryDate, ...((item.transactions || []).filter(t => t.type === "receive" && t.expiryDate).map(t => t.expiryDate))].filter(Boolean);
  if (dates.length === 0) return null;
  return dates.sort()[0];
}

// Natural alphabetical sort: 0-9, then A-Z, then ก-ฮ — used across every list
// page instead of insertion order, so items are easy to scan/find.
function alphaCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), "th", { numeric: true, sensitivity: "base" });
}

/* ---------- return-tracking helpers (chemicals / consumables withdrawals) ---------- */
// A withdraw transaction can be partially returned over multiple visits —
// `returnedQty` tracks the running total returned so far; `returned` is
// just a convenience flag meaning "fully returned" (kept for old records
// that only ever stored a boolean).
function txReturnedQty(t) {
  return t.returned ? (t.qty || 0) : (t.returnedQty || 0);
}
function txReturnRemaining(t) {
  return Math.max(0, (t.qty || 0) - txReturnedQty(t));
}
function pendingReturnQty(item) {
  return (item.transactions || [])
    .filter(t => t.type === "withdraw" && t.needsReturn)
    .reduce((sum, t) => sum + txReturnRemaining(t), 0);
}

/* ---------- booking (จอง/ยืมเครื่องมือ) helpers ---------- */
const BOOKING_TYPE_LABEL = { checkout: "ขอใช้งาน", reservation: "จองล่วงหน้า" };
const EQUIP_GROUP_LABEL = { analytical: "เครื่องมือวิเคราะห์", aircon: "เครื่องปรับอากาศ", support: "เครื่องมือสนับสนุน" };
// Equipment records created before this grouping existed have no explicit
// `group` field. Rather than silently defaulting everything to one bucket
// (which would misfile every air conditioner), fall back to the type field
// that already reliably marks air conditioners elsewhere in the app — any
// other ungrouped equipment defaults to "analytical" since that's the
// majority of what's tracked here; admins can reclassify individual items
// to "support" from the equipment form.
function resolveEquipGroup(e) {
  if (e.group === "analytical" || e.group === "aircon" || e.group === "support") return e.group;
  return e.type === "เครื่องปรับอากาศ" ? "aircon" : "analytical";
}
const BOOKING_STATUS_LABEL = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
// A more honest label than the raw status: "approved" alone doesn't say
// whether the item has actually been returned/finished yet. Used anywhere
// we show a live claim on equipment (conflict warnings, current-use lists).
function bookingLiveStatusLabel(b) {
  if (b.status === "pending") return "รออนุมัติ";
  if (b.status === "approved") {
    if (b.type === "checkout") return "มีการใช้งานอยู่";
    return b.startDate > todayISO() ? "จองไว้แล้ว" : "มีการใช้งานอยู่";
  }
  return BOOKING_STATUS_LABEL[b.status] || "";
}
const BOOKING_STATUS_COLOR = { pending: "var(--amber)", approved: "var(--green)", rejected: "var(--red)", cancelled: "var(--muted)" };

// Status label for the history table: plain "approved" doesn't say whether
// the item has actually come back yet, so once a checkout has a returnedAt
// this reports it as finished/returned instead of leaving it looking like
// it's still "just approved" and in progress.
function bookingHistoryStatusLabel(b) {
  if (b.status === "approved" && b.returnedAt) {
    return b.assetType === "item" ? "คืนแล้ว" : "เสร็จสิ้นแล้ว";
  }
  return BOOKING_STATUS_LABEL[b.status] || "";
}

// Normalizes a booking into a comparable {start, end} date range. A checkout
// with no returnedAt yet is treated as open-ended (far-future end) so it
// correctly conflicts with anything that would need the equipment later —
// UNLESS it has an explicit start/end time, in which case the person has
// already told us it's a same-day window, so the fallback end is that same
// day (not "forever"). Without this, a same-day checkout that left
// "กำหนดคืน" blank would look like it occupies the equipment indefinitely,
// which breaks the same-day time-overlap check below and makes it flag a
// conflict against every later booking that day regardless of whether the
// clock times actually overlap.
function bookingRange(b) {
  if (b.type === "checkout") {
    const timedFallbackEnd = (b.startTime && b.endTime) ? (b.startDate || todayISO()) : "9999-12-31";
    return { start: b.startDate || todayISO(), end: b.returnedAt || b.dueBackDate || timedFallbackEnd };
  }
  // Reservation: if it was finished early, its real occupied-until date is
  // whenever that happened — capped by the original endDate, since
  // finishing early should never extend a reservation past what was
  // originally requested.
  if (b.returnedAt) {
    const cappedEnd = b.endDate && b.endDate < b.returnedAt ? b.endDate : b.returnedAt;
    return { start: b.startDate || "", end: cappedEnd };
  }
  return { start: b.startDate || "", end: b.endDate || b.startDate || "" };
}
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}
// Only "live" claims can conflict: a still-pending request, or an approved
// one that hasn't been returned/finished yet. Once something is returned
// (checkout) or its reservation period has passed, it's no longer a real
// claim on the equipment and should stop showing up as a conflict.
//
// `draft` (optional) describes the NEW booking being checked — passing its
// assetType/startTime/endTime lets same-day equipment bookings (checkout OR
// reservation) with explicit clock times conflict only when those times
// actually overlap, instead of the whole day looking "taken" the moment
// anyone else has a claim on the same instrument. Multi-day spans and
// anything without an explicit time on both sides keep the original
// whole-day-conflict logic (the safe default).
function findBookingConflicts(bookings, equipmentId, range, excludeId, draft = {}) {
  return bookings.filter((b) => {
    if (b.equipmentId !== equipmentId || b.id === excludeId) return false;
    if (b.status === "pending") { /* still a live claim */ }
    else if (b.status === "approved") { if (!isBookingCurrent(b)) return false; }
    else return false; // rejected/cancelled
    const r = bookingRange(b);
    if (!rangesOverlap(range.start, range.end, r.start, r.end)) return false;
    const sameDayTimed =
      draft.assetType !== "item" && b.assetType !== "item" &&
      range.start === range.end && r.start === r.end && range.start === r.start &&
      draft.startTime && draft.endTime && b.startTime && b.endTime;
    if (sameDayTimed) {
      return draft.startTime < b.endTime && b.startTime < draft.endTime;
    }
    return true;
  });
}
// "Currently live" = approved and either an unreturned checkout, or a
// reservation whose date range hasn't fully passed yet (and wasn't finished
// early). Used to split the "current" view from "history" without needing
// a separate status value.
function isBookingCurrent(b) {
  if (b.status !== "approved") return false;
  if (b.returnedAt) return false; // finished/returned — always history from here on
  if (b.type === "checkout") return true;
  return (b.endDate || b.startDate || "") >= todayISO();
}
function isBookingOverdue(b) {
  return b.type === "checkout" && b.status === "approved" && !b.returnedAt && b.dueBackDate && daysUntil(b.dueBackDate) < 0;
}
// Not yet overdue, but due back within `withinDays` — used to populate the
// "ใกล้ถึงกำหนดคืน" (approaching due date) section of the alerts panel.
function isBookingNearDue(b, withinDays = 2) {
  if (!(b.type === "checkout" && b.status === "approved" && !b.returnedAt && b.dueBackDate)) return false;
  const d = daysUntil(b.dueBackDate);
  return d >= 0 && d <= withinDays;
}
// Human-readable one-line status of a piece of equipment right now, shown on
// the equipment card/detail — e.g. "ว่าง", "ถูกยืมโดย สมชาย", "มีการจองล่วงหน้า".
function equipmentBookingSummary(equipmentId, bookings) {
  const live = bookings.filter((b) => b.equipmentId === equipmentId && (b.assetType || "equipment") === "equipment" && isBookingCurrent(b));
  const activeCheckout = live.find((b) => b.type === "checkout");
  if (activeCheckout) {
    return { busy: true, text: `ถูกยืมโดย ${activeCheckout.requestedBy || "-"}`, color: "var(--red)" };
  }
  const reservations = live.filter((b) => b.type === "reservation").sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (reservations.length > 0) {
    const r = reservations[0];
    return { busy: false, text: `มีจองล่วงหน้า ${fmtDate(r.startDate)}${r.endDate && r.endDate !== r.startDate ? ` - ${fmtDate(r.endDate)}` : ""}`, color: "var(--amber)" };
  }
  return { busy: false, text: "ว่าง", color: "var(--green)" };
}
// Same idea as equipmentBookingSummary, but "อุปกรณ์" often exist in more
// than one unit — busy only once every unit is checked out, not on the
// first checkout.
function itemBookingSummary(itemId, bookings, totalQty) {
  const qty = Number(totalQty) || 1;
  const live = bookings.filter((b) => b.equipmentId === itemId && b.assetType === "item" && isBookingCurrent(b));
  const activeCheckouts = live.filter((b) => b.type === "checkout");
  // Sum actual quantities borrowed, not just how many booking records exist —
  // one request can claim more than 1 unit.
  const checkedOutQty = activeCheckouts.reduce((sum, b) => sum + (Number(b.qty) || 1), 0);
  const availableNow = Math.max(0, qty - checkedOutQty);
  if (availableNow <= 0) {
    return { busy: true, availableNow: 0, text: `ถูกยืมครบแล้วทั้ง ${qty} ชิ้น`, color: "var(--red)" };
  }
  if (checkedOutQty > 0) {
    // Spelled out as "X ชิ้น จากทั้งหมด Y ชิ้น" rather than "X/Y" — the slash
    // notation reads like a fraction (e.g. "1/2" looked like "a half") and
    // was getting misread as the availability, not a count-out-of-total.
    return { busy: false, availableNow, text: `เหลือว่าง ${availableNow} ชิ้น จากทั้งหมด ${qty} ชิ้น`, color: "var(--amber)" };
  }
  const reservations = live.filter((b) => b.type === "reservation");
  if (reservations.length > 0) {
    return { busy: false, availableNow, text: `ว่าง ${qty} ชิ้น (มีจองล่วงหน้า ${reservations.length} รายการ)`, color: "var(--amber)" };
  }
  return { busy: false, availableNow: qty, text: `ว่างทั้งหมด ${qty} ชิ้น`, color: "var(--green)" };
}

async function loadList(key, seed) {
  try {
    const res = await window.storage.get(key, true);
    return res && res.value ? JSON.parse(res.value) : seed;
  } catch (e) {
    await window.storage.set(key, JSON.stringify(seed), true);
    return seed;
  }
}
async function saveList(key, list) {
  try { await window.storage.set(key, JSON.stringify(list), true); }
  catch (e) { console.error("save failed", key, e); }
}

/* ---------- seed data ---------- */
const SEED_EQUIPMENT = [
  { id: "e1", code: "MPIR-001", name: "เครื่องชั่ง 3 ตำแหน่ง", type: "เครื่องชั่ง", location: "C1", status: "active", lastCalibration: "2025-07-15", nextDue: "2026-07-15", notes: "" },
  { id: "e2", code: "MPIR-002", name: "เครื่องชั่ง 3 ตำแหน่ง", type: "เครื่องชั่ง", location: "C2", status: "active", lastCalibration: "2025-07-15", nextDue: "2026-07-15", notes: "" },
  { id: "e3", code: "MPIR-003", name: "เครื่องชั่ง 4 ตำแหน่ง", type: "เครื่องชั่ง", location: "C2", status: "active", lastCalibration: "2025-07-15", nextDue: "2026-08-20", notes: "" },
  { id: "e4", code: "MPIR-133", name: "UV/VIS Spectrometer", type: "สเปกโตรมิเตอร์", location: "C1", status: "active", lastCalibration: "2025-07-15", nextDue: "2026-09-01", notes: "" },
  { id: "e5", code: "CT-AIR-001", name: "Air conditioner (25,200 BTU)", type: "เครื่องปรับอากาศ", location: "C1", status: "active", lastCalibration: "", nextDue: "", notes: "ซ่อมน้ำแอร์หยด 22/7/2569" },
];
const SEED_ACTIVITIES = [
  { id: "a1", equipmentId: "e4", date: "2025-07-15", type: "calibration", detail: "สอบเทียบประจำปี โดย บริษัท แอนนาไลท์ติคอลส์ เทคโนโลยี จำกัด", by: "" },
  { id: "a2", equipmentId: "e5", date: "2025-07-22", type: "repair", detail: "ซ่อมน้ำแอร์หยด", by: "" },
];
const SEED_CHEMICALS = [
  { id: "c1", name: "Acetonitrile HPLC grade", lotNo: "AC2401", quantity: 4, unit: "ขวด (2.5 L)", expiryDate: "2026-09-10", location: "ตู้เก็บสารไวไฟ", minThreshold: 2 },
  { id: "c2", name: "Sodium Hydroxide", lotNo: "NH1187", quantity: 1, unit: "kg", expiryDate: "2026-08-25", location: "ชั้นสารเคมีทั่วไป", minThreshold: 1 },
];
const SEED_CONSUMABLES = [
  { id: "s1", name: "ทิชชู่เช็ดเลนส์", quantity: 3, unit: "ห่อ", minThreshold: 5, location: "ตู้พัสดุ C1" },
  { id: "s2", name: "ถุงมือไนไตรล์ ไซส์ M", quantity: 2, unit: "กล่อง", minThreshold: 3, location: "ตู้พัสดุ C2" },
];
const SEED_BOOKINGS = [];
// "อุปกรณ์" — reusable lab items that get borrowed & returned (like
// equipment) but don't need calibration tracking, and often exist in more
// than one unit (e.g. 3 pairs of scissors). Distinct from "เครื่องมือ"
// (calibrated instruments) and "พัสดุสิ้นเปลือง" (consumables that get used
// up and reordered, not borrowed back).
const SEED_ITEMS = [
  { id: "i1", code: "", name: "Soil core sampler", category: "เก็บตัวอย่าง", location: "C1", status: "active", totalQty: 2, notes: "" },
  { id: "i2", code: "", name: "กรรไกรตัดกิ่ง", category: "เครื่องมือช่าง", location: "C1", status: "active", totalQty: 3, notes: "" },
  { id: "i3", code: "", name: "Brix refractometer (มือถือ)", category: "วัดค่า", location: "C2", status: "active", totalQty: 2, notes: "" },
];

// External link, not an internal tab: clicking it opens the Central Lab
// MPIR analysis-request site in a new tab instead of calling setTab, so it
// never enters allowedTabKeys / the ?tab= URL tracking (see App below).
// Admin accounts (full NAV) go straight to the admin login; booking-only
// (RESTRICTED_NAV) accounts get the regular site.
const REQUEST_ANALYSIS_LINK_ADMIN = { key: "requestAnalysis", label: "ขอรับบริการวิเคราะห์", icon: ExternalLink, external: "https://centrallab-mpir.mitrphol.com/login/admin", featured: true };
const REQUEST_ANALYSIS_LINK = { key: "requestAnalysis", label: "ขอรับบริการวิเคราะห์", icon: ExternalLink, external: "https://centrallab-mpir.mitrphol.com/", featured: true };

const NAV = [
  { key: "dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  REQUEST_ANALYSIS_LINK_ADMIN,
  { key: "equipment", label: "เครื่องมือ", icon: Wrench },
  { key: "items", label: "อุปกรณ์", icon: Box },
  { key: "bookings", label: "จอง/ยืมเครื่องมือ", icon: CalendarCheck },
  { key: "chemicals", label: "สารเคมี", icon: FlaskConical },
  { key: "consumables", label: "พัสดุสิ้นเปลือง", icon: Package },
  { key: "purchase", label: "ใบขอซื้อ (PR)", icon: ClipboardList },
  { key: "reports", label: "รายงาน", icon: FileDown },
];
// Booking-only (restricted) accounts get their own, separate sidebar: just
// the booking page plus the two read-mostly pages (calendar/catalog) as
// their own top-level items — they have no admin tables to reach these
// from, so these stay one tap away in the sidebar rather than buried as
// sub-tabs. Admin accounts instead reach the same two pages as sub-tabs
// inside the "จอง/ยืมเครื่องมือ" page itself (see BookingsTab).
const RESTRICTED_NAV = [
  { key: "analysisTracking", label: "ติดตามงานวิเคราะห์", icon: FlaskConical, featured: true },
  REQUEST_ANALYSIS_LINK,
  { key: "bookings", label: "จอง/ยืมเครื่องมือ", icon: CalendarCheck },
  { key: "usageCalendar", label: "ปฏิทินการใช้งาน", icon: CalendarClock },
  { key: "catalog", label: "รายการที่ยืมได้", icon: LayoutGrid },
];

export default function App({ restrictToBooking = false, currentUsername = "", currentDisplayName = "" }) {
  // Which tab loads first, and stays after a refresh:
  // - Default (no ?tab= yet): restricted accounts land on "ติดตามงานวิเคราะห์"
  //   (now the featured/first item), everyone else on the dashboard.
  // - If the URL already has a valid ?tab=, that wins instead — this is what
  //   makes reloading the page (or sharing a link to a specific page) land
  //   back on the same tab instead of always bouncing to the default.
  const defaultTab = restrictToBooking ? "analysisTracking" : "dashboard";
  const allowedTabKeys = (restrictToBooking ? RESTRICTED_NAV : NAV).filter(n => !n.external).map(n => n.key);
  const [tab, setTabState] = useState(() => {
    if (typeof window === "undefined") return defaultTab;
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    return fromUrl && allowedTabKeys.includes(fromUrl) ? fromUrl : defaultTab;
  });
  // Wraps the raw state setter so every tab change also updates the URL
  // (via replaceState — doesn't add browser-history entries or reload the
  // page), keeping `tab` and the address bar in sync at all times.
  function setTab(key) {
    setTabState(key);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      window.history.replaceState(null, "", url);
    }
  }
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [activities, setActivities] = useState([]);
  const [items, setItems] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [toast, setToast] = useState(null);
  const [analysisJobs, setAnalysisJobs] = useState([]);

  useEffect(() => {
    (async () => {
      const [eq, ac, it, bk, ch, co, pr] = await Promise.all([
        loadList("equipment", SEED_EQUIPMENT),
        loadList("activities", SEED_ACTIVITIES),
        loadList("items", SEED_ITEMS),
        loadList("bookings", SEED_BOOKINGS),
        loadList("chemicals", SEED_CHEMICALS),
        loadList("consumables", SEED_CONSUMABLES),
        loadList("purchaseRequests", []),
      ]);
      setEquipment(eq); setActivities(ac); setItems(it); setBookings(bk); setChemicals(ch); setConsumables(co); setPurchaseRequests(pr);
      setLoading(false);
    })();
  }, []);

  // Live, read-only subscription into the Lab Analysis Tracker's own
  // Firebase project — just for the dashboard status counts.
  useEffect(() => {
    const unsubscribe = subscribeAnalysisJobs(setAnalysisJobs);
    return unsubscribe;
  }, []);

  const analysisStats = useMemo(() => analysisJobBuckets(analysisJobs), [analysisJobs]);

  function notify(msg, duration = 2200) {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }

  const persist = {
    equipment: (list) => { setEquipment(list); saveList("equipment", list); },
    activities: (list) => { setActivities(list); saveList("activities", list); },
    items: (list) => { setItems(list); saveList("items", list); },
    bookings: (list) => { setBookings(list); saveList("bookings", list); },
    chemicals: (list) => { setChemicals(list); saveList("chemicals", list); },
    consumables: (list) => { setConsumables(list); saveList("consumables", list); },
    purchaseRequests: (list) => { setPurchaseRequests(list); saveList("purchaseRequests", list); },
  };

  const alerts = useMemo(() => {
    const calib = equipment
      .map(e => ({ e, days: daysUntil(e.nextDue), st: statusOf(daysUntil(e.nextDue)) }))
      .filter(x => x.st === "warn" || x.st === "danger")
      .sort((a, b) => a.days - b.days);
    const expiry = chemicals
      .map(c => ({ c, days: daysUntil(earliestExpiry(c)), st: statusOf(daysUntil(earliestExpiry(c))) }))
      .filter(x => x.st === "warn" || x.st === "danger")
      .sort((a, b) => a.days - b.days);
    const lowStock = consumables
      .filter(s => s.quantity <= s.minThreshold)
      .sort((a, b) => a.quantity - b.quantity);
    const lowChem = chemicals
      .filter(c => c.quantity <= c.minThreshold)
      .sort((a, b) => a.quantity - b.quantity);
    const pendingBookings = bookings
      .filter(b => b.status === "pending")
      .sort((a, b) => (a.requestedAt || "").localeCompare(b.requestedAt || ""));
    const overdueBookings = bookings.filter(isBookingOverdue);
    return { calib, expiry, lowStock, lowChem, pendingBookings, overdueBookings };
  }, [equipment, chemicals, consumables, bookings]);

  const totalAlertCount = alerts.calib.length + alerts.expiry.length + alerts.lowStock.length
    + alerts.lowChem.length + alerts.pendingBookings.length + alerts.overdueBookings.length;

  const visibleNav = restrictToBooking ? RESTRICTED_NAV : NAV;
  // One-shot: when set, the Bookings tab (once mounted) jumps straight to
  // this sub-view instead of its default "pending" — used by the global
  // "ต้องคืน" reminder banner below so restricted accounts land exactly on
  // their return list instead of just the tab's default sub-view.
  const [bookingsFocusView, setBookingsFocusView] = useState(null);
  // Restricted accounts' own currently-out items — computed here (not just
  // inside BookingsTab) so the reminder can show on EVERY page they land on
  // (their default tab is "ติดตามงานวิเคราะห์", not bookings), not only when
  // they happen to have clicked into the booking page itself.
  const myCurrentBookings = restrictToBooking
    ? bookings.filter(b => isBookingCurrent(b) && (b.requestedByUsername || b.requestedBy) === currentUsername)
    : [];
  const myOverdueCount = myCurrentBookings.filter(isBookingOverdue).length;
  // Restricted accounts' sidebar badge must only ever count THIS account's
  // own pending requests — never the company-wide pending count — both to
  // match what the bookings page itself shows them, and so the badge never
  // hints that other people's requests exist.
  const bookingsNavBadgeCount = restrictToBooking
    ? bookings.filter(b => b.status === "pending" && (b.requestedByUsername || b.requestedBy) === currentUsername).length
    : alerts.pendingBookings.length;

  if (loading) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 420 }}>
        <style>{CSS}</style>
        <div style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontSize: 13 }}>กำลังโหลดข้อมูล...</div>
      </div>
    );
  }

  return (
    <div style={S.app} className="ltApp">
      <style>{CSS}</style>
      <div style={S.shell} className="ltShell">
        {/* sidebar (becomes a compact top header on mobile; nav moves to the bottom bar below) */}
        <aside style={S.sidebar} className="ltSidebar">
          <div style={S.brand}>
            <div style={S.brandMark}>
              <FlaskConical size={24} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <div style={S.brandName}>LabTrack</div>
              <div style={S.brandSub}>MPIR Central Lab</div>
            </div>
          </div>
          {visibleNav.length > 1 && (
            <nav style={{ marginTop: 18 }} className="ltNav">
              {visibleNav.map(n => {
                const Icon = n.icon;
                const active = tab === n.key;
                const pendingCount = n.key === "dashboard"
                  ? totalAlertCount
                  : n.key === "bookings"
                  ? bookingsNavBadgeCount
                  : 0;
                const activeBookingCount = n.key === "bookings"
                  ? (restrictToBooking
                      ? bookings.filter(b => isBookingCurrent(b) && (b.requestedByUsername || b.requestedBy) === currentUsername).length
                      : bookings.filter(isBookingCurrent).length)
                  : 0;
                return (
                  <button
                    key={n.key}
                    onClick={() => n.external ? window.open(n.external, "_blank", "noopener,noreferrer") : setTab(n.key)}
                    style={{
                      ...S.navBtn,
                      ...(active ? S.navBtnActive : {}),
                      ...(n.featured ? S.navBtnFeatured : {}),
                      ...(n.featured && active ? S.navBtnFeaturedActive : {}),
                    }}
                    className="ltNavBtn"
                  >
                    <Icon size={n.featured ? 18 : 16} strokeWidth={n.featured ? 2.3 : 2} />
                    <span style={{ flex: 1, textAlign: "left" }} className="ltNavBtnLabel">{n.label}</span>
                    {activeBookingCount > 0 && <span style={S.navBadgeGreen}>{activeBookingCount}</span>}
                    {pendingCount > 0 && <span style={S.navBadge}>{pendingCount}</span>}
                  </button>
                );
              })}
            </nav>
          )}
          <div style={S.sidebarFoot} className="ltSidebarFoot">
            {restrictToBooking ? "บัญชีนี้เข้าถึงได้เฉพาะหน้าจอง/ยืม, ปฏิทินการใช้งาน, รายการที่ยืมได้ และติดตามงานวิเคราะห์" : "ข้อมูลนี้ใช้ร่วมกันในทีมของคุณ"}
          </div>
          <div style={S.sidebarDeco} className="ltSidebarDeco" />
        </aside>

        {/* main */}
        <main style={S.main} className="ltMain">
          {restrictToBooking && tab !== "bookings" && myCurrentBookings.length > 0 && (
            <div
              style={{
                ...S.notesBox, marginBottom: 14, display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 10, flexWrap: "wrap",
                background: myOverdueCount > 0 ? "#FBE9E4" : S.notesBox.background,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, color: myOverdueCount > 0 ? "var(--red)" : "var(--ink)" }}>
                {myOverdueCount > 0
                  ? `คุณมี ${myCurrentBookings.length} รายการที่ต้องคืน (เลยกำหนดแล้ว ${myOverdueCount} รายการ)`
                  : `คุณมี ${myCurrentBookings.length} รายการที่ต้องคืนหลังใช้เสร็จ`}
              </span>
              <button style={S.smallBtn} onClick={() => { setTab("bookings"); setBookingsFocusView("current"); }}>
                ไปที่รายการที่ต้องคืน <ChevronRight size={13} />
              </button>
            </div>
          )}
          {!restrictToBooking && tab === "dashboard" && (
            <Dashboard equipment={equipment} chemicals={chemicals} consumables={consumables} bookings={bookings} alerts={alerts} analysisStats={analysisStats} goto={setTab} />
          )}
          {!restrictToBooking && tab === "equipment" && (
            <EquipmentTab equipment={equipment} setEquipment={persist.equipment}
              activities={activities} setActivities={persist.activities}
              bookings={bookings} setBookings={persist.bookings} items={items} notify={notify} />
          )}
          {!restrictToBooking && tab === "items" && (
            <ItemsTab items={items} setItems={persist.items} bookings={bookings} setBookings={persist.bookings} equipment={equipment} notify={notify} />
          )}
          {tab === "bookings" && (
            <BookingsTab bookings={bookings} setBookings={persist.bookings} equipment={equipment} items={items} notify={notify}
              restrictToBooking={restrictToBooking} currentUsername={currentUsername} currentDisplayName={currentDisplayName}
              embedExtras={!restrictToBooking}
              focusView={bookingsFocusView} onFocusHandled={() => setBookingsFocusView(null)} />
          )}
          {restrictToBooking && tab === "usageCalendar" && (
            <UsageCalendarTab bookings={bookings} equipment={equipment} items={items}
              restrictToBooking={restrictToBooking} currentUsername={currentUsername} />
          )}
          {restrictToBooking && tab === "catalog" && (
            <CatalogTab equipment={equipment} items={items} bookings={bookings} setBookings={persist.bookings} notify={notify}
              restrictToBooking={restrictToBooking} currentUsername={currentUsername} currentDisplayName={currentDisplayName} />
          )}
          {restrictToBooking && tab === "analysisTracking" && (
            <AnalysisTrackView jobs={analysisJobs} />
          )}
          {!restrictToBooking && tab === "chemicals" && (
            <ChemicalsTab chemicals={chemicals} setChemicals={persist.chemicals} notify={notify} />
          )}
          {!restrictToBooking && tab === "consumables" && (
            <ConsumablesTab consumables={consumables} setConsumables={persist.consumables} notify={notify} />
          )}
          {!restrictToBooking && tab === "purchase" && (
            <PurchaseRequestsTab requests={purchaseRequests} setRequests={persist.purchaseRequests} notify={notify} />
          )}
          {!restrictToBooking && tab === "reports" && (
            <ReportsTab equipment={equipment} activities={activities} chemicals={chemicals} consumables={consumables} purchaseRequests={purchaseRequests} />
          )}
        </main>
      </div>

      {/* App-style bottom navigation bar, shown only on mobile (see .ltBottomNav in CSS) */}
      {visibleNav.length > 1 && (
        <div className="ltBottomNav">
          {visibleNav.map(n => {
            const Icon = n.icon;
            const active = tab === n.key;
            const count = n.key === "dashboard"
              ? totalAlertCount
              : n.key === "bookings"
              ? bookingsNavBadgeCount
              : 0;
            return (
              <button key={n.key} onClick={() => n.external ? window.open(n.external, "_blank", "noopener,noreferrer") : setTab(n.key)} className="ltBottomNavBtn" style={{ color: active ? "var(--teal-dark)" : "var(--muted)" }}>
                <span style={{ position: "relative" }}>
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                  {count > 0 && <span className="ltBottomNavBadge">{count}</span>}
                </span>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{n.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

/* ================= DASHBOARD ================= */
function Dashboard({ equipment, chemicals, consumables, bookings, alerts, analysisStats, goto }) {
  const activeCount = equipment.filter(e => e.status === "active").length;
  const stats = [
    { label: "เครื่องมือทั้งหมด", value: equipment.length, sub: `${activeCount} ใช้งานอยู่`, icon: Wrench, tint: "#E9F1FB", color: "var(--teal)", goto: "equipment" },
    { label: "คำขอจอง/ยืมรออนุมัติ", value: alerts.pendingBookings.length, sub: `${bookings.filter(isBookingCurrent).length} รายการกำลังใช้งาน/จองอยู่`, icon: CalendarCheck, tint: "#FDF3E3", color: "var(--amber)", goto: "bookings" },
    { label: "รายการสารเคมี", value: chemicals.length, sub: `${alerts.expiry.length} ใกล้/เลยหมดอายุ`, icon: FlaskConical, tint: "#FBE9E4", color: "#D9622E", goto: "chemicals" },
    { label: "พัสดุสิ้นเปลือง", value: consumables.length, sub: `${alerts.lowStock.length} ใกล้หมด`, icon: Package, tint: "#F0EAFB", color: "#7A4FC2", goto: "consumables" },
  ];

  const calibOk = equipment.filter(e => statusOf(daysUntil(e.nextDue)) === "ok" && e.nextDue).length;
  const calibWarn = alerts.calib.filter(x => x.st === "warn").length;
  const calibDanger = alerts.calib.filter(x => x.st === "danger").length;

  return (
    <div>
      <div style={S.hero} className="ltHero">
        <div style={S.heroGrid} />
        <div style={S.heroPhoto} />
        <div style={{ position: "relative" }}>
          <div style={S.eyebrow}>ภาพรวมวันนี้ · {fmtDate(todayISO())}</div>
          <h1 style={S.h1} className="ltH1">สถานะห้องปฏิบัติการ</h1>
          <p style={S.heroSub}>ติดตามกำหนดสอบเทียบ อายุสารเคมี และพัสดุใกล้หมด ในที่เดียว</p>
        </div>
      </div>

      <div style={S.statGrid} className="statGrid">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={i}
              style={{ ...S.statCard, cursor: s.goto ? "pointer" : "default" }}
              className="statCard"
              onClick={s.goto ? () => goto(s.goto) : undefined}
              role={s.goto ? "button" : undefined}
            >
              <div className="statIconTile" style={{ width: 38, height: 38, borderRadius: 10, background: s.tint, display: "none", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={18} color={s.color} />
              </div>
              <div>
                <div style={S.statTop} className="statTop">
                  <Icon size={16} color="var(--teal)" className="statTopIcon" />
                  <span style={S.statLabel}>{s.label}</span>
                </div>
                <div style={S.statValue}>{s.value}</div>
                <div style={S.statSub}>{s.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        {equipment.length > 0 && (
          <div style={{ ...S.panel, flex: "1 1 380px", marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={S.panelHead}>
                <CalendarClock size={15} color="var(--ink)" />
                <span style={S.panelTitle}>การสอบเทียบเครื่องมือ</span>
              </div>
              <button onClick={() => goto("equipment")} style={S.panelLink}>ดูทั้งหมด <ChevronRight size={13} /></button>
            </div>
            <CalibrationDonut ok={calibOk} warn={calibWarn} danger={calibDanger} />
          </div>
        )}
        <div style={{ ...S.panel, flex: "1 1 380px", marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={S.panelHead}>
              <FlaskConical size={15} color="var(--ink)" />
              <span style={S.panelTitle}>ติดตามงานวิเคราะห์ · Lab Analysis Tracker</span>
            </div>
          </div>
          <AnalysisJobsDonut late={analysisStats.late} warn={analysisStats.warn} todo={analysisStats.todo} />
        </div>
      </div>

      <div style={S.alertCols}>
        <AlertPanel
          title="การจอง/ยืมที่ต้องติดตาม"
          icon={CalendarCheck}
          empty="ไม่มีคำขอรออนุมัติหรือรายการเลยกำหนดคืน"
          onSeeAll={() => goto("bookings")}
          items={[
            ...alerts.pendingBookings.map(b => ({
              key: b.id, st: "warn", title: `${b.equipmentCode} · ${b.equipmentName}`,
              detail: `รออนุมัติ · ${BOOKING_TYPE_LABEL[b.type]} โดย ${b.requestedBy || "-"}`,
            })),
            ...alerts.overdueBookings.map(b => ({
              key: "od-" + b.id, st: "danger", title: `${b.equipmentCode} · ${b.equipmentName}`,
              detail: `เลยกำหนดคืน ${Math.abs(daysUntil(b.dueBackDate))} วัน · ยืมโดย ${b.requestedBy || "-"}`,
            })),
          ]}
        />
        <AlertPanel
          title="กำหนดสอบเทียบ / บำรุงรักษา"
          icon={CalendarClock}
          empty="ไม่มีเครื่องมือที่ใกล้หรือเลยกำหนด"
          onSeeAll={() => goto("equipment")}
          items={alerts.calib.map(({ e, days, st }) => ({
            key: e.id, st, title: `${e.code} · ${e.name}`,
            detail: days < 0 ? `เลยกำหนด ${Math.abs(days)} วัน` : `เหลือ ${days} วัน (${fmtDate(e.nextDue)})`,
          }))}
        />
        <AlertPanel
          title="สารเคมีใกล้/เลยหมดอายุ"
          icon={Clock}
          empty="ไม่มีสารเคมีที่ใกล้หมดอายุ"
          onSeeAll={() => goto("chemicals")}
          items={alerts.expiry.map(({ c, days, st }) => ({
            key: c.id, st, title: c.name,
            detail: days < 0 ? `หมดอายุแล้ว ${Math.abs(days)} วัน` : `เหลือ ${days} วัน (${fmtDate(earliestExpiry(c))})`,
          }))}
        />
        <AlertPanel
          title="พัสดุ/สารเคมีใกล้หมด"
          icon={Package}
          empty="สต็อคทุกรายการยังเพียงพอ"
          onSeeAll={() => goto("consumables")}
          items={[
            ...alerts.lowStock.map(s => ({ key: s.id, st: s.quantity <= 0 ? "danger" : "warn", title: s.name, detail: `เหลือ ${s.quantity} ${s.unit}` })),
            ...alerts.lowChem.map(c => ({ key: "chem-" + c.id, st: c.quantity <= 0 ? "danger" : "warn", title: c.name + " (สารเคมี)", detail: `เหลือ ${c.quantity} ${c.unit} (ขั้นต่ำ ${c.minThreshold})` })),
          ]}
        />
      </div>
    </div>
  );
}

// Donut for booking/loan items needing follow-up: overdue returns, items due
// back soon, and pending approval requests still to action.
// Job counts pulled live from the Lab Analysis Tracker's own Firebase
// project — "late"/"warn" thresholds mirror that app's own definitions.
function AnalysisJobsDonut({ late, warn, todo }) {
  const segs = [
    { value: late, color: "var(--red)", label: "ล่าช้า" },
    { value: warn, color: "var(--amber)", label: "ใกล้ครบกำหนด" },
    { value: todo, color: "var(--teal)", label: "งานที่ต้องทำ" },
  ];
  return <DonutChart segs={segs} centerLabel="ทั้งหมด" />;
}

function CalibrationDonut({ ok, warn, danger }) {
  const segs = [
    { value: ok, color: "var(--green)", label: "ปกติ" },
    { value: warn, color: "var(--amber)", label: "ใกล้ถึงกำหนด" },
    { value: danger, color: "var(--red)", label: "เลยกำหนด" },
  ];
  return <DonutChart segs={segs} centerLabel="ทั้งหมด" />;
}

function DonutChart({ segs, centerLabel = "ทั้งหมด" }) {
  const total = segs.reduce((sum, s) => sum + s.value, 0);
  const R = 42, C_ = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
      <svg width={110} height={110} viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
        <circle cx="55" cy="55" r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
        {total > 0 && segs.map((s, i) => {
          if (s.value === 0) return null;
          const frac = s.value / total;
          const dash = frac * C_;
          const circle = (
            <circle
              key={i}
              cx="55" cy="55" r={R} fill="none" stroke={s.color} strokeWidth="14"
              strokeDasharray={`${dash} ${C_ - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 55 55)"
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return circle;
        })}
        <text x="55" y="51" textAnchor="middle" fontSize="22" fontWeight="700" fontFamily="var(--font-mono)" fill="var(--ink)">{total}</text>
        <text x="55" y="67" textAnchor="middle" fontSize="9" fill="var(--muted)">{centerLabel}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {segs.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ color: "var(--muted)" }}>{s.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)" }}>
              {s.value} {total > 0 ? `(${Math.round((s.value / total) * 100)}%)` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertPanel({ title, icon: Icon, items, empty, onSeeAll }) {
  return (
    <div style={S.panel}>
      <div style={S.panelHead}>
        <Icon size={15} color="var(--ink)" />
        <span style={S.panelTitle}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {items.length === 0 && (
          <div style={S.panelEmpty}><CheckCircle2 size={14} color="var(--green)" /> {empty}</div>
        )}
        {items.slice(0, 6).map(it => (
          <div key={it.key} style={S.alertRow}>
            <span style={{ ...S.beacon, background: STATUS_COLOR[it.st], boxShadow: `0 0 0 3px ${STATUS_COLOR[it.st]}22` }} />
            <div style={{ minWidth: 0 }}>
              <div style={S.alertRowTitle}>{it.title}</div>
              <div style={S.alertRowDetail}>{it.detail}</div>
            </div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <button onClick={onSeeAll} style={S.panelLink}>ดูทั้งหมด <ChevronRight size={13} /></button>
      )}
    </div>
  );
}

/* ================= EQUIPMENT ================= */
function EquipmentTab({ equipment, setEquipment, activities, setActivities, bookings, setBookings, items = [], notify }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all"); // all | analytical | aircon | support
  const [calibFilter, setCalibFilter] = useState("all"); // "all" | "warn" | "danger"
  const [editing, setEditing] = useState(null); // equipment object or null
  const [selected, setSelected] = useState(null); // detail view id
  const [showImport, setShowImport] = useState(false);
  const [bookingFor, setBookingFor] = useState(null); // equipment item to open the booking form for

  const types = useMemo(() => [...new Set(equipment.map(e => e.type).filter(Boolean))].sort(), [equipment]);

  const filtered = equipment
    .filter(e => {
      const matchQ = (e.code + e.name + (e.brand || "") + (e.model || "") + (e.serialNo || "") + e.location + e.type).toLowerCase().includes(q.toLowerCase());
      const matchS = statusFilter === "all" || e.status === statusFilter;
      const matchT = typeFilter === "all" || e.type === typeFilter;
      const matchG = groupFilter === "all" || resolveEquipGroup(e) === groupFilter;
      const matchC = calibFilter === "all" || statusOf(daysUntil(e.nextDue)) === calibFilter;
      return matchQ && matchS && matchT && matchG && matchC;
    })
    .slice()
    .sort((a, b) => alphaCompare(a.code, b.code));

  const groupCounts = useMemo(() => {
    const c = { analytical: 0, aircon: 0, support: 0 };
    equipment.forEach(e => { c[resolveEquipGroup(e)]++; });
    return c;
  }, [equipment]);

  function upsert(item) {
    if (equipment.find(e => e.id === item.id)) {
      setEquipment(equipment.map(e => e.id === item.id ? item : e));
      notify("บันทึกการแก้ไขแล้ว");
    } else {
      setEquipment([item, ...equipment]);
      notify("เพิ่มเครื่องมือใหม่แล้ว");
    }
    setEditing(null);
  }
  function remove(id) {
    setEquipment(equipment.filter(e => e.id !== id));
    setActivities(activities.filter(a => a.equipmentId !== id));
    notify("ลบเครื่องมือแล้ว");
    if (selected === id) setSelected(null);
  }
  function setAvailability(id, disabled, reason) {
    setEquipment(equipment.map(e => e.id === id
      ? (disabled ? { ...e, status: "maintenance", unavailableReason: reason } : { ...e, status: "active", unavailableReason: "" })
      : e
    ));
    notify(disabled ? "ปิดใช้งานชั่วคราวแล้ว" : "เปิดใช้งานอีกครั้งแล้ว");
  }

  function importItems(items) {
    const newItems = items.map(it => ({
      id: uid(), code: it.code, name: it.name, brand: it.brand || "", model: it.model || "", serialNo: it.serialNo || "",
      type: it.type || "", group: it.type === "เครื่องปรับอากาศ" ? "aircon" : "analytical", location: it.location || "",
      status: "active", lastCalibration: it.lastCalibration || "", nextDue: it.nextDue || "", intervalMonths: it.intervalMonths || "",
      notes: "", imageUrl: "",
    }));
    setEquipment([...newItems, ...equipment]);
    notify(`นำเข้า ${newItems.length} รายการแล้ว`);
    setShowImport(false);
  }

  // Logging a "calibration" activity updates the equipment's last-calibration
  // date, and — if a recurrence interval is set — recalculates the next due
  // date automatically instead of requiring it to be typed in separately.
  function applyCalibrationDates(equipmentId, act) {
    if (act.type !== "calibration") return;
    setEquipment(equipment.map(e => {
      if (e.id !== equipmentId) return e;
      const nextDue = e.intervalMonths ? (addMonths(act.date, e.intervalMonths) || e.nextDue) : e.nextDue;
      return { ...e, lastCalibration: act.date, nextDue };
    }));
  }

  const selectedItem = equipment.find(e => e.id === selected);

  return (
    <div>
      <TabHeader title="เครื่องมือ" sub="รายการเครื่องมือทั้งหมดและกำหนดสอบเทียบ" />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <ViewTab active={groupFilter === "all"} onClick={() => setGroupFilter("all")} label="ทั้งหมด" count={equipment.length} />
        <ViewTab active={groupFilter === "analytical"} onClick={() => setGroupFilter("analytical")} label={EQUIP_GROUP_LABEL.analytical} count={groupCounts.analytical} />
        <ViewTab active={groupFilter === "aircon"} onClick={() => setGroupFilter("aircon")} label={EQUIP_GROUP_LABEL.aircon} count={groupCounts.aircon} />
        <ViewTab active={groupFilter === "support"} onClick={() => setGroupFilter("support")} label={EQUIP_GROUP_LABEL.support} count={groupCounts.support} />
      </div>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหารหัส, ชื่อ, ตำแหน่ง..." />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกประเภท</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกสถานะ</option>
          <option value="active">ใช้งานอยู่</option>
          <option value="maintenance">ซ่อมบำรุง</option>
          <option value="inactive">ปิดใช้งาน</option>
        </select>
        <select value={calibFilter} onChange={e => setCalibFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกกำหนดสอบเทียบ</option>
          <option value="warn">ใกล้ถึงรอบสอบเทียบ</option>
          <option value="danger">เลยกำหนดสอบเทียบ</option>
        </select>
        <button style={S.ghostBtn} onClick={() => setShowImport(true)}>
          <FileDown size={14} style={{ transform: "rotate(180deg)", marginRight: 4 }} /> นำเข้ารายการ
        </button>
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), code: "", name: "", brand: "", model: "", serialNo: "", type: "", group: "analytical", location: "", status: "active", lastCalibration: "", nextDue: "", intervalMonths: "", notes: "", imageUrl: "" })}>
          <Plus size={15} /> เพิ่มเครื่องมือ
        </button>
      </Toolbar>
      {showImport && <EquipmentImportForm onCancel={() => setShowImport(false)} onImport={importItems} />}

      <div style={S.cardGrid}>
        {filtered.map(e => {
          const days = daysUntil(e.nextDue);
          const st = statusOf(days);
          const bk = equipmentBookingSummary(e.id, bookings);
          return (
            <div key={e.id} style={{ ...S.eqCard, display: "flex", flexDirection: "column", gap: 0, padding: 0, overflow: "hidden", height: "100%" }} onClick={() => setSelected(e.id)}>
              {e.imageUrl ? (
                <img src={e.imageUrl} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }}
                  style={{ width: "100%", height: 140, objectFit: "contain", background: "#EEF2F6", display: "block", flexShrink: 0 }} />
              ) : (
                <div style={{ width: "100%", height: 140, background: "linear-gradient(135deg, #E9F1FB, #F5F8FC)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Wrench size={34} color="#B9C7D6" />
                </div>
              )}
              <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={S.eqCardTop}>
                    <span style={{ ...S.beacon, background: STATUS_COLOR[st] }} />
                    <span style={S.eqCode}>{e.code}</span>
                  </div>
                  {e.nextDue && (st === "warn" || st === "danger") && <Tag color={STATUS_COLOR[st]}>{STATUS_LABEL[st]}</Tag>}
                </div>
                <div style={S.eqName}>{e.name}</div>
                {e.brand && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {e.brand}
                  </div>
                )}
                <div style={S.eqMeta}><MapPin size={11} /> {e.location || "-"} · {e.type || "-"}</div>
                <div style={{ ...S.eqDue, color: STATUS_COLOR[st] }}>
                  {e.nextDue ? `กำหนดถัดไป ${fmtDate(e.nextDue)} · ${STATUS_LABEL[st]}` : "ไม่มีกำหนดสอบเทียบ"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: "auto", paddingTop: 6, fontSize: 11.5, fontWeight: 600, color: bk.color }}>
                  <CalendarCheck size={12} /> {bk.text}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <EmptyState text="ไม่พบเครื่องมือที่ตรงกับเงื่อนไข" />}
      </div>

      {editing && (
        <EquipmentForm item={editing} onCancel={() => setEditing(null)} onSave={upsert} />
      )}
      {selectedItem && (
        <EquipmentDetail
          item={selectedItem}
          activities={activities.filter(a => a.equipmentId === selectedItem.id).sort((a, b) => b.date.localeCompare(a.date))}
          bookings={bookings.filter(b => b.equipmentId === selectedItem.id).sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""))}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selectedItem); setSelected(null); }}
          onDelete={() => remove(selectedItem.id)}
          onBook={() => { setBookingFor(selectedItem); setSelected(null); }}
          onSetAvailability={(disabled, reason) => setAvailability(selectedItem.id, disabled, reason)}
          onAddActivity={(act) => {
            setActivities([{ ...act, id: uid(), equipmentId: selectedItem.id }, ...activities]);
            applyCalibrationDates(selectedItem.id, act);
            notify("บันทึกกิจกรรมแล้ว");
          }}
          onEditActivity={(act) => {
            setActivities(activities.map(a => a.id === act.id ? { ...a, ...act } : a));
            applyCalibrationDates(selectedItem.id, act);
            notify("แก้ไขกิจกรรมแล้ว");
          }}
          onDeleteActivity={(actId) => { setActivities(activities.filter(a => a.id !== actId)); notify("ลบกิจกรรมแล้ว"); }}
        />
      )}
      {bookingFor && (
        <BookingForm
          equipment={equipment}
          items={items}
          initialAssetType="equipment"
          initialEquipmentId={bookingFor.id}
          bookings={bookings}
          setBookings={setBookings}
          onCancel={() => setBookingFor(null)}
          onSave={(list) => {
            const now = new Date().toISOString();
            const records = list.map(b => ({ ...b, id: uid(), status: "pending", requestedAt: now }));
            setBookings([...records, ...bookings]);
            notify(records.length > 1 ? `ส่งคำขอจอง/ยืม ${records.length} รายการแล้ว รออนุมัติ` : "ส่งคำขอจอง/ยืมแล้ว รออนุมัติ");
            setBookingFor(null);
          }}
        />
      )}
    </div>
  );
}

// Shared photo field for equipment/item forms — paste an image URL (e.g.
// from the Google Apps Script + Drive uploader) and preview it. Kept as its
// own component (rather than inlining into each form) so both forms stay
// in sync if the image-hosting approach changes later.
function ImageUploadField({ label, value, onChange }) {
  const [imgError, setImgError] = useState(false);
  return (
    <Field label={label} full>
      <input
        style={S.input}
        value={value || ""}
        onChange={(e) => { setImgError(false); onChange(e.target.value); }}
        placeholder="วางลิงก์รูปภาพ เช่น https://..."
      />
      {value && (
        imgError ? (
          <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 6 }}>โหลดรูปภาพจากลิงก์นี้ไม่ได้ กรุณาตรวจสอบลิงก์</div>
        ) : (
          <img
            src={value}
            alt=""
            onError={() => setImgError(true)}
            style={{ width: "100%", maxHeight: 160, objectFit: "contain", background: "#EEF2F6", borderRadius: 8, marginTop: 8, border: "1px solid var(--line)" }}
          />
        )
      )}
    </Field>
  );
}

function EquipmentForm({ item, onCancel, onSave }) {
  const [f, setF] = useState(item);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal onClose={onCancel} title={item.code ? "แก้ไขเครื่องมือ" : "เพิ่มเครื่องมือใหม่"}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="รหัสเครื่องมือ"><input style={S.input} value={f.code} onChange={set("code")} placeholder="เช่น MPIR-006" /></Field>
        <Field label="ชื่อเครื่องมือ"><input style={S.input} value={f.name} onChange={set("name")} placeholder="เช่น เครื่องชั่ง 3 ตำแหน่ง" /></Field>
        <Field label="ยี่ห้อ"><input style={S.input} value={f.brand || ""} onChange={set("brand")} placeholder="เช่น Mitsubishi Electric" /></Field>
        <Field label="รุ่น (Model)"><input style={S.input} value={f.model || ""} onChange={set("model")} placeholder="เช่น SRK24CYV-W1" /></Field>
        <Field label="หมายเลขเครื่อง (Serial No.)"><input style={S.input} value={f.serialNo || ""} onChange={set("serialNo")} /></Field>
        <Field label="ประเภท"><input style={S.input} value={f.type} onChange={set("type")} placeholder="เช่น เครื่องชั่ง" /></Field>
        <Field label="หมวดหมู่เครื่องมือ">
          <select style={S.input} value={f.group || resolveEquipGroup(f)} onChange={set("group")}>
            <option value="analytical">เครื่องมือวิเคราะห์</option>
            <option value="aircon">เครื่องปรับอากาศ</option>
            <option value="support">เครื่องมือสนับสนุน</option>
          </select>
        </Field>
        <Field label="ตำแหน่งที่ตั้ง"><input style={S.input} value={f.location} onChange={set("location")} placeholder="เช่น C1" /></Field>
        <Field label="สถานะ">
          <select style={S.input} value={f.status} onChange={set("status")}>
            <option value="active">ใช้งานอยู่</option>
            <option value="maintenance">ซ่อมบำรุง</option>
            <option value="inactive">ปิดใช้งาน</option>
          </select>
        </Field>
        <Field label="สอบเทียบล่าสุด">
          <input
            type="date"
            style={S.input}
            value={f.lastCalibration}
            onChange={(e) => {
              const lastCalibration = e.target.value;
              setF({ ...f, lastCalibration, nextDue: f.intervalMonths ? addMonths(lastCalibration, f.intervalMonths) || f.nextDue : f.nextDue });
            }}
          />
        </Field>
        <Field label="รอบสอบเทียบ/บำรุงรักษา (เดือน)">
          <input
            type="number"
            style={S.input}
            value={f.intervalMonths || ""}
            onChange={(e) => {
              const intervalMonths = e.target.value;
              setF({ ...f, intervalMonths, nextDue: f.lastCalibration ? addMonths(f.lastCalibration, intervalMonths) || f.nextDue : f.nextDue });
            }}
            placeholder="เช่น 6, 12 หรือ 3 สำหรับล้างแอร์"
          />
        </Field>
        <Field label="กำหนดสอบเทียบถัดไป">
          <input type="date" style={S.input} value={f.nextDue} onChange={set("nextDue")} />
          {f.intervalMonths ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>คำนวณอัตโนมัติจากรอบ {f.intervalMonths} เดือน — แก้ไขเองได้ถ้าต้องการ</div> : null}
        </Field>
        <ImageUploadField
          label="รูปภาพเครื่องมือ"
          value={f.imageUrl}
          onChange={(url) => setF({ ...f, imageUrl: url })}
        />
        <Field label="หมายเหตุ" full><textarea style={{ ...S.input, minHeight: 60 }} value={f.notes} onChange={set("notes")} /></Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave(f)} disabled={!f.code || !f.name} />
    </Modal>
  );
}

function EquipmentImportForm({ onCancel, onImport }) {
  const [text, setText] = useState("");
  const parsed = text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split("|").map(p => p.trim());
    return {
      code: parts[0] || "",
      name: parts[1] || "",
      type: parts[2] || "",
      location: parts[3] || "",
      lastCalibration: parts[4] || "",
      nextDue: parts[5] || "",
      brand: parts[6] || "",
      model: parts[7] || "",
      serialNo: parts[8] || "",
      intervalMonths: parts[9] || "",
    };
  }).filter(r => r.code && r.name);

  return (
    <Modal onClose={onCancel} title="นำเข้ารายการเครื่องมือ" wide>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
        วางรายการ 1 บรรทัดต่อ 1 รายการ รูปแบบ: <b>รหัส | ชื่อเครื่องมือ | ประเภท | ตำแหน่ง | สอบเทียบล่าสุด (YYYY-MM-DD) | กำหนดถัดไป (YYYY-MM-DD) | ยี่ห้อ | รุ่น | หมายเลขเครื่อง (Serial No.) | รอบสอบเทียบ (เดือน)</b> (คั่นด้วย | — ทุกช่องหลังชื่อใส่หรือเว้นว่างก็ได้ สถานะจะตั้งเป็น "ใช้งานอยู่" ให้อัตโนมัติ)
      </div>
      <textarea
        style={{ ...S.input, minHeight: 220, fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"ตัวอย่าง:\nCT-AIR-006 | Air conditioner (25,300 BTU) | Air conditioner | C2 | | | Mitsubishi Electric | SRK24CYV-W1/SRC24CYV-W1 | \nCT-AIR-007 | Air conditioner (34,120 BTU) | Air conditioner | C3 | | | Mitsubishi Electric | MS-GK36VA | "}
      />
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
        ตรวจพบ <b>{parsed.length}</b> รายการที่จะนำเข้า (รายการเดิมจะไม่ถูกลบหรือทับ — รายการใหม่จะถูกเพิ่มเข้าไป)
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onImport(parsed)} disabled={parsed.length === 0} />
    </Modal>
  );
}

function EquipmentDetail({ item, activities, bookings, onClose, onEdit, onDelete, onBook, onSetAvailability, onAddActivity, onEditActivity, onDeleteActivity }) {
  const [showAct, setShowAct] = useState(false);
  const [editingAct, setEditingAct] = useState(null);
  const [activityFilter, setActivityFilter] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteAct, setConfirmDeleteAct] = useState(null);
  const [showDisable, setShowDisable] = useState(false);
  const days = daysUntil(item.nextDue);
  const st = statusOf(days);
  const bk = equipmentBookingSummary(item.id, bookings);
  const typeLabel = { calibration: "สอบเทียบ", repair: "ซ่อม", request: "แจ้งซ่อม", other: "อื่นๆ" };
  const typeCounts = {
    all: activities.length,
    calibration: activities.filter(a => a.type === "calibration").length,
    repair: activities.filter(a => a.type === "repair").length,
    request: activities.filter(a => a.type === "request").length,
    other: activities.filter(a => a.type === "other").length,
  };
  const shownActivities = activityFilter === "all" ? activities : activities.filter(a => a.type === activityFilter);

  const filterTab = (key, label) => (
    <button
      key={key}
      onClick={() => setActivityFilter(key)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: activityFilter === key ? "#E9F1FB" : "transparent",
        border: `1px solid ${activityFilter === key ? "var(--teal)" : "var(--line)"}`,
        color: activityFilter === key ? "var(--teal-dark)" : "var(--muted)",
        borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
      }}
    >
      {label} <span style={{ fontFamily: "var(--font-mono)", opacity: 0.8 }}>({typeCounts[key]})</span>
    </button>
  );

  return (
    <Modal onClose={onClose} title={item.code} wide>
      {item.imageUrl && (
        <div style={{ position: "relative", marginBottom: 14 }}>
          <img src={item.imageUrl} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }}
            style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "#EEF2F6", borderRadius: 10, display: "block" }} />
          <a
            href={item.imageUrl} target="_blank" rel="noopener noreferrer"
            style={{
              position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5,
              background: "rgba(18,37,59,0.75)", color: "#fff", fontSize: 12, fontWeight: 600,
              padding: "6px 10px", borderRadius: 8, textDecoration: "none",
            }}
          >
            <ExternalLink size={13} /> เปิดไฟล์รูปภาพ
          </a>
        </div>
      )}
      <div style={S.detailHead}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={S.detailName}>{item.name}</div>
          {(item.brand || item.model) && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {[item.brand, item.model].filter(Boolean).join(" · ")}
            </div>
          )}
          {item.serialNo && (
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
              S/N: {item.serialNo}
            </div>
          )}
          <div style={S.eqMeta}><MapPin size={12} /> {item.location || "-"} · {item.type || "-"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {item.status === "active" && (
            <button style={S.smallBtn} onClick={onBook}><CalendarCheck size={13} /> จอง/ยืม</button>
          )}
          {item.status === "maintenance" ? (
            <button style={{ ...S.smallBtn, color: "var(--green)", borderColor: "var(--green)" }} onClick={() => onSetAvailability(false, "")}>
              <CheckCircle2 size={13} /> เปิดใช้งานอีกครั้ง
            </button>
          ) : (
            <button style={{ ...S.smallBtn, color: "var(--amber)", borderColor: "var(--amber)" }} onClick={() => setShowDisable(true)}>
              <AlertTriangle size={13} /> ปิดใช้งานชั่วคราว
            </button>
          )}
          <button style={S.iconBtn} onClick={onEdit}><Pencil size={14} /></button>
          <button style={{ ...S.iconBtn, color: "var(--red)" }} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></button>
        </div>
      </div>
      {item.status === "maintenance" && item.unavailableReason && (
        <div style={{ ...S.notesBox, border: "1px solid var(--amber)", background: "#FDF3E3", marginTop: 4, fontSize: 12.5, color: "var(--ink)" }}>
          <strong>ปิดใช้งานชั่วคราว:</strong> {item.unavailableReason}
        </div>
      )}
      {showDisable && (
        <DisableAssetDialog
          asset={item}
          onCancel={() => setShowDisable(false)}
          onConfirm={(reason) => { setShowDisable(false); onSetAvailability(true, reason); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`ต้องการลบเครื่องมือ ${item.code} · ${item.name} ใช่ไหม การลบไม่สามารถกู้คืนได้`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        />
      )}
      <div style={{ display: "flex", gap: 10, margin: "12px 0 6px", flexWrap: "wrap" }}>
        <Tag color={item.status === "active" ? "var(--green)" : item.status === "maintenance" ? "var(--amber)" : "var(--muted)"}>
          {item.status === "active" ? "ใช้งานอยู่" : item.status === "maintenance" ? "ซ่อมบำรุง" : "ปิดใช้งาน"}
        </Tag>
        <Tag color={STATUS_COLOR[st]}>{item.nextDue ? `${STATUS_LABEL[st]} · ${fmtDate(item.nextDue)}` : "ไม่มีกำหนด"}</Tag>
        <Tag color={bk.color}><CalendarCheck size={11} style={{ marginRight: 3, verticalAlign: -1 }} />{bk.text}</Tag>
      </div>
      {item.notes && <div style={S.notesBox}>{item.notes}</div>}

      {bookings.length > 0 && (
        <>
          <div style={{ ...S.panelTitle, marginTop: 18 }}>ประวัติการจอง/ยืม</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
            {bookings.slice(0, 8).map(b => (
              <div key={b.id} style={{ ...S.activityRow, alignItems: "center" }}>
                <div style={S.activityDate}>{fmtDate(b.startDate)}</div>
                <div style={{ flex: 1 }}>
                  <div style={S.activityType}>{BOOKING_TYPE_LABEL[b.type]} · {b.requestedBy || "-"}</div>
                  <div style={S.activityDetail}>{b.purpose || "-"}</div>
                </div>
                <Tag color={BOOKING_STATUS_COLOR[b.status]}>{bookingHistoryStatusLabel(b)}</Tag>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, flexWrap: "wrap", gap: 8 }}>
        <div style={S.panelTitle}>ประวัติกิจกรรม</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={() => setShowAct("external-cal")}>ส่งสอบเทียบภายนอก</button>
          <button style={S.smallBtn} onClick={() => setShowAct(true)}><Plus size={13} /> บันทึกกิจกรรม</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {filterTab("all", "ทั้งหมด")}
        {filterTab("calibration", "สอบเทียบ")}
        {filterTab("repair", "ซ่อม")}
        {filterTab("request", "แจ้งซ่อม")}
        {filterTab("other", "อื่นๆ")}
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {shownActivities.length === 0 && <EmptyState text="ไม่มีประวัติกิจกรรมในหมวดนี้" small />}
        {shownActivities.map(a => (
          <div key={a.id} style={{ ...S.activityRow, alignItems: "center" }}>
            <div style={S.activityDate}>{fmtDate(a.date)}</div>
            <div style={{ flex: 1 }}>
              <div style={S.activityType}>{typeLabel[a.type] || a.type}</div>
              <div style={S.activityDetail}>
                {a.detail}{a.by ? ` · โดย ${a.by}` : ""}
                {a.poNo ? (
                  a.poUrl ? (
                    <> · <a href={a.poUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)", textDecoration: "underline" }}>PO: {a.poNo}</a></>
                  ) : ` · PO: ${a.poNo}`
                ) : (
                  a.poUrl ? <> · <a href={a.poUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal)", textDecoration: "underline" }}>ไฟล์ PO</a></> : ""
                )}
              </div>
              {a.certUrl && (
                <a href={a.certUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--teal)", marginTop: 4 }}>
                  <FileDown size={11} /> ดูใบ Certificate
                </a>
              )}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={S.iconBtnSm} onClick={() => setEditingAct(a)}><Pencil size={12} /></button>
              <button style={{ ...S.iconBtnSm, color: "var(--red)" }} onClick={() => setConfirmDeleteAct(a)}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      {confirmDeleteAct && (
        <ConfirmDialog
          message={`ต้องการลบกิจกรรม "${confirmDeleteAct.detail || confirmDeleteAct.type}" ใช่ไหม การลบไม่สามารถกู้คืนได้`}
          onCancel={() => setConfirmDeleteAct(null)}
          onConfirm={() => { const id = confirmDeleteAct.id; setConfirmDeleteAct(null); onDeleteActivity(id); }}
        />
      )}

      {showAct && (
        <ActivityForm
          initial={showAct === "external-cal" ? { type: "calibration", external: true } : undefined}
          onCancel={() => setShowAct(false)}
          onSave={(act) => { onAddActivity(act); setShowAct(false); }}
        />
      )}
      {editingAct && (
        <ActivityForm
          initial={editingAct}
          onCancel={() => setEditingAct(null)}
          onSave={(act) => { onEditActivity(act); setEditingAct(null); }}
        />
      )}
    </Modal>
  );
}

function ActivityForm({ initial, onCancel, onSave }) {
  const defaults = { date: todayISO(), type: "calibration", detail: "", by: "", poNo: "", poUrl: "", certUrl: "", external: false, externalLocation: "" };
  const [f, setF] = useState({ ...defaults, ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal onClose={onCancel} title={initial ? "แก้ไขกิจกรรม" : "บันทึกกิจกรรม"}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="วันที่"><input type="date" style={S.input} value={f.date} onChange={set("date")} /></Field>
        <Field label="ประเภทกิจกรรม">
          <select style={S.input} value={f.type} onChange={set("type")}>
            <option value="calibration">สอบเทียบ</option>
            <option value="repair">ซ่อม</option>
            <option value="request">แจ้งซ่อม</option>
            <option value="other">อื่นๆ</option>
          </select>
        </Field>
        <Field label="ผู้ดำเนินการ / บริษัท"><input style={S.input} value={f.by} onChange={set("by")} /></Field>
        <Field label="เลขที่ PO"><input style={S.input} value={f.poNo} onChange={set("poNo")} placeholder="เช่น PO-2569-0123" /></Field>
        <Field label="ลิงก์ใบ PO"><input style={S.input} value={f.poUrl} onChange={set("poUrl")} placeholder="วางลิงก์ไฟล์ PO เช่น SharePoint, Google Drive" /></Field>
        {f.type === "calibration" && (
          <Field label="สถานที่สอบเทียบ" full plain>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={f.external} onChange={(e) => setF({ ...f, external: e.target.checked })} style={{ width: 16, height: 16 }} />
              ส่งสอบเทียบภายนอกบริษัท
            </label>
            {f.external && (
              <input
                style={{ ...S.input, marginTop: 8 }}
                value={f.externalLocation}
                onChange={(e) => setF({ ...f, externalLocation: e.target.value })}
                placeholder="ชื่อหน่วยงาน/สถานที่ที่ส่งสอบเทียบ"
              />
            )}
          </Field>
        )}
        <Field label="รายละเอียด" full><textarea style={{ ...S.input, minHeight: 70 }} value={f.detail} onChange={set("detail")} /></Field>
        <Field label="ลิงก์ใบ Certificate" full>
          <input style={S.input} value={f.certUrl} onChange={set("certUrl")} placeholder="วางลิงก์ใบรับรองผลสอบเทียบ เช่น SharePoint, Google Drive" />
        </Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave({ ...f, id: initial?.id })} disabled={!f.detail} />
    </Modal>
  );
}

/* ================= ITEMS (อุปกรณ์ที่ต้องยืม-คืน) ================= */
// Reusable lab items (soil corers, scissors, handheld meters, etc.) that get
// borrowed and returned like equipment, but don't need calibration tracking
// and often exist in more than one unit (totalQty).
function ItemsTab({ items, setItems, bookings, setBookings, equipment, notify }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null); // detail view id
  const [bookingFor, setBookingFor] = useState(null);
  const [disabling, setDisabling] = useState(null);

  const filtered = items
    .filter(i => (i.code + i.name + (i.category || "") + i.location).toLowerCase().includes(q.toLowerCase()))
    .filter(i => statusFilter === "all" || i.status === statusFilter)
    .slice()
    .sort((a, b) => alphaCompare(a.name, b.name));

  function upsert(item) {
    if (items.find(i => i.id === item.id)) {
      setItems(items.map(i => i.id === item.id ? item : i));
      notify("บันทึกการแก้ไขแล้ว");
    } else {
      setItems([item, ...items]);
      notify("เพิ่มอุปกรณ์ใหม่แล้ว");
    }
    setEditing(null);
  }
  function remove(id) {
    setItems(items.filter(i => i.id !== id));
    notify("ลบอุปกรณ์แล้ว");
    if (selected === id) setSelected(null);
  }
  function setAvailability(id, disabled, reason) {
    setItems(items.map(i => i.id === id
      ? (disabled ? { ...i, status: "maintenance", unavailableReason: reason } : { ...i, status: "active", unavailableReason: "" })
      : i
    ));
    notify(disabled ? "ปิดใช้งานชั่วคราวแล้ว" : "เปิดใช้งานอีกครั้งแล้ว");
  }

  const selectedItem = items.find(i => i.id === selected);

  return (
    <div>
      <TabHeader title="อุปกรณ์" sub="อุปกรณ์ที่ต้องยืม-คืน เช่น Soil core, กรรไกร, Brix meter มือถือ — ไม่ต้องสอบเทียบแต่ต้องยืม-คืนผ่านหน้าจอง/ยืม" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อ, ประเภท, ตำแหน่ง..." />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกสถานะ</option>
          <option value="active">ใช้งานอยู่</option>
          <option value="maintenance">ซ่อมบำรุง</option>
          <option value="inactive">ปิดใช้งาน</option>
        </select>
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), code: "", name: "", category: "", location: "", status: "active", totalQty: 1, notes: "", imageUrl: "" })}>
          <Plus size={15} /> เพิ่มอุปกรณ์
        </button>
      </Toolbar>

      <Table
        cols={["ชื่ออุปกรณ์", "ประเภท / ตำแหน่ง", "จำนวน", "สถานะการยืม", ""]}
        onRowClick={(i) => setSelected(filtered[i].id)}
        rows={filtered.map(i => {
          const bk = itemBookingSummary(i.id, bookings, i.totalQty);
          return [
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Thumb src={i.imageUrl} size={34} />
              <div>
                <div style={{ fontWeight: 600 }}>{i.name}</div>
                {i.code && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{i.code}</div>}
                {i.status === "maintenance" && (
                  <Tag color="var(--amber)">ปิดใช้งาน{i.unavailableReason ? `: ${i.unavailableReason}` : ""}</Tag>
                )}
              </div>
            </div>,
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{i.category || "-"} · {i.location || "-"}</div>,
            <span style={{ fontFamily: "var(--font-mono)" }}>{i.totalQty || 1} ชิ้น</span>,
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: bk.color }}>
              <CalendarCheck size={12} /> {bk.text}
            </div>,
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
              {i.status === "active" && (
                <button style={S.smallBtn} onClick={() => setBookingFor(i)}><CalendarCheck size={13} /> จอง/ยืม</button>
              )}
              {i.status === "maintenance" ? (
                <button style={{ ...S.iconBtnSm, color: "var(--green)" }} title="เปิดใช้งานอีกครั้ง" onClick={() => setAvailability(i.id, false, "")}>
                  <CheckCircle2 size={13} />
                </button>
              ) : (
                <button style={{ ...S.iconBtnSm, color: "var(--amber)" }} title="ปิดใช้งานชั่วคราว" onClick={() => setDisabling(i)}>
                  <AlertTriangle size={13} />
                </button>
              )}
              <RowActions onEdit={() => setEditing(i)} onDelete={() => remove(i.id)} />
            </div>,
          ];
        })}
        empty="ยังไม่มีข้อมูลอุปกรณ์"
      />

      {selectedItem && (
        <ItemDetail
          item={selectedItem}
          bookings={bookings.filter(b => b.equipmentId === selectedItem.id && b.assetType === "item").sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""))}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selectedItem); setSelected(null); }}
          onDelete={() => { remove(selectedItem.id); setSelected(null); }}
          onBook={() => { setBookingFor(selectedItem); setSelected(null); }}
          onSetAvailability={(disabled, reason) => setAvailability(selectedItem.id, disabled, reason)}
        />
      )}
      {editing && <ItemForm item={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
      {disabling && (
        <DisableAssetDialog
          asset={disabling}
          onCancel={() => setDisabling(null)}
          onConfirm={(reason) => { setAvailability(disabling.id, true, reason); setDisabling(null); }}
        />
      )}
      {bookingFor && (
        <BookingForm
          equipment={equipment}
          items={items}
          initialAssetType="item"
          initialEquipmentId={bookingFor.id}
          bookings={bookings}
          setBookings={setBookings}
          onCancel={() => setBookingFor(null)}
          onSave={(list) => {
            const now = new Date().toISOString();
            const records = list.map(b => ({ ...b, id: uid(), status: "pending", requestedAt: now }));
            setBookings([...records, ...bookings]);
            notify(records.length > 1 ? `ส่งคำขอจอง/ยืม ${records.length} รายการแล้ว รออนุมัติ` : "ส่งคำขอจอง/ยืมแล้ว รออนุมัติ");
            setBookingFor(null);
          }}
        />
      )}
    </div>
  );
}

// Detail view for a single item — mirrors EquipmentDetail's layout (photo,
// header actions, status tags, notes, recent bookings) but without the
// calibration/activity log, since items don't get calibrated.
function ItemDetail({ item, bookings, onClose, onEdit, onDelete, onBook, onSetAvailability }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const bk = itemBookingSummary(item.id, bookings, item.totalQty);

  return (
    <Modal onClose={onClose} title={item.code || item.name} wide>
      {item.imageUrl && (
        <div style={{ position: "relative", marginBottom: 14 }}>
          <img src={item.imageUrl} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }}
            style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "#EEF2F6", borderRadius: 10, display: "block" }} />
          <a
            href={item.imageUrl} target="_blank" rel="noopener noreferrer"
            style={{
              position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5,
              background: "rgba(18,37,59,0.75)", color: "#fff", fontSize: 12, fontWeight: 600,
              padding: "6px 10px", borderRadius: 8, textDecoration: "none",
            }}
          >
            <ExternalLink size={13} /> เปิดไฟล์รูปภาพ
          </a>
        </div>
      )}
      <div style={S.detailHead}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={S.detailName}>{item.name}</div>
          <div style={S.eqMeta}><MapPin size={12} /> {item.location || "-"} · {item.category || "-"}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
            จำนวนทั้งหมด {item.totalQty || 1} ชิ้น
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {item.status === "active" && (
            <button style={S.smallBtn} onClick={onBook}><CalendarCheck size={13} /> จอง/ยืม</button>
          )}
          {item.status === "maintenance" ? (
            <button style={{ ...S.smallBtn, color: "var(--green)", borderColor: "var(--green)" }} onClick={() => onSetAvailability(false, "")}>
              <CheckCircle2 size={13} /> เปิดใช้งานอีกครั้ง
            </button>
          ) : (
            <button style={{ ...S.smallBtn, color: "var(--amber)", borderColor: "var(--amber)" }} onClick={() => setShowDisable(true)}>
              <AlertTriangle size={13} /> ปิดใช้งานชั่วคราว
            </button>
          )}
          <button style={S.iconBtn} onClick={onEdit}><Pencil size={14} /></button>
          <button style={{ ...S.iconBtn, color: "var(--red)" }} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></button>
        </div>
      </div>
      {item.status === "maintenance" && item.unavailableReason && (
        <div style={{ ...S.notesBox, border: "1px solid var(--amber)", background: "#FDF3E3", marginTop: 4, fontSize: 12.5, color: "var(--ink)" }}>
          <strong>ปิดใช้งานชั่วคราว:</strong> {item.unavailableReason}
        </div>
      )}
      {showDisable && (
        <DisableAssetDialog
          asset={item}
          onCancel={() => setShowDisable(false)}
          onConfirm={(reason) => { setShowDisable(false); onSetAvailability(true, reason); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`ต้องการลบอุปกรณ์ ${item.name} ใช่ไหม การลบไม่สามารถกู้คืนได้`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        />
      )}
      <div style={{ display: "flex", gap: 10, margin: "12px 0 6px", flexWrap: "wrap" }}>
        <Tag color={item.status === "active" ? "var(--green)" : item.status === "maintenance" ? "var(--amber)" : "var(--muted)"}>
          {item.status === "active" ? "ใช้งานอยู่" : item.status === "maintenance" ? "ซ่อมบำรุง" : "ปิดใช้งาน"}
        </Tag>
        <Tag color={bk.color}><CalendarCheck size={11} style={{ marginRight: 3, verticalAlign: -1 }} />{bk.text}</Tag>
      </div>
      {item.notes && <div style={S.notesBox}>{item.notes}</div>}

      {bookings.length > 0 && (
        <>
          <div style={{ ...S.panelTitle, marginTop: 18 }}>ประวัติการจอง/ยืม</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {bookings.slice(0, 8).map(b => (
              <div key={b.id} style={{ ...S.activityRow, alignItems: "center" }}>
                <div style={S.activityDate}>{fmtDate(b.startDate)}</div>
                <div style={{ flex: 1 }}>
                  <div style={S.activityType}>{BOOKING_TYPE_LABEL[b.type]} · {b.requestedBy || "-"}{b.qty > 1 ? ` · ${b.qty} ชิ้น` : ""}</div>
                  <div style={S.activityDetail}>{b.purpose || "-"}</div>
                </div>
                <Tag color={
                  b.status === "approved" ? "var(--green)" : b.status === "pending" ? "var(--amber)" : "var(--muted)"
                }>{BOOKING_STATUS_LABEL[b.status] || b.status}</Tag>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function ItemForm({ item, onCancel, onSave }) {
  const [f, setF] = useState(item);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal onClose={onCancel} title={item.name ? "แก้ไขอุปกรณ์" : "เพิ่มอุปกรณ์ใหม่"}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="ชื่ออุปกรณ์"><input style={S.input} value={f.name} onChange={set("name")} placeholder="เช่น Soil core sampler" /></Field>
        <Field label="รหัส (ถ้ามี)"><input style={S.input} value={f.code || ""} onChange={set("code")} /></Field>
        <Field label="ประเภท"><input style={S.input} value={f.category || ""} onChange={set("category")} placeholder="เช่น เก็บตัวอย่าง, วัดค่า" /></Field>
        <Field label="ตำแหน่งที่เก็บ"><input style={S.input} value={f.location} onChange={set("location")} placeholder="เช่น C1" /></Field>
        <Field label="จำนวนทั้งหมด (ชิ้น)">
          <input
            type="number" min="1" style={S.input}
            value={f.totalQty ?? 1}
            onChange={(e) => {
              // Allow the field to sit empty while the person is mid-edit
              // (e.g. backspacing "1" to type "10") — forcing a fallback to
              // 1 on every keystroke made it impossible to clear/retype,
              // since an empty string would instantly snap back to "1".
              const raw = e.target.value;
              setF({ ...f, totalQty: raw === "" ? "" : Number(raw) });
            }}
            onBlur={() => {
              if (!f.totalQty || Number(f.totalQty) < 1) setF({ ...f, totalQty: 1 });
            }}
          />
        </Field>
        <Field label="สถานะ">
          <select style={S.input} value={f.status} onChange={set("status")}>
            <option value="active">ใช้งานอยู่</option>
            <option value="maintenance">ซ่อมบำรุง</option>
            <option value="inactive">ปิดใช้งาน</option>
          </select>
        </Field>
        <ImageUploadField
          label="รูปภาพอุปกรณ์"
          value={f.imageUrl}
          onChange={(url) => setF({ ...f, imageUrl: url })}
        />
        <Field label="หมายเหตุ" full><textarea style={{ ...S.input, minHeight: 60 }} value={f.notes || ""} onChange={set("notes")} /></Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave(f)} disabled={!f.name} />
    </Modal>
  );
}

/* ================= BOOKINGS (จอง/ยืมเครื่องมือ) ================= */
// NOTE on approval: this app has no real per-request authorization at the
// data layer — "approval" here is trust-based, gated only by which UI a
// logged-in role gets to see (see restrictToBooking below). The name typed
// into "ชื่อผู้ดำเนินการ" is recorded on the booking for an audit trail of
// who approved/rejected/returned what.
function BookingsTab({ bookings, setBookings, equipment, items = [], notify, restrictToBooking = false, currentUsername = "", currentDisplayName = "", embedExtras = false, focusView = null, onFocusHandled }) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [view, setView] = useState("pending"); // "pending" | "current" | "history-equipment" | "history-item" | "calendar" | "catalog"
  const [showForm, setShowForm] = useState(false);
  const [actorName, setActorName] = useState("");

  // One-shot external request (from the global reminder banner) to jump
  // straight to a specific sub-view — e.g. landing directly on "current"
  // instead of the default "pending" when someone taps "ไปที่รายการที่ต้องคืน"
  // from another tab.
  useEffect(() => {
    if (focusView) {
      setView(focusView);
      onFocusHandled?.();
    }
  }, [focusView]);

  // Restricted (booking-only) accounts can see THAT other bookings exist
  // (via the conflict warning inside BookingForm, which always checks the
  // full unfiltered list) but the tables here only ever show their own
  // requests — everyone else's requester names/purposes stay out of view.
  // Matches by login username (requestedByUsername), not the display name
  // shown in requestedBy — falls back to requestedBy for older records
  // saved before this field existed, so nothing "disappears" for existing
  // bookings.
  const ownOnly = restrictToBooking
    ? bookings.filter(b => (b.requestedByUsername || b.requestedBy) === currentUsername)
    : bookings;

  const withMeta = (list) => list.filter(b => {
    const matchQ = (b.equipmentCode + b.equipmentName + (b.requestedBy || "") + (b.purpose || "")).toLowerCase().includes(q.toLowerCase());
    const matchT = typeFilter === "all" || b.type === typeFilter;
    return matchQ && matchT;
  });

  const pending = withMeta(ownOnly.filter(b => b.status === "pending")).sort((a, b) => (a.requestedAt || "").localeCompare(b.requestedAt || ""));
  const current = withMeta(ownOnly.filter(isBookingCurrent)).sort((a, b) => bookingRange(a).start.localeCompare(bookingRange(b).start));
  const historyAll = ownOnly.filter(b => !isBookingCurrent(b) && b.status !== "pending").sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
  const historyEquipment = withMeta(historyAll.filter(b => b.assetType !== "item"));
  const historyItem = withMeta(historyAll.filter(b => b.assetType === "item"));

  // Unfiltered (search/type filters don't apply) personal snapshot for the
  // summary cards + alerts panel — these should always reflect the whole
  // account, not just whatever's currently typed into the search box.
  const ownCurrentAll = ownOnly.filter(isBookingCurrent);
  const ownPendingAllCount = ownOnly.filter(b => b.status === "pending").length;
  const ownOverdueAll = ownCurrentAll.filter(isBookingOverdue);
  const ownNearDueAll = ownCurrentAll.filter(b => isBookingNearDue(b));
  const ownNormalCurrentAll = ownCurrentAll.filter(b => !isBookingOverdue(b));
  const ownDueDates = ownNormalCurrentAll.map(b => b.dueBackDate).filter(Boolean).sort();
  const nearestDueLabel = ownDueDates.length ? fmtDate(ownDueDates[0]) : null;
  const worstOverdueDays = ownOverdueAll.length ? Math.max(...ownOverdueAll.map(b => Math.abs(daysUntil(b.dueBackDate)))) : null;

  // Counts for the two merged read-mostly sub-pages below — these are
  // always company-wide (not ownOnly), since "what's busy right now" and
  // "what's available to borrow" are shared facts, not personal history.
  const liveBookingsCount = bookings.filter(b => b.status === "approved").length;
  const catalogCount = equipment.filter(e => e.status === "active" && e.type !== "เครื่องปรับอากาศ").length
    + items.filter(i => i.status === "active").length;

  const shown = view === "pending" ? pending
    : view === "current" ? current
    : view === "history-equipment" ? historyEquipment
    : historyItem;

  function update(id, patch) {
    setBookings(bookings.map(b => b.id === id ? { ...b, ...patch } : b));
  }
  function approve(b, note, name) {
    update(b.id, { status: "approved", approvedBy: name || actorName || "-", approvedAt: new Date().toISOString(), approvalNote: note || "" });
    notify(`อนุมัติแล้ว ✅ อย่าลืมกดคืนที่แท็บ "ต้องคืน / กำลังใช้งาน" หลังใช้เสร็จ`, 3800);
  }
  function reject(b, note, name) {
    update(b.id, { status: "rejected", approvedBy: name || actorName || "-", approvedAt: new Date().toISOString(), approvalNote: note || "" });
    notify("ปฏิเสธคำขอแล้ว");
  }
  function cancel(b) {
    update(b.id, { status: "cancelled" });
    notify("ยกเลิกรายการแล้ว");
  }
  function deleteHistoryItem(b) {
    setBookings(bookings.filter(x => x.id !== b.id));
    notify("ลบประวัติรายการแล้ว");
  }
  function markReturned(b, qtyReturned, name) {
    const total = b.qty || 1;
    const remaining = total - (qtyReturned || total);
    if (b.assetType === "item" && remaining > 0) {
      // Partial return: reduce the outstanding qty, keep the booking active
      // for what's still out.
      update(b.id, { qty: remaining, returnedBy: name || actorName || currentUsername || "-" });
      notify(`บันทึกคืนอุปกรณ์ ${qtyReturned} ชิ้น (เหลือค้างอีก ${remaining} ชิ้น)`);
    } else {
      update(b.id, { returnedAt: todayISO(), returnedBy: name || actorName || currentUsername || "-" });
      notify(b.assetType === "item" ? "บันทึกคืนอุปกรณ์ครบแล้ว" : "บันทึกใช้งานเสร็จสิ้นแล้ว");
    }
  }

  function create(list) {
    const now = new Date().toISOString();
    const records = list.map(b => ({ ...b, id: uid(), status: "pending", requestedAt: now }));
    setBookings([...records, ...bookings]);
    notify(records.length > 1 ? `ส่งคำขอจอง/ยืม ${records.length} รายการแล้ว รออนุมัติ` : "ส่งคำขอจอง/ยืมแล้ว รออนุมัติ");
    setShowForm(false);
  }

  const bookingCols = ["รายการที่ยืม", "วันที่ขอใช้งาน", "วันที่คืน / เสร็จสิ้น", "ผู้จอง / วัตถุประสงค์", "สถานะ", ""];
  function bookingRow(b) {
    const isReservation = b.type === "reservation";
    // Flag a real scheduling clash directly in the list — pending requests
    // and anything still current — so an approver can see it at a glance
    // without opening each request individually. Uses the same time-aware
    // logic as the booking form itself: same-day equipment claims with
    // explicit times only count as a clash when those times actually
    // overlap.
    const rowConflicts = (b.status === "pending" || isBookingCurrent(b))
      ? findBookingConflicts(bookings, b.equipmentId, bookingRange(b), b.id, { assetType: b.assetType, startTime: b.startTime, endTime: b.endTime })
      : [];
    return [
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, wordBreak: "break-word" }}>{b.equipmentCode || b.equipmentName}</span>
          <Tag color={b.assetType === "item" ? "#7A4FC2" : "var(--teal)"}>{b.assetType === "item" ? "อุปกรณ์" : "เครื่องมือ"}</Tag>
          {b.offSite && <Tag color="var(--amber)">นอกสถานที่</Tag>}
          {rowConflicts.length > 0 && (
            <Tag color="var(--red)">
              <AlertTriangle size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
              ชนกับคำขออื่น{rowConflicts.length > 1 ? ` (${rowConflicts.length})` : ""}
            </Tag>
          )}
        </div>
        {b.equipmentCode && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{b.equipmentName}</div>}
        {b.assetType === "item" && b.qty > 1 && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>จำนวน {b.qty} ชิ้น</div>}
        {b.offSiteLocation && <div style={{ fontSize: 11, color: "var(--amber)" }}>ใช้ที่: {b.offSiteLocation}</div>}
        {rowConflicts.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--red)", marginTop: 3 }}>
            ชนกับ: {rowConflicts.map(c => `${c.requestedBy || "-"}${c.startTime && c.endTime ? ` (${c.startTime}-${c.endTime} น.)` : ""}`).join(", ")}
          </div>
        )}
      </div>,
      <div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{BOOKING_TYPE_LABEL[b.type]}</div>
        <div>{fmtDate(b.startDate)}</div>
        {b.startTime && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>เริ่ม {b.startTime} น.</div>}
      </div>,
      <div>
        {b.returnedAt ? (
          <div style={{ color: "var(--green)" }}>{fmtDate(b.returnedAt)}</div>
        ) : isReservation ? (
          b.endDate && b.endDate !== b.startDate
            ? <div>{fmtDate(b.endDate)}</div>
            : <div style={{ color: "var(--muted)" }}>วันเดียวกัน</div>
        ) : (
          <>
            <div style={{ color: "var(--muted)" }}>ยังไม่คืน</div>
            {b.dueBackDate && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>กำหนดคืน {fmtDate(b.dueBackDate)}</div>}
          </>
        )}
        {b.endTime && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>ถึง {b.endTime} น.</div>}
        {isBookingOverdue(b) && <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 700, marginTop: 2 }}>เลยกำหนดคืน {Math.abs(daysUntil(b.dueBackDate))} วัน</div>}
      </div>,
      <div>
        <div style={{ fontWeight: 600 }}>{b.requestedBy || "-"}</div>
        {b.purpose && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{b.purpose}</div>}
      </div>,
      <div>
        <Tag color={BOOKING_STATUS_COLOR[b.status]}>{bookingHistoryStatusLabel(b)}</Tag>
        {b.status !== "pending" && b.approvedBy && (
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
            {b.status === "rejected" ? "ปฏิเสธโดย" : "อนุมัติโดย"} {b.approvedBy}
          </div>
        )}
        {b.returnedAt && b.returnedBy && (
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>คืนโดย {b.returnedBy}</div>
        )}
        {b.approvalNote && (
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2, fontStyle: "italic", wordBreak: "break-word" }}>
            หมายเหตุ: {b.approvalNote}
          </div>
        )}
      </div>,
      <BookingActions
        booking={b}
        canApprove={!restrictToBooking}
        currentUsername={currentUsername}
        defaultActorName={actorName || currentDisplayName}
        urgent={isBookingOverdue(b)}
        onApprove={(note, name) => approve(b, note, name)}
        onReject={(note, name) => reject(b, note, name)}
        onCancel={() => cancel(b)}
        onReturn={(qty, name) => markReturned(b, qty, name)}
        onDelete={() => deleteHistoryItem(b)}
      />,
    ];
  }

  return (
    <div>
      <TabHeader
        title="จอง/ยืมเครื่องมือ"
        sub={restrictToBooking
          ? "ขอใช้เครื่องมือแบบขอใช้งานทันทีหรือจองล่วงหน้า — แสดงเฉพาะคำขอของคุณ (ระบบยังเช็คให้ว่าชนกับของคนอื่นไหมตอนสร้างคำขอ)"
          : "ขอใช้เครื่องมือแบบขอใช้งานทันทีหรือจองล่วงหน้า — ทุกคำขอต้องผ่านการอนุมัติก่อน"}
      />

      {restrictToBooking && (
        <div style={{ display: "flex", gap: 18, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 480px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>สรุปสถานะของฉัน</div>
            <BookingSummaryCards
              pendingCount={ownPendingAllCount}
              currentCount={ownCurrentAll.length}
              overdueCount={ownOverdueAll.length}
              nearestDueLabel={nearestDueLabel}
              worstOverdueDays={worstOverdueDays}
            />
          </div>
          <BookingAlertsPanel
            overdueItems={ownOverdueAll}
            nearDueItems={ownNearDueAll}
            onSeeAll={() => setView("current")}
            onItemAction={() => setView("current")}
          />
        </div>
      )}

      {embedExtras && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button
            onClick={() => setView("calendar")}
            style={{
              ...S.smallBtn, padding: "8px 14px", fontSize: 13,
              background: view === "calendar" ? "var(--teal)" : "#E9F1FB",
              color: view === "calendar" ? "#fff" : "var(--teal-dark)",
            }}
          >
            <CalendarClock size={14} /> ปฏิทินการใช้งาน {liveBookingsCount > 0 ? `(${liveBookingsCount})` : ""}
          </button>
          <button
            onClick={() => setView("catalog")}
            style={{
              ...S.smallBtn, padding: "8px 14px", fontSize: 13,
              background: view === "catalog" ? "var(--teal)" : "#E9F1FB",
              color: view === "catalog" ? "#fff" : "var(--teal-dark)",
            }}
          >
            <LayoutGrid size={14} /> รายการที่ยืมได้ ({catalogCount})
          </button>
        </div>
      )}

      {!restrictToBooking && (
        <div style={{ ...S.notesBox, marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>ชื่อผู้ดำเนินการ (สำหรับอนุมัติ/ปฏิเสธ/บันทึกคืน):</span>
          <input
            style={{ ...S.input, maxWidth: 220, padding: "6px 10px" }}
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            placeholder="พิมพ์ชื่อของคุณ"
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <ViewTab active={view === "pending"} onClick={() => setView("pending")} label="รออนุมัติ" count={pending.length} />
        <ViewTab active={view === "current"} onClick={() => setView("current")} label="ต้องคืน / กำลังใช้งาน" count={current.length} warnCount={current.filter(isBookingOverdue).length} />
        <ViewTab active={view === "history-equipment"} onClick={() => setView("history-equipment")} label="ประวัติเครื่องมือ" count={historyEquipment.length} />
        <ViewTab active={view === "history-item"} onClick={() => setView("history-item")} label="ประวัติอุปกรณ์" count={historyItem.length} />
      </div>

      {embedExtras && view === "calendar" && (
        <UsageCalendarTab bookings={bookings} equipment={equipment} items={items}
          restrictToBooking={restrictToBooking} currentUsername={currentUsername} />
      )}

      {embedExtras && view === "catalog" && (
        <CatalogTab equipment={equipment} items={items} bookings={bookings} setBookings={setBookings} notify={notify}
          restrictToBooking={restrictToBooking} currentUsername={currentUsername} currentDisplayName={currentDisplayName} />
      )}

      {(!embedExtras || (view !== "calendar" && view !== "catalog")) && (
        <>
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="ค้นหาเครื่องมือ, ผู้จอง, วัตถุประสงค์..." />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={S.select}>
              <option value="all">ทุกประเภท</option>
              <option value="checkout">ขอใช้งาน</option>
              <option value="reservation">จองล่วงหน้า</option>
            </select>
            <button style={S.primaryBtn} onClick={() => setShowForm(true)}>
              <Plus size={15} /> จอง/ยืมเครื่องมือ
            </button>
          </Toolbar>

          {view === "current" ? (
            <GroupedBookingTable
              cols={bookingCols}
              groups={[
                { label: "เกินกำหนดคืน", color: "var(--red)", rows: shown.filter(isBookingOverdue).map(bookingRow) },
                { label: "กำลังใช้งาน / จองอยู่", color: "var(--teal-dark)", rows: shown.filter(b => !isBookingOverdue(b)).map(bookingRow) },
              ]}
              empty="ไม่มีรายการที่ต้องคืนหรือกำลังใช้งานอยู่"
            />
          ) : (
            <Table
              cols={bookingCols}
              rows={shown.map(bookingRow)}
              empty={
                view === "pending" ? (restrictToBooking ? "คุณยังไม่มีคำขอที่รออนุมัติ" : "ไม่มีคำขอรออนุมัติ")
                : view === "history-equipment" ? "ยังไม่มีประวัติเครื่องมือ"
                : "ยังไม่มีประวัติอุปกรณ์"
              }
            />
          )}
        </>
      )}

      {showForm && (
        <BookingForm
          equipment={equipment}
          items={items}
          bookings={bookings}
          setBookings={setBookings}
          fixedRequestedBy={restrictToBooking ? currentUsername : null}
          fixedRequestedByName={restrictToBooking ? currentDisplayName : null}
          onCancel={() => setShowForm(false)}
          onSave={create}
        />
      )}
    </div>
  );
}

function BookingActions({ booking: b, canApprove, currentUsername, defaultActorName = "", urgent = false, onApprove, onReject, onCancel, onReturn, onDelete }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [approvalAction, setApprovalAction] = useState(null); // "approve" | "reject" | null
  if (b.status === "pending") {
    return (
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        {canApprove && (
          <>
            <button style={{ ...S.iconBtnSm, color: "var(--green)" }} title="อนุมัติ" onClick={() => setApprovalAction("approve")}><CheckCircle2 size={14} /></button>
            <button style={{ ...S.iconBtnSm, color: "var(--red)" }} title="ปฏิเสธ" onClick={() => setApprovalAction("reject")}><XCircle size={14} /></button>
          </>
        )}
        <button style={S.iconBtnSm} title="ยกเลิกคำขอ" onClick={() => setConfirmCancel(true)}><Trash2 size={13} /></button>
        {confirmCancel && (
          <ConfirmDialog
            message={`ต้องการยกเลิกคำขอ ${b.equipmentCode || b.equipmentName} ใช่ไหม`}
            confirmLabel="ยกเลิกคำขอ"
            onCancel={() => setConfirmCancel(false)}
            onConfirm={() => { setConfirmCancel(false); onCancel(); }}
          />
        )}
        {approvalAction && (
          <ApprovalDialog
            booking={b}
            action={approvalAction}
            defaultName={defaultActorName}
            onCancel={() => setApprovalAction(null)}
            onConfirm={(note, name) => {
              const action = approvalAction;
              setApprovalAction(null);
              if (action === "approve") onApprove(note, name); else onReject(note, name);
            }}
          />
        )}
      </div>
    );
  }
  // Marking something "finished" — for an equipment checkout that hasn't
  // been returned yet, or a reservation that has already started (its
  // startDate has arrived) and hasn't been marked finished early yet. A
  // reservation that hasn't started is left to the cancel-only branch below.
  const reservationStarted = b.type === "reservation" && b.startDate && b.startDate <= todayISO();
  if (b.status === "approved" && !b.returnedAt && (b.type === "checkout" || reservationStarted)) {
    const isItem = b.assetType === "item";
    // Marking equipment as finished can be done by lab/admin OR by the
    // person who requested it themselves (self-service) — but returning an
    // อุปกรณ์ (item) stays lab/admin-only, since quantity accuracy matters
    // more there (see ReturnQtyDialog) and needs a staff check.
    const isOwnRequest = !isItem && currentUsername && (b.requestedByUsername || b.requestedBy) === currentUsername;
    const canMarkFinished = canApprove || isOwnRequest;
    if (!canMarkFinished) return null;
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        <button style={urgent ? { ...S.smallBtn, background: "#FBE9E4", color: "var(--red)" } : S.smallBtn} onClick={() => setConfirmReturn(true)}>
          <Undo2 size={13} /> {urgent ? "ดำเนินการคืน" : (isItem ? "คืนอุปกรณ์แล้ว" : "ใช้งานเสร็จสิ้นแล้ว")}
        </button>
        {confirmReturn && (
          <ReturnQtyDialog
            booking={b}
            defaultName={defaultActorName}
            onCancel={() => setConfirmReturn(false)}
            onConfirm={(qty, name) => { setConfirmReturn(false); onReturn(qty, name); }}
          />
        )}
      </div>
    );
  }
  if (b.status === "approved" && isBookingCurrent(b)) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        <button style={S.iconBtnSm} title="ยกเลิกการจอง" onClick={() => setConfirmCancel(true)}><Trash2 size={13} /></button>
        {confirmCancel && (
          <ConfirmDialog
            message={`ต้องการยกเลิกการจอง ${b.equipmentCode || b.equipmentName} ใช่ไหม`}
            confirmLabel="ยกเลิกการจอง"
            onCancel={() => setConfirmCancel(false)}
            onConfirm={() => { setConfirmCancel(false); onCancel(); }}
          />
        )}
      </div>
    );
  }
  if (!isBookingCurrent(b) && b.status !== "pending") {
    // History item (rejected/cancelled/returned/finished) — offer a way to
    // clean up old records. This is a real removal, not a status change.
    if (!canApprove) return null;
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        <button style={{ ...S.iconBtnSm, color: "var(--red)" }} title="ลบรายการ" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /></button>
        {confirmDelete && (
          <ConfirmDialog
            message={`ต้องการลบประวัติรายการนี้ (${b.equipmentCode || b.equipmentName}) ใช่ไหม การลบไม่สามารถกู้คืนได้`}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => { setConfirmDelete(false); onDelete(); }}
          />
        )}
      </div>
    );
  }
  return null;
}

// Simple tap-friendly hour/minute picker for optional booking time windows —
// two plain <select> dropdowns instead of the native browser time-of-day
// widget, which uses a fiddly scrolling AM/PM wheel that's slow to use on
// both desktop and mobile. Minutes are in 15-minute steps, which is plenty
// of precision for scheduling shared lab equipment.
function TimeSelect({ value, onChange }) {
  const [h, m] = (value || "").split(":");
  const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const MINUTES = ["00", "15", "30", "45"];
  function setHour(newH) {
    if (!newH) { onChange(""); return; }
    onChange(`${newH}:${m || "00"}`);
  }
  function setMinute(newM) {
    if (!h) return; // picking a minute before an hour doesn't mean anything yet
    onChange(`${h}:${newM}`);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <select style={{ ...S.input, flex: 1 }} value={h || ""} onChange={(e) => setHour(e.target.value)}>
        <option value="">--</option>
        {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span style={{ color: "var(--muted)", fontWeight: 700 }}>:</span>
      <select style={{ ...S.input, flex: 1 }} value={h ? (m || "00") : ""} onChange={(e) => setMinute(e.target.value)} disabled={!h}>
        <option value="">--</option>
        {MINUTES.map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
      {value && (
        <button type="button" onClick={() => onChange("")} title="ล้างเวลา" style={{ ...S.iconBtnSm, flexShrink: 0 }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function BookingForm({ equipment, items = [], bookings, setBookings, initialEquipmentId, initialAssetType, fixedRequestedBy, fixedRequestedByName, onCancel, onSave }) {
  // Air conditioners are fixed-installed, not something anyone checks out —
  // excluded from the equipment picker entirely. Anything under
  // maintenance/disabled (status !== "active") is also excluded — it's not
  // available to book until re-enabled.
  //
  // Memoized: without this, filtering/sorting the full equipment/items
  // lists (and — worse — scanning the *entire* bookings array once per
  // item via itemBookingSummary below) reran on every keystroke in this
  // form (typing a purpose, picking a date, etc.), not just when the
  // underlying data changed. On a lab with a lot of history that shows up
  // as clicks not visibly registering right away — exactly the "clicking
  // one item also selects another" symptom this was mistaken for.
  const activeEquipment = useMemo(() =>
    equipment.filter(e => e.status === "active" && e.type !== "เครื่องปรับอากาศ")
      .slice().sort((a, b) => alphaCompare(a.code, b.code)),
    [equipment]
  );
  const activeItems = useMemo(() =>
    items.filter(i => i.status === "active").slice().sort((a, b) => alphaCompare(a.name, b.name)),
    [items]
  );
  const itemSummaries = useMemo(() => {
    const map = {};
    activeItems.forEach(it => { map[it.id] = itemBookingSummary(it.id, bookings, it.totalQty); });
    return map;
  }, [activeItems, bookings]);

  const isAdmin = !fixedRequestedBy;

  const [mode, setMode] = useState(initialAssetType === "item" ? "item" : "equipment");

  // ---- equipment-mode state ----
  const [equipmentId, setEquipmentId] = useState((initialAssetType !== "item" && initialEquipmentId) || activeEquipment[0]?.id || "");
  const [equipSubType, setEquipSubType] = useState("checkout"); // checkout | reservation
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [dueBackDate, setDueBackDate] = useState(todayISO());
  // Optional clock-time window — for equipment bookings, either checkout or
  // reservation. Lets several people/reservations share the same equipment
  // on the same day without conflicting, as long as their time windows
  // don't overlap; left blank, conflict-checking falls back to the
  // previous whole-day behavior.
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // ---- item-mode state: { [itemId]: qty } for every checked item ----
  // Deliberately starts empty even when opened from a specific item's
  // "จอง/ยืม" button — auto-checking that item used to silently leave it
  // selected if the person then clicked a *different* item to compare,
  // making it look like clicking one item "stuck" another one too.
  const [itemQtys, setItemQtys] = useState({});
  const [itemStartDate, setItemStartDate] = useState(todayISO());
  const [itemDueBackDate, setItemDueBackDate] = useState(todayISO());
  const [itemSearch, setItemSearch] = useState("");
  const filteredItems = useMemo(() =>
    activeItems.filter(it => it.name.toLowerCase().includes(itemSearch.toLowerCase())),
    [activeItems, itemSearch]
  );

  // ---- shared ----
  const [requestedBy, setRequestedBy] = useState(fixedRequestedBy || "");
  const [purpose, setPurpose] = useState("");
  const [offSite, setOffSite] = useState(false);
  const [offSiteLocation, setOffSiteLocation] = useState("");
  const [expanded, setExpanded] = useState({}); // per asset id -> show all conflicts

  const eq = equipment.find(e => e.id === equipmentId);
  const selectedItemIds = Object.keys(itemQtys);

  function toggleItem(id) {
    setItemQtys(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
  }
  function setItemQty(id, qty, max) {
    // Keep whatever the person typed, including "" mid-edit — clamping on
    // every keystroke made it impossible to clear the field and type a new
    // number, since an empty string instantly snapped back to 1.
    if (qty === "") {
      setItemQtys(prev => ({ ...prev, [id]: "" }));
      return;
    }
    const n = Number(qty);
    if (Number.isNaN(n)) return;
    setItemQtys(prev => ({ ...prev, [id]: n }));
  }
  function clampItemQty(id, max) {
    setItemQtys(prev => {
      const q = Math.max(1, Math.min(Number(prev[id]) || 1, max || 99));
      return { ...prev, [id]: q };
    });
  }

  // A checkout's true "occupied until" date is whatever the person entered
  // as กำหนดคืน — defaulting to the same day (todayISO) so a same-day
  // checkout+return doesn't falsely block the rest of the calendar. Only
  // an explicitly-cleared dueBackDate means "no known return date yet",
  // which is the one case where treating it as open-ended actually makes
  // sense.
  const equipRange = equipSubType === "checkout"
    ? { start: startDate || todayISO(), end: dueBackDate || "9999-12-31" }
    : { start: startDate || "", end: endDate || startDate || "" };
  // Everything else with a live claim on this equipment that overlaps the
  // selected date(s), ignoring time-of-day entirely — used to surface an
  // informational "others booked this equipment today too" notice even
  // when the person's own time window doesn't actually clash with anyone.
  const equipSameDayAll = mode === "equipment" && equipmentId
    ? findBookingConflicts(bookings, equipmentId, equipRange, null, {})
    : [];
  // The real, time-aware conflict list — narrows same-day equipment claims
  // down to actual clock-time overlap when both sides have times set.
  const equipConflicts = mode === "equipment" && equipmentId
    ? findBookingConflicts(bookings, equipmentId, equipRange, null, {
        assetType: "equipment", startTime, endTime,
      })
    : [];
  const equipConflictIds = new Set(equipConflicts.map(c => c.id));
  // The difference: same-day claims that were ruled out as a real conflict
  // purely because the clock times don't overlap — still worth showing so
  // the person can see what's already taken and pick around it.
  const equipSameDayOthers = equipSameDayAll.filter(c => !equipConflictIds.has(c.id));

  const itemRange = { start: itemStartDate || todayISO(), end: itemDueBackDate || "9999-12-31" };

  // Computed once per relevant change, then reused for both the per-item
  // conflict boxes below and the "ยังส่งคำขอได้" hint — previously this ran
  // findBookingConflicts (which scans the whole bookings array) twice for
  // the same items on every render.
  const itemConflictsList = mode === "item"
    ? selectedItemIds.map(id => ({
        id,
        item: items.find(i => i.id === id),
        conflicts: findBookingConflicts(bookings, id, itemRange, null),
      }))
    : [];
  const hasAnyConflict = mode === "equipment"
    ? equipConflicts.length > 0
    : itemConflictsList.some(x => x.conflicts.length > 0);

  // Restricted (booking-only) accounts can cancel only their own conflicting
  // requests; admins can manage anyone's. Marking something "returned" is
  // admin/lab-only regardless of whose request it is.
  const canCancelBooking = (c) => !!setBookings && (isAdmin || (c.requestedByUsername || c.requestedBy) === fixedRequestedBy);
  const canReturnBooking = (c) => !!setBookings && (isAdmin || (c.assetType !== "item" && (c.requestedByUsername || c.requestedBy) === fixedRequestedBy));
  const [confirmCancelConflict, setConfirmCancelConflict] = useState(null);
  const [confirmReturnConflict, setConfirmReturnConflict] = useState(null);
  function cancelConflict(c) {
    setBookings(bookings.map(b => b.id === c.id ? { ...b, status: "cancelled" } : b));
  }
  function returnConflict(c, qtyReturned) {
    const total = c.qty || 1;
    const remaining = total - (qtyReturned || total);
    if (c.assetType === "item" && remaining > 0) {
      setBookings(bookings.map(b => b.id === c.id ? { ...b, qty: remaining } : b));
    } else {
      setBookings(bookings.map(b => b.id === c.id ? { ...b, returnedAt: todayISO(), returnedBy: "-" } : b));
    }
  }

  function ConflictBox({ conflicts, assetKey, capacityNote }) {
    if (conflicts.length === 0) return null;
    const showAll = !!expanded[assetKey];
    const shown = showAll ? conflicts : conflicts.slice(0, 5);
    return (
      <div style={{ ...S.notesBox, border: "1px solid var(--amber)", background: "#FDF3E3", marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "var(--amber)", fontSize: 12.5 }}>
          <AlertTriangle size={13} /> ชนกับการจอง/ยืมอื่น ({conflicts.length} รายการ){capacityNote}
        </div>
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--ink)" }}>
              <span>
                {bookingLiveStatusLabel(c)} · {BOOKING_TYPE_LABEL[c.type]} โดย {c.requestedBy || "-"}
                {" "}({fmtDate(bookingRange(c).start)}{bookingRange(c).end !== "9999-12-31" ? ` - ${fmtDate(bookingRange(c).end)}` : " เป็นต้นไป"}{c.startTime && c.endTime ? ` เวลา ${c.startTime}-${c.endTime}` : ""})
              </span>
              <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {c.status === "pending" && canCancelBooking(c) && (
                  <button type="button" onClick={() => setConfirmCancelConflict(c)} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, cursor: "pointer", background: "transparent", color: "var(--red)", border: "1px solid var(--red)" }}>
                    ยกเลิก
                  </button>
                )}
                {c.status === "approved" && c.type === "checkout" && !c.returnedAt && canReturnBooking(c) && (
                  <button type="button" onClick={() => setConfirmReturnConflict(c)} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, cursor: "pointer", background: "transparent", color: "var(--green)", border: "1px solid var(--green)" }}>
                    {c.assetType === "item" ? "คืนอุปกรณ์แล้ว" : "ใช้งานเสร็จแล้ว"}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
        {conflicts.length > 5 && (
          <button
            type="button"
            onClick={() => setExpanded(x => ({ ...x, [assetKey]: !x[assetKey] }))}
            style={{ fontSize: 12, color: "var(--teal-dark)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 8, fontWeight: 600, textDecoration: "underline" }}
          >
            {showAll ? "ย่อกลับ" : `+${conflicts.length - 5} รายการเพิ่มเติม`}
          </button>
        )}
      </div>
    );
  }

  // Time is now a required part of every equipment booking (checkout or
  // reservation) — it's what makes same-day conflict checking meaningful,
  // and lets an approver actually see whether two requests really clash.
  const equipTimeValid = !!(startTime && endTime && endTime > startTime);
  const canSave = requestedBy.trim() && (
    mode === "equipment"
      ? (equipmentId && (equipSubType === "checkout" ? startDate : (startDate && endDate && endDate >= startDate)) && equipTimeValid)
      : (selectedItemIds.length > 0 && itemStartDate)
  );

  // requestedBy is what gets shown everywhere (real name when we have one);
  // requestedByUsername is the stable login identity used for "only show my
  // own bookings" and self-service permission checks — kept separate so
  // renaming/display never breaks that matching.
  const displayRequestedBy = (fixedRequestedByName || requestedBy).trim();
  const requestedByUsername = fixedRequestedBy || null;

  function submit() {
    if (mode === "equipment") {
      if (!eq) return;
      onSave([{
        equipmentId,
        equipmentCode: eq.code || "",
        equipmentName: eq.name,
        assetType: "equipment",
        type: equipSubType,
        startDate,
        endDate: equipSubType === "reservation" ? endDate : null,
        dueBackDate: equipSubType === "checkout" ? dueBackDate : "",
        startTime,
        endTime,
        requestedBy: displayRequestedBy,
        requestedByUsername,
        purpose: purpose.trim(),
        offSite,
        offSiteLocation: offSite ? offSiteLocation.trim() : "",
      }]);
    } else {
      const records = selectedItemIds.map(id => {
        const it = items.find(i => i.id === id);
        return {
          equipmentId: id,
          equipmentCode: it.code || "",
          equipmentName: it.name,
          assetType: "item",
          type: "checkout",
          qty: Number(itemQtys[id]) || 1,
          startDate: itemStartDate,
          endDate: null,
          dueBackDate: itemDueBackDate,
          requestedBy: displayRequestedBy,
          requestedByUsername,
          purpose: purpose.trim(),
          offSite,
          offSiteLocation: offSite ? offSiteLocation.trim() : "",
        };
      });
      onSave(records);
    }
  }

  return (
    <Modal onClose={onCancel} title="จอง/ยืมเครื่องมือ" wide>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="ประเภทคำขอ" full plain>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { key: "item", label: "ขอยืมอุปกรณ์" },
              { key: "equipment", label: "ขอใช้/จองเครื่องมือ" },
            ].map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13.5, fontWeight: 700,
                  background: mode === m.key ? "#E9F1FB" : "var(--bg2, #F7F9FB)",
                  border: `1px solid ${mode === m.key ? "var(--teal)" : "var(--line)"}`,
                  color: mode === m.key ? "var(--teal-dark)" : "var(--muted)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        {mode === "equipment" ? (
          <>
            <Field label="เครื่องมือ" full>
              <select style={S.input} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
                {activeEquipment.length === 0 && <option value="">ไม่มีเครื่องมือที่ยืมได้</option>}
                {activeEquipment.map(e => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
              </select>
            </Field>
            <Field label="ลักษณะการใช้" full plain>
              <div style={{ display: "flex", gap: 8 }}>
                {["checkout", "reservation"].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setEquipSubType(t); if (t === "checkout") setStartDate(todayISO()); }}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      fontSize: 12.5, fontWeight: 600,
                      background: equipSubType === t ? "#F0F5F2" : "var(--bg2, #F7F9FB)",
                      border: `1px solid ${equipSubType === t ? "var(--green)" : "var(--line)"}`,
                      color: equipSubType === t ? "var(--green)" : "var(--muted)",
                    }}
                  >
                    {t === "checkout" ? "ใช้งานทันที" : "จองล่วงหน้า (ระบุช่วงวันที่)"}
                  </button>
                ))}
              </div>
            </Field>

            {equipSubType === "checkout" ? (
              <>
                <Field label="วันที่ใช้งาน">
                  <div style={{ ...S.input, background: "#F0F2F5", color: "var(--muted)", cursor: "not-allowed", display: "flex", alignItems: "center" }}>
                    วันนี้ · {fmtDate(todayISO())}
                  </div>
                </Field>
                <Field label="กำหนดคืน (ถ้ามี)"><input type="date" style={S.input} value={dueBackDate} onChange={(e) => setDueBackDate(e.target.value)} /></Field>
              </>
            ) : (
              <>
                <Field label="วันที่เริ่มจอง"><input type="date" style={S.input} value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} /></Field>
                <Field label="วันที่สิ้นสุด"><input type="date" style={S.input} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
              </>
            )}
            {equipSubType === "checkout" && (
              <div style={{ fontSize: 11, color: "var(--muted)", gridColumn: "1 / -1", marginTop: -6 }}>
                คำขอ "ใช้งานทันที" ใช้ได้เฉพาะวันนี้เท่านั้น ถ้าต้องการใช้วันอื่นให้เลือก "จองล่วงหน้า" แทน
              </div>
            )}
            <Field label="เวลาเริ่ม"><TimeSelect value={startTime} onChange={setStartTime} /></Field>
            <Field label="เวลาสิ้นสุด"><TimeSelect value={endTime} onChange={setEndTime} /></Field>
            {startTime && endTime && endTime <= startTime && (
              <div style={{ fontSize: 11.5, color: "var(--red)", gridColumn: "1 / -1", marginTop: -6 }}>
                เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม
              </div>
            )}
            {!(startTime && endTime) && (
              <div style={{ fontSize: 11.5, color: "var(--muted)", gridColumn: "1 / -1", marginTop: -6 }}>
                กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด — ใช้เช็คว่าชนกับคนอื่นที่ขอใช้/จองเครื่องเดียวกันวันเดียวกันไหม เฉพาะช่วงเวลาที่ทับกันจริงเท่านั้นที่จะถือว่าชนกัน
              </div>
            )}
            {equipSameDayOthers.length > 0 && (
              <div style={{ gridColumn: "1 / -1", ...S.notesBox, border: "1px solid var(--teal)", background: "#EAF4FB", marginTop: -4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "var(--teal-dark)", fontSize: 12.5 }}>
                  <Clock size={13} /> มีคนอื่นจอง/ใช้เครื่องนี้ในวันเดียวกันด้วย ({equipSameDayOthers.length} รายการ)
                </div>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {equipSameDayOthers.map(c => (
                    <div key={c.id} style={{ fontSize: 12, color: "var(--ink)" }}>
                      {BOOKING_TYPE_LABEL[c.type]} โดย {c.requestedBy || "-"}
                      {c.startTime && c.endTime ? ` เวลา ${c.startTime}-${c.endTime} น.` : " (ไม่ได้ระบุช่วงเวลา)"}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                  ไม่ชนกับช่วงเวลาที่คุณเลือกไว้ — แสดงไว้ให้ทราบเผื่ออยากเลี่ยงช่วงเวลาใกล้เคียงกัน
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <Field label="เลือกอุปกรณ์ (เลือกได้หลายรายการ)" full plain>
              {activeItems.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>ยังไม่มีข้อมูลอุปกรณ์</div>}

              {selectedItemIds.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {selectedItemIds.map(id => {
                    const it = activeItems.find(x => x.id === id);
                    if (!it) return null;
                    return (
                      <span
                        key={id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontSize: 11.5, fontWeight: 600, color: "var(--teal-dark)",
                          background: "#E9F1FB", border: "1px solid var(--teal)",
                          borderRadius: 20, padding: "3px 6px 3px 10px",
                        }}
                      >
                        {it.name}{itemQtys[id] && itemQtys[id] !== 1 ? ` ×${itemQtys[id]}` : ""}
                        <button
                          type="button"
                          onClick={() => toggleItem(id)}
                          style={{ display: "flex", background: "none", border: "none", padding: 2, cursor: "pointer", color: "inherit" }}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {activeItems.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <SearchBox value={itemSearch} onChange={setItemSearch} placeholder="ค้นหาชื่ออุปกรณ์..." />
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
                {activeItems.length > 0 && filteredItems.length === 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "8px 0" }}>ไม่พบอุปกรณ์ที่ตรงกับคำค้นหา</div>
                )}
                {filteredItems.map(it => {
                  const checked = it.id in itemQtys;
                  const bk = itemSummaries[it.id];
                  // Cap at what's actually still free right now, not the raw
                  // total — otherwise the form would let people request more
                  // than physically exists once some units are already out.
                  const maxQty = bk.availableNow;
                  const disabled = maxQty <= 0 && !checked;
                  const isSuggested = it.id === initialEquipmentId && !checked;
                  const showQtyBox = maxQty > 1;
                  return (
                    <div key={it.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                      border: `1px solid ${checked ? "var(--teal)" : isSuggested ? "var(--amber)" : "var(--line)"}`,
                      borderRadius: 8, background: checked ? "#E9F1FB" : disabled ? "#F5F5F5" : isSuggested ? "#FDF6E9" : "#fff",
                      opacity: disabled ? 0.6 : 1,
                    }}>
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleItem(it.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }} onClick={() => !disabled && toggleItem(it.id)} role="button">
                        <div style={{ fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer" }}>{it.name}</div>
                        <div style={{ fontSize: 11, color: bk.color }}>{bk.text}</div>
                      </div>
                      {/* Always reserve this slot's space (even when unchecked)
                          instead of mounting/unmounting the number input —
                          conditionally adding it used to change the row's
                          width/height right as you clicked, which could shift
                          rows below it enough for a fast second click to land
                          on the wrong row (usually the first one, since a
                          taller row above pushes everything down). */}
                      <input
                        type="number" min="1" max={maxQty || 1}
                        value={checked ? (itemQtys[it.id] === "" ? "" : Math.min(itemQtys[it.id], maxQty)) : 1}
                        onChange={(e) => setItemQty(it.id, e.target.value, maxQty)}
                        onBlur={() => clampItemQty(it.id, maxQty)}
                        style={{
                          ...S.input, width: 60, padding: "5px 8px", flexShrink: 0,
                          visibility: checked && showQtyBox ? "visible" : "hidden",
                          pointerEvents: checked ? "auto" : "none",
                        }}
                        tabIndex={checked && showQtyBox ? 0 : -1}
                      />
                    </div>
                  );
                })}
              </div>
            </Field>
            <Field label="วันที่เริ่มยืม"><input type="date" style={S.input} value={itemStartDate} onChange={(e) => setItemStartDate(e.target.value)} /></Field>
            <Field label="กำหนดคืน (ถ้ามี)"><input type="date" style={S.input} value={itemDueBackDate} onChange={(e) => setItemDueBackDate(e.target.value)} /></Field>
          </>
        )}

        <Field label="ผู้จอง/ยืม">
          {fixedRequestedBy ? (
            <div style={{ ...S.input, background: "#F5F8F7", color: "var(--muted)", display: "flex", alignItems: "center" }}>{fixedRequestedByName || fixedRequestedBy}</div>
          ) : (
            <input style={S.input} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="ชื่อ-นามสกุล" />
          )}
        </Field>
        <Field label="วัตถุประสงค์/งานที่ใช้" full><textarea style={{ ...S.input, minHeight: 60 }} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>

        <Field label="สถานที่ใช้งาน" full plain>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={offSite} onChange={(e) => setOffSite(e.target.checked)} style={{ width: 16, height: 16 }} />
            ขอใช้นอกสถานที่ (ไม่ได้ใช้งานภายในแล็บ)
          </label>
          {offSite && (
            <input
              style={{ ...S.input, marginTop: 8 }}
              value={offSiteLocation}
              onChange={(e) => setOffSiteLocation(e.target.value)}
              placeholder="ระบุสถานที่ที่จะนำไปใช้ (ถ้ามี)"
            />
          )}
        </Field>
      </div>

      {mode === "equipment" && (
        <ConflictBox conflicts={equipConflicts} assetKey={equipmentId} capacityNote="" />
      )}
      {mode === "item" && itemConflictsList.map(({ id, item: it, conflicts }) => (
        <div key={id}>
          {conflicts.length > 0 && (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink)", marginTop: 10 }}>{it?.name}</div>
          )}
          <ConflictBox
            conflicts={conflicts}
            assetKey={id}
            capacityNote={it?.totalQty > 1 ? ` — มีทั้งหมด ${it.totalQty} ชิ้น` : ""}
          />
        </div>
      ))}
      {hasAnyConflict && (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
          ยังส่งคำขอได้ — ผู้อนุมัติจะเห็นความชนกันนี้ตอนพิจารณาด้วย
        </div>
      )}

      <ModalFooter onCancel={onCancel} onSave={submit} disabled={!canSave} />
      {confirmCancelConflict && (
        <ConfirmDialog
          message={`ต้องการยกเลิกคำขอของ ${confirmCancelConflict.requestedBy || "-"} (${confirmCancelConflict.equipmentCode || confirmCancelConflict.equipmentName}) ใช่ไหม`}
          confirmLabel="ยกเลิกคำขอ"
          onCancel={() => setConfirmCancelConflict(null)}
          onConfirm={() => { cancelConflict(confirmCancelConflict); setConfirmCancelConflict(null); }}
        />
      )}
      {confirmReturnConflict && (
        <ReturnQtyDialog
          booking={confirmReturnConflict}
          onCancel={() => setConfirmReturnConflict(null)}
          onConfirm={(qty) => { returnConflict(confirmReturnConflict, qty); setConfirmReturnConflict(null); }}
        />
      )}
    </Modal>
  );
}

/* ================= CHEMICALS ================= */
function ChemicalsTab({ chemicals, setChemicals, notify }) {
  const [q, setQ] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // "all" | "low" | "out"
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const filtered = chemicals
    .filter(c => (c.name + (c.formula || "") + (c.brand || "") + c.location).toLowerCase().includes(q.toLowerCase()))
    .filter(c => {
      if (stockFilter === "all") return true;
      const low = c.quantity <= c.minThreshold;
      if (stockFilter === "out") return c.quantity <= 0;
      if (stockFilter === "low") return low && c.quantity > 0;
      if (stockFilter === "pendingReturn") return pendingReturnQty(c) > 0;
      return true;
    })
    .slice()
    .sort((a, b) => alphaCompare(a.name, b.name));

  function upsert(item) {
    if (chemicals.find(c => c.id === item.id)) setChemicals(chemicals.map(c => c.id === item.id ? item : c));
    else setChemicals([item, ...chemicals]);
    notify("บันทึกข้อมูลสารเคมีแล้ว");
    setEditing(null);
  }
  function remove(id) { setChemicals(chemicals.filter(c => c.id !== id)); notify("ลบรายการแล้ว"); }

  function importItems(items) {
    const newItems = items.map(it => ({
      id: uid(), name: it.name, unit: it.unit || "", quantity: it.quantity || 0,
      location: it.location || "", expiryDate: it.expiryDate || "", formula: it.formula || "", brand: it.brand || "",
      minThreshold: 0, transactions: [],
    }));
    setChemicals([...newItems, ...chemicals]);
    notify(`นำเข้า ${newItems.length} รายการแล้ว`);
    setShowImport(false);
  }

  function addTransaction(itemId, tx) {
    setChemicals(chemicals.map(c => {
      if (c.id !== itemId) return c;
      const delta = tx.type === "receive" ? tx.qty : -tx.qty;
      return { ...c, quantity: Math.max(0, (c.quantity || 0) + delta), transactions: [{ ...tx, id: uid() }, ...(c.transactions || [])] };
    }));
    notify(tx.type === "receive" ? "บันทึกรับเข้าแล้ว" : "บันทึกเบิกใช้แล้ว");
  }

  function editTransaction(itemId, tx) {
    setChemicals(chemicals.map(c => {
      if (c.id !== itemId) return c;
      const old = (c.transactions || []).find(t => t.id === tx.id);
      if (!old) return c;
      const oldDelta = old.type === "receive" ? old.qty : -old.qty;
      const newDelta = tx.type === "receive" ? tx.qty : -tx.qty;
      return {
        ...c,
        quantity: Math.max(0, (c.quantity || 0) - oldDelta + newDelta),
        transactions: (c.transactions || []).map(t => t.id === tx.id ? { ...tx } : t),
      };
    }));
    notify("แก้ไขรายการแล้ว");
  }

  function deleteTransaction(itemId, txId) {
    setChemicals(chemicals.map(c => {
      if (c.id !== itemId) return c;
      const old = (c.transactions || []).find(t => t.id === txId);
      if (!old) return c;
      const reverseDelta = old.type === "receive" ? -old.qty : old.qty;
      return {
        ...c,
        quantity: Math.max(0, (c.quantity || 0) + reverseDelta),
        transactions: (c.transactions || []).filter(t => t.id !== txId),
      };
    }));
    notify("ลบรายการแล้ว");
  }

  function markReturned(itemId, txId, qty) {
    setChemicals(chemicals.map(c => {
      if (c.id !== itemId) return c;
      const tx = (c.transactions || []).find(t => t.id === txId);
      if (!tx) return c;
      const remaining = txReturnRemaining(tx);
      const amount = Math.max(0, Math.min(Number(qty) || 0, remaining));
      if (amount <= 0) return c;
      const newReturnedQty = txReturnedQty(tx) + amount;
      return {
        ...c,
        quantity: (c.quantity || 0) + amount,
        transactions: (c.transactions || []).map(t => t.id === txId
          ? { ...t, returnedQty: newReturnedQty, returned: newReturnedQty >= (t.qty || 0), returnedDate: todayISO() }
          : t),
      };
    }));
    notify("บันทึกการคืนแล้ว");
  }

  const selectedItem = chemicals.find(c => c.id === selected);

  return (
    <div>
      <TabHeader title="สต็อคสารเคมี" sub="ติดตามปริมาณคงเหลือและวันหมดอายุ · เรียงตามตัวอักษร" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อสาร, ตำแหน่ง..." />
        <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกสถานะคงเหลือ</option>
          <option value="low">ใกล้หมด</option>
          <option value="out">หมดแล้ว</option>
          <option value="pendingReturn">รอคืน</option>
        </select>
        <button style={S.ghostBtn} onClick={() => setShowImport(true)}>
          <FileDown size={14} style={{ transform: "rotate(180deg)", marginRight: 4 }} /> นำเข้ารายการ
        </button>
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), name: "", quantity: 0, unit: "", expiryDate: "", location: "", formula: "", brand: "", minThreshold: 0, transactions: [] })}>
          <Plus size={15} /> เพิ่มสารเคมี
        </button>
      </Toolbar>
      <Table
        cols={["ชื่อสารเคมี", "คงเหลือ", "หมดอายุ", "ตำแหน่ง", ""]}
        onRowClick={(i) => setSelected(filtered[i].id)}
        rows={filtered.map(c => {
          const exp = earliestExpiry(c);
          const days = daysUntil(exp);
          const st = statusOf(days);
          const low = c.quantity <= c.minThreshold;
          const pendingQty = pendingReturnQty(c);
          return [
            <div>
              <RowTitle
                beacon={low ? (c.quantity <= 0 ? "var(--red)" : "var(--amber)") : "transparent"}
                text={c.name}
                badge={pendingQty > 0 ? <span style={S.returnBadge}>รอคืน {pendingQty} {c.unit}</span> : null}
              />
              {(c.formula || c.brand) && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, marginLeft: 15 }}>
                  {[c.formula, c.brand].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>,
            <span>{c.quantity} {c.unit}{low && <span style={S.lowTag}>{c.quantity <= 0 ? "หมด" : "ใกล้หมด"}</span>}</span>,
            <span style={{ color: STATUS_COLOR[st] }}>{exp ? fmtDate(exp) : "-"}</span>,
            c.location || "-",
            <RowActions onEdit={() => setEditing(c)} onDelete={() => remove(c.id)} />,
          ];
        })}
        empty="ยังไม่มีข้อมูลสารเคมี"
      />
      {editing && <ChemicalForm item={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
      {showImport && <ChemicalsImportForm onCancel={() => setShowImport(false)} onImport={importItems} />}
      {selectedItem && (
        <ChemicalDetail
          item={selectedItem}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selectedItem); setSelected(null); }}
          onDelete={() => { remove(selectedItem.id); setSelected(null); }}
          onAddTransaction={(tx) => addTransaction(selectedItem.id, tx)}
          onEditTransaction={(tx) => editTransaction(selectedItem.id, tx)}
          onDeleteTransaction={(txId) => deleteTransaction(selectedItem.id, txId)}
          onMarkReturned={(txId, qty) => markReturned(selectedItem.id, txId, qty)}
        />
      )}
    </div>
  );
}

function ChemicalDetail({ item, onClose, onEdit, onDelete, onAddTransaction, onEditTransaction, onDeleteTransaction, onMarkReturned }) {
  const [showForm, setShowForm] = useState(null); // "receive" | "withdraw" | null
  const [editingTx, setEditingTx] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState(null);
  const [returningTx, setReturningTx] = useState(null);
  const low = item.quantity <= item.minThreshold;
  const exp = earliestExpiry(item);
  const days = daysUntil(exp);
  const st = statusOf(days);
  const txs = item.transactions || [];
  const receiveTxs = txs.filter(t => t.type === "receive");
  const withdrawTxs = txs.filter(t => t.type === "withdraw");
  const shownTxs = historyFilter === "receive" ? receiveTxs : historyFilter === "withdraw" ? withdrawTxs : txs;

  const filterTab = (key, label, count) => (
    <button
      key={key}
      onClick={() => setHistoryFilter(key)}
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        background: historyFilter === key ? "#E9F1FB" : "transparent",
        border: `1px solid ${historyFilter === key ? "var(--teal)" : "var(--line)"}`,
        color: historyFilter === key ? "var(--teal-dark)" : "var(--muted)",
        borderRadius: 8, padding: "7px 8px", fontSize: 12.5, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {label} <span style={{ fontFamily: "var(--font-mono)", opacity: 0.8 }}>({count})</span>
    </button>
  );

  return (
    <Modal onClose={onClose} title={item.name} wide>
      <div style={S.detailHead}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={S.detailName}>{item.name}</div>
            {pendingReturnQty(item) > 0 && (
              <span style={S.returnBadge}>รอคืน {pendingReturnQty(item)} {item.unit}</span>
            )}
          </div>
          {(item.formula || item.brand) && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {[item.formula, item.brand].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={S.eqMeta}><MapPin size={12} /> {item.location || "-"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button style={S.iconBtn} onClick={onEdit}><Pencil size={14} /></button>
          <button style={{ ...S.iconBtn, color: "var(--red)" }} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></button>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          message={`ต้องการลบสารเคมี ${item.name} ใช่ไหม การลบไม่สามารถกู้คืนได้`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        />
      )}
      <div style={{ display: "flex", gap: 10, margin: "12px 0 6px", flexWrap: "wrap" }}>
        <Tag color={low ? (item.quantity <= 0 ? "var(--red)" : "var(--amber)") : "var(--green)"}>
          คงเหลือ {item.quantity} {item.unit} {low ? (item.quantity <= 0 ? "· หมด" : "· ใกล้หมด") : ""}
        </Tag>
        <Tag color={STATUS_COLOR[st]}>{exp ? `${STATUS_LABEL[st]} · ${fmtDate(exp)}` : "ไม่มีวันหมดอายุ"}</Tag>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={{ ...S.primaryBtn, flex: 1, justifyContent: "center" }} onClick={() => setShowForm("receive")}>
          <Plus size={14} /> บันทึกรับเข้า (PO)
        </button>
        <button style={{ ...S.ghostBtn, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setShowForm("withdraw")}>
          <FlaskConical size={14} /> บันทึกเบิกใช้
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={S.panelTitle}>ประวัติรับเข้า / เบิกใช้</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {filterTab("all", "ทั้งหมด", txs.length)}
          {filterTab("receive", "รับเข้า", receiveTxs.length)}
          {filterTab("withdraw", "เบิกใช้", withdrawTxs.length)}
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
          {shownTxs.length === 0 && <EmptyState text="ยังไม่มีรายการในหมวดนี้" small />}
          {shownTxs.map(t => {
            const remaining = t.type === "withdraw" && t.needsReturn ? txReturnRemaining(t) : 0;
            const already = t.type === "withdraw" && t.needsReturn ? txReturnedQty(t) : 0;
            return (
            <div key={t.id} style={{ ...S.activityRow, alignItems: "center" }}>
              <div style={S.activityDate}>{fmtDate(t.date)}</div>
              <div style={{ flex: 1 }}>
                <div style={S.activityType}>
                  <span style={{ color: t.type === "receive" ? "var(--green)" : "var(--red)" }}>
                    {t.type === "receive" ? `รับเข้า +${t.qty} ${item.unit}` : `เบิกใช้ -${t.qty} ${item.unit}`}
                  </span>
                  {t.type === "withdraw" && t.needsReturn && (
                    remaining <= 0
                      ? <span style={{ ...S.returnBadge, background: "var(--muted)" }}>คืนแล้ว{t.returnedDate ? ` · ${fmtDate(t.returnedDate)}` : ""}</span>
                      : <span style={S.returnBadge}>{already > 0 ? `รอคืนอีก ${remaining} ${item.unit}` : "รอคืน"}</span>
                  )}
                </div>
                <div style={S.activityDetail}>
                  {t.type === "receive"
                    ? [t.poNo ? `PO: ${t.poNo}` : null, t.expiryDate ? `หมดอายุ: ${fmtDate(t.expiryDate)}` : null].filter(Boolean).join(" · ")
                    : (t.by ? `ผู้เบิก: ${t.by}` : "")}
                  {t.note ? ` · ${t.note}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {t.type === "withdraw" && t.needsReturn && remaining > 0 && (
                  <button style={S.iconBtnSm} title="บันทึกว่าคืนแล้ว" onClick={() => setReturningTx(t)}><Undo2 size={12} /></button>
                )}
                <button style={S.iconBtnSm} onClick={() => setEditingTx(t)}><Pencil size={12} /></button>
                <button style={{ ...S.iconBtnSm, color: "var(--red)" }} onClick={() => setConfirmDeleteTx(t)}><Trash2 size={12} /></button>
              </div>
            </div>
          );})}
        </div>
      </div>

      {confirmDeleteTx && (
        <ConfirmDialog
          message="ต้องการลบรายการรับเข้า/เบิกใช้นี้ใช่ไหม การลบไม่สามารถกู้คืนได้"
          onCancel={() => setConfirmDeleteTx(null)}
          onConfirm={() => { const id = confirmDeleteTx.id; setConfirmDeleteTx(null); onDeleteTransaction(id); }}
        />
      )}

      {returningTx && (
        <ReturnTxQtyDialog
          tx={returningTx}
          unit={item.unit}
          onCancel={() => setReturningTx(null)}
          onConfirm={(qty) => { onMarkReturned(returningTx.id, qty); setReturningTx(null); }}
        />
      )}

      {showForm && (
        <ChemicalTxForm
          type={showForm}
          item={item}
          onCancel={() => setShowForm(null)}
          onSave={(tx) => { onAddTransaction(tx); setShowForm(null); }}
        />
      )}
      {editingTx && (
        <ChemicalTxForm
          type={editingTx.type}
          item={item}
          initial={editingTx}
          onCancel={() => setEditingTx(null)}
          onSave={(tx) => { onEditTransaction(tx); setEditingTx(null); }}
        />
      )}
    </Modal>
  );
}

function ChemicalTxForm({ type, item, initial, onCancel, onSave }) {
  const isReceive = type === "receive";
  const isEdit = !!initial;
  const [f, setF] = useState(initial
    ? { date: initial.date, qty: String(initial.qty), poNo: initial.poNo || "", expiryDate: initial.expiryDate || "", by: initial.by || "", note: initial.note || "", needsReturn: !!initial.needsReturn }
    : { date: todayISO(), qty: "", poNo: "", expiryDate: "", by: "", note: "", needsReturn: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const qtyNum = Number(f.qty) || 0;
  const baseQty = initial ? item.quantity - (initial.type === "receive" ? initial.qty : -initial.qty) : item.quantity;
  const wouldGoNegative = !isReceive && qtyNum > baseQty;
  return (
    <Modal onClose={onCancel} title={isReceive ? (isEdit ? "แก้ไขรายการรับเข้า (PO)" : "บันทึกรับเข้าสารเคมี (PO)") : (isEdit ? "แก้ไขรายการเบิกใช้" : "บันทึกเบิกใช้สารเคมี")}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="วันที่"><input type="date" style={S.input} value={f.date} onChange={set("date")} /></Field>
        <Field label={isReceive ? "จำนวนที่รับเข้า" : "จำนวนที่เบิกใช้"}>
          <input type="number" style={S.input} value={f.qty} onChange={set("qty")} placeholder={`หน่วย: ${item.unit || "-"}`} />
        </Field>
        {isReceive ? (
          <>
            <Field label="เลขที่ใบสั่งซื้อ (PO)"><input style={S.input} value={f.poNo} onChange={set("poNo")} placeholder="เช่น PO-2569-0123" /></Field>
            <Field label="วันหมดอายุ (ล็อตนี้)"><input type="date" style={S.input} value={f.expiryDate} onChange={set("expiryDate")} /></Field>
          </>
        ) : (
          <Field label="ผู้เบิก / แผนก" full><input style={S.input} value={f.by} onChange={set("by")} placeholder="เช่น สมชาย / ฝ่ายควบคุมคุณภาพ" /></Field>
        )}
        <Field label="หมายเหตุ" full><textarea style={{ ...S.input, minHeight: 50 }} value={f.note} onChange={set("note")} /></Field>
        {!isReceive && (
          <Field label=" " full plain>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={f.needsReturn} onChange={(e) => setF({ ...f, needsReturn: e.target.checked })} style={{ width: 16, height: 16 }} />
              ต้องคืน (เช่น บุคคลภายนอกขอยืมแล้วจะนำมาคืนภายหลัง)
            </label>
          </Field>
        )}
      </div>
      {wouldGoNegative && (
        <div style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>
          จำนวนที่เบิกมากกว่าคงเหลือ ({baseQty} {item.unit}) — ระบบจะปรับคงเหลือเป็น 0
        </div>
      )}
      <ModalFooter
        onCancel={onCancel}
        onSave={() => onSave({ id: initial?.id, type, date: f.date, qty: qtyNum, poNo: f.poNo, expiryDate: f.expiryDate, by: f.by, note: f.note, needsReturn: !isReceive && f.needsReturn, returned: isEdit ? !!initial.returned : false })}
        disabled={!f.date || qtyNum <= 0}
      />
    </Modal>
  );
}

function ChemicalForm({ item, onCancel, onSave }) {
  const [f, setF] = useState(item);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  return (
    <Modal onClose={onCancel} title={item.name ? "แก้ไขสารเคมี" : "เพิ่มสารเคมี"}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="ชื่อสารเคมี" full><input style={S.input} value={f.name} onChange={set("name")} /></Field>
        <Field label="สูตรเคมี"><input style={S.input} value={f.formula || ""} onChange={set("formula")} placeholder="เช่น NaOH" /></Field>
        <Field label="ยี่ห้อ"><input style={S.input} value={f.brand || ""} onChange={set("brand")} placeholder="เช่น Merck, Sigma-Aldrich" /></Field>
        <Field label="ตำแหน่งจัดเก็บ"><input style={S.input} value={f.location} onChange={set("location")} /></Field>
        <Field label="ปริมาณคงเหลือ"><input type="number" style={S.input} value={f.quantity} onChange={set("quantity", true)} /></Field>
        <Field label="หน่วย"><input style={S.input} value={f.unit} onChange={set("unit")} placeholder="เช่น ขวด, kg, L" /></Field>
        <Field label="ขั้นต่ำที่ควรมี"><input type="number" style={S.input} value={f.minThreshold} onChange={set("minThreshold", true)} /></Field>
        <Field label="วันหมดอายุ (เริ่มต้น)"><input type="date" style={S.input} value={f.expiryDate} onChange={set("expiryDate")} /></Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave(f)} disabled={!f.name} />
    </Modal>
  );
}

function ChemicalsImportForm({ onCancel, onImport }) {
  const [text, setText] = useState("");
  const parsed = text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split("|").map(p => p.trim());
    return {
      name: parts[0] || "",
      unit: parts[1] || "",
      quantity: Number(parts[2]) || 0,
      location: parts[3] || "",
      expiryDate: parts[4] || "",
      formula: parts[5] || "",
      brand: parts[6] || "",
    };
  }).filter(r => r.name);

  return (
    <Modal onClose={onCancel} title="นำเข้ารายการสารเคมี" wide>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
        วางรายการ 1 บรรทัดต่อ 1 รายการ รูปแบบ: <b>ชื่อสารเคมี | หน่วย | จำนวน | ตำแหน่ง | วันหมดอายุ (YYYY-MM-DD) | สูตรเคมี | ยี่ห้อ</b> (คั่นด้วย | — ทุกช่องหลังชื่อใส่หรือเว้นว่างก็ได้)
      </div>
      <textarea
        style={{ ...S.input, minHeight: 220, fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"ตัวอย่าง:\nAcetonitrile HPLC grade | ขวด (2.5 L) | 4 | ตู้เก็บสารไวไฟ | 2026-09-10 | CH3CN | Merck\nSodium Hydroxide | kg | 1 | ชั้นสารเคมีทั่วไป | 2026-08-25 | NaOH | Sigma-Aldrich"}
      />
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
        ตรวจพบ <b>{parsed.length}</b> รายการที่จะนำเข้า (รายการเดิมจะไม่ถูกลบหรือทับ — รายการใหม่จะถูกเพิ่มเข้าไป)
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onImport(parsed)} disabled={parsed.length === 0} />
    </Modal>
  );
}

/* ================= CONSUMABLES ================= */
function ConsumablesTab({ consumables, setConsumables, notify }) {
  const [q, setQ] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // "all" | "low" | "out"
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const filtered = consumables
    .filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
    .filter(s => {
      if (stockFilter === "all") return true;
      const low = s.quantity <= s.minThreshold;
      if (stockFilter === "out") return s.quantity <= 0;
      if (stockFilter === "low") return low && s.quantity > 0;
      if (stockFilter === "pendingReturn") return pendingReturnQty(s) > 0;
      return true;
    })
    .slice()
    .sort((a, b) => alphaCompare(a.name, b.name));

  function upsert(item) {
    if (consumables.find(s => s.id === item.id)) setConsumables(consumables.map(s => s.id === item.id ? item : s));
    else setConsumables([item, ...consumables]);
    notify("บันทึกข้อมูลพัสดุแล้ว");
    setEditing(null);
  }
  function remove(id) { setConsumables(consumables.filter(s => s.id !== id)); notify("ลบรายการแล้ว"); }

  function importItems(items) {
    const newItems = items.map(it => ({ id: uid(), name: it.name, unit: it.unit || "", quantity: it.quantity || 0, minThreshold: 0, transactions: [] }));
    setConsumables([...newItems, ...consumables]);
    notify(`นำเข้า ${newItems.length} รายการแล้ว`);
    setShowImport(false);
  }

  function addTransaction(itemId, tx) {
    setConsumables(consumables.map(s => {
      if (s.id !== itemId) return s;
      const delta = tx.type === "receive" ? tx.qty : -tx.qty;
      return { ...s, quantity: Math.max(0, (s.quantity || 0) + delta), transactions: [{ ...tx, id: uid() }, ...(s.transactions || [])] };
    }));
    notify(tx.type === "receive" ? "บันทึกรับเข้าแล้ว" : "บันทึกเบิกใช้แล้ว");
  }

  function editTransaction(itemId, tx) {
    setConsumables(consumables.map(s => {
      if (s.id !== itemId) return s;
      const old = (s.transactions || []).find(t => t.id === tx.id);
      if (!old) return s;
      const oldDelta = old.type === "receive" ? old.qty : -old.qty;
      const newDelta = tx.type === "receive" ? tx.qty : -tx.qty;
      return {
        ...s,
        quantity: Math.max(0, (s.quantity || 0) - oldDelta + newDelta),
        transactions: (s.transactions || []).map(t => t.id === tx.id ? { ...tx } : t),
      };
    }));
    notify("แก้ไขรายการแล้ว");
  }

  function deleteTransaction(itemId, txId) {
    setConsumables(consumables.map(s => {
      if (s.id !== itemId) return s;
      const old = (s.transactions || []).find(t => t.id === txId);
      if (!old) return s;
      const reverseDelta = old.type === "receive" ? -old.qty : old.qty;
      return {
        ...s,
        quantity: Math.max(0, (s.quantity || 0) + reverseDelta),
        transactions: (s.transactions || []).filter(t => t.id !== txId),
      };
    }));
    notify("ลบรายการแล้ว");
  }

  function markReturned(itemId, txId, qty) {
    setConsumables(consumables.map(s => {
      if (s.id !== itemId) return s;
      const tx = (s.transactions || []).find(t => t.id === txId);
      if (!tx) return s;
      const remaining = txReturnRemaining(tx);
      const amount = Math.max(0, Math.min(Number(qty) || 0, remaining));
      if (amount <= 0) return s;
      const newReturnedQty = txReturnedQty(tx) + amount;
      return {
        ...s,
        quantity: (s.quantity || 0) + amount,
        transactions: (s.transactions || []).map(t => t.id === txId
          ? { ...t, returnedQty: newReturnedQty, returned: newReturnedQty >= (t.qty || 0), returnedDate: todayISO() }
          : t),
      };
    }));
    notify("บันทึกการคืนแล้ว");
  }

  const selectedItem = consumables.find(s => s.id === selected);

  return (
    <div>
      <TabHeader title="พัสดุสิ้นเปลือง" sub="ติดตามปริมาณคงเหลือของวัสดุใช้แล้วหมดไป" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อพัสดุ..." />
        <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกสถานะคงเหลือ</option>
          <option value="low">ใกล้หมด</option>
          <option value="out">หมดแล้ว</option>
          <option value="pendingReturn">รอคืน</option>
        </select>
        <button style={S.ghostBtn} onClick={() => setShowImport(true)}>
          <FileDown size={14} style={{ transform: "rotate(180deg)", marginRight: 4 }} /> นำเข้ารายการ
        </button>
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), name: "", quantity: 0, unit: "", minThreshold: 0, transactions: [] })}>
          <Plus size={15} /> เพิ่มพัสดุ
        </button>
      </Toolbar>
      <Table
        cols={["ชื่อพัสดุ", "คงเหลือ", ""]}
        onRowClick={(i) => setSelected(filtered[i].id)}
        rows={filtered.map(s => {
          const low = s.quantity <= s.minThreshold;
          const pendingQty = pendingReturnQty(s);
          return [
            <div>
              <RowTitle
                beacon={low ? (s.quantity <= 0 ? "var(--red)" : "var(--amber)") : "transparent"}
                text={s.name}
                badge={pendingQty > 0 ? <span style={S.returnBadge}>รอคืน {pendingQty} {s.unit}</span> : null}
              />
            </div>,
            <span>{s.quantity} {s.unit}{low && <span style={S.lowTag}>{s.quantity <= 0 ? "หมด" : "ใกล้หมด"}</span>}</span>,
            <RowActions onEdit={() => setEditing(s)} onDelete={() => remove(s.id)} />,
          ];
        })}
        empty="ยังไม่มีข้อมูลพัสดุสิ้นเปลือง"
      />
      {editing && <ConsumableForm item={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
      {showImport && <ConsumablesImportForm onCancel={() => setShowImport(false)} onImport={importItems} />}
      {selectedItem && (
        <ConsumableDetail
          item={selectedItem}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selectedItem); setSelected(null); }}
          onDelete={() => { remove(selectedItem.id); setSelected(null); }}
          onAddTransaction={(tx) => addTransaction(selectedItem.id, tx)}
          onEditTransaction={(tx) => editTransaction(selectedItem.id, tx)}
          onDeleteTransaction={(txId) => deleteTransaction(selectedItem.id, txId)}
          onMarkReturned={(txId, qty) => markReturned(selectedItem.id, txId, qty)}
        />
      )}
    </div>
  );
}

function ConsumablesImportForm({ onCancel, onImport }) {
  const [text, setText] = useState("");
  const parsed = text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split("|").map(p => p.trim());
    return { name: parts[0] || "", unit: parts[1] || "", quantity: Number(parts[2]) || 0 };
  }).filter(r => r.name);

  return (
    <Modal onClose={onCancel} title="นำเข้ารายการพัสดุ" wide>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
        วางรายการ 1 บรรทัดต่อ 1 รายการ รูปแบบ: <b>ชื่อพัสดุ | หน่วย | จำนวน</b> (คั่นด้วยเครื่องหมาย | )
      </div>
      <textarea
        style={{ ...S.input, minHeight: 220, fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"ตัวอย่าง:\nกระดาษกรอง No.1 (150 mm) | กล่อง | 49\nถุงมือแพทย์ Size L | กล่อง | 23"}
      />
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
        ตรวจพบ <b>{parsed.length}</b> รายการที่จะนำเข้า (รายการเดิมจะไม่ถูกลบหรือทับ — รายการใหม่จะถูกเพิ่มเข้าไป)
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onImport(parsed)} disabled={parsed.length === 0} />
    </Modal>
  );
}

function ConsumableDetail({ item, onClose, onEdit, onDelete, onAddTransaction, onEditTransaction, onDeleteTransaction, onMarkReturned }) {
  const [showForm, setShowForm] = useState(null); // "receive" | "withdraw" | null
  const [editingTx, setEditingTx] = useState(null); // transaction being edited, or null
  const [historyFilter, setHistoryFilter] = useState("all"); // "all" | "receive" | "withdraw"
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState(null);
  const [returningTx, setReturningTx] = useState(null);
  const low = item.quantity <= item.minThreshold;
  const txs = item.transactions || [];
  const receiveTxs = txs.filter(t => t.type === "receive");
  const withdrawTxs = txs.filter(t => t.type === "withdraw");
  const shownTxs = historyFilter === "receive" ? receiveTxs : historyFilter === "withdraw" ? withdrawTxs : txs;

  const filterTab = (key, label, count) => (
    <button
      key={key}
      onClick={() => setHistoryFilter(key)}
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        background: historyFilter === key ? "#E9F1FB" : "transparent",
        border: `1px solid ${historyFilter === key ? "var(--teal)" : "var(--line)"}`,
        color: historyFilter === key ? "var(--teal-dark)" : "var(--muted)",
        borderRadius: 8, padding: "7px 8px", fontSize: 12.5, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {label} <span style={{ fontFamily: "var(--font-mono)", opacity: 0.8 }}>({count})</span>
    </button>
  );

  return (
    <Modal onClose={onClose} title={item.name} wide>
      <div style={S.detailHead}>
        <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={S.detailName}>{item.name}</div>
          {pendingReturnQty(item) > 0 && (
            <span style={S.returnBadge}>รอคืน {pendingReturnQty(item)} {item.unit}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button style={S.iconBtn} onClick={onEdit}><Pencil size={14} /></button>
          <button style={{ ...S.iconBtn, color: "var(--red)" }} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></button>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          message={`ต้องการลบพัสดุ ${item.name} ใช่ไหม การลบไม่สามารถกู้คืนได้`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        />
      )}
      <div style={{ display: "flex", gap: 10, margin: "12px 0 6px", flexWrap: "wrap" }}>
        <Tag color={low ? (item.quantity <= 0 ? "var(--red)" : "var(--amber)") : "var(--green)"}>
          คงเหลือ {item.quantity} {item.unit} {low ? (item.quantity <= 0 ? "· หมด" : "· ใกล้หมด") : ""}
        </Tag>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={{ ...S.primaryBtn, flex: 1, justifyContent: "center" }} onClick={() => setShowForm("receive")}>
          <Plus size={14} /> บันทึกรับเข้า (PO)
        </button>
        <button style={{ ...S.ghostBtn, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setShowForm("withdraw")}>
          <Package size={14} /> บันทึกเบิกใช้
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={S.panelTitle}>ประวัติรับเข้า / เบิกใช้</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {filterTab("all", "ทั้งหมด", txs.length)}
          {filterTab("receive", "รับเข้า", receiveTxs.length)}
          {filterTab("withdraw", "เบิกใช้", withdrawTxs.length)}
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
          {shownTxs.length === 0 && <EmptyState text="ยังไม่มีรายการในหมวดนี้" small />}
          {shownTxs.map(t => {
            const remaining = t.type === "withdraw" && t.needsReturn ? txReturnRemaining(t) : 0;
            const already = t.type === "withdraw" && t.needsReturn ? txReturnedQty(t) : 0;
            return (
            <div key={t.id} style={{ ...S.activityRow, alignItems: "center" }}>
              <div style={S.activityDate}>{fmtDate(t.date)}</div>
              <div style={{ flex: 1 }}>
                <div style={S.activityType}>
                  <span style={{ color: t.type === "receive" ? "var(--green)" : "var(--red)" }}>
                    {t.type === "receive" ? `รับเข้า +${t.qty} ${item.unit}` : `เบิกใช้ -${t.qty} ${item.unit}`}
                  </span>
                  {t.type === "withdraw" && t.needsReturn && (
                    remaining <= 0
                      ? <span style={{ ...S.returnBadge, background: "var(--muted)" }}>คืนแล้ว{t.returnedDate ? ` · ${fmtDate(t.returnedDate)}` : ""}</span>
                      : <span style={S.returnBadge}>{already > 0 ? `รอคืนอีก ${remaining} ${item.unit}` : "รอคืน"}</span>
                  )}
                </div>
                <div style={S.activityDetail}>
                  {t.type === "receive" && t.poNo ? `PO: ${t.poNo}` : t.type === "withdraw" && t.by ? `ผู้เบิก: ${t.by}` : ""}
                  {t.note ? ` · ${t.note}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {t.type === "withdraw" && t.needsReturn && remaining > 0 && (
                  <button style={S.iconBtnSm} title="บันทึกว่าคืนแล้ว" onClick={() => setReturningTx(t)}><Undo2 size={12} /></button>
                )}
                <button style={S.iconBtnSm} onClick={() => setEditingTx(t)}><Pencil size={12} /></button>
                <button style={{ ...S.iconBtnSm, color: "var(--red)" }} onClick={() => setConfirmDeleteTx(t)}><Trash2 size={12} /></button>
              </div>
            </div>
          );})}
        </div>
      </div>

      {confirmDeleteTx && (
        <ConfirmDialog
          message="ต้องการลบรายการรับเข้า/เบิกใช้นี้ใช่ไหม การลบไม่สามารถกู้คืนได้"
          onCancel={() => setConfirmDeleteTx(null)}
          onConfirm={() => { const id = confirmDeleteTx.id; setConfirmDeleteTx(null); onDeleteTransaction(id); }}
        />
      )}

      {returningTx && (
        <ReturnTxQtyDialog
          tx={returningTx}
          unit={item.unit}
          onCancel={() => setReturningTx(null)}
          onConfirm={(qty) => { onMarkReturned(returningTx.id, qty); setReturningTx(null); }}
        />
      )}

      {showForm && (
        <ConsumableTxForm
          type={showForm}
          item={item}
          onCancel={() => setShowForm(null)}
          onSave={(tx) => { onAddTransaction(tx); setShowForm(null); }}
        />
      )}
      {editingTx && (
        <ConsumableTxForm
          type={editingTx.type}
          item={item}
          initial={editingTx}
          onCancel={() => setEditingTx(null)}
          onSave={(tx) => { onEditTransaction(tx); setEditingTx(null); }}
        />
      )}
    </Modal>
  );
}

function ConsumableTxForm({ type, item, initial, onCancel, onSave }) {
  const isReceive = type === "receive";
  const isEdit = !!initial;
  const [f, setF] = useState(initial
    ? { date: initial.date, qty: String(initial.qty), poNo: initial.poNo || "", by: initial.by || "", note: initial.note || "", needsReturn: !!initial.needsReturn }
    : { date: todayISO(), qty: "", poNo: "", by: "", note: "", needsReturn: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const qtyNum = Number(f.qty) || 0;
  // When editing, check against the item's quantity as if this transaction's old effect were reversed first.
  const baseQty = initial ? item.quantity - (initial.type === "receive" ? initial.qty : -initial.qty) : item.quantity;
  const wouldGoNegative = !isReceive && qtyNum > baseQty;
  return (
    <Modal onClose={onCancel} title={isReceive ? (isEdit ? "แก้ไขรายการรับเข้า (PO)" : "บันทึกรับเข้าพัสดุ (PO)") : (isEdit ? "แก้ไขรายการเบิกใช้" : "บันทึกเบิกใช้พัสดุ")}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="วันที่"><input type="date" style={S.input} value={f.date} onChange={set("date")} /></Field>
        <Field label={isReceive ? "จำนวนที่รับเข้า" : "จำนวนที่เบิกใช้"}>
          <input type="number" style={S.input} value={f.qty} onChange={set("qty")} placeholder={`หน่วย: ${item.unit || "-"}`} />
        </Field>
        {isReceive ? (
          <Field label="เลขที่ใบสั่งซื้อ (PO)" full><input style={S.input} value={f.poNo} onChange={set("poNo")} placeholder="เช่น PO-2569-0123" /></Field>
        ) : (
          <Field label="ผู้เบิก / แผนก" full><input style={S.input} value={f.by} onChange={set("by")} placeholder="เช่น สมชาย / ฝ่ายควบคุมคุณภาพ" /></Field>
        )}
        <Field label="หมายเหตุ" full><textarea style={{ ...S.input, minHeight: 50 }} value={f.note} onChange={set("note")} /></Field>
        {!isReceive && (
          <Field label=" " full plain>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={f.needsReturn} onChange={(e) => setF({ ...f, needsReturn: e.target.checked })} style={{ width: 16, height: 16 }} />
              ต้องคืน (เช่น บุคคลภายนอกขอยืมแล้วจะนำมาคืนภายหลัง)
            </label>
          </Field>
        )}
      </div>
      {wouldGoNegative && (
        <div style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>
          จำนวนที่เบิกมากกว่าคงเหลือ ({baseQty} {item.unit}) — ระบบจะปรับคงเหลือเป็น 0
        </div>
      )}
      <ModalFooter
        onCancel={onCancel}
        onSave={() => onSave({ id: initial?.id, type, date: f.date, qty: qtyNum, poNo: f.poNo, by: f.by, note: f.note, needsReturn: !isReceive && f.needsReturn, returned: isEdit ? !!initial.returned : false })}
        disabled={!f.date || qtyNum <= 0}
      />
    </Modal>
  );
}

function ConsumableForm({ item, onCancel, onSave }) {
  const [f, setF] = useState(item);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  return (
    <Modal onClose={onCancel} title={item.name ? "แก้ไขพัสดุ" : "เพิ่มพัสดุ"}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="ชื่อพัสดุ" full><input style={S.input} value={f.name} onChange={set("name")} /></Field>
        <Field label="หน่วย"><input style={S.input} value={f.unit} onChange={set("unit")} placeholder="เช่น กล่อง, ห่อ, ชิ้น" /></Field>
        <Field label="ปริมาณคงเหลือ"><input type="number" style={S.input} value={f.quantity} onChange={set("quantity", true)} /></Field>
        <Field label="ขั้นต่ำที่ควรมี"><input type="number" style={S.input} value={f.minThreshold} onChange={set("minThreshold", true)} /></Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave(f)} disabled={!f.name} />
    </Modal>
  );
}

/* ================= PURCHASE REQUESTS (PR) ================= */
// Normalizes a PR's items into a stable array with ids — older PRs only had
// a raw multi-line itemName string, so those are split into items on first
// use (and persisted back to storage the first time one is toggled).
function getPRItems(r) {
  if (r.items && r.items.length) return r.items;
  return (r.itemName || "").split("\n").map(s => s.trim()).filter(Boolean)
    .map(text => ({ id: uid(), text, received: false, receivedDate: null }));
}
// When the free-text item list is edited/saved from the form, keep the
// received state of any line whose text is unchanged; new or edited
// lines start fresh as not-yet-received.
function reconcilePRItems(oldItems, newText) {
  const lines = (newText || "").split("\n").map(s => s.trim()).filter(Boolean);
  const oldByText = {};
  (oldItems || []).forEach(it => { oldByText[it.text] = it; });
  return lines.map(text => oldByText[text] || { id: uid(), text, received: false, receivedDate: null });
}
function isPRFullyReceived(r) {
  const items = getPRItems(r);
  return items.length > 0 && items.every(it => it.received);
}
// A PR can now have more than one PO — older records only ever had a single
// poNo string, so this normalizes both shapes into a consistent array of
// { poNo, fileUrl }. Checking `!== undefined` (not just truthy/length) matters
// here: once a record has been through the new form, r.pos is a real array
// even if the person removed every PO — falling back to the old poNo string
// in that case would wrongly resurrect a PO the person just deleted.
function getPRPos(r) {
  if (r.pos !== undefined) return r.pos;
  if (r.poNo) return [{ id: uid(), poNo: r.poNo, fileUrl: r.poFileUrl || "" }];
  return [];
}

function PurchaseRequestsTab({ requests, setRequests, notify }) {
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [view, setView] = useState("active"); // "active" | "history"
  const [editing, setEditing] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const activeCount = requests.filter(r => !isPRFullyReceived(r)).length;
  const historyCount = requests.filter(r => isPRFullyReceived(r)).length;

  const filtered = requests
    .filter(r => (r.prNo + getPRItems(r).map(i => i.text).join(" ") + r.requestedBy + getPRPos(r).map(p => p.poNo).join(" ")).toLowerCase().includes(q.toLowerCase()))
    .filter(r => categoryFilter === "all" || (r.categories || []).includes(categoryFilter))
    .filter(r => view === "history" ? isPRFullyReceived(r) : !isPRFullyReceived(r))
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")); // most recent PR first

  function upsert(item) {
    const items = reconcilePRItems(requests.find(r => r.id === item.id)?.items, item.itemName);
    const record = { ...item, items };
    if (requests.find(r => r.id === item.id)) setRequests(requests.map(r => r.id === item.id ? record : r));
    else setRequests([record, ...requests]);
    notify("บันทึกใบขอซื้อแล้ว");
    setEditing(null);
  }
  function remove(id) { setRequests(requests.filter(r => r.id !== id)); notify("ลบรายการแล้ว"); }
  function updateItems(prId, items) {
    setRequests(requests.map(r => r.id === prId ? { ...r, items } : r));
  }
  function receiveAll(r) {
    updateItems(r.id, getPRItems(r).map(it => it.received ? it : { ...it, received: true, receivedDate: todayISO() }));
    notify("บันทึกรับของครบทั้ง PO แล้ว");
  }

  function importItems(items) {
    const newItems = items.map(it => ({
      id: uid(), prNo: it.prNo, date: it.date || todayISO(), categories: it.categories.length ? it.categories : ["other"],
      itemName: it.itemName, items: getPRItems({ itemName: it.itemName }), requestedBy: it.requestedBy || "",
      poNo: it.poNo || "", notes: it.notes || "",
    }));
    setRequests([...newItems, ...requests]);
    notify(`นำเข้า ${newItems.length} รายการแล้ว`);
    setShowImport(false);
  }

  return (
    <div>
      <TabHeader title="ใบขอซื้อ (PR)" sub="บันทึกรายการที่สั่งซื้อ/ออก PR ทั้งสารเคมี พัสดุ และซ่อมบำรุงเครื่องมือ · 1 PR ออกได้หลาย PO" />
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <ViewTab active={view === "active"} onClick={() => setView("active")} label="กำลังดำเนินการ" count={activeCount} />
        <ViewTab active={view === "history"} onClick={() => setView("history")} label="ประวัติ (รับครบแล้ว)" count={historyCount} />
      </div>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาเลข PR, รายการ, ผู้ขอ, เลข PO..." />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกหมวด</option>
          {Object.entries(PR_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button style={S.ghostBtn} onClick={() => setShowImport(true)}>
          <FileDown size={14} style={{ transform: "rotate(180deg)", marginRight: 4 }} /> นำเข้ารายการ
        </button>
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), prNo: "", date: todayISO(), categories: [], itemName: "", requestedBy: "", poNo: "", notes: "" })}>
          <Plus size={15} /> ออกใบขอซื้อ
        </button>
      </Toolbar>
      {showImport && <PurchaseRequestsImportForm onCancel={() => setShowImport(false)} onImport={importItems} />}

      <Table
        cols={["เลขที่ PR", "วันที่", "หมวด", "รายการ", ""]}
        rows={filtered.map(r => [
          <div>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.prNo || "-"}</span>
            {getPRPos(r).map(p => (
              <div key={p.id} style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                PO: {p.fileUrl ? (
                  <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--teal-dark)", textDecoration: "underline" }}>{p.poNo}</a>
                ) : p.poNo}
              </div>
            ))}
          </div>,
          fmtDate(r.date),
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(r.categories || []).length > 0
              ? r.categories.map(c => <Tag key={c} color="var(--muted)">{PR_CATEGORY_LABEL[c] || c}</Tag>)
              : "-"}
          </div>,
          <div>
            <PRItemsCell items={getPRItems(r)} onUpdateItems={(items) => updateItems(r.id, items)} onReceiveAll={() => receiveAll(r)} />
            {r.requestedBy && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>ผู้ขอ: {r.requestedBy}</div>}
          </div>,
          <RowActions onEdit={() => setEditing({ ...r, itemName: getPRItems(r).map(i => i.text).join("\n") })} onDelete={() => remove(r.id)} />,
        ])}
        empty={view === "history" ? "ยังไม่มี PR ที่รับของครบ" : "ยังไม่มีใบขอซื้อที่กำลังดำเนินการ"}
      />
      {editing && <PurchaseRequestForm item={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}

function ViewTab({ active, onClick, label, count, warnCount = 0 }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: active ? "#E9F1FB" : "transparent",
        border: `1px solid ${active ? "var(--teal)" : "var(--line)"}`,
        color: active ? "var(--teal-dark)" : "var(--muted)",
        borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {label} <span style={{ fontFamily: "var(--font-mono)", opacity: 0.8 }}>({count})</span>
      {warnCount > 0 && <span style={S.navBadge}>เลยกำหนด {warnCount}</span>}
    </button>
  );
}

// Per-PR item checklist: click the "รับแล้ว" label on each line to toggle it
// received, or click "รับแล้วทั้งหมด (PO นี้)" once to mark every line at
// once — matches the 1 PR = 1 PO assumption, so the PO number lives on the
// PR itself rather than per line. Shows the first 2 lines with a "+N more"
// expander.
function PRItemsCell({ items, onUpdateItems, onReceiveAll }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 2);
  const rest = items.length - shown.length;
  const allReceived = items.length > 0 && items.every(it => it.received);

  const toggleReceived = (id) => {
    onUpdateItems(items.map(it => it.id === id
      ? (it.received ? { ...it, received: false, receivedDate: null } : { ...it, received: true, receivedDate: todayISO() })
      : it
    ));
  };

  if (items.length === 0) return <span style={{ color: "var(--muted)" }}>-</span>;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {shown.map((it) => (
        <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 13, fontWeight: 500,
            textDecoration: it.received ? "line-through" : "none",
            color: it.received ? "var(--muted)" : "var(--ink)",
          }}>
            {it.text}
          </span>
          <button
            onClick={() => toggleReceived(it.id)}
            style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, cursor: "pointer",
              background: it.received ? "#E3F5EA" : "transparent",
              color: it.received ? "var(--green)" : "var(--muted)",
              border: `1px solid ${it.received ? "var(--green)" : "var(--line)"}`,
              flexShrink: 0,
            }}
          >
            {it.received ? `✓ รับแล้ว${it.receivedDate ? ` · ${fmtDate(it.receivedDate)}` : ""}` : "รับแล้ว"}
          </button>
        </div>
      ))}
      {items.length > 2 && (
        <button
          onClick={() => setExpanded(x => !x)}
          style={{ fontSize: 12, color: "var(--teal)", background: "none", border: "none", cursor: "pointer", padding: 0, marginRight: 12 }}
        >
          {expanded ? "ย่อกลับ" : `+${rest} รายการเพิ่มเติม`}
        </button>
      )}
      {!allReceived && (
        <button
          onClick={onReceiveAll}
          style={{ fontSize: 12, color: "var(--teal-dark)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4, fontWeight: 600, textDecoration: "underline" }}
        >
          รับแล้วทั้งหมด (PO นี้)
        </button>
      )}
    </div>
  );
}

function PurchaseRequestForm({ item, onCancel, onSave }) {
  const [f, setF] = useState({ ...item, categories: item.categories || [], pos: getPRPos(item) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleCategory = (key) => {
    setF({
      ...f,
      categories: f.categories.includes(key) ? f.categories.filter(c => c !== key) : [...f.categories, key],
    });
  };
  function addPO() {
    setF({ ...f, pos: [...f.pos, { id: uid(), poNo: "", fileUrl: "" }] });
  }
  function updatePO(id, patch) {
    setF({ ...f, pos: f.pos.map(p => p.id === id ? { ...p, ...patch } : p) });
  }
  function removePO(id) {
    setF({ ...f, pos: f.pos.filter(p => p.id !== id) });
  }
  return (
    <Modal onClose={onCancel} title={item.itemName ? "แก้ไขใบขอซื้อ" : "ออกใบขอซื้อ (PR)"} wide>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="เลขที่ PR"><input style={S.input} value={f.prNo} onChange={set("prNo")} placeholder="เช่น PR-2569-0045" /></Field>
        <Field label="วันที่ออก PR"><input type="date" style={S.input} value={f.date} onChange={set("date")} /></Field>
        <Field label="หมวดหมู่ (เลือกได้มากกว่า 1 ถ้าสั่งรวมกัน)" full plain>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "4px 0" }}>
            {Object.entries(PR_CATEGORY_LABEL).map(([k, v]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={f.categories.includes(k)} onChange={() => toggleCategory(k)} />
                {v}
              </label>
            ))}
          </div>
        </Field>
        <Field label="รายการที่ขอสั่งซื้อ (1 รายการต่อบรรทัด)" full>
          <textarea
            style={{ ...S.input, minHeight: 90, fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6 }}
            value={f.itemName}
            onChange={set("itemName")}
            placeholder={"ขึ้นบรรทัดใหม่ทีละรายการ เช่น:\nNitric acid 65% 2.5 L (Merck 100456)\nSodium Hydroxide 1 kg (Merck 106498)\nซ่อมแอร์ห้อง C1 น้ำหยด"}
          />
        </Field>
        <Field label="ผู้ขอซื้อ"><input style={S.input} value={f.requestedBy} onChange={set("requestedBy")} /></Field>
        <div />
        <Field label="เลขที่ PO (1 PR ออกได้หลาย PO — ใส่ลิงก์ไฟล์ PO ได้ถ้ามี)" full plain>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {f.pos.map(p => (
              <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  style={{ ...S.input, flex: "0 0 160px" }}
                  value={p.poNo}
                  onChange={(e) => updatePO(p.id, { poNo: e.target.value })}
                  placeholder="เลขที่ PO"
                />
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={p.fileUrl}
                  onChange={(e) => updatePO(p.id, { fileUrl: e.target.value })}
                  placeholder="ลิงก์ไฟล์ PO (SharePoint, Google Drive ฯลฯ) — ไม่บังคับ"
                />
                <button type="button" onClick={() => removePO(p.id)} style={{ ...S.iconBtnSm, color: "var(--red)", flexShrink: 0 }}><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" onClick={addPO} style={{ ...S.ghostBtn, alignSelf: "flex-start" }}>
              <Plus size={13} /> เพิ่มเลขที่ PO
            </button>
          </div>
        </Field>
        <Field label="หมายเหตุ" full><textarea style={{ ...S.input, minHeight: 50 }} value={f.notes} onChange={set("notes")} /></Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave(f)} disabled={!f.itemName} />
    </Modal>
  );
}

function PurchaseRequestsImportForm({ onCancel, onImport }) {
  const [text, setText] = useState("");
  const CATEGORY_KEYS = Object.keys(PR_CATEGORY_LABEL);
  const parsed = text.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split("|").map(p => p.trim());
    const categories = (parts[2] || "").split(",").map(c => c.trim()).filter(c => CATEGORY_KEYS.includes(c));
    return {
      prNo: parts[0] || "", date: parts[1] || "", categories,
      itemName: parts[3] || "", requestedBy: parts[4] || "",
      poNo: parts[5] || "", notes: parts[6] || "",
    };
  }).filter(r => r.itemName);

  return (
    <Modal onClose={onCancel} title="นำเข้ารายการใบขอซื้อ" wide>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
        วางรายการ 1 บรรทัดต่อ 1 รายการ รูปแบบ: <b>เลขที่ PR | วันที่ (YYYY-MM-DD) | หมวด (chemical/consumable/equipment/other คั่นหลายหมวดด้วย , ) | รายการ | ผู้ขอ | เลข PO | หมายเหตุ</b> (คั่นด้วย | — ทุกช่องหลังรายการใส่หรือเว้นว่างก็ได้)
      </div>
      <textarea
        style={{ ...S.input, minHeight: 220, fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"ตัวอย่าง:\nPR-2569-0045 | 2026-08-01 | chemical | Acetonitrile HPLC grade 4 ขวด | สมชาย | PO-2569-0123 | \nPR-2569-0046 | 2026-08-02 | chemical,equipment | สั่งสารเคมีรวมกับซ่อมแอร์ห้อง C1 | พาน | | "}
      />
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
        ตรวจพบ <b>{parsed.length}</b> รายการที่จะนำเข้า (รายการเดิมจะไม่ถูกลบหรือทับ — รายการใหม่จะถูกเพิ่มเข้าไป)
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onImport(parsed)} disabled={parsed.length === 0} />
    </Modal>
  );
}


function ReportsTab({ equipment, activities, chemicals, consumables, purchaseRequests }) {
  function toCSV(rows, headers) {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [headers.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
  }
  function download(filename, content) {
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  const exportEquipment = () => download("equipment.csv", toCSV(
    equipment.map(e => [e.code, e.name, e.brand || "", e.model || "", e.serialNo || "", e.type, e.location, e.status, e.lastCalibration, e.nextDue, e.notes]),
    ["รหัส", "ชื่อ", "ยี่ห้อ", "รุ่น", "Serial No.", "ประเภท", "ตำแหน่ง", "สถานะ", "สอบเทียบล่าสุด", "กำหนดถัดไป", "หมายเหตุ"]
  ));
  const exportActivities = () => download("activities.csv", toCSV(
    activities.map(a => [equipment.find(e => e.id === a.equipmentId)?.code || a.equipmentId, a.date, a.type, a.detail, a.by, a.poNo || "", a.poUrl || "", a.certUrl || ""]),
    ["รหัสเครื่องมือ", "วันที่", "ประเภท", "รายละเอียด", "ผู้ดำเนินการ", "เลขที่ PO", "ลิงก์ PO", "ลิงก์ Certificate"]
  ));
  const exportChemicals = () => download("chemicals.csv", toCSV(
    chemicals.map(c => [c.name, c.formula || "", c.brand || "", c.quantity, c.unit, earliestExpiry(c), c.location, c.minThreshold]),
    ["ชื่อ", "สูตรเคมี", "ยี่ห้อ", "คงเหลือ", "หน่วย", "วันหมดอายุ (ใกล้สุด)", "ตำแหน่ง", "ขั้นต่ำ"]
  ));
  const exportConsumables = () => download("consumables.csv", toCSV(
    consumables.map(s => [s.name, s.quantity, s.unit, s.minThreshold]),
    ["ชื่อ", "คงเหลือ", "หน่วย", "ขั้นต่ำ"]
  ));
  const exportMonthlySummary = () => {
    const map = {};
    consumables.forEach(s => {
      (s.transactions || []).forEach(t => {
        const month = (t.date || "").slice(0, 7) || "ไม่ระบุเดือน";
        const key = `${month}|${s.name}`;
        if (!map[key]) map[key] = { month, name: s.name, unit: s.unit, received: 0, withdrawn: 0, poNos: new Set() };
        if (t.type === "receive") {
          map[key].received += Number(t.qty) || 0;
          if (t.poNo) map[key].poNos.add(t.poNo);
        } else {
          map[key].withdrawn += Number(t.qty) || 0;
        }
      });
    });
    const rows = Object.values(map).sort((a, b) => a.month.localeCompare(b.month) || a.name.localeCompare(b.name));
    download("consumables-monthly-summary.csv", toCSV(
      rows.map(r => [r.month, r.name, r.received, r.withdrawn, r.received - r.withdrawn, r.unit, [...r.poNos].join("; ")]),
      ["เดือน", "ชื่อพัสดุ", "รวมรับเข้า", "รวมเบิกใช้", "สุทธิ (รับ-เบิก)", "หน่วย", "เลขที่ PO"]
    ));
  };

  const exportPurchaseRequests = () => {
    const rows = [];
    purchaseRequests.forEach(r => {
      const cats = (r.categories || []).map(c => PR_CATEGORY_LABEL[c] || c).join("; ");
      const poList = getPRPos(r).map(p => p.poNo).filter(Boolean).join("; ");
      getPRItems(r).forEach(it => {
        rows.push([r.prNo, r.date, cats, it.text, it.received ? "ได้รับแล้ว" : "ยังไม่ได้รับ", it.receivedDate || "", poList, r.requestedBy, r.notes || ""]);
      });
    });
    download("purchase-requests.csv", toCSV(
      rows,
      ["เลขที่ PR", "วันที่", "หมวด", "รายการ", "สถานะรับของ", "วันที่รับ", "เลขที่ PO", "ผู้ขอ", "หมายเหตุ"]
    ));
  };

  const txCount = consumables.reduce((sum, s) => sum + (s.transactions || []).length, 0);

  const cards = [
    { title: "เครื่องมือทั้งหมด", desc: `${equipment.length} รายการ พร้อมกำหนดสอบเทียบ`, action: exportEquipment, icon: Wrench },
    { title: "ประวัติกิจกรรม", desc: `${activities.length} รายการ สอบเทียบ/ซ่อม/แจ้งซ่อม`, action: exportActivities, icon: CalendarClock },
    { title: "สต็อคสารเคมี", desc: `${chemicals.length} รายการ พร้อมวันหมดอายุ`, action: exportChemicals, icon: FlaskConical },
    { title: "พัสดุสิ้นเปลือง", desc: `${consumables.length} รายการ พร้อมปริมาณคงเหลือ`, action: exportConsumables, icon: Package },
    { title: "สรุปรับเข้า-เบิกใช้รายเดือน", desc: `${txCount} รายการรับเข้า/เบิกใช้ สรุปตามเดือนและรายการ`, action: exportMonthlySummary, icon: CalendarClock },
    { title: "ใบขอซื้อ (PR)", desc: `${purchaseRequests.length} รายการ ทุกหมวดหมู่`, action: exportPurchaseRequests, icon: ClipboardList },
  ];

  return (
    <div>
      <TabHeader title="รายงาน" sub="ส่งออกข้อมูลเป็นไฟล์ CSV เพื่อใช้งานต่อ" />
      <div style={S.statGrid}>
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} style={{ ...S.statCard, cursor: "default" }}>
              <div style={S.statTop}><Icon size={16} color="var(--teal)" /><span style={S.statLabel}>{c.title}</span></div>
              <div style={S.reportDesc}>{c.desc}</div>
              <button style={S.smallBtn} onClick={c.action}><FileDown size={13} /> ส่งออก CSV</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= shared small components ================= */
function TabHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={S.h2}>{title}</h2>
      <div style={S.h2sub}>{sub}</div>
    </div>
  );
}
function Toolbar({ children }) { return <div style={S.toolbar}>{children}</div>; }
function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={S.searchWrap}>
      <Search size={14} color="var(--muted)" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={S.searchInput} />
    </div>
  );
}
function EmptyState({ text, small }) {
  return <div style={{ ...S.emptyState, padding: small ? "16px 0" : "40px 0" }}>{text}</div>;
}
function Field({ label, children, full, plain }) {
  // Fields normally render as a <label> so clicking the caption focuses the
  // single input inside — a nice a11y/UX default. But when a field contains
  // MULTIPLE form controls (e.g. a list of checkboxes), a native <label>
  // forwards any click that doesn't land directly on a control to the
  // FIRST form control inside it. That silently double-toggles/cross-checks
  // items (click item A -> A's own handler fires AND the label forwards a
  // synthetic click to the first checkbox, e.g. item A again -> cancels
  // out; click item B -> B toggles correctly AND the first checkbox also
  // gets toggled). Pass `plain` for any field with more than one control so
  // it renders a <div> instead and skips that implicit forwarding.
  const Tag = plain ? "div" : "label";
  return <Tag style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : "auto" }}>
    <span style={S.fieldLabel}>{label}</span>{children}
  </Tag>;
}
function Modal({ title, children, onClose, wide }) {
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modalBox, maxWidth: wide ? 620 : 480 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={{ ...S.modalTitle, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          <button style={{ ...S.iconBtn, flexShrink: 0 }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: "16px 20px 20px" }}>{children}</div>
      </div>
    </div>
  );
}
function ModalFooter({ onCancel, onSave, disabled }) {
  return (
    <div style={S.modalFoot}>
      <button style={S.ghostBtn} onClick={onCancel}>ยกเลิก</button>
      <button style={{ ...S.primaryBtn, opacity: disabled ? 0.5 : 1 }} disabled={disabled} onClick={onSave}>บันทึก</button>
    </div>
  );
}
function Tag({ children, color }) {
  return <span style={{ ...S.tag, color, borderColor: color + "55", background: color + "14" }}>{children}</span>;
}
function GroupedBookingTable({ cols, groups, empty }) {
  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <div style={S.tableWrap} className="ltTableWrap">
      <table style={S.table} className="ltTable">
        <thead><tr>{cols.map((c, i) => <th key={i} style={S.th}>{c}</th>)}</tr></thead>
        <tbody>
          {totalRows === 0 && <tr><td colSpan={cols.length}><EmptyState text={empty} /></td></tr>}
          {groups.flatMap((g, gi) => g.rows.length === 0 ? [] : [
            <tr key={`h-${gi}`}>
              <td colSpan={cols.length} style={{ padding: "9px 14px", fontSize: 12, fontWeight: 700, color: g.color, background: "#FAFBFC", borderBottom: "1px solid var(--line)" }}>
                {g.label} ({g.rows.length})
              </td>
            </tr>,
            ...g.rows.map((r, ri) => (
              <tr key={`r-${gi}-${ri}`} style={S.tr} className="ltTableRow">
                {r.map((c, ci) => (
                  <td key={ci} style={S.td} data-label={cols[ci]} className={ci === 0 ? "ltTableTitleCell" : "ltTableCell"}>{c}</td>
                ))}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
// Three at-a-glance counts for a restricted (customer) account's own
// bookings: pending, currently out, and overdue — with the same nearest
// due date / worst overdue-days hints shown as small pills.
function BookingSummaryCards({ pendingCount, currentCount, overdueCount, nearestDueLabel, worstOverdueDays }) {
  const cards = [
    { label: "รออนุมัติ", value: pendingCount, icon: Clock, tint: "#FDF3E3", color: "var(--amber)", sub: null },
    { label: "กำลังใช้งาน", value: currentCount, icon: ClipboardList, tint: "#E9F1FB", color: "var(--teal)", sub: nearestDueLabel ? `ต้องคืน ${nearestDueLabel}` : null },
    { label: "เกินกำหนดคืน", value: overdueCount, icon: AlertTriangle, tint: "#FBE9E4", color: "var(--red)", sub: worstOverdueDays ? `เกินกำหนด ${worstOverdueDays} วัน` : null },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: 12 }}>
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div key={i} style={S.statCard}>
            <div style={S.statTop}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={15} color={c.color} />
              </div>
              <span style={S.statLabel}>{c.label}</span>
            </div>
            <div style={S.statValue}>{c.value}</div>
            <div style={S.statSub}>รายการ</div>
            {c.sub && (
              <div style={{ marginTop: 8, display: "inline-block", fontSize: 11, fontWeight: 600, color: c.color, background: c.tint, borderRadius: 8, padding: "3px 8px" }}>
                {c.sub}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
// Right-side alert feed for a restricted account: every overdue booking gets
// its own actionable card, plus a rollup of anything due soon (or a "nothing
// upcoming" message when there's none) — so returning something doesn't
// require first finding it in the table below.
function BookingAlertsPanel({ overdueItems, nearDueItems, onSeeAll, onItemAction }) {
  return (
    <div style={{ width: "100%", maxWidth: 300, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13.5 }}>
          <AlertTriangle size={15} color="var(--red)" /> แจ้งเตือน
        </div>
        <button onClick={onSeeAll} style={S.panelLink}>ดูทั้งหมด</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {overdueItems.map(b => (
          <div key={b.id} style={{ background: "#FBE9E4", border: "1px solid #F3C7BA", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertTriangle size={15} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>เกินกำหนดคืน</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2, wordBreak: "break-word" }}>{b.equipmentName || b.equipmentCode}</div>
                <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 2 }}>เกินกำหนด {Math.abs(daysUntil(b.dueBackDate))} วัน</div>
              </div>
            </div>
            <button
              style={{ ...S.ghostBtn, borderColor: "var(--red)", color: "var(--red)", width: "100%", marginTop: 10, justifyContent: "center", display: "flex" }}
              onClick={() => onItemAction(b)}
            >
              ดำเนินการคืน
            </button>
          </div>
        ))}
        <div style={{ background: "#FDF3E3", border: "1px solid #F5DFAF", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Clock size={15} color="var(--amber)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)" }}>ใกล้ถึงกำหนดคืน</div>
            {nearDueItems.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>ไม่มีรายการใกล้ถึงกำหนดคืน</div>
            ) : (
              nearDueItems.map(b => (
                <div key={b.id} style={{ fontSize: 11.5, marginTop: 4, wordBreak: "break-word" }}>
                  {b.equipmentName || b.equipmentCode} · เหลือ {daysUntil(b.dueBackDate)} วัน
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function Table({ cols, rows, empty, onRowClick }) {
  return (
    <div style={S.tableWrap} className="ltTableWrap">
      <table style={S.table} className="ltTable">
        <thead><tr>{cols.map((c, i) => <th key={i} style={S.th}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length}><EmptyState text={empty} /></td></tr>}
          {rows.map((r, i) => (
            <tr
              key={i}
              style={{ ...S.tr, cursor: onRowClick ? "pointer" : "default" }}
              className="ltTableRow"
              onClick={onRowClick ? () => onRowClick(i) : undefined}
            >
              {r.map((c, j) => (
                <td key={j} style={S.td} data-label={cols[j]} className={j === 0 ? "ltTableTitleCell" : "ltTableCell"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RowTitle({ text, beacon, badge }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
    <span style={{ ...S.beaconSm, background: beacon }} />{text}{badge}
  </div>;
}
function Mono({ children }) { return <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{children}</span>; }
function RowActions({ onEdit, onDelete, confirmMessage = "ต้องการลบรายการนี้ใช่ไหม การลบไม่สามารถกู้คืนได้" }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
      <button style={S.iconBtnSm} onClick={onEdit}><Pencil size={13} /></button>
      <button style={{ ...S.iconBtnSm, color: "var(--red)" }} onClick={() => setConfirming(true)}><Trash2 size={13} /></button>
      {confirming && (
        <ConfirmDialog
          message={confirmMessage}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onDelete(); }}
        />
      )}
    </div>
  );
}
// Generic "are you sure?" overlay — used before any destructive action
// (delete, cancel) so a stray click can't silently remove data.
function ConfirmDialog({ title = "ยืนยันการทำรายการ", message, confirmLabel = "ลบเลย", danger = true, onConfirm, onCancel }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(18,37,59,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, border: "1px solid var(--line)",
          padding: "20px 22px", width: "100%", maxWidth: 340, boxShadow: "0 12px 32px rgba(18,37,59,0.2)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 18 }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={S.ghostBtn} onClick={onCancel}>ยกเลิก</button>
          <button
            style={{ ...S.primaryBtn, background: danger ? "var(--red)" : undefined, borderColor: danger ? "var(--red)" : undefined }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirms a return/finish action. For "อุปกรณ์" (items) with more than one
// unit borrowed, asks how many are actually coming back — partial returns
// reduce the remaining qty on the booking instead of closing it outright.
// For "เครื่องมือ" (equipment) there's nothing to count, just a straight
// confirm with the "ใช้งานเสร็จสิ้นแล้ว" wording.
function ReturnQtyDialog({ booking, defaultName = "", onCancel, onConfirm }) {
  const isItem = booking.assetType === "item";
  const maxQty = booking.qty || 1;
  const [qty, setQty] = useState(maxQty);
  const [returnedByName, setReturnedByName] = useState(defaultName);
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(18,37,59,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, border: "1px solid var(--line)",
          padding: "20px 22px", width: "100%", maxWidth: 340, boxShadow: "0 12px 32px rgba(18,37,59,0.2)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
          {isItem ? "คืนอุปกรณ์แล้ว" : "ใช้งานเสร็จสิ้นแล้ว"}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          {booking.equipmentCode || booking.equipmentName} · ผู้ยืม {booking.requestedBy || "-"}
        </div>
        {isItem && maxQty > 1 && (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>จำนวนที่คืน (จากทั้งหมด {maxQty} ชิ้น)</label>
            <input
              type="number" min="1" max={maxQty} value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
              style={{ ...S.input, marginTop: 6 }}
            />
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{isItem ? "ชื่อผู้รับคืน" : "ชื่อผู้คืน"}</label>
          <input
            value={returnedByName}
            onChange={(e) => setReturnedByName(e.target.value)}
            placeholder={isItem ? "พิมพ์ชื่อผู้รับคืน..." : "พิมพ์ชื่อผู้คืน..."}
            style={{ ...S.input, marginTop: 6 }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button style={S.ghostBtn} onClick={onCancel}>ยกเลิก</button>
          <button
            style={{ ...S.primaryBtn, opacity: returnedByName.trim() ? 1 : 0.5, cursor: returnedByName.trim() ? "pointer" : "not-allowed" }}
            disabled={!returnedByName.trim()}
            onClick={() => onConfirm(isItem ? qty : maxQty, returnedByName.trim())}
          >
            {isItem ? "ยืนยันคืน" : "ยืนยันเสร็จสิ้น"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Quantity-aware "mark as returned" dialog for chemical/consumable withdraw
// transactions. Handles partial returns: if less than the full outstanding
// amount is entered, the transaction stays flagged as pending (needsReturn)
// for whatever's left.
function ReturnTxQtyDialog({ tx, unit, onCancel, onConfirm }) {
  const already = txReturnedQty(tx);
  const remaining = txReturnRemaining(tx);
  const [qty, setQty] = useState(remaining);
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(18,37,59,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, border: "1px solid var(--line)",
          padding: "20px 22px", width: "100%", maxWidth: 340, boxShadow: "0 12px 32px rgba(18,37,59,0.2)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>บันทึกการคืน</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          เบิกไปทั้งหมด {tx.qty} {unit}{already > 0 ? ` · คืนแล้ว ${already} ${unit}` : ""} · ค้างคืน {remaining} {unit}
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>จำนวนที่คืนครั้งนี้ (สูงสุด {remaining} {unit})</label>
          <input
            type="number" min="1" max={remaining} value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(remaining, Number(e.target.value) || 1)))}
            style={{ ...S.input, marginTop: 6 }}
          />
          {qty < remaining && (
            <div style={{ fontSize: 11.5, color: "var(--amber)", marginTop: 6 }}>
              คืนไม่ครบ — ระบบจะคงสถานะ "รอคืน" ไว้สำหรับส่วนที่เหลืออีก {remaining - qty} {unit}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button style={S.ghostBtn} onClick={onCancel}>ยกเลิก</button>
          <button style={S.primaryBtn} onClick={() => onConfirm(qty)}>ยืนยันคืน</button>
        </div>
      </div>
    </div>
  );
}


// Confirmation step before approving/rejecting a booking request, with an
// optional (but always-shown) notes field — e.g. an approver's condition,
// or a rejecter's reason — stored on the booking as approvalNote so it's
// visible to the requester afterwards.
function ApprovalDialog({ booking, action, defaultName = "", onCancel, onConfirm }) {
  const [note, setNote] = useState("");
  const [approverName, setApproverName] = useState(defaultName);
  const isApprove = action === "approve";
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(18,37,59,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, border: "1px solid var(--line)",
          padding: "20px 22px", width: "100%", maxWidth: 380, boxShadow: "0 12px 32px rgba(18,37,59,0.2)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
          {isApprove ? "ยืนยันอนุมัติคำขอ" : "ยืนยันปฏิเสธคำขอ"}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          {booking.equipmentCode || booking.equipmentName} · ผู้ขอ {booking.requestedBy || "-"}
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
            {isApprove ? "ชื่อผู้อนุมัติ" : "ชื่อผู้ปฏิเสธ"}
          </label>
          <input
            value={approverName}
            onChange={(e) => setApproverName(e.target.value)}
            placeholder={isApprove ? "พิมพ์ชื่อผู้อนุมัติ..." : "พิมพ์ชื่อผู้ปฏิเสธ..."}
            style={{ ...S.input, marginTop: 6 }}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
            หมายเหตุ{isApprove ? " (ถ้ามี)" : " (เช่น เหตุผลที่ปฏิเสธ)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={isApprove ? "ระบุหมายเหตุเพิ่มเติม..." : "ระบุเหตุผลที่ปฏิเสธ..."}
            style={{ ...S.input, marginTop: 6, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button style={S.ghostBtn} onClick={onCancel}>ยกเลิก</button>
          <button
            style={{
              ...S.primaryBtn,
              background: isApprove ? "var(--green)" : "var(--red)",
              borderColor: isApprove ? "var(--green)" : "var(--red)",
              opacity: approverName.trim() ? 1 : 0.5,
              cursor: approverName.trim() ? "pointer" : "not-allowed",
            }}
            disabled={!approverName.trim()}
            onClick={() => onConfirm(note.trim(), approverName.trim())}
          >
            {isApprove ? "ยืนยันอนุมัติ" : "ยืนยันปฏิเสธ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Quick "take this out of service" action — sets status to maintenance with
// a reason, without going through the full edit form. Used from both
// Equipment and Items so staff can mark something unbookable right when
// they notice it's broken/in use/unavailable.
function DisableAssetDialog({ asset, onCancel, onConfirm }) {
  const presets = ["ชำรุด", "แลปใช้งานอยู่ ไม่ว่าง", "ส่งซ่อม/สอบเทียบ", "อื่นๆ"];
  const initialPreset = presets.includes(asset.unavailableReason) ? asset.unavailableReason : (asset.unavailableReason ? "อื่นๆ" : presets[0]);
  const [reason, setReason] = useState(initialPreset);
  const [customReason, setCustomReason] = useState(initialPreset === "อื่นๆ" ? (asset.unavailableReason || "") : "");
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(18,37,59,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, border: "1px solid var(--line)",
          padding: "20px 22px", width: "100%", maxWidth: 360, boxShadow: "0 12px 32px rgba(18,37,59,0.2)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>ปิดใช้งานชั่วคราว</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          {asset.code ? `${asset.code} · ` : ""}{asset.name} — จะไม่แสดงในตัวเลือกจอง/ยืมจนกว่าจะเปิดใช้งานอีกครั้ง
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>เหตุผล</label>
        <select style={{ ...S.input, marginTop: 6 }} value={reason} onChange={(e) => setReason(e.target.value)}>
          {presets.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {reason === "อื่นๆ" && (
          <input
            style={{ ...S.input, marginTop: 8 }}
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="ระบุเหตุผล"
          />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button style={S.ghostBtn} onClick={onCancel}>ยกเลิก</button>
          <button
            style={{ ...S.primaryBtn, background: "var(--amber)", borderColor: "var(--amber)" }}
            onClick={() => onConfirm(reason === "อื่นๆ" ? customReason.trim() : reason)}
          >
            ปิดใช้งาน
          </button>
        </div>
      </div>
    </div>
  );
}


/* ================= shared: asset thumbnails ================= */
// Small image chip used across the calendar & catalog pages, with a
// graceful icon fallback when no photo is on file / the link is broken.
function Thumb({ src, size = 40, radius = 8 }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, background: "#EEF2F6",
        border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--muted)", flexShrink: 0,
      }}>
        <ImageOff size={Math.round(size * 0.42)} strokeWidth={1.6} />
      </div>
    );
  }
  return (
    <img
      src={src} alt="" onError={() => setBroken(true)}
      style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", border: "1px solid var(--line)", background: "#EEF2F6", flexShrink: 0 }}
    />
  );
}

// Combined equipment+item lookup keyed by id, used by both the calendar and
// catalog pages so a booking's equipmentId resolves to a name/photo/status
// regardless of which asset type it points at.
function buildAssetMap(equipment, items) {
  const map = {};
  equipment.forEach(e => { map[e.id] = { ...e, kind: "equipment", kindLabel: "เครื่องมือ" }; });
  items.forEach(i => { map[i.id] = { ...i, kind: "item", kindLabel: "อุปกรณ์" }; });
  return map;
}

/* ================= USAGE CALENDAR (ปฏิทินการใช้งาน) ================= */
// Read-mostly page — used by both admins and booking-only accounts — showing
// per-day which equipment/items are checked out or reserved, plus photo
// cards for whatever is actually out the door right now. Only APPROVED
// bookings are shown (a pending request isn't a real hold yet). Booking-only
// accounts never see WHO else has something out, matching the privacy rule
// already used in BookingsTab — only that a slot is busy.
function UsageCalendarTab({ bookings, equipment, items, restrictToBooking, currentUsername }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDate, setSelectedDate] = useState(null);
  const assetMap = useMemo(() => buildAssetMap(equipment, items), [equipment, items]);

  const liveBookings = useMemo(() => bookings.filter(b => b.status === "approved"), [bookings]);

  // Always show who booked/used the equipment — including to booking-only
  // accounts — so anyone running into a scheduling conflict can follow up
  // directly with whoever had it before them, instead of just knowing a
  // slot was "busy". (This calendar is shared internal staff coordination,
  // not an external-facing view, so this is different from the stricter
  // per-customer privacy rules used in the analysis tracking page.)
  function eventLabel(b) {
    return b.requestedBy || "-";
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const dateStrOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const today = todayISO();

  function eventsOn(dateStr) {
    return liveBookings.filter(b => {
      const r = bookingRange(b);
      return r.start <= dateStr && dateStr <= r.end;
    });
  }

  const monthLabel = cursor.toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  // Everything happening today — both equipment actually checked out right
  // now AND reservations that fall on today — sorted by start time so the
  // day reads top-to-bottom like a schedule.
  const todayEvents = eventsOn(today)
    .slice()
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "") || (a.equipmentName || "").localeCompare(b.equipmentName || ""));

  const selectedEvents = selectedDate ? eventsOn(selectedDate) : [];

  return (
    <div>
      <TabHeader title="ปฏิทินการใช้งาน" sub="ดูว่าเครื่องมือ/อุปกรณ์ชิ้นไหนกำลังใช้งานอยู่ หรือถูกจองล่วงหน้าไว้ในแต่ละวัน" />

      {todayEvents.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...S.panelTitle, marginBottom: 10 }}>รายการวันนี้ ({todayEvents.length})</div>
          <div style={S.cardGrid}>
            {todayEvents.map(b => {
              const asset = assetMap[b.equipmentId];
              const isReservation = b.type === "reservation";
              return (
                <div key={b.id} style={{ ...S.eqCard, display: "flex", gap: 10 }}>
                  <Thumb src={asset?.imageUrl} size={52} radius={9} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <div style={S.eqName}>{b.equipmentName}</div>
                      <Tag color={isReservation ? "var(--amber)" : "var(--red)"}>{BOOKING_TYPE_LABEL[b.type]}</Tag>
                    </div>
                    {b.equipmentCode && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{b.equipmentCode}</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                      <User size={12} /> {eventLabel(b)}
                    </div>
                    {b.startTime && b.endTime && (
                      <div style={{ fontSize: 11, marginTop: 2, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                        {b.startTime} - {b.endTime} น.
                      </div>
                    )}
                    {isReservation ? (
                      b.endDate && b.endDate !== b.startDate && (
                        <div style={{ fontSize: 11, marginTop: 3, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                          จองถึง {fmtDate(b.endDate)}
                        </div>
                      )
                    ) : (
                      b.dueBackDate && (
                        <div style={{ fontSize: 11, marginTop: 3, color: isBookingOverdue(b) ? "var(--red)" : "var(--muted)", fontFamily: "var(--font-mono)" }}>
                          กำหนดคืน {fmtDate(b.dueBackDate)}
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ ...S.panel, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button style={S.iconBtnSm} onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={15} /></button>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5 }}>{monthLabel}</div>
          <button style={S.iconBtnSm} onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={15} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 11, color: "var(--muted)", fontWeight: 600, textAlign: "center", marginBottom: 4, minWidth: 0 }}>
          {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map(w => <div key={w} style={{ minWidth: 0 }}>{w}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, minWidth: 0 }}>
          {weeks.map((week, wi) => week.map((d, di) => {
            if (d === null) return <div key={`${wi}-${di}`} style={{ minWidth: 0 }} />;
            const dateStr = dateStrOf(d);
            const events = eventsOn(dateStr);
            const isToday = dateStr === today;
            return (
              <button
                key={dateStr}
                onClick={() => events.length > 0 && setSelectedDate(dateStr)}
                style={{
                  minHeight: 64, minWidth: 0, width: "100%", boxSizing: "border-box", textAlign: "left", background: isToday ? "#EAF4FB" : "#fff",
                  border: `1px solid ${isToday ? "var(--teal)" : "var(--line)"}`, borderRadius: 8, padding: 5,
                  cursor: events.length > 0 ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 2,
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: isToday ? "var(--teal-dark)" : "var(--muted)", fontWeight: isToday ? 700 : 500 }}>{d}</div>
                {events.slice(0, 2).map(b => (
                  <div key={b.id} style={{
                    display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, borderRadius: 4, padding: "1px 3px", minWidth: 0,
                    background: b.type === "checkout" ? "#FCEAEA" : "#FDF3E3",
                    color: b.type === "checkout" ? "var(--red)" : "var(--amber)", overflow: "hidden", whiteSpace: "nowrap",
                  }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{b.equipmentName}</span>
                  </div>
                ))}
                {events.length > 2 && <div style={{ fontSize: 9.5, color: "var(--muted)" }}>+{events.length - 2} รายการ</div>}
              </button>
            );
          }))}
        </div>
      </div>

      {selectedDate && (
        <Modal onClose={() => setSelectedDate(null)} title={fmtDate(selectedDate)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {selectedEvents.length === 0 && <EmptyState text="ไม่มีรายการในวันนี้" />}
            {selectedEvents.map(b => {
              const asset = assetMap[b.equipmentId];
              const isReservation = b.type === "reservation";
              return (
                <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
                  <Thumb src={asset?.imageUrl} size={48} radius={8} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.equipmentName}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{eventLabel(b)}</div>
                    {b.startTime && b.endTime && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                        {b.startTime} - {b.endTime} น.
                      </div>
                    )}
                    {isReservation && b.endDate && b.endDate !== b.startDate && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                        {fmtDate(b.startDate)} - {fmtDate(b.endDate)}
                      </div>
                    )}
                  </div>
                  <Tag color={isReservation ? "var(--amber)" : "var(--red)"}>{BOOKING_TYPE_LABEL[b.type]}</Tag>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= CATALOG (รายการที่ยืมได้) ================= */
// Browsable, photo-first list of every active equipment + item, so people
// (especially booking-only accounts, who have no admin tables to browse)
// can see what's available before opening the booking form. Tapping a card
// jumps straight into a pre-filled booking request, reusing the same
// BookingForm modal the admin Equipment/Items tables use.
function CatalogTab({ equipment, items, bookings, setBookings, notify, restrictToBooking, currentUsername, currentDisplayName }) {
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState("all"); // all | equipment | item
  const [bookingFor, setBookingFor] = useState(null); // { id, assetType }
  const [viewImage, setViewImage] = useState(null); // the asset currently shown full-size

  const catalog = useMemo(() => {
    const eq = equipment
      .filter(e => e.status === "active" && e.type !== "เครื่องปรับอากาศ")
      .map(e => ({ ...e, assetType: "equipment", summary: equipmentBookingSummary(e.id, bookings) }));
    const it = items
      .filter(i => i.status === "active")
      .map(i => ({ ...i, assetType: "item", summary: itemBookingSummary(i.id, bookings, i.totalQty) }));
    return [...eq, ...it].sort((a, b) => alphaCompare(a.name, b.name));
  }, [equipment, items, bookings]);

  const filtered = catalog
    .filter(a => kindFilter === "all" || a.assetType === kindFilter)
    .filter(a => (a.name + (a.code || "") + (a.category || a.type || "") + (a.location || "")).toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <TabHeader title="รายการที่ยืมได้" sub="เครื่องมือและอุปกรณ์ทั้งหมดที่พร้อมให้จอง/ยืม พร้อมรูปภาพและสถานะว่าง/ไม่ว่างล่าสุด" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อ, รหัส, ประเภท, ตำแหน่ง..." />
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกประเภท</option>
          <option value="equipment">เครื่องมือ</option>
          <option value="item">อุปกรณ์</option>
        </select>
      </Toolbar>

      <div style={S.cardGrid}>
        {filtered.map(a => (
          <div key={`${a.assetType}-${a.id}`} style={{ ...S.eqCard, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ width: "100%", height: 160, background: "#EEF2F6", position: "relative", overflow: "hidden", flexShrink: 0 }}>
              {a.imageUrl ? (
                <>
                  <img src={a.imageUrl} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "pointer" }}
                    onClick={() => setViewImage(a)}
                  />
                  <button
                    onClick={() => setViewImage(a)}
                    title="ดูรูปภาพขนาดใหญ่"
                    style={{
                      position: "absolute", bottom: 8, right: 8, width: 28, height: 28, borderRadius: 8,
                      background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", display: "flex",
                      alignItems: "center", justifyContent: "center", cursor: "pointer",
                    }}
                  >
                    <ZoomIn size={15} />
                  </button>
                </>
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                  <ImageOff size={26} strokeWidth={1.5} />
                </div>
              )}
              <div style={{ position: "absolute", top: 8, left: 8, ...S.tag, background: "#fff", border: "1px solid var(--line)", fontSize: 10.5, padding: "2px 8px" }}>
                {a.assetType === "equipment" ? "เครื่องมือ" : "อุปกรณ์"}
              </div>
            </div>
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              {a.code && <div style={S.eqCode}>{a.code}</div>}
              <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
              <div style={S.eqMeta}><MapPin size={12} /> {a.location || "-"} · {a.category || a.type || "-"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: a.summary.color, marginTop: "auto", paddingTop: 6 }}>
                <CalendarCheck size={12} /> {restrictToBooking && a.summary.busy && a.assetType === "equipment" ? "ไม่ว่าง" : a.summary.text}
              </div>
              <button
                style={{ ...S.smallBtn, justifyContent: "center", marginTop: 6 }}
                onClick={() => setBookingFor(a)}
              >
                <CalendarCheck size={13} /> จอง/ยืม
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <EmptyState text="ไม่พบเครื่องมือ/อุปกรณ์ที่ตรงกับเงื่อนไข" />}
      </div>

      {viewImage && (
        <Modal onClose={() => setViewImage(null)} title={viewImage.name}>
          <img
            src={viewImage.imageUrl}
            alt=""
            style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 10, background: "#EEF2F6" }}
          />
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>
            {viewImage.code && <span style={{ fontFamily: "var(--font-mono)" }}>{viewImage.code} · </span>}
            {viewImage.location || "-"}
          </div>
        </Modal>
      )}

      {bookingFor && (
        <BookingForm
          equipment={equipment}
          items={items}
          initialAssetType={bookingFor.assetType}
          initialEquipmentId={bookingFor.id}
          bookings={bookings}
          setBookings={setBookings}
          fixedRequestedBy={restrictToBooking ? currentUsername : null}
          fixedRequestedByName={restrictToBooking ? currentDisplayName : null}
          onCancel={() => setBookingFor(null)}
          onSave={(list) => {
            const now = new Date().toISOString();
            const records = list.map(b => ({ ...b, id: uid(), status: "pending", requestedAt: now }));
            setBookings([...records, ...bookings]);
            notify(records.length > 1 ? `ส่งคำขอจอง/ยืม ${records.length} รายการแล้ว รออนุมัติ` : "ส่งคำขอจอง/ยืมแล้ว รออนุมัติ");
            setBookingFor(null);
          }}
        />
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
* { box-sizing: border-box; }
:root {
  --ink:#0B2A4A; --paper:#F3F8FD; --panel:#FFFFFF; --line:#D3E6F5;
  --teal:#0E6FBA; --teal-dark:#0A4F9B; --amber:#C97F0E; --red:#C6493B; --green:#1E9E6B; --muted:#5B7A96;
  --sidebar-grad-start:#0E6FBA; --sidebar-grad-end:#0A4F9B;
  --font-display:'Prompt', ui-sans-serif, system-ui, sans-serif;
  --font-body:'Prompt', ui-sans-serif, system-ui, sans-serif;
  --font-mono:'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
}
input, select, textarea, button { font-family: var(--font-body); }
input:focus, select:focus, textarea:focus { outline: 2px solid var(--teal); outline-offset: 1px; }
button { cursor: pointer; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: #D3DBD9; border-radius: 8px; }

@media (max-width: 760px) {
  .ltApp { border-radius: 0 !important; padding-bottom: 0 !important; }
  .ltShell { flex-direction: column !important; min-height: 0 !important; }
  .ltSidebar {
    width: 100% !important;
    padding: 10px 12px !important;
    border-right: none !important;
    border-bottom: 1px solid var(--line) !important;
  }
  /* Nav moves out of the sidebar into the fixed bottom bar on mobile */
  .ltNav { display: none !important; }
  .ltSidebarFoot { display: none !important; }
  .ltSidebarDeco { display: none !important; }
  .ltMain { padding: 14px 14px 76px !important; max-height: none !important; }
  .ltHero { padding: 18px 16px !important; border-radius: 12px !important; }
  .ltH1 { font-size: 20px !important; }
  .ltFormGrid { grid-template-columns: 1fr !important; }
  .ltAnalysisOverviewGrid { grid-template-columns: 1fr !important; }

  /* Chemicals / Consumables tables: collapse into stacked cards.
     Cells flow inline (wrapping) instead of one row per cell, so short
     cells like quantity and the edit/delete actions end up sharing a
     line instead of each getting their own row. Each row also gets its
     own card (background, border, spacing) instead of a flat list with
     only hairlines between items, which read as too cramped/joined-up. */
  .ltTableWrap { background: transparent !important; border: none !important; border-radius: 0 !important; }
  .ltTable thead { display: none !important; }
  .ltTable, .ltTable tbody { display: block !important; width: 100% !important; }
  .ltTableRow {
    display: flex !important; flex-wrap: wrap !important; align-items: center !important;
    gap: 4px 14px !important; padding: 14px 16px !important; width: 100% !important; box-sizing: border-box !important;
    background: #fff !important; border: 1px solid var(--line) !important; border-radius: 12px !important;
    margin-bottom: 10px !important; box-shadow: 0 1px 3px rgba(18,37,59,0.05) !important;
  }
  .ltTableCell, .ltTableTitleCell {
    display: flex !important; align-items: center !important; gap: 6px !important;
    border: none !important; padding: 0 !important;
  }
  .ltTableTitleCell {
    flex: 1 1 100% !important; font-weight: 600 !important; font-size: 13.5px !important;
    border-bottom: 1px solid var(--line) !important; padding-bottom: 8px !important; margin-bottom: 4px !important;
  }
  .ltTableCell { font-size: 12.5px !important; }
  .ltTableCell::before {
    content: attr(data-label); font-size: 11px; font-weight: 600; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.3px; flex-shrink: 0;
  }
  .ltTableRow > .ltTableCell:last-child { margin-left: auto !important; }

  /* Colorful icon tiles on the dashboard stat cards, like a native app */
  .statCard { display: flex !important; align-items: center !important; gap: 12px !important; }
  .statGrid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
  .statIconTile { display: flex !important; }
  .statTop { gap: 0 !important; }
  .statTopIcon { display: none !important; }

  .ltBottomNav {
    display: flex !important;
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 20;
    background: #fff; border-top: 1px solid var(--line);
    padding: 2px 4px calc(4px + env(safe-area-inset-bottom));
    box-shadow: 0 -2px 10px rgba(18,37,59,0.06);
  }
}

.ltBottomNav { display: none; }
.ltBottomNavBtn {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px; background: none; border: none; padding: 7px 2px 6px; font-family: var(--font-body);
}
.ltBottomNavBadge {
  position: absolute; top: -4px; right: -8px; background: var(--red); color: #fff;
  font-size: 9px; font-weight: 700; border-radius: 20px; padding: 1px 4px; min-width: 14px;
  text-align: center; line-height: 1.3; font-family: var(--font-mono);
}
`;

const S = {
  app: { fontFamily: "var(--font-body)", background: "var(--paper)", color: "var(--ink)", minHeight: 500, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" },
  shell: { display: "flex", minHeight: 500 },
  sidebar: {
    width: 216, background: "#FFFFFF",
    color: "var(--ink)", padding: "20px 12px", display: "flex", flexDirection: "column",
    borderRight: "1px solid var(--line)", boxShadow: "2px 0 8px rgba(16,27,45,0.04)",
  },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "2px 4px 14px", borderBottom: "1px solid var(--line)", marginBottom: 10 },
  brandMark: {
    width: 46, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    background: "linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%)",
    boxShadow: "0 2px 6px rgba(11,79,108,0.28)",
  },
  brandName: { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, letterSpacing: -0.2, color: "var(--ink)" },
  brandSub: { fontSize: 10.5, color: "var(--muted)", marginTop: 1 },
  navBtn: { width: "100%", display: "flex", alignItems: "center", gap: 9, background: "transparent", border: "none", color: "#4B5C72", padding: "9px 10px", borderRadius: 8, fontSize: 13, marginBottom: 2, textAlign: "left" },
  navBtnActive: { background: "linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%)", color: "#fff", fontWeight: 600, boxShadow: "0 2px 6px rgba(11,79,108,0.25)" },
  navBtnFeatured: {
    background: "linear-gradient(135deg, #EAF4FC 0%, #F3F9FD 100%)",
    border: "1px solid #CFE6F5", color: "var(--teal-dark)", fontWeight: 700, fontSize: 13.5,
    padding: "11px 10px", marginBottom: 10,
  },
  navBtnFeaturedActive: { background: "linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%)", color: "#fff", border: "1px solid transparent", boxShadow: "0 2px 6px rgba(11,79,108,0.28)" },
  navBadge: { background: "var(--red)", color: "#fff", fontSize: 10.5, fontWeight: 600, borderRadius: 20, padding: "1px 6px", fontFamily: "var(--font-mono)" },
  navBadgeGreen: { background: "var(--green)", color: "#fff", fontSize: 10.5, fontWeight: 600, borderRadius: 20, padding: "1px 6px", fontFamily: "var(--font-mono)" },
  sidebarFoot: { marginTop: "auto", fontSize: 10.5, color: "var(--muted)", padding: "10px 6px", lineHeight: 1.5 },
  sidebarDeco: {
    marginTop: 14, marginLeft: -12, marginRight: -12, marginBottom: -20,
    height: 240, backgroundImage: "url('/sidebar-deco.png')", backgroundSize: "cover", backgroundPosition: "bottom center",
    backgroundRepeat: "no-repeat", flexShrink: 0,
  },
  main: { flex: 1, minWidth: 0, padding: "22px 26px", overflowY: "auto", maxHeight: 640 },

  hero: { position: "relative", background: "linear-gradient(135deg, var(--teal-dark), var(--teal))", color: "#fff", borderRadius: 14, padding: "26px 26px", overflow: "hidden", marginBottom: 18 },
  heroGrid: { position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "22px 22px", maskImage: "radial-gradient(ellipse at top right, black, transparent 70%)" },
  heroPhoto: {
    position: "absolute", top: 0, right: 0, bottom: 0, width: "55%",
    backgroundImage: "url('/mpir-hero-bg.png')", backgroundSize: "cover", backgroundPosition: "center",
    WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0) 100%)",
    maskImage: "linear-gradient(to left, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0) 100%)",
    opacity: 0.85, pointerEvents: "none",
  },
  eyebrow: { fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, color: "#DCEEFF", textTransform: "uppercase" },
  h1: { fontFamily: "var(--font-display)", fontSize: 26, margin: "6px 0 4px", fontWeight: 700 },
  heroSub: { fontSize: 13, color: "#E4F0FC", margin: 0 },

  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12, marginBottom: 20 },
  statCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" },
  statTop: { display: "flex", alignItems: "center", gap: 7 },
  statLabel: { fontSize: 12, color: "var(--muted)", fontWeight: 500 },
  statValue: { fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, marginTop: 8 },
  statSub: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 },
  reportDesc: { fontSize: 12, color: "var(--muted)", margin: "8px 0 12px" },

  alertCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 14 },
  panel: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px" },
  panelHead: { display: "flex", alignItems: "center", gap: 7 },
  panelTitle: { fontSize: 13, fontWeight: 600 },
  panelEmpty: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" },
  panelLink: { marginTop: 10, background: "transparent", border: "none", color: "var(--teal)", fontSize: 12, display: "flex", alignItems: "center", gap: 2, padding: 0 },
  alertRow: { display: "flex", gap: 9, alignItems: "flex-start" },
  alertRowTitle: { fontSize: 12.5, fontWeight: 500 },
  alertRowDetail: { fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--font-mono)" },

  beacon: { width: 9, height: 9, borderRadius: "50%", marginTop: 3, flexShrink: 0, display: "inline-block" },
  beaconSm: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block" },

  h2: { fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, margin: 0 },
  h2sub: { fontSize: 12.5, color: "var(--muted)", marginTop: 3 },

  toolbar: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  searchWrap: { display: "flex", alignItems: "center", gap: 7, background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px", flex: 1, minWidth: 200 },
  searchInput: { border: "none", outline: "none", fontSize: 13, flex: 1, background: "transparent" },
  select: { border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#fff" },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, boxShadow: "0 2px 6px rgba(11,79,108,0.28)" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", fontSize: 13 },
  smallBtn: { display: "flex", alignItems: "center", gap: 5, background: "#E9F1FB", color: "var(--teal-dark)", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 12 },
  iconBtn: { background: "transparent", border: "1px solid var(--line)", borderRadius: 7, padding: 6, display: "flex" },
  iconBtnSm: { background: "transparent", border: "1px solid var(--line)", borderRadius: 6, padding: 5, display: "flex" },

  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px,1fr))", gap: 12, alignItems: "stretch" },
  eqCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" },
  eqCardTop: { display: "flex", alignItems: "center", gap: 7 },
  eqCode: { fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 500 },
  eqName: { fontSize: 13, fontWeight: 600, marginTop: 6 },
  eqMeta: { fontSize: 11.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 },
  eqDue: { fontSize: 11.5, marginTop: 8, fontFamily: "var(--font-mono)" },

  emptyState: { textAlign: "center", color: "var(--muted)", fontSize: 12.5, width: "100%" },

  modalOverlay: { position: "fixed", inset: 0, background: "rgba(10,18,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 },
  modalBox: { background: "#fff", borderRadius: 14, width: "100%", maxHeight: "88vh", overflowY: "auto" },
  modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--line)" },
  modalTitle: { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 },
  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  fieldLabel: { fontSize: 11.5, color: "var(--muted)", fontWeight: 500 },
  input: { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%" },

  detailHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  detailName: { fontSize: 15, fontWeight: 600, wordBreak: "break-word" },
  notesBox: { fontSize: 12.5, color: "var(--muted)", background: "#F5F8F7", borderRadius: 8, padding: "8px 10px", marginTop: 8 },
  tag: { fontSize: 11, fontWeight: 600, border: "1px solid", borderRadius: 20, padding: "3px 9px" },
  activityRow: { display: "flex", gap: 12, borderBottom: "1px solid var(--line)", paddingBottom: 8 },
  activityDate: { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", width: 78, flexShrink: 0, paddingTop: 1 },
  activityType: { fontSize: 12.5, fontWeight: 600 },
  activityDetail: { fontSize: 12, color: "var(--muted)", marginTop: 1 },

  tableWrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", fontSize: 11, color: "var(--muted)", fontWeight: 600, padding: "10px 14px", borderBottom: "1px solid var(--line)", textTransform: "uppercase", letterSpacing: 0.3 },
  tr: { borderBottom: "1px solid var(--line)" },
  td: { padding: "11px 14px", fontSize: 13 },
  lowTag: { marginLeft: 8, fontSize: 10.5, color: "var(--amber)", fontWeight: 600 },
  returnTag: { marginLeft: 8, fontSize: 10.5, color: "var(--teal-dark)", fontWeight: 600 },
  returnBadge: {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 12, fontWeight: 700, color: "#fff", background: "var(--amber)",
    borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap",
  },

  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "#fff", padding: "9px 18px", borderRadius: 30, fontSize: 12.5, zIndex: 60 },
};
