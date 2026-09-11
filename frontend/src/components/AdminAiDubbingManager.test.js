import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import api from "../services/api";
import AdminAiDubbingManager from "./AdminAiDubbingManager";

jest.mock("hls.js", () => ({ __esModule: true, default: { isSupported: () => false } }));

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  jest.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  api.get.mockImplementation((url) => {
    if (url === "/videos/admin") return Promise.resolve({ data: [{ VideoID: 11, Titre: "Film source" }] });
    if (url === "/videos/11") return Promise.resolve({ data: { video: { VideoID: 11 } } });
    if (url === "/ai-dubbing/config") {
      return Promise.resolve({ data: {
        ready: true,
        manualReferencesSupported: true,
        languages: [
          { code: "en", label: "Anglais" },
          { code: "fr", label: "Français" },
          { code: "ja", label: "Japonais" },
        ],
      } });
    }
    return Promise.resolve({ data: {
      jobs: [{
        id: "job-1",
        video: { id: 42, title: "Film test" },
        targetLanguageLabel: "Français",
        status: "PREVIEW_REVIEW",
        progress: 100,
        expectedSpeakerCount: 3,
        previewUrl: "/api/ai-dubbing/jobs/job-1/preview",
        voiceProfilesLocked: true,
        voiceProfilesAccepted: true,
        speakerCount: 3,
        voiceSamples: [
          { speaker: "SPEAKER_00", sourceStart: 75, text: "Première voix", reviewStatus: "ACCEPTED", url: "/api/ai-dubbing/jobs/job-1/voice-samples/SPEAKER_00" },
          { speaker: "SPEAKER_01", sourceStart: 84, text: "Deuxième voix", reviewStatus: "ACCEPTED", url: "/api/ai-dubbing/jobs/job-1/voice-samples/SPEAKER_01" },
          { speaker: "SPEAKER_02", sourceStart: 96, text: "Troisième voix", reviewStatus: "ACCEPTED", url: "/api/ai-dubbing/jobs/job-1/voice-samples/SPEAKER_02" },
        ],
      }],
    } });
  });
  api.post.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: { deleted: true } });
});

it("demande une confirmation explicite avant de supprimer un doublage IA", async () => {
  render(<AdminAiDubbingManager />);
  await screen.findByText(/Film test — Français/);
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le doublage IA" }));
  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/ai-dubbing/jobs/job-1"));
  expect(await screen.findByRole("status")).toHaveTextContent(/fichiers privés ont été supprimés/i);
});

it("affiche le dépassement et le chevauchement sans annoncer un décalage des départs", async () => {
  const get = api.get.getMockImplementation();
  api.get.mockImplementation(async url => {
    const response = await get(url);
    if (response.data.jobs) response.data.jobs[0].qualityReport = {
      utteranceCount: 2, retriedCount: 0,
      warnings: [{ sourceStart: 83.04, speaker: "SPEAKER_00", timingExtensionSeconds: 0.475667,
        durationRatio: 1.5, timingOverlapSeconds: 0.3 }],
    };
    return response;
  });
  render(<AdminAiDubbingManager />);
  expect(await screen.findByText(/fenêtre prolongée de 0.48 s/)).toHaveTextContent(/chevauchement possible de 0.30 s.*départs inchangés/);
});

it.each([
  ["VS_01_SYN_45", /Échantillon · SPEAKER_01 · synthèse · 45 s écoulées/],
  ["VS_01_WM_15", /Échantillon · SPEAKER_01 · filigrane IA · 15 s écoulées/],
  ["VC_02_SYN_30", /Réplique · SPEAKER_02 · synthèse · 30 s écoulées/],
  ["VOICE_TIMEOUT", /Délai vocal dépassé/],
  ["VC_01_SYN_30_63_80_3", /Réplique 63\/80 · SPEAKER_01 · synthèse · tentative 3\/3 · 30 s écoulées/],
  ["VC_01_QC_15_63_80_3", /Réplique 63\/80 · SPEAKER_01 · contrôle vocal · tentative 3\/3 · 15 s écoulées/],
  ["VC_01_FIT_0_63_80_2", /ajustement audio · tentative 2\/3/],
  ["VF_00_MIX_30", /Piste complète · mixage · 30 s écoulées/],
  ["VF_00_WM_15", /Piste complète · filigrane IA · 15 s écoulées/],
])("affiche le détail de supervision %s", async (phase, expected) => {
  const get = api.get.getMockImplementation();
  api.get.mockImplementation(async url => {
    const response = await get(url);
    if (response.data.jobs) Object.assign(response.data.jobs[0], { status: "PROCESSING_PREVIEW", phase, progress: 51 });
    return response;
  });
  render(<AdminAiDubbingManager />);
  expect(await screen.findByText(expected)).toBeInTheDocument();
});

it("signale les attributions traduites estimées sans les présenter comme certaines", async () => {
  const get = api.get.getMockImplementation();
  api.get.mockImplementation(async url => {
    const response = await get(url);
    if (response.data.jobs) response.data.jobs[0].qualityReport = {
      utteranceCount: 2, retriedCount: 0,
      warnings: [
        { sourceStart: 204, speaker: "SPEAKER_00", translationBoundaryReview: "clause_assignment_heuristic" },
        { sourceStart: 205, speaker: "SPEAKER_01", translationBoundaryReview: "unsplit_translation_dominant_speaker" },
      ],
    };
    return response;
  });
  render(<AdminAiDubbingManager />);
  expect(await screen.findByText(/traduction découpée à la ponctuation, attribution des voix à vérifier/)).toBeInTheDocument();
  expect(screen.getByText(/traduction conservée entière, attribution à la voix dominante à vérifier/)).toBeInTheDocument();
});

it("rappelle le caractère synthétique et impose la validation de l'extrait", async () => {
  render(<AdminAiDubbingManager />);
  expect(await screen.findByText(/ne sont ni authentiques ni officielles/i)).toBeInTheDocument();
  expect(screen.getByText(/Film test — Français/)).toBeInTheDocument();
  expect(screen.getByText(/contenu généré par IA/i)).toBeInTheDocument();
  expect(screen.getByText(/Contrôle de chaque profil vocal/i).closest("article"))
    .toHaveTextContent("3 profils vocaux verrouillés");
  expect(screen.getAllByLabelText(/Échantillon IA de l'intervenant/i)).toHaveLength(3);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Accepter et générer la piste complète" }));
  });
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-dubbing/jobs/job-1/approve-preview"
  ));
  expect(await screen.findByRole("status")).toHaveTextContent(/profils vocaux acceptés/i);
});

it("propose les décisions individuelles, la régénération et l'ajout automatique d'un intervenant", async () => {
  render(<AdminAiDubbingManager />);
  await screen.findByText(/Film test — Français/);

  fireEvent.click(screen.getAllByRole("button", { name: "Refuser ce profil" })[0]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-dubbing/jobs/job-1/voice-profiles/SPEAKER_00/review",
    { accepted: false }
  ));

  await waitFor(() => expect(
    screen.getAllByRole("button", { name: "Régénérer ce profil" })[1]
  ).not.toBeDisabled());
  fireEvent.click(screen.getAllByRole("button", { name: "Régénérer ce profil" })[1]);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-dubbing/jobs/job-1/voice-profiles/SPEAKER_01/regenerate"
  ));

  await waitFor(() => expect(
    screen.getByRole("button", { name: /Ajouter un intervenant/ })
  ).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un intervenant/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-dubbing/jobs/job-1/speakers"
  ));
});

it("envoie le début de l'extrait choisi en minutes et secondes", async () => {
  render(<AdminAiDubbingManager />);
  await screen.findByText(/Film test — Français/);

  fireEvent.click(screen.getByRole("button", { name: "Vidéo" }));
  fireEvent.click(await screen.findByRole("option", { name: /#11 — Film source/ }));
  fireEvent.change(screen.getByLabelText("Minutes du début de l'extrait"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Secondes du début de l'extrait"), { target: { value: "15" } });
  fireEvent.click(screen.getByRole("button", { name: "Générer l'extrait" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-dubbing/videos/11/requests",
    { language: "fr", previewStartSeconds: 75, expectedSpeakerCount: null }
  ));
  expect(await screen.findByRole("status")).toHaveTextContent("01:15–02:00");
});

it("attend les passages de toutes les voix avant de créer le job guidé", async () => {
  render(<AdminAiDubbingManager />);
  await screen.findByText(/Film test — Français/);
  fireEvent.change(screen.getByLabelText("Rechercher une vidéo par titre ou ID"), { target: { value: "11" } });
  fireEvent.click(screen.getByRole("button", { name: "Vidéo" }));
  fireEvent.click(await screen.findByRole("option", { name: /#11 — Film source/ }));
  fireEvent.change(screen.getByLabelText("Nombre d'intervenants"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Générer l'extrait" }));
  const video = await screen.findByLabelText("Vidéo source pour les références");
  Object.defineProperty(video, "duration", { configurable: true, value: 310 });
  fireEvent.loadedMetadata(video);
  expect(api.post).not.toHaveBeenCalled();
  const submit = screen.getByRole("button", { name: "Valider les passages et générer l’extrait" });
  expect(submit).toBeDisabled();
  for (const [speaker, start, end] of [[1, 1, 4], [2, 10, 13]]) {
    fireEvent.change(screen.getByLabelText(`Début intervenant ${speaker} passage 1`), { target: { value: String(start) } });
    fireEvent.change(screen.getByLabelText(`Fin intervenant ${speaker} passage 1`), { target: { value: String(end) } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Ajouter un passage pour l’intervenant 1" }));
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Début intervenant 1 passage 2"), { target: { value: "20" } });
  fireEvent.change(screen.getByLabelText("Fin intervenant 1 passage 2"), { target: { value: "24" } });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/ai-dubbing/videos/11/requests", {
    language: "fr", previewStartSeconds: 0, expectedSpeakerCount: 2,
    manualVoiceReferences: [{ ranges: [{ start: 1, end: 4 }, { start: 20, end: 24 }] }, { ranges: [{ start: 10, end: 13 }] }],
  }));
});

it("actualise automatiquement le pourcentage et la phase d'un job actif", async () => {
  jest.useFakeTimers();
  let progress = 8;
  let phase = "DIARIZING";
  api.get.mockImplementation((url) => {
    if (url === "/ai-dubbing/config") {
      return Promise.resolve({ data: { ready: true, languages: [] } });
    }
    return Promise.resolve({ data: { jobs: [{
      id: "job-progress",
      video: { id: 7, title: "Test progression" },
      targetLanguageLabel: "Français",
      status: "PROCESSING_PREVIEW",
      progress,
      phase,
    }] } });
  });

  render(<AdminAiDubbingManager />);
  expect(await screen.findByText("8%")).toBeInTheDocument();
  expect(screen.getByText("Détection et attribution des intervenants")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "8");

  progress = 48;
  phase = "SYNTHESIZING";
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });

  expect(await screen.findByText("48%")).toBeInTheDocument();
  expect(screen.getByText("Synthèse de la voix")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "48");
  jest.useRealTimers();
});

it("propose une relance manuelle complète pour un doublage en échec", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/ai-dubbing/config") {
      return Promise.resolve({ data: { ready: true, languages: [] } });
    }
    return Promise.resolve({ data: { jobs: [{
      id: "job-failed",
      video: { id: 11, title: "Test R4" },
      targetLanguageLabel: "Français",
      status: "FAILED",
      progress: 38,
      error: "Découpage vocal impossible",
    }] } });
  });

  render(<AdminAiDubbingManager />);
  const retry = await screen.findByRole("button", { name: "Relancer l'analyse" });
  fireEvent.click(retry);

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-dubbing/jobs/job-failed/retry"
  ));
  expect(await screen.findByRole("status")).toHaveTextContent(/profils vocaux devront être validés/i);
});
