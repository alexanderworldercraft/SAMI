import { authMiddleware, getJwtFromRequest } from "./authMiddleware.js";
import { ensureAdmin } from "../services/authz.js";

// Progress events concern administrative uploads; authenticate before subscribing.
export async function socketAuthMiddleware(socket, next) {
  const request = { headers: socket.handshake.headers };
  let rejected = false;
  const reply = {
    status() { return this; },
    code() { return this; },
    send() { rejected = true; },
  };
  try {
    await authMiddleware(request, reply);
    if (rejected) return next(new Error("Authentication required"));
    const admin = await ensureAdmin(request, reply);
    if (!admin || rejected) return next(new Error("Administrator required"));
    socket.data.userId = admin.userId;
    socket.data.sessionId = request.user.sessionId;
    socket.data.sessionToken = getJwtFromRequest(request);
    socket.data.expiresAt = request.user.exp * 1000;
    return next();
  } catch {
    return next(new Error("Authentication required"));
  }
}
