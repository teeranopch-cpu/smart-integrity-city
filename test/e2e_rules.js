// ทดสอบกติกาคะแนนผ่านหน้าเว็บจริง (ต้องมี Playwright)
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(), p = await (await b.newContext()).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.click('[data-act=authMode]'); await p.fill('#rName', 'ครู'); await p.fill('#lEmail', 'a@x.com'); await p.fill('#lCode', 'abcdef'); await p.fill('#rPw2', 'abcdef'); await p.click('[data-act=doRegister]');
  await p.evaluate(() => { const L = DB.lessons[0]; const r = { code: 'T1', lessonId: L.id, status: 'playing', city: 100, cityStart: 100, log: [], durationMin: 30, endsAt: Date.now() + 1.8e6, players: [newPlayer('สมชาย', 'gov'), newPlayer('สมหญิง', 'biz')] }; DB.rooms.T1 = r; ui.code = 'T1'; save(); go('game'); });
  const st = () => p.evaluate(() => { const r = DB.rooms.T1, q = r.players[0]; return [q.life, q.coop, q.step, r.city]; });
  const run = async (kind, setup) => { await p.evaluate((k) => H['act' + k[0].toUpperCase() + k.slice(1)](), kind); if (setup) await p.evaluate(setup); await p.click('[data-act=actGo]'); };
  // ภารกิจตัวเอง ครั้งที่ 1: ตอบถูกครบ → ผ่าน เลื่อนขั้น ไม่ได้คะแนนอื่น
  await run('civic', () => { ui.act.pid = DB.rooms.T1.players[0].id; ui.act.role = 'gov'; });
  const t1 = await p.textContent('#app'); console.log('mission1 title:', /ภารกิจที่ 1/.test(t1));
  await p.evaluate(() => { const a = ui.act; a.tfAns = a.items.map((i) => i.ans); });
  await p.evaluate(() => H.submitTf()); await p.evaluate(() => H.confirmAct()); console.log('after own pass [life,coop,step,city]:', await st());
  // ตกช่องตัวเองอีกรอบ → ภารกิจที่ 2
  await run('civic', () => { ui.act.pid = DB.rooms.T1.players[0].id; ui.act.role = 'gov'; });
  console.log('mission2 title:', /ภารกิจที่ 2/.test(await p.textContent('#app')));
  await p.evaluate(() => H.cancelAct());
  // ช่องคุณลักษณะ: ตอบตรงข้อสอบ → +10/+10
  await run('trait', () => { ui.act.pid = DB.rooms.T1.players[0].id; ui.act.trait = 'honesty'; });
  await p.evaluate(() => H.beginAct()); await p.evaluate(() => { ui.act.text = ui.act.qItem.ans; }); await p.evaluate(() => submitAnswer(false));
  await p.waitForFunction(() => ui.act && ui.act.ev); console.log('trait suggest:', await p.evaluate(() => ui.act.suggest), '|', await p.evaluate(() => ui.act.ev.note));
  await p.evaluate(() => H.confirmAct()); console.log('after trait pass:', await st());
  // ช่องท้าทายจริยธรรม: ตอบไม่ตรง → -10/-10
  await run('ethics', () => { ui.act.pid = DB.rooms.T1.players[0].id; });
  await p.evaluate(() => H.beginAct()); await p.evaluate(() => { ui.act.text = 'วันนี้อากาศดีไปเที่ยวทะเลกัน'; }); await p.evaluate(() => submitAnswer(false));
  await p.waitForFunction(() => ui.act && ui.act.ev); console.log('ethics suggest:', await p.evaluate(() => ui.act.suggest)); await p.evaluate(() => H.confirmAct()); console.log('after ethics fail:', await st());
  // ช่องตรวจสอบ: ไม่มีผลต่อคะแนน
  await run('audit', () => { const r = DB.rooms.T1; ui.act.pid = r.players[0].id; ui.act.inspector = r.players[1].id; });
  await p.evaluate(() => H.beginAct()); await p.evaluate(() => { ui.act.text = 'ตรวจสอบหลักฐาน'; }); await p.evaluate(() => submitAnswer(false));
  await p.waitForFunction(() => ui.act && ui.act.ev); console.log('audit suggest(0-3):', await p.evaluate(() => ui.act.suggest)); await p.evaluate(() => H.confirmAct()); console.log('after audit:', await st());
  await p.screenshot({ path: '/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/rules.png' });
  console.log('errors:', errs); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
