import React, { useEffect, useRef, useState } from "react";
import api from "../services/api";
import ForcedPasswordChangeModal from "./ForcedPasswordChangeModal";
import { SESSION_CHANGED_EVENT } from "../utils/sessionEvents";
import { getSafeReturnPath } from "../utils/authSession";

export default function PasswordChangeGate({ children }) {
  const [ready, setReady] = useState(false);
  const [required, setRequired] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const id = ++sequence.current;
      try {
        const response = await api.get("/users/me");
        if (mounted && id === sequence.current) setRequired(response.data.passwordChangeRequired === true);
      } catch (_) {
        if (mounted && id === sequence.current) setRequired(false);
      } finally { if (mounted && id === sequence.current) setReady(true); }
    };
    const changed = event => {
      if (event.detail?.passwordChangeRequired) { ++sequence.current; setRequired(true); setReady(true); }
      else refresh();
    };
    const storage = event => { if (event.key === SESSION_CHANGED_EVENT) refresh(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener(SESSION_CHANGED_EVENT, changed);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, changed);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  if (!ready) return <div role="status" className="p-6 text-center">Vérification de la session…</div>;
  if (required) return <ForcedPasswordChangeModal onCompleted={() => {
    if (window.location.pathname === "/login" && new URLSearchParams(window.location.search).get("client") !== "browser-extension") {
      window.location.assign(getSafeReturnPath(window.location.search));
    } else window.location.reload();
  }} />;
  return children;
}
