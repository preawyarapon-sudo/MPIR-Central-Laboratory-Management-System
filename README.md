# MPIR Central Lab — LabTrack + Lab Analysis Tracker (รวมแอป)

แอปเดียว มีแท็บสลับด้านบนระหว่าง 2 ส่วน:

- **จัดการห้องแล็บ (LabTrack)** — เครื่องมือ / สารเคมี / พัสดุสิ้นเปลือง (`src/labtrack/`)
- **ติดตามงานวิเคราะห์ (Lab Analysis Tracker)** — ติดตามรหัสงานวิเคราะห์ (`src/analysis/`)

โค้ดของแต่ละแอปเดิม **ไม่ได้แก้ไขฟังก์ชันการทำงานใดๆ** ย้ายเข้ามาอยู่คนละโฟลเดอร์
เท่านั้น (`src/labtrack/LabTrackApp.jsx`, `src/analysis/AnalysisApp.jsx`) แล้วสร้าง
`src/App.jsx` ใหม่เป็น "เปลือก" ด้านนอกที่มีแท็บสลับสองส่วนนี้

## โครงสร้างไฟล์

```
src/
  App.jsx                 ← เปลือกนอก มีแท็บสลับ 2 ส่วน
  labtrack/
    LabTrackApp.jsx       ← โค้ด LabTrack เดิม (ไม่แก้ไข)
    firebase.js           ← Firebase config ของ LabTrack (project: lab-track-mpir)
    storage-shim.js        ← จำลอง window.storage ด้วย Firebase Realtime DB
  analysis/
    AnalysisApp.jsx        ← โค้ด Lab Analysis Tracker เดิม (ไม่แก้ไข)
    firebase.js            ← Firebase config ของ Lab Analysis Tracker (project เดิม)
api/
  notify-line.js           ← endpoint แจ้งเตือน LINE ของ Lab Analysis Tracker (ยกมาทั้งไฟล์)
public/
  logo.png                 ← โลโก้ MPIR Central Lab
```

**สำคัญ:** ทั้งสองส่วนยังใช้ **Firebase คนละ project กันเหมือนเดิม** —
LabTrack ใช้ `lab-track-mpir`, Lab Analysis Tracker ใช้ project เดิมของมัน
(`planning-with-ai-a162c`) ข้อมูลของสองส่วนไม่ได้ถูกรวมเป็นฐานข้อมูลเดียวกัน
เพียงแต่แสดงในแอปเดียวกันผ่านแท็บ ถ้าภายหลังอยากรวมฐานข้อมูลจริงๆ บอกได้

## ตั้งค่าในเครื่อง

```bash
cp .env.local.example .env.local
```
ใส่ค่า Firebase ของ **LabTrack** ลงใน `.env.local` (เหมือนเดิม — Lab Analysis
Tracker ไม่ต้องตั้งอะไรเพิ่ม เพราะ config ฝังอยู่ในไฟล์ `src/analysis/firebase.js`
โดยตรงตามที่ยกมาจากโปรเจกต์เดิม)

```bash
npm install
npm run dev
```

## การแจ้งเตือน LINE

`api/notify-line.js` ถูกยกมาทั้งไฟล์จาก Lab Analysis Tracker เดิม (ยังใช้งานได้
เหมือนเดิมถ้าตั้งค่า environment variables `LINE_CHANNEL_ACCESS_TOKEN` และ
`LINE_GROUP_ID` ใน Vercel ไว้แล้ว) — เรื่องเพิ่มการแจ้งเตือนสั่งซื้อของและแจ้ง
ซ่อมเครื่องมือฝั่ง LabTrack ยังไม่ได้ทำ (ตามที่ตกลงกันว่าจะทำทีหลัง)

## Deploy ขึ้น GitHub + Vercel

เหมือนขั้นตอนเดิมที่เคยทำ — push ทั้งโฟลเดอร์นี้ขึ้น repo แล้วให้ Vercel
import ใหม่ (หรือแทนที่โค้ดใน repo LabTrack เดิมก็ได้ ถ้าต้องการให้ URL เดิม
กลายเป็นแอปรวม) อย่าลืมตั้ง environment variables ให้ครบทั้งฝั่ง Firebase
ของ LabTrack (7 ตัวแปร) และถ้าต้องการเปิดแจ้งเตือน LINE ก็เพิ่ม
`LINE_CHANNEL_ACCESS_TOKEN` กับ `LINE_GROUP_ID` ด้วย
