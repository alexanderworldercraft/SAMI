import { classicInterface } from "../classic";
import RemoteShell from "./layout/RemoteShell";
import RemotePlaybackPage from "./pages/RemotePlaybackPage";
import "./remote.css";

export const remoteInterface = Object.freeze({
  ...classicInterface,
  id: "remote",
  renderedMode: "remote",
  Shell: RemoteShell,
  pages: Object.freeze({ ...classicInterface.pages, playback: RemotePlaybackPage }),
});
