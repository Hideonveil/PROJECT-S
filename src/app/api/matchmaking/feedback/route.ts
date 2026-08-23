import { requireRequestProfile } from "@/lib/auth";
import { errorResponse, jsonBody, jsonOk, requestId } from "@/lib/http";
import { submitMatchFeedback } from "@/lib/matchmaking/service";

export async function POST(request: Request) {
  const rid = requestId(request);
  try {
    const body = await jsonBody(request);
    const profile = await requireRequestProfile(request, body);
    return jsonOk({ feedback: await submitMatchFeedback(profile.id, body) }, rid);
  } catch (error) {
    return errorResponse(error, rid, "反馈保存失败");
  }
}
