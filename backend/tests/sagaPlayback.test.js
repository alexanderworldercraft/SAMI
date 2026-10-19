import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("../services/db.js", () => ({ prisma: { saga: { findUnique: mocks.find } } }));
import { getSagaById } from "../controllers/sagaController.js";

describe("droits de lecture des contenus d’une saga", () => {
  it("expose le Premium hérité d’une série et celui du premier épisode sans changer les badges des contenus", async () => {
    mocks.find.mockResolvedValue({ SagaID: 7, Titre: "Saga", EtatID: 1, SagaContents: [
      { SagaContentID: 1, Ordre: 1, Video: { VideoID: 11, EtatID: 1, Premium: false, Saison: { Series: { Premium: true } } } },
      { SagaContentID: 2, Ordre: 2, Series: { SeriesID: 7, Premium: false, Saisons: [{ Episodes: [{ VideoID: 71, Premium: true }] }] } },
      { SagaContentID: 3, Ordre: 3, Video: { VideoID: 12, EtatID: 1, Premium: false } },
    ] });
    const reply = { send: vi.fn((payload) => payload) };
    const result = await getSagaById({ params: { id: "7" } }, reply);
    expect(result.Contents).toMatchObject([
      { id: 11, Premium: false, PlaybackPremium: true },
      { id: 7, type: "series", FirstVideoID: 71, Premium: false, PlaybackPremium: true },
      { id: 12, PlaybackPremium: false },
    ]);
    const query = mocks.find.mock.calls[0][0];
    expect(query.include.SagaContents.orderBy).toEqual([{ Ordre: "asc" }, { SagaContentID: "asc" }]);
    expect(query.include.SagaContents.include.Video.include.Saison).toEqual({ select: { Series: { select: { Premium: true } } } });
    expect(query.include.SagaContents.include.Series.include.Saisons.include.Episodes.select.Premium).toBe(true);
  });
});
