import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { NavProvider } from "./context/NavContext";
import { MusicPlayerProvider } from "./context/MusicPlayerContext";
import { AiFeaturePreferenceProvider } from "./context/AiFeaturePreferenceContext";
import { InterfacePreferenceProvider } from "./context/InterfacePreferenceContext";
import useTheme from "./hooks/useTheme";
import InterfaceRenderer from "./interfaces/InterfaceRenderer";

export default function App() {
  useTheme();
  return (
    <NavProvider>
      <MusicPlayerProvider>
        <Router>
          <AiFeaturePreferenceProvider>
            <InterfacePreferenceProvider>
              <InterfaceRenderer />
            </InterfacePreferenceProvider>
          </AiFeaturePreferenceProvider>
        </Router>
      </MusicPlayerProvider>
    </NavProvider>
  );
}
