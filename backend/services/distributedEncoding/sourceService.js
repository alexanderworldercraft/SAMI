import crypto from "crypto";
import fs from "fs";
import path from "path";
import { finished, pipeline } from "stream/promises";

import { MULTIPART_LIMITS } from "../../constants.js";
import { getDistributedEncodingConfig } from "./config.js";
import { distributedEncodingError } from "./error.js";

const VIDEO_EXTENSIONS = new Set([
  ".avi",
  ".mov",
  ".mkv",
  ".webm",
  ".flv",
  ".wmv",
  ".mp4",
]);
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
]);
const SAFE_JOB_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertJobId = (jobId) => {
  const normalized = String(jobId || "").toLowerCase();
  if (!SAFE_JOB_ID.test(normalized)) {
    throw distributedEncodingError(
      "L'identifiant du job est invalide.",
      "INVALID_VIDEO_ENCODING_JOB_ID"
    );
  }
  return normalized;
};

const assertInside = (root, target) => {
  const normalizedRoot = `${path.resolve(root)}${path.sep}`;
  const normalizedTarget = path.resolve(target);
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    throw distributedEncodingError(
      "Le chemin de source sort du stockage privé.",
      "VIDEO_ENCODING_SOURCE_SCOPE_ERROR",
      500
    );
  }
  return normalizedTarget;
};

const assignTextField = (data, fieldName, value) => {
  const normalizedField = String(fieldName || "").trim();
  const lowerName = normalizedField.toLowerCase();
  const compactName = lowerName.replace(/[^a-z0-9]/g, "");
  const fieldValue = String(value ?? "").trim();

  data[normalizedField] = fieldValue;
  if (lowerName === "titre") data.titre = fieldValue;
  if (lowerName === "resumer") data.resumer = fieldValue;
  if (compactName === "genres") data.genres = fieldValue;
  if (compactName === "saisonid") data.SaisonID = fieldValue;
};

const drainFile = async (stream) => {
  stream.resume();
  await finished(stream).catch(() => {});
};

export function getDistributedJobPaths(jobId, env = process.env) {
  const id = assertJobId(jobId);
  const config = getDistributedEncodingConfig(env);
  const sourceRoot = path.join(config.sourceRoot, id);
  const stagingRoot = path.join(config.stagingRoot, id);
  return {
    id,
    sourceRoot,
    sourceDir: path.join(sourceRoot, "source"),
    imageDir: path.join(sourceRoot, "image"),
    subtitlesDir: path.join(sourceRoot, "subtitles"),
    stagingRoot,
    attemptsRoot: path.join(stagingRoot, "attempts"),
    acceptedRoot: path.join(stagingRoot, "accepted"),
    acceptedHlsDir: path.join(stagingRoot, "accepted", "hls"),
  };
}

export async function createDistributedJobWorkspace(jobId, env = process.env) {
  const paths = getDistributedJobPaths(jobId, env);
  await Promise.all(
    [
      paths.sourceDir,
      paths.imageDir,
      paths.subtitlesDir,
      paths.attemptsRoot,
      paths.acceptedHlsDir,
    ].map((directory) => fs.promises.mkdir(directory, { recursive: true }))
  );
  return paths;
}

export async function readDistributedVideoMultipart({ request, jobId }) {
  if (!/multipart\/form-data/i.test(request.headers["content-type"] || "")) {
    throw distributedEncodingError(
      "Un formulaire multipart avec un fichier vidéo est requis.",
      "VIDEO_ENCODING_MULTIPART_REQUIRED"
    );
  }

  const paths = await createDistributedJobWorkspace(jobId);
  const config = getDistributedEncodingConfig();
  const data = {};
  let sourcePath = null;
  let sourceRelativePath = null;
  let sourceSha256 = null;
  let sourceSize = 0;
  const parts = request.parts({
    limits: { fileSize: MULTIPART_LIMITS.VIDEO_FILE_SIZE },
  });

  try {
    for await (const part of parts) {
      if (part.type !== "file") {
        assignTextField(data, part.fieldname, part.value);
        continue;
      }

      const originalName = path.basename(part.filename || "");
      const extension = path.extname(originalName).toLowerCase();
      const mimeType = String(part.mimetype || "").toLowerCase();
      const isVideo =
        VIDEO_EXTENSIONS.has(extension)
        && (mimeType.startsWith("video/") || mimeType === "application/octet-stream");
      const isImage = IMAGE_EXTENSIONS.has(extension) && mimeType.startsWith("image/");

      if (!isVideo && !isImage) {
        await drainFile(part.file);
        continue;
      }
      if (isVideo && sourcePath) {
        await drainFile(part.file);
        throw distributedEncodingError(
          "Un seul fichier vidéo peut être importé à la fois.",
          "MULTIPLE_VIDEO_SOURCES"
        );
      }

      const destination = isVideo
        ? path.join(paths.sourceDir, `source${extension}`)
        : path.join(paths.imageDir, `affiche${extension}`);
      const partial = `${destination}.part`;
      const hash = isVideo ? crypto.createHash("sha256") : null;
      let bytes = 0;
      part.file.on("data", (chunk) => {
        bytes += chunk.length;
        hash?.update(chunk);
      });
      await pipeline(part.file, fs.createWriteStream(partial, { flags: "wx" }));

      if (isImage && bytes > MULTIPART_LIMITS.IMAGE_FILE_SIZE) {
        await fs.promises.rm(partial, { force: true });
        throw distributedEncodingError(
          "L'image dépasse la taille autorisée.",
          "IMAGE_FILE_TOO_LARGE",
          413
        );
      }
      await fs.promises.rename(partial, destination);

      if (isVideo) {
        data.videoOriginalName = originalName;
        sourcePath = destination;
        sourceRelativePath = path
          .relative(config.sourceRoot, destination)
          .split(path.sep)
          .join("/");
        sourceSha256 = hash.digest("hex");
        sourceSize = bytes;
      } else {
        data.imageTempPath = destination;
        data.imageTempExt = extension;
        data.imageRelativePath = path
          .relative(config.sourceRoot, destination)
          .split(path.sep)
          .join("/");
      }
    }
  } catch (error) {
    await fs.promises.rm(paths.sourceRoot, { recursive: true, force: true });
    await fs.promises.rm(paths.stagingRoot, { recursive: true, force: true });
    throw error;
  }

  if (!sourcePath) {
    throw distributedEncodingError(
      "Aucun fichier vidéo fourni.",
      "VIDEO_SOURCE_REQUIRED"
    );
  }

  return {
    data,
    paths,
    sourcePath,
    sourceRelativePath,
    sourceOriginalName: data.videoOriginalName,
    sourceSha256,
    sourceSize,
  };
}

export function resolveDistributedSourcePath(relativePath, env = process.env) {
  const config = getDistributedEncodingConfig(env);
  const normalized = String(relativePath || "");
  if (
    !normalized
    || normalized.includes("\\")
    || normalized.includes("%")
    || path.posix.isAbsolute(normalized)
    || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw distributedEncodingError(
      "Le chemin de source est invalide.",
      "INVALID_VIDEO_ENCODING_SOURCE_PATH",
      500
    );
  }
  return assertInside(config.sourceRoot, path.join(config.sourceRoot, ...normalized.split("/")));
}

export async function openDistributedSource({ relativePath, offset = 0 }) {
  const sourcePath = resolveDistributedSourcePath(relativePath);
  const stats = await fs.promises.stat(sourcePath);
  const parsedOffset = Number(offset);
  if (
    !stats.isFile()
    || !Number.isSafeInteger(parsedOffset)
    || parsedOffset < 0
    || parsedOffset > stats.size
  ) {
    throw distributedEncodingError(
      "La plage demandée pour la source est invalide.",
      "INVALID_VIDEO_ENCODING_SOURCE_RANGE",
      416
    );
  }
  return {
    sourcePath,
    size: stats.size,
    offset: parsedOffset,
    length: stats.size - parsedOffset,
    stream: fs.createReadStream(sourcePath, { start: parsedOffset }),
  };
}

export async function cleanupDistributedJobFiles(jobId, {
  includeSource = true,
  includeStaging = true,
} = {}) {
  const paths = getDistributedJobPaths(jobId);
  const removals = [];
  if (includeSource) {
    removals.push(fs.promises.rm(paths.sourceRoot, { recursive: true, force: true }));
  }
  if (includeStaging) {
    removals.push(fs.promises.rm(paths.stagingRoot, { recursive: true, force: true }));
  }
  await Promise.all(removals);
}
