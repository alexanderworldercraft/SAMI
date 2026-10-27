import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SubscriptionPlans from "./SubscriptionPlans";
import api from "../services/api";
jest.mock("../services/api", () => ({ get: jest.fn(), post: jest.fn() }));
const monthly = {
  currentPlan: "MONTHLY", renewalPlan: "MONTHLY", autoRenew: true, isPremium: true,
  PremiumEndDate: "2026-11-27T12:00:00Z", apiActive: true,
  contentLoss: { films: 12, series: 4, adminAccessPreserved: false },
};
beforeEach(() => {
  jest.clearAllMocks(); api.get.mockResolvedValue({ data: monthly });
  api.post.mockResolvedValue({ data: { ...monthly, autoRenew: false, renewalPlan: null, message: "Renouvellement arrêté." } });
});
const choose = async name => {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirmer" })).toBeEnabled());
  return dialog;
};

it("distingue la formule mensuelle de l'annuelle et propose deux accès au désabonnement", async () => {
  render(<SubscriptionPlans />);
  expect(await screen.findByRole("button", { name: "Formule actuelle : Premium mensuel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Choisir cette formule : Premium annuel" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Choisir cette formule : Gratuit" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Passer au gratuit à l’échéance" })).toBeEnabled();
});

it.each(["Choisir cette formule : Gratuit", "Passer au gratuit à l’échéance"])("confirme le désabonnement via %s et conserve la date", async name => {
  render(<SubscriptionPlans />); const dialog = await choose(name);
  expect(within(dialog).getByText(/12 films et les contenus Premium de 4 séries/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Vous conservez tout votre temps/)).toHaveTextContent("27 novembre 2026");
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/users/premium/fake-checkout", { plan: "FREE" }));
  expect(await screen.findByText(/puis votre compte passera à la formule gratuite/)).toHaveTextContent("27 novembre 2026");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Passage au gratuit programmé : Gratuit" })).toBeDisabled();
});

it("annuler la modale ne change rien", async () => {
  render(<SubscriptionPlans />); const dialog = await choose("Choisir cette formule : Gratuit");
  fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(api.post).not.toHaveBeenCalled();
});

it("confirme le changement annuel et montre sa prise d'effet au renouvellement", async () => {
  api.post.mockResolvedValue({ data: { ...monthly, renewalPlan: "YEARLY" } });
  render(<SubscriptionPlans />); const dialog = await choose("Choisir cette formule : Premium annuel");
  expect(within(dialog).getByText(/Aucun temps ne sera ajouté aujourd’hui/)).toHaveTextContent("27 novembre 2026");
  expect(api.post).not.toHaveBeenCalled(); fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/users/premium/fake-checkout", { plan: "YEARLY" }));
  expect(await screen.findByRole("button", { name: "Prévue au renouvellement : Premium annuel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Conserver cette formule : Premium mensuel" })).toBeEnabled();
});

it("confirme aussi une première souscription", async () => {
  api.get.mockResolvedValue({ data: { ...monthly, currentPlan: "FREE", renewalPlan: null, autoRenew: false, isPremium: false, PremiumEndDate: null } });
  render(<SubscriptionPlans />); const dialog = await choose("Choisir cette formule : Premium mensuel");
  expect(within(dialog).getByText(/commencera dès la confirmation/)).toBeInTheDocument(); expect(api.post).not.toHaveBeenCalled();
});

it("permet de réactiver le renouvellement après une résiliation", async () => {
  api.get.mockResolvedValue({ data: { ...monthly, renewalPlan: null, autoRenew: false } });
  render(<SubscriptionPlans />); const dialog = await choose("Réactiver le renouvellement : Premium mensuel");
  expect(within(dialog).getByText(/Aucun temps ne sera ajouté aujourd’hui/)).toBeInTheDocument();
});

it("laisse le désabonnement disponible avec l'API désactivée", async () => {
  api.get.mockResolvedValue({ data: { ...monthly, apiActive: false } }); render(<SubscriptionPlans />);
  expect(await screen.findByRole("button", { name: "Choisir cette formule : Premium annuel" })).toBeDisabled();
  const dialog = await choose("Passer au gratuit à l’échéance");
  expect(within(dialog).getByRole("button", { name: "Confirmer" })).toBeEnabled();
});

it("garde la modale ouverte sur erreur et permet de réessayer", async () => {
  api.post.mockRejectedValueOnce({ response: { data: { error: "Indisponible temporairement" } } });
  render(<SubscriptionPlans />); const dialog = await choose("Choisir cette formule : Gratuit");
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Indisponible temporairement");
  expect(within(dialog).getByRole("button", { name: "Confirmer" })).toBeEnabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(api.post).toHaveBeenCalledTimes(2);
});

it("bloque la confirmation si le décompte et l'abonnement ne peuvent pas être vérifiés", async () => {
  render(<SubscriptionPlans />); await screen.findByRole("button", { name: "Passer au gratuit à l’échéance" });
  api.get.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Passer au gratuit à l’échéance" }));
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Impossible de vérifier");
  expect(within(dialog).getByRole("button", { name: "Confirmer" })).toBeDisabled(); expect(api.post).not.toHaveBeenCalled();
});
