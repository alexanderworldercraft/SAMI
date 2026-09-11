import { loadHlsDuration } from "./hlsDuration";
const originalFetch = global.fetch;
const base = "https://sami.example/api/media/videos/42/master.m3u8";
const media = "#EXTM3U\n#EXTINF:60.5,\na.ts\n#EXTINF:29.5,\nb.ts\n#EXT-X-ENDLIST\n";
const response = text => ({ ok: true, text: async () => text });
beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; });
it("uses an advertised 720p rendition without requiring 240p", async () => {
  global.fetch.mockResolvedValueOnce(response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n/files/720p/index.m3u8\n')).mockResolvedValueOnce(response(media));
  expect(await loadHlsDuration(base)).toBe(90);
  expect(global.fetch).toHaveBeenLastCalledWith("https://sami.example/files/720p/index.m3u8", { credentials: "include" });
});
it("tries another advertised rendition when the first is missing", async () => {
  global.fetch.mockResolvedValueOnce(response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\n240p/playlist.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n720p/index.m3u8\n')).mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce(response(media));
  expect(await loadHlsDuration(base)).toBe(90);
  expect(global.fetch).toHaveBeenCalledTimes(3);
});
it("reads a media playlist directly", async () => {
  global.fetch.mockResolvedValueOnce(response(media));
  expect(await loadHlsDuration(base)).toBe(90);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
it("does not parse a 404 HTML page as a playlist", async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
  await expect(loadHlsDuration(base)).rejects.toThrow("404");
});
it("does not report zero seconds for HTML or an incomplete media playlist", async () => {
  global.fetch.mockResolvedValueOnce(response('<html>Erreur</html>')).mockResolvedValueOnce(response(media.replace('#EXT-X-ENDLIST', '')));
  await expect(loadHlsDuration(base)).rejects.toThrow("HLS");
  await expect(loadHlsDuration(base)).rejects.toThrow("incomplète");
});
it("stops on authorization errors instead of trying more variants", async () => {
  global.fetch.mockResolvedValueOnce(response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nb.m3u8\n')).mockResolvedValueOnce({ ok: false, status: 403 });
  await expect(loadHlsDuration(base)).rejects.toThrow("403");
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
