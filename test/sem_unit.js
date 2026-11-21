// ทดสอบตรรกะชั้นเชิงความหมายด้วย embedder จำลอง (ไม่ใช่โมเดลจริง)
const fs = require('fs'); global.window = undefined;
eval(fs.readFileSync(__dirname + '/../data.js', 'utf8').replace(/^const /gm, 'global.'));
const C = require('../core.js'); const S = require('../semantic.js'); const assert = require('assert');
const fake = async (t) => { const v = new Array(64).fill(0); const s = String(t); for (let i = 0; i < s.length - 1; i++) v[(s.charCodeAt(i) * 31 + s.charCodeAt(i + 1)) % 64]++; const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
S._setEmbedder(fake);
(async () => {
  const q = global.DEFAULT_LESSON.pretest[0];
  assert.ok((await S.similarity(q.ans, q)) > 0.99, 'identical ≈ 1');
  assert.strictEqual(await S.similarity('', q), null);
  assert.strictEqual(C.semScore(0.9), 3); assert.strictEqual(C.semScore(0.7), 2); assert.strictEqual(C.semScore(0.55), 1); assert.strictEqual(C.semScore(0.1), 0); assert.strictEqual(C.semScore(NaN), 0);
  assert.strictEqual(C.combineSem({ score: 3, reversed: true }, 0.95), 0, 'reversal wins');
  assert.strictEqual(C.combineSem({ score: 1 }, 0.9), 3, 'max of both');
  const rows = [{ label: 3, base: { score: 0 }, cos: 0.9 }, { label: 0, base: { score: 0 }, cos: 0.2 }, { label: 2, base: { score: 0 }, cos: 0.7 }, { label: 1, base: { score: 0 }, cos: 0.55 }];
  const f = C.fitSemThresholds(rows); assert.strictEqual(f.exact, 4); assert.ok(f.th.s1 < f.th.s2 && f.th.s2 < f.th.s3);
  console.log('sem_unit ok', JSON.stringify(f));
})().catch((e) => { console.error(e); process.exit(1); });
