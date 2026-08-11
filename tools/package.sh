#!/usr/bin/env bash
# Build the Chrome Web Store submission zip.
#
# The manifest must sit at the zip root, so this zips the *contents* of src/,
# not the src/ directory itself. Zipping the folder produces a "manifest not
# found" rejection, which is the most common self-inflicted submission failure.
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print(json.load(open('src/manifest.json'))['version'])")
OUT="dist/steer-clear-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"
cd src && zip -qr "../$OUT" . -x '*.DS_Store' -x '__MACOSX/*' && cd ..

echo "$OUT"
unzip -l "$OUT" | tail -n +4 | head -5
