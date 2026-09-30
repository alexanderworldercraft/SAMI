import React from "react";
import VideoPlayer from "../../classic/players/VideoPlayer";

// Le moteur média est commun ; ce mode explicite adapte les contrôles au toucher.
export default function TactileVideoPlayer(props) {
  return <VideoPlayer {...props} interactionMode="tactile" />;
}
