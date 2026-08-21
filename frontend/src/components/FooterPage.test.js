import { fireEvent, render, screen } from "@testing-library/react";
import FooterPage from "./FooterPage";
import { scrollToPageTop } from "../utils/scrollToPageTop";

jest.mock(
  "react-router-dom",
  () => ({
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  }),
  { virtual: true }
);
jest.mock("./TotalVideos", () => () => <div>Total vidéos</div>);
jest.mock("../utils/scrollToPageTop", () => ({ scrollToPageTop: jest.fn() }));

describe("FooterPage - retour en haut", () => {
  test("relie la page des statistiques et les pages d'information au défilement fluide", () => {
    render(<FooterPage />);

    [
      "Mises à jour",
      "Statistiques",
      "Politique de confidentialité",
      "Conditions d'utilisation",
      "Conformité des données",
    ].forEach((name) => fireEvent.click(screen.getByRole("link", { name })));

    expect(screen.getByRole("link", { name: "Statistiques" })).toHaveAttribute("href", "/stats");
    expect(screen.queryByText("Calendrier")).not.toBeInTheDocument();
    expect(screen.queryByText("Cookies")).not.toBeInTheDocument();
    expect(scrollToPageTop).toHaveBeenCalledTimes(5);
  });
});
