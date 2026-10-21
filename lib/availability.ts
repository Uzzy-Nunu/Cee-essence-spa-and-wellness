import { adminSupabase } from "./supabase-admin";
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

function qualifiedTherapistIds(
  serviceIds: string[],
  mappings: Array<{
    service_id: string;
    therapist_id: string;
    therapists: { is_active: boolean } | { is_active: boolean }[] | null;
  }> | null,
  activeTherapists: Array<{ id: string }> | null,
): string[] {
  const activeIds = (activeTherapists ?? []).map((therapist) => therapist.id);
  const byService = new Map<string, string[]>();
  for (const mapping of mappings ?? []) {
    const joinedTherapists = Array.isArray(mapping.therapists)
      ? mapping.therapists
      : mapping.therapists ? [mapping.therapists] : [];
    if (joinedTherapists.some((therapist) => therapist.is_active)) {
      byService.set(mapping.service_id, [...(byService.get(mapping.service_id) ?? []), mapping.therapist_id]);
    }
  }

  return serviceIds.reduce((qualified: string[] | null, id) => {
    const eligible = byService.get(id);
    const forService = eligible?.length ? eligible : activeIds;
    return qualified === null ? forService : qualified.filter((therapistId) => forService.includes(therapistId));
  }, null) ?? [];
}

export async function availableSlots(
  serviceId: string,
  date: string,
  preferredTherapistId?: string,
  durationMinutes?: number,
  serviceIds = [serviceId],
) {
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
      ? db.from("therapist_services").select("service_id,therapist_id,therapists!inner(id,is_active)").in("service_id", serviceIds)
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
  let qualified = qualifiedTherapistIds(serviceIds, mappings, allActiveTherapists);

  if (preferredTherapistId) {
    qualified = qualified.filter((id) => id === preferredTherapistId);
  }

  if (qualified.length === 0) {
    return [];
  }

  // 3. Fetch existing Appointments & Therapist Time Off
  const [{ data: appointmentsRaw }, { data: timeOff }] = await Promise.all([
    db
      .from("appointments")
      .select("id,therapist_id,start_time,end_time,status,created_at")
      .eq("appointment_date", date)
      .neq("status", "cancelled"),
    db
      .from("therapist_time_off")
      .select("therapist_id,start_time,end_time")
      .eq("off_date", date)
      .in("therapist_id", qualified),
  ]);

  // Release slots held by pending appointments that expired (> 15 minutes without payment)
  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
  const activeAppointments = (appointmentsRaw ?? []).filter((appt: any) => {
    if (appt.status === "confirmed" || appt.status === "completed") return true;
    if (appt.status === "pending") {
      const createdAtMs = appt.created_at ? new Date(appt.created_at).getTime() : 0;
      if (createdAtMs > 0 && createdAtMs < fifteenMinutesAgo) {
        // Expired after 15 minutes — release slot & lazily cancel
        void Promise.resolve(
          db.from("appointments").update({ status: "cancelled" }).eq("id", appt.id).eq("status", "pending")
        ).catch(() => {});
        return false;
      }
      return true;
    }
    return false;
  });

  return calculateAvailableSlots({
    date,
    openingTime: hours.start_time,
    closingTime: hours.end_time,
    durationMinutes: durationMinutes ?? service.duration_minutes ?? 60,
    intervalMinutes: settings.slot_interval_minutes || 30,
    bookingNoticeHours: settings.booking_notice_hours ?? 2,
    therapistIds: qualified,
    appointments: activeAppointments,
    timeOff: timeOff ?? [],
  });
}

export async function findAvailableTherapistId(
  serviceId: string,
  date: string,
  startTime: string,
  endTime: string,
  preferredTherapistId?: string,
  serviceIds = [serviceId],
): Promise<string | null> {
  const db = adminSupabase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId);

  const [{ data: mappings }, { data: allActiveTherapists }] = await Promise.all([
    isUuid
      ? db.from("therapist_services").select("service_id,therapist_id,therapists!inner(is_active)").in("service_id", serviceIds)
      : Promise.resolve({ data: [] }),
    db.from("therapists").select("id").eq("is_active", true),
  ]);

  let qualified = qualifiedTherapistIds(serviceIds, mappings, allActiveTherapists);

  if (preferredTherapistId) {
    qualified = qualified.filter((id) => id === preferredTherapistId);
  }

  if (qualified.length === 0) return null;

  const [{ data: appointmentsRaw }, { data: timeOff }] = await Promise.all([
    db
      .from("appointments")
      .select("id,therapist_id,start_time,end_time,status,created_at")
      .eq("appointment_date", date)
      .neq("status", "cancelled")
      .in("therapist_id", qualified),
    db
      .from("therapist_time_off")
      .select("therapist_id,start_time,end_time")
      .eq("off_date", date)
      .in("therapist_id", qualified),
  ]);

  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
  const appointments = (appointmentsRaw ?? []).filter((appt: any) => {
    if (appt.status === "confirmed" || appt.status === "completed") return true;
    if (appt.status === "pending") {
      const createdAtMs = appt.created_at ? new Date(appt.created_at).getTime() : 0;
      if (createdAtMs > 0 && createdAtMs < fifteenMinutesAgo) {
        return false;
      }
      return true;
    }
    return false;
  });

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
