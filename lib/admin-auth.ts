import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { adminSupabase } from "./supabase-admin";

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

export type AuthenticatedAdmin = {
  id: string;
  email: string;
  role: "super_admin" | "admin";
  isSuperAdmin: boolean;
};

export async function getAuthenticatedAdmin(req: NextRequest): Promise<AuthenticatedAdmin | null> {
  const authorization = req.headers.get("authorization");
  const token = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase authentication is not configured on the server.");
  }

  const { data: { user }, error: authError } = await createClient(url, anonKey).auth.getUser(token);
  if (authError || !user || !user.email) return null;

  const { data, error } = await adminSupabase()
    .from("admin_users")
    .select("id,role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load staff authorization record", error);
    if (error.code === "42703") {
      throw new Error("Staff access is not initialized in the database. Run supabase/admin-setup.sql in the Supabase SQL Editor.");
    }
    throw new Error("Unable to verify staff authorization. Check the server logs.");
  }
  if (!data) return null;

  const role = data.role === "super_admin" ? "super_admin" : "admin";

  return {
    id: user.id,
    email: user.email,
    role,
    isSuperAdmin: role === "super_admin",
  };
}
