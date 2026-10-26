import { sessionEvents, verifyUserSession } from "./userSessionService.js";
import { ADMIN_GRADE_IDS } from "../constants.js";

export function registerSocketSessionSecurity(io) {
  const revoke = userId => {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.userId === userId) socket.disconnect(true);
    }
  };
  const revokeSession = sessionId => {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.sessionId === sessionId) socket.disconnect(true);
    }
  };
  sessionEvents.on("revoked", revoke);
  sessionEvents.on("session-revoked", revokeSession);
  io.on("connection", socket => {
    const timer = setInterval(async () => {
      if (socket.data.revalidating) return;
      socket.data.revalidating = true;
      try {
        const user = await verifyUserSession(socket.data.sessionToken);
        if (!ADMIN_GRADE_IDS.includes(user.gradeId)) socket.disconnect(true);
      } catch { socket.disconnect(true); }
      finally { socket.data.revalidating = false; }
    }, 15_000);
    timer.unref?.();
    const expires = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));
    expires.unref?.();
    socket.on("disconnect", () => { clearInterval(timer); clearTimeout(expires); });
  });
  return () => { sessionEvents.off("revoked", revoke); sessionEvents.off("session-revoked", revokeSession); };
}
