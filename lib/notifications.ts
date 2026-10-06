import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType = "request" | "confirmed" | "cancelled" | "reminder";
type Claim = { id: string; claimed: boolean; alreadySent: boolean };

export async function claimNotification(
  db: SupabaseClient,
  appointmentId: string,
  notificationType: NotificationType,
): Promise<Claim> {
  const { error: insertError } = await db
    .from("appointment_notifications")
    .upsert(
      { appointment_id: appointmentId, notification_type: notificationType },
      { onConflict: "appointment_id,notification_type", ignoreDuplicates: true },
    );
  if (insertError) throw insertError;

  const { data, error: readError } = await db
    .from("appointment_notifications")
    .select("id,status,claimed_at")
    .eq("appointment_id", appointmentId)
    .eq("notification_type", notificationType)
    .single();
  if (readError) throw readError;
  if (data.status === "sent") return { id: data.id, claimed: false, alreadySent: true };
  const staleClaimCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const staleSendingClaim = data.status === "sending"
    && data.claimed_at
    && data.claimed_at < staleClaimCutoff;
  if (data.status !== "pending" && data.status !== "failed" && !staleSendingClaim) {
    return { id: data.id, claimed: false, alreadySent: false };
  }

  let claimQuery = db
    .from("appointment_notifications")
    .update({ status: "sending", claimed_at: new Date().toISOString(), last_error: null })
    .eq("id", data.id)
    .eq("status", data.status);
  if (staleSendingClaim) claimQuery = claimQuery.lt("claimed_at", staleClaimCutoff);
  const { data: claimed, error: claimError } = await claimQuery.select("id").maybeSingle();
  if (claimError) throw claimError;
  return { id: data.id, claimed: Boolean(claimed), alreadySent: false };
}

export async function finishNotification(
  db: SupabaseClient,
  id: string,
  status: "sent" | "failed",
  errorMessage?: string,
): Promise<void> {
  const { data: current, error: readError } = await db
    .from("appointment_notifications")
    .select("attempts")
    .eq("id", id)
    .single();
  if (readError) throw readError;
  const { error } = await db
    .from("appointment_notifications")
    .update({
      status,
      attempts: current.attempts + 1,
      last_error: errorMessage?.slice(0, 1000) ?? null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw error;
}
