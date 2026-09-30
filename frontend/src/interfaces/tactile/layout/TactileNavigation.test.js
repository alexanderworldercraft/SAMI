import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TactileNavigation from "./TactileNavigation";
import api from "../../../services/api";
import { useAiFeaturePreference } from "../../../context/AiFeaturePreferenceContext";
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ pathname: "/videos", search: "" }),
  useNavigate: () => mockNavigate,
}), { virtual: true });
jest.mock("../../../services/api", () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock("../../../components/ThemeToggle", () => () => <button>Changer le thème</button>);
jest.mock("../../../context/AiFeaturePreferenceContext", () => ({ useAiFeaturePreference: jest.fn() }));
jest.mock("../../../utils/scrollToPageTop", () => ({ scrollToPageTop: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks(); api.get.mockResolvedValue({ data: { GradeID: 3 } });
  useAiFeaturePreference.mockReturnValue({ authenticated: true, preference: { accepted: false }, loading: false });
});
test("propose une navigation tactile persistante et marque la rubrique active", async () => {
  render(<TactileNavigation />);
  expect(screen.queryByRole("button", { name: "Ouvrir le menu" })).not.toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "Navigation tactile" });
  expect(within(nav).getByRole("link", { name: "Vidéos" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(screen.getByRole("button", { name: "Plus de rubriques" }));
  expect(await screen.findByRole("link", { name: "Paramètres" })).toHaveAttribute("href", "/settings");
  expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Voix" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
test("conserve les accès administratifs et les voix autorisées dans le menu", async () => {
  api.get.mockResolvedValue({ data: { GradeID: 1 } });
  useAiFeaturePreference.mockReturnValue({ authenticated: true, preference: { accepted: true }, loading: false });
  render(<TactileNavigation />);
  fireEvent.click(screen.getByRole("button", { name: "Plus de rubriques" }));
  expect(await screen.findByRole("link", { name: "Administration" })).toHaveAttribute("href", "/administration");
  expect(screen.getByRole("link", { name: "Voix" })).toHaveAttribute("href", "/voix");
  fireEvent.click(screen.getByRole("link", { name: "Paramètres" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
test("ouvre la recherche au toucher", async () => {
  render(<TactileNavigation />);
  fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
  expect(await screen.findByLabelText("Titre de vidéo ou de série")).toBeInTheDocument();
});
test("une déconnexion échouée ne prétend pas fermer la session", async () => {
  api.post.mockRejectedValue(new Error("offline")); render(<TactileNavigation />);
  fireEvent.click(screen.getByRole("button", { name: "Plus de rubriques" }));
  fireEvent.click(await screen.findByRole("button", { name: "Se déconnecter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Déconnexion impossible");
  expect(mockNavigate).not.toHaveBeenCalled();
});
