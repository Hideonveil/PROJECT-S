import { timingSafeEqual } from "node:crypto";
import { AppError } from "../http";
import { env } from "../supabase";
import type { OpsV2Actor } from "./types";

function sameSecret(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function requireOpsV2Authorization(request: Request): Promise<OpsV2Actor> {
  const supplied = request.headers.get("x-jiyuan-ops-key") || "";
  if (!sameSecret(env("OPS_V2_API_KEY"), supplied)) {
    throw new AppError("OPS_UNAUTHORIZED", "未授权的运营请求", 401, false);
  }
  return { operator: (request.headers.get("x-jiyuan-operator") || "appsmith").slice(0, 100) };
}
