import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import NewVideoForm from "./NewVideoForm";
import api from "../services/api";
import {
  DISTRIBUTED_ENCODING_TOOLTIP,
  NO_ENCODING_WORKER_MESSAGE,
} from "../utils/videoEncoding";

jest.mock("../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("./GenreList", () => () => null);
jest.mock("./SeriesAndSeasonSelector", () => () => null);
jest.mock("./ImageUploader", () => ({ setImage }) => (
  <input
    aria-label="Image de test"
    type="file"
    onChange={(event) => setImage(event.target.files[0])}
  />
));
jest.mock("./Notification", () => ({ message, duration }) => (
  <div role="status" data-duration={duration}>{message}</div>
));

const primaryConfig = {
  enabled: true,
  canStart: true,
  instanceRole: "primary",
  activeCloneCount: 1,
};

const onlineWorker = {
  id: "clone-01",
  displayName: "Clone 01",
  role: "clone",
  enabled: true,
  draining: false,
  status: "online",
};

const fillRequiredFields = (container) => {
  fireEvent.change(container.querySelector('input[type="text"]'), {
    target: { value: "Vidéo distribuée" },
  });
  fireEvent.change(container.querySelectorAll('input[type="file"]')[0], {
    target: { files: [new File(["image"], "poster.png", { type: "image/png" })] },
  });
  fireEvent.change(container.querySelectorAll('input[type="file"]')[1], {
    target: { files: [new File(["video"], "source.mp4", { type: "video/mp4" })] },
  });
};

describe("NewVideoForm - encodage multi-server", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.get.mockResolvedValue({ data: [] });
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ["un administrateur non superadmin", { GradeID: 2 }, primaryConfig],
    ["un superadmin sur un clone", { GradeID: 1 }, { ...primaryConfig, instanceRole: "clone" }],
    ["un toggle désactivé", { GradeID: 1 }, { ...primaryConfig, enabled: false }],
  ])("n'affiche aucun groupe pour %s", async (_label, user, config) => {
    render(
      <NewVideoForm
        user={user}
        videoEncodingConfig={config}
        videoEncodingWorkers={[onlineWorker]}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Ajouter la vidéo via le multi server" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Encodage multi-server expérimental")).not.toBeInTheDocument();
  });

  test("désactive l'action et fournit un vrai tooltip accessible sans clone actif", () => {
    render(
      <NewVideoForm
        user={{ GradeID: 1 }}
        videoEncodingConfig={{ ...primaryConfig, canStart: false, activeCloneCount: 0 }}
        videoEncodingWorkers={[]}
      />
    );

    const button = screen.getByRole("button", {
      name: "Ajouter la vidéo via le multi server",
    });
    const tooltipAnchor = screen.getByLabelText(
      "Informations sur l'encodage multi-server"
    );
    const tooltip = screen.getByRole("tooltip", { hidden: true });

    expect(button).toBeDisabled();
    expect(screen.getByText(NO_ENCODING_WORKER_MESSAGE)).toBeInTheDocument();
    expect(tooltip).not.toBeVisible();

    fireEvent.focus(tooltipAnchor);
    expect(tooltip).toBeVisible();
    expect(tooltip).toHaveTextContent(DISTRIBUTED_ENCODING_TOOLTIP);

    fireEvent.keyDown(tooltipAnchor, { key: "Escape" });
    expect(tooltip).not.toBeVisible();
  });

  test("crée un job multipart via l'API dédiée", async () => {
    jest.spyOn(HTMLFormElement.prototype, "reportValidity").mockReturnValue(true);
    const onDistributedJobCreated = jest.fn();
    api.post.mockResolvedValue({
      status: 202,
      data: {
        job: {
          id: "job-01",
          title: "Vidéo distribuée",
          status: "QUEUED",
          progress: 0,
          tasks: [],
        },
      },
    });
    const { container } = render(
      <NewVideoForm
        user={{ GradeID: 1, UtilisateurID: 7 }}
        videoEncodingConfig={primaryConfig}
        videoEncodingWorkers={[onlineWorker]}
        onDistributedJobCreated={onDistributedJobCreated}
      />
    );
    fillRequiredFields(container);

    fireEvent.click(
      screen.getByRole("button", { name: "Ajouter la vidéo via le multi server" })
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/video-encoding/jobs",
        expect.any(FormData),
        expect.objectContaining({
          headers: {},
          onUploadProgress: expect.any(Function),
        })
      );
    });
    expect(api.post).not.toHaveBeenCalledWith(
      "/videos/add",
      expect.anything(),
      expect.anything()
    );
    expect(onDistributedJobCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-01", status: "queued" })
    );
  });

  test("affiche durablement le détail et le code d'une erreur de création", async () => {
    jest.spyOn(HTMLFormElement.prototype, "reportValidity").mockReturnValue(true);
    api.post.mockRejectedValue({
      response: {
        data: {
          error: "Le libellé technique d'une tâche est trop long.",
          code: "VIDEO_ENCODING_TASK_PROFILE_LABEL_TOO_LONG",
        },
      },
    });
    const { container } = render(
      <NewVideoForm
        user={{ GradeID: 1, UtilisateurID: 7 }}
        videoEncodingConfig={primaryConfig}
        videoEncodingWorkers={[onlineWorker]}
      />
    );
    fillRequiredFields(container);

    fireEvent.click(
      screen.getByRole("button", { name: "Ajouter la vidéo via le multi server" })
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Le libellé technique d'une tâche est trop long. "
          + "Code : VIDEO_ENCODING_TASK_PROFILE_LABEL_TOO_LONG."
      );
    });
    const feedback = screen.getByRole("status");
    expect(feedback).toHaveAttribute("data-duration", "0");
  });

  test("conserve l'ajout classique sur /videos/add", async () => {
    api.post.mockResolvedValue({ data: { message: "Vidéo ajoutée." } });
    const { container } = render(
      <NewVideoForm
        user={{ GradeID: 1, UtilisateurID: 7 }}
        videoEncodingConfig={primaryConfig}
        videoEncodingWorkers={[onlineWorker]}
      />
    );
    fillRequiredFields(container);

    fireEvent.click(screen.getByRole("button", { name: "Ajouter la vidéo" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/videos/add",
        expect.any(FormData),
        { headers: {} }
      );
    });
    expect(api.post).not.toHaveBeenCalledWith(
      "/video-encoding/jobs",
      expect.anything(),
      expect.anything()
    );
  });
});
