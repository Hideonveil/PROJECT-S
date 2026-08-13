import { User } from "@supabase/supabase-js";
import { anonClient, supabaseAdmin } from "./supabase";
import type { Profile } from "./types";

export async function authUserFromToken(token: string | null | undefined): Promise<User | null> {
  if (!token) return null;
  try {
    const { data, error } = await anonClient().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function profileByAuthId(authUserId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export async function requireProfile(token: string | null | undefined): Promise<Profile | null> {
  const user = await authUserFromToken(token);
  if (!user) return null;
  return profileByAuthId(user.id);
}