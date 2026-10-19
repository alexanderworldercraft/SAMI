import { render, screen } from "@testing-library/react";
import api from "../services/api";
import AdminAiSubtitleWorkers from "./AdminAiSubtitleWorkers";
jest.mock("../services/api", () => ({ get: jest.fn() }));

it("affiche les clones et le primary avec les raisons réelles d’attente", async () => {
  api.get.mockResolvedValue({ data: { workers: [
    { id: "clone", displayName: "Aero", role: "CLONE", engine: "whisper", model: "large-v3", unavailableReason: "Priorité à l’encodage" },
    { id: "primary", displayName: "Principal", role: "PRIMARY", unavailableReason: "Autorisation requise par sous-titre" },
  ] } });
  render(<AdminAiSubtitleWorkers />);
  expect(await screen.findByText("Aero")).toBeInTheDocument();
  expect(screen.getByText("Principal")).toBeInTheDocument();
  expect(screen.getByText("Priorité à l’encodage")).toBeInTheDocument();
  expect(screen.getByText("Autorisation requise par sous-titre")).toBeInTheDocument();
  expect(screen.getByText("whisper · large-v3")).toBeInTheDocument();
});
