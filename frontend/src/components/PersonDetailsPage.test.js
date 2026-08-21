import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PersonDetailsPage from "./PersonDetailsPage";
import api from "../services/api";

jest.mock("react-helmet-async", () => ({
  Helmet: ({ children }) => <div data-testid="person-metadata">{children}</div>,
}));

jest.mock(
  "react-router-dom",
  () => ({ useParams: () => ({ id: "7" }) }),
  { virtual: true }
);
jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), delete: jest.fn(), put: jest.fn() },
}));
jest.mock("./VideoList", () => ({ videos = [], linkAnchor, onContentClick, overlayActions }) => (
  <div
    data-testid="person-content-list"
    data-link-anchor={linkAnchor}
    data-content-scroll={typeof onContentClick === "function"}
  >
    {videos.map((item) => (
      <div key={`${item.type}-${item.id}`}>
        <span>{item.Titre}</span>
        {overlayActions?.(item)}
      </div>
    ))}
  </div>
));
jest.mock("./PersonLinkContentForm", () => ({ personId }) => (
  <div data-testid="person-link-form">Personne {personId}</div>
));
jest.mock("./ImageUploader", () => () => null);
jest.mock("./Notification", () => ({ message, type }) => (
  <div role="status" data-type={type}>{message}</div>
));

const personDetails = {
  personne: {
    PersonneID: 7,
    Prenom: "Tom",
    Nom: "Hanks",
    Surnom: null,
    CheminImage: null,
    CreateDate: "2026-08-21T00:00:00.000Z",
  },
  videos: {
    Realisateur: [{ VideoID: 1, Titre: "Film réalisé" }],
    Acteur: [{ VideoID: 2, Titre: "Film joué" }],
  },
  series: {
    Realisateur: [{ SeriesID: 3, Titre: "Série réalisée", FirstVideoID: 31 }],
    Acteur: [{ SeriesID: 4, Titre: "Série jouée", FirstVideoID: 41 }],
  },
};

const mockRequests = (user = null) => {
  api.get.mockImplementation((url) => {
    if (url === "/users/me") return Promise.resolve({ data: user });
    return Promise.resolve({ data: personDetails });
  });
};

describe("PersonDetailsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequests();
  });

  test("regroupe films et séries par réalisation et distribution en conservant le retour en haut", async () => {
    render(<PersonDetailsPage />);

    const lists = await screen.findAllByTestId("person-content-list");
    expect(lists).toHaveLength(2);
    expect(lists[0]).toHaveTextContent("Film réalisé");
    expect(lists[0]).toHaveTextContent("Série réalisée");
    expect(lists[1]).toHaveTextContent("Film joué");
    expect(lists[1]).toHaveTextContent("Série jouée");
    lists.forEach((list) => {
      expect(list).toHaveAttribute("data-link-anchor", "#lecture-top");
      expect(list).toHaveAttribute("data-content-scroll", "true");
    });
    expect(screen.getByTestId("person-metadata")).toHaveTextContent("Tom Hanks - SAMI");
  });

  test("garde le formulaire de liaison fermé par défaut pour un administrateur", async () => {
    mockRequests({ GradeID: 1 });
    render(<PersonDetailsPage />);

    const toggle = await screen.findByRole("button", { name: /lier un contenu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("person-link-form")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("person-link-form")).toHaveTextContent("Personne 7");
  });

  test("demande confirmation avant un retrait puis affiche le résultat", async () => {
    mockRequests({ GradeID: 2 });
    api.delete.mockResolvedValue({ data: { success: true } });
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    render(<PersonDetailsPage />);

    const removeButton = await screen.findByRole("button", {
      name: "Retirer Film réalisé de la réalisation",
    });
    fireEvent.click(removeButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      "Retirer « Film réalisé » de la section réalisation de Tom Hanks ?"
    );
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/people/7/unlink", {
        data: {
          type: "video",
          contenuId: 1,
          EstActeur: false,
          EstRealisateur: true,
        },
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "« Film réalisé » a été retiré de la section réalisation."
    );
    expect(
      screen.queryByRole("button", { name: "Retirer Film réalisé de la réalisation" })
    ).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
