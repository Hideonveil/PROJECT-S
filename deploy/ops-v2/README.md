# Jiyuan OPS V2 local 2+1 cockpit

This project runs Appsmith, Metabase, Prometheus, and Grafana on the founder Mac only. It must never be started on the 2 GB Production host.

| Service | Local URL | Purpose |
| --- | --- | --- |
| Appsmith | `http://127.0.0.1:8081` | LIVE operations and audited actions |
| Metabase | `http://127.0.0.1:3000` | LIVE and GROWTH read-only dashboards |
| Grafana | `http://127.0.0.1:3001` | Production technical health |
| Prometheus | `http://127.0.0.1:9090` | Local metrics storage |

## First local setup

1. Copy `.env.example` to `.env.local` and generate unique local values.
2. Set a distinct `OPS_METRICS_TOKEN` and create `.secrets/ops_metrics_token` locally with that exact value; it is read-only mounted into Prometheus and never added to Git.
3. Establish SSH tunnels: `127.0.0.1:9464` for protected Production metrics and `127.0.0.1:5433` for the dedicated `analytics_readonly` database endpoint.
4. Run `docker compose -f deploy/ops-v2/compose.yaml up -d` from this repo.

## Security boundary

Appsmith receives only the protected `OPS_V2_API_KEY` in encrypted local configuration and calls `/api/internal/ops-v2/*` through the SSH tunnel. It never receives a Supabase service role, database password, or arbitrary SQL datasource.

Metabase uses only the `analytics_readonly` role through `127.0.0.1:5433`. Grafana receives Prometheus facts from the metrics tunnel. Do not create a public DNS record, reverse proxy route, or firewall rule for these services.
