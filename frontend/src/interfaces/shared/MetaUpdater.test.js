import React from "react";
import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import MetaUpdater from "./MetaUpdater";
import { APP_ROUTES } from "./routeDefinitions";
import { STATIC_PAGE_PATHS } from "../../seo/routePolicy.mjs";

let mockPathname = "/";
jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: mockPathname }) }), { virtual: true });

afterEach(() => { document.head.innerHTML = ""; mockPathname = "/"; });
const Page = () => <HelmetProvider><MetaUpdater /></HelmetProvider>;

test("conserve une canonique et les cartes sociales après reprise du HTML serveur puis navigation", async () => {
  document.head.innerHTML = '<title data-rh="true">SAMI</title><link data-rh="true" rel="canonical" href="http://localhost/"><meta data-rh="true" property="og:title" content="SAMI"><meta data-rh="true" name="robots" content="index, follow">';
  const { rerender } = render(<Page />);
  for (const pathname of ["/", "/updates", "/politique-confidentialite", "/conditions-utilisation", "/conformite-donnees"]) {
    mockPathname = pathname;
    rerender(<Page />);
    await waitFor(() => expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", window.location.origin + pathname));
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute("content", document.title);
    await waitFor(() => expect(document.querySelector('meta[name="twitter:title"]')).toHaveAttribute("content", document.title));
  }
  mockPathname = "/page-absente";
  rerender(<Page />);
  await waitFor(() => expect(document.title).toContain("Page introuvable"));
  expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("exclut les pages de compte, statistiques et contenus protégés, et décrit la récupération", async () => {
  const { rerender } = render(<Page />);
  for (const pathname of ["/login", "/register", "/stats", "/administration", "/lecture/42", "/personnes/7", "/recuperation-mot-de-passe"]) {
    mockPathname = pathname;
    rerender(<Page />);
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow"));
    await waitFor(() => expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", window.location.origin + (pathname === "/register" ? "/login" : pathname)));
    if (pathname === "/register") expect(document.title).toContain("Connexion");
  }
  expect(document.title).toContain("Récupération");
});

test("la politique serveur/React couvre exactement les routes statiques de l'application", () => {
  expect([...STATIC_PAGE_PATHS].sort()).toEqual(APP_ROUTES.filter((route) => !route.path.includes(":")).map((route) => route.path).sort());
});
