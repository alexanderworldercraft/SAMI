import { fireEvent, render, screen } from "@testing-library/react";

import VideoPlayer from "./VideoPlayer";

jest.mock("hls.js", () => ({
  __esModule: true,
  default: {
    isSupported: () => false,
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
