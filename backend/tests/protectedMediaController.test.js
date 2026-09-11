import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as media from "../services/protectedMediaService.js";
import { protectedMediaController } from "../controllers/protectedMediaController.js";

afterEach(() => vi.restoreAllMocks());
const reply = () => ({ status: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() });
describe("lecture originale des références vocales", () => {
  it.each([["1", false], [undefined, true]])("supprime les pistes IA uniquement pour originalOnly=%s", async (originalOnly, accepted) => {
    vi.spyOn(media, "getVideoMediaAccess").mockResolvedValue({
      video: { VideoID: 13, CheminAcces: "source.m3u8", VideoAudioTracks: [] }, aiFeaturesAccepted: true,
    });
    vi.spyOn(media, "resolveProtectedVideoStorageFile").mockReturnValue({ absolutePath: "/fixture/source.m3u8", relativePath: "source.m3u8" });
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("#EXTM3U");
    const rewrite = vi.spyOn(media, "rewriteProtectedPlaylist").mockReturnValue("#EXTM3U");
    const response = reply();
    await protectedMediaController.master({ params: { videoId: "13" }, user: { userId: 1 }, query: { originalOnly } }, response);
    expect(rewrite).toHaveBeenCalledWith(expect.objectContaining({ aiFeaturesAccepted: accepted }));
    expect(response.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it("ne contourne pas les droits d'accès à la vidéo source", async () => {
    const check = vi.spyOn(media, "getVideoMediaAccess").mockResolvedValue({ error: { statusCode: 403, message: "Accès refusé" } });
    const rewrite = vi.spyOn(media, "rewriteProtectedPlaylist");
    const response = reply();
    await protectedMediaController.master({ params: { videoId: "13" }, user: { userId: 5 }, query: { originalOnly: "1" } }, response);
    expect(check).toHaveBeenCalledWith("13", 5);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(rewrite).not.toHaveBeenCalled();
  });
});
