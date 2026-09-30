import React from "react";
import { render, screen } from "@testing-library/react";
import ClassicShell from "./ClassicShell";
import { useNav } from "../../../context/NavContext";
jest.mock("../../../context/NavContext", () => ({ useNav: jest.fn() }));
jest.mock("./NavBar", () => () => <nav>Navigation classic</nav>);
jest.mock("./FooterPage", () => () => <footer>Pied de page classic</footer>);
jest.mock("./WallPaper", () => () => null);
jest.mock("../../../components/GeneralMessageBanner", () => () => <aside>Message général</aside>);

test.each([["hover", "lg:pl-4"], ["fixed", "lg:pl-72"]])("préserve la disposition responsive avec la navigation %s", (navMode, padding) => {
  useNav.mockReturnValue({ navMode });
  render(<ClassicShell><p>Contenu</p></ClassicShell>);
  const main = screen.getByRole("main");
  expect(main).toHaveClass("px-4", "sm:px-6", "lg:px-8");
  expect(main.parentElement).toHaveClass(padding);
  expect(screen.getByRole("navigation")).toBeInTheDocument();
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});
test("respecte les pages sans footer et leur classe de contenu explicite", () => {
  useNav.mockReturnValue({ navMode: "hover" });
  render(<ClassicShell withFooter={false} contentClassName="custom-content">Contenu</ClassicShell>);
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("custom-content");
});
