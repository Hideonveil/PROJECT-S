import { createHash } from "crypto";

export function usernameToEmail(username: string): string {
  const normalized = username.trim().toLowerCase().replace(/\s+/g, "");
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 24);
  return `u${hash}@mvp.local`;
}
