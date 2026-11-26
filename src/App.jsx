import { useState, useEffect, useRef } from "react";
import { Wrench, FlaskConical, Lock, LogOut, ShieldCheck, Plus, Search, ExternalLink } from "lucide-react";
import LabTrackApp from "./labtrack/LabTrackApp.jsx";
import AnalysisApp from "./analysis/AnalysisApp.jsx";
import CalibrationApp from "./calibration/CalibrationApp.jsx";

// Shared design tokens (UI/UX proposal, section I). Kept in this file so a
// release is only files that already exist in the repo.
const TOKENS_CSS = `
/* MPIR Central Lab — shared design tokens (UI/UX proposal, section I).
   One place for colours, type and spacing used by all three work areas.
   Print templates (LF-033, LF-045, LF-068, LF-069, Daily check logs) do not
   use these and are unchanged. */
:root {
  --mpir-primary: #1F5FA8;
  --mpir-primary-hover: #174A85;
  --mpir-primary-light: #EAF2FB;
  --mpir-page: #F6F8FB;
  --mpir-surface: #FFFFFF;
  --mpir-text: #1B2430;
  --mpir-text-2: #5B6675;
  --mpir-border: #D9E1EA;
  --mpir-good: #1E8E5A;
  --mpir-warn: #B7791F;
  --mpir-bad: #C0392B;
  --mpir-neutral: #7A8594;
  --mpir-font: 'Sarabun', ui-sans-serif, system-ui, sans-serif;
  --mpir-radius: 8px;
  --mpir-touch: 44px;
}
body { margin: 0; font-family: var(--mpir-font); color: var(--mpir-text); background: var(--mpir-page); }
`;

// The three work areas share one shell (same header, same browser tab).
// The calibration app used to open in a separate browser tab at
// /?app=calibration — that URL still works and now opens this tab.
const TABS = [
  { key: "labtrack", label: "จัดการห้องแล็บ", short: "จัดการห้องแล็บ", sub: "LabTrack", Icon: Wrench },
  { key: "calibration", label: "Instrument Assurance System", short: "Instrument Assurance", sub: "สอบเทียบ · Daily check", Icon: ShieldCheck },
  { key: "analysis", label: "ติดตามงานวิเคราะห์", short: "งานวิเคราะห์", sub: "Lab Analysis Tracker", Icon: FlaskConical },
];

/* ---- Release 2: header quick actions ("+") and search ----
   Each quick action is a deep link into an existing page that opens the
   existing form (do=…); nothing here saves data. Booking accounts see only
   what their role already reaches. */
const QUICK_ACTIONS = [
  { key: "daily", label: "บันทึก Daily check", url: "/?app=calibration&view=dailyAll", roles: ["admin", "approver"] },
  { key: "booking", label: "จองเครื่องมือ", url: "/?tab=bookings&do=newBooking", roles: ["admin", "approver", "booking"] },
  { key: "job", label: "สร้างรหัสงาน", url: "/?app=analysis&tab=jobs&do=newJob", roles: ["admin", "approver"] },
  { key: "pr", label: "ออกใบขอซื้อ (PR)", url: "/?tab=purchase&do=newPR", roles: ["admin", "approver"] },
  { key: "equip", label: "เพิ่มเครื่องมือ", url: "/?app=calibration&new=1", roles: ["admin", "approver"] },
  { key: "request", label: "ขอรับบริการวิเคราะห์", url: "https://centrallab-mpir.mitrphol.com/login/admin", external: true, roles: ["admin", "approver"] },
  { key: "requestPublic", label: "ขอรับบริการวิเคราะห์", url: "https://centrallab-mpir.mitrphol.com/", external: true, roles: ["booking"] },
];

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    document.addEventListener("mousedown", h); document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [ref, onOutside]);
}

function QuickActions({ role, onGo }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useClickOutside(box, () => setOpen(false));
  const items = QUICK_ACTIONS.filter(a => a.roles.includes(role));
  return (
    <div ref={box} style={{ position: "relative" }}>
      <button style={styles.plusBtn} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} title="ทำรายการด่วน">
        <Plus size={16} /> <span className="appHideMobile">ทำรายการด่วน</span>
      </button>
      {open && (
        <div role="menu" style={styles.menu}>
          {items.map(a => (
            <button key={a.key} role="menuitem" style={styles.menuItem}
              onClick={() => { setOpen(false); a.external ? window.open(a.url, "_blank", "noopener,noreferrer") : onGo(a.url); }}>
              {a.label}{a.external && <ExternalLink size={13} style={{ marginLeft: 6, opacity: 0.6 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Searches instruments and PR numbers already in the LabTrack database, and
// hands any text to the analysis job list. Read-only.
function HeaderSearch({ onGo }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const box = useRef(null);
  useClickOutside(box, () => setOpen(false));
  async function load() {
    if (data || !window.storage) return;
    const read = async (k) => { try { return JSON.parse((await window.storage.get(k)).value) || []; } catch { return []; } };
    const [equipment, prs] = await Promise.all([read("equipment"), read("purchaseRequests")]);
    setData({ equipment, prs });
  }
  const t = q.trim().toLowerCase();
  const results = [];
  if (t && data) {
    data.equipment.filter(e => [e.code, e.name, e.serialNo].some(v => (v || "").toString().toLowerCase().includes(t))).slice(0, 6)
      .forEach(e => results.push({ key: "e" + e.id, kind: "เครื่องมือ", label: `${e.code || ""} ${e.name || ""}`.trim(), url: `/?app=calibration&equip=${encodeURIComponent(e.id)}` }));
    data.prs.filter(r => [r.requestNo, r.prNo].some(v => (v || "").toLowerCase().includes(t))).slice(0, 4)
      .forEach(r => results.push({ key: "p" + r.id, kind: "ใบขอซื้อ", label: [r.requestNo, r.prNo].filter(Boolean).join(" · "), url: `/?tab=purchase&q=${encodeURIComponent(r.requestNo || r.prNo)}` }));
  }
  if (t) results.push({ key: "jobs", kind: "งานวิเคราะห์", label: `ค้นหา “${q.trim()}” ในงานวิเคราะห์`, url: `/?app=analysis&tab=jobs&jq=${encodeURIComponent(q.trim())}` });
  const go = (r) => { setOpen(false); setQ(""); onGo(r.url); };
  return (
    <div ref={box} style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }} className="appSearch">
      <div style={styles.searchBox}>
        <Search size={15} style={{ color: "var(--mpir-text-2)", flexShrink: 0 }} />
        <input value={q} placeholder="ค้นหาเครื่องมือ, เลขที่คำขอ/PR, เลขงาน"
          onFocus={() => { setOpen(true); load(); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0]); if (e.key === "Escape") setOpen(false); }}
          style={styles.searchInput} aria-label="ค้นหา" />
      </div>
      {open && t && (
        <div role="listbox" style={{ ...styles.menu, left: 0, right: 0, minWidth: 0 }}>
          {!data && <div style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--mpir-text-2)" }}>กำลังโหลด…</div>}
          {results.map(r => (
            <button key={r.key} role="option" style={styles.menuItem} onClick={() => go(r)}>
              <span style={styles.resultKind}>{r.kind}</span>{r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// URL keys owned by one area; cleared when moving to another area so a
// reload lands where the person is now.
const SECTION_URL_KEYS = ["app", "equip", "new", "edit", "view", "vid", "vround", "vtab", "tab"];
function sectionFromUrl() {
  if (typeof window === "undefined") return "labtrack";
  const app = new URLSearchParams(window.location.search).get("app");
  return app === "calibration" || app === "analysis" ? app : "labtrack";
}
function urlForSection(key) {
  const url = new URL(window.location.href);
  SECTION_URL_KEYS.forEach(k => url.searchParams.delete(k));
  if (key !== "labtrack") url.searchParams.set("app", key);
  return url.pathname + (url.search ? url.search : "") + url.hash;
}

// Shared team accounts, kept out of source control ideally (see .env.local /
// README) — the original shared login stays configurable via env vars for
// backward compatibility; the two new named accounts are fixed here.
// This only gates the UI in the browser — it does NOT restrict who can read
// or write the underlying data at the storage layer (see notes in README).
// Roles:
//   "admin"    — full access to every tab (both LabTrack and Analysis), same
//                as the original shared login.
//   "approver" — same full access as "admin" (every tab, both apps), but is
//                specifically one of the named main approvers: these are the
//                accounts meant to click "อนุมัติ" (approve) on daily scale
//                checks and other approval steps, distinct from ordinary
//                booking-only staff.
//   "booking"  — LabTrack only, and inside LabTrack restricted to just the
//                "จอง/ยืมเครื่องมือ" (equipment booking) tab. Cannot see
//                equipment/chemicals/consumables/PR/reports or Analysis at all.
const ACCOUNTS = [
  {
    username: import.meta.env.VITE_APP_USERNAME || "mpirlab",
    password: import.meta.env.VITE_APP_PASSWORD || "mpir1234",
    role: "admin",
  },
  { username: "mpiradmin", password: "admin1234", role: "admin" },
  // Full staff roster (78 accounts) — booking-only role, one per person,
  // generated from user_id_list.xlsx. Username = "System ID" column,
  // shared password mpir1234 for everyone. Replaces the earlier ad-hoc
  // wimonsiri/thidarati test accounts (both are included here under their
  // real System ID / standard password instead).
  { username: "vorraveerukornv", password: "mpir1234", role: "booking", name: "Vorraveerukorn Veerachitt" },
  { username: "anutinp", password: "mpir1234", role: "booking", name: "Anutin Pattamasuwan" },
  { username: "jamnank", password: "mpir1234", role: "booking", name: "Jamnan Khodphuvieng" },
  { username: "rattanam", password: "mpir1234", role: "booking", name: "Rattana Muangmontri" },
  { username: "somwunga", password: "mpir1234", role: "booking", name: "Somwung Anusonpornperm" },
  { username: "nuchnichap", password: "mpir1234", role: "booking", name: "Nuchnicha Phaeon" },
  { username: "chaiwatn", password: "mpir1234", role: "booking", name: "Chaiwat Ngasan" },
  { username: "pimchanokb", password: "mpir1234", role: "approver", name: "Pimchanok Busayapongchai" },
  { username: "jirachayak", password: "mpir1234", role: "booking", name: "Jirachaya Klisumalee" },
  { username: "pisittineec", password: "mpir1234", role: "booking", name: "Pisittinee Chapanya" },
  { username: "varinthonj", password: "mpir1234", role: "booking", name: "Varinthon Jarnkoon" },
  { username: "rutchadapornn", password: "mpir1234", role: "booking", name: "Rutchadaporn Nootas" },
  { username: "pathaithipc", password: "mpir1234", role: "booking", name: "Pathaithip Champasri" },
  { username: "therdpongk", password: "mpir1234", role: "booking", name: "Therdpong Khongsanun" },
  { username: "manuwatt", password: "mpir1234", role: "booking", name: "Manuwat Tintarasaranaratchasema" },
  { username: "samrans", password: "mpir1234", role: "booking", name: "Samran Saensupo" },
  { username: "wichitl", password: "mpir1234", role: "booking", name: "Wichit Liewkongsataporn" },
  { username: "watcharasaks", password: "mpir1234", role: "booking", name: "Watcharasak Sukcharoenvipharat" },
  { username: "peerayak", password: "mpir1234", role: "booking", name: "Peeraya Klomsa-ard" },
  { username: "nantidaw", password: "mpir1234", role: "booking", name: "Nantida Watanarojanaporn" },
  { username: "pratchyas", password: "mpir1234", role: "booking", name: "Pratchya Swangmaneecharern" },
  { username: "chirawatp", password: "mpir1234", role: "booking", name: "Chirawat Prasitsom" },
  { username: "lawank", password: "mpir1234", role: "booking", name: "Lawan Kladsuwan" },
  { username: "kanokwans", password: "mpir1234", role: "booking", name: "Kanokwan Sawang" },
  { username: "warodomw", password: "mpir1234", role: "booking", name: "Warodom Wirojsirasak" },
  { username: "siriwanp", password: "mpir1234", role: "booking", name: "Siriwan Pangma" },
  { username: "narubodiny", password: "mpir1234", role: "booking", name: "Narubodin Yindi" },
  { username: "saranyap", password: "mpir1234", role: "booking", name: "Saranya Phaengthai" },
  { username: "satjapornc", password: "mpir1234", role: "booking", name: "Satjaporn Chantawong" },
  { username: "mintrat", password: "mpir1234", role: "booking", name: "Mintra Tippa-art" },
  { username: "supaporns", password: "mpir1234", role: "booking", name: "Supaporn Sa-ngawong" },
  { username: "sucharatb", password: "mpir1234", role: "booking", name: "Sucharat Butphu" },
  { username: "punyanucht", password: "mpir1234", role: "booking", name: "Punyanuch Themcharoensawad" },
  { username: "chanphenk", password: "mpir1234", role: "booking", name: "Chanphen Kaenkong" },
  { username: "papadap", password: "mpir1234", role: "booking", name: "Papada Phonmuang" },
  { username: "supattam", password: "mpir1234", role: "booking", name: "Supatta Mingolo" },
  { username: "prakomek", password: "mpir1234", role: "booking", name: "Prakome Kongyoo" },
  { username: "phunsukl", password: "mpir1234", role: "booking", name: "Phunsuk Laotongkum" },
  { username: "yingyost", password: "mpir1234", role: "booking", name: "Yingyos Tonsomros" },
  { username: "attharasab", password: "mpir1234", role: "booking", name: "Attharasa Boonprajum" },
  { username: "orawant", password: "mpir1234", role: "booking", name: "Orawan Tejan" },
  { username: "waranyan", password: "mpir1234", role: "booking", name: "Waranya Natesuntorn" },
  { username: "kridsanak", password: "mpir1234", role: "booking", name: "Kridsana Krisomdee" },
  { username: "chokchais", password: "mpir1234", role: "booking", name: "Chokchai Sompugdee" },
  { username: "phattamonh", password: "mpir1234", role: "booking", name: "Phattamon Heawchaiyaphum" },
  { username: "prayooths", password: "mpir1234", role: "booking", name: "Prayooth Saothong" },
  { username: "walaipornr", password: "mpir1234", role: "booking", name: "Walaiporn Rungjang" },
  { username: "ratchaniwanj", password: "mpir1234", role: "booking", name: "Ratchaniwan Jaemsaeng" },
  { username: "piyanant", password: "mpir1234", role: "booking", name: "Piyanan Tessen" },
  { username: "wimonsirik", password: "mpir1234", role: "booking", name: "Wimonsiri Kongchai" },
  { username: "suntitr", password: "mpir1234", role: "booking", name: "Suntit Reewarabundit" },
  { username: "jirayuts", password: "mpir1234", role: "booking", name: "Jirayut Saosuwan" },
  { username: "nitiyas", password: "mpir1234", role: "booking", name: "Nitiya Srithuanok" },
  { username: "seksitp", password: "mpir1234", role: "booking", name: "Seksit Promputta" },
  { username: "atiyat", password: "mpir1234", role: "booking", name: "Atiya Techaparin" },
  { username: "suwalakl", password: "mpir1234", role: "booking", name: "Suwalak Laephukhieo" },
  { username: "ratthiwakorny", password: "mpir1234", role: "booking", name: "Ratthiwakorn Yuenyong" },
  { username: "ariyak", password: "mpir1234", role: "booking", name: "Ariya Khoosakunrat" },
  { username: "netnaphan", password: "mpir1234", role: "booking", name: "Netnapha Ngamjamrus" },
  { username: "orathaid", password: "mpir1234", role: "booking", name: "Orathai Duangmonti" },
  { username: "thanawanp", password: "mpir1234", role: "booking", name: "Thanawan Phongchai" },
  { username: "thipphawanw", password: "mpir1234", role: "booking", name: "Thipphawan Wongfaideang" },
  { username: "chontichan", password: "mpir1234", role: "booking", name: "Chonticha Naeoaolo" },
  { username: "ponchaiw", password: "mpir1234", role: "booking", name: "Ponchai Wawilai" },
  { username: "yaraponp", password: "mpir1234", role: "approver", name: "Yarapon Puttakot" },
  { username: "sasipimf", password: "mpir1234", role: "booking", name: "Sasipim Foisoongnern" },
  { username: "thimphilatchanantl", password: "mpir1234", role: "booking", name: "Thimphilatchanant Lakool" },
  { username: "sarawutc", password: "mpir1234", role: "booking", name: "Sarawut Chuayaurachon" },
  { username: "visitp", password: "mpir1234", role: "booking", name: "Visit Prathumteep" },
  { username: "chanissarar", password: "mpir1234", role: "booking", name: "Chanissara Ruangyos" },
  { username: "warinpas", password: "mpir1234", role: "booking", name: "Warinpa Sutthibut" },
  { username: "thiradeth", password: "mpir1234", role: "booking", name: "Thiradet Homhwan" },
  { username: "butsabawany", password: "mpir1234", role: "booking", name: "Butsabawan Yenkhan" },
  { username: "noppamasc", password: "mpir1234", role: "booking", name: "Noppamas Chantawan" },
  { username: "kanokkans", password: "mpir1234", role: "booking", name: "Kanokkan Sriwaiyaphram" },
  { username: "thidarati", password: "mpir1234", role: "approver", name: "Thidarat Intakham" },
  { username: "panitk", password: "mpir1234", role: "booking", name: "Panit Kitsubun" },
  { username: "phatthariyap", password: "mpir1234", role: "booking", name: "Phatthariya Phromngulueam" },
  { username: "kachaporns", password: "mpir1234", role: "booking", name: "Kachaporn Saenluang" },
  { username: "suteek", password: "mpir1234", role: "booking", name: "Sutee Kiddee" },
];

const SESSION_KEY = "mpirLabSession";

// A scanned equipment QR code links to either ?tab=dailyCheck&equip=<id> or
// ?tab=equipmentView&equip=<id> (see EquipQRLinkModal in LabTrackApp.jsx).
// Anyone who opens either link — with no account and no session — should
// land straight on that one page instead of a login wall, and touch nothing
// else in the app. This only checks the URL, never the current session, so
// a signed-in user's own reload of either link still goes through their
// normal session as before.
function guestLinkTab() {
  if (typeof window === "undefined") return null;
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "dailyCheck" || tab === "equipmentView" ? tab : null;
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // must still match a known account (in case ACCOUNTS ever changes)
    if (ACCOUNTS.some(a => a.username === parsed.username && a.role === parsed.role)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function PasswordGate({ onLogin, autoLoggedOut }) {
  const [username, setUsername] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const acc = ACCOUNTS.find(a => a.username === username && a.password === input);
    if (acc) {
      const session = { username: acc.username, role: acc.role, name: acc.name || acc.username };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      onLogin(session);
    } else {
      setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }
  };

  return (
    <div style={gateStyles.page}>
      <form onSubmit={submit} style={gateStyles.card}>
        <div style={gateStyles.iconWrap}><Lock size={20} color="#0E6FBA" /></div>
        <div style={gateStyles.title}>MPIR Central Lab</div>
        <div style={gateStyles.sub}>กรุณาเข้าสู่ระบบเพื่อใช้งาน</div>
        {autoLoggedOut && (
          <div style={{ ...gateStyles.error, color: "#0E6FBA", background: "#EAF3FB", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
            ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน 30 นาที กรุณาเข้าสู่ระบบใหม่
          </div>
        )}
        <input
          type="text"
          autoFocus
          value={username}
          onChange={(e) => { setUsername(e.target.value); setError(""); }}
          placeholder="ชื่อผู้ใช้"
          style={gateStyles.input}
          autoComplete="username"
        />
        <input
          type="password"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(""); }}
          placeholder="รหัสผ่าน"
          autoComplete="current-password"
          style={gateStyles.input}
        />
        {error && <div style={gateStyles.error}>{error}</div>}
        <button type="submit" style={gateStyles.btn}>เข้าใช้งาน</button>
      </form>
    </div>
  );
}

const gateStyles = {
  page: {
    fontFamily: "var(--mpir-font)",
    background: "var(--mpir-page)",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    background: "#fff",
    border: "1px solid #D3E6F5",
    borderRadius: 14,
    padding: "28px 26px",
    width: "100%",
    maxWidth: 320,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 4,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10, background: "#DCEDFB",
    display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  title: { fontWeight: 700, fontSize: 15, color: "#0B2A4A" },
  sub: { fontSize: 12, color: "#5B7A96", marginBottom: 14 },
  input: {
    width: "100%", boxSizing: "border-box", border: "1px solid #D3E6F5", borderRadius: 8,
    padding: "9px 12px", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 6,
  },
  error: { fontSize: 12, color: "#C6493B", marginBottom: 6 },
  btn: {
    width: "100%", background: "#0E6FBA", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 6,
  },
};

function useTokens() {
  useEffect(() => {
    if (document.getElementById("mpir-tokens")) return;
    const el = document.createElement("style");
    el.id = "mpir-tokens"; el.textContent = TOKENS_CSS;
    document.head.appendChild(el);
  }, []);
}

export default function App() {
  useTokens();
  const [section, setSectionState] = useState(sectionFromUrl);
  // Bumped on every in-app link so the target area re-reads the URL (page,
  // record, one-time action) even when it is already the open area.
  const [navKey, setNavKey] = useState(0);
  function go(url) {
    window.history.pushState({ mpirSection: true }, "", url);
    setSectionState(sectionFromUrl());
    setNavKey(k => k + 1);
    window.scrollTo(0, 0);
  }
  function setSection(key) {
    if (key === section) return;
    window.history.pushState({ mpirSection: key }, "", urlForSection(key));
    setSectionState(key);
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    const onPop = () => setSectionState(sectionFromUrl());
    // In-app links from any area (e.g. LabTrack → /?app=calibration&equip=…)
    // switch area here instead of opening a new browser tab.
    const onNavigate = (e) => {
      const url = String(e.detail || "");
      if (!url.startsWith("/")) return;
      e.preventDefault();
      window.history.pushState({ mpirSection: true }, "", url);
      setSectionState(sectionFromUrl());
      setNavKey(k => k + 1);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("mpir:navigate", onNavigate);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("mpir:navigate", onNavigate); };
  }, []);
  const [session, setSession] = useState(loadSession);
  const [autoLoggedOut, setAutoLoggedOut] = useState(false);

  // Auto-logout for restricted "booking" accounts after 30 minutes with no
  // interaction. This app doesn't sync data across open sessions in real
  // time, so a booking-only user who leaves the tab open for a long time
  // could act on stale equipment/availability info — kicking back to the
  // login screen forces a fresh reload of current data next time they sign
  // in. Admin accounts are unaffected (they're trusted to notice staleness
  // and refresh manually).
  useEffect(() => {
    if (!session || session.role !== "booking") return;
    const IDLE_LIMIT_MS = 30 * 60 * 1000;
    let timeoutId;
    function triggerLogout() {
      localStorage.removeItem(SESSION_KEY);
      setAutoLoggedOut(true);
      setSession(null);
    }
    function resetTimer() {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(triggerLogout, IDLE_LIMIT_MS);
    }
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(ev => window.addEventListener(ev, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timeoutId);
      events.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [session]);

  // Guest access: no session, but the URL is a scanned equipment QR link —
  // skip the login wall entirely and drop straight into a single-page view
  // of LabTrack (Daily check, or read-only equipment info/history) — no
  // other tab, no other page, and no account created.
  // Scanned equipment QR code (?tab=dailyCheck&equip=<id> or
  // ?tab=equipmentView&equip=<id>) — the printed codes stay the same, they
  // now open the calibration app. No staff login (or a booking-only login):
  // guest mode = Daily check form / read-only instrument info, as before.
  const qrTab = guestLinkTab();
  if (qrTab) {
    const params = new URLSearchParams(window.location.search);
    const equip = params.get("equip") || "";
    const asGuest = !session || session.role === "booking";
    const initial = qrTab === "dailyCheck"
      ? (asGuest ? { name: "guestDaily", instrumentId: equip } : { name: "instrument", instrumentId: equip, tab: "daily", openDaily: true })
      : { name: "instrument", instrumentId: equip, tab: "rounds" };
    return (
      <CalibrationApp guest={asGuest} initial={equip || qrTab === "dailyCheck" ? initial : null}
        currentUsername={session?.username || ""} currentDisplayName={session?.name || ""}
        onLogin={asGuest ? () => {
          const url = new URL(window.location.href);
          ["tab", "equip", "scale", "meter"].forEach(k => url.searchParams.delete(k));
          window.location.href = url.toString();
        } : null} />
    );
  }

  if (!session) {
    return <PasswordGate onLogin={(s) => { setAutoLoggedOut(false); setSession(s); }} autoLoggedOut={autoLoggedOut} />;
  }

  const isBookingOnly = session.role === "booking";
  const canApprove = session.role === "admin" || session.role === "approver";
  const visibleTabs = isBookingOnly ? TABS.filter(t => t.key === "labtrack") : TABS;
  const activeSection = isBookingOnly ? "labtrack" : section;

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  // Deep links into the calibration area (?app=calibration&equip=…&new=1 /
  // &edit=1) keep working: they are read once when that area opens.
  const calQ = new URLSearchParams(window.location.search);
  const calEquip = calQ.get("equip");
  const calInitial = calQ.get("new") === "1" ? { name: "equipNew" }
    : calEquip ? (calQ.get("edit") === "1" ? { name: "equipEdit", instrumentId: calEquip } : { name: "instrument", instrumentId: calEquip }) : null;

  return (
    <div style={styles.page} className="appPage">
      <style>{`
        .appTabShort { display: none; }
        @media (max-width: 1500px) { .appTabSub { display: none !important; } }
        @media (max-width: 640px) {
          .appPage { padding: 10px 10px 18px !important; }
          .appTopbar { padding: 8px 10px !important; gap: 8px !important; }
          .appTabRow { width: 100%; flex-wrap: nowrap !important; order: 5; gap: 6px !important; }
          .appTabBtn { flex: 1 1 0 !important; min-width: 0; justify-content: center !important; text-align: center; white-space: normal; line-height: 1.25; padding: 6px 6px !important; font-size: 12px !important; }
          .appTabBtn svg { display: none; }
          .appTabLong { display: none !important; }
          .appTabShort { display: inline !important; }
          .appHideMobile { display: none !important; }
          .appSearch { order: 6; max-width: none !important; flex-basis: 100% !important; }
        }
      `}</style>
      <div style={styles.topbar} className="appTopbar">
        <div style={styles.brand}>
          <img src="/logo.png" alt="MPIR Central Lab" style={styles.logo} />
          <div>
            <div style={styles.brandName}>MPIR Central Lab</div>
            <div style={styles.brandSub}>ระบบห้องปฏิบัติการ</div>
          </div>
        </div>
        {visibleTabs.length > 1 && (
          <div style={styles.tabRow} className="appTabRow">
            {visibleTabs.map(({ key, label, sub, Icon }) => {
              const active = activeSection === key;
              return (
                <button
                  key={key}
                  onClick={() => setSection(key)}
                  style={{ ...styles.tabBtn, ...(active ? styles.tabBtnActive : null) }}
                  className="appTabBtn"
                >
                  <Icon size={16} />
                  <span>
                    <span style={styles.tabLabel} className="appTabLong">{label}</span>
                    <span style={styles.tabLabel} className="appTabShort">{TABS.find(t => t.key === key).short}</span>
                    <span style={styles.tabSub} className="appTabSub"> · {sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!isBookingOnly && <HeaderSearch onGo={go} />}
        <div style={styles.userBox}>
          <QuickActions role={session.role} onGo={go} />
          <span style={styles.userName}>{session.name || session.username}</span>
          <button onClick={logout} style={styles.logoutBtn} title="ออกจากระบบ">
            <LogOut size={14} />
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {activeSection === "labtrack" && <LabTrackApp key={navKey} restrictToBooking={isBookingOnly} currentUsername={session.username} currentDisplayName={session.name} canApprove={canApprove} />}
        {activeSection === "calibration" && !isBookingOnly && <div style={styles.areaFrame}><CalibrationApp key={navKey} currentUsername={session.username} currentDisplayName={session.name} initial={calInitial} /></div>}
        {activeSection === "analysis" && !isBookingOnly && <AnalysisApp key={navKey} />}
      </div>
    </div>
  );
}

// Colours and font come from TOKENS_CSS above: blue #1F5FA8 + white, Sarabun.
const styles = {
  areaFrame: { background: "#fff", border: "1px solid var(--mpir-border)", borderRadius: 12, overflow: "hidden" },
  page: {
    fontFamily: "var(--mpir-font)",
    background: "var(--mpir-page)",
    minHeight: "100vh",
    padding: "16px 20px 28px",
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    background: "#fff",
    border: "1px solid var(--mpir-border)",
    borderRadius: 12,
    padding: "10px 16px",
    marginBottom: 16,
    position: "sticky",
    top: 0,
    zIndex: 30,
    boxShadow: "0 2px 8px rgba(11,42,74,0.06)",
  },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 40, objectFit: "contain" },
  brandName: { fontWeight: 700, fontSize: 15, color: "var(--mpir-text)" },
  brandSub: { fontSize: 11, color: "var(--mpir-text-2)" },
  tabRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  tabBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#fff",
    color: "var(--mpir-text-2)",
    border: "1px solid var(--mpir-border)",
    borderRadius: 9,
    padding: "8px 14px",
    minHeight: 40,
    fontSize: 13,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  tabBtnActive: {
    background: "var(--mpir-primary)",
    color: "#fff",
    border: "1px solid var(--mpir-primary)",
  },
  tabLabel: { fontWeight: 600 },
  tabSub: { fontSize: 11, opacity: 0.85 },
  userBox: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" },
  userName: { fontSize: 12.5, fontWeight: 600, color: "var(--mpir-text)" },
  logoutBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "#F3F8FD", border: "1px solid #D3E6F5", borderRadius: 8,
    padding: 7, cursor: "pointer", color: "#5B7A96",
  },
  content: {},
  plusBtn: {
    display: "flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 12px",
    background: "var(--mpir-primary)", color: "#fff", border: "1px solid var(--mpir-primary)",
    borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
  },
  menu: {
    position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 220, zIndex: 40,
    background: "#fff", border: "1px solid var(--mpir-border)", borderRadius: 10,
    boxShadow: "0 8px 24px rgba(27,36,48,0.12)", padding: 6, display: "flex", flexDirection: "column",
  },
  menuItem: {
    display: "flex", alignItems: "center", gap: 8, textAlign: "left", width: "100%", minHeight: 40,
    background: "none", border: "none", borderRadius: 8, padding: "8px 12px",
    fontSize: 13.5, fontFamily: "inherit", color: "var(--mpir-text)", cursor: "pointer",
  },
  resultKind: {
    fontSize: 11, color: "var(--mpir-primary)", background: "var(--mpir-primary-light)",
    borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap", flexShrink: 0,
  },
  searchBox: {
    display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px",
    background: "#fff", border: "1px solid var(--mpir-border)", borderRadius: 9,
  },
  searchInput: { flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 13.5, fontFamily: "inherit", background: "transparent", color: "var(--mpir-text)" },
};
