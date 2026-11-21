// ตัวตรวจคำตอบเชิงความหมาย (ทดลอง): ใช้โมเดล embedding หลายภาษาที่รันในเบราว์เซอร์ผ่าน transformers.js ไม่ส่งคำตอบไปเซิร์ฟเวอร์ใด ๆ
// โหลดโมเดลครั้งแรกประมาณ 100+ MB (แคชในเบราว์เซอร์) จึงเป็นตัวเลือกที่ครูเปิดเอง ถ้าโหลดไม่ได้ ระบบใช้ตัวตรวจเดิมต่อ
(function (root) {
  const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';
  let embedder = null, loading = null, state = 'off', progress = 0, err = '';
  const cache = new Map();
  const enabled = () => { try { return localStorage.getItem('sic_sem') === '1'; } catch (e) { return false; } };
  const setEnabled = (on) => { try { localStorage.setItem('sic_sem', on ? '1' : '0'); } catch (e) {} };
  async function load(onProgress) {
    if (embedder) return embedder;
    if (loading) return loading;
    state = 'loading';
    loading = (async () => {
      const m = await import(CDN);
      m.env.allowLocalModels = false;
      const pipe = await m.pipeline('feature-extraction', MODEL, { dtype: 'q8', progress_callback: (p) => { if (p && typeof p.progress === 'number') { progress = p.progress; if (onProgress) onProgress(p.progress); } } });
      embedder = async (t) => Array.from((await pipe(t, { pooling: 'mean', normalize: true })).data);
      state = 'ready'; return embedder;
    })().catch((e) => { state = 'error'; err = String((e && e.message) || e); loading = null; throw e; });
    return loading;
  }
  async function embed(t) {
    const k = String(t); if (cache.has(k)) return cache.get(k);
    const v = await embedder(k); if (cache.size > 500) cache.clear(); cache.set(k, v); return v;
  }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  // cosine สูงสุดระหว่างคำตอบกับแนวคำตอบ (และคำตอบอื่นที่รับได้) ของข้อนั้น; null ถ้ายังไม่พร้อม
  async function similarity(text, q) {
    if (!embedder || !String(text || '').trim()) return null;
    const refs = [q.ans].concat(q.alts || []).filter(Boolean);
    const t = await embed(text), rv = await Promise.all(refs.map(embed));
    return Math.max.apply(null, rv.map((v) => dot(t, v)));
  }
  const api = { enabled, setEnabled, load, similarity, ready: () => !!embedder, status: () => ({ state, progress, err }), _setEmbedder: (fn) => { embedder = fn; state = 'ready'; cache.clear(); }, MODEL };
  root.SicSemantic = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
