import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import PlaybackContentTabs from "./PlaybackContentTabs";

const content = {
  details: <input aria-label="Titre du film" defaultValue="Film" />,
  episodes: <p>Liste des épisodes</p>,
  series: <p>Détails de la série</p>,
  credits: <p>Distribution</p>,
};

it("affiche les détails du film par défaut et masque les onglets sans association", () => {
  render(<PlaybackContentTabs {...content} />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Détails", "Crédits"]);
  expect(screen.getByRole("tab", { name: "Détails" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toContainElement(screen.getByLabelText("Titre du film"));
});

it("sélectionne Sagas à l'arrivée des associations du film et respecte ensuite le choix de l'utilisateur", () => {
  const { rerender } = render(<PlaybackContentTabs {...content} />);
  rerender(<PlaybackContentTabs {...content} sagas={<p>Films de la saga</p>} />);
  expect(screen.getByRole("tab", { name: "Sagas" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: "Crédits" }));
  rerender(<PlaybackContentTabs {...content} sagas={<p>Films de la saga</p>} universes={<p>Univers du film</p>} />);
  expect(screen.getByRole("tab", { name: "Crédits" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: "Univers" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Univers du film");
});

it("ne remplace pas un choix explicite lorsque les sagas arrivent après lui", () => {
  const { rerender } = render(<PlaybackContentTabs {...content} />);
  fireEvent.click(screen.getByRole("tab", { name: "Crédits" }));
  rerender(<PlaybackContentTabs {...content} sagas={<p>Films de la saga</p>} />);
  expect(screen.getByRole("tab", { name: "Crédits" })).toHaveAttribute("aria-selected", "true");
});

it("garde Épisodes par défaut pour une série appartenant à une saga", () => {
  render(<PlaybackContentTabs {...content} isSeries sagas={<p>Saga</p>} universes={<p>Univers</p>} />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Épisodes", "Série", "Crédits", "Sagas", "Univers"]);
  expect(screen.getByRole("tab", { name: "Épisodes" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Liste des épisodes");
});

it("permet la navigation au clavier sans perdre une modification dans un autre onglet", async () => {
  render(<PlaybackContentTabs {...content} />);
  fireEvent.change(screen.getByLabelText("Titre du film"), { target: { value: "Titre modifié" } });
  await act(async () => {
    screen.getByRole("tab", { name: "Détails" }).focus();
    userEvent.keyboard("{ArrowRight}");
  });
  expect(screen.getByRole("tab", { name: "Crédits" })).toHaveFocus();
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Distribution");
  await act(async () => { userEvent.keyboard("{ArrowLeft}"); });
  expect(screen.getByLabelText("Titre du film")).toHaveValue("Titre modifié");
});
