#!/usr/bin/env sh
set -eu

BASE_URL=${1:-https://jiyuan.online}

check() {
  label=$1
  path=$2
  result=$(curl --silent --show-error --location --output /dev/null \
    --connect-timeout 5 --max-time 15 \
    --write-out '%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}' \
    "${BASE_URL}${path}")
  code=$(printf '%s' "$result" | cut -d' ' -f1)
  if [ "$code" != "200" ]; then
    printf '%-12s FAIL %s\n' "$label" "$result" >&2
    return 1
  fi
  printf '%-12s OK   %s\n' "$label" "$result"
}

printf 'Public check: %s\n' "$BASE_URL"
printf 'label        state http dns connect tls ttfb total\n'
check home /index.html
check config /api/config
check health /api/health

