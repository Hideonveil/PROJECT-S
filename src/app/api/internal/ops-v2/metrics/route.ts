import { errorResponse, requestId } from "@/lib/http";
import { requireOpsMetricsAuthorization } from "@/lib/ops-v2/auth";
import { supabaseAdmin } from "@/lib/supabase";

function metric(name: string, value: number, help: string) {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${Number.isFinite(value) ? value : 0}\n`;
}

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    await requireOpsMetricsAuthorization(request);
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const admin = supabaseAdmin();
    const [{ data: minutes, error: minuteError }, { count: instances, error: instanceError }] = await Promise.all([
      admin.from("matchmaking_runtime_minute").select("matcher_ticks,pair_attempts,pair_success,pair_business_conflicts,group_attempts,group_success,group_business_conflicts,actual_sql_40001,matcher_retries,database_errors").gte("minute_start", since),
      admin.from("matchmaking_runtime_instances").select("instance_id", { count: "exact", head: true }).eq("status", "alive").gte("last_heartbeat_at", new Date(Date.now() - 20_000).toISOString()),
    ]);
    if (minuteError || instanceError) throw minuteError || instanceError;
    const total = (key: string) => (minutes || []).reduce((sum, row) => sum + Number(row[key as keyof typeof row] || 0), 0);
    const attempts = total("pair_attempts") + total("group_attempts");
    const success = total("pair_success") + total("group_success");
    const conflicts = total("pair_business_conflicts") + total("group_business_conflicts");
    const lines = [
      metric("jiyuan_matcher_attempts_total", attempts, "Matcher attempts in the last five minutes"),
      metric("jiyuan_matcher_success_total", success, "Matcher successes in the last five minutes"),
      metric("jiyuan_matcher_business_conflicts_total", conflicts, "Expected business conflicts in the last five minutes"),
      metric("jiyuan_matcher_actual_sql_40001_total", total("actual_sql_40001"), "Actual SQL serialization failures in the last five minutes"),
      metric("jiyuan_matcher_retries_total", total("matcher_retries"), "Bounded matcher retries in the last five minutes"),
      metric("jiyuan_matcher_instances_alive", Number(instances || 0), "Matcher instances with a recent heartbeat"),
      metric("jiyuan_matcher_storm_state", conflicts > Math.max(50, success * 20) ? 1 : 0, "One means elevated business conflict storm"),
      metric("jiyuan_matcher_ticks", total("matcher_ticks"), "Matcher ticks in the last five minutes"),
      metric("jiyuan_database_errors_total", total("database_errors"), "Database errors in the last five minutes"),
    ];
    return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "x-request-id": rid, "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, rid, "读取监控指标失败");
  }
}
