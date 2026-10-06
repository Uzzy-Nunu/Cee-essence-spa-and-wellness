export type AppointmentEmail = {
  full_name: string;
  email: string;
  appointment_date: string;
  start_time: string;
  service_name: string;
  therapist_name?: string | null;
};

export type AppointmentEmailKind = "request" | "confirmed" | "cancelled" | "reminder";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function appointmentEmail(
  appointment: AppointmentEmail,
  kind: AppointmentEmailKind,
): { subject: string; html: string } {
  const name = escapeHtml(appointment.full_name);
  const service = escapeHtml(appointment.service_name);
  const date = escapeHtml(appointment.appointment_date);
  const time = escapeHtml(appointment.start_time.slice(0, 5));
  const therapist = appointment.therapist_name
    ? ` with ${escapeHtml(appointment.therapist_name)}`
    : "";
  const details = `<strong>${service}</strong>${therapist} on <strong>${date}</strong> at <strong>${time}</strong>`;
  const copy: Record<AppointmentEmailKind, { subject: string; body: string }> = {
    request: {
      subject: "We received your Cee Essence booking request",
      body: `Your request for ${details} has been received and is pending confirmation.`,
    },
    confirmed: {
      subject: "Your Cee Essence appointment is confirmed",
      body: `Your appointment for ${details} is confirmed. We look forward to welcoming you.`,
    },
    cancelled: {
      subject: "An update to your Cee Essence appointment",
      body: `Your appointment for ${details} has been cancelled. Please contact us if you need assistance.`,
    },
    reminder: {
      subject: "A gentle reminder from Cee Essence",
      body: `This is a gentle reminder of your ${details} tomorrow.`,
    },
  };
  const selected = copy[kind];
  return {
    subject: selected.subject,
    html: `<p>Dear ${name},</p><p>${selected.body}</p><p>Please arrive 10–15 minutes early. Payment is made at the spa.</p><p>With warmth,<br/>Cee Essence Spa &amp; Wellness</p>`,
  };
}

export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
