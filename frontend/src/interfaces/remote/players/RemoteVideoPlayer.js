import React from "react";
import VideoPlayer from "../../classic/players/VideoPlayer";

export default function RemoteVideoPlayer(props) {
  return <VideoPlayer {...props} interactionMode="remote" />;
}
