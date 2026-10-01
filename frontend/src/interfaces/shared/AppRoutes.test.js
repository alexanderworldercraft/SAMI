import React from "react";
import AppRoutes from "./AppRoutes";
import { APP_ROUTES } from "./routeDefinitions";
import { classicInterface } from "../classic";
import ProtectedRoute from "../../components/ProtectedRoute";
import ProtectedAdminRoute from "../../components/ProtectedAdminRoute";
import NotProtectedRoute from "../../components/NotProtectedRoute";
import Administration from "../../components/AdministrationPage";

jest.mock("react-router-dom", () => ({ Route: () => null, Routes: ({ children }) => children }), { virtual: true });
jest.mock("../../components/ProtectedRoute", () => ({ children }) => children);
jest.mock("../../components/ProtectedAdminRoute", () => ({ children }) => children);
jest.mock("../../components/NotProtectedRoute", () => ({ children }) => children);
jest.mock("../../components/AdministrationPage", () => () => null);
jest.mock("../../components/FormNewVideoPage", () => () => null);
jest.mock("../../components/FormNewMusicPage", () => () => null);
jest.mock("../classic", () => ({ classicInterface: {
  Shell: ({ children }) => children,
  pages: {},
} }));
const page = () => null;
const Shell = ({ children }) => children;
const definition = { Shell, pages: Object.fromEntries(APP_ROUTES.filter((route) => !route.admin).map((route) => [route.page, page])) };
const routes = () => AppRoutes({ interfaceDefinition: definition }).props.children;
const find = (path) => routes().find((route) => route.props.path === path).props.element;

test("conserve les 20 URL de l'application, y compris les paramètres des fiches et du lecteur", () => {
  expect(routes().map((route) => route.props.path)).toEqual([
    "/login", "/register", "/profile", "/settings", "/videos", "/sagas", "/musique", "/voix",
    "/personnes", "/personnes/:id", "/lecture/:id", "/administration", "/nouvelle-video", "/nouvelle-musique",
    "/updates", "/stats", "/politique-confidentialite", "/conditions-utilisation", "/conformite-donnees", "/",
  ]);
});
test("les URL publiques restent publiques et les URL utilisateur restent protégées", () => {
  for (const path of ["/", "/updates", "/stats", "/politique-confidentialite", "/conditions-utilisation", "/conformite-donnees"]) expect(find(path).type).toBe(NotProtectedRoute);
  for (const path of ["/profile", "/settings", "/videos", "/sagas", "/musique", "/voix", "/personnes", "/personnes/:id", "/lecture/:id"]) expect(find(path).type).toBe(ProtectedRoute);
});
test("les outils administratifs gardent leur protection et leur disposition classic", () => {
  for (const path of ["/administration", "/nouvelle-video", "/nouvelle-musique"]) {
    const route = find(path);
    expect(route.type).toBe(ProtectedAdminRoute);
    expect(route.props.children.type).toBe(classicInterface.Shell);
  }
  expect(find("/administration").props.children.props.children.type).toBe(Administration);
});
test("conserve les pages sans footer et le padding responsive du lecteur", () => {
  for (const path of ["/profile", "/settings", "/administration"]) expect(find(path).props.children.props.withFooter).toBe(false);
  expect(find("/videos").props.children.type).toBe(Shell);
  expect(find("/lecture/:id").props.children.props.contentClassName).toBe("");
});
test("l'inscription reste une connexion sans navigation ni footer", () => {
  const login = find("/login");
  const register = find("/register");
  expect(login.props.children.type).toBe(page);
  expect(register.props.children.type).toBe(page);
});
