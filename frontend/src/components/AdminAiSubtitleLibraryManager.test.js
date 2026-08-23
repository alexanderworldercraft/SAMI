import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import api from "../services/api";
import AdminAiSubtitleLibraryManager from "./AdminAiSubtitleLibraryManager";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const item = {
  id: 17,
  label: "Français (IA)",
  language: "fr",
  job: { id: "job-17", status: "COMPLETED", progress: 100 },
  video: { id: 42, title: "Film avec un titre particulièrement long à corriger", seriesTitle: null, seasonNumber: null },
};
const secondItem = {
  ...item,
  id: 18,
  label: "Anglais (IA)",
  language: "en",
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url === "/ai-subtitles/admin/generated") {
      return Promise.resolve({
        data: {
          items: [{ video: item.video, subtitles: [item, secondItem].map(({ video, ...subtitle }) => subtitle) }],
          pagination: { page: 1, pageSize: 40, total: 1, totalPages: 1 },
        },
      });
    }
    if (url === "/ai-subtitles/admin/subtitles/17") {
      return Promise.resolve({
        data: {
          ...item,
          segments: [{ start: 1, end: 2.5, text: "Texte original" }],
        },
      });
    }
    return Promise.reject(new Error(`GET inattendu : ${url}`));
  });
  api.put.mockImplementation((_url, body) => Promise.resolve({
    data: { ...item, segments: [{ start: 1, end: 2.5, text: body.texts[0] }] },
  }));
});

it("modifie le texte d'une piste sans envoyer de nouveaux horodatages", async () => {
  render(<AdminAiSubtitleLibraryManager />);

  expect(screen.getByText("Recherchez une vidéo pour afficher ses sous-titres IA.")).toBeInTheDocument();
  expect(screen.queryByText(item.video.title)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un sous-titre IA" }), {
    target: { value: "Film avec" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));

  expect(await screen.findByText(item.video.title)).toBeInTheDocument();
  const subtitleSelect = screen.getByRole("combobox", { name: `Sous-titre IA de ${item.video.title}` });
  expect(subtitleSelect).toHaveTextContent("Français (IA)");
  expect(subtitleSelect).toHaveTextContent("Anglais (IA)");
  expect(api.get).toHaveBeenCalledWith("/ai-subtitles/admin/generated", {
    params: { page: 1, search: "Film avec" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Modifier/i }));

  const text = await screen.findByRole("textbox", { name: "Texte du segment 1" });
  fireEvent.change(text, { target: { value: "Texte corrigé" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le texte" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/ai-subtitles/admin/subtitles/17/text",
    { texts: ["Texte corrigé"] }
  ));
});
