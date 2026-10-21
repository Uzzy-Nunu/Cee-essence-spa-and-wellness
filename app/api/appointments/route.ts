import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { availableSlots, findAvailableTherapistId } from "@/lib/availability";
import { adminSupabase } from "@/lib/supabase-admin";
import { Resend } from "resend";
import { appointmentEmail, ownerNotificationEmail, emailIsConfigured } from "@/lib/email";
import { claimNotification, finishNotification } from "@/lib/notifications";
import { isValidDate, isValidTime } from "@/lib/booking-rules";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPublicSiteUrl } from "@/lib/site-url";

export async function POST(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "appointment", 5, 600)) {
      return NextResponse.json({ error: "Too many booking attempts. Please wait a few minutes and try again." }, { status: 429 });
    }
  } catch (error) {
    console.error("Appointment rate-limit check failed", error);
    return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const serviceId = typeof body.service_id === "string" ? body.service_id : "";
  const rawServiceIds = Array.isArray(body.service_ids) ? (body.service_ids as unknown[]) : [];
  const serviceIds = rawServiceIds
    .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    .map((id) => id.trim());
  const effectiveServiceIds = serviceIds.length > 0 ? serviceIds : (serviceId ? [serviceId] : []);
  const primaryServiceId = effectiveServiceIds[0] || serviceId;
  const date = typeof body.appointment_date === "string" ? body.appointment_date : "";
  const startTime = typeof body.start_time === "string" ? body.start_time : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const therapistId = typeof body.therapist_id === "string" && body.therapist_id ? body.therapist_id : undefined;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (
    !primaryServiceId ||
    (rawServiceIds.length > 0 && serviceIds.length !== rawServiceIds.length) ||
    (serviceId && effectiveServiceIds[0] !== serviceId) ||
    effectiveServiceIds.length > 6 ||
    effectiveServiceIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
    new Set(effectiveServiceIds).size !== effectiveServiceIds.length ||
    !isValidDate(date) ||
    !isValidTime(startTime) ||
    fullName.length < 2 ||
    fullName.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    phone.length < 6 ||
    phone.length > 40 ||
    notes.length > 2000
  ) {
    return NextResponse.json({ error: "Please provide valid booking details." }, { status: 400 });
  }

  const db = adminSupabase();
  try {
    const { data: matchedServices, error: serviceError } = await db
      .from("services")
      .select("id,duration_minutes,name,price")
      .in("id", effectiveServiceIds)
      .eq("is_active", true);

    if (serviceError) {
      console.error("Booking service lookup failed", serviceError);
      return NextResponse.json({ error: "We could not verify this treatment." }, { status: 500 });
    }
    if (!matchedServices || matchedServices.length !== new Set(effectiveServiceIds).size) {
      return NextResponse.json({ error: "This treatment is unavailable." }, { status: 400 });
    }
    if (matchedServices.some((service) =>
      !Number.isInteger(service.duration_minutes)
      || service.duration_minutes < 1
      || !Number.isFinite(Number(service.price))
      || Number(service.price) <= 0)) {
      return NextResponse.json({ error: "One or more treatments have invalid pricing or duration." }, { status: 400 });
    }

    const primaryService = matchedServices.find((s) => s.id === primaryServiceId) || matchedServices[0];
    const totalDuration = matchedServices.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const orderedServices = effectiveServiceIds.map((id) => matchedServices.find((service) => service.id === id)!);
    const totalPrice = orderedServices.reduce((sum, service) => sum + Number(service.price), 0);
    const serviceNames = orderedServices.map((service) => service.name).join(" + ");

    const slots = await availableSlots(primaryServiceId, date, therapistId, totalDuration, effectiveServiceIds);
    if (!slots.includes(startTime)) {
      return NextResponse.json({ error: "That time is no longer available." }, { status: 409 });
    }

    const [hours, minutes, seconds = 0] = startTime.split(":").map(Number);
    const endTotal = hours * 60 + minutes + totalDuration;
    const endTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    const assignedTherapistId = await findAvailableTherapistId(
      primaryService.id,
      date,
      startTime,
      endTime,
      therapistId,
      effectiveServiceIds,
    );
    if (!assignedTherapistId) {
      return NextResponse.json({ error: "That time is no longer available." }, { status: 409 });
    }

    // 50% deposit calculation based on the total sum of all selected treatments
    const depositAmount = Math.max(1, Math.round(totalPrice * 0.5));
    const paystackRef = `cee_${randomUUID()}`;

    // Prepare origin and callback URL for Paystack redirect
    const callbackUrl = `${getPublicSiteUrl()}/booking/callback`;

    // Initialize Paystack transaction for 50% deposit (card and bank_transfer only)
    let paystackResult;
    try {
      const { initializePaystackTransaction } = await import("@/lib/paystack");
      paystackResult = await initializePaystackTransaction({
        email,
        amountInNaira: depositAmount,
        callbackUrl,
        reference: paystackRef,
        channels: ["card", "bank_transfer"],
        metadata: {
          service_id: primaryService.id,
          service_ids: effectiveServiceIds,
          service_name: serviceNames,
          full_name: fullName,
          email,
          phone,
          appointment_date: date,
          start_time: startTime,
          end_time: endTime,
          therapist_id: assignedTherapistId,
          deposit_amount: depositAmount,
          full_price: totalPrice,
          total_duration: totalDuration,
          notes,
        },
      });
    } catch (paystackErr: any) {
      console.error("Paystack transaction initialize failed:", paystackErr);
      return NextResponse.json(
        { error: paystackErr.message || "Failed to initialize secure checkout with Paystack." },
        { status: 502 },
      );
    }

    // Insert pending appointment with paystack_reference and payment_status='pending'
    const depositNote = `[Treatments: ${serviceNames} | Total: ₦${totalPrice.toLocaleString()} | 50% Deposit: ₦${depositAmount.toLocaleString()} | Ref: ${paystackResult.reference}]`;
    const fullNotes = notes ? `${notes} ${depositNote}` : depositNote;

    const { data: apptData, error: insertError } = await db
      .from("appointments")
      .insert({
        service_id: primaryService.id,
        therapist_id: assignedTherapistId,
        appointment_date: date,
        start_time: startTime,
        end_time: endTime,
        full_name: fullName,
        email,
        phone,
        notes: fullNotes,
        status: "pending",
        payment_status: "pending",
        paystack_reference: paystackResult.reference,
      })
      .select("id,full_name,email,phone,appointment_date,start_time,services(name),therapists(full_name)")
      .single();

    if (insertError || !apptData) {
      if (insertError?.code === "23P01") {
        return NextResponse.json({ error: "That time was just booked. Please choose another slot." }, { status: 409 });
      }
      console.error("Appointment insert failed", insertError);
      return NextResponse.json({ error: "We could not save your appointment." }, { status: 500 });
    }

    // Return the Paystack checkout URL so client can redirect immediately
    return NextResponse.json(
      {
        success: true,
        authorization_url: paystackResult.authorization_url,
        reference: paystackResult.reference,
        deposit_amount: depositAmount,
        appointment_id: apptData.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Appointment request failed", error);
    return NextResponse.json({ error: "We could not complete your booking. Please try again." }, { status: 500 });
  }
}
