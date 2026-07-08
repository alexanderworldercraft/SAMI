import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BACKEND_ROOT = path.resolve(__dirname, "../..");
export const UPLOADS_ROOT = path.join(BACKEND_ROOT, "uploads");
export const VIDEO_ROOT = path.join(UPLOADS_ROOT, "video");
export const TEMP_ROOT = path.join(UPLOADS_ROOT, "tmp");
export const IMAGE_ROOT = path.join(UPLOADS_ROOT, "images");
export const ERROR_ROOT = path.join(UPLOADS_ROOT, "Error_videos");

export const removeStoredPath = (relativePath, { recursive = false } = {}) => {
  if (!relativePath || relativePath.includes("default")) return;

  const cleanedRel = relativePath.replace(/^[/\\]+/, "");
  const absolutePath = path.join(BACKEND_ROOT, cleanedRel);
  const normalizedRoot = path.resolve(UPLOADS_ROOT);
  const normalizedTarget = path.resolve(absolutePath);

  if (!normalizedTarget.startsWith(normalizedRoot) || !fs.existsSync(normalizedTarget)) return;

  try {
    fs.rmSync(normalizedTarget, { recursive, force: true });
  } catch (error) {
    console.warn("Suppression du fichier vidéo échouée :", error.message);
  }
};

export const resolveUploadPath = (relativePath) => {
  if (!relativePath) return null;

  const cleanedRel = String(relativePath).replace(/^[/\\]+/, "");
  const absolutePath = path.resolve(BACKEND_ROOT, cleanedRel);
  const normalizedUploadsRoot = path.resolve(UPLOADS_ROOT);

  if (!absolutePath.startsWith(normalizedUploadsRoot)) return null;
  return absolutePath;
};
