import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminMessageSettings from "./AdminMessageSettings";
import api from "../services/api";

jest.mock("../services/api", () => ({
  get: jest.fn(),
  put: jest.fn(),
}));

describe("AdminMessageSettings", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.put.mockReset();
    api.get.mockResolvedValue({
      data: {
        Titre: "Information",
        Description: "Un message",
        Actif: false,
        ExpiresAt: null,
      },
    });
  });

  test("laisse le serveur appliquer les 7 jours quand la date est vide", async () => {
    api.put.mockResolvedValue({
      data: {
        Titre: "Information",
        Description: "Un message",
        Actif: true,
        ExpiresAt: "2026-08-05T10:00:00.000Z",
      },
    });

    render(<AdminMessageSettings />);

    const toggle = await screen.findByRole("button", {
      name: "Activer le message général",
    });
    await waitFor(() => {
      expect(toggle).not.toBeDisabled();
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/admin-message/toggle", {
        Actif: true,
      });
    });
    expect(await screen.findByText("Message activé.")).toBeInTheDocument();
  });

  test("envoie la date personnalisée lors de l'activation", async () => {
    const customExpiration = "2099-08-10T18:30";
    api.put.mockResolvedValue({
      data: {
        Titre: "Information",
        Description: "Un message",
        Actif: true,
        ExpiresAt: new Date(customExpiration).toISOString(),
      },
    });

    render(<AdminMessageSettings />);

    const expirationInput = await screen.findByLabelText(
      "Date de désactivation (optionnelle)"
    );
    const toggle = screen.getByRole("button", {
      name: "Activer le message général",
    });
    await waitFor(() => {
      expect(toggle).not.toBeDisabled();
    });
    fireEvent.change(expirationInput, {
      target: { value: customExpiration },
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/admin-message/toggle", {
        Actif: true,
        ExpiresAt: new Date(customExpiration).toISOString(),
      });
    });
    expect(await screen.findByText("Message activé.")).toBeInTheDocument();
  });
});
