import assert from "node:assert/strict";
import test from "node:test";
import { appointmentEmail, escapeHtml } from "../lib/email.ts";

test("escapes user-controlled text before inserting it into email HTML", () => {
  assert.equal(escapeHtml(`<script>"&'</script>`), "&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;");
});

test("builds an escaped booking request email", () => {
  const email = appointmentEmail({
    full_name: "<Client>",
    email: "client@example.com",
    appointment_date: "2026-06-02",
    start_time: "10:30:00",
    service_name: "Massage & care",
    therapist_name: "A. Example",
  }, "request");
  assert.match(email.subject, /booking request/);
  assert.match(email.html, /&lt;Client&gt;/);
  assert.match(email.html, /Massage &amp; care/);
  assert.match(email.html, /pending confirmation/);
});
