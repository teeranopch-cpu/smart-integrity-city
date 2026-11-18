/**
 * Smart Integrity City — ฐานข้อมูลบน Google Sheets + เก็บรูปใน Google Drive (Google Apps Script)
 * วิธีติดตั้งดูใน README.md หัวข้อ "ฐานข้อมูล Google Sheets"
 *  - ชีต "users"  : สมาชิก (อีเมล, uid, ชื่อ, salt, แฮชรหัสผ่าน, วันที่สมัคร)
 *  - ชีต "data"   : ห้อง/ผู้เล่น/คะแนน/สื่อการสอน แบบ key + ค่า (ค่ายาวถูกแบ่งเป็นหลายเซลล์)
 *  - รูปหลักฐาน  : อัปโหลดเข้าโฟลเดอร์ Drive ด้านล่าง
 */
var FOLDER_ID = '1ViODGAsJhyyravLc1_UqdbJQz-piMrZw'; // โฟลเดอร์ "ส่งรูปการเรียนรู้นอกห้องเรียน"
var DEFAULT_TEACHER_SHA256 = 'f9d9335d70b421c989cdd6aaae450adcefd67e73d336c2fc4547ad54a71911e8'; // TEACHER2026 (เปลี่ยนใน Script properties: TEACHER_CODE_SHA256)
var CHUNK = 45000, ROUNDS = 500, TOKEN_DAYS = 30, MAX_IMG = 6 * 1024 * 1024;
var KEY_OK = /^(rooms\/[\w-]{1,20}\/(m\/[\w-]{1,40}|p\/[\w-]{1,40}(\/[\w-]{1,40})?)|lessons\/[\w-]{1,40}\/d)$/;
var PLAYER_DEL = /^rooms\/[\w-]{1,20}\/p\/[\w-]{1,40}$/;

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function props_() { return PropertiesService.getScriptProperties(); }
function secret_() { var p = props_(), s = p.getProperty('AUTH_SECRET'); if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('AUTH_SECRET', s); } return s; }
// ใช้ได้ทั้งสคริปต์ที่ผูกกับชีต และสคริปต์เดี่ยว (script.new) — แบบเดี่ยวจะสร้างชีต "Smart Integrity City ข้อมูล" ให้เองครั้งแรก
function ss_() {
  var a = SpreadsheetApp.getActive(); if (a) return a;
  var p = props_(), id = p.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var n = SpreadsheetApp.create('Smart Integrity City ข้อมูล'); p.setProperty('SHEET_ID', n.getId()); return n;
}
function sheet_(name, header) { var ss = ss_(), sh = ss.getSheetByName(name); if (!sh) { sh = ss.insertSheet(name); if (header) sh.appendRow(header); } return sh; }
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function sha256_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hashPw_(pw, salt) { var h = salt + pw; for (var i = 0; i < ROUNDS; i++) h = sha256_(h + pw + salt); return h; }
function teacherHashes_() { return (props_().getProperty('TEACHER_CODE_SHA256') || DEFAULT_TEACHER_SHA256).split(',').map(function (s) { return s.trim(); }).filter(String); }
function sign_(payload) { var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload)); return body + '.' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret_())); }
function verify_(tok) {
  if (!tok || typeof tok !== 'string') return null;
  var p = tok.split('.'); if (p.length !== 2) return null;
  var want = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(p[0], secret_()));
  if (want !== p[1]) return null;
  try { var o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString()); return o.exp > Date.now() ? o : null; } catch (e) { return null; }
}
function ver_() { return +(props_().getProperty('VER') || 0); }

function doGet() { return out_({ ok: true, service: 'smart-integrity-city' }); }

function doPost(e) {
  try {
    var b = JSON.parse((e.postData && e.postData.contents) || '{}');
    switch (b.action) {
      case 'health': return out_({ ok: true, configured: true });
      case 'signup': case 'login': return out_(auth_(b));
    }
    var me = verify_(b.token); if (!me) return out_({ error: 'UNAUTHORIZED' });
    switch (b.action) {
      case 'ver': return out_({ ver: ver_() });
      case 'get': return out_(get_(String(b.path || '')));
      case 'update': return out_(update_(b.updates, me));
      case 'upload': return out_(upload_(b, me));
    }
    return out_({ error: 'BAD_ACTION' });
  } catch (err) { return out_({ error: 'SERVER' }); }
}

function auth_(b) {
  var email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) return { error: 'INVALID_EMAIL' };
  if (pw.length < 6 || pw.length > 200) return { error: 'WEAK_PASSWORD' };
  var isTeacher = teacherHashes_().indexOf(sha256_(pw)) >= 0, lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_('users', ['email', 'uid', 'name', 'salt', 'hash', 'createdAt']), rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues() : [], u = null;
    for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).toLowerCase() === email) { u = { uid: rows[i][1], name: rows[i][2], salt: rows[i][3], hash: rows[i][4] }; break; }
    var name = String(b.name || '').trim().slice(0, 60) || email;
    function create() { var salt = Utilities.getUuid().replace(/-/g, ''); u = { uid: 'u' + Utilities.getUuid().replace(/-/g, '').slice(0, 16), name: name, salt: salt, hash: hashPw_(pw, salt) }; sh.appendRow([email, u.uid, u.name, u.salt, u.hash, new Date().toISOString()]); }
    if (b.action === 'signup') {
      if (isTeacher) return { error: 'WEAK_PASSWORD' };
      if (u) return { error: 'EMAIL_EXISTS' };
      create();
    } else {
      if (!u) { if (!isTeacher) return { error: 'EMAIL_NOT_FOUND' }; create(); } // ครูเข้าครั้งแรก: สร้างบัญชีให้
      else if (hashPw_(pw, u.salt) !== u.hash) return { error: 'INVALID_PASSWORD' };
    }
    var role = isTeacher ? 'teacher' : 'player';
    return { token: sign_({ uid: u.uid, email: email, role: role, exp: Date.now() + TOKEN_DAYS * 864e5 }), uid: u.uid, email: email, name: u.name, role: role };
  } finally { lock.releaseLock(); }
}

// ----- ข้อมูล: ชีต data (คอลัมน์ A = key, B.. = ค่าที่แบ่งเป็นชิ้น ชิ้นละไม่เกิน 45,000 ตัวอักษร ขึ้นต้นด้วย "x" กันชีตตีความเป็นสูตร/ตัวเลข) -----
function dataSheet_() { return sheet_('data', ['key', 'value chunks...']); }
function rowValue_(row) { var s = ''; for (var i = 1; i < row.length; i++) if (row[i] !== '' && row[i] != null) s += String(row[i]).slice(1); return s; }
function chunks_(v) { var o = []; for (var i = 0; i < v.length; i += CHUNK) o.push('x' + v.slice(i, i + CHUNK)); if (!o.length) o.push('x'); return o; }

function get_(path) {
  if (path !== 'rooms' && path !== 'lessons') return { error: 'BAD_PATH' };
  var sh = dataSheet_(), n = sh.getLastRow(), res = {};
  if (n > 1) sh.getDataRange().getValues().slice(1).forEach(function (row) {
    var k = String(row[0]); if (k.indexOf(path + '/') !== 0) return;
    var ps = k.slice(path.length + 1).split('/'), o = res;
    for (var i = 0; i < ps.length - 1; i++) o = o[ps[i]] = o[ps[i]] || {};
    o[ps[ps.length - 1]] = rowValue_(row);
  });
  return { data: res, ver: ver_() };
}

function update_(up, me) {
  if (!up || typeof up !== 'object') return { error: 'BAD_BODY' };
  var sets = [], dels = [], skipped = 0;
  Object.keys(up).forEach(function (k) {
    var v = up[k], lesson = k.indexOf('lessons/') === 0;
    if (lesson && me.role !== 'teacher') { skipped++; return; } // เฉพาะครูแก้สื่อการสอน/เฉลยได้
    if (v === null) { if (PLAYER_DEL.test(k) || KEY_OK.test(k)) dels.push(k); else skipped++; return; }
    if (!KEY_OK.test(k) || typeof v !== 'string' || v.length > 2000000) { skipped++; return; }
    sets.push([k, v]);
  });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = dataSheet_(), n = sh.getLastRow(), keys = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [], idx = {};
    keys.forEach(function (k, i) { idx[k] = i + 2; });
    var maxW = sh.getMaxColumns(), adds = [];
    sets.forEach(function (kv) {
      var row = [kv[0]].concat(chunks_(kv[1]));
      if (row.length > maxW) { sh.insertColumnsAfter(maxW, row.length - maxW); maxW = row.length; }
      if (idx[kv[0]]) { while (row.length < maxW) row.push(''); sh.getRange(idx[kv[0]], 1, 1, maxW).setValues([row]); }
      else adds.push(row);
    });
    if (adds.length) { var w = Math.max.apply(null, adds.map(function (r) { return r.length; })); if (w > maxW) { sh.insertColumnsAfter(maxW, w - maxW); maxW = w; } adds.forEach(function (r) { while (r.length < maxW) r.push(''); }); sh.getRange(sh.getLastRow() + 1, 1, adds.length, maxW).setValues(adds); }
    if (dels.length) {
      var kill = []; keys.forEach(function (k, i) { if (dels.some(function (d) { return k === d || k.indexOf(d + '/') === 0; })) kill.push(i + 2); });
      kill.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
    }
    var ver = ver_() + 1; props_().setProperty('VER', String(ver));
    return { ok: true, ver: ver, skipped: skipped };
  } finally { lock.releaseLock(); }
}

// ----- อัปโหลดรูปหลักฐานเข้า Google Drive -----
function upload_(b, me) {
  var m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(b.dataUrl || ''));
  if (!m || m[2].length > MAX_IMG * 1.4) return { error: 'BAD_IMAGE' };
  var ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
  var label = String(b.name || 'evidence').replace(/[^\w฀-๿.-]+/g, '_').slice(0, 60);
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], label + '_' + Date.now() + '.' + ext);
  var file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); // เพื่อให้แสดงรูปในเว็บได้
  var id = file.getId();
  return { ok: true, id: id, url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000', view: file.getUrl() };
}
