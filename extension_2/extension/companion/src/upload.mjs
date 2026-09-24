import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import crypto from "node:crypto";

const fieldPart = (boundary, name, value) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value ?? ""}\r\n`);

export async function uploadToSami({ apiBaseUrl, accessToken, filePath, metadata, allowUnauthorizedTls = false, signal }) {
  const endpoint = metadata.encodingMode === "distributed"
    ? "/api/video-encoding/extension-jobs"
    : "/api/videos/extension-import";
  const target = new URL(String(apiBaseUrl).replace(/\/$/, "") + endpoint);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.search || target.hash) throw new Error("URL d’instance invalide.");
  if (target.protocol !== "https:" && target.hostname !== "localhost" && target.hostname !== "127.0.0.1") {
    throw new Error("L'import SAMI exige HTTPS hors localhost.");
  }
  const boundary = `sami-extension-${crypto.randomBytes(18).toString("hex")}`;
  const fields = [
    fieldPart(boundary, "titre", metadata.titre),
    fieldPart(boundary, "resumer", metadata.resumer || ""),
    fieldPart(boundary, "SaisonID", metadata.SaisonID || ""),
    fieldPart(boundary, "genres", JSON.stringify(metadata.genres || [])),
  ];
  const filename = path.basename(filePath).replace(/["\r\n]/g, "");
  const fileHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  let imagePart = Buffer.alloc(0);
  if (metadata.image?.data) {
    const imageBuffer = Buffer.from(metadata.image.data, "base64");
    const formats = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
    const imageType = metadata.image.type;
    if (!formats[imageType] || imageBuffer.length > 10 * 1024 * 1024) throw new Error("Affiche invalide : JPG, PNG, WebP ou GIF, maximum 10 Mo.");
    const imageName = `affiche.${formats[imageType]}`;
    imagePart = Buffer.concat([
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${imageName}"\r\nContent-Type: ${imageType}\r\n\r\n`),
      imageBuffer,
    ]);
  }
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const contentLength = fields.reduce((total, part) => total + part.length, 0) + fileHeader.length + fs.statSync(filePath).size + imagePart.length + suffix.length;
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const file = fs.createReadStream(filePath);
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; file.destroy(); request.destroy();
      error ? reject(error) : resolve(result);
    };
    const request = transport.request(target, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": contentLength },
      ...(target.protocol === "https:" ? { rejectUnauthorized: !allowUnauthorizedTls } : {}),
    }, (response) => {
      let body = "";
      response.setEncoding("utf8"); response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) request.destroy(new Error("Réponse de l’application trop volumineuse."));
      });
      response.on("error", (error) => finish(error));
      response.on("end", () => {
        let payload; try { payload = JSON.parse(body); } catch {}
        const status = response.statusCode || 500;
        if (status < 200 || status >= 300) finish(new Error(payload?.error || `L’application a répondu HTTP ${status}. ${status === 504 ? "Résultat incertain : vérifiez SAMI avant de relancer." : "Vérifiez l’URL configurée et vos droits."}`));
        else if (!payload || typeof payload !== "object" || payload.error) finish(new Error(payload?.error || "Réponse d’import invalide : aucun succès confirmé par l’application."));
        else finish(null, payload);
      });
    });
    request.setTimeout(15 * 60 * 1000, () => request.destroy(new Error("Délai de réponse dépassé : vérifiez SAMI avant de relancer.")));
    request.on("error", (error) => finish(error));
    for (const part of fields) request.write(part);
    request.write(fileHeader);
    file.on("error", (error) => request.destroy(error)).on("end", () => {
      if (imagePart.length) request.write(imagePart);
      request.end(suffix);
    }).pipe(request, { end: false });
  });
}
