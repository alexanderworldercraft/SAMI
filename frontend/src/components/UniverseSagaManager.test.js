import { buildUniverseCatalogItems } from "./UniverseSagaManager";

jest.mock("../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

describe("UniverseSagaManager - tri du catalogue", () => {
  test("fusionne sagas, films et séries de la création la plus récente à la plus ancienne", () => {
    const items = buildUniverseCatalogItems({
      sagas: [{ SagaID: 1, Titre: "Saga ancienne", CreateDate: "2026-08-08T10:00:00.000Z" }],
      videos: [
        { VideoID: 2, Titre: "Film récent", CreateDate: "2026-08-11T10:00:00.000Z" },
        { VideoID: 3, Titre: "Zulu sans date", CreateDate: null },
      ],
      series: [
        { SeriesID: 4, Titre: "Série intermédiaire", CreateDate: "2026-08-10T10:00:00.000Z" },
        { SeriesID: 5, Titre: "Alpha sans date", CreateDate: null },
      ],
    });

    expect(items.map((item) => item.label)).toEqual([
      "Film récent",
      "Série intermédiaire",
      "Saga ancienne",
      "Alpha sans date",
      "Zulu sans date",
    ]);
  });

  test("départage les dates identiques par titre", () => {
    const items = buildUniverseCatalogItems({
      sagas: [{ SagaID: 1, Titre: "Zulu", CreateDate: "2026-08-11T10:00:00.000Z" }],
      series: [{ SeriesID: 2, Titre: "Alpha", CreateDate: "2026-08-11T10:00:00.000Z" }],
    });

    expect(items.map((item) => item.label)).toEqual(["Alpha", "Zulu"]);
  });
});
