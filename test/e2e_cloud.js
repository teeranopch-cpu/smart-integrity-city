// ทดสอบฐานข้อมูลออนไลน์: รันฟังก์ชันใน api/ จริง + Redis จำลอง (เลียนแบบ Upstash REST) + เบราว์เซอร์ 3 เครื่อง (ต้องมี Playwright)
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright'); const root = path.join(__dirname, '..');
const H = {}; // hash สำหรับ Redis จำลอง
const redis = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
  if (q.headers.authorization !== 'Bearer rtok') { r.writeHead(401); return r.end('{}'); }
  const [c, k, ...a] = JSON.parse(b); const h = (H[k] = H[k] || {}); let out = null;
  if (c === 'HGET') out = h[a[0]] ?? null; else if (c === 'HSET') { for (let i = 0; i < a.length; i += 2) h[a[i]] = a[i + 1]; out = a.length / 2; }
  else if (c === 'HGETALL') out = Object.entries(h).flat(); else if (c === 'HKEYS') out = Object.keys(h); else if (c === 'HDEL') { a.forEach((f) => delete h[f]); out = a.length; }
  r.writeHead(200); r.end(JSON.stringify({ result: out })); }); });
const L = { _: null };
const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', async () => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const fn = require(path.join(root, 'api', u.pathname.slice(5) + '.js')); q.query = Object.fromEntries(u.searchParams); try { q.body = b ? JSON.parse(b) : undefined; } catch (e) { q.body = b; }
    r.json = (o) => r.end(JSON.stringify(o)); return fn(q, r);
  }
  const f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
  if (f.startsWith(root) && fs.existsSync(f)) { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'image/jpeg' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end(); }
}); });
(async () => {
  await new Promise((r) => redis.listen(0, r)); process.env.UPSTASH_REDIS_REST_URL = 'http://localhost:' + redis.address().port; process.env.UPSTASH_REDIS_REST_TOKEN = 'rtok'; process.env.AUTH_SECRET = 'x'.repeat(32);
  await new Promise((r) => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch(); const errs = [];
  const device = async () => { const c = await b.newContext(), p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort()); await p.goto(base, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.SicCloud && SicCloud.enabled()); return p; };
  const toast = (p) => p.evaluate(() => (document.querySelector('.toast') || {}).textContent);
  const d1 = await device();
  await d1.click('[data-act=authMode]'); await d1.fill('#rName', 'น้องเอ'); await d1.fill('#lEmail', 'A@x.com'); await d1.fill('#lCode', 'abcdef'); await d1.fill('#rPw2', 'abcdef'); await d1.click('[data-act=doRegister]');
  await d1.waitForFunction(() => DB.session && DB.session.name === 'น้องเอ');
  const stored = JSON.parse(H['sic:users']['a@x.com']); assert(stored.hash && stored.hash !== 'abcdef' && !JSON.stringify(H).includes('abcdef'), 'ต้องไม่มีรหัสผ่านตัวจริงใน DB'); console.log('register ok (password hashed)');
  await d1.evaluate(() => { DB.rooms.ROOM1 = { code: 'ROOM1', owner: 'น้องเอ', lessonId: DB.lessons[0].id, status: 'lobby', city: 100, cityStart: 100, log: [], players: [newPlayer('สมชาย', 'gov')] }; save(); });
  await d1.waitForFunction(() => SicCloud.status() === 'ok'); await d1.evaluate(() => SicCloud.sync());
  assert.strictEqual(H['sic:data']['rooms/ROOM1/m/city'], '100'); console.log('room stored; lessons untouched:', !Object.keys(H['sic:data']).some((k) => k.startsWith('lessons/')));
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
  assert(Object.keys(H['sic:data']).some((k) => k.startsWith('lessons/')), 'ครูต้องบันทึกสื่อได้'); console.log('teacher lesson stored');
  await d1.evaluate(() => SicCloud.sync()); const t1 = await d1.evaluate(() => DB.lessons[0].title); console.log('player got lesson:', t1);
  await d1.evaluate(() => { DB.lessons[0].title = 'นักเรียนพยายามแก้'; save(); }); await d1.evaluate(() => SicCloud.sync()); await d1.evaluate(() => SicCloud.sync());
  const t2 = await d1.evaluate(() => DB.lessons[0].title); assert.strictEqual(JSON.parse(H['sic:data'][Object.keys(H['sic:data']).find((k) => k.startsWith('lessons/'))]).title, 'ชุดที่ครูแก้'); console.log('player edit rejected; local reverted to:', t2);
  // ไม่มีโทเค็น → 401
  assert.strictEqual((await fetch(base + '/api/db?path=rooms')).status, 401);
  console.log('page errors:', errs); await b.close(); srv.close(); redis.close(); if (errs.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
