/* eslint-disable @typescript-eslint/no-explicit-any */
import { GoogleGenerativeAI, type Tool } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { availableSlots, findAvailableTherapistId } from "@/lib/availability";
import { appointmentEmail, ownerNotificationEmail, emailIsConfigured } from "@/lib/email";
import { Resend } from "resend";
import { isValidDate, isValidTime } from "@/lib/booking-rules";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the Cee Essence wellness concierge — warm, empathetic, professional, and efficient.

BUSINESS FACTS (use only these, never invent):
- Name: Cee Essence Spa & Wellness — "Where beauty meets refined wellness"
- Location: Shop P8, The Bints Centre by Haimbridge, Abuja
- Phone: +234 800 CEE-SPA1 | Email: hello@ceeessencespa.com
- Hours: Mon–Sat 10:00am–8:00pm, Sunday 12:00pm–6:00pm
- 2-hour advance booking notice required. Payment at spa upon arrival.
- Arrive 10–15 minutes early. Rescheduling free up to 24 hours in advance.

TREATMENTS:
Massage: Signature Cee Essence Massage (75 min, ₦55,000), Swedish Massage (60 min, ₦35,000), Deep Tissue Massage (60 min, ₦40,000), Hot Stone Massage (75 min, ₦45,000), Aromatherapy Massage (60 min, ₦38,000), Couple's Massage (60 min, ₦75,000 for two), Prenatal Massage (60 min, ₦38,000)
Facials: Signature Facial (60 min, ₦35,000), Hydrating Facial (45 min, ₦28,000), Brightening Facial (60 min, ₦40,000), Anti-Aging Facial (60 min, ₦45,000), Deep Cleansing Facial (45 min, ₦30,000)
Body: Body Scrub & Polish (45 min, ₦30,000), Detox Body Wrap (60 min, ₦40,000), Half-Day Pamper Package (3 hrs, ₦90,000)
Hand & Foot: Signature Pedicure (60 min, ₦20,000), Signature Manicure (45 min, ₦16,000), Foot Reflexology (45 min, ₦22,000)
Therapists: Amaka O. (Massages), Chiamaka B. (Facials), Grace N. (Body & Nail)

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
When you have all confirmed fields, call book_appointment immediately.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const TOOLS: Tool[] = [
  {
    functionDeclarations: [
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
    return { reply: "Could you please provide the date in **YYYY-MM-DD** format (e.g., 2026-10-15) so I can check availability?" };
  }
  try {
    const slots = await availableSlots(service_name, date);
    if (!slots || slots.length === 0) {
      return {
        reply: `We do not have any open slots for **${service_name}** on **${date}**.\n\nWould you like to try a different date or another treatment?`,
      };
    }
    const slotList = slots.slice(0, 8).map((s) => `- **${s.slice(0, 5)}**`).join("\n");
    return {
      reply: `Here are the available time slots for **${service_name}** on **${date}**:\n\n${slotList}\n\nWhich time works best for you? Let me know, along with your full name, email, and phone number, and I will gladly reserve it!`,
    };
  } catch (err) {
    console.error("check_available_slots error", err);
    return { reply: "I was unable to verify slot availability at this moment. Please let me know another date or time to check." };
  }
}

async function handleBookAppointment(args: Record<string, string>): Promise<{ reply: string }> {
  const { service_name, appointment_date, start_time, client_name, client_email, client_phone, notes = "" } = args;

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
    .select("id,name,duration_minutes")
    .ilike("name", `%${service_name}%`)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!service) {
    return { reply: `I could not locate the treatment **${service_name}** in our system. Please check the name or ask me for our treatment menu.` };
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
  const endTotal = h * 60 + m + service.duration_minutes;
  const endTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}:00`;

  // Find therapist
  const therapistId = await findAvailableTherapistId(service.id, appointment_date, normTime, endTime);
  if (!therapistId) {
    return { reply: "No therapist is available at that specific time. Please select another slot." };
  }

  const normEmail = client_email.trim().toLowerCase();
  const normPhone = client_phone.trim();
  const normName = client_name.trim();

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
      notes: notes || null,
      status: "pending",
    })
    .select("id,full_name,email,appointment_date,start_time,therapists(full_name)")
    .single();

  if (error || !appt) {
    console.error("Concierge booking insert failed", error);
    return { reply: "I apologize, but I could not save your appointment at this moment. Please try again or contact our front desk." };
  }

  const therapistName = (appt.therapists as unknown as { full_name: string } | null)?.full_name ?? null;

  // Send emails (non-blocking)
  void (async () => {
    if (!emailIsConfigured()) return;
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const from = process.env.RESEND_FROM_EMAIL!;
    const emailData = {
      full_name: appt.full_name,
      email: appt.email,
      phone: normPhone,
      notes: notes || null,
      appointment_date: appt.appointment_date,
      start_time: appt.start_time,
      service_name: service.name,
      therapist_name: therapistName,
    };
    try { await resend.emails.send({ from, to: appt.email, ...appointmentEmail(emailData, "request") }); }
    catch (e) { console.error("Client email failed", e); }
    try {
      const owner = process.env.OWNER_NOTIFICATION_EMAIL || from;
      await resend.emails.send({ from, to: owner, ...ownerNotificationEmail(emailData) });
    } catch (e) { console.error("Owner email failed", e); }
  })();

  return {
    reply: `✨ **Your appointment has been reserved!**\n\nHere are your booking details:\n- **Treatment**: ${service.name}\n- **Date**: ${appointment_date}\n- **Time**: ${normTime.slice(0, 5)}\n- **Guest**: ${normName}\n- **Therapist**: ${therapistName || "Any available therapist"}\n- **Confirmation**: Sent to ${normEmail}\n\nOur spa team has been notified. Payment is made upon arrival at the spa. We look forward to welcoming you!`,
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

async function executeTool(name: string, args: Record<string, string>): Promise<{ reply: string }> {
  if (name === "check_available_slots") return handleCheckSlots(args);
  if (name === "book_appointment") return handleBookAppointment(args);
  if (name === "raise_support_ticket") return handleRaiseTicket(args);
  return { reply: "I'm not sure how to perform that action." };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANDIDATE_MODELS = Array.from(new Set([
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
]));

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "concierge", 20, 60)) {
      return NextResponse.json({ error: "Please wait a moment before sending another message." }, { status: 429 });
    }
  } catch (e) { console.error("Rate-limit check failed", e); }

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

  // Log user message asynchronously (non-blocking)
  void Promise.resolve(
    db.from("chat_logs").insert({ session_id: sessionId, role: "user", message: userMessage }),
  ).catch((e: unknown) => console.warn("chat_logs user write failed", e));

  try {
    // Fetch recent chat history
    let history: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    try {
      const { data: logs } = await db
        .from("chat_logs")
        .select("role,message")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (logs && logs.length > 0) {
        const reversed = logs.reverse();
        for (const entry of reversed) {
          const role = entry.role === "user" ? "user" : "model";
          if (history.length > 0 && history[history.length - 1].role === role) continue;
          history.push({ role, parts: [{ text: entry.message }] });
        }
        while (history.length > 0 && history[0].role !== "user") history.shift();
      }
    } catch (e) { console.warn("chat history fetch failed", e); }

    const genAI = new GoogleGenerativeAI(apiKey);
    let reply = "";
    let lastError: unknown = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
          tools: TOOLS,
          generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
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
