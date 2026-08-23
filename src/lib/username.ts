import { createHash } from "crypto";

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return username.length >= 2
    && username.length <= 24
    && !/\s/.test(username)
    && /^[\p{L}\p{N}_-]+$/u.test(username);
}

/**
 * Kept only for legacy test fixtures. New accounts use a real Auth email and
 * never derive an email address from the username.
 */
export function usernameToEmail(username: string): string {
  const normalized = normalizeUsername(username);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 24);
  return `u${hash}@mvp.local`;
}
