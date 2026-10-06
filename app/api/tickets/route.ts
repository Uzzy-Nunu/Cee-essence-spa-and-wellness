import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "support-ticket", 5, 600)) {
      return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
    }
  } catch (error) {
    console.error("Support ticket rate-limit check failed", error);
    return NextResponse.json({ error: "Support requests are temporarily unavailable." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const clientName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const clientEmail = typeof body.client_email === "string" ? body.client_email.trim().toLowerCase() : "";
  const clientPhone = typeof body.client_phone === "string" ? body.client_phone.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const source = body.source === "chatbot" || body.source === "form" ? body.source : "other";

  if (clientName.length < 2 || clientName.length > 120
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) || clientEmail.length > 254
    || clientPhone.length < 6 || clientPhone.length > 40
    || message.length < 1 || message.length > 2000) {
    return NextResponse.json({ error: "Please provide valid contact details and a message." }, { status: 400 });
  }

  const { data, error } = await adminSupabase().from("support_tickets").insert({
    client_name: clientName,
    client_email: clientEmail,
    client_phone: clientPhone,
    message,
    source,
  }).select("id").single();
  if (error) {
    console.error("Support ticket creation failed", error);
    return NextResponse.json({ error: "Unable to create support request." }, { status: 500 });
  }

  let staffNotificationSent = false;
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const slackResponse = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New Cee Essence support ticket\nClient: ${clientName}\nEmail: ${clientEmail}\nPhone: ${clientPhone}\nMessage: ${message}`,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!slackResponse.ok) throw new Error(`Slack returned HTTP ${slackResponse.status}`);
      staffNotificationSent = true;
    } catch (notificationError) {
      console.error("Support ticket Slack notification failed", notificationError);
    }
  }
  return NextResponse.json({ ticket: data, staffNotificationSent }, { status: 201 });
}
