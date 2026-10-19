import { act, fireEvent, render, screen } from "@testing-library/react";
import SearchBar from "./SearchBar";

jest.mock(
  "react-router-dom",
  () => ({ useNavigate: () => jest.fn() }),
  { virtual: true }
);

describe("SearchBar - suggestions similaires", () => {
  let originalFetch;

  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        items: [{ id: 3, type: "video", Titre: "Spider-Man", CheminImage: null }],
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
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

  test("ignore une ancienne réponse qui arrive après les suggestions de la nouvelle saisie", async () => {
    let resolveFirst;
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    render(<SearchBar />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "batman" } });
    await act(async () => { jest.advanceTimersByTime(300); });

    fireEvent.change(input, { target: { value: "spidr man" } });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(screen.getByText("Spider-Man")).toBeInTheDocument();

    await act(async () => {
      resolveFirst({ json: async () => ({ items: [{ id: 1, type: "video", Titre: "Batman" }] }) });
    });
    expect(screen.queryByText("Batman")).not.toBeInTheDocument();
    expect(screen.getByText("Spider-Man")).toBeInTheDocument();
  });

  test("efface les suggestions dès que la saisie change et après avoir vidé le champ", async () => {
    let resolvePending;
    render(<SearchBar />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "spider" } });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(screen.getByText("Spider-Man")).toBeInTheDocument();

    global.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve; }));
    fireEvent.change(input, { target: { value: "batman" } });
    expect(screen.queryByText("Spider-Man")).not.toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(300); });

    fireEvent.change(input, { target: { value: "" } });
    await act(async () => {
      resolvePending({ json: async () => ({ items: [{ id: 1, type: "video", Titre: "Batman" }] }) });
      jest.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

