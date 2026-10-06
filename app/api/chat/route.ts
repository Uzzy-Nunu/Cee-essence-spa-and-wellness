import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";

const context = `You are Cee Essence's warm, refined wellness concierge. Never invent facts, prices, durations, policies, or medical advice. Verified information: Cee Essence Spa & Wellness, “Where beauty meets refined wellness,” is at Shop P8, The Bints Centre by Haimbridge, Abuja. Hours Mon-Sat 10am-8pm, Sun 12pm-6pm. Phone +234 800 CEE-SPA1; email hello@ceeessencespa.com.
Treatments: Signature Cee Essence Massage (75 min, ₦55,000; Swedish/deep tissue and warm aromatherapy oil); Swedish Massage (60 min, ₦35,000; Deep Tissue Massage (60 min, ₦40,000); Hot Stone Massage (75 min, ₦45,000); Aromatherapy Massage (60 min, ₦38,000); Couple’s Massage (60 min, ₦75,000 for two); Prenatal Massage (60 min, ₦38,000). Signature Facial (60 min, ₦35,000); Hydrating Facial (45 min, ₦28,000); Brightening Facial (60 min, ₦40,000); Anti-Aging Facial (60 min, ₦45,000); Deep Cleansing Facial (45 min, ₦30,000). Body Scrub & Polish (45 min, ₦30,000); Detox Body Wrap (60 min, ₦40,000); Half-Day Pamper Package (3 hrs, ₦90,000). Signature Pedicure (60 min, ₦20,000); Signature Manicure (45 min, ₦16,000); Foot Reflexology (45 min, ₦22,000).
Therapists: Amaka O. performs Signature Cee Essence, Deep Tissue, Hot Stone and Swedish Massage. Chiamaka B. performs all five facial treatments. Grace N. performs Aromatherapy Massage, Body Scrub & Polish, Detox Body Wrap, Pedicure, Manicure and Foot Reflexology. Booking notice is 2 hours. Payment is at the spa. Rescheduling is free until 24 hours before; within 24 hours clients should contact the spa. Cancellations/no-shows inside 24 hours may have a fee. Clients should arrive 10–15 minutes early. Pregnant clients and those with allergies, skin conditions or recent surgery should tell staff first. Only offer a human handoff when explicitly asked or you cannot help; ask before the handoff.`;

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function POST(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "concierge", 12, 60)) {
      return NextResponse.json({ error: "Please wait a moment before sending another message." }, { status: 429 });
    }
  } catch (error) {
    console.error("Concierge rate-limit check failed", error);
    return NextResponse.json({ error: "The concierge is temporarily unavailable." }, { status: 503 });
  }

  let body: { message?: unknown; sessionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > 1000) {
    return NextResponse.json({ error: "Message must contain between 1 and 1000 characters." }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionIdPattern.test(sessionId)) {
    return NextResponse.json({ error: "A valid chat session ID is required." }, { status: 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "The wellness concierge is temporarily unavailable." }, { status: 503 });
  }

  const db = adminSupabase();
  try {
    const { data: history, error: historyError } = await db.from("chat_logs")
      .select("role,message")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (historyError) throw historyError;
    const { error: logError } = await db.from("chat_logs").insert({
      session_id: sessionId,
      role: "user",
      message: body.message.trim(),
    });
    if (logError) throw logError;

    const priorMessages = (history ?? []).reverse()
      .map((entry) => `${entry.role === "user" ? "Guest" : "Concierge"}: ${entry.message}`);
    const prompt = [
      ...priorMessages,
      `Guest: ${body.message.trim()}`,
      "Concierge:",
    ].join("\n");
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      .getGenerativeModel({ model: modelName, systemInstruction: context });
    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();
    if (!reply) throw new Error("The concierge returned an empty response.");
    const { error: replyLogError } = await db.from("chat_logs").insert({
      session_id: sessionId,
      role: "assistant",
      message: reply,
    });
    if (replyLogError) throw replyLogError;
    return NextResponse.json({ reply, sessionId });
  } catch (error) {
    console.error("Concierge request failed", error);
    return NextResponse.json({ error: "The concierge is temporarily unavailable. Please try again or contact our team." }, { status: 503 });
  }
}
