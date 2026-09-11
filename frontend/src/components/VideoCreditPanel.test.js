import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VideoCreditPanel, { CreditEditor } from "./VideoCreditPanel";
import api from "../services/api";
jest.mock("../services/api", () => ({ post: jest.fn(), patch: jest.fn(), delete: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
const item = { ID: 3, VideoID: 12, Start: 10, End: 20, Status: "PENDING", AuthorID: 7 };
it("submits timecodes from the player's current position", async () => {
  const videoElement = { currentTime: 10 };
  const onSaved = jest.fn();
  render(<CreditEditor videoId={12} videoElement={videoElement} onSaved={onSaved} />);
  fireEvent.click(screen.getByText("Utiliser la position actuelle — début"));
  videoElement.currentTime = 20;
  fireEvent.click(screen.getByText("Utiliser la position actuelle — fin"));
  fireEvent.click(screen.getByText("Proposer ce générique"));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(api.post).toHaveBeenCalledWith("/videos/12/credits", { Start: 10, End: 20 });
});
it("requires increasing timecodes and displays server errors", async () => {
  render(<CreditEditor videoId={12} onSaved={jest.fn()} />);
  fireEvent.click(screen.getByText("Proposer ce générique"));
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("fin après le début");
  fireEvent.change(screen.getByLabelText("Fin"), { target: { value: "00:00:20" } });
  api.post.mockRejectedValueOnce({ response: { data: { error: "Durée indisponible" } } });
  fireEvent.click(screen.getByText("Proposer ce générique"));
  await screen.findByText("Durée indisponible");
});
it.each(["APPROVED", "REJECTED"])("does not offer author mutations after %s", Status => {
  render(<VideoCreditPanel videoId={12} data={{ userId: 7, canModerate: false, items: [{ ...item, Status }] }} onRefresh={jest.fn()} />);
  expect(screen.queryByText("Modifier")).not.toBeInTheDocument();
  expect(screen.queryByText("Supprimer")).not.toBeInTheDocument();
});
it("lets the author delete a pending proposal and refreshes the data", async () => {
  const refresh = jest.fn();
  render(<VideoCreditPanel videoId={12} data={{ userId: 7, items: [item] }} onRefresh={refresh} />);
  fireEvent.click(screen.getByText("Supprimer"));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(api.delete).toHaveBeenCalledWith("/videos/12/credits/3");
});
it("allows admin approval with corrected bounds", async () => {
  const onSaved = jest.fn();
  render(<CreditEditor segment={item} videoId={12} canModerate onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText("Fin"), { target: { value: "00:00:25" } });
  fireEvent.click(screen.getByText("Valider"));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(api.patch).toHaveBeenCalledWith("/videos/12/credits/3", { Start: 10, End: 25, Status: "APPROVED" });
});
