import { createHmac, timingSafeEqual } from "crypto";

export const OPS_COOKIE_NAME = "jiyuan_ops_session";

function safeEqual(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function isOpsPasswordValid(supplied: string): boolean {
  return safeEqual(process.env.OPS_PASSWORD || process.env.OPS_TOKEN || "", supplied);
}

export function opsSessionValue(): string {
  const secret = process.env.OPS_TOKEN || "";
  if (!secret) return "";
  return createHmac("sha256", secret).update("jiyuan-ops-session-v1").digest("hex");
}

function cookieValue(request: Request, name: string): string {
  const cookies = request.headers.get("cookie") || "";
  const part = cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

export function isOpsRequestAuthorized(request: Request): boolean {
  const expected = process.env.OPS_TOKEN || "";
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (safeEqual(expected, supplied)) return true;
  return safeEqual(opsSessionValue(), cookieValue(request, OPS_COOKIE_NAME));
}
