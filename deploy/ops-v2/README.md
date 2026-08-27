# Jiyuan OPS V2 local 2+1 cockpit

This project runs Appsmith, Metabase, Prometheus, and Grafana on the founder Mac only. It must never be started on the 2 GB Production host.

| Service | Local URL | Purpose |
| --- | --- | --- |
| Appsmith | `http://127.0.0.1:8081` | LIVE operations and audited actions |
| Metabase | `http://127.0.0.1:3002` | LIVE and GROWTH read-only dashboards |
| Grafana | `http://127.0.0.1:3001` | Production technical health |
| Prometheus | `http://127.0.0.1:9090` | Local metrics storage |

## First local setup

1. Copy `.env.example` to `.env.local` and generate unique local values.
2. Set a distinct `OPS_METRICS_TOKEN` and create `.secrets/ops_metrics_token` locally with that exact value; it is read-only mounted into Prometheus and never added to Git.
3. Start the protected metrics tunnel with `./deploy/ops-v2/tunnels/start-production-tunnels.sh`. It binds only `127.0.0.1:9464`. After the limited `analytics_readonly` database role exists, add `--analytics-db` to create the separate local-only `127.0.0.1:5433` database tunnel.
4. Run `docker compose -f deploy/ops-v2/compose.yaml up -d` from this repo.

## Security boundary

Appsmith receives only the protected `OPS_V2_API_KEY` in encrypted local configuration and calls `/api/internal/ops-v2/*` through the SSH tunnel. It never receives a Supabase service role, database password, or arbitrary SQL datasource.

Metabase uses only the `analytics_readonly` role through `127.0.0.1:5433`. Grafana receives Prometheus facts from the metrics tunnel. Do not create a public DNS record, reverse proxy route, or firewall rule for these services.

After a Mac restart, run the tunnel script before opening the cockpit. A failed
read must appear as an error/no-data state, never as a fabricated zero.
