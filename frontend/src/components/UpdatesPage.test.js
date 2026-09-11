import { render, screen } from "@testing-library/react";

import UpdatesPage from "./UpdatesPage";

describe("UpdatesPage", () => {
  it("relie la navigation laterale aux articles de version", () => {
    render(<UpdatesPage />);

    const navigation = screen.getByRole("navigation", {
      name: "Navigation des mises a jour",
    });
    const latestVersionLink = screen.getByRole("link", { name: /Version 8\.2\.0/ });

    expect(navigation).toContainElement(latestVersionLink);
    expect(latestVersionLink).toHaveAttribute("href", "#version-8-2-0");
    expect(
      screen.getByRole("article", {
        name: /La branche Voix : originaux et répliques IA/,
      })
    ).toHaveAttribute("data-version", "8.2.0");
    expect(latestVersionLink).toHaveAttribute("aria-current", "location");
  });
});
