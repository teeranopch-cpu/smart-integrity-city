// ตรรกะหลักของเกม (ไม่ผูกกับ DOM) เพื่อให้ทดสอบได้
const MISSION_MS = 30 * 1000; // เวลาตอบภารกิจ/ช่องคุณลักษณะ/ช่องท้าทายจริยธรรม 30 วินาที (นับหลังกดเริ่มทำ)
const PRE_MS = 30 * 1000; // เวลาทำข้อสอบ Pre-Test ต่อข้อ 30 วินาที
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const EXAM_MAX = 3; // คะแนนเต็มต่อข้อของ Pre/Post-Test
const TRAIT_MAX = 6; // คะแนนเต็มต่อคุณลักษณะ (ข้อสอบ 2 ข้อ x 3 คะแนน)

// ตรวจว่าคำเชิงลบ (เช่น "สินบน") ถูกนำหน้าด้วยการปฏิเสธหรือไม่ (เช่น "ไม่รับสินบน")
function countBad(text, words) {
  let n = 0;
  for (const w of words) {
    let i = text.indexOf(w);
    while (i !== -1) {
      const before = text.slice(Math.max(0, i - 24), i);
      if (!/(ไม่|ปฏิเสธ|ห้าม|แจ้ง|รายงาน|ต้าน|ป้องกัน|ปราศจาก|ขจัด|ลด|ไร้|ปลอด|แก้|ปัญหา|ตรวจสอบ|สอบสวน|เปิดโปง|แฉ|ดำเนินคดี|จับกุม|เอาผิด|ลบล้าง|บันทึก|หลักฐาน|ข้อหา|คดี|หากพบ|ผลกระทบ|ลงโทษ|ก่อให้เกิด|กระทำผิด|Zero)/i.test(before)) n++;
      i = text.indexOf(w, i + w.length);
    }
  }
  return n;
}

// ตัวประเมินคำตอบเบื้องต้นแบบอิงคำสำคัญ (ทดแทน AI ได้ผ่าน window.AI_EVALUATOR)
function evalText(text, lesson) {
  const t = (text || '').trim();
  const good = lesson.keywords.good.filter((w) => t.includes(w)).length;
  const bad = countBad(t, lesson.keywords.bad);
  let verdict = 'fail';
  if (bad > 0 && bad >= good) verdict = 'corrupt';
  else if (good >= 1 && t.length >= 20) verdict = 'pass';
  return { verdict, good, bad, auditScore: bad > good ? 0 : clamp(good, 0, 5) };
}

// ใช้ AI ภายนอกถ้ามี (ฟังก์ชัน async ที่คืน {verdict, auditScore}) มิฉะนั้นใช้ evalText
async function evaluate(text, lesson, kind) {
  if (typeof window !== 'undefined' && typeof window.AI_EVALUATOR === 'function') {
    try {
      const r = await window.AI_EVALUATOR(text, lesson, kind);
      if (r && r.verdict) return r;
    } catch (e) { /* ใช้ตัวสำรอง */ }
  }
  return evalText(text, lesson);
}

function newPlayer(name, roleId) {
  return {
    id: 'p' + Math.random().toString(36).slice(2, 8),
    name, role: roleId,
    life: 0, coop: 0, step: 0, // step = จำนวนขั้นภารกิจที่สำเร็จ (0-3)
    pre: null, traitGame: {}, evidence: {}, post: null,
  };
}

function applyDelta(room, player, delta, reason, extra = {}) {
  const [life, coop, city] = delta;
  if (player) { player.life += life; player.coop += coop; }
  room.city = clamp(room.city + city, 0, 9999);
  room.log.push({ at: Date.now(), pid: player ? player.id : null, life, coop, city, reason, ...extra });
  if (room.city <= 0 && room.status === 'playing') endGame(room, 'collapse');
}

function addTrait(player, trait, d) {
  if (!trait) return;
  const base = player.traitGame[trait] ?? (player.pre && player.pre[trait]) ?? TRAIT_MAX / 2;
  player.traitGame[trait] = clamp(base + d, 0, TRAIT_MAX);
}

// กติกาคะแนนใหม่ (ตายตัว):
//  - ภารกิจของตัวเอง: ผ่าน = เลื่อนขั้นภารกิจ +1 ไม่มีคะแนนอื่น
//  - ช่วยเหลือภารกิจคนอื่น: ผ่าน = แต้มความร่วมมือ +10
//  - ช่องคุณลักษณะ/ท้าทายจริยธรรม: คำตอบตรงกับข้อสอบ = ผ่าน ดัชนีชีวิต +10 และดัชนีเมือง +10 ไม่ตรง = -10 / -10
//  - ช่องตรวจสอบ: ให้คะแนน 0-3 แต่ไม่มีผลต่อคะแนนใด ๆ
const HELP_COOP = 10, EXAM_PASS = [10, 0, 10], EXAM_FAIL = [-10, 0, -10], EXAM_MATCH_MIN = 2;
function resolveCivic(room, lesson, player, ownerRole, verdict, trait) {
  const own = ownerRole === player.role;
  if (own) {
    if (player.step >= 3) return 'ภารกิจส่วนตัวครบ 3 ขั้นแล้ว';
    if (verdict === 'pass') {
      player.step += 1; addTrait(player, trait, 1);
      applyDelta(room, player, [0, 0, 0], 'ภารกิจตัวละครสำเร็จ (ขั้น ' + player.step + ')');
      return 'สำเร็จ! เลื่อนเป็นขั้น ' + player.step + ' — วางเหรียญภารกิจบนกระดาน';
    }
    return 'ยังไม่ผ่าน: อยู่ขั้นเดิม (ต้องทำให้ครบทั้ง 10 ข้อ)';
  }
  if (verdict === 'pass') { addTrait(player, trait, 1); applyDelta(room, player, [0, HELP_COOP, 0], 'ภารกิจช่วยเหลือสำเร็จ'); return 'ช่วยเหลือสำเร็จ ได้แต้มความร่วมมือ +' + HELP_COOP; }
  return 'ยังไม่ผ่าน: ไม่มีการเปลี่ยนแปลงแต้ม';
}

// ตรวจว่าคำตอบ "ตรงกับข้อสอบ" หรือไม่ (ใช้ตัวตรวจ 2 ชั้น ต้องได้ ≥ 2 จาก 3)
function matchExam(text, q, th) {
  const r = scoreExam2(text, q, th);
  return Object.assign({ pass: r.score >= EXAM_MATCH_MIN }, r);
}

// ช่องคุณลักษณะ: pass = true/false
function resolveTrait(room, lesson, player, trait, pass) {
  addTrait(player, trait, pass ? 1 : -1);
  applyDelta(room, player, pass ? EXAM_PASS : EXAM_FAIL, 'ช่องคุณลักษณะ: ' + (pass ? 'ผ่าน' : 'ไม่ผ่าน'));
  return pass ? 'ผ่าน: ดัชนีชีวิต +10 และดัชนีเมือง +10' : 'ไม่ผ่าน: ดัชนีชีวิต −10 และดัชนีเมือง −10';
}

function resolveEthics(room, lesson, player, trait, pass) {
  addTrait(player, trait, pass ? 1 : -1);
  applyDelta(room, player, pass ? EXAM_PASS : EXAM_FAIL, 'ช่องท้าทายจริยธรรม: ' + (pass ? 'ผ่าน' : 'ไม่ผ่าน'));
  return pass ? 'ผ่าน: ดัชนีชีวิต +10 และดัชนีเมือง +10' : 'ไม่ผ่าน: ดัชนีชีวิต −10 และดัชนีเมือง −10';
}

// ตรวจคำตอบช่องตรวจสอบ: ตรวจว่าข้อความสอดคล้องกับแนวคำตอบของโจทย์หรือไม่ (ไม่ให้ผ่านจากคำทั่วไปที่ไม่ตรงแนวคำตอบ)
function evalAudit(text, lesson, qItem) {
  const t = (text || '').trim();
  const ev = evalText(t, lesson);
  const total = (qItem && Array.isArray(qItem.keys)) ? qItem.keys.length : 0;
  if (!t) return { right: false, aligned: false, ev, score: 0, hits: 0, total, matched: [], note: 'ไม่ได้พิมพ์คำตอบ' };
  if (ev.verdict === 'corrupt') return { right: false, aligned: false, ev, score: 0, hits: 0, total, matched: [], note: 'ไม่สอดคล้องกับแนวคำตอบ (มีเนื้อหาเชิงทุจริต)' };
  if (total > 0) {
    const sc = scoreExam(t, qItem);
    const need = Math.min(2, total);
    const right = sc.hits >= need;
    const matchedTxt = sc.matched.length ? ` · พบคำสำคัญ: ${sc.matched.join(', ')}` : '';
    const note = right
      ? `สอดคล้องกับแนวคำตอบ (ตรง ${sc.hits}/${total} ประเด็น${matchedTxt})`
      : `ไม่สอดคล้องกับแนวคำตอบ (ตรง ${sc.hits}/${total} ประเด็น ต้องตรงอย่างน้อย ${need} ประเด็น${matchedTxt})`;
    return { right, aligned: right, ev, score: sc.score, hits: sc.hits, total, matched: sc.matched, note };
  }
  const right = ev.verdict === 'pass';
  return { right, aligned: right, ev, score: ev.auditScore || 0, hits: ev.good, total: 0, matched: [], note: right ? 'สอดคล้องกับหลักสุจริต' : 'คำตอบยังไม่ชัดเจนหรือไม่ตรงประเด็น' };
}

// ตรวจคำตอบช่องช่วยเหลือ (ภารกิจของคนอื่น): อิงความสอดคล้องกับแนวทางเกณฑ์ของสถานการณ์นั้น
function evalHelp(text, lesson, qItem) {
  const t = (text || '').trim();
  const ev = evalText(t, lesson);
  if (ev.verdict === 'corrupt') return { verdict: 'corrupt', ev, score: 0, hits: 0, total: (qItem && qItem.keys) ? qItem.keys.length : 0, matched: [], note: 'คำตอบมีเนื้อหาเชิงทุจริต' };
  if (qItem && Array.isArray(qItem.keys) && qItem.keys.length) {
    const a = evalAudit(t, lesson, qItem);
    return { verdict: a.right ? 'pass' : 'fail', ev, score: a.score, hits: a.hits, total: a.total, matched: a.matched, note: a.note };
  }
  return { verdict: ev.verdict, ev, score: ev.auditScore || 0, hits: ev.good, total: 0, matched: [], note: ev.verdict === 'pass' ? 'สอดคล้องกับหลักสุจริต' : 'คำตอบยังไม่ชัดเจน' };
}

// ตรวจภารกิจตัวละครแบบติ๊กถูก/ผิด 10 ข้อ (ต้องถูกครบ 10/10 ข้อ)
const TF_PASS_MIN = 10; // ต้องทำภารกิจให้ครบทั้ง 10 ข้อ (ถูกทุกข้อ) จึงผ่านขั้น
function evalTfMission(answers, items, passMin = TF_PASS_MIN) {
  const details = (items || []).map((it, i) => {
    const pick = answers ? answers[i] : null;
    const ok = pick === it.ans;
    return { q: it.q, expected: it.ans, pick, ok };
  });
  const total = details.length;
  const correct = details.filter((d) => d.ok).length;
  const need = Math.min(passMin, total);
  const pass = total > 0 && correct >= need;
  const note = `ตอบถูก ${correct}/${total} ข้อ (${pass ? 'ผ่านความรู้ตามเกณฑ์ ≥ ' + need + '/' + total : 'ยังไม่ถึงเกณฑ์ ' + need + '/' + total + ' ข้อ'})`;
  return { verdict: pass ? 'pass' : 'fail', correct, total, need, pass, details, note };
}

// ช่องตรวจสอบ: บันทึกคะแนน 0-3 ลงประวัติเท่านั้น ไม่มีผลต่อดัชนีชีวิต แต้มร่วมมือ ดัชนีเมือง หรือขั้นภารกิจ
function resolveAudit(room, lesson, target, opt = {}) {
  const score = clamp(Math.round(opt.score || 0), 0, EXAM_MAX);
  room.log.push({ at: Date.now(), pid: target.id, life: 0, coop: 0, city: 0, reason: 'ช่องตรวจสอบ: ' + score + '/' + EXAM_MAX + ' (ไม่มีผลต่อคะแนน)' });
  return 'ผลตรวจสอบ ' + score + ' / ' + EXAM_MAX + ' คะแนน — ไม่มีผลต่อดัชนีและแต้มใด ๆ';
}

function ranking(room) {
  return [...room.players].sort((a, b) =>
    (b.life + b.coop) - (a.life + a.coop) || b.step - a.step || b.life - a.life);
}

function endGame(room, reason) {
  if (room.status === 'ended') return;
  room.status = 'ended';
  room.endReason = reason;
  room.endedAt = Date.now();
  room.winner = reason === 'time' && room.players.length ? ranking(room)[0].id : null;
}

// ตรวจข้อสอบปลายเปิดเบื้องต้น: ดูว่าคำตอบตรงกับแนวคำตอบกี่ประเด็น (กลุ่มคำสำคัญ 3 กลุ่ม ตรงกลุ่มละ 1 คะแนน สูงสุด 3) ไม่พิจารณาความยาว
function scoreExam(text, q) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return { score: 0, hits: 0, matched: [] };
  const matched = [];
  let hits = 0;
  for (const g of (q.keys || [])) {
    const w = g.find((x) => t.includes(x.toLowerCase()));
    if (w) { hits++; matched.push(w); }
  }
  return { score: Math.min(EXAM_MAX, hits), hits, matched };
}


// ===== ชั้นที่ 1: ความใกล้เคียงกับแนวคำตอบ (เป็น %) ทำงานในเบราว์เซอร์ ไม่ใช้ AI ไม่คิดความยาว =====
const STOP = ['และ','หรือ','ที่','ซึ่ง','ของ','ใน','ให้','ได้','เป็น','มี','จะ','ก็','แต่','การ','ความ','ว่า','กับ','แก่','โดย','เพื่อ','ไป','มา','นี้','นั้น','แล้ว','อยู่','คือ','ต้อง','ควร','เรา','ผม','ฉัน','หนู','จาก','ถึง','ด้วย','เช่น','ทุก','อย่าง','ทำ','ๆ','นะ','ครับ','ค่ะ','คะ','ไว้','เอง','ก่อน','หลัง','ยัง','ไม่'];
const _seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
function normTh(s) { return (s || '').toLowerCase().replace(/[\s\u200b.,!?;:"'()\[\]\-_/\\ๆฯ]+/g, ''); }
function tokens(text) {
  const t = (text || '').toLowerCase();
  let ws = [];
  if (_seg) for (const x of _seg.segment(t)) { if (x.isWordLike) ws.push(x.segment); }
  else ws = t.split(/[^\u0E00-\u0E7Fa-z0-9]+/).filter(Boolean);
  return ws.filter((w) => w.length >= 2 && !STOP.includes(w));
}
function bigrams(s) { const r = new Set(); for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i + 2)); return r; }
function dice(a, b) { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return (2 * n) / (A.size + B.size); }
// สัดส่วน (0-1) ของสาระในแนวคำตอบที่พบในคำตอบผู้เรียน (ถ่วงน้ำหนักตามความยาวคำ)
function coverage(answer, ref) {
  const rt = tokens(ref), at = tokens(answer), flat = normTh(answer);
  if (!rt.length || !flat) return 0;
  let got = 0, all = 0;
  for (const w of rt) {
    const wt = Math.min(w.length, 8); all += wt;
    if (flat.includes(w)) { got += wt; continue; }
    if (w.length >= 4) { let best = 0; for (const a of at) if (a.length >= 3) best = Math.max(best, dice(w, a)); if (best >= 0.7) got += wt * best; }
  }
  return got / all;
}
// วลีที่บ่งชี้ว่าตอบกลับด้านกับคุณธรรม (ถ้าแนวคำตอบไม่มีวลีนั้น) → ให้ 0 เพื่อกันคำตอบที่ใช้คำเดียวกันแต่ความหมายตรงข้าม
const REVERSE_CUES = ['ไม่ต้องสนใจ','ไม่ต้องบอก','ไม่ต้องตรวจ','ไม่ต้องช่วย','ไม่ต้องบริจาค','ไม่ต้องเก็บ','ไม่ต้องตรงเวลา','ไม่จำเป็นต้อง','ไม่สนใจ','ช่างเขา','ช่างมัน','ไม่ใช่เรื่องของเรา','ไม่ใช่หน้าที่','ไม่ใช่ธุระ','ปกปิด','เก็บไว้ใช้เอง','ไม่บอกใคร','ไม่มีใครเห็น','ไม่เป็นไร','ปล่อยไว้','คนอื่นทำ'];
function reversed(text, q) { const t = normTh(text), r = normTh([q.ans].concat(q.alts || []).join('')); return REVERSE_CUES.some((c) => t.includes(c) && !r.includes(c)); }
const SIM_DEFAULT = { t1: 0.15, t2: 0.25, t3: 0.35 };
function similarity(text, q) {
  const refs = [q.ans].concat(q.alts || []).filter(Boolean);
  return Math.max(0, ...refs.map((r) => coverage(text, r)));
}
function simScore(sim, th) { th = th || SIM_DEFAULT; return sim >= th.t3 ? 3 : sim >= th.t2 ? 2 : sim >= th.t1 ? 1 : 0; }

// ชั้นที่ 1+2 รวมกัน: ใช้คะแนนที่สูงกว่าระหว่าง 'ความใกล้เคียง %' กับ 'กลุ่มคำสำคัญ' ยกเว้นตอบกลับด้านให้ 0
function scoreExam2(text, q, th) {
  const t = (text || '').trim();
  if (!t) return { score: 0, hits: 0, sim: 0 };
  const k = scoreExam(t, q), sim = similarity(t, q);
  if (reversed(t, q)) return { score: 0, hits: k.hits, sim, reversed: true };
  return { score: Math.max(k.score, simScore(sim, th || SIM_DEFAULT)), hits: k.hits, sim };
}

// ใช้ AI ภายนอกถ้ามี window.AI_EVALUATOR(text, lesson, kind, question) → {score: 0-3} มิฉะนั้นใช้ scoreExam
async function evaluateExam(text, lesson, kind, q) {
  if (typeof window !== 'undefined' && typeof window.AI_EVALUATOR === 'function') {
    try {
      const r = await window.AI_EVALUATOR(text, lesson, kind, q);
      if (r && Number.isFinite(r.score)) return { score: clamp(Math.round(r.score), 0, EXAM_MAX) };
    } catch (e) { /* ใช้ตัวสำรอง */ }
  }
  return scoreExam2(text, q, lesson && lesson.exam);
}

function totalScore(player, lesson) {
  const post = player.post ? player.post.score : 0; // เต็ม 30
  const ev = Object.values(player.evidence || {}).filter((e) => e.status === 'approved').length; // เต็ม 5
  const max = lesson.posttest.length * EXAM_MAX + TRAITS_COUNT;
  return { post, ev, total: post + ev, max, pass: post + ev >= lesson.passScore };
}
const TRAITS_COUNT = 5;

if (typeof module !== 'undefined') {
  module.exports = { matchExam, EXAM_PASS, EXAM_FAIL, scoreExam2, reversed, similarity, coverage, simScore, tokens, SIM_DEFAULT, evalText, evalAudit, evalHelp, evalTfMission, TF_PASS_MIN, scoreExam, newPlayer, applyDelta, resolveCivic, resolveTrait, resolveEthics, resolveAudit, ranking, endGame, totalScore, countBad };
}
