import { adminSupabase } from "@/lib/supabase-admin";
import { Resend } from "resend";
import { appointmentEmail, ownerNotificationEmail, emailIsConfigured } from "@/lib/email";
import { claimNotification, finishNotification } from "@/lib/notifications";
import { verifyPaystackTransaction, type VerifyTransactionResult } from "@/lib/paystack";

export type ConfirmBookingResult = {
  success: boolean;
  alreadyConfirmed?: boolean;
  appointment?: any;
  error?: string;
};

/**
 * Verifies Paystack transaction directly with Paystack API and confirms the appointment.
 * Sets payment_status = 'paid', status = 'confirmed', and triggers dual emails.
 */
export async function confirmBookingPayment(
  reference: string,
  preloadedTx?: VerifyTransactionResult,
): Promise<ConfirmBookingResult> {
  const db = adminSupabase();

  try {
    // 1. Verify directly against Paystack REST API
    const tx = preloadedTx ?? (await verifyPaystackTransaction(reference));
    if (tx.status !== "success") {
      return {
        success: false,
        error: `Transaction status is '${tx.status}'. Payment not completed.`,
      };
    }
    if (tx.reference !== reference || tx.currency !== "NGN" || !Number.isSafeInteger(tx.amount) || tx.amount <= 0) {
      return { success: false, error: "The verified payment details do not match this booking." };
    }

    // 2. Locate the appointment using its server-persisted transaction reference.
    const { data: appointment, error: appointmentError } = await db
      .from("appointments")
      .select("id,status,full_name,email,phone,notes,appointment_date,start_time,service_id,therapist_id,services(name,price),therapists(full_name)")
      .eq("paystack_reference", reference)
      .maybeSingle();
    if (appointmentError) throw appointmentError;
    if (!appointment) {
      return {
        success: false,
        error: "No appointment is associated with this Paystack reference.",
      };
    }
    const appointmentService = Array.isArray(appointment.services)
      ? appointment.services[0] ?? null
      : appointment.services;

    if (tx.customer.email?.trim().toLowerCase() !== appointment.email.trim().toLowerCase()) {
      return { success: false, error: "The payment email does not match the booking." };
    }

    const depositMatches = [...(appointment.notes ?? "").matchAll(/50% Deposit:\s*₦?([\d,]+)/gi)];
    const expectedDeposit = depositMatches.length > 0
      ? Number.parseInt(depositMatches[depositMatches.length - 1][1].replace(/,/g, ""), 10)
      : Math.round(Number(appointmentService?.price ?? 0) * 0.5);
    if (!Number.isSafeInteger(expectedDeposit) || expectedDeposit <= 0 || tx.amount !== expectedDeposit * 100) {
      return { success: false, error: "The verified deposit amount does not match this booking." };
    }

    // If already confirmed, return idempotently after verifying the payment details.
    if (appointment.status === "confirmed") {
      return {
        success: true,
        alreadyConfirmed: true,
        appointment,
      };
    }
    if (appointment.status !== "pending") {
      return { success: false, error: "This appointment is no longer pending and cannot be confirmed." };
    }

    // 3. Update appointment in database
    const depositNote = `[Paystack 50% Deposit Paid: ₦${tx.amountInNaira.toLocaleString()} | Ref: ${reference}]`;
    const updatedNotes = appointment.notes
      ? `${appointment.notes} ${depositNote}`
      : depositNote;

    const { data: confirmedAppointment, error: updateError } = await db
      .from("appointments")
      .update({
        status: "confirmed",
        payment_status: "paid",
        paystack_reference: reference,
        notes: updatedNotes,
      })
      .eq("id", appointment.id)
      .eq("status", "pending")
      .select("id,status")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!confirmedAppointment) {
      const { data: current, error: currentError } = await db
        .from("appointments")
        .select("status")
        .eq("id", appointment.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (current?.status === "confirmed") {
        return { success: true, alreadyConfirmed: true, appointment };
      }
      return { success: false, error: "This appointment changed while payment was being confirmed. Please contact the spa." };
    }

    // 4. Resolve exact treatment names, full price, and deposit amounts
    const metadataServiceName = (tx.metadata as any)?.service_name;
    const metadataFullPrice = Number((tx.metadata as any)?.full_price) || 0;
    const metadataDeposit = Number((tx.metadata as any)?.deposit_amount) || tx.amountInNaira;

    // Parse from notes if metadata was not populated
    let parsedTreatments = "";
    let parsedTotal = 0;
    if (appointment.notes) {
      const treatMatch = appointment.notes.match(/\[(?:Treatments|Services):\s*([^|\]]+)/i);
      if (treatMatch) parsedTreatments = treatMatch[1].trim();
      const totalMatch = appointment.notes.match(/Total:\s*₦?([\d,]+)/i);
      if (totalMatch) parsedTotal = parseInt(totalMatch[1].replace(/,/g, ""), 10);
    }

    const finalTreatmentName =
      metadataServiceName ||
      parsedTreatments ||
      appointmentService?.name ||
      "Spa Treatment";

    const finalDepositPaid = tx.amountInNaira || metadataDeposit || Math.round((appointmentService?.price || 0) * 0.5);
    const finalTotalPrice =
      metadataFullPrice ||
      parsedTotal ||
      (appointmentService?.price ? appointmentService.price : finalDepositPaid * 2);
    const finalBalanceDue = Math.max(0, finalTotalPrice - finalDepositPaid);

    // 5. Send Confirmation & Owner Notification Emails
    if (emailIsConfigured()) {
      const resend = new Resend(process.env.RESEND_API_KEY!);
      const fromAddress = process.env.RESEND_FROM_EMAIL!;
      const ownerAddress = process.env.OWNER_NOTIFICATION_EMAIL || process.env.RESEND_FROM_EMAIL!;

      const appointmentData = {
        full_name: appointment.full_name,
        email: appointment.email,
        phone: appointment.phone,
        notes: updatedNotes,
        appointment_date: appointment.appointment_date,
        start_time: appointment.start_time,
        service_name: finalTreatmentName,
        therapist_name: (appointment.therapists as any)?.full_name ?? null,
        total_price: finalTotalPrice,
        deposit_paid: finalDepositPaid,
        balance_due: finalBalanceDue,
        paystack_reference: reference,
      };

      // 1. Send client confirmed email
      try {
        const notification = await claimNotification(db, appointment.id, "confirmed");
        if (notification.claimed) {
          const clientMessage = appointmentEmail(appointmentData, "confirmed");
          const { error: clientEmailError } = await resend.emails.send(
            {
              from: fromAddress,
              to: appointment.email,
              ...clientMessage,
            },
            { idempotencyKey: `appointment-${appointment.id}-confirmed` },
          );
          if (clientEmailError) throw clientEmailError;
          await finishNotification(db, notification.id, "sent");
        }
      } catch (err) {
        console.error("Payment confirmation email to client failed:", err);
      }

      // 2. Send owner notification email
      try {
        const ownerMessage = ownerNotificationEmail(appointmentData);
        await resend.emails.send({
          from: fromAddress,
          to: ownerAddress,
          ...ownerMessage,
        });
      } catch (err) {
        console.error("Payment notification email to owner failed:", err);
      }
    }

    return {
      success: true,
      appointment: {
        ...appointment,
        status: "confirmed",
        payment_status: "paid",
        treatment_name: finalTreatmentName,
        total_price: finalTotalPrice,
        deposit_paid: finalDepositPaid,
        balance_due: finalBalanceDue,
        paystack_reference: reference,
      },
    };
  } catch (err: any) {
    console.error("confirmBookingPayment exception:", err);
    return {
      success: false,
      error: err.message || "Failed to confirm payment.",
    };
  }
}
