import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase";

export const OPS_COOKIE_NAME = "jiyuan_ops_session";

function safeEqual(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

type OpsCredential = {
  password_salt: string;
  password_hash: string;
  session_version: number;
};

export function deriveOpsPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyDerivedOpsPassword(password: string, salt: string, expectedHash: string): boolean {
  return safeEqual(expectedHash, deriveOpsPassword(password, salt));
}

async function credentialRecord(): Promise<OpsCredential | null> {
  const { data, error } = await supabaseAdmin()
    .from("ops_credentials")
    .select("password_salt,password_hash,session_version")
    .eq("id", "primary")
    .maybeSingle();
  if (error) throw error;
  return data as OpsCredential | null;
}

export async function verifyOpsPassword(supplied: string): Promise<{ valid: boolean; sessionVersion: number }> {
  const credential = await credentialRecord();
  if (credential) {
    return {
      valid: verifyDerivedOpsPassword(supplied, credential.password_salt, credential.password_hash),
      sessionVersion: credential.session_version,
    };
  }
  return {
    valid: safeEqual(process.env.OPS_PASSWORD || process.env.OPS_TOKEN || "", supplied),
    sessionVersion: 0,
  };
}

export async function rotateOpsPassword(password: string): Promise<number> {
  const current = await credentialRecord();
  const sessionVersion = (current?.session_version || 0) + 1;
  const salt = randomBytes(18).toString("hex");
  const passwordHash = deriveOpsPassword(password, salt);
  const { error } = await supabaseAdmin().from("ops_credentials").upsert({
    id: "primary",
    password_salt: salt,
    password_hash: passwordHash,
    session_version: sessionVersion,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return sessionVersion;
}

export function opsSessionValue(sessionVersion = 0): string {
  const secret = process.env.OPS_TOKEN || "";
  if (!secret) return "";
  return createHmac("sha256", secret).update(`jiyuan-ops-session-v1:${sessionVersion}`).digest("hex");
}

function cookieValue(request: Request, name: string): string {
  const cookies = request.headers.get("cookie") || "";
  const part = cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

export async function isOpsRequestAuthorized(request: Request): Promise<boolean> {
  const expected = process.env.OPS_TOKEN || "";
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (safeEqual(expected, supplied)) return true;
  const credential = await credentialRecord();
  return safeEqual(
    opsSessionValue(credential?.session_version || 0),
    cookieValue(request, OPS_COOKIE_NAME),
  );
}
