jest.mock("react-router-dom", () => ({
  Link: ({ children }) => children,
  Navigate: () => null,
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => jest.fn(),
  useParams: () => ({}),
}), { virtual: true });
jest.mock("axios", () => ({
  get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
  create: () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }),
}));

import { INTERFACES, resolveInterface } from "./registry";
import { classicInterface } from "./classic";
import { APP_ROUTES } from "./shared/routeDefinitions";

test("classic fournit toutes les pages publiques et utilisateur existantes", () => {
  for (const route of APP_ROUTES.filter((entry) => !entry.admin)) {
    expect(typeof classicInterface.pages[route.page]).toBe("function");
  }
  expect(typeof classicInterface.Shell).toBe("function");
  expect(typeof classicInterface.PersistentMusicPlayer).toBe("function");
});
test.each(["remote"])("%s conserve sa sélection et fournit sa disposition et son lecteur télécommande", (mode) => {
  const definition = resolveInterface(mode);
  expect(definition.id).toBe(mode);
  expect(definition.renderedMode).toBe("remote");
  expect(definition.pages.playback).not.toBe(classicInterface.pages.playback);
  expect(definition.pages.settings).toBe(classicInterface.pages.settings);
  expect(definition.Shell).not.toBe(classicInterface.Shell);
  expect(definition.PersistentMusicPlayer).toBe(classicInterface.PersistentMusicPlayer);
});
test.each(["classic", "tactile", "remote"])("l'administration reste classic pour le mode %s", (mode) => {
  for (const route of APP_ROUTES.filter((entry) => entry.admin)) {
    expect(resolveInterface(mode, route.path)).toBe(classicInterface);
    expect(resolveInterface(mode, `${route.path}/`)).toBe(classicInterface);
  }
});
test.each([undefined, "invalid", "constructor", "__proto__"])("un mode inconnu %s utilise classic", (mode) => {
  expect(resolveInterface(mode)).toBe(INTERFACES.classic);
});

test("tactile fournit sa navigation et son lecteur adaptés, en réutilisant les pages communes", () => {
  const definition = resolveInterface("tactile");
  expect(definition.renderedMode).toBe("tactile");
  expect(definition.Shell).not.toBe(classicInterface.Shell);
  expect(definition.pages.playback).not.toBe(classicInterface.pages.playback);
  expect(definition.pages.settings).toBe(classicInterface.pages.settings);
  expect(definition.PersistentMusicPlayer).toBe(classicInterface.PersistentMusicPlayer);
});
