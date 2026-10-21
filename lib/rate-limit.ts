import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { adminSupabase } from "./supabase-admin";
import { getRateLimitSecret } from "./rate-limit-secret";

export async function enforceRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const secret = getRateLimitSecret();
  const address =
    req.headers.get("x-vercel-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const keyHash = createHmac("sha256", secret).update(`${scope}:${address}`).digest("hex");
  const { data, error } = await adminSupabase().rpc("consume_api_rate_limit", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  if (typeof data !== "boolean") throw new Error("Rate-limit RPC returned an invalid response.");
  return data;
}
