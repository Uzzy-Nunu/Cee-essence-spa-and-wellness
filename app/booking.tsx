"use client";
import { useEffect, useMemo, useState } from "react";
import { duration, naira, timeLabel } from "@/lib/format";
import type { Service, Therapist } from "@/lib/types";

type Props = { services: Service[]; therapists: Therapist[] };

// Maps each category label to the service names that belong to it.
// Names must match exactly what is seeded in the database.
const CATEGORY_SERVICE_NAMES: Record<string, string[]> = {
  "Massage Treatments": [
    "Signature Cee Essence Massage",
    "Swedish Massage",
    "Deep Tissue Massage",
    "Hot Stone Massage",
    "Aromatherapy Massage",
    "Couple's Massage",
    "Prenatal Massage",
  ],
  "Facial Treatments": [
    "Signature Facial",
    "Hydrating Facial",
    "Brightening Facial",
    "Anti-Aging Facial",
    "Deep Cleansing Facial",
  ],
  "Body Treatments": [
    "Body Scrub & Polish",
    "Detox Body Wrap",
    "Half-Day Pamper Package",
  ],
  "Hand & Foot Treatments": [
    "Signature Pedicure",
    "Signature Manicure",
    "Foot Reflexology",
  ],
};

const CATEGORIES = Object.keys(CATEGORY_SERVICE_NAMES);

export function Booking({ services, therapists }: Props) {
  const [category, setCategory] = useState("");
  const [serviceId, setService] = useState("");
  const [therapistId, setTherapist] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");

  // Services that belong to the currently selected category
  const categoryServices = useMemo(() => {
    if (!category) return [];
    const names = CATEGORY_SERVICE_NAMES[category] ?? [];
    // Preserve the defined order for each category
    return names
      .map((name) => services.find((s) => s.name === name && s.is_active))
      .filter((s): s is Service => Boolean(s));
  }, [category, services]);

  const service = services.find((s) => s.id === serviceId);

  const qualified = useMemo(
    () =>
      therapists.filter((t) =>
        t.therapist_services?.some((m) => m.service_id === serviceId),
      ),
    [therapists, serviceId],
  );

  // Reset treatment selection when category changes
  useEffect(() => {
    setService("");
    setTherapist("");
    setTime("");
    setSlots([]);
  }, [category]);

  // Reset therapist + time when service changes
  useEffect(() => {
    setTherapist("");
    setTime("");
  }, [serviceId]);

  // Fetch available time slots whenever date, service, or therapist preference changes
  useEffect(() => {
    if (!date || !serviceId) {
      setSlots([]);
      setLoadingSlots(false);
      return;
    }
    const controller = new AbortController();
    setLoadingSlots(true);
    setTime("");
    setError("");
    fetch(
      `/api/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}&therapistId=${encodeURIComponent(therapistId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Unable to load availability.");
        return data;
      })
      .then((data) => setSlots(Array.isArray(data.slots) ? data.slots : []))
      .catch((requestError) => {
        if (
          !(
            requestError instanceof DOMException &&
            requestError.name === "AbortError"
          )
        ) {
          setSlots([]);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load availability.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSlots(false);
      });
    return () => controller.abort();
  }, [date, serviceId, therapistId]);

  async function submit(form: FormData) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          therapist_id: therapistId || null,
          appointment_date: date,
          start_time: time,
          full_name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          notes: form.get("notes"),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "We could not reserve that time. Please try another slot.",
        );
      setConfirmationMessage(
        data.emailMessage || "Your booking request has been saved.",
      );
      setSubmitted(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We could not reserve that time. Please try another slot.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (submitted)
    return (
      <div className="confirmation">
        <span className="leaf">❦</span>
        <h3>Your session request is received.</h3>
        <p>{confirmationMessage}</p>
        <button
          className="text-button"
          onClick={() => {
            setSubmitted(false);
            setCategory("");
            setService("");
            setTime("");
          }}
        >
          Make another booking
        </button>
      </div>
    );

  return (
    <form action={submit} className="booking-form">
      {/* ── Step 01: Treatment Category ── */}
      <div className="field wide">
        <label>01 · Treatment category</label>
        <select
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="" disabled>
            Select a category…
          </option>
          {CATEGORIES.map((cat) => (
            <option value={cat} key={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* ── Step 02: Treatment Type (shown only after a category is picked) ── */}
      {category && (
        <div className="field wide">
          <label>02 · Select treatment type</label>
          <select
            required
            value={serviceId}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="" disabled>
              Select a treatment…
            </option>
            {categoryServices.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} — {naira(s.price)} · {duration(s.duration_minutes)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Step 03: Preferred therapist ── */}
      <div className="field">
        <label>03 · Preferred therapist</label>
        <select
          value={therapistId}
          onChange={(e) => setTherapist(e.target.value)}
          disabled={!serviceId}
        >
          <option value="">Any available therapist</option>
          {qualified.map((t) => (
            <option value={t.id} key={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Step 04: Date ── */}
      <div className="field">
        <label>04 · Select a date</label>
        <input
          required
          type="date"
          min={new Date().toISOString().slice(0, 10)}
          value={date}
          disabled={!serviceId}
          onChange={(e) => {
            setDate(e.target.value);
            setTime("");
          }}
        />
      </div>

      {/* ── Step 05: Available times ── */}
      <div className="field wide">
        <label>05 · Available times</label>
        <div className="slots">
          {!serviceId ? (
            <p>Select a treatment to continue.</p>
          ) : !date ? (
            <p>Select a date to view availability.</p>
          ) : loadingSlots ? (
            <p>Checking open times…</p>
          ) : error ? (
            <p>{error}</p>
          ) : slots.length ? (
            slots.map((s) => (
              <button
                type="button"
                className={time === s ? "selected" : ""}
                onClick={() => setTime(s)}
                key={s}
              >
                {timeLabel(s)}
              </button>
            ))
          ) : (
            <p>No open times for this date.</p>
          )}
        </div>
      </div>

      {/* ── Contact fields ── */}
      <div className="field">
        <label>06 · Your name</label>
        <input
          name="name"
          required
          maxLength={120}
          placeholder="Full name"
        />
      </div>
      <div className="field">
        <label>Phone number</label>
        <input
          name="phone"
          required
          maxLength={40}
          placeholder="+234"
        />
      </div>
      <div className="field">
        <label>Email address</label>
        <input
          name="email"
          required
          maxLength={254}
          type="email"
          placeholder="you@email.com"
        />
      </div>
      <div className="field">
        <label>Notes (optional)</label>
        <input
          name="notes"
          maxLength={2000}
          placeholder="Anything we should know?"
        />
      </div>

      {error && !loadingSlots && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button
        disabled={!service || !date || !time || loading || loadingSlots}
        className="button submit"
      >
        {loading ? "Reserving…" : "Confirm reservation →"}
      </button>
    </form>
  );
}
