#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  build-wasm.sh  —  Compile tlottie to WebAssembly
#  Run from the tlottie-main directory:
#    chmod +x build-wasm.sh && ./build-wasm.sh
#
#  Requirements:
#    rustup target add wasm32-unknown-unknown
#
#  Output:
#    tlottie.wasm  (alongside your index.html)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

PROFILE="release-nostd"
TARGET="wasm32-unknown-unknown"
FEATURES="wasm,no-std"
OUT_DIR="."   # ← change to your web root if needed

echo "▶  Building tlottie.wasm …"

cargo build \
  --target "$TARGET" \
  --no-default-features \
  --features "$FEATURES" \
  --profile "$PROFILE" \
  2>&1

WASM_SRC="target/$TARGET/$PROFILE/tlottie.wasm"

if [ ! -f "$WASM_SRC" ]; then
  echo "✗  Build failed — $WASM_SRC not found"
  exit 1
fi

cp "$WASM_SRC" "$OUT_DIR/tlottie.wasm"
SIZE=$(wc -c < "$OUT_DIR/tlottie.wasm")
echo "✓  tlottie.wasm  $(( SIZE / 1024 )) KB  →  $OUT_DIR/tlottie.wasm"
echo ""
echo "   Place tlottie.wasm next to index.html."
echo "   The editor will auto-detect and use it for preview rendering."
