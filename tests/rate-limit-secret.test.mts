import assert from "node:assert/strict";
import test from "node:test";
import { getRateLimitSecret } from "../lib/rate-limit-secret.ts";

test("prefers a dedicated rate-limit secret", () => {
  const originalSecret = process.env.RATE_LIMIT_SECRET;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.RATE_LIMIT_SECRET = "dedicated-secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    assert.equal(getRateLimitSecret(), "dedicated-secret");
  } finally {
    if (originalSecret === undefined) delete process.env.RATE_LIMIT_SECRET;
    else process.env.RATE_LIMIT_SECRET = originalSecret;
    if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
});

test("derives a stable, purpose-specific secret when the dedicated secret is absent", () => {
  const originalSecret = process.env.RATE_LIMIT_SECRET;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalWarn = console.warn;
  try {
    delete process.env.RATE_LIMIT_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    console.warn = () => {};
    const derived = getRateLimitSecret();
    assert.match(derived, /^[a-f0-9]{64}$/);
    assert.equal(getRateLimitSecret(), derived);
    assert.notEqual(derived, "service-role-key");
  } finally {
    console.warn = originalWarn;
    if (originalSecret === undefined) delete process.env.RATE_LIMIT_SECRET;
    else process.env.RATE_LIMIT_SECRET = originalSecret;
    if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
});

test("requires a secret when neither rate-limit nor Supabase secret is configured", () => {
  const originalSecret = process.env.RATE_LIMIT_SECRET;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.RATE_LIMIT_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => getRateLimitSecret(), /RATE_LIMIT_SECRET or SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    if (originalSecret === undefined) delete process.env.RATE_LIMIT_SECRET;
    else process.env.RATE_LIMIT_SECRET = originalSecret;
    if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
});
