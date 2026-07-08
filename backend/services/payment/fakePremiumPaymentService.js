import crypto from "crypto";

const ALLOWED_PLANS = Object.freeze(["FREE", "MONTHLY", "YEARLY"]);

const getWebhookSecret = () => process.env.FAKE_PAYMENT_WEBHOOK_SECRET || process.env.JWT_SECRET;

export const isAllowedPremiumPlan = (plan) => ALLOWED_PLANS.includes(plan);

export const computePremiumEndDate = (plan, fromDate = new Date()) => {
  if (plan === "FREE") return null;

  const endDate = new Date(fromDate);
  if (plan === "MONTHLY") {
    endDate.setMonth(endDate.getMonth() + 1);
    return endDate;
  }

  if (plan === "YEARLY") {
    endDate.setFullYear(endDate.getFullYear() + 1);
    return endDate;
  }

  throw new Error("Plan d'abonnement invalide.");
};

export const signFakePaymentPayload = (payload) => {
  const secret = getWebhookSecret();
  if (!secret || secret.length < 32) {
    throw new Error("FAKE_PAYMENT_WEBHOOK_SECRET ou JWT_SECRET doit contenir au moins 32 caractères.");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
};

export const verifyFakePaymentPayload = (payload, signature) => {
  if (!signature || typeof signature !== "string") return false;

  const expected = signFakePaymentPayload(payload);
  if (signature.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

export const createFakePaymentEvent = ({ userId, plan }) => {
  if (!Number.isInteger(Number(userId))) {
    throw new Error("Utilisateur invalide.");
  }

  if (!isAllowedPremiumPlan(plan)) {
    throw new Error("Plan d'abonnement invalide.");
  }

  const payload = {
    provider: "fake",
    event: "premium.payment.succeeded",
    paymentId: `fake_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
    userId: Number(userId),
    plan,
    paid: plan !== "FREE",
    createdAt: new Date().toISOString(),
  };

  return {
    payload,
    signature: signFakePaymentPayload(payload),
  };
};
