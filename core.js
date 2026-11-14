// ตรรกะหลักของเกม (ไม่ผูกกับ DOM) เพื่อให้ทดสอบได้
const MISSION_MS = 30 * 1000; // เวลาตอบภารกิจ/ช่องคุณลักษณะ/ช่องท้าทายจริยธรรม 30 วินาที (นับหลังกดเริ่มทำ)
const PRE_MS = 30 * 1000; // เวลาทำข้อสอบ Pre-Test ต่อข้อ 30 วินาที
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// ตรวจว่าคำเชิงลบ (เช่น "สินบน") ถูกนำหน้าด้วยการปฏิเสธหรือไม่ (เช่น "ไม่รับสินบน")
function countBad(text, words) {
  let n = 0;
  for (const w of words) {
    let i = text.indexOf(w);
    while (i !== -1) {
      const before = text.slice(Math.max(0, i - 8), i);
      if (!/(ไม่|ปฏิเสธ|ห้าม|แจ้งเรื่อง|รายงาน|ต่อต้าน|ป้องกัน)/.test(before)) n++;
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
  const base = player.traitGame[trait] ?? (player.pre && player.pre[trait]) ?? 5;
  player.traitGame[trait] = clamp(base + d, 0, 10);
}

// ผลภารกิจพลเมือง: verdict = pass | fail | corrupt
function resolveCivic(room, lesson, player, ownerRole, verdict, trait) {
  const P = lesson.points;
  const own = ownerRole === player.role;
  if (own) {
    if (player.step >= 3) return 'ภารกิจส่วนตัวครบ 3 ขั้นแล้ว';
    if (verdict === 'pass') {
      player.step += 1; addTrait(player, trait, 2);
      applyDelta(room, player, P.ownPass, 'ภารกิจตัวละครสำเร็จ (ขั้น ' + player.step + ')');
      return 'สำเร็จ! เลื่อนเป็นขั้น ' + player.step + ' — วางเหรียญภารกิจบนกระดาน';
    }
    if (verdict === 'corrupt') {
      addTrait(player, trait, -2);
      applyDelta(room, player, P.ownCorrupt, 'ภารกิจตัวละครตอบเชิงทุจริต');
      return 'ตอบเชิงทุจริต: ดัชนีเมืองลดลง';
    }
    return 'ยังไม่ผ่าน: อยู่ขั้นเดิม';
  }
  if (verdict === 'pass') { addTrait(player, trait, 2); applyDelta(room, player, P.helpPass, 'ภารกิจช่วยเหลือสำเร็จ'); return 'ช่วยเหลือสำเร็จ ได้แต้มความร่วมมือ'; }
  if (verdict === 'corrupt') { addTrait(player, trait, -2); applyDelta(room, player, P.helpCorrupt, 'ภารกิจช่วยเหลือตอบเชิงทุจริต'); return 'ตอบเชิงทุจริต: ดัชนีเมืองลดลง'; }
  return 'ยังไม่ผ่าน: ไม่มีการเปลี่ยนแปลงแต้ม';
}

// ช่องคุณลักษณะ: grade = good | ok | bad
function resolveTrait(room, lesson, player, trait, grade) {
  const P = lesson.points;
  const map = { good: [P.traitGood, 2, 'ตอบดี'], ok: [P.traitOk, 1, 'พอใช้'], bad: [P.traitBad, -2, 'ไม่เหมาะสม'] };
  const [d, t, label] = map[grade];
  addTrait(player, trait, t);
  applyDelta(room, player, d, 'ช่องคุณลักษณะ: ' + label);
  return 'บันทึกผลช่องคุณลักษณะ: ' + label;
}

function resolveEthics(room, lesson, player, trait, right) {
  const P = lesson.points;
  addTrait(player, trait, right ? 2 : -2);
  applyDelta(room, player, right ? P.ethicsRight : P.ethicsWrong, 'ช่องท้าทายจริยธรรม: ' + (right ? 'ถูก' : 'ผิด'));
  return right ? 'ตอบถูก' : 'ตอบผิด';
}

// ตรวจสอบ: escape = ใช้การ์ดหนี, score 0-5, lowChoice = 'back'|'penalty'
function resolveAudit(room, lesson, target, { escape, score, lowChoice }) {
  const P = lesson.points;
  if (escape) {
    applyDelta(room, target, P.escape, 'ใช้การ์ดหนีการตรวจสอบ');
    return 'ใช้การ์ดหนีการตรวจสอบ: หักดัชนีเมือง −10 และดัชนีชีวิต −10';
  }
  if (score === 0) {
    if (target.step > 0) {
      target.step -= 1;
      room.log.push({ at: Date.now(), pid: target.id, life: 0, coop: 0, city: 0, reason: 'ถูกยึดเป้าหมาย 1 ขั้น' });
      return 'พบทุจริต: ยึดเป้าหมายที่ทำสำเร็จ 1 ขั้น (เหลือ ' + target.step + ' ขั้น) — เก็บเหรียญภารกิจออกจากกระดาน';
    }
    applyDelta(room, target, P.seizeNoStep, 'ถูกยึดเป้าหมายแต่ยังไม่มีขั้นที่สำเร็จ');
    return 'ยังไม่มีขั้นที่สำเร็จ จึงหักดัชนีชีวิต −10 แทน';
  }
  if (score <= 3) {
    if (lowChoice === 'back') { room.log.push({ at: Date.now(), pid: target.id, life: 0, coop: 0, city: 0, reason: 'ตรวจสอบ ' + score + ' คะแนน: เดินถอยหลัง' }); return 'ให้ผู้เล่นเดินถอยหลังบนกระดานตามกติกา'; }
    applyDelta(room, target, P.auditLow, 'ตรวจสอบ ' + score + ' คะแนน: ลงโทษตามกติกา');
    return 'หักแต้มตามที่ครูกำหนดในตารางแต้ม';
  }
  addTrait(target, 'honesty', 2);
  applyDelta(room, target, P.auditHonest, 'ตรวจสอบแล้วสุจริต (' + score + ' คะแนน)');
  return 'ผู้ถูกตรวจสอบสุจริต ได้ดัชนีชีวิตเพิ่ม — ผู้ตรวจสอบถูกข้อหาหมิ่นประมาท';
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

function preScoreFromVerdict(r) {
  if (r.verdict === 'corrupt') return 2;
  if (r.verdict === 'pass') return Math.min(10, 6 + r.good * 2);
  return 4;
}

function totalScore(player, lesson) {
  const post = player.post ? player.post.score : 0;
  const ev = Object.values(player.evidence || {}).filter((e) => e.status === 'approved').length;
  return { post, ev, total: post + ev, pass: post + ev >= lesson.passScore };
}

if (typeof module !== 'undefined') {
  module.exports = { evalText, newPlayer, applyDelta, resolveCivic, resolveTrait, resolveEthics, resolveAudit, ranking, endGame, totalScore, preScoreFromVerdict, countBad };
}
