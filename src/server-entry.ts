/* ================================================================
   AB-210-TRQ — سيرفر الأسطول للجوال (Termux)
   · المنسّق (بلا ABKING_SLOT): يُطلق 5 محركات مستقلة، كل عملية بمحركها
   · المحرك (ABKING_SLOT=1..5): نفس الملف على منفذ خاص به أثناء التشغيل:
     node trg-server.mjs   (المنسّق يُطلق 5 محركات تلقائيًا)
   الأمان:
   · /cmd تتطلب ترويسة X-TRQ-Token (توكن لكل تثبيت في ~/.ab-king بصلاحيات 0600)
   · المنسّق يمرر توكن الأسطول للمحركات عبر ABKING_FLEET_TOKEN
   · /state لا ترجع مفاتيح KuCoin (مقنّعة •••• + آخر 4) — CORS مقيّد لأصل التطبيق
   · السيرفر يستمع على 127.0.0.1 فقط (لا وصول خارجي)
   ================================================================ */
import './server-shims'; // أولاً دائمًا: يثبّت بيئة localStorage قبل تحميل المحرك
import {
  S, initEngine, startBot, pauseBot, stopBot, newCycle,
  saveCfg, saveKeys, clearKeys, scanRadar, pushLog, liveSync, repairAccount,
  strategyFingerprint, alignStrategy, gridStatus, ensureGroupFour, cancelEntryOrders, cleanStart, enableEntries, syncBooks,
  requestHalt, clearHalt, haltRequested, setFleetGate, resetState,
  fetchKlinesCached, sharedRadarApply,
} from './engine';

const SRV_VER = 'AB-210-TRQ-1.1.34';
const FLEET_N = 5;
const BASE_PORT = 9010;
const SLOT = parseInt(String((process.env as any).ABKING_SLOT || ''), 10) || 0;

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const maskedKeys = (k: any) => (k && k.apiKey ? { apiKey: '••••' + String(k.apiKey).slice(-4) } : null);
const TOK = String((typeof localStorage !== 'undefined' && localStorage.getItem('abking:token')) || '');
// توكن الأسطول: يمرره المنسّق للمحركات عند إطلاقها حتى تقبل أوامره (كانت تُرفض 403 قبلاً)
const FLEET_TOK = String((process.env as any).ABKING_FLEET_TOKEN || '');
/* أصل CORS الصحيح: قائمة مفصولة بفواصل غير صالحة كقيمة ACAO — المتصفح يرفضها.
   نرد بنفس أصل الطلب إن كان مسموحاً (تطبيق الجوال فقط) — لا نجيز أي أصل خارجي */
const ALLOWED_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost'];
const originFor = (req: any) => { const o = String(req.headers.origin || ''); return ALLOWED_ORIGINS.includes(o) ? o : 'capacitor://localhost'; };
const cmdAuth = (req: any) => {
  const h = String(req.headers['x-trq-token'] || '');
  return !!h && (h === TOK || (!!FLEET_TOK && h === FLEET_TOK));
};

function send(res, code, obj, req?: any) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': originFor(req || { headers: {} }),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-TRQ-Token',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}
async function jfetch(url, ms = 2500, payload?) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, payload ? { method: 'POST', signal: c.signal, headers: { 'Content-Type': 'application/json', 'X-TRQ-Token': String(FLEET_TOK || TOK || '') }, body: JSON.stringify(payload) } : { signal: c.signal });
    clearTimeout(t); return await r.json();
  } catch { clearTimeout(t); return null; }
}

const PORT = BASE_PORT + SLOT;

/* ─── v1.1.33 «صحيح» (شكوى المالك 10 نوفمبر: «البارحة أثناء النوم انقطع
   الاتصال تماما وانطفأ تطبيق السيرفر — صفقات معلقة»): أي استثناء غير
   ملتقط في Node يقتل المنسّق وكل المحرك معه فيصحو المستخدم على أسطول
   ميت وصفقات معلقة. الآن: الاستثناء يُسجَّل في السجل والعمل يستمر —
   موت السيرفر ليلاً أغلى بكثير من أي خطأ مسجّل. كذلك: إعادة اكتساب
   قفل اليقظة من داخل Node نفسه كل 5 دقائق — الحارس bash قد يموت مع
   جلسة Termux، وهذا المسار يبقى ما دام السيرفر حياً ─── */
process.on('uncaughtException', (e: any) => { try { console.error('[صحيح-نجاة] uncaughtException:', e && (e.stack || e)); } catch {} });
process.on('unhandledRejection', (e: any) => { try { console.error('[صحيح-نجاة] unhandledRejection:', e && (e.stack || e)); } catch {} });
setInterval(() => {
  try { spawn('/data/data/com.termux/files/usr/bin/termux-wake-lock', [], { stdio: 'ignore' }).on('error', () => {}); } catch {}
}, 5 * 60 * 1000).unref?.();

/* وضع المحرك (قطاعي من الأسطول) */
if (SLOT > 0) {
  pushLog('server', '✅ ' + SRV_VER + ' — محرك الأسطول رقم ' + SLOT + '/' + FLEET_N + ' — حصته رأس الأسطول ÷' + FLEET_N + ' تداولات — يبدأ العمل');
  let bootPickDone = false;
  const fleetSync = () => jfetch('http://127.0.0.1:' + BASE_PORT + '/fleet?i=' + SLOT).then(f => {
    if (f && Array.isArray(f.taken)) {
      S._fleetTaken = f.taken.map((t: any) => t.sym);
      if (!S.position && S.config.symbol) {
        const duel = f.taken.filter((t: any) => t.sym === S.config.symbol);
        if (duel.length) {
          const winner = Math.min(...duel.map((t: any) => Number(t.holder) || 99), SLOT);
          if (SLOT > winner) {
            const takenSet = new Set(f.taken.map((t: any) => t.sym));
            const cand = (S.radar && Array.isArray(S.radar.list) ? S.radar.list : [])
              .find((x: any) => x && x.symbol && !takenSet.has(x.symbol) && x.symbol !== S.config.symbol);
            if (cand) {
              pushLog('server', '⚖️ تعارض على ' + S.config.displaySymbol + ' مع المحرك ' + winner + ' — ينتقل هذا المحرك إلى ' + (cand.disp || cand.symbol));
              try { saveCfg({ symbol: cand.symbol, leverage: S.config.leverage, levels: S.config.levels,
                gridStepPct: S.config.gridStepPct, huntPct: S.config.huntPct, tpUsd: S.config.tpUsd,
                cycleBalance: S.config.cycleBalance, directionMode: S.config.directionMode, mode: S.config.mode }); } catch {}
              return;
            }
          }
        }
      }
      const clash = f.taken.find((t: any) => t.sym === S.config.symbol);
      if (clash && clash.holder < SLOT && !S.position) {
        /* ─── v1.1.19 (ملاحظة المالك 8 نوفمبر «أسطول واحد يعمل و4
           يتأرجحون بلا توقف»): كان هذا السطر يضبط _harvestAt=now — جني
           مزيف يفتح نافذة «القفز الفوري بعد الجني» كل 10 ثوانٍ فيقفز
           المحرك إلى عملة محرك آخر، يُقذف منها، ثم يقفز ثانية — تأرجح
           أبدي لا تسليح ولا صفقات. أُزيل: التنبيه وحده يكفي ─── */
        S._reselectDone = false;
        pushLog('server', '🚦 تنبيه الأسطول: العملة مشغولة بمحرك ' + clash.holder + ' — ينتظر عملات بديلة');
      }
    }
  }).catch(() => {});
  setTimeout(fleetSync, 2500);
  setInterval(fleetSync, 10000).unref?.();

  setTimeout(() => {
    liveSync().then(() => pushLog('server', '🔧 اكتملت مزامنة الحساب عند إغلاق المحرك ' + SLOT + ' — متطابق مع المنصة')).catch(() => {});
    scanRadar().catch(() => {});
  }, 1500 + SLOT * 300);
}

/* المنسّق: حالة كل المحركات — استعلام متوازٍ (لا حلقة await متتابعة) كل 2.5 ث
   + تحديث فوري عند الطلب: أي /state يعيد بيانات لا تزيد عن ثانية واحدة عمراً
   (طلب المالك 6 نوفمبر: استجابة التطبيق يجب أن تكون سريعة) */
const slotStates: any[] = [];
let _slotPollAt = 0;
async function pollSlots() {
  await Promise.all(Array.from({ length: FLEET_N }, async (_, i) => {
    const j = await jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/state', 1200);
    if (j && j.ok && j.state) slotStates[i + 1] = j.state;
  }));
  _slotPollAt = Date.now();
}
/* ─── v1.1.24 «صمود»: الاستقصاء الدوري للمنسّق وحده — كانت كل عملية
   (منسّق + 5 محركات) تستقصي المحركات الخمسة كل 2.5ث = 25 طلباً ثقيلاً
   في كل دورة لا تستخدمه المحركات إطلاقاً (ملكية العملة تُقرأ من /fleet
   في المنسّق) — حمل ضخم على جوال واحد هو أحد أسباب انقطاعات الاتصال ─── */
if (SLOT === 0) setInterval(() => { pollSlots().catch(() => { }); }, 2000).unref?.();

const STRAT_FIELDS = ['gridStepPct', 'levels', 'leverage', 'tpUsd', 'tpNet', 'huntPct', 'directionMode', 'hfMode'];
const alignFleetStrategy = async () => {
  const base: any = {}; let ref: any = null;
  for (let i = 1; i <= FLEET_N; i++) if (slotStates[i] && slotStates[i].config) { ref = slotStates[i].config; break; }
  if (!ref) return;
  for (const f of STRAT_FIELDS) if (ref[f] != null) base[f] = ref[f];
  for (let i = 1; i <= FLEET_N; i++) {
    const st = slotStates[i]; if (!st || !st.config) continue;
    const diff = STRAT_FIELDS.some(f => base[f] != null && st.config[f] !== base[f]);
    if (diff) { try { await jfetch('http://127.0.0.1:' + (BASE_PORT + i) + '/cmd', 8000, { action: 'alignStrategy', cfg: base }); } catch { } }
  }
};
setInterval(() => { alignFleetStrategy().catch(() => { }); }, 300000).unref?.();

async function broadcastFleetGate() {
  let opened = 0;
  for (let i = 1; i <= FLEET_N; i++) if (slotStates[i] && slotStates[i].position) opened++;
  await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
    jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 5000, { action: 'fleetGate', opened })));
}
setInterval(() => { broadcastFleetGate().catch(() => { }); }, 5000).unref?.();

/* ─── v1.1.10 رادار مشترك (درس عاصفة الحصص 429): كل مسح شامل = 61 نداء
   للمنصة — خمسة محركات تمسح كل دورة تُغرق عنوان الجهاز فتُحجب الطلبات
   كلها. الآن: أحدث مسح أنجزه أي محرك يُبَث للجميع (محلياً عبر localhost)،
   والمحرك الذي يصل لقراره يجد راداراً طازجاً (أقل من دقيقتين) فلا يمسح.
   النتيجة: مسح واحد كل دورة بدل خمسة — خُمس الطلبات ─── */
let _lastSharedRadarAt = 0;
async function shareRadar() {
  let best: any = null;
  for (let i = 1; i <= FLEET_N; i++) {
    const r = slotStates[i] && (slotStates[i] as any)._radarFull;
    if (r && r.list && r.list.length && r.at > 0 && (!best || r.at > best.at)) best = r;
  }
  if (!best || Date.now() - best.at > 180000) return;       // لا مسح طازج كافٍ
  if (best.at <= _lastSharedRadarAt) return;                 // بُث بالفعل
  _lastSharedRadarAt = best.at;
  await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
    jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 8000, { action: 'sharedRadar', radar: best }).catch(() => { })));
}
setInterval(() => { shareRadar().catch(() => { }); }, 30000).unref?.();

function mergedState(selIn = 0) {
  const live: any[] = [];
  for (let i = 1; i <= FLEET_N; i++) if (slotStates[i]) live.push(slotStates[i]);
  if (!live.length) return null;
  const idx = selIn >= 1 && selIn <= FLEET_N && slotStates[selIn] ? selIn : 0;
  const primary = idx ? slotStates[idx] : (live.find(x => x.position) || live[0]);
  const st: any = { ...primary };
  st.keys = maskedKeys(st.keys);
  st.token = TOK;
  st.journal = live.flatMap((x, li) => (x.journal || []).map((r: any) => ({
      ...r, _slot: li + 1,
      at: Number(r.closedAt || r.openedAt || r.filledAt || (typeof r.at === 'number' ? r.at : 0)) || 0,
    }))).sort((a, b) => b.at - a.at);
  const seenKeys = new Set<string>();
  st.journal = st.journal.filter((r: any) => {
    if (r.status !== 'closed') return true;
    const k = String(r.symbol || '') + '|' + String(r.side || '') + '|' + Math.round(Number(r.qty) || 0) + '|' + Math.floor((Number(r.closedAt) || Number(r.at) || 0) / 60000);
    if (seenKeys.has(k)) return false;
    seenKeys.add(k); return true;
  }).slice(0, 200);
  st.logs = (primary.logs || []).slice(-150);
  st.realizedPnl = live.reduce((a, x) => a + (x.realizedPnl || 0), 0);
  st.feesPaid = live.reduce((a, x) => a + (x.feesPaid || 0), 0);
  st.cycleHarvested = live.reduce((a, x) => a + (x.cycleHarvested || 0), 0);
  st.slipCost = live.reduce((a, x) => a + (x.slipCost || 0), 0);
  st.fundingPaid = live.reduce((a, x) => a + (x.fundingPaid || 0), 0);
  st.config = { ...(primary.config || {}), cycleBalance: live.reduce((a, x) => a + (x.config?.cycleBalance || 0), 0) };
  /* ─── v1.1.22 «ضخامة»: وضوح الرصيد (شكوى المالك «يتم تعديله تلقائياً إلى
     500$») — المجموع هو حقوق الحساب كاملاً موزعة على المحركات، والوحيدة
     المعروضة الآن: حقوق المنصة الحقيقية + حصة كل محرك (خُمس الحقوق) ─── */
  st.fleetShare = primary.config?.cycleBalance || 0;
  st.status = live.some(x => x.status === 'running') ? 'running' : (live[0]?.status || 'idle');
  st.fleet = live.map((x, idx) => ({
    slot: idx + 1, symbol: x.config?.symbol, disp: x.config?.displaySymbol,
    position: !!x.position, net: x.position ? x.position.unrealized : 0,
    balance: x.config?.cycleBalance, running: x.status === 'running',
  }));
  return st;
}

const srv = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': originFor(req),
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-TRQ-Token',
      });
      return res.end();
    }
    const u = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/health'))
      return send(res, 200, { ok: true, name: 'AB-210-TRQ Fleet Server', version: SRV_VER, fleet: FLEET_N,
        at: Date.now(), pid: (process as any).pid }, req);

    if (SLOT > 0) {
      if (req.method === 'GET' && u.pathname === '/state') {
        const lp=S.lastPrice||0, mult=S.multiplier||1, taker=S.takerFee||0.0006;
        const st: any={...S, keys: maskedKeys(S.keys), token: TOK, journal:(S.journal||[]).slice(-120).map((r:any)=>{
          if(r.status!=='open') return r;
          if(r.exPnl!==undefined&&r.exPnl!==null) return {...r, floatNet: Math.round((Number(r.exPnl))*100)/100};
          const rm=Number(r.mult)||mult;
          const rp=(r.symbol&&r.symbol.toUpperCase()===String(S.config.displaySymbol||'').toUpperCase())?lp:(Number(r.lastPx)||lp);
          const feeEst=rp? r.qty*rm*rp*taker:0;
          const f=rp? ((r.side==='short'?1:-1)*(r.entry-rp)*rm*r.qty-(r.fees||0)-feeEst):0;
          return {...r, floatNet: Math.round((f+Number.EPSILON)*100)/100}; }),
          logs:(S.logs||[]).slice(-80)};
        return send(res, 200, { ok: true, at: Date.now(), state: st }, req); }
      if (req.method === 'POST' && u.pathname === '/cmd') {
        if (!cmdAuth(req)) return send(res, 403, { ok: false, error: 'unauthorized' }, req);
        let body = '';
        for await (const chunk of req) body += chunk;
        let j: any = {};
        try { j = JSON.parse(body || '{}'); } catch{}
        const a = String(j.action || '');
        switch (a) {
          case 'start': startBot(); return send(res, 200, { ok: true }, req);
          case 'pause': await pauseBot(); return send(res, 200, { ok: true, hold: !!S._holdAfterHarvest }, req);
          case 'stop': await stopBot(); return send(res, 200, { ok: true }, req);
          case 'exEquity': return send(res, 200, { ok: true, eq: (S.exEquity != null ? S.exEquity : null), mode: S.config.mode, hasKeys: !!S.keys }, req);
          case 'newCycle': newCycle(); return send(res, 200, { ok: true }, req);
          case 'saveCfg': saveCfg(j.cfg || {}); return send(res, 200, { ok: true }, req);
          case 'saveKeys': {
            const ok = await saveKeys(j.keys || {});
            return send(res, 200, { ok: !!ok, error: ok ? null : 'فشل الاتصال بالمنصة — تحقّق من المفاتيح' }, req);
          }
          case 'clearKeys': clearKeys(); return send(res, 200, { ok: true }, req);
          case 'scanRadar': await scanRadar(); return send(res, 200, { ok: true, radar: S.radar || null }, req);
          case 'repair': { const rr = await repairAccount(); return send(res, 200, rr, req); }
          case 'alignStrategy': { const ch = alignStrategy(j.cfg||{}); return send(res, 200, { ok:true, changed:!!ch, fp:strategyFingerprint() }, req); }
          case 'fingerprint': return send(res, 200, { ok:true, fp:strategyFingerprint(), slot:SLOT }, req);
          case 'gridStatus': return send(res, 200, { ok:true, slot:SLOT, status:gridStatus() }, req);
          case 'cancelEntries': { const rr=await cancelEntryOrders(); return send(res,200,rr, req); }
          case 'cleanStart': { const rr=await cleanStart(); return send(res,200,rr, req); }
          case 'enableEntries': return send(res,200, enableEntries(), req);
          case 'syncBooks': return send(res,200, syncBooks(j.totalEq, j.share), req);
          case 'resetState': return send(res,200, resetState(), req);
          case 'fleetGate': return send(res,200, setFleetGate(j.opened, SLOT), req);
          case 'klines': { // v1.1.10: شموع الشارت عبر السيرفر — كاش مشترك + أولوية
            try { const ks = await fetchKlinesCached(String(j.symbol || S.config.symbol), Number(j.gran) || 15);
              return send(res, 200, { ok: true, klines: ks }, req); }
            catch (e: any) { return send(res, 200, { ok: false, error: String(e && e.message || e) }, req); } }
          case 'sharedRadar': return send(res, 200, { ok: sharedRadarApply(j.radar) }, req);
          case 'ensureFour': { const need=ensureGroupFour(); return send(res, 200, { ok:true, need }, req); }
          default: return send(res, 400, { ok: false, error: 'إجراء غير معروف: ' + a }, req);
        }
      }
      send(res, 404, { ok: false, error: 'not found' }, req);
      return;
    }

    /* المنسّق: assembly & dashboard */
    if (req.method === 'GET' && u.pathname === '/fleet') {
      /* ─── v1.1.27 «صاروخ» (شكوى المالك: «كل المحركات على عملة واحدة
         ولا أوامر»): ملكية العملة للأقدم رقماً فقط — الجثم الجماعي كان
         يحجز كل محرك جاثم (لا دخول لملكها) ولا يطرده أحد. الآن: كل
         عملة يملكها أدنى رقم محرك عليها، والمحركات الأعلى تراها
         محجوزة فتخليها فوراً لعملاتهم الخاصة ─── */
      const i = parseInt(u.searchParams.get('i') || '0', 10) || 0;
      const taken: any[] = [];
      const owners = new Map();
      for (let k = 1; k <= FLEET_N; k++) {
        const st = slotStates[k];
        const sym = st && st.config && st.config.symbol ? String(st.config.symbol) : '';
        if (!sym) continue;
        if (!owners.has(sym) || k < (owners.get(sym) as number)) owners.set(sym, k);
      }
      for (const [sym, holder] of owners) if (holder !== i) taken.push({ sym, holder });
      return send(res, 200, { ok: true, taken }, req);
    }

    if (req.method === 'GET' && u.pathname === '/state') {
      /* ─── v1.1.24 «صمود» (شكوى المالك «يفقد الاتصال بسيرفر»): طلب /state
         لم يعد ينتظر الاستقصاء أبداً — كان الرد قد يتأخر حتى 1.2ث إذا كان
         محرك منشغلاً بالدراسة، وطلبات التطبيق كل 1.2ث تتراكب فتنقلب
         الواجهة «مقطوع». الكاش يُجدَّد كل ثانيتين في الخلفية (أعلاه) —
         عمر البيانات الذي يراه التطبيق ≤ ثانيتان، والرد دائماً فوري ─── */
      const sel = parseInt(u.searchParams.get('sel') || '0', 10) || 0;
      const st = mergedState(sel);
      if (!st) return send(res, 200, { ok: true, at: Date.now(), token: TOK, state: { status: 'idle', heartbeat: Date.now(), logs: [], journal: [], grid: [], config: { cycleBalance: 0 }, fleet: [] } }, req);
      return send(res, 200, { ok: true, at: Date.now(), token: TOK, state: st }, req);
    }

    if (req.method === 'POST' && u.pathname === '/cmd') {
      if (!cmdAuth(req)) return send(res, 403, { ok: false, error: 'unauthorized' }, req);
      let body = '';
      for await (const chunk of req) body += chunk;
      let j: any = {};
      try { j = JSON.parse(body || '{}'); } catch{}
      const a = String(j.action || '');
      if (a === 'reconcileBooks') {
        const h:any = await jfetch('http://127.0.0.1:' + (BASE_PORT + 1) + '/cmd', 15000, { action: 'syncBooks', totalEq: j.totalEq, share: j.share });
        const eq = Number(j.totalEq) || 0, share = eq > 0 ? Math.round((eq / FLEET_N) * 100) / 100 : 0;
        const rs = await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
          jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 15000, { action: 'syncBooks', totalEq: eq, share })));
        return send(res, 200, { ok: true, equity: eq, share, results: rs }, req);
      }
      /* ─── المفاتيح الثلاثة (أمر المالك 6 نوفمبر) ───
         مؤقت  = كل محرك: الصفقات القائمة تُدار حتى جنيها ثم يتوقف، لا صفقات جديدة
         إيقاف = إقفال كل الصفقات فوراً بسعر السوق + إيقاف الأسطول كله
         دورة  = إغلاق + مسح السجلات + احتساب رصيد المنصة + بدء دورة جديدة بدراسة
         الاستجابة فورية في الجميع: البث يجري في الخلفية والتطبيق لا ينتظر (طلب المالك 6 نوفمبر) */
      if (a === 'stop' || a === 'pause' || a === 'start') {
        try { if (a === 'start') clearHalt(); } catch { }
        Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
          jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 25000, { action: a }))).catch(() => { });
        return send(res, 200, { ok: true, instant: true }, req);
      }
      if (a === 'newCycle') {
        if ((globalThis as any).__cycleBusy) return send(res, 200, { ok: true, busy: true }, req);
        (globalThis as any).__cycleBusy = true;
        try { clearHalt(); } catch { }
        (async () => {
          // 1) إقفال كل الصفقات فوراً (كما زر إيقاف) — دورة جديدة تبدأ مسطحة
          const stops = await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
            jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 25000, { action: 'stop' })));
          // 2) مسح السجلات والحالة في كل محرك (المفاتيح والإعدادات تبقى)
          const resets = await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
            jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 30000, { action: 'resetState' })));
          // 3) احتساب الرصيد الحالي من المنصة وإعادة توزيعه (خُمس لكل محرك)
          let eq = 0;
          for (let i = 1; i <= FLEET_N; i++) {
            const r = await jfetch('http://127.0.0.1:' + (BASE_PORT + i) + '/cmd', 10000, { action: 'exEquity' });
            if (r && Number(r.eq) > 0) { eq = Number(r.eq); break; }
          }
          if (eq > 0) {
            const share = Math.round((eq / FLEET_N) * 100) / 100;
            await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
              jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 15000, { action: 'syncBooks', totalEq: eq, share })));
          }
          // 4) تشغيل جديد: دراسة كاملة واختيار عملة قبل أي دخول (بوابة التشغيل)
          const starts = await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
            jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 8000, { action: 'start' })));
          pushLog('server', '🔄 دورة جديدة: قُفلت الصفقات فوراً · مُسحت السجلات · رصيد المنصة الآن ' +
            (eq > 0 ? '$' + eq.toFixed(2) + ' (خُمس لكل أسطول: $' + (Math.round((eq / FLEET_N) * 100) / 100).toFixed(2) + ')' : '(وضع ورقي — بلا منصة)') + ' — بدأت دراسة جديدة قبل أي دخول');
          void stops; void resets; void starts;
        })().catch(() => { }).then(() => { (globalThis as any).__cycleBusy = false; });
        return send(res, 200, { ok: true, accepted: true }, req);
      }
      if (a === 'klines') { // v1.1.10: شموع الشارت تمر عبر السيرفر لا من شبكة الجوال مباشرة
        let slot = 1;
        for (let i = 1; i <= FLEET_N; i++)
          if (slotStates[i] && slotStates[i].config && slotStates[i].config.symbol === j.symbol) { slot = i; break; }
        try { const r = await jfetch('http://127.0.0.1:' + (BASE_PORT + slot) + '/cmd', 8000, { action: 'klines', symbol: j.symbol, gran: j.gran });
          return send(res, 200, r || { ok: false }, req); }
        catch (e: any) { return send(res, 200, { ok: false, error: String((e && e.message) || e) }, req); }
      }
      if (a === 'haltState') return send(res, 200, { ok: true, halted: haltRequested() }, req);
      if (a === 'resetAll') {
        const rs = await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
          jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 30000, { action: 'resetState' })));
        return send(res, 200, { ok: true, results: rs }, req);
      }
      if (a === 'enableAll') {
        const rs = await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
          jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 8000, { action: 'enableEntries' })));
        return send(res, 200, { ok: true, results: rs }, req);
      }
      if (a === 'cleanAll') {
        const first = await jfetch('http://127.0.0.1:' + (BASE_PORT + 1) + '/cmd', 60000, { action: 'cleanStart' });
        const rest = await Promise.all(Array.from({ length: Math.max(0, FLEET_N - 1) }, (_, i) =>
          jfetch('http://127.0.0.1:' + (BASE_PORT + 2 + i) + '/cmd', 30000, { action: 'cleanStart' })));
        return send(res, 200, { ok: true, first, rest }, req);
      }
      if (a === 'stabilize') {
        const rs = await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
          jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 15000, { action: 'cancelEntries' })));
        return send(res, 200, { ok: true, results: rs }, req);
      }
      if (a === 'alignFleet') {
        const base = j.cfg || {};
        const rs = await Promise.all(Array.from({ length: FLEET_N }, (_, i) =>
          jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 8000, { action: 'alignStrategy', cfg: base })));
        return send(res, 200, { ok: true, applied: rs.map(r => !!(r && r.ok)) }, req);
      }
      if (a === 'repair') {
        const r1 = await jfetch('http://127.0.0.1:' + (BASE_PORT + 1) + '/cmd', 45000, j);
        return send(res, 200, r1 || { ok: false, error: 'لم يرد المحرك' }, req);
      }
      let payload = j;
      if (a === 'saveCfg' && j.cfg) {
        const { symbol, displaySymbol, ...rest } = j.cfg;
        if (rest.cycleBalance != null) rest.cycleBalance = Math.max(1, Math.round((+rest.cycleBalance / FLEET_N) * 100) / 100);
        payload = { ...j, cfg: rest };
      }
      const results = await Promise.all(
        Array.from({ length: FLEET_N }, (_, i) =>
          jfetch('http://127.0.0.1:' + (BASE_PORT + 1 + i) + '/cmd', 5000, payload)));
      const ok = results.some(r => r && r.ok);
      if (a === 'scanRadar') {
        const st = mergedState();
        return send(res, 200, { ok: true, radar: st ? (st.radar || null) : null }, req);
      }
      return send(res, 200, { ok, fleet: results.map(r => !!(r && r.ok)) }, req);
    }

    send(res, 404, { ok: false, error: 'not found' }, req);
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && (e as any).message) || e) }, req);
  }
});

srv.on('error', (e: any) => {
  /* ─── v1.1.24 «صمود»: احتلال المنفذ (نسختان تعملان بعد تحديث) كان
     يُسقط العملية بصمت ثم تُعاد كل 5ث في دوامة لا يتضح سببها ─── */
  if (e && (e as any).code === 'EADDRINUSE') {
    console.log('[AB-210-TRQ] ⚠ المنفذ ' + PORT + ' محتوم — سيرفر آخر يعمل على هذا الجهاز' +
      (SLOT > 0 ? ' — المحرك القديم ما زال يخدم المنفذ، خروج هادئ' : '. أوقف القديم أولاً (pkill -f node) ثم أعد التشغيل'));
    process.exit(1);
  }
  console.log('[AB-210-TRQ] خطأ سيرفر: ' + String((e && e.message) || e));
});
srv.listen(PORT, '127.0.0.1', () => {
  if (SLOT > 0) {
    console.log('[AB-210-TRQ] محرك الأسطول ' + SLOT + ' يعمل على http://127.0.0.1:' + PORT);
  } else {
    console.log('[AB-210-TRQ] منسّق الأسطول يعمل على http://127.0.0.1:' + PORT + ' — يُطلق ' + FLEET_N + ' محركات');
    pushLog('server', '🚀 انطلق AB-210-TRQ — ' + FLEET_N + ' محركات مستقلة، رأس الأسطول ÷ ' + FLEET_N + ' تداولات، كل عملية بمحركها');
    const self = process.argv[1];
    for (let i = 1; i <= FLEET_N; i++) {
      const engineEnv = (n: number) => ({ ...process.env, ABKING_SLOT: String(n), ABKING_FLEET_TOKEN: TOK });
      const child = spawn(process.execPath, [self], {
        env: engineEnv(i),
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: false,
      });
      child.on('exit', (code) => {
        console.log('[AB-210-TRQ] محرك ' + i + ' خرج (' + code + ') — إعادة تشغيل خلال 5 ث');
        setTimeout(() => { try { spawn(process.execPath, [self], { env: engineEnv(i), stdio: ['ignore', 'inherit', 'inherit'], detached: false }); } catch{} }, 5000);
      });
    }
    setTimeout(pollSlots, 4000);
    setInterval(() => {
      try {
        const st = mergedState();
        const fl = st ? (st.fleet || []) : [];
        pushLog('server', '📡 نبضة الأسطول ' + SRV_VER + ' — ' + fl.length + '/' + FLEET_N + ' محركات حية: ' +
          (fl.map(f => (f.disp || '?') + (f.position ? ' (مركز ' + (f.net >= 0 ? '+' : '') + f.net.toFixed(2) + ')' : '')).join(' · ') || 'بانتظار الإقلاع'));
      } catch {}
    }, 30 * 60 * 1000).unref?.();
  }
});

/* المنسّق لا يشغّل محركاً محلياً إطلاقاً (كان محركاً سادساً كاملاً بقناة XBT
   ورادار ومزامنات — حمل زائد على المنصة ومصدر طلبات 429 بلا فائدة). دوره
   فقط: إطلاق المحركات الخمسة، تجميع حالتها، بث بوابات الأسطول والتوكن */
if (SLOT === 0) console.log('[AB-210-TRQ] المنسّق جاهز — شغّل التطبيق في الجوال (يكتشف السيرفر تلقائيًا) — لا محرك داخل المنسّق');
else {
  initEngine();
  /* ─── v1.1.21 «نشاط» (قرار المالك 8 نوفمبر: «أريد صفقات أكثر»): هجرة
     إعدادات مخزنة من الإصدارات القديمة إلى نمط النشاط الأعلى — مرة واحدة
     فقط (علامة _actMode): انتظار المجموعات 10→5 دقائق (أسرع تسليح
     للمجموعات الأعمق) ومهلة الثبات 30→15 دقيقة (الفيتو المستمر يُحرَّر
     منه أصلاً بـveto-escape). لا تُمس أي قيمة ضبطها المالك لاحقاً يدوياً
     إلى غير هذين القديمين ─── */
  try {
    if ((S as any)._actMode !== 'v1.1.21') {
      const gw = Number(S.config && S.config.groupWaitMin) || 0;
      const sm = Number(S.config && S.config.stickMin) || 0;
      const mig: any = {};
      if (gw >= 10) mig.groupWaitMin = 5;
      if (sm >= 30) mig.stickMin = 15;
      if (Object.keys(mig).length) {
        saveCfg(mig);
        pushLog('server', '⚡ نمط النشاط v1.1.21: انتظار المجموعات ' + (mig.groupWaitMin ? gw + '→5 د' : 'كما هو') +
          ' · مهلة الثبات ' + (mig.stickMin ? sm + '→15 د' : 'كما هي') + ' — تسليح أسرع ودوران أسرع');
      }
      (S as any)._actMode = 'v1.1.21';
      try { (localStorage as any).setItem('abking:actMode', 'v1.1.21'); } catch {}
    }
  } catch {}
  /* ─── v1.1.18 «استئناف تلقائي» (ملاحظة المالك 8 نوفمبر: «أسطول واحد فقط
     يعمل و4 متوقفة»): المحرك الذي أُقلع ولم يُوقف بمفتاح الإيقاف (HALT)
     ولا بمؤقت ما بعد الجني يُكمل عمله تلقائيًا بعد 60 ثانية — بلا انتظار
     ضغطة «تشغيل» من التطبيق التي قد تصل لبعض المحركات دون غيرها بعد أي
     إعادة تشغيل للسيرفر. أوامر المالك محفوظة حرفيًا: «إيقاف» يمنع
     الاستئناف (مفتاح HALT)، و«مؤقت» يمنعه (إدارة حتى الجني فقط) ─── */
  setTimeout(() => {
    try {
      if (S.status === 'idle' && !haltRequested() && !S._holdAfterHarvest) {
        startBot();
        pushLog('server', '♻️ استئناف تلقائي للمحرك ' + SLOT + ' — لا مفتاح إيقاف ولا مؤقت، استكمل العمل بلا ضغط تشغيل (' + SRV_VER.replace('AB-210-TRQ-', 'v') + ')');
      }
    } catch {}
  }, 60000 + (SLOT - 1) * 8000).unref?.();
}
