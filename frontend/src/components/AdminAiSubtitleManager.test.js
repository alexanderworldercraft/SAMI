import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import api from "../services/api";
import AdminAiSubtitleManager from "./AdminAiSubtitleManager";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({
    data: {
      items: [{
        videoId: 42,
        title: "Film sans français",
        seriesTitle: null,
        seasonNumber: null,
        job: null,
      }],
      pagination: { page: 1, pageSize: 40, total: 41, totalPages: 2 },
    },
  });
  api.post.mockResolvedValue({ data: { job: { id: "job-42", status: "QUEUED" } } });
});

it("liste 40 vidéos par page et planifie le français", async () => {
  render(<AdminAiSubtitleManager />);

  expect(await screen.findByText("Film sans français")).toBeInTheDocument();
  expect(screen.getByText((_, element) => (
    element?.tagName === "P"
    && element.textContent.includes("sur 41 résultats")
  ))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Générer en français" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-subtitles/videos/42/requests",
    { language: "fr" }
  ));
  expect(await screen.findByText(/ajoutée à la file/)).toBeInTheDocument();
});

it("identifie le clone qui génère le sous-titre", async () => {
  api.get.mockImplementation(async (url) => ({ data: url.endsWith("/workers") ? { workers: [] } : {
    items: [{ videoId: 42, title: "En cours", job: { id: "job-42", status: "LEASED", progress: 35,
      assignedWorkerId: "clone-aero", assignedWorker: { role: "CLONE", displayName: "Aero 15" } } }],
    pagination: { page: 1, total: 1, totalPages: 1 },
  } }));
  render(<AdminAiSubtitleManager />);
  expect(await screen.findByText(/Traitement par le clone : Aero 15/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Autoriser le primary" })).not.toBeInTheDocument();
});

it("affiche le contrôle qualité au lieu du libellé générique de génération", async () => {
  api.get.mockImplementation(async (url) => ({ data: url.endsWith("/workers") ? { workers: [] } : {
    items: [{ videoId: 42, title: "Film en traduction", job: { id: "job-42", status: "LEASED", phase: "checking", progress: 88,
      assignedWorkerId: "aero", assignedWorker: { role: "CLONE", displayName: "Aero 15 XC" } } }],
    pagination: { page: 1, total: 1, totalPages: 1 },
  } }));
  render(<AdminAiSubtitleManager />);
  expect(await screen.findByRole("button", { name: "Contrôle qualité 88 %" })).toBeDisabled();
  expect(screen.getByText(/Traitement par le clone : Aero 15 XC/)).toBeInTheDocument();
});

it("autorise le primary pour un sous-titre en attente sans clone connecté", async () => {
  api.get.mockImplementation(async (url) => ({ data: url.endsWith("/workers") ? { workers: [] } : {
    items: [{ videoId: 42, title: "En attente", job: { id: "job-42", status: "QUEUED" } }],
    pagination: { page: 1, total: 1, totalPages: 1 },
  } }));
  render(<AdminAiSubtitleManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Autoriser le primary" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/ai-subtitles/admin/jobs/job-42/authorize-primary"));
  expect(await screen.findByText(/Le primary est autorisé pour le sous-titre/)).toBeInTheDocument();
});

it("cache l’autorisation du primary lorsqu’un clone compatible connecté est occupé", async () => {
  api.get.mockImplementation(async (url) => ({ data: url.endsWith("/workers") ? { workers: [{ role: "CLONE", eligible: true, available: false }] } : {
    items: [{ videoId: 42, title: "En attente", job: { id: "job-42", status: "QUEUED" } }],
    pagination: { page: 1, total: 1, totalPages: 1 },
  } }));
  render(<AdminAiSubtitleManager />);
  expect(await screen.findByText(/Clones IA occupés/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Autoriser le primary" })).not.toBeInTheDocument();
});
