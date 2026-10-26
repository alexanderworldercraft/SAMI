import jwt from "jsonwebtoken";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ userSession: { findUnique: vi.fn() } }));
vi.mock("../services/db.js", () => ({ prisma: db }));
import { verifyUserSession } from "../services/userSessionService.js";
const secret = "sami-session-unit-secret-for-tests-only";
const sessionId = "00000000-0000-4000-8000-000000000007";
let session;
const token = (payload = {}, options = {}) => jwt.sign({ userId: 7, authVersion: 2, tokenUse: "session", ...payload }, secret,
  { audience: "sami-session", jwtid: sessionId, expiresIn: "10m", ...options });
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", secret); vi.clearAllMocks();
  session = { UserSessionID: sessionId, UtilisateurID: 7, Scope: "session", AuthVersion: 2,
    ExpiresAt: new Date(Date.now() + 600000), Utilisateur: { UtilisateurID: 7, GradeID: 2, EtatID: 1, AuthVersion: 2, PasswordChangeRequired: false } };
  db.userSession.findUnique.mockImplementation(async () => session);
});
afterEach(() => vi.unstubAllEnvs());
describe("sessions persistées", () => {
  it("autorise seulement une session enregistrée du compte actif et de la bonne version", async () => {
    await expect(verifyUserSession(token())).resolves.toMatchObject({ userId: 7, sessionId, gradeId: 2, passwordChangeRequired: false });
  });
  it("refuse le JWT dont la session a été supprimée", async () => {
    db.userSession.findUnique.mockResolvedValue(null);await expect(verifyUserSession(token())).rejects.toMatchObject({statusCode:401});
  });
  it.each([2,3])("refuse une session de compte inactif %s", async EtatID => {
    session.Utilisateur.EtatID=EtatID;await expect(verifyUserSession(token())).rejects.toMatchObject({statusCode:401});
  });
  it("refuse la version antérieure à une récupération", async () => {
    session.Utilisateur.AuthVersion++;await expect(verifyUserSession(token())).rejects.toMatchObject({statusCode:401});
  });
  it("refuse une session expirée en base même si le JWT n’a pas expiré", async () => {
    session.ExpiresAt=new Date(Date.now()-1);await expect(verifyUserSession(token())).rejects.toMatchObject({statusCode:401});
  });
  it("limite le jeton temporaire au parcours de changement obligatoire", async () => {
    session.Scope="password-change";session.Utilisateur.PasswordChangeRequired=true;session.Utilisateur.RecoveryPasswordExpiresAt=new Date(Date.now()+600000);
    const temporary=token({tokenUse:"password-change"});
    await expect(verifyUserSession(temporary)).rejects.toMatchObject({statusCode:403,code:"PASSWORD_CHANGE_REQUIRED"});
    await expect(verifyUserSession(temporary,{allowPasswordChange:true})).resolves.toMatchObject({passwordChangeRequired:true});
    await expect(verifyUserSession(token())).rejects.toMatchObject({statusCode:401});
  });
  it("refuse le jeton hérité dépourvu de session et d’audience", async () => {
    await expect(verifyUserSession(jwt.sign({userId:7},secret))).rejects.toMatchObject({statusCode:401});expect(db.userSession.findUnique).not.toHaveBeenCalled();
  });
  it.each([{audience:"sami-video-media"},{algorithm:"HS512"}])("refuse les audiences ou algorithmes hors du contrat %j",async options=>{
    await expect(verifyUserSession(token({},options))).rejects.toMatchObject({statusCode:401});expect(db.userSession.findUnique).not.toHaveBeenCalled();
  });
});
