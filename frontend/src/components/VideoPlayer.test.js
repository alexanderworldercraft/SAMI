import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import Hls from "hls.js";
import api from "../services/api";
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
    put: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}

    disconnect() {}
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  Hls.instances.length = 0;
  localStorage.clear();
  api.get.mockImplementation((url) => {
    if (
      url === "/users/player-preferences"
      || url === "/ai-subtitles/config"
      || url.startsWith("/ai-subtitles/videos/")
    ) {
      return new Promise(() => {});
    }
    return Promise.reject({ response: { status: 403 } });
  });
  api.put.mockImplementation((_url, preferences) => Promise.resolve({
    data: { preferences },
  }));
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
  expect(screen.getByRole("menuitem", { name: /Ambiance Classique/ })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /Qualité Indisponible/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: /Sous-titres Désactivés/ }));
  expect(screen.getByRole("menuitemradio", { name: "Désactivés" })).toHaveAttribute(
    "aria-checked",
    "true"
  );

  fireEvent.click(screen.getByRole("menuitemradio", { name: "Français" }));
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

it("affiche les sous-titres personnalisés au-dessus de la barre de progression", () => {
  const { container } = render(
    <VideoPlayer
      video={{
        VideoID: 18,
        CheminAcces: "uploads/video/18/hls/master.m3u8",
        subtitles: [{ label: "Français", language: "fr", url: "/fr.vtt" }],
      }}
      backgroundBlur={{ current: null }}
    />
  );
  const videoElement = container.querySelector("video");
  const trackElement = container.querySelector("track");
  const textTrack = new EventTarget();
  textTrack.mode = "disabled";
  textTrack.activeCues = [{ startTime: 1, endTime: 3, text: "Bonjour\nà tous" }];
  Object.defineProperty(trackElement, "track", { configurable: true, value: textTrack });
  Object.defineProperty(videoElement, "textTracks", { configurable: true, value: [textTrack] });

  fireEvent.load(trackElement);
  act(() => textTrack.dispatchEvent(new Event("cuechange")));

  expect(textTrack.mode).toBe("disabled");
  expect(screen.queryByTestId("player-subtitles")).not.toBeInTheDocument();

  openSettings();
  fireEvent.click(screen.getByRole("menuitem", { name: /Sous-titres Désactivés/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Français" }));

  let subtitles = screen.getByTestId("player-subtitles");
  expect(subtitles).toHaveClass("bottom-16", "transition-[bottom]", "duration-300");
  expect(subtitles).toHaveTextContent("Bonjour à tous");
  expect(textTrack.mode).toBe("hidden");

  fireEvent.pointerDown(document.body);
  fireEvent.play(videoElement);
  fireEvent.click(screen.getByTestId("player-interaction-layer"));
  subtitles = screen.getByTestId("player-subtitles");
  expect(subtitles).toHaveClass("bottom-4");

  fireEvent.click(screen.getByTestId("player-interaction-layer"));
  expect(screen.getByTestId("player-subtitles")).toHaveClass("bottom-16");

  fireEvent(videoElement, new Event("enterpictureinpicture"));
  expect(textTrack.mode).toBe("showing");
  expect(screen.queryByTestId("player-subtitles")).not.toBeInTheDocument();

  fireEvent(videoElement, new Event("leavepictureinpicture"));
  expect(textTrack.mode).toBe("hidden");
  expect(screen.getByTestId("player-subtitles")).toBeInTheDocument();
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

it("permet de demander un sous-titre IA lorsqu'aucune piste n'existe", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/users/player-preferences") return new Promise(() => {});
    if (url === "/ai-subtitles/config") {
      return Promise.resolve({
        data: {
          active: true,
          environmentEnabled: true,
          languages: [
            { code: "fr", label: "Français" },
            { code: "en", label: "Anglais" },
          ],
        },
      });
    }
    if (url === "/ai-subtitles/videos/14") {
      return Promise.resolve({ data: { jobs: [] } });
    }
    return Promise.reject({ response: { status: 403 } });
  });
  api.post.mockResolvedValue({
    data: {
      job: { id: "ai-job-14-fr", targetLanguage: "fr", status: "QUEUED" },
    },
  });
  renderPlayer();

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/ai-subtitles/config"));
  openSettings();
  fireEvent.click(await screen.findByRole("menuitem", {
    name: /Sous-titres Génération disponible/,
  }));
  fireEvent.click(screen.getByRole("button", { name: "Générer ce sous-titre" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-subtitles/videos/14/requests",
    { language: "fr" }
  ));
  expect(await screen.findByText("La génération a été ajoutée à la file."))
    .toBeInTheDocument();
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

it("configure l'ambiance dans son sous-menu et ferme les réglages à l'extérieur", async () => {
  renderPlayer();

  openSettings();
  fireEvent.click(screen.getByRole("menuitem", { name: /Ambiance Classique/ }));
  const ambienceToggle = screen.getByRole("switch", { name: "Lumière d'ambiance" });
  expect(ambienceToggle).toHaveAttribute("aria-checked", "true");

  fireEvent.click(screen.getByRole("switch", { name: "Mode d'ambiance avancé" }));
  expect(screen.getByRole("slider", { name: "Découpage de la lumière d'ambiance" }))
    .toHaveValue("3");
  fireEvent.change(screen.getByRole("slider", { name: "Fréquence de la lumière d'ambiance" }), {
    target: { value: "3" },
  });
  expect(screen.getByText("24 fois/s")).toBeInTheDocument();

  fireEvent.click(ambienceToggle);
  expect(ambienceToggle).toHaveAttribute("aria-checked", "false");
  await waitFor(() => expect(api.put).toHaveBeenLastCalledWith(
    "/users/player-preferences",
    expect.objectContaining({
      ambientLightEnabled: false,
      ambientLightMode: "advanced",
      ambientLightRefreshRate: 24,
      ambientLightGridSize: 3,
    })
  ));

  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu", { name: "Réglages du lecteur" })).not.toBeInTheDocument();
});

it("migre une seule fois l'ancien toggle local vers le compte", async () => {
  localStorage.setItem("sami-ambient-light-enabled", "false");
  api.get.mockImplementation((url) => {
    if (url === "/users/player-preferences") {
      return Promise.resolve({
        data: {
          initialized: false,
          preferences: {
            ambientLightEnabled: true,
            ambientLightMode: "classic",
            ambientLightRefreshRate: 6,
            ambientLightGridSize: 3,
          },
        },
      });
    }
    return Promise.reject({ response: { status: 403 } });
  });

  renderPlayer();

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/users/player-preferences",
    {
      ambientLightEnabled: false,
      ambientLightMode: "classic",
      ambientLightRefreshRate: 6,
      ambientLightGridSize: 3,
    }
  ));
  expect(localStorage.getItem("sami-ambient-light-enabled")).toBeNull();

  openSettings();
  expect(screen.getByRole("menuitem", { name: "Ambiance Désactivée" })).toBeInTheDocument();
});

it("étend les secteurs du pourtour sur tout le dôme en mode avancé", async () => {
  const ambientContext = {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    fillStyle: "",
  };
  const ambientCanvas = {
    tagName: "CANVAS",
    width: 1,
    height: 1,
    style: {},
    getContext: jest.fn(() => ambientContext),
  };
  const sampleContext = {
    drawImage: jest.fn(),
    getImageData: jest.fn((_x, _y, width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let offset = 0; offset < data.length; offset += 4) {
        data[offset] = 120;
        data[offset + 1] = 40;
        data[offset + 2] = 20;
        data[offset + 3] = 255;
      }
      return { data, width, height };
    }),
  };
  const getContext = jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(sampleContext);
  const { container } = render(
    <VideoPlayer
      video={{
        VideoID: 19,
        CheminAcces: "uploads/video/19/hls/master.m3u8",
        subtitles: [],
      }}
      backgroundBlur={{ current: ambientCanvas }}
    />
  );
  const videoElement = container.querySelector("video");
  Object.defineProperties(videoElement, {
    videoWidth: { configurable: true, value: 1920 },
    videoHeight: { configurable: true, value: 1080 },
    paused: { configurable: true, value: false },
    ended: { configurable: true, value: false },
  });
  videoElement.requestVideoFrameCallback = jest.fn(() => 41);
  videoElement.cancelVideoFrameCallback = jest.fn();

  openSettings();
  fireEvent.click(screen.getByRole("menuitem", { name: /Ambiance Classique/ }));
  fireEvent.click(screen.getByRole("switch", { name: "Mode d'ambiance avancé" }));
  ambientContext.fillRect.mockClear();
  fireEvent.play(videoElement);

  await waitFor(() => expect(ambientCanvas.width).toBe(3));
  expect(ambientCanvas.height).toBe(3);
  expect(ambientContext.fillRect).toHaveBeenCalledTimes(9);
  expect(ambientContext.fillRect).toHaveBeenCalledWith(1, 1, 1, 1);
  expect(videoElement.requestVideoFrameCallback).toHaveBeenCalledTimes(1);

  fireEvent.pause(videoElement);
  getContext.mockRestore();
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
