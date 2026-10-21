import { NextRequest, NextResponse } from "next/server";
import { confirmBookingPayment } from "@/lib/confirm-booking";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    if (!await enforceRateLimit(req, "payment-verify", 10, 60)) {
      return NextResponse.json({ error: "Too many payment verification requests." }, { status: 429 });
    }
  } catch (error) {
    console.error("Payment verification rate-limit check failed", error);
    return NextResponse.json({ error: "Payment verification is temporarily unavailable." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference") || searchParams.get("trxref");

  if (!reference || reference.length > 100) {
    return NextResponse.json({ error: "A valid transaction reference is required." }, { status: 400 });
  }

  try {
    const result = await confirmBookingPayment(reference);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Payment verification failed." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      alreadyConfirmed: result.alreadyConfirmed,
      appointment: result.appointment,
    });
  } catch (err: any) {
    console.error("Payment verification endpoint error:", err);
    return NextResponse.json({ error: err.message || "Failed to verify payment." }, { status: 500 });
  }
}
