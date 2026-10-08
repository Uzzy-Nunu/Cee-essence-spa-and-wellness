"use client";

import { useEffect, useMemo, useState } from "react";
import { duration, naira, timeLabel } from "@/lib/format";
import type { BlockedDate, BusinessHour, Service, Therapist } from "@/lib/types";

type Props = {
  services: Service[];
  therapists: Therapist[];
  businessHours?: BusinessHour[];
  blockedDates?: BlockedDate[];
};

// Fallback treatment catalog if database has not been seeded
export const FALLBACK_CATALOG: Record<
  string,
  { name: string; duration_minutes: number; price: number; description?: string }[]
> = {
  "Massage Treatments": [
    { name: "Signature Cee Essence Massage", duration_minutes: 75, price: 55000 },
    { name: "Swedish Massage", duration_minutes: 60, price: 35000 },
    { name: "Deep Tissue Massage", duration_minutes: 60, price: 40000 },
    { name: "Hot Stone Massage", duration_minutes: 75, price: 45000 },
    { name: "Aromatherapy Massage", duration_minutes: 60, price: 38000 },
    { name: "Couple's Massage", duration_minutes: 60, price: 75000 },
    { name: "Prenatal Massage", duration_minutes: 60, price: 38000 },
  ],
  "Facial Treatments": [
    { name: "Signature Facial", duration_minutes: 60, price: 35000 },
    { name: "Hydrating Facial", duration_minutes: 45, price: 28000 },
    { name: "Brightening Facial", duration_minutes: 60, price: 40000 },
    { name: "Anti-Aging Facial", duration_minutes: 60, price: 45000 },
    { name: "Deep Cleansing Facial", duration_minutes: 45, price: 30000 },
  ],
  "Body Treatments": [
    { name: "Body Scrub & Polish", duration_minutes: 45, price: 30000 },
    { name: "Detox Body Wrap", duration_minutes: 60, price: 40000 },
    { name: "Half-Day Pamper Package", duration_minutes: 180, price: 90000 },
  ],
  "Hand & Foot Treatments": [
    { name: "Signature Pedicure", duration_minutes: 60, price: 20000 },
    { name: "Signature Manicure", duration_minutes: 45, price: 16000 },
    { name: "Foot Reflexology", duration_minutes: 45, price: 22000 },
  ],
};

const DEFAULT_CATEGORIES = [
  "Massage Treatments",
  "Facial Treatments",
  "Body Treatments",
  "Hand & Foot Treatments",
];

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

export function Booking({
  services = [],
  therapists = [],
  businessHours = [],
  blockedDates = [],
}: Props) {
  const [category, setCategory] = useState("");
  const [serviceId, setService] = useState("");
  const [therapistId, setTherapist] = useState("");
  const [date, setDate] = useState("");
  const [dateWarning, setDateWarning] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");

  // 1. Dynamic Categories derived from DB services (preserving standard order)
  const categories = useMemo(() => {
    const dbCategories = Array.from(
      new Set(
        services
          .map((s) => s.category?.trim())
          .filter((c): c is string => Boolean(c && c.length > 0)),
      ),
    );

    if (dbCategories.length === 0) return DEFAULT_CATEGORIES;

    // Put standard categories in expected order, followed by any new custom categories
    const ordered = DEFAULT_CATEGORIES.filter((c) => dbCategories.includes(c));
    const extra = dbCategories.filter((c) => !DEFAULT_CATEGORIES.includes(c));
    return [...ordered, ...extra];
  }, [services]);

  // 2. Services for the active Category (dynamic from DB, with catalog fallback)
  const categoryServices = useMemo(() => {
    if (!category) return [];

    const fromDb = services.filter(
      (s) => s.is_active && (s.category === category || normalize(s.category || "") === normalize(category)),
    );

    if (fromDb.length > 0) return fromDb;

    // Fallback if category exists in fallback catalog
    const fallbackList = FALLBACK_CATALOG[category] ?? [];
    return fallbackList.map((item) => {
      const match = services.find((s) => normalize(s.name) === normalize(item.name));
      if (match) return match;
      return {
        id: item.name,
        name: item.name,
        category,
        description: item.description ?? null,
        duration_minutes: item.duration_minutes,
        price: item.price,
        is_active: true,
      } as Service;
    });
  }, [category, services]);

  const service = useMemo(() => {
    return (
      services.find((s) => s.id === serviceId) ||
      categoryServices.find((s) => s.id === serviceId)
    );
  }, [services, categoryServices, serviceId]);

  const qualified = useMemo(() => {
    const matched = therapists.filter((t) =>
      t.therapist_services?.some(
        (m) =>
          m.service_id === serviceId ||
          (service && m.services?.name && normalize(m.services.name) === normalize(service.name)),
      ),
    );
    // If specific therapists are mapped to this treatment, show them.
    // If no specific restriction exists, show ALL active therapists from the admin dashboard!
    return matched.length > 0 ? matched : therapists.filter((t) => t.is_active !== false);
  }, [therapists, serviceId, service]);

  // Check business hours & blocked dates on date change
  useEffect(() => {
    if (!date) {
      setDateWarning("");
      return;
    }

    // Check blocked dates
    const blocked = blockedDates.find((b) => b.blocked_date === date);
    if (blocked) {
      setDateWarning(`The spa is closed on this date (${blocked.reason || "Public Holiday / Maintenance"}).`);
      setSlots([]);
      return;
    }

    // Check business hours
    if (businessHours.length > 0) {
      const selectedDay = new Date(`${date}T12:00:00Z`).getUTCDay();
      const hourRecord = businessHours.find((h) => h.weekday === selectedDay);
      if (hourRecord && !hourRecord.is_open) {
        setDateWarning(`The spa is closed on ${weekdayNames[selectedDay]}s. Please select an open day.`);
        setSlots([]);
        return;
      }
    }

    setDateWarning("");
  }, [date, businessHours, blockedDates]);

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

  // Fetch available slots from backend
  useEffect(() => {
    if (!date || !serviceId || dateWarning) {
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
        if (!response.ok) {
          throw new Error(data.error || "Unable to load availability.");
        }
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
  }, [date, serviceId, therapistId, dateWarning]);

  async function submit(form: FormData) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: service?.id || serviceId,
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
      if (!response.ok) {
        throw new Error(
          data.error || "We could not reserve that time. Please try another slot.",
        );
      }

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

  if (submitted) {
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
  }

  return (
    <form action={submit} className="booking-form">
      {/* ── 01 · Treatment Category (Always visible) ── */}
      <div className={category ? "field" : "field wide"}>
        <label>01 · Treatment category</label>
        <select
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Select a category…</option>
          {categories.map((cat) => (
            <option value={cat} key={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* ── 02 · Select Treatment Type (Beside category once chosen) ── */}
      {category && (
        <div className="field">
          <label>02 · Select Treatment Type</label>
          <select
            required
            value={serviceId}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">Select a treatment…</option>
            {categoryServices.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} — {duration(s.duration_minutes)} · {naira(s.price)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── 03 · Preferred Therapist ── */}
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

      {/* ── 04 · Select Date ── */}
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
        {dateWarning && (
          <p style={{ fontSize: "11px", color: "#9b2819", margin: "4px 0" }}>
            {dateWarning}
          </p>
        )}
      </div>

      {/* ── 05 · Available Times ── */}
      <div className="field wide">
        <label>05 · Available times</label>
        <div className="slots">
          {!serviceId ? (
            <p>Select a treatment to continue.</p>
          ) : !date ? (
            <p>Select a date to view availability.</p>
          ) : dateWarning ? (
            <p>{dateWarning}</p>
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

      {/* ── 06 · Client Details ── */}
      <div className="field">
        <label>06 · Your name</label>
        <input name="name" required maxLength={120} placeholder="Full name" />
      </div>
      <div className="field">
        <label>Phone number</label>
        <input name="phone" required maxLength={40} placeholder="+234" />
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
        disabled={!service || !date || Boolean(dateWarning) || !time || loading || loadingSlots}
        className="button submit"
      >
        {loading ? "Reserving…" : "Confirm reservation →"}
      </button>
    </form>
  );
}
