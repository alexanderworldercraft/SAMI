import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../../../services/api";
import SingleSagaSection from "./SingleSagaSection";

jest.mock("react-router-dom", () => ({
  Link: ({ children, to, onClick, ...props }) => <a href={to} {...props} onClick={(event) => {
    event.preventDefault();
    onClick?.(event);
  }}>{children}</a>,
}), { virtual: true });
jest.mock("../../../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../../components/ContentPreviewTooltip", () => ({ children }) => children);

const saga = { SagaID: 7, Titre: "La saga" };
const contents = [
  { id: 30, type: "video", Titre: "Troisième film", Ordre: 3 },
  { id: 10, type: "video", Titre: "Premier film", Ordre: 1 },
  { id: 20, type: "series", Titre: "Série intermédiaire", Ordre: 2, FirstVideoID: 201, Saisons: 1 },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.post.mockReturnValue(new Promise(() => {}));
  api.get.mockResolvedValue({ data: { Contents: contents } });
});

it("affiche directement les contenus dans l’ordre de la saga et ombre l’affiche du film actuel", async () => {
  const onContentsLoaded = jest.fn();
  const { container } = render(<SingleSagaSection saga={saga} videoId={30} linkAnchor="#lecture-top" onContentsLoaded={onContentsLoaded} />);
  expect(await screen.findByText("Contenu actuel")).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/sagas/7");
  expect(onContentsLoaded).toHaveBeenLastCalledWith({ videoId: 30, sagaId: 7, contents });
  expect(screen.getAllByRole("img").map((image) => image.alt)).toEqual(["Premier film", "Série intermédiaire", "Troisième film"]);
  const current = container.querySelector('a[aria-current="true"]');
  expect(current).toHaveAttribute("href", "/lecture/30#lecture-top");
  expect(current).toHaveTextContent("Contenu actuel");
  expect(screen.getByText("Contenu actuel").parentElement).toHaveClass("bg-slate-950/65", "pointer-events-none");
  expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
});

it("marque la série dont l’épisode est en lecture", async () => {
  const { container } = render(<SingleSagaSection saga={saga} videoId="205" seriesId="20" />);
  await screen.findByText("Contenu actuel");
  expect(container.querySelector('a[aria-current="true"]')).toHaveTextContent("Série intermédiaire");
});

it("privilégie l’épisode directement lié à la saga lorsqu’il figure aussi à côté de sa série", async () => {
  api.get.mockResolvedValue({ data: { Contents: [...contents, { id: 205, type: "video", Titre: "Épisode spécial", Ordre: 4 }] } });
  const { container } = render(<SingleSagaSection saga={saga} videoId={205} seriesId={20} />);
  await screen.findByText("Contenu actuel");
  expect(container.querySelector('a[aria-current="true"]')).toHaveTextContent("Épisode spécial");
  expect(screen.getAllByText("Contenu actuel")).toHaveLength(1);
});

it("conserve le lien et le retour vers le lecteur lors du choix d’un autre contenu", async () => {
  const onContentClick = jest.fn();
  const { container } = render(<SingleSagaSection saga={saga} videoId={30} linkAnchor="#lecture-top" onContentClick={onContentClick} />);
  await screen.findByText("Contenu actuel");
  const first = container.querySelector('a[href="/lecture/10#lecture-top"]');
  fireEvent.click(first);
  expect(onContentClick).toHaveBeenCalledWith(contents[1]);
});

it("permet de réessayer après un échec de chargement", async () => {
  api.get.mockRejectedValueOnce(new Error("indisponible"));
  render(<SingleSagaSection saga={saga} videoId={30} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(await screen.findByText("Contenu actuel")).toBeInTheDocument();
});

it("ignore une réponse tardive de la saga précédente", async () => {
  let resolveFirst;
  api.get.mockImplementation((url) => url === "/sagas/7" ? new Promise((resolve) => { resolveFirst = resolve; })
    : Promise.resolve({ data: { Contents: [{ id: 60, type: "video", Titre: "Autre film", Ordre: 1 }] } }));
  const { rerender } = render(<SingleSagaSection saga={saga} videoId={30} />);
  rerender(<SingleSagaSection saga={{ SagaID: 8, Titre: "Autre saga" }} videoId={60} />);
  await screen.findByText("Autre film");
  resolveFirst({ data: { Contents: contents } });
  await waitFor(() => expect(screen.queryByText("Troisième film")).not.toBeInTheDocument());
  expect(screen.getByText("Autre film")).toBeInTheDocument();
});
