import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import api from "../services/api";
import SuperAdminAiSubtitleEditor from "./SuperAdminAiSubtitleEditor";

jest.mock("hls.js", () => {
  class MockHls {
    static isSupported() { return false; }
    destroy() {}
  }
  return { __esModule: true, default: MockHls };
});

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

const item = {
  id: 21,
  label: "Français (IA)",
  language: "fr",
  video: {
    id: 51,
    title: "Film à synchroniser",
    path: "uploads/video/51/hls/master.m3u8",
    seriesTitle: null,
    seasonNumber: null,
  },
};
const secondItem = {
  ...item,
  id: 22,
  label: "Anglais (IA)",
  language: "en",
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
  api.get.mockImplementation((url) => {
    if (url === "/users/me") return Promise.resolve({ data: { GradeID: 1 } });
    if (url === "/ai-subtitles/admin/generated") {
      return Promise.resolve({
        data: {
          items: [{ video: item.video, subtitles: [item, secondItem].map(({ video, ...subtitle }) => subtitle) }],
          pagination: { page: 1, pageSize: 40, total: 1, totalPages: 1 },
        },
      });
    }
    if (url === "/ai-subtitles/admin/subtitles/21") {
      return Promise.resolve({
        data: {
          ...item,
          segments: [
            { start: 0, end: 1.5, text: "Premier" },
            { start: 2, end: 4, text: "Second" },
          ],
        },
      });
    }
    return Promise.reject(new Error(`GET inattendu : ${url}`));
  });
  api.put.mockImplementation((_url, body) => Promise.resolve({ data: { ...item, segments: body.segments } }));
});

it("réserve l'éditeur temporel au superadmin et expose les trois zones de déplacement", async () => {
  render(<SuperAdminAiSubtitleEditor />);

  expect(await screen.findByText("Recherchez une vidéo pour afficher ses sous-titres IA.")).toBeInTheDocument();
  expect(screen.queryByText("Film à synchroniser")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher une piste à corriger" }), {
    target: { value: "synchroniser" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));

  expect(await screen.findByText("Film à synchroniser")).toBeInTheDocument();
  const subtitleSelect = screen.getByRole("combobox", { name: "Sous-titre IA à corriger de Film à synchroniser" });
  expect(subtitleSelect).toHaveTextContent("Français (IA)");
  expect(subtitleSelect).toHaveTextContent("Anglais (IA)");
  fireEvent.click(screen.getByRole("button", { name: "Corriger en direct" }));

  expect(await screen.findByRole("slider", { name: "Zoom de la timeline" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Éditeur temporel de Film à synchroniser" })).toHaveClass("relative");
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(screen.getByRole("button", { name: "Déplacer le début du segment 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Déplacer le segment 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Déplacer la fin du segment 1" })).toBeInTheDocument();

  const workspace = screen.getByRole("region", { name: "Éditeur temporel de Film à synchroniser" });
  Object.defineProperty(workspace, "requestFullscreen", {
    configurable: true,
    value: jest.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: workspace,
      });
    }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Basculer le plein écran" }));

  expect(await screen.findByRole("dialog", { name: "Éditeur temporel de Film à synchroniser" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Texte du segment sélectionné 1" })).toHaveValue("Premier");

  fireEvent.click(screen.getByRole("button", { name: "Segment 2" }));
  expect(screen.getByRole("textbox", { name: "Texte du segment sélectionné 2" })).toHaveValue("Second");

  const video = document.querySelector("video");
  Object.defineProperty(video, "currentTime", { configurable: true, value: 0.5 });
  fireEvent.timeUpdate(video);
  expect(screen.getByRole("textbox", { name: "Texte du segment sélectionné 2" })).toHaveValue("Second");

  fireEvent.click(screen.getByRole("button", { name: "Suivre la lecture" }));
  expect(screen.getByRole("textbox", { name: "Texte du segment sélectionné 1" })).toHaveValue("Premier");

  fireEvent.change(screen.getByRole("textbox", { name: "Texte temporel du segment 1" }), {
    target: { value: "Premier corrigé" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/ai-subtitles/admin/subtitles/21/segments",
    { segments: expect.arrayContaining([expect.objectContaining({ text: "Premier corrigé" })]) }
  ));
});
