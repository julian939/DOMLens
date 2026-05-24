#!/usr/bin/env bash
#
# build.sh — Package DOMLens for the Chrome Web Store.
#
# Produces ./domlens.zip in the project root, containing only the files
# required by the extension at runtime.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

OUTPUT="domlens.zip"

# Remove any previous artifact so we never ship stale files.
rm -f "$OUTPUT"

# Verify required files exist before packaging.
required=(
  "manifest.json"
  "src/shared/settings.js"
  "src/content/content.js"
  "src/options/options.html"
  "src/options/options.js"
  "src/options/options.css"
  "icons/icon16.png"
  "icons/icon32.png"
  "icons/icon48.png"
  "icons/icon128.png"
)
for f in "${required[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: required file missing: $f" >&2
    exit 1
  fi
done

# Build the zip with an explicit allowlist of paths — safer than relying on
# excludes, because nothing extra can ever sneak in.
zip -r -X "$OUTPUT" \
  manifest.json \
  src/shared/settings.js \
  src/content/content.js \
  src/options/options.html \
  src/options/options.js \
  src/options/options.css \
  icons/icon16.png \
  icons/icon32.png \
  icons/icon48.png \
  icons/icon128.png \
  LICENSE \
  > /dev/null

# Strip macOS metadata if any slipped in (defensive — -X above already skips it).
zip -d "$OUTPUT" "__MACOSX*" "*/.DS_Store" ".DS_Store" 2>/dev/null || true

echo "Built $OUTPUT"
unzip -l "$OUTPUT"
