import { fireEvent, render, screen } from "@testing-library/react";

import SerieDetails from "./SerieDetails";
import VideoDetails from "./VideoDetails";
import api from "../services/api";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children }) => children,
  }),
  { virtual: true }
);
jest.mock("../services/api", () => ({
  get: jest.fn(),
  put: jest.fn(),
}));
jest.mock("./FavoriteButton", () => () => null);
jest.mock("./GenreList", () => () => null);
jest.mock("./ImageUploader", () => () => null);
jest.mock("./VideoList", () => ({ videos = [], onPersonClick }) => (
  <div data-testid="credit-video-list" data-person-scroll={typeof onPersonClick === "function"}>
    {videos.map((item) => (
      <div key={item.id}>
        <span>{item.Titre}</span>
        {item.MissingImageLabel && <span>{item.MissingImageLabel}</span>}
      </div>
    ))}
  </div>
));

const createContent = (overrides = {}) => ({
  Titre: "Titre de test",
  Resumer: "Résumé de test",
  Premium: false,
  CheminImage: null,
  Realisateurs: [],
  Acteurs: [],
  ...overrides,
});

describe("champs d'édition des détails de contenu", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.get.mockResolvedValue({ data: { GradeID: 1 } });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("modernise les champs du film", async () => {
    render(<VideoDetails video={createContent({ VideoID: 12 })} />);

    fireEvent.click(await screen.findByTitle("Modifier le titre"));
    const titleInput = screen.getByLabelText("Titre du film");

    expect(titleInput).toHaveClass(
      "rounded-xl",
      "border-sky-500/20",
      "dark:bg-slate-950/65"
    );

    fireEvent.click(screen.getByTitle("Modifier le résumé"));
    expect(screen.getByLabelText("Résumé")).toHaveClass(
      "min-h-36",
      "resize-y",
      "focus:ring-2"
    );
  });

  test("modernise les champs de la série", async () => {
    render(<SerieDetails series={createContent({ SeriesID: 34 })} />);

    fireEvent.click(await screen.findByTitle("Modifier le titre"));
    const titleInput = screen.getByLabelText("Titre de la série");

    expect(titleInput).toHaveClass(
      "rounded-xl",
      "border-sky-500/20",
      "dark:bg-slate-950/65"
    );

    fireEvent.click(screen.getByTitle("Modifier le résumé"));
    expect(screen.getByLabelText("Résumé")).toHaveClass(
      "min-h-36",
      "resize-y",
      "focus:ring-2"
    );
  });

  test("conserve les acteurs et réalisateurs sans photo dans les crédits du film", () => {
    render(<VideoDetails video={createContent({
      VideoID: 12,
      Realisateurs: [{ PersonneID: 1, Prenom: "Steven", Nom: "Spielberg", CheminImage: null }],
      Acteurs: [{ PersonneID: 2, Prenom: "Tom", Nom: "Hanks", CheminImage: null }],
    })} />);

    expect(screen.getByText("Steven Spielberg")).toBeInTheDocument();
    expect(screen.getByText("Tom Hanks")).toBeInTheDocument();
    expect(screen.getAllByText("Photo manquante pour cette personne")).toHaveLength(2);
    screen.getAllByTestId("credit-video-list").forEach((list) => {
      expect(list).toHaveAttribute("data-person-scroll", "true");
    });
  });

  test("conserve aussi les personnes sans photo dans les crédits de la série", () => {
    render(<SerieDetails series={createContent({
      SeriesID: 34,
      Realisateurs: [],
      Acteurs: [{ PersonneID: 3, Prenom: "Catherine", Nom: "Zeta-Jones", CheminImage: null }],
    })} />);

    expect(screen.getByText("Catherine Zeta-Jones")).toBeInTheDocument();
    expect(screen.getByText("Photo manquante pour cette personne")).toBeInTheDocument();
    expect(screen.getByTestId("credit-video-list")).toHaveAttribute("data-person-scroll", "true");
  });
});
