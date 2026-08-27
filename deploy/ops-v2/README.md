# Jiyuan OPS V2 internal deployment

This Compose project runs Appsmith for internal operations only. It binds to
`127.0.0.1:8081`, so it has no public HTTP endpoint. Access it through an SSH
tunnel from an approved operator workstation.

## Server setup

1. Copy `.env.example` to `.env.production` on the server and set unique values
   only in that server-side file.
2. Start with `docker compose up -d` from this directory.
3. Create the first Appsmith administrator locally through the SSH tunnel and
   disable public sign-up; invite further operators explicitly.
4. Configure an Appsmith REST datasource pointing to the local Jiyuan app API.
   Store `x-jiyuan-ops-key` in Appsmith's encrypted datasource configuration,
   never in a widget, query parameter, client script, or repository file.

## Operator access

Forward local port `8081` to server `127.0.0.1:8081` using an authenticated SSH
tunnel, then browse `http://127.0.0.1:8081`. Do not add a Caddy route, public
DNS record, or public firewall rule for this service.

## Backup and restore

Use Appsmith's documented export/backup capability before upgrades. Keep the
`appsmith_stacks` Docker volume persistent. Upgrade only to a reviewed Appsmith
release and verify the health endpoint plus protected LIVE API afterwards.

## API boundary

Appsmith reads and mutates only through `/api/internal/ops-v2/*`. It must not
be given a Supabase database URL, database user, or service-role key. Every
state-changing request includes a bounded operator name and is written to
`ops_audit_log` by the Jiyuan server.
