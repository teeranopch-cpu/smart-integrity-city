// ตรวจว่าหน้าหลักไม่ล้นจอ (ไม่มีแถบเลื่อนแนวนอนของทั้งหน้า) ที่ขนาดมือถือ/ไอแพด (ต้องมี Playwright)
const { chromium } = require('playwright'); const path = require('path'); const out = process.argv[2] || '.';
const sizes = [['phone', 375, 700], ['phone-small', 320, 640], ['ipad', 820, 1100], ['ipad-land', 1180, 800]];
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const [n, w, h] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }), p = await ctx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
    await p.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'domcontentloaded' });
    const chk = async (label) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o > 1) { bad++; console.log('OVERFLOW', n, label, o + 'px'); } await p.screenshot({ path: `${out}/${n}-${label}.png`, fullPage: true }); };
    await chk('login');
    await p.click('[data-act=authMode]'); await p.fill('#rName', 'ทดสอบ'); await p.fill('#lEmail', 'a@x.com'); await p.fill('#lCode', 'abcdef'); await p.fill('#rPw2', 'abcdef'); await p.click('[data-act=doRegister]');
    await chk('home');
    await p.evaluate(() => { const L = DB.lessons[0]; const r = { code: 'T1', lessonId: L.id, status: 'playing', city: 100, cityStart: 100, log: [], durationMin: 30, endsAt: Date.now() + 1.8e6, players: ['gov', 'biz', 'press', 'local', 'police', 'citizen'].map((x, i) => newPlayer('ผู้เล่นคนที่ ' + (i + 1), x)) }; DB.rooms.T1 = r; ui.code = 'T1'; save(); go('game'); });
    await chk('game');
    await p.evaluate(() => { ui.act = { kind: 'civic', stage: 'setup', pid: DB.rooms.T1.players[0].id, role: 'gov', text: '' }; H.actGo(); }); await chk('mission');
    await p.evaluate(() => { ui.act = null; go('lobby'); DB.rooms.T1.status = 'lobby'; render(); }); await chk('lobby');
    await ctx.close();
  }
  await b.close(); console.log(bad ? 'พบหน้าที่ล้นจอ ' + bad : 'ไม่พบหน้าที่ล้นจอ');
})().catch((e) => { console.error(e); process.exit(1); });
