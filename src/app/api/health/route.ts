import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { runHealthDiagnostics } from "@/lib/health";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    const diagnostics = await runHealthDiagnostics({ requestId: rid });
    return jsonOk({
      ...diagnostics.body,
      version: process.env.APP_VERSION || "development",
    }, rid, diagnostics.httpStatus);
  } catch (error) {
    return errorResponse(error, rid, "数据库暂时不可用");
  }
}
