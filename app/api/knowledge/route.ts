import { timingSafeEqual } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase-admin";

const sections = [
  ["General Information", "Cee Essence Spa & Wellness — Where beauty meets refined wellness. Address: Shop P8, The Bints Centre by Haimbridge, Abuja. Working hours: Monday–Saturday 10:00am–8:00pm; Sunday 12:00pm–6:00pm. Phone +234 800 CEE-SPA1. Email hello@ceeessencespa.com."],
  ["Booking Policies", "Appointments should be made at least 2 hours in advance. A 50% deposit is required online via Paystack to confirm a reservation; the remaining balance payment is due at the spa. Rescheduling is free up to 24 hours before the appointment; within 24 hours contact the spa directly. Cancellations or no-shows inside 24 hours may be subject to a fee. Arrive 5–10 minutes early. Clients who are pregnant or have allergies, skin conditions, or recent surgery should inform staff before treatment."],
  ["Treatments", "Massage: Signature Cee Essence Massage 75 min ₦55,000; Swedish 60 min ₦35,000; Deep Tissue 60 min ₦40,000; Hot Stone 75 min ₦45,000; Aromatherapy 60 min ₦38,000; Couple’s 60 min ₦75,000 for two; Prenatal 60 min ₦38,000. Facials: Signature 60 min ₦35,000; Hydrating 45 min ₦28,000; Brightening 60 min ₦40,000; Anti-Aging 60 min ₦45,000; Deep Cleansing 45 min ₦30,000. Body: Body Scrub & Polish 45 min ₦30,000; Detox Body Wrap 60 min ₦40,000; Half-Day Pamper Package 3 hrs ₦90,000. Hand & foot: Signature Pedicure 60 min ₦20,000; Signature Manicure 45 min ₦16,000; Foot Reflexology 45 min ₦22,000."],
  ["Therapists", "Amaka O. is a senior massage therapist and performs Signature Cee Essence, Deep Tissue, Hot Stone and Swedish Massage. Chiamaka B. is lead esthetician and performs Signature, Hydrating, Brightening, Anti-Aging and Deep Cleansing Facials. Grace N. is a wellness therapist and performs Aromatherapy Massage, Body Scrub & Polish, Detox Body Wrap, Signature Pedicure, Signature Manicure and Foot Reflexology."]
];

function hasValidSecret(req: NextRequest): boolean {
  const secret = process.env.KNOWLEDGE_INGEST_SECRET;
  const authorization = req.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secret || !supplied) return false;
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(req: NextRequest) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Gemini API key is required" }, { status: 500 });
  }

  try {
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "text-embedding-004" });
    const db = adminSupabase();
    const { error: deleteError } = await db.from("kb_chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteError) throw deleteError;
    for (const [source_section, content] of sections) {
      const embedding = await model.embedContent(content);
      const { error } = await db.from("kb_chunks").insert({
        source_section,
        content,
        embedding: embedding.embedding.values,
      });
      if (error) throw error;
    }
    return NextResponse.json({ ingested: sections.length });
  } catch (error) {
    console.error("Knowledge base ingestion failed", error);
    return NextResponse.json({ error: "Knowledge base ingestion failed." }, { status: 500 });
  }
}
