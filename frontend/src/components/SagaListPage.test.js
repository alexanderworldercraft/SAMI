import { render, screen, waitFor } from "@testing-library/react";

import api from "../services/api";
import SagaListPage from "./SagaListPage";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock("./PaginationPage", () => () => <div data-testid="pagination" />);
jest.mock("./VideoList", () => ({ videos = [] }) => (
  <div data-testid="video-list">
    {videos.map((item) => (
      <span key={`${item.type}-${item.id}`}>{`${item.type}:${item.Titre}`}</span>
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
});
