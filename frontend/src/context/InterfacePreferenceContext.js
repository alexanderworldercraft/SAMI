import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../services/api";
import { useAiFeaturePreference } from "./AiFeaturePreferenceContext";
import InterfaceDeviceDialog from "../components/InterfaceDeviceDialog";
import { detectInterfaceDevice, forgetDeviceKey, newDeviceKey, readDeviceKey, saveDeviceKey } from "../utils/interfaceDevice";

const InterfacePreferenceContext = createContext(null);
export const useInterfacePreference = () => useContext(InterfacePreferenceContext);

export function InterfacePreferenceProvider({ children }) {
  const location = useLocation();
  const ai = useAiFeaturePreference();
  const [state, setState] = useState(null);
  const [currentDevice, setCurrentDevice] = useState(null);
  const [detected, setDetected] = useState(() => detectInterfaceDevice());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const version = useRef(0);
  const candidateKey = useRef(null);
  const accountId = useRef(null);

  const clear = useCallback(() => {
    version.current += 1;
    setState(null); setCurrentDevice(null); setDismissed(false); setError(""); setNotice(""); setLoading(false);
    candidateKey.current = null; accountId.current = null;
  }, []);

  const refresh = useCallback(async () => {
    const revision = ++version.current;
    setLoading(true); setError("");
    try {
      const response = await api.get("/users/interface-preference");
      if (revision !== version.current) return;
      const next = { ...response.data };
      let device = null;
      const key = next.accepted === true && readDeviceKey(next.UtilisateurID);
      if (key) {
        const resolved = await api.post("/users/interface-devices/resolve", { deviceKey: key });
        device = resolved.data.device;
      }
      if (revision !== version.current) return;
      if (accountId.current !== next.UtilisateurID) {
        setDismissed(false); candidateKey.current = null;
      }
      accountId.current = next.UtilisateurID;
      if (device) next.devices = next.devices.map((entry) => entry.UserDeviceID === device.UserDeviceID ? device : entry);
      setState(next); setCurrentDevice(device);
      if (next.accepted === false) forgetDeviceKey(next.UtilisateurID);
    } catch (requestError) {
      if (revision !== version.current) return;
      // Un état serveur inconnu ne doit jamais autoriser un enregistrement.
      setState(null); setCurrentDevice(null);
      if (requestError.response?.status === 401) {
        accountId.current = null; candidateKey.current = null; setDismissed(false);
      }
      if (requestError.response?.status !== 401) setError("Impossible de charger les préférences d'interface.");
    } finally {
      if (revision === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location.pathname === "/login" || location.pathname === "/register") { clear(); return; }
    refresh();
    return () => { version.current += 1; };
  }, [location.pathname, clear, refresh]);

  useEffect(() => {
    const detect = () => setDetected(detectInterfaceDevice());
    const media = ["(pointer: coarse)", "(hover: hover)"].map((query) => window.matchMedia?.(query)).filter(Boolean);
    media.forEach((entry) => entry.addEventListener?.("change", detect));
    return () => media.forEach((entry) => entry.removeEventListener?.("change", detect));
  }, []);

  useEffect(() => {
    const sync = (event) => {
      if (!loading && state && event.key === `sami.interface-device.${state.UtilisateurID}`) refresh();
    };
    const focus = () => { if (state && !loading) refresh(); };
    window.addEventListener("storage", sync);
    window.addEventListener("focus", focus);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", focus); };
  }, [state, loading, refresh]);

  const mutate = async (operation) => {
    const revision = ++version.current;
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await operation(() => revision === version.current);
      if (revision !== version.current) return null;
      return result;
    } catch (requestError) {
      if (revision === version.current) {
        setError(requestError.response?.data?.error || "Impossible d'enregistrer ce changement.");
        if ([401, 403].includes(requestError.response?.status)) { setState(null); setCurrentDevice(null); }
      }
      throw requestError;
    } finally { if (revision === version.current) setLoading(false); }
  };

  const updateConsent = (accepted) => mutate(async (isCurrent) => {
    await api.put("/users/interface-preference", { accepted });
    if (!isCurrent()) return;
    if (!accepted) {
      forgetDeviceKey(state.UtilisateurID); candidateKey.current = null;
      setCurrentDevice(null);
    }
    setState((previous) => ({ ...previous, accepted, devices: accepted ? previous.devices : [] }));
    setDismissed(false);
  });
  const register = (draft) => mutate(async (isCurrent) => {
    const key = candidateKey.current || readDeviceKey(state.UtilisateurID) || newDeviceKey();
    candidateKey.current = key;
    const response = await api.post("/users/interface-devices", { ...draft, deviceKey: key });
    if (!isCurrent()) return;
    if (!saveDeviceKey(state.UtilisateurID, key)) setNotice("Appareil enregistré, mais le navigateur empêche sa mémorisation locale. Il pourra être redemandé à votre prochaine visite.");
    setCurrentDevice(response.data.device);
    setState((previous) => ({ ...previous, devices: [response.data.device, ...previous.devices.filter((device) => device.UserDeviceID !== response.data.device.UserDeviceID)] }));
    setDismissed(false);
  });
  const updateDevice = (id, draft) => mutate(async (isCurrent) => {
    const response = await api.put(`/users/interface-devices/${id}`, draft);
    if (!isCurrent()) return;
    setState((previous) => ({ ...previous, devices: previous.devices.map((device) => device.UserDeviceID === id ? response.data.device : device) }));
    if (currentDevice?.UserDeviceID === id) setCurrentDevice(response.data.device);
  });
  const removeDevice = (id) => mutate(async (isCurrent) => {
    await api.delete(`/users/interface-devices/${id}`);
    if (!isCurrent()) return;
    setState((previous) => ({ ...previous, devices: previous.devices.filter((device) => device.UserDeviceID !== id) }));
    if (currentDevice?.UserDeviceID === id) {
      forgetDeviceKey(state.UtilisateurID); candidateKey.current = null;
      setCurrentDevice(null); setDismissed(true);
    }
  });
  const mode = currentDevice?.InterfaceMode || detected.InterfaceMode;
  useEffect(() => {
    document.documentElement.dataset.interfaceMode = mode;
    return () => { delete document.documentElement.dataset.interfaceMode; };
  }, [mode]);
  const value = { state, currentDevice, detected, mode, loading, error, notice, updateConsent, register, updateDevice, removeDevice, refresh };
  const showDialog = state && !dismissed && (state.accepted === null || (state.accepted && !currentDevice));
  // Laisser la modale IA obligatoire terminer avant la modale facultative appareils.
  const aiDialogOpen = ai.authenticated && ai.preference?.status === "UNANSWERED";
  return <InterfacePreferenceContext.Provider value={value}>
    {children}
    {showDialog && !aiDialogOpen && <InterfaceDeviceDialog key={state.accepted === null ? "consent" : "device"} consent={state.accepted === null} detected={detected} loading={loading} error={error} onConsent={updateConsent} onRegister={register} onDismiss={() => setDismissed(true)} />}
  </InterfacePreferenceContext.Provider>;
}
