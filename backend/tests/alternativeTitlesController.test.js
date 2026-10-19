import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../services/db.js", () => ({ prisma: {
  video: { findUnique: vi.fn(), update: vi.fn() },
  series: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
} }));
vi.mock("../services/authz.js", () => ({ ensureAdmin: vi.fn() }));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn() }));
import { prisma } from "../services/db.js";
import { ensureAdmin } from "../services/authz.js";
import { createLog } from "../controllers/logController.js";
import { updateVideoAlternativeTitles, updateSeriesAlternativeTitles } from "../controllers/alternativeTitlesController.js";
import { createSeries, getSeriesById } from "../controllers/seriesController.js";
const replyFor = () => {
  const reply = { code: vi.fn(), status: vi.fn(), send: vi.fn() };
  Object.values(reply).forEach((fn) => fn.mockReturnValue(reply));
  return reply;
};
beforeEach(() => {
  vi.resetAllMocks();
  ensureAdmin.mockResolvedValue({ userId: 7, gradeId: 2 });
});
describe.each([
  ["vidéo", "video", updateVideoAlternativeTitles, { VideoID: 42 }],
  ["série", "series", updateSeriesAlternativeTitles, { SeriesID: 42 }],
])("titres alternatifs %s", (_label, modelName, update, where) => {
  it("normalise, sauvegarde et journalise la modification", async () => {
    const model = prisma[modelName];
    model.findUnique.mockResolvedValue({ TitreAlternatif: null, EtatID: 1 });
    model.update.mockResolvedValue({ ...where, TitreAlternatif: "Mégalodon | En eau trouble" });
    const reply = replyFor();
    await update({ params: { id: "42" }, body: { TitreAlternatif: " Mégalodon || En eau trouble | " } }, reply);
    expect(model.update).toHaveBeenCalledWith({ where, data: { TitreAlternatif: "Mégalodon | En eau trouble" } });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({ Champ: "TitreAlternatif", AncienneValeur: null, NouvelleValeur: "Mégalodon | En eau trouble" }));
  });
  it("permet de retirer tous les titres alternatifs", async () => {
    prisma[modelName].findUnique.mockResolvedValue({ TitreAlternatif: "Mégalodon", EtatID: 1 });
    await update({ params: { id: "42" }, body: { TitreAlternatif: " | " } }, replyFor());
    expect(prisma[modelName].update).toHaveBeenCalledWith({ where, data: { TitreAlternatif: null } });
  });
  it("ne modifie ni ne journalise une valeur inchangée", async () => {
    prisma[modelName].findUnique.mockResolvedValue({ TitreAlternatif: "Mégalodon", EtatID: 1 });
    await update({ params: { id: "42" }, body: { TitreAlternatif: " Mégalodon " } }, replyFor());
    expect(prisma[modelName].update).not.toHaveBeenCalled();
    expect(createLog).not.toHaveBeenCalled();
  });
  it("refuse les accès non administrateurs", async () => {
    ensureAdmin.mockResolvedValue(null);
    await update({ params: { id: "42" }, body: { TitreAlternatif: "Film" } }, replyFor());
    expect(prisma[modelName].findUnique).not.toHaveBeenCalled();
  });
  it.each([{}, { TitreAlternatif: [] }, { TitreAlternatif: "a".repeat(10001) }])("rejette un corps invalide", async (body) => {
    const reply = replyFor();
    await update({ params: { id: "42" }, body }, reply);
    expect(reply.code).toHaveBeenCalledWith(400);
    expect(prisma[modelName].update).not.toHaveBeenCalled();
  });
  it("signale un contenu absent", async () => {
    prisma[modelName].findUnique.mockResolvedValue(null);
    const reply = replyFor();
    await update({ params: { id: "42" }, body: { TitreAlternatif: "Film" } }, reply);
    expect(reply.code).toHaveBeenCalledWith(404);
  });
  it("refuse un identifiant invalide", async () => {
    const reply = replyFor();
    await update({ params: { id: "42oops" }, body: { TitreAlternatif: "Film" } }, reply);
    expect(reply.code).toHaveBeenCalledWith(400);
    expect(prisma[modelName].update).not.toHaveBeenCalled();
  });
});
it("respecte le verrou de transfert vidéo", async () => {
  const { ETAT } = await import("../constants.js");
  prisma.video.findUnique.mockResolvedValue({ TitreAlternatif: null, EtatID: ETAT.BLOCKED });
  const reply = replyFor();
  await updateVideoAlternativeTitles({ params: { id: "42" }, body: { TitreAlternatif: "Film" } }, reply);
  expect(reply.code).toHaveBeenCalledWith(409);
  expect(prisma.video.update).not.toHaveBeenCalled();
});
it("crée une série avec les titres alternatifs du multipart", async () => {
  prisma.series.create.mockResolvedValue({ SeriesID: 42, Titre: "The Meg" });
  await createSeries({ parts: async function* () {
    yield { type: "field", fieldname: "Titre", value: "The Meg" };
    yield { type: "field", fieldname: "TitreAlternatif", value: " Mégalodon | En eau trouble " };
  } }, replyFor());
  expect(prisma.series.create).toHaveBeenCalledWith({ data: expect.objectContaining({ TitreAlternatif: "Mégalodon | En eau trouble" }) });
});
it("renvoie les titres alternatifs dans le formulaire série", async () => {
  prisma.series.findUnique.mockResolvedValue({ SeriesID: 42, TitreAlternatif: "Mégalodon", SeriesGenres: [], Saisons: [] });
  const reply = replyFor();
  await getSeriesById({ params: { id: "42" } }, reply);
  expect(prisma.series.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ TitreAlternatif: true }) }));
  expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ TitreAlternatif: "Mégalodon" }));
});
