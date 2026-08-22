import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminExperimentalFeatures from "./AdminExperimentalFeatures";
import api from "../services/api";

jest.mock("../services/api", () => ({
  patch: jest.fn(),
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
}));

const settingResponse = { data: { active: false } };

const mockAdminApi = ({ gradeId = 1, role = "primary" } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.startsWith("/app-settings/")) return Promise.resolve(settingResponse);
    if (url === "/ai-subtitles/config") {
      return Promise.resolve({
        data: { active: false, environmentEnabled: true, languages: [] },
      });
    }
    if (url === "/users/me") return Promise.resolve({ data: { GradeID: gradeId } });
    if (url === "/video-encoding/config") {
      return Promise.resolve({
        data: {
          enabled: false,
          instanceRole: role,
          activeCloneCount: role === "primary" ? 1 : 0,
        },
      });
    }
    if (url === "/video-encoding/workers") {
      return Promise.resolve({
        data: {
          workers: [
            {
              id: "clone-01",
              displayName: "Clone de calcul 01",
              role: "clone",
              enabled: true,
              draining: false,
              status: "online",
              ffmpegVersion: "7.1",
              maxNominalHeight: 1080,
              maxSlots: 1,
              activeLeaseCount: 0,
            },
          ],
        },
      });
    }
    return Promise.reject(new Error(`GET inattendu : ${url}`));
  });
};

describe("AdminExperimentalFeatures - encodage multi-server", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.patch.mockReset();
    api.post.mockReset();
    api.put.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("ne consulte ni n'affiche la configuration pour un administrateur Grade 2", async () => {
    mockAdminApi({ gradeId: 2 });
    render(<AdminExperimentalFeatures />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/users/me"));
    expect(api.get).not.toHaveBeenCalledWith("/video-encoding/config");
    expect(screen.queryByText("Encodage multi-server")).not.toBeInTheDocument();
    expect(screen.queryByText("Registre des clones")).not.toBeInTheDocument();
  });

  test("n'affiche pas la carte au superadmin d'un clone", async () => {
    mockAdminApi({ gradeId: 1, role: "clone" });
    render(<AdminExperimentalFeatures />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/video-encoding/config");
    });
    expect(api.get).not.toHaveBeenCalledWith("/video-encoding/workers");
    expect(screen.queryByText("Encodage multi-server")).not.toBeInTheDocument();
  });

  test("affiche le registre et active le toggle via l'API dédiée", async () => {
    mockAdminApi({ gradeId: 1, role: "primary" });
    api.put.mockResolvedValue({
      data: {
        enabled: true,
        instanceRole: "primary",
        activeCloneCount: 1,
      },
    });
    render(<AdminExperimentalFeatures />);

    expect(await screen.findByText("Clone de calcul 01")).toBeInTheDocument();
    expect(screen.getByText("Registre des clones")).toBeInTheDocument();
    expect(screen.getByText("1 actif")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Activer l'encodage multi-server" })
    );

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/video-encoding/config", {
        enabled: true,
      });
    });
    expect(await screen.findByText("Encodage multi-server activé.")).toBeInTheDocument();
  });

  test("permet d'ajouter un clone sans modifier le code", async () => {
    mockAdminApi({ gradeId: 1, role: "primary" });
    api.post.mockResolvedValue({
      data: {
        worker: {
          id: "Sami-clone-aero15XC",
          displayName: "Aero 15 XC",
          role: "CLONE",
          enabled: true,
          status: "offline",
          performanceScore: 25,
          maxNominalHeight: 2160,
        },
      },
    });
    render(<AdminExperimentalFeatures />);

    await screen.findByText("Registre des clones");
    fireEvent.change(screen.getByLabelText("SAMI_INSTANCE_ID exact"), {
      target: { value: "Sami-clone-aero15XC" },
    });
    fireEvent.change(screen.getByLabelText("Nom affiché"), {
      target: { value: "Aero 15 XC" },
    });
    fireEvent.change(screen.getByLabelText("Priorité de performance"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le clone" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/video-encoding/workers", {
        instanceId: "Sami-clone-aero15XC",
        displayName: "Aero 15 XC",
        performanceScore: 25,
        maxNominalHeight: 2160,
        enabled: true,
      });
    });
    expect(await screen.findByText("Aero 15 XC")).toBeInTheDocument();
  });

  test("active le sous-titrage IA via sa configuration dédiée", async () => {
    mockAdminApi({ gradeId: 1, role: "primary" });
    api.put.mockImplementation((url) => {
      if (url === "/ai-subtitles/config") {
        return Promise.resolve({
          data: { active: true, environmentEnabled: true, languages: [] },
        });
      }
      return Promise.resolve({ data: {} });
    });
    render(<AdminExperimentalFeatures />);

    const toggle = await screen.findByRole("button", {
      name: "Activer les sous-titres générés par IA",
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      "/ai-subtitles/config",
      { active: true }
    ));
    expect(await screen.findByText("Génération locale des sous-titres IA activée."))
      .toBeInTheDocument();
  });
});
