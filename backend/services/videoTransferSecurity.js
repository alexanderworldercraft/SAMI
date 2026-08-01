import crypto from "crypto";
import fs from "fs";
import path from "path";

const { createHash, createHmac, randomBytes, timingSafeEqual } = crypto;
const { createReadStream } = fs;
const fsPromises = fs.promises;

export const VIDEO_TRANSFER_MANIFEST_VERSION = 1;
export const TRANSFER_SIGNATURE_VERSION = "1";
export const VIDEO_TRANSFER_SIGNATURE_DOMAIN = "SAMI-VIDEO-TRANSFER-V1";
export const DEFAULT_TRANSFER_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;
export const MAX_TRANSFER_FILE_COUNT = 100_000;
export const MAX_TRANSFER_FILE_SIZE = Number.MAX_SAFE_INTEGER;
export const MAX_HLS_PLAYLIST_BYTES = 10 * 1024 * 1024;

export const TRANSFER_HEADERS = Object.freeze({
  version: "x-sami-transfer-version",
  instanceId: "x-sami-transfer-instance-id",
  timestamp: "x-sami-transfer-timestamp",
  nonce: "x-sami-transfer-nonce",
  bodySha256: "x-sami-transfer-content-sha256",
  signature: "x-sami-transfer-signature",
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_VIDEO_DIRECTORIES = new Set(["hls", "affiche", "sousTitre"]);
const ALLOWED_TRANSFER_EXTENSIONS = Object.freeze({
  hls: new Set([
    ".m3u8",
    ".ts",
    ".m4s",
    ".mp4",
    ".aac",
    ".ac3",
    ".ec3",
    ".vtt",
  ]),
  affiche: new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]),
  sousTitre: new Set([".vtt"]),
});
const WINDOWS_RESERVED_NAME_PATTERN =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export class VideoTransferSecurityError extends Error {
  constructor(message, {
    code = "VIDEO_TRANSFER_SECURITY_ERROR",
    statusCode = 400,
    cause,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "VideoTransferSecurityError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const securityError = (message, code, statusCode = 400, cause) =>
  new VideoTransferSecurityError(message, {
    code,
    statusCode,
    cause,
  });

const isPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * JSON déterministe (clés d'objet triées), utile pour calculer le hash d'un
 * manifeste. Les valeurs non représentables en JSON et les cycles sont refusés.
 */
export const stableStringify = (value) => {
  const ancestors = new Set();

  const serialize = (current, inArray = false) => {
    if (current === null) return "null";

    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }

    if (typeof current === "number") {
      return Number.isFinite(current) ? JSON.stringify(current) : "null";
    }

    if (
      typeof current === "undefined"
      || typeof current === "function"
      || typeof current === "symbol"
    ) {
      return inArray ? "null" : undefined;
    }

    if (typeof current === "bigint") {
      throw securityError(
        "Une valeur BigInt doit être convertie en chaîne avant sérialisation.",
        "INVALID_JSON_VALUE"
      );
    }

    if (typeof current?.toJSON === "function") {
      return serialize(current.toJSON(), inArray);
    }

    if (ancestors.has(current)) {
      throw securityError(
        "La valeur à sérialiser contient une référence circulaire.",
        "CIRCULAR_JSON_VALUE"
      );
    }

    ancestors.add(current);
    let serialized;

    if (Array.isArray(current)) {
      serialized = `[${current.map((entry) => serialize(entry, true)).join(",")}]`;
    } else if (isPlainObject(current)) {
      const entries = Object.keys(current)
        .sort()
        .map((key) => {
          const serializedValue = serialize(current[key], false);
          return serializedValue === undefined
            ? null
            : `${JSON.stringify(key)}:${serializedValue}`;
        })
        .filter(Boolean);
      serialized = `{${entries.join(",")}}`;
    } else {
      ancestors.delete(current);
      throw securityError(
        "Seuls les objets JSON simples peuvent être sérialisés.",
        "INVALID_JSON_VALUE"
      );
    }

    ancestors.delete(current);
    return serialized;
  };

  const result = serialize(value);
  if (result === undefined) {
    throw securityError(
      "La valeur racine n'est pas sérialisable en JSON.",
      "INVALID_JSON_VALUE"
    );
  }
  return result;
};

export const sha256Buffer = (value) => {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError("sha256Buffer attend un Buffer ou un Uint8Array.");
  }
  return createHash("sha256").update(value).digest("hex");
};

export const sha256String = (value) => {
  if (typeof value !== "string") {
    throw new TypeError("sha256String attend une chaîne.");
  }
  return createHash("sha256").update(value, "utf8").digest("hex");
};

export const sha256Stream = async (readable) => {
  if (!readable || typeof readable[Symbol.asyncIterator] !== "function") {
    throw new TypeError("sha256Stream attend un flux Node lisible.");
  }

  const hash = createHash("sha256");
  for await (const chunk of readable) {
    hash.update(chunk);
  }
  return hash.digest("hex");
};

export const sha256File = async (filePathOrStream) => {
  if (
    filePathOrStream
    && typeof filePathOrStream !== "string"
    && typeof filePathOrStream[Symbol.asyncIterator] === "function"
  ) {
    return sha256Stream(filePathOrStream);
  }

  if (typeof filePathOrStream !== "string" || filePathOrStream.length === 0) {
    throw new TypeError("sha256File attend un chemin ou un flux Node lisible.");
  }
  return sha256Stream(createReadStream(filePathOrStream));
};

// Noms courts conservés pour les services de transfert.
export const sha256Hex = (value) =>
  typeof value === "string" ? sha256String(value) : sha256Buffer(value);
export const hashFile = sha256File;

const normalizeDigest = (value, fieldName = "SHA-256") => {
  const normalized = String(value || "").toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw securityError(
      `${fieldName} doit être une empreinte SHA-256 hexadécimale.`,
      "INVALID_SHA256"
    );
  }
  return normalized;
};

const normalizeMethod = (method) => {
  const normalized = String(method || "").toUpperCase();
  if (!/^[A-Z][A-Z0-9!#$%&'*+.^_`|~-]{0,31}$/.test(normalized)) {
    throw securityError("La méthode HTTP est invalide.", "INVALID_HTTP_METHOD");
  }
  return normalized;
};

/**
 * Conserve volontairement le chemin et la query tels que reçus par Node
 * (`request.raw.url`). Aucune URL absolue ni normalisation ne doit intervenir.
 */
export const canonicalRequestPath = (rawUrl) => {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 8192) {
    throw securityError(
      "Le chemin HTTP brut est invalide.",
      "INVALID_REQUEST_PATH"
    );
  }
  if (
    !rawUrl.startsWith("/")
    || rawUrl.startsWith("//")
    || rawUrl.includes("#")
    || /[\u0000-\u001f\u007f]/.test(rawUrl)
  ) {
    throw securityError(
      "Le chemin HTTP signé doit être un chemin brut local avec sa query.",
      "INVALID_REQUEST_PATH"
    );
  }
  return rawUrl;
};

const normalizeTimestamp = (timestamp) => {
  const normalized = String(timestamp ?? "");
  if (!/^[0-9]{13}$/.test(normalized)) {
    throw securityError(
      "L'horodatage signé doit être exprimé en millisecondes Unix.",
      "INVALID_TRANSFER_TIMESTAMP",
      401
    );
  }

  const numeric = Number(normalized);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw securityError(
      "L'horodatage signé est invalide.",
      "INVALID_TRANSFER_TIMESTAMP",
      401
    );
  }
  return { value: normalized, numeric };
};

const normalizeNonce = (nonce) => {
  const normalized = String(nonce || "");
  if (!NONCE_PATTERN.test(normalized)) {
    throw securityError(
      "Le nonce de transfert est invalide.",
      "INVALID_TRANSFER_NONCE",
      401
    );
  }
  return normalized;
};

const normalizeInstanceId = (instanceId, {
  code = "INVALID_TRANSFER_INSTANCE_ID",
  statusCode = 401,
} = {}) => {
  const normalized = String(instanceId || "");
  if (!INSTANCE_ID_PATTERN.test(normalized)) {
    throw securityError(
      "L'identifiant de l'instance source est invalide.",
      code,
      statusCode
    );
  }
  return normalized;
};

const normalizeSecret = (secret) => {
  if (
    !(typeof secret === "string" || Buffer.isBuffer(secret))
    || Buffer.byteLength(secret) < 32
  ) {
    throw securityError(
      "Le secret partagé de transfert doit contenir au moins 32 octets.",
      "INVALID_TRANSFER_SECRET",
      500
    );
  }
  return secret;
};

const normalizeSignatureDomain = (value) => {
  const normalized = String(value || "");
  if (!/^SAMI-[A-Z0-9-]{1,96}$/.test(normalized)) {
    throw securityError(
      "Le domaine de signature est invalide.",
      "INVALID_SIGNATURE_DOMAIN",
      500
    );
  }
  return normalized;
};

const digestForBody = ({ body, bodySha256, bodyDigest }) => {
  const suppliedDigest = bodySha256 ?? bodyDigest;
  if (suppliedDigest !== undefined && suppliedDigest !== null) {
    return normalizeDigest(suppliedDigest, "Le hash du corps");
  }
  if (body === undefined || body === null) return sha256Buffer(Buffer.alloc(0));
  if (typeof body === "string") return sha256String(body);
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    return sha256Buffer(body);
  }
  throw securityError(
    "Un flux doit être haché avant de construire les en-têtes signés.",
    "BODY_DIGEST_REQUIRED"
  );
};

/**
 * Format canonique signé :
 * SAMI-VIDEO-TRANSFER-V1\nMETHOD\n/raw?query\ntimestamp\nnonce\ninstanceId\nbodySha256
 */
export const buildCanonicalTransferRequest = ({
  signatureDomain = VIDEO_TRANSFER_SIGNATURE_DOMAIN,
  method,
  rawPathAndQuery,
  rawPath,
  path: requestPath,
  timestamp,
  nonce,
  sourceInstanceId,
  instanceId,
  bodySha256,
  bodyDigest,
}) => {
  const normalizedMethod = normalizeMethod(method);
  const normalizedPath = canonicalRequestPath(
    rawPathAndQuery ?? rawPath ?? requestPath
  );
  const normalizedTimestamp = normalizeTimestamp(timestamp).value;
  const normalizedNonce = normalizeNonce(nonce);
  const normalizedInstanceId = normalizeInstanceId(
    sourceInstanceId ?? instanceId
  );
  const normalizedBodyDigest = normalizeDigest(
    bodySha256 ?? bodyDigest,
    "Le hash du corps"
  );

  return [
    normalizeSignatureDomain(signatureDomain),
    normalizedMethod,
    normalizedPath,
    normalizedTimestamp,
    normalizedNonce,
    normalizedInstanceId,
    normalizedBodyDigest,
  ].join("\n");
};

export const createTransferSignature = ({
  secret,
  ...canonicalParts
}) => createHmac("sha256", normalizeSecret(secret))
  .update(buildCanonicalTransferRequest(canonicalParts), "utf8")
  .digest("hex");

/**
 * Construit les en-têtes à transmettre. `body` accepte uniquement String/Buffer;
 * pour un fichier ou un flux, fournir son `bodySha256` pré-calculé.
 */
export const buildTransferHeaders = ({
  secret,
  signatureDomain = VIDEO_TRANSFER_SIGNATURE_DOMAIN,
  method,
  rawPathAndQuery,
  rawPath,
  path: requestPath,
  body,
  bodySha256,
  bodyDigest,
  sourceInstanceId,
  instanceId,
  timestamp = Date.now(),
  nonce = randomBytes(24).toString("base64url"),
}) => {
  const normalizedTimestamp = normalizeTimestamp(timestamp).value;
  const normalizedNonce = normalizeNonce(nonce);
  const normalizedInstanceId = normalizeInstanceId(
    sourceInstanceId ?? instanceId
  );
  const normalizedBodyDigest = digestForBody({
    body,
    bodySha256,
    bodyDigest,
  });
  const normalizedPath = rawPathAndQuery ?? rawPath ?? requestPath;
  const signature = createTransferSignature({
    secret,
    signatureDomain,
    method,
    rawPathAndQuery: normalizedPath,
    timestamp: normalizedTimestamp,
    nonce: normalizedNonce,
    sourceInstanceId: normalizedInstanceId,
    bodySha256: normalizedBodyDigest,
  });

  return {
    [TRANSFER_HEADERS.version]: TRANSFER_SIGNATURE_VERSION,
    [TRANSFER_HEADERS.instanceId]: normalizedInstanceId,
    [TRANSFER_HEADERS.timestamp]: normalizedTimestamp,
    [TRANSFER_HEADERS.nonce]: normalizedNonce,
    [TRANSFER_HEADERS.bodySha256]: normalizedBodyDigest,
    [TRANSFER_HEADERS.signature]: signature,
  };
};

const getHeader = (headers, name) => {
  if (!headers) return undefined;

  if (typeof headers.get === "function") {
    return headers.get(name) ?? undefined;
  }

  const expected = name.toLowerCase();
  const matchingKeys = Object.keys(headers).filter(
    (key) => key.toLowerCase() === expected
  );
  if (matchingKeys.length !== 1) {
    if (matchingKeys.length > 1) {
      throw securityError(
        `L'en-tête ${name} est dupliqué.`,
        "DUPLICATE_TRANSFER_HEADER",
        401
      );
    }
    return undefined;
  }

  const value = headers[matchingKeys[0]];
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw securityError(
        `L'en-tête ${name} est dupliqué.`,
        "DUPLICATE_TRANSFER_HEADER",
        401
      );
    }
    return value[0];
  }
  return value;
};

const requireHeader = (headers, name) => {
  const value = getHeader(headers, name);
  if (typeof value !== "string" || value.length === 0) {
    throw securityError(
      `L'en-tête ${name} est requis.`,
      "MISSING_TRANSFER_HEADER",
      401
    );
  }
  return value;
};

const timingSafeHexEqual = (left, right) => {
  if (!SHA256_PATTERN.test(String(left)) || !SHA256_PATTERN.test(String(right))) {
    return false;
  }
  const leftBuffer = Buffer.from(String(left), "hex");
  const rightBuffer = Buffer.from(String(right), "hex");
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer);
};

export class NonceReplayCache {
  constructor({
    ttlMs = DEFAULT_TRANSFER_TIMESTAMP_WINDOW_MS * 2,
    maxEntries = 50_000,
  } = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new TypeError("ttlMs doit être un entier positif.");
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new TypeError("maxEntries doit être un entier positif.");
    }
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  cleanup(now = Date.now()) {
    for (const [nonce, expiresAt] of this.entries) {
      if (expiresAt < now) this.entries.delete(nonce);
    }
  }

  consume(nonce, {
    now = Date.now(),
    expiresAt = now + this.ttlMs,
  } = {}) {
    const normalizedNonce = normalizeNonce(nonce);
    this.cleanup(now);

    const currentExpiry = this.entries.get(normalizedNonce);
    if (currentExpiry !== undefined && currentExpiry >= now) return false;

    if (this.entries.size >= this.maxEntries) {
      throw securityError(
        "Le cache anti-rejeu est saturé.",
        "NONCE_CACHE_FULL",
        503
      );
    }

    this.entries.set(
      normalizedNonce,
      Math.max(now + 1, Number(expiresAt) || now + this.ttlMs)
    );
    return true;
  }

  has(nonce, now = Date.now()) {
    this.cleanup(now);
    const expiresAt = this.entries.get(String(nonce));
    return expiresAt !== undefined && expiresAt >= now;
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

export const createNonceReplayCache = (options) => new NonceReplayCache(options);
export const defaultTransferNonceReplayCache = new NonceReplayCache();

/**
 * Vérifie une requête déjà lue ou une empreinte annoncée pour un flux. Si
 * `body`/`expectedBodySha256` est fourni, son intégrité est aussi comparée.
 * La valeur retournée contient le hash annoncé à comparer après réception d'un
 * gros fichier.
 */
export const verifyTransferHeaders = ({
  headers,
  secret,
  signatureDomain = VIDEO_TRANSFER_SIGNATURE_DOMAIN,
  method,
  rawPathAndQuery,
  rawPath,
  path: requestPath,
  body,
  bodySha256: expectedBodySha256,
  expectedBodySha256: explicitExpectedBodySha256,
  now = Date.now(),
  timestampWindowMs,
  maxClockSkewMs,
  nonceCache = defaultTransferNonceReplayCache,
}) => {
  const windowMs =
    timestampWindowMs
    ?? maxClockSkewMs
    ?? DEFAULT_TRANSFER_TIMESTAMP_WINDOW_MS;
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new TypeError("La fenêtre temporelle doit être un entier positif.");
  }
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new TypeError("now doit être un horodatage Unix en millisecondes.");
  }

  const version = requireHeader(headers, TRANSFER_HEADERS.version);
  if (version !== TRANSFER_SIGNATURE_VERSION) {
    throw securityError(
      "La version de signature de transfert n'est pas supportée.",
      "UNSUPPORTED_TRANSFER_SIGNATURE",
      401
    );
  }

  const sourceInstanceId = normalizeInstanceId(
    requireHeader(headers, TRANSFER_HEADERS.instanceId)
  );
  const timestampHeader = requireHeader(headers, TRANSFER_HEADERS.timestamp);
  const { value: timestamp, numeric: timestampMs } =
    normalizeTimestamp(timestampHeader);
  if (Math.abs(now - timestampMs) > windowMs) {
    throw securityError(
      "La signature de transfert a expiré ou provient du futur.",
      "TRANSFER_SIGNATURE_EXPIRED",
      401
    );
  }

  const nonce = normalizeNonce(requireHeader(headers, TRANSFER_HEADERS.nonce));
  const announcedBodySha256 = normalizeDigest(
    requireHeader(headers, TRANSFER_HEADERS.bodySha256),
    "Le hash du corps"
  );
  const suppliedSignature = normalizeDigest(
    requireHeader(headers, TRANSFER_HEADERS.signature),
    "La signature"
  );

  let bodyDigestToCompare =
    explicitExpectedBodySha256 ?? expectedBodySha256;
  if (body !== undefined && body !== null) {
    bodyDigestToCompare = digestForBody({ body });
  }
  if (
    bodyDigestToCompare !== undefined
    && bodyDigestToCompare !== null
    && !timingSafeHexEqual(
      announcedBodySha256,
      normalizeDigest(bodyDigestToCompare, "Le hash attendu du corps")
    )
  ) {
    throw securityError(
      "Le corps reçu ne correspond pas à son empreinte signée.",
      "TRANSFER_BODY_DIGEST_MISMATCH",
      401
    );
  }

  const expectedSignature = createTransferSignature({
    secret,
    signatureDomain,
    method,
    rawPathAndQuery: rawPathAndQuery ?? rawPath ?? requestPath,
    timestamp,
    nonce,
    sourceInstanceId,
    bodySha256: announcedBodySha256,
  });

  if (!timingSafeHexEqual(suppliedSignature, expectedSignature)) {
    throw securityError(
      "La signature de transfert est invalide.",
      "INVALID_TRANSFER_SIGNATURE",
      401
    );
  }

  if (
    !nonceCache
    || typeof nonceCache.consume !== "function"
    || !nonceCache.consume(nonce, {
      now,
      expiresAt: Math.max(now, timestampMs) + windowMs,
    })
  ) {
    throw securityError(
      "Cette requête de transfert a déjà été utilisée.",
      "TRANSFER_NONCE_REPLAYED",
      409
    );
  }

  return {
    version,
    sourceInstanceId,
    timestamp,
    timestampMs,
    nonce,
    bodySha256: announcedBodySha256,
    signature: suppliedSignature.toLowerCase(),
  };
};

/**
 * Variante compatible avec un middleware qui a déjà extrait les en-têtes.
 */
export const verifyTransferSignature = (options) => {
  if (options?.headers) return verifyTransferHeaders(options);

  const {
    version = TRANSFER_SIGNATURE_VERSION,
    timestamp,
    nonce,
    sourceInstanceId,
    instanceId,
    bodyDigest,
    bodySha256,
    signature,
    ...rest
  } = options || {};

  return verifyTransferHeaders({
    ...rest,
    headers: {
      [TRANSFER_HEADERS.version]: String(version),
      [TRANSFER_HEADERS.instanceId]: String(
        sourceInstanceId ?? instanceId ?? ""
      ),
      [TRANSFER_HEADERS.timestamp]: String(timestamp ?? ""),
      [TRANSFER_HEADERS.nonce]: String(nonce ?? ""),
      [TRANSFER_HEADERS.bodySha256]: String(bodySha256 ?? bodyDigest ?? ""),
      [TRANSFER_HEADERS.signature]: String(signature ?? ""),
    },
  });
};

const parseBoundedInteger = (
  value,
  fieldName,
  { defaultValue, min = 1, max = Number.MAX_SAFE_INTEGER } = {}
) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (defaultValue !== undefined) return defaultValue;
    throw securityError(`${fieldName} est requis.`, "INVALID_TRANSFER_CONFIG", 500);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw securityError(
      `${fieldName} doit être un entier compris entre ${min} et ${max}.`,
      "INVALID_TRANSFER_CONFIG",
      500
    );
  }
  return parsed;
};

/**
 * Valide la configuration commune aux clones et au serveur principal.
 * En production, l'URL principale doit être une origine HTTPS sans identifiants.
 */
export const validateVideoTransferConfig = (
  env = process.env,
  { nodeEnv = env.NODE_ENV } = {}
) => {
  const role = String(env.SAMI_INSTANCE_ROLE || "").toLowerCase();
  if (!["clone", "primary"].includes(role)) {
    throw securityError(
      'SAMI_INSTANCE_ROLE doit valoir "clone" ou "primary".',
      "INVALID_TRANSFER_CONFIG",
      500
    );
  }

  const instanceId = String(env.SAMI_INSTANCE_ID || "");
  if (!INSTANCE_ID_PATTERN.test(instanceId)) {
    throw securityError(
      "SAMI_INSTANCE_ID doit contenir entre 2 et 100 caractères sûrs.",
      "INVALID_TRANSFER_CONFIG",
      500
    );
  }

  const sharedSecret = String(env.SAMI_TRANSFER_SHARED_SECRET || "");
  normalizeSecret(sharedSecret);
  if (/change[-_ ]?me|replace[-_ ]?me|example/i.test(sharedSecret)) {
    throw securityError(
      "SAMI_TRANSFER_SHARED_SECRET utilise encore une valeur d'exemple.",
      "INVALID_TRANSFER_CONFIG",
      500
    );
  }

  const production = String(nodeEnv || "").toLowerCase() === "production";
  const configuredPrimaryUrl = String(env.SAMI_PRIMARY_BASE_URL || "").trim();
  let primaryUrl = null;
  if (role === "clone" || configuredPrimaryUrl) {
    try {
      primaryUrl = new URL(configuredPrimaryUrl);
    } catch (cause) {
      throw securityError(
        "SAMI_PRIMARY_BASE_URL doit être une URL absolue valide.",
        "INVALID_TRANSFER_CONFIG",
        500,
        cause
      );
    }

    const allowedProtocols = production
      ? new Set(["https:"])
      : new Set(["http:", "https:"]);
    if (
      !allowedProtocols.has(primaryUrl.protocol)
      || !primaryUrl.hostname
      || primaryUrl.username
      || primaryUrl.password
      || primaryUrl.search
      || primaryUrl.hash
      || !["", "/"].includes(primaryUrl.pathname)
    ) {
      throw securityError(
        production
          ? "SAMI_PRIMARY_BASE_URL doit être une origine HTTPS sans chemin ni identifiants."
          : "SAMI_PRIMARY_BASE_URL doit être une origine HTTP(S) sans chemin ni identifiants.",
        "INVALID_TRANSFER_CONFIG",
        500
      );
    }
  }

  const requestTimeoutMs = parseBoundedInteger(
    env.SAMI_TRANSFER_REQUEST_TIMEOUT_MS,
    "SAMI_TRANSFER_REQUEST_TIMEOUT_MS",
    { defaultValue: 120_000, min: 1_000, max: 15 * 60 * 1000 }
  );
  const sessionTtlHours = parseBoundedInteger(
    env.SAMI_TRANSFER_SESSION_TTL_HOURS,
    "SAMI_TRANSFER_SESSION_TTL_HOURS",
    { defaultValue: 168, min: 1, max: 8_760 }
  );
  const concurrency = parseBoundedInteger(
    env.SAMI_TRANSFER_CONCURRENCY,
    "SAMI_TRANSFER_CONCURRENCY",
    { defaultValue: 2, min: 1, max: 16 }
  );

  return Object.freeze({
    role,
    instanceId,
    primaryBaseUrl: primaryUrl?.origin ?? null,
    sharedSecret,
    requestTimeoutMs,
    sessionTtlHours,
    concurrency,
    isPrimary: role === "primary",
    isClone: role === "clone",
  });
};

export const validateInstanceConfig = validateVideoTransferConfig;

/**
 * Retourne un chemin POSIX relatif canonique. Seuls les fichiers situés sous
 * hls/, affiche/ et sousTitre/ font partie d'un transfert moderne.
 */
export const normalizeVideoTransferRelativePath = (relativePath) => {
  if (
    typeof relativePath !== "string"
    || relativePath.length === 0
    || Buffer.byteLength(relativePath, "utf8") > 512
  ) {
    throw securityError(
      "Le chemin relatif de transfert est invalide.",
      "INVALID_TRANSFER_PATH"
    );
  }
  if (
    relativePath !== relativePath.trim()
    || /[\u0000-\u001f\u007f]/.test(relativePath)
    || relativePath.includes("\\")
    || relativePath.includes("%")
    || relativePath.includes("?")
    || relativePath.includes("#")
    || path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
  ) {
    throw securityError(
      "Le chemin de transfert contient une forme interdite.",
      "INVALID_TRANSFER_PATH"
    );
  }

  const segments = relativePath.split("/");
  if (
    segments.length < 2
    || !ALLOWED_VIDEO_DIRECTORIES.has(segments[0])
    || segments.some((segment) => {
      const compatibilityNormalized = segment.normalize("NFKC");
      return (
        segment.length === 0
        || segment === "."
        || segment === ".."
        || compatibilityNormalized === "."
        || compatibilityNormalized === ".."
        || segment.includes(":")
        || /[.\s]$/.test(segment)
        || WINDOWS_RESERVED_NAME_PATTERN.test(segment)
      );
    })
    || path.posix.normalize(relativePath) !== relativePath
  ) {
    throw securityError(
      "Le chemin de transfert doit rester sous hls/, affiche/ ou sousTitre/.",
      "INVALID_TRANSFER_PATH"
    );
  }
  return relativePath;
};

export const validateTransferRelativePath = normalizeVideoTransferRelativePath;

const assertInsideRoot = (rootPath, candidatePath) => {
  const relative = path.relative(rootPath, candidatePath);
  if (
    relative === ""
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw securityError(
      "Le chemin résolu sort de la racine de transfert.",
      "TRANSFER_PATH_OUTSIDE_ROOT"
    );
  }
};

/**
 * Résout un fichier sous `rootDir`, vérifie chaque composant avec lstat/realpath
 * et refuse les liens symboliques ainsi que les fichiers spéciaux.
 *
 * `mustExist:false` sert à préparer une destination; tous les parents déjà
 * présents restent contrôlés. La fonction est asynchrone et retourne le chemin
 * absolu réel/canonique.
 */
export const resolveVideoTransferPath = async (
  rootDir,
  relativePath,
  options = {}
) => {
  const {
    allowMissingLeaf = false,
    expectedType = "file",
  } = options;
  const mustExist =
    options.mustExist === undefined
      ? !allowMissingLeaf
      : Boolean(options.mustExist);
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    throw new TypeError("rootDir doit être un chemin non vide.");
  }
  if (!["file", "directory", "any"].includes(expectedType)) {
    throw new TypeError('expectedType doit valoir "file", "directory" ou "any".');
  }

  const normalized = normalizeVideoTransferRelativePath(relativePath);
  const rootAbsolute = path.resolve(rootDir);

  let rootStat;
  try {
    rootStat = await fsPromises.lstat(rootAbsolute);
  } catch (cause) {
    throw securityError(
      "La racine de transfert est introuvable.",
      "TRANSFER_ROOT_NOT_FOUND",
      400,
      cause
    );
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw securityError(
      "La racine de transfert doit être un dossier réel.",
      "INVALID_TRANSFER_ROOT"
    );
  }

  const realRoot = await fsPromises.realpath(rootAbsolute);
  const segments = normalized.split("/");
  const candidate = path.resolve(realRoot, ...segments);
  assertInsideRoot(realRoot, candidate);

  let current = realRoot;
  let missing = false;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    assertInsideRoot(realRoot, current);

    if (missing) continue;

    let stats;
    try {
      stats = await fsPromises.lstat(current);
    } catch (cause) {
      if (cause?.code === "ENOENT" && !mustExist) {
        missing = true;
        continue;
      }
      throw securityError(
        `Le fichier de transfert ${normalized} est introuvable.`,
        "TRANSFER_FILE_NOT_FOUND",
        400,
        cause
      );
    }

    if (stats.isSymbolicLink()) {
      throw securityError(
        `Un lien symbolique est interdit dans ${normalized}.`,
        "TRANSFER_SYMLINK_FORBIDDEN"
      );
    }

    const isLast = index === segments.length - 1;
    if (!isLast && !stats.isDirectory()) {
      throw securityError(
        `Un parent de ${normalized} n'est pas un dossier.`,
        "INVALID_TRANSFER_FILE_TYPE"
      );
    }

    if (isLast) {
      const validType =
        (expectedType === "file" && stats.isFile())
        || (expectedType === "directory" && stats.isDirectory())
        || (expectedType === "any" && (stats.isFile() || stats.isDirectory()));
      if (!validType) {
        throw securityError(
          `Le type de fichier de ${normalized} n'est pas autorisé.`,
          "INVALID_TRANSFER_FILE_TYPE"
        );
      }
    }

    const realCurrent = await fsPromises.realpath(current);
    if (realCurrent !== realRoot) assertInsideRoot(realRoot, realCurrent);
  }

  if (mustExist && missing) {
    throw securityError(
      `Le fichier de transfert ${normalized} est introuvable.`,
      "TRANSFER_FILE_NOT_FOUND"
    );
  }
  return candidate;
};

export const resolveTransferPath = resolveVideoTransferPath;

export const assertNoSymlink = async (
  rootDir,
  relativePath,
  { allowMissingLeaf = true } = {}
) => {
  await resolveVideoTransferPath(rootDir, relativePath, {
    mustExist: !allowMissingLeaf,
    expectedType: "any",
  });
  return true;
};

const requirePlainObject = (value, fieldName) => {
  if (!isPlainObject(value)) {
    throw securityError(
      `${fieldName} doit être un objet.`,
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  return value;
};

const requireTrimmedString = (
  value,
  fieldName,
  { minLength = 1, maxLength } = {}
) => {
  if (
    typeof value !== "string"
    || value !== value.trim()
    || value.length < minLength
    || (maxLength !== undefined && value.length > maxLength)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    throw securityError(
      `${fieldName} est invalide.`,
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  return value;
};

const requirePositiveSafeInteger = (value, fieldName, { nullable = false } = {}) => {
  if (nullable && (value === null || value === undefined || value === "")) {
    return null;
  }
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw securityError(
      `${fieldName} doit être un entier positif.`,
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  return normalized;
};

const normalizeManifestSize = (value, fieldName) => {
  const stringValue =
    typeof value === "number" || typeof value === "bigint"
      ? String(value)
      : value;
  if (typeof stringValue !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(stringValue)) {
    throw securityError(
      `${fieldName} doit être une taille entière positive ou nulle.`,
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  const numeric = Number(stringValue);
  if (
    !Number.isSafeInteger(numeric)
    || numeric < 0
    || numeric > MAX_TRANSFER_FILE_SIZE
  ) {
    throw securityError(
      `${fieldName} dépasse la taille sûre autorisée.`,
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  return { stringValue, numeric };
};

const normalizeMetadata = (metadata) => {
  requirePlainObject(metadata, "metadata");
  const title = requireTrimmedString(metadata.title, "metadata.title", {
    maxLength: 100,
  });
  const summary =
    metadata.summary === null || metadata.summary === undefined
      ? null
      : requireTrimmedString(metadata.summary, "metadata.summary", {
        minLength: 0,
        maxLength: 1_000_000,
      });
  if (typeof metadata.premium !== "boolean") {
    throw securityError(
      "metadata.premium doit être un booléen.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }

  const masterPlaylistPath = normalizeVideoTransferRelativePath(
    metadata.masterPlaylistPath
  );
  if (masterPlaylistPath !== "hls/master.m3u8") {
    throw securityError(
      "metadata.masterPlaylistPath doit valoir hls/master.m3u8.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }

  let posterPath = null;
  if (metadata.posterPath !== null && metadata.posterPath !== undefined && metadata.posterPath !== "") {
    posterPath = normalizeVideoTransferRelativePath(metadata.posterPath);
    if (!posterPath.startsWith("affiche/")) {
      throw securityError(
        "metadata.posterPath doit se situer sous affiche/.",
        "INVALID_TRANSFER_MANIFEST"
      );
    }
  }

  const genreIds = metadata.destinationGenreIds ?? [];
  if (!Array.isArray(genreIds)) {
    throw securityError(
      "metadata.destinationGenreIds doit être un tableau.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  const normalizedGenreIds = genreIds.map((genreId, index) =>
    requirePositiveSafeInteger(
      genreId,
      `metadata.destinationGenreIds[${index}]`
    ));
  if (new Set(normalizedGenreIds).size !== normalizedGenreIds.length) {
    throw securityError(
      "metadata.destinationGenreIds contient un doublon.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }

  const subtitles = metadata.subtitles ?? [];
  if (!Array.isArray(subtitles)) {
    throw securityError(
      "metadata.subtitles doit être un tableau.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  const normalizedSubtitles = subtitles.map((subtitle, index) => {
    requirePlainObject(subtitle, `metadata.subtitles[${index}]`);
    const subtitlePath = normalizeVideoTransferRelativePath(subtitle.path);
    if (!subtitlePath.startsWith("sousTitre/")) {
      throw securityError(
        `metadata.subtitles[${index}].path doit se situer sous sousTitre/.`,
        "INVALID_TRANSFER_MANIFEST"
      );
    }
    return {
      ...subtitle,
      label: requireTrimmedString(
        subtitle.label,
        `metadata.subtitles[${index}].label`,
        { maxLength: 100 }
      ),
      path: subtitlePath,
    };
  });

  const audioTracks = metadata.audioTracks ?? [];
  if (!Array.isArray(audioTracks)) {
    throw securityError(
      "metadata.audioTracks doit être un tableau.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  const seenOrders = new Set();
  const normalizedAudioTracks = audioTracks.map((track, index) => {
    requirePlainObject(track, `metadata.audioTracks[${index}]`);
    const trackPath = normalizeVideoTransferRelativePath(track.path);
    if (!trackPath.startsWith("hls/")) {
      throw securityError(
        `metadata.audioTracks[${index}].path doit se situer sous hls/.`,
        "INVALID_TRANSFER_MANIFEST"
      );
    }
    if (typeof track.isDefault !== "boolean") {
      throw securityError(
        `metadata.audioTracks[${index}].isDefault doit être un booléen.`,
        "INVALID_TRANSFER_MANIFEST"
      );
    }
    const order = Number(track.order);
    if (!Number.isSafeInteger(order) || order < 0 || seenOrders.has(order)) {
      throw securityError(
        "Les ordres des pistes audio doivent être des entiers uniques et positifs ou nuls.",
        "INVALID_TRANSFER_MANIFEST"
      );
    }
    seenOrders.add(order);

    let language = null;
    if (track.language !== null && track.language !== undefined && track.language !== "") {
      language = requireTrimmedString(
        track.language,
        `metadata.audioTracks[${index}].language`,
        { maxLength: 35 }
      );
    }

    return {
      ...track,
      label: requireTrimmedString(
        track.label,
        `metadata.audioTracks[${index}].label`,
        { maxLength: 100 }
      ),
      language,
      path: trackPath,
      isDefault: track.isDefault,
      order,
    };
  });

  if (normalizedAudioTracks.filter((track) => track.isDefault).length > 1) {
    throw securityError(
      "Une seule piste audio peut être marquée par défaut.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }

  return {
    ...metadata,
    title,
    summary,
    premium: metadata.premium,
    masterPlaylistPath,
    posterPath,
    destinationGenreIds: normalizedGenreIds,
    subtitles: normalizedSubtitles,
    audioTracks: normalizedAudioTracks,
  };
};

/**
 * Valide et renvoie une copie normalisée du manifeste. Les tailles deviennent
 * des chaînes décimales pour rester exactes dans JSON et Prisma BigInt.
 */
export const validateVideoTransferManifest = (manifest) => {
  requirePlainObject(manifest, "manifest");
  if (manifest.version !== VIDEO_TRANSFER_MANIFEST_VERSION) {
    throw securityError(
      `manifest.version doit valoir ${VIDEO_TRANSFER_MANIFEST_VERSION}.`,
      "INVALID_TRANSFER_MANIFEST"
    );
  }

  if (
    typeof manifest.exportTransferId !== "string"
    || !UUID_PATTERN.test(manifest.exportTransferId)
  ) {
    throw securityError(
      "manifest.exportTransferId doit être un UUID.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }

  const source = requirePlainObject(manifest.source, "manifest.source");
  const instanceId = requireTrimmedString(
    source.instanceId,
    "manifest.source.instanceId",
    { maxLength: 100 }
  );
  if (!INSTANCE_ID_PATTERN.test(instanceId)) {
    throw securityError(
      "manifest.source.instanceId contient des caractères interdits.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }
  const videoId = requirePositiveSafeInteger(
    source.videoId,
    "manifest.source.videoId"
  );
  const destinationSeasonId = requirePositiveSafeInteger(
    manifest.destinationSeasonId,
    "manifest.destinationSeasonId",
    { nullable: true }
  );
  const initiatedByNickname =
    manifest.initiatedByNickname === null
    || manifest.initiatedByNickname === undefined
      ? null
      : requireTrimmedString(
        manifest.initiatedByNickname,
        "manifest.initiatedByNickname",
        { maxLength: 191 }
      );

  const metadata = normalizeMetadata(manifest.metadata);
  if (
    !Array.isArray(manifest.files)
    || manifest.files.length === 0
    || manifest.files.length > MAX_TRANSFER_FILE_COUNT
  ) {
    throw securityError(
      `manifest.files doit contenir entre 1 et ${MAX_TRANSFER_FILE_COUNT} fichiers.`,
      "INVALID_TRANSFER_MANIFEST"
    );
  }

  const seenPaths = new Set();
  let totalSize = 0;
  const files = manifest.files.map((file, index) => {
    requirePlainObject(file, `manifest.files[${index}]`);
    const relativePath = normalizeVideoTransferRelativePath(file.relativePath);
    const [topLevelDirectory] = relativePath.split("/");
    const extension = path.posix.extname(relativePath).toLowerCase();
    if (!ALLOWED_TRANSFER_EXTENSIONS[topLevelDirectory]?.has(extension)) {
      throw securityError(
        `L'extension ${extension || "(absente)"} n'est pas autorisée sous ${topLevelDirectory}/.`,
        "TRANSFER_FILE_EXTENSION_FORBIDDEN"
      );
    }
    if (seenPaths.has(relativePath)) {
      throw securityError(
        `Le fichier ${relativePath} est présent plusieurs fois.`,
        "INVALID_TRANSFER_MANIFEST"
      );
    }
    seenPaths.add(relativePath);

    const { stringValue: size, numeric: numericSize } = normalizeManifestSize(
      file.size,
      `manifest.files[${index}].size`
    );
    if (!Number.isSafeInteger(totalSize + numericSize)) {
      throw securityError(
        "La taille totale du manifeste dépasse la plage sûre.",
        "INVALID_TRANSFER_MANIFEST"
      );
    }
    totalSize += numericSize;

    return {
      ...file,
      relativePath,
      size,
      sha256: normalizeDigest(
        file.sha256,
        `manifest.files[${index}].sha256`
      ),
    };
  });

  const metadataPaths = [
    metadata.masterPlaylistPath,
    metadata.posterPath,
    ...metadata.subtitles.map((subtitle) => subtitle.path),
    ...metadata.audioTracks.map((track) => track.path),
  ].filter(Boolean);

  for (const metadataPath of metadataPaths) {
    if (!seenPaths.has(metadataPath)) {
      throw securityError(
        `Le chemin metadata ${metadataPath} est absent de manifest.files.`,
        "INVALID_TRANSFER_MANIFEST"
      );
    }
  }
  if (!seenPaths.has("hls/master.m3u8")) {
    throw securityError(
      "Le manifeste doit inclure hls/master.m3u8.",
      "INVALID_TRANSFER_MANIFEST"
    );
  }

  return {
    ...manifest,
    version: VIDEO_TRANSFER_MANIFEST_VERSION,
    exportTransferId: manifest.exportTransferId.toLowerCase(),
    destinationSeasonId,
    initiatedByNickname,
    source: {
      ...source,
      instanceId,
      videoId,
    },
    metadata,
    files,
    totalBytes: String(totalSize),
  };
};

export const verifyManifestFiles = async ({ root, manifest }) => {
  const normalized = validateVideoTransferManifest(manifest);
  let totalBytes = 0;

  for (const file of normalized.files) {
    const absolutePath = await resolveVideoTransferPath(root, file.relativePath);
    const stats = await fsPromises.stat(absolutePath);
    if (
      !stats.isFile()
      || !Number.isSafeInteger(stats.size)
      || String(stats.size) !== file.size
    ) {
      throw securityError(
        `La taille reçue pour ${file.relativePath} est invalide.`,
        "TRANSFER_FILE_SIZE_MISMATCH"
      );
    }
    const digest = await sha256File(absolutePath);
    if (!timingSafeHexEqual(digest, file.sha256)) {
      throw securityError(
        `L'empreinte reçue pour ${file.relativePath} est invalide.`,
        "TRANSFER_FILE_DIGEST_MISMATCH"
      );
    }
    totalBytes += stats.size;
  }

  return {
    filesVerified: normalized.files.length,
    totalBytes,
  };
};

const extractHlsUris = (playlistContent, playlistPath) => {
  if (
    typeof playlistContent !== "string"
    || playlistContent.length === 0
    || playlistContent.includes("\u0000")
  ) {
    throw securityError(
      `La playlist ${playlistPath} est vide ou invalide.`,
      "INVALID_HLS_PLAYLIST"
    );
  }

  const lines = playlistContent.split(/\r?\n/);
  const firstContentLine = lines
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^\uFEFF/, "");
  if (firstContentLine !== "#EXTM3U") {
    throw securityError(
      `La playlist ${playlistPath} ne commence pas par #EXTM3U.`,
      "INVALID_HLS_PLAYLIST"
    );
  }

  const uris = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!line.startsWith("#")) {
      uris.push(line);
      continue;
    }

    if (!/\bURI\s*=/i.test(line)) continue;
    const attributePattern = /\bURI\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\s]*))/gi;
    let match;
    let found = false;
    while ((match = attributePattern.exec(line)) !== null) {
      found = true;
      uris.push(match[1] ?? match[2] ?? match[3] ?? "");
    }
    if (!found) {
      throw securityError(
        `Un attribut URI de ${playlistPath} est mal formé.`,
        "INVALID_HLS_REFERENCE"
      );
    }
  }
  return uris;
};

const resolveHlsReference = (playlistPath, uri) => {
  if (
    typeof uri !== "string"
    || uri.length === 0
    || uri !== uri.trim()
    || uri.startsWith("/")
    || uri.startsWith("//")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(uri)
    || /[\u0000-\u001f\u007f\\%?#]/.test(uri)
  ) {
    throw securityError(
      `La référence HLS ${uri || "(vide)"} est interdite.`,
      "INVALID_HLS_REFERENCE"
    );
  }
  const uriSegments = uri.split("/");
  if (
    uriSegments.some((segment) => {
      const compatibilityNormalized = segment.normalize("NFKC");
      return (
        !segment
        || segment === "."
        || segment === ".."
        || compatibilityNormalized === "."
        || compatibilityNormalized === ".."
      );
    })
  ) {
    throw securityError(
      `La référence HLS ${uri} contient une traversée de chemin.`,
      "INVALID_HLS_REFERENCE"
    );
  }

  return normalizeVideoTransferRelativePath(
    path.posix.join(path.posix.dirname(playlistPath), uri)
  );
};

/**
 * Vérifie toutes les références des playlists listées dans le manifeste :
 * lignes URI et attributs URI=. Les URL distantes/data/file, traversées, liens
 * symboliques et fichiers absents du manifeste ou du disque sont refusés.
 */
export const verifyHlsReferences = async ({ root, manifest }) => {
  const normalized = validateVideoTransferManifest(manifest);
  const manifestPaths = new Set(
    normalized.files.map((file) => file.relativePath)
  );
  const playlists = normalized.files.filter((file) =>
    file.relativePath.toLowerCase().endsWith(".m3u8"));
  let referencesChecked = 0;

  for (const playlist of playlists) {
    const playlistAbsolutePath = await resolveVideoTransferPath(
      root,
      playlist.relativePath
    );
    const playlistStat = await fsPromises.stat(playlistAbsolutePath);
    if (
      !playlistStat.isFile()
      || playlistStat.size <= 0
      || playlistStat.size > MAX_HLS_PLAYLIST_BYTES
    ) {
      throw securityError(
        `La playlist ${playlist.relativePath} dépasse la taille autorisée.`,
        "INVALID_HLS_PLAYLIST"
      );
    }
    const playlistContent = await fsPromises.readFile(
      playlistAbsolutePath,
      "utf8"
    );
    const uris = extractHlsUris(playlistContent, playlist.relativePath);
    if (playlist.relativePath === "hls/master.m3u8" && uris.length === 0) {
      throw securityError(
        "La playlist maître ne référence aucun flux.",
        "INVALID_HLS_PLAYLIST"
      );
    }

    for (const uri of uris) {
      const referencedPath = resolveHlsReference(playlist.relativePath, uri);
      if (!manifestPaths.has(referencedPath)) {
        throw securityError(
          `La référence HLS ${referencedPath} est absente du manifeste.`,
          "HLS_REFERENCE_NOT_IN_MANIFEST"
        );
      }
      await resolveVideoTransferPath(root, referencedPath);
      referencesChecked += 1;
    }
  }

  return {
    playlistsChecked: playlists.length,
    referencesChecked,
  };
};
