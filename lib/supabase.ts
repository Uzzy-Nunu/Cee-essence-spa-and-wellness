import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function getCleanUrl(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return rawUrl.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function getAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
}

function getServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export const supabase = () => {
  const url = getCleanUrl();
  const key = getAnonKey();
  return createBrowserClient(url, key);
};

export const adminSupabase = () => {
  const url = getCleanUrl();
  const key = getServiceRoleKey();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};
