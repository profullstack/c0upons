#!/usr/bin/env bash
# Drain the reveal backlog: call POST /api/sync/reveal round after round until
# nothing is left, printing each round. The schedule does three coupons every
# fifteen minutes on its own; this is for when the queue is long and someone
# wants it read today.
#   BASE_URL=https://c0upons.com apps/web/scripts/drive-reveal-sweep.sh
set -uo pipefail
base="${BASE_URL:-https://c0upons.com}"
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
round=0
found=0
while [ "$round" -lt "${MAX_ROUNDS:-300}" ]; do
  round=$((round + 1))
  code=$(curl -s -m 190 -o "$out" -w '%{http_code}' -X POST "$base/api/sync/reveal")
  if [ "$code" != "200" ]; then
    echo "round $round: HTTP $code $(head -c 160 "$out" 2>/dev/null)"
    sleep 30
    continue
  fi
  remaining=$(jq -r '.remaining // -1' "$out")
  got=$(jq -r '.found // 0' "$out")
  checked=$(jq -r '[.checked[]? | "#\(.id):\(.code // .method)"] | join(", ")' "$out")
  found=$((found + got))
  echo "$(date -u +%H:%M:%S) round $round: remaining=$remaining found_total=$found [$checked]"
  if [ "$remaining" = "0" ] || [ -z "$checked" ]; then break; fi
done
echo "done after $round rounds, $found codes found"
