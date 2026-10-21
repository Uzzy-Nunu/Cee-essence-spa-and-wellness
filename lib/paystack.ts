import crypto, { timingSafeEqual } from "node:crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }
  return key;
}

export type InitializeTransactionParams = {
  email: string;
  amountInNaira: number;
  callbackUrl?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
};

export type InitializeTransactionResult = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

/**
 * Initialize a Paystack transaction for the specified amount (converted to kobo).
 */
export async function initializePaystackTransaction(
  params: InitializeTransactionParams,
): Promise<InitializeTransactionResult> {
  const secretKey = getPaystackSecretKey();
  const amountInKobo = Math.round(params.amountInNaira * 100);

  const payload: Record<string, unknown> = {
    email: params.email,
    amount: amountInKobo,
  };

  if (params.callbackUrl) payload.callback_url = params.callbackUrl;
  if (params.reference) payload.reference = params.reference;
  if (params.metadata) payload.metadata = params.metadata;
  // Restrict payment channels: card + bank_transfer only (no USSD)
  payload.channels = params.channels ?? ["card", "bank_transfer"];

  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.status || !data.data?.authorization_url) {
    console.error("Paystack initialize failed:", data);
    throw new Error(data.message || "Failed to initialize payment with Paystack.");
  }

  return {
    authorization_url: data.data.authorization_url,
    access_code: data.data.access_code,
    reference: data.data.reference,
  };
}

export type VerifyTransactionResult = {
  status: "success" | "failed" | "abandoned" | "reversed" | string;
  reference: string;
  amount: number; // in kobo
  amountInNaira: number;
  paid_at: string | null;
  channel: string | null;
  currency: string;
  customer: {
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
  };
  metadata?: Record<string, unknown>;
};

/**
 * Verify a transaction directly against Paystack's REST API.
 */
export async function verifyPaystackTransaction(
  reference: string,
): Promise<VerifyTransactionResult> {
  const secretKey = getPaystackSecretKey();

  const res = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  const data = await res.json();
  if (!res.ok || !data.status || !data.data) {
    console.error("Paystack verification failed:", data);
    throw new Error(data.message || "Unable to verify transaction with Paystack.");
  }

  const tx = data.data;
  return {
    status: tx.status,
    reference: tx.reference,
    amount: tx.amount,
    amountInNaira: tx.amount / 100,
    paid_at: tx.paid_at || null,
    channel: tx.channel || null,
    currency: tx.currency || "NGN",
    customer: tx.customer || { email: "" },
    metadata: tx.metadata || {},
  };
}

/**
 * Validate HMAC-SHA512 webhook signature from Paystack.
 */
export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  try {
    const secretKey = getPaystackSecretKey();
    const hash = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");
    const expected = Buffer.from(hash, "hex");
    const supplied = Buffer.from(signature, "hex");
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch (err) {
    console.error("Signature verification exception:", err);
    return false;
  }
}
