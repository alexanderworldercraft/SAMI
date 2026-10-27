import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changePremiumPlan, getPremiumApiSetting, renewPremiumSubscription, setPremiumApiSetting } from "../services/payment/premiumSubscriptionService.js";

const socket = process.env.SAMI_TEST_PREMIUM_MYSQL_SOCKET;
const enabled = Boolean(socket);
const expectedUrl = `mysql://root@localhost/sami_premium_test?socket=${socket}`;
if (enabled && (!/^\/private\/tmp\/sami-premium-mysql-[^/]+\/mysql\.sock$/.test(socket) || process.env.DATABASE_URL !== expectedUrl)) {
  throw new Error("Tests autorisés uniquement sur le MySQL jetable sami_premium_test.");
}
const database = enabled ? new PrismaClient({ datasources: { db: { url: expectedUrl } } }) : null;
let connection, user;

describe.skipIf(!enabled)("abonnements — migration et concurrence sur MySQL isolé", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection({ socketPath: socket, user: "root", multipleStatements: true });
    await connection.query("DROP DATABASE IF EXISTS sami_premium_test");
    await connection.query("CREATE DATABASE sami_premium_test");
    await connection.query("USE sami_premium_test");
    // Reconstituer le schéma précédent sans dépendre d'un fichier local non versionné.
    const baseline = (await fs.readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"))
      .replace(/^  PremiumPlan\s+.*\n/m, "")
      .replace(/^  PremiumRenewalPlan\s+.*\n/m, "")
      .replace(/^  PremiumPayments\s+.*\n/m, "")
      .replace(/^  @@index\(\[PremiumRenewalPlan, PremiumEndDate\]\)\n/m, "")
      .replace(/model PremiumPayment \{[\s\S]*?\n\}\n\n/, "");
    const baselinePath = path.join(path.dirname(socket), "premium-baseline.prisma");
    await fs.writeFile(baselinePath, baseline);
    const { stdout: baselineSql } = await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)),
      "migrate", "diff", "--from-empty", "--to-schema-datamodel", baselinePath, "--script",
    ], { maxBuffer: 2 * 1024 * 1024 });
    await connection.query(baselineSql);
    await connection.query(`
      INSERT INTO Etat (EtatID, Nom) VALUES (1, 'Actif'), (2, 'Supprimé'), (3, 'Bloqué');
      INSERT INTO Grade (GradeID, Nom) VALUES (1, 'SuperAdmin'), (2, 'Admin'), (3, 'Utilisateur');
      INSERT INTO Action (ActionID, Nom, Description, Criticite) VALUES (1, 'premium_payment_fake', 'test', 0);
      INSERT INTO Utilisateur (UtilisateurID, Surnom, Email, MotDePasse, Salt, GradeID, EtatID, PremiumEndDate) VALUES
        (1, 'legacy-missing', 'missing@example.invalid', 'synthetic', 'synthetic', 3, 1, '2035-01-15 12:00:00'),
        (2, 'legacy-yearly', 'yearly@example.invalid', 'synthetic', 'synthetic', 3, 1, '2035-02-15 12:00:00'),
        (3, 'legacy-expired', 'expired@example.invalid', 'synthetic', 'synthetic', 3, 1, '2020-01-15 12:00:00'),
        (4, 'legacy-latest', 'latest@example.invalid', 'synthetic', 'synthetic', 3, 1, '2035-03-15 12:00:00'),
        (5, 'legacy-free', 'free@example.invalid', 'synthetic', 'synthetic', 3, 1, NULL);
      INSERT INTO Log (UtilisateurID, ActionID, Meta, DateAction) VALUES
        (2, 1, JSON_OBJECT('plan', 'YEARLY'), '2025-01-01'),
        (4, 1, JSON_OBJECT('plan', 'YEARLY'), '2025-01-01'),
        (4, 1, JSON_OBJECT('plan', 'MONTHLY'), '2025-02-01');
    `);
    await connection.query(await fs.readFile(new URL("../prisma/migrations/20261027140000_add_premium_subscription_lifecycle/migration.sql", import.meta.url), "utf8"));
  });
  beforeEach(async () => {
    await setPremiumApiSetting(true, { database });
    const id = `premium-${crypto.randomUUID()}`;
    user = await database.utilisateur.create({ data: {
      Surnom: id, Email: `${id}@example.invalid`, MotDePasse: "synthetic", Salt: "synthetic", GradeID: 3, EtatID: 1,
      PremiumPlan: "MONTHLY", PremiumRenewalPlan: "MONTHLY", PremiumEndDate: new Date("2035-04-15T12:00:00Z"),
    } });
  });
  afterAll(async () => { await database?.$disconnect(); await connection?.end(); });

  it("migre les formules connues ou absentes sans modifier les dates ni réabonner les comptes expirés", async () => {
    const users = await database.utilisateur.findMany({ where: { UtilisateurID: { lte: 5 } }, orderBy: { UtilisateurID: "asc" } });
    expect(users.map(row => [row.PremiumPlan, row.PremiumRenewalPlan])).toEqual([
      ["MONTHLY", "MONTHLY"], ["YEARLY", "YEARLY"], [null, null], ["MONTHLY", "MONTHLY"], [null, null],
    ]);
    expect(users.map(row => row.PremiumEndDate?.toISOString() || null)).toEqual([
      "2035-01-15T12:00:00.000Z", "2035-02-15T12:00:00.000Z", "2020-01-15T12:00:00.000Z", "2035-03-15T12:00:00.000Z", null,
    ]);
  });
  it("préserve la période lors d'une résiliation et d'un changement de formule persistés", async () => {
    await changePremiumPlan(user.UtilisateurID, "YEARLY", { database, paymentId: "switch-plan" });
    let current = await database.utilisateur.findUnique({ where: { UtilisateurID: user.UtilisateurID } });
    expect(current.PremiumPlan).toBe("MONTHLY"); expect(current.PremiumRenewalPlan).toBe("YEARLY"); expect(current.PremiumEndDate).toEqual(user.PremiumEndDate);
    await changePremiumPlan(user.UtilisateurID, "FREE", { database });
    current = await database.utilisateur.findUnique({ where: { UtilisateurID: user.UtilisateurID } });
    expect(current.PremiumRenewalPlan).toBe(null); expect(current.PremiumEndDate).toEqual(user.PremiumEndDate);
  });
  it("ne renouvelle qu'une fois avec deux traitements concurrents à l'échéance", async () => {
    const expired = new Date(Date.now() - 1000);
    await database.utilisateur.update({ where: { UtilisateurID: user.UtilisateurID }, data: { PremiumEndDate: expired, PremiumRenewalPlan: "YEARLY" } });
    const outcomes = await Promise.all([renewPremiumSubscription(user.UtilisateurID, { database }), renewPremiumSubscription(user.UtilisateurID, { database })]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const current = await database.utilisateur.findUnique({ where: { UtilisateurID: user.UtilisateurID } });
    expect(current.PremiumPlan).toBe("YEARLY"); expect(current.PremiumEndDate.getUTCFullYear()).toBe(expired.getUTCFullYear() + 1);
    expect(await database.premiumPayment.count({ where: { UtilisateurID: user.UtilisateurID } })).toBe(1);
  });
  it("ne réapplique pas deux webhooks simultanés avec le même identifiant", async () => {
    await database.utilisateur.update({ where: { UtilisateurID: user.UtilisateurID }, data: { PremiumEndDate: null, PremiumPlan: null, PremiumRenewalPlan: null } });
    const outcomes = await Promise.all([1, 2].map(() => changePremiumPlan(user.UtilisateurID, "MONTHLY", { database, paymentId: "duplicate-event" })));
    expect(outcomes.filter(result => result.replayed)).toHaveLength(1);
    expect(outcomes[0].PremiumEndDate).toEqual(outcomes[1].PremiumEndDate);
    expect(await database.premiumPayment.count({ where: { UtilisateurID: user.UtilisateurID } })).toBe(1);
  });
  it("conserve la résiliation après une course entre renouvellement et désabonnement", async () => {
    await database.utilisateur.update({ where: { UtilisateurID: user.UtilisateurID }, data: { PremiumEndDate: new Date(Date.now() - 1000) } });
    await Promise.all([renewPremiumSubscription(user.UtilisateurID, { database }), changePremiumPlan(user.UtilisateurID, "FREE", { database })]);
    expect((await database.utilisateur.findUnique({ where: { UtilisateurID: user.UtilisateurID } })).PremiumRenewalPlan).toBe(null);
    expect(await renewPremiumSubscription(user.UtilisateurID, { database })).toBe(false);
  });
  it("persiste le toggle et autorise toujours la résiliation lorsqu'il est éteint", async () => {
    await setPremiumApiSetting(false, { database }); expect((await getPremiumApiSetting({ database })).active).toBe(false);
    await expect(changePremiumPlan(user.UtilisateurID, "YEARLY", { database, paymentId: "disabled" })).rejects.toMatchObject({ statusCode: 503 });
    expect(await renewPremiumSubscription(user.UtilisateurID, { database })).toBe(false);
    await changePremiumPlan(user.UtilisateurID, "FREE", { database });
    const current = await database.utilisateur.findUnique({ where: { UtilisateurID: user.UtilisateurID } });
    expect(current.PremiumEndDate).toEqual(user.PremiumEndDate); expect(current.PremiumRenewalPlan).toBe(null);
  });
});
