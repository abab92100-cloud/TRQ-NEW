// Ladder strategy — applies to EACH fleet slot independently.
// مواصفة المالك (5 نوفمبر) حرفياً:
// · كل صفقة = 5 مجموعات × 4 أوامر. التباعد داخل المجموعة g:
//   [0.30% ، 0.40% ، 0.50% ، 0.60% ، 0.70%] بين كل أمر والذي يليه.
// · اكتملت المجموعة g (نفّذت أوامرها الأربعة) → توقف الدخول مدة WAITS[g]:
//   2 ساعة بعد الأولى، 3 ساعات بعد الثانية، 4 ساعات بعد الثالثة، 4 ساعات بعد الرابعة.
// · خلال الانتظار يُتتبَّع أعلى سعر وصل له السعر (شورت) / أدنى سعر (لونغ).
// · تم الجني أثناء الانتظار → تصفير السلم كاملاً ومجموعة أولى جديدة بعد الدراسة.
// · انتهى الانتظار بلا جني → مجموعة جديدة مرساتها ذلك الأقصى (أول أمر عنده).
// · المال: نصيب المحرك = رصيد المنصة ÷ 5 أساطيل، ثم 5 أجزاء متساوية،
//   وكل جزء يُوزَّع على أوامره الأربعة تصاعدياً ×1.25 (الأمر الأول أصغرها دائماً).
// · الدخول منظم: لا مجموعة أولى إلا عبر بوابة المحرك entryGateOpen()
//   (الدراسة + دور التسلسل + ملكية العملة + قاعدة الخمسة) — لا فتح فوضوي.
import { S, pushLog, emit, capEntryQty, fmtPx, fmtUsd, entryGateOpen } from './engine';

const GROUP_SIZE = 4;
const SPACINGS = [0.30, 0.40, 0.50, 0.60, 0.70];                    // % بين كل أمر والذي يليه داخل المجموعة
const WAITS_MS = [2 * 3600e3, 3 * 3600e3, 4 * 3600e3, 4 * 3600e3];  // توقف الدخول بعد اكتمال المجموعة g
const ASC = 1.25;                                                    // تصاعد حجم الأمر داخل المجموعة

export function ladderOn() { return !!(S.config && S.config.ladderMode); }

function ladderState() {
  if (!S._ladder) S._ladder = { active: false, group: 0, anchor: 0, waitUntil: 0, winExtreme: 0, harvestAtStart: 0, symbol: '', maxed: false };
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

function placeGroup(g: number, anchor: number) {
  // ─── بوابة المواصفات (درس التلوث): لا تسليح أي أمر قبل توثيق مضاعف عقد
  // العملة الحالية نفسها — مضاعف قديم=1 على عملة كـ PEPE (عقدها 520 ألف
  // وحدة) يضخّم الحجم مئات آلاف المرات ───
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
  const short = ladderShort();
  const side = short ? 'sell' : 'buy';
  const sp = SPACINGS[Math.min(g, SPACINGS.length - 1)] / 100;
  const budgets = groupBudgets(g);
  let placed = 0;
  for (let k = 0; k < GROUP_SIZE; k++) {
    const px = short ? anchor * (1 + k * sp) : anchor * (1 - k * sp);
    if (!(px > 0)) continue;
    const mult = S.multiplier || 1;
    let q = budgets[k] / (mult * px);
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
  pushLog('server', '[ladder] المجموعة ' + (g + 1) + '/5 من ' + fmtPx(anchor) + ' — تباعد ' +
    (sp * 100).toFixed(2) + '% — ' + placed + ' أوامر، أحجام تصاعدية ×1.25 (الأول أصغرها)');
}

export function ladderTick(price: number) {
  if (!ladderOn() || S.status !== 'running' || !(price > 0)) return;
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
  // ─── إصلاح الجمود: انقلاب الاتجاه/فيتو الخطر ألغى أوامر المجموعة كلها
  // وبلا مركز قائم — المجموعة تُعاد تسليحها عند السعر الحالي (مرة كل 30 ث
  // كحد أقصى) وإلا وقف السلم للأبد وحجز دور التسلسل على الأسطول ───
  if (!S.position && cur.length && cur.every(l => l.status === 'cancelled') && !(cur as any).some((l: any) => l.filledAt)) {
    if (!S._ladReArmAt || Date.now() - S._ladReArmAt > 30000) { S._ladReArmAt = Date.now();
      pushLog('server', '[ladder] أُلغيت أوامر المجموعة ' + (stNow.group + 1) + ' كاملة (انقلاب/فيتو) — يُعاد تسليحها من ' + fmtPx(price));
      placeGroup(stNow.group, price); emit(); return; }
    return;
  }
  if (cur.length < GROUP_SIZE) return;                       // المجموعة لم تُسلّح كاملة بعد
  // «تم دخول الأوامر» = نُفِّذت فعلاً (filled) — لا يكفي وجودها على المنصة
  const filled = cur.filter(l => l.status === 'filled' || l.filledAt).length;
  if (filled < GROUP_SIZE) return;                          // لم تُنفَّذ الأربعة بعد — لا انتظار
  if (!stNow.waitUntil) {
    const w = WAITS_MS[Math.min(stNow.group, WAITS_MS.length - 1)];
    stNow.waitUntil = Date.now() + w;
    stNow.winExtreme = price;
    stNow.harvestAtStart = S.cycleHarvested || 0;
    pushLog('server', '[ladder] نُفِّذت أوامر المجموعة ' + (stNow.group + 1) + '/5 كاملة — توقف الدخول ' +
      (w / 3600e3) + ' ساعات، يُتتبَّع ' + (short ? 'أعلى' : 'أدنى') + ' سعر وصل له السعر خلالها');
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
