import { act, fireEvent, render, screen } from "@testing-library/react";
import SearchBar from "./SearchBar";

jest.mock(
  "react-router-dom",
  () => ({ useNavigate: () => jest.fn() }),
  { virtual: true }
);

describe("SearchBar - suggestions similaires", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        items: [{ id: 3, type: "video", Titre: "Spider-Man", CheminImage: null }],
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("utilise l'endpoint léger de suggestions avec une limite de six résultats", async () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "spider man" } });

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/videos/search?search=spider%20man&limit=6")
    );
    expect(screen.getByText("Spider-Man")).toBeInTheDocument();
  });
});

