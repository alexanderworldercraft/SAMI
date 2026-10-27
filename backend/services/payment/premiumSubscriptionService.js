import { prisma } from "../db.js";
import { ADMIN_GRADE_IDS, ETAT } from "../../constants.js";
import { computePremiumEndDate, isAllowedPremiumPlan } from "./fakePremiumPaymentService.js";

export const PREMIUM_API_KEY = "fake_premium_api";
const PAID_PLANS = ["MONTHLY", "YEARLY"];
const userSelect = {
  UtilisateurID: true, GradeID: true, EtatID: true,
  PremiumEndDate: true, PremiumPlan: true, PremiumRenewalPlan: true,
};
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export async function getPremiumApiSetting({ database = prisma } = {}) {
  let setting = await database.appSetting.findUnique({ where: { Cle: PREMIUM_API_KEY } });
  if (!setting) {
    setting = await database.appSetting.upsert({
      where: { Cle: PREMIUM_API_KEY },
      create: { Cle: PREMIUM_API_KEY, Valeur: { active: process.env.SAMI_ENABLE_FAKE_PREMIUM !== "false" } },
      update: {},
    });
  }
  return { key: PREMIUM_API_KEY, active: setting.Valeur?.active === true, updatedAt: setting.UpdatedAt };
}

export async function setPremiumApiSetting(active, { database = prisma } = {}) {
  if (typeof active !== "boolean") throw fail("active doit être un booléen.", 400);
  const setting = await database.appSetting.upsert({
    where: { Cle: PREMIUM_API_KEY },
    create: { Cle: PREMIUM_API_KEY, Valeur: { active } },
    update: { Valeur: { active } },
  });
  return { key: PREMIUM_API_KEY, active: setting.Valeur.active, updatedAt: setting.UpdatedAt };
}

export function serializePremiumSubscription(user) {
  const isPremium = Boolean(user.PremiumEndDate && new Date(user.PremiumEndDate) > new Date());
  return {
    PremiumEndDate: user.PremiumEndDate,
    isPremium,
    currentPlan: isPremium ? (user.PremiumPlan || "MONTHLY") : "FREE",
    renewalPlan: user.PremiumRenewalPlan || null,
    autoRenew: Boolean(user.PremiumRenewalPlan),
  };
}

async function lockUser(tx, userId) {
  await tx.$queryRaw`SELECT UtilisateurID FROM Utilisateur WHERE UtilisateurID = ${userId} FOR UPDATE`;
  const user = await tx.utilisateur.findUnique({ where: { UtilisateurID: userId }, select: userSelect });
  if (!user || user.EtatID !== ETAT.ACTIVE) throw fail("Compte indisponible.", 403);
  return user;
}

async function requirePaymentApi(tx) {
  await getPremiumApiSetting({ database: tx });
  await tx.$queryRaw`SELECT AppSettingID FROM AppSetting WHERE Cle = ${PREMIUM_API_KEY} FOR UPDATE`;
  const setting = await getPremiumApiSetting({ database: tx });
  if (!setting.active) throw fail("Les souscriptions et renouvellements sont temporairement désactivés. Le désabonnement reste disponible.", 503);
}

export async function changePremiumPlan(userId, plan, { database = prisma, paymentId = null } = {}) {
  if (!isAllowedPremiumPlan(plan)) throw fail("Plan d'abonnement invalide.", 400);
  return database.$transaction(async (tx) => {
    // Ordre des verrous commun au checkout et au renouvellement : réglage, puis compte.
    if (plan !== "FREE") await requirePaymentApi(tx);
    const user = await lockUser(tx, userId);
    const now = new Date();
    if (paymentId) {
      const previous = await tx.premiumPayment.findUnique({ where: { PaymentID: paymentId } });
      if (previous) {
        if (previous.UtilisateurID !== userId || previous.Plan !== plan) throw fail("Evénement de paiement invalide.", 400);
        return { ...serializePremiumSubscription(user), replayed: true };
      }
    }
    const active = user.PremiumEndDate && new Date(user.PremiumEndDate) > now;
    const data = { PremiumRenewalPlan: plan === "FREE" ? null : plan };
    if (!active && plan !== "FREE") {
      data.PremiumPlan = plan;
      data.PremiumEndDate = computePremiumEndDate(plan, now);
    }
    const updated = await tx.utilisateur.update({ where: { UtilisateurID: userId }, data, select: userSelect });
    if (paymentId) await tx.premiumPayment.create({ data: { PaymentID: paymentId, UtilisateurID: userId, Plan: plan } });
    return { ...serializePremiumSubscription(updated), replayed: false };
  }, { isolationLevel: "ReadCommitted" });
}

export async function renewPremiumSubscription(userId, { database = prisma } = {}) {
  const setting = await getPremiumApiSetting({ database });
  if (!setting.active) return false;
  return database.$transaction(async (tx) => {
    try { await requirePaymentApi(tx); }
    catch (error) { if (error.statusCode === 503) return false; throw error; }
    const user = await lockUser(tx, userId);
    const now = new Date();
    if (!PAID_PLANS.includes(user.PremiumRenewalPlan) || !user.PremiumEndDate || new Date(user.PremiumEndDate) > now) return false;
    const plan = user.PremiumRenewalPlan;
    let end = new Date(user.PremiumEndDate);
    const paymentId = `renewal_${userId}_${end.toISOString()}`;
    // Rattrapage à partir de l'échéance conservée si le serveur était arrêté.
    do { end = computePremiumEndDate(plan, end); } while (end <= now);
    await tx.premiumPayment.create({ data: { PaymentID: paymentId, UtilisateurID: userId, Plan: plan } });
    await tx.utilisateur.update({
      where: { UtilisateurID: userId },
      data: { PremiumPlan: plan, PremiumEndDate: end },
    });
    return true;
  }, { isolationLevel: "ReadCommitted" });
}

export async function renewDuePremiumSubscriptions({ database = prisma, logger = console } = {}) {
  if (!(await getPremiumApiSetting({ database })).active) return 0;
  const users = await database.utilisateur.findMany({
    where: { EtatID: ETAT.ACTIVE, PremiumRenewalPlan: { in: PAID_PLANS }, PremiumEndDate: { lte: new Date() } },
    select: { UtilisateurID: true },
  });
  let renewed = 0;
  for (const user of users) {
    try { if (await renewPremiumSubscription(user.UtilisateurID, { database })) renewed++; }
    catch (error) { logger.error("Erreur de renouvellement Premium :", user.UtilisateurID, error); }
  }
  return renewed;
}

export async function getPremiumSubscription(userId, { database = prisma } = {}) {
  await renewPremiumSubscription(userId, { database });
  const user = await database.utilisateur.findUnique({ where: { UtilisateurID: userId }, select: userSelect });
  if (!user || user.EtatID !== ETAT.ACTIVE) throw fail("Compte indisponible.", 403);
  const adminAccessPreserved = ADMIN_GRADE_IDS.includes(user.GradeID);
  const [setting, films, series] = await Promise.all([
    getPremiumApiSetting({ database }),
    adminAccessPreserved ? 0 : database.video.count({ where: { EtatID: ETAT.ACTIVE, SaisonID: null, Premium: true } }),
    adminAccessPreserved ? 0 : database.series.count({ where: {
      EtatID: ETAT.ACTIVE,
      OR: [
        { Premium: true },
        { Saisons: { some: { Episodes: { some: { EtatID: ETAT.ACTIVE, Premium: true } } } } },
      ],
    } }),
  ]);
  return { ...serializePremiumSubscription(user), apiActive: setting.active, contentLoss: { films, series, adminAccessPreserved } };
}
