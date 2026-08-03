import { useState } from "react";
import { Wrench, FlaskConical, Lock } from "lucide-react";
import LabTrackApp from "./labtrack/LabTrackApp.jsx";
import AnalysisApp from "./analysis/AnalysisApp.jsx";

const TABS = [
  { key: "labtrack", label: "จัดการห้องแล็บ", sub: "LabTrack", Icon: Wrench },
  { key: "analysis", label: "ติดตามงานวิเคราะห์", sub: "Lab Analysis Tracker", Icon: FlaskConical },
];

// Shared team login, kept out of source control (see .env.local / README).
// This only gates the UI in the browser — it does not restrict who can read
// or write the underlying Firebase data (see notes in README).
const APP_USERNAME = import.meta.env.VITE_APP_USERNAME || "mpirlab";
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || "mpir1234";
const ACCESS_KEY = "mpirLabAccessGranted";

function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(ACCESS_KEY) === "true");
  const [username, setUsername] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  if (unlocked) return children;

  const submit = (e) => {
    e.preventDefault();
    if (username === APP_USERNAME && input === APP_PASSWORD) {
      localStorage.setItem(ACCESS_KEY, "true");
      setUnlocked(true);
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

  return (
    <PasswordGate>
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
        <div style={styles.tabRow} className="appTabRow">
          {TABS.map(({ key, label, sub, Icon }) => {
            const active = section === key;
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
      </div>

      <div style={styles.content}>
        {section === "labtrack" && <LabTrackApp />}
        {section === "analysis" && <AnalysisApp />}
      </div>
    </div>
    </PasswordGate>
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
  content: {},
};
