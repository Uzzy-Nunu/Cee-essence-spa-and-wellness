import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase-admin";
import { appointmentEmail, emailIsConfigured } from "@/lib/email";
import { claimNotification, finishNotification } from "@/lib/notifications";
import { Resend } from "resend";

const validStatuses = ["pending", "confirmed", "cancelled", "completed"] as const;
type AppointmentStatus = typeof validStatuses[number];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: "Admin access is required." }, { status: 403 });
    }
    if (!admin.isSuperAdmin) {
      return NextResponse.json({ error: "Only Super Admins can change appointment status." }, { status: 403 });
    }

    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid appointment ID." }, { status: 400 });
    }
    const body = await req.json();
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid appointment status." }, { status: 400 });
    }

    const db = adminSupabase();
    const { data: appointment, error } = await db
      .from("appointments")
      .update({ status: body.status as AppointmentStatus })
      .eq("id", id)
      .select("id,full_name,email,appointment_date,start_time,status,services(name),therapists(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });

    const notificationType = appointment.status === "confirmed" ? "confirmed"
      : appointment.status === "cancelled" ? "cancelled"
        : null;
    let emailSent = false;
    if (notificationType && emailIsConfigured()) {
      try {
        const notification = await claimNotification(db, appointment.id, notificationType);
        if (notification.claimed) {
          const message = appointmentEmail({
            full_name: appointment.full_name,
            email: appointment.email,
            appointment_date: appointment.appointment_date,
            start_time: appointment.start_time,
            service_name: (appointment.services as unknown as { name: string } | null)?.name ?? "your treatment",
            therapist_name: (appointment.therapists as unknown as { full_name: string } | null)?.full_name,
          }, notificationType);
          const { error: deliveryError } = await new Resend(process.env.RESEND_API_KEY).emails.send(
            { from: process.env.RESEND_FROM_EMAIL!, to: appointment.email, ...message },
            { idempotencyKey: `appointment-${appointment.id}-${notificationType}` },
          );
          if (deliveryError) throw deliveryError;
          await finishNotification(db, notification.id, "sent");
          emailSent = true;
        } else if (notification.alreadySent) {
          emailSent = true;
        }
      } catch (deliveryError) {
        console.error("Appointment status email failed", deliveryError);
      }
    }

    return NextResponse.json({ appointment, emailSent });
  } catch (error) {
    console.error("Appointment status update failed", error);
    return NextResponse.json({ error: "Unable to update appointment." }, { status: 500 });
  }
}
