// เก็บข้อมูลสมาชิก/ห้อง/คะแนนไว้ใน Firebase (Authentication + Realtime Database) ผ่าน REST ไม่ต้องใช้ SDK
// เปิดใช้เมื่อใส่ firebase.apiKey และ firebase.databaseURL ใน config.js ถ้าไม่ใส่ ระบบทำงานแบบเดิม (localStorage)
(function (root) {
  const cfg = () => (root.SIC_CONFIG && root.SIC_CONFIG.firebase) || {};
  const enabled = () => !!(cfg().apiKey && cfg().databaseURL);
  const idHost = () => cfg().authHost || 'https://identitytoolkit.googleapis.com';
  const tokHost = () => cfg().tokenHost || 'https://securetoken.googleapis.com';
  const dbu = () => String(cfg().databaseURL || '').replace(/\/+$/, '');
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };

  let A = null; try { A = JSON.parse(ls.get('sic_auth')); } catch (e) {}
  const saveA = () => (A ? ls.set('sic_auth', JSON.stringify(A)) : ls.del('sic_auth'));
  let shadow = {}; try { shadow = JSON.parse(ls.get('sic_shadow')) || {}; } catch (e) { shadow = {}; }
  const saveShadow = () => ls.set('sic_shadow', JSON.stringify(shadow));
  let status = 'idle', hooks = null, timer = null, busy = false, again = false, poll = null;

  async function post(url, body, form) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'HTTP ' + r.status);
    return j;
  }
  function setAuth(j) {
    A = { uid: j.localId || j.user_id || (A && A.uid), email: j.email || (A && A.email), idToken: j.idToken || j.id_token, refreshToken: j.refreshToken || j.refresh_token, exp: Date.now() + (+(j.expiresIn || j.expires_in || 3600)) * 1000 - 60000 };
    saveA();
  }
  const signUp = async (email, pw) => setAuth(await post(idHost() + '/v1/accounts:signUp?key=' + cfg().apiKey, { email, password: pw, returnSecureToken: true }));
  const signIn = async (email, pw) => setAuth(await post(idHost() + '/v1/accounts:signInWithPassword?key=' + cfg().apiKey, { email, password: pw, returnSecureToken: true }));
  async function token() {
    if (!A) return null;
    if (Date.now() > A.exp) { try { setAuth(await post(tokHost() + '/v1/token?key=' + cfg().apiKey, { grant_type: 'refresh_token', refresh_token: A.refreshToken }, true)); } catch (e) { if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND|USER_DISABLED/.test(String(e.message))) { A = null; saveA(); } } }
    return A ? A.idToken : null;
  }
  async function rq(method, path, body) {
    const t = await token();
    const r = await fetch(dbu() + '/' + path + '.json' + (t ? '?auth=' + encodeURIComponent(t) : ''), { method, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error('DB ' + r.status);
    return r.json();
  }
  const thaiErr = (e) => {
    const m = String((e && e.message) || e);
    if (/EMAIL_EXISTS/.test(m)) return 'อีเมลนี้สมัครสมาชิกแล้ว';
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (/WEAK_PASSWORD/.test(m)) return 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัว)';
    if (/INVALID_EMAIL/.test(m)) return 'รูปแบบอีเมลไม่ถูกต้อง';
    if (/TOO_MANY_ATTEMPTS/.test(m)) return 'ลองหลายครั้งเกินไป กรุณารอสักครู่';
    if (/OPERATION_NOT_ALLOWED/.test(m)) return 'ยังไม่ได้เปิด Email/Password ใน Firebase Authentication';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'เชื่อมต่ออินเทอร์เน็ต/ฐานข้อมูลไม่ได้';
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
  async function syncOnce() {
    if (!enabled() || !A || !hooks) return;
    const DB = hooks.getDB(), push = {}, del = [];
    let changed = false;
    const [rrooms, rless] = await Promise.all([rq('GET', 'rooms'), rq('GET', 'lessons')]);
    const R = rrooms || {}, RL = rless || {};
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
    if (Object.keys(body).length) await rq('PATCH', '', body);
    saveShadow();
    if (changed && hooks.onRemote) hooks.onRemote();
  }
  async function sync() {
    if (busy) { again = true; return; }
    busy = true; status = 'syncing';
    try { await syncOnce(); status = 'ok'; } catch (e) { status = /DB 401|DB 403/.test(String(e.message)) ? 'denied' : 'offline'; }
    busy = false; if (hooks && hooks.onStatus) hooks.onStatus(status);
    if (again) { again = false; schedule(); }
  }
  function schedule() { if (!enabled() || !A) return; clearTimeout(timer); timer = setTimeout(sync, 700); }
  function start(h) {
    hooks = h; if (!enabled()) return;
    clearInterval(poll); poll = setInterval(() => { if (A && (typeof document === 'undefined' || !document.hidden)) sync(); }, 5000);
    if (A) sync();
  }
  async function profile(name, email) { await rq('PUT', 'users/' + A.uid, { name, email }); }
  async function profileGet() { try { return await rq('GET', 'users/' + A.uid); } catch (e) { return null; } }
  function logout() { A = null; saveA(); shadow = {}; ls.del('sic_shadow'); status = 'idle'; }

  root.SicCloud = { enabled, loggedIn: () => !!A, uid: () => A && A.uid, email: () => A && A.email, signUp, signIn, token, profile, profileGet, logout, sync, schedule, start, thaiErr, status: () => status };
  if (typeof module !== 'undefined') module.exports = root.SicCloud;
})(typeof window !== 'undefined' ? window : globalThis);
