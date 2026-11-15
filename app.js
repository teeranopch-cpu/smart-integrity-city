'use strict';
// ===== ที่เก็บข้อมูล (localStorage ในเบราว์เซอร์ — ดูข้อจำกัดใน README) =====
const KEY = 'sic_v1';
const initDB = () => ({ users: [], session: null, lessons: [JSON.parse(JSON.stringify(DEFAULT_LESSON))], rooms: {} });
const loadDB = () => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY)) || initDB();
    if (!Array.isArray(d.users)) d.users = [];
    if (!d.session || typeof d.session !== 'object') d.session = null; // ข้อมูลเวอร์ชันเก่า
    (d.lessons || []).forEach((l) => { // ข้อสอบรูปแบบเก่า (ปรนัย 5 ข้อ) → ข้อสอบปลายเปิดชุดใหม่
      if (!l.pretest || !l.posttest || !l.posttest[0] || !l.posttest[0].keys || !l.pretest[0].keys) {
        l.pretest = JSON.parse(JSON.stringify(DEFAULT_LESSON.pretest)); l.posttest = JSON.parse(JSON.stringify(DEFAULT_LESSON.posttest)); l.passScore = DEFAULT_LESSON.passScore;
      }
      if (!l.points) l.points = JSON.parse(JSON.stringify(DEFAULT_POINTS));
      if (!l.points.auditRight) l.points.auditRight = [...DEFAULT_POINTS.auditRight];
      if (!l.points.auditWrong) l.points.auditWrong = [...DEFAULT_POINTS.auditWrong];
      if (!l.auditBank || typeof l.auditBank !== 'object') l.auditBank = JSON.parse(JSON.stringify(DEFAULT_LESSON.auditBank));
      else ROLES.forEach((ro) => { if (!Array.isArray(l.auditBank[ro.id]) || !l.auditBank[ro.id].length) l.auditBank[ro.id] = JSON.parse(JSON.stringify(DEFAULT_LESSON.auditBank[ro.id])); });
      if (!l.missions || typeof l.missions !== 'object' || ROLES.some((ro) => !Array.isArray(l.missions[ro.id]) || l.missions[ro.id].length < 3 || !Array.isArray(l.missions[ro.id][0].items))) {
        l.missions = JSON.parse(JSON.stringify(DEFAULT_LESSON.missions));
      }
      if (!l.helpBank || typeof l.helpBank !== 'object') l.helpBank = JSON.parse(JSON.stringify(DEFAULT_LESSON.helpBank));
      else ROLES.forEach((ro) => { if (!Array.isArray(l.helpBank[ro.id]) || !l.helpBank[ro.id].length) l.helpBank[ro.id] = JSON.parse(JSON.stringify(DEFAULT_LESSON.helpBank[ro.id])); });
    });
    return d;
  } catch { return initDB(); }
};
let DB = loadDB();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('พื้นที่จัดเก็บเต็ม (รูปหลักฐานอาจใหญ่เกินไป)'); } };

let ui = { view: 'home', code: null, pid: null, act: null, actor: null, slotRole: ROLES[0].id, slotTrait: TRAITS[0].id, auditTarget: null, pre: null, post: null, tab: 'lessons', authMode: 'login', lessonId: null, radarPid: null, tTab: 'lessons', tRoom: null, step: 1, cSet: 'pretest', cIdx: 0, cText: '' };

// ===== ตัวช่วย =====
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const roleName = (id) => (ROLES.find((r) => r.id === id) || {}).name || id;
const roleIcon = (id) => (ROLES.find((r) => r.id === id) || {}).icon || '';
const traitName = (id) => (TRAITS.find((t) => t.id === id) || {}).name || id;
const room = () => DB.rooms[ui.code];
const lessonOf = (r) => DB.lessons.find((l) => l.id === r.lessonId) || DB.lessons[0];
const me = () => DB.session; // {role:'teacher'|'player', name, roomCode?}
const isTeacher = () => !!DB.session && DB.session.role === 'teacher';
const fmtT = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const sgn = (n) => (n > 0 ? '+' + n : String(n));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600); }
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const options = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const roleOpts = (sel) => options(ROLES.map((r) => [r.id, r.icon + ' ' + r.name]), sel);
const go = (view, extra = {}) => { Object.assign(ui, { view }, extra); render(); window.scrollTo(0, 0); };

function fileToDataURL(file, maxW = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const fr = new FileReader();
    fr.onload = () => { img.src = fr.result; };
    fr.onerror = reject;
    img.onload = () => {
      const k = Math.min(1, maxW / img.width); const c = document.createElement('canvas');
      c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject; fr.readAsDataURL(file);
  });
}

// ===== แผนภูมิเรดาร์ (SVG) =====
function radar(series, max = TRAIT_MAX) {
  const cx = 150, cy = 140, R = 100, n = TRAITS.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + (R * v / max) * Math.cos(a), cy + (R * v / max) * Math.sin(a)]; };
  let g = '';
  for (let lv = 1; lv <= max; lv++) g += `<polygon points="${TRAITS.map((_, i) => pt(i, lv).join(',')).join(' ')}" fill="none" stroke="currentColor" opacity=".2"/>`;
  TRAITS.forEach((t, i) => { const [x, y] = pt(i, max), [lx, ly] = pt(i, max * 1.18); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="currentColor" opacity=".2"/><text x="${lx}" y="${ly}" font-size="13" text-anchor="middle" fill="currentColor">${t.name}</text>`; });
  for (const s of series) g += `<polygon points="${s.vals.map((v, i) => pt(i, v).join(',')).join(' ')}" fill="${s.color}" fill-opacity=".25" stroke="${s.color}" stroke-width="2"/>`;
  const legend = series.map((s, i) => `<text x="10" y="${270 + i * 16}" font-size="12" fill="${s.color}">■ ${s.label}</text>`).join('');
  return `<svg viewBox="0 0 300 310" width="100%" style="max-width:340px">${g}${legend}</svg>`;
}

// ===== การแสดงผลแต่ละหน้า =====
function nav() {
  const u = me();
  $('#nav').innerHTML = u
    ? `<span>${u.role === 'teacher' ? '🧑‍🏫 ครู' : '👤'} ${esc(u.name)}</span>${isTeacher() ? '<button data-act="teacher">หลังบ้านครู</button>' : ''}<button data-act="logout">ออกจากระบบ</button>`
    : '';
}

function vLogin() {
  const reg = ui.authMode === 'register';
  return `<div class="card" style="max-width:420px;margin:24px auto"><h1>🏙️ Smart Integrity City</h1><h2>${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2>
    ${reg ? '<label>ชื่อ</label><input id="rName" autocomplete="name" placeholder="ชื่อของคุณ">' : ''}
    <label>อีเมล</label><input id="lEmail" type="email" autocomplete="email" placeholder="you@example.com">
    <label>${reg ? 'รหัสผ่าน (อย่างน้อย 6 ตัว)' : 'รหัสผ่าน / รหัสครู'}</label><input id="lCode" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}">
    ${reg ? '<label>ยืนยันรหัสผ่าน</label><input id="rPw2" type="password" autocomplete="new-password">' : ''}
    <p class="row"><button data-act="${reg ? 'doRegister' : 'doLogin'}">${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>
    <button class="alt" data-act="authMode" data-m="${reg ? 'login' : 'register'}">${reg ? 'มีบัญชีแล้ว' : 'สมัครสมาชิกใหม่'}</button></p>
    ${reg ? '' : '<p class="muted">ถ้าใส่รหัสครูในช่องรหัสผ่านจะเข้าสู่ระบบครู นอกเหนือจากนั้นเข้าสู่ระบบผู้เล่นปกติด้วยบัญชีที่สมัครไว้</p>'}
    <p class="muted">บัญชีเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น</p></div>`;
}

function vHome() {
  const cur = me().roomCode && DB.rooms[me().roomCode];
  return `
  <div class="card"><h1>Smart Integrity City</h1>
    <p class="muted">สวัสดี ${esc(me().name)} — เลือกสิ่งที่ต้องการทำ</p></div>
  <div class="grid g2">
    <div class="card"><h3>สร้างห้อง</h3><p class="muted">เลือกสื่อการสอน แล้วลงทะเบียนผู้เล่น 6 คน</p><button data-act="create">สร้างห้อง</button></div>
    <div class="card"><h3>ค้นหาห้องเรียน</h3><p class="muted">ใช้รหัสห้องเพื่อทำภารกิจหน้าห้องเรียน สอบหลังเรียน และรับเกียรติบัตร</p>
      <label>รหัสห้อง</label><input id="findCode" maxlength="6" placeholder="เช่น AB12" style="text-transform:uppercase"><p><button data-act="findRoom">ค้นหาห้อง</button></p></div>
  </div>
  ${cur ? `<div class="card"><b>ห้องล่าสุดของคุณ: ${cur.code}</b> (${statusLabel(cur.status)}) <button class="alt" data-act="enter" data-code="${cur.code}">กลับเข้าห้อง</button></div>` : ''}`;
}
const statusLabel = (s) => ({ lobby: 'เตรียมเกม', playing: 'กำลังเล่น', ended: 'จบเกมแล้ว' }[s] || s);

function vCreate() {
  return `<div class="card"><h2>สร้างห้อง</h2><label>เลือกสื่อการสอน</label>
    <select id="cLesson">${options(DB.lessons.map((l) => [l.id, l.name]))}</select>
    <p><button data-act="doCreate">สร้างห้องและรับรหัส</button></p></div>`;
}

function vLobby() {
  const r = room(), L = lessonOf(r);
  const byRole = (id) => r.players.find((p) => p.role === id);
  const filled = r.players.length, ready = filled >= 2 && r.players.every((p) => p.pre);
  return `
  <div class="card"><div class="muted">รหัสห้อง</div><div class="code">${r.code}</div><div class="muted">สื่อการสอน: ${esc(L.name)}</div></div>
  <div class="card"><h3>ลงทะเบียนผู้เล่น 6 คน</h3><p class="muted">กรอกชื่อผู้เล่นของแต่ละอาชีพ แล้วกด "บันทึกรายชื่อ" จากนั้นให้แต่ละคนทำ Pre-Test</p>
    <table><tr><th>ผู้เล่น</th><th>อาชีพ</th><th>ชื่อ</th><th>Pre-Test</th></tr>
    ${ROLES.map((ro, i) => { const p = byRole(ro.id); return `<tr><td>คนที่ ${i + 1}</td><td>${ro.icon} ${ro.name}</td>
      <td><input data-reg="${ro.id}" value="${esc(p ? p.name : '')}" placeholder="ชื่อผู้เล่น"></td>
      <td>${p ? (p.pre ? `<span class="good">เสร็จแล้ว (${Object.values(p.pre).reduce((x, y) => x + y, 0)}/${L.pretest.length * EXAM_MAX})</span>` : `<span class="bad">ยังไม่ทำ</span> <button class="alt" data-act="startPre" data-pid="${p.id}">ทำ Pre-Test</button>`) : '<span class="muted">บันทึกชื่อก่อน</span>'}</td></tr>`; }).join('')}</table>
    <p><button data-act="saveRoster">บันทึกรายชื่อ</button></p></div>
  <div class="card"><h3>ตั้งค่าเกม</h3>
    <div class="grid g2"><div><label>เวลาเล่น (นาที, ขั้นต่ำ 20)</label><input id="sDur" type="number" min="20" value="${r.durationMin}"></div>
    <div><label>ดัชนีเมืองสุจริตเริ่มต้น</label><input id="sCity" type="number" min="1" value="${r.cityStart}"></div></div>
    <p class="row"><button class="alt" data-act="saveSettings">บันทึกการตั้งค่า</button>
    <button data-act="startGame" ${ready ? '' : 'disabled'}>เริ่มเกม</button></p>
    ${ready ? '' : '<p class="muted">เริ่มเกมได้เมื่อมีผู้เล่นอย่างน้อย 2 คน และทุกคนที่ลงทะเบียนทำ Pre-Test แล้ว</p>'}</div>`;
}

const LEVELS = ['ปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก'];
const LEVEL_DESC = ['ไม่ตอบ ตอบไม่ตรงประเด็น หรือไม่สอดคล้องกับคุณลักษณะที่วัด', 'ตอบได้บางส่วน แต่ยังไม่ชัดเจนหรือขาดเหตุผล/แนวทางสำคัญ', 'ตอบตรงประเด็น มีแนวทางปฏิบัติหรือเหตุผลสอดคล้องกับคุณลักษณะที่วัด', 'ตอบตรงประเด็นมากที่สุด'];

// หน้าทำข้อสอบปลายเปิดทีละข้อ ใช้ร่วมกันระหว่าง Pre-Test (k='pre') และ Post-Test (k='post')
function examView(P, items, title, k) {
  const n = items.length, q = items[P.i], done = P.phase === 'result' ? P.i + 1 : P.i;
  const A = k === 'pre' ? { begin: 'beginQ', next: 'nextQ', after: 'preNext' } : { begin: 'beginPost', next: 'nextPost', after: 'postNext' };
  const cancel = k === 'pre' ? `<button class="alt" data-act="enter" data-code="${room().code}">ยกเลิก</button>` : '<button class="alt" data-act="postCancel">ยกเลิก</button>';
  const head = `<div class="card"><h2>${esc(title)}</h2><div class="muted">ข้อ ${P.i + 1} จาก ${n} · ข้อละ ${EXAM_MAX} คะแนน</div><div class="prog"><i style="width:${(done / n) * 100}%"></i></div></div>`;
  const qBox = `<div class="q big"><b>ข้อ ${P.i + 1} (${traitName(q.trait)})</b><br>${esc(q.q)}</div>`;
  if (P.phase === 'read') {
    return head + `<div class="card">${qBox}
      <p class="muted">ให้อ่านโจทย์ให้เข้าใจก่อน เมื่อพร้อมแล้วกด "เริ่มทำ" ระบบจะเริ่มนับเวลา 30 วินาที</p>
      <p class="row"><button data-act="${A.begin}">เริ่มทำ</button>${cancel}</p></div>`;
  }
  if (P.phase === 'result') {
    const sc = P.scores[P.i], last = P.i + 1 >= n;
    return head + `<div class="card">${qBox}<div class="q"><b>คำตอบ:</b> ${esc(P.ans[P.i] || '') || '<span class="muted">(ไม่ได้ตอบ)</span>'}</div>
      <div class="muted">คะแนนข้อนี้ (ความตรงกับแนวคำตอบ)</div><div class="big">${sc.score} / ${EXAM_MAX}</div>${Number.isFinite(sc.sim) ? `<div class="muted">ความใกล้เคียงกับแนวคำตอบ ≈ ${Math.min(100, Math.round(sc.sim * 100))}%</div>` : ''}<div class="muted"><b>ระดับ ${LEVELS[sc.score]}</b> — ${LEVEL_DESC[sc.score]}<br>ประเมินเบื้องต้นโดยระบบ</div>
      <p><button data-act="${A.after}">${last ? (k === 'pre' ? 'จบ Pre-Test' : 'จบ Post-Test') : 'ข้อถัดไป'}</button></p></div>`;
  }
  return head + `<div class="card">${qBox}
    <div class="row"><span class="muted">เหลือเวลา</span><span class="big" id="ptimer">00:30</span></div>
    <textarea id="examText" data-bind="examAns" data-k="${k}" data-i="${P.i}" placeholder="พิมพ์คำตอบ...">${esc(P.ans[P.i] || '')}</textarea>
    <p class="row"><button data-act="${A.next}">ส่งคำตอบข้อนี้</button></p>
    <p class="muted">หมดเวลาแล้วระบบจะส่งคำตอบที่พิมพ์ไว้อัตโนมัติ และแสดงคะแนนข้อนี้</p></div>`;
}

function vPretest() {
  const r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === ui.pre.pid);
  return examView(ui.pre, L.pretest, 'Pre-Test: ' + p.name, 'pre');
}

function barCity(r) { const pct = Math.min(100, (r.city / r.cityStart) * 100); return `<div class="bar"><i style="width:${pct}%"></i></div>`; }

function vGame() {
  const r = room(), L = lessonOf(r);
  if (r.status === 'ended') return vEnd();
  if (ui.act) return vActPage(r);
  if (!ui.actor || !r.players.find((p) => p.id === ui.actor)) ui.actor = r.players[0].id;
  return `
  ${vNotice()}<div class="card"><div class="row" style="justify-content:space-between"><div><div class="muted">ดัชนีเมืองสุจริต</div><div class="big">${r.city}</div></div>
    <div><div class="muted">เวลาที่เหลือ</div><div class="big" id="gtimer">--:--</div></div>
    <button class="danger" data-act="forceEnd">จบเกมทันที</button></div>${barCity(r)}</div>
  <div class="card"><table><tr><th>ผู้เล่น</th><th>อาชีพ</th><th>ดัชนีชีวิต</th><th>แต้มร่วมมือ</th><th>ขั้นภารกิจ</th></tr>
  ${r.players.map((p) => `<tr><td>${esc(p.name)}</td><td>${roleIcon(p.role)} ${roleName(p.role)}</td><td>${p.life}</td><td>${p.coop}</td><td>${'●'.repeat(p.step)}${'○'.repeat(3 - p.step)}</td></tr>`).join('')}</table></div>
  <div class="card"><h3>ทำรายการ</h3>
    ${vActMenu(r)}</div>
  ${vAdjust(r)}
  <div class="card"><h3>บันทึกเหตุการณ์ล่าสุด</h3>${r.log.length ? `<table>${r.log.slice(-8).reverse().map((l) => { const p = r.players.find((x) => x.id === l.pid); return `<tr><td>${p ? esc(p.name) : '-'}</td><td>${esc(l.reason)}</td><td>ชีวิต ${sgn(l.life)} / ร่วมมือ ${sgn(l.coop)} / เมือง ${sgn(l.city)}</td></tr>`; }).join('')}</table>` : '<p class="muted">ยังไม่มี</p>'}</div>`;
}

function vActMenu() {
  return `<p class="muted">เลือกช่องที่ผู้เล่นเดินไปตก แล้วเลือกผู้เล่นก่อนเริ่ม</p><div class="grid g2">
   <div class="card"><b>ช่องภารกิจพลเมือง (12 ช่อง)</b><p><button data-act="actCivic">เริ่ม</button></p></div>
   <div class="card"><b>ช่องคุณลักษณะ (5 ช่อง)</b><p><button data-act="actTrait">เริ่ม</button></p></div>
   <div class="card"><b>ช่องท้าทายจริยธรรม (5 ช่อง)</b><p><button data-act="actEthics">เริ่ม</button></p></div>
   <div class="card"><b>ช่องตรวจสอบ (3 ช่อง)</b><p><button data-act="actAudit">เริ่ม</button></p></div></div>`;
}

function vAdjust(r) {
  const b = (pid, f, d) => `<button class="alt sm" data-act="adj" data-pid="${pid}" data-f="${f}" data-d="${d}" aria-label="${d > 0 ? 'บวก' : 'ลบ'}">${d > 0 ? '+' : '−'}</button>`;
  const cell = (pid, f, v) => `<td><div class="row" style="flex-wrap:nowrap">${v === null ? '' : `<b style="min-width:2.2em">${v}</b>`}${b(pid, f, -1)}${b(pid, f, 1)}</div></td>`;
  return `<div class="card"><h3>ปรับคะแนนด้วยตนเอง (บวก/ลบ)</h3>
    <p class="muted">กดปุ่มแต่ละครั้งปรับ 1 แต้ม</p>
    <div class="scroll"><table><tr><th>ผู้เล่น</th><th>ดัชนีชีวิต</th><th>แต้มร่วมมือ</th><th>ดัชนีเมือง</th></tr>
    ${r.players.map((p) => `<tr><td>${esc(p.name)}</td>${cell(p.id, 'life', p.life)}${cell(p.id, 'coop', p.coop)}${cell(p.id, 'city', null)}</tr>`).join('')}
    <tr><td><b>ดัชนีเมือง (ทั้งเมือง)</b></td><td></td><td></td>${cell('', 'city', r.city)}</tr></table></div></div>`;
}

const KIND_NAMES = { civic: 'ช่องภารกิจพลเมือง', trait: 'ช่องคุณลักษณะ', ethics: 'ช่องท้าทายจริยธรรม', audit: 'ช่องตรวจสอบ' };

function vNotice() {
  const n = ui.notice;
  return n ? `<div class="card"><div class="muted">ผลล่าสุด</div><b>${esc(n.who)}</b> · ${esc(n.title)}<br>${esc(n.msg)}</div>` : '';
}

// หน้าแยกสำหรับทำรายการ: แสดงเฉพาะรายการเดียว ชื่อผู้เล่นและช่องที่ตกตัวใหญ่ ซ่อนข้อมูลอื่นไว้จนทำเสร็จ
function vActPage(r) {
  const a = ui.act, p = r.players.find((x) => x.id === a.pid);
  let banner = `<h1 class="slot">${KIND_NAMES[a.kind]}</h1>`;
  if (a.stage !== 'setup' && p) {
    let slot = '';
    if (a.kind === 'civic') slot = `${roleIcon(a.owner)} ${a.own ? 'ภารกิจของตัวเอง · อาชีพ' : 'ช่องช่วยเหลือ · ช่องของอาชีพ'}${roleName(a.owner)}`;
    if (a.kind === 'trait') slot = `ช่องคุณลักษณะ: ${traitName(a.trait)}`;
    if (a.kind === 'ethics') slot = 'ช่องท้าทายจริยธรรม';
    if (a.kind === 'audit') { const ins = r.players.find((x) => x.id === a.inspector); slot = `ช่องตรวจสอบ · ผู้ตรวจสอบ: ${esc(ins ? ins.name : '')}`; }
    banner = `<div class="who">${esc(p.name)}</div><div class="slot">${slot}</div>`;
  }
  return `<div class="card focus">${banner}${vAct()}</div>`;
}

function vAct() {
  const a = ui.act, r = room(), p = r.players.find((x) => x.id === a.pid);
  const pl = (sel) => options(r.players.map((x) => [x.id, x.name + ' (' + roleName(x.role) + ')']), sel);
  if (a.stage === 'setup') {
    let body, btn;
    if (a.kind === 'audit') {
      body = `<label>ผู้ตรวจสอบ</label><select data-bind="actSet" data-f="inspector">${pl(a.inspector)}</select><label>ผู้ถูกตรวจสอบ</label><select data-bind="actSet" data-f="pid">${pl(a.pid)}</select>`; btn = 'สุ่มโจทย์';
    } else {
      body = `<label>เลือกผู้เล่น</label><select data-bind="actSet" data-f="pid">${pl(a.pid)}</select>`;
      if (a.kind === 'civic') { body += `<label>ตกช่องของอาชีพ</label><select data-bind="actSet" data-f="role">${roleOpts(a.role)}</select>`; btn = 'แสดงโจทย์'; }
      if (a.kind === 'trait') { body += `<label>คุณลักษณะ</label><select data-bind="actSet" data-f="trait">${options(TRAITS.map((t) => [t.id, t.name]), a.trait)}</select>`; btn = 'สุ่มโจทย์'; }
      if (a.kind === 'ethics') btn = 'สุ่มโจทย์';
    }
    return `${body}<p class="row"><button data-act="actGo">${btn}</button><button class="alt" data-act="cancelAct">ยกเลิก</button></p>`;
  }
  if (a.kind === 'civic' && a.mode === 'tf') {
    const headTf = `<div class="q big"><b>${esc(a.title)}</b>${a.desc ? `<div class="muted" style="margin-top:4px">${esc(a.desc)}</div>` : ''}</div>`;
    if (!a.ev) {
      const doneCnt = (a.tfAns || []).filter((v) => v !== null).length;
      return headTf + `<div class="row" style="justify-content:space-between;margin:8px 0"><span class="muted">พิจารณาข้อความทั้ง ${a.items.length} ข้อ แล้วติ๊ก ถูก หรือ ผิด (เกณฑ์ผ่าน ${Math.min(TF_PASS_MIN, a.items.length)}/${a.items.length} ข้อ)</span><b id="tfCount">ตอบแล้ว ${doneCnt} / ${a.items.length} ข้อ</b></div>` +
        `<div class="tf-list">${a.items.map((it, i) => {
          const v = a.tfAns[i];
          return `<div class="tf-item" data-tf-row="${i}"><div class="tf-q"><b>ข้อ ${i + 1}.</b> ${esc(it.q)}</div><div class="tf-btns"><button type="button" class="alt tf-btn ${v === true ? 'on-true' : ''}" data-act="pickTf" data-i="${i}" data-v="true">✓ ถูก</button><button type="button" class="alt tf-btn ${v === false ? 'on-false' : ''}" data-act="pickTf" data-i="${i}" data-v="false">✗ ผิด</button></div></div>`;
        }).join('')}</div>` +
        `<p class="row"><button data-act="submitTf">ส่งคำตอบ (${a.items.length} ข้อ)</button><button class="alt" data-act="cancelAct">ยกเลิก</button></p>`;
    }
    const selTf = `<select id="vSel">${options([['pass', 'ผ่าน (เลื่อนขั้นภารกิจ +1)'], ['fail', 'ไม่ผ่าน (อยู่ขั้นเดิม)']], a.suggest)}</select>`;
    return headTf + `<div class="card" style="background:var(--bg)"><div class="muted">ผลตรวจภารกิจตัวละคร</div><div class="big ${a.ev.pass ? 'good' : 'bad'}">${a.ev.correct} / ${a.ev.total} ข้อ</div><div class="muted">${esc(a.ev.note)}</div></div>` +
      `<div class="tf-list">${a.ev.details.map((d, i) => `<div class="tf-item"><div><div><b>ข้อ ${i + 1}.</b> ${esc(d.q)}</div><div class="muted" style="margin-top:4px">คำตอบที่เลือก: <b>${d.pick ? 'ถูก' : 'ผิด'}</b> · เฉลย: <b>${d.expected ? 'ถูก' : 'ผิด'}</b></div></div><span class="pill ${d.ok ? 'good' : 'bad'}">${d.ok ? '✓ ผ่านความรู้' : '✗ เรียนรู้เพิ่มเติม'}</span></div>`).join('')}</div>` +
      `<div class="result"><b>ผลประเมินเบื้องต้น</b> (${esc(a.ev.note)})<br><label>ยืนยันผลก่อนบันทึก (ผู้ควบคุมเกมแก้ไขได้)</label>${selTf}<p class="row"><button data-act="confirmAct">ยืนยันและบันทึกแต้ม</button><button class="alt" data-act="cancelAct">ยกเลิก</button></p></div>`;
  }
  const head = `<div class="q big"><b>${esc(a.title)}</b><br>${esc(a.q)}</div>`;
  if (a.stage === 'read') {
    return head + `<p class="muted">อ่านโจทย์ให้เข้าใจก่อน เมื่อพร้อมกด "เริ่มทำ" ระบบจะเริ่มนับเวลา 30 วินาที</p>
      <p class="row"><button data-act="beginAct">เริ่มทำ</button><button class="alt" data-act="cancelAct">ยกเลิก</button></p>`;
  }
  if (!a.ev) {
    return head + (a.timed ? `<div class="row"><span class="muted">เหลือเวลา</span><span class="big" id="mtimer">00:30</span></div>` : '') +
      `<textarea data-bind="actText" placeholder="พิมพ์คำตอบ...">${esc(a.text || '')}</textarea>
      <p class="row"><button data-act="submitAct">ส่งให้ตรวจ</button><button class="alt" data-act="cancelAct">ยกเลิก</button></p>
      ${a.timed ? '<p class="muted">หมดเวลาแล้วระบบจะส่งคำตอบที่พิมพ์ไว้ให้ตรวจอัตโนมัติ</p>' : ''}`;
  }
  let sel = '';
  if (a.kind === 'civic') sel = `<select id="vSel">${options([['pass', 'ผ่าน'], ['fail', 'ไม่ผ่าน'], ['corrupt', 'ตอบเชิงทุจริต']], a.suggest)}</select>`;
  if (a.kind === 'trait') sel = `<select id="vSel">${options([['good', 'ตอบดี'], ['ok', 'พอใช้'], ['bad', 'ไม่เหมาะสม']], a.suggest)}</select>`;
  if (a.kind === 'ethics') sel = `<select id="vSel">${options([['right', 'ถูก'], ['wrong', 'ผิด']], a.suggest)}</select>`;
  if (a.kind === 'audit') sel = `<select id="vSel">${options([['right', 'ถูก (+10 ชีวิต, +10 เมือง)'], ['wrong', 'ผิด (−10 ชีวิต, −10 เมือง)']], a.suggest)}</select>`;
  const alignBox = (typeof a.ev.aligned === 'boolean')
    ? `<div class="q"><b>ตรวจความสอดคล้องกับแนวคำตอบ:</b> <span class="${a.ev.aligned ? 'good' : 'bad'}">${a.ev.aligned ? '✓ ' : '✗ '}${esc(a.ev.note)}</span></div>`
    : '';
  const ansHint = (a.qItem && a.qItem.ans)
    ? `<details ${(a.kind === 'audit' || a.kind === 'civic') ? 'open ' : ''}class="q" style="margin-top:8px"><summary style="cursor:pointer"><b>ดูแนวคำตอบ / แนวทางเกณฑ์ (สำหรับผู้ควบคุมเกม)</b></summary><div style="margin-top:6px;white-space:pre-line">${esc(a.qItem.ans)}</div></details>`
    : '';
  return head + `<div class="q"><b>คำตอบ:</b> ${esc(a.text) || '<span class="muted">(ไม่ได้ตอบ)</span>'}</div>${alignBox}${ansHint}<div class="result"><b>ผลประเมินเบื้องต้น</b> (${esc(a.ev.note || 'ตัวประเมินอัตโนมัติ')})<br>
    <label>ยืนยันผลก่อนบันทึก (ผู้ควบคุมเกมแก้ไขได้)</label>${sel}
    <p class="row"><button data-act="confirmAct">ยืนยันและบันทึกแต้ม</button><button class="alt" data-act="cancelAct">ยกเลิก</button></p></div>`;
}

function vEnd() {
  const r = room(), L = lessonOf(r), rank = ranking(r);
  if (!ui.radarPid || !r.players.find((p) => p.id === ui.radarPid)) ui.radarPid = rank[0] && rank[0].id;
  const rp = r.players.find((p) => p.id === ui.radarPid);
  const preV = rp ? TRAITS.map((t) => (rp.pre && rp.pre[t.id]) ?? 0) : [];
  const gameV = rp ? TRAITS.map((t) => rp.traitGame[t.id] ?? (rp.pre && rp.pre[t.id]) ?? 0) : [];
  const best = rp ? TRAITS[gameV.indexOf(Math.max(...gameV))].name : '', low = rp ? TRAITS[gameV.indexOf(Math.min(...gameV))].name : '';
  const win = r.endReason === 'collapse'
    ? `<div class="card" style="border-color:var(--bad)"><h2 class="bad">เมืองล่มสลาย — ทุกคนแพ้ร่วมกัน</h2><p>ดัชนีเมืองสุจริตลดลงถึง 0</p></div>`
    : `<div class="card" style="border-color:var(--good)"><h2 class="good">🏆 พลเมืองสุจริตดีเด่น: ${rank[0] ? esc(rank[0].name) : '-'}</h2></div>`;
  return win + `
  <div class="card"><div class="muted">ดัชนีเมืองคงเหลือ</div><div class="big">${r.city}</div>${barCity(r)}</div>
  <div class="card"><h3>สรุปภารกิจและคะแนนรวม</h3><table><tr><th>#</th><th>ผู้เล่น</th><th>อาชีพ</th><th>ขั้นภารกิจ</th><th>ดัชนีชีวิต</th><th>แต้มร่วมมือ</th><th>รวม</th></tr>
  ${rank.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${roleName(p.role)}</td><td>${p.step}/3</td><td>${p.life}</td><td>${p.coop}</td><td><b>${p.life + p.coop}</b></td></tr>`).join('')}</table></div>
  <div class="card"><h3>กราฟเรดาร์: ก่อนเล่น vs ผลในเกม</h3><label>เลือกผู้เล่น</label><select data-bind="radarPid">${options(r.players.map((p) => [p.id, p.name]), ui.radarPid)}</select>
   ${rp ? radar([{ label: 'ก่อนเล่น (Pre-Test)', vals: preV, color: '#8ab4f8' }, { label: 'หลังตัดสินใจในเกม', vals: gameV, color: '#f0c987' }]) + `<p>โดดเด่นด้าน <b>${best}</b> · ควรพัฒนาด้าน <b>${low}</b></p>` : ''}</div>
  <div class="card"><b>ขั้นต่อไป:</b> ให้ผู้เล่นใช้รหัสห้อง <span class="code" style="font-size:1.4rem">${r.code}</span> ไปทำภารกิจชีวิตจริงภายใน 3 วัน (ภายใน ${new Date(r.endedAt + 3 * 864e5).toLocaleString('th-TH')})
   <p><button data-act="joinPostNow">ไปหน้าหลังเกม</button></p></div>`;
}

function vJoinPost() {
  const r = ui.code && room();
  return `<div class="card" style="max-width:480px;margin:auto"><h2>หลังเกม: ภารกิจชีวิตจริง · สอบ · เกียรติบัตร</h2>
    <label>รหัสห้อง</label><input id="jCode" maxlength="6" value="${esc(ui.code || '')}"><p><button data-act="joinFind">ค้นหาห้อง</button></p>
    ${r && r.status === 'ended' ? `<label>เลือกชื่อของคุณ</label><select data-bind="pid"><option value="">— เลือก —</option>${r.players.map((p) => `<option value="${p.id}" ${p.id === ui.pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><p><button data-act="joinGo">เข้าสู่ระบบหลังเกม</button></p>` : r ? '<p class="bad">ห้องนี้ยังไม่จบเกม</p>' : ''}</div>`;
}

function vPost() {
  const r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === ui.pid);
  const deadline = r.endedAt + 3 * 864e5, over = Date.now() > deadline;
  if (ui.post) return examView(ui.post, L.posttest, 'Post-Test: ' + p.name, 'post');
  const tabs = [['mission', 'ภารกิจชีวิตจริง'], ['post', 'Post-Test'], ['cert', 'เกียรติบัตร']];
  let body = '';
  if (ui.tab === 'mission') {
    body = `<p class="${over ? 'bad' : 'muted'}">${over ? 'หมดเวลา 3 วัน — ระบบตัดสิทธิ์การส่งภารกิจแล้ว' : 'ส่งภายใน ' + new Date(deadline).toLocaleString('th-TH')}</p>` +
      TRAITS.map((t) => { const e = p.evidence[t.id]; return `<div class="card"><b>${t.name}</b>${e ? `<div class="row"><img class="ev" src="${e.img}" alt=""><div>${esc(e.desc)}<br><span class="pill">${{ pending: 'รอตรวจ', approved: 'ผ่าน', rejected: 'ไม่ผ่าน' }[e.status]}</span> <span class="muted">AI เบื้องต้น: ${{ pass: 'เข้าข่าย', fail: 'ไม่ชัดเจน', corrupt: 'น่าสงสัย' }[e.ai]}</span></div></div>` : ''}
        ${over && !e ? '' : e && e.status !== 'rejected' ? '' : `<label>อัปโหลดภาพ</label><input type="file" accept="image/*" data-ev="${t.id}"><label>คำอธิบายสิ่งที่ทำ</label><textarea data-evd="${t.id}"></textarea><p><button data-act="sendEv" data-t="${t.id}">ส่งหลักฐาน</button></p>`}</div>`; }).join('');
  }
  if (ui.tab === 'post') {
    const maxPost = L.posttest.length * EXAM_MAX;
    if (!p.post) {
      body = `<div class="card"><h3>แบบทดสอบหลังเรียน (Post-Test)</h3><p>ข้อสอบปลายเปิด ${L.posttest.length} ข้อ ข้อละ ${EXAM_MAX} คะแนน (เต็ม ${maxPost}) แสดงทีละข้อ อ่านโจทย์แล้วกด "เริ่มทำ" มีเวลา 30 วินาทีต่อข้อ และจะเห็นคะแนนทุกข้อทันที</p><button data-act="startPost">เริ่ม Post-Test</button></div>`;
    } else {
      const tmax = (id) => L.posttest.filter((q) => q.trait === id).length * EXAM_MAX, pre = p.pre || {}, bt = p.post.byTrait || {};
      const preTot = TRAITS.reduce((x, t) => x + (pre[t.id] || 0), 0), diff = (a, b) => (b - a > 0 ? '+' : '') + (b - a);
      body = `<div class="card"><h3>ผล Post-Test</h3><div class="big">${p.post.score} / ${maxPost}</div>
        <div class="scroll"><table><tr><th>คุณลักษณะ</th><th>Pre-Test</th><th>Post-Test</th><th>เปลี่ยนแปลง</th></tr>
        ${TRAITS.map((t) => `<tr><td>${t.name}</td><td>${p.pre ? (pre[t.id] ?? 0) + '/' + tmax(t.id) : '-'}</td><td>${bt[t.id] ?? 0}/${tmax(t.id)}</td><td>${p.pre ? diff(pre[t.id] ?? 0, bt[t.id] ?? 0) : '-'}</td></tr>`).join('')}
        <tr><td><b>รวม</b></td><td>${p.pre ? preTot + '/' + maxPost : '-'}</td><td><b>${p.post.score}/${maxPost}</b></td><td>${p.pre ? diff(preTot, p.post.score) : '-'}</td></tr></table></div></div>`;
    }
  }
  if (ui.tab === 'cert') {
    const s = totalScore(p, L);
    body = `<p>คะแนน: Post-Test ${s.post}/${L.posttest.length * EXAM_MAX} + ภารกิจชีวิตจริงที่ผ่าน ${s.ev}/${TRAITS.length} = <b>${s.total}/${s.max}</b> (เกณฑ์ผ่าน ${L.passScore})</p>` + (s.pass
      ? `<div class="cert"><div>เกียรติบัตรฉบับนี้ให้ไว้เพื่อแสดงว่า</div><div class="nm">${esc(p.name)}</div><h1>ผ่านการอบรม Smart Integrity City</h1><div>เสริมสร้างคุณลักษณะ คิด วินัย ซื่อสัตย์ พอเพียง จิตสาธารณะ</div><p>ห้อง ${r.code} · ${new Date().toLocaleDateString('th-TH')}</p></div><p class="noprint"><button data-act="print">พิมพ์ / บันทึกเป็น PDF</button></p>`
      : '<p class="bad">ยังไม่ผ่านเกณฑ์ — ต้องทำ Post-Test และให้ครูตรวจภารกิจชีวิตจริงให้ครบก่อน</p>');
  }
  return `<div class="card noprint"><h2>${esc(p.name)} · ห้อง ${r.code}</h2><div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div></div>${body}`;
}

// ===== หลังบ้านครู =====
function vTeacher() {
  if (!isTeacher()) return vHome();
  const tabs = [['lessons', 'สื่อการสอน'], ['points', 'ตารางแต้มกลาง'], ['review', 'ตรวจภารกิจชีวิตจริง'], ['export', 'ส่งออก Excel'], ['live', 'ดูสด'], ['calib', 'ทดลองตรวจ/แนวคำตอบ']];
  if (!ui.lessonId || !DB.lessons.find((l) => l.id === ui.lessonId)) ui.lessonId = DB.lessons[0].id;
  const L = DB.lessons.find((l) => l.id === ui.lessonId), mine = Object.values(DB.rooms);
  let body = '';
  if (ui.tTab === 'lessons' || ui.tTab === 'points') body = `<label>ชุดสื่อการสอน</label><select data-bind="lessonId">${options(DB.lessons.map((l) => [l.id, l.name]), ui.lessonId)}</select>`;
  if (ui.tTab === 'lessons') {
    body += `<p class="muted">แก้ไขเป็น JSON: ข้อสอบ Pre/Post, ภารกิจตัวละคร 3 ขั้น (ขั้นละ 10 ข้อ ถูก/ผิด) ของ 6 ตัวละคร, คลังภารกิจช่วยเหลือ (60 สถานการณ์), คลังข้อสอบตรวจสอบ (60 ข้อ), คำสำคัญที่ใช้ตรวจ</p>
      <textarea id="lJson" style="min-height:420px;font-family:monospace;font-size:.8rem">${esc(JSON.stringify(L, null, 2))}</textarea>
      <p class="row"><button data-act="saveLesson">บันทึก</button><button class="alt" data-act="copyLesson">ทำสำเนาเป็นชุดใหม่</button><button class="danger" data-act="delLesson" ${DB.lessons.length < 2 ? 'disabled' : ''}>ลบชุดนี้</button></p>`;
  }
  if (ui.tTab === 'points') {
    body += `<table><tr><th>เหตุการณ์</th><th>ดัชนีชีวิต</th><th>แต้มร่วมมือ</th><th>ดัชนีเมือง</th></tr>${Object.keys(POINT_LABELS).map((k) => `<tr><td>${POINT_LABELS[k]}</td>${[0, 1, 2].map((i) => `<td><input type="number" data-pt="${k}" data-i="${i}" value="${L.points[k][i]}"></td>`).join('')}</tr>`).join('')}</table>
      <label>เกณฑ์ผ่านเกียรติบัตร (เต็ม ${L.posttest.length * EXAM_MAX + TRAITS.length}: Post-Test ${L.posttest.length * EXAM_MAX} + ภารกิจชีวิตจริง ${TRAITS.length})</label><input type="number" id="passScore" min="1" max="${L.posttest.length * EXAM_MAX + TRAITS.length}" value="${L.passScore}"><p><button data-act="savePoints">บันทึกตารางแต้ม</button></p>`;
  }
  if (ui.tTab === 'review') {
    body += mine.length ? mine.map((r) => `<div class="card"><b>ห้อง ${r.code}</b>${r.players.map((p) => Object.entries(p.evidence).map(([t, e]) => `<div class="row" style="margin-top:8px"><img class="ev" src="${e.img}" alt=""><div><b>${esc(p.name)}</b> · ${traitName(t)}<br>${esc(e.desc)}<br><span class="pill">${e.status}</span> <button data-act="rev" data-code="${r.code}" data-pid="${p.id}" data-t="${t}" data-s="approved">ผ่าน</button> <button class="alt" data-act="rev" data-code="${r.code}" data-pid="${p.id}" data-t="${t}" data-s="rejected">ไม่ผ่าน</button></div></div>`).join('')).join('') || '<p class="muted">ยังไม่มีหลักฐาน</p>'}</div>`).join('') : '<p class="muted">ยังไม่มีห้อง</p>';
  }
  if (ui.tTab === 'export') {
    body += mine.length ? `<label>เลือกห้อง</label><select data-bind="tRoom">${options(mine.map((r) => [r.code, r.code + ' · ' + statusLabel(r.status)]), ui.tRoom || mine[0].code)}</select><p><button data-act="exportCsv">ดาวน์โหลดรายงาน (เปิดด้วย Excel ได้)</button></p>` : '<p class="muted">ยังไม่มีห้อง</p>';
  }
  if (ui.tTab === 'live') {
    body += `<p class="muted">แสดงสิ่งที่ผู้เรียนกำลังพิมพ์ แบบเรียลไทม์ (อัปเดตทุก ~2 วินาที) · โหมด: <b>${window.SicLive.mode() === 'remote' ? 'ข้ามเครื่อง (ฐานข้อมูลออนไลน์)' : 'เครื่อง/เบราว์เซอร์เดียวกันเท่านั้น'}</b>${window.SicLive.mode() === 'remote' ? '' : '<br>ถ้านักเรียนใช้เครื่องอื่น ต้องตั้งค่า liveDb ใน config.js (ดู README)'}</p><p><button class="alt" data-act="liveClear">ล้างรายการ</button></p><div id="liveBox"><p class="muted">กำลังโหลด...</p></div>`;
  }
  if (ui.tTab === 'calib') {
    const sets = [['pretest', 'Pre-Test'], ['posttest', 'Post-Test']], cs = ui.cSet || 'pretest', ci = Math.min(ui.cIdx || 0, L[cs].length - 1), cq = L[cs][ci], th = Object.assign({}, SIM_DEFAULT, L.exam || {});
    let res = '';
    if (ui.cText) { const r = scoreExam2(ui.cText, cq, th); res = `<div class="result"><b>คะแนน ${r.score}/${EXAM_MAX}</b> · ความใกล้เคียง ≈ ${Math.round(r.sim * 100)}% · ตรงกลุ่มคำสำคัญ ${r.hits}/3${r.reversed ? ' · <span class="bad">ตรวจพบถ้อยคำกลับด้าน → 0</span>' : ''}</div>`; }
    body += `<p class="muted">ทดสอบพิมพ์คำตอบตัวอย่างเพื่อดูว่าระบบให้กี่คะแนน เพิ่ม "คำตอบอื่นที่รับได้" ให้ข้อนั้น และปรับเกณฑ์ % ได้</p>
      <div class="row"><select data-bind="cSet">${options(sets, cs)}</select><select data-bind="cIdx">${options(L[cs].map((x, i) => [String(i), 'ข้อ ' + (i + 1) + ' · ' + traitName(x.trait)]), String(ci))}</select></div>
      <div class="q">${esc(cq.q)}</div><div class="muted">แนวคำตอบ: ${esc(cq.ans)}</div>
      <label>คำตอบอื่นที่รับได้ (บรรทัดละ 1 คำตอบ)</label><textarea id="cAlts" style="min-height:90px">${esc((cq.alts || []).join('\n'))}</textarea>
      <p><button data-act="saveAlts">บันทึกคำตอบที่รับได้</button></p>
      <label>ลองพิมพ์คำตอบของนักเรียน</label><textarea id="cText" style="min-height:90px">${esc(ui.cText || '')}</textarea><p><button data-act="tryScore">ตรวจ</button></p>${res}
      <h3>เกณฑ์ความใกล้เคียง (0–100%)</h3><div class="row"><label>≥ ได้ 1 คะแนน<input type="number" id="t1" value="${Math.round(th.t1 * 100)}"></label><label>≥ ได้ 2 คะแนน<input type="number" id="t2" value="${Math.round(th.t2 * 100)}"></label><label>≥ ได้ 3 คะแนน<input type="number" id="t3" value="${Math.round(th.t3 * 100)}"></label></div><p><button data-act="saveTh">บันทึกเกณฑ์</button></p>`;
  }
  return `<div class="card"><h2>หลังบ้านครู</h2><div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.tTab === k ? 'on' : ''}" data-act="tTab" data-t="${k}">${l}</button>`).join('')}</div>${body}</div>`;
}

const VIEWS = { home: vHome, login: vLogin, create: vCreate, lobby: vLobby, pretest: vPretest, game: vGame, end: vEnd, joinPost: vJoinPost, post: vPost, teacher: vTeacher };

// ===== ดูสด: สถานะที่ส่งให้ครู =====
function liveState() {
  const p = me(); if (!p || isTeacher()) return null;
  const base = { user: p.name || p.email || '' };
  const P = ui.view === 'pretest' ? ui.pre : ui.view === 'post' ? ui.post : null;
  if (P && P.phase) {
    const L = lessonOf(room()), items = ui.view === 'pretest' ? L.pretest : L.posttest, q = items[P.i];
    return Object.assign(base, { room: ui.code || '', who: base.user, screen: ui.view === 'pretest' ? 'Pre-Test' : 'Post-Test', stage: P.phase, qi: P.i + 1, qn: items.length, q: q ? q.q : '', text: String(P.ans[P.i] || '').slice(0, 2000), startedAt: P.startedAt || 0, limitSec: PRE_MS / 1000 });
  }
  const a = ui.act;
  if (ui.view === 'game' && a && a.stage && a.stage !== 'setup') {
    const r = room(), pl = r && r.players.find((x) => x.id === a.pid);
    return Object.assign(base, { room: ui.code || '', who: pl ? pl.name : base.user, screen: 'กิจกรรมในเกม: ' + a.kind, stage: a.stage, qi: 0, qn: 0, q: (a.q && (a.q.q || a.q.text || a.q)) || a.prompt || '', text: String(a.text || '').slice(0, 2000), startedAt: a.startedAt || 0, limitSec: MISSION_MS / 1000 });
  }
  return Object.assign(base, { room: ui.code || '', who: base.user, screen: ui.view, stage: '', qi: 0, qn: 0, q: '', text: '', startedAt: 0, limitSec: 0 });
}
function livePush(immediate) { if (window.SicLive) try { window.SicLive.publish(liveState(), immediate); } catch (e) {} }

// ===== ดูสด (ฝั่งครู) =====
const esc2 = (s) => esc(String(s == null ? '' : s));
async function liveRefresh() {
  const box = $('#liveBox'); if (!box || ui.view !== 'teacher' || ui.tTab !== 'live') return;
  const all = await window.SicLive.fetchAll(), now = Date.now();
  const rows = Object.values(all).filter((x) => x && x.id).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
  const b2 = $('#liveBox'); if (!b2) return;
  b2.innerHTML = (all.__error ? '<p class="bad">เชื่อมต่อฐานข้อมูลไม่ได้</p>' : '') + (rows.length ? rows.map((x) => {
    const age = Math.max(0, Math.round((now - (x.updatedAt || 0)) / 1000)), off = now - (x.updatedAt || 0) > window.SicLive.STALE_MS;
    let t = ''; if (x.startedAt && x.limitSec && x.stage === 'answer') t = ' · เหลือ ' + Math.max(0, Math.round(x.limitSec - (now - x.startedAt) / 1000)) + ' วิ';
    return `<div class="card" style="${off ? 'opacity:.5' : ''}"><div class="row"><b>${esc2(x.who)}</b><span class="pill">ห้อง ${esc2(x.room) || '-'}</span><span class="pill">${esc2(x.screen)}${x.qn ? ' ข้อ ' + x.qi + '/' + x.qn : ''}${x.stage ? ' · ' + esc2(x.stage) : ''}</span><span class="muted">${off ? 'ออฟไลน์/หยุดส่ง ' : 'อัปเดต '}${age} วิที่แล้ว${t}</span></div>${x.q ? `<div class="muted">โจทย์: ${esc2(x.q)}</div>` : ''}<div class="q">${x.text ? esc2(x.text) : '<span class="muted">(ยังไม่ได้พิมพ์)</span>'}</div></div>`;
  }).join('') : '<p class="muted">ยังไม่มีผู้เรียนที่กำลังทำอยู่</p>');
}
setInterval(liveRefresh, 2000);
function render() {
  if (!me()) ui.view = 'login';
  else if (ui.view === 'login') ui.view = 'home';
  if (ui.view === 'teacher' && !isTeacher()) ui.view = 'home';
  nav(); $('#app').innerHTML = VIEWS[ui.view](); tick(); livePush(true); liveRefresh();
}

// ===== นาฬิกา =====
function tick() {
  const r = ui.code && DB.rooms[ui.code];
  const g = $('#gtimer');
  if (r && r.status === 'playing') {
    const left = r.endsAt - Date.now();
    if (left <= 0) { endGame(r, 'time'); save(); go('end'); return; }
    if (g) g.textContent = fmtT(left);
  }
  const P = ui.view === 'pretest' ? ui.pre : ui.view === 'post' ? ui.post : null;
  if (P && P.phase === 'answer' && !P.busy) {
    const left = PRE_MS - (Date.now() - P.startedAt), pt = $('#ptimer');
    if (pt) { pt.textContent = fmtT(Math.max(0, left) + 999); pt.className = left <= 10000 ? 'big bad' : 'big'; }
    if (left <= 0) { if (ui.view === 'pretest') H.nextQ(); else H.nextPost(); return; }
  }
  const a = ui.act;
  if (ui.view === 'game' && a && a.timed && a.stage === 'answer' && !a.ev && !a.busy) {
    const left = MISSION_MS - (Date.now() - a.startedAt), m = $('#mtimer');
    if (m) { m.textContent = fmtT(Math.max(0, left) + 999); m.className = left <= 10000 ? 'big bad' : 'big'; }
    if (left <= 0) { submitAnswer(true); return; }
  }
}
setInterval(tick, 250);
setInterval(() => { if (window.SicLive) { const s = liveState(); if (s) window.SicLive.heartbeat(s); } }, 4000);

// ===== เหตุการณ์ =====
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join(''); } while (DB.rooms[c]); return c; };
function enterRoom(code) {
  const r = DB.rooms[(code || '').toUpperCase()]; if (!r) return toast('ไม่พบห้อง');
  ui.code = r.code; DB.session.roomCode = r.code; save();
  go(r.status === 'lobby' ? 'lobby' : r.status === 'playing' ? 'game' : 'end');
}
function traitGrade(r, t) { if (r.verdict === 'corrupt') return 'bad'; if (r.verdict === 'pass') return r.good >= 2 ? 'good' : 'ok'; return t.trim().length >= 15 ? 'ok' : 'bad'; }

function examBegin(P) { P.phase = 'answer'; P.startedAt = Date.now(); go(ui.view); const t = $('#examText'); if (t && t.focus) t.focus(); }
async function examSubmit(P, items, kind) { // ส่งคำตอบข้อนี้ → ประเมิน → แสดงคะแนนข้อนี้
  if (!P || P.busy || P.phase !== 'answer') return; P.busy = true;
  const t = $('#examText'); if (t && typeof t.value === 'string' && t.value) P.ans[P.i] = t.value;
  const res = await evaluateExam(P.ans[P.i] || '', lessonOf(room()), kind, items[P.i]);
  P.scores[P.i] = { score: res.score, sim: res.sim }; P.phase = 'result'; P.busy = false; render();
}

function startSetup(kind) {
  const r = room();
  if (kind === 'audit' && r.players.length < 2) return toast('ต้องมีผู้เล่นอย่างน้อย 2 คน');
  ui.notice = null;
  ui.act = { kind, stage: 'setup', pid: r.players[kind === 'audit' ? 1 : 0].id, inspector: r.players[0].id, role: ROLES[0].id, trait: TRAITS[0].id, text: '' };
  render();
}
async function submitAnswer(auto) {
  const a = ui.act; if (!a || a.busy || a.ev) return;
  const t = $('[data-bind=actText]'); if (t && typeof t.value === 'string' && t.value) a.text = t.value;
  if (!auto && !(a.text || '').trim()) return toast('พิมพ์คำตอบก่อน');
  a.busy = true;
  const L = lessonOf(room()), ev = await evaluate(a.text || '', L, a.kind);
  const hasExternalAI = typeof window !== 'undefined' && typeof window.AI_EVALUATOR === 'function';
  a.ev = ev;
  if (a.kind === 'civic') {
    if (!hasExternalAI && a.qItem && Array.isArray(a.qItem.keys)) {
      const helpRes = evalHelp(a.text || '', L, a.qItem);
      a.suggest = helpRes.verdict;
      ev.note = helpRes.note;
      ev.aligned = helpRes.verdict === 'pass';
    } else {
      a.suggest = ev.verdict;
    }
  }
  if (a.kind === 'trait') a.suggest = traitGrade(ev, a.text || '');
  if (a.kind === 'ethics') a.suggest = ev.verdict === 'pass' ? 'right' : 'wrong';
  if (a.kind === 'audit') {
    if (hasExternalAI && ev && ev.verdict) {
      a.suggest = ev.verdict === 'pass' ? 'right' : 'wrong';
    } else {
      const auditRes = evalAudit(a.text || '', L, a.qItem);
      a.suggest = auditRes.right ? 'right' : 'wrong';
      ev.note = auditRes.note;
      ev.aligned = auditRes.right;
    }
  }
  a.stage = 'review'; a.busy = false; render();
}

const H = {
  liveClear: async () => { await window.SicLive.clearAll(); liveRefresh(); },
  saveAlts: () => { const L = DB.lessons.find((l) => l.id === ui.lessonId); const cs = ui.cSet || 'pretest', i = ui.cIdx || 0; L[cs][i].alts = $('#cAlts').value.split('\n').map((x) => x.trim()).filter(Boolean); ui.cText = $('#cText').value; save(); toast('บันทึกแล้ว'); render(); },
  tryScore: () => { ui.cText = $('#cText').value; render(); },
  saveTh: () => { const L = DB.lessons.find((l) => l.id === ui.lessonId); const v = ['t1', 't2', 't3'].map((k) => +$('#' + k).value / 100); if (!(v[0] <= v[1] && v[1] <= v[2]) || v.some((x) => !(x >= 0 && x <= 1))) return toast('เกณฑ์ต้องเรียงจากน้อยไปมาก (0–100)'); L.exam = { t1: v[0], t2: v[1], t3: v[2] }; save(); toast('บันทึกเกณฑ์แล้ว'); render(); },
  home: () => go('home'),
  logout: () => { DB.session = null; save(); ui.code = null; go('login'); },
  create: () => go('create'),
  teacher: () => go('teacher'),
  enter: (b) => enterRoom(b.dataset.code),
  findRoom: () => { const c = $('#findCode').value.trim().toUpperCase(); if (!DB.rooms[c]) return toast('ไม่พบห้องนี้'); go('joinPost', { code: c, pid: null }); },
  joinPostNow: () => go('joinPost'),
  joinFind: () => { const c = $('#jCode').value.trim().toUpperCase(); if (!DB.rooms[c]) return toast('ไม่พบห้อง'); go('joinPost', { code: c }); },
  joinGo: () => { if (!ui.pid) return toast('เลือกชื่อก่อน'); go('post', { tab: 'mission', post: null }); },
  authMode: (b) => go('login', { authMode: b.dataset.m }),
  async doRegister() {
    const name = $('#rName').value.trim(), email = $('#lEmail').value.trim().toLowerCase(), pw = $('#lCode').value;
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return toast('กรอกชื่อและอีเมลให้ถูกต้อง');
    if (pw.length < 6) return toast('รหัสผ่านต้องมีอย่างน้อย 6 ตัว');
    if (pw !== $('#rPw2').value) return toast('ยืนยันรหัสผ่านไม่ตรงกัน');
    if (TEACHER_CODE_HASHES.includes(await sha(pw))) return toast('รหัสผ่านนี้ใช้ไม่ได้ กรุณาตั้งรหัสอื่น');
    if (DB.users.find((u) => u.email === email)) return toast('อีเมลนี้สมัครสมาชิกแล้ว');
    DB.users.push({ name, email, hash: await sha(pw) });
    DB.session = { role: 'player', name, email }; save(); toast('สมัครสมาชิกสำเร็จ'); go('home', { authMode: 'login' });
  },
  async doLogin() {
    const email = $('#lEmail').value.trim().toLowerCase(), pw = $('#lCode').value;
    if (!email || !pw) return toast('กรอกอีเมลและรหัสผ่าน');
    const h = await sha(pw);
    if (TEACHER_CODE_HASHES.includes(h)) { // รหัสครู → เข้าสู่ระบบครู
      const u = DB.users.find((x) => x.email === email);
      DB.session = { role: 'teacher', name: u ? u.name : email, email }; save(); toast('เข้าสู่ระบบครูแล้ว'); return go('home');
    }
    const u = DB.users.find((x) => x.email === email);
    if (!u || u.hash !== h) return toast('อีเมลหรือรหัสผ่านไม่ถูกต้อง (ถ้ายังไม่มีบัญชี กด "สมัครสมาชิกใหม่")');
    DB.session = { role: 'player', name: u.name, email }; save(); toast('เข้าสู่ระบบผู้เล่นแล้ว'); go('home');
  },
  doCreate: () => {
    const code = newCode(), lessonId = $('#cLesson').value;
    DB.rooms[code] = { code, owner: DB.session.name, lessonId, status: 'lobby', city: 100, cityStart: 100, durationMin: 20, players: [], log: [], createdAt: Date.now() };
    DB.session.roomCode = code; save(); ui.code = code; go('lobby');
  },
  saveRoster: () => {
    const r = room(); let n = 0;
    document.querySelectorAll('[data-reg]').forEach((i) => {
      const role = i.dataset.reg, name = i.value.trim(), p = r.players.find((x) => x.role === role);
      if (name && p) p.name = name;
      else if (name) r.players.push(newPlayer(name, role));
      else if (p) r.players = r.players.filter((x) => x !== p);
      if (name) n++;
    });
    save(); toast('บันทึกรายชื่อแล้ว (' + n + ' คน)'); render();
  },
  saveSettings: () => {
    const r = room(), d = parseInt($('#sDur').value, 10), c = parseInt($('#sCity').value, 10);
    if (!(d >= 20)) return toast('เวลาเล่นต้องไม่น้อยกว่า 20 นาที');
    if (!(c >= 1)) return toast('ดัชนีเมืองเริ่มต้นไม่ถูกต้อง');
    r.durationMin = d; r.cityStart = c; r.city = c; save(); toast('บันทึกแล้ว'); render();
  },
  startPre: (b) => {
    const r = room(), p = r && r.players.find((x) => x.id === b.dataset.pid);
    if (!p) return;
    if (p.pre) return toast('ทำ Pre-Test แล้ว ไม่สามารถทำใหม่ได้');
    go('pretest', { pre: { pid: b.dataset.pid, ans: [], scores: [], i: 0, phase: 'read', busy: false } });
  },
  beginQ: () => examBegin(ui.pre),
  nextQ: () => examSubmit(ui.pre, lessonOf(room()).pretest, 'pretest'),
  async preNext() {
    const P = ui.pre; if (!P || P.phase !== 'result') return;
    if (P.i + 1 < lessonOf(room()).pretest.length) { P.i += 1; P.phase = 'read'; return go('pretest'); }
    await H.finishPre();
  },
  async finishPre() {
    const r = room(), L = lessonOf(r), P = ui.pre, p = r.players.find((x) => x.id === P.pid), sum = {}, cnt = {};
    if (p.pre) { ui.pre = null; return go('lobby'); }
    L.pretest.forEach((q, i) => { sum[q.trait] = (sum[q.trait] || 0) + (P.scores[i] ? P.scores[i].score : 0); cnt[q.trait] = (cnt[q.trait] || 0) + 1; });
    p.pre = {}; TRAITS.forEach((t) => { p.pre[t.id] = cnt[t.id] ? sum[t.id] : TRAIT_MAX / 2; }); // เต็ม 6 ต่อคุณลักษณะ
    p.preScores = P.scores.map((x) => x.score);
    p.traitGame = {}; save(); ui.pre = null; toast('บันทึกผล Pre-Test แล้ว'); go('lobby');
  },
  startPost: () => go('post', { post: { ans: [], scores: [], i: 0, phase: 'read', busy: false } }),
  beginPost: () => examBegin(ui.post),
  nextPost: () => examSubmit(ui.post, lessonOf(room()).posttest, 'posttest'),
  postCancel: () => go('post', { post: null }),
  async postNext() {
    const P = ui.post; if (!P || P.phase !== 'result') return;
    const r = room(), L = lessonOf(r);
    if (P.i + 1 < L.posttest.length) { P.i += 1; P.phase = 'read'; return go('post'); }
    const p = r.players.find((x) => x.id === ui.pid), byTrait = {}; let total = 0;
    L.posttest.forEach((q, i) => { const v = P.scores[i] ? P.scores[i].score : 0; byTrait[q.trait] = (byTrait[q.trait] || 0) + v; total += v; });
    p.post = { score: total, byTrait, scores: P.scores.map((x) => x.score), at: Date.now() };
    save(); toast('บันทึกผล Post-Test แล้ว'); go('post', { post: null, tab: 'post' });
  },
  startGame: () => {
    const r = room(); r.status = 'playing'; r.startedAt = Date.now(); r.endsAt = r.startedAt + r.durationMin * 60000; r.city = r.cityStart;
    r.players.forEach((p) => { p.life = 0; p.coop = 0; p.step = 0; }); r.log = []; save(); ui.act = null; go('game');
  },
  forceEnd: () => { if (confirm('จบเกมตอนนี้และสรุปผลตามคะแนน?')) { endGame(room(), 'time'); save(); go('end'); } },
  actCivic: () => startSetup('civic'),
  actTrait: () => startSetup('trait'),
  actEthics: () => startSetup('ethics'),
  actAudit: () => startSetup('audit'),
  actGo: () => {
    const a = ui.act, r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === a.pid);
    if (!p) return toast('เลือกผู้เล่นก่อน');
    if (a.kind === 'audit') {
      if (a.inspector === a.pid) return toast('ผู้ตรวจสอบและผู้ถูกตรวจสอบต้องเป็นคนละคน');
      const bank = (L.auditBank && Array.isArray(L.auditBank[p.role]) && L.auditBank[p.role].length) ? L.auditBank[p.role] : L.audit;
      if (!r.usedAudit) r.usedAudit = {};
      let pool = bank.map((item, idx) => ({ item, idx })).filter((x) => !(r.usedAudit[p.role] || []).includes(x.idx));
      if (!pool.length) { r.usedAudit[p.role] = []; pool = bank.map((item, idx) => ({ item, idx })); }
      const pick = rnd(pool);
      r.usedAudit[p.role] = [...(r.usedAudit[p.role] || []), pick.idx];
      const item = pick.item;
      const qText = typeof item === 'string' ? item : item.q;
      Object.assign(a, {
        title: 'ภารกิจตรวจสอบ (' + roleName(p.role) + ')',
        q: qText,
        qItem: typeof item === 'string' ? null : item,
        timed: true,
        stage: 'read',
      });
      return go('game');
    }
    if (a.kind === 'civic') {
      const own = a.role === p.role;
      if (own) {
        if (p.step >= 3) return toast('ภารกิจส่วนตัวของผู้เล่นนี้ครบ 3 ขั้นแล้ว');
        const m = L.missions[p.role][p.step];
        Object.assign(a, {
          owner: a.role,
          own: true,
          mode: 'tf',
          trait: m.t,
          title: 'ภารกิจที่ ' + (p.step + 1) + ' : ' + m.title,
          desc: m.desc || '',
          items: m.items || [],
          tfAns: Array((m.items || []).length).fill(null),
          timed: false,
          stage: 'answer',
        });
        return render();
      }
      const bank = (L.helpBank && Array.isArray(L.helpBank[a.role]) && L.helpBank[a.role].length) ? L.helpBank[a.role] : [L.help[a.role]];
      if (!r.usedHelp) r.usedHelp = {};
      let pool = bank.map((item, idx) => ({ item, idx })).filter((x) => !(r.usedHelp[a.role] || []).includes(x.idx));
      if (!pool.length) { r.usedHelp[a.role] = []; pool = bank.map((item, idx) => ({ item, idx })); }
      const pick = rnd(pool);
      r.usedHelp[a.role] = [...(r.usedHelp[a.role] || []), pick.idx];
      const item = pick.item;
      Object.assign(a, {
        owner: a.role,
        own: false,
        mode: 'text',
        trait: item.t,
        title: 'ภารกิจช่วยเหลือ ' + roleName(a.role) + (item.title ? ' : ' + item.title : ''),
        q: item.q,
        qItem: item.keys ? item : null,
        timed: true,
        stage: 'read',
      });
      return go('game');
    }
    if (a.kind === 'trait') Object.assign(a, { title: 'ช่องคุณลักษณะ: ' + traitName(a.trait), q: rnd(L.traits[a.trait]) });
    if (a.kind === 'ethics') { const e = rnd(L.ethics); Object.assign(a, { trait: e.t, title: 'ช่องท้าทายจริยธรรม', q: e.q }); }
    Object.assign(a, { timed: true, stage: 'read' }); render();
  },
  pickTf: (b) => {
    const a = ui.act; if (!a || a.mode !== 'tf' || a.ev) return;
    const i = +b.dataset.i, val = b.dataset.v === 'true';
    a.tfAns[i] = val;
    const row = document.querySelector(`[data-tf-row="${i}"]`);
    if (row) {
      row.querySelectorAll('.tf-btn').forEach((btn) => {
        const bv = btn.dataset.v === 'true';
        btn.classList.toggle('on-true', val === true && bv === true);
        btn.classList.toggle('on-false', val === false && bv === false);
      });
    }
    const cntEl = $('#tfCount');
    if (cntEl) cntEl.textContent = `ตอบแล้ว ${a.tfAns.filter((v) => v !== null).length} / ${a.items.length} ข้อ`;
  },
  submitTf: () => {
    const a = ui.act; if (!a || a.mode !== 'tf' || a.ev) return;
    const missing = a.tfAns.findIndex((v) => v === null);
    if (missing !== -1) {
      const row = document.querySelector(`[data-tf-row="${missing}"]`);
      if (row && row.scrollIntoView) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast('กรุณาติ๊ก ถูก หรือ ผิด ให้ครบทุกข้อ (ข้อ ' + (missing + 1) + ')');
    }
    const res = evalTfMission(a.tfAns, a.items);
    a.ev = res;
    a.suggest = res.verdict;
    a.stage = 'review';
    render();
    window.scrollTo(0, 0);
  },
  beginAct: () => { ui.act.stage = 'answer'; ui.act.startedAt = Date.now(); go('game'); const t = $('[data-bind=actText]'); if (t && t.focus) t.focus(); },
  cancelAct: () => { ui.act = null; go('game'); },
  submitAct: () => submitAnswer(false),
  confirmAct: () => {
    const a = ui.act, r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === a.pid), v = $('#vSel').value; let msg;
    if (a.kind === 'civic') msg = resolveCivic(r, L, p, a.owner, v, a.trait);
    if (a.kind === 'trait') msg = resolveTrait(r, L, p, a.trait, v);
    if (a.kind === 'ethics') msg = resolveEthics(r, L, p, a.trait, v === 'right');
    if (a.kind === 'audit') msg = resolveAudit(r, L, p, { right: v === 'right' });
    ui.notice = { who: p.name, title: a.title, msg }; ui.act = null; save(); toast(msg);
    if (r.status === 'ended') go('end'); else go('game');
  },
  adj: (b) => {
    const r = room(), p = b.dataset.pid ? r.players.find((x) => x.id === b.dataset.pid) : null, d = (+b.dataset.d) * ui.step, delta = [0, 0, 0];
    delta[{ life: 0, coop: 1, city: 2 }[b.dataset.f]] = d;
    applyDelta(r, p, delta, 'ปรับคะแนนด้วยตนเอง'); save();
    if (r.status === 'ended') go('end'); else render();
  },
  tab: (b) => go('post', { tab: b.dataset.t }),
  async sendEv(b) {
    const r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === ui.pid), t = b.dataset.t;
    if (Date.now() > r.endedAt + 3 * 864e5) return toast('หมดเวลา 3 วัน ถูกตัดสิทธิ์แล้ว');
    const f = document.querySelector(`[data-ev=${t}]`).files[0], desc = document.querySelector(`[data-evd=${t}]`).value.trim();
    if (!f || !desc) return toast('ต้องมีทั้งรูปและคำอธิบาย');
    const img = await fileToDataURL(f), ai = (await evaluate(desc, L, 'evidence')).verdict;
    p.evidence[t] = { img, desc, ai, status: 'pending', at: Date.now() }; save(); toast('ส่งหลักฐานแล้ว รอครูตรวจ'); render();
  },
  print: () => window.print(),
  tTab: (b) => go('teacher', { tTab: b.dataset.t }),
  saveLesson: () => {
    try { const o = JSON.parse($('#lJson').value); o.id = ui.lessonId; if (!o.pretest || !o.posttest || !o.missions || !o.points || !o.keywords) throw 0; DB.lessons[DB.lessons.findIndex((l) => l.id === ui.lessonId)] = o; save(); toast('บันทึกแล้ว'); }
    catch { toast('JSON ไม่ถูกต้องหรือโครงสร้างไม่ครบ'); }
  },
  copyLesson: () => { const o = JSON.parse(JSON.stringify(DB.lessons.find((l) => l.id === ui.lessonId))); o.id = 'l' + Date.now().toString(36); o.name += ' (สำเนา)'; DB.lessons.push(o); save(); go('teacher', { lessonId: o.id }); },
  delLesson: () => { if (!confirm('ลบชุดนี้?')) return; DB.lessons = DB.lessons.filter((l) => l.id !== ui.lessonId); save(); go('teacher', { lessonId: null }); },
  savePoints: () => {
    const L = DB.lessons.find((l) => l.id === ui.lessonId);
    document.querySelectorAll('[data-pt]').forEach((i) => { L.points[i.dataset.pt][+i.dataset.i] = parseInt(i.value, 10) || 0; });
    L.passScore = parseInt($('#passScore').value, 10) || DEFAULT_LESSON.passScore; save(); toast('บันทึกแล้ว');
  },
  rev: (b) => { const p = DB.rooms[b.dataset.code].players.find((x) => x.id === b.dataset.pid); p.evidence[b.dataset.t].status = b.dataset.s; save(); render(); },
  exportCsv: () => {
    const r = DB.rooms[ui.tRoom || Object.values(DB.rooms)[0].code], L = lessonOf(r);
    const maxPost = L.posttest.length * EXAM_MAX, sum = (o) => (o ? Object.values(o).reduce((x, y) => x + y, 0) : '');
    const head = ['ชื่อ', 'อาชีพ', 'ขั้นภารกิจ', 'ดัชนีชีวิต', 'แต้มร่วมมือ', 'รวมในเกม', ...TRAITS.map((t) => 'Pre-' + t.name + '(เต็ม6)'), 'Pre-รวม(เต็ม' + maxPost + ')', ...TRAITS.map((t) => 'Game-' + t.name + '(เต็ม6)'), ...TRAITS.map((t) => 'Post-' + t.name + '(เต็ม6)'), 'Post-รวม(เต็ม' + maxPost + ')', 'ภารกิจชีวิตจริงที่ผ่าน', 'รวม(เต็ม' + (maxPost + TRAITS.length) + ')', 'ผ่านเกียรติบัตร'];
    const rows = ranking(r).map((p) => { const s = totalScore(p, L), pre = p.pre || {}, bt = (p.post && p.post.byTrait) || {}; return [p.name, roleName(p.role), p.step, p.life, p.coop, p.life + p.coop, ...TRAITS.map((t) => pre[t.id] ?? ''), sum(p.pre), ...TRAITS.map((t) => p.traitGame[t.id] ?? pre[t.id] ?? ''), ...TRAITS.map((t) => (p.post ? bt[t.id] ?? 0 : '')), p.post ? p.post.score : '', s.ev, s.total, s.pass ? 'ผ่าน' : 'ไม่ผ่าน']; });
    const csv = '﻿' + [head, ...rows].map((l) => l.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'smart-integrity-city-' + r.code + '.csv'; a.click();
  },
};

document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; e.preventDefault(); const f = H[b.dataset.act]; if (f) f(b); });
document.addEventListener('input', (e) => {
  const b = e.target.dataset && e.target.dataset.bind;
  if (b === 'examAns') { const P = e.target.dataset.k === 'post' ? ui.post : ui.pre; if (P) P.ans[+e.target.dataset.i] = e.target.value; }
  if (b === 'actText' && ui.act) ui.act.text = e.target.value;
  if (b === 'examAns' || b === 'actText') livePush();
});
document.addEventListener('change', (e) => {
  const b = e.target.dataset && e.target.dataset.bind; if (!b || b === 'examAns' || b === 'actText') return;
  if (b === 'actSet') { if (ui.act) ui.act[e.target.dataset.f] = e.target.value; return; }
  ui[b] = e.target.value; if (b === 'tRoom' || b === 'slotRole' || b === 'slotTrait' || b === 'auditTarget') return; render();
});

render();
