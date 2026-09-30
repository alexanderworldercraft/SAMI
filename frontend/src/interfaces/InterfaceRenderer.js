import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useInterfacePreference } from "../context/InterfacePreferenceContext";
import MaintenanceBanner from "../components/MaintenanceBanner";
import { resolveInterface } from "./registry";
import AppRoutes from "./shared/AppRoutes";
import RemoteControls from "./remote/components/RemoteControls";
import MetaUpdater from "./shared/MetaUpdater";

export default function InterfaceRenderer() {
  const { mode } = useInterfacePreference();
  const { pathname } = useLocation();
  const definition = resolveInterface(mode, pathname);
  const PersistentMusicPlayer = definition.PersistentMusicPlayer;

  useEffect(() => {
    // Le mode demandé reste dans data-interface-mode et dans les préférences.
    // Ce second attribut indique l'interface réellement disponible et affichée.
    document.documentElement.dataset.interfaceRendered = definition.renderedMode;
    return () => { delete document.documentElement.dataset.interfaceRendered; };
  }, [definition.renderedMode]);

  return (
    <>
      {definition.renderedMode === "remote" && <RemoteControls />}
      <MetaUpdater />
      <MaintenanceBanner />
      <PersistentMusicPlayer />
      <AppRoutes interfaceDefinition={definition} />
    </>
  );
}
