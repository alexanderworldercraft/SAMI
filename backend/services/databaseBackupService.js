import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.join(__dirname, "../uploads/BDD");

const pad = (value) => String(value).padStart(2, "0");

const buildBackupFilename = ({ kind = "auto" } = {}) => {
  const timestamp = new Date();
  const year = timestamp.getFullYear();
  const month = pad(timestamp.getMonth() + 1);
  const day = pad(timestamp.getDate());
  const dbName = process.env.DB_NAME || "database";

  if (kind === "manual") {
    const hours = pad(timestamp.getHours());
    const minutes = pad(timestamp.getMinutes());
    const seconds = pad(timestamp.getSeconds());
    return `BDD_${dbName}_${year}-${month}-${day}_${hours}-${minutes}-${seconds}_manual.sql`;
  }

  return `BDD_${dbName}_${year}-${month}-${day}.sql`;
};

export function getBackupDirectory() {
  return BACKUP_DIR;
}

export function createDatabaseBackup({ kind = "auto" } = {}) {
  return new Promise((resolve, reject) => {
    const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

    if (!DB_HOST || !DB_USER || !DB_NAME) {
      reject(new Error("Configuration de sauvegarde incomplète : DB_HOST, DB_USER ou DB_NAME manquant."));
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const filename = buildBackupFilename({ kind });
    const filePath = path.join(BACKUP_DIR, filename);
    const output = fs.createWriteStream(filePath);
    const args = ["-h", DB_HOST, "-u", DB_USER, DB_NAME];

    const dump = spawn("mysqldump", args, {
      env: {
        ...process.env,
        ...(DB_PASSWORD ? { MYSQL_PWD: DB_PASSWORD } : {}),
      },
    });

    let stderr = "";
    let dumpCode = null;
    let outputFinished = false;
    let settled = false;

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      fs.rm(filePath, { force: true }, () => {});
      reject(error);
    };

    const resolveWhenReady = () => {
      if (settled || dumpCode === null || !outputFinished) return;

      if (dumpCode !== 0) {
        rejectOnce(new Error(stderr || `mysqldump terminé avec le code ${dumpCode}.`));
        return;
      }

      settled = true;
      resolve({
        filename,
        filePath,
        relativePath: `/uploads/BDD/${filename}`,
      });
    };

    dump.stdout.pipe(output);
    dump.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    dump.on("error", (error) => {
      output.destroy();
      rejectOnce(error);
    });

    output.on("error", (error) => {
      dump.kill();
      rejectOnce(error);
    });

    output.on("finish", () => {
      outputFinished = true;
      resolveWhenReady();
    });

    dump.on("close", (code) => {
      dumpCode = code;
      resolveWhenReady();
    });
  });
}
