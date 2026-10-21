import assert from "node:assert/strict";
import test from "node:test";
import { calculateAvailableSlots, isValidDate, isValidTime } from "../lib/booking-rules.ts";

const common = {
  date: "2026-06-02",
  openingTime: "10:00:00",
  closingTime: "12:00:00",
  durationMinutes: 60,
  intervalMinutes: 30,
  bookingNoticeHours: 2,
  therapistIds: ["therapist-1"],
  appointments: [],
  timeOff: [],
  now: new Date("2026-06-01T07:00:00.000Z"),
};

test("accepts only real calendar dates and clock times", () => {
  assert.equal(isValidDate("2026-06-02"), true);
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidDate("02-06-2026"), false);
  assert.equal(isValidTime("09:30"), true);
  assert.equal(isValidTime("24:00"), false);
});

test("offers slots that satisfy opening hours, duration, and notice", () => {
  assert.deepEqual(calculateAvailableSlots(common), ["10:00:00", "10:30:00", "11:00:00"]);
});

test("requires the full combined treatment duration to fit within business hours", () => {
  assert.deepEqual(calculateAvailableSlots({ ...common, durationMinutes: 120 }), ["10:00:00"]);
});

test("removes slots that overlap an appointment but permits adjacent appointments", () => {
  const slots = calculateAvailableSlots({
    ...common,
    appointments: [{ therapist_id: "therapist-1", start_time: "10:30:00", end_time: "11:30:00" }],
  });
  assert.deepEqual(slots, []);
  const adjacent = calculateAvailableSlots({
    ...common,
    appointments: [{ therapist_id: "therapist-1", start_time: "09:00:00", end_time: "10:00:00" }],
  });
  assert.deepEqual(adjacent, ["10:00:00", "10:30:00", "11:00:00"]);
});

test("keeps a slot when another qualified therapist is free", () => {
  const slots = calculateAvailableSlots({
    ...common,
    therapistIds: ["therapist-1", "therapist-2"],
    appointments: [{ therapist_id: "therapist-1", start_time: "10:00:00", end_time: "12:00:00" }],
    timeOff: [{ therapist_id: "therapist-2", start_time: null, end_time: null }],
  });
  assert.deepEqual(slots, []);
  const otherTherapistFree = calculateAvailableSlots({
    ...common,
    therapistIds: ["therapist-1", "therapist-2"],
    appointments: [{ therapist_id: "therapist-1", start_time: "10:00:00", end_time: "12:00:00" }],
  });
  assert.deepEqual(otherTherapistFree, ["10:00:00", "10:30:00", "11:00:00"]);
});

test("rejects invalid schedule configuration", () => {
  assert.throws(() => calculateAvailableSlots({ ...common, intervalMinutes: 0 }), /slot interval/i);
  assert.throws(() => calculateAvailableSlots({ ...common, date: "2026-02-30" }), /appointment date/i);
});
