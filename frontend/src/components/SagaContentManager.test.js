import { buildSagaContentItems } from "./SagaContentManager";

jest.mock("../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

describe("SagaContentManager - tri des contenus", () => {
  test("fusionne films et séries de la création la plus récente à la plus ancienne", () => {
    const contents = buildSagaContentItems(
      [
        { VideoID: 1, Titre: "Film ancien", SaisonID: null, CreateDate: "2026-08-08T10:00:00.000Z" },
        { VideoID: 2, Titre: "Film récent", type: "film", CreateDate: "2026-08-11T10:00:00.000Z" },
        { VideoID: 3, Titre: "Épisode exclu", SaisonID: 7, CreateDate: "2026-08-12T10:00:00.000Z" },
        { VideoID: 4, Titre: "Zulu sans date", SaisonID: null, CreateDate: null },
      ],
      [
        { SeriesID: 5, Titre: "Série intermédiaire", CreateDate: "2026-08-10T10:00:00.000Z" },
        { SeriesID: 6, Titre: "Alpha sans date", CreateDate: null },
      ]
    );

    expect(contents.map((content) => content.label)).toEqual([
      "Film récent",
      "Série intermédiaire",
      "Film ancien",
      "Alpha sans date",
      "Zulu sans date",
    ]);
  });

  test("départage les dates identiques par titre", () => {
    const contents = buildSagaContentItems(
      [{ VideoID: 1, Titre: "Zulu", SaisonID: null, CreateDate: "2026-08-11T10:00:00.000Z" }],
      [{ SeriesID: 2, Titre: "Alpha", CreateDate: "2026-08-11T10:00:00.000Z" }]
    );

    expect(contents.map((content) => content.label)).toEqual(["Alpha", "Zulu"]);
  });
});
