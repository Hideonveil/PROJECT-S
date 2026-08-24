import { jsonOk, requestId } from "@/lib/http";

export async function GET(request: Request) {
  const rid = requestId(request);
  return jsonOk({
    ok: true,
    status: "live",
    checkedAt: new Date().toISOString(),
    version: process.env.APP_VERSION || "development",
  }, rid);
}
