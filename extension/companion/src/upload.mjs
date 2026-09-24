import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import crypto from "node:crypto";

const fieldPart = (boundary, name, value) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value ?? ""}\r\n`);

export async function uploadToSami({ apiBaseUrl, accessToken, filePath, metadata, allowUnauthorizedTls = false }) {
  const endpoint = metadata.encodingMode === "distributed"
    ? "/api/video-encoding/extension-jobs"
    : "/api/videos/extension-import";
  const target = new URL(endpoint, apiBaseUrl);
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
    const imageName = String(metadata.image.name || "affiche.jpg").replace(/["\r\n]/g, "");
    const imageType = /^image\/[a-z0-9.+-]+$/i.test(metadata.image.type || "")
      ? metadata.image.type
      : "application/octet-stream";
    imagePart = Buffer.concat([
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${imageName}"\r\nContent-Type: ${imageType}\r\n\r\n`),
      imageBuffer,
    ]);
  }
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const contentLength = fields.reduce((total, part) => total + part.length, 0) + fileHeader.length + fs.statSync(filePath).size + imagePart.length + suffix.length;
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": contentLength },
      ...(target.protocol === "https:" ? { rejectUnauthorized: !allowUnauthorizedTls } : {}),
    }, (response) => {
      let body = "";
      response.setEncoding("utf8"); response.on("data", (chunk) => { body = `${body}${chunk}`.slice(-20000); });
      response.on("end", () => {
        let payload = {}; try { payload = JSON.parse(body); } catch {}
        if ((response.statusCode || 500) >= 400) reject(new Error(payload.error || `SAMI a répondu ${response.statusCode}.`));
        else resolve(payload);
      });
    });
    request.on("error", reject);
    for (const part of fields) request.write(part);
    request.write(fileHeader);
    fs.createReadStream(filePath).on("error", reject).on("end", () => {
      if (imagePart.length) request.write(imagePart);
      request.end(suffix);
    }).pipe(request, { end: false });
  });
}
