import { NextResponse } from "next/server";
import { authUserFromToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import type { Session } from "@/lib/types";

function mapSession(s: Session | null) {
  if (!s) return null;
  return {
    id: s.id,
    roomCode: s.room_code,
    players: s.players,
    need: s.need,
    outcomeBy: s.outcome_by,
    rematchBy: s.rematch_by,
    status: s.status,
    createdAt: s.created_at,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json();
    const token = String(body.token || "");
    const authUser = await authUserFromToken(token);
    if (!authUser) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: me } = await admin.from("profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();
    if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data: session } = await admin.from("sessions").select("*").eq("room_code", code).maybeSingle();
    if (!session || !(session.players || []).includes(me.id)) {
      return NextResponse.json({ error: "对局不存在" }, { status: 404 });
    }

    const choice = body.choice === "yes" ? "yes" : "no";
    const rematchBy = { ...(session.rematch_by || {}), [me.id]: choice };
    await admin.from("sessions").update({ rematch_by: rematchBy }).eq("id", session.id);
    const { data: updated } = await admin.from("sessions").select("*").eq("id", session.id).single();

    const players: string[] = updated.players || [];
    const decided = players.filter((p) => updated.rematch_by?.[p]);
    let connected = false;
    if (players.length && decided.length === players.length) {
      const allYes = decided.every((p) => updated.rematch_by[p] === "yes");
      connected = allYes;
      if (allYes) {
        const rows: Array<{ user_id: string; friend_id: string }> = [];
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            rows.push({ user_id: players[i], friend_id: players[j] });
            rows.push({ user_id: players[j], friend_id: players[i] });
          }
        }
        if (rows.length) {
          await admin.from("friendships").upsert(rows, { onConflict: "user_id,friend_id", ignoreDuplicates: true });
        }
      }
    }

    return NextResponse.json({ session: mapSession(updated), connected });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: 500 });
  }
}