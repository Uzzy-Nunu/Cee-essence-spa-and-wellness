import { NextRequest, NextResponse } from "next/server";
import { availableSlots } from "@/lib/availability";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "availability", 60, 60)) {
      return NextResponse.json({ error: "Too many availability checks. Please wait a moment." }, { status: 429 });
    }
  } catch (error) {
    console.error("Availability rate-limit check failed", error);
    return NextResponse.json({ error: "Availability is temporarily unavailable." }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const serviceId = params.get("serviceId");
  const date = params.get("date");
  if (!serviceId || !date) {
    return NextResponse.json({ error: "serviceId and date are required." }, { status: 400 });
  }
  try {
    return NextResponse.json({
      slots: await availableSlots(serviceId, date, params.get("therapistId") || undefined),
    });
  } catch (error) {
    console.error("Availability lookup failed", error);
    return NextResponse.json({ error: "Unable to load availability." }, { status: 500 });
  }
}
