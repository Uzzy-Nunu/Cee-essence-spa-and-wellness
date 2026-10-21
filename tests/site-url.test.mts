import assert from "node:assert/strict";
import test from "node:test";
import { getPublicSiteUrl } from "../lib/site-url.ts";

test("uses only a trusted HTTPS site origin for redirects", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://spa.example";
    assert.equal(getPublicSiteUrl(), "https://spa.example");

    process.env.NEXT_PUBLIC_SITE_URL = "https://spa.example/path";
    assert.throws(() => getPublicSiteUrl(), /HTTPS site origin/);
    process.env.NEXT_PUBLIC_SITE_URL = "https://user:password@spa.example";
    assert.throws(() => getPublicSiteUrl(), /HTTPS site origin/);
    process.env.NEXT_PUBLIC_SITE_URL = "http://spa.example";
    assert.throws(() => getPublicSiteUrl(), /HTTPS site origin/);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  }
});
