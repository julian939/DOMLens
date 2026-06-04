#!/usr/bin/env bash
#
# build.sh — Package DOMLens for the Chrome Web Store.
#
# Produces ./domlens.zip in the project root, containing only the files
# required by the extension at runtime.
#
# The runtime file list is derived directly from manifest.json (background
# worker, content scripts, web-accessible resources, options page, icons) so
# it can never drift out of sync with what the extension actually loads.
# Files needed at runtime but NOT referenced by the manifest — e.g. CSS pulled
# in by an HTML page — are listed explicitly in EXTRA_FILES below.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

OUTPUT="domlens.zip"

# Remove any previous artifact so we never ship stale files.
rm -f "$OUTPUT"

# Runtime files the manifest doesn't reference (options.css is loaded by
# options.html via <link>, not the manifest), plus packaging extras.
EXTRA_FILES=(
  "src/options/options.css"
  "LICENSE"
)

# Collect every path the manifest references. Guards (// empty, // []) keep the
# query working even if an optional section is absent.
MANIFEST_FILES=()
while IFS= read -r f; do
  MANIFEST_FILES+=("$f")
done < <(jq -r '
  ( [ .background.service_worker // empty ]
  + [ (.content_scripts // [])[].js[] ]
  + [ (.web_accessible_resources // [])[].resources[] ]
  + [ .options_ui.page // empty ]
  + [ (.icons // {})[] ]
  ) | unique | .[]
' manifest.json)

FILES=( "manifest.json" "${MANIFEST_FILES[@]}" "${EXTRA_FILES[@]}" )

# Verify required files exist before packaging.
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: required file missing: $f" >&2
    exit 1
  fi
done

# Build the zip with an explicit allowlist of paths — safer than relying on
# excludes, because nothing extra can ever sneak in.
zip -r -X "$OUTPUT" "${FILES[@]}" > /dev/null

# Strip macOS metadata if any slipped in (defensive — -X above already skips it).
zip -d "$OUTPUT" "__MACOSX*" "*/.DS_Store" ".DS_Store" 2>/dev/null || true

echo "Built $OUTPUT"
unzip -l "$OUTPUT"
