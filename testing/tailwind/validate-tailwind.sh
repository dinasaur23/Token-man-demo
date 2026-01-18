#!/usr/bin/env bash
set -euo pipefail

npx @tailwindcss/cli \
  -c tailwind.config.js \
  -i ./input.css \
  -o /tmp/tailwind-validate.css

echo "✅ Tailwind config is valid"
