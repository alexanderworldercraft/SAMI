import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RemoteControls from "../components/RemoteControls";
import RemoteNavigation from "./RemoteNavigation";
import api from "../../../services/api";
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>, useLocation: () => ({ pathname: "/videos", search: "" }), useNavigate: () => mockNavigate }), { virtual: true });
jest.mock("../../../services/api", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("../../../context/AiFeaturePreferenceContext", () => ({ useAiFeaturePreference: () => ({ authenticated: true, preference: { accepted: true } }) }));
jest.mock("../../../components/ThemeToggle", () => () => <button>Thème</button>);
beforeEach(() => { jest.clearAllMocks(); api.get.mockResolvedValue({ data: { GradeID: 1 } }); });

test("conserve les rubriques, les protections et les accès d'administration", async () => {
  render(<RemoteNavigation />);
  expect(screen.queryByRole("link", { name: "Mon profil" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Vidéos" })).toHaveAttribute("aria-current", "page");
  expect(await screen.findByRole("link", { name: "Paramètres" })).toHaveAttribute("href", "/settings");
  expect(screen.getByRole("link", { name: "Voix" })).toHaveAttribute("href", "/voix");
  fireEvent.click(screen.getByRole("button", { name: "Plus de rubriques" }));
  expect(await screen.findByRole("link", { name: "Administration" })).toHaveAttribute("href", "/administration");
});

test("utilise un champ natif pour la recherche", async () => {
  render(<RemoteNavigation />);
  fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
  expect(await screen.findByLabelText("Titre de vidéo ou de série")).toHaveAttribute("type", "search");
});

test("n'efface pas la session si la déconnexion échoue", async () => {
  api.post.mockRejectedValue(new Error("offline"));
  render(<RemoteNavigation />);
  await screen.findByRole("link", { name: "Paramètres" });
  fireEvent.click(screen.getByRole("button", { name: "Plus de rubriques" }));
  fireEvent.click(await screen.findByRole("button", { name: "Se déconnecter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Déconnexion impossible");
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("Retour ferme le véritable dialogue sans quitter la page", async () => {
  const rect = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 50 });
  try {
    render(<><RemoteControls /><RemoteNavigation /></>);
    fireEvent.click(screen.getByRole("button", { name: "Plus de rubriques" }));
    fireEvent.keyDown(await screen.findByRole("button", { name: "Fermer" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  } finally { rect.mockRestore(); }
});
