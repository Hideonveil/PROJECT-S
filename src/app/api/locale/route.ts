import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";

const CHINESE_REGIONS = new Set(["CN", "HK", "MO", "TW"]);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2000;
const countryCache = new Map<string, { country: string; expiresAt: number }>();

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "";
}

function isPublicIp(ip: string) {
  if (!isIP(ip)) return false;
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return false;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a === 169 && b === 254 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}

async function lookupCountry(ip: string) {
  const cached = countryCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.country;
  if (cached) countryCache.delete(ip);

  try {
    const response = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return "";
    const body = await response.json() as { country?: string };
    const country = String(body.country || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return "";
    if (countryCache.size >= MAX_CACHE_ENTRIES) countryCache.delete(countryCache.keys().next().value || "");
    countryCache.set(ip, { country, expiresAt: Date.now() + CACHE_TTL_MS });
    return country;
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  const ip = requestIp(request);
  const country = isPublicIp(ip) ? await lookupCountry(ip) : "";

  const acceptLanguage = request.headers.get("accept-language") || "";
  const locale = country
    ? (CHINESE_REGIONS.has(country) ? "zh" : "en")
    : (/^zh\b/i.test(acceptLanguage) ? "zh" : "en");

  return NextResponse.json({ locale, country: country || null }, {
    headers: { "Cache-Control": "private, max-age=3600", "Vary": "Accept-Language" },
  });
}
