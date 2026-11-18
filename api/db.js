// ที่เก็บข้อมูลห้อง/ผู้เล่น/สื่อการสอน (ต้องมีโทเค็น) เก็บเป็น Redis hash เดียว คีย์ = พาธ เช่น rooms/ABC123/m/city
// GET  /api/db?path=rooms|lessons  → ออบเจ็กต์ซ้อนกัน   POST /api/db {updates:{พาธ: สตริง|null}} → เขียนหลายพาธ (null = ลบ รวมพาธย่อย)
const L = require('./_lib');
const KEY = 'sic:data', MAX = 900 * 1024;
const OK = /^(rooms\/[\w-]{1,20}\/(m\/[\w-]{1,40}|p\/[\w-]{1,40}(\/[\w-]{1,40})?)|lessons\/[\w-]{1,40}\/d)$/;
function nest(all, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(prefix + '/')) continue;
    const ps = k.slice(prefix.length + 1).split('/'); let o = out;
    ps.slice(0, -1).forEach((p) => { o = o[p] = o[p] || {}; }); o[ps.at(-1)] = v;
  }
  return out;
}
module.exports = async (req, res) => {
  if (!L.configured()) return L.json(res, 503, { error: 'NOT_CONFIGURED' });
  const me = L.authed(req); if (!me) return L.json(res, 401, { error: 'UNAUTHORIZED' });
  try {
    if (req.method === 'GET') {
      const path = String((req.query && req.query.path) || '');
      if (path !== 'rooms' && path !== 'lessons') return L.json(res, 400, { error: 'BAD_PATH' });
      const all = L.hashToObj(await L.redis('HGETALL', KEY));
      return L.json(res, 200, nest(all, path));
    }
    if (req.method === 'POST') {
      const up = (await L.body(req)).updates;
      if (!up || typeof up !== 'object') return L.json(res, 400, { error: 'BAD_BODY' });
      const set = [], del = [], delPrefix = []; let skipped = 0;
      for (const [k, v] of Object.entries(up)) {
        const isLesson = k.startsWith('lessons/');
        if (v === null) { if (!/^rooms\/[\w-]{1,20}\/p\/[\w-]{1,40}$/.test(k) && !OK.test(k)) { skipped++; continue; } if (isLesson && me.role !== 'teacher') { skipped++; continue; } delPrefix.push(k); continue; }
        if (!OK.test(k) || typeof v !== 'string' || v.length > MAX) { skipped++; continue; }
        if (isLesson && me.role !== 'teacher') { skipped++; continue; } // เฉพาะครูแก้สื่อการสอน/เฉลยได้
        set.push(k, v);
      }
      if (delPrefix.length) { const keys = await L.redis('HKEYS', KEY); keys.forEach((k) => { if (delPrefix.some((p) => k === p || k.startsWith(p + '/'))) del.push(k); }); }
      if (set.length) await L.redis('HSET', KEY, ...set);
      if (del.length) await L.redis('HDEL', KEY, ...del);
      return L.json(res, 200, { ok: true, skipped });
    }
    L.json(res, 405, { error: 'METHOD' });
  } catch (e) { L.json(res, 500, { error: 'SERVER' }); }
};
