export const SESSION_CHANGED_EVENT = "sami-session-changed";
export function notifySessionChanged(passwordChangeRequired = false) {
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: { passwordChangeRequired } }));
  try { localStorage.setItem(SESSION_CHANGED_EVENT, `${Date.now()}-${Math.random()}`); } catch (_) { /* Storage may be disabled. */ }
}
