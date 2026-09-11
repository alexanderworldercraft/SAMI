import { render, screen } from "@testing-library/react";
import EpisodeList from "./EpisodeList";

jest.mock("react-router-dom", () => ({ Link: ({ to, children }) => <a href={to}>{children}</a> }), { virtual: true });
const originalFetch = global.fetch;
const originalApiBase = process.env.REACT_APP_URL_LOCAL;
beforeEach(() => {
  process.env.REACT_APP_URL_LOCAL = "https://sami.worldercraft.fr/";
  global.fetch = jest.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiBase === undefined) delete process.env.REACT_APP_URL_LOCAL;
  else process.env.REACT_APP_URL_LOCAL = originalApiBase;
});

it.each([
  ["api/media/videos/5797/master.m3u8", "/api/media/videos/5797/files/hls/240p/playlist.m3u8", "https://sami.worldercraft.fr/api/media/videos/5797/files/hls/240p/playlist.m3u8"],
  ["/api/media/videos/5797/master.m3u8", "/api/media/videos/5797/files/hls/240p/playlist.m3u8?token=test", "https://sami.worldercraft.fr/api/media/videos/5797/files/hls/240p/playlist.m3u8?token=test"],
  ["uploads/video/5797/hls/master.m3u8", "240p/playlist.m3u8", "https://sami.worldercraft.fr/uploads/video/5797/hls/240p/playlist.m3u8"],
  ["https://sami.worldercraft.fr/api/media/videos/5797/master.m3u8", "https://sami.worldercraft.fr/api/media/videos/5797/files/hls/240p/playlist.m3u8", "https://sami.worldercraft.fr/api/media/videos/5797/files/hls/240p/playlist.m3u8"],
])("résout la playlist %s → %s sans dupliquer le préfixe", async (CheminAcces, reference, expected) => {
  global.fetch
    .mockResolvedValueOnce({ ok: true, text: async () => `#EXTM3U\r\n#EXT-X-STREAM-INF:BANDWIDTH=123\r\n${reference}\r\n` })
    .mockResolvedValueOnce({ ok: true, text: async () => "#EXTM3U\n#EXTINF:60,\na.ts\n#EXTINF:30,\nb.ts\n#EXT-X-ENDLIST\n" });
  render(<EpisodeList episodes={[{ VideoID: 5797, Titre: "Épisode", CheminAcces }]} />);
  await screen.findByText("01:30");
  expect(global.fetch).toHaveBeenNthCalledWith(1, new URL(CheminAcces, "https://sami.worldercraft.fr/").href, expect.objectContaining({ credentials: "include" }));
  expect(global.fetch).toHaveBeenNthCalledWith(2, expected, expect.objectContaining({ credentials: "include" }));
});

it("affiche une erreur HTTP sans tenter de traiter la réponse comme une playlist", async () => {
  const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
  global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });
  render(<EpisodeList episodes={[{ VideoID: 5797, Titre: "Épisode", CheminAcces: "api/media/videos/5797/master.m3u8" }]} />);
  await screen.findByText("Erreur");
  expect(global.fetch).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});
