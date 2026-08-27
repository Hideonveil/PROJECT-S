import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("OPS V2 local Grafana cockpit", () => {
  it("provisions the production dashboard with explicit matcher and no-data signals", () => {
    const dashboard = read("deploy/ops-v2/grafana/provisioning/dashboards/jiyuan-production.json");

    expect(dashboard).toContain("JIYUAN PRODUCTION");
    expect(dashboard).toContain("MATCHING HEALTH");
    expect(dashboard).toContain("SQL 40001");
    expect(dashboard).toContain("Business conflicts");
    expect(dashboard).toContain("No data");
    expect(dashboard).toContain("Realtime / Presence");
    expect(dashboard).toContain("Restart / OOM");
  });

  it("keeps Prometheus scraping the local SSH tunnel instead of production directly", () => {
    const config = read("deploy/ops-v2/prometheus/prometheus.yml");

    expect(config).toContain("jiyuan_production_metrics");
    expect(config).toContain("host.docker.internal:9464");
    expect(config).not.toMatch(/https:\/\/jiyuan\.online/);
  });

  it("provides only a local, secret-safe smoke runner", () => {
    const smoke = read("tools/ops-v2/local-smoke.mjs");

    expect(smoke).toContain("127.0.0.1");
    expect(smoke).toContain("authorization");
    expect(smoke).toContain("NO_DATA");
    expect(smoke).not.toMatch(/service_role|refresh_token|access_token/i);
  });
});
