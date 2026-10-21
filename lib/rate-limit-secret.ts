import { createHmac } from "node:crypto";

let warnedAboutDerivedSecret = false;

export function getRateLimitSecret(): string {
  const configuredSecret = process.env.RATE_LIMIT_SECRET;
  if (configuredSecret) return configuredSecret;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Configure RATE_LIMIT_SECRET or SUPABASE_SERVICE_ROLE_KEY to enable rate limiting.");
  }

  if (!warnedAboutDerivedSecret) {
    console.warn(
      "RATE_LIMIT_SECRET is not configured; using a domain-separated key derived from SUPABASE_SERVICE_ROLE_KEY. Configure a dedicated RATE_LIMIT_SECRET for production.",
    );
    warnedAboutDerivedSecret = true;
  }

  return createHmac("sha256", serviceRoleKey)
    .update("cee-essence:rate-limit-secret:v1")
    .digest("hex");
}
