import { NextRequest, NextResponse } from "next/server";
import { verifyPaystackSignature } from "@/lib/paystack";
import { confirmBookingPayment } from "@/lib/confirm-booking";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    // 1. Verify Paystack HMAC-SHA512 webhook signature
    const isValidSignature = verifyPaystackSignature(rawBody, signature);
    if (!isValidSignature) {
      console.warn("Paystack webhook signature verification failed.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { event, data } = payload;

    // We only process charge.success events
    if (event === "charge.success" && data?.reference) {
      const reference = data.reference;

      // Double-verify server-side against Paystack API and confirm appointment
      const result = await confirmBookingPayment(reference);
      if (!result.success) {
        console.error("Webhook confirm booking failed:", result.error);
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("Paystack webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }
}
