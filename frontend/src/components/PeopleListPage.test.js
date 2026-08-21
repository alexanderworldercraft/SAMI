import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PeopleListPage from "./PeopleListPage";
import api from "../services/api";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("./VideoList", () => ({ videos = [], type }) => (
  <div
    data-testid="people-list"
    data-type={type}
    data-card-types={videos.map((person) => person.type).join(",")}
  >
    {videos.map((person) => (
      <div key={person.id} data-person-id={person.id}>
        <span>{person.Titre}</span>
        {person.MissingImageLabel ? <span>{person.MissingImageLabel}</span> : null}
      </div>
    ))}
  </div>
));
jest.mock("./PaginationPage", () => ({ totalItems, itemsPerPage }) => (
  <div data-testid="people-pagination" data-total={totalItems} data-page-size={itemsPerPage} />
));

const people = [
  { PersonneID: 2, Nom: "Zulu", Prenom: "Zoé", Surnom: "Z", CheminImage: "zoe.webp" },
  { PersonneID: 1, Nom: "Alpha", Prenom: "Alice", Surnom: null, CheminImage: null },
];

describe("PeopleListPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: people });
  });

  test("affiche l'annuaire modernisé, trié et paginé à 40 éléments", async () => {
    render(<PeopleListPage />);

    const list = await screen.findByTestId("people-list");
    expect(screen.getByRole("heading", { name: "Personnes" })).toBeInTheDocument();
    expect(screen.getByText("2 personnes")).toBeInTheDocument();
    expect(list).toHaveTextContent("Alice Alpha");
    expect(list).toHaveTextContent("Zoé Zulu");
    expect(list.textContent.indexOf("Alice Alpha")).toBeLessThan(list.textContent.indexOf("Zoé Zulu"));
    expect(list.querySelector('[data-person-id="1"]')).toBeInTheDocument();
    expect(list).toHaveAttribute("data-card-types", "person,person");
    expect(screen.getByText("Photo manquante pour cette personne")).toBeInTheDocument();
    expect(screen.getByTestId("people-pagination")).toHaveAttribute("data-page-size", "40");
  });

  test("transmet le prénom et le nom complets à la recherche", async () => {
    render(<PeopleListPage />);
    await screen.findByTestId("people-list");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Tom Hanks" } });

    expect(screen.getByRole("searchbox")).toHaveAttribute(
      "placeholder",
      "Prénom et nom, ou surnom…"
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith("/people", {
        params: { search: "Tom Hanks" },
      });
    });
  });
});
