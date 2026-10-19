import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminVideoManager from "./AdminVideoManager";
import AdminSeriesManager from "./AdminSeriesManager";
import SeriesManager from "./SeriesManager";
import api from "../services/api";

jest.mock("../services/api", () => ({ get: jest.fn(), put: jest.fn(), post: jest.fn() }));
jest.mock("./GenreList", () => () => null);
jest.mock("./ImageUploader", () => () => null);
jest.mock("./Notification", () => ({ message }) => <p>{message}</p>);
jest.mock("@headlessui/react", () => {
  const React = require("react");
  const Selection = React.createContext(null);
  return {
    Listbox: ({ onChange, children }) => <Selection.Provider value={onChange}>{children}</Selection.Provider>,
    ListboxButton: ({ children }) => <button type="button">{children}</button>,
    ListboxOptions: ({ children }) => <div>{children}</div>,
    ListboxOption: ({ value, children }) => {
      const choose = React.useContext(Selection);
      return <button type="button" onClick={() => choose(value)}>{typeof children === "function" ? children({ selected: false }) : children}</button>;
    },
  };
});

beforeEach(() => jest.resetAllMocks());

describe.each([
  ["vidéo", AdminVideoManager, "videos", "VideoID"],
  ["série", AdminSeriesManager, "series", "SeriesID"],
])("administration %s", (_label, Component, resource, idKey) => {
  test.each(["Mégalodon | En eau trouble", ""])("charge, sauvegarde et recharge les titres alternatifs : %s", async (nextTitles) => {
    let storedTitles = "Ancien alias";
    const item = () => ({ [idKey]: 42, Titre: "The Meg", TitreAlternatif: storedTitles, Resumer: "", Premium: false, CheminImage: "", Saisons: [], Genres: [] });
    api.get.mockImplementation(async (url) => {
      if (url === "/genres" || url.endsWith("/genres")) return { data: [] };
      if (url === "/videos/admin" || url === "/series") return { data: [item()] };
      return { data: resource === "videos" ? { video: item() } : item() };
    });
    api.put.mockImplementation(async (_url, data) => {
      storedTitles = data.TitreAlternatif;
      return { data: item() };
    });
    render(<Component />);
    fireEvent.click(await screen.findByRole("button", { name: /^The Meg/ }));
    const field = await screen.findByLabelText("Titres alternatifs (facultatif)");
    await waitFor(() => expect(field).toHaveValue("Ancien alias"));
    fireEvent.change(field, { target: { value: nextTitles } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    });
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(`/${resource}/42/alternative-titles`, { TitreAlternatif: nextTitles }));
    expect(api.put).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText("Titres alternatifs (facultatif)")).toHaveValue(nextTitles));
  });
});

test("la création d'une série transmet les titres alternatifs puis vide le champ", async () => {
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({ status: 201, data: {} });
  const { container } = render(<SeriesManager />);
  fireEvent.change(container.querySelector('input[type="text"]'), { target: { value: "The Meg" } });
  fireEvent.change(screen.getByLabelText("Titres alternatifs (facultatif)"), { target: { value: "Mégalodon | En eau trouble" } });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter la série" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/series", expect.any(FormData)));
  expect(api.post.mock.calls[0][1].get("TitreAlternatif")).toBe("Mégalodon | En eau trouble");
  await waitFor(() => expect(screen.getByLabelText("Titres alternatifs (facultatif)")).toHaveValue(""));
});
