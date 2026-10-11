import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import api from "../services/api";
import Video from "./SuperAdminVideoTrashManager";
import Saga from "./SuperAdminSagaTrashManager";
import Universe from "./SuperAdminUniverseTrashManager";
import Person from "./SuperAdminPersonTrashManager";
import Music from "./SuperAdminMusicTrashManager";

jest.mock("../services/api", () => ({ get: jest.fn(), delete: jest.fn() }));
const cases = [
  [Video, {}, "/videos", "VideoID"], [Saga, {}, "/sagas", "SagaID"],
  [Universe, {}, "/universes", "UniverseID"], [Person, {}, "/people", "PersonneID"],
  [Music, { type: "musiques" }, "/music/musiques", "MusiqueID"],
  [Music, { type: "albums" }, "/music/albums", "AlbumID"],
];
beforeEach(() => jest.clearAllMocks());
const setup = async (Component, props, idKey) => {
  let items = [1, 2].map((id) => ({ [idKey]: id, Titre: `Cible ${id}`, Nom: `Cible ${id}` }));
  api.get.mockImplementation(async (url) => ({ data: url === "/users/me" ? { GradeID: 1 } : items }));
  api.delete.mockImplementation(async () => { items = []; return {}; });
  render(<Component {...props} />);
  await screen.findByText("Cible 1");
};
const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Tout supprimer" }));
  await screen.findByRole("dialog");
};
const confirm = () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Oui, tout supprimer" }));
test.each(cases)("suppression confirmée : %s %j", async (Component, props, base, idKey) => {
  await setup(Component, props, idKey);
  await open(); confirm();
  await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
  expect(api.delete.mock.calls).toEqual([[`${base}/1/permanent`], [`${base}/2/permanent`]]);
  await waitFor(() => expect(screen.getByRole("button", { name: "Tout supprimer" })).toBeDisabled());
});
test("le filtre limite la suppression à la liste affichée", async () => {
  await setup(Video, {}, "VideoID");
  fireEvent.change(screen.getByPlaceholderText("Filtrer par titre, série ou ID..."), { target: { value: "Cible 2" } });
  await open(); confirm();
  await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
  expect(api.delete).toHaveBeenCalledWith("/videos/2/permanent");
});
test("une erreur partielle est signalée et la liste est actualisée", async () => {
  await setup(Video, {}, "VideoID");
  api.delete.mockRejectedValueOnce(new Error("Refus serveur"));
  await open(); confirm();
  await screen.findByText(/1 élément\(s\) n’ont pas pu être supprimés/);
  expect(api.delete).toHaveBeenCalledTimes(2);
  expect(api.get).toHaveBeenLastCalledWith("/videos/admin/deleted");
});

test("annuler ferme la confirmation sans suppression", async () => {
  await setup(Video, {}, "VideoID");
  await open();
  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Non, annuler" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api.delete).not.toHaveBeenCalled();
});
