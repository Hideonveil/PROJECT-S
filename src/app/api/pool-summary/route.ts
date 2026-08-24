import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { poolSummary } from "@/lib/api";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    return jsonOk(await poolSummary(), rid);
  } catch (error) {
    return errorResponse(error, rid, "活动数据暂时不可用");
  }
}
