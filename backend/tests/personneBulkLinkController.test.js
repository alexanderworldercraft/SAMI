import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({ prisma: {} }));
vi.mock("../services/authz.js", () => ({
  ensureAdmin: vi.fn(async () => ({ userId: 3, gradeId: 2 })),
  ensureSuperAdmin: vi.fn(),
}));
vi.mock("../services/personCreditImportService.js", async () => {
  const actual = await vi.importActual("../services/personCreditImportService.js");
  return { ...actual, importPeopleCredits: vi.fn() };
});
vi.mock("../prisma/seedPersonneImages.js", () => ({
  createWikimediaClient: vi.fn(() => ({ client: true })),
  runPersonImageSeed: vi.fn(),
}));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn() }));

import { bulkLinkPeople } from "../controllers/personneController.js";
import { importPeopleCredits } from "../services/personCreditImportService.js";
import { createWikimediaClient, runPersonImageSeed } from "../prisma/seedPersonneImages.js";
import { createLog } from "../controllers/logController.js";

const createReply = () => {
  const reply = { code: vi.fn(), send: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
};

const importResult = {
  content: { id: 10, title: "Le Terminal", type: "video" },
  role: "actor",
  summary: { requested: 2, peopleCreated: 1 },
  results: [
    { PersonneID: 1, name: "Tom Hanks", hadImage: true },
    { PersonneID: 2, name: "Stanley Tucci", hadImage: false },
  ],
};

describe("personneController - import semi-automatique", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importPeopleCredits.mockResolvedValue(importResult);
    runPersonImageSeed.mockResolvedValue({
      summary: { imported: 1 },
      results: [{ PersonneID: 2, name: "Stanley Tucci", status: "imported" }],
    });
  });

  it("crée les liens puis limite la recherche d'images aux personnes traitées", async () => {
    const reply = createReply();
    await bulkLinkPeople({
      user: { userId: 3 },
      body: { type: "video", contenuId: 10, role: "actor", names: "Tom Hanks | Stanley Tucci" },
    }, reply);

    expect(importPeopleCredits).toHaveBeenCalledWith(expect.objectContaining({
      type: "video",
      contentId: 10,
      role: "actor",
      names: "Tom Hanks | Stanley Tucci",
    }));
    expect(createWikimediaClient).toHaveBeenCalledTimes(1);
    expect(runPersonImageSeed).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ personIds: [1, 2], writeReports: false }),
    }));
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      imageSearch: expect.objectContaining({
        status: "completed",
        results: [
          expect.objectContaining({ PersonneID: 1, status: "existing" }),
          expect.objectContaining({ PersonneID: 2, status: "imported" }),
        ],
      }),
    }));
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "person_bulk_link",
      UtilisateurID: 3,
      VideoID: 10,
      Meta: expect.objectContaining({
        role: "actor",
        personIds: [1, 2],
        imageSearchStatus: "completed",
      }),
    }));
  });

  it("conserve les personnes et les liens si Wikimedia est indisponible", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createWikimediaClient.mockImplementationOnce(() => {
      throw new Error("WIKIMEDIA_USER_AGENT absent");
    });
    const reply = createReply();

    await bulkLinkPeople({ user: { userId: 3 }, body: {} }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      summary: importResult.summary,
      imageSearch: expect.objectContaining({ status: "unavailable" }),
    }));
    consoleSpy.mockRestore();
  });
});
