import { render, screen } from "@testing-library/react";

import UpdatesPage from "./UpdatesPage";

describe("UpdatesPage", () => {
  it("relie la navigation laterale aux articles de version", () => {
    render(<UpdatesPage />);

    const navigation = screen.getByRole("navigation", {
      name: "Navigation des mises a jour",
    });
    const latestVersionLink = screen.getByRole("link", { name: /Version 8\.7\.2/ });

    expect(navigation).toContainElement(latestVersionLink);
    expect(latestVersionLink).toHaveAttribute("href", "#version-8-7-2");
    expect(
      screen.getByRole("article", {
        name: /Chargement plus léger des pages et des affiches/,
      })
    ).toHaveAttribute("data-version", "8.7.2");
    expect(latestVersionLink).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: /Version 8\.7\.1/ })).toHaveAttribute("href", "#version-8-7-1");
    expect(screen.getByRole("link", { name: /Version 8\.7\.0/ })).toHaveAttribute("href", "#version-8-7-0");
    expect(screen.getByRole("link", { name: /Version 8\.6\.0/ })).toHaveAttribute("href", "#version-8-6-0");
    expect(screen.getByRole("article", { name: /Personnages des acteurs, titres alternatifs et recherche du catalogue/ })).toHaveAttribute("data-version", "8.6.0");
    expect(screen.getByRole("link", { name: /Version 8\.5\.0/ })).toHaveAttribute("href", "#version-8-5-0");
    expect(screen.getByRole("article", { name: /Sous-titres IA, multi-encodage et navigation dans les sagas/ })).toHaveAttribute("data-version", "8.5.0");
    expect(screen.getByRole("link", { name: /Version 8\.4\.0/ })).toHaveAttribute("href", "#version-8-4-0");
    expect(screen.getByRole("article", { name: /Des interfaces adaptées à chaque appareil et une première interface TV/ })).toHaveAttribute("data-version", "8.4.0");
    expect(screen.getByRole("link", { name: /Version 8\.3\.0/ })).toHaveAttribute("href", "#version-8-3-0");
    expect(screen.getByRole("article", { name: /Génériques participatifs et passage à l’épisode suivant/ })).toHaveAttribute("data-version", "8.3.0");
  });
});
