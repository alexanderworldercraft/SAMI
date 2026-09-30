import React from "react";
import { render, screen } from "@testing-library/react";
import TactileShell from "./TactileShell";
jest.mock("./TactileNavigation", () => () => <nav>Navigation tactile</nav>);
jest.mock("../../classic/layout/WallPaper", () => () => null);
jest.mock("../../classic/layout/FooterPage", () => () => <footer>Pied de page</footer>);
jest.mock("../../../components/GeneralMessageBanner", () => () => <aside>Message général</aside>);
test("la disposition tactile n'a pas de marge de sidebar et conserve les pages sans footer", () => {
  const view = render(<TactileShell withFooter={false}>Contenu</TactileShell>);
  expect(screen.getByRole("main")).toHaveTextContent("Contenu");
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  expect(screen.getByRole("main").parentElement).not.toHaveClass("lg:pl-72");
  view.rerender(<TactileShell>Contenu</TactileShell>);
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});
