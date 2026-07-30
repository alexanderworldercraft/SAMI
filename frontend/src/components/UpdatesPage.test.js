import { render, screen } from "@testing-library/react";

import UpdatesPage from "./UpdatesPage";

describe("UpdatesPage", () => {
  it("relie la navigation laterale aux articles de version", () => {
    render(<UpdatesPage />);

    const navigation = screen.getByRole("navigation", {
      name: "Navigation des mises a jour",
    });
    const latestVersionLink = screen.getByRole("link", { name: /Version 7\.8\.0/ });

    expect(navigation).toContainElement(latestVersionLink);
    expect(latestVersionLink).toHaveAttribute("href", "#version-7-8-0");
    expect(
      screen.getByRole("article", {
        name: /Export video securise entre instances/,
      })
    ).toHaveAttribute("data-version", "7.8.0");
    expect(latestVersionLink).toHaveAttribute("aria-current", "location");
  });
});
