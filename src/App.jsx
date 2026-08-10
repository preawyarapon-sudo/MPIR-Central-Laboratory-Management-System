import { useState, useEffect } from "react";
import { Wrench, FlaskConical, Lock, LogOut } from "lucide-react";
import LabTrackApp from "./labtrack/LabTrackApp.jsx";
import AnalysisApp from "./analysis/AnalysisApp.jsx";

const TABS = [
  { key: "labtrack", label: "จัดการห้องแล็บ", sub: "LabTrack", Icon: Wrench },
  { key: "analysis", label: "ติดตามงานวิเคราะห์", sub: "Lab Analysis Tracker", Icon: FlaskConical },
];

// Shared team accounts, kept out of source control ideally (see .env.local /
// README) — the original shared login stays configurable via env vars for
// backward compatibility; the two new named accounts are fixed here.
// This only gates the UI in the browser — it does NOT restrict who can read
// or write the underlying data at the storage layer (see notes in README).
// Roles:
//   "admin"   — full access to every tab (both LabTrack and Analysis), same
//               as the original shared login.
//   "booking" — LabTrack only, and inside LabTrack restricted to just the
//               "จอง/ยืมเครื่องมือ" (equipment booking) tab. Cannot see
//               equipment/chemicals/consumables/PR/reports or Analysis at all.
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
  { username: "pimchanokb", password: "mpir1234", role: "booking", name: "Pimchanok Busayapongchai" },
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
  { username: "yaraponp", password: "mpir1234", role: "booking", name: "Yarapon Puttakot" },
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
  { username: "thidarati", password: "mpir1234", role: "booking", name: "Thidarat Intakham" },
  { username: "panitk", password: "mpir1234", role: "booking", name: "Panit Kitsubun" },
  { username: "suteek", password: "mpir1234", role: "booking", name: "Sutee Kiddee" },
];

const SESSION_KEY = "mpirLabSession";

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
    fontFamily: "'Prompt', ui-sans-serif, system-ui, sans-serif",
    background: "#EAF3FB",
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

export default function App() {
  const [section, setSection] = useState("labtrack");
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

  if (!session) {
    return <PasswordGate onLogin={(s) => { setAutoLoggedOut(false); setSession(s); }} autoLoggedOut={autoLoggedOut} />;
  }

  const isBookingOnly = session.role === "booking";
  const visibleTabs = isBookingOnly ? TABS.filter(t => t.key === "labtrack") : TABS;
  const activeSection = isBookingOnly ? "labtrack" : section;

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  return (
    <div style={styles.page} className="appPage">
      <style>{`
        @media (max-width: 640px) {
          .appPage { padding: 10px 10px 18px !important; }
          .appTopbar { padding: 8px 10px !important; }
          .appTabRow { width: 100%; }
          .appTabBtn { flex: 1 1 auto !important; justify-content: center !important; }
          .appTabSub { display: none !important; }
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
                    <span style={styles.tabLabel}>{label}</span>
                    <span style={styles.tabSub} className="appTabSub"> · {sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div style={styles.userBox}>
          <span style={styles.userName}>{session.name || session.username}</span>
          <button onClick={logout} style={styles.logoutBtn} title="ออกจากระบบ">
            <LogOut size={14} />
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {activeSection === "labtrack" && <LabTrackApp restrictToBooking={isBookingOnly} currentUsername={session.username} />}
        {activeSection === "analysis" && !isBookingOnly && <AnalysisApp />}
      </div>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "'Prompt', ui-sans-serif, system-ui, sans-serif",
    background: "#EAF3FB",
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
    border: "1px solid #D3E6F5",
    borderRadius: 12,
    padding: "10px 16px",
    marginBottom: 16,
  },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 40, objectFit: "contain" },
  brandName: { fontWeight: 700, fontSize: 15, color: "#0B2A4A" },
  brandSub: { fontSize: 11, color: "#5B7A96" },
  tabRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  tabBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#F3F8FD",
    color: "#5B7A96",
    border: "1px solid #D3E6F5",
    borderRadius: 9,
    padding: "8px 14px",
    fontSize: 13,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  tabBtnActive: {
    background: "#0E6FBA",
    color: "#fff",
    borderColor: "#0E6FBA",
  },
  tabLabel: { fontWeight: 600 },
  tabSub: { fontSize: 11, opacity: 0.85 },
  userBox: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" },
  userName: { fontSize: 12.5, fontWeight: 600, color: "#0B2A4A" },
  logoutBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "#F3F8FD", border: "1px solid #D3E6F5", borderRadius: 8,
    padding: 7, cursor: "pointer", color: "#5B7A96",
  },
  content: {},
};
