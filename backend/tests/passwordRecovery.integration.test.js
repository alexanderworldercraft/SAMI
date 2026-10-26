import { createRequire } from "node:module";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordRecoveryService, passwordRecoveryService, RECOVERY_MESSAGE } from "../services/passwordRecoveryService.js";
import { issueUserSession, verifyUserSession, validateSessionClaims } from "../services/userSessionService.js";
import { consumeRecoveryLimit } from "../services/recoveryRateLimitService.js";
import { createVideoMediaAccessToken, verifyVideoMediaAccessToken } from "../services/videoMediaAccessToken.js";
import { findExtensionAccessToken } from "../services/extensionAuthService.js";
import { createServer } from "../server/createServer.js";

const frontendRequire = createRequire(new URL("../../frontend/package.json", import.meta.url));
const socket = process.env.SAMI_TEST_MYSQL_SOCKET;
const enabled = Boolean(socket);
const expectedUrl = `mysql://root@localhost/sami_security_test?socket=${socket}`;
if (enabled && (!/^\/private\/tmp\/sami-security-mysql-[^/]+\/mysql\.sock$/.test(socket)
  || process.env.DATABASE_URL !== expectedUrl)) throw new Error("Tests autorisés uniquement sur le MySQL jetable sami_security_test.");
const db = enabled ? new PrismaClient({ datasources: { db: { url: expectedUrl } } }) : null;
let server; let service; let queued; let mails; let user; let hash; let salt; let number = 0;
const requestRecovery = async (ip = "198.51.100.7") => {
  await service.request({ surnom: user.Surnom, email: user.Email, ip });
  await queued.shift()();
  return new URLSearchParams(new URL(mails.at(-1)[2]).hash.slice(1)).get("token");
};
const cookieFrom = response => response.headers["set-cookie"].split(";")[0];
const login = async password => server.inject({ method: "POST", url: "/api/users/login", payload: { surnom: user.Surnom, motDePasse: password } });

describe.skipIf(!enabled)("récupération et sessions — vrai MySQL isolé", () => {
  beforeAll(async () => {
    salt = await bcrypt.genSalt(10); hash = await bcrypt.hash("Original-123!", salt);
    for (const [id, Nom] of [[1,"Actif"],[2,"Supprimé"],[3,"Bloqué"]]) await db.etat.upsert({where:{EtatID:id},create:{EtatID:id,Nom},update:{}});
    for (const [id, Nom] of [[1,"SuperAdmin"],[2,"Admin"],[3,"Utilisateur"]]) await db.grade.upsert({where:{GradeID:id},create:{GradeID:id,Nom},update:{}});
  });
  beforeEach(async () => {
    await db.userSession.deleteMany(); await db.passwordRecovery.deleteMany();
    await db.extensionAuthCode.deleteMany(); await db.extensionAccessToken.deleteMany();
    await db.securityRateLimit.deleteMany(); await db.utilisateur.deleteMany();
    user = await db.utilisateur.create({data:{Surnom:`security-${++number}`,Email:`security-${number}@example.invalid`,MotDePasse:hash,Salt:salt,EtatID:1,GradeID:2}});
    queued=[]; mails=[];
    service=createPasswordRecoveryService({database:db,enqueue:task=>queued.push(task),sendEmail:vi.fn(async(...args)=>mails.push(args)),env:{PUBLIC_URL:"https://sami.test",NODE_ENV:"production"}});
    vi.spyOn(passwordRecoveryService,"request").mockImplementation(service.request);
    vi.spyOn(passwordRecoveryService,"confirm").mockImplementation(service.confirm);
    vi.spyOn(passwordRecoveryService,"complete").mockImplementation(service.complete);
    vi.spyOn(passwordRecoveryService,"consumeTemporaryPassword").mockImplementation(service.consumeTemporaryPassword);
    server=createServer({publicUrl:"https://sami.test",trustProxy:true});await server.ready();
  });
  afterEach(async()=>{await server?.close();vi.restoreAllMocks();});
  afterAll(async()=>{await db?.$disconnect();});
  it("envoie une réponse uniforme pour un compte connu, inconnu ou inactif",async()=>{
    for(const body of [{surnom:user.Surnom,email:user.Email},{surnom:"absent",email:"absent@example.invalid"}]){
      const response=await server.inject({method:"POST",url:"/api/users/reset-password",payload:body});expect(response.statusCode).toBe(202);expect(response.json()).toEqual({message:RECOVERY_MESSAGE});
    }
    await db.utilisateur.update({where:{UtilisateurID:user.UtilisateurID},data:{EtatID:3}});
    const response=await server.inject({method:"POST",url:"/api/users/reset-password",payload:{surnom:user.Surnom,email:user.Email}});expect(response.statusCode).toBe(202);expect(response.json()).toEqual({message:RECOVERY_MESSAGE});
    expect(queued).toHaveLength(1);
  });
  it("ne persiste que le hash du lien et ne change pas le mot de passe à la demande",async()=>{
    const token=await requestRecovery();const record=await db.passwordRecovery.findFirst();
    expect(record.TokenHash).toBe(crypto.createHash("sha256").update(token).digest("hex"));expect(JSON.stringify(record)).not.toContain(token);
    const current=await db.utilisateur.findUnique({where:{UtilisateurID:user.UtilisateurID}});expect(current.MotDePasse).toBe(hash);expect(current.AuthVersion).toBe(1);expect(current.PasswordChangeRequired).toBe(false);
  });
  it("déconnecte les sessions et révoque les accès extension après envoi",async()=>{
    const session=await issueUserSession(user,{database:db});
    const rawToken="sami_ext_synthetic";
    await db.extensionAccessToken.create({data:{ExtensionAccessTokenID:crypto.randomUUID(),TokenHash:crypto.createHash("sha256").update(rawToken).digest("hex"),ClientID:"a".repeat(32),ExtensionName:"test",UtilisateurID:user.UtilisateurID,ExpiresAt:new Date(Date.now()+60000)}});
    await requestRecovery();
    await expect(verifyUserSession(session.token,{database:db})).rejects.toThrow();expect(await findExtensionAccessToken(rawToken)).toBe(null);
  });
  it("la panne SMTP ne change ni le mot de passe ni les sessions",async()=>{
    const session=await issueUserSession(user,{database:db});const tasks=[];
    const failing=createPasswordRecoveryService({database:db,enqueue:task=>tasks.push(task),sendEmail:async()=>{throw new Error("SMTP synthetic");},env:{PUBLIC_URL:"https://sami.test",NODE_ENV:"production"}});
    await failing.request({surnom:user.Surnom,email:user.Email,ip:"198.51.100.7"});await expect(tasks[0]()).rejects.toThrow();
    expect((await db.utilisateur.findUnique({where:{UtilisateurID:user.UtilisateurID}})).MotDePasse).toBe(hash);await expect(verifyUserSession(session.token,{database:db})).resolves.toMatchObject({userId:user.UtilisateurID});expect(await db.passwordRecovery.count()).toBe(0);
  });
  it("le compteur MySQL ne perd aucune tentative concurrente",async()=>{
    const outcomes=await Promise.all(Array.from({length:10},()=>consumeRecoveryLimit("concurrent",{max:5,windowMs:60000,database:db})));
    expect(outcomes.filter(Boolean)).toHaveLength(5);expect((await db.securityRateLimit.findFirst()).Count).toBe(10);
  });
  it("renouvelle une fenêtre expirée et conserve une limite par compte normalisé",async()=>{
    const past=new Date(Date.now()-120000);expect(await consumeRecoveryLimit("expired",{max:1,windowMs:1000,database:db,now:past})).toBe(true);
    expect(await consumeRecoveryLimit("expired",{max:1,windowMs:1000,database:db})).toBe(true);
    for(let i=0;i<4;i++)await service.request({surnom:i%2?user.Surnom.toUpperCase():user.Surnom,email:user.Email,ip:`198.51.100.${10+i}`});
    expect(queued).toHaveLength(3);
  });
  it("limite la demande par IP sans accepter les en-têtes forgés",async()=>{
    for(let i=0;i<6;i++){
      const response=await server.inject({method:"POST",url:"/api/users/reset-password",remoteAddress:"198.51.100.7",headers:{"x-forwarded-for":`203.0.113.${i}`},payload:{surnom:`absent${i}`,email:"absent@example.invalid"}});
      expect(response.statusCode).toBe(i<5?202:429);
    }
    const response=await server.inject({method:"GET",url:"/api/users/me",headers:{}});expect(response.statusCode).toBe(401);
  });
  it("ne permet qu’une confirmation concurrente et aucun rejeu",async()=>{
    const token=await requestRecovery();const results=await Promise.allSettled([service.confirm({token,ip:"198.51.100.7"}),service.confirm({token,ip:"198.51.100.8"})]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
    await expect(service.confirm({token,ip:"198.51.100.7"})).rejects.toThrow(/invalide|expiré/);
  });
  it("refuse un lien expiré, non envoyé ou un compte devenu bloqué",async()=>{
    const token=await requestRecovery();await db.passwordRecovery.updateMany({data:{ExpiresAt:new Date(Date.now()-1)}});await expect(service.confirm({token,ip:"198.51.100.7"})).rejects.toThrow();
    const next=await requestRecovery("198.51.100.8");await db.utilisateur.update({where:{UtilisateurID:user.UtilisateurID},data:{EtatID:3}});await expect(service.confirm({token:next,ip:"198.51.100.7"})).rejects.toThrow();
  });
  it("la première connexion temporaire n’ouvre que me et le changement obligatoire",async()=>{
    const token=await requestRecovery();const confirmation=await service.confirm({token,ip:"198.51.100.7"});
    expect(await bcrypt.compare(confirmation.temporaryPassword,(await db.utilisateur.findUnique({where:{UtilisateurID:user.UtilisateurID}})).MotDePasse)).toBe(true);
    const response=await login(confirmation.temporaryPassword);expect(response.statusCode).toBe(200);expect(response.json().passwordChangeRequired).toBe(true);
    const cookie=cookieFrom(response);const me=await server.inject({method:"GET",url:"/api/users/me",headers:{cookie}});expect(me.json()).toEqual({UtilisateurID:user.UtilisateurID,passwordChangeRequired:true});
    const denied=await server.inject({method:"GET",url:"/api/users/panel-users",headers:{cookie}});expect(denied.statusCode).toBe(403);expect(denied.json().code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await login(confirmation.temporaryPassword)).statusCode).toBe(401);
    const mismatch=await server.inject({method:"POST",url:"/api/users/password-recovery/complete",headers:{cookie},payload:{newPassword:"Personal-234!",confirmPassword:"different-234!"}});expect(mismatch.statusCode).toBe(400);
    const saved=await server.inject({method:"POST",url:"/api/users/password-recovery/complete",headers:{cookie},payload:{newPassword:"Personal-234!",confirmPassword:"Personal-234!"}});expect(saved.statusCode).toBe(200);
    const normalCookie=cookieFrom(saved);const profile=await server.inject({method:"GET",url:"/api/users/me",headers:{cookie:normalCookie}});expect(profile.statusCode).toBe(200);expect(profile.json().Surnom).toBe(user.Surnom);
    expect((await server.inject({method:"GET",url:"/api/users/me",headers:{cookie}})).statusCode).toBe(401);
    const current=await db.utilisateur.findUnique({where:{UtilisateurID:user.UtilisateurID}});expect(current.PasswordChangeRequired).toBe(false);expect(current.Salt).not.toBe(salt);expect(await bcrypt.compare("Personal-234!",current.MotDePasse)).toBe(true);
    expect(JSON.stringify(profile.json())).not.toMatch(/MotDePasse|Salt/);
  });
  it("refuse un mot de passe temporaire expiré et une session normale falsifiée",async()=>{
    const token=await requestRecovery();const confirmation=await service.confirm({token,ip:"198.51.100.7"});await db.utilisateur.update({where:{UtilisateurID:user.UtilisateurID},data:{RecoveryPasswordExpiresAt:new Date(Date.now()-1)}});
    expect((await login(confirmation.temporaryPassword)).statusCode).toBe(401);
    await expect(verifyUserSession(jwt.sign({userId:user.UtilisateurID},process.env.JWT_SECRET),{database:db})).rejects.toThrow();
  });
  it("un compte bloqué ou supprimé n’accède plus au serveur, même avec son ancien cookie",async()=>{
    const session=await issueUserSession(user,{database:db});for(const EtatID of [3,2]){await db.utilisateur.update({where:{UtilisateurID:user.UtilisateurID},data:{EtatID}});await expect(verifyUserSession(session.token,{database:db})).rejects.toThrow();expect((await login("Original-123!")).statusCode).toBe(403);}
  });
  it("la déconnexion invalide aussi les médias dérivés de cette session",async()=>{
    const response=await login("Original-123!");const cookie=cookieFrom(response);const session=jwt.decode(decodeURIComponent(cookie.split("=").slice(1).join("=")));
    const media=createVideoMediaAccessToken({userId:user.UtilisateurID,videoId:42,sessionId:session.jti,authVersion:session.authVersion,sessionExpiresAt:session.exp});
    const decoded=verifyVideoMediaAccessToken(media,42);await expect(validateSessionClaims({...decoded,tokenUse:"session"},{database:db})).resolves.toMatchObject({userId:user.UtilisateurID});
    expect((await server.inject({method:"POST",url:"/api/users/logout",headers:{cookie}})).statusCode).toBe(200);
    await expect(validateSessionClaims({...decoded,tokenUse:"session"},{database:db})).rejects.toThrow();
  });
  it("ne publie ni secret ni stacktrace pour les liens invalides et conserve la simulation Premium désactivée",async()=>{
    const bad=await server.inject({method:"POST",url:"/api/users/password-recovery/confirm",payload:{token:"invalid"}});expect(bad.statusCode).toBe(400);expect(bad.headers["cache-control"]).toBe("no-store");expect(bad.body).not.toMatch(/stack|password|TokenHash/);
    const session=await login("Original-123!");const fake=await server.inject({method:"POST",url:"/api/users/premium/fake-checkout",headers:{cookie:cookieFrom(session)},payload:{plan:"YEARLY"}});expect(fake.statusCode).toBe(404);
  });
  it("invalide un ancien lien après une nouvelle demande envoyée",async()=>{
    const first=await requestRecovery();const second=await requestRecovery("198.51.100.8");
    await expect(service.confirm({token:first,ip:"198.51.100.7"})).rejects.toThrow();
    await expect(service.confirm({token:second,ip:"198.51.100.7"})).resolves.toHaveProperty("temporaryPassword");
  });
  it("ne permet qu’une première connexion temporaire et qu’un changement concurrent",async()=>{
    const token=await requestRecovery();const {temporaryPassword}=await service.confirm({token,ip:"198.51.100.7"});
    const logins=await Promise.all([login(temporaryPassword),login(temporaryPassword)]);expect(logins.map(r=>r.statusCode).sort()).toEqual([200,401]);
    const cookie=cookieFrom(logins.find(r=>r.statusCode===200));
    const change=()=>server.inject({method:"POST",url:"/api/users/password-recovery/complete",headers:{cookie},payload:{newPassword:"Personal-345!",confirmPassword:"Personal-345!"}});
    const results=await Promise.all([change(),change()]);expect(results.filter(r=>r.statusCode===200)).toHaveLength(1);expect(results.filter(r=>r.statusCode===401)).toHaveLength(1);
  });
  it("authentifie les sockets puis les coupe lors d’une demande de récupération envoyée",async()=>{
    const {io}=frontendRequire("socket.io-client");
    await server.listen({host:"127.0.0.1",port:0});const port=server.server.address().port;
    const anonymous=io(`http://127.0.0.1:${port}`,{transports:["websocket"],reconnection:false,timeout:1000});
    try { await new Promise((resolve,reject)=>{anonymous.once("connect_error",resolve);anonymous.once("connect",()=>reject(new Error("Anonymous socket admitted")));}); } finally {anonymous.disconnect();}
    const session=await issueUserSession(user,{database:db});
    const client=io(`http://127.0.0.1:${port}`,{transports:["websocket"],reconnection:false,timeout:1000,extraHeaders:{Cookie:`sami_token=${session.token}`}});
    try {
      await new Promise((resolve,reject)=>{client.once("connect",resolve);client.once("connect_error",reject);});
      const closed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Socket not revoked")),1500);client.once("disconnect",()=>{clearTimeout(timer);resolve();});});
      await requestRecovery();await closed;expect(client.connected).toBe(false);
    } finally {client.disconnect();}
  });

  it("lie l’autorisation extension à l’identité serveur malgré les champs fournis par le client",async()=>{
    const response=await login("Original-123!");const verifier=crypto.randomBytes(32).toString("base64url");const clientId="a".repeat(32);
    const authorized=await server.inject({method:"POST",url:"/api/extension-auth/authorize",headers:{cookie:cookieFrom(response)},payload:{
      userId:999999,authVersion:999999,clientId,redirectUri:`https://${clientId}.chromiumapp.org/sami-auth`,state:"b".repeat(32),codeChallenge:crypto.createHash("sha256").update(verifier).digest("base64url"),
    }});
    expect(authorized.statusCode).toBe(200);const record=await db.extensionAuthCode.findFirst();expect(record.UtilisateurID).toBe(user.UtilisateurID);expect(record.AuthVersion).toBe(user.AuthVersion);
    const code=new URL(authorized.json().redirectUrl).searchParams.get("code");
    const exchanged=await server.inject({method:"POST",url:"/api/extension-auth/token",payload:{code,codeVerifier:verifier,clientId,redirectUri:`https://${clientId}.chromiumapp.org/sami-auth`}});
    expect(exchanged.statusCode).toBe(200);const token=exchanged.json().accessToken;expect(await findExtensionAccessToken(token)).not.toBeNull();
    await db.utilisateur.update({where:{UtilisateurID:user.UtilisateurID},data:{AuthVersion:{increment:1}}});expect(await findExtensionAccessToken(token)).toBeNull();
  });
  it("refuse l’échange d’un code extension antérieur à une révocation",async()=>{
    const response=await login("Original-123!");const verifier=crypto.randomBytes(32).toString("base64url");const clientId="a".repeat(32);
    const authorized=await server.inject({method:"POST",url:"/api/extension-auth/authorize",headers:{cookie:cookieFrom(response)},payload:{clientId,redirectUri:`https://${clientId}.chromiumapp.org/sami-auth`,state:"c".repeat(32),codeChallenge:crypto.createHash("sha256").update(verifier).digest("base64url")}});
    expect(authorized.statusCode).toBe(200);const code=new URL(authorized.json().redirectUrl).searchParams.get("code");
    await db.utilisateur.update({where:{UtilisateurID:user.UtilisateurID},data:{AuthVersion:{increment:1}}});
    const exchanged=await server.inject({method:"POST",url:"/api/extension-auth/token",payload:{code,codeVerifier:verifier,clientId,redirectUri:`https://${clientId}.chromiumapp.org/sami-auth`}});expect(exchanged.statusCode).toBe(400);expect(await db.extensionAccessToken.count()).toBe(0);
  });

});
