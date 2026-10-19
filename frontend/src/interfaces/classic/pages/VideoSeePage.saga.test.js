import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../../../services/api";
import VideoSeePage from "./VideoSeePage";

let mockId = "1";
let mockLocation = { state: {}, search: "" };
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: mockId }), useNavigate: () => mockNavigate, useLocation: () => mockLocation,
}), { virtual: true });
jest.mock("react-helmet-async", () => ({ Helmet: () => null }));
jest.mock("../../../services/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../players/VideoPlayer", () => () => null);
jest.mock("../components/VideoDetails", () => () => null);
jest.mock("../components/SerieDetails", () => () => null);
jest.mock("../components/SeasonList", () => () => null);
jest.mock("../components/EpisodeList", () => () => null);
jest.mock("../components/VideoList", () => () => null);
jest.mock("../../../components/Notification", () => () => null);
jest.mock("../../../components/SeriesAndSeasonSelector", () => () => null);
jest.mock("../../../components/VideoExportDrawer", () => () => null);
jest.mock("../components/ResumePlaybackDialog", () => () => null);

const MockPlayer = ({ video, nextSagaContent, onNextSagaContent, nextEpisode, initialPlaybackTime, autoPlayOnLoad }) => (
  <div data-testid="player" data-video-id={video.VideoID} data-initial-time={initialPlaybackTime ?? ""} data-autoplay={autoPlayOnLoad}>
    {nextSagaContent && <button onClick={onNextSagaContent}>Continuer vers {nextSagaContent.Titre}</button>}
    {nextEpisode && <span>Épisode suivant : {nextEpisode.VideoID}</span>}
  </div>
);
const saga = { SagaID: 7, Titre: "La saga" };
const series = { SeriesID: 7, Titre: "La série", Saisons: [
  { Numero: 1, Episodes: [{ VideoID: 71 }, { VideoID: 72 }] },
  { Numero: 2, Episodes: [{ VideoID: 73 }, { VideoID: 74 }] },
] };
const originalFetch = global.fetch;
const originalScroll = Element.prototype.scrollIntoView;

const mockApi = ({ count = 1, currentSeries = null, contents = [
  { id: 1, type: "video", Titre: "X1", Ordre: 1 }, { id: 2, type: "video", Titre: "X2", Ordre: 2 },
] } = {}) => {
  api.get.mockImplementation(async (url) => {
    if (/^\/videos\/\d+$/.test(url)) return { data: { type: currentSeries ? "series" : "video", series: currentSeries,
      video: { VideoID: Number(mockId), Titre: "En cours", SaisonID: currentSeries ? 1 : null } } };
    if (url === "/users/me") return { data: { GradeID: 3 } };
    if (url.startsWith("/sagas/content/video/")) return { data: { items: count ? [saga, ...(count > 1 ? [{ SagaID: 8, Titre: "Autre saga" }] : [])] : [], totalItems: count, totalPages: 1 } };
    if (url === "/sagas/7") return { data: { Contents: contents } };
    return { data: {} };
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockId = "1";
  mockLocation = { state: {}, search: "" };
  global.fetch = jest.fn(async () => ({ json: async () => [] }));
  Element.prototype.scrollIntoView = jest.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
  Element.prototype.scrollIntoView = originalScroll;
});

it("relie la saga unique au lecteur et redémarre le contenu choisi à zéro", async () => {
  mockApi();
  const { rerender } = render(<VideoSeePage PlayerComponent={MockPlayer} />);
  fireEvent.click(await screen.findByRole("button", { name: "Continuer vers X2" }));
  expect(mockNavigate).toHaveBeenCalledWith("/lecture/2", { state: { creditNextVideoId: 2 } });
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  mockId = "2";
  mockLocation = { state: { creditNextVideoId: 2 }, search: "" };
  rerender(<VideoSeePage PlayerComponent={MockPlayer} />);
  await waitFor(() => expect(screen.getByTestId("player")).toHaveAttribute("data-video-id", "2"));
  expect(screen.getByTestId("player")).toHaveAttribute("data-initial-time", "0");
  expect(screen.getByTestId("player")).toHaveAttribute("data-autoplay", "true");
  expect(screen.queryByRole("button", { name: /Continuer vers/ })).not.toBeInTheDocument();
});

it("ne propose pas de passage automatique lorsqu’il y a plusieurs sagas", async () => {
  mockApi({ count: 2 });
  render(<VideoSeePage PlayerComponent={MockPlayer} />);
  await screen.findByRole("heading", { name: "Ce contenu fait partie de" });
  expect(screen.queryByRole("button", { name: /Continuer vers/ })).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith("/sagas/7");
});

it.each([72, 74])("réserve le passage dans la saga au dernier épisode de la série : %i", async (videoId) => {
  mockId = String(videoId);
  mockApi({ currentSeries: series, contents: [
    { id: 7, type: "series", Ordre: 1 }, { id: 10, type: "video", Titre: "Film après la série", Ordre: 2 },
  ] });
  render(<VideoSeePage PlayerComponent={MockPlayer} />);
  await screen.findByRole("heading", { name: "La saga" });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/sagas/7"));
  if (videoId === 74) {
    fireEvent.click(await screen.findByRole("button", { name: "Continuer vers Film après la série" }));
    expect(mockNavigate).toHaveBeenCalledWith("/lecture/10", { state: { creditNextVideoId: 10 } });
    expect(screen.queryByText(/Épisode suivant :/)).not.toBeInTheDocument();
  } else {
    expect(await screen.findByText("Épisode suivant : 73")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continuer vers/ })).not.toBeInTheDocument();
  }
});
