import React from "react";
import { render, screen } from "@testing-library/react";
import ClassicShell from "./ClassicShell";
import { useNav } from "../../../context/NavContext";
let mockPathname = "/videos";
jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: mockPathname }) }), { virtual: true });
jest.mock("../../../context/NavContext", () => ({ useNav: jest.fn() }));
jest.mock("./NavBar", () => () => <nav>Navigation classic</nav>);
jest.mock("./FooterPage", () => () => <footer>Pied de page classic</footer>);
jest.mock("./WallPaper", () => () => null);
jest.mock("../../../components/GeneralMessageBanner", () => () => <aside>Message général</aside>);

beforeEach(() => { mockPathname = "/videos"; });

test.each([[false, "/lecture/14", true], [true, "/lecture/14", false], [true, "/videos", true]])("réserve la place de la sidebar selon le cinéma %s sur %s", (cinemaMode, pathname, hasPadding) => {
  mockPathname = pathname;
  useNav.mockReturnValue({ cinemaMode });
  render(<ClassicShell><p>Contenu</p></ClassicShell>);
  const main = screen.getByRole("main");
  expect(main).toHaveClass("px-4", "sm:px-6", "lg:px-8");
  expect(main.parentElement.classList.contains("lg:pl-72")).toBe(hasPadding);
  expect(screen.getByRole("navigation")).toBeInTheDocument();
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});
test("respecte les pages sans footer et leur classe de contenu explicite", () => {
  useNav.mockReturnValue({ cinemaMode: false });
  render(<ClassicShell withFooter={false} contentClassName="custom-content">Contenu</ClassicShell>);
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("custom-content");
});
