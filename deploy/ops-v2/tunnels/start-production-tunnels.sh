#!/usr/bin/env bash
set -euo pipefail

# Founder-Mac-only encrypted access to Production facts. Neither local port is
# published beyond loopback. The database tunnel remains unused until the
# analytics_readonly role exists in Production.
readonly host="ubuntu@124.156.175.247"
readonly key_path="$HOME/.ssh/jiyuan_hk_ed25519"

start_tunnel() {
  local local_port="$1"
  local remote_target="$2"
  if lsof -nP -iTCP:"${local_port}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "127.0.0.1:${local_port} is already listening"
    return
  fi
  ssh -f -N -i "${key_path}" -o BatchMode=yes -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -L "127.0.0.1:${local_port}:${remote_target}" "${host}"
}

# Appsmith and Prometheus preserve the verified hostname/SNI but route through
# this loopback port via Docker host-gateway.
start_tunnel 9464 "127.0.0.1:443"

if [[ "${1:-}" == "--analytics-db" ]]; then
  # Requires the limited analytics_readonly role; never use admin credentials.
  start_tunnel 5433 "db.chqxaqibegpdjtedrxwx.supabase.co:5432"
fi

echo "Production metrics tunnel ready on 127.0.0.1:9464"
