import { render, screen, waitFor } from "@testing-library/react";
import GeneralMessageBanner from "./GeneralMessageBanner";
import api from "../services/api";

jest.mock("../services/api", () => ({
  get: jest.fn(),
}));

describe("GeneralMessageBanner", () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  test("conserve les retours à la ligne de la description", async () => {
    api.get.mockResolvedValue({
      data: {
        Actif: true,
        Titre: "Information",
        Description: "Première ligne\nDeuxième ligne",
      },
    });

    render(<GeneralMessageBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Première ligne/)).toBeInTheDocument();
    });

    const description = screen.getByText(/Première ligne/);
    expect(description).toHaveTextContent("Première ligne Deuxième ligne");
    expect(description).toHaveClass("whitespace-pre-line");
  });
});
