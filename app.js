'use strict';
// ===== ที่เก็บข้อมูล (localStorage ในเบราว์เซอร์ — ดูข้อจำกัดใน README) =====
const KEY = 'sic_v1';
const initDB = () => ({ users: [], session: null, lessons: [JSON.parse(JSON.stringify(DEFAULT_LESSON))], rooms: {} });
const loadDB = () => { try { return JSON.parse(localStorage.getItem(KEY)) || initDB(); } catch { return initDB(); } };
let DB = loadDB();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('พื้นที่จัดเก็บเต็ม (รูปหลักฐานอาจใหญ่เกินไป)'); } };

let ui = { view: 'home', code: null, pid: null, act: null, actor: null, slotRole: ROLES[0].id, slotTrait: TRAITS[0].id, auditTarget: null, pre: null, post: null, tab: 'lessons', authMode: 'login', lessonId: null, radarPid: null, tTab: 'lessons', tRoom: null };

// ===== ตัวช่วย =====
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const roleName = (id) => (ROLES.find((r) => r.id === id) || {}).name || id;
const roleIcon = (id) => (ROLES.find((r) => r.id === id) || {}).icon || '';
const traitName = (id) => (TRAITS.find((t) => t.id === id) || {}).name || id;
const room = () => DB.rooms[ui.code];
const lessonOf = (r) => DB.lessons.find((l) => l.id === r.lessonId) || DB.lessons[0];
const me = () => DB.users.find((u) => u.email === DB.session);
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
function radar(series) {
  const cx = 150, cy = 140, R = 100, n = TRAITS.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + (R * v / 10) * Math.cos(a), cy + (R * v / 10) * Math.sin(a)]; };
  let g = '';
  for (const lv of [2, 4, 6, 8, 10]) g += `<polygon points="${TRAITS.map((_, i) => pt(i, lv).join(',')).join(' ')}" fill="none" stroke="currentColor" opacity=".2"/>`;
  TRAITS.forEach((t, i) => { const [x, y] = pt(i, 10), [lx, ly] = pt(i, 11.8); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="currentColor" opacity=".2"/><text x="${lx}" y="${ly}" font-size="13" text-anchor="middle" fill="currentColor">${t.name}</text>`; });
  for (const s of series) g += `<polygon points="${s.vals.map((v, i) => pt(i, v).join(',')).join(' ')}" fill="${s.color}" fill-opacity=".25" stroke="${s.color}" stroke-width="2"/>`;
  const legend = series.map((s, i) => `<text x="10" y="${270 + i * 16}" font-size="12" fill="${s.color}">■ ${s.label}</text>`).join('');
  return `<svg viewBox="0 0 300 310" width="100%" style="max-width:340px">${g}${legend}</svg>`;
}

// ===== การแสดงผลแต่ละหน้า =====
function nav() {
  const u = me();
  $('#nav').innerHTML = u
    ? `<span>👤 ${esc(u.name)}</span><button data-act="teacher">หลังบ้านครู</button><button data-act="logout">ออกจากระบบ</button>`
    : `<button data-act="auth">เข้าสู่ระบบ / สมัครสมาชิก</button>`;
}

function vHome() {
  return `
  <div class="card"><h1>Smart Integrity City</h1>
    <p class="muted">เว็บแอปประกอบเกมกระดานเพื่อเสริมสร้างคุณลักษณะ 5 ประการ: คิด วินัย ซื่อสัตย์ พอเพียง จิตสาธารณะ</p></div>
  <div class="grid g3">
    <div class="card"><h3>1) สร้างห้องใหม่</h3><p class="muted">ต้องเข้าสู่ระบบ เลือกสื่อการสอนและรับรหัสห้อง</p><button data-act="create">สร้างห้อง</button></div>
    <div class="card"><h3>2) เปิดห้องที่มีอยู่</h3><label>รหัสห้อง</label><input id="openCode" maxlength="6" placeholder="เช่น AB12"><p></p>
      <div class="row"><button data-act="openRoom">เข้าห้อง (เล่นเกม)</button><button class="alt" data-act="joinPost">หลังเกม (ภารกิจ/สอบ/เกียรติบัตร)</button></div></div>
    <div class="card"><h3>3) หลังบ้านครู</h3><p class="muted">จัดการสื่อการสอน ตารางแต้ม ตรวจภาพภารกิจ และส่งออก Excel</p><button data-act="teacher">เข้าหลังบ้าน</button></div>
  </div>
  <div class="card"><h3>ห้องที่มีในเครื่องนี้</h3>${Object.values(DB.rooms).length ? `<table><tr><th>รหัส</th><th>สถานะ</th><th>ผู้เล่น</th><th></th></tr>${Object.values(DB.rooms).map((r) => `<tr><td><b>${r.code}</b></td><td>${statusLabel(r.status)}</td><td>${r.players.length}</td><td><button class="alt" data-act="enter" data-code="${r.code}">เปิด</button></td></tr>`).join('')}</table>` : '<p class="muted">ยังไม่มีห้อง</p>'}</div>`;
}
const statusLabel = (s) => ({ lobby: 'เตรียมเกม', playing: 'กำลังเล่น', ended: 'จบเกมแล้ว' }[s] || s);

function vAuth() {
  const reg = ui.authMode === 'register';
  return `<div class="card" style="max-width:420px;margin:auto"><h2>${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2>
    ${reg ? '<label>ชื่อ</label><input id="aName">' : ''}
    <label>อีเมล</label><input id="aEmail" type="email"><label>รหัสผ่าน (อย่างน้อย 6 ตัว)</label><input id="aPw" type="password">
    <p class="row"><button data-act="${reg ? 'doRegister' : 'doLogin'}">${reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>
    <button class="alt" data-act="authMode" data-m="${reg ? 'login' : 'register'}">${reg ? 'มีบัญชีแล้ว' : 'สมัครสมาชิกใหม่'}</button></p>
    <p class="muted">บัญชีเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น (เดโม)</p></div>`;
}

function vCreate() {
  if (!me()) return vAuth();
  return `<div class="card"><h2>สร้างห้อง</h2><label>เลือกสื่อการสอน</label>
    <select id="cLesson">${options(DB.lessons.map((l) => [l.id, l.name]))}</select>
    <p><button data-act="doCreate">สร้างห้องและรับรหัส</button></p></div>`;
}

function vLobby() {
  const r = room(), L = lessonOf(r); const url = location.href.split('#')[0];
  const ready = r.players.length > 0 && r.players.every((p) => p.pre);
  return `
  <div class="card"><div class="row" style="justify-content:space-between"><div><div class="muted">รหัสห้อง</div><div class="code">${r.code}</div><div class="muted">สื่อการสอน: ${esc(L.name)}</div></div>
    <div><img class="qr" alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}"><div class="muted">สแกนเข้าเว็บ</div></div></div></div>
  <div class="grid g2">
  <div class="card"><h3>ลงทะเบียนผู้เล่น</h3>
    <label>ชื่อ</label><input id="pName"><label>อาชีพ</label><select id="pRole">${roleOpts()}</select>
    <label>รหัสการ์ดตัวละคร / NFC (ไม่บังคับ)</label><input id="pCard" placeholder="พิมพ์หรือแตะการ์ดเพื่ออ่านรหัส">
    <p class="row"><button data-act="addPlayer">เพิ่มผู้เล่น</button><button class="alt" data-act="nfcRead" data-fill="pCard">แตะการ์ด NFC</button></p></div>
  <div class="card"><h3>ตั้งค่าเกม</h3>
    <label>เวลาเล่น (นาที, ขั้นต่ำ 20)</label><input id="sDur" type="number" min="20" value="${r.durationMin}">
    <label>ดัชนีเมืองสุจริตเริ่มต้น</label><input id="sCity" type="number" min="1" value="${r.cityStart}">
    <p><button class="alt" data-act="saveSettings">บันทึกการตั้งค่า</button></p></div></div>
  <div class="card"><h3>ผู้เล่น (${r.players.length})</h3>
  ${r.players.length ? `<table><tr><th>ชื่อ</th><th>อาชีพ</th><th>การ์ด</th><th>Pre-Test</th><th></th></tr>${r.players.map((p) => `<tr><td>${esc(p.name)}</td><td>${roleIcon(p.role)} ${roleName(p.role)}</td><td>${esc(p.cardId) || '-'}</td>
    <td>${p.pre ? '<span class="good">เสร็จแล้ว</span>' : '<span class="bad">ยังไม่ทำ</span>'}</td>
    <td class="row"><button class="alt" data-act="startPre" data-pid="${p.id}">${p.pre ? 'ทำใหม่' : 'ทำ Pre-Test'}</button><button class="alt" data-act="delPlayer" data-pid="${p.id}">ลบ</button></td></tr>`).join('')}</table>` : '<p class="muted">ยังไม่มีผู้เล่น</p>'}
  <p><button data-act="startGame" ${ready ? '' : 'disabled'}>เริ่มเกม</button> ${ready ? '' : '<span class="muted">ต้องมีผู้เล่นและทำ Pre-Test ครบทุกคนก่อน</span>'}</p></div>`;
}

function vPretest() {
  const r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === ui.pre.pid);
  return `<div class="card"><h2>Pre-Test: ${esc(p.name)}</h2><p class="muted">สถานการณ์จำลอง 5 ข้อ วัดคุณลักษณะ 5 ประการ ตอบด้วยการพิมพ์</p>
  ${L.pretest.map((q, i) => `<div class="q"><b>ข้อ ${i + 1} (${traitName(q.trait)})</b><br>${esc(q.q)}</div><textarea data-bind="preAns" data-i="${i}">${esc(ui.pre.ans[i] || '')}</textarea>`).join('')}
  <p class="row"><button data-act="submitPre">ส่งคำตอบ</button><button class="alt" data-act="enter" data-code="${r.code}">ยกเลิก</button></p></div>`;
}

function barCity(r) { const pct = Math.min(100, (r.city / r.cityStart) * 100); return `<div class="bar"><i style="width:${pct}%"></i></div>`; }

function vGame() {
  const r = room(), L = lessonOf(r);
  if (r.status === 'ended') return vEnd();
  if (!ui.actor || !r.players.find((p) => p.id === ui.actor)) ui.actor = r.players[0].id;
  return `
  <div class="card"><div class="row" style="justify-content:space-between"><div><div class="muted">ดัชนีเมืองสุจริต</div><div class="big">${r.city}</div></div>
    <div><div class="muted">เวลาที่เหลือ</div><div class="big" id="gtimer">--:--</div></div>
    <button class="danger" data-act="forceEnd">จบเกมทันที</button></div>${barCity(r)}</div>
  <div class="card"><table><tr><th>ผู้เล่น</th><th>อาชีพ</th><th>ดัชนีชีวิต</th><th>แต้มร่วมมือ</th><th>ขั้นภารกิจ</th></tr>
  ${r.players.map((p) => `<tr><td>${esc(p.name)}</td><td>${roleIcon(p.role)} ${roleName(p.role)}</td><td>${p.life}</td><td>${p.coop}</td><td>${'●'.repeat(p.step)}${'○'.repeat(3 - p.step)}</td></tr>`).join('')}</table></div>
  <div class="card"><h3>ทำรายการ</h3>
    <div class="row"><div style="flex:1;min-width:200px"><label>ผู้เล่นที่แตะการ์ด</label><select data-bind="actor">${options(r.players.map((p) => [p.id, p.name + ' (' + roleName(p.role) + ')']), ui.actor)}</select></div>
    <button class="alt" data-act="nfcRead" data-fill="actor">แตะการ์ด NFC</button></div>
    ${ui.act ? vAct() : vActMenu(r)}</div>
  <div class="card"><h3>บันทึกเหตุการณ์ล่าสุด</h3>${r.log.length ? `<table>${r.log.slice(-8).reverse().map((l) => { const p = r.players.find((x) => x.id === l.pid); return `<tr><td>${p ? esc(p.name) : '-'}</td><td>${esc(l.reason)}</td><td>ชีวิต ${sgn(l.life)} / ร่วมมือ ${sgn(l.coop)} / เมือง ${sgn(l.city)}</td></tr>`; }).join('')}</table>` : '<p class="muted">ยังไม่มี</p>'}</div>`;
}

function vActMenu(r) {
  return `<div class="grid g2">
   <div class="card"><b>ช่องภารกิจพลเมือง (12 ช่อง)</b><label>ช่องนี้เป็นของอาชีพ</label><select data-bind="slotRole">${roleOpts(ui.slotRole)}</select><p><button data-act="actCivic">เปิดภารกิจ</button></p></div>
   <div class="card"><b>ช่องคุณลักษณะ (5 ช่อง)</b><label>คุณลักษณะ</label><select data-bind="slotTrait">${options(TRAITS.map((t) => [t.id, t.name]), ui.slotTrait)}</select><p><button data-act="actTrait">สุ่มสถานการณ์</button></p></div>
   <div class="card"><b>ช่องท้าทายจริยธรรม (5 ช่อง)</b><p class="muted">ระบบสุ่มคำถามจริยธรรม</p><button data-act="actEthics">สุ่มคำถาม</button></div>
   <div class="card"><b>ช่องตรวจสอบ (3 ช่อง)</b><label>ผู้ถูกตรวจสอบ</label><select data-bind="auditTarget">${options(r.players.filter((p) => p.id !== ui.actor).map((p) => [p.id, p.name]), ui.auditTarget)}</select>
     <label><input type="checkbox" id="escape" style="width:auto"> ผู้ถูกตรวจสอบใช้การ์ดหนีการตรวจสอบ</label><p><button data-act="actAudit">เริ่มตรวจสอบ</button></p></div>
  </div>
  <div class="card"><b>การ์ดข่าวสาร — ปรับแต้มด้วยตนเอง</b><p class="muted">กรอกผลตามการ์ดข่าวที่เปิดบนโต๊ะ (ลบ = หักแต้ม)</p>
   <div class="grid g3"><div><label>ผู้เล่น (เว้นว่าง = ผลต่อเมืองอย่างเดียว)</label><select id="mPlayer"><option value="">— ไม่ระบุ —</option>${r.players.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
   <div><label>ดัชนีเมือง</label><input id="mCity" type="number" value="0"></div><div><label>ดัชนีชีวิต</label><input id="mLife" type="number" value="0"></div>
   <div><label>แต้มความร่วมมือ</label><input id="mCoop" type="number" value="0"></div><div style="grid-column:span 2"><label>เหตุผล / ชื่อการ์ด</label><input id="mWhy"></div></div>
   <p><button data-act="manualAdj">บันทึกการปรับแต้ม</button></p></div>`;
}

function vAct() {
  const a = ui.act, r = room(), p = r.players.find((x) => x.id === a.pid);
  let head = `<div class="q"><b>${esc(a.title)}</b> — ${esc(p.name)}<br>${esc(a.q)}</div>`;
  if (a.timed) head += `<div class="muted">เวลาตอบ: <b id="mtimer">30:00</b></div>`;
  if (!a.ev) {
    return head + `<textarea data-bind="actText" placeholder="พิมพ์คำตอบ...">${esc(a.text || '')}</textarea>
      <p class="row"><button data-act="submitAct">ส่งให้ตรวจ</button><button class="alt" data-act="cancelAct">ยกเลิก</button></p>`;
  }
  let sel = '';
  if (a.kind === 'civic') sel = `<select id="vSel">${options([['pass', 'ผ่าน'], ['fail', 'ไม่ผ่าน'], ['corrupt', 'ตอบเชิงทุจริต']], a.suggest)}</select>`;
  if (a.kind === 'trait') sel = `<select id="vSel">${options([['good', 'ตอบดี'], ['ok', 'พอใช้'], ['bad', 'ไม่เหมาะสม']], a.suggest)}</select>`;
  if (a.kind === 'ethics') sel = `<select id="vSel">${options([['right', 'ถูก'], ['wrong', 'ผิด']], a.suggest)}</select>`;
  if (a.kind === 'audit') sel = `<select id="vSel">${options([0, 1, 2, 3, 4, 5].map((n) => [String(n), n + ' คะแนน']), String(a.suggest))}</select>
     <label>กรณี 1–3 คะแนน</label><select id="lowSel">${options([['penalty', 'หักแต้มตามตาราง'], ['back', 'เดินถอยหลังบนกระดาน']], 'penalty')}</select>`;
  return head + `<div class="q"><b>คำตอบ:</b> ${esc(a.text)}</div><div class="result"><b>ผลประเมินเบื้องต้น</b> (${esc(a.ev.note || 'ตัวประเมินอัตโนมัติ')})<br>
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
   ${rp ? radar([{ label: 'ก่อนเล่น (Pre-Test)', vals: preV, color: '#6366f1' }, { label: 'หลังตัดสินใจในเกม', vals: gameV, color: '#14b8a6' }]) + `<p>โดดเด่นด้าน <b>${best}</b> · ควรพัฒนาด้าน <b>${low}</b></p>` : ''}</div>
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
  const tabs = [['mission', 'ภารกิจชีวิตจริง'], ['post', 'Post-Test'], ['cert', 'เกียรติบัตร']];
  let body = '';
  if (ui.tab === 'mission') {
    body = `<p class="${over ? 'bad' : 'muted'}">${over ? 'หมดเวลา 3 วัน — ระบบตัดสิทธิ์การส่งภารกิจแล้ว' : 'ส่งภายใน ' + new Date(deadline).toLocaleString('th-TH')}</p>` +
      TRAITS.map((t) => { const e = p.evidence[t.id]; return `<div class="card"><b>${t.name}</b>${e ? `<div class="row"><img class="ev" src="${e.img}" alt=""><div>${esc(e.desc)}<br><span class="pill">${{ pending: 'รอตรวจ', approved: 'ผ่าน', rejected: 'ไม่ผ่าน' }[e.status]}</span> <span class="muted">AI เบื้องต้น: ${{ pass: 'เข้าข่าย', fail: 'ไม่ชัดเจน', corrupt: 'น่าสงสัย' }[e.ai]}</span></div></div>` : ''}
        ${over && !e ? '' : e && e.status !== 'rejected' ? '' : `<label>อัปโหลดภาพ</label><input type="file" accept="image/*" data-ev="${t.id}"><label>คำอธิบายสิ่งที่ทำ</label><textarea data-evd="${t.id}"></textarea><p><button data-act="sendEv" data-t="${t.id}">ส่งหลักฐาน</button></p>`}</div>`; }).join('');
  }
  if (ui.tab === 'post') {
    body = p.post ? `<div class="card"><h3>ผลสอบ: ${p.post.score}/5</h3></div>` :
      L.posttest.map((q, i) => `<div class="card"><b>${i + 1}. ${esc(q.q)}</b>${q.choices.map((c, j) => `<label style="color:var(--ink)"><input type="radio" style="width:auto" name="q${i}" value="${j}"> ${esc(c)}</label>`).join('')}</div>`).join('') + '<p><button data-act="sendPost">ส่งข้อสอบ</button></p>';
  }
  if (ui.tab === 'cert') {
    const s = totalScore(p, L);
    body = `<p>คะแนน: Post-Test ${s.post}/5 + ภารกิจชีวิตจริงที่ผ่าน ${s.ev}/5 = <b>${s.total}/10</b> (เกณฑ์ผ่าน ${L.passScore})</p>` + (s.pass
      ? `<div class="cert"><div>เกียรติบัตรฉบับนี้ให้ไว้เพื่อแสดงว่า</div><div class="nm">${esc(p.name)}</div><h1>ผ่านการอบรม Smart Integrity City</h1><div>เสริมสร้างคุณลักษณะ คิด วินัย ซื่อสัตย์ พอเพียง จิตสาธารณะ</div><p>ห้อง ${r.code} · ${new Date().toLocaleDateString('th-TH')}</p></div><p class="noprint"><button data-act="print">พิมพ์ / บันทึกเป็น PDF</button></p>`
      : '<p class="bad">ยังไม่ผ่านเกณฑ์ — ต้องทำ Post-Test และให้ครูตรวจภารกิจชีวิตจริงให้ครบก่อน</p>');
  }
  return `<div class="card noprint"><h2>${esc(p.name)} · ห้อง ${r.code}</h2><div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div></div>${body}`;
}

// ===== หลังบ้านครู =====
function vTeacher() {
  if (!me()) return vAuth();
  const tabs = [['lessons', 'สื่อการสอน'], ['points', 'ตารางแต้มกลาง'], ['review', 'ตรวจภารกิจชีวิตจริง'], ['export', 'ส่งออก Excel']];
  if (!ui.lessonId || !DB.lessons.find((l) => l.id === ui.lessonId)) ui.lessonId = DB.lessons[0].id;
  const L = DB.lessons.find((l) => l.id === ui.lessonId), mine = Object.values(DB.rooms).filter((r) => r.owner === DB.session);
  let body = '';
  if (ui.tTab === 'lessons' || ui.tTab === 'points') body = `<label>ชุดสื่อการสอน</label><select data-bind="lessonId">${options(DB.lessons.map((l) => [l.id, l.name]), ui.lessonId)}</select>`;
  if (ui.tTab === 'lessons') {
    body += `<p class="muted">แก้ไขเป็น JSON: ข้อสอบ Pre/Post, ภารกิจ 3 ขั้นของ 6 ตัวละคร, สถานการณ์ช่วยเหลือ, คลังคำถาม, คำสำคัญที่ใช้ตรวจ</p>
      <textarea id="lJson" style="min-height:420px;font-family:monospace;font-size:.8rem">${esc(JSON.stringify(L, null, 2))}</textarea>
      <p class="row"><button data-act="saveLesson">บันทึก</button><button class="alt" data-act="copyLesson">ทำสำเนาเป็นชุดใหม่</button><button class="danger" data-act="delLesson" ${DB.lessons.length < 2 ? 'disabled' : ''}>ลบชุดนี้</button></p>`;
  }
  if (ui.tTab === 'points') {
    body += `<table><tr><th>เหตุการณ์</th><th>ดัชนีชีวิต</th><th>แต้มร่วมมือ</th><th>ดัชนีเมือง</th></tr>${Object.keys(POINT_LABELS).map((k) => `<tr><td>${POINT_LABELS[k]}</td>${[0, 1, 2].map((i) => `<td><input type="number" data-pt="${k}" data-i="${i}" value="${L.points[k][i]}"></td>`).join('')}</tr>`).join('')}</table>
      <label>เกณฑ์ผ่านเกียรติบัตร (เต็ม 10)</label><input type="number" id="passScore" min="1" max="10" value="${L.passScore}"><p><button data-act="savePoints">บันทึกตารางแต้ม</button></p>`;
  }
  if (ui.tTab === 'review') {
    body += mine.length ? mine.map((r) => `<div class="card"><b>ห้อง ${r.code}</b>${r.players.map((p) => Object.entries(p.evidence).map(([t, e]) => `<div class="row" style="margin-top:8px"><img class="ev" src="${e.img}" alt=""><div><b>${esc(p.name)}</b> · ${traitName(t)}<br>${esc(e.desc)}<br><span class="pill">${e.status}</span> <button data-act="rev" data-code="${r.code}" data-pid="${p.id}" data-t="${t}" data-s="approved">ผ่าน</button> <button class="alt" data-act="rev" data-code="${r.code}" data-pid="${p.id}" data-t="${t}" data-s="rejected">ไม่ผ่าน</button></div></div>`).join('')).join('') || '<p class="muted">ยังไม่มีหลักฐาน</p>'}</div>`).join('') : '<p class="muted">ยังไม่มีห้องที่คุณสร้าง</p>';
  }
  if (ui.tTab === 'export') {
    body += mine.length ? `<label>เลือกห้อง</label><select data-bind="tRoom">${options(mine.map((r) => [r.code, r.code + ' · ' + statusLabel(r.status)]), ui.tRoom || mine[0].code)}</select><p><button data-act="exportCsv">ดาวน์โหลดรายงาน (เปิดด้วย Excel ได้)</button></p>` : '<p class="muted">ยังไม่มีห้องที่คุณสร้าง</p>';
  }
  return `<div class="card"><h2>หลังบ้านครู</h2><div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.tTab === k ? 'on' : ''}" data-act="tTab" data-t="${k}">${l}</button>`).join('')}</div>${body}</div>`;
}

const VIEWS = { home: vHome, auth: vAuth, create: vCreate, lobby: vLobby, pretest: vPretest, game: vGame, end: vEnd, joinPost: vJoinPost, post: vPost, teacher: vTeacher };
function render() { nav(); $('#app').innerHTML = VIEWS[ui.view](); tick(); }

// ===== นาฬิกา =====
function tick() {
  const r = ui.code && DB.rooms[ui.code];
  const g = $('#gtimer');
  if (r && r.status === 'playing') {
    const left = r.endsAt - Date.now();
    if (left <= 0) { endGame(r, 'time'); save(); go('end'); return; }
    if (g) g.textContent = fmtT(left);
  }
  const m = $('#mtimer');
  if (m && ui.act && ui.act.timed && !ui.act.ev) { const left = MISSION_MS - (Date.now() - ui.act.startedAt); m.textContent = fmtT(left); m.className = left <= 0 ? 'bad' : ''; }
}
setInterval(tick, 1000);

// ===== เหตุการณ์ =====
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join(''); } while (DB.rooms[c]); return c; };
function enterRoom(code) {
  const r = DB.rooms[(code || '').toUpperCase()]; if (!r) return toast('ไม่พบห้อง');
  ui.code = r.code; go(r.status === 'lobby' ? 'lobby' : r.status === 'playing' ? 'game' : 'end');
}
function traitGrade(r, t) { if (r.verdict === 'corrupt') return 'bad'; if (r.verdict === 'pass') return r.good >= 2 ? 'good' : 'ok'; return t.trim().length >= 15 ? 'ok' : 'bad'; }

const H = {
  home: () => go('home'),
  auth: () => go('auth'),
  authMode: (b) => go('auth', { authMode: b.dataset.m }),
  logout: () => { DB.session = null; save(); go('home'); },
  create: () => go('create'),
  teacher: () => go('teacher'),
  enter: (b) => enterRoom(b.dataset.code),
  openRoom: () => enterRoom($('#openCode').value.trim()),
  joinPost: () => { const c = ($('#openCode') || {}).value; go('joinPost', { code: c ? c.toUpperCase() : null, pid: null }); },
  joinPostNow: () => go('joinPost'),
  joinFind: () => { const c = $('#jCode').value.trim().toUpperCase(); if (!DB.rooms[c]) return toast('ไม่พบห้อง'); go('joinPost', { code: c }); },
  joinGo: () => { if (!ui.pid) return toast('เลือกชื่อก่อน'); go('post', { tab: 'mission' }); },
  async doRegister() {
    const name = $('#aName').value.trim(), email = $('#aEmail').value.trim().toLowerCase(), pw = $('#aPw').value;
    if (!name || !email || pw.length < 6) return toast('กรอกข้อมูลให้ครบ (รหัสผ่านอย่างน้อย 6 ตัว)');
    if (DB.users.find((u) => u.email === email)) return toast('อีเมลนี้สมัครแล้ว');
    DB.users.push({ name, email, hash: await sha(pw) }); DB.session = email; save(); go('home');
  },
  async doLogin() {
    const email = $('#aEmail').value.trim().toLowerCase(), u = DB.users.find((x) => x.email === email);
    if (!u || u.hash !== (await sha($('#aPw').value))) return toast('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    DB.session = email; save(); go('home');
  },
  doCreate: () => {
    const code = newCode(), lessonId = $('#cLesson').value;
    DB.rooms[code] = { code, owner: DB.session, lessonId, status: 'lobby', city: 100, cityStart: 100, durationMin: 20, players: [], log: [], createdAt: Date.now() };
    save(); ui.code = code; go('lobby');
  },
  addPlayer: () => {
    const name = $('#pName').value.trim(); if (!name) return toast('กรอกชื่อ');
    room().players.push(newPlayer(name, $('#pRole').value, $('#pCard').value)); save(); render();
  },
  delPlayer: (b) => { const r = room(); r.players = r.players.filter((p) => p.id !== b.dataset.pid); save(); render(); },
  saveSettings: () => {
    const r = room(), d = parseInt($('#sDur').value, 10), c = parseInt($('#sCity').value, 10);
    if (!(d >= 20)) return toast('เวลาเล่นต้องไม่น้อยกว่า 20 นาที');
    if (!(c >= 1)) return toast('ดัชนีเมืองเริ่มต้นไม่ถูกต้อง');
    r.durationMin = d; r.cityStart = c; r.city = c; save(); toast('บันทึกแล้ว'); render();
  },
  startPre: (b) => go('pretest', { pre: { pid: b.dataset.pid, ans: [] } }),
  async submitPre() {
    const r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === ui.pre.pid), sum = {}, cnt = {};
    for (let i = 0; i < L.pretest.length; i++) {
      const t = L.pretest[i], res = await evaluate(ui.pre.ans[i] || '', L, 'pretest'), s = preScoreFromVerdict(res);
      sum[t.trait] = (sum[t.trait] || 0) + s; cnt[t.trait] = (cnt[t.trait] || 0) + 1;
    }
    p.pre = {}; TRAITS.forEach((t) => { p.pre[t.id] = cnt[t.id] ? Math.round(sum[t.id] / cnt[t.id]) : 5; });
    p.traitGame = {}; save(); toast('บันทึกผล Pre-Test แล้ว'); go('lobby');
  },
  startGame: () => {
    const r = room(); r.status = 'playing'; r.startedAt = Date.now(); r.endsAt = r.startedAt + r.durationMin * 60000; r.city = r.cityStart;
    r.players.forEach((p) => { p.life = 0; p.coop = 0; p.step = 0; }); r.log = []; save(); ui.act = null; go('game');
  },
  forceEnd: () => { if (confirm('จบเกมตอนนี้และสรุปผลตามคะแนน?')) { endGame(room(), 'time'); save(); go('end'); } },
  actCivic: () => {
    const r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === ui.actor), own = ui.slotRole === p.role;
    let m;
    if (own) { if (p.step >= 3) return toast('ภารกิจส่วนตัวครบ 3 ขั้นแล้ว'); m = L.missions[p.role][p.step]; } else m = L.help[ui.slotRole];
    ui.act = { kind: 'civic', pid: p.id, owner: ui.slotRole, trait: m.t, title: own ? 'ภารกิจตัวละคร (ขั้น ' + (p.step + 1) + ')' : 'ภารกิจช่วยเหลือ ' + roleName(ui.slotRole), q: m.q, timed: true, startedAt: Date.now(), text: '' }; render();
  },
  actTrait: () => { const L = lessonOf(room()); ui.act = { kind: 'trait', pid: ui.actor, trait: ui.slotTrait, title: 'ช่องคุณลักษณะ: ' + traitName(ui.slotTrait), q: rnd(L.traits[ui.slotTrait]), text: '' }; render(); },
  actEthics: () => { const L = lessonOf(room()), e = rnd(L.ethics); ui.act = { kind: 'ethics', pid: ui.actor, trait: e.t, title: 'ช่องท้าทายจริยธรรม', q: e.q, text: '' }; render(); },
  actAudit: () => {
    const r = room(), L = lessonOf(r), tid = ui.auditTarget || (r.players.find((p) => p.id !== ui.actor) || {}).id;
    if (!tid) return toast('ต้องมีผู้ถูกตรวจสอบอย่างน้อย 1 คน');
    const target = r.players.find((p) => p.id === tid);
    if ($('#escape').checked) { const msg = resolveAudit(r, L, target, { escape: true }); save(); toast(msg); return render(); }
    ui.act = { kind: 'audit', pid: tid, title: 'ภารกิจตรวจสอบ', q: rnd(L.audit), text: '' }; render();
  },
  cancelAct: () => { ui.act = null; render(); },
  async submitAct() {
    const a = ui.act, r = room(), L = lessonOf(r);
    a.text = ($('[data-bind=actText]') || {}).value || a.text; if (!a.text.trim()) return toast('พิมพ์คำตอบก่อน');
    const expired = a.timed && Date.now() - a.startedAt > MISSION_MS, ev = await evaluate(a.text, L, a.kind);
    a.ev = ev;
    if (a.kind === 'civic') { a.suggest = expired ? 'fail' : ev.verdict; if (expired) ev.note = 'เกินเวลา 30 นาที'; }
    if (a.kind === 'trait') a.suggest = traitGrade(ev, a.text);
    if (a.kind === 'ethics') a.suggest = ev.verdict === 'pass' ? 'right' : 'wrong';
    if (a.kind === 'audit') a.suggest = ev.auditScore ?? 0;
    render();
  },
  confirmAct: () => {
    const a = ui.act, r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === a.pid), v = $('#vSel').value; let msg;
    if (a.kind === 'civic') msg = resolveCivic(r, L, p, a.owner, v, a.trait);
    if (a.kind === 'trait') msg = resolveTrait(r, L, p, a.trait, v);
    if (a.kind === 'ethics') msg = resolveEthics(r, L, p, a.trait, v === 'right');
    if (a.kind === 'audit') msg = resolveAudit(r, L, p, { score: parseInt(v, 10), lowChoice: $('#lowSel').value });
    ui.act = null; save(); toast(msg);
    if (r.status === 'ended') go('end'); else render();
  },
  manualAdj: () => {
    const r = room(), n = (id) => parseInt($(id).value, 10) || 0, pid = $('#mPlayer').value, why = $('#mWhy').value.trim();
    if (!why) return toast('กรอกเหตุผล');
    const d = [n('#mLife'), n('#mCoop'), n('#mCity')];
    if (!pid && (d[0] || d[1])) return toast('เลือกผู้เล่นเมื่อปรับดัชนีชีวิต/แต้มร่วมมือ');
    applyDelta(r, r.players.find((p) => p.id === pid) || null, d, 'การ์ดข่าวสาร: ' + why); save();
    if (r.status === 'ended') go('end'); else { toast('บันทึกแล้ว'); render(); }
  },
  nfcRead: async (b) => {
    if (!('NDEFReader' in window)) return toast('เบราว์เซอร์นี้ไม่รองรับ NFC (ใช้ Chrome บน Android)');
    try {
      const rd = new NDEFReader(); await rd.scan(); toast('แตะการ์ดที่เครื่องอ่าน...');
      rd.onreading = (e) => {
        let id = e.serialNumber || ''; for (const rec of e.message.records) if (rec.recordType === 'text') id = new TextDecoder(rec.encoding || 'utf-8').decode(rec.data);
        if (b.dataset.fill === 'pCard') { $('#pCard').value = id; return; }
        const p = room().players.find((x) => x.cardId && x.cardId === id); if (!p) return toast('ไม่พบการ์ดนี้ในห้อง'); ui.actor = p.id; render();
      };
    } catch (e) { toast('อ่าน NFC ไม่สำเร็จ'); }
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
  sendPost: () => {
    const r = room(), L = lessonOf(r), p = r.players.find((x) => x.id === ui.pid); let s = 0;
    for (let i = 0; i < L.posttest.length; i++) { const c = document.querySelector(`input[name=q${i}]:checked`); if (!c) return toast('ตอบให้ครบทุกข้อ'); if (+c.value === L.posttest[i].answer) s++; }
    p.post = { score: s, at: Date.now() }; save(); render();
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
    L.passScore = parseInt($('#passScore').value, 10) || 9; save(); toast('บันทึกแล้ว');
  },
  rev: (b) => { const p = DB.rooms[b.dataset.code].players.find((x) => x.id === b.dataset.pid); p.evidence[b.dataset.t].status = b.dataset.s; save(); render(); },
  exportCsv: () => {
    const r = DB.rooms[ui.tRoom || Object.values(DB.rooms).find((x) => x.owner === DB.session).code], L = lessonOf(r);
    const head = ['ชื่อ', 'อาชีพ', 'ขั้นภารกิจ', 'ดัชนีชีวิต', 'แต้มร่วมมือ', 'รวมในเกม', ...TRAITS.map((t) => 'Pre-' + t.name), ...TRAITS.map((t) => 'Game-' + t.name), 'Post-Test', 'ภารกิจชีวิตจริงที่ผ่าน', 'รวม(10)', 'ผ่านเกียรติบัตร'];
    const rows = ranking(r).map((p) => { const s = totalScore(p, L); return [p.name, roleName(p.role), p.step, p.life, p.coop, p.life + p.coop, ...TRAITS.map((t) => (p.pre || {})[t.id] ?? ''), ...TRAITS.map((t) => p.traitGame[t.id] ?? (p.pre || {})[t.id] ?? ''), p.post ? p.post.score : '', s.ev, s.total, s.pass ? 'ผ่าน' : 'ไม่ผ่าน']; });
    const csv = '﻿' + [head, ...rows].map((l) => l.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'smart-integrity-city-' + r.code + '.csv'; a.click();
  },
};

document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; e.preventDefault(); const f = H[b.dataset.act]; if (f) f(b); });
document.addEventListener('input', (e) => {
  const b = e.target.dataset && e.target.dataset.bind;
  if (b === 'preAns') ui.pre.ans[+e.target.dataset.i] = e.target.value;
  if (b === 'actText' && ui.act) ui.act.text = e.target.value;
});
document.addEventListener('change', (e) => {
  const b = e.target.dataset && e.target.dataset.bind; if (!b || b === 'preAns' || b === 'actText') return;
  ui[b] = e.target.value; if (b === 'tRoom' || b === 'slotRole' || b === 'slotTrait' || b === 'auditTarget') return; render();
});

render();
