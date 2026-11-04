/* Node environment shims for the Termux server - loaded before the engine.
   localStorage backed by a JSON file (0600) - state survives restarts.
   ABKING_SERVER=1 switches the engine to direct KuCoin connection.
   Generates a per-install auth token (abking:token), stored with 0600. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

process.env.ABKING_SERVER = '1';

const dir = String((process.env as any).ABKING_DIR || join(homedir(), '.ab-king'));
try { mkdirSync(dir, { recursive: true }); } catch{ /* intentional: optional step */ }
const __slot = (process.env as any).ABKING_SLOT || '';
const file = join(dir, __slot ? `trg-slot-${__slot}-store.json` : 'trg-server-store.json');

let data = {};
try { if (existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8') || '{}'); } catch (e) { data = {}; }
try { if (existsSync(file)) chmodSync(file, 0o600); } catch{ /* intentional: optional step */ }
let timer:any = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { writeFileSync(file, JSON.stringify(data)); chmodSync(file, 0o600); } catch{ /* intentional: optional step */ }
  }, 300);
}

if (!data['abking:token']) { data['abking:token'] = randomBytes(24).toString('hex'); persist(); }

;(globalThis as any).localStorage = {
  getItem: k => (k in data ? data[k] : null),
  setItem: (k, v) => { data[k] = String(v); persist(); },
  removeItem: k => { delete data[k]; persist(); },
  clear: () => { data = {}; persist(); },
};

console.log('[KING-trading] store: ' + file);
