export type AppointmentEmail = {
  full_name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
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

// 1. Client Confirmation Email
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
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e1812; background: #faf5ea; border-top: 4px solid #c9a463;">
        <h2 style="color: #35432b; font-family: Georgia, serif; margin-top: 0;">Cee Essence Spa & Wellness</h2>
        <p>Dear ${name},</p>
        <p>${selected.body}</p>
        <div style="background: #ffffff; padding: 16px; border-left: 3px solid #35432b; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Treatment:</strong> ${service}</p>
          <p style="margin: 4px 0;"><strong>Therapist:</strong> ${appointment.therapist_name || "Any available therapist"}</p>
          <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
          <p style="margin: 4px 0;"><strong>Time:</strong> ${time}</p>
        </div>
        <p style="font-size: 13px; color: #63594d;">Please arrive 10–15 minutes early. Payment is made upon arrival at the spa.</p>
        <p style="margin-top: 24px;">With warmth,<br/><strong>Cee Essence Spa &amp; Wellness</strong><br/><small>Shop P8, The Bints Centre by Haimbridge, Abuja</small></p>
      </div>
    `,
  };
}

// 2. Spa Owner / Admin Notification Email
export function ownerNotificationEmail(
  appointment: AppointmentEmail,
): { subject: string; html: string } {
  const name = escapeHtml(appointment.full_name);
  const email = escapeHtml(appointment.email);
  const phone = escapeHtml(appointment.phone || "Not provided");
  const notes = escapeHtml(appointment.notes || "None");
  const service = escapeHtml(appointment.service_name);
  const date = escapeHtml(appointment.appointment_date);
  const time = escapeHtml(appointment.start_time.slice(0, 5));
  const therapist = escapeHtml(appointment.therapist_name || "Unassigned / Any available");

  return {
    subject: `✨ New Booking: ${service} - ${name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e1812; background: #faf5ea; border-top: 4px solid #35432b;">
        <h2 style="color: #35432b; font-family: Georgia, serif; margin-top: 0;">New Appointment Booked</h2>
        <p>A new appointment request was just submitted on the website.</p>
        
        <div style="background: #ffffff; padding: 18px; border: 1px solid rgba(53,67,43,0.15); margin: 20px 0;">
          <h3 style="margin-top: 0; color: #35432b; border-bottom: 1px solid #eee; padding-bottom: 8px;">Client Details</h3>
          <p style="margin: 6px 0;"><strong>Name:</strong> ${name}</p>
          <p style="margin: 6px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p style="margin: 6px 0;"><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>
          
          <h3 style="margin-top: 16px; color: #35432b; border-bottom: 1px solid #eee; padding-bottom: 8px;">Appointment Details</h3>
          <p style="margin: 6px 0;"><strong>Treatment:</strong> ${service}</p>
          <p style="margin: 6px 0;"><strong>Preferred Therapist:</strong> ${therapist}</p>
          <p style="margin: 6px 0;"><strong>Date:</strong> ${date}</p>
          <p style="margin: 6px 0;"><strong>Time:</strong> ${time}</p>
          <p style="margin: 6px 0;"><strong>Special Notes:</strong> ${notes}</p>
        </div>

        <p style="font-size: 12px; color: #63594d;">You can manage and confirm this booking in your <a href="https://cee-essence-spa-and-wellness-gas1bp3in.vercel.app/admin">Staff Portal</a>.</p>
      </div>
    `,
  };
}

export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
