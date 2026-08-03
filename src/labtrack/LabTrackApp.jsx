import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Wrench, FlaskConical, Package, FileDown,
  Search, Plus, X, Trash2, Pencil, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, MapPin, CalendarClock
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
function statusOf(days) {
  if (days === null) return "none";
  if (days < 0) return "danger";
  if (days <= 30) return "warn";
  return "ok";
}
const STATUS_COLOR = { ok: "var(--green)", warn: "var(--amber)", danger: "var(--red)", none: "var(--muted)" };
const STATUS_LABEL = { ok: "ปกติ", warn: "ใกล้ถึงกำหนด", danger: "เลยกำหนด", none: "-" };

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

const NAV = [
  { key: "dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { key: "equipment", label: "เครื่องมือ", icon: Wrench },
  { key: "chemicals", label: "สารเคมี", icon: FlaskConical },
  { key: "consumables", label: "พัสดุสิ้นเปลือง", icon: Package },
  { key: "reports", label: "รายงาน", icon: FileDown },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [activities, setActivities] = useState([]);
  const [chemicals, setChemicals] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const [eq, ac, ch, co] = await Promise.all([
        loadList("equipment", SEED_EQUIPMENT),
        loadList("activities", SEED_ACTIVITIES),
        loadList("chemicals", SEED_CHEMICALS),
        loadList("consumables", SEED_CONSUMABLES),
      ]);
      setEquipment(eq); setActivities(ac); setChemicals(ch); setConsumables(co);
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
    chemicals: (list) => { setChemicals(list); saveList("chemicals", list); },
    consumables: (list) => { setConsumables(list); saveList("consumables", list); },
  };

  const alerts = useMemo(() => {
    const calib = equipment
      .map(e => ({ e, days: daysUntil(e.nextDue), st: statusOf(daysUntil(e.nextDue)) }))
      .filter(x => x.st === "warn" || x.st === "danger")
      .sort((a, b) => a.days - b.days);
    const expiry = chemicals
      .map(c => ({ c, days: daysUntil(c.expiryDate), st: statusOf(daysUntil(c.expiryDate)) }))
      .filter(x => x.st === "warn" || x.st === "danger")
      .sort((a, b) => a.days - b.days);
    const lowStock = consumables
      .filter(s => s.quantity <= s.minThreshold)
      .sort((a, b) => a.quantity - b.quantity);
    const lowChem = chemicals
      .filter(c => c.quantity <= c.minThreshold)
      .sort((a, b) => a.quantity - b.quantity);
    return { calib, expiry, lowStock, lowChem };
  }, [equipment, chemicals, consumables]);

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
          <nav style={{ marginTop: 18 }} className="ltNav">
            {NAV.map(n => {
              const Icon = n.icon;
              const active = tab === n.key;
              const count = n.key === "dashboard"
                ? alerts.calib.length + alerts.expiry.length + alerts.lowStock.length + alerts.lowChem.length
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
          <div style={S.sidebarFoot} className="ltSidebarFoot">ข้อมูลนี้ใช้ร่วมกันในทีมของคุณ</div>
        </aside>

        {/* main */}
        <main style={S.main} className="ltMain">
          {tab === "dashboard" && (
            <Dashboard equipment={equipment} chemicals={chemicals} consumables={consumables} alerts={alerts} goto={setTab} />
          )}
          {tab === "equipment" && (
            <EquipmentTab equipment={equipment} setEquipment={persist.equipment}
              activities={activities} setActivities={persist.activities} notify={notify} />
          )}
          {tab === "chemicals" && (
            <ChemicalsTab chemicals={chemicals} setChemicals={persist.chemicals} notify={notify} />
          )}
          {tab === "consumables" && (
            <ConsumablesTab consumables={consumables} setConsumables={persist.consumables} notify={notify} />
          )}
          {tab === "reports" && (
            <ReportsTab equipment={equipment} activities={activities} chemicals={chemicals} consumables={consumables} />
          )}
        </main>
      </div>

      {/* App-style bottom navigation bar, shown only on mobile (see .ltBottomNav in CSS) */}
      <div className="ltBottomNav">
        {NAV.map(n => {
          const Icon = n.icon;
          const active = tab === n.key;
          const count = n.key === "dashboard"
            ? alerts.calib.length + alerts.expiry.length + alerts.lowStock.length + alerts.lowChem.length
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

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

/* ================= DASHBOARD ================= */
function Dashboard({ equipment, chemicals, consumables, alerts, goto }) {
  const activeCount = equipment.filter(e => e.status === "active").length;
  const stats = [
    { label: "เครื่องมือทั้งหมด", value: equipment.length, sub: `${activeCount} ใช้งานอยู่`, icon: Wrench, tint: "#E9F1FB", color: "var(--teal)", goto: "equipment" },
    { label: "รายการสารเคมี", value: chemicals.length, sub: `${alerts.expiry.length} ใกล้/เลยหมดอายุ`, icon: FlaskConical, tint: "#FBE9E4", color: "#D9622E", goto: "chemicals" },
    { label: "พัสดุสิ้นเปลือง", value: consumables.length, sub: `${alerts.lowStock.length} ใกล้หมด`, icon: Package, tint: "#F0EAFB", color: "#7A4FC2", goto: "consumables" },
    { label: "รายการที่ต้องติดตาม", value: alerts.calib.length + alerts.expiry.length + alerts.lowStock.length + alerts.lowChem.length, sub: "รวมทุกประเภท", icon: AlertTriangle, tint: "#FBE4E1", color: "var(--red)", goto: null },
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
            key: c.id, st, title: `${c.name} (Lot ${c.lotNo || "-"})`,
            detail: days < 0 ? `หมดอายุแล้ว ${Math.abs(days)} วัน` : `เหลือ ${days} วัน (${fmtDate(c.expiryDate)})`,
          }))}
        />
        <AlertPanel
          title="พัสดุ/สารเคมีใกล้หมด"
          icon={Package}
          empty="สต็อคทุกรายการยังเพียงพอ"
          onSeeAll={() => goto("consumables")}
          items={[
            ...alerts.lowStock.map(s => ({ key: s.id, st: s.quantity <= 0 ? "danger" : "warn", title: s.name, detail: `เหลือ ${s.quantity} ${s.unit} (ขั้นต่ำ ${s.minThreshold})` })),
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
function EquipmentTab({ equipment, setEquipment, activities, setActivities, notify }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null); // equipment object or null
  const [selected, setSelected] = useState(null); // detail view id

  const filtered = equipment.filter(e => {
    const matchQ = (e.code + e.name + e.location + e.type).toLowerCase().includes(q.toLowerCase());
    const matchS = statusFilter === "all" || e.status === statusFilter;
    return matchQ && matchS;
  });

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

  const selectedItem = equipment.find(e => e.id === selected);

  return (
    <div>
      <TabHeader title="เครื่องมือ" sub="รายการเครื่องมือทั้งหมดและกำหนดสอบเทียบ" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหารหัส, ชื่อ, ตำแหน่ง..." />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={S.select}>
          <option value="all">ทุกสถานะ</option>
          <option value="active">ใช้งานอยู่</option>
          <option value="maintenance">ซ่อมบำรุง</option>
          <option value="inactive">ปิดใช้งาน</option>
        </select>
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), code: "", name: "", type: "", location: "", status: "active", lastCalibration: "", nextDue: "", notes: "", imageUrl: "" })}>
          <Plus size={15} /> เพิ่มเครื่องมือ
        </button>
      </Toolbar>

      <div style={S.cardGrid}>
        {filtered.map(e => {
          const days = daysUntil(e.nextDue);
          const st = statusOf(days);
          return (
            <div key={e.id} style={{ ...S.eqCard, display: "flex", flexDirection: "column", gap: 0, padding: e.imageUrl ? 0 : S.eqCard.padding, overflow: "hidden" }} onClick={() => setSelected(e.id)}>
              {e.imageUrl && (
                <img src={e.imageUrl} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }}
                  style={{ width: "100%", height: 140, objectFit: "contain", background: "#EEF2F6", display: "block" }} />
              )}
              <div style={{ padding: e.imageUrl ? "10px 14px 12px" : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={S.eqCardTop}>
                    <span style={{ ...S.beacon, background: STATUS_COLOR[st] }} />
                    <span style={S.eqCode}>{e.code}</span>
                  </div>
                  {e.nextDue && (st === "warn" || st === "danger") && <Tag color={STATUS_COLOR[st]}>{STATUS_LABEL[st]}</Tag>}
                </div>
                <div style={S.eqName}>{e.name}</div>
                <div style={S.eqMeta}><MapPin size={11} /> {e.location || "-"} · {e.type || "-"}</div>
                <div style={{ ...S.eqDue, color: STATUS_COLOR[st] }}>
                  {e.nextDue ? `กำหนดถัดไป ${fmtDate(e.nextDue)} · ${STATUS_LABEL[st]}` : "ไม่มีกำหนดสอบเทียบ"}
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
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selectedItem); setSelected(null); }}
          onDelete={() => remove(selectedItem.id)}
          onAddActivity={(act) => { setActivities([{ ...act, id: uid(), equipmentId: selectedItem.id }, ...activities]); notify("บันทึกกิจกรรมแล้ว"); }}
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
        <Field label="ประเภท"><input style={S.input} value={f.type} onChange={set("type")} placeholder="เช่น เครื่องชั่ง" /></Field>
        <Field label="ตำแหน่งที่ตั้ง"><input style={S.input} value={f.location} onChange={set("location")} placeholder="เช่น C1" /></Field>
        <Field label="สถานะ">
          <select style={S.input} value={f.status} onChange={set("status")}>
            <option value="active">ใช้งานอยู่</option>
            <option value="maintenance">ซ่อมบำรุง</option>
            <option value="inactive">ปิดใช้งาน</option>
          </select>
        </Field>
        <Field label="สอบเทียบล่าสุด"><input type="date" style={S.input} value={f.lastCalibration} onChange={set("lastCalibration")} /></Field>
        <Field label="กำหนดสอบเทียบถัดไป"><input type="date" style={S.input} value={f.nextDue} onChange={set("nextDue")} /></Field>
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

function EquipmentDetail({ item, activities, onClose, onEdit, onDelete, onAddActivity }) {
  const [showAct, setShowAct] = useState(false);
  const days = daysUntil(item.nextDue);
  const st = statusOf(days);
  const typeLabel = { calibration: "สอบเทียบ", repair: "ซ่อม", request: "แจ้งซ่อม", other: "อื่นๆ" };
  return (
    <Modal onClose={onClose} title={item.code} wide>
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }}
          style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "#EEF2F6", borderRadius: 10, marginBottom: 14 }} />
      )}
      <div style={S.detailHead}>
        <div>
          <div style={S.detailName}>{item.name}</div>
          <div style={S.eqMeta}><MapPin size={12} /> {item.location || "-"} · {item.type || "-"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.iconBtn} onClick={onEdit}><Pencil size={14} /></button>
          <button style={{ ...S.iconBtn, color: "var(--red)" }} onClick={onDelete}><Trash2 size={14} /></button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, margin: "12px 0 6px" }}>
        <Tag color={item.status === "active" ? "var(--green)" : item.status === "maintenance" ? "var(--amber)" : "var(--muted)"}>
          {item.status === "active" ? "ใช้งานอยู่" : item.status === "maintenance" ? "ซ่อมบำรุง" : "ปิดใช้งาน"}
        </Tag>
        <Tag color={STATUS_COLOR[st]}>{item.nextDue ? `${STATUS_LABEL[st]} · ${fmtDate(item.nextDue)}` : "ไม่มีกำหนด"}</Tag>
      </div>
      {item.notes && <div style={S.notesBox}>{item.notes}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
        <div style={S.panelTitle}>ประวัติกิจกรรม</div>
        <button style={S.smallBtn} onClick={() => setShowAct(true)}><Plus size={13} /> บันทึกกิจกรรม</button>
      </div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {activities.length === 0 && <EmptyState text="ยังไม่มีประวัติกิจกรรม" small />}
        {activities.map(a => (
          <div key={a.id} style={S.activityRow}>
            <div style={S.activityDate}>{fmtDate(a.date)}</div>
            <div style={{ flex: 1 }}>
              <div style={S.activityType}>{typeLabel[a.type] || a.type}</div>
              <div style={S.activityDetail}>{a.detail}{a.by ? ` · โดย ${a.by}` : ""}</div>
            </div>
          </div>
        ))}
      </div>

      {showAct && (
        <ActivityForm onCancel={() => setShowAct(false)} onSave={(act) => { onAddActivity(act); setShowAct(false); }} />
      )}
    </Modal>
  );
}

function ActivityForm({ onCancel, onSave }) {
  const [f, setF] = useState({ date: todayISO(), type: "calibration", detail: "", by: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal onClose={onCancel} title="บันทึกกิจกรรม">
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
        <Field label="รายละเอียด" full><textarea style={{ ...S.input, minHeight: 70 }} value={f.detail} onChange={set("detail")} /></Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave(f)} disabled={!f.detail} />
    </Modal>
  );
}

/* ================= CHEMICALS ================= */
function ChemicalsTab({ chemicals, setChemicals, notify }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const filtered = chemicals.filter(c => (c.name + c.lotNo + c.location).toLowerCase().includes(q.toLowerCase()));

  function upsert(item) {
    if (chemicals.find(c => c.id === item.id)) setChemicals(chemicals.map(c => c.id === item.id ? item : c));
    else setChemicals([item, ...chemicals]);
    notify("บันทึกข้อมูลสารเคมีแล้ว");
    setEditing(null);
  }
  function remove(id) { setChemicals(chemicals.filter(c => c.id !== id)); notify("ลบรายการแล้ว"); }

  return (
    <div>
      <TabHeader title="สต็อคสารเคมี" sub="ติดตามปริมาณคงเหลือและวันหมดอายุ" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อสาร, Lot, ตำแหน่ง..." />
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), name: "", lotNo: "", quantity: 0, unit: "", expiryDate: "", location: "", minThreshold: 0 })}>
          <Plus size={15} /> เพิ่มสารเคมี
        </button>
      </Toolbar>
      <Table
        cols={["ชื่อสารเคมี", "Lot No.", "คงเหลือ", "หมดอายุ", "ตำแหน่ง", ""]}
        rows={filtered.map(c => {
          const days = daysUntil(c.expiryDate);
          const st = statusOf(days);
          const low = c.quantity <= c.minThreshold;
          return [
            <RowTitle beacon={low ? "var(--amber)" : "transparent"} text={c.name} />,
            <Mono>{c.lotNo || "-"}</Mono>,
            <span>{c.quantity} {c.unit}{low && <span style={S.lowTag}>ใกล้หมด</span>}</span>,
            <span style={{ color: STATUS_COLOR[st] }}>{c.expiryDate ? `${fmtDate(c.expiryDate)}` : "-"}</span>,
            c.location || "-",
            <RowActions onEdit={() => setEditing(c)} onDelete={() => remove(c.id)} />,
          ];
        })}
        empty="ยังไม่มีข้อมูลสารเคมี"
      />
      {editing && <ChemicalForm item={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}

function ChemicalForm({ item, onCancel, onSave }) {
  const [f, setF] = useState(item);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  return (
    <Modal onClose={onCancel} title={item.name ? "แก้ไขสารเคมี" : "เพิ่มสารเคมี"}>
      <div style={S.formGrid} className="ltFormGrid">
        <Field label="ชื่อสารเคมี" full><input style={S.input} value={f.name} onChange={set("name")} /></Field>
        <Field label="Lot No."><input style={S.input} value={f.lotNo} onChange={set("lotNo")} /></Field>
        <Field label="ตำแหน่งจัดเก็บ"><input style={S.input} value={f.location} onChange={set("location")} /></Field>
        <Field label="ปริมาณคงเหลือ"><input type="number" style={S.input} value={f.quantity} onChange={set("quantity", true)} /></Field>
        <Field label="หน่วย"><input style={S.input} value={f.unit} onChange={set("unit")} placeholder="เช่น ขวด, kg, L" /></Field>
        <Field label="ขั้นต่ำที่ควรมี"><input type="number" style={S.input} value={f.minThreshold} onChange={set("minThreshold", true)} /></Field>
        <Field label="วันหมดอายุ"><input type="date" style={S.input} value={f.expiryDate} onChange={set("expiryDate")} /></Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave(f)} disabled={!f.name} />
    </Modal>
  );
}

/* ================= CONSUMABLES ================= */
function ConsumablesTab({ consumables, setConsumables, notify }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const filtered = consumables.filter(s => (s.name + s.location).toLowerCase().includes(q.toLowerCase()));

  function upsert(item) {
    if (consumables.find(s => s.id === item.id)) setConsumables(consumables.map(s => s.id === item.id ? item : s));
    else setConsumables([item, ...consumables]);
    notify("บันทึกข้อมูลพัสดุแล้ว");
    setEditing(null);
  }
  function remove(id) { setConsumables(consumables.filter(s => s.id !== id)); notify("ลบรายการแล้ว"); }

  function addTransaction(itemId, tx) {
    setConsumables(consumables.map(s => {
      if (s.id !== itemId) return s;
      const delta = tx.type === "receive" ? tx.qty : -tx.qty;
      return { ...s, quantity: Math.max(0, (s.quantity || 0) + delta), transactions: [{ ...tx, id: uid() }, ...(s.transactions || [])] };
    }));
    notify(tx.type === "receive" ? "บันทึกรับเข้าแล้ว" : "บันทึกเบิกใช้แล้ว");
  }

  const selectedItem = consumables.find(s => s.id === selected);

  return (
    <div>
      <TabHeader title="พัสดุสิ้นเปลือง" sub="ติดตามปริมาณคงเหลือของวัสดุใช้แล้วหมดไป" />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อพัสดุ, ตำแหน่ง..." />
        <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), name: "", quantity: 0, unit: "", minThreshold: 0, location: "", transactions: [] })}>
          <Plus size={15} /> เพิ่มพัสดุ
        </button>
      </Toolbar>
      <Table
        cols={["ชื่อพัสดุ", "คงเหลือ", "ขั้นต่ำ", "ตำแหน่ง", ""]}
        onRowClick={(i) => setSelected(filtered[i].id)}
        rows={filtered.map(s => {
          const low = s.quantity <= s.minThreshold;
          return [
            <RowTitle beacon={low ? (s.quantity <= 0 ? "var(--red)" : "var(--amber)") : "transparent"} text={s.name} />,
            <span>{s.quantity} {s.unit}{low && <span style={S.lowTag}>{s.quantity <= 0 ? "หมด" : "ใกล้หมด"}</span>}</span>,
            `${s.minThreshold} ${s.unit}`,
            s.location || "-",
            <RowActions onEdit={() => setEditing(s)} onDelete={() => remove(s.id)} />,
          ];
        })}
        empty="ยังไม่มีข้อมูลพัสดุสิ้นเปลือง"
      />
      {editing && <ConsumableForm item={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
      {selectedItem && (
        <ConsumableDetail
          item={selectedItem}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selectedItem); setSelected(null); }}
          onDelete={() => { remove(selectedItem.id); setSelected(null); }}
          onAddTransaction={(tx) => addTransaction(selectedItem.id, tx)}
        />
      )}
    </div>
  );
}

function ConsumableDetail({ item, onClose, onEdit, onDelete, onAddTransaction }) {
  const [showForm, setShowForm] = useState(null); // "receive" | "withdraw" | null
  const low = item.quantity <= item.minThreshold;
  const txs = item.transactions || [];
  return (
    <Modal onClose={onClose} title={item.name} wide>
      <div style={S.detailHead}>
        <div>
          <div style={S.detailName}>{item.name}</div>
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
        <Tag color="var(--muted)">ขั้นต่ำ {item.minThreshold} {item.unit}</Tag>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={{ ...S.primaryBtn, flex: 1, justifyContent: "center" }} onClick={() => setShowForm("receive")}>
          <Plus size={14} /> บันทึกรับเข้า (PO)
        </button>
        <button style={{ ...S.ghostBtn, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setShowForm("withdraw")}>
          <Package size={14} /> บันทึกเบิกใช้
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
        <div style={S.panelTitle}>ประวัติรับเข้า / เบิกใช้</div>
      </div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
        {txs.length === 0 && <EmptyState text="ยังไม่มีประวัติรับเข้าหรือเบิกใช้" small />}
        {txs.map(t => (
          <div key={t.id} style={S.activityRow}>
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
          </div>
        ))}
      </div>

      {showForm && (
        <ConsumableTxForm
          type={showForm}
          item={item}
          onCancel={() => setShowForm(null)}
          onSave={(tx) => { onAddTransaction(tx); setShowForm(null); }}
        />
      )}
    </Modal>
  );
}

function ConsumableTxForm({ type, item, onCancel, onSave }) {
  const isReceive = type === "receive";
  const [f, setF] = useState({ date: todayISO(), qty: "", poNo: "", by: "", note: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const qtyNum = Number(f.qty) || 0;
  const wouldGoNegative = !isReceive && qtyNum > item.quantity;
  return (
    <Modal onClose={onCancel} title={isReceive ? "บันทึกรับเข้าพัสดุ (PO)" : "บันทึกเบิกใช้พัสดุ"}>
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
          จำนวนที่เบิกมากกว่าคงเหลือ ({item.quantity} {item.unit}) — ระบบจะปรับคงเหลือเป็น 0
        </div>
      )}
      <ModalFooter
        onCancel={onCancel}
        onSave={() => onSave({ type, date: f.date, qty: qtyNum, poNo: f.poNo, by: f.by, note: f.note })}
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
        <Field label="ตำแหน่งจัดเก็บ"><input style={S.input} value={f.location} onChange={set("location")} /></Field>
        <Field label="หน่วย"><input style={S.input} value={f.unit} onChange={set("unit")} placeholder="เช่น กล่อง, ห่อ, ชิ้น" /></Field>
        <Field label="ปริมาณคงเหลือ"><input type="number" style={S.input} value={f.quantity} onChange={set("quantity", true)} /></Field>
        <Field label="ขั้นต่ำที่ควรมี"><input type="number" style={S.input} value={f.minThreshold} onChange={set("minThreshold", true)} /></Field>
      </div>
      <ModalFooter onCancel={onCancel} onSave={() => onSave(f)} disabled={!f.name} />
    </Modal>
  );
}

/* ================= REPORTS ================= */
function ReportsTab({ equipment, activities, chemicals, consumables }) {
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
    equipment.map(e => [e.code, e.name, e.type, e.location, e.status, e.lastCalibration, e.nextDue, e.notes]),
    ["รหัส", "ชื่อ", "ประเภท", "ตำแหน่ง", "สถานะ", "สอบเทียบล่าสุด", "กำหนดถัดไป", "หมายเหตุ"]
  ));
  const exportActivities = () => download("activities.csv", toCSV(
    activities.map(a => [equipment.find(e => e.id === a.equipmentId)?.code || a.equipmentId, a.date, a.type, a.detail, a.by]),
    ["รหัสเครื่องมือ", "วันที่", "ประเภท", "รายละเอียด", "ผู้ดำเนินการ"]
  ));
  const exportChemicals = () => download("chemicals.csv", toCSV(
    chemicals.map(c => [c.name, c.lotNo, c.quantity, c.unit, c.expiryDate, c.location, c.minThreshold]),
    ["ชื่อ", "Lot No.", "คงเหลือ", "หน่วย", "วันหมดอายุ", "ตำแหน่ง", "ขั้นต่ำ"]
  ));
  const exportConsumables = () => download("consumables.csv", toCSV(
    consumables.map(s => [s.name, s.quantity, s.unit, s.minThreshold, s.location]),
    ["ชื่อ", "คงเหลือ", "หน่วย", "ขั้นต่ำ", "ตำแหน่ง"]
  ));

  const cards = [
    { title: "เครื่องมือทั้งหมด", desc: `${equipment.length} รายการ พร้อมกำหนดสอบเทียบ`, action: exportEquipment, icon: Wrench },
    { title: "ประวัติกิจกรรม", desc: `${activities.length} รายการ สอบเทียบ/ซ่อม/แจ้งซ่อม`, action: exportActivities, icon: CalendarClock },
    { title: "สต็อคสารเคมี", desc: `${chemicals.length} รายการ พร้อมวันหมดอายุ`, action: exportChemicals, icon: FlaskConical },
    { title: "พัสดุสิ้นเปลือง", desc: `${consumables.length} รายการ พร้อมปริมาณคงเหลือ`, action: exportConsumables, icon: Package },
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
    <div style={S.tableWrap}>
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

  /* Chemicals / Consumables tables: collapse into stacked cards */
  .ltTable thead { display: none !important; }
  .ltTable, .ltTable tbody, .ltTableRow { display: block !important; width: 100% !important; }
  .ltTableRow { padding: 12px 14px !important; }
  .ltTableCell, .ltTableTitleCell {
    display: flex !important; justify-content: space-between !important; align-items: center !important;
    gap: 10px !important; padding: 4px 0 !important; border: none !important; text-align: right !important;
  }
  .ltTableTitleCell {
    font-weight: 600 !important; font-size: 13.5px !important; justify-content: flex-start !important;
    text-align: left !important; border-bottom: 1px solid var(--line) !important;
    padding-bottom: 6px !important; margin-bottom: 4px !important;
  }
  .ltTableCell::before {
    content: attr(data-label); font-size: 11px; font-weight: 600; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.3px; flex-shrink: 0; text-align: left;
  }

  /* Colorful icon tiles on the dashboard stat cards, like a native app */
  .statCard { display: flex !important; align-items: center !important; gap: 12px !important; }
  .statIconTile { display: flex !important; }
  .statTop { gap: 0 !important; }
  .statTopIcon { display: none !important; }

  .ltBottomNav {
    display: flex !important;
    position: sticky; bottom: 0; left: 0; right: 0; z-index: 20;
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

  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px,1fr))", gap: 12 },
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
