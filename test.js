// ทดสอบตรรกะหลัก: node test.js
const assert = require('assert');
global.window = undefined;
const fs = require('fs');
eval(fs.readFileSync(__dirname + '/data.js', 'utf8').replace(/^const /gm, 'global.').replace(/global\.(\w+) =/g, 'global.$1 ='));
const C = require('./core.js');
const L = JSON.parse(JSON.stringify(global.DEFAULT_LESSON));
const mkRoom = () => ({ city: 100, cityStart: 100, status: 'playing', log: [], players: [] });

// 1) ภารกิจตัวละครสำเร็จ: +15 ชีวิต, +5 เมือง, เลื่อนขั้น
let r = mkRoom(), p = C.newPlayer('A', 'gov'); r.players.push(p);
C.resolveCivic(r, L, p, 'gov', 'pass', 'think');
assert.deepStrictEqual([p.life, p.step, r.city], [15, 1, 105]);

// 2) ตอบเชิงทุจริต: -5 ชีวิต, -10 เมือง
C.resolveCivic(r, L, p, 'gov', 'corrupt', 'think');
assert.deepStrictEqual([p.life, r.city], [10, 95]);

// 3) ภารกิจช่วยเหลือสำเร็จ: +10 ร่วมมือ, +5 เมือง
C.resolveCivic(r, L, p, 'biz', 'pass', 'honesty');
assert.deepStrictEqual([p.coop, r.city], [10, 100]);

// 4) ตรวจสอบ 0 คะแนน: ยึด 1 ขั้น; ถ้าไม่มีขั้น หักชีวิต -10 แทน
C.resolveAudit(r, L, p, { score: 0 });
assert.strictEqual(p.step, 0);
const lifeBefore = p.life; C.resolveAudit(r, L, p, { score: 0 });
assert.strictEqual(p.life, lifeBefore - 10);

// 5) การ์ดหนี: -10/-10
const cityB = r.city; C.resolveAudit(r, L, p, { escape: true });
assert.strictEqual(r.city, cityB - 10);

// 6) ตรวจสอบ 4-5 คะแนน: +10 ชีวิต
const l2 = p.life; C.resolveAudit(r, L, p, { score: 5 });
assert.strictEqual(p.life, l2 + 10);

// 7) เมืองล่มสลายเมื่อดัชนีเมือง 0
r = mkRoom(); p = C.newPlayer('B', 'biz'); r.players.push(p);
C.applyDelta(r, p, [0, 0, -100], 'test');
assert.strictEqual(r.status, 'ended'); assert.strictEqual(r.endReason, 'collapse'); assert.strictEqual(r.winner, null);

// 8) จัดอันดับ: คะแนนรวม → ขั้นภารกิจ → ดัชนีชีวิต
r = mkRoom(); const a = C.newPlayer('a', 'gov'), b = C.newPlayer('b', 'biz'), c = C.newPlayer('c', 'press');
a.life = 20; a.coop = 0; a.step = 1; b.life = 10; b.coop = 10; b.step = 2; c.life = 5; c.coop = 15; c.step = 2;
r.players.push(a, b, c);
// a,b,c รวม 20 เท่ากันหมด → ขั้นภารกิจ: b,c(2) ก่อน a(1) → ดัชนีชีวิต: b(10) ก่อน c(5)
assert.deepStrictEqual(C.ranking(r).map((x) => x.name), ['b', 'c', 'a']);
C.endGame(r, 'time'); assert.strictEqual(r.winner, b.id);

// 9) ตัวประเมิน: "ไม่รับสินบน" ไม่ควรถูกนับเป็นทุจริต
assert.strictEqual(C.evalText('ฉันปฏิเสธและไม่รับสินบน พร้อมรายงานหัวหน้าให้ตรวจสอบอย่างโปร่งใส', L).verdict, 'pass');
assert.strictEqual(C.evalText('ฉันจะรับเงินใต้โต๊ะและปกปิดเรื่องนี้', L).verdict, 'corrupt');
assert.strictEqual(C.evalText('ไม่รู้', L).verdict, 'fail');

// 10) เกียรติบัตร: Post-Test (เต็ม 30) + ภารกิจชีวิตจริงที่อนุมัติ (เต็ม 5) ผ่านที่ 21 จาก 35
const q = C.newPlayer('q', 'gov'); q.post = { score: 18 };
['think', 'discipline', 'honesty'].forEach((t) => (q.evidence[t] = { status: 'approved' }));
assert.strictEqual(C.totalScore(q, L).total, 21); assert.strictEqual(C.totalScore(q, L).max, 35); assert.strictEqual(C.totalScore(q, L).pass, true);
q.evidence.honesty.status = 'rejected'; assert.strictEqual(C.totalScore(q, L).pass, false);

// 11) ข้อสอบปลายเปิด: ครบ 10 ข้อ หมวดละ 2 ข้อ แต่ละข้อมีกลุ่มคำสำคัญ 3 กลุ่ม
for (const set of ['pretest', 'posttest']) {
  assert.strictEqual(L[set].length, 10);
  for (const tr of ['think', 'discipline', 'honesty', 'sufficiency', 'public']) assert.strictEqual(L[set].filter((x) => x.trait === tr).length, 2, set + ' ' + tr);
  L[set].forEach((x, i) => { assert.strictEqual(x.keys.length, 3, set + i); assert(x.keys.every((g) => g.length > 0)); });
}
// แนวคำตอบของครูต้องได้เต็ม 3 ทุกข้อ (ตรวจว่ากลุ่มคำสำคัญครอบคลุมแนวคำตอบ)
for (const set of ['pretest', 'posttest']) L[set].forEach((x, i) => assert.strictEqual(C.scoreExam(x.ans, x).score, 3, set + ' ข้อ ' + (i + 1) + ' แนวคำตอบควรได้ 3'));
// ไม่ตอบ/ตอบสั้น/ตอบไม่ตรงประเด็น = 0
assert.strictEqual(C.scoreExam('', L.pretest[0]).score, 0);
assert.strictEqual(C.scoreExam('ไม่รู้', L.pretest[0]).score, 0);
// คำตอบสั้นแต่ตรงแนวคำตอบ ต้องได้คะแนน (ไม่ตัดคะแนนเพราะความสั้น)
assert(C.scoreExam('ส่งคืนเจ้าของ', L.pretest[6]).score >= 1);
assert(C.scoreExam('ส่งคืนเจ้าของและแจ้งครู', L.pretest[6]).score >= 2);
assert(C.scoreExam('ไม่ลอก', L.pretest[7]).score >= 1);
assert.strictEqual(C.scoreExam('วันนี้อากาศดีมากเลยไปเที่ยวทะเลกัน', L.posttest[7]).score, 0);
// ตอบได้บางส่วน = 1-2 (ไม่เต็ม)
const part = C.scoreExam('ฉันจะส่งคืนเจ้าของกระเป๋าเงินทันที', L.pretest[6]).score; assert(part >= 1 && part < 3, 'บางส่วน ' + part);
// เพดานคะแนน
assert(L.posttest.every((x) => C.scoreExam(x.ans + x.ans, x).score <= 3));

// 12) ช่องตรวจสอบแบบใหม่: ถูก +10 ชีวิต/+10 เมือง, ผิด -10/-10 และชุดข้อสอบ 6 อาชีพ อาชีพละ 10 ข้อ
r = mkRoom(); p = C.newPlayer('D', 'police'); r.players.push(p);
C.resolveAudit(r, L, p, { right: true });
assert.deepStrictEqual([p.life, r.city], [10, 110]);
C.resolveAudit(r, L, p, { right: false });
assert.deepStrictEqual([p.life, r.city], [0, 100]);

const auditRoles = ['police', 'gov', 'citizen', 'press', 'local', 'biz'];
for (const role of auditRoles) {
  assert(Array.isArray(L.auditBank[role]), 'missing auditBank for ' + role);
  assert.strictEqual(L.auditBank[role].length, 10, role + ' should have 10 questions');
  L.auditBank[role].forEach((item, i) => {
    assert(item.q && item.ans && Array.isArray(item.keys) && item.keys.length === 3, role + ' #' + (i + 1));
    assert(item.keys.every((g) => g.length > 0), role + ' keys #' + (i + 1));
    assert.strictEqual(C.scoreExam(item.ans, item).score, 3, role + ' #' + (i + 1) + ' ans should score 3');
    assert.strictEqual(C.evalAudit(item.ans, L, item).right, true, role + ' #' + (i + 1) + ' ans should pass evalAudit');
    assert.strictEqual(C.evalAudit('', L, item).right, false, role + ' #' + (i + 1) + ' empty should fail');
    assert.strictEqual(C.evalAudit('รับเงินใต้โต๊ะและปกปิดไว้', L, item).right, false, role + ' #' + (i + 1) + ' corrupt should fail');
  });
}

console.log('ทุกการทดสอบผ่าน');
