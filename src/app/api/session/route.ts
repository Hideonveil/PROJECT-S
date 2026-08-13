import { NextResponse } from "next/server";
import { authUserFromToken, profileByAuthId } from "@/lib/auth";
import { profileWithGames } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    const authUser = await authUserFromToken(token);
    if (!authUser) {
      return NextResponse.json({ authenticated: false });
    }
    const profile = await profileByAuthId(authUser.id);
    return NextResponse.json({
      authenticated: true,
      email: authUser.email || null,
      emailVerified: Boolean(authUser.email_confirmed_at),
      profile: profile ? await profileWithGames(profile) : null,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}