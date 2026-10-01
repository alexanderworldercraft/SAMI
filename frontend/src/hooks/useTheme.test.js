import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Cookies from "js-cookie";
import useTheme from "./useTheme";
import ThemeToggle from "../components/ThemeToggle";
import { buildCookieValue } from "../utils/cookieValue";

function Startup() { useTheme(); return null; }
function Selector() {
  const { isDark, selectTheme } = useTheme();
  return <button onClick={() => selectTheme("dark")}>{isDark ? "Sombre" : "Clair"}</button>;
}
let media;
beforeEach(() => {
  Cookies.remove("theme");
  document.documentElement.classList.remove("dark");
  media = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  window.matchMedia = jest.fn(() => media);
});
afterEach(() => { Cookies.remove("theme"); });

test("restaure le sombre au démarrage et au rechargement sans sélecteur visible", () => {
  Cookies.set("theme", buildCookieValue("dark", "2027-09-30T00:00:00.000Z"));
  const view = render(<Startup />);
  expect(document.documentElement).toHaveClass("dark");
  view.unmount();
  document.documentElement.classList.remove("dark");
  render(<Startup />);
  expect(document.documentElement).toHaveClass("dark");
});

test("conserve le choix après la fermeture du sélecteur et restaure son état", () => {
  const view = render(<><Startup /><Selector /></>);
  fireEvent.click(screen.getByRole("button", { name: "Clair" }));
  expect(document.documentElement).toHaveClass("dark");
  view.rerender(<Startup />);
  expect(document.documentElement).toHaveClass("dark");
  view.rerender(<><Startup /><Selector /></>);
  expect(screen.getByRole("button", { name: "Sombre" })).toBeInTheDocument();
});

test("le mode système suit les changements même sans sélecteur", () => {
  const view = render(<Startup />);
  const listener = media.addEventListener.mock.calls[0][1];
  media.matches = true;
  act(() => listener());
  expect(document.documentElement).toHaveClass("dark");
  view.unmount();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
});

test("un choix clair explicite prime sur un système sombre", () => {
  Cookies.set("theme", "light");
  media.matches = true;
  render(<Startup />);
  expect(document.documentElement).not.toHaveClass("dark");
  expect(media.addEventListener).not.toHaveBeenCalled();
});

test("le sélecteur tactile restaure et modifie le thème enregistré", () => {
  Cookies.set("theme", "dark");
  render(<><Startup /><ThemeToggle tactile /></>);
  const toggle = screen.getByRole("switch", { name: "Basculer le thème" });
  expect(toggle).toHaveAttribute("aria-checked", "true");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(document.documentElement).not.toHaveClass("dark");
});
