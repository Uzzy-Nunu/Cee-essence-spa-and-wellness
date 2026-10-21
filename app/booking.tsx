"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { duration, naira, timeLabel } from "@/lib/format";
import type { BlockedDate, BusinessHour, Service, Therapist } from "@/lib/types";

type Props = {
  services: Service[];
  therapists: Therapist[];
  businessHours?: BusinessHour[];
  blockedDates?: BlockedDate[];
  bookingPolicies?: string | null;
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

// ── Multi-Service Picker Component ──────────────────────────────────────────
interface ServicePickerProps {
  services: Service[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

function ServicePicker({ services, selectedIds, onChange, disabled }: ServicePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  const selectedServices = services.filter((s) => selectedIds.includes(s.id));
  const displayLabel =
    selectedServices.length === 0
      ? "Select treatment(s)…"
      : selectedServices.length === 1
      ? selectedServices[0].name
      : `${selectedServices.length} treatments selected`;

  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);

  return (
    <div ref={ref} className="service-picker">
      <button
        type="button"
        className="service-picker-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="picker-label">{displayLabel}</span>
        {selectedServices.length > 0 && (
          <span className="picker-total">{naira(totalPrice)}</span>
        )}
        <span className="picker-chevron" style={{ transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {open && (
        <div className="service-picker-dropdown" role="listbox" aria-multiselectable="true">
          {services.map((s) => {
            const checked = selectedIds.includes(s.id);
            return (
              <button
                type="button"
                key={s.id}
                role="option"
                aria-selected={checked}
                className={`picker-option${checked ? " selected" : ""}`}
                onClick={() => toggle(s.id)}
              >
                <span className="picker-check">{checked ? "✓" : ""}</span>
                <span className="picker-info">
                  <span className="picker-name">{s.name}</span>
                  <span className="picker-meta">{duration(s.duration_minutes)} · {naira(s.price)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedServices.length > 0 && (
        <div className="picker-tags">
          {selectedServices.map((s) => (
            <span key={s.id} className="picker-tag">
              <span>{s.name} ({naira(s.price)})</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(s.id);
                }}
                aria-label={`Remove ${s.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PolicyScroll Component ───────────────────────────────────────────────────
function PolicyScroll({ policies }: { policies: string }) {
  const lines = policies.split("\n").filter((l) => l.trim());
  return (
    <div className="policy-scroll-container">
      <div className="policy-scroll-inner">
        {lines.map((line, i) => (
          <div className="policy-scroll-item" key={i}>
            <span className="policy-scroll-num">{String(i + 1).padStart(2, "0")}</span>
            <p>{line.trim()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Booking({
  services = [],
  therapists = [],
  businessHours = [],
  blockedDates = [],
  bookingPolicies,
}: Props) {
  const [category, setCategory] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
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

  // Client form inputs
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  // Review step (Guideline & Policy + Payment Details)
  const [showReview, setShowReview] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);

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

    const ordered = DEFAULT_CATEGORIES.filter((c) => dbCategories.includes(c));
    const extra = dbCategories.filter((c) => !DEFAULT_CATEGORIES.includes(c));
    return [...ordered, ...extra];
  }, [services]);

  // 2. Services for the active Category
  const categoryServices = useMemo(() => {
    if (!category) return [];

    const fromDb = services.filter(
      (s) => s.is_active && (s.category === category || normalize(s.category || "") === normalize(category)),
    );

    if (fromDb.length > 0) return fromDb;

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

  // All catalog items combined for resolving selectedServiceIds
  const allAvailableServices = useMemo(() => {
    const map = new Map<string, Service>();
    services.forEach((s) => map.set(s.id, s));
    categoryServices.forEach((s) => map.set(s.id, s));
    return map;
  }, [services, categoryServices]);

  const selectedServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => allAvailableServices.get(id))
        .filter((s): s is Service => Boolean(s)),
    [selectedServiceIds, allAvailableServices]
  );

  const primaryService = selectedServices[0] ?? null;
  const totalPrice = useMemo(() => selectedServices.reduce((sum, s) => sum + s.price, 0), [selectedServices]);
  const depositAmount = Math.max(1, Math.round(totalPrice * 0.5));
  const balanceAmount = totalPrice - depositAmount;

  const qualified = useMemo(() => {
    if (!primaryService) return therapists.filter((t) => t.is_active !== false);
    const matched = therapists.filter((t) =>
      t.therapist_services?.some(
        (m) =>
          m.service_id === primaryService.id ||
          (m.services?.name && normalize(m.services.name) === normalize(primaryService.name)),
      ),
    );
    return matched.length > 0 ? matched : therapists.filter((t) => t.is_active !== false);
  }, [therapists, primaryService]);

  const selectedTherapistName = useMemo(() => {
    if (!therapistId) return "Any available therapist";
    return qualified.find((t) => t.id === therapistId)?.full_name || "Any available therapist";
  }, [therapistId, qualified]);

  const formattedDate = useMemo(() => {
    if (!date) return "";
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) return date;
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }, [date]);

  // Check business hours & blocked dates on date change
  useEffect(() => {
    if (!date) {
      setDateWarning("");
      return;
    }
    const blocked = blockedDates.find((b) => b.blocked_date === date);
    if (blocked) {
      setDateWarning(`The spa is closed on this date (${blocked.reason || "Public Holiday / Maintenance"}).`);
      setSlots([]);
      return;
    }
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

  // Reset therapist & time if services change
  useEffect(() => {
    setTime("");
    setShowReview(false);
  }, [selectedServiceIds]);

  // Fetch available slots
  useEffect(() => {
    if (!date || !primaryService?.id || dateWarning) {
      setSlots([]);
      setLoadingSlots(false);
      return;
    }
    const controller = new AbortController();
    setLoadingSlots(true);
    setTime("");
    setError("");

    fetch(
      `/api/availability?serviceId=${encodeURIComponent(primaryService.id)}&serviceIds=${encodeURIComponent(selectedServiceIds.join(","))}&date=${encodeURIComponent(date)}&therapistId=${encodeURIComponent(therapistId)}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load availability.");
        return data;
      })
      .then((data) => setSlots(Array.isArray(data.slots) ? data.slots : []))
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setSlots([]);
          setError(err instanceof Error ? err.message : "Unable to load availability.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSlots(false);
      });

    return () => controller.abort();
  }, [date, primaryService?.id, selectedServiceIds, therapistId, dateWarning]);

  // "Confirm booking and pay" click handler
  function handleConfirmBookingClick(e: React.MouseEvent) {
    e.preventDefault();
    setError("");

    if (selectedServiceIds.length === 0) {
      setError("Please select at least one treatment.");
      return;
    }
    if (!date) {
      setError("Please choose your preferred appointment date.");
      return;
    }
    if (dateWarning) {
      setError(dateWarning);
      return;
    }
    if (!time) {
      setError("Please select an available appointment time.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please provide a valid email address.");
      return;
    }

    setShowReview(true);
    setTimeout(() => {
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  // Paystack checkout submission
  async function handlePaystackCheckout() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: primaryService?.id || selectedServiceIds[0],
          service_ids: selectedServiceIds,
          therapist_id: therapistId || null,
          appointment_date: date,
          start_time: time,
          full_name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          notes: notes.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "We could not complete your reservation. Please try again.");
      }

      if (data.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }

      setConfirmationMessage(data.emailMessage || "Your booking request has been saved.");
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Payment initialization failed.");
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
            setSelectedServiceIds([]);
            setTime("");
            setShowReview(false);
          }}
        >
          Make another booking
        </button>
      </div>
    );
  }

  return (
    <>
      <form className="booking-form" onSubmit={(e) => e.preventDefault()}>
        {/* ── 01 · Treatment Category ── */}
        <div className={category ? "field" : "field wide"}>
          <label>01 · Treatment category</label>
          <select
            required
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
            }}
          >
            <option value="">Select a category…</option>
            {categories.map((cat) => (
              <option value={cat} key={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* ── 02 · Select Treatment Type (Multi-Service Picker) ── */}
        {category && (
          <div className="field">
            <label>02 · Select Treatment Type</label>
            <ServicePicker
              services={categoryServices}
              selectedIds={selectedServiceIds}
              onChange={setSelectedServiceIds}
            />
          </div>
        )}

        {/* ── 03 · Preferred Therapist ── */}
        <div className="field">
          <label>03 · Preferred therapist</label>
          <select
            value={therapistId}
            onChange={(e) => {
              setTherapist(e.target.value);
              setShowReview(false);
            }}
            disabled={!primaryService}
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
            disabled={!primaryService}
            onChange={(e) => {
              setDate(e.target.value);
              setTime("");
              setShowReview(false);
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
            {!primaryService ? (
              <p>Select a treatment to continue.</p>
            ) : !date ? (
              <p>Select a date to view availability.</p>
            ) : dateWarning ? (
              <p>{dateWarning}</p>
            ) : loadingSlots ? (
              <p>Checking open times…</p>
            ) : slots.length ? (
              slots.map((s) => (
                <button
                  type="button"
                  className={time === s ? "selected" : ""}
                  onClick={() => {
                    setTime(s);
                    setShowReview(false);
                  }}
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
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Phone number</label>
          <input
            name="phone"
            required
            maxLength={40}
            placeholder="+234"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Notes (optional)</label>
          <input
            name="notes"
            maxLength={2000}
            placeholder="Any preferences or health notes?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && !loadingSlots && (
          <p className="error" role="alert" style={{ gridColumn: "1 / -1" }}>
            {error}
          </p>
        )}

        {/* ── Invoice Style Summary (Reflects directly untop of 'confirm booking and pay' button) ── */}
        {selectedServices.length > 0 && (
          <div className="preconfirm-invoice" style={{ gridColumn: "1 / -1" }}>
            <div className="preconfirm-invoice-header">
              <span className="eyebrow" style={{ color: "var(--olive)", marginBottom: 4 }}>
                RESERVATION SUMMARY · INVOICE
              </span>
              <h4>Selected Treatments &amp; Booking Details</h4>
            </div>

            {/* Itemized Treatments */}
            <div className="preconfirm-invoice-items">
              {selectedServices.map((s) => (
                <div className="preconfirm-item-row" key={s.id}>
                  <div>
                    <strong className="preconfirm-item-name">{s.name}</strong>
                    <span className="preconfirm-item-duration"> · {duration(s.duration_minutes)}</span>
                  </div>
                  <strong className="preconfirm-item-price">{naira(s.price)}</strong>
                </div>
              ))}
            </div>

            {/* Verified Date, Time & Therapist */}
            <div className="preconfirm-meta-grid">
              <div className="preconfirm-meta-cell">
                <span>Selected Date</span>
                <strong>{formattedDate || "Select a date above"}</strong>
              </div>
              <div className="preconfirm-meta-cell">
                <span>Selected Time</span>
                <strong>{time ? timeLabel(time) : "Select an open time slot above"}</strong>
              </div>
              <div className="preconfirm-meta-cell">
                <span>Preferred Therapist</span>
                <strong>{selectedTherapistName}</strong>
              </div>
            </div>

            {/* Pricing totals */}
            <div className="preconfirm-totals">
              <div className="preconfirm-total-row">
                <span>Total Treatment Fee</span>
                <strong>{naira(totalPrice)}</strong>
              </div>
              <div className="preconfirm-total-row highlight">
                <span>50% Advance Deposit Due Today</span>
                <strong style={{ color: "var(--olive)", fontSize: "18px" }}>{naira(depositAmount)}</strong>
              </div>
              <div className="preconfirm-total-row">
                <span>Remaining Balance Due at Spa</span>
                <strong>{naira(balanceAmount)}</strong>
              </div>
            </div>
            <p className="preconfirm-note">
              ✓ Please review your booking details above before confirming your reservation.
            </p>
          </div>
        )}

        {/* ── "confirm booking and pay" Button ── */}
        <button
          type="button"
          disabled={loading || loadingSlots}
          className="button submit"
          onClick={handleConfirmBookingClick}
        >
          {loading ? "Processing…" : "confirm booking and pay"}
        </button>
      </form>

      {/* ── Guideline & Policy + Payment Details (Revealed upon clicking "confirm booking and pay") ── */}
      {showReview && (
        <div ref={reviewRef} className="confirm-review-panel">
          {/* 1. Spa Guidelines & Booking Policies (Scroll design) */}
          {bookingPolicies && (
            <aside className="booking-policies-panel" aria-label="Spa Guidelines and Policies">
              <div className="booking-policies-header">
                <span className="eyebrow" style={{ color: "var(--gold)" }}>
                  CONSIDERED CARE · POLICIES
                </span>
                <h3>Spa Guidelines &amp; Booking Policies</h3>
                <p>Please review our guidelines below before completing payment:</p>
              </div>
              <PolicyScroll policies={bookingPolicies} />
            </aside>
          )}

          {/* 2. Payment Details & Invoice Breakdown (Below the policies) */}
          <section className="invoice-card" aria-label="Payment invoice and checkout">
            <div className="invoice-header">
              <span className="eyebrow" style={{ color: "var(--olive)" }}>
                ORDER BREAKDOWN · INVOICE
              </span>
              <h4>Payment &amp; Reservation Details</h4>
            </div>

            {/* List of picked services and their costs */}
            <div className="invoice-lines">
              {selectedServices.map((s) => (
                <div className="invoice-line" key={s.id}>
                  <div className="invoice-line-info">
                    <span className="invoice-name">{s.name}</span>
                    <span className="invoice-duration">
                      {duration(s.duration_minutes)} · {s.category || "Treatment"}
                    </span>
                  </div>
                  <span className="invoice-price">{naira(s.price)}</span>
                </div>
              ))}
            </div>

            {/* Totals & Deposit split */}
            <div className="invoice-totals">
              <div className="invoice-total-row subtotal">
                <span>Total Treatment Cost</span>
                <strong style={{ fontSize: "16px" }}>{naira(totalPrice)}</strong>
              </div>
              <div className="invoice-total-row deposit">
                <span>50% Advance Deposit Due Today</span>
                <strong>{naira(depositAmount)}</strong>
              </div>
              <div className="invoice-total-row balance">
                <span>Balance Payable at Spa</span>
                <span>{naira(balanceAmount)}</span>
              </div>
            </div>

            {/* Payment methods: Card and Transfer ONLY (No USSD) */}
            <div className="payment-options-block">
              <div className="payment-methods-header">
                <span className="payment-methods-label">Accepted Payment Options</span>
                <span className="payment-methods-note">Secured by Paystack</span>
              </div>
              <div className="payment-chips">
                <span className="payment-chip">
                  <span className="payment-chip-icon">💳</span>
                  <strong>Pay with Card</strong>
                  <small>Mastercard, Visa, Verve</small>
                </span>
                <span className="payment-chip">
                  <span className="payment-chip-icon">🏦</span>
                  <strong>Pay with Transfer</strong>
                  <small>Instant Bank Transfer</small>
                </span>
              </div>
            </div>

            {/* Checkout CTA */}
            <button
              type="button"
              disabled={loading}
              className="button invoice-pay-btn"
              onClick={handlePaystackCheckout}
            >
              {loading
                ? "Connecting to Paystack…"
                : `Pay 50% Deposit (${naira(depositAmount)}) →`}
            </button>

            <p className="invoice-security-note">
              🔒 Your appointment slot is held immediately for 15 minutes while you complete checkout.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
