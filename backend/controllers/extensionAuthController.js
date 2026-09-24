import { ensureAdmin } from "../services/authz.js";
import {
  createExtensionAuthorizationCode,
  exchangeExtensionAuthorizationCode,
  revokeExtensionAccessToken,
} from "../services/extensionAuthService.js";

const bearerToken = (request) => String(request.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();

export const extensionAuthController = {
  async authorize(request, reply) {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    try {
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(String(request.body?.state || ""))) {
        return reply.status(400).send({ error: "État d'autorisation invalide." });
      }
      const result = await createExtensionAuthorizationCode({ userId: admin.userId, ...request.body });
      const callback = new URL(result.redirectUri);
      callback.searchParams.set("code", result.code);
      callback.searchParams.set("state", String(request.body?.state || ""));
      return reply.send({ redirectUrl: callback.toString() });
    } catch (error) {
      return reply.status(400).send({ error: error.message });
    }
  },

  async token(request, reply) {
    try {
      const result = await exchangeExtensionAuthorizationCode(request.body || {});
      return reply.send({
        accessToken: result.accessToken,
        tokenType: "Bearer",
        expiresAt: result.expiresAt.toISOString(),
      });
    } catch (error) {
      return reply.status(400).send({ error: error.message });
    }
  },

  async me(request, reply) {
    const { Utilisateur, ExtensionName, ExpiresAt } = request.extensionToken;
    return reply.send({
      userId: Utilisateur.UtilisateurID,
      nickname: Utilisateur.Surnom,
      gradeId: Utilisateur.GradeID,
      extensionName: ExtensionName,
      expiresAt: ExpiresAt,
    });
  },

  async revoke(request, reply) {
    await revokeExtensionAccessToken(bearerToken(request));
    return reply.status(204).send();
  },
};
