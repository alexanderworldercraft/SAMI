import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import api from "../services/api";
import AdminAiSubtitleManager from "./AdminAiSubtitleManager";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({
    data: {
      items: [{
        videoId: 42,
        title: "Film sans français",
        seriesTitle: null,
        seasonNumber: null,
        job: null,
      }],
      pagination: { page: 1, pageSize: 40, total: 41, totalPages: 2 },
    },
  });
  api.post.mockResolvedValue({ data: { job: { id: "job-42", status: "QUEUED" } } });
});

it("liste 40 vidéos par page et planifie le français", async () => {
  render(<AdminAiSubtitleManager />);

  expect(await screen.findByText("Film sans français")).toBeInTheDocument();
  expect(screen.getByText((_, element) => (
    element?.tagName === "P"
    && element.textContent.includes("sur 41 résultats")
  ))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Générer en français" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/ai-subtitles/videos/42/requests",
    { language: "fr" }
  ));
  expect(await screen.findByText(/ajoutée à la file/)).toBeInTheDocument();
});
