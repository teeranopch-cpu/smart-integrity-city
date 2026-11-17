// ตั้งค่าที่ใช้กับทุกเครื่อง (นักเรียนและครู) — แก้ไขไฟล์นี้แล้วอัปโหลดขึ้น GitHub
// liveDb: URL ของ Firebase Realtime Database (เช่น https://ชื่อโปรเจกต์-default-rtdb.firebaseio.com) เพื่อให้ครูดูสดข้ามเครื่อง
// ปล่อยว่างไว้ = ดูสดได้เฉพาะในเบราว์เซอร์เครื่องเดียวกัน (คนละแท็บ)
// firebase: เก็บสมาชิก/ห้อง/คะแนนออนไลน์ (ดูวิธีตั้งค่าใน README) ปล่อยว่าง = เก็บในเบราว์เซอร์เครื่องนี้เหมือนเดิม
//   apiKey      = Project settings → General → Web API Key
//   databaseURL = Realtime Database → URL (เช่น https://ชื่อโปรเจกต์-default-rtdb.firebaseio.com)
window.SIC_CONFIG = { firebase: { apiKey: '', databaseURL: '' }, liveDb: '', aiEndpoint: '' };
