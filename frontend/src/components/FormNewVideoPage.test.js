import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import FormNewVideoPage from "./FormNewVideoPage";
import api from "../services/api";
import { VIDEO_ENCODING_POLL_INTERVAL_MS } from "../utils/videoEncoding";
import { io } from "socket.io-client";

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

jest.mock("../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("./NewVideoForm", () => (props) => (
  <div data-testid="new-video-form">
    {props.videoEncodingConfig?.enabled ? "Action distribuée prête" : "Action classique"}
  </div>
));

let socketHandlers;

describe("FormNewVideoPage - suivi multi-server persistant", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    socketHandlers = {};
    io.mockImplementation(() => ({
      on: jest.fn((eventName, handler) => {
        socketHandlers[eventName] = handler;
      }),
      disconnect: jest.fn(),
    }));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("hydrate les jobs récents avec leur détail et installe un polling de deux secondes", async () => {
    const intervalSpy = jest.spyOn(window, "setInterval");
    api.get.mockImplementation((url) => {
      if (url === "/users/me") {
        return Promise.resolve({ data: { GradeID: 1, UtilisateurID: 7 } });
      }
      if (url === "/video-encoding/config") {
        return Promise.resolve({
          data: {
            enabled: true,
            canStart: true,
            instanceRole: "primary",
            activeCloneCount: 1,
          },
        });
      }
      if (url === "/video-encoding/workers") {
        return Promise.resolve({
          data: {
            workers: [
              {
                id: "clone-01",
                displayName: "Clone persistant",
                role: "clone",
                status: "online",
                enabled: true,
              },
            ],
          },
        });
      }
      if (url === "/video-encoding/jobs?limit=6") {
        return Promise.resolve({
          data: {
            jobs: [
              {
                id: "job-persistant",
                title: "Job persistant",
                status: "RUNNING",
                currentStep: "Encodage",
                progress: 37,
                updatedAt: "2026-07-31T10:00:00.000Z",
                tasks: [
                  {
                    id: "task-480",
                    key: "profile-480p",
                    profileLabel: "480p",
                    status: "RUNNING",
                    phase: "ENCODING",
                    progress: 51,
                    workerId: "clone-01",
                  },
                ],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });

    render(<FormNewVideoPage />);

    expect(await screen.findByText("Job persistant")).toBeInTheDocument();
    expect(screen.getByText("480p · Clone persistant 51%")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/video-encoding/jobs?limit=6");
    await waitFor(() => {
      expect(intervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        VIDEO_ENCODING_POLL_INTERVAL_MS
      );
    });

    api.post.mockResolvedValue({
      data: {
        job: {
          id: "job-persistant",
          title: "Job persistant",
          status: "CANCEL_REQUESTED",
          progress: 37,
          tasks: [],
        },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Annuler le job" }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/video-encoding/jobs/job-persistant/cancel"
      );
    });
    expect(await screen.findByText("Annulation demandée")).toBeInTheDocument();
  });

  test("conserve un job terminé pour vérification puis permet de fermer la section", async () => {
    let jobStatus = "RUNNING";
    let pollVideoEncoding;
    jest.spyOn(window, "setInterval").mockImplementation((callback, delay) => {
      if (delay === VIDEO_ENCODING_POLL_INTERVAL_MS) {
        pollVideoEncoding = callback;
      }
      return delay === VIDEO_ENCODING_POLL_INTERVAL_MS ? 42 : 43;
    });
    jest.spyOn(window, "clearInterval").mockImplementation(() => {});

    api.get.mockImplementation((url) => {
      if (url === "/users/me") {
        return Promise.resolve({ data: { GradeID: 1, UtilisateurID: 7 } });
      }
      if (url === "/video-encoding/config") {
        return Promise.resolve({
          data: {
            enabled: true,
            canStart: true,
            instanceRole: "primary",
            activeCloneCount: 1,
          },
        });
      }
      if (url === "/video-encoding/workers") {
        return Promise.resolve({ data: { workers: [] } });
      }
      if (url === "/video-encoding/jobs?limit=6") {
        return Promise.resolve({
          data: {
            jobs: [{
              id: "job-a-masquer",
              title: "Film bientôt terminé",
              status: jobStatus,
              progress: jobStatus === "COMPLETED" ? 100 : 74,
              updatedAt: new Date().toISOString(),
              tasks: [],
            }],
          },
        });
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });

    render(<FormNewVideoPage />);

    expect(await screen.findByText("Film bientôt terminé")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Traitements vidéo" })).toBeInTheDocument();

    jobStatus = "COMPLETED";
    await act(async () => {
      await pollVideoEncoding();
    });

    await waitFor(() => {
      expect(screen.getByText("Film bientôt terminé")).toBeInTheDocument();
      expect(screen.getByText("Terminé")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", {
      name: "Fermer les traitements terminés",
    }));

    await waitFor(() => {
      expect(screen.queryByText("Film bientôt terminé")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Traitements vidéo" })).not.toBeInTheDocument();
    });
  });

  test("ne réaffiche pas un job déjà terminé après un chargement de page", async () => {
    let resolveJobsRequest;
    const jobsRequest = new Promise((resolve) => {
      resolveJobsRequest = resolve;
    });

    api.get.mockImplementation((url) => {
      if (url === "/users/me") {
        return Promise.resolve({ data: { GradeID: 1, UtilisateurID: 7 } });
      }
      if (url === "/video-encoding/config") {
        return Promise.resolve({
          data: {
            enabled: true,
            canStart: true,
            instanceRole: "primary",
            activeCloneCount: 1,
          },
        });
      }
      if (url === "/video-encoding/workers") {
        return Promise.resolve({ data: { workers: [] } });
      }
      if (url === "/video-encoding/jobs?limit=6") {
        return jobsRequest;
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });

    render(<FormNewVideoPage />);

    expect(await screen.findByText("Action distribuée prête")).toBeInTheDocument();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/video-encoding/jobs?limit=6");
    });

    await act(async () => {
      resolveJobsRequest({
          data: {
            jobs: [{
              id: "job-deja-termine",
              title: "Film terminé avant chargement",
              status: "COMPLETED",
              progress: 100,
              tasks: [],
            }],
          },
      });
      await jobsRequest;
    });

    expect(screen.queryByText("Film terminé avant chargement")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Traitements vidéo" })).not.toBeInTheDocument();
  });

  test("reprend le compteur classique depuis la durée fournie par le backend", async () => {
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-01T12:00:00.000Z"));
    api.get.mockImplementation((url) => {
      if (url === "/users/me") {
        return Promise.resolve({ data: { GradeID: 2, UtilisateurID: 8 } });
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });

    render(<FormNewVideoPage />);

    await waitFor(() => {
      expect(socketHandlers.progress).toEqual(expect.any(Function));
    });

    act(() => {
      socketHandlers.progress({
        stage: "conversion",
        status: "conversion",
        resolution: "720p",
        processingId: "classic-after-reload",
        processingStartedAt: "2026-08-01T11:57:55.000Z",
        processingElapsedMs: 125_000,
        progress: 42,
        video: { titre: "Film classique repris" },
      });
    });

    expect(screen.getByRole("timer", {
      name: "Durée totale du traitement classique : 00:02:05",
    })).toBeInTheDocument();
  });
});
