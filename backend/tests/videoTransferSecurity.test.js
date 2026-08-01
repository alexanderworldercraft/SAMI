import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_HLS_PLAYLIST_BYTES,
  TRANSFER_HEADERS,
  assertNoSymlink,
  buildCanonicalTransferRequest,
  buildTransferHeaders,
  canonicalRequestPath,
  createNonceReplayCache,
  createTransferSignature,
  resolveTransferPath,
  sha256Buffer,
  sha256File,
  sha256Stream,
  sha256String,
  stableStringify,
  validateTransferRelativePath,
  validateVideoTransferConfig,
  validateVideoTransferManifest,
  verifyHlsReferences,
  verifyManifestFiles,
  verifyTransferHeaders,
  verifyTransferSignature,
} from "../services/videoTransferSecurity.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = 1_900_000_000_000;
const NONCE = "nonce_abcdefghijklmnop";
const SOURCE_INSTANCE_ID = "sami-clone-01";
const TRANSFER_ID = "550e8400-e29b-41d4-a716-446655440000";
const temporaryRoots = [];

const createTemporaryRoot = async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "sami-transfer-security-")
  );
  temporaryRoots.push(root);
  await Promise.all(
    ["hls", "affiche", "sousTitre"].map((directory) =>
      fs.promises.mkdir(path.join(root, directory), { recursive: true }))
  );
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true }))
  );
});

const expectSecurityCode = (callback, code) => {
  try {
    callback();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`L'erreur ${code} était attendue.`);
};

const expectAsyncSecurityCode = async (callback, code) => {
  try {
    await callback();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`L'erreur ${code} était attendue.`);
};

const fileDescriptor = (relativePath, content) => ({
  relativePath,
  size: String(Buffer.byteLength(content)),
  sha256: sha256Buffer(Buffer.from(content)),
});

const buildManifest = (overrides = {}) => {
  const contents = {
    "hls/master.m3u8": "#EXTM3U\n#EXT-X-ENDLIST\n",
    "affiche/poster.webp": "poster",
    "sousTitre/fr.vtt": "WEBVTT\n",
    "hls/audio/fr/playlist.m3u8": "#EXTM3U\n#EXT-X-ENDLIST\n",
  };
  const manifest = {
    version: 1,
    exportTransferId: TRANSFER_ID,
    destinationSeasonId: 12,
    initiatedByNickname: "superadmin",
    source: {
      instanceId: SOURCE_INSTANCE_ID,
      videoId: 42,
    },
    metadata: {
      title: "Une vidéo moderne",
      summary: null,
      premium: false,
      masterPlaylistPath: "hls/master.m3u8",
      posterPath: "affiche/poster.webp",
      destinationGenreIds: [2, 5],
      subtitles: [
        { label: "Français", path: "sousTitre/fr.vtt" },
      ],
      audioTracks: [
        {
          label: "Français",
          language: "fr",
          path: "hls/audio/fr/playlist.m3u8",
          isDefault: true,
          order: 0,
        },
      ],
    },
    files: Object.entries(contents).map(([relativePath, content]) =>
      fileDescriptor(relativePath, content)),
  };

  return {
    ...manifest,
    ...overrides,
    source: { ...manifest.source, ...(overrides.source || {}) },
    metadata: { ...manifest.metadata, ...(overrides.metadata || {}) },
  };
};

const writeFileUnderRoot = async (root, relativePath, content) => {
  const target = path.join(root, ...relativePath.split("/"));
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, content);
};

const createCompleteHlsFixture = async () => {
  const root = await createTemporaryRoot();
  const contents = {
    "hls/master.m3u8": [
      "#EXTM3U",
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/fr.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=500000,AUDIO="audio"',
      "video/playlist.m3u8",
      "",
    ].join("\n"),
    "hls/video/playlist.m3u8": [
      "#EXTM3U",
      '#EXT-X-MAP:URI="init.mp4"',
      "#EXTINF:4.0,",
      "segment-01.ts",
      "#EXT-X-ENDLIST",
      "",
    ].join("\n"),
    "hls/video/init.mp4": "init",
    "hls/video/segment-01.ts": "video-segment",
    "hls/audio/fr.m3u8": [
      "#EXTM3U",
      "#EXTINF:4.0,",
      "fr-01.aac",
      "#EXT-X-ENDLIST",
      "",
    ].join("\n"),
    "hls/audio/fr-01.aac": "audio-segment",
    "affiche/poster.webp": "poster",
    "sousTitre/fr.vtt": "WEBVTT\n",
  };

  for (const [relativePath, content] of Object.entries(contents)) {
    await writeFileUnderRoot(root, relativePath, content);
  }

  const manifest = buildManifest({
    metadata: {
      audioTracks: [
        {
          label: "Français",
          language: "fr",
          path: "hls/audio/fr.m3u8",
          isDefault: true,
          order: 0,
        },
      ],
    },
    files: Object.entries(contents).map(([relativePath, content]) =>
      fileDescriptor(relativePath, content)),
  });

  return { root, contents, manifest };
};

describe("empreintes et sérialisation", () => {
  it("calcule la même empreinte depuis String, Buffer, flux et fichier", async () => {
    const root = await createTemporaryRoot();
    const target = path.join(root, "hls", "payload.bin");
    await fs.promises.writeFile(target, "contenu");
    const expected = sha256String("contenu");

    expect(sha256Buffer(Buffer.from("contenu"))).toBe(expected);
    expect(await sha256Stream(Readable.from([Buffer.from("con"), "tenu"]))).toBe(
      expected
    );
    expect(await sha256File(target)).toBe(expected);
    expect(await sha256File(Readable.from(["contenu"]))).toBe(expected);
  });

  it("sérialise les objets de façon stable sans modifier l'ordre des tableaux", () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: [3, 1] } })).toBe(
      '{"a":{"x":[3,1],"y":2},"z":1}'
    );
    expect(stableStringify({ a: 1, z: 2 })).toBe(
      stableStringify({ z: 2, a: 1 })
    );
  });
});

describe("signature HMAC inter-serveurs", () => {
  const signedHeaders = (overrides = {}) =>
    buildTransferHeaders({
      secret: SECRET,
      method: "POST",
      path: "/api/internal/video-transfers/sessions?resume=1&mode=safe",
      body: '{"video":42}',
      timestamp: NOW,
      nonce: NONCE,
      sourceInstanceId: SOURCE_INSTANCE_ID,
      ...overrides,
    });

  it("signe la méthode, le chemin brut avec query, l'instance, le temps, le nonce et le corps", () => {
    const digest = sha256String('{"video":42}');
    const canonical = buildCanonicalTransferRequest({
      method: "post",
      path: "/api/internal/video-transfers/sessions?resume=1&mode=safe",
      timestamp: NOW,
      nonce: NONCE,
      sourceInstanceId: SOURCE_INSTANCE_ID,
      bodyDigest: digest,
    });

    expect(canonical).toBe([
      "SAMI-VIDEO-TRANSFER-V1",
      "POST",
      "/api/internal/video-transfers/sessions?resume=1&mode=safe",
      String(NOW),
      NONCE,
      SOURCE_INSTANCE_ID,
      digest,
    ].join("\n"));
    expect(canonicalRequestPath("/route?b=2&a=1")).toBe("/route?b=2&a=1");

    const baseSignature = createTransferSignature({
      secret: SECRET,
      method: "POST",
      path: "/route?a=1",
      timestamp: NOW,
      nonce: NONCE,
      sourceInstanceId: SOURCE_INSTANCE_ID,
      bodyDigest: digest,
    });
    const changedSignature = createTransferSignature({
      secret: SECRET,
      method: "POST",
      path: "/route?a=2",
      timestamp: NOW,
      nonce: NONCE,
      sourceInstanceId: SOURCE_INSTANCE_ID,
      bodyDigest: digest,
    });
    expect(changedSignature).not.toBe(baseSignature);
  });

  it("isole cryptographiquement le protocole d'encodage distribué", () => {
    const path = "/api/internal/video-encoding/workers/heartbeat";
    const body = '{"freeSlots":1}';
    const signatureDomain = "SAMI-DISTRIBUTED-ENCODING-V1";
    const headers = buildTransferHeaders({
      secret: SECRET,
      signatureDomain,
      method: "POST",
      path,
      body,
      timestamp: NOW,
      nonce: `${NONCE}_domain`,
      sourceInstanceId: SOURCE_INSTANCE_ID,
    });

    expect(() =>
      verifyTransferHeaders({
        headers,
        secret: SECRET,
        method: "POST",
        path,
        body,
        now: NOW,
        nonceCache: createNonceReplayCache(),
      })
    ).toThrowError(/signature.*invalide/i);

    expect(
      verifyTransferHeaders({
        headers,
        secret: SECRET,
        signatureDomain,
        method: "POST",
        path,
        body,
        now: NOW,
        nonceCache: createNonceReplayCache(),
      }).sourceInstanceId
    ).toBe(SOURCE_INSTANCE_ID);
  });

  it("accepte une signature valide et retourne l'identité source signée", () => {
    const headers = signedHeaders();
    const result = verifyTransferHeaders({
      headers,
      secret: SECRET,
      method: "POST",
      path: "/api/internal/video-transfers/sessions?resume=1&mode=safe",
      body: '{"video":42}',
      now: NOW,
      nonceCache: createNonceReplayCache(),
    });

    expect(result).toMatchObject({
      sourceInstanceId: SOURCE_INSTANCE_ID,
      nonce: NONCE,
      bodySha256: sha256String('{"video":42}'),
    });
    expect(headers[TRANSFER_HEADERS.instanceId]).toBe(SOURCE_INSTANCE_ID);
  });

  it("refuse une méthode, query, identité, signature ou corps altéré", () => {
    const cases = [
      {
        options: { method: "PUT" },
        code: "INVALID_TRANSFER_SIGNATURE",
      },
      {
        options: {
          path: "/api/internal/video-transfers/sessions?mode=safe&resume=1",
        },
        code: "INVALID_TRANSFER_SIGNATURE",
      },
      {
        mutate(headers) {
          headers[TRANSFER_HEADERS.instanceId] = "other-clone";
        },
        code: "INVALID_TRANSFER_SIGNATURE",
      },
      {
        mutate(headers) {
          headers[TRANSFER_HEADERS.signature] = "0".repeat(64);
        },
        code: "INVALID_TRANSFER_SIGNATURE",
      },
      {
        options: { body: '{"video":43}' },
        code: "TRANSFER_BODY_DIGEST_MISMATCH",
      },
    ];

    for (const testCase of cases) {
      const headers = { ...signedHeaders() };
      testCase.mutate?.(headers);
      expectSecurityCode(
        () => verifyTransferHeaders({
          headers,
          secret: SECRET,
          method: "POST",
          path: "/api/internal/video-transfers/sessions?resume=1&mode=safe",
          body: '{"video":42}',
          now: NOW,
          nonceCache: createNonceReplayCache(),
          ...(testCase.options || {}),
        }),
        testCase.code
      );
    }
  });

  it("refuse le rejeu d'un nonce après une première validation", () => {
    const headers = signedHeaders();
    const nonceCache = createNonceReplayCache();
    const options = {
      headers,
      secret: SECRET,
      method: "POST",
      path: "/api/internal/video-transfers/sessions?resume=1&mode=safe",
      body: '{"video":42}',
      now: NOW,
      nonceCache,
    };

    verifyTransferHeaders(options);
    expectSecurityCode(
      () => verifyTransferHeaders(options),
      "TRANSFER_NONCE_REPLAYED"
    );
  });

  it("ne consomme pas le nonce d'une signature invalide", () => {
    const validHeaders = signedHeaders();
    const invalidHeaders = {
      ...validHeaders,
      [TRANSFER_HEADERS.signature]: "f".repeat(64),
    };
    const nonceCache = createNonceReplayCache();
    const baseOptions = {
      secret: SECRET,
      method: "POST",
      path: "/api/internal/video-transfers/sessions?resume=1&mode=safe",
      body: '{"video":42}',
      now: NOW,
      nonceCache,
    };

    expectSecurityCode(
      () => verifyTransferHeaders({ ...baseOptions, headers: invalidHeaders }),
      "INVALID_TRANSFER_SIGNATURE"
    );
    expect(() =>
      verifyTransferHeaders({ ...baseOptions, headers: validHeaders })
    ).not.toThrow();
  });

  it("refuse les horodatages hors de la fenêtre configurable", () => {
    const windowMs = 30_000;
    for (const timestamp of [NOW - windowMs - 1, NOW + windowMs + 1]) {
      const headers = signedHeaders({
        timestamp,
        nonce: `${NONCE}_${timestamp}`,
      });
      expectSecurityCode(
        () => verifyTransferHeaders({
          headers,
          secret: SECRET,
          method: "POST",
          path: "/api/internal/video-transfers/sessions?resume=1&mode=safe",
          now: NOW,
          timestampWindowMs: windowMs,
          nonceCache: createNonceReplayCache(),
        }),
        "TRANSFER_SIGNATURE_EXPIRED"
      );
    }
  });

  it("accepte aussi la forme verifyTransferSignature avec champs extraits", () => {
    const headers = signedHeaders();
    const result = verifyTransferSignature({
      secret: SECRET,
      method: "POST",
      path: "/api/internal/video-transfers/sessions?resume=1&mode=safe",
      timestamp: headers[TRANSFER_HEADERS.timestamp],
      nonce: headers[TRANSFER_HEADERS.nonce],
      sourceInstanceId: headers[TRANSFER_HEADERS.instanceId],
      bodyDigest: headers[TRANSFER_HEADERS.bodySha256],
      signature: headers[TRANSFER_HEADERS.signature],
      now: NOW,
      nonceCache: createNonceReplayCache(),
    });
    expect(result.sourceInstanceId).toBe(SOURCE_INSTANCE_ID);
  });
});

describe("configuration des instances", () => {
  const baseEnv = {
    NODE_ENV: "production",
    SAMI_INSTANCE_ROLE: "clone",
    SAMI_INSTANCE_ID: SOURCE_INSTANCE_ID,
    SAMI_PRIMARY_BASE_URL: "https://sami.worldercraft.fr",
    SAMI_TRANSFER_SHARED_SECRET: SECRET,
  };

  it("normalise une configuration clone HTTPS valide", () => {
    expect(validateVideoTransferConfig(baseEnv)).toMatchObject({
      role: "clone",
      instanceId: SOURCE_INSTANCE_ID,
      primaryBaseUrl: "https://sami.worldercraft.fr",
      isClone: true,
      requestTimeoutMs: 120_000,
    });
  });

  it("refuse HTTP en production mais l'autorise en développement", () => {
    expectSecurityCode(
      () => validateVideoTransferConfig({
        ...baseEnv,
        SAMI_PRIMARY_BASE_URL: "http://localhost:1234",
      }),
      "INVALID_TRANSFER_CONFIG"
    );
    expect(validateVideoTransferConfig({
      ...baseEnv,
      NODE_ENV: "development",
      SAMI_PRIMARY_BASE_URL: "http://localhost:1234",
    }).primaryBaseUrl).toBe("http://localhost:1234");
  });

  it("n'exige pas l'URL principale sur l'instance primary", () => {
    const config = validateVideoTransferConfig({
      ...baseEnv,
      SAMI_INSTANCE_ROLE: "primary",
      SAMI_PRIMARY_BASE_URL: "",
    });
    expect(config.primaryBaseUrl).toBeNull();
    expect(config.isPrimary).toBe(true);
  });

  it("refuse un secret faible ou une valeur d'exemple", () => {
    expectSecurityCode(
      () => validateVideoTransferConfig({
        ...baseEnv,
        SAMI_TRANSFER_SHARED_SECRET: "trop-court",
      }),
      "INVALID_TRANSFER_SECRET"
    );
    expectSecurityCode(
      () => validateVideoTransferConfig({
        ...baseEnv,
        SAMI_TRANSFER_SHARED_SECRET:
          "change-me-with-at-least-32-random-bytes",
      }),
      "INVALID_TRANSFER_CONFIG"
    );
  });
});

describe("confinement des chemins vidéo", () => {
  it("accepte uniquement les trois dossiers modernes", () => {
    expect(validateTransferRelativePath("hls/master.m3u8")).toBe(
      "hls/master.m3u8"
    );
    expect(validateTransferRelativePath("affiche/film.webp")).toBe(
      "affiche/film.webp"
    );
    expect(validateTransferRelativePath("sousTitre/fr.vtt")).toBe(
      "sousTitre/fr.vtt"
    );
  });

  it.each([
    "/hls/master.m3u8",
    "C:\\video\\master.m3u8",
    "hls\\master.m3u8",
    "hls/../affiche/poster.webp",
    "hls/./master.m3u8",
    "hls//master.m3u8",
    "hls/%2e%2e/secret",
    "hls/%252e%252e/secret",
    "hls/\0master.m3u8",
    "hls/master.m3u8?download=1",
    "preview/frame.jpg",
    "hls/．．/secret",
  ])("refuse le chemin trompeur %s", (relativePath) => {
    expectSecurityCode(
      () => validateTransferRelativePath(relativePath),
      "INVALID_TRANSFER_PATH"
    );
  });

  it("résout un fichier réel sous la racine et accepte un leaf de destination absent", async () => {
    const root = await createTemporaryRoot();
    await writeFileUnderRoot(root, "hls/master.m3u8", "#EXTM3U\n");
    const realRoot = await fs.promises.realpath(root);

    expect(await resolveTransferPath(root, "hls/master.m3u8")).toBe(
      path.join(realRoot, "hls", "master.m3u8")
    );
    expect(await resolveTransferPath(root, "hls/new/segment.ts", {
      allowMissingLeaf: true,
    })).toBe(path.join(realRoot, "hls", "new", "segment.ts"));
    await expect(assertNoSymlink(root, "hls/new/segment.ts.part")).resolves.toBe(
      true
    );
  });

  it("refuse un lien symbolique, y compris dans un parent", async () => {
    const root = await createTemporaryRoot();
    const outside = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "sami-transfer-outside-")
    );
    temporaryRoots.push(outside);
    await fs.promises.writeFile(path.join(outside, "secret.ts"), "secret");
    await fs.promises.symlink(
      path.join(outside, "secret.ts"),
      path.join(root, "hls", "linked.ts")
    );
    await fs.promises.symlink(outside, path.join(root, "hls", "linked-dir"));

    await expectAsyncSecurityCode(
      () => resolveTransferPath(root, "hls/linked.ts"),
      "TRANSFER_SYMLINK_FORBIDDEN"
    );
    await expectAsyncSecurityCode(
      () => resolveTransferPath(root, "hls/linked-dir/new.ts", {
        allowMissingLeaf: true,
      }),
      "TRANSFER_SYMLINK_FORBIDDEN"
    );
  });

  it("refuse les dossiers et fichiers spéciaux lorsqu'un fichier est attendu", async () => {
    const root = await createTemporaryRoot();
    await fs.promises.mkdir(path.join(root, "hls", "not-a-file"));
    await expectAsyncSecurityCode(
      () => resolveTransferPath(root, "hls/not-a-file"),
      "INVALID_TRANSFER_FILE_TYPE"
    );
  });
});

describe("validation du manifeste", () => {
  it("normalise les tailles, conserve les métadonnées et calcule le total sûr", () => {
    const manifest = buildManifest();
    const normalized = validateVideoTransferManifest(manifest);
    const expectedTotal = manifest.files.reduce(
      (sum, file) => sum + Number(file.size),
      0
    );

    expect(normalized).toMatchObject({
      exportTransferId: TRANSFER_ID,
      destinationSeasonId: 12,
      initiatedByNickname: "superadmin",
      totalBytes: String(expectedTotal),
      source: { instanceId: SOURCE_INSTANCE_ID, videoId: 42 },
      metadata: {
        title: "Une vidéo moderne",
        premium: false,
        destinationGenreIds: [2, 5],
      },
    });
    expect(normalized.files.every((file) => typeof file.size === "string")).toBe(
      true
    );
  });

  it("refuse une version/source invalide et les chemins dupliqués ou traversants", () => {
    expectSecurityCode(
      () => validateVideoTransferManifest(buildManifest({ version: 2 })),
      "INVALID_TRANSFER_MANIFEST"
    );
    expectSecurityCode(
      () => validateVideoTransferManifest(buildManifest({
        source: { videoId: 0 },
      })),
      "INVALID_TRANSFER_MANIFEST"
    );

    const duplicate = buildManifest();
    duplicate.files.push({ ...duplicate.files[0] });
    expectSecurityCode(
      () => validateVideoTransferManifest(duplicate),
      "INVALID_TRANSFER_MANIFEST"
    );

    const traversal = buildManifest();
    traversal.files[0].relativePath = "hls/../secret";
    expectSecurityCode(
      () => validateVideoTransferManifest(traversal),
      "INVALID_TRANSFER_PATH"
    );
  });

  it("refuse une taille non sûre et une empreinte invalide", () => {
    const unsafeSize = buildManifest();
    unsafeSize.files[0].size = "9007199254740992";
    expectSecurityCode(
      () => validateVideoTransferManifest(unsafeSize),
      "INVALID_TRANSFER_MANIFEST"
    );

    const invalidHash = buildManifest();
    invalidHash.files[0].sha256 = "1234";
    expectSecurityCode(
      () => validateVideoTransferManifest(invalidHash),
      "INVALID_SHA256"
    );
  });

  it("exige le master fixe et tous les chemins référencés par metadata", () => {
    const wrongMaster = buildManifest({
      metadata: { masterPlaylistPath: "hls/other.m3u8" },
    });
    expectSecurityCode(
      () => validateVideoTransferManifest(wrongMaster),
      "INVALID_TRANSFER_MANIFEST"
    );

    const missingPoster = buildManifest();
    missingPoster.files = missingPoster.files.filter(
      (file) => file.relativePath !== "affiche/poster.webp"
    );
    expectSecurityCode(
      () => validateVideoTransferManifest(missingPoster),
      "INVALID_TRANSFER_MANIFEST"
    );
  });

  it("refuse les IDs de genre et ordres audio dupliqués", () => {
    expectSecurityCode(
      () => validateVideoTransferManifest(buildManifest({
        metadata: { destinationGenreIds: [2, 2] },
      })),
      "INVALID_TRANSFER_MANIFEST"
    );

    const duplicatedOrders = buildManifest({
      metadata: {
        audioTracks: [
          {
            label: "FR",
            language: "fr",
            path: "hls/audio/fr/playlist.m3u8",
            isDefault: true,
            order: 0,
          },
          {
            label: "VO",
            language: "en",
            path: "hls/master.m3u8",
            isDefault: false,
            order: 0,
          },
        ],
      },
    });
    expectSecurityCode(
      () => validateVideoTransferManifest(duplicatedOrders),
      "INVALID_TRANSFER_MANIFEST"
    );
  });

  it.each([
    "hls/payload.html",
    "hls/payload.js",
    "affiche/payload.svg",
    "sousTitre/payload.html",
  ])("refuse l'extension web exécutable %s", (relativePath) => {
    const manifest = buildManifest();
    manifest.files.push(fileDescriptor(relativePath, "<script>alert(1)</script>"));

    expectSecurityCode(
      () => validateVideoTransferManifest(manifest),
      "TRANSFER_FILE_EXTENSION_FORBIDDEN"
    );
  });
});

describe("réception et références HLS", () => {
  it("revérifie taille/hash de chaque fichier et toutes les URI HLS locales", async () => {
    const { root, manifest } = await createCompleteHlsFixture();

    await expect(verifyManifestFiles({ root, manifest })).resolves.toMatchObject({
      filesVerified: manifest.files.length,
    });
    await expect(verifyHlsReferences({ root, manifest })).resolves.toEqual({
      playlistsChecked: 3,
      referencesChecked: 5,
    });
  });

  it.each([
    "https://evil.example/stream.m3u8",
    "data:text/plain,evil",
    "file:///etc/passwd",
    "../outside.m3u8",
  ])("refuse la référence externe ou traversante %s", async (reference) => {
    const { root, manifest } = await createCompleteHlsFixture();
    await writeFileUnderRoot(
      root,
      "hls/master.m3u8",
      `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n${reference}\n`
    );

    await expectAsyncSecurityCode(
      () => verifyHlsReferences({ root, manifest }),
      "INVALID_HLS_REFERENCE"
    );
  });

  it("valide aussi les attributs URI= et refuse un fichier absent du manifeste", async () => {
    const { root, manifest } = await createCompleteHlsFixture();
    await writeFileUnderRoot(
      root,
      "hls/master.m3u8",
      '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="missing.m3u8"\n'
    );
    await writeFileUnderRoot(root, "hls/missing.m3u8", "#EXTM3U\n");

    await expectAsyncSecurityCode(
      () => verifyHlsReferences({ root, manifest }),
      "HLS_REFERENCE_NOT_IN_MANIFEST"
    );
  });

  it("refuse un fichier référencé au manifeste mais absent du disque", async () => {
    const { root, manifest } = await createCompleteHlsFixture();
    await writeFileUnderRoot(
      root,
      "hls/video/playlist.m3u8",
      "#EXTM3U\n#EXTINF:4,\nmissing.ts\n"
    );
    manifest.files.push(fileDescriptor("hls/video/missing.ts", "missing"));

    await expectAsyncSecurityCode(
      () => verifyHlsReferences({ root, manifest }),
      "TRANSFER_FILE_NOT_FOUND"
    );
  });

  it("exige #EXTM3U et refuse de charger une playlist géante en mémoire", async () => {
    const invalidHeader = await createCompleteHlsFixture();
    await writeFileUnderRoot(
      invalidHeader.root,
      "hls/master.m3u8",
      "#NOT-HLS\nsegment.ts\n"
    );
    await expectAsyncSecurityCode(
      () => verifyHlsReferences(invalidHeader),
      "INVALID_HLS_PLAYLIST"
    );

    const oversized = await createCompleteHlsFixture();
    const oversizedPath = path.join(oversized.root, "hls", "master.m3u8");
    const handle = await fs.promises.open(oversizedPath, "r+");
    try {
      await handle.truncate(MAX_HLS_PLAYLIST_BYTES + 1);
    } finally {
      await handle.close();
    }
    await expectAsyncSecurityCode(
      () => verifyHlsReferences(oversized),
      "INVALID_HLS_PLAYLIST"
    );
  });
});
