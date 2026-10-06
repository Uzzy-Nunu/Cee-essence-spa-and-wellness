export type AppointmentInterval = {
  therapist_id: string | null;
  start_time: string;
  end_time: string;
};

export type TherapistTimeOff = {
  therapist_id: string;
  start_time: string | null;
  end_time: string | null;
};

type SlotOptions = {
  date: string;
  openingTime: string;
  closingTime: string;
  durationMinutes: number;
  intervalMinutes: number;
  bookingNoticeHours: number;
  therapistIds: string[];
  appointments: AppointmentInterval[];
  timeOff: TherapistTimeOff[];
  now?: Date;
};

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function toMinutes(value: string): number {
  if (!isValidTime(value)) throw new Error(`Invalid time value: ${value}`);
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlaps(start: number, end: number, otherStart: string, otherEnd: string): boolean {
  return start < toMinutes(otherEnd) && end > toMinutes(otherStart);
}

export function calculateAvailableSlots({
  date,
  openingTime,
  closingTime,
  durationMinutes,
  intervalMinutes,
  bookingNoticeHours,
  therapistIds,
  appointments,
  timeOff,
  now = new Date(),
}: SlotOptions): string[] {
  if (!isValidDate(date)) throw new Error("Invalid appointment date");
  if (!isValidTime(openingTime) || !isValidTime(closingTime)) throw new Error("Invalid business hours");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) throw new Error("Invalid service duration");
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) throw new Error("Invalid slot interval");
  if (!Number.isFinite(bookingNoticeHours) || bookingNoticeHours < 0) throw new Error("Invalid booking notice");
  if (therapistIds.length === 0) return [];

  const opening = toMinutes(openingTime);
  const closing = toMinutes(closingTime);
  if (closing <= opening) return [];

  const cutoff = now.getTime() + bookingNoticeHours * 60 * 60 * 1000;
  const slots: string[] = [];
  for (let minute = opening; minute + durationMinutes <= closing; minute += intervalMinutes) {
    const slotHour = String(Math.floor(minute / 60)).padStart(2, "0");
    const slotMinute = String(minute % 60).padStart(2, "0");
    const slotTime = `${slotHour}:${slotMinute}:00`;
    const slotStart = new Date(`${date}T${slotTime}+01:00`);
    if (slotStart.getTime() < cutoff) continue;

    const slotEnd = minute + durationMinutes;
    const freeTherapistExists = therapistIds.some((therapistId) => {
      const booked = appointments.some((appointment) =>
        appointment.therapist_id === therapistId
        && overlaps(minute, slotEnd, appointment.start_time, appointment.end_time));
      const absent = timeOff.some((absence) =>
        absence.therapist_id === therapistId
        && (absence.start_time === null
          || absence.end_time === null
          || overlaps(minute, slotEnd, absence.start_time, absence.end_time)));
      return !booked && !absent;
    });

    if (freeTherapistExists) slots.push(slotTime);
  }
  return slots;
}
