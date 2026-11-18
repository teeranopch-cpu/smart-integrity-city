// เครื่องจำลอง Google Apps Script (SpreadsheetApp/Drive/Utilities ฯลฯ) แบบย่อ เพื่อรัน apps-script/Code.gs ในเครื่องทดสอบ
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
function create() {
  const sheets = {}, props = {}, files = [];
  const mkSheet = (name) => { const rows = []; let maxC = 26;
    const sh = { name, rows,
      appendRow(r) { rows.push(r.slice()); }, getLastRow: () => rows.length, getMaxColumns: () => maxC,
      insertColumnsAfter(n, k) { maxC += k; }, deleteRow(r) { rows.splice(r - 1, 1); },
      getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
      getRange(r, c, nr, nc) { nr = nr || 1; nc = nc || 1; return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (rows[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
        setValues: (vals) => vals.forEach((vr, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; vr.forEach((v, j) => { assert(String(v).length <= 50000, 'เซลล์ใหญ่เกิน 50,000 ตัวอักษร'); rows[r - 1 + i][c - 1 + j] = v; }); }) }; } };
    return sh; };
  const assert = require('assert');
  const sandbox = {
    console, JSON, Date, Math, String, Array, Object, Number, RegExp, Buffer,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent: () => t }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActive: () => ({ getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = mkSheet(n)) }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => [...crypto.createHash('sha256').update(s).digest()].map((b) => (b > 127 ? b - 256 : b)),
      computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (x) => (typeof x === 'string' ? Buffer.from(x) : Buffer.from(x.map((b) => b & 255))).toString('base64url'),
      base64DecodeWebSafe: (s) => [...Buffer.from(s, 'base64url')], base64Decode: (s) => [...Buffer.from(s, 'base64')],
      getUuid: () => crypto.randomUUID(), newBlob: (bytes, mime, name) => ({ bytes, mime, name, getDataAsString: () => Buffer.from(bytes.map((b) => b & 255)).toString() }),
    },
    DriveApp: { Access: { ANYONE_WITH_LINK: 'LINK' }, Permission: { VIEW: 'VIEW' }, getFolderById: (id) => ({ createFile: (blob) => { const f = { id: 'file' + (files.length + 1), folder: id, blob, sharing: null, setSharing(a, p) { this.sharing = a + '/' + p; }, getId() { return this.id; }, getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; } }; files.push(f); return f; } }) },
  };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), sandbox);
  return { doPost: (body) => JSON.parse(sandbox.doPost({ postData: { contents: body } }).getContent()), sheets, props, files };
}
module.exports = { create };
