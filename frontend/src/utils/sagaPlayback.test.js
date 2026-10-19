import { getNextSagaContent, orderSagaContents } from "./sagaPlayback";

const contents = [
  { id: 3, type: "video", Titre: "X3", Ordre: 3 },
  { id: 1, type: "video", Titre: "X1", Ordre: 1 },
  { id: 2, type: "video", Titre: "X2", Ordre: 2 },
];

test("suit l’ordre de la saga et ne modifie pas les données reçues", () => {
  expect(getNextSagaContent({ contents, sagaCount: 1, videoId: 1 })).toMatchObject({ VideoID: 2, Titre: "X2" });
  expect(getNextSagaContent({ contents, sagaCount: 1, videoId: 2 })).toMatchObject({ VideoID: 3 });
  expect(contents.map((item) => item.id)).toEqual([3, 1, 2]);
});

test.each([0, 2, 9])("n’attribue pas de contenu suivant avec %i sagas", (sagaCount) => {
  expect(getNextSagaContent({ contents, sagaCount, videoId: 1 })).toBeNull();
});

test("ne boucle pas en fin de saga et attend de retrouver le contenu courant", () => {
  expect(getNextSagaContent({ contents, sagaCount: 1, videoId: 3 })).toBeNull();
  expect(getNextSagaContent({ contents, sagaCount: 1, videoId: 50 })).toBeNull();
  expect(getNextSagaContent({ contents: [], sagaCount: 1, videoId: 1 })).toBeNull();
});

test("conserve le prochain contenu verrouillé dans l’ordre sans le sauter", () => {
  const premium = contents.map((item) => item.id === 2 ? { ...item, Premium: true } : item);
  expect(getNextSagaContent({ contents: premium, sagaCount: 1, videoId: 1 })).toBeNull();
  expect(getNextSagaContent({ contents: premium, sagaCount: 1, videoId: 1, premium: true })).toMatchObject({ VideoID: 2 });
});

test("respecte aussi le Premium de la série d’un épisode ou du premier épisode de la série suivante", () => {
  const premium = contents.map((item) => item.id === 2 ? { ...item, PlaybackPremium: true } : item);
  expect(getNextSagaContent({ contents: premium, sagaCount: 1, videoId: 1 })).toBeNull();
});

const series = { SeriesID: 7, Saisons: [
  { Episodes: [{ VideoID: 71 }, { VideoID: 72 }] },
  { Episodes: [{ VideoID: 73 }, { VideoID: 74 }] },
] };
const mixed = [
  { id: 7, type: "series", FirstVideoID: 71, Ordre: 1 },
  { id: 10, type: "video", Ordre: 2 },
];

test.each([71, 72, 73])("attend le dernier épisode de toute la série à partir de l’épisode %i", (videoId) => {
  expect(getNextSagaContent({ contents: mixed, sagaCount: 1, videoId, series })).toBeNull();
});

test("passe de la série au prochain contenu uniquement depuis son dernier épisode", () => {
  expect(getNextSagaContent({ contents: mixed, sagaCount: 1, videoId: "74", series })).toMatchObject({ VideoID: 10 });
});

test("ne traite pas un épisode absent de la série ou une liste d’épisodes indisponible comme une fin de série", () => {
  expect(getNextSagaContent({ contents: mixed, sagaCount: 1, videoId: 75, series })).toBeNull();
  expect(getNextSagaContent({ contents: mixed, sagaCount: 1, videoId: 74, series: { SeriesID: 7 } })).toBeNull();
});

test("ne quitte pas une série en cours même si son épisode est directement lié à la saga", () => {
  expect(getNextSagaContent({ contents: [{ id: 72, type: "video", Ordre: 1 }, { id: 10, type: "video", Ordre: 2 }],
    sagaCount: 1, videoId: 72, series })).toBeNull();
});

test("ouvre le premier épisode de la série suivante et refuse une série vide", () => {
  const nextSeries = [{ id: 10, type: "video", Ordre: 1 }, { id: 7, type: "series", Ordre: 2, FirstVideoID: "71" }];
  expect(getNextSagaContent({ contents: nextSeries, sagaCount: 1, videoId: 10 })).toMatchObject({ VideoID: 71 });
  expect(getNextSagaContent({ contents: nextSeries.map((item) => item.type === "series" ? { ...item, FirstVideoID: null } : item),
    sagaCount: 1, videoId: 10 })).toBeNull();
});

test("départage les positions égales avec les identifiants de liaison", () => {
  expect(orderSagaContents([{ SagaContentID: 2, Ordre: 1 }, { SagaContentID: 1, Ordre: 1 }]).map((item) => item.SagaContentID)).toEqual([1, 2]);
});
