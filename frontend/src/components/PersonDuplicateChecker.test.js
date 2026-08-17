import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PersonDuplicateChecker from "./PersonDuplicateChecker";
import api from "../services/api";

jest.mock("../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
}));

const duplicateResult = {
  scannedPeople: 2,
  newCount: 1,
  doubtCount: 0,
  pairs: [{
    key: "1:2",
    status: "new",
    score: 90,
    firstNameScore: 80,
    lastNameScore: 100,
    commonContentCount: 2,
    commonVideoCount: 1,
    commonSeriesCount: 1,
    personA: {
      PersonneID: 1,
      Prenom: "Yuki",
      Nom: "Belge",
      Surnom: null,
      CheminImage: null,
      videoLinks: 2,
      seriesLinks: 1,
    },
    personB: {
      PersonneID: 2,
      Prenom: "Yuūki",
      Nom: "Belge",
      Surnom: null,
      CheminImage: null,
      videoLinks: 1,
      seriesLinks: 0,
    },
  }],
};

describe("PersonDuplicateChecker", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    api.get.mockImplementation((url) => {
      if (url === "/users/me") return Promise.resolve({ data: { GradeID: 1 } });
      if (url === "/people/admin/duplicates") return Promise.resolve({ data: duplicateResult });
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });
    api.post.mockResolvedValue({ data: { ok: true } });
    api.put.mockResolvedValue({ data: { ok: true } });
    jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    window.confirm.mockRestore();
  });

  test("affiche les ressemblances et fusionne vers la fiche choisie", async () => {
    const onPeopleChanged = jest.fn().mockResolvedValue();
    render(<PersonDuplicateChecker onPeopleChanged={onPeopleChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));

    expect(await screen.findByText("Yuki Belge")).toBeInTheDocument();
    expect(screen.getByText("Yuūki Belge")).toBeInTheDocument();
    expect(screen.getByText("Similarité 90%")).toBeInTheDocument();
    expect(screen.getByText("En commun : 1 film/vidéo · 1 série")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Conserver Yuki Belge (#1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Fusionner" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/people/admin/duplicates/merge",
      { keepPersonId: 1, mergePersonId: 2 },
    ));
    await waitFor(() => expect(onPeopleChanged).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Fusion terminée. La fiche #1 a été conservée.")).toBeInTheDocument();
  });

  test("conserve un dossier en doute puis permet de le déclarer différent", async () => {
    render(<PersonDuplicateChecker />);
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));

    fireEvent.click(await screen.findByRole("button", { name: "Doute" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/people/admin/duplicates/review",
      { personAId: 1, personBId: 2, decision: "doubt" },
    ));
    expect(await screen.findByText("Doutes à revoir (1)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Personnes bien différentes" }));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith(
      "/people/admin/duplicates/review",
      { personAId: 1, personBId: 2, decision: "distinct" },
    ));
    expect(await screen.findByText("Les deux personnes ont été marquées comme différentes.")).toBeInTheDocument();
    expect(screen.queryByText("Yuki Belge")).not.toBeInTheDocument();
  });

  test("cache les décisions pour un administrateur non super-admin", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/users/me") return Promise.resolve({ data: { GradeID: 2 } });
      if (url === "/people/admin/duplicates") return Promise.resolve({ data: duplicateResult });
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });
    render(<PersonDuplicateChecker />);
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));

    expect(await screen.findByText(/réservées au super-administrateur/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fusionner" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Doute" })).not.toBeInTheDocument();
  });
});
