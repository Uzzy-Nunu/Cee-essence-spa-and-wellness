import { adminSupabase } from "./supabase";
import { calculateAvailableSlots, isValidDate } from "./booking-rules";

const DEFAULT_SETTINGS = {
  slot_interval_minutes: 30,
  booking_notice_hours: 2,
};

const DEFAULT_HOURS: Record<number, { is_open: boolean; start_time: string; end_time: string }> = {
  0: { is_open: true, start_time: "12:00:00", end_time: "18:00:00" },
  1: { is_open: true, start_time: "10:00:00", end_time: "20:00:00" },
  2: { is_open: true, start_time: "10:00:00", end_time: "20:00:00" },
  3: { is_open: true, start_time: "10:00:00", end_time: "20:00:00" },
  4: { is_open: true, start_time: "10:00:00", end_time: "20:00:00" },
  5: { is_open: true, start_time: "10:00:00", end_time: "20:00:00" },
  6: { is_open: true, start_time: "10:00:00", end_time: "20:00:00" },
};

export async function availableSlots(serviceId: string, date: string, preferredTherapistId?: string) {
  if (!isValidDate(date)) throw new Error("Invalid appointment date");
  const db = adminSupabase();

  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  // 1. Fetch Service, Settings, Business Hours, Blocked Dates, and Mappings in parallel
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId);

  const [
    { data: serviceData },
    { data: settingsData },
    { data: hoursData },
    { data: blocked },
    { data: mappings },
    { data: allActiveTherapists },
  ] = await Promise.all([
    isUuid
      ? db.from("services").select("id,duration_minutes,name").eq("id", serviceId).maybeSingle()
      : db.from("services").select("id,duration_minutes,name").ilike("name", serviceId).maybeSingle(),
    db.from("spa_settings").select("slot_interval_minutes,booking_notice_hours").limit(1).maybeSingle(),
    db.from("business_hours").select("is_open,start_time,end_time").eq("weekday", weekday).maybeSingle(),
    db.from("blocked_dates").select("id").eq("blocked_date", date).maybeSingle(),
    isUuid
      ? db.from("therapist_services").select("therapist_id,therapists!inner(id,is_active)").eq("service_id", serviceId)
      : Promise.resolve({ data: [] }),
    db.from("therapists").select("id").eq("is_active", true),
  ]);

  const service = serviceData || { id: serviceId, duration_minutes: 60 };
  const settings = settingsData || DEFAULT_SETTINGS;
  const hours = hoursData || DEFAULT_HOURS[weekday] || { is_open: true, start_time: "10:00:00", end_time: "20:00:00" };

  // If the spa is closed, day is blocked, or hours missing
  if (!hours.is_open || blocked || !hours.start_time || !hours.end_time) {
    return [];
  }

  // 2. Determine Qualified Therapists
  // If specific mappings exist in DB, use them; otherwise, all active therapists can perform this treatment
  let qualified: string[] = (mappings ?? [])
    .filter((m) => {
      const therapist = m.therapists as unknown as { id: string; is_active: boolean } | null;
      return therapist?.is_active;
    })
    .map((m) => m.therapist_id);

  if (qualified.length === 0) {
    qualified = (allActiveTherapists ?? []).map((t) => t.id);
  }

  if (preferredTherapistId) {
    qualified = qualified.filter((id) => id === preferredTherapistId);
  }

  if (qualified.length === 0) {
    return [];
  }

  // 3. Fetch existing Appointments & Therapist Time Off
  const [{ data: appointments }, { data: timeOff }] = await Promise.all([
    db
      .from("appointments")
      .select("therapist_id,start_time,end_time")
      .eq("appointment_date", date)
      .neq("status", "cancelled"),
    db
      .from("therapist_time_off")
      .select("therapist_id,start_time,end_time")
      .eq("off_date", date)
      .in("therapist_id", qualified),
  ]);

  return calculateAvailableSlots({
    date,
    openingTime: hours.start_time,
    closingTime: hours.end_time,
    durationMinutes: service.duration_minutes || 60,
    intervalMinutes: settings.slot_interval_minutes || 30,
    bookingNoticeHours: settings.booking_notice_hours ?? 2,
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
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId);

  const [{ data: mappings }, { data: allActiveTherapists }] = await Promise.all([
    isUuid
      ? db.from("therapist_services").select("therapist_id,therapists!inner(is_active)").eq("service_id", serviceId)
      : Promise.resolve({ data: [] }),
    db.from("therapists").select("id").eq("is_active", true),
  ]);

  let qualified: string[] = (mappings ?? [])
    .filter((m) => {
      const therapist = m.therapists as unknown as { is_active: boolean } | null;
      return therapist?.is_active;
    })
    .map((m) => m.therapist_id);

  if (qualified.length === 0) {
    qualified = (allActiveTherapists ?? []).map((t) => t.id);
  }

  if (preferredTherapistId) {
    qualified = qualified.filter((id) => id === preferredTherapistId);
  }

  if (qualified.length === 0) return null;

  const [{ data: appointments }, { data: timeOff }] = await Promise.all([
    db
      .from("appointments")
      .select("therapist_id,start_time,end_time")
      .eq("appointment_date", date)
      .neq("status", "cancelled")
      .in("therapist_id", qualified),
    db
      .from("therapist_time_off")
      .select("therapist_id,start_time,end_time")
      .eq("off_date", date)
      .in("therapist_id", qualified),
  ]);

  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  const minuteValue = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  const slotStart = minuteValue(start);
  const slotEnd = minuteValue(end);

  return (
    qualified.find((id) => {
      const booked = (appointments ?? []).some(
        (appointment) =>
          appointment.therapist_id === id &&
          slotStart < minuteValue(appointment.end_time) &&
          slotEnd > minuteValue(appointment.start_time),
      );
      const absent = (timeOff ?? []).some(
        (absence) =>
          absence.therapist_id === id &&
          (absence.start_time === null ||
            absence.end_time === null ||
            (slotStart < minuteValue(absence.end_time) && slotEnd > minuteValue(absence.start_time))),
      );
      return !booked && !absent;
    }) ?? null
  );
}
