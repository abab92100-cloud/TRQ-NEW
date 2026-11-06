(window as any).__FLEET_POLL_SLOW = false; // مزامنة الأسطول كل 1.2 ثانية (استجابة أسرع — طلب المالك 6 نوفمبر)
import { useEffect, useState } from 'react';
import {
  S, subscribe, initEngine, remoteSync, detectRemoteServer, startBot, pauseBot, stopBot, newCycle,
  saveKeys, clearKeys, saveCfg, equity, desk, pulseAge, fmtPx, fmtUsd, fmtTime,
  listContracts, effLevels, scanRadar, netIsDown, netDownSince,
} from './engine';
import { streamState } from './ws';
import Chart from './Chart';
declare global {
  interface Window {
    Capacitor?: any;
    webkitAudioContext?: any;
    __kingHb?: any;
    __ABKING_REMOTE?: string | null;
    __chartDbg?: any;
    __S?: any;
  }
}


function useEngine() {
  const [, setN] = useState(0);
  useEffect(() => {
    // جسّ سيرفر Termux أولاً: إن وُجد يعمل المحرك هناك ونصبح واجهة — بلا محرك محلي مزدوج
    (async () => { await detectRemoteServer().catch(() => false); initEngine(); })();
    const un:any = subscribe(() => setN(n => n + 1));
    return () => { if (typeof un === 'function') un(); };
  }, []);
}

/* ---------- أيقونات ---------- */
const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5 12 3l9 7.5V21h-6v-6h-6v6H3z"/></svg>,
  pos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 17V7m5 10V4m5 13v-7m5 7V9"/></svg>,
  jrnl: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>,
  set: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5-1z"/></svg>,
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  pause: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>,
  stop: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>,
  cycle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/></svg>,
  radar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/><path d="M12 12 18 6"/></svg>,
};

/* عرض اسم العملة بدون M suffix — SHIBUSDTM ← SHIB/USDT */
const dispSym = s => String(s || '').replace(/USDTM$/i, '/USDT').replace(/^XBT/i, 'BTC');

/* ---------- بحث عن اسم العملة ---------- */
function SymbolPicker({ value, onPick }) {
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { listContracts().then(setAll).catch(() => {}); }, []);
  const q = query.trim().toUpperCase();
  const matches = q
    ? all.filter(c => c.symbol.includes(q) || c.base.includes(q)).slice(0, 30)
    : all.slice(0, 12);
  return (
    <div style={{ position: 'relative' }}>
      <input className="field" value={open ? query : dispSym(value)}
        placeholder="ابحث باسم العملة… مثل BTC أو PEPE"
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }} />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4,
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
          maxHeight: 220, overflowY: 'auto', direction: 'ltr',
        }}>
          {matches.length ? matches.map(c => (
            <button key={c.symbol} onClick={() => { onPick(c.symbol); setOpen(false); setQuery(''); }}
              style={{
                display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 12px',
                background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
                color: c.symbol === value ? 'var(--accent)' : 'var(--fg)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'ui-monospace,monospace',
              }}>
              <span>{dispSym(c.symbol)}</span>
              <span style={{ color: 'var(--muted)', fontSize: 10 }}>{c.base}/USDT</span>
            </button>
          )) : <div className="subtle" style={{ textAlign: 'center', padding: 12 }}>لا نتائج — جرّب اسمًا آخر</div>}
          <button onClick={() => setOpen(false)}
            style={{ width: '100%', padding: 8, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
            إغلاق
          </button>
        </div>
      )}
    </div>
  );
}

const QUICK = ['XBTUSDTM','ETHUSDTM','SOLUSDTM','XRPUSDTM','DOGEUSDTM','PEPEUSDTM'];

/* ---------- حالة القناة ---------- */
function WsBar() {
  const st = streamState;
  const [now,setTick]=useState(()=>Date.now());
  useEffect(()=>{ const t=setInterval(()=>setTick(Date.now()),1000); return ()=>clearInterval(t); },[]);
  const silentMs = st.lastMsgAt ? now - st.lastMsgAt : null;
  const alive = st.connected && silentMs != null && silentMs < 5000;
  const netDown = netIsDown();
  return (
    <div>
    {netDown && (
      <div style={{ background:'rgba(244,63,94,.15)', border:'1px solid rgba(244,63,94,.5)', borderRadius:10, padding:'8px 12px', marginBottom:6, color:'#f43f5e', fontWeight:800, fontSize:12, textAlign:'center' }}>
        ⚠ انقطاع الاتصال بالشبكة {netDownSince()>0?('منذ '+netDownSince()+' ث'):'…'} — لا أوامر جديدة حتى عودة الشبكة
      </div>
    )}
    <div className="wsbar">
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className={'wsdot ' + (alive ? 'on' : st.connected ? 'on' : 'off')} />
        {st.connected ? 'قناة KuCoin متصلة — تدفق مستمر' : st.connecting ? 'جارٍ الاتصال بالقناة…' : 'القناة مقطوعة — إعادة اتصال تلقائية'}
      </span>
      <span className="mono">
        {silentMs != null && silentMs < 1000 ? silentMs + ' مللي ث' : pulseAge()}
        {st.reconnects > 0 ? ' · إعادات ' + st.reconnects : ''}
      </span>
    </div>
    </div>
  );
}

/* ---------- تنبيه السيرفر — المحرك الداخلي يتوقف في الخلفية ---------- */
function ServerBanner() {
  if ((window as any).__ABKING_REMOTE) return null; // السيرفر يعمل — وضع المرآة
  return (
    <div style={{ background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.5)', borderRadius:10,
      padding:'8px 12px', marginBottom:6, color:'#f59e0b', fontWeight:700, fontSize:11.5, textAlign:'center' }}>
      ⚠ لا يوجد سيرفر Termux — التطبيق يعمل بمحركه الداخلي وسيتوقف بالخلفية، ولن يظهر شريط الأساطيل.
      شغّل السيرفر من Termux (bash trg-setup.sh) ثم أعد فتح التطبيق
    </div>
  );
}

/* ---------- شريط الأساطيل فوق الشارت ---------- */
function FleetStrip() {
  const fleet = (S as any).fleet;
  const sel = ((window as any).__FLEET_SEL || 0) as number;
  if (!Array.isArray(fleet) || fleet.length === 0) return null;
  return (
    <div style={{ display:'flex', gap:6, overflowX:'auto', padding:'2px 0 8px', fontSize:12, alignItems:'center', WebkitOverflowScrolling:'touch' }}>
      <span className={'pill' + (sel ? '' : ' on')} title="عرض مدمج لكل المحركات — اضغط على أي أسطول لعرض شارته وبياناته"
        onClick={() => { (window as any).__FLEET_SEL = 0; remoteSync().catch(() => {}); }}
        style={{ flex:'0 0 auto', whiteSpace:'nowrap', cursor:'pointer', opacity: sel ? 0.55 : 1 }}>
        الأسطول كامل
      </span>
      {fleet.map((f: any, i: number) => (
        <span key={f.slot || i}
          className={'pill' + (f.position ? ' on' : f.running ? ' warn' : '')}
          title={'أسطول ' + (f.slot || (i + 1)) + ' — ' + (f.disp || '?') + ' — رصيد ' + (f.balance || 0) + '$ — اضغط لفتح شارته وبياناته'}
          onClick={() => { (window as any).__FLEET_SEL = (f.slot || i + 1); remoteSync().catch(() => {}); }}
          style={{ flex:'0 0 auto', whiteSpace:'nowrap', cursor:'pointer',
            outline: sel === (f.slot || i + 1) ? '2px solid #2ecc71' : 'none',
            outlineOffset: 1 }}>
          <i></i>{f.disp || '?'}
          {f.position ? <b style={{ color: (f.net || 0) >= 0 ? '#2ecc71' : '#f74d5d', marginInlineStart: 4 }}>
            {(f.net || 0) >= 0 ? '+' : ''}{(f.net || 0).toFixed(2)}</b> : null}
        </span>
      ))}
    </div>
  );
}

/* ---------- الرئيسية ---------- */
function HomeScreen() {
  const d = desk();
  const first = S.priceTrail[0];
  const chg = first > 0 && S.lastPrice ? ((S.lastPrice - first) / first) * 100 : 0;
  const net = S.position ? S.position.unrealized : 0;
  const [now,setTick]=useState(()=>Date.now());
  useEffect(()=>{ const t=setInterval(()=>setTick(Date.now()),5000); return ()=>clearInterval(t); },[]);
  const live = S.status === 'running' && S.lastTickAt && now - S.lastTickAt < 15000;
  const liqDangerNow = S.liqPrice && S.lastPrice &&
    (S.position && S.position.side === 'long' ? S.lastPrice <= S.liqPrice * 1.05 : S.lastPrice >= S.liqPrice * 0.95);
  return (
    <section>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ textAlign: 'left' }}>
            <div className="subtle">{S.config.displaySymbol}/USDT · ×{S.config.leverage}</div>
            <div className="mono muted" style={{ fontSize: 11 }}>Mark <span>{fmtPx(S.markPrice)}</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={'big ' + (S.priceTrail.length > 1 ? (S.lastPrice >= S.priceTrail[0] ? 'up' : 'dn') : '')}>
              {S.lastPrice ? fmtPx(S.lastPrice) : '—'}
            </div>
            <div className={'mono ' + (chg >= 0 ? 'up' : 'dn')} style={{ fontSize: 12 }}>
              {(chg >= 0 ? '+' : '') + chg.toFixed(2) + '%'}
            </div>
          </div>
        </div>
        <ServerBanner />
        <FleetStrip />
        <Chart />
        <WsBar />
        <div className="subtle" style={{ textAlign: 'center', marginTop: 4 }}>
          {'آخر نبض: ' + pulseAge() + ' · نبضة #' + S.heartbeat}
        </div>
      </div>

      <div className="card">
        <div className="row">
          <span className={'mono ' + (S.biasScore >= 0 ? 'up' : 'dn')} style={{ fontSize: 12 }}>{fmtUsd(S.biasScore, 1)}</span>
          <b>{(S.regime ? S.regime.label : 'يُقرأ السوق…') + ' → ' + (S.config.direction === 'short' ? 'شورت' : 'لونغ')}</b>
        </div>
        <div className="subtle" style={{ marginTop: 2 }}>{(S.biasReasons || []).join(' · ')}</div>
      </div>

      <div className="grid4">
        <button className="btn acc" onClick={startBot}>{I.play}تشغيل</button>
        <button className="btn" onClick={pauseBot}>{I.pause}مؤقت</button>
        <button className="btn dgr" onClick={() => { if (window.confirm('سيتم إقفال كل الصفقات فوراً بسعر السوق وإيقاف الأسطول كاملاً. متابعة؟')) stopBot(); }}>{I.stop}إيقاف</button>
        <button className="btn" onClick={() => { if (window.confirm('دورة جديدة: تُقفل الصفقات فوراً، تُمسح السجلات، يُحتسب رصيد المنصة الحالي، وتبدأ دراسة جديدة قبل أي دخول. متابعة؟')) newCycle(); }}>{I.cycle}دورة</button>
      </div>
      <div className="subtle" style={{ textAlign: 'center', margin: '8px 0 12px' }}>
        {S._holdAfterHarvest ? '⏸️ مؤقت: الصفقات الحالية تُدار حتى جنيها ثم يتوقف كل أسطول'
          : S.status === 'paused' ? 'مؤقت: لا صفقات جديدة — الجني مستمر'
          : live ? 'البوت يتداول الآن على بيانات لحظية'
          : S.status === 'running' ? 'البوت شغّال — بانتظار النبض'
          : 'اضغط تشغيل لبدء البوت'}
      </div>

      <div className="grid3">
        <div className="chip"><small>الرافعة</small><b>{'×' + S.config.leverage}</b></div>
        <div className="chip"><small>المستويات</small><b>{effLevels()}{effLevels() !== S.config.levels ? <span style={{ opacity: .55, fontSize: 10 }}> /{S.config.levels}</span> : null}</b></div>
        <div className="chip"><small>رصيد الدورة</small><b>{'$' + S.config.cycleBalance}</b></div>
        <div className="chip"><small>خطوة الشبكة %</small><b>{S.config.gridStepPct}</b></div>
        <div className="chip"><small>صيد %</small><b>{S.config.huntPct}</b></div>
        <div className="chip"><small>الاتجاه</small><b>{S.config.directionMode === 'auto' ? 'تلقائي' : (S.config.direction === 'short' ? 'شورت' : 'لونغ')}</b></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="grid3" style={{ textAlign: 'center' }}>
          <div><small className="subtle">حقوق الدورة</small><div className="mono up">{'$' + equity().toFixed(2)}</div></div>
          <div><small className="subtle">صافي المركز الحالي</small><div className={'mono ' + (net > 0 ? 'up' : net < 0 ? 'dn' : '')}>{fmtUsd(net) + ' $'}</div></div>
          <div><small className="subtle">الربح المجنى</small><div className={'mono ' + ((S.cycleHarvested || 0) > 0 ? 'up' : (S.cycleHarvested || 0) < 0 ? 'dn' : '')}>{fmtUsd(S.cycleHarvested || 0) + ' $'}</div></div>
          <div><small className="subtle">التصفية</small><div className={'mono ' + (liqDangerNow ? 'dn' : '')}>{S.liqPrice ? fmtPx(S.liqPrice) : '—'}</div></div>
        </div>
        <div className="sep"></div>
        <div className="grid3" style={{ textAlign: 'center' }}>
          <div><small className="subtle">نجح</small><div className="mono up">{d.win.length}</div></div>
          <div><small className="subtle">خاسر</small><div className="mono dn">{d.lose.length}</div></div>
          <div><small className="subtle">مفتوح</small><div className="mono" style={{ color: 'var(--warn)' }}>{d.open.length}</div></div>
        </div>
        <div className="subtle" style={{ textAlign: 'center', marginTop: 8 }}>
          {'رسوم: $' + S.feesPaid.toFixed(2) + ' · مراكز مفتوحة: ' + d.open.length}
        </div>
      </div>
    </section>
  );
}

/* ---------- الرادار ---------- */
function RadarScreen() {
  const r = S.radar, list = r ? r.list : [];
  const intel = S.intel;
  const cur = list.find(l => l.symbol === S.config.symbol);
  const [busy, setBusy] = useState(false);
  const scan = async () => { setBusy(true); try { await scanRadar(); } finally { setBusy(false); } };
  return (
    <section>
      <div className="card">
        <div className="row">
          <b>📡 رادار الفرص</b>
          <button className="btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={scan} disabled={busy}>
            {busy ? 'يمسح…' : 'مسح الآن'}
          </button>
        </div>
        <div className="subtle" style={{ marginTop: 4 }}>
          {r ? 'آخر مسح: ' + fmtTime(r.at) + ' — يُحدَّث تلقائيًا كل 3 دقائق' : 'لم يُمسح بعد — اضغط «مسح الآن»'}
        </div>
        {cur ? (
          <div className="row" style={{ marginTop: 8 }}>
            <span>العملة الحالية <b>{cur.disp}</b></span>
            <span className="badge g">{cur.grade} {cur.score}</span>
          </div>
        ) : null}
      </div>
      {intel ? (
        <div className="card">
          <div className="row"><b>🧠 استخبارات التمويل والمركزات المفتوحة</b>
            <span className="subtle">{fmtTime(intel.at)}</span></div>
          {intel.squeeze && intel.squeeze.length ? (
            <div style={{ marginTop: 8, padding: '6px 8px', border: '1px solid #f87171', borderRadius: 8 }}>
              <b style={{ color: '#f87171' }}>🔥 انضغاط لونغ (تمويل مرتفع + صعود قوي)</b>
              {intel.squeeze.map((f: any) =>
                <div className="orow" key={f.symbol}><span>{f.disp}</span><span className="mono">{f.fundAnnPct}% · {f.chgPct}%</span></div>
              )}
            </div>
          ) : null}
          <div className="olist" style={{ marginTop: 8 }}>
            {list.slice(0, 40).map((l: any) => (
              <div className="orow" key={l.symbol} onClick={() => { saveCfg({ symbol: l.symbol }); }}
                style={{ cursor: 'pointer', borderRight: l.symbol === S.config.symbol ? '3px solid var(--accent)' : 'none' }}>
                <span style={{ fontWeight: 700 }}>{l.disp}</span>
                <span className="mono" style={{ color: (l.chgPct || 0) >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                  {(l.chgPct >= 0 ? '+' : '') + (l.chgPct || 0).toFixed(1)}%
                </span>
                <span className={'badge ' + (l.grade === 'A' ? 'b' : l.grade === 'B' ? 'w' : 'g')}>{l.grade} {l.score}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ---------- المراكز ---------- */
function PosScreen() {
  const g = (S.grid || []).filter(l => l.status === 'open' || l.status === 'armed');
  const pos = S.position;
  return (
    <section>
      <div className="card">
        <h3>المركز الحالي</h3>
        {pos ? (
          <div>
            <div className="row"><b className={pos.side === 'long' ? 'up' : 'dn'}>{pos.side === 'long' ? 'LONG' : 'SHORT'} {pos.disp || S.config.displaySymbol}</b>
              <span className={'mono ' + ((pos.unrealized || 0) >= 0 ? 'up' : 'dn')} style={{ fontSize: 16, fontWeight: 800 }}>{fmtUsd(pos.unrealized)} $</span></div>
            <div className="subtle" style={{ marginTop: 4 }}>
              {'الدخول ' + fmtPx(pos.entry) + ' · الحجم ' + ((pos.qty != null ? pos.qty : pos.size) ?? '—') + ' · الرافعة ×' + (pos.leverage || S.config.leverage)}
            </div>
            <div className="subtle"> {'سعر التصفية: '}{S.liqPrice ? fmtPx(S.liqPrice) : '—'}</div>
          </div>
        ) : <div className="subtle" style={{ textAlign: 'center', padding: 14 }}>لا مركز مفتوح — البوت في انتظار فرصة الدخول</div>}
      </div>
      <div className="card">
        <h3>أوامر الشبكة ({g.length})</h3>
        <div className="olist">
          {g.length ? g.map(l => (
            <div className="orow" key={l.id}>
              <span className={l.reduceOnly ? 'dn' : (l.side === 'buy' ? 'up' : 'dn')}>
                {(l.reduceOnly ? 'CLOSE ' : l.side.toUpperCase()) + ' @ ' + fmtPx(l.price)}
              </span>
              <span className="mono">{l.qty}</span>
              <span className={'badge ' + (l.status === 'open' ? 'b' : 'w')}>{l.status}</span>
            </div>
          )) : <div className="subtle" style={{ textAlign: 'center', padding: 10 }}>لا أوامر معلّقة</div>}
        </div>
      </div>
    </section>
  );
}

/* ---------- السجل ---------- */
function JournalScreen() {
  const j = S.journal || [];
  return (
    <section>
      <div className="card">
        <h3>سجل الصفقات</h3>
        <div style={{ maxHeight: 340, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {j.length ? j.map(row => {
            const pnl = row.status === 'open'
              ? 0
              : row.pnl != null ? row.pnl
              : row.exitPrice ? ((row.side === 'short' ? 1 : -1) * (row.entry - row.exitPrice) * (row.multiplier || 1) * row.qty - (row.fees || 0)) : 0;
            return (
              <div className="log" key={row.id}>
                <span className={(pnl > 0 ? 'up' : pnl < 0 ? 'dn' : 'muted') + ' mono'}>{row.status === 'open' ? '—' : fmtUsd(pnl)}</span>
                <span>
                  {(row.symbol || S.config.displaySymbol) + ' · ' + row.source + ' · ' + (row.side === 'short' ? 'شورت' : 'لونغ') + ' · ' +
                    (row.status === 'open' ? 'مفتوحة' : 'مغلقة') + (row.mergedOrders > 1 ? ' · متوسط ×' + row.mergedOrders : '') + ' '}
                  <span className="subtle">{fmtTime(row.closedAt || row.openedAt)}</span>
                </span>
              </div>
            );
          }) : <div className="subtle" style={{ textAlign: 'center', padding: 14 }}>لا صفقات بعد</div>}
        </div>
      </div>
      <div className="card">
        <h3>سجل السيرفر</h3>
        <div style={{ maxHeight: 320, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {S.logs.length ? S.logs.map(l => (
            <div className="log" key={l.id}>
              <span className={l.kind === 'fill' ? 'lfill' : l.kind === 'error' ? 'lerr' : l.kind === 'recover' ? 'lrec' : 'muted'}>{l.text}</span>
              <span className="tm">{fmtTime(l.at)}</span>
            </div>
          )) : <div className="subtle" style={{ textAlign: 'center', padding: 10 }}>السجل فارغ</div>}
        </div>
      </div>
    </section>
  );
}

/* ---------- الإعدادات ---------- */
function SettingsScreen() {
  const c = S.config;
  const [apiKey, setApiKey] = useState(S.keys ? S.keys.apiKey : '');
  const [apiSecret, setApiSecret] = useState(S.keys ? S.keys.apiSecret : '');
  const [apiPass, setApiPass] = useState(S.keys ? S.keys.passphrase : '');
  const [symbol, setSymbol] = useState(c.symbol);
  const [lev, setLev] = useState(c.leverage);
  const [levels, setLevels] = useState(c.levels);
  const [step, setStep] = useState(c.gridStepPct);
  const [hunt, setHunt] = useState(c.huntPct);
  const [tpNet, setTpNet] = useState(c.tpNet ?? 0.12);
  const [tpUsd, setTpUsd] = useState<(number|string)>(c.tpUsd ?? 1);
  const [bal, setBal] = useState(c.cycleBalance);
  const [dirMode, setDirMode] = useState(c.directionMode);
  const [mode, setMode] = useState(c.mode);
  const [tone, setTone] = useState(S.sound ? (S.soundTone || 'soft') : 'mute');
  return (
    <section>
      <div className="card">
        <h3>مفاتيح KuCoin</h3>
        <p className="note">⚠️ أنشئ مفاتيحًا بصلاح을 «تداول فقط» بدون سحب. المفاتيح تُحفظ على جهازك فقط (مشفرة) ولا تُرسل لأي طرف ثالث.</p>
        <label className="lb">API Key</label>
        <input className="field" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="أدخل المفتاح" autoComplete="off" />
        <label className="lb">API Secret</label>
        <input className="field" type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="••••••" />
        <label className="lb">Passphrase</label>
        <input className="field" type="password" value={apiPass} onChange={e => setApiPass(e.target.value)} placeholder="••••••" />
        <div className="grid2" style={{ marginTop: 12 }}>
          <button className="btn acc" onClick={() => saveKeys({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), passphrase: apiPass.trim() })}>حفظ المفاتيح</button>
          <button className="btn dgr" onClick={() => { clearKeys(); setApiKey(''); setApiSecret(''); setApiPass(''); }}>حذف المفاتيح</button>
        </div>
        <div className="subtle" style={{ textAlign: 'center', marginTop: 8 }}>
          {S.keys
            ? (S.linkOk ? '✅ مربوط بالمنصة ••' + String(S.keys.apiKey).slice(-4) : '⏳ محاولة — جارٍ التحقق من المنصة…')
            : 'غير مربوط'}
        </div>
        {S.keys && S.exEquity != null && (
          <div style={{ textAlign: 'center', marginTop: 6, fontWeight: 800, color: 'var(--accent)', fontSize: 15 }}>
            الرصيد الكلي في المنصة: ${S.exEquity.toFixed(2)}
          </div>
        )}
        {S.keys && !S.linkOk && S.exEquity == null && (
          <div className="subtle" style={{ textAlign: 'center', marginTop: 4, color: '#f43f5e', fontSize: 10 }}>
            تعذّر الوصول للمنصة — تحقّق من المفاتيح والصلاحيات، يُعاد المحاولة تلقائيًا كل 20 ثانية
          </div>
        )}
        {S.permDenied && (
          <div className="note" style={{ border: '1px solid rgba(244,63,94,.5)', borderRadius: 10, padding: 10, marginTop: 8, color: '#f43f5e', background: 'rgba(244,63,94,.08)' }}>
            ⛔ المفتاح يقرأ الرصيد لكنه بلا صلاحية تداول — من KuCoin ← إدارة API ← تعديل المفتاح ← فعّل «التداول» (Trade) ثم «حفظ المفاتيح» من جديد.
          </div>
        )}
        <div className="sep"></div>
        <p className="note">✅ الاتصال يمر عبر بروكسي محلي مدمج — لا حاجة لبروكسي خارجي. البيانات اللحظية تصل عبر WebSocket مباشرة.</p>
      </div>

      <div className="card">
        <h3>معاملات البوت</h3>
        <label className="lb">العملة — ابحث باسم أي عملة في المنصة</label>
        <SymbolPicker value={symbol} onPick={setSymbol} />
        <div className="symrow">
          {QUICK.map(s => (
            <button key={s} className={symbol === s ? 'on' : ''} onClick={() => setSymbol(s)}>{s.replace('USDTM', '').replace(/^XBT$/, 'BTC')}</button>
          ))}
        </div>
        <div className="grid2">
          <div><label className="lb">الرافعة</label><input className="field" inputMode="numeric" value={lev} onChange={e => setLev(e.target.value)} /></div>
          <div><label className="lb">المستويات</label><input className="field" inputMode="numeric" value={levels} onChange={e => setLevels(e.target.value)} /></div>
          <div><label className="lb">خطوة الشبكة %</label><input className="field" inputMode="decimal" value={step} onChange={e => setStep(e.target.value)} /></div>
          <div><label className="lb">صيد %</label><input className="field" inputMode="decimal" value={hunt} onChange={e => setHunt(e.target.value)} /></div>
          <div><label className="lb">جني $ — لم يعد مستخدمًا (الهدف نسبي تلقائي v1.1.7)</label><input className="field" inputMode="decimal" value={tpNet} onChange={e => setTpNet(e.target.value)} /></div>
          <div><label className="lb">🎯 الهدف النسبي التلقائي (v1.1.7): نسبة من الحجم المنفذ + حد أدنى 3× العمولة</label><input className="field" inputMode="decimal" value={tpUsd} onChange={e => setTpUsd(e.target.value)} placeholder="تلقائي بالكامل — الحقل غير مستخدم" /></div>
          <div><label className="lb">رصيد الدورة $</label><input className="field" inputMode="decimal" value={bal} onChange={e => setBal(e.target.value)} /></div>
          <div>
            <label className="lb">الاتجاه</label>
            <select className="field" value={dirMode} onChange={e => setDirMode(e.target.value)}>
              <option value="auto">تلقائي — دراسة السوق</option>
              <option value="short">شورت ثابت</option>
              <option value="long">لونغ ثابت</option>
            </select>
          </div>
        </div>
        <label className="lb">الوضع</label>
        <select className="field" value={mode} onChange={e => setMode(e.target.value)}>
          <option value="paper">ورقي — محاكاة بدون أوامر حقيقية</option>
          <option value="live">حقيقي — أوامر على KuCoin</option>
        </select>
        <label className="lb">صوت التنبيه عند التنفيذ</label>
        <div className="symrow">
          {[{ k: 'soft', l: 'هادئ' }, { k: 'bell', l: 'جرس' }, { k: 'alarm', l: 'تنبيه قوي' }, { k: 'mute', l: 'صامت' }].map(t => (
            <button key={t.k} className={tone === t.k ? 'on' : ''} onClick={() => setTone(t.k)}>{t.l}</button>
          ))}
        </div>
        <button className="btn acc" style={{ marginTop: 12, width: '100%' }}
          onClick={() => saveCfg({ symbol, leverage: lev, levels, gridStepPct: step, huntPct: hunt, tpNet, tpUsd, cycleBalance: bal, directionMode: dirMode, mode, sound: tone !== 'mute', soundTone: tone === 'mute' ? 'soft' : tone })}>
          حفظ المعاملات
        </button>
      </div>
    </section>
  );
}

/* ---------- الجذر ---------- */
export default function App() {
  useEffect(() => {
    // إعادة اتصال فورية عند العودة للتطبيق — نافذة «مقطوع منذ…» بعد رجوعك
    const resync = () => {
      remoteSync().catch(() => {});
      detectRemoteServer().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resync();
    });
    window.addEventListener('focus', resync);
    return () => window.removeEventListener('focus', resync);
  }, []);

  useEngine();
  const [tab, setTab] = useState('home');
  const [now,setToastTick]=useState(()=>Date.now());
  useEffect(()=>{ const t=setInterval(()=>setToastTick(Date.now()),1200); return ()=>clearInterval(t); },[]);
  const toast = S.toastMsg && now - S.toastMsg.at < 2600 ? S.toastMsg.text : null;
  const sel = ((window as any).__FLEET_SEL || 0) as number;
  return (
    <div>
      <header>
        <div className="logo">AB</div>
        <div className="t"><b>AB-210</b><span>TRQ</span></div>
        <span className={'pill ' + (streamState.connected ? 'on' : 'dn-pill')} title="حالة قناة السعر اللحظي">
          <i></i>{streamState.connected ? 'متصل' : 'مقطوع'} · {pulseAge()}
        </span>
        {window.__ABKING_REMOTE && (
          <span className="pill on" title="المحرك يعمل في سيرفر Termux على هذا الجوال — لا محرك محلي">سيرفر</span>
        )}
        <span className={'pill ' + (S.config.mode === 'live' ? 'live' : '')}>{S.config.mode === 'live' ? 'LIVE' : 'ورقي'}</span>
        <span className={'pill' + (S.status === 'running' ? ' on' : S.status === 'paused' ? ' warn' : '')}>
          <i></i><em style={{ fontStyle: 'normal' }}>
            {S.status === 'running' ? 'تداول' : S.status === 'paused' ? 'مؤقت' : S.status === 'stopped' ? 'متوقف' : 'متوقف'}
          </em>
        </span>
      </header>
      <main>
        {tab === 'home' && <HomeScreen />}
        {tab === 'radar' && <RadarScreen />}
        {tab === 'pos' && <PosScreen />}
        {tab === 'jrnl' && <JournalScreen />}
        {tab === 'set' && <SettingsScreen />}
      </main>
      <nav className="tabbar">
        <button data-tab="home" className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>{I.home}الرئيسية</button>
        <button data-tab="radar" className={tab === 'radar' ? 'on' : ''} onClick={() => setTab('radar')}>{I.radar}الرادار</button>
        <button data-tab="pos" className={tab === 'pos' ? 'on' : ''} onClick={() => setTab('pos')}>{I.pos}المراكز</button>
        <button data-tab="jrnl" className={tab === 'jrnl' ? 'on' : ''} onClick={() => setTab('jrnl')}>{I.jrnl}السجل</button>
        <button data-tab="set" className={tab === 'set' ? 'on' : ''} onClick={() => setTab('set')}>{I.set}الإعدادات</button>
      </nav>
      <div className={'toast' + (toast ? ' show' : '')}>{toast || ''}</div>
    </div>
  );
}
