import { detectInterfaceDevice } from "./interfaceDevice";
const env = (userAgent, touch = false, maxTouchPoints = 0) => ({
  navigator: { userAgent, maxTouchPoints },
  matchMedia: (query) => ({ matches: query === "(pointer: coarse)" ? touch : !touch }),
});
test("détecte les TV indépendamment du pointeur", () => {
  for (const ua of ["SmartTV Tizen", "webOS", "Android TV", "Mozilla AFTMM", "HbbTV"]) expect(detectInterfaceDevice(env(ua))).toMatchObject({ Type: "tv", InterfaceMode: "remote" });
});
test("distingue téléphone, tablette et ordinateur hybride", () => {
  expect(detectInterfaceDevice(env("iPhone Mobile", true))).toMatchObject({ Type: "phone", InterfaceMode: "tactile" });
  expect(detectInterfaceDevice(env("Android Tablet", true))).toMatchObject({ Type: "tablet", InterfaceMode: "tactile" });
  expect(detectInterfaceDevice(env("Macintosh", true, 5))).toMatchObject({ Type: "tablet", InterfaceMode: "tactile" });
  expect(detectInterfaceDevice(env("Windows", false, 10))).toMatchObject({ Type: "computer", InterfaceMode: "classic" });
});
test("sans API media, utilise le mode classique", () => {
  expect(detectInterfaceDevice({ navigator: {} })).toMatchObject({ Type: "unknown", InterfaceMode: "classic" });
});
