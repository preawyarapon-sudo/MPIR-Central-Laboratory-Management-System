import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Wrench, FlaskConical, Package, FileDown,
  Search, Plus, X, Trash2, Pencil, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, MapPin, CalendarClock, ClipboardList,
  CalendarCheck, XCircle, Undo2, Box
} from "lucide-react";

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

/* ---------- booking (จอง/ยืมเครื่องมือ) helpers ---------- */
const BOOKING_TYPE_LABEL = { checkout: "เช็คเอาท์ทันที", reservation: "จองล่วงหน้า" };
const BOOKING_STATUS_LABEL = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
const BOOKING_STATUS_COLOR = { pending: "var(--amber)", approved: "var(--green)", rejected: "var(--red)", cancelled: "var(--muted)" };

// Normalizes a booking into a comparable {start, end} date range. A checkout
// with no returnedAt yet is treated as open-ended (far-future end) so it
// correctly conflicts with anything that would need the equipment later.
function bookingRange(b) {
  if (b.type === "checkout") {
    return { start: b.startDate || todayISO(), end: b.returnedAt || "9999-12-31" };
  }
  return { start: b.startDate || "", end: b.endDate || b.startDate || "" };
}
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}
// Only pending/approved bookings can conflict — rejected/cancelled ones are
// no longer live claims on the equipment.
function findBookingConflicts(bookings, equipmentId, range, excludeId) {
  return bookings.filter((b) => {
    if (b.equipmentId !== equipmentId || b.id === excludeId) return false;
    if (b.status !== "pending" && b.status !== "approved") return false;
    const r = bookingRange(b);
    return rangesOverlap(range.start, range.end, r.start, r.end);
  });
}
// "Currently live" = approved and either an unreturned checkout, or a
// reservation whose date range hasn't fully passed yet. Used to split the
// "current" view from "history" without needing a separate status value.
function isBookingCurrent(b) {
  if (b.status !== "approved") return false;
  if (b.type === "checkout") return !b.returnedAt;
  return (b.endDate || b.startDate || "") >= todayISO();
}
function isBookingOverdue(b) {
  return b.type === "checkout" && b.status === "approved" && !b.returnedAt && b.dueBackDate && daysUntil(b.dueBackDate) < 0;
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
  const availableNow = Math.max(0, qty - activeCheckouts.length);
  if (availableNow <= 0) {
    return { busy: true, text: `ถูกยืมครบแล้ว (${activeCheckouts.length}/${qty})`, color: "var(--red)" };
  }
  if (activeCheckouts.length > 0) {
    return { busy: false, text: `เหลือว่าง ${availableNow}/${qty} ชิ้น`, color: "var(--amber)" };
  }
  const reservations = live.filter((b) => b.type === "reservation");
  if (reservations.length > 0) {
    return { busy: false, text: `ว่าง ${qty} ชิ้น (มีจองล่วงหน้า ${reservations.length} รายการ)`, color: "var(--amber)" };
  }
  return { busy: false, text: `ว่างทั้งหมด ${qty} ชิ้น`, color: "var(--green)" };
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

const NAV = [
  { key: "dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { key: "equipment", label: "เครื่องมือ", icon: Wrench },
  { key: "items", label: "อุปกรณ์", icon: Box },
  { key: "bookings", label: "จอง/ยืมเครื่องมือ", icon: CalendarCheck },
  { key: "chemicals", label: "สารเคมี", icon: FlaskConical },
  { key: "consumables", label: "พัสดุสิ้นเปลือง", icon: Package },
  { key: "purchase", label: "ใบขอซื้อ (PR)", icon: ClipboardList },
  { key: "reports", label: "รายงาน", icon: FileDown },
];

export default function App({ restrictToBooking = false, currentUsername = "" }) {
  const [tab, setTab] = useState(restrictToBooking ? "bookings" : "dashboard");
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [activities, setActivities] = useState([]);
  const [items, setItems] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [toast, setToast] = useState(null);

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

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
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

  const visibleNav = restrictToBooking ? NAV.filter(n => n.key === "bookings") : NAV;

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
              <img src="/logo.png" alt="MPIR Central Lab" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
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
                const count = n.key === "dashboard"
                  ? totalAlertCount
                  : n.key === "bookings"
                  ? alerts.pendingBookings.length
                  : 0;
                return (
                  <button key={n.key} onClick={() => setTab(n.key)} style={{ ...S.navBtn, ...(active ? S.navBtnActive : {}) }} className="ltNavBtn">
                    <Icon size={16} strokeWidth={2} />
                    <span style={{ flex: 1, textAlign: "left" }} className="ltNavBtnLabel">{n.label}</span>
                    {count > 0 && <span style={S.navBadge}>{count}</span>}
                  </button>
                );
              })}
            </nav>
          )}
          <div style={S.sidebarFoot} className="ltSidebarFoot">
            {restrictToBooking ? "บัญชีนี้เข้าถึงได้เฉพาะหน้าจอง/ยืมเครื่องมือ" : "ข้อมูลนี้ใช้ร่วมกันในทีมของคุณ"}
          </div>
        </aside>

        {/* main */}
        <main style={S.main} className="ltMain">
          {restrictToBooking ? (
            <BookingsTab bookings={bookings} setBookings={persist.bookings} equipment={equipment} items={items} notify={notify}
              restrictToBooking currentUsername={currentUsername} />
          ) : (
            <>
              {tab === "dashboard" && (
                <Dashboard equipment={equipment} chemicals={chemicals} consumables={consumables} bookings={bookings} alerts={alerts} goto={setTab} />
              )}
              {tab === "equipment" && (
                <EquipmentTab equipment={equipment} setEquipment={persist.equipment}
                  activities={activities} setActivities={persist.activities}
                  bookings={bookings} setBookings={persist.bookings} items={items} notify={notify} />
              )}
              {tab === "items" && (
                <ItemsTab items={items} setItems={persist.items} bookings={bookings} setBookings={persist.bookings} equipment={equipment} notify={notify} />
              )}
              {tab === "bookings" && (
                <BookingsTab bookings={bookings} setBookings={persist.bookings} equipment={equipment} items={items} notify={notify} />
              )}
              {tab === "chemicals" && (
                <ChemicalsTab chemicals={chemicals} setChemicals={persist.chemicals} notify={notify} />
              )}
              {tab === "consumables" && (
                <ConsumablesTab consumables={consumables} setConsumables={persist.consumables} notify={notify} />
              )}
              {tab === "purchase" && (
                <PurchaseRequestsTab requests={purchaseRequests} setRequests={persist.purchaseRequests} notify={notify} />
              )}
              {tab === "reports" && (
                <ReportsTab equipment={equipment} activities={activities} chemicals={chemicals} consumables={consumables} purchaseRequests={purchaseRequests} />
              )}
            </>
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
              ? alerts.pendingBookings.length
              : 0;
            return (
              <button key={n.key} onClick={() => setTab(n.key)} className="ltBottomNavBtn" style={{ color: active ? "var(--teal-dark)" : "var(--muted)" }}>
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
function Dashboard({ equipment, chemicals, consumables, bookings, alerts, goto }) {
  const activeCount = equipment.filter(e => e.status === "active").length;
  const stats = [
    { label: "เครื่องมือทั้งหมด", value: equipment.length, sub: `${activeCount} ใช้งานอยู่`, icon: Wrench, tint: "#E9F1FB", color: "var(--teal)", goto: "equipment" },
    { label: "คำขอจอง/ยืมรออนุมัติ", value: alerts.pendingBookings.length, sub: `${bookings.filter(isBookingCurrent).length} รายการกำลังใช้งาน/จองอยู่`, icon: CalendarCheck, tint: "#FDF3E3", color: "var(--amber)", goto: "bookings" },
    { label: "รายการสารเคมี", value: chemicals.length, sub: `${alerts.expiry.length} ใกล้/เลยหมดอายุ`, icon: FlaskConical, tint: "#FBE9E4", color: "#D9622E", goto: "chemicals" },
    { label: "พัสดุสิ้นเปลือง", value: consumables.length, sub: `${alerts.lowStock.length} ใกล้หมด`, icon: Package, tint: "#F0EAFB", color: "#7A4FC2", goto: "consumables" },
    { label: "รายการที่ต้องติดตาม", value: alerts.calib.length + alerts.expiry.length + alerts.lowStock.length + alerts.lowChem.length + alerts.pendingBookings.length + alerts.overdueBookings.length, sub: "รวมทุกประเภท", icon: AlertTriangle, tint: "#FBE4E1", color: "var(--red)", goto: null },
  ];

  const calibOk = equipment.filter(e => statusOf(daysUntil(e.nextDue)) === "ok" && e.nextDue).length;
  const calibWarn = alerts.calib.filter(x => x.st === "warn").length;
  const calibDanger = alerts.calib.filter(x => x.st === "danger").length;

  return (
    <div>
      <div style={S.hero} className="ltHero">
        <div style={S.heroGrid} />
        <div style={{ position: "relative" }}>
          <div style={S.eyebrow}>ภาพรวมวันนี้ · {fmtDate(todayISO())}</div>
          <h1 style={S.h1} className="ltH1">สถานะห้องปฏิบัติการ</h1>
          <p style={S.heroSub}>ติดตามกำหนดสอบเทียบ อายุสารเคมี และพัสดุใกล้หมด ในที่เดียว</p>
        </div>
      </div>

      <div style={S.statGrid}>
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

      {equipment.length > 0 && (
        <div style={{ ...S.panel, marginBottom: 20 }}>
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

function CalibrationDonut({ ok, warn, danger }) {
  const total = ok + warn + danger;
  const segs = [
    { value: ok, color: "var(--green)", label: "ปกติ" },
    { value: warn, color: "var(--amber)", label: "ใกล้ถึงกำหนด" },
    { value: danger, color: "var(--red)", label: "เลยกำหนด" },
  ];
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
        <text x="55" y="67" textAnchor="middle" fontSize="9" fill="var(--muted)">ทั้งหมด</text>
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
      return matchQ && matchS && matchT;
    })
    .slice()
    .sort((a, b) => alphaCompare(a.code, b.code));

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

  function importItems(items) {
    const newItems = items.map(it => ({
      id: uid(), code: it.code, name: it.name, brand: it.brand || "", model: it.model || "", serialNo: it.serialNo || "",
      type: it.type || "", location: it.location || "",
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
        <button style={S.ghostBtn} onClick={() => setShowImport(true)}>
          <FileDown size={14} style={{ transform: "rotate(180deg)", marginRight: 4 }} /> นำเข้ารายการ
        </button>
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), code: "", name: "", brand: "", model: "", serialNo: "", type: "", location: "", status: "active", lastCalibration: "", nextDue: "", intervalMonths: "", notes: "", imageUrl: "" })}>
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
            <div key={e.id} style={{ ...S.eqCard, display: "flex", flexDirection: "column", gap: 0, padding: 0, overflow: "hidden" }} onClick={() => setSelected(e.id)}>
              {e.imageUrl ? (
                <img src={e.imageUrl} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }}
                  style={{ width: "100%", height: 140, objectFit: "contain", background: "#EEF2F6", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: 140, background: "linear-gradient(135deg, #E9F1FB, #F5F8FC)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Wrench size={34} color="#B9C7D6" />
                </div>
              )}
              <div style={{ padding: "10px 14px 12px" }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 11.5, fontWeight: 600, color: bk.color }}>
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
          onSave={(b) => {
            setBookings([{ ...b, id: uid(), status: "pending", requestedAt: new Date().toISOString() }, ...bookings]);
            notify("ส่งคำขอจอง/ยืมแล้ว รออนุมัติ");
            setBookingFor(null);
          }}
        />
      )}
    </div>
  );
}

function EquipmentForm({ item, onCancel, onSave }) {
  const [f, setF] = useState(item);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [imgError, setImgError] = useState(false);
  return (
    <Modal onClose={onCancel} title={item.code ? "แก้ไขเครื่องมือ" : "เพิ่มเครื่องมือใหม่"}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="รหัสเครื่องมือ"><input style={S.input} value={f.code} onChange={set("code")} placeholder="เช่น MPIR-006" /></Field>
        <Field label="ชื่อเครื่องมือ"><input style={S.input} value={f.name} onChange={set("name")} placeholder="เช่น เครื่องชั่ง 3 ตำแหน่ง" /></Field>
        <Field label="ยี่ห้อ"><input style={S.input} value={f.brand || ""} onChange={set("brand")} placeholder="เช่น Mitsubishi Electric" /></Field>
        <Field label="รุ่น (Model)"><input style={S.input} value={f.model || ""} onChange={set("model")} placeholder="เช่น SRK24CYV-W1" /></Field>
        <Field label="หมายเลขเครื่อง (Serial No.)"><input style={S.input} value={f.serialNo || ""} onChange={set("serialNo")} /></Field>
        <Field label="ประเภท"><input style={S.input} value={f.type} onChange={set("type")} placeholder="เช่น เครื่องชั่ง" /></Field>
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
        <Field label="ลิงก์รูปภาพเครื่องมือ" full>
          <input
            style={S.input}
            value={f.imageUrl || ""}
            onChange={(e) => { setImgError(false); setF({ ...f, imageUrl: e.target.value }); }}
            placeholder="วางลิงก์รูปภาพ เช่น https://..."
          />
          {f.imageUrl && (
            imgError ? (
              <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 6 }}>โหลดรูปภาพจากลิงก์นี้ไม่ได้ กรุณาตรวจสอบลิงก์</div>
            ) : (
              <img
                src={f.imageUrl}
                alt=""
                onError={() => setImgError(true)}
                style={{ width: "100%", maxHeight: 160, objectFit: "contain", background: "#EEF2F6", borderRadius: 8, marginTop: 8, border: "1px solid var(--line)" }}
              />
            )
          )}
        </Field>
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

function EquipmentDetail({ item, activities, bookings, onClose, onEdit, onDelete, onBook, onAddActivity, onEditActivity, onDeleteActivity }) {
  const [showAct, setShowAct] = useState(false);
  const [editingAct, setEditingAct] = useState(null);
  const [activityFilter, setActivityFilter] = useState("all");
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
        <img src={item.imageUrl} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }}
          style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "#EEF2F6", borderRadius: 10, marginBottom: 14 }} />
      )}
      <div style={S.detailHead}>
        <div>
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
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.smallBtn} onClick={onBook}><CalendarCheck size={13} /> จอง/ยืม</button>
          <button style={S.iconBtn} onClick={onEdit}><Pencil size={14} /></button>
          <button style={{ ...S.iconBtn, color: "var(--red)" }} onClick={onDelete}><Trash2 size={14} /></button>
        </div>
      </div>
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
                <Tag color={BOOKING_STATUS_COLOR[b.status]}>{BOOKING_STATUS_LABEL[b.status]}</Tag>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
        <div style={S.panelTitle}>ประวัติกิจกรรม</div>
        <button style={S.smallBtn} onClick={() => setShowAct(true)}><Plus size={13} /> บันทึกกิจกรรม</button>
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
                {a.detail}{a.by ? ` · โดย ${a.by}` : ""}{a.poNo ? ` · PO: ${a.poNo}` : ""}
              </div>
              {a.certUrl && (
                <a href={a.certUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--teal)", marginTop: 4 }}>
                  <FileDown size={11} /> ดูใบ Certificate
                </a>
              )}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={S.iconBtnSm} onClick={() => setEditingAct(a)}><Pencil size={12} /></button>
              <button style={{ ...S.iconBtnSm, color: "var(--red)" }} onClick={() => onDeleteActivity(a.id)}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      {showAct && (
        <ActivityForm onCancel={() => setShowAct(false)} onSave={(act) => { onAddActivity(act); setShowAct(false); }} />
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
  const [f, setF] = useState(initial
    ? { date: initial.date, type: initial.type, detail: initial.detail || "", by: initial.by || "", poNo: initial.poNo || "", certUrl: initial.certUrl || "" }
    : { date: todayISO(), type: "calibration", detail: "", by: "", poNo: "", certUrl: "" });
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
  const [bookingFor, setBookingFor] = useState(null);

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
  }

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
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), code: "", name: "", category: "", location: "", status: "active", totalQty: 1, notes: "" })}>
          <Plus size={15} /> เพิ่มอุปกรณ์
        </button>
      </Toolbar>

      <Table
        cols={["ชื่ออุปกรณ์", "ประเภท / ตำแหน่ง", "จำนวน", "สถานะการยืม", ""]}
        rows={filtered.map(i => {
          const bk = itemBookingSummary(i.id, bookings, i.totalQty);
          return [
            <div>
              <div style={{ fontWeight: 600 }}>{i.name}</div>
              {i.code && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{i.code}</div>}
            </div>,
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{i.category || "-"} · {i.location || "-"}</div>,
            <span style={{ fontFamily: "var(--font-mono)" }}>{i.totalQty || 1} ชิ้น</span>,
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: bk.color }}>
              <CalendarCheck size={12} /> {bk.text}
            </div>,
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
              <button style={S.smallBtn} onClick={() => setBookingFor(i)}><CalendarCheck size={13} /> จอง/ยืม</button>
              <RowActions onEdit={() => setEditing(i)} onDelete={() => remove(i.id)} />
            </div>,
          ];
        })}
        empty="ยังไม่มีข้อมูลอุปกรณ์"
      />

      {editing && <ItemForm item={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
      {bookingFor && (
        <BookingForm
          equipment={equipment}
          items={items}
          initialAssetType="item"
          initialEquipmentId={bookingFor.id}
          bookings={bookings}
          setBookings={setBookings}
          onCancel={() => setBookingFor(null)}
          onSave={(b) => {
            setBookings([{ ...b, id: uid(), status: "pending", requestedAt: new Date().toISOString() }, ...bookings]);
            notify("ส่งคำขอจอง/ยืมแล้ว รออนุมัติ");
            setBookingFor(null);
          }}
        />
      )}
    </div>
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
          <input type="number" min="1" style={S.input} value={f.totalQty || 1} onChange={(e) => setF({ ...f, totalQty: Number(e.target.value) || 1 })} />
        </Field>
        <Field label="สถานะ">
          <select style={S.input} value={f.status} onChange={set("status")}>
            <option value="active">ใช้งานอยู่</option>
            <option value="maintenance">ซ่อมบำรุง</option>
            <option value="inactive">ปิดใช้งาน</option>
          </select>
        </Field>
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
function BookingsTab({ bookings, setBookings, equipment, items = [], notify, restrictToBooking = false, currentUsername = "" }) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [view, setView] = useState("pending"); // "pending" | "current" | "history"
  const [showForm, setShowForm] = useState(false);
  const [actorName, setActorName] = useState("");

  // Restricted (booking-only) accounts can see THAT other bookings exist
  // (via the conflict warning inside BookingForm, which always checks the
  // full unfiltered list) but the tables here only ever show their own
  // requests — everyone else's requester names/purposes stay out of view.
  const ownOnly = restrictToBooking
    ? bookings.filter(b => b.requestedBy === currentUsername)
    : bookings;

  const withMeta = (list) => list.filter(b => {
    const matchQ = (b.equipmentCode + b.equipmentName + (b.requestedBy || "") + (b.purpose || "")).toLowerCase().includes(q.toLowerCase());
    const matchT = typeFilter === "all" || b.type === typeFilter;
    return matchQ && matchT;
  });

  const pending = withMeta(ownOnly.filter(b => b.status === "pending")).sort((a, b) => (a.requestedAt || "").localeCompare(b.requestedAt || ""));
  const current = withMeta(ownOnly.filter(isBookingCurrent)).sort((a, b) => bookingRange(a).start.localeCompare(bookingRange(b).start));
  const history = withMeta(ownOnly.filter(b => !isBookingCurrent(b) && b.status !== "pending")).sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));

  const shown = view === "pending" ? pending : view === "current" ? current : history;

  function update(id, patch) {
    setBookings(bookings.map(b => b.id === id ? { ...b, ...patch } : b));
  }
  function approve(b) {
    update(b.id, { status: "approved", approvedBy: actorName || "-", approvedAt: new Date().toISOString() });
    notify("อนุมัติคำขอแล้ว");
  }
  function reject(b) {
    update(b.id, { status: "rejected", approvedBy: actorName || "-", approvedAt: new Date().toISOString() });
    notify("ปฏิเสธคำขอแล้ว");
  }
  function cancel(b) {
    update(b.id, { status: "cancelled" });
    notify("ยกเลิกรายการแล้ว");
  }
  function markReturned(b) {
    update(b.id, { returnedAt: todayISO(), returnedBy: actorName || currentUsername || "-" });
    notify("บันทึกการคืนแล้ว");
  }

  function create(b) {
    setBookings([{ ...b, id: uid(), status: "pending", requestedAt: new Date().toISOString() }, ...bookings]);
    notify("ส่งคำขอจอง/ยืมแล้ว รออนุมัติ");
    setShowForm(false);
  }

  return (
    <div>
      <TabHeader
        title="จอง/ยืมเครื่องมือ"
        sub={restrictToBooking
          ? "ขอใช้เครื่องมือแบบเช็คเอาท์ทันทีหรือจองล่วงหน้า — แสดงเฉพาะคำขอของคุณ (ระบบยังเช็คให้ว่าชนกับของคนอื่นไหมตอนสร้างคำขอ)"
          : "ขอใช้เครื่องมือแบบเช็คเอาท์ทันทีหรือจองล่วงหน้า — ทุกคำขอต้องผ่านการอนุมัติก่อน"}
      />

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
        <ViewTab active={view === "current"} onClick={() => setView("current")} label="กำลังใช้งาน/จองอยู่" count={current.length} />
        <ViewTab active={view === "history"} onClick={() => setView("history")} label="ประวัติ" count={history.length} />
      </div>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาเครื่องมือ, ผู้จอง, วัตถุประสงค์..." />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกประเภท</option>
          <option value="checkout">เช็คเอาท์ทันที</option>
          <option value="reservation">จองล่วงหน้า</option>
        </select>
        <button style={S.primaryBtn} onClick={() => setShowForm(true)}>
          <Plus size={15} /> จอง/ยืมเครื่องมือ
        </button>
      </Toolbar>

      <Table
        cols={["รายการที่ยืม", "ประเภท / ช่วงเวลา", "ผู้จอง / วัตถุประสงค์", "สถานะ", ""]}
        rows={shown.map(b => [
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontWeight: 600 }}>{b.equipmentCode || b.equipmentName}</span>
              <Tag color={b.assetType === "item" ? "#7A4FC2" : "var(--teal)"}>{b.assetType === "item" ? "อุปกรณ์" : "เครื่องมือ"}</Tag>
            </div>
            {b.equipmentCode && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{b.equipmentName}</div>}
          </div>,
          <div>
            <div>{BOOKING_TYPE_LABEL[b.type]}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
              {b.type === "checkout"
                ? `${fmtDate(b.startDate)}${b.returnedAt ? ` → คืนแล้ว ${fmtDate(b.returnedAt)}` : b.dueBackDate ? ` · กำหนดคืน ${fmtDate(b.dueBackDate)}` : ""}`
                : `${fmtDate(b.startDate)}${b.endDate && b.endDate !== b.startDate ? ` - ${fmtDate(b.endDate)}` : ""}${b.startTime ? ` · ${b.startTime}${b.endTime ? `-${b.endTime}` : ""}` : ""}`}
            </div>
            {isBookingOverdue(b) && <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 700, marginTop: 2 }}>เลยกำหนดคืน {Math.abs(daysUntil(b.dueBackDate))} วัน</div>}
          </div>,
          <div>
            <div style={{ fontWeight: 600 }}>{b.requestedBy || "-"}</div>
            {b.purpose && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{b.purpose}</div>}
          </div>,
          <div>
            <Tag color={BOOKING_STATUS_COLOR[b.status]}>{BOOKING_STATUS_LABEL[b.status]}</Tag>
            {b.status !== "pending" && b.approvedBy && (
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>โดย {b.approvedBy}</div>
            )}
          </div>,
          <BookingActions
            booking={b}
            canApprove={!restrictToBooking}
            onApprove={() => approve(b)}
            onReject={() => reject(b)}
            onCancel={() => cancel(b)}
            onReturn={() => markReturned(b)}
          />,
        ])}
        empty={
          view === "pending" ? (restrictToBooking ? "คุณยังไม่มีคำขอที่รออนุมัติ" : "ไม่มีคำขอรออนุมัติ")
          : view === "current" ? "ไม่มีรายการที่กำลังใช้งานหรือจองอยู่"
          : "ยังไม่มีประวัติ"
        }
      />

      {showForm && (
        <BookingForm
          equipment={equipment}
          items={items}
          bookings={bookings}
          setBookings={setBookings}
          fixedRequestedBy={restrictToBooking ? currentUsername : null}
          onCancel={() => setShowForm(false)}
          onSave={create}
        />
      )}
    </div>
  );
}

function BookingActions({ booking: b, canApprove, onApprove, onReject, onCancel, onReturn }) {
  if (b.status === "pending") {
    return (
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        {canApprove && (
          <>
            <button style={{ ...S.iconBtnSm, color: "var(--green)" }} title="อนุมัติ" onClick={onApprove}><CheckCircle2 size={14} /></button>
            <button style={{ ...S.iconBtnSm, color: "var(--red)" }} title="ปฏิเสธ" onClick={onReject}><XCircle size={14} /></button>
          </>
        )}
        <button style={S.iconBtnSm} title="ยกเลิกคำขอ" onClick={onCancel}><Trash2 size={13} /></button>
      </div>
    );
  }
  if (b.status === "approved" && b.type === "checkout" && !b.returnedAt) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        <button style={S.smallBtn} onClick={onReturn}><Undo2 size={13} /> บันทึกคืนแล้ว</button>
      </div>
    );
  }
  if (b.status === "approved" && isBookingCurrent(b)) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
        <button style={S.iconBtnSm} title="ยกเลิกการจอง" onClick={onCancel}><Trash2 size={13} /></button>
      </div>
    );
  }
  return null;
}

function BookingForm({ equipment, items = [], bookings, setBookings, initialEquipmentId, initialAssetType, fixedRequestedBy, onCancel, onSave }) {
  const activeEquipment = equipment.filter(e => e.status !== "inactive").slice().sort((a, b) => alphaCompare(a.code, b.code));
  const activeItems = items.filter(i => i.status !== "inactive").slice().sort((a, b) => alphaCompare(a.name, b.name));
  const firstAssetType = initialAssetType || "equipment";
  const firstAssetId = initialEquipmentId || (firstAssetType === "item" ? activeItems[0]?.id : activeEquipment[0]?.id) || "";
  const [f, setF] = useState({
    assetType: firstAssetType,
    equipmentId: firstAssetId,
    type: "checkout",
    startDate: todayISO(),
    endDate: todayISO(),
    startTime: "",
    endTime: "",
    dueBackDate: "",
    requestedBy: fixedRequestedBy || "",
    purpose: "",
  });
  const [showAllConflicts, setShowAllConflicts] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const eq = f.assetType === "item" ? items.find(i => i.id === f.equipmentId) : equipment.find(e => e.id === f.equipmentId);

  function pickAsset(assetType, assetId) {
    setF({ ...f, assetType, equipmentId: assetId });
  }

  const range = f.type === "checkout"
    ? { start: f.startDate || todayISO(), end: "9999-12-31" }
    : { start: f.startDate || "", end: f.endDate || f.startDate || "" };
  const conflicts = f.equipmentId ? findBookingConflicts(bookings, f.equipmentId, range, null) : [];
  const shownConflicts = showAllConflicts ? conflicts : conflicts.slice(0, 5);

  // fixedRequestedBy set = a restricted (booking-only) account, who can only
  // cancel/return their OWN conflicting bookings from this list; no
  // fixedRequestedBy = an admin, who can manage anyone's.
  const canManage = (c) => !!setBookings && (!fixedRequestedBy || c.requestedBy === fixedRequestedBy);
  function cancelConflict(c) {
    setBookings(bookings.map(b => b.id === c.id ? { ...b, status: "cancelled" } : b));
  }
  function returnConflict(c) {
    setBookings(bookings.map(b => b.id === c.id ? { ...b, returnedAt: todayISO(), returnedBy: fixedRequestedBy || "-" } : b));
  }

  const canSave = f.equipmentId && f.requestedBy.trim() && (f.type === "checkout" ? f.startDate : (f.startDate && f.endDate && f.endDate >= f.startDate));

  function submit() {
    if (!eq) return;
    onSave({
      equipmentId: f.equipmentId,
      equipmentCode: eq.code || "",
      equipmentName: eq.name,
      assetType: f.assetType,
      type: f.type,
      startDate: f.startDate,
      endDate: f.type === "reservation" ? f.endDate : null,
      startTime: f.type === "reservation" ? f.startTime : "",
      endTime: f.type === "reservation" ? f.endTime : "",
      dueBackDate: f.type === "checkout" ? f.dueBackDate : "",
      requestedBy: f.requestedBy.trim(),
      purpose: f.purpose.trim(),
    });
  }

  return (
    <Modal onClose={onCancel} title="จอง/ยืมเครื่องมือ">
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="เครื่องมือ / อุปกรณ์" full>
          <select
            style={S.input}
            value={`${f.assetType}:${f.equipmentId}`}
            onChange={(e) => {
              const [assetType, assetId] = e.target.value.split(":");
              pickAsset(assetType, assetId);
            }}
          >
            {activeEquipment.length > 0 && (
              <optgroup label="เครื่องมือ">
                {activeEquipment.map(e => <option key={e.id} value={`equipment:${e.id}`}>{e.code} · {e.name}</option>)}
              </optgroup>
            )}
            {activeItems.length > 0 && (
              <optgroup label="อุปกรณ์">
                {activeItems.map(i => <option key={i.id} value={`item:${i.id}`}>{i.name}{i.totalQty > 1 ? ` (มี ${i.totalQty} ชิ้น)` : ""}</option>)}
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="รูปแบบ" full>
          <div style={{ display: "flex", gap: 8 }}>
            {["checkout", "reservation"].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setF({ ...f, type: t })}
                style={{
                  flex: 1, padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13, fontWeight: 600,
                  background: f.type === t ? "#E9F1FB" : "var(--bg2, #F7F9FB)",
                  border: `1px solid ${f.type === t ? "var(--teal)" : "var(--line)"}`,
                  color: f.type === t ? "var(--teal-dark)" : "var(--muted)",
                }}
              >
                {BOOKING_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>

        {f.type === "checkout" ? (
          <>
            <Field label="วันที่เริ่มใช้"><input type="date" style={S.input} value={f.startDate} onChange={set("startDate")} /></Field>
            <Field label="กำหนดคืน (ถ้ามี)"><input type="date" style={S.input} value={f.dueBackDate} onChange={set("dueBackDate")} /></Field>
          </>
        ) : (
          <>
            <Field label="วันที่เริ่มจอง"><input type="date" style={S.input} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate })} /></Field>
            <Field label="วันที่สิ้นสุด"><input type="date" style={S.input} value={f.endDate} min={f.startDate} onChange={set("endDate")} /></Field>
            <Field label="เวลาเริ่ม (ถ้ามี)"><input type="time" style={S.input} value={f.startTime} onChange={set("startTime")} /></Field>
            <Field label="เวลาสิ้นสุด (ถ้ามี)"><input type="time" style={S.input} value={f.endTime} onChange={set("endTime")} /></Field>
          </>
        )}

        <Field label="ผู้จอง/ยืม">
          {fixedRequestedBy ? (
            <div style={{ ...S.input, background: "#F5F8F7", color: "var(--muted)", display: "flex", alignItems: "center" }}>{fixedRequestedBy}</div>
          ) : (
            <input style={S.input} value={f.requestedBy} onChange={set("requestedBy")} placeholder="ชื่อ-นามสกุล" />
          )}
        </Field>
        <Field label="วัตถุประสงค์/งานที่ใช้" full><textarea style={{ ...S.input, minHeight: 60 }} value={f.purpose} onChange={set("purpose")} /></Field>
      </div>

      {conflicts.length > 0 && (
        <div style={{ ...S.notesBox, border: "1px solid var(--amber)", background: "#FDF3E3", marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "var(--amber)", fontSize: 12.5 }}>
            <AlertTriangle size={13} /> ช่วงเวลานี้ชนกับการจอง/ยืมอื่น ({conflicts.length} รายการ){f.assetType === "item" && eq?.totalQty > 1 ? ` — มีอุปกรณ์นี้ทั้งหมด ${eq.totalQty} ชิ้น` : ""}
          </div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            {shownConflicts.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--ink)" }}>
                <span>
                  {BOOKING_STATUS_LABEL[c.status]} · {BOOKING_TYPE_LABEL[c.type]} โดย {c.requestedBy || "-"}
                  {" "}({fmtDate(bookingRange(c).start)}{bookingRange(c).end !== "9999-12-31" ? ` - ${fmtDate(bookingRange(c).end)}` : " เป็นต้นไป"})
                </span>
                {canManage(c) && (
                  <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {c.status === "pending" && (
                      <button type="button" onClick={() => cancelConflict(c)} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, cursor: "pointer", background: "transparent", color: "var(--red)", border: "1px solid var(--red)" }}>
                        ยกเลิก
                      </button>
                    )}
                    {c.status === "approved" && c.type === "checkout" && !c.returnedAt && (
                      <button type="button" onClick={() => returnConflict(c)} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, cursor: "pointer", background: "transparent", color: "var(--green)", border: "1px solid var(--green)" }}>
                        ใช้งานเสร็จแล้ว
                      </button>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
          {conflicts.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllConflicts(x => !x)}
              style={{ fontSize: 12, color: "var(--teal-dark)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 8, fontWeight: 600, textDecoration: "underline" }}
            >
              {showAllConflicts ? "ย่อกลับ" : `+${conflicts.length - 5} รายการเพิ่มเติม`}
            </button>
          )}
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
            ยังส่งคำขอได้ — ผู้อนุมัติจะเห็นความชนกันนี้ตอนพิจารณาด้วย
          </div>
        </div>
      )}

      <ModalFooter onCancel={onCancel} onSave={submit} disabled={!canSave} />
    </Modal>
  );
}

/* ================= CHEMICALS ================= */
function ChemicalsTab({ chemicals, setChemicals, notify }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const filtered = chemicals
    .filter(c => (c.name + (c.formula || "") + (c.brand || "") + c.location).toLowerCase().includes(q.toLowerCase()))
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

  const selectedItem = chemicals.find(c => c.id === selected);

  return (
    <div>
      <TabHeader title="สต็อคสารเคมี" sub="ติดตามปริมาณคงเหลือและวันหมดอายุ · เรียงตามตัวอักษร" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อสาร, ตำแหน่ง..." />
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
          return [
            <div>
              <RowTitle beacon={low ? (c.quantity <= 0 ? "var(--red)" : "var(--amber)") : "transparent"} text={c.name} />
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
        />
      )}
    </div>
  );
}

function ChemicalDetail({ item, onClose, onEdit, onDelete, onAddTransaction, onEditTransaction, onDeleteTransaction }) {
  const [showForm, setShowForm] = useState(null); // "receive" | "withdraw" | null
  const [editingTx, setEditingTx] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("all");
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
        <div>
          <div style={S.detailName}>{item.name}</div>
          {(item.formula || item.brand) && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {[item.formula, item.brand].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={S.eqMeta}><MapPin size={12} /> {item.location || "-"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.iconBtn} onClick={onEdit}><Pencil size={14} /></button>
          <button style={{ ...S.iconBtn, color: "var(--red)" }} onClick={onDelete}><Trash2 size={14} /></button>
        </div>
      </div>
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
          {shownTxs.map(t => (
            <div key={t.id} style={{ ...S.activityRow, alignItems: "center" }}>
              <div style={S.activityDate}>{fmtDate(t.date)}</div>
              <div style={{ flex: 1 }}>
                <div style={S.activityType}>
                  <span style={{ color: t.type === "receive" ? "var(--green)" : "var(--red)" }}>
                    {t.type === "receive" ? `รับเข้า +${t.qty} ${item.unit}` : `เบิกใช้ -${t.qty} ${item.unit}`}
                  </span>
                </div>
                <div style={S.activityDetail}>
                  {t.type === "receive"
                    ? [t.poNo ? `PO: ${t.poNo}` : null, t.expiryDate ? `หมดอายุ: ${fmtDate(t.expiryDate)}` : null].filter(Boolean).join(" · ")
                    : (t.by ? `ผู้เบิก: ${t.by}` : "")}
                  {t.note ? ` · ${t.note}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={S.iconBtnSm} onClick={() => setEditingTx(t)}><Pencil size={12} /></button>
                <button style={{ ...S.iconBtnSm, color: "var(--red)" }} onClick={() => onDeleteTransaction(t.id)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

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
    ? { date: initial.date, qty: String(initial.qty), poNo: initial.poNo || "", expiryDate: initial.expiryDate || "", by: initial.by || "", note: initial.note || "" }
    : { date: todayISO(), qty: "", poNo: "", expiryDate: "", by: "", note: "" });
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
      </div>
      {wouldGoNegative && (
        <div style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>
          จำนวนที่เบิกมากกว่าคงเหลือ ({baseQty} {item.unit}) — ระบบจะปรับคงเหลือเป็น 0
        </div>
      )}
      <ModalFooter
        onCancel={onCancel}
        onSave={() => onSave({ id: initial?.id, type, date: f.date, qty: qtyNum, poNo: f.poNo, expiryDate: f.expiryDate, by: f.by, note: f.note })}
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
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const filtered = consumables
    .filter(s => s.name.toLowerCase().includes(q.toLowerCase()))
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

  const selectedItem = consumables.find(s => s.id === selected);

  return (
    <div>
      <TabHeader title="พัสดุสิ้นเปลือง" sub="ติดตามปริมาณคงเหลือของวัสดุใช้แล้วหมดไป" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อพัสดุ..." />
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
          return [
            <RowTitle beacon={low ? (s.quantity <= 0 ? "var(--red)" : "var(--amber)") : "transparent"} text={s.name} />,
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

function ConsumableDetail({ item, onClose, onEdit, onDelete, onAddTransaction, onEditTransaction, onDeleteTransaction }) {
  const [showForm, setShowForm] = useState(null); // "receive" | "withdraw" | null
  const [editingTx, setEditingTx] = useState(null); // transaction being edited, or null
  const [historyFilter, setHistoryFilter] = useState("all"); // "all" | "receive" | "withdraw"
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
        <div style={S.detailName}>{item.name}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.iconBtn} onClick={onEdit}><Pencil size={14} /></button>
          <button style={{ ...S.iconBtn, color: "var(--red)" }} onClick={onDelete}><Trash2 size={14} /></button>
        </div>
      </div>
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
          {shownTxs.map(t => (
            <div key={t.id} style={{ ...S.activityRow, alignItems: "center" }}>
              <div style={S.activityDate}>{fmtDate(t.date)}</div>
              <div style={{ flex: 1 }}>
                <div style={S.activityType}>
                  <span style={{ color: t.type === "receive" ? "var(--green)" : "var(--red)" }}>
                    {t.type === "receive" ? `รับเข้า +${t.qty} ${item.unit}` : `เบิกใช้ -${t.qty} ${item.unit}`}
                  </span>
                </div>
                <div style={S.activityDetail}>
                  {t.type === "receive" && t.poNo ? `PO: ${t.poNo}` : t.type === "withdraw" && t.by ? `ผู้เบิก: ${t.by}` : ""}
                  {t.note ? ` · ${t.note}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={S.iconBtnSm} onClick={() => setEditingTx(t)}><Pencil size={12} /></button>
                <button style={{ ...S.iconBtnSm, color: "var(--red)" }} onClick={() => onDeleteTransaction(t.id)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

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
    ? { date: initial.date, qty: String(initial.qty), poNo: initial.poNo || "", by: initial.by || "", note: initial.note || "" }
    : { date: todayISO(), qty: "", poNo: "", by: "", note: "" });
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
      </div>
      {wouldGoNegative && (
        <div style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>
          จำนวนที่เบิกมากกว่าคงเหลือ ({baseQty} {item.unit}) — ระบบจะปรับคงเหลือเป็น 0
        </div>
      )}
      <ModalFooter
        onCancel={onCancel}
        onSave={() => onSave({ id: initial?.id, type, date: f.date, qty: qtyNum, poNo: f.poNo, by: f.by, note: f.note })}
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

function PurchaseRequestsTab({ requests, setRequests, notify }) {
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [view, setView] = useState("active"); // "active" | "history"
  const [editing, setEditing] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const activeCount = requests.filter(r => !isPRFullyReceived(r)).length;
  const historyCount = requests.filter(r => isPRFullyReceived(r)).length;

  const filtered = requests
    .filter(r => (r.prNo + getPRItems(r).map(i => i.text).join(" ") + r.requestedBy + (r.poNo || "")).toLowerCase().includes(q.toLowerCase()))
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
      <TabHeader title="ใบขอซื้อ (PR)" sub="บันทึกรายการที่สั่งซื้อ/ออก PR ทั้งสารเคมี พัสดุ และซ่อมบำรุงเครื่องมือ · 1 PR = 1 PO" />
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
            {r.poNo && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>PO: {r.poNo}</div>}
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

function ViewTab({ active, onClick, label, count }) {
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
  const [f, setF] = useState({ ...item, categories: item.categories || [] });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleCategory = (key) => {
    setF({
      ...f,
      categories: f.categories.includes(key) ? f.categories.filter(c => c !== key) : [...f.categories, key],
    });
  };
  return (
    <Modal onClose={onCancel} title={item.itemName ? "แก้ไขใบขอซื้อ" : "ออกใบขอซื้อ (PR)"}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="เลขที่ PR"><input style={S.input} value={f.prNo} onChange={set("prNo")} placeholder="เช่น PR-2569-0045" /></Field>
        <Field label="วันที่ออก PR"><input type="date" style={S.input} value={f.date} onChange={set("date")} /></Field>
        <Field label="หมวดหมู่ (เลือกได้มากกว่า 1 ถ้าสั่งรวมกัน)" full>
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
        <Field label="เลขที่ PO (ถ้ามี)"><input style={S.input} value={f.poNo} onChange={set("poNo")} placeholder="กรอกภายหลังเมื่อได้รับ PO" /></Field>
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
    activities.map(a => [equipment.find(e => e.id === a.equipmentId)?.code || a.equipmentId, a.date, a.type, a.detail, a.by, a.poNo || "", a.certUrl || ""]),
    ["รหัสเครื่องมือ", "วันที่", "ประเภท", "รายละเอียด", "ผู้ดำเนินการ", "เลขที่ PO", "ลิงก์ Certificate"]
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
      getPRItems(r).forEach(it => {
        rows.push([r.prNo, r.date, cats, it.text, it.received ? "ได้รับแล้ว" : "ยังไม่ได้รับ", it.receivedDate || "", r.poNo || "", r.requestedBy, r.notes || ""]);
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
function Field({ label, children, full }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : "auto" }}>
    <span style={S.fieldLabel}>{label}</span>{children}
  </label>;
}
function Modal({ title, children, onClose, wide }) {
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modalBox, maxWidth: wide ? 620 : 480 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{title}</span>
          <button style={S.iconBtn} onClick={onClose}><X size={16} /></button>
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
function RowTitle({ text, beacon }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span style={{ ...S.beaconSm, background: beacon }} />{text}
  </div>;
}
function Mono({ children }) { return <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{children}</span>; }
function RowActions({ onEdit, onDelete }) {
  return <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
    <button style={S.iconBtnSm} onClick={onEdit}><Pencil size={13} /></button>
    <button style={{ ...S.iconBtnSm, color: "var(--red)" }} onClick={onDelete}><Trash2 size={13} /></button>
  </div>;
}

/* ================= styles ================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
* { box-sizing: border-box; }
:root {
  --ink:#12253B; --paper:#F2F7FC; --panel:#FFFFFF; --line:#DCE6F0;
  --teal:#1976C6; --teal-dark:#0F5FA6; --amber:#C2760C; --red:#C23B2E; --green:#1F8A4C; --muted:#5C7086;
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
  .ltMain { padding: 14px 14px 76px !important; max-height: none !important; }
  .ltHero { padding: 18px 16px !important; border-radius: 12px !important; }
  .ltH1 { font-size: 20px !important; }
  .ltFormGrid { grid-template-columns: 1fr !important; }

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
  sidebar: { width: 216, background: "#fff", color: "var(--ink)", padding: "20px 12px", display: "flex", flexDirection: "column", borderRight: "1px solid var(--line)" },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "2px 4px 14px", borderBottom: "1px solid var(--line)", marginBottom: 10 },
  brandMark: { width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  brandName: { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, letterSpacing: -0.2, color: "var(--teal-dark)" },
  brandSub: { fontSize: 10.5, color: "var(--muted)", marginTop: 1 },
  navBtn: { width: "100%", display: "flex", alignItems: "center", gap: 9, background: "transparent", border: "none", color: "var(--muted)", padding: "9px 10px", borderRadius: 8, fontSize: 13, marginBottom: 2, textAlign: "left" },
  navBtnActive: { background: "rgba(25,118,198,0.10)", color: "var(--teal-dark)", fontWeight: 600 },
  navBadge: { background: "var(--red)", color: "#fff", fontSize: 10.5, fontWeight: 600, borderRadius: 20, padding: "1px 6px", fontFamily: "var(--font-mono)" },
  sidebarFoot: { marginTop: "auto", fontSize: 10.5, color: "var(--muted)", padding: "10px 6px", lineHeight: 1.5 },
  main: { flex: 1, padding: "22px 26px", overflowY: "auto", maxHeight: 640 },

  hero: { position: "relative", background: "linear-gradient(135deg, var(--teal-dark), var(--teal))", color: "#fff", borderRadius: 14, padding: "26px 26px", overflow: "hidden", marginBottom: 18 },
  heroGrid: { position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "22px 22px", maskImage: "radial-gradient(ellipse at top right, black, transparent 70%)" },
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
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "var(--teal)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", fontSize: 13 },
  smallBtn: { display: "flex", alignItems: "center", gap: 5, background: "#E9F1FB", color: "var(--teal-dark)", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 12 },
  iconBtn: { background: "transparent", border: "1px solid var(--line)", borderRadius: 7, padding: 6, display: "flex" },
  iconBtnSm: { background: "transparent", border: "1px solid var(--line)", borderRadius: 6, padding: 5, display: "flex" },

  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px,1fr))", gap: 12, alignItems: "start" },
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

  detailHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between" },
  detailName: { fontSize: 15, fontWeight: 600 },
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

  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "#fff", padding: "9px 18px", borderRadius: 30, fontSize: 12.5, zIndex: 60 },
};
