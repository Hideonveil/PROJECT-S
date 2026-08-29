import { NextResponse } from "next/server";
import { gameRegistry } from "../../../lib/games/registry";
import { publicGameCatalog } from "../../../lib/games/public-catalog";

export function GET() {
  return NextResponse.json({
    supabaseUrl: process.env.SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    games: publicGameCatalog(gameRegistry),
  });
}
