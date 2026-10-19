import { fireEvent, render, screen } from "@testing-library/react";
import api from "../../../services/api";
import VideoList from "./VideoList";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  }),
  { virtual: true }
);

jest.mock("../../../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("../../../components/ContentPreviewTooltip", () => ({ children }) => children);

describe("VideoList - navigation vers la lecture", () => {
  beforeEach(() => {
    api.post.mockReturnValue(new Promise(() => {}));
  });

  test("le repère du contenu actuel distingue les films et les séries ayant le même identifiant", () => {
    const { container } = render(<VideoList videos={[
      { id: 20, type: "video", Titre: "Film", Genres: [] },
      { id: 20, type: "series", Titre: "Série", FirstVideoID: 201, Genres: [] },
    ]} currentContent={{ id: "20", type: "video" }} />);
    expect(screen.getAllByText("Contenu actuel")).toHaveLength(1);
    expect(container.querySelector('a[aria-current="true"]')).toHaveAttribute("href", "/lecture/20");
  });

  test("ajoute l'ancre et signale le clic sur un contenu", () => {
    const onContentClick = jest.fn();
    const video = {
      id: 24,
      type: "video",
      Titre: "Film proposé",
      Genres: [],
    };

    const { container } = render(
      <VideoList
        videos={[video]}
        linkAnchor="#lecture-top"
        onContentClick={onContentClick}
      />
    );

    const link = container.querySelector('a[href="/lecture/24#lecture-top"]');
    expect(link).toBeInTheDocument();

    fireEvent.click(link);
    expect(onContentClick).toHaveBeenCalledWith(video);
  });

  test("affiche un cadre explicite lorsqu'une carte personne n'a pas de photo", () => {
    const onPersonClick = jest.fn();
    const person = {
      id: 42,
      type: "person",
      Titre: "Tom Hanks",
      CheminImage: null,
      MissingImageLabel: "Photo manquante pour cette personne",
    };
    const { container } = render(
      <VideoList
        videos={[person]}
        onPersonClick={onPersonClick}
      />
    );

    expect(screen.getByRole("img", { name: "Photo manquante pour Tom Hanks" })).toHaveTextContent(
      "Photo manquante pour cette personne"
    );
    const link = container.querySelector('a[href="/personnes/42"]');
    expect(link).toBeInTheDocument();
    expect(screen.getByText("Tom Hanks")).toBeInTheDocument();

    fireEvent.click(link);
    expect(onPersonClick).toHaveBeenCalledWith(person);
  });

  test("affiche tous les personnages sur un dégradé en bas de la photo", () => {
    render(<VideoList videos={[{ type: "person", id: 7, Titre: "Eddie Murphy", CheminImage: "photo.jpg", Personnages: ["Akeem", "Clarence", "Randy"] }]} />);
    const caption = screen.getByText("Akeem, Clarence, Randy");
    expect(caption.parentElement).toHaveClass("absolute", "bottom-0", "min-h-[30%]", "text-white");
    expect(caption).not.toHaveClass("line-clamp-2");
  });

  test("masque un bouton non favori au repos et conserve un favori visible", () => {
    render(
      <VideoList
        videos={[
          {
            id: 10,
            type: "video",
            Titre: "Film non favori",
            Genres: [],
            IsFavorite: false,
          },
          {
            id: 11,
            type: "video",
            Titre: "Film favori",
            Genres: [],
            IsFavorite: true,
          },
        ]}
      />
    );

    expect(screen.getByTitle("Ajouter aux favoris")).toHaveClass(
      "opacity-0",
      "pointer-events-none",
      "group-hover:opacity-100",
      "group-focus-within:opacity-100"
    );
    expect(screen.getByTitle("Retirer des favoris")).toHaveClass("opacity-100");
    expect(screen.getByTitle("Retirer des favoris")).not.toHaveClass("opacity-0");
  });
});
