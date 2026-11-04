#!/bin/sh
# Restores src/engine.ts in this repo:
#  1. downloads the pinned original engine.ts from KING-210 (commit a84b2b11, blob bb64118 = patch base)
#  2. decodes the split parts engine.patch.gz.b64.* -> engine.patch
#  3. applies the patch (KING-trading security fixes + ladder strategy)
# Requires: curl + patch + base64  (Termux: pkg install -y patch coreutils)
set -e
SRC="https://raw.githubusercontent.com/abab92100-cloud/KING-210/a84b2b11eda1487fb7b3f20e1a55bdce7efdb466/AB-KING/app/trg-new/src/engine.ts"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
mkdir -p src
command -v curl >/dev/null || { echo "curl required"; exit 1; }
command -v patch >/dev/null || { echo "patch required (Termux: pkg install -y patch)"; exit 1; }
curl -fsSL "$SRC" -o src/engine.ts
cat engine.patch.gz.b64.* | base64 -d | gzip -d > engine.patch
patch -p1 -s < engine.patch
echo "[fetch-engine] src/engine.ts ready ($(wc -c < src/engine.ts) bytes)"
