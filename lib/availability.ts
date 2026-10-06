import { adminSupabase } from "./supabase";
import { calculateAvailableSlots, isValidDate } from "./booking-rules";

export async function availableSlots(serviceId: string, date: string, preferredTherapistId?: string) {
  if (!isValidDate(date)) throw new Error("Invalid appointment date");
  const db = adminSupabase();
  const [{ data: service, error: serviceError }, { data: settings, error: settingsError }, { data: hours, error: hoursError }, { data: blocked, error: blockedError }, { data: mappings, error: mappingsError }] = await Promise.all([
    db.from("services").select("id,duration_minutes").eq("id", serviceId).eq("is_active", true).maybeSingle(),
    db.from("spa_settings").select("slot_interval_minutes,booking_notice_hours").limit(1).maybeSingle(),
    db.from("business_hours").select("is_open,start_time,end_time").eq("weekday", new Date(`${date}T12:00:00Z`).getUTCDay()).maybeSingle(),
    db.from("blocked_dates").select("id").eq("blocked_date", date).maybeSingle(),
    db.from("therapist_services").select("therapist_id,therapists!inner(id,is_active)").eq("service_id", serviceId)
  ]);
  const queryError = serviceError || settingsError || hoursError || blockedError || mappingsError;
  if (queryError) throw queryError;
  if (!service || !settings || !hours?.is_open || blocked || !hours.start_time || !hours.end_time) return [];
  const qualified = (mappings ?? [])
    .filter((mapping) => {
      const therapist = mapping.therapists as unknown as { id: string; is_active: boolean } | null;
      return therapist?.is_active;
    })
    .map((mapping) => mapping.therapist_id)
    .filter((id) => !preferredTherapistId || id === preferredTherapistId);
  if (!qualified.length) return [];
  const [{ data: appointments, error: appointmentsError }, { data: timeOff, error: timeOffError }] = await Promise.all([
    db.from("appointments").select("therapist_id,start_time,end_time").eq("appointment_date", date).neq("status", "cancelled"),
    db.from("therapist_time_off").select("therapist_id,start_time,end_time").eq("off_date", date).in("therapist_id", qualified)
  ]);
  if (appointmentsError || timeOffError) throw appointmentsError || timeOffError;
  return calculateAvailableSlots({
    date,
    openingTime: hours.start_time,
    closingTime: hours.end_time,
    durationMinutes: service.duration_minutes,
    intervalMinutes: settings.slot_interval_minutes,
    bookingNoticeHours: settings.booking_notice_hours,
    therapistIds: qualified,
    appointments: appointments ?? [],
    timeOff: timeOff ?? [],
  });
}

export async function findAvailableTherapistId(
  serviceId: string,
  date: string,
  startTime: string,
  endTime: string,
  preferredTherapistId?: string,
): Promise<string | null> {
  const db = adminSupabase();
  const { data: mappings, error: mappingError } = await db
    .from("therapist_services")
    .select("therapist_id,therapists!inner(is_active)")
    .eq("service_id", serviceId);
  if (mappingError) throw mappingError;

  const qualified = (mappings ?? [])
    .filter((mapping) => {
      const therapist = mapping.therapists as unknown as { is_active: boolean } | null;
      return therapist?.is_active && (!preferredTherapistId || mapping.therapist_id === preferredTherapistId);
    })
    .map((mapping) => mapping.therapist_id);
  if (qualified.length === 0) return null;

  const [{ data: appointments, error: appointmentError }, { data: timeOff, error: timeOffError }] = await Promise.all([
    db.from("appointments").select("therapist_id,start_time,end_time").eq("appointment_date", date).neq("status", "cancelled").in("therapist_id", qualified),
    db.from("therapist_time_off").select("therapist_id,start_time,end_time").eq("off_date", date).in("therapist_id", qualified),
  ]);
  if (appointmentError || timeOffError) throw appointmentError || timeOffError;

  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  const minuteValue = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  const slotStart = minuteValue(start);
  const slotEnd = minuteValue(end);
  return qualified.find((id) => {
    const booked = (appointments ?? []).some((appointment) =>
      appointment.therapist_id === id
      && slotStart < minuteValue(appointment.end_time)
      && slotEnd > minuteValue(appointment.start_time));
    const absent = (timeOff ?? []).some((absence) =>
      absence.therapist_id === id
      && (absence.start_time === null
        || absence.end_time === null
        || (slotStart < minuteValue(absence.end_time) && slotEnd > minuteValue(absence.start_time))));
    return !booked && !absent;
  }) ?? null;
}
