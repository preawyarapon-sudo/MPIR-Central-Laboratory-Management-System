import { useState } from "react";
import { Wrench, FlaskConical } from "lucide-react";
import LabTrackApp from "./labtrack/LabTrackApp.jsx";
import AnalysisApp from "./analysis/AnalysisApp.jsx";

const TABS = [
  { key: "labtrack", label: "จัดการห้องแล็บ", sub: "LabTrack", Icon: Wrench },
  { key: "analysis", label: "ติดตามงานวิเคราะห์", sub: "Lab Analysis Tracker", Icon: FlaskConical },
];

export default function App() {
  const [section, setSection] = useState("labtrack");

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brand}>
          <img src="/logo.png" alt="MPIR Central Lab" style={styles.logo} />
          <div>
            <div style={styles.brandName}>MPIR Central Lab</div>
            <div style={styles.brandSub}>ระบบห้องปฏิบัติการ</div>
          </div>
        </div>
        <div style={styles.tabRow}>
          {TABS.map(({ key, label, sub, Icon }) => {
            const active = section === key;
            return (
              <button
                key={key}
                onClick={() => setSection(key)}
                style={{ ...styles.tabBtn, ...(active ? styles.tabBtnActive : null) }}
              >
                <Icon size={16} />
                <span>
                  <span style={styles.tabLabel}>{label}</span>
                  <span style={styles.tabSub}> · {sub}</span>
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
