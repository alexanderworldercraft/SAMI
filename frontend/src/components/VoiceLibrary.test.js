import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import VoiceLibraryPage, { PersonVoiceSection, VoiceCollection } from "./VoiceLibrary";
import { useAiFeaturePreference } from "../context/AiFeaturePreferenceContext";
import api from "../services/api";
import { VOICE_PRESENTATION_TEXT } from "../constants/voicePresentation";

jest.mock("react-router-dom", () => ({ Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>, useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock("../context/AiFeaturePreferenceContext", () => ({ useAiFeaturePreference: jest.fn() }));
jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn(), defaults: { baseURL: "/api" } } }));
jest.mock("./DubbingVideoSelect", () => () => <div>Vidéo SAMI</div>);
const item = { id: "voice-1", personId: 7, person: { Prenom: "Voix", Nom: "Exemple" }, title: "Bonjour", text: "Bonjour à tous", language: "fr", kind: "AI", status: "READY", public: true, originalId: null };
beforeEach(() => {
  jest.clearAllMocks();
  useAiFeaturePreference.mockReturnValue({ authenticated: true, preference: { accepted: true }, loading: false });
  api.get.mockResolvedValue({ data: { items: [item], admin: false, pages: 1 } });
});
test("le refus masque toute la section personne et ne charge aucun audio", () => {
  useAiFeaturePreference.mockReturnValue({ authenticated: true, preference: { accepted: false } });
  const { container } = render(<PersonVoiceSection personId="7" />);
  expect(container).toBeEmptyDOMElement();
  expect(api.get).not.toHaveBeenCalled();
});
test("l'accès direct nécessite le consentement IA", () => {
  useAiFeaturePreference.mockReturnValue({ authenticated: true, preference: { accepted: null } });
  render(<VoiceLibraryPage />);
  expect(screen.getByText(/acceptation des conditions IA/)).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});
test("un utilisateur écoute les répliques publiées sans commande de téléchargement ou génération", async () => {
  render(<VoiceLibraryPage />);
  const audio = await screen.findByLabelText("IA : Bonjour");
  expect(audio).toHaveAttribute("controlsList", "nodownload");
  expect(audio).toHaveAttribute("src", "/api/voices/voice-1/audio");
  expect(screen.queryByText(/Télécharger/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Générer/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Écouter l’original/)).not.toBeInTheDocument();
});
test("retirer le consentement démonte les lecteurs de la fiche personne", async () => {
  const { rerender } = render(<PersonVoiceSection personId="7" />);
  await screen.findByLabelText("IA : Bonjour");
  useAiFeaturePreference.mockReturnValue({ authenticated: true, preference: { accepted: false } });
  rerender(<PersonVoiceSection personId="7" />);
  expect(screen.queryByLabelText("IA : Bonjour")).not.toBeInTheDocument();
});
test("un administrateur peut publier un original privé et préparer une réplique", async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url === "/voices/config" ? { workerReady: true } : { items: [{ ...item, kind: "ORIGINAL", public: false }], admin: true, pages: 1 } }));
  api.patch.mockResolvedValue({});
  render(<VoiceCollection />);
  const publish = await screen.findByRole("button", { name: "Publier" });
  await act(async () => fireEvent.click(publish));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/voices/voice-1/visibility", { public: true }));
  expect(screen.getByRole("link", { name: /Télécharger/ })).toHaveAttribute("href", "/api/voices/voice-1/download");
  expect(screen.getByRole("button", { name: "Utiliser comme référence" })).toBeInTheDocument();
});
test("une référence existante préremplit la présentation et conserve les textes personnalisés", async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url === "/voices/config" ? { workerReady: true } : { items: [{ ...item, kind: "ORIGINAL", public: false }], admin: true, pages: 1 } }));
  render(<PersonVoiceSection personId="7" />);
  fireEvent.click(await screen.findByRole("button", { name: "Utiliser comme référence" }));
  const text = screen.getByLabelText(/Texte à prononcer/);
  expect(text).toHaveValue(VOICE_PRESENTATION_TEXT.fr);
  fireEvent.change(screen.getByLabelText("Langue"), { target: { value: "en" } });
  expect(text).toHaveValue(VOICE_PRESENTATION_TEXT.en);
  fireEvent.change(text, { target: { value: "Mon texte personnalisé." } });
  fireEvent.change(screen.getByLabelText("Langue"), { target: { value: "ja" } });
  expect(text).toHaveValue("Mon texte personnalisé.");
  fireEvent.click(screen.getByRole("button", { name: "Rétablir le texte de présentation" }));
  expect(text).toHaveValue(VOICE_PRESENTATION_TEXT.ja);
  expect(api.post).not.toHaveBeenCalled();
  for (const presentation of Object.values(VOICE_PRESENTATION_TEXT)) expect(presentation.length).toBeLessThanOrEqual(500);
});
test("ajoute un original depuis la fiche personne sans générer de réplique", async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url === "/voices/config" ? { workerReady: true } : url === "/people" ? [{ PersonneID: 7, Prenom: "Voix", Nom: "Exemple" }] : { items: [], admin: true, pages: 1 } }));
  api.post.mockResolvedValue({ data: {} });
  render(<PersonVoiceSection personId="7" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ajouter une voix originale" }));
  await screen.findByRole("option", { name: "Voix Exemple" });
  expect(screen.getByLabelText("Personne")).toHaveValue("7");
  fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Original conservé" } });
  fireEvent.change(screen.getByLabelText(/Transcription exacte/), { target: { value: "Bonjour" } });
  fireEvent.change(screen.getByLabelText(/Justificatif/), { target: { value: "Autorisation enregistrée" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText(/Fichier audio/), { target: { files: [new File(["audio"], "original.wav", { type: "audio/wav" })] } });
  await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Conserver l’original" }).closest("form")));
  expect(api.post).toHaveBeenCalledTimes(1);
  const [url, body] = api.post.mock.calls[0];
  expect(url).toBe("/voices/originals");
  expect(body.get("personId")).toBe("7");
  expect(screen.queryByLabelText(/Texte à prononcer/)).not.toBeInTheDocument();
});

const adminVoices = (voice = item) => api.get.mockImplementation(url => Promise.resolve({ data: url === "/voices/config" ? { workerReady: true } : { items: [voice], admin: true, pages: 1 } }));
test("modifier le texte IA exige une confirmation explicite de régénération", async () => {
  adminVoices(); api.patch.mockResolvedValue({ data: {} });
  render(<VoiceCollection />);
  fireEvent.click(await screen.findByRole("button", { name: "Modifier" }));
  fireEvent.change(screen.getByLabelText("Texte à prononcer"), { target: { value: "Bonsoir" } });
  const checkbox = screen.getByRole("checkbox");
  expect(checkbox).toBeRequired();
  fireEvent.click(checkbox);
  await act(async () => fireEvent.submit(screen.getByRole("form", { name: "Modifier une voix" })));
  expect(api.patch).toHaveBeenCalledWith("/voices/voice-1", { title: "Bonjour", text: "Bonsoir", language: "fr", regenerate: true });
});
test("supprimer demande confirmation et annuler ne fait aucun appel", async () => {
  adminVoices(); api.delete.mockResolvedValue({ data: { deleted: true } });
  render(<VoiceCollection />);
  fireEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" })));
  expect(api.delete).toHaveBeenCalledWith("/voices/voice-1");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
test("affiche le refus de suppression d’un original utilisé", async () => {
  adminVoices({ ...item, kind: "ORIGINAL" });
  api.delete.mockRejectedValue({ response: { data: { error: "Supprimez d’abord les répliques." } } });
  render(<VoiceCollection />);
  fireEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" })));
  expect(screen.getByRole("alert")).toHaveTextContent("Supprimez d’abord les répliques.");
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
});
test("ne propose pas de modification ni de suppression pendant la génération", async () => {
  adminVoices({ ...item, status: "PROCESSING" });
  render(<VoiceCollection />);
  expect(await screen.findByRole("button", { name: "Modifier" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Supprimer" })).toBeDisabled();
});

test("laisser la transcription vide permet l’ajout automatique sans génération de voix", async () => {
  api.get.mockImplementation(url => Promise.resolve({ data: url === "/voices/config" ? { workerReady: true, transcriptionWorkerReady: true } : url === "/people" ? [{ PersonneID: 7, Prenom: "Voix", Nom: "Exemple" }] : { items: [], admin: true, pages: 1 } }));
  api.post.mockResolvedValue({ data: {} });
  render(<PersonVoiceSection personId="7" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ajouter une voix originale" }));
  await screen.findByRole("option", { name: "Voix Exemple" });
  expect(screen.getByLabelText(/Transcription exacte/)).not.toBeRequired();
  fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Original" } });
  fireEvent.change(screen.getByLabelText(/Justificatif/), { target: { value: "Accord" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText(/Fichier audio/), { target: { files: [new File(["audio"], "original.wav", { type: "audio/wav" })] } });
  await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Conserver l’original" }).closest("form")));
  expect(api.post.mock.calls[0][1].get("text")).toBe("");
});
test("un original en attente ne peut pas encore servir de référence", async () => {
  adminVoices({ ...item, kind: "ORIGINAL", text: "", status: "QUEUED", automaticTranscription: true });
  render(<VoiceCollection />);
  expect(await screen.findByText("Transcription automatique en attente")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Utiliser comme référence" })).not.toBeInTheDocument();
});

test("les onglets filtrent les catégories et réinitialisent la recherche", async () => {
  api.get.mockImplementation((url, options) => Promise.resolve({ data: { items: [{ ...item, kind: options?.params?.kind || "ORIGINAL" }], admin: false, pages: 1 } }));
  render(<VoiceCollection />);
  expect(await screen.findByLabelText("Original : Bonjour")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Originaux" })).toHaveAttribute("aria-selected", "true");
  fireEvent.change(screen.getByLabelText("Rechercher une voix"), { target: { value: "test" } });
  fireEvent.click(screen.getByRole("tab", { name: "Voix IA" }));
  expect(await screen.findByLabelText("IA : Bonjour")).toBeInTheDocument();
  expect(screen.queryByLabelText("Original : Bonjour")).not.toBeInTheDocument();
  expect(api.get).toHaveBeenLastCalledWith("/voices", { params: { personId: undefined, page: 1, search: "", kind: "AI" } });
  fireEvent.keyDown(screen.getByRole("tab", { name: "Voix IA" }), { key: "ArrowLeft" });
  await screen.findByLabelText("Original : Bonjour");
  expect(screen.getByRole("tab", { name: "Originaux" })).toHaveFocus();
});
