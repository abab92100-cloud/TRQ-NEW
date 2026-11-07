// Ladder strategy — applies to EACH fleet slot independently.
// مواصفة المالك (5 نوفمبر) حرفياً:
// · كل صفقة = 5 مجموعات × 4 أوامر. التباعد داخل المجموعة g:
//   [0.30% ، 0.40% ، 0.50% ، 0.60% ، 0.70%] بين كل أمر والذي يليه.
// · اكتملت المجموعة g (نفّذت أوامرها الأربعة) → توقف الدخول مدة قابلة للضبط
//   (v1.1.12 «تسليح مستمر» أمر المالك 7 نوفمبر): 20/30/40/40 دقيقة افتراضياً —
//   من إعداد «انتظار المجموعات» في التطبيق، فتسلّح المجموعة التالية بلا انتظار طويل.
// · خلال الانتظار يُتتبَّع أعلى سعر وصل له السعر (شورت) / أدنى سعر (لونغ).
// · تم الجني أثناء الانتظار → تصفير السلم كاملاً ومجموعة أولى جديدة بعد الدراسة.
// · انتهى الانتظار بلا جني → مجموعة جديدة مرساتها ذلك الأقصى (أول أمر عنده).
// · المال: نصيب المحرك = رصيد المنصة ÷ 5 أساطيل، ثم 5 أجزاء متساوية،
//   وكل جزء يُوزَّع على أوامره الأربعة تصاعدياً ×1.25 (الأمر الأول أصغرها دائماً).
// · الدخول منظم: لا مجموعة أولى إلا عبر بوابة المحرك entryGateOpen()
//   (الدراسة + دور التسلسل + ملكية العملة + قاعدة الخمسة) — لا فتح فوضوي.
import { S, pushLog, emit, capEntryQty, fmtPx, fmtUsd, entryGateOpen, fetchKlines, fetchKlinesCached, entryBoost } from './engine';

const GROUP_SIZE = 4;
const SPACINGS = [0.30, 0.40, 0.50, 0.60, 0.70];                    // % بين كل أمر والذي يليه داخل المجموعة
// v1.1.12 «تسليح مستمر»: الانتظار بين المجموعات بالدقائق — w دقيقة (الإعداد groupWaitMin،
// افتراضي 20، مدى 5-240) × [1، 1.5، 2، 2] حسب المجموعة — بدل ساعات الانتظار القديمة
function groupWaitMs(g: number){
  const w = Math.max(5, Math.round(Number(S.config && S.config.groupWaitMin) || 20));
  const m = [1, 1.5, 2, 2][Math.min(g, 3)];
  return Math.round(w * m * 60000);
}
export function waitsDesc(){
  const w = Math.max(5, Math.round(Number(S.config && S.config.groupWaitMin) || 20));
  return [1, 1.5, 2, 2].map(x => Math.round(w * x) + 'm').join('/');
}
const ASC = 1.25;                                                    // تصاعد حجم الأمر داخل المجموعة

export function ladderOn() { return !!(S.config && S.config.ladderMode); }

function ladderState() {
  if (!S._ladder) S._ladder = { active: false, group: 0, anchor: 0, waitUntil: 0, winExtreme: 0, harvestAtStart: 0, symbol: '', maxed: false, placing: false, lastTry: 0, placedAt: 0, noZoneAt: 0, fetchFailAt: 0 };
  return S._ladder;
}
// اتجاه الصفقة الفعلي: المركز القائم أولاً (استئناف)، وإلا اتجاه الدراسة
const ladderShort = () => (S.position ? S.position.side === 'short' : S.config.direction === 'short');

// نصيب المحرك (رصيد المنصة ÷ 5 أساطيل) مقسّماً 5 أجزاء متساوية — مواصفة المالك
export function ladderParts() {
  const equity = (S.exEquity != null ? S.exEquity : S.config.cycleBalance) || 0;
  const share = Math.max(1, equity / 5);   // نصيب الأسطول من المنصة
  const part = Math.max(1, share / 5);    // جزء متساوٍ لكل مجموعة من الخمس
  return [0, 1, 2, 3, 4].map(() => part);
}

// ميزانيات أوامر المجموعة g: الجزء ÷ 4 أوامر تصاعدياً ×1.25 — أول أمر أصغرها
function groupBudgets(g: number) {
  const part = ladderParts()[Math.min(g, 4)];
  const r = [0, 1, 2, 3].map(k => Math.pow(ASC, k));
  const sum = r.reduce((a, b) => a + b, 0);
  return r.map(x => Math.max(1, (part * x) / sum));
}

function groupOrders(g: number) { return (S.grid || []).filter(x => x.ladderGroup === g && x.origin === 'ladder'); }

function clearLadderOrders() {
  for (const g of S.grid) {
    if (g.origin === 'ladder' && (g.status === 'armed' || g.status === 'open') && !g.filledAt) {
      g.status = 'cancelled'; g.exchangeOrderId = null;
    }
  }
}

function resetLadder(reason: string) {
  clearLadderOrders();
  const st = ladderState();
  st.active = false; st.group = 0; st.anchor = 0; st.waitUntil = 0;
  st.winExtreme = 0; st.harvestAtStart = S.cycleHarvested || 0;
  st.symbol = S.config.symbol; st.maxed = false;
  if (reason) pushLog('server', '[ladder] ' + reason);
}

// ═══════════ v1.1.8 صائد الارتداد المدروس (أمر المالك 7 نوفمبر) ═══════════
// لا دخول في منتصف الهواء: تُدرس شموع 15 دقيقة (آخر 24 ساعة) وتُستخرج مناطق
// الارتداد المختبرة — قيعان ارتد منها السعر فعلاً (لونغ) / قمم انعكست عنها
// (شورت). الأمر الرئيسي (الأضخم: 40%) عند أقرب منطقة قوية، والإضافات عند
// المناطق الأعمق المدروسة فقط. لا منطقة سليمة = لا أمر عشوائي أبداً ───
export function bounceOn() { return S.config && S.config.bounceMode !== false; }

const ZONE_CLUSTER_PCT = 0.0025;   // قيعان/قمم ضمن 0.25% = منطقة واحدة (اللمسات تتجمع)
const ZONE_MAX_DIST_PCT = 0.015;   // أبعد منطقة مقبولة عن السعر: 1.5% (صيد قريب سريع)
const ZONE_MIN_DIST_PCT = 0.0006;  // أقرب من 0.06%: لا مساحة ربح حقيقية — تُرفض

let _zoneCache: any = null; // {sym, short, at, zones} — إعادة دراسة المناطق كل ساعة
let _zoneFails = 0;        // فشل جلب متتالٍ — يمدد فترة إعادة المحاولة تصاعدياً

async function bounceZones(short: boolean): Promise<any[]> {
  const sym = S.config.symbol;
  if (_zoneCache && _zoneCache.sym === sym && _zoneCache.short === short && Date.now() - _zoneCache.at < 3600e3)
    return _zoneCache.zones;
  // ─── v1.1.9 درس «أكثر من ساعة بلا صفقة»: جلب الشموع كان يفشل بعاصفة
  // حصص المنصة (429) فيقف الصيد كلياً بلا أمر واحد. الآن: آخر دراسة ناجحة
  // (حتى 12 ساعة) تُستخدم مؤقتاً عند تعثر الجلب — مناطق الارتداد لا تتغير
  // كل دقيقة، والصيد بمنطقة مدروسة قديمة أفضل ألف مرة من لا صيد إطلاقاً.
  // المناطق المكسورة تُرشّح عند التسليح بحدودها الزمنية الحية لاحقاً ───
  const staleOk = _zoneCache && _zoneCache.sym === sym && _zoneCache.short === short &&
    _zoneCache.zones && _zoneCache.zones.length && Date.now() - _zoneCache.at < 12 * 3600e3;
  let ks: any[] = [];
  try {
    ks = await fetchKlinesCached(sym, 15); // v1.1.10: كاش مشترك + نسخة قديمة عند رفض المنصة — الصيد لا يقف
    _zoneFails = 0;
    S._zonesOkAt = Date.now(); // دراسة المناطق نجحت — البورة تُقاس من هنا
  } catch (e) {
    _zoneFails++;
    const st = ladderState();
    if (!st.fetchFailAt || Date.now() - st.fetchFailAt > 600000) { st.fetchFailAt = Date.now();
      pushLog('server', '[ladder] تعذر جلب شموع الدراسة (حصص المنصة) — ' +
        (staleOk ? 'الصيد يكمل بمناطق آخر دراسة ناجحة' : 'إعادة المحاولة بهدوء حتى يخف الحصص')); }
    if (staleOk) return _zoneCache.zones;
    return [];
  }
  if (!ks || ks.length < 40) {
    if (staleOk) return _zoneCache.zones;
    return [];
  }
  const win = ks.slice(-192); // 192 شمعة × 15 د = 48 ساعة (v1.1.14: نطاق أوسع = مناطق ارتداد مختبرة أكثر وانتظار أقل)
  // فراكتال 5 شموع: قاع/قمة محلية مختبرة ارتد منها السعر فعلاً
  const pts: any[] = [];
  for (let i = 2; i < win.length - 2; i++) {
    const seg = win.slice(i - 2, i + 3);
    if (short) { if (win[i].h >= Math.max(...seg.map((k: any) => k.h))) pts.push({ px: win[i].h, i }); }
    else if (win[i].l <= Math.min(...seg.map((k: any) => k.l))) pts.push({ px: win[i].l, i });
  }
  if (!pts.length) { _zoneCache = { sym, short, at: Date.now(), zones: [] }; S._zonesOkAt = Date.now(); return []; } // دراسة نجحت: لا قيعان/قمم — تُخزن النتيجة الفارغة ساعة
  pts.sort((a, b) => a.px - b.px);
  // عناقيد اللمس: النقاط المتقاربة منطقة واحدة، واللمسات تتجمع فيها
  const zones: any[] = [];
  for (const p of pts) {
    const last = zones[zones.length - 1];
    if (last && Math.abs(p.px - last.px) / last.px <= ZONE_CLUSTER_PCT) {
      last.touch++; last.lastI = Math.max(last.lastI, p.i);
      last.px = short ? Math.max(last.px, p.px) : Math.min(last.px, p.px);
    } else zones.push({ px: p.px, touch: 1, lastI: p.i });
  }
  // المنطقة المكسورة بعد آخر لمسة (إغلاق اخترق 0.3%) مرفوضة — لا شراء تحت قاع منهار
  const alive = zones.filter((z: any) => !win.some((k: any, j: number) => j > z.lastI &&
    (short ? k.c > z.px * 1.003 : k.c < z.px * 0.997)));
  _zoneCache = { sym, short, at: Date.now(), zones: alive };
  return alive;
}

async function placeGroupBounce(g: number) {
  const st = ladderState();
  if (st.placing) return;
  st.placing = true;
  try {
    const short = ladderShort();
    const zones = await bounceZones(short);
    const px0 = S.lastPrice || (S.position ? S.position.entry : 0);
    if (!(px0 > 0)) return;
    if (!zones.length) {
      if (!st.noZoneAt || Date.now() - st.noZoneAt > 300000) { st.noZoneAt = Date.now();
        pushLog('server', '[ladder] 🎯 لا منطقة ارتداد مدروسة سليمة على ' + S.config.displaySymbol +
          ' — صيد هادئ: لا دخول في منتصف الهواء'); }
      return;
    }
    const dir = short ? 1 : -1; // منطقة الربح فوق السعر (شورت) / تحته (لونغ)
    let pool = zones.filter((z: any) => {
      const d = ((z.px - px0) / px0) * dir;
      return d >= ZONE_MIN_DIST_PCT && d <= ZONE_MAX_DIST_PCT;
    });
    // المجموعات الأعمق (g>0): مناطق خلف متوسط المركز الحالي فقط — انعكاس مدروس
    const avg = S.position ? S.position.entry : 0;
    if (g > 0 && avg > 0) pool = pool.filter((z: any) => (z.px - avg) * dir > 0);
    // درع التصفية (قاعدة مقدسة): لا أمر يدخل نطاق 2% من سعر التصفية المعلن
    const exl = S.exLiqPrice || 0;
    if (exl > 0) pool = pool.filter((z: any) => short ? z.px < exl * 0.98 : z.px > exl * 1.02);
    // لا تكديس: منطقة بمحاذاة أمر قائم (ضمن 0.15%) تُتخطى — عمق مدروس لا عشوائي
    const existing = (S.grid || []).filter((l: any) => l.origin === 'ladder' &&
      (l.status === 'armed' || l.status === 'open' || l.filledAt));
    pool = pool.filter((z: any) => !existing.some((l: any) => l.price > 0 && Math.abs(l.price - z.px) / z.px < 0.0015));
    // الأقوى أولاً (لمسات أكثر ثم الأقرب) — الرئيسي عند أقوى منطقة قريبة
    pool.sort((a: any, b: any) => (b.touch - a.touch) || (Math.abs(a.px - px0) - Math.abs(b.px - px0)));
    const chosen = pool.slice(0, GROUP_SIZE);
    if (!chosen.length) {
      if (!st.noZoneAt || Date.now() - st.noZoneAt > 300000) { st.noZoneAt = Date.now();
        pushLog('server', '[ladder] 🎯 لا منطقة سليمة قريبة كافية للتسليح على ' + S.config.displaySymbol + ' — انتظار الصيد'); }
      return;
    }
    const part = ladderParts()[Math.min(g, 4)];
    const fr = [0.40, 0.25, 0.20, 0.15]; // الرئيسي الأضخم عند أفضل نقطة (أمر المالك)
    const side = short ? 'sell' : 'buy';
    let placed = 0;
    for (let k = 0; k < chosen.length && k < GROUP_SIZE; k++) {
      const z = chosen[k];
      const mult = S.multiplier || 1;
      let q = (part * fr[k] * (k === 0 ? entryBoost() : 1)) / (mult * z.px); // أول دخول عند أفضل منطقة بحجم مضاعف (أمر المالك 7 نوفمبر)
      q = capEntryQty(q, z.px);
      if (!(q >= 1)) continue;
      S.grid.push({
        id: 'lb' + g + '_' + k + '_' + Date.now().toString(36),
        clientOid: 'lbo' + g + '_' + k + '_' + Math.random().toString(36).slice(2, 8),
        side, price: z.px, qty: q,
        status: 'armed', reduceOnly: false, exchangeOrderId: null, filledAt: null,
        origin: 'ladder', lane: 'ladder', ladderGroup: g, createdAt: Date.now(),
      });
      placed++;
    }
    if (placed) {
      S.grid.sort((a, b) => b.price - a.price);
      st.placedAt = Date.now();
      pushLog('server', '[ladder] 🎯 صيد المجموعة ' + (g + 1) + '/5 على ' + S.config.displaySymbol + ': ' + placed +
        ' أوامر عند مناطق ارتداد مدروسة — الرئيسي ' + fmtPx(chosen[0].px) + ' (' + chosen[0].touch +
        ' لمسات) بحجم 40%، والإضافات أعمق عند المناطق المختبرة فقط');
      emit();
    } else if (!st.noZoneAt || Date.now() - st.noZoneAt > 300000) { st.noZoneAt = Date.now();
      pushLog('server', '[ladder] 🎯 أحجام المناطق المدروسة أصغر من حد المنصة — صيد هادئ'); }
  } catch (e) {
    if (!st.fetchFailAt || Date.now() - st.fetchFailAt > 60000) { st.fetchFailAt = Date.now();
      pushLog('server', '[ladder] تعذر جلب شموع الدراسة — إعادة المحاولة خلال دقيقة'); }
  } finally { st.placing = false; }
}

function placeGroup(g: number, anchor: number) {
  // ─── بوابة المواصفات (درس التلوث): لا تسليح أي أمر قبل توثيق مضاعف عقد
  // العملة الحالية نفسها — مضاعف قديم=1 على عملة كـ PEPE (عقدها 520 ألف
  // وحدة) يضخّم الحجم مئات آلاف المرات ───
  if (S._metaSym !== S.config.symbol || !(S.multiplier > 0)) {
    // المواصفات الموثقة سابقاً لنفس العملة (خريطة الذاكرة) تُستخدم فوراً —
    // فشل الجلب (429/شبكة) لا يوقف التسليح أبداً لعملة نعرف عقدها
    const km = (S._multMap || {})[S.config.symbol] || 0;
    const kt = (S._tickMap || {})[S.config.symbol] || 0;
    if (km > 0) { S.multiplier = km; if (kt > 0) S.tickSize = kt; S._metaSym = S.config.symbol;
      pushLog('server', '[ladder] مواصفات ' + S.config.displaySymbol + ' من الذاكرة: مضاعف ' + km + ' — التسليح يكمل'); }
  }
  if (S._metaSym !== S.config.symbol || !(S.multiplier > 0)) {
    if (!S._ladMetaAt || Date.now() - S._ladMetaAt > 60000) { S._ladMetaAt = Date.now();
      pushLog('server', '[ladder] انتظار توثيق مواصفات ' + S.config.displaySymbol + ' قبل تسليح المجموعة ' + (g + 1) + ' — لا أحجام بمضاعف غير موثق'); }
    return;
  }
  // ─── درع مقياس السعر: مرساة تبعد أكثر من 5× عن السعر اللحظي = بيانات
  // عملة أخرى تسربت (سعر BTC على رمز PEPE) — يُرفض التسليح كلياً ───
  if (S.lastPrice > 0 && anchor > 0) {
    const r = Math.max(anchor / S.lastPrice, S.lastPrice / anchor);
    if (r > 5) {
      pushLog('server', '[ladder] ⛔ مرساة المجموعة ' + (g + 1) + ' (' + fmtPx(anchor) +
        ') تبعد ' + r.toFixed(0) + '× عن سعر ' + S.config.displaySymbol + ' — بيانات ملوّثة، يُرفض التسليح');
      return;
    }
  }
  // ─── v1.1.8 صائد الارتداد: التسليح عند المناطق المدروسة فقط (فرع المالك)،
  // التباعد الثابت القديم يبقى كوضع احتياطي حرفياً عند إطفاء bounceMode ───
  if (bounceOn()) { placeGroupBounce(g); return; }
  const short = ladderShort();
  const side = short ? 'sell' : 'buy';
  const sp = SPACINGS[Math.min(g, SPACINGS.length - 1)] / 100;
  const budgets = groupBudgets(g);
  let placed = 0;
  for (let k = 0; k < GROUP_SIZE; k++) {
    const px = short ? anchor * (1 + k * sp) : anchor * (1 - k * sp);
    if (!(px > 0)) continue;
    const mult = S.multiplier || 1;
    let q = (budgets[k] * (k === 0 ? entryBoost() : 1)) / (mult * px); // أول أمر بالمجموعة بحجم مضاعف قوة الدخول
    q = capEntryQty(q, px);
    if (!(q >= 1)) continue;
    S.grid.push({
      id: 'ld' + g + '_' + k + '_' + Date.now().toString(36),
      clientOid: 'ldo' + g + '_' + k + '_' + Math.random().toString(36).slice(2, 8),
      side, price: px, qty: q,
      status: 'armed', reduceOnly: false, exchangeOrderId: null, filledAt: null,
      origin: 'ladder', lane: 'ladder', ladderGroup: g, createdAt: Date.now(),
    });
    placed++;
  }
  S.grid.sort((a, b) => b.price - a.price);
  ladderState().placedAt = Date.now();
  pushLog('server', '[ladder] المجموعة ' + (g + 1) + '/5 من ' + fmtPx(anchor) + ' — تباعد ' +
    (sp * 100).toFixed(2) + '% — ' + placed + ' أوامر، أحجام تصاعدية ×1.25 (الأول أصغرها)');
}

export function ladderTick(price: number) {
  if (!ladderOn() || S.status !== 'running' || !(price > 0)) return;
  // مؤقت (أمر المالك 6 نوفمبر): لا مجموعات ولا تسليح جديد — إدارة الصفقة
  // القائمة حتى جنيها فقط (الجني والتتبع يعملان خارج السلم)
  if (S._holdAfterHarvest) return;
  const st = ladderState();
  // تغيّرت العملة (دراسة جديدة / جني) → سلم جديد كلياً
  if (st.active && st.symbol !== S.config.symbol) resetLadder('تغيّرت العملة إلى ' + S.config.displaySymbol + ' — سلم جديد');
  const short = ladderShort();
  const stNow = ladderState(); // resetLadder قد أنشأ حالة جديدة
  const harvestedNow = (S.cycleHarvested || 0) - (stNow.harvestAtStart || 0);

  // جني أثناء الانتظار → تصفير فوري (المواصفة: إما جني أو مجموعة تالية بعد الانتظار)
  if (stNow.active && stNow.waitUntil && harvestedNow > 0) {
    pushLog('server', '[ladder] جني +' + fmtUsd(harvestedNow) + '$ أثناء الانتظار — تصفير السلم وبدء جديد بعد الدراسة');
    resetLadder('');
    return; // الصفقة أُغلقت: لا فتح جديد هنا — بوابة الدخول تقرر بعد الدراسة
  }

  if (!stNow.active) {
    if (!entryGateOpen()) return;              // لا صفقة جديدة إلا في وقتها ودورها
    stNow.active = true; stNow.group = 0;
    stNow.anchor = S.position ? (S.position.entry || price) : price;
    stNow.symbol = S.config.symbol; stNow.waitUntil = 0;
    stNow.winExtreme = price; stNow.harvestAtStart = S.cycleHarvested || 0;
    placeGroup(0, stNow.anchor);
    emit(); return;
  }
  const cur = groupOrders(stNow.group);
  // ─── v1.1.8 صائد الارتداد: لا أوامر مسلحة (لا منطقة ضمن النطاق أو فشل
  // جلب الشموع) — إعادة محاولة مرة كل 60 ث لا كل نبضة، وسحب صلاحية مناطق
  // بلا أي تنفيذ بعد ساعة: تحديث الصيد بدل التعليق على منطقة بايتة ───
  // v1.1.9: إعادة المحاولة تتراجع تصاعدياً كلما طال تعثر الجلب (60ث → 2د → 5د)
  // — الطرق على باب مُقفل يطيل الحصص، والانتظار المنظم يفكه أسرع
  const retryMs = _zoneFails >= 4 ? 300000 : (_zoneFails >= 2 ? 120000 : 60000);
  if (bounceOn()) {
    if (!cur.length) {
      if (!stNow.lastTry || Date.now() - stNow.lastTry > retryMs) {
        stNow.lastTry = Date.now();
        placeGroup(stNow.group, price);
      }
      return;
    }
    if (stNow.placedAt && Date.now() - stNow.placedAt > 3600e3 &&
        cur.every(l => l.status === 'armed' && !l.filledAt)) {
      resetLadder('انتهت صلاحية منطقة الصيد بلا تنفيذ — تحديث المناطق والدراسة');
      emit(); return;
    }
  }
  // ─── إصلاح الجمود: انقلاب الاتجاه/فيتو الخطر ألغى أوامر المجموعة كلها
  // وبلا مركز قائم — المجموعة تُعاد تسليحها عند السعر الحالي (مرة كل 30 ث
  // كحد أقصى) وإلا وقف السلم للأبد وحجز دور التسلسل على الأسطول ───
  if (!S.position && cur.length && cur.every(l => l.status === 'cancelled') && !(cur as any).some((l: any) => l.filledAt)) {
    if (!S._ladReArmAt || Date.now() - S._ladReArmAt > 30000) { S._ladReArmAt = Date.now();
      pushLog('server', '[ladder] أُلغيت أوامر المجموعة ' + (stNow.group + 1) + ' كاملة (انقلاب/فيتو) — يُعاد تسليحها من ' + fmtPx(price));
      placeGroup(stNow.group, price); emit(); return; }
    return;
  }
  // v1.1.8: في وضع الصيد قد تسلّح المجموعة أقل من 4 أوامر (عدد المناطق
  // المدروسة المتاحة فقط) — اكتمال المجموعة = نفاذ كل المسلح منها
  const total = bounceOn() ? (cur.length || GROUP_SIZE) : GROUP_SIZE;
  if (cur.length < Math.max(1, total)) return;           // المجموعة لم تُسلّح كاملة بعد
  // «تم دخول الأوامر» = نُفِّذت فعلاً (filled) — لا يكفي وجودها على المنصة
  const filled = cur.filter(l => l.status === 'filled' || l.filledAt).length;
  if (filled < total) return;                          // لم تُنفَّذ المسلحة بعد — لا انتظار
  if (!stNow.waitUntil) {
    const w = groupWaitMs(stNow.group);
    stNow.waitUntil = Date.now() + w;
    stNow.winExtreme = price;
    stNow.harvestAtStart = S.cycleHarvested || 0;
    pushLog('server', '[ladder] نُفِّذت أوامر المجموعة ' + (stNow.group + 1) + '/5 كاملة — توقف الدخول ' +
      (Math.round(w / 60000)) + ' دقيقة، يُتتبَّع ' + (short ? 'أعلى' : 'أدنى') + ' سعر وصل له السعر خلالها');
    emit(); return;
  }
  if (Date.now() < stNow.waitUntil) {
    // تتبّع الأقصى في اتجاه الصفقة خلال نافذة الانتظار
    if (short) stNow.winExtreme = Math.max(stNow.winExtreme || price, price);
    else stNow.winExtreme = stNow.winExtreme ? Math.min(stNow.winExtreme, price) : price;
    return;
  }
  const next = stNow.group + 1;
  if (next >= SPACINGS.length) {
    if (!stNow.maxed) { stNow.maxed = true;
      pushLog('server', '[ladder] اكتملت المجموعات الخمس (20 أمراً) — لا أوامر إضافية حتى يُجنى الربح'); emit(); }
    return;
  }
  // المركز أُغلق بلا جني (إيقاف/يدوي) → لا مجموعات على صفقة منتهية — سلم جديد من البوابة
  if (!S.position) { resetLadder('المركز مغلق بلا جني — تصفير السلم'); return; }
  const anchor = stNow.winExtreme || price;                  // الأقصى خلال الانتظار — مواصفة المالك
  stNow.group = next; stNow.waitUntil = 0; stNow.winExtreme = price; stNow.maxed = false;
  placeGroup(next, anchor);
  emit();
}
