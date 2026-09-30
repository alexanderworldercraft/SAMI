import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import RemoteControls from "./RemoteControls";
const mockNavigate = jest.fn();
let mockPathname = "/videos";
jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: mockPathname, search: "" }), useNavigate: () => mockNavigate }), { virtual: true });
let rect;
beforeEach(() => {
  mockNavigate.mockClear();
  mockPathname = "/videos";
  rect = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    return { left: Number(this.dataset.x || 0), top: Number(this.dataset.y || 0), width: 100, height: 50 };
  });
  jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("déplace le focus et préserve la saisie native des champs", () => {
  render(<><RemoteControls /><button data-x="0">Premier</button><button data-x="150">Suivant</button><input aria-label="Recherche" defaultValue="Saga" data-x="300" /></>);
  const first = screen.getByRole("button", { name: "Premier" }); first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Suivant" })).toHaveFocus();
  const input = screen.getByLabelText("Recherche"); input.focus(); input.setSelectionRange(2, 2);
  fireEvent.keyDown(input, { key: "ArrowLeft" });
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: "Backspace" });
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("confine les flèches à la boîte de dialogue et retourne après sa fermeture", () => {
  render(<><RemoteControls /><button data-x="150">Page</button><div role="dialog"><button>Fermer</button><button data-x="300">Choix</button></div></>);
  const close = screen.getByRole("button", { name: "Fermer" }); close.focus();
  fireEvent.keyDown(close, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Choix" })).toHaveFocus();
  fireEvent.keyDown(close, { key: "Escape" });
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("Retour TV revient à la page précédente sans boucle de touches", () => {
  render(<><RemoteControls /><button>Page</button></>);
  const button = screen.getByRole("button"); button.focus();
  act(() => fireEvent.keyDown(button, { key: "Unidentified", keyCode: 10009 }));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith(-1);
});

test("depuis le bord gauche de la recherche, une flèche permet de rejoindre le menu", () => {
  render(<><RemoteControls /><button data-x="0">Menu</button><input aria-label="Sagas" data-x="300" defaultValue="Saga" /></>);
  const input = screen.getByLabelText("Sagas"); input.focus(); input.setSelectionRange(0, 0);
  fireEvent.keyDown(input, { key: "ArrowLeft" });
  expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
});

test("un lien direct attend le lecteur chargé et dimensionné avant de lui donner le focus", async () => {
  mockPathname = "/lecture/14";
  let playerWidth = 0;
  rect.mockImplementation(function () {
    return { left: 0, top: 0, width: this.hasAttribute("data-remote-player") ? playerWidth : 100, height: 50 };
  });
  const runFrame = () => act(() => window.requestAnimationFrame.mock.calls.at(-1)[0]());
  const view = render(<><RemoteControls /><div data-remote-content><a href="/updates">Pied de page</a></div></>);
  runFrame();
  expect(screen.getByRole("link")).not.toHaveFocus();
  fireEvent.keyDown(document.body, { key: "ArrowDown" });
  expect(screen.getByRole("link")).not.toHaveFocus();
  view.rerender(<><RemoteControls /><div data-remote-content><div data-remote-player tabIndex={0} role="group" aria-label="Vidéo" style={{ width: "0px" }} /><a href="/updates">Pied de page</a></div></>);
  await act(async () => {});
  runFrame();
  expect(screen.getByRole("group")).not.toHaveFocus();
  playerWidth = 640;
  view.rerender(<><RemoteControls /><div data-remote-content><div data-remote-player tabIndex={0} role="group" aria-label="Vidéo" style={{ width: "640px" }} /><a href="/updates">Pied de page</a></div></>);
  await act(async () => {});
  runFrame();
  expect(screen.getByRole("group")).toHaveFocus();
});
