import { NextResponse } from "next/server";
import { poolCounts } from "@/lib/api";

export async function GET() {
  try {
    const counts = await poolCounts();
    return NextResponse.json({ ok: true, ...counts });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "database unavailable" },
      { status: 500 }
    );
  }
}