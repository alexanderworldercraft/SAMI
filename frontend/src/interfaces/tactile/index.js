import { classicInterface } from "../classic";
import TactileShell from "./layout/TactileShell";
import TactilePlaybackPage from "./pages/TactilePlaybackPage";
import "./tactile.css";

export const tactileInterface = Object.freeze({
  ...classicInterface,
  id: "tactile",
  renderedMode: "tactile",
  Shell: TactileShell,
  pages: Object.freeze({ ...classicInterface.pages, playback: TactilePlaybackPage }),
});
