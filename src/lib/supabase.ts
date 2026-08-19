import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function supabaseServerUrl(): string {
  return process.env.SUPABASE_INTERNAL_URL || env("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(supabaseServerUrl(), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseAsUser(token: string): SupabaseClient {
  return createClient(supabaseServerUrl(), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(supabaseServerUrl(), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
