import { NextResponse } from "next/server";
import { isOpsRequestAuthorized } from "@/lib/ops";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!(await isOpsRequestAuthorized(request))) {
    return NextResponse.json({ error: { message: "运营登录已失效，请重新进入" } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedDate = String(body.metricsSince || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return NextResponse.json({ error: { message: "请选择有效的统计起始日期" } }, { status: 400 });
  }
  const resetAt = new Date(`${requestedDate}T00:00:00+08:00`);
  if (Number.isNaN(resetAt.getTime()) || resetAt > new Date()) {
    return NextResponse.json({ error: { message: "统计起始日期不能晚于今天" } }, { status: 400 });
  }
  const metricsSince = resetAt.toISOString();
  const setAt = new Date().toISOString();
  const { error } = await supabaseAdmin().from("product_events").insert({
    event_name: "ops_metrics_reset",
    properties: { scope: "mvp", source: "ops_dashboard", metricsSince, setAt },
    occurred_at: metricsSince,
  });
  if (error) {
    return NextResponse.json({ error: { message: "统计基线保存失败" } }, { status: 500 });
  }

  return NextResponse.json({ ok: true, metricsSince });
}
