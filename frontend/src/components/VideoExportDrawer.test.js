import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import api from "../services/api";
import VideoExportDrawer from "./VideoExportDrawer";

jest.mock("../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

const video = {
  VideoID: 42,
  Titre: "Vidéo du clone",
  CheminImage: null,
  SaisonID: null,
  Genres: ["Action", "Introuvable"],
  VideoSubtitles: [{ Label: "Français" }],
  VideoAudioTracks: [{ Label: "Français" }],
};

const configResponse = {
  enabled: true,
  primaryConfigured: true,
  primaryOrigin: "https://sami.example.test",
};

const renderDrawer = async () => {
  let result;
  await act(async () => {
    result = render(<VideoExportDrawer video={video} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
};

describe("VideoExportDrawer", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
  });

  test("autorise, configure la destination et lance un export avec les genres choisis", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/video-exports/config") {
        return Promise.resolve({ data: configResponse });
      }
      if (url === "/video-exports/video/42") {
        return Promise.resolve({ data: { job: null } });
      }
      if (url === "/video-exports/catalog/series/8/seasons") {
        return Promise.resolve({
          data: { seasons: [{ SaisonID: 81, Numero: 2 }] },
        });
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });
    api.post.mockImplementation((url) => {
      if (url === "/video-exports/42/authorize") {
        return Promise.resolve({
          data: {
            challenge: "challenge-123",
            expiresAt: "2099-08-01T12:00:00.000Z",
            principal: { name: "SAMI principal" },
            genres: [
              { GenreID: 1, Nom: "Action" },
              { GenreID: 2, Nom: "Comédie" },
            ],
            selectedGenreIds: [1],
            missingGenreNames: ["Introuvable"],
            series: [{ SeriesID: 8, Titre: "Série principale" }],
          },
        });
      }
      if (url === "/video-exports/42") {
        return Promise.resolve({
          status: 202,
          data: {
            job: {
              id: "job-42",
              status: "QUEUED",
              progress: 0,
              steps: [],
            },
          },
        });
      }
      return Promise.reject(new Error(`POST inattendu : ${url}`));
    });

    await renderDrawer();

    const openButton = await screen.findByRole("button", {
      name: "Exporter vers le serveur principal",
    });
    await waitFor(() => expect(openButton).not.toBeDisabled());
    fireEvent.click(openButton);

    fireEvent.change(screen.getByLabelText("Mot de passe du compte"), {
      target: { value: "secret" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Vérifier et continuer" })
    );

    expect(
      await screen.findByText("Serveur principal disponible")
    ).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      "/video-exports/42/authorize",
      { currentPassword: "secret" }
    );
    expect(
      screen.getByText(/Genres source absents du serveur principal/)
    ).toHaveTextContent("Introuvable");
    expect(screen.getByRole("checkbox", { name: /Action/ })).toBeChecked();

    fireEvent.click(
      screen.getByRole("radio", { name: /Épisode d’une série/ })
    );
    fireEvent.change(screen.getByLabelText("Série"), {
      target: { value: "8" },
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/video-exports/catalog/series/8/seasons"
      );
    });
    expect(
      await screen.findByRole("option", { name: "Saison 2" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Saison"), {
      target: { value: "81" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Comédie/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continuer vers le récapitulatif",
      })
    );

    expect(await screen.findByText("Vérifier la destination")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lancer l’export" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/video-exports/42", {
        challenge: "challenge-123",
        destinationSeasonId: 81,
        genreIds: [1, 2],
      });
    });
    expect(await screen.findByText("Suivi de l’export")).toBeInTheDocument();
  });

  test("restaure un job en erreur puis permet sa reprise et son annulation", async () => {
    const failedJob = {
      id: "job-failed",
      status: "FAILED",
      progress: 58,
      error: "Connexion interrompue.",
      warnings: ["Un fichier temporaire sera renvoyé."],
      steps: [
        {
          id: "transfer",
          label: "Transfert des fichiers",
          status: "FAILED",
          statusLabel: "Transfert interrompu",
          progress: 58,
          error: "Canal fermé.",
        },
      ],
    };
    api.get.mockImplementation((url) => {
      if (url === "/video-exports/config") {
        return Promise.resolve({ data: configResponse });
      }
      if (url === "/video-exports/video/42") {
        return Promise.resolve({ data: { job: failedJob } });
      }
      if (url === "/video-exports/job-failed") {
        return Promise.resolve({ data: { job: failedJob } });
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });
    api.post.mockImplementation((url) => {
      if (url === "/video-exports/job-failed/resume") {
        return Promise.resolve({
          data: {
            job: {
              ...failedJob,
              status: "TRANSFERRING",
              error: null,
              canResume: false,
            },
          },
        });
      }
      if (url === "/video-exports/job-failed/cancel") {
        return Promise.resolve({
          data: {
            job: {
              ...failedJob,
              status: "CANCELLED",
              error: null,
              canResume: false,
            },
          },
        });
      }
      return Promise.reject(new Error(`POST inattendu : ${url}`));
    });

    await renderDrawer();

    expect(await screen.findByText("En erreur")).toBeInTheDocument();
    expect(screen.getByText(/Connexion interrompue/)).toBeInTheDocument();
    expect(
      screen.getByText("Un fichier temporaire sera renvoyé.")
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Mot de passe pour reprendre l’export"),
      { target: { value: "mot-de-passe" } }
    );
    // La version actuelle de RTL ne garde pas l'event async dans act après la promesse API.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reprendre" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/video-exports/job-failed/resume",
        { currentPassword: "mot-de-passe" }
      );
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Annuler l’export" })
    );
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/video-exports/job-failed/cancel"
      );
    });
    expect(await screen.findByText("Annulé")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reprendre" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Annuler l’export" })
    ).not.toBeInTheDocument();
  });

  test("normalise aussi un job terminé avec les clés Prisma brutes", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/video-exports/config") {
        return Promise.resolve({ data: configResponse });
      }
      if (url === "/video-exports/video/42") {
        return Promise.resolve({
          data: {
            job: {
              VideoTransferID: "raw-job",
              Status: "COMPLETED",
              Progress: 100,
              DestinationVideoID: 904,
              TotalFiles: 12,
              TransferredFiles: 12,
              ErrorMessage: null,
              Warnings: [],
              Steps: [
                {
                  VideoTransferStepID: "raw-step",
                  StepKey: "VERIFY",
                  Label: "Vérification de la réception",
                  StatusLabel: "Réception validée",
                  Progress: 100,
                  Status: "COMPLETED",
                  ErrorMessage: null,
                },
              ],
            },
          },
        });
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });

    await renderDrawer();

    expect(await screen.findByText("Terminé")).toBeInTheDocument();
    expect(screen.getByText("Réception validée")).toBeInTheDocument();
    expect(
      screen.getByText(/Vidéo créée sur le serveur principal : #904/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reprendre" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Annuler l’export" })
    ).not.toBeInTheDocument();
  });

  test("désactive le lancement quand la configuration ne peut pas être chargée", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/video-exports/config") {
        return Promise.reject(new Error("Configuration inaccessible"));
      }
      if (url === "/video-exports/video/42") {
        return Promise.resolve({ data: { job: null } });
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });

    await renderDrawer();

    expect(
      await screen.findByText("Configuration inaccessible")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Exporter vers le serveur principal",
      })
    ).toBeDisabled();
    expect(api.get).not.toHaveBeenCalledWith("/video-exports/video/42");
  });

  test("ne demande pas un job d'export sur l'instance principale", async () => {
    api.get.mockResolvedValue({
      data: {
        enabled: false,
        instanceRole: "primary",
        primaryConfigured: true,
        primaryOrigin: "https://sami.worldercraft.fr",
      },
    });

    await renderDrawer();

    expect(
      await screen.findByText(
        "L’export est disponible uniquement sur une instance configurée comme clone."
      )
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/video-exports/config");
    expect(api.get).not.toHaveBeenCalledWith("/video-exports/video/42");
    expect(
      screen.queryByText(/Impossible de récupérer le dernier export/)
    ).not.toBeInTheDocument();
  });

  test("affiche dans le drawer l'erreur de suivi d'un FINALIZING reprenable", async () => {
    const finalizingJob = {
      id: "job-finalizing",
      status: "FINALIZING",
      progress: 92,
      error: "Accusé final indisponible.",
      canResume: true,
      canCancel: false,
      steps: [],
    };
    api.get.mockImplementation((url) => {
      if (url === "/video-exports/config") {
        return Promise.resolve({ data: configResponse });
      }
      if (url === "/video-exports/video/42") {
        return Promise.resolve({ data: { job: finalizingJob } });
      }
      if (url === "/video-exports/job-finalizing") {
        return Promise.reject(new Error("Suivi principal indisponible"));
      }
      return Promise.reject(new Error(`GET inattendu : ${url}`));
    });

    await renderDrawer();

    expect(
      await screen.findByLabelText("Mot de passe pour reprendre l’export")
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Afficher le suivi de l’export" })
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Actualiser le suivi de l’export",
      })
    );

    expect(
      await screen.findByText("Suivi principal indisponible")
    ).toBeInTheDocument();
  });
});
