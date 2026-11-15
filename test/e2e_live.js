// ทดสอบดูสดข้ามเครื่อง: เซิร์ฟเวอร์จำลอง (เลียนแบบ REST ของ Firebase RTDB) + 2 เบราว์เซอร์แยกกัน
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..'); const store = {};
const srv = http.createServer((q, r) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' };
  if (q.url.startsWith('/sic/')) {
    if (q.method === 'OPTIONS') { r.writeHead(204, cors); return r.end(); }
    const m = q.url.match(/^\/sic\/live(?:\/([^/.]+))?\.json/); let b = '';
    q.on('data', (d) => (b += d)); q.on('end', () => {
      if (q.method === 'PUT') store[m[1]] = JSON.parse(b);
      else if (q.method === 'DELETE') { if (m[1]) delete store[m[1]]; else Object.keys(store).forEach((k) => delete store[k]); }
      r.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); r.end(JSON.stringify(q.method === 'GET' ? (Object.keys(store).length ? store : null) : null));
    }); return;
  }
  const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  if (f.startsWith(root) && fs.existsSync(f)) { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(fs.readFileSync(f)); } else { r.writeHead(404); r.end(); }
});
let T0=Date.now();(async () => {
  await new Promise((r) => srv.listen(0, r)); const port = srv.address().port, base = 'http://localhost:' + port;
  const b = await chromium.launch();
  const mk = async () => { const c = await b.newContext(); const p = await c.newPage(); p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); process.exitCode = 1; }); await p.route(/fonts\.(googleapis|gstatic)/, (rt) => rt.abort()); await p.route('**/config.js', (rt) => rt.fulfill({ contentType: 'text/javascript', body: `window.SIC_CONFIG={liveDb:'${base}'}` })); return p; };
  const st = await mk(), te = await mk();
  await st.goto(base, { waitUntil: 'domcontentloaded' }); await st.click('[data-act=authMode]'); await st.fill('#rName', 'น้องเอ'); await st.fill('#lEmail', 'a@x.com'); await st.fill('#lCode', 'abcdef'); await st.fill('#rPw2', 'abcdef'); await st.click('[data-act=doRegister]');
  await st.evaluate(() => { const L = DB.lessons[0]; const r = { code: 'TEST1', lessonId: L.id, status: 'lobby', city: 100, cityStart: 100, log: [], players: [newPlayer('สมชาย', 'gov')] }; DB.rooms.TEST1 = r; ui.code = 'TEST1'; save(); H.startPre({ dataset: { pid: r.players[0].id } }); });
  await st.click('[data-act=beginQ]'); await st.fill('#examText', 'ตรวจแหล่งข่าวและเทียบหลายแหล่ง'); console.log('typed', Date.now()-T0);
  await te.goto(base, { waitUntil: 'domcontentloaded' }); await te.fill('#lEmail', 'teach@x.com'); await te.fill('#lCode', 'TEACHER2026'); await te.click('[data-act=doLogin]');
  await te.evaluate(() => go('teacher', { tTab: 'live' }));
  await te.waitForFunction(() => document.querySelector('#liveBox') && document.querySelector('#liveBox').textContent.includes('ตรวจแหล่งข่าว'), null, { timeout: 8000 });
  console.log(Date.now()-T0,'ms');console.log('LIVE1 ok:', (await te.textContent('#liveBox')).replace(/\s+/g, ' ').slice(0, 200));
  await st.fill('#examText', 'ตรวจแหล่งข่าวและเทียบหลายแหล่ง แล้วไม่แชร์');
  await te.waitForFunction(() => document.querySelector('#liveBox').textContent.includes('แล้วไม่แชร์'), null, { timeout: 8000 });
  console.log('LIVE2 ok (updates as typing)');
  await te.screenshot({ path: '/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/live.png', fullPage: true });
  await te.evaluate(() => go('teacher', { tTab: 'calib', cText: 'ส่งคืนเจ้าของ' })); console.log('CALIB:', (await te.textContent('#app')).includes('ทดลองตรวจ'));
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
