// Ladder strategy — applies to EACH fleet slot independently.
// 5 groups of 4 orders. Within group g, consecutive orders are spaced SPACINGS[g]% of the group anchor price.
// Group 0 is anchored at the start price. When a group is fully filled, wait WAITS_MS[g]; during the wait the
// extreme price in the trade direction is tracked (max for short, min for long). If NO profit was harvested
// during the wait, the next group is added, anchored at that extreme (first order at the extreme, spacing
// applied after it). If profit WAS harvested during the wait, the ladder resets to group 0.
// Money: the slot's share of exchange equity (equity/5) is split into 5 ascending parts (+25% geometric each),
// recomputed whenever equity changes; group g uses part g; the 4 orders in a group share it equally.
import { S, pushLog, emit, capEntryQty, fmtPx, fmtUsd } from './engine';

const GROUP_SIZE = 4;
const SPACINGS = [30, 40, 50, 60, 70];                       // % price spacing between orders inside a group
const WAITS_MS = [3 * 3600e3, 4 * 3600e3, 4 * 3600e3, 4 * 3600e3]; // wait after group g fills, before group g+1
const ASC = 1.25;                                            // ascending money ratio per part

export function ladderOn() { return !!(S.config && S.config.ladderMode); }

function ladderState() {
  if (!S._ladder) S._ladder = { active: false, group: 0, anchor: 0, waitUntil: 0, winExtreme: 0, harvestAtStart: 0, symbol: '' };
  return S._ladder;
}

// 5 ascending parts of this slot's equity share, +25% each (geometric), normalized to the share.
export function ladderParts() {
  const equity = (S.exEquity != null ? S.exEquity : S.config.cycleBalance) || 0;
  const share = Math.max(1, equity / 5); // fleet of 5 slots
  const ratios = [0, 1, 2, 3, 4].map(i => Math.pow(ASC, i));
  const sum = ratios.reduce((a, b) => a + b, 0);
  return ratios.map(r => Math.max(1, (share * r) / sum));
}

function groupOrders(g: number) { return (S.grid || []).filter(x => x.ladderGroup === g); }

function clearLadderOrders() {
  for (const g of S.grid) {
    if (g.origin === 'ladder' && (g.status === 'armed' || g.status === 'open') && !g.filledAt) {
      g.status = 'cancelled'; g.exchangeOrderId = null;
    }
  }
}

function placeGroup(g: number, anchor: number) {
  const short = S.config.direction === 'short';
  const side = short ? 'sell' : 'buy';
  const sp = SPACINGS[Math.min(g, SPACINGS.length - 1)] / 100;
  const budget = ladderParts()[Math.min(g, 4)]; // USD notional for this group
  const perOrderUsd = budget / GROUP_SIZE;
  let placed = 0;
  for (let k = 0; k < GROUP_SIZE; k++) {
    const px = short ? anchor * (1 + k * sp) : anchor * (1 - k * sp);
    if (!(px > 0)) continue;
    const mult = S.multiplier || 1;
    let q = perOrderUsd / (mult * px);
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
  pushLog('server', '[ladder] group ' + g + ' anchor ' + fmtPx(anchor) + ' spacing ' + (sp * 100) + '% — ' + placed + ' orders, budget $' + budget.toFixed(2));
}

export function ladderTick(price: number) {
  if (!ladderOn() || S.status !== 'running' || !(price > 0)) return;
  const st = ladderState();
  // reset if symbol changed
  if (st.active && st.symbol !== S.config.symbol) { clearLadderOrders(); st.active = false; }
  const short = S.config.direction === 'short';
  // track extreme in trade direction during the wait window
  if (st.waitUntil && Date.now() < st.waitUntil) {
    if (short) st.winExtreme = Math.max(st.winExtreme || price, price);
    else st.winExtreme = st.winExtreme ? Math.min(st.winExtreme, price) : price;
  }
  if (!st.active) {
    st.active = true; st.group = 0; st.anchor = price; st.symbol = S.config.symbol;
    st.waitUntil = 0; st.winExtreme = price; st.harvestAtStart = S.cycleHarvested || 0;
    placeGroup(0, price);
    emit(); return;
  }
  const cur = groupOrders(st.group);
  if (cur.length < GROUP_SIZE) return;                    // group not fully placed yet
  const filled = cur.filter(l => l.status === 'filled' || l.status === 'open' || l.filledAt).length;
  if (filled < GROUP_SIZE) return;                         // wait until all 4 are filled
  if (!st.waitUntil) {
    const w = WAITS_MS[Math.min(st.group, WAITS_MS.length - 1)] || 4 * 3600e3;
    st.waitUntil = Date.now() + w;
    st.winExtreme = price;
    st.harvestAtStart = S.cycleHarvested || 0;
    pushLog('server', '[ladder] group ' + st.group + ' fully filled — waiting ' + (w / 3600e3) + 'h, extreme so far ' + fmtPx(st.winExtreme));
    return;
  }
  if (Date.now() < st.waitUntil) return;                   // still waiting
  const harvested = (S.cycleHarvested || 0) - (st.harvestAtStart || 0);
  if (harvested > 0) {
    // profit taken during the wait -> reset to group 0 at current price
    pushLog('server', '[ladder] profit harvested during wait (+' + fmtUsd(harvested) + '$) — reset to group 0');
    clearLadderOrders();
    st.group = 0; st.anchor = price; st.symbol = S.config.symbol;
    st.waitUntil = 0; st.winExtreme = price; st.harvestAtStart = S.cycleHarvested || 0;
    placeGroup(0, price);
    emit(); return;
  }
  const next = st.group + 1;
  if (next >= SPACINGS.length) { st.waitUntil = 0; return; } // max 5 groups reached
  const anchor = st.winExtreme || price;                   // extreme reached during the wait
  st.group = next;
  st.waitUntil = 0;
  placeGroup(next, anchor);
  emit();
}
