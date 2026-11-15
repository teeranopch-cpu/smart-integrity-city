// ระบบ "ดูสด": ส่งสิ่งที่ผู้เรียนกำลังพิมพ์ให้ครู (BroadcastChannel ในเครื่องเดียวกัน + REST แบบ Firebase RTDB ข้ามเครื่อง)
(function (root) {
  const STALE_MS = 120000;
  const cid = (function () { try { let c = sessionStorage.getItem('sic_cid'); if (!c) { c = 'c' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('sic_cid', c); } return c; } catch (e) { return 'c' + Math.random().toString(36).slice(2, 10); } })();
  let bc = null; try { bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sic-live') : null; } catch (e) {}
  const local = {}; // ข้อมูลที่ได้รับผ่าน BroadcastChannel
  if (bc) bc.onmessage = (m) => { const d = m.data; if (d && d.id) { if (d.gone) delete local[d.id]; else local[d.id] = d; } };
  const dbUrl = () => ((root.SIC_CONFIG && root.SIC_CONFIG.liveDb) || '').replace(/\/+$/, '');
  let last = '', timer = null, pending = null;

  function send(state) { // state=null → ลบ
    const doc = state ? Object.assign({}, state, { id: cid, updatedAt: Date.now() }) : null;
    if (bc) bc.postMessage(doc || { id: cid, gone: true });
    const u = dbUrl(); if (!u || typeof fetch === 'undefined') return;
    fetch(u + '/sic/live/' + cid + '.json', doc ? { method: 'PUT', body: JSON.stringify(doc) } : { method: 'DELETE' }).catch(() => {});
  }
  // เรียกทุกครั้งที่ข้อความ/หน้าจอเปลี่ยน (หน่วงเพื่อลดจำนวนคำขอ)
  function publish(state, immediate) {
    const s = state ? JSON.stringify(state) : 'null';
    if (s === last) return;
    pending = state;
    if (immediate) { clearTimeout(timer); timer = null; last = s; send(state); return; }
    if (timer) return;
    timer = setTimeout(() => { timer = null; last = JSON.stringify(pending); send(pending); }, 500);
  }
  function heartbeat(state) { if (state) send(state); }
  async function fetchAll() {
    const out = Object.assign({}, local), u = dbUrl();
    if (u && typeof fetch !== 'undefined') {
      try { const r = await fetch(u + '/sic/live.json'); const j = await r.json(); if (j && typeof j === 'object') Object.assign(out, j); } catch (e) { out.__error = true; }
    }
    return out;
  }
  async function clearAll() { Object.keys(local).forEach((k) => delete local[k]); const u = dbUrl(); if (u) try { await fetch(u + '/sic/live.json', { method: 'DELETE' }); } catch (e) {} }
  const api = { cid, publish, heartbeat, fetchAll, clearAll, STALE_MS, mode: () => (dbUrl() ? 'remote' : 'local') };
  root.SicLive = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
