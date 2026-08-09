import { act, fireEvent, render, screen } from "@testing-library/react";

import TaskHistory from "./TaskHistory";

describe("TaskHistory - jobs multi-server persistants", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("affiche la progression par résolution, le worker et les tentatives", () => {
    const onCancelDistributedJob = jest.fn();
    render(
      <TaskHistory
        tasks={[]}
        onCancelDistributedJob={onCancelDistributedJob}
        videoEncodingWorkers={[
          {
            id: "clone-01",
            displayName: "Clone 01",
            role: "clone",
            status: "online",
          },
        ]}
        distributedJobs={[
          {
            id: "job-01",
            title: "Film distribué",
            status: "RUNNING",
            currentStep: "Encodage réparti",
            progress: 42,
            warnings: [{
              code: "AUDIO_TRACK_PADDED_WITH_SILENCE",
              message: "La piste audio « Français » sera complétée avec du silence.",
            }],
            video: {
              titre: "Film distribué",
              audio: "jpn - AAC - 2 canaux",
              audioTracks: ["Japonais", "Français"],
              subtitles: ["Français forcés"],
              saisonNumero: 2,
              seriesTitre: "Série distribuée",
            },
            tasks: [
              {
                id: "task-360",
                key: "profile-360p",
                profileLabel: "360p",
                status: "RUNNING",
                phase: "ENCODING",
                progress: 47,
                workerId: "clone-01",
                attemptCount: 2,
                maxAttempts: 3,
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText("Film distribué")).toBeInTheDocument();
    expect(screen.getByText("Encodage réparti 42%")).toBeInTheDocument();
    expect(screen.getByText("360p · Clone 01 47%")).toBeInTheDocument();
    expect(screen.getByText("Encodage")).toBeInTheDocument();
    expect(screen.getByText("Tentative 2/3")).toBeInTheDocument();
    expect(screen.getByText("Japonais, Français")).toBeInTheDocument();
    expect(screen.getByText("Français forcés")).toBeInTheDocument();
    expect(screen.getByText("Série distribuée")).toBeInTheDocument();
    expect(screen.getByText(
      "La piste audio « Français » sera complétée avec du silence."
    )).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annuler le job" }));
    expect(onCancelDistributedJob).toHaveBeenCalledWith("job-01");
  });

  test("propose la reprise d'un job en échec", () => {
    const onResumeDistributedJob = jest.fn();
    render(
      <TaskHistory
        tasks={[]}
        onResumeDistributedJob={onResumeDistributedJob}
        distributedJobs={[{
          id: "job-failed",
          title: "Film à reprendre",
          status: "FAILED",
          error: "Worker interrompu",
          startedAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:02:03.000Z",
          tasks: [],
        }]}
      />
    );

    expect(screen.getByRole("timer", {
      name: "Durée totale du multi encodage : 00:02:03",
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reprendre le job" }));
    expect(onResumeDistributedJob).toHaveBeenCalledWith("job-failed");
  });

  test("affiche et actualise un compteur distinct pour chaque ensemble de traitement", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));

    const { unmount } = render(
      <TaskHistory
        tasks={[{
          id: "classic-01",
          label: "Film classique",
          startedAt: "2026-08-01T12:00:00.000Z",
          processingElapsedMs: 65_000,
          processingElapsedReceivedAt: "2026-08-01T12:00:00.000Z",
          steps: [{
            id: "analysis",
            label: "Informations vidéo",
            statusLabel: "Traitement en cours",
            progress: 50,
            completed: false,
          }],
        }]}
        distributedJobs={[{
          id: "job-timer",
          title: "Film distribué chronométré",
          status: "RUNNING",
          startedAt: "2026-08-01T12:00:00.000Z",
          elapsedMs: 3_661_000,
          elapsedReceivedAt: "2026-08-01T12:00:00.000Z",
          tasks: [],
        }]}
      />
    );

    expect(screen.getByRole("timer", {
      name: "Durée totale du traitement classique : 00:01:05",
    })).toBeInTheDocument();
    expect(screen.getByRole("timer", {
      name: "Durée totale du multi encodage : 01:01:01",
    })).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("timer", {
      name: "Durée totale du traitement classique : 00:01:06",
    })).toBeInTheDocument();
    expect(screen.getByRole("timer", {
      name: "Durée totale du multi encodage : 01:01:02",
    })).toBeInTheDocument();

    unmount();
  });

  test("propose de fermer la fenêtre seulement quand tous les traitements sont terminés", () => {
    const onClose = jest.fn();
    render(
      <TaskHistory
        onClose={onClose}
        tasks={[{
          id: "classic-completed",
          label: "Film classique terminé",
          completed: true,
          startedAt: "2026-08-01T10:00:00.000Z",
          completedAt: "2026-08-01T10:05:00.000Z",
          steps: [],
        }]}
        distributedJobs={[{
          id: "distributed-completed",
          title: "Film distribué terminé",
          status: "COMPLETED",
          startedAt: "2026-08-01T10:00:00.000Z",
          completedAt: "2026-08-01T10:03:00.000Z",
          tasks: [],
        }]}
      />
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Fermer les traitements terminés",
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
