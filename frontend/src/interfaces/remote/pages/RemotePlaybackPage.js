import React from "react";
import VideoSeePage from "../../classic/pages/VideoSeePage";
import RemoteVideoPlayer from "../players/RemoteVideoPlayer";

export default function RemotePlaybackPage() {
  return <div className="remote-playback"><VideoSeePage PlayerComponent={RemoteVideoPlayer} /></div>;
}
