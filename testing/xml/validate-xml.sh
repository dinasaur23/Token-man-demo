
set -euo pipefail

FILE="${1:?Usage: ./validate-xml.sh path/to/file.xml}"

xmllint --noout "$FILE"
echo "XML is correct: $FILE"
