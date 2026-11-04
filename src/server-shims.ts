/* محاكاة بيئة Node لسيرفر Termux — كتابة قبل تحميل المحرك (تثالترتيبJesús)
   · localStorage على ملف JSON في ~/.ab-king — الحالة تنجو من إعادة التشغيل
   · ABKING_SERVER=1 يفعّل المحرك للاتصال المباشر بـ KuCoin (لا بروكسي)
   · يُولّد توكن مصادقة لكل تثبيت (abking:token) ويُحفظ بصلاحيات 0600 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

process.env.ABKING_SERVER = '1';

const dir = join(homedir(), '.ab-king');
try { mkdirSync(dir, { recursive: true }); } catch{}
const __slot = (process.env as any).ABKING_SLOT || '';
const file = join(dir, __slot ? `trg-slot-${__slot}-store.json` : 'trg-server-store.json');

let data = {};
try { if (existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8') || '{}'); } catch (e) { data = {}; }
try { if (existsSync(file)) chmodSync(file, 0o600); } catch{}
if (!data['abking:token']) { data['abking:token'] = randomBytes(24).toString('hex'); persist(); }

let timer:any = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { writeFileSync(file, JSON.stringify(data)); chmodSync(file, 0o600); } catch{}
  }, 300);
}

;(globalThis as any).localStorage = {
  getItem: k => (k in data ? data[k] : null),
  setItem: (k, v) => { data[k] = String(v); persist(); },
  removeItem: k => { delete data[k]; persist(); },
  clear: () => { data = {}; persist(); },
};

console.log('[KING-trading] مخزن الحالة: ' + file);
