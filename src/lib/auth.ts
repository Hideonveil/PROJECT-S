import { User } from "@supabase/supabase-js";
import { anonClient, supabaseAdmin } from "./supabase";
import type { Profile } from "./types";
import { AppError, bearerToken } from "./http";

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

export async function requireRequestProfile(
  request: Request,
  legacyBody?: Record<string, unknown>
): Promise<Profile> {
  const token = bearerToken(request, legacyBody);
  const profile = await requireProfile(token);
  if (!profile) throw new AppError("AUTH_REQUIRED", "请先登录", 401);
  const clientInstanceId = String(request.headers.get("x-client-instance-id") || "").trim().slice(0, 120);
  const admin = supabaseAdmin();
  const { data: activeClient, error: activeClientError } = await admin
    .from("profile_active_clients")
    .select("client_instance_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (activeClientError) throw activeClientError;
  if (activeClient && (!clientInstanceId || activeClient.client_instance_id !== clientInstanceId)) {
    throw new AppError("DEVICE_SESSION_REPLACED", "此账号已在另一台设备登录", 409, false);
  }
  if (!activeClient && clientInstanceId) {
    await admin.from("profile_active_clients").upsert({ profile_id: profile.id, client_instance_id: clientInstanceId }, { onConflict: "profile_id" });
  }
  return profile;
}
