import React from "react";
import VideoSeePage from "../../classic/pages/VideoSeePage";
import TactileVideoPlayer from "../players/TactileVideoPlayer";

export default function TactilePlaybackPage() {
  return <div className="tactile-playback"><VideoSeePage PlayerComponent={TactileVideoPlayer} /></div>;
}
