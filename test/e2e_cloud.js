// ทดสอบฐานข้อมูลออนไลน์ด้วยเซิร์ฟเวอร์จำลอง (เลียนแบบ Firebase Auth + Realtime Database REST) ต้องมี Playwright
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright'); const root = path.join(__dirname, '..');
const users = {}, tokens = {}, rdb = {}; let n = 0;
const getAt = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), rdb);
const setAt = (p, v) => { const ks = p.split('/').filter(Boolean); if (!ks.length) { Object.keys(rdb).forEach((k) => delete rdb[k]); if (v) Object.assign(rdb, v); return; } let o = rdb; ks.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; }); if (v === null) delete o[ks.at(-1)]; else o[ks.at(-1)] = v; };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' };
const mkTok = (uid) => { const t = 'tok' + ++n; tokens[t] = uid; return { idToken: t, refreshToken: 'r' + t, expiresIn: '3600', localId: uid }; };
const srv = http.createServer((q, r) => {
  let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
    const u = new URL(q.url, 'http://x'), send = (c, j) => { r.writeHead(c, Object.assign({ 'Content-Type': 'application/json' }, cors)); r.end(JSON.stringify(j)); };
    if (q.method === 'OPTIONS') { r.writeHead(204, cors); return r.end(); }
    if (u.pathname === '/v1/accounts:signUp') { const j = JSON.parse(b); if (users[j.email]) return send(400, { error: { message: 'EMAIL_EXISTS' } }); if (j.password.length < 6) return send(400, { error: { message: 'WEAK_PASSWORD' } }); users[j.email] = { pw: j.password, uid: 'u' + ++n }; return send(200, Object.assign({ email: j.email }, mkTok(users[j.email].uid))); }
    if (u.pathname === '/v1/accounts:signInWithPassword') { const j = JSON.parse(b), x = users[j.email]; if (!x || x.pw !== j.password) return send(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }); return send(200, Object.assign({ email: j.email }, mkTok(x.uid))); }
    if (u.pathname === '/v1/token') { const uid = tokens[new URLSearchParams(b).get('refresh_token').slice(1)]; return send(200, { user_id: uid, id_token: mkTok(uid).idToken, refresh_token: 'rx', expires_in: '3600' }); }
    if (u.pathname.endsWith('.json')) { // Realtime Database
      const uid = tokens[u.searchParams.get('auth')]; if (!uid) return send(401, { error: 'Permission denied' });
      const p = u.pathname.slice(1, -5);
      if (q.method === 'GET') return send(200, getAt(p) ?? null);
      if (q.method === 'PUT') { setAt(p, JSON.parse(b)); return send(200, JSON.parse(b)); }
      if (q.method === 'DELETE') { setAt(p, null); return send(200, null); }
      if (q.method === 'PATCH') { const o = JSON.parse(b); for (const [k, v] of Object.entries(o)) setAt((p ? p + '/' : '') + k, v); return send(200, o); }
    }
    const f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
    if (f.startsWith(root) && fs.existsSync(f)) { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'image/jpeg' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end(); }
  });
});
(async () => {
  await new Promise((r) => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch(); const errs = [];
  const device = async () => { const c = await b.newContext(), p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
    await p.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.SIC_CONFIG={firebase:{apiKey:'k',databaseURL:'${base}',authHost:'${base}',tokenHost:'${base}'}}` })); await p.goto(base, { waitUntil: 'domcontentloaded' }); return p; };
  const toast = (p) => p.evaluate(() => (document.querySelector('.toast') || {}).textContent);
  // เครื่อง 1: สมัครสมาชิก + สร้างห้อง
  const d1 = await device();
  await d1.click('[data-act=authMode]'); await d1.fill('#rName', 'น้องเอ'); await d1.fill('#lEmail', 'A@x.com'); await d1.fill('#lCode', 'abcdef'); await d1.fill('#rPw2', 'abcdef'); await d1.click('[data-act=doRegister]');
  await d1.waitForFunction(() => DB.session && DB.session.name === 'น้องเอ'); console.log('register ok; users on server:', Object.keys(users));
  await d1.evaluate(() => { const r = { code: 'ROOM1', owner: 'น้องเอ', lessonId: DB.lessons[0].id, status: 'lobby', city: 100, cityStart: 100, log: [], players: [newPlayer('สมชาย', 'gov')] }; DB.rooms.ROOM1 = r; save(); });
  await d1.waitForFunction(() => SicCloud.status() === 'ok'); await d1.evaluate(() => SicCloud.sync());
  assert(rdb.rooms && rdb.rooms.ROOM1 && rdb.rooms.ROOM1.m.city === '100', 'ห้องต้องอยู่บนเซิร์ฟเวอร์'); assert(!JSON.stringify(rdb).includes('abcdef'), 'ห้ามมีรหัสผ่านใน DB');
  console.log('room on server ok; lessons pushed (default untouched):', Object.keys(rdb.lessons || {}).length === 0);
  // เครื่อง 2 (ล้างข้อมูลเบราว์เซอร์ = เครื่องใหม่): เข้าสู่ระบบแล้วต้องเห็นห้องเดิม
  const d2 = await device();
  await d2.fill('#lEmail', 'a@x.com'); await d2.fill('#lCode', 'wrongpw'); await d2.click('[data-act=doLogin]'); await d2.waitForTimeout(500); console.log('wrong pw toast:', await toast(d2));
  await d2.fill('#lCode', 'abcdef'); await d2.click('[data-act=doLogin]');
  await d2.waitForFunction(() => DB.rooms.ROOM1 && DB.rooms.ROOM1.players.length === 1, null, { timeout: 8000 });
  console.log('device2 sees room + player:', await d2.evaluate(() => [DB.session.name, DB.rooms.ROOM1.players[0].name, DB.rooms.ROOM1.city]));
  // เครื่อง 2 แก้คะแนน → เครื่อง 1 เห็น
  await d2.evaluate(() => { const p = DB.rooms.ROOM1.players[0]; p.coop = 10; p.post = { score: 22 }; DB.rooms.ROOM1.city = 95; save(); });
  await d2.waitForFunction(() => SicCloud.status() === 'ok'); await d2.evaluate(() => SicCloud.sync());
  await d1.evaluate(() => SicCloud.sync()); await d1.waitForFunction(() => DB.rooms.ROOM1.players[0].coop === 10);
  console.log('device1 got update:', await d1.evaluate(() => [DB.rooms.ROOM1.players[0].coop, DB.rooms.ROOM1.players[0].post, DB.rooms.ROOM1.city]));
  // เครื่อง 1 แก้ฟิลด์อื่นพร้อมกัน ต้องไม่ทับ post ของเครื่อง 2
  await d1.evaluate(() => { DB.rooms.ROOM1.players[0].life = 7; save(); }); await d1.evaluate(() => SicCloud.sync()); await d2.evaluate(() => SicCloud.sync());
  const fin = await d2.evaluate(() => { const p = DB.rooms.ROOM1.players[0]; return [p.life, p.coop, p.post.score]; }); console.log('merged on device2:', fin); assert.deepStrictEqual(fin, [7, 10, 22]);
  // บัญชีเดิมในเครื่อง (ก่อนเปิดออนไลน์) → ย้ายขึ้นอัตโนมัติ + ครู
  const d3 = await device(); await d3.fill('#lEmail', 'teach@x.com'); await d3.fill('#lCode', 'TEACHER2026'); await d3.click('[data-act=doLogin]');
  await d3.waitForFunction(() => DB.session && DB.session.role === 'teacher'); await d3.waitForFunction(() => DB.rooms.ROOM1); console.log('teacher sees room:', true);
  console.log('page errors:', errs); await b.close(); srv.close(); if (errs.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
