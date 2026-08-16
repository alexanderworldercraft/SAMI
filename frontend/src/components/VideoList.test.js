import { fireEvent, render } from "@testing-library/react";
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
});
