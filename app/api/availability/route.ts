import { NextRequest, NextResponse } from "next/server";
import { availableSlots } from "@/lib/availability";
import { enforceRateLimit } from "@/lib/rate-limit";
import { adminSupabase } from "@/lib/supabase-admin";

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
  const requestedServiceIds = params.get("serviceIds")?.split(",").filter(Boolean);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!serviceId || !date || !uuidPattern.test(serviceId)) {
    return NextResponse.json({ error: "serviceId and date are required." }, { status: 400 });
  }
  try {
    let durationMinutes: number | undefined;
    if (requestedServiceIds && requestedServiceIds.length > 0) {
      if (
        requestedServiceIds.length > 6
        || requestedServiceIds.some((id) => !uuidPattern.test(id))
        || requestedServiceIds[0] !== serviceId
        || new Set(requestedServiceIds).size !== requestedServiceIds.length
      ) {
        return NextResponse.json({ error: "Invalid selected treatments." }, { status: 400 });
      }

      const { data: selectedServices, error } = await adminSupabase()
        .from("services")
        .select("id,duration_minutes")
        .in("id", requestedServiceIds)
        .eq("is_active", true);
      if (error) throw error;
      if (!selectedServices || selectedServices.length !== requestedServiceIds.length) {
        return NextResponse.json({ error: "One or more selected treatments are unavailable." }, { status: 400 });
      }
      durationMinutes = selectedServices.reduce((total, service) => total + service.duration_minutes, 0);
    }

    return NextResponse.json({
      slots: await availableSlots(
        serviceId,
        date,
        params.get("therapistId") || undefined,
        durationMinutes,
        requestedServiceIds ?? [serviceId],
      ),
    });
  } catch (error) {
    console.error("Availability lookup failed", error);
    return NextResponse.json({ error: "Unable to load availability." }, { status: 500 });
  }
}
