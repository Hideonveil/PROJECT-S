#!/usr/bin/env sh
set -eu

PUBLIC_URL=${PUBLIC_URL:-https://jiyuan.online}
STATE_FILE=${STATE_FILE:-/tmp/jiyuan-health-state}
ALERT_WEBHOOK_URL=${ALERT_WEBHOOK_URL:-}
NOW=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

notify() {
  message=$1
  printf '%s %s\n' "$NOW" "$message"
  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    escaped=$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')
    curl --silent --show-error --max-time 10 \
      --header 'Content-Type: application/json' \
      --data "{\"text\":\"${escaped}\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
}

previous=unknown
if [ -f "$STATE_FILE" ]; then previous=$(cat "$STATE_FILE"); fi

if curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
  "${PUBLIC_URL}/api/health/live" >/dev/null; then
  printf 'up' >"$STATE_FILE"
  if [ "$previous" = "down" ]; then notify "机缘已恢复：${PUBLIC_URL}"; fi
  exit 0
fi

printf 'down' >"$STATE_FILE"
if [ "$previous" != "down" ]; then notify "机缘无法访问：${PUBLIC_URL}"; fi
exit 1
