import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import api from "../services/api";
import SagaListPage from "./SagaListPage";
import { scrollToPageTop } from "../utils/scrollToPageTop";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock("./PaginationPage", () => () => <div data-testid="pagination" />);
jest.mock("../utils/scrollToPageTop", () => ({ scrollToPageTop: jest.fn() }));
jest.mock("./VideoList", () => ({ videos = [], onItemClick, linkAnchor, onContentClick }) => (
  <div
    data-testid="video-list"
    data-link-anchor={linkAnchor}
    data-content-scroll={typeof onContentClick === "function"}
  >
    {videos.map((item) => (
      <button
        key={`${item.type}-${item.id}`}
        type="button"
        onClick={() => item.type === "saga" ? onItemClick?.(item) : onContentClick?.(item)}
      >
        {`${item.type}:${item.Titre}`}
      </button>
    ))}
  </div>
));

describe("SagaListPage - univers mixtes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("affiche sagas, films et séries dans la même grille ordonnée", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [{
          UniverseID: 12,
          Titre: "Star Wars",
          Items: [
            { id: 1, type: "saga", Titre: "Prélogie", Ordre: 1 },
            { id: 42, type: "video", Titre: "Rogue One", Ordre: 2 },
            { id: 6, type: "series", Titre: "The Mandalorian", Ordre: 3 },
          ],
          Sagas: [{ id: 1, type: "saga", Titre: "Ancienne réponse" }],
        }],
      },
    });

    render(<SagaListPage />);

    await waitFor(() => {
      expect(screen.getByText("saga:Prélogie")).toBeInTheDocument();
    });
    expect(screen.getByText("video:Rogue One")).toBeInTheDocument();
    expect(screen.getByText("series:The Mandalorian")).toBeInTheDocument();
    expect(screen.queryByText("saga:Ancienne réponse")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Star Wars" })).toHaveAttribute("id", "universe-12");
  });

  test("fait défiler la page vers l'univers demandé par le lien", async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    window.requestAnimationFrame = jest.fn((callback) => {
      callback();
      return 1;
    });
    window.cancelAnimationFrame = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();
    window.location.hash = "#universe-12";
    api.get.mockResolvedValue({
      data: {
        items: [{
          UniverseID: 12,
          Titre: "Star Wars",
          Items: [{ id: 42, type: "video", Titre: "Rogue One", Ordre: 1 }],
        }],
      },
    });

    render(<SagaListPage />);

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    });

    window.location.hash = "";
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  test("ferme le modal et remonte en haut après le choix d'un film ou d'une série", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/sagas/1") {
        return Promise.resolve({
          data: {
            Contents: [
              { id: 42, type: "video", Titre: "Rogue One" },
              { id: 6, type: "series", Titre: "The Mandalorian", FirstVideoID: 61 },
            ],
          },
        });
      }

      return Promise.resolve({
        data: {
          items: [{
            UniverseID: 12,
            Titre: "Star Wars",
            Items: [{ id: 1, SagaID: 1, type: "saga", Titre: "Prélogie" }],
          }],
        },
      });
    });

    render(<SagaListPage />);
    fireEvent.click(await screen.findByRole("button", { name: "saga:Prélogie" }));

    const filmButton = await screen.findByRole("button", { name: "video:Rogue One" });
    const modalList = filmButton.closest('[data-testid="video-list"]');
    expect(modalList).toHaveAttribute("data-link-anchor", "#lecture-top");
    expect(modalList).toHaveAttribute("data-content-scroll", "true");

    fireEvent.click(filmButton);

    expect(scrollToPageTop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "video:Rogue One" })).not.toBeInTheDocument();
  });
});
