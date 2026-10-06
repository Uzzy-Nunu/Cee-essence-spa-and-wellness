import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { adminSupabase } from "./supabase";

export async function authorizedAdmin(req: NextRequest): Promise<boolean> {
  const authorization = req.headers.get("authorization");
  const token = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public environment variables are not configured");

  const { data: { user }, error: authError } = await createClient(url, anonKey).auth.getUser(token);
  if (authError || !user) return false;

  const { data, error } = await adminSupabase()
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
