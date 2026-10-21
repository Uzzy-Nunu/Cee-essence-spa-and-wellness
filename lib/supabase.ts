import { createBrowserClient } from "@supabase/ssr";

function getCleanUrl(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return rawUrl.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function getAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
}

export const supabase = () => {
  const url = getCleanUrl();
  const key = getAnonKey();
  return createBrowserClient(url, key);
};
