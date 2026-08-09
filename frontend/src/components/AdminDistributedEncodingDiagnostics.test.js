import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminDistributedEncodingDiagnostics, {
  buildDistributedEncodingDiagnostic,
  countDistributedEncodingIncidents,
} from "./AdminDistributedEncodingDiagnostics";
import api from "../services/api";

jest.mock("../services/api", () => ({
  get: jest.fn(),
}));

const completedWithRetry = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Gros contenu terminé",
  status: "COMPLETED",
  sourceSize: "10737418240",
  createdAt: "2026-08-07T08:00:00.000Z",
  tasks: [
    {
      id: "task-1",
      attempts: [
        {
          id: "attempt-1",
          workerId: "clone-01",
          status: "CANCELLED",
          error: "Le primary est indisponible.",
        },
        {
          id: "attempt-2",
          workerId: "clone-02",
          status: "SUCCEEDED",
          error: null,
        },
      ],
    },
  ],
};

const cleanComparison = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Contenu de comparaison",
  status: "COMPLETED",
  sourceSize: "8589934592",
  createdAt: "2026-08-06T08:00:00.000Z",
  tasks: [{ id: "task-2", attempts: [{ status: "SUCCEEDED" }] }],
};

const olderJob = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Ancien contenu",
  status: "COMPLETED",
  sourceSize: "1024",
  createdAt: "2026-07-01T08:00:00.000Z",
  tasks: [],
};

const retention = {
  checkedAt: "2026-08-07T10:00:00.000Z",
  artifactRetentionDays: 1,
  jobRetentionDays: 30,
  jobs: {
    total: 27,
    eligibleForPurge: 0,
    oldestTerminalCompletedAt: "2026-07-10T08:00:00.000Z",
  },
  artifacts: {
    total: 420,
    eligibleForPurge: 0,
    oldestTerminalCreatedAt: "2026-08-06T12:00:00.000Z",
  },
};

const mockPrimaryApi = () => {
  api.get.mockImplementation((url) => {
    if (url === "/users/me") return Promise.resolve({ data: { GradeID: 1 } });
    if (url === "/video-encoding/config") {
      return Promise.resolve({
        data: { instanceRole: "primary", enabled: true, pipelineVersion: "pipeline-v1" },
      });
    }
    if (url === "/video-encoding/jobs?page=1&limit=25&includeRetention=true") {
      return Promise.resolve({
        data: {
          jobs: [completedWithRetry, cleanComparison],
          pagination: {
            page: 1,
            limit: 25,
            total: 27,
            totalPages: 2,
            hasPreviousPage: false,
            hasNextPage: true,
          },
          retention,
        },
      });
    }
    if (url === "/video-encoding/jobs?page=2&limit=25&includeRetention=true") {
      return Promise.resolve({
        data: {
          jobs: [olderJob],
          pagination: {
            page: 2,
            limit: 25,
            total: 27,
            totalPages: 2,
            hasPreviousPage: true,
            hasNextPage: false,
          },
          retention,
        },
      });
    }
    if (url === `/video-encoding/jobs/${completedWithRetry.id}`) {
      return Promise.resolve({ data: { job: completedWithRetry } });
    }
    if (url === `/video-encoding/jobs/${cleanComparison.id}`) {
      return Promise.resolve({ data: { job: cleanComparison } });
    }
    if (url === "/video-encoding/workers") {
      return Promise.resolve({ data: { workers: [{ id: "clone-01", status: "online" }] } });
    }
    return Promise.reject(new Error(`GET inattendu : ${url}`));
  });
};

describe("AdminDistributedEncodingDiagnostics", () => {
  beforeEach(() => {
    api.get.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("compte les tentatives interrompues même lorsque le job est terminé", () => {
    expect(countDistributedEncodingIncidents(completedWithRetry)).toBe(1);
    expect(countDistributedEncodingIncidents(cleanComparison)).toBe(0);
  });

  test("reste masqué pour un administrateur qui n'est pas super administrateur", async () => {
    api.get.mockResolvedValueOnce({ data: { GradeID: 2 } });
    render(<AdminDistributedEncodingDiagnostics />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/users/me"));
    expect(api.get).not.toHaveBeenCalledWith("/video-encoding/config");
    expect(screen.queryByText("Diagnostic encodage multi-server")).not.toBeInTheDocument();
  });

  test("reste masqué sur un clone", async () => {
    api.get
      .mockResolvedValueOnce({ data: { GradeID: 1 } })
      .mockResolvedValueOnce({ data: { instanceRole: "clone", enabled: true } });
    render(<AdminDistributedEncodingDiagnostics />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/video-encoding/config"));
    expect(api.get).not.toHaveBeenCalledWith(
      "/video-encoding/jobs?page=1&limit=25&includeRetention=true"
    );
    expect(screen.queryByText("Diagnostic encodage multi-server")).not.toBeInTheDocument();
  });

  test("sélectionne un job terminé avec incident et propose une comparaison propre", async () => {
    mockPrimaryApi();
    render(<AdminDistributedEncodingDiagnostics />);

    expect(await screen.findByText("Diagnostic encodage multi-server")).toBeInTheDocument();
    expect(screen.getByLabelText("Job problématique")).toHaveValue(completedWithRetry.id);
    expect(screen.getByLabelText("Job de comparaison")).toHaveValue(cleanComparison.id);
    expect(screen.getByText("Tentatives en incident")).toBeInTheDocument();
    expect(screen.getByText("Page 1 sur 2 · 27 jobs conservés")).toBeInTheDocument();
    expect(screen.getByText("Artefacts · 1 jour")).toBeInTheDocument();
    expect(screen.getByText("Jobs · 30 jours")).toBeInTheDocument();
  });

  test("navigue entre les pages sans perdre les deux sélections", async () => {
    mockPrimaryApi();
    render(<AdminDistributedEncodingDiagnostics />);

    await screen.findByText("Page 1 sur 2 · 27 jobs conservés");
    fireEvent.click(screen.getByRole("button", { name: "Page suivante" }));

    expect(await screen.findByText("Page 2 sur 2 · 27 jobs conservés")).toBeInTheDocument();
    expect(screen.getByLabelText("Job problématique")).toHaveValue(completedWithRetry.id);
    expect(screen.getByLabelText("Job de comparaison")).toHaveValue(cleanComparison.id);
    expect(api.get).toHaveBeenCalledWith(
      "/video-encoding/jobs?page=2&limit=25&includeRetention=true"
    );
  });

  test("collecte les détails et déclenche le téléchargement JSON", async () => {
    mockPrimaryApi();
    const createObjectURL = jest.fn(() => "blob:diagnostic");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<AdminDistributedEncodingDiagnostics />);
    await screen.findByText("Diagnostic encodage multi-server");
    fireEvent.click(screen.getByRole("button", { name: "Télécharger le diagnostic JSON" }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`/video-encoding/jobs/${completedWithRetry.id}`);
      expect(api.get).toHaveBeenCalledWith(`/video-encoding/jobs/${cleanComparison.id}`);
      expect(api.get).toHaveBeenCalledWith("/video-encoding/workers");
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
    expect(api.get).toHaveBeenCalledTimes(7);
    expect(api.get).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/video-encoding\/jobs\?.*limit=100/)
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:diagnostic");
    expect(await screen.findByText(/Diagnostic téléchargé avec 1 tentative en incident/)).toBeInTheDocument();
  });

  test("construit un bundle explicite sans donnée d'authentification", () => {
    const diagnostic = buildDistributedEncodingDiagnostic({
      generatedAt: "2026-08-07T10:00:00.000Z",
      configuration: { instanceRole: "primary" },
      workers: [{ id: "clone-01" }],
      retention,
      incidentJob: completedWithRetry,
      comparisonJob: cleanComparison,
    });

    expect(diagnostic.schemaVersion).toBe(2);
    expect(diagnostic.collection.selectedJobCount).toBe(2);
    expect(diagnostic.summary).toEqual(expect.objectContaining({
      incidentAttemptCount: 1,
      incidentJobCompleted: true,
      comparisonAttemptCount: 0,
    }));
    expect(diagnostic.distributedEncoding).not.toHaveProperty("recentJobs");
    expect(diagnostic.distributedEncoding.retention).toEqual(retention);
    expect(JSON.stringify(diagnostic)).not.toMatch(/sami_token|authorization|jwt/i);
  });
});
