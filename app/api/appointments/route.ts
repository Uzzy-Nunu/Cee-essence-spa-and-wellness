import { NextRequest, NextResponse } from "next/server";
import { availableSlots, findAvailableTherapistId } from "@/lib/availability";
import { adminSupabase } from "@/lib/supabase";
import { Resend } from "resend";
import { appointmentEmail, ownerNotificationEmail, emailIsConfigured } from "@/lib/email";
import { claimNotification, finishNotification } from "@/lib/notifications";
import { isValidDate, isValidTime } from "@/lib/booking-rules";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "appointment", 5, 600)) {
      return NextResponse.json({ error: "Too many booking attempts. Please wait a few minutes and try again." }, { status: 429 });
    }
  } catch (error) {
    console.error("Appointment rate-limit check failed", error);
    // Do NOT block booking if rate-limit check fails — just proceed
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const serviceId = typeof body.service_id === "string" ? body.service_id : "";
  const date = typeof body.appointment_date === "string" ? body.appointment_date : "";
  const startTime = typeof body.start_time === "string" ? body.start_time : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const therapistId = typeof body.therapist_id === "string" && body.therapist_id ? body.therapist_id : undefined;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (
    !serviceId ||
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
    const slots = await availableSlots(serviceId, date, therapistId);
    if (!slots.includes(startTime)) {
      return NextResponse.json({ error: "That time is no longer available." }, { status: 409 });
    }

    const { data: service, error: serviceError } = await db
      .from("services")
      .select("id,duration_minutes,name")
      .eq("id", serviceId)
      .eq("is_active", true)
      .maybeSingle();

    if (serviceError) {
      console.error("Booking service lookup failed", serviceError);
      return NextResponse.json({ error: "We could not verify this treatment." }, { status: 500 });
    }
    if (!service) {
      return NextResponse.json({ error: "This treatment is unavailable." }, { status: 400 });
    }

    const [hours, minutes, seconds = 0] = startTime.split(":").map(Number);
    const endTotal = hours * 60 + minutes + service.duration_minutes;
    const endTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    const assignedTherapistId = await findAvailableTherapistId(serviceId, date, startTime, endTime, therapistId);
    if (!assignedTherapistId) {
      return NextResponse.json({ error: "That time is no longer available." }, { status: 409 });
    }

    const { data, error } = await db
      .from("appointments")
      .insert({
        service_id: serviceId,
        therapist_id: assignedTherapistId,
        appointment_date: date,
        start_time: startTime,
        end_time: endTime,
        full_name: fullName,
        email,
        phone,
        notes: notes || null,
        status: "pending",
      })
      .select("id,full_name,email,phone,appointment_date,start_time,services(name),therapists(full_name)")
      .single();

    if (error) {
      if (error.code === "23P01") {
        return NextResponse.json({ error: "That time was just booked. Please choose another slot." }, { status: 409 });
      }
      console.error("Appointment insert failed", error);
      return NextResponse.json({ error: "We could not save your appointment." }, { status: 500 });
    }

    let clientEmailSent = false;
    let ownerEmailSent = false;

    if (emailIsConfigured()) {
      const resend = new Resend(process.env.RESEND_API_KEY!);
      const fromAddress = process.env.RESEND_FROM_EMAIL!;
      const ownerAddress = process.env.OWNER_NOTIFICATION_EMAIL || process.env.RESEND_FROM_EMAIL!;

      const appointmentData = {
        full_name: data.full_name,
        email: data.email,
        phone: data.phone || phone,
        notes: notes || null,
        appointment_date: data.appointment_date,
        start_time: data.start_time,
        service_name: (data.services as unknown as { name: string } | null)?.name ?? service.name,
        therapist_name: (data.therapists as unknown as { full_name: string } | null)?.full_name ?? null,
      };

      // 1. Send confirmation email to client
      try {
        const notification = await claimNotification(db, data.id, "request");
        if (notification.claimed) {
          const clientMessage = appointmentEmail(appointmentData, "request");
          const { error: clientEmailError } = await resend.emails.send(
            {
              from: fromAddress,
              to: data.email,
              ...clientMessage,
            },
            { idempotencyKey: `appointment-${data.id}-request` },
          );
          if (clientEmailError) throw clientEmailError;
          await finishNotification(db, notification.id, "sent");
          clientEmailSent = true;
        }
      } catch (clientEmailError) {
        console.error("Client confirmation email failed", clientEmailError);
      }

      // 2. Send owner notification email to spa admin
      try {
        const ownerMessage = ownerNotificationEmail(appointmentData);
        const { error: ownerEmailError } = await resend.emails.send({
          from: fromAddress,
          to: ownerAddress,
          ...ownerMessage,
        });
        if (ownerEmailError) throw ownerEmailError;
        ownerEmailSent = true;
      } catch (ownerEmailError) {
        console.error("Owner notification email failed", ownerEmailError);
      }
    }

    return NextResponse.json(
      {
        appointment: data,
        emailSent: clientEmailSent,
        ownerEmailSent,
        emailMessage: clientEmailSent
          ? "A confirmation email has been sent to you. The spa team has also been notified."
          : "Your booking request was saved. We will contact you to confirm shortly.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Appointment request failed", error);
    return NextResponse.json({ error: "We could not complete your booking. Please try again." }, { status: 500 });
  }
}
