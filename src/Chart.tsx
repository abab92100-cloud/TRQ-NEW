/* ================================================================
   شارت احترافي — شموع يابانية + إطارات زمنية + منطقة الدخول (عن طريق) · منطقة الربح (أخضر) ·
   خط المتوسط · خط التصفية · السعر الحي
   ================================================================ */
import { useEffect, useRef, useState } from 'react';
import { S, chartKlines, fmtPx } from './engine';
declare global {
  interface Window {
    Capacitor?: any;
    webkitAudioContext?: any;
    __kingHb?: any;
    __KING_REMOTE?: string | null;
    __chartDbg?: any;
    __S?: any;
  }
}


const TFS = [
  { label: '1د', gran: 1 },
  { label: '5د', gran: 5 },
  { label: '15د', gran: 15 },
  { label: '1س', gran: 60 },
  { label: '4س', gran: 240 },
];
const MAX_CANDLES = 90;
const DATA_CAP = 220;
const kCache = {};
const cacheGet = k => { const e = kCache[k]; return e ? e.cs : []; }; // عرض فوري للكاش القديم عند التنقل ثم تحديث بالخلفية (load يجلب دائماً)
const cacheSet = (k, cs) => { kCache[k] = { at: Date.now(), cs }; };

export default function Chart() {
  const ref = useRef<any>(null);
  const [gran, setGran] = useState(1);
  const [viewN, setViewN] = useState(MAX_CANDLES);
  const [, forceDraw] = useState(0);
  const pinch = useRef<any>(null);
  const dataRef = useRef<any>({ key: '', candles: cacheGet(S.config.symbol + ':1'), loading: false, fails: 0 });

  useEffect(() => {
    let alive = true;
    const key = S.config.symbol + ':' + gran;
    /* عدّاد مستقل لكل فريم: الفريم السابق لا يشاركه علم التحميل فيمنع فريمًا
       جديدًا من الجلب أبدًا، وإنهاؤه المتأخر كان يمحو بيانات الفريم الحالي —
       هذا هو سبب «يتحمل فريم وينتقل لفريم ثاني يرفض التحميل» */
    const st = { loading: false, fails: 0 };
    dataRef.current = { key, candles: cacheGet(key), loading: false, fails: 0 };
    const t=setTimeout(()=>forceDraw(n => n + 1),0);
    const load = () => {
      if (st.loading) return;
      st.loading = true;
      /* v1.1.10: الشموع تُجلب عبر السيرفر المحلي (كاش مشترك + أولوية +
         نسخة قديمة عند رفض المنصة) — انتقال الفريم والعملة صار فورياً
         بدل انتظار ظهر عاصفة الحصص على شبكة الجوال مباشرة */
      chartKlines(S.config.symbol, gran).then(k => {
        if (!alive) return;
        st.loading = false;
        if (!k.length) throw new Error('empty');
        const cs = k.slice(-DATA_CAP);
        cacheSet(key, cs);
        dataRef.current = { key, candles: cs, loading: false, fails: st.fails, at: Date.now() };
        if (typeof window !== 'undefined') window.__chartDbg = { key, n: cs.length, first: cs[0] && cs[0].t, last: cs.length && cs[cs.length - 1].t, at: Date.now() };
        forceDraw(n => n + 1);
      }).catch(() => {
        if (!alive) return;
        st.loading = false; st.fails++;
        const wait = Math.min(20000, 2500 * Math.pow(2, Math.max(0, st.fails - 1)));
        setTimeout(() => { if (alive) load(); }, wait);
      });
    };
    load();
    const iv = setInterval(load, 15000);
    return () => { alive = false; clearTimeout(t); clearInterval(iv); };
  }, [S.config.symbol, gran]);

  const drawRaf = useRef<any>(null);
  const drawNow = () => {
    const cv = ref.current; if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const AXIS = 58, TOP = 6, BOT = 16;
    const plotW = W - AXIS - 8, plotH = H - TOP - BOT;

    const wantKey = S.config.symbol + ':' + gran;
    const keyOk = dataRef.current.key === wantKey;
    let candles = keyOk ? dataRef.current.candles.slice(-viewN) : [];
    const granMs = gran * 60000;
    const p = keyOk ? S.lastPrice : 0;
    if (candles.length && p > 0) {
      const nowStart = Math.floor(Date.now() / granMs) * granMs;
      const last = candles[candles.length - 1];
      const dev = last.c > 0 ? Math.abs(p - last.c) / last.c : 1;
      const fresh = nowStart - last.t <= granMs * 2;
      if (dev <= 0.03 && fresh) {
        if (last.t === nowStart) {
          candles = candles.slice(0, -1).concat([{ ...last, c: p, h: Math.max(last.h, p), l: Math.min(last.l, p) }]);
        } else if (nowStart > last.t) {
          candles.push({ t: nowStart, o: last.c, h: Math.max(last.c, p), l: Math.min(last.c, p), c: p, v: 0 });
        }
      }
    }
    if (candles.length < 2) {
      x.fillStyle = '#5b6a7d'; x.font = '11px Tahoma'; x.textAlign = 'center';
      const fails = dataRef.current.fails || 0;
      x.fillText(fails >= 2 ? 'تعذّر تحميل الشارت — يُعاد الاتصال تلقائيًا…' : 'يُحمَّل الشارت…', W / 2, H / 2); return;
    }

    let lo = Infinity, hi = -Infinity;
    for (const k of candles) { if (k.l < lo) lo = k.l; if (k.h > hi) hi = k.h; }
    if (p) { const mid = (lo + hi) / 2; if (mid > 0 && Math.abs(p - mid) / mid <= 0.03) { lo = Math.min(lo, p); hi = Math.max(hi, p); } }
    const pad = (hi - lo) * 0.06 || hi * 0.002 || 1;
    lo -= pad; hi += pad;
    const inRange = v => v > 0 && v >= lo && v <= hi;
    const avg = S.position && inRange(S.position.entry) ? S.position.entry : null;
    let liq = S.liqPrice || (S.position && S.position.liquidation) || null;
    if (liq && !inRange(liq)) liq = null;
    const py = v => TOP + (hi - v) / (hi - lo) * plotH;
    const px = i => 4 + i * (plotW - 8) / (candles.length - 1);

    x.font = '9px ui-monospace,monospace'; x.textAlign = 'left';
    const ticks = 5;
    for (let i = 0; i < ticks; i++) {
      const v = hi - (hi - lo) * i / (ticks - 1);
      const y = py(v);
      x.strokeStyle = 'rgba(35,44,58,.7)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(4, y); x.lineTo(W - AXIS, y); x.stroke();
      x.fillStyle = '#5b6a7d';
      x.fillText(fmtPx(v), W - AXIS + 4, y + 3);
    }

    const cw = Math.max(1, (plotW - 8) / candles.length * 0.62);
    for (let i = 0; i < candles.length; i++) {
      const k = candles[i], up = k.c >= k.o, col = up ? '#22c55e' : '#f43f5e';
      const cx = px(i);
      x.strokeStyle = col; x.lineWidth = 1;
      x.beginPath(); x.moveTo(cx, py(k.h)); x.lineTo(cx, py(k.l)); x.stroke();
      x.fillStyle = col;
      const yO = py(k.o), yC = py(k.c);
      x.fillRect(cx - cw / 2, Math.min(yO, yC), cw, Math.max(1, Math.abs(yC - yO)));
    }

    const hline = (v, col, dash, label) => {
      if (!v || v <= 0) return;
      const y = py(v);
      x.strokeStyle = col; x.lineWidth = 1.1; x.setLineDash(dash);
      x.beginPath(); x.moveTo(4, y); x.lineTo(W - AXIS, y); x.stroke(); x.setLineDash([]);
      x.font = '8.5px Tahoma';
      const txt = (label ? label + ' ' : '') + fmtPx(v);
      const tw = x.measureText(txt).width + 8;
      x.fillStyle = col; x.fillRect(W - AXIS - tw - 4, y - 8, tw, 15);
      x.fillStyle = '#0a0e14'; x.textAlign = 'center';
      x.fillText(txt, W - AXIS - tw / 2 - 4, y + 3);
    };
    if (liq) hline(liq, '#f43f5e', [6, 3], 'التصفية');
    if (avg) hline(avg, '#f59e0b', [1, 0], 'المتوسط');
    if (p) hline(p, p >= candles[0].o ? '#22c55e' : '#f43f5e', [4, 3], '');

    x.fillStyle = '#5b6a7d'; x.font = '9px ui-monospace,monospace';
    const ft = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    x.textAlign = 'left'; x.fillText(ft(candles[0].t), 6, H - 4);
    x.textAlign = 'right'; x.fillText(ft(candles[candles.length - 1].t), W - AXIS - 4, H - 4);
  
  };
  useEffect(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    /* v1.1.10 تخفيف ثقل الشارت: رسم واحد لكل إطار عرض (rAF) مهما
       تكررت نبضات الحالة داخله — بدل رسم كامل مع كل تحديث */
    if (drawRaf.current) return;
    drawRaf.current = (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (f: any) => setTimeout(f, 16))(() => {
      drawRaf.current = null;
      try { drawNow(); } catch (e) { }
    });
  });
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, direction: 'ltr', justifyContent: 'flex-end' }}>
        {TFS.map(tf => (
          <button key={tf.gran} onClick={() => setGran(tf.gran)}
            style={{
              background: gran === tf.gran ? 'var(--accent-dim)' : 'var(--surface2)',
              border: '1px solid ' + (gran === tf.gran ? 'var(--accent)' : 'var(--border)'),
              color: gran === tf.gran ? 'var(--accent)' : 'var(--muted)',
              borderRadius: 8, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}>{tf.label}</button>
        ))}
      </div>
      <canvas ref={ref}
        style={{ width: '100%', height: 240, display: 'block', touchAction: 'none' }}
        onTouchStart={e => { if (e.touches.length === 2) pinch.current = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), n: viewN }; }}
        onTouchMove={e => {
          if (pinch.current && e.touches.length === 2) {
            const nd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            if (nd > 10) setViewN(Math.max(15, Math.min(DATA_CAP, Math.round(pinch.current.n * pinch.current.d / nd))));
          }
        }}
        onTouchEnd={() => { pinch.current = null; }}
        onWheel={e => setViewN(c => Math.max(15, Math.min(DATA_CAP, c + (e.deltaY > 0 ? 6 : -6))))}
        onDoubleClick={() => setViewN(MAX_CANDLES)} />
      <div className="subtle" style={{ textAlign: 'center', fontSize: 9, marginTop: 2, opacity: .7 }}>قرّب بإصبعين لتوسيع الشارت · نقر مزدوج لإعادة ضبط</div>
      <DataStrip />
    </div>
  );
}

function DataStrip() {
  const entL = S.grid.filter(g => !g.reduceOnly && (g.status === 'armed' || g.status === 'open'));
  const tpL = S.grid.filter(g => g.reduceOnly && (g.status === 'armed' || g.status === 'open'));
  const avgOf = l => l.length ? l.reduce((s, g) => s + g.price, 0) / l.length : null;
  const items = [
    { label: 'الدخول', col: '#f59e0b', val: avgOf(entL), n: entL.length },
    { label: 'جني الربح', col: '#22c55e', val: avgOf(tpL), n: tpL.length },
    { label: 'المتوسط', col: '#f59e0b', val: S.position ? S.position.entry : null, n: 0 },
    { label: 'التصفية', col: '#f43f5e', val: S.liqPrice || (S.position && S.position.liquidation) || null, n: 0 },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 8 }}>
      {items.map(it => (
        <div key={it.label} style={{
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10,
        }}>
          <span style={{ color: it.col, fontWeight: 700 }}>{it.label}{it.n ? ' ×' + it.n : ''}</span>
          <b className="mono" style={{ color: it.val ? '#e6edf3' : 'var(--muted)', fontSize: 10.5 }}>
            {it.val ? fmtPx(it.val) : '—'}
          </b>
        </div>
      ))}
    </div>
  );
}
