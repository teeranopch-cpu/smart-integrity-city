// ตัวช่วยฝั่งเซิร์ฟเวอร์ (Vercel Serverless Functions) — ไม่ใช้แพ็กเกจเสริม
const crypto = require('crypto');
const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOK_ = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const SECRET = () => process.env.AUTH_SECRET;
// รหัสครู (SHA-256) ตั้งค่าเริ่มต้นเท่ากับใน data.js (TEACHER2026) เปลี่ยนได้ด้วยตัวแปร TEACHER_CODE_SHA256 (คั่นหลายค่าด้วย ,)
const TEACHER_HASHES = () => (process.env.TEACHER_CODE_SHA256 || 'f9d9335d70b421c989cdd6aaae450adcefd67e73d336c2fc4547ad54a71911e8').split(',').map((s) => s.trim()).filter(Boolean);
const configured = () => !!(URL_() && TOK_() && SECRET() && SECRET().length >= 16);

async function redis(...cmd) {
  const r = await fetch(URL_(), { method: 'POST', headers: { Authorization: 'Bearer ' + TOK_() }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('redis: ' + (j.error || r.status));
  return j.result;
}
const hashToObj = (a) => { if (!Array.isArray(a)) return a || {}; const o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return o; };

const b64 = (b) => Buffer.from(b).toString('base64url');
function sign(payload) { const body = b64(JSON.stringify(payload)); return body + '.' + crypto.createHmac('sha256', SECRET()).update(body).digest('base64url'); }
function verify(tok) {
  if (!tok || typeof tok !== 'string' || !SECRET()) return null;
  const [body, sig] = tok.split('.'); if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const authed = (req) => verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
async function body(req) { if (req.body && typeof req.body === 'object') return req.body; try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; } }

module.exports = { configured, redis, hashToObj, sign, verify, hashPw, sha256, authed, json, body, TEACHER_HASHES };
