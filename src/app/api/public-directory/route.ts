import { errorResponse, jsonOk, requestId } from "@/lib/http";
import { publicDirectory } from "@/lib/api";

export async function GET(request: Request) {
  const rid = requestId(request);
  try {
    return jsonOk({ directory: await publicDirectory() }, rid);
  } catch (error) {
    return errorResponse(error, rid, "公开匹配列表暂时不可用");
  }
}
