#!/bin/sh
# Restores src/engine.ts in this repo:
#  1. downloads the pinned original engine.ts from KING-210 (commit 7c89a71)
#  2. decodes engine.patch.gz.b64 -> engine.patch
#  3. applies the patch (the KING-trading security fixes)
# Requires: curl + patch + base64  (Termux: pkg install -y patch coreutils)
set -e
SRC="https://raw.githubusercontent.com/abab92100-cloud/KING-210/7c89a71d6ec1c72dbf35aeddbff60bdb0675e0c40/AB-KING/app/trg-new/src/engine.ts"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
mkdir -p src
command -v curl >/dev/null || { echo "curl required"; exit 1; }
command -v patch >/dev/null || { echo "patch required (Termux: pkg install -y patch)"; exit 1; }
curl -fsSL "$SRC" -o src/engine.ts
base64 -d engine.patch.gz.b64 | gzip -d > engine.patch
patch -p1 -s < engine.patch
echo "[fetch-engine] src/engine.ts ready ($(wc -c < src/engine.ts) bytes)"
