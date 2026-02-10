
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${1:-$ROOT/tokens.xml}"

WORK="$ROOT/.aapt2tmp"
OUT="/tmp/aapt2-validate.zip"

rm -rf "$WORK"
mkdir -p "$WORK/res/values"

cp "$SRC" "$WORK/res/values/colors.xml"

AAPT2="$(ls -1 "$HOME/Library/Android/sdk/build-tools"/*/aapt2 2>/dev/null | sort -V | tail -n 1)"
if [[ -z "${AAPT2:-}" ]]; then
  echo "❌ aapt2 not found in $HOME/Library/Android/sdk/build-tools"
  exit 1
fi

"$AAPT2" compile --legacy -o "$OUT" --dir "$WORK/res" >/dev/null


echo "Android code compile OK: $SRC"
