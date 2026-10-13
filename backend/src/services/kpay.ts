import crypto from "node:crypto";

export type KPayCheckoutInput = {
  reference: string;
  amount: number;
  currency: "MMK";
  description: string;
  callbackUrl: string;
  returnUrl: string;
};

export type KPayCheckout = {
  providerReference: string;
  checkoutUrl: string;
  qrCode?: string;
};

export class KPayUnavailableError extends Error {
  constructor(message = "KPay is not configured. Contact the Zawana administrator.") {
    super(message);
    this.name = "KPayUnavailableError";
  }
}

/**
 * KPay is integrated through the merchant's KPay-approved checkout adapter.
 * The adapter translates this stable Zawana contract to the merchant API
 * credentials/protocol issued to the business. No client request can mark an
 * attempt as paid; only a signed provider callback can do that.
 */
export async function createKPayCheckout(input: KPayCheckoutInput): Promise<KPayCheckout> {
  const url = process.env.KPAY_CHECKOUT_ADAPTER_URL;
  const apiKey = process.env.KPAY_ADAPTER_API_KEY;
  if (!url || !apiKey) throw new KPayUnavailableError();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new KPayUnavailableError("Could not reach the KPay checkout service. Please retry.");
  }
  const body =await response.json().catch(() => null) as Partial<KPayCheckout> | null;
  if (!response.ok || !body?.providerReference || (!body.checkoutUrl && !body.qrCode)) {
    throw new KPayUnavailableError(
      "KPay could not start this payment. No booking or package was activated."
    );
  }
  return {
    providerReference: body.providerReference,
    checkoutUrl: body.checkoutUrl || "",
    qrCode: body.qrCode
  };
}

export function verifyKPaySignature(rawBody: Buffer, supplied: string | undefined): boolean {
  const secret = process.env.KPAY_WEBHOOK_SECRET;
  if (!secret || !supplied) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(supplied.replace(/^sha256=/i, ""), "hex");
  } catch {
    return false;
  }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function kpayIsConfigured() {
  return Boolean(
    process.env.KPAY_CHECKOUT_ADAPTER_URL &&
    process.env.KPAY_ADAPTER_API_KEY &&
    process.env.KPAY_WEBHOOK_SECRET &&
    process.env.KPAY_CALLBACK_URL
  );
}
