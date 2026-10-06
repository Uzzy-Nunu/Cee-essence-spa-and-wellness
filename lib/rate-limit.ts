import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { adminSupabase } from "./supabase";

export async function enforceRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret) throw new Error("RATE_LIMIT_SECRET is not configured");
  const address = req.headers.get("x-vercel-forwarded-for")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const keyHash = createHmac("sha256", secret).update(address).digest("hex");
  const { data, error } = await adminSupabase().rpc("consume_api_rate_limit", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}
