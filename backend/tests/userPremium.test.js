import crypto from "node:crypto";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => ({ database: {
  utilisateur: { update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  userSession: { findUnique: vi.fn() }, appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  premiumPayment: { findUnique: vi.fn(), create: vi.fn() }, video: { count: vi.fn() }, series: { count: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(),
} }));
vi.mock("../services/db.js", () => ({ prisma: database }));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn(), getClientIp: vi.fn() }));
const { default: userRoutes } = await import("../routes/userRoutes.js");
const { default: settingRoutes } = await import("../routes/appSettingRoutes.js");
const { createFakePaymentEvent, computePremiumEndDate } = await import("../services/payment/fakePremiumPaymentService.js");
const { renewDuePremiumSubscriptions, getPremiumApiSetting } = await import("../services/payment/premiumSubscriptionService.js");
let server, authorization, user, setting, payments;
const checkout = (plan, extra = {}) => server.inject({ method: "POST", url: "/api/users/premium/fake-checkout", headers: { authorization }, payload: { plan, ...extra } });
const subscribe = (plan = "MONTHLY") => Object.assign(user, { PremiumPlan: plan, PremiumRenewalPlan: plan, PremiumEndDate: new Date("2026-02-15T12:00:00Z") });

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SAMI_ENABLE_FAKE_PREMIUM", undefined);
  vi.stubEnv("JWT_SECRET", "synthetic-session-secret-for-premium-tests");
  vi.stubEnv("FAKE_PAYMENT_WEBHOOK_SECRET", "synthetic-payment-secret-for-premium-tests");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  user = { UtilisateurID: 7, GradeID: 3, EtatID: 1, PremiumEndDate: null, PremiumPlan: null, PremiumRenewalPlan: null };
  setting = { Valeur: { active: true } }; payments = new Map();
  database.$transaction.mockImplementation(fn => fn(database)); database.$queryRaw.mockResolvedValue([]);
  database.appSetting.findUnique.mockImplementation(async () => setting);
  database.appSetting.upsert.mockImplementation(async ({ create, update }) => (setting = setting ? { ...setting, ...update } : create));
  database.utilisateur.findUnique.mockImplementation(async () => ({ ...user }));
  database.utilisateur.findMany.mockResolvedValue([{ UtilisateurID: 7 }]);
  database.utilisateur.update.mockImplementation(async ({ data }) => Object.assign(user, data));
  database.premiumPayment.findUnique.mockImplementation(async ({ where }) => payments.get(where.PaymentID) || null);
  database.premiumPayment.create.mockImplementation(async ({ data }) => { payments.set(data.PaymentID, data); return data; });
  database.video.count.mockResolvedValue(12); database.series.count.mockResolvedValue(4);
  const sessionId = crypto.randomUUID();
  database.userSession.findUnique.mockImplementation(async () => ({
    UserSessionID: sessionId, UtilisateurID: 7, AuthVersion: 0, Scope: "session", ExpiresAt: new Date("2030-01-16T12:00:00Z"),
    Utilisateur: { ...user, Surnom: "premium-test", AuthVersion: 0, PasswordChangeRequired: false },
  }));
  authorization = `Bearer ${jwt.sign({ userId: 7, authVersion: 0, tokenUse: "session" }, process.env.JWT_SECRET, { algorithm: "HS256", audience: "sami-session", jwtid: sessionId, expiresIn: "3y" })}`;
  server = Fastify(); await server.register(userRoutes, { prefix: "/api/users" });
  await server.register(settingRoutes, { prefix: "/api/app-settings" }); await server.ready();
});
afterEach(async () => { await server?.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("abonnements factices et périodes acquises", () => {
  it.each([["FREE", null, false], ["MONTHLY", "2026-02-15T12:00:00.000Z", true], ["YEARLY", "2027-01-15T12:00:00.000Z", true]])("applique %s uniquement sur le compte connecté", async (plan, end, isPremium) => {
    const response = await checkout(plan, { userId: 99 });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ PremiumEndDate: end, isPremium, autoRenew: isPremium });
    expect(database.utilisateur.update).toHaveBeenCalledWith(expect.objectContaining({ where: { UtilisateurID: 7 } }));
  });
  it.each(["MONTHLY", "YEARLY"])("arrête %s sans perdre de temps ni renouveler après l'échéance", async (plan) => {
    subscribe(plan); const response = await checkout("FREE");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ currentPlan: plan, isPremium: true, autoRenew: false, PremiumEndDate: "2026-02-15T12:00:00.000Z" });
    vi.setSystemTime(new Date("2026-02-16T12:00:00Z")); expect(await renewDuePremiumSubscriptions()).toBe(0);
    expect(user.PremiumEndDate.toISOString()).toBe("2026-02-15T12:00:00.000Z");
  });
  it.each([["MONTHLY", "YEARLY", "2027-02-15T12:00:00.000Z"], ["YEARLY", "MONTHLY", "2026-03-15T12:00:00.000Z"]])("diffère %s vers %s et n'ajoute le temps qu'à l'échéance", async (current, next, end) => {
    subscribe(current); const response = await checkout(next);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ currentPlan: current, renewalPlan: next, PremiumEndDate: "2026-02-15T12:00:00.000Z" });
    expect(await renewDuePremiumSubscriptions()).toBe(0);
    vi.setSystemTime(new Date("2026-02-15T12:00:00Z")); expect(await renewDuePremiumSubscriptions()).toBe(1);
    expect(user.PremiumPlan).toBe(next); expect(user.PremiumEndDate.toISOString()).toBe(end);
    expect(await renewDuePremiumSubscriptions()).toBe(0);
  });
  it("réactive un abonnement résilié sans ajouter de temps immédiatement", async () => {
    subscribe(); await checkout("FREE"); const response = await checkout("MONTHLY");
    expect(response.json()).toMatchObject({ autoRenew: true, renewalPlan: "MONTHLY", PremiumEndDate: "2026-02-15T12:00:00.000Z" });
  });
  it("rattrape une échéance manquée après un arrêt du serveur", async () => {
    subscribe(); vi.setSystemTime(new Date("2026-05-20T12:00:00Z")); expect(await renewDuePremiumSubscriptions()).toBe(1);
    expect(user.PremiumEndDate.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });
  it("refuse les sessions absentes ou révoquées", async () => {
    const absent = await server.inject({ method: "POST", url: "/api/users/premium/fake-checkout", payload: { plan: "YEARLY" } }); expect(absent.statusCode).toBe(401);
    database.userSession.findUnique.mockResolvedValue(null); expect((await checkout("YEARLY")).statusCode).toBe(401); expect(database.utilisateur.update).not.toHaveBeenCalled();
  });
  it("refuse les plans invalides et les corps absents", async () => {
    expect((await checkout("LIFETIME")).statusCode).toBe(400);
    expect((await server.inject({ method: "POST", url: "/api/users/premium/fake-checkout", headers: { authorization } })).statusCode).toBe(400);
    expect(database.utilisateur.update).not.toHaveBeenCalled();
  });
  it("ne réapplique pas un événement signé après une résiliation", async () => {
    const event = createFakePaymentEvent({ userId: 7, plan: "YEARLY" });
    const request = { method: "POST", url: "/api/users/premium/webhook/fake", headers: { "x-fake-payment-signature": event.signature }, payload: event.payload };
    expect((await server.inject(request)).statusCode).toBe(200); await checkout("FREE");
    const response = await server.inject(request); expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ replayed: true, autoRenew: false }); expect(database.premiumPayment.create).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, "invalid-signature"])("refuse une signature invalide (%s)", async (signature) => {
    const event = createFakePaymentEvent({ userId: 7, plan: "YEARLY" });
    const response = await server.inject({ method: "POST", url: "/api/users/premium/webhook/fake", headers: signature ? { "x-fake-payment-signature": signature } : {}, payload: event.payload });
    expect(response.statusCode).toBe(401); expect(database.utilisateur.update).not.toHaveBeenCalled();
  });
  it("retourne la formule et compte les contenus sans compter les épisodes comme films", async () => {
    subscribe("YEARLY"); const response = await server.inject({ method: "GET", url: "/api/users/premium/subscription", headers: { authorization } });
    expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({ currentPlan: "YEARLY", contentLoss: { films: 12, series: 4, adminAccessPreserved: false } });
    expect(database.video.count).toHaveBeenCalledWith({ where: { EtatID: 1, SaisonID: null, Premium: true } });
    expect(database.series.count).toHaveBeenCalledWith({ where: { EtatID: 1, OR: [{ Premium: true }, { Saisons: { some: { Episodes: { some: { EtatID: 1, Premium: true } } } } }] } });
  });
  it("ne promet pas de perte d'accès pour un administrateur", async () => {
    subscribe(); user.GradeID = 2;
    const response = await server.inject({ method: "GET", url: "/api/users/premium/subscription", headers: { authorization } });
    expect(response.json().contentLoss).toEqual({ films: 0, series: 0, adminAccessPreserved: true }); expect(database.video.count).not.toHaveBeenCalled();
  });
});

describe("toggle des abonnements", () => {
  it("initialise le réglage une fois puis donne priorité au choix enregistré", async () => {
    setting = null; vi.stubEnv("SAMI_ENABLE_FAKE_PREMIUM", "false"); expect((await getPremiumApiSetting()).active).toBe(false);
    vi.stubEnv("SAMI_ENABLE_FAKE_PREMIUM", "true"); expect((await getPremiumApiSetting()).active).toBe(false);
  });
  it("bloque paiements et renouvellements, conserve les droits et permet la résiliation", async () => {
    subscribe(); setting.Valeur.active = false; expect((await checkout("YEARLY")).statusCode).toBe(503);
    expect(await renewDuePremiumSubscriptions()).toBe(0); expect(database.utilisateur.update).not.toHaveBeenCalled();
    const response = await checkout("FREE"); expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ isPremium: true, autoRenew: false, PremiumEndDate: "2026-02-15T12:00:00.000Z" });
  });
  it.each([2, 3])("interdit la modification au grade %s", async (grade) => {
    user.GradeID = grade;
    const response = await server.inject({ method: "PUT", url: "/api/app-settings/fake-premium", headers: { authorization }, payload: { active: false } });
    expect(response.statusCode).toBe(403); expect(database.appSetting.upsert).not.toHaveBeenCalled();
  });
  it("permet au SuperAdmin de modifier l'API et refuse une valeur invalide", async () => {
    user.GradeID = 1;
    for (const active of [false, true]) {
      const response = await server.inject({ method: "PUT", url: "/api/app-settings/fake-premium", headers: { authorization }, payload: { active } });
      expect(response.statusCode).toBe(200); expect(response.json().active).toBe(active);
    }
    expect((await checkout("YEARLY")).statusCode).toBe(200);
    expect((await server.inject({ method: "PUT", url: "/api/app-settings/fake-premium", headers: { authorization }, payload: { active: "false" } })).statusCode).toBe(400);
  });
});

describe("dates de renouvellement", () => {
  it.each([["MONTHLY", "2026-01-31T12:00:00Z", "2026-02-28T12:00:00.000Z"], ["YEARLY", "2024-02-29T12:00:00Z", "2025-02-28T12:00:00.000Z"]])("calcule %s sans déborder le mois cible", (plan, start, end) => {
    expect(computePremiumEndDate(plan, new Date(start)).toISOString()).toBe(end);
  });
});
