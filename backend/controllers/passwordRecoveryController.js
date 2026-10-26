import { passwordRecoveryService, RECOVERY_MESSAGE } from "../services/passwordRecoveryService.js";
import { issueUserSession } from "../services/userSessionService.js";
import { setSessionCookie } from "../services/authCookie.js";
import { getClientIp } from "./logController.js";
const privateResponse = reply => reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
const errorResponse = (reply, error) => reply.status(error.statusCode || 503).send({
  error: error.statusCode ? error.message : "La récupération est momentanément indisponible.",
});
export const passwordRecoveryController = {
  async request(request, reply) {
    privateResponse(reply);
    try {
      await passwordRecoveryService.request({ ...(request.body || {}), ip: getClientIp(request) });
      return reply.status(202).send({ message: RECOVERY_MESSAGE });
    } catch (error) { return errorResponse(reply, error); }
  },
  async confirm(request, reply) {
    privateResponse(reply);
    try { return reply.send(await passwordRecoveryService.confirm({ token: request.body?.token, ip: getClientIp(request) })); }
    catch (error) { return errorResponse(reply, error); }
  },
  async complete(request, reply) {
    privateResponse(reply);
    try {
      if (!request.user?.passwordChangeRequired) return reply.status(403).send({ error: "Session de récupération requise." });
      const user = await passwordRecoveryService.complete({ session: request.user,
        newPassword: request.body?.newPassword, confirmPassword: request.body?.confirmPassword, ip: getClientIp(request) });
      setSessionCookie(reply, await issueUserSession(user));
      return reply.send({ message: "Ton mot de passe a été modifié.", passwordChangeRequired: false });
    } catch (error) { return errorResponse(reply, error); }
  },
};
