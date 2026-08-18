import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { bearerToken } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = bearerToken(request, body);
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ ok: true });

    const admin = supabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();
    if (profile) {
      await admin.from("profiles").update({ online: false }).eq("id", profile.id);
      await admin.rpc("matchmaking_cancel_ticket", {
        p_user_id: profile.id,
        p_reason: "went_offline",
        p_request_id: null,
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
