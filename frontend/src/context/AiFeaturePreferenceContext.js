import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import api from "../services/api";
import AiFeatureConsentModal from "../components/AiFeatureConsentModal";
import { AI_PREFERENCE_CHANGED_EVENT } from "../constants/aiFeatures";

const AiFeaturePreferenceContext = createContext({
  preference: null,
  loading: false,
  authenticated: false,
  updatePreference: async () => null,
  refreshPreference: async () => null,
});

export function AiFeaturePreferenceProvider({ children }) {
  const location = useLocation();
  const [preference, setPreference] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");

  const refreshPreference = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/users/ai-preference");
      setAuthenticated(true);
      setPreference(response.data);
      return response.data;
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        setAuthenticated(false);
        setPreference(null);
        return null;
      }
      setError("Impossible de charger votre choix concernant l'IA.");
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location.pathname === "/login" || location.pathname === "/register") {
      setAuthenticated(false);
      setPreference(null);
      setError("");
      return;
    }
    refreshPreference().catch(() => {});
  }, [location.pathname, refreshPreference]);

  const updatePreference = useCallback(async (accepted) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.put("/users/ai-preference", { accepted });
      setAuthenticated(true);
      setPreference(response.data);
      window.dispatchEvent(new CustomEvent(AI_PREFERENCE_CHANGED_EVENT, {
        detail: response.data,
      }));
      return response.data;
    } catch (requestError) {
      setError(
        requestError.response?.data?.error
        || "Impossible d'enregistrer votre choix concernant l'IA."
      );
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({
    preference,
    loading,
    authenticated,
    error,
    updatePreference,
    refreshPreference,
  }), [preference, loading, authenticated, error, updatePreference, refreshPreference]);

  return (
    <AiFeaturePreferenceContext.Provider value={value}>
      {children}
      {authenticated && preference?.status === "UNANSWERED" && (
        <AiFeatureConsentModal
          disclosure={preference.disclosure}
          loading={loading}
          error={error}
          onDecision={updatePreference}
        />
      )}
    </AiFeaturePreferenceContext.Provider>
  );
}

export const useAiFeaturePreference = () => useContext(AiFeaturePreferenceContext);
export { AI_PREFERENCE_CHANGED_EVENT } from "../constants/aiFeatures";
