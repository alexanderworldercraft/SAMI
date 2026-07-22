export function parsePublicOrigins(publicUrl) {
  return String(publicUrl || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function parseServerPort(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("La variable PORTS doit contenir un port valide.");
  }

  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("La variable PORTS doit être comprise entre 1 et 65535.");
  }

  return port;
}

export function buildBackupCronExpression(dayOfWeek = "0", time = "00:00") {
  const day = String(dayOfWeek).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);

  if (!/^[0-7]$/.test(day) || !match || hours > 23 || minutes > 59) {
    throw new Error("Configuration BACKUP_DAY_OF_WEEK/BACKUP_TIME invalide.");
  }

  return `${minutes} ${hours} * * ${day}`;
}
