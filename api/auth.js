// สมัครสมาชิก / เข้าสู่ระบบ: รหัสผ่านเก็บแบบ scrypt + salt ในฐานข้อมูล ส่งโทเค็นที่เซ็นด้วย AUTH_SECRET กลับ (อายุ 30 วัน)
const crypto = require('crypto');
const L = require('./_lib');
const DAY = 864e5;
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.json(res, 405, { error: 'METHOD' });
  if (!L.configured()) return L.json(res, 503, { error: 'NOT_CONFIGURED' });
  try {
    const b = await L.body(req), action = b.action, email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) return L.json(res, 400, { error: 'INVALID_EMAIL' });
    if (pw.length < 6 || pw.length > 200) return L.json(res, 400, { error: 'WEAK_PASSWORD' });
    const isTeacher = L.TEACHER_HASHES().includes(L.sha256(pw));
    let u = null; const raw = await L.redis('HGET', 'sic:users', email); if (raw) u = JSON.parse(raw);
    if (action === 'signup') {
      if (isTeacher) return L.json(res, 400, { error: 'WEAK_PASSWORD' });
      if (u) return L.json(res, 409, { error: 'EMAIL_EXISTS' });
      const name = String(b.name || '').trim().slice(0, 60) || email, salt = crypto.randomBytes(16).toString('hex');
      u = { uid: 'u' + crypto.randomBytes(8).toString('hex'), name, salt, hash: L.hashPw(pw, salt), at: Date.now() };
      await L.redis('HSET', 'sic:users', email, JSON.stringify(u));
    } else if (action === 'login') {
      if (!u) {
        if (!isTeacher) return L.json(res, 401, { error: 'EMAIL_NOT_FOUND' });
        const salt = crypto.randomBytes(16).toString('hex'); // ครูเข้าครั้งแรก: สร้างบัญชีให้
        u = { uid: 'u' + crypto.randomBytes(8).toString('hex'), name: String(b.name || '').trim().slice(0, 60) || email, salt, hash: L.hashPw(pw, salt), at: Date.now() };
        await L.redis('HSET', 'sic:users', email, JSON.stringify(u));
      } else {
        const a = Buffer.from(L.hashPw(pw, u.salt)), c = Buffer.from(u.hash);
        if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return L.json(res, 401, { error: 'INVALID_PASSWORD' });
      }
    } else return L.json(res, 400, { error: 'BAD_ACTION' });
    const role = isTeacher ? 'teacher' : 'player';
    L.json(res, 200, { token: L.sign({ uid: u.uid, email, role, exp: Date.now() + 30 * DAY }), uid: u.uid, email, name: u.name, role });
  } catch (e) { L.json(res, 500, { error: 'SERVER' }); }
};
