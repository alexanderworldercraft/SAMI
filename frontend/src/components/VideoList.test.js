import { fireEvent, render, screen } from "@testing-library/react";
import api from "../services/api";
import VideoList from "./VideoList";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  }),
  { virtual: true }
);

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("./ContentPreviewTooltip", () => ({ children }) => children);

describe("VideoList - navigation vers la lecture", () => {
  beforeEach(() => {
    api.post.mockReturnValue(new Promise(() => {}));
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
    const { container } = render(
      <VideoList
        videos={[{
          id: 42,
          type: "person",
          Titre: "Tom Hanks",
          CheminImage: null,
          MissingImageLabel: "Photo manquante pour cette personne",
        }]}
      />
    );

    expect(screen.getByRole("img", { name: "Photo manquante pour Tom Hanks" })).toHaveTextContent(
      "Photo manquante pour cette personne"
    );
    expect(container.querySelector('a[href="/personnes/42"]')).toBeInTheDocument();
    expect(screen.getByText("Tom Hanks")).toBeInTheDocument();
  });
});
