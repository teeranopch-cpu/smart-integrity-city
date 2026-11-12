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

// 10) เกียรติบัตร
const q = C.newPlayer('q', 'gov'); q.post = { score: 5 };
['think', 'discipline', 'honesty', 'sufficiency'].forEach((t) => (q.evidence[t] = { status: 'approved' }));
assert.strictEqual(C.totalScore(q, L).pass, true);
q.evidence.honesty.status = 'rejected'; assert.strictEqual(C.totalScore(q, L).pass, false);

console.log('ทุกการทดสอบผ่าน');
