
set -euo pipefail

FILE="${1:-Tokens.swift}"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi
if ! xcrun swiftc -parse "$FILE"; then
  echo "❌ Swift syntax error in $FILE"
  exit 1
fi


xcrun swiftc -parse "$FILE"
echo "✅ Swift syntax OK: $FILE"

#cd testing
#chmod +x validate-swift.sh
#./validate-swift.sh Tokens.swift
