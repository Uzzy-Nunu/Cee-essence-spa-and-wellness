import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { appointmentEmail } from "@/lib/email";
import { claimNotification, finishNotification } from "@/lib/notifications";
import { adminSupabase } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function tomorrowInAbuja(now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const next = new Date(`${today}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({ error: "Email delivery is not configured." }, { status: 500 });
  }

  const db = adminSupabase();
  const resend = new Resend(process.env.RESEND_API_KEY);
  let notificationsRetried = 0;
  let failed = 0;
  const retryAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pendingNotifications, error: notificationsError } = await db
    .from("appointment_notifications")
    .select("id,appointment_id,notification_type,attempts,appointments!inner(id,full_name,email,appointment_date,start_time,status,services(name),therapists(full_name))")
    .in("status", ["pending", "failed", "sending"])
    .neq("notification_type", "reminder")
    .lt("attempts", 5)
    .gte("created_at", retryAfter)
    .limit(100);
  if (notificationsError) {
    console.error("Pending notification query failed", notificationsError);
    return NextResponse.json({ error: "Unable to load pending email notifications." }, { status: 500 });
  }

  for (const notificationRow of pendingNotifications ?? []) {
    const appointment = notificationRow.appointments as unknown as {
      id: string;
      full_name: string;
      email: string;
      appointment_date: string;
      start_time: string;
      status: string;
      services: { name: string } | null;
      therapists: { full_name: string } | null;
    };
    const type = notificationRow.notification_type;
    if ((type === "request" && appointment.status !== "pending")
      || (type === "confirmed" && appointment.status !== "confirmed")
      || (type === "cancelled" && appointment.status !== "cancelled")) continue;

    let ledgerId: string | undefined;
    try {
      const claim = await claimNotification(db, appointment.id, type);
      if (!claim.claimed) continue;
      ledgerId = claim.id;
      const message = appointmentEmail({
        full_name: appointment.full_name,
        email: appointment.email,
        appointment_date: appointment.appointment_date,
        start_time: appointment.start_time,
        service_name: appointment.services?.name ?? "your treatment",
        therapist_name: appointment.therapists?.full_name,
      }, type);
      const { error: deliveryError } = await resend.emails.send(
        { from: process.env.RESEND_FROM_EMAIL, to: appointment.email, ...message },
        { idempotencyKey: `appointment-${appointment.id}-${type}` },
      );
      if (deliveryError) throw deliveryError;
      await finishNotification(db, claim.id, "sent");
      notificationsRetried += 1;
    } catch (deliveryError) {
      failed += 1;
      console.error(`Email retry failed for appointment ${appointment.id}`, deliveryError);
      if (ledgerId) {
        try {
          await finishNotification(db, ledgerId, "failed", String(deliveryError));
        } catch (ledgerError) {
          console.error("Unable to record email retry failure", ledgerError);
        }
      }
    }
  }

  const appointmentDate = tomorrowInAbuja();
  const { data: appointments, error } = await db
    .from("appointments")
    .select("id,full_name,email,appointment_date,start_time,status,services(name),therapists(full_name)")
    .eq("appointment_date", appointmentDate)
    .in("status", ["pending", "confirmed"]);
  if (error) {
    console.error("Reminder appointment query failed", error);
    return NextResponse.json({ error: "Unable to load appointments." }, { status: 500 });
  }

  let remindersSent = 0;
  for (const appointment of appointments ?? []) {
    let notificationId: string | undefined;
    try {
      const claim = await claimNotification(db, appointment.id, "reminder");
      if (claim.alreadySent || !claim.claimed) continue;
      notificationId = claim.id;
      const message = appointmentEmail({
        full_name: appointment.full_name,
        email: appointment.email,
        appointment_date: appointment.appointment_date,
        start_time: appointment.start_time,
        service_name: (appointment.services as unknown as { name: string } | null)?.name ?? "your treatment",
        therapist_name: (appointment.therapists as unknown as { full_name: string } | null)?.full_name,
      }, "reminder");
      const { error: deliveryError } = await resend.emails.send(
        { from: process.env.RESEND_FROM_EMAIL, to: appointment.email, ...message },
        { idempotencyKey: `appointment-${appointment.id}-reminder` },
      );
      if (deliveryError) throw deliveryError;
      await finishNotification(db, claim.id, "sent");
      remindersSent += 1;
    } catch (deliveryError) {
      failed += 1;
      console.error(`Reminder delivery failed for appointment ${appointment.id}`, deliveryError);
      if (notificationId) {
        try {
          await finishNotification(db, notificationId, "failed", String(deliveryError));
        } catch (ledgerError) {
          console.error("Unable to record reminder delivery failure", ledgerError);
        }
      }
    }
  }

  return NextResponse.json({ notificationsRetried, remindersSent, failed, appointmentDate });
}
