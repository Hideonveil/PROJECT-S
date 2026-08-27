#!/usr/bin/env node

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const localOnly = (value, name) => {
  const url = new URL(value);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`${name} must use a loopback URL`);
  }
  return url;
};

const get = async (url, headers = {}) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
};

const metricsUrl = localOnly(
  process.env.JIYUAN_METRICS_TUNNEL_URL || "http://127.0.0.1:9464/api/internal/ops-v2/metrics",
  "JIYUAN_METRICS_TUNNEL_URL",
);
const prometheusUrl = localOnly(process.env.PROMETHEUS_URL || "http://127.0.0.1:9090", "PROMETHEUS_URL");
const grafanaUrl = localOnly(process.env.GRAFANA_URL || "http://127.0.0.1:3001", "GRAFANA_URL");
const opsKey = required("OPS_V2_API_KEY");

const metrics = await get(metricsUrl, { authorization: `Bearer ${opsKey}` });
if (!metrics.includes("jiyuan_matcher_attempts")) {
  throw new Error("metrics endpoint did not expose matcher attempts");
}

const readiness = await get(new URL("/-/ready", prometheusUrl));
if (!readiness.trim()) throw new Error("Prometheus returned an empty readiness response");

const grafanaHealth = JSON.parse(await get(new URL("/api/health", grafanaUrl)));
if (grafanaHealth.database !== "ok") throw new Error("Grafana database is not ready");

const convergence = metrics.match(/jiyuan_synthetic_lifecycle_convergence\{[^}]*result="pass"[^}]*\}\s+1(?:\.0+)?/);
if (!convergence) {
  throw new Error("synthetic lifecycle convergence is NO_DATA or not passing");
}

console.log("OPS V2 local smoke: PASS (metrics, Prometheus, Grafana, synthetic convergence)");
