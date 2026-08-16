import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PeopleCreditImportManager from "./PeopleCreditImportManager";
import api from "../services/api";

jest.mock("../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

describe("PeopleCreditImportManager", () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.get.mockImplementation((url) => {
      if (url === "/videos/admin") {
        return Promise.resolve({
          data: [{
            VideoID: 10,
            Titre: "Le Terminal",
            SaisonID: null,
            CreateDate: "2026-08-16T10:00:00.000Z",
          }],
        });
      }
      if (url === "/series") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });
  });

  test("envoie le contenu, le rôle et la liste puis affiche le bilan", async () => {
    api.post.mockResolvedValue({
      data: {
        summary: {
          requested: 2,
          peopleCreated: 1,
          linksCreated: 2,
          linksUpdated: 0,
        },
        results: [
          { PersonneID: 1, name: "Tom Hanks", personStatus: "existing", linkStatus: "created" },
          { PersonneID: 2, name: "Stanley Tucci", personStatus: "created", linkStatus: "created" },
        ],
        imageSearch: {
          status: "completed",
          results: [
            { PersonneID: 1, name: "Tom Hanks", status: "existing" },
            { PersonneID: 2, name: "Stanley Tucci", status: "imported" },
          ],
        },
      },
    });

    render(<PeopleCreditImportManager />);

    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Choisir un film ou une série..." }));
    fireEvent.click(await screen.findByText("Le Terminal"));
    fireEvent.click(screen.getByRole("button", { name: "Réalisateurs" }));
    fireEvent.change(screen.getByLabelText("Liste des personnes"), {
      target: { value: "Tom Hanks | Stanley Tucci" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier, créer et lier" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/people/bulk-link", {
        type: "video",
        contenuId: 10,
        role: "director",
        names: "Tom Hanks | Stanley Tucci",
      });
    });
    expect(await screen.findByText("Bilan de l'import")).toBeInTheDocument();
    expect(screen.getByText("Photo ajoutée")).toBeInTheDocument();
    expect(screen.getByText("Photo déjà présente")).toBeInTheDocument();
  });
});
