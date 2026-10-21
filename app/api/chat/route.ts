/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { GoogleGenerativeAI, type Tool } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { availableSlots, findAvailableTherapistId } from "@/lib/availability";
import { appointmentEmail, ownerNotificationEmail, emailIsConfigured } from "@/lib/email";
import { Resend } from "resend";
import { isValidDate, isValidTime } from "@/lib/booking-rules";
import { getPublicSiteUrl } from "@/lib/site-url";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Dynamic System prompt builder: Pulls live services & therapists from admin DB
// ---------------------------------------------------------------------------
function buildSystemPrompt(
  services: Array<{ name: string; category?: string | null; duration_minutes: number; price: number; description?: string | null }>,
  therapists: Array<{ full_name: string; bio?: string | null }>,
  bookingPolicies?: string,
): string {
  let treatmentsText = "No treatments are currently active on the spa menu.";
  if (services.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const s of services) {
      const cat = s.category?.trim() || "General Treatments";
      if (!grouped[cat]) grouped[cat] = [];
      const cleanDesc = s.description ? s.description.replace(/\[img:(.*?)\]/g, "").trim() : "";
      const descPart = cleanDesc ? ` — ${cleanDesc}` : "";
      grouped[cat].push(`- **${s.name}** (${s.duration_minutes} min, ₦${s.price.toLocaleString()})${descPart}`);
    }
    treatmentsText = Object.entries(grouped)
      .map(([cat, items]) => `${cat}:\n${items.join("\n")}`)
      .join("\n\n");
  }

  const therapistsText = therapists.length > 0
    ? therapists.map((t) => `- **${t.full_name}**${t.bio ? `: ${t.bio}` : ""}`).join("\n")
    : "Professional certified wellness therapists.";

  const policiesSummary = bookingPolicies
    ? bookingPolicies.trim()
    : "A 50% advance deposit is required via Paystack to confirm reservations; the remaining balance is due at the spa. 24 hours notice required for cancellations or rescheduling. Please arrive 5–10 minutes early.";

  return `You are Ask Cee, the Cee Essence wellness concierge — warm, empathetic, professional, and efficient.

BUSINESS FACTS (use only these, never invent):
- Name: Cee Essence Spa & Wellness — "Where beauty meets refined wellness"
- Location: Shop P8, The Bints Centre by Haimbridge, Abuja
- Phone: +234 800 CEE-SPA1 | Email: hello@ceeessencespa.com
- Hours: Mon–Sat 10:00am–8:00pm, Sunday 12:00pm–6:00pm
- 2-hour advance booking notice required.
- Payment: 50% deposit required online via Paystack to confirm reservation; the remaining balance payment is due at the spa.
- Arrival: Arrive 5–10 minutes early. Cancellations/rescheduling free with 24 hours advance notice.

OFFICIAL BOOKING & SPA POLICIES (call check_policies tool for full live policy details):
${policiesSummary}

AVAILABLE TREATMENTS (STRICT: These are the ONLY treatments offered, dynamically loaded in real-time from our live admin dashboard. Never mention, recommend, or invent any service that is not in this exact list):
${treatmentsText}

ACTIVE THERAPISTS:
${therapistsText}

CRITICAL RULES FOR TREATMENT INQUIRIES:
- You must ONLY recommend or confirm treatments that exist in the "AVAILABLE TREATMENTS" list above.
- If a guest asks about a treatment category or service that is NOT in the list above (for example, foot care, pedicure, or a treatment not currently listed), politely and warmly state that we do not currently offer that specific treatment on our menu. Then graciously share what treatments ARE currently available from our menu.
- Never make up prices, durations, or treatments. Only use the treatments listed above.

POLICY INQUIRIES:
- Whenever a guest asks about cancellation rules, deposit requirements, refunds, late arrivals, or policies, you can answer concisely from the policies above or call the check_policies tool. Always emphasize the 50% deposit policy clearly and warmly.

FORMATTING RULES:
- Use clear line breaks between paragraphs. Never write a solid wall of text.
- Use bullet points (start each bullet with "- ") for lists of treatments, times, or requested items.
- Use **bold** to highlight treatment names, prices, dates, and important fields.
- Keep replies concise, empathetic, and conversational.

COMPLAINTS & HUMAN HANDOFF WORKFLOW (CRITICAL):
When a guest mentions wanting to lay a complaint, speak to a human, report an issue, or request a refund:
DO NOT call raise_support_ticket immediately!
You must follow this exact conversation sequence:

1. FIRST, ASK WHAT THEIR COMPLAINT IS & REQUEST THEIR DETAILS:
- Empathize warmly (e.g. "I'm very sorry to hear you've experienced an issue").
- Ask what happened: "Could you please share the details of your complaint or what went wrong?"
- In the same reply, ask for their contact info:
  - Your **Full Name**
  - Your **Phone Number**
  - Your **Email Address**
- Explain that once they provide these details, you will log an official support ticket for management to contact them.

2. GATHER ANY MISSING DETAILS:
- If they told you their complaint but didn't provide their name or phone/email, ask for their contact details.
- If they gave their contact info but haven't described the issue yet, ask what their complaint is about.
- NEVER call raise_support_ticket until the guest has ACTUALLY DESCRIBED what went wrong!

3. RAISE THE TICKET ON THEIR BEHALF:
- ONLY when you have BOTH the specific complaint description AND their contact info (name and phone or email), call raise_support_ticket.
- Pass their actual grievance description as the complaint_details parameter.

BOOKING FLOW:
When a guest asks to book, collect:
1. Treatment name
2. Preferred date (YYYY-MM-DD)
3. Preferred time (call check_available_slots to show options first)
4. Full name, email, and phone number
When you have all confirmed fields, call book_appointment immediately. Remind them that a 50% deposit secures their reservation.`;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "check_policies",
        description: "Check the spa's official booking, cancellation, rescheduling, 50% deposit, and attendance policies. Call this whenever a guest asks about policies, deposits, cancellation rules, late arrivals, or rescheduling.",
        parameters: {
          type: "OBJECT" as any,
          properties: {},
        },
      },
      {
        name: "check_available_slots",
        description: "Check available time slots for a treatment on a given date. Call this when a guest is looking for a time to book.",
        parameters: {
          type: "OBJECT" as any,
          properties: {
            service_name: { type: "STRING" as any, description: "Treatment name, e.g. 'Swedish Massage'" },
            date: { type: "STRING" as any, description: "Date in YYYY-MM-DD format" },
          },
          required: ["service_name", "date"],
        },
      },
      {
        name: "book_appointment",
        description: "Book an appointment after collecting all required guest details (treatment, date, confirmed slot, name, email, phone).",
        parameters: {
          type: "OBJECT" as any,
          properties: {
            service_name: { type: "STRING" as any, description: "Treatment name" },
            appointment_date: { type: "STRING" as any, description: "Date in YYYY-MM-DD format" },
            start_time: { type: "STRING" as any, description: "Time in HH:MM or HH:MM:SS" },
            client_name: { type: "STRING" as any, description: "Guest full name" },
            client_email: { type: "STRING" as any, description: "Guest email address" },
            client_phone: { type: "STRING" as any, description: "Guest phone number" },
            notes: { type: "STRING" as any, description: "Special notes/requests. Empty string if none." },
          },
          required: ["service_name", "appointment_date", "start_time", "client_name", "client_email", "client_phone"],
        },
      },
      {
        name: "raise_support_ticket",
        description: "Log an official support ticket for management. ONLY call this when the guest has described their complaint AND provided their contact info.",
        parameters: {
          type: "OBJECT" as any,
          properties: {
            client_name: { type: "STRING" as any, description: "Guest full name" },
            client_email: { type: "STRING" as any, description: "Guest email address (optional if phone given)" },
            client_phone: { type: "STRING" as any, description: "Guest phone number (optional if email given)" },
            complaint_details: { type: "STRING" as any, description: "Detailed explanation of the guest's complaint or issue" },
          },
          required: ["client_name", "complaint_details"],
        },
      },
    ],
  } as unknown as Tool,
];

// ---------------------------------------------------------------------------
// Tool execution handlers with instant, deterministic, complete formatting
// ---------------------------------------------------------------------------
async function handleCheckSlots(args: Record<string, string>): Promise<{ reply: string }> {
  const { service_name, date } = args;
  if (!isValidDate(date)) {
    return { reply: "Could you please provide the date in **YYYY-MM-DD** format (e.g., 2026-10-25) so I can check availability for you?" };
  }
  try {
    const db = adminSupabase();
    // Resolve service to its actual UUID
    const { data: service } = await db
      .from("services")
      .select("id,name,duration_minutes,price")
      .ilike("name", `%${service_name.trim()}%`)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!service) {
      return {
        reply: `I could not locate the treatment **${service_name}** on our active menu. Please let me know which treatment you'd like, or ask me to show you our available services!`,
      };
    }

    const slots = await availableSlots(service.id, date);
    if (!slots || slots.length === 0) {
      return {
        reply: `We do not have any open slots for **${service.name}** on **${date}**.\n\nWould you like to try another date?`,
      };
    }
    const slotList = slots.slice(0, 8).map((s) => `- **${s.slice(0, 5)}**`).join("\n");
    return {
      reply: `Here are available times for **${service.name}** (${service.duration_minutes} min, ₦${service.price.toLocaleString()}) on **${date}**:\n\n${slotList}\n\nTo reserve a slot, let me know your preferred time along with your **Full Name**, **Phone Number**, and **Email Address**!`,
    };
  } catch (err) {
    console.error("check_available_slots error", err);
    return { reply: "I was unable to verify slot availability at this moment. Please let me know another date or time to check." };
  }
}

async function handleBookAppointment(args: Record<string, string>): Promise<{ reply: string }> {
  const { service_name, appointment_date, start_time, client_name, client_email, client_phone, notes = "" } = args;
  const normEmail = client_email.trim().toLowerCase();
  const normPhone = client_phone.trim();
  const normName = client_name.trim();
  if (
    normName.length < 2
    || normName.length > 120
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)
    || normEmail.length > 254
    || normPhone.length < 6
    || normPhone.length > 40
    || notes.length > 2000
  ) {
    return { reply: "Please provide a valid full name, email address, phone number, and notes within the allowed length." };
  }

  if (!isValidDate(appointment_date)) {
    return { reply: "Please provide a valid appointment date in **YYYY-MM-DD** format." };
  }
  const normTime = start_time.length === 5 ? `${start_time}:00` : start_time;
  if (!isValidTime(normTime)) {
    return { reply: "Please choose a valid appointment time." };
  }

  const db = adminSupabase();

  // Find service
  const { data: service } = await db
    .from("services")
    .select("id,name,duration_minutes,price")
    .ilike("name", `%${service_name.trim()}%`)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!service) {
    return { reply: `I could not locate the treatment **${service_name}** in our active system. Please check the name or ask me for our menu.` };
  }
  if (!Number.isInteger(service.duration_minutes) || service.duration_minutes < 1
    || !Number.isFinite(Number(service.price)) || Number(service.price) <= 0) {
    return { reply: "This treatment cannot be booked right now because its price or duration is invalid. Please contact our team." };
  }

  // Verify slot availability
  const slots = await availableSlots(service.id, appointment_date);
  if (!slots.includes(normTime)) {
    const suggestions = slots.slice(0, 4).map((s) => `- **${s.slice(0, 5)}**`).join("\n");
    return {
      reply: `The **${normTime.slice(0, 5)}** slot is no longer available on **${appointment_date}**.\n\nHere are a few nearby available slots:\n${suggestions}\n\nWould one of these work for you?`,
    };
  }

  // Calculate end time
  const [h, m] = normTime.split(":").map(Number);
  const endTotal = h * 60 + m + (service.duration_minutes || 60);
  const endTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}:00`;

  // Find therapist
  const therapistId = await findAvailableTherapistId(service.id, appointment_date, normTime, endTime);
  if (!therapistId) {
    return { reply: "No therapist is available at that specific time. Please select another slot." };
  }

  // 50% deposit calculation & Paystack checkout URL
  const depositAmount = Math.max(1, Math.round((service.price || 0) * 0.5));
  const paystackRef = `cee_chat_${randomUUID()}`;
  let origin: string;
  try {
    origin = getPublicSiteUrl();
  } catch (error) {
    console.error("Concierge booking site URL is invalid", error);
    return { reply: "Secure checkout is temporarily unavailable. Please contact our team to complete your booking." };
  }
  let payUrl = "";

  try {
    const { initializePaystackTransaction } = await import("@/lib/paystack");
    const paystackResult = await initializePaystackTransaction({
      email: normEmail,
      amountInNaira: depositAmount,
      callbackUrl: `${origin}/booking/callback`,
      reference: paystackRef,
      channels: ["card", "bank_transfer"],
      metadata: {
        service_id: service.id,
        service_name: service.name,
        full_name: normName,
        email: normEmail,
        phone: normPhone,
        appointment_date,
        start_time: normTime,
        end_time: endTime,
        therapist_id: therapistId,
        deposit_amount: depositAmount,
        full_price: service.price,
        source: "chatbot",
        notes,
      },
    });
    payUrl = paystackResult.authorization_url;
  } catch (paystackErr) {
    console.error("Chatbot Paystack initialization failed:", paystackErr);
    return { reply: "Secure checkout is temporarily unavailable, so I have not created a booking. Please try again or contact our team." };
  }

  const depositNote = `[Treatments: ${service.name} | Total: ₦${(service.price || 0).toLocaleString()} | 50% Deposit: ₦${depositAmount.toLocaleString()} | Ref: ${paystackRef}]`;
  const fullNotes = notes ? `${notes} ${depositNote}` : depositNote;

  // Insert appointment
  const { data: appt, error } = await db
    .from("appointments")
    .insert({
      service_id: service.id,
      therapist_id: therapistId,
      appointment_date,
      start_time: normTime,
      end_time: endTime,
      full_name: normName,
      email: normEmail,
      phone: normPhone,
      notes: fullNotes,
      status: "pending",
      payment_status: "pending",
      paystack_reference: paystackRef,
    })
    .select("id,full_name,email,appointment_date,start_time,therapists(full_name)")
    .single();

  if (error || !appt) {
    console.error("Concierge booking insert failed", error);
    return { reply: "I apologize, but I could not save your reservation right now. Please try booking directly via our booking form above." };
  }

  const therapistName = (appt.therapists as unknown as { full_name: string } | null)?.full_name ?? null;

  return {
    reply: `✨ **Your appointment has been reserved!**\n\n**Reservation Details:**\n- **Treatment**: ${service.name}\n- **Date**: ${appointment_date}\n- **Time**: ${normTime.slice(0, 5)}\n- **Guest**: ${normName}\n- **Therapist**: ${therapistName || "Any available therapist"}\n- **50% Deposit Due**: ₦${depositAmount.toLocaleString()} *(Balance ₦${(service.price - depositAmount).toLocaleString()} payable at spa)*\n\nTo hold and confirm your booking, please complete your secure 50% deposit using Card or Bank Transfer:\n👉 [**Complete 50% Deposit on Paystack →**](${payUrl || `${origin}/#book`})\n\n*(Your slot is held while awaiting payment.)*`,
  };
}

async function handleRaiseTicket(args: Record<string, string>): Promise<{ reply: string }> {
  const client_name = (args.client_name || "").trim();
  const client_email = (args.client_email || "").trim();
  const client_phone = (args.client_phone || "").trim();
  const complaint = (args.complaint_details || args.message || "").trim();

  const db = adminSupabase();

  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client_email);
  const hasPhone = client_phone.length >= 6;

  const { data, error } = await db
    .from("support_tickets")
    .insert({
      client_name: client_name || "Guest",
      client_email: hasEmail ? client_email.toLowerCase() : "via-chatbot@ceeessencespa.com",
      client_phone: hasPhone ? client_phone : "via chat",
      message: complaint || "Guest submitted a complaint via concierge chat.",
      source: "chatbot",
      status: "open",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Concierge ticket insert failed", error);
    return {
      reply: "I apologize, but I had trouble submitting the ticket right now. Please email us directly at **hello@ceeessencespa.com** or call **+234 800 CEE-SPA1** so we can resolve this immediately.",
    };
  }

  const shortId = data.id.slice(0, 8);
  const contactString = [hasPhone ? client_phone : null, hasEmail ? client_email : null].filter(Boolean).join(" | ");

  return {
    reply: `I have officially submitted your complaint to our management team.\n\n**Ticket Details**:\n- **Reference ID**: #${shortId}\n- **Client Name**: ${client_name}\n- **Contact Info**: ${contactString || "Logged via chat"}\n- **Complaint Logged**: ${complaint}\n\nOur management team has received this in their dashboard and will review the issue and reach out to you directly to resolve this. Thank you for your patience and for bringing this to our attention.`,
  };
}

async function handleCheckPolicies(): Promise<{ reply: string }> {
  try {
    const db = adminSupabase();
    const { data } = await db.from("spa_settings").select("booking_policies").limit(1).maybeSingle();
    const policies = data?.booking_policies?.trim();
    if (policies) {
      return {
        reply: `Here are our official Cee Essence policies:\n\n${policies}\n\nLet me know if you would like me to assist with reserving a treatment!`,
      };
    }
  } catch (err) {
    console.error("check_policies error", err);
  }
  return {
    reply: "Our official booking guidelines require a **50% advance deposit** to confirm your reservation, with at least 24 hours notice for rescheduling or cancellations. We kindly ask guests to arrive 5–10 minutes prior to their session.",
  };
}

async function executeTool(name: string, args: Record<string, string>): Promise<{ reply: string }> {
  if (name === "check_policies") return handleCheckPolicies();
  if (name === "check_available_slots") return handleCheckSlots(args);
  if (name === "book_appointment") return handleBookAppointment(args);
  if (name === "raise_support_ticket") return handleRaiseTicket(args);
  return { reply: "I'm not sure how to perform that action." };
}

// ---------------------------------------------------------------------------
// In-Memory Spa Context Cache (Drastically reduces DB round trips & lag)
// ---------------------------------------------------------------------------
type CachedSpaContext = {
  timestamp: number;
  services: any[];
  therapists: any[];
  policies: string;
};

let cachedSpaData: CachedSpaContext | null = null;
const CACHE_TTL_MS = 300 * 1000; // 5 minutes TTL for ultra-fast replies

async function getLiveSpaContext(db: any): Promise<CachedSpaContext> {
  const now = Date.now();
  if (cachedSpaData && now - cachedSpaData.timestamp < CACHE_TTL_MS) {
    return cachedSpaData;
  }

  try {
    const [{ data: activeServices }, { data: activeTherapists }, { data: settings }] = await Promise.all([
      db.from("services").select("name,category,duration_minutes,price,description").eq("is_active", true).order("category").order("price"),
      db.from("therapists").select("full_name,bio").eq("is_active", true),
      db.from("spa_settings").select("booking_policies").limit(1).maybeSingle(),
    ]);

    cachedSpaData = {
      timestamp: now,
      services: activeServices || [],
      therapists: activeTherapists || [],
      policies: settings?.booking_policies || "",
    };
    return cachedSpaData;
  } catch (err) {
    console.warn("Spa context cache fetch fallback:", err);
    if (cachedSpaData) return cachedSpaData;
    return { timestamp: now, services: [], therapists: [], policies: "" };
  }
}

// ---------------------------------------------------------------------------
// Constants & Models (Prioritize fast gemini-3.5-flash)
// ---------------------------------------------------------------------------
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANDIDATE_MODELS = Array.from(
  new Set([
    process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
  ]),
);

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "chat", 30, 60)) {
      return NextResponse.json({ error: "Please wait a moment before sending another message." }, { status: 429 });
    }
  } catch (error) {
    console.error("Chat rate-limit check failed", error);
    return NextResponse.json({ error: "The concierge is temporarily unavailable." }, { status: 503 });
  }

  let body: { message?: unknown; sessionId?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  if (typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > 1000) {
    return NextResponse.json({ error: "Message must contain between 1 and 1000 characters." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionIdPattern.test(sessionId)) {
    return NextResponse.json({ error: "A valid chat session ID is required." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The wellness concierge is temporarily unavailable." }, { status: 503 });
  }

  const db = adminSupabase();
  const userMessage = body.message.trim();

  // Log user message asynchronously without blocking the reply
  void Promise.resolve(
    db.from("chat_logs").insert({ session_id: sessionId, role: "user", message: userMessage }),
  ).catch((e: unknown) => console.warn("chat_logs user write failed", e));

  try {
    // 1. Concurrently fetch chat history & cached spa context in parallel
    const [historyLogs, spaContext] = await Promise.all([
      Promise.resolve(
        db
          .from("chat_logs")
          .select("role,message")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(8),
      ).catch(() => ({ data: [] })),
      getLiveSpaContext(db),
    ]);

    let history: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    const logs = historyLogs.data;
    if (logs && logs.length > 0) {
      const reversed = [...logs].reverse();
      for (const entry of reversed) {
        const role = entry.role === "user" ? "user" : "model";
        if (history.length > 0 && history[history.length - 1].role === role) continue;
        history.push({ role, parts: [{ text: entry.message }] });
      }
      while (history.length > 0 && history[0].role !== "user") history.shift();
    }

    const systemPrompt = buildSystemPrompt(
      spaContext.services,
      spaContext.therapists,
      spaContext.policies,
    );

    const genAI = new GoogleGenerativeAI(apiKey);
    let reply = "";
    let lastError: unknown = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          tools: TOOLS,
          generationConfig: {
            maxOutputTokens: 380,
            temperature: 0.3, // Snappier, more focused and deterministic
          },
        });

        const chat = model.startChat({ history: history as any });
        const response = await chat.sendMessage(userMessage);

        const calls = response.response.functionCalls?.();
        if (calls && calls.length > 0) {
          const call = calls[0];
          const toolResult = await executeTool(call.name, call.args as Record<string, string>);
          reply = toolResult.reply;
        } else {
          reply = response.response.text().trim();
        }

        if (reply) break;
      } catch (e) {
        console.warn(`Model ${modelName} failed:`, e);
        lastError = e;
      }
    }

    if (!reply) throw lastError || new Error("Empty response from concierge.");

    // Log assistant reply asynchronously
    void Promise.resolve(
      db.from("chat_logs").insert({ session_id: sessionId, role: "assistant", message: reply }),
    ).catch((e: unknown) => console.warn("chat_logs assistant write failed", e));

    return NextResponse.json({ reply, sessionId });
  } catch (error) {
    console.error("Concierge request failed", error);
    return NextResponse.json(
      { error: "The concierge is temporarily unavailable. Please try again or contact our team." },
      { status: 503 },
    );
  }
}
