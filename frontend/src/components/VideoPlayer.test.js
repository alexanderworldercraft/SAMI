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
  localStorage.clear();
});

const openSettings = () => {
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir les réglages du lecteur" }));
  return screen.getByRole("menu", { name: "Réglages du lecteur" });
};

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
  expect(screen.getByRole("button", { name: "Ouvrir les réglages du lecteur" })).toBeInTheDocument();
  expect(container.querySelector(".resolution-selector")).not.toBeInTheDocument();
  expect(container.querySelector(".ambient-light-selector")).not.toBeInTheDocument();
});

it("regroupe les sous-titres dans les réglages avec les drapeaux et l'option de désactivation", () => {
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

  openSettings();
  expect(screen.getByRole("menuitem", { name: /Audio Par défaut/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitemcheckbox", { name: /Ambiance Activée/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Qualité Indisponible/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: /Sous-titres Français/ }));
  expect(screen.getByRole("menuitemradio", { name: "Français" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  expect(screen.getByTitle("Langue : français")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("menuitemradio", { name: "English" }));
  expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  expect(screen.getByTitle("Langue : anglais")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("menuitemradio", { name: "Désactivés" }));
  expect(screen.getByRole("menuitemradio", { name: "Désactivés" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
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

  openSettings();
  fireEvent.click(screen.getByRole("menuitem", { name: /Audio Japonais/ }));
  expect(screen.getByRole("menuitemradio", { name: "Japonais" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  expect(screen.getByTitle("Langue : japonais")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("menuitemradio", { name: "Français" }));
  expect(hls.audioTrack).toBe(1);
  expect(screen.getByRole("menuitemradio", { name: "Français" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
});

it("conserve l'entrée audio désactivée pour les anciennes vidéos", () => {
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

  openSettings();
  expect(screen.getByRole("menuitem", { name: "Audio Par défaut" })).toBeDisabled();
});

it("conserve l'entrée audio désactivée lorsque la fonctionnalité expérimentale est inactive", () => {
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

  openSettings();
  expect(screen.getByRole("menuitem", { name: "Audio Par défaut" })).toBeDisabled();
});

it("change la qualité depuis un sous-menu et conserve le mode automatique", () => {
  renderPlayer();
  const hls = Hls.instances.at(-1);
  hls.levels = [{ height: 360 }, { height: 1080 }];

  act(() => {
    hls.emit(Hls.Events.MANIFEST_PARSED, {});
  });

  openSettings();
  fireEvent.click(screen.getByRole("menuitem", { name: "Qualité Automatique" }));
  expect(screen.getByRole("menuitemradio", { name: "Automatique" })).toHaveAttribute(
    "aria-checked",
    "true"
  );

  fireEvent.click(screen.getByRole("menuitemradio", { name: "1080p" }));
  expect(hls.currentLevel).toBe(1);
  expect(screen.getByRole("menuitemradio", { name: "1080p" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
});

it("active l'ambiance directement dans le menu et ferme les réglages à l'extérieur", () => {
  renderPlayer();

  openSettings();
  const ambienceTile = screen.getByRole("menuitemcheckbox", { name: "Ambiance Activée" });
  expect(ambienceTile).toHaveAttribute("aria-checked", "true");

  fireEvent.click(ambienceTile);
  expect(screen.getByRole("menuitemcheckbox", { name: "Ambiance Désactivée" })).toHaveAttribute(
    "aria-checked",
    "false"
  );

  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu", { name: "Réglages du lecteur" })).not.toBeInTheDocument();
});

describe("raccourcis clavier du lecteur", () => {
  it("recule et avance de 15 secondes avec les flèches horizontales", () => {
    const { container } = renderPlayer();
    const videoElement = container.querySelector("video");

    Object.defineProperty(videoElement, "duration", {
      configurable: true,
      value: 200,
    });
    videoElement.currentTime = 100;

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(videoElement.currentTime).toBe(85);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(videoElement.currentTime).toBe(100);
  });

  it("augmente et réduit le volume avec les flèches verticales", () => {
    const { container } = renderPlayer();
    const videoElement = container.querySelector("video");
    act(() => {
      videoElement.volume = 0.5;
    });

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(videoElement.volume).toBeCloseTo(0.55);

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(videoElement.volume).toBeCloseTo(0.5);
  });

  it("bascule lecture et pause avec la barre espace sans répéter l'action", () => {
    const { container } = renderPlayer();
    const videoElement = container.querySelector("video");
    let paused = true;

    Object.defineProperty(videoElement, "paused", {
      configurable: true,
      get: () => paused,
    });
    videoElement.play = jest.fn(() => {
      paused = false;
      return Promise.resolve();
    });
    videoElement.pause = jest.fn(() => {
      paused = true;
    });

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(videoElement.play).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: " ", code: "Space", repeat: true });
    expect(videoElement.pause).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(videoElement.pause).toHaveBeenCalledTimes(1);
  });

  it("laisse les champs et boutons gérer leurs propres touches", () => {
    const { container } = renderPlayer();
    const videoElement = container.querySelector("video");
    const input = document.createElement("input");
    const play = jest.fn(() => Promise.resolve());

    Object.defineProperty(videoElement, "paused", {
      configurable: true,
      get: () => true,
    });
    videoElement.play = play;
    container.appendChild(input);

    fireEvent.keyDown(input, { key: " ", code: "Space" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Lire" }), {
      key: " ",
      code: "Space",
    });

    expect(play).not.toHaveBeenCalled();
  });
});

it("affiche au clic la liste complète des commandes du lecteur", () => {
  renderPlayer();

  const helpButton = screen.getByRole("button", {
    name: "Afficher les commandes du lecteur",
  });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

  fireEvent.click(helpButton);

  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  expect(screen.getByText("Clavier")).toBeInTheDocument();
  expect(screen.getByText("Clics sur la vidéo")).toBeInTheDocument();
  expect(screen.getAllByText("Reculer de 15 secondes")).toHaveLength(2);
  expect(screen.getAllByText("Avancer de 15 secondes")).toHaveLength(2);
  expect(screen.getByText("Augmenter le volume")).toBeInTheDocument();
  expect(screen.getByText("Réduire le volume")).toBeInTheDocument();
  expect(screen.getAllByText("Lecture / pause")).toHaveLength(2);
  expect(screen.getByText("Afficher / masquer les contrôles")).toBeInTheDocument();
  expect(screen.getByText("Basculer en plein écran")).toBeInTheDocument();
  expect(screen.getByText("2× gauche")).toBeInTheDocument();
  expect(screen.getByText("2× centre")).toBeInTheDocument();
  expect(screen.getByText("2× droite")).toBeInTheDocument();

  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
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

    fireEvent.click(layer, { clientX: 100, clientY: 250, detail: 1 });
    expect(screen.getByTestId("player-controls")).toHaveClass("opacity-100");

    fireEvent.click(layer, { clientX: 100, clientY: 250, detail: 1 });
    expect(screen.getByTestId("player-controls")).toHaveClass("opacity-0");
    expect(screen.getByTestId("player-controls")).not.toHaveClass("group-hover:opacity-100");
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
