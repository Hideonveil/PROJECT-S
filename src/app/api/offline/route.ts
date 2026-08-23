import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { bearerToken, jsonBody } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    if (body?.reason !== "explicit_logout") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const token = bearerToken(request, body);
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ ok: true });

    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();
    if (profile) {
      // Logout is a Presence transition, not an implicit Room Leave. The
      // database marks the member disconnected, cancels pre-room matching,
      // and lets the 180-second reconnect grace handle active Rooms.
      const { error } = await admin.rpc("presence_mark_offline", {
        p_user_id: profile.id,
      });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
