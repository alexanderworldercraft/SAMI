import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
const db = vi.hoisted(() => ({ utilisateur: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() }, action: { findUnique: vi.fn() }, log: { create: vi.fn() } }));
vi.mock("../services/db.js", () => ({ prisma: db, default: db }));
vi.mock("../services/mailService.js", () => ({ sendPasswordResetEmail: vi.fn() }));
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { ensureAdmin } from "../services/authz.js";
import { getClientIp } from "../controllers/logController.js";
import { userRepository } from "../models/user.js";
import { userController } from "../controllers/userController.js";
import { getVideoMediaAccess } from "../services/protectedMediaService.js";
import { createServer } from "../server/createServer.js";
const secret = "sami-audit-synthetic-secret-20261026-only";
const reply = () => { const r = { send: vi.fn(), header: vi.fn() }; r.status = vi.fn(() => r); r.code = r.status; return r; };
let server;
beforeEach(() => { vi.clearAllMocks(); db.utilisateur.findUnique.mockResolvedValue({ UtilisateurID: 7, GradeID: 2, EtatID: 1 }); db.utilisateur.update.mockResolvedValue({}); db.action.findUnique.mockResolvedValue(null); });
afterEach(async () => { await server?.close(); server = undefined; vi.restoreAllMocks(); });
describe("security audit 2026-10-26", () => {
  it.each([2,3])("rejects an existing JWT when EtatID is %i", async EtatID => {
    db.utilisateur.findUnique.mockResolvedValue({ UtilisateurID: 7, GradeID: 2, EtatID });
    const token = jwt.sign({ userId: 7 }, secret, { expiresIn: "1h" }); const r=reply();
    await authMiddleware({ headers: { authorization: `Bearer ${token}` } }, r);
    expect(r.status).toHaveBeenCalledWith(401);
  });
  it("allows an active account with a valid JWT", async () => { const r=reply(); const req={headers:{authorization:`Bearer ${jwt.sign({userId:7},secret,{expiresIn:"1h"})}`}}; await authMiddleware(req,r); expect(r.status).not.toHaveBeenCalled(); expect(req.user.userId).toBe(7); });
  it("rejects deleted-account login even with a valid password", async () => {
    vi.spyOn(userRepository,"getUserBySurnom").mockResolvedValue({UtilisateurID:7,Surnom:"synthetic-deleted",EtatID:2,GradeID:2,MotDePasse:"$2b$10$tMuo9A4QxQ4KeVHrXsJ0OO9feXsQqriXkP96TZ9SjqGFPPtKwV8uW"});
    const bcrypt=await import("bcrypt");vi.spyOn(bcrypt.default,"compare").mockResolvedValue(true);
    const r=reply();await userController.login({body:{surnom:"synthetic-deleted",motDePasse:"synthetic-only"},headers:{},ip:"127.0.0.1"},r);expect(r.status).toHaveBeenCalledWith(403);
  });
  it("denies administrator rights to an inactive administrator",async()=> { db.utilisateur.findUnique.mockResolvedValue({GradeID:2,EtatID:3}); const r=reply();expect(await ensureAdmin({user:{userId:7}},r)).toBe(null);expect(r.status).toHaveBeenCalledWith(403); });
  it("denies media access for a blocked user including scoped media tokens",async()=> { const database={video:{findUnique:vi.fn().mockResolvedValue({VideoID:42,EtatID:1,VideoAudioTracks:[]})},utilisateur:{findUnique:vi.fn().mockResolvedValue({UtilisateurID:7,GradeID:2,EtatID:3})}}; const out=await getVideoMediaAccess(42,7,{database});expect(out.error?.statusCode).toBe(401); });
  it("does not trust arbitrary forwarded headers in the IP helper",()=> { expect(getClientIp({ip:"198.51.100.7",headers:{"x-forwarded-for":"203.0.113.8","x-real-ip":"203.0.113.9"}})).toBe("198.51.100.7"); });
  it("uses only the trusted loopback hop when proxy support is enabled",async()=> { server=createServer({trustProxy:true,publicUrl:"https://sami.test"}); server.get("/audit-ip",r=>({ip:r.ip}));const r=await server.inject({method:"GET",url:"/audit-ip",remoteAddress:"127.0.0.1",headers:{"x-forwarded-for":"203.0.113.8, 198.51.100.7"}});expect(r.json().ip).toBe("198.51.100.7"); });
  it.each(["createFakePremiumCheckout","fakePremiumPaymentWebhook","handleFakePremiumPaymentEvent"])("disables %s in production before any mutation",async method=> { const r=reply(); await userController[method]({user:{userId:7},body:{plan:"YEARLY"},headers:{}},r,{},"synthetic-signature");expect(r.status).toHaveBeenCalledWith(404);expect(db.utilisateur.update).not.toHaveBeenCalled(); });
  it("rejects unauthenticated socket connections",async()=> { server=createServer({publicUrl:"https://sami.test"});await server.ready();expect(server.io.of("/")._fns.length).toBeGreaterThan(0);const next=vi.fn();for(const fn of server.io.of("/")._fns)await fn({handshake:{headers:{}},data:{}},next);expect(next).toHaveBeenCalledWith(expect.any(Error)); });
});
