import { act, fireEvent, render, screen } from "@testing-library/react";

import Hls from "hls.js";
import VideoPlayer from "./VideoPlayer";

jest.mock("hls.js", () => ({
  __esModule: true,
  default: class MockHls {
    static instances = [];

    static Events = {
      AUDIO_TRACKS_UPDATED: "audio-tracks-updated",
      AUDIO_TRACK_SWITCHED: "audio-track-switched",
      MANIFEST_PARSED: "manifest-parsed",
      ERROR: "error",
    };

    static isSupported() {
      return true;
    }

    constructor() {
      this.audioTrack = -1;
      this.levels = [];
      this.listeners = new Map();
      MockHls.instances.push(this);
    }

    loadSource() {}

    attachMedia() {}

    destroy() {}

    on(event, listener) {
      this.listeners.set(event, listener);
    }

    emit(event, data) {
      this.listeners.get(event)?.(event, data);
    }
  },
}));

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.reject({ response: { status: 403 } })),
    post: jest.fn(),
  },
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}

    disconnect() {}
  };
});

beforeEach(() => {
  Hls.instances.length = 0;
});

const renderPlayer = () => render(
  <VideoPlayer
    video={{
      VideoID: 14,
      CheminAcces: "uploads/video/14/hls/master.m3u8",
      subtitles: [],
    }}
    backgroundBlur={{ current: null }}
  />
);

const prepareInteractionLayer = (container) => {
  const layer = screen.getByTestId("player-interaction-layer");
  layer.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 500,
    width: 1000,
    height: 500,
    x: 0,
    y: 0,
    toJSON: () => {},
  });

  return {
    layer,
    videoElement: container.querySelector("video"),
  };
};

it("remplace les contrôles natifs par la barre de progression personnalisée", () => {
  const { container } = render(
    <VideoPlayer
      video={{
        VideoID: 12,
        CheminAcces: "uploads/video/12/hls/master.m3u8",
        subtitles: [],
      }}
      backgroundBlur={{ current: null }}
    />
  );

  expect(container.querySelector("video")).not.toHaveAttribute("controls");
  expect(screen.getByRole("slider", { name: "Position de lecture" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lire" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Basculer en plein écran" })).toBeInTheDocument();
});

it("active la première piste par défaut et permet de sélectionner un autre sous-titre", () => {
  render(
    <VideoPlayer
      video={{
        VideoID: 13,
        CheminAcces: "uploads/video/13/hls/master.m3u8",
        subtitles: [
          { label: "Français", url: "/fr.vtt" },
          { label: "English", url: "/en.vtt" },
        ],
      }}
      backgroundBlur={{ current: null }}
    />
  );

  const captionsButton = screen.getByRole("button", {
    name: "Désactiver les sous-titres",
  });
  expect(captionsButton).toHaveAttribute("aria-pressed", "true");

  fireEvent.focus(captionsButton);
  expect(screen.getByRole("menu", { name: "Choisir les sous-titres" })).toBeInTheDocument();
  expect(screen.getByRole("menuitemradio", { name: "Français" })).toHaveAttribute(
    "aria-checked",
    "true"
  );

  fireEvent.click(screen.getByRole("menuitemradio", { name: "English" }));
  expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute(
    "aria-checked",
    "true"
  );

  fireEvent.click(captionsButton);
  expect(captionsButton).toHaveAttribute("aria-pressed", "false");
});

it("affiche et change les pistes audio uniquement pour une vidéo multi-audio expérimentale", () => {
  render(
    <VideoPlayer
      video={{
        VideoID: 15,
        CheminAcces: "uploads/video/15/hls/master.m3u8",
        subtitles: [],
        audioTracks: [
          { label: "Japonais", language: "ja", isDefault: true },
          { label: "Français", language: "fr", isDefault: false },
        ],
      }}
      backgroundBlur={{ current: null }}
      multiAudioEnabled
    />
  );

  const hls = Hls.instances.at(-1);
  act(() => {
    hls.emit(Hls.Events.AUDIO_TRACKS_UPDATED, {
      audioTracks: [
        { name: "Japonais", lang: "ja", default: true },
        { name: "Français", lang: "fr", default: false },
      ],
    });
  });

  const audioButton = screen.getByRole("button", { name: "Choisir la piste audio" });
  fireEvent.focus(audioButton);

  expect(screen.getByRole("menu", { name: "Choisir la piste audio" })).toBeInTheDocument();
  expect(screen.getByRole("menuitemradio", { name: "Japonais" })).toHaveAttribute(
    "aria-checked",
    "true"
  );

  fireEvent.click(screen.getByRole("menuitemradio", { name: "Français" }));
  expect(hls.audioTrack).toBe(1);
});

it("ne propose pas de sélecteur audio aux anciennes vidéos", () => {
  render(
    <VideoPlayer
      video={{
        VideoID: 16,
        CheminAcces: "uploads/video/16/hls/master.m3u8",
        subtitles: [],
        audioTracks: [],
      }}
      backgroundBlur={{ current: null }}
      multiAudioEnabled
    />
  );

  expect(
    screen.queryByRole("button", { name: "Choisir la piste audio" })
  ).not.toBeInTheDocument();
});

it("masque le sélecteur lorsque la fonctionnalité expérimentale est désactivée", () => {
  render(
    <VideoPlayer
      video={{
        VideoID: 17,
        CheminAcces: "uploads/video/17/hls/master.m3u8",
        subtitles: [],
        audioTracks: [
          { label: "Japonais", language: "ja", isDefault: true },
          { label: "Français", language: "fr", isDefault: false },
        ],
      }}
      backgroundBlur={{ current: null }}
    />
  );

  const hls = Hls.instances.at(-1);
  act(() => {
    hls.emit(Hls.Events.AUDIO_TRACKS_UPDATED, {
      audioTracks: [
        { name: "Japonais", lang: "ja", default: true },
        { name: "Français", lang: "fr", default: false },
      ],
    });
  });

  expect(
    screen.queryByRole("button", { name: "Choisir la piste audio" })
  ).not.toBeInTheDocument();
});

describe("zones de clic du lecteur", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("affiche puis masque les contrôles lors de clics simples successifs", () => {
    const { container } = renderPlayer();
    const { layer, videoElement } = prepareInteractionLayer(container);

    fireEvent.play(videoElement);
    expect(screen.getByTestId("player-controls")).toHaveClass("opacity-0");
    expect(screen.getByTestId("ambient-light-selector")).toHaveClass("opacity-0");

    fireEvent.click(layer, { clientX: 100, clientY: 250, detail: 1 });
    expect(screen.getByTestId("player-controls")).toHaveClass("opacity-100");
    expect(screen.getByTestId("ambient-light-selector")).toHaveClass("opacity-100");

    fireEvent.click(layer, { clientX: 100, clientY: 250, detail: 1 });
    expect(screen.getByTestId("player-controls")).toHaveClass("opacity-0");
    expect(screen.getByTestId("player-controls")).not.toHaveClass("group-hover:opacity-100");
    expect(screen.getByTestId("ambient-light-selector")).toHaveClass(
      "opacity-0",
      "pointer-events-none"
    );
  });

  it("respecte le masquage explicite lorsque la vidéo est en pause", () => {
    const { container } = renderPlayer();
    const { layer } = prepareInteractionLayer(container);

    expect(screen.getByTestId("player-controls")).toHaveClass("opacity-100");

    fireEvent.click(layer, { clientX: 100, clientY: 250, detail: 1 });
    fireEvent.click(layer, { clientX: 100, clientY: 250, detail: 1 });

    expect(screen.getByTestId("player-controls")).toHaveClass("opacity-0");
  });

  it("bascule lecture/pause après un clic simple limité à la cible centrale", () => {
    const { container } = renderPlayer();
    const { layer, videoElement } = prepareInteractionLayer(container);
    const play = jest.fn(() => Promise.resolve());

    Object.defineProperty(videoElement, "paused", {
      configurable: true,
      get: () => true,
    });
    videoElement.play = play;

    fireEvent.click(layer, { clientX: 500, clientY: 250, detail: 1 });
    expect(play).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("recule ou avance de 15 secondes au double-clic dans les zones latérales", () => {
    const { container } = renderPlayer();
    const { layer, videoElement } = prepareInteractionLayer(container);

    Object.defineProperty(videoElement, "duration", {
      configurable: true,
      value: 200,
    });
    videoElement.currentTime = 100;

    fireEvent.doubleClick(layer, { clientX: 100, clientY: 250, detail: 2 });
    expect(videoElement.currentTime).toBe(85);

    fireEvent.doubleClick(layer, { clientX: 900, clientY: 250, detail: 2 });
    expect(videoElement.currentTime).toBe(100);
  });

  it("active le plein écran au double-clic dans la moitié centrale sans lancer la lecture", () => {
    const { container } = renderPlayer();
    const { layer, videoElement } = prepareInteractionLayer(container);
    const play = jest.fn(() => Promise.resolve());
    const requestFullscreen = jest.fn(() => Promise.resolve());

    Object.defineProperty(videoElement, "paused", {
      configurable: true,
      get: () => true,
    });
    videoElement.play = play;
    layer.parentElement.requestFullscreen = requestFullscreen;

    fireEvent.click(layer, { clientX: 500, clientY: 250, detail: 1 });
    fireEvent.click(layer, { clientX: 500, clientY: 250, detail: 2 });
    fireEvent.doubleClick(layer, { clientX: 500, clientY: 250, detail: 2 });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
  });
});
