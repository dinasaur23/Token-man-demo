#!/usr/bin/env bash
set -euo pipefail

FILE="${1:?Usage: ./validate-xml.sh path/to/file.xml}"

# macOS has xmllint preinstalled
xmllint --noout "$FILE"
echo "✅ XML is well-formed: $FILE"
