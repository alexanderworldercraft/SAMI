jest.mock("react-router-dom", () => {
  const React = require("react");
  const Location = React.createContext(null);
  return {
    MemoryRouter: ({ initialEntries, children }) => {
      const [pathname, navigate] = React.useState(initialEntries[0]);
      return <Location.Provider value={{ pathname, navigate }}>{children}</Location.Provider>;
    },
    useLocation: () => ({ pathname: React.useContext(Location).pathname }),
    useNavigate: () => React.useContext(Location).navigate,
  };
}, { virtual: true });

import React, { act } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import api from "../services/api";
import { InterfacePreferenceProvider, useInterfacePreference } from "./InterfacePreferenceContext";
import InterfaceDeviceSettings from "../components/InterfaceDeviceSettings";
import { deviceStorageKey } from "../utils/interfaceDevice";
jest.mock("../services/api", () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }));
jest.mock("./AiFeaturePreferenceContext", () => ({ useAiFeaturePreference: () => ({ authenticated: true, preference: { status: "ACCEPTED" } }) }));
const key = "3f8aa992-839e-4199-9291-f1b5db3c2104";
const device = { UserDeviceID: 12, Nom: "Salon", Type: "computer", InterfaceMode: "remote", CreateDate: "2026-09-01", UpdateDate: "2026-09-01", LastUsedDate: "2026-09-30" };
function Probe() {
  const { mode, refresh } = useInterfacePreference();
  const navigate = useNavigate();
  return <><span data-testid="mode">{mode}</span><button onClick={refresh}>Actualiser</button><button onClick={() => navigate("/videos")}>Autre page</button><button onClick={() => navigate("/login")}>Déconnexion</button><InterfaceDeviceSettings /></>;
}
const mount = () => render(<MemoryRouter initialEntries={["/settings"]}><InterfacePreferenceProvider><Probe /></InterfacePreferenceProvider></MemoryRouter>);
const preference = (accepted, devices = []) => ({ data: { UtilisateurID: 31, accepted, devices } });
beforeAll(() => {
  Object.defineProperty(window, "crypto", { configurable: true, value: { getRandomValues: (bytes) => require("crypto").randomFillSync(bytes) } });
});
beforeEach(() => {
  jest.resetAllMocks(); localStorage.clear();
  api.get.mockResolvedValue(preference(null));
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { device } });
  api.delete.mockResolvedValue({ data: { removed: true } });
});
test("fermer le consentement ne persiste rien et ne bloque pas la navigation", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Plus tard" }));
  await act(async () => { fireEvent.click(screen.getByText("Autre page")); });
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.put).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
});
test("un refus explicite est enregistré sans enregistrer d'appareil", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Non, je refuse" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.put).toHaveBeenCalledWith("/users/interface-preference", { accepted: false });
  expect(api.post).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
});
test("accepter puis ne pas enregistrer ne crée ni appareil ni identifiant local", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Oui, j'accepte" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ne pas enregistrer" }));
  expect(api.post).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
});
test("le popup permet de choisir remote pour un ordinateur", async () => {
  api.get.mockResolvedValue(preference(true)); mount();
  fireEvent.click(await screen.findByRole("button", { name: "À modifier" }));
  fireEvent.change(screen.getByLabelText("Nom de l'appareil"), { target: { value: "Salon" } });
  fireEvent.change(screen.getByLabelText("Type"), { target: { value: "computer" } });
  fireEvent.change(screen.getByLabelText("Interface"), { target: { value: "remote" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("remote"));
  expect(api.post).toHaveBeenCalledWith("/users/interface-devices", expect.objectContaining({ Nom: "Salon", Type: "computer", InterfaceMode: "remote", deviceKey: expect.any(String) }));
  expect(localStorage.getItem(deviceStorageKey(31))).toBeTruthy();
  expect(document.documentElement.dataset.interfaceMode).toBe("remote");
});
test("reconnaît un appareil enregistré sans popup", async () => {
  localStorage.setItem(deviceStorageKey(31), key);
  api.get.mockResolvedValue(preference(true, [device])); mount();
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("remote"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/users/interface-devices/resolve", { deviceKey: key });
});
test("la désactivation exige confirmation puis supprime l'identifiant local", async () => {
  localStorage.setItem(deviceStorageKey(31), key);
  api.get.mockResolvedValue(preference(true, [device])); mount();
  const toggle = await screen.findByRole("switch");
  await waitFor(() => expect(toggle).toBeEnabled());
  fireEvent.click(toggle);
  expect(api.put).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(toggle).toHaveAttribute("aria-checked", "true");
  fireEvent.click(toggle); fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  expect(localStorage.getItem(deviceStorageKey(31))).toBeNull();
  expect(screen.queryByText("Salon")).not.toBeInTheDocument();
});
test("un échec d'enregistrement garde la popup et ne stocke pas l'identifiant", async () => {
  api.get.mockResolvedValue(preference(true)); api.post.mockRejectedValue(new Error("offline")); mount();
  fireEvent.click(await screen.findByRole("button", { name: "Cela correspond, enregistrer" }));
  await screen.findAllByRole("alert");
  expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(localStorage.length).toBe(0);
});
test("la déconnexion retire la préférence de l'appareil de l'interface", async () => {
  localStorage.setItem(deviceStorageKey(31), key); api.get.mockResolvedValue(preference(true, [device])); mount();
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("remote"));
  fireEvent.click(screen.getByText("Déconnexion"));
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("classic"));
});

test("après un non-enregistrement, une nouvelle ouverture redemande", async () => {
  api.get.mockResolvedValue(preference(true));
  const view = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Ne pas enregistrer" }));
  view.unmount(); mount();
  expect(await screen.findByRole("button", { name: "À modifier" })).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
test("un refus déjà enregistré ne présente aucune popup", async () => {
  api.get.mockResolvedValue(preference(false)); mount();
  await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
test("modifier l'interface depuis les paramètres actualise le mode courant", async () => {
  localStorage.setItem(deviceStorageKey(31), key);
  api.get.mockResolvedValue(preference(true, [device]));
  api.put.mockResolvedValue({ data: { device: { ...device, InterfaceMode: "tactile" } } });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Modifier Salon" }));
  fireEvent.change(screen.getByLabelText("Interface"), { target: { value: "tactile" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("tactile"));
  expect(api.put).toHaveBeenCalledWith("/users/interface-devices/12", { Nom: "Salon", Type: "computer", InterfaceMode: "tactile" });
});
test("supprimer l'appareil courant rétablit la détection automatique", async () => {
  localStorage.setItem(deviceStorageKey(31), key); api.get.mockResolvedValue(preference(true, [device])); mount();
  fireEvent.click(await screen.findByRole("button", { name: "Supprimer Salon" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("classic"));
  expect(api.delete).toHaveBeenCalledWith("/users/interface-devices/12");
  expect(localStorage.getItem(deviceStorageKey(31))).toBeNull();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
test("une erreur serveur pendant la désactivation conserve l'appareil et la confirmation", async () => {
  localStorage.setItem(deviceStorageKey(31), key); api.get.mockResolvedValue(preference(true, [device]));
  api.put.mockRejectedValue(new Error("offline")); mount();
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("remote"));
  fireEvent.click(screen.getByRole("switch")); fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  await screen.findAllByRole("alert");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(localStorage.getItem(deviceStorageKey(31))).toBe(key);
  expect(screen.getByRole("switch", { hidden: true })).toHaveAttribute("aria-checked", "true");
});

test("un changement de compte ne réutilise pas le refus de répondre de la session précédente", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Plus tard" }));
  api.get.mockResolvedValue({ data: { UtilisateurID: 44, accepted: null, devices: [] } });
  fireEvent.click(screen.getByText("Actualiser"));
  expect(await screen.findByRole("button", { name: "Plus tard" })).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
