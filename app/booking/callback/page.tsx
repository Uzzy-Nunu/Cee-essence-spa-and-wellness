"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CeeEssenceLogo } from "@/app/logo";
import { naira } from "@/lib/format";

function CallbackContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<any>(null);

  useEffect(() => {
    if (!reference) {
      setError("No transaction reference was provided.");
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function verify() {
      try {
        const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference!)}`);
        const data = await res.json();

        if (!isMounted) return;

        if (!res.ok || !data.success) {
          setError(data.error || "We could not verify your payment. If your account was debited, our team will confirm your session shortly.");
        } else {
          setAppointment(data.appointment);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || "Network error verifying payment.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    verify();
    return () => { isMounted = false; };
  }, [reference]);

  return (
    <div className="callback-card">
      {loading && (
        <div className="callback-loading">
          <div className="spinner" />
          <h2>Verifying your deposit…</h2>
          <p>Please wait a moment while we confirm your payment with Paystack.</p>
        </div>
      )}

      {!loading && error && (
        <div className="callback-error">
          <div className="icon-badge error">✕</div>
          <h2>Payment Verification Pending</h2>
          <p>{error}</p>
          <div className="actions" style={{ justifyContent: "center", marginTop: "24px" }}>
            <Link href="/#book" className="button">
              Try booking again
            </Link>
            <Link href="/" className="text-button">
              Return to home
            </Link>
          </div>
        </div>
      )}

      {!loading && appointment && (
        <div className="callback-success">
          <div className="icon-badge success">✓</div>
          <span className="eyebrow" style={{ color: "var(--olive)" }}>APPOINTMENT CONFIRMED</span>
          <h2>Your sanctuary awaits.</h2>
          <p className="lead-text">
            Thank you, <strong>{appointment.full_name}</strong>. Your 50% deposit has been received and your booking is confirmed.
          </p>

          <div className="confirmation-receipt">
            <div className="receipt-row">
              <span>Treatment</span>
              <strong>{appointment.treatment_name || appointment.services?.name || "Spa Treatment"}</strong>
            </div>
            <div className="receipt-row">
              <span>Date &amp; Time</span>
              <strong>
                {appointment.appointment_date} at {appointment.start_time?.slice(0, 5)}
              </strong>
            </div>
            {appointment.therapists?.full_name && (
              <div className="receipt-row">
                <span>Therapist</span>
                <strong>{appointment.therapists.full_name}</strong>
              </div>
            )}
            {appointment.total_price != null && (
              <div className="receipt-row">
                <span>Total Treatment Fee</span>
                <strong>{naira(appointment.total_price)}</strong>
              </div>
            )}
            <div className="receipt-row">
              <span>50% Deposit Paid</span>
              <strong style={{ color: "#2e6930" }}>
                ✓ {appointment.deposit_paid != null
                  ? naira(appointment.deposit_paid)
                  : appointment.services?.price
                  ? naira(Math.round(appointment.services.price * 0.5))
                  : "Paid via Paystack"}
              </strong>
            </div>
            <div className="receipt-row balance-row">
              <span>Remaining Balance Due at Spa</span>
              <strong>
                {naira(
                  appointment.balance_due != null
                    ? appointment.balance_due
                    : appointment.services?.price
                    ? Math.round(appointment.services.price * 0.5)
                    : 0,
                )}
              </strong>
            </div>
            <div className="receipt-row reference-row">
              <span>Paystack Reference</span>
              <code>{appointment.paystack_reference || reference}</code>
            </div>
          </div>

          <p className="notice-sub">
            A confirmation receipt has been sent to <strong>{appointment.email}</strong>.
            Please arrive 5–10 minutes early. We look forward to tending to you.
          </p>

          <div style={{ marginTop: "28px" }}>
            <Link href="/" className="button">
              Return to homepage <span>→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookingCallbackPage() {
  return (
    <main className="callback-shell">
      <div className="callback-nav">
        <Link href="/">
          <CeeEssenceLogo variant="dark" size="sm" />
        </Link>
      </div>
      <Suspense fallback={<div className="callback-loading"><p>Loading session…</p></div>}>
        <CallbackContent />
      </Suspense>
    </main>
  );
}
