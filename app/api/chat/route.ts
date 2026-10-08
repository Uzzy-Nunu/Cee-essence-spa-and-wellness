import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";

const context = `You are Cee Essence's warm, refined wellness concierge. Never invent facts, prices, durations, policies, or medical advice.
Verified information: 
- Cee Essence Spa & Wellness, “Where beauty meets refined wellness,” is located at Shop P8, The Bints Centre by Haimbridge, Abuja.
- Opening hours: Monday–Saturday 10:00am–8:00pm, Sunday 12:00pm–6:00pm.
- Phone: +234 800 CEE-SPA1; Email: hello@ceeessencespa.com.
- Treatments:
  * Massage Treatments: Signature Cee Essence Massage (75 min, ₦55,000; Swedish and deep tissue blend with warm aromatherapy oil); Swedish Massage (60 min, ₦35,000); Deep Tissue Massage (60 min, ₦40,000); Hot Stone Massage (75 min, ₦45,000); Aromatherapy Massage (60 min, ₦38,000); Couple’s Massage (60 min, ₦75,000 for two); Prenatal Massage (60 min, ₦38,000).
  * Facial Treatments: Signature Facial (60 min, ₦35,000); Hydrating Facial (45 min, ₦28,000); Brightening Facial (60 min, ₦40,000); Anti-Aging Facial (60 min, ₦45,000); Deep Cleansing Facial (45 min, ₦30,000).
  * Body Treatments: Body Scrub & Polish (45 min, ₦30,000); Detox Body Wrap (60 min, ₦40,000); Half-Day Pamper Package (3 hrs, ₦90,000).
  * Hand & Foot Treatments: Signature Pedicure (60 min, ₦20,000); Signature Manicure (45 min, ₦16,000); Foot Reflexology (45 min, ₦22,000).
- Therapists: Amaka O. (Massages), Chiamaka B. (Facials), Grace N. (Body & Nail therapies).
- Booking notice: 2 hours. Payment is made at the spa upon arrival.
- Arrival: Please arrive 10–15 minutes early. Rescheduling is free up to 24 hours in advance.
- Only offer human handoff when explicitly asked or if you cannot answer a specific medical request.`;

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.7-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
];

export async function POST(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "concierge", 20, 60)) {
      return NextResponse.json({ error: "Please wait a moment before sending another message." }, { status: 429 });
    }
  } catch (error) {
    console.error("Concierge rate-limit check failed", error);
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The wellness concierge is temporarily unavailable (Missing API key)." }, { status: 503 });
  }

  const db = adminSupabase();
  const userMessage = body.message.trim();

  try {
    // 1. Fetch previous conversation context safely
    let historyText = "";
    try {
      const { data: history } = await db
        .from("chat_logs")
        .select("role,message")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(8);

      if (history && history.length > 0) {
        historyText = history
          .reverse()
          .map((entry) => `${entry.role === "user" ? "Guest" : "Concierge"}: ${entry.message}`)
          .join("\n");
      }
    } catch (historyErr) {
      console.warn("Could not load chat history", historyErr);
    }

    // 2. Log user message to DB safely in background
    try {
      await db.from("chat_logs").insert({
        session_id: sessionId,
        role: "user",
        message: userMessage,
      });
    } catch (logErr) {
      console.warn("Could not write user message to chat_logs", logErr);
    }

    // 3. Assemble prompt
    const prompt = historyText
      ? `${historyText}\nGuest: ${userMessage}\nConcierge:`
      : `Guest: ${userMessage}\nConcierge:`;

    // 4. Call Gemini AI with automatic model fallback
    const genAI = new GoogleGenerativeAI(apiKey);
    let reply = "";
    let lastGenError: unknown = null;

    const uniqueModels = Array.from(new Set(CANDIDATE_MODELS));
    for (const modelCandidate of uniqueModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelCandidate,
          systemInstruction: context,
        });
        const result = await model.generateContent(prompt);
        reply = result.response.text().trim();
        if (reply) break;
      } catch (genError) {
        console.warn(`Model ${modelCandidate} failed, trying fallback:`, genError);
        lastGenError = genError;
      }
    }

    if (!reply) {
      throw lastGenError || new Error("The concierge returned an empty response.");
    }

    // 5. Log assistant response to DB safely
    try {
      await db.from("chat_logs").insert({
        session_id: sessionId,
        role: "assistant",
        message: reply,
      });
    } catch (replyLogErr) {
      console.warn("Could not write assistant reply to chat_logs", replyLogErr);
    }

    return NextResponse.json({ reply, sessionId });
  } catch (error) {
    console.error("Concierge request failed", error);
    return NextResponse.json(
      { error: "The concierge is temporarily unavailable. Please try again or contact our team." },
      { status: 503 },
    );
  }
}
