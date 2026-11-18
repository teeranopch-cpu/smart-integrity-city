// ทดสอบฐานข้อมูลออนไลน์: รันฟังก์ชันใน api/ จริง + Redis จำลอง (เลียนแบบ Upstash REST) + เบราว์เซอร์ 3 เครื่อง (ต้องมี Playwright)
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright'); const root = path.join(__dirname, '..');
const gas = require('./gas_emu').create(); const H = {};
const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/exec') { r.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); return r.end(JSON.stringify(gas.doPost(b))); }
  const f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
  if (f.startsWith(root) && fs.existsSync(f)) { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'image/jpeg' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end(); }
}); });
(async () => {
  await new Promise((r) => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch(); const errs = [];
  const device = async () => { const c = await b.newContext(), p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort()); await p.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.SIC_CONFIG={sheetsUrl:'${base}/exec'}` })); await p.goto(base, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.SicCloud && SicCloud.enabled()); return p; };
  const toast = (p) => p.evaluate(() => (document.querySelector('.toast') || {}).textContent);
  const d1 = await device();
  await d1.click('[data-act=authMode]'); await d1.fill('#rName', 'น้องเอ'); await d1.fill('#lEmail', 'A@x.com'); await d1.fill('#lCode', 'abcdef'); await d1.fill('#rPw2', 'abcdef'); await d1.click('[data-act=doRegister]');
  await d1.waitForFunction(() => DB.session && DB.session.name === 'น้องเอ');
  const urow = gas.sheets.users.rows.find((r) => r[0] === 'a@x.com'); assert(urow && urow[4] && urow[4] !== 'abcdef' && !JSON.stringify([gas.sheets.users.rows, gas.sheets.data && gas.sheets.data.rows]).includes('abcdef'), 'ต้องไม่มีรหัสผ่านตัวจริงใน Sheets'); console.log('register ok (password hashed)');
  await d1.evaluate(() => { DB.rooms.ROOM1 = { code: 'ROOM1', owner: 'น้องเอ', lessonId: DB.lessons[0].id, status: 'lobby', city: 100, cityStart: 100, log: [], players: [newPlayer('สมชาย', 'gov')] }; save(); });
  await d1.waitForFunction(() => SicCloud.status() === 'ok'); await d1.evaluate(() => SicCloud.sync());
  const dr = (k) => (gas.sheets.data.rows.find((r) => r[0] === k) || []).slice(1).join('').slice(1); assert.strictEqual(dr('rooms/ROOM1/m/city'), '100'); console.log('room stored in Sheets; lessons untouched:', !gas.sheets.data.rows.some((r) => String(r[0]).startsWith('lessons/')));
  const d2 = await device();
  await d2.fill('#lEmail', 'a@x.com'); await d2.fill('#lCode', 'wrongpw'); await d2.click('[data-act=doLogin]'); await d2.waitForTimeout(600); console.log('wrong pw:', await toast(d2));
  await d2.fill('#lCode', 'abcdef'); await d2.click('[data-act=doLogin]');
  await d2.waitForFunction(() => DB.rooms.ROOM1 && DB.rooms.ROOM1.players.length === 1, null, { timeout: 8000 });
  console.log('device2 sees:', await d2.evaluate(() => [DB.session.name, DB.rooms.ROOM1.players[0].name]));
  await d2.evaluate(() => { const p = DB.rooms.ROOM1.players[0]; p.coop = 10; p.post = { score: 22 }; DB.rooms.ROOM1.city = 95; save(); });
  await d2.waitForFunction(() => SicCloud.status() === 'ok'); await d2.evaluate(() => SicCloud.sync());
  await d1.evaluate(() => SicCloud.sync()); await d1.waitForFunction(() => DB.rooms.ROOM1.players[0].coop === 10);
  await d1.evaluate(() => { DB.rooms.ROOM1.players[0].life = 7; save(); }); await d1.evaluate(() => SicCloud.sync()); await d2.evaluate(() => SicCloud.sync());
  const fin = await d2.evaluate(() => { const p = DB.rooms.ROOM1.players[0]; return [p.life, p.coop, p.post.score]; }); console.log('merged:', fin); assert.deepStrictEqual(fin, [7, 10, 22]);
  // ครู: เข้าด้วยรหัสครู เห็นห้อง และแก้สื่อการสอนได้ ส่วนผู้เล่นแก้ไม่ได้
  const d3 = await device(); await d3.fill('#lEmail', 'teach@x.com'); await d3.fill('#lCode', 'TEACHER2026'); await d3.click('[data-act=doLogin]');
  await d3.waitForFunction(() => DB.session && DB.session.role === 'teacher'); await d3.waitForFunction(() => DB.rooms.ROOM1);
  await d3.evaluate(() => { DB.lessons[0].title = 'ชุดที่ครูแก้'; save(); }); await d3.waitForFunction(() => SicCloud.status() === 'ok'); await d3.evaluate(() => SicCloud.sync());
  assert(gas.sheets.data.rows.some((r) => String(r[0]).startsWith('lessons/')), 'ครูต้องบันทึกสื่อได้'); console.log('lesson chunks in one row:', Math.max(...gas.sheets.data.rows.filter((r) => String(r[0]).startsWith('lessons/')).map((r) => r.filter((x) => x !== '').length - 1))); console.log('teacher lesson stored');
  await d1.evaluate(() => SicCloud.sync()); const t1 = await d1.evaluate(() => DB.lessons[0].title); console.log('player got lesson:', t1);
  await d1.evaluate(() => { DB.lessons[0].title = 'นักเรียนพยายามแก้'; save(); }); await d1.evaluate(() => SicCloud.sync()); await d1.evaluate(() => SicCloud.sync());
  const t2 = await d1.evaluate(() => DB.lessons[0].title); assert.strictEqual(JSON.parse(dr(gas.sheets.data.rows.find((r) => String(r[0]).startsWith('lessons/'))[0])).title, 'ชุดที่ครูแก้'); console.log('player edit rejected; local reverted to:', t2);
  // ไม่มีโทเค็น → 401
  assert.strictEqual(gas.doPost(JSON.stringify({ action: 'get', path: 'rooms' })).error, 'UNAUTHORIZED');
  // อัปโหลดรูปเข้า Drive (เฉพาะที่เข้าสู่ระบบแล้ว) และใช้ลิงก์รูปเป็นหลักฐาน
  const up = await d1.evaluate(() => SicCloud.upload('data:image/jpeg;base64,/9j/4AAQSkZJRg==', 'น้องเอ_think')); assert(up.id && /thumbnail\?id=/.test(up.url)); assert.strictEqual(gas.files[0].folder, '1ViODGAsJhyyravLc1_UqdbJQz-piMrZw'); console.log('uploaded to Drive folder, sharing:', gas.files[0].sharing);
  assert.strictEqual(gas.doPost(JSON.stringify({ action: 'upload', dataUrl: 'data:text/html;base64,PHA+', token: 'bad' })).error, 'UNAUTHORIZED');
  console.log('page errors:', errs); await b.close(); srv.close(); if (errs.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
