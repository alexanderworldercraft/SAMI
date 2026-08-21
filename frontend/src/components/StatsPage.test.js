import { render, screen } from "@testing-library/react";
import StatsPage from "./StatsPage";

jest.mock("./StatsSAMI", () => () => <section data-testid="stats-section">Bloc statistiques</section>);
jest.mock("./CalendarSAMI", () => () => <section data-testid="calendar-section">Bloc calendrier</section>);
jest.mock("./CookieList", () => ({ embedded }) => (
  <section data-testid="cookies-section" data-embedded={embedded}>Bloc cookies</section>
));

describe("StatsPage", () => {
  test("regroupe les statistiques, le calendrier et les cookies sur une page dédiée", () => {
    render(<StatsPage />);

    expect(screen.getByRole("heading", { name: "Statistiques et activité" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Statistiques/ })).toHaveAttribute("href", "#statistiques");
    expect(screen.getByRole("link", { name: /Calendrier/ })).toHaveAttribute("href", "#calendrier");
    expect(screen.getByRole("link", { name: /Cookies/ })).toHaveAttribute("href", "#cookies");
    expect(screen.getByTestId("stats-section")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-section")).toBeInTheDocument();
    expect(screen.getByTestId("cookies-section")).toHaveAttribute("data-embedded", "true");
  });
});
