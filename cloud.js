// เก็บข้อมูลสมาชิก/ห้อง/คะแนนใน Google Sheets และรูปใน Google Drive ผ่าน Google Apps Script (ดู apps-script/Code.gs)
// เปิดใช้เมื่อใส่ sheetsUrl ใน config.js และเซิร์ฟเวอร์ตอบ health ถ้าไม่ ระบบทำงานแบบเดิม (localStorage)
(function (root) {
  const url = () => (root.SIC_CONFIG && root.SIC_CONFIG.sheetsUrl) || '';
  let available = false;
  const enabled = () => available;
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };

  let A = null; try { A = JSON.parse(ls.get('sic_auth')); } catch (e) {}
  const saveA = () => (A ? ls.set('sic_auth', JSON.stringify(A)) : ls.del('sic_auth'));
  let shadow = {}; try { shadow = JSON.parse(ls.get('sic_shadow')) || {}; } catch (e) { shadow = {}; }
  const saveShadow = () => ls.set('sic_shadow', JSON.stringify(shadow));
  let status = 'idle', hooks = null, timer = null, busy = false, again = false, poll = null, snap = null;

  // Apps Script รับ POST แบบ text/plain (ไม่ต้อง preflight) และตอบ JSON
  async function call(action, payload, timeoutMs) {
    const c = typeof AbortController !== 'undefined' ? new AbortController() : null, t = c && timeoutMs ? setTimeout(() => c.abort(), timeoutMs) : null;
    try {
      const r = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: A && A.token }, payload)), signal: c ? c.signal : undefined });
      const j = await r.json();
      if (j && j.error) { if (j.error === 'UNAUTHORIZED' && A) { A = null; saveA(); } throw new Error(j.error); }
      return j;
    } finally { if (t) clearTimeout(t); }
  }
  async function detect() {
    if (!url() || typeof fetch === 'undefined') return false;
    try { const j = await call('health', {}, 8000); available = !!(j && j.ok && j.configured); } catch (e) { available = false; }
    return available;
  }
  async function auth(action, email, password, name) {
    const j = await call(action, { email, password, name });
    A = { token: j.token, uid: j.uid, email: j.email, name: j.name, role: j.role }; saveA(); return j;
  }
  const signUp = (email, pw, name) => auth('signup', email, pw, name);
  const signIn = (email, pw, name) => auth('login', email, pw, name);
  const upload = async (dataUrl, name) => call('upload', { dataUrl, name }, 60000);
  const thaiErr = (e) => {
    const m = String((e && e.message) || e);
    if (/EMAIL_EXISTS/.test(m)) return 'อีเมลนี้สมัครสมาชิกแล้ว';
    if (/INVALID_PASSWORD/.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (/EMAIL_NOT_FOUND/.test(m)) return 'ไม่พบบัญชีนี้ (กด "สมัครสมาชิกใหม่")';
    if (/WEAK_PASSWORD/.test(m)) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว';
    if (/INVALID_EMAIL/.test(m)) return 'รูปแบบอีเมลไม่ถูกต้อง';
    if (/NOT_CONFIGURED/.test(m)) return 'ยังตั้งค่าฐานข้อมูลไม่ครบ';
    if (/Failed to fetch|NetworkError|network|abort/i.test(m)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
    return 'เกิดข้อผิดพลาด: ' + m;
  };

// ===== ซิงก์ข้อมูล: ทุกฟิลด์เก็บเป็นสตริง JSON เพื่อเลี่ยงปัญหาอาร์เรย์/ค่าว่างของ Realtime Database =====
  // เทียบ 3 ทาง (ค่าในเครื่อง / ค่าที่ซิงก์ล่าสุด / ค่าบนเซิร์ฟเวอร์): แก้ในเครื่อง → ส่งขึ้น, แก้จากเครื่องอื่น → ดึงลง, ชนกัน → ค่าในเครื่องชนะ
  const js = (v) => (v === undefined ? undefined : JSON.stringify(v));
  function reconcile(path, R, getL, setL, push) {
    const Ls = js(getL()), S = shadow[path];
    if (R === undefined) { if (Ls !== undefined) { push[path] = Ls; shadow[path] = Ls; } return false; }
    if (S === undefined || Ls === S) { if (R !== Ls) { setL(JSON.parse(R)); shadow[path] = R; return true; } shadow[path] = R; return false; }
    if (Ls !== R) { push[path] = Ls; } shadow[path] = Ls; return false;
  }
  function syncFields(base, remoteObj, localObj, skip, push) {
    let changed = false;
    const keys = new Set([...Object.keys(remoteObj || {}), ...Object.keys(localObj).filter((k) => !skip.includes(k))]);
    keys.forEach((k) => { if (skip.includes(k)) return; if (reconcile(base + '/' + k, remoteObj ? remoteObj[k] : undefined, () => localObj[k], (v) => { localObj[k] = v; }, push)) changed = true; });
    return changed;
  }
  function applySnap(k, val) {
    if (!snap) return;
    const ps = k.split('/'), top = ps.shift(); let o = top === 'rooms' ? snap.R : snap.RL;
    for (let i = 0; i < ps.length - 1; i++) { if (val === null && !o[ps[i]]) return; o = o[ps[i]] = o[ps[i]] || {}; }
    if (val === null) delete o[ps[ps.length - 1]]; else o[ps[ps.length - 1]] = val;
  }
  async function syncOnce() {
    if (!enabled() || !A || !hooks) return;
    const DB = hooks.getDB(), push = {}, del = [];
    let changed = false;
    const v = (await call('ver', {})).ver;
    if (!snap || snap.ver !== v) { const [a, b] = await Promise.all([call('get', { path: 'rooms' }), call('get', { path: 'lessons' })]); snap = { ver: Math.max(a.ver, b.ver), R: a.data || {}, RL: b.data || {} }; }
    const R = snap.R, RL = snap.RL;
    // ห้อง
    for (const code of new Set([...Object.keys(R), ...Object.keys(DB.rooms)])) {
      const rr = R[code] || {}, rm = rr.m || {}, rp = rr.p || {};
      let lr = DB.rooms[code];
      if (!lr) { if (!rr.m) continue; lr = DB.rooms[code] = { code, players: [], log: [] }; changed = true; }
      if (syncFields('rooms/' + code + '/m', rm, lr, ['players'], push)) changed = true;
      const pids = new Set([...Object.keys(rp), ...lr.players.map((p) => p.id)]);
      for (const pid of pids) {
        let lp = lr.players.find((p) => p.id === pid);
        const base = 'rooms/' + code + '/p/' + pid;
        if (!lp) {
          if (Object.keys(shadow).some((k) => k.startsWith(base + '/'))) { // เคยซิงก์แล้วแต่หายไปในเครื่อง = ถูกลบ
            Object.keys(shadow).filter((k) => k.startsWith(base + '/')).forEach((k) => delete shadow[k]); del.push(base); continue;
          }
          lp = { id: pid }; lr.players.push(lp); changed = true;
        }
        if (syncFields(base, rp[pid] || null, lp, [], push)) changed = true;
      }
    }
    // สื่อการสอน (ส่งเฉพาะชุดที่ถูกแก้ไขจากค่าเริ่มต้น)
    const defStr = typeof DEFAULT_LESSON !== 'undefined' ? JSON.stringify(DEFAULT_LESSON) : null;
    for (const id of new Set([...Object.keys(RL), ...DB.lessons.map((l) => l.id)])) {
      let ll = DB.lessons.find((l) => l.id === id);
      const path = 'lessons/' + id + '/d', rs = RL[id] ? RL[id].d : undefined;
      if (ll && rs === undefined && shadow[path] === undefined && defStr && JSON.stringify(ll) === defStr) continue; // ยังเป็นค่าเริ่มต้น ไม่ต้องส่ง
      if (!ll) { ll = {}; DB.lessons.push(ll); }
      const idx = DB.lessons.indexOf(ll);
      if (reconcile(path, rs, () => (ll.id ? ll : undefined), (v) => { DB.lessons[idx] = v; }, push)) changed = true;
      else if (!ll.id) DB.lessons.splice(idx, 1);
    }
    const body = Object.assign({}, push); del.forEach((d) => { body[d] = null; });
    if (Object.keys(body).length) {
      const res = await call('update', { updates: body });
      for (const [k, val] of Object.entries(body)) applySnap(k, val); // ให้ snapshot ตรงกับที่เพิ่งส่ง
      if (snap && !res.skipped && res.ver === snap.ver + 1) snap.ver = res.ver; else snap = null; // ถ้าเซิร์ฟเวอร์ข้ามบางรายการ (เช่น ผู้เล่นแก้สื่อ) ก็ดึงค่าจริงใหม่ // มีคนอื่นเขียนแทรก → ดึงใหม่รอบหน้า
    }
    saveShadow();
    if (changed && hooks.onRemote) hooks.onRemote();
  }
  async function sync() {
    if (busy) { again = true; return; }
    busy = true; status = 'syncing';
    try { await syncOnce(); status = 'ok'; } catch (e) { status = /UNAUTHORIZED/.test(String(e.message)) ? 'denied' : 'offline'; }
    busy = false; if (hooks && hooks.onStatus) hooks.onStatus(status);
    if (again) { again = false; schedule(); }
  }
  function schedule() { if (!enabled() || !A) return; clearTimeout(timer); timer = setTimeout(sync, 700); }
  function start(h) {
    hooks = h; if (!enabled()) return;
    clearInterval(poll); poll = setInterval(() => { if (A && (typeof document === 'undefined' || !document.hidden)) sync(); }, 8000);
    if (A) sync();
  }
  function logout() { A = null; saveA(); snap = null; shadow = {}; ls.del('sic_shadow'); status = 'idle'; }

  root.SicCloud = { enabled, loggedIn: () => !!A, uid: () => A && A.uid, email: () => A && A.email, detect, signUp, signIn, upload, session: () => A, logout, sync, schedule, start, thaiErr, status: () => status };
  if (typeof module !== 'undefined') module.exports = root.SicCloud;
})(typeof window !== 'undefined' ? window : globalThis);
