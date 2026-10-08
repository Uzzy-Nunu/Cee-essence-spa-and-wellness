import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { adminSupabase } from "./supabase";

// In-memory fallback map for environments without database RPC
const localHits = new Map<string, number[]>();

export async function enforceRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const secret = process.env.RATE_LIMIT_SECRET || "cee-essence-fallback-secret-key-2026";
  const address =
    req.headers.get("x-vercel-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1";

  const keyHash = createHmac("sha256", secret).update(`${scope}:${address}`).digest("hex");

  try {
    const { data, error } = await adminSupabase().rpc("consume_api_rate_limit", {
      p_scope: scope,
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch (rpcError) {
    // Database RPC not installed or unavailable; proceed to in-memory rate limiter
  }

  // Graceful In-Memory Rate Limiting fallback
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const timestamps = (localHits.get(keyHash) || []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    return false;
  }

  timestamps.push(now);
  localHits.set(keyHash, timestamps);
  return true;
}
