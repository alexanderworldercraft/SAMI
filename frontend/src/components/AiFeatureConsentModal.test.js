import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/" }),
}), { virtual: true });

import api from "../services/api";
import { AiFeaturePreferenceProvider } from "../context/AiFeaturePreferenceContext";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

const disclosure = {
  title: "Fonctionnalités IA de SAMI",
  summary: "Des sous-titres et pistes audio peuvent être générés localement par IA.",
  acceptLabel: "Oui, je comprends et souhaite y accéder",
  refuseLabel: "Non, je ne souhaite pas y accéder",
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({
    data: {
      status: "UNANSWERED",
      accepted: null,
      disclosure,
    },
  });
});

const renderGate = () => render(
  <AiFeaturePreferenceProvider>
    <main>Contenu SAMI</main>
  </AiFeaturePreferenceProvider>
);

it("impose une réponse sans fermeture par Échap", async () => {
  renderGate();
  const dialog = await screen.findByRole("dialog", { name: disclosure.title });
  expect(dialog).toBeInTheDocument();

  fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
  expect(screen.getByRole("dialog", { name: disclosure.title })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /fermer/i })).not.toBeInTheDocument();
});

it("enregistre aussi le refus et libère l'interface", async () => {
  api.put.mockResolvedValue({
    data: { status: "REFUSED", accepted: false, disclosure },
  });
  renderGate();

  fireEvent.click(await screen.findByRole("button", { name: disclosure.refuseLabel }));
  await waitFor(() => {
    expect(api.put).toHaveBeenCalledWith("/users/ai-preference", { accepted: false });
    expect(screen.queryByRole("dialog", { name: disclosure.title })).not.toBeInTheDocument();
  });
});
