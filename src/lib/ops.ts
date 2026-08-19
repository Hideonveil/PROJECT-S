import { timingSafeEqual } from "crypto";

export function isOpsRequestAuthorized(request: Request): boolean {
  const expected = process.env.OPS_TOKEN || "";
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

