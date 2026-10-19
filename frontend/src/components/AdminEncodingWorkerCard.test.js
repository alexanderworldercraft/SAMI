import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminEncodingWorkerCard from "./AdminEncodingWorkerCard";

it("enregistre les limites du primary et propose Pas d’encodage", async () => {
  const onSave = jest.fn().mockResolvedValue(true);
  render(<AdminEncodingWorkerCard worker={{ id: "primary-1", displayName: "Primary", role: "primary",
    maxSlots: 1, maxNominalHeight: 360, performanceScore: 0.1, enabled: true }} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Modifier Primary" }));
  fireEvent.change(screen.getByLabelText("Nom de primary-1"), { target: { value: "Serveur principal" } });
  fireEvent.change(screen.getByLabelText("Résolution de primary-1"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Slots de primary-1"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer les réglages" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "primary-1" }),
    { displayName: "Serveur principal", performanceScore: 0.1, maxNominalHeight: 0, maxSlots: 3 }));
  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
});

it("ne propose Pas d’encodage que pour le primary", () => {
  render(<AdminEncodingWorkerCard worker={{ id: "clone", displayName: "Clone", role: "clone", maxSlots: 1, maxNominalHeight: 1080 }} />);
  fireEvent.click(screen.getByRole("button", { name: "Modifier Clone" }));
  expect(screen.queryByRole("option", { name: "Pas d’encodage" })).not.toBeInTheDocument();
});
