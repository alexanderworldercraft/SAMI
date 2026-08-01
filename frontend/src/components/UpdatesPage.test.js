import { render, screen } from "@testing-library/react";

import UpdatesPage from "./UpdatesPage";

describe("UpdatesPage", () => {
  it("relie la navigation laterale aux articles de version", () => {
    render(<UpdatesPage />);

    const navigation = screen.getByRole("navigation", {
      name: "Navigation des mises a jour",
    });
    const latestVersionLink = screen.getByRole("link", { name: /Version 7\.9\.0/ });

    expect(navigation).toContainElement(latestVersionLink);
    expect(latestVersionLink).toHaveAttribute("href", "#version-7-9-0");
    expect(
      screen.getByRole("article", {
        name: /Encodage video distribue experimental/,
      })
    ).toHaveAttribute("data-version", "7.9.0");
    expect(latestVersionLink).toHaveAttribute("aria-current", "location");
  });
});
