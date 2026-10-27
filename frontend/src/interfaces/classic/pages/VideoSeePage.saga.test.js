import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../../../services/api";
import VideoSeePage from "./VideoSeePage";

let mockId = "1";
let mockLocation = { state: {}, search: "" };
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: mockId }), useNavigate: () => mockNavigate, useLocation: () => mockLocation,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}), { virtual: true });
jest.mock("react-helmet-async", () => ({ Helmet: () => null }));
jest.mock("../../../services/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../players/VideoPlayer", () => () => null);
jest.mock("../components/VideoDetails", () => ({ video, embedded, showCredits }) => <div data-testid="video-details" data-embedded={embedded} data-credits={showCredits}>{video.Titre}</div>);
jest.mock("../components/SerieDetails", () => ({ series, embedded, showCredits }) => <div data-testid="series-details" data-embedded={embedded} data-credits={showCredits}>{series.Titre}</div>);
jest.mock("../components/SeasonList", () => () => null);
jest.mock("../components/EpisodeList", () => () => null);
jest.mock("../components/VideoList", () => ({ videos = [] }) => <div>{videos.map((item) => <p key={item.id}>{item.Titre}</p>)}</div>);
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
const originalScroll = window.scrollTo;

const mockApi = ({ count = 1, currentSeries = null, universes = [], video = {}, contents = [
  { id: 1, type: "video", Titre: "X1", Ordre: 1 }, { id: 2, type: "video", Titre: "X2", Ordre: 2 },
] } = {}) => {
  api.get.mockImplementation(async (url) => {
    if (/^\/videos\/\d+$/.test(url)) return { data: { type: currentSeries ? "series" : "video", series: currentSeries,
      video: { VideoID: Number(mockId), Titre: "En cours", SaisonID: currentSeries ? 1 : null, ...video } } };
    if (url === "/users/me") return { data: { GradeID: 3 } };
    if (url.startsWith("/sagas/content/video/")) return { data: { items: count ? [saga, ...(count > 1 ? [{ SagaID: 8, Titre: "Autre saga" }] : [])] : [], totalItems: count, totalPages: 1 } };
    if (url === "/sagas/7") return { data: { Contents: contents } };
    if (url.startsWith("/universes/content/video/")) return { data: { items: universes } };
    return { data: {} };
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockId = "1";
  mockLocation = { state: {}, search: "" };
  global.fetch = jest.fn(async () => ({ json: async () => [] }));
  window.scrollTo = jest.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
  window.scrollTo = originalScroll;
});

it("relie la saga unique au lecteur et redémarre le contenu choisi à zéro", async () => {
  mockApi();
  const { rerender } = render(<VideoSeePage PlayerComponent={MockPlayer} />);
  fireEvent.click(await screen.findByRole("button", { name: "Continuer vers X2" }));
  expect(mockNavigate).toHaveBeenCalledWith("/lecture/2", { state: { creditNextVideoId: 2 } });
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
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
  const sagaTab = await screen.findByRole("tab", { name: "Sagas" });
  expect(sagaTab).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("La saga");
  expect(screen.queryByRole("button", { name: /Continuer vers/ })).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith("/sagas/7");
});

it.each([72, 74])("réserve le passage dans la saga au dernier épisode de la série : %i", async (videoId) => {
  mockId = String(videoId);
  mockApi({ currentSeries: series, contents: [
    { id: 7, type: "series", Ordre: 1 }, { id: 10, type: "video", Titre: "Film après la série", Ordre: 2 },
  ] });
  render(<VideoSeePage PlayerComponent={MockPlayer} />);
  await screen.findByRole("tab", { name: "Sagas" });
  expect(screen.getByRole("tab", { name: "Épisodes" })).toHaveAttribute("aria-selected", "true");
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

it("affiche les détails du film et les crédits dans des onglets distincts sans anciennes cartes", async () => {
  mockApi({ count: 0, video: { Acteurs: [{ PersonneID: 12, Prenom: "Acteur", Nom: "Film" }] } });
  render(<VideoSeePage PlayerComponent={MockPlayer} />);
  const tab = await screen.findByRole("tab", { name: "Détails" });
  expect(tab).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("tab", { name: "Sagas" })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Univers" })).not.toBeInTheDocument();
  expect(screen.getByTestId("video-details")).toHaveAttribute("data-embedded", "true");
  expect(screen.getByTestId("video-details")).toHaveAttribute("data-credits", "false");
  fireEvent.click(screen.getByRole("tab", { name: "Crédits" }));
  const panel = screen.getByRole("tabpanel");
  expect(panel).toHaveTextContent("Acteur Film");
  expect(panel.querySelector("section")).not.toHaveAttribute("class");
  expect(screen.queryByRole("heading", { name: "Détails de production" })).not.toBeInTheDocument();
});

it("conserve les détails de l'épisode hors des onglets et réserve Crédits à la série", async () => {
  mockId = "71";
  mockApi({ count: 0, currentSeries: { ...series, Acteurs: [{ PersonneID: 21, Prenom: "Acteur", Nom: "Série" }] },
    video: { Acteurs: [{ PersonneID: 22, Prenom: "Acteur", Nom: "Épisode" }] } });
  render(<VideoSeePage PlayerComponent={MockPlayer} />);
  fireEvent.click(await screen.findByRole("button", { name: "Afficher les détails" }));
  const details = screen.getByTestId("video-details");
  expect(details.closest('[role="tabpanel"]')).toBeNull();
  expect(details).toHaveAttribute("data-embedded", "false");
  expect(details).toHaveAttribute("data-credits", "true");
  fireEvent.click(screen.getByRole("tab", { name: "Crédits" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Acteur Série");
  expect(screen.getByRole("tabpanel")).not.toHaveTextContent("Acteur Épisode");
  fireEvent.click(screen.getByRole("tab", { name: "Série" }));
  expect(screen.getByTestId("series-details")).toHaveAttribute("data-embedded", "true");
  expect(screen.getByTestId("series-details")).toHaveAttribute("data-credits", "false");
});

it("regroupe les univers dans leur onglet dédié", async () => {
  mockApi({ count: 0, universes: [{ UniverseID: 4, Titre: "Univers de test" }] });
  render(<VideoSeePage PlayerComponent={MockPlayer} />);
  fireEvent.click(await screen.findByRole("tab", { name: "Univers" }));
  const universeLink = screen.getByRole("link", { name: "Voir l'univers Univers de test" });
  expect(screen.getByRole("tabpanel")).toContainElement(universeLink);
  expect(universeLink).toHaveAttribute("href", "/sagas#universe-4");
  expect(screen.queryByRole("heading", { name: "Ce contenu appartient à" })).not.toBeInTheDocument();
});

it("réapplique l'onglet par défaut à l'ouverture d'un autre film", async () => {
  mockApi({ count: 0 });
  const { rerender } = render(<VideoSeePage PlayerComponent={MockPlayer} />);
  fireEvent.click(await screen.findByRole("tab", { name: "Crédits" }));
  mockId = "2";
  mockApi();
  rerender(<VideoSeePage PlayerComponent={MockPlayer} />);
  await waitFor(() => expect(screen.getByTestId("player")).toHaveAttribute("data-video-id", "2"));
  await waitFor(() => expect(screen.getByRole("tab", { name: "Sagas" })).toHaveAttribute("aria-selected", "true"));
});
