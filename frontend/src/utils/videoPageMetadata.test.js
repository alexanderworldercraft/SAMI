import {
  buildVideoPageMetadata,
  isDefaultPosterPath,
  normalizePublicPosterPath,
  truncateMetaDescription,
} from "./videoPageMetadata";

describe("buildVideoPageMetadata", () => {
  test("construit les métadonnées complètes d'un film", () => {
    const metadata = buildVideoPageMetadata({
      id: 42,
      video: {
        VideoID: 42,
        Titre: "Le Film",
        Resumer: "Un résumé\navec   des espaces.",
        CheminImage: "uploads/video/42/affiche/film.jpg",
      },
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://media.example",
    });

    expect(metadata).toEqual({
      siteName: "SAMI",
      title: "Le Film - SAMI",
      description: "Un résumé avec des espaces.",
      canonicalUrl: "https://sami.example/lecture/42",
      imageUrl: "https://media.example/uploads/video/42/affiche/film.jpg",
      imageAlt: "Affiche de Le Film",
      openGraphType: "video.movie",
    });
  });

  test("utilise le résumé et l'affiche de la série pour un épisode sans visuels propres", () => {
    const metadata = buildVideoPageMetadata({
      id: "84",
      video: {
        VideoID: 84,
        Titre: "Épisode 3",
        Resumer: "",
        CheminImage: "/imageDefault.png",
        SaisonID: 7,
      },
      series: {
        Titre: "La Série",
        Resumer: "Résumé de la série.",
        CheminImage: "uploads/series/12/poster.webp",
      },
      currentSeason: { Numero: 2 },
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://sami.example",
    });

    expect(metadata.title).toBe("Épisode 3 (Saison 2 - La Série) - SAMI");
    expect(metadata.description).toBe("Résumé de la série.");
    expect(metadata.imageUrl).toBe("https://sami.example/uploads/series/12/poster.webp");
    expect(metadata.imageAlt).toBe("Affiche de La Série");
    expect(metadata.openGraphType).toBe("video.episode");
  });

  test("donne la priorité à l'affiche de la série pour un épisode ayant sa propre affiche", () => {
    const metadata = buildVideoPageMetadata({
      id: 85,
      video: {
        VideoID: 85,
        Titre: "Épisode 4",
        CheminImage: "uploads/video/85/affiche/episode.webp",
        SaisonID: 7,
      },
      series: {
        Titre: "La Série",
        CheminImage: "uploads/series/12/poster.webp",
      },
      currentSeason: { Numero: 2 },
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://media.example",
    });

    expect(metadata.imageUrl).toBe("https://media.example/uploads/series/12/poster.webp");
    expect(metadata.imageAlt).toBe("Affiche de La Série");
  });

  test("utilise l'affiche de l'épisode si la série n'a pas d'affiche exploitable", () => {
    const metadata = buildVideoPageMetadata({
      id: 86,
      video: {
        VideoID: 86,
        Titre: "Épisode 5",
        CheminImage: "uploads/video/86/affiche/episode.webp",
        SaisonID: 7,
      },
      series: {
        Titre: "La Série",
        CheminImage: "/imageDefault.png",
      },
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://media.example",
    });

    expect(metadata.imageUrl).toBe("https://media.example/uploads/video/86/affiche/episode.webp");
    expect(metadata.imageAlt).toBe("Affiche de Épisode 5");
  });

  test("utilise le logo si aucune affiche exploitable n'est disponible", () => {
    const metadata = buildVideoPageMetadata({
      id: 9,
      video: {
        Titre: "Sans affiche",
        CheminImage: "uploads/default.png",
      },
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://media.example",
    });

    expect(metadata.imageUrl).toBe("https://sami.example/logo512.png");
    expect(metadata.imageAlt).toBe("Logo de SAMI");
  });

  test("produit un fallback de site sans vidéo et ignore une saison invalide", () => {
    const fallback = buildVideoPageMetadata({
      id: 12,
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://media.example",
    });
    const episode = buildVideoPageMetadata({
      id: 13,
      video: { Titre: "Épisode", SaisonID: 1 },
      series: { Titre: "Série" },
      currentSeason: { Numero: 0 },
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://media.example",
    });

    expect(fallback.openGraphType).toBe("website");
    expect(fallback.canonicalUrl).toBe("https://sami.example/lecture/12");
    expect(fallback.title).toBe("SAMI");
    expect(fallback.description).toBe("Découvrez les contenus disponibles sur SAMI.");
    expect(episode.title).toBe("Épisode (Série) - SAMI");
    expect(episode.description).toBe("Regardez Épisode de la série Série sur SAMI.");
  });

  test("utilise l'accueil comme URL canonique pour un identifiant invalide", () => {
    const metadata = buildVideoPageMetadata({
      id: "../12",
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://sami.example",
    });

    expect(metadata.canonicalUrl).toBe("https://sami.example/");
  });

  test("refuse une affiche externe puis utilise l'affiche locale de la série", () => {
    const metadata = buildVideoPageMetadata({
      id: 14,
      video: {
        Titre: "Épisode",
        SaisonID: 1,
        CheminImage: "https://external.example/poster.jpg",
      },
      series: {
        Titre: "Série",
        CheminImage: "uploads/series/1/poster.jpg",
      },
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://sami.example",
    });

    expect(metadata.imageUrl).toBe("https://sami.example/uploads/series/1/poster.jpg");
    expect(metadata.imageAlt).toBe("Affiche de Série");
  });
});

describe("utilitaires de métadonnées", () => {
  test("reconnaît les noms d'image par défaut indépendamment du chemin et de l'extension", () => {
    expect(isDefaultPosterPath("/imageDefault.png?version=2")).toBe(true);
    expect(isDefaultPosterPath("uploads/video/default.png")).toBe(true);
    expect(isDefaultPosterPath("uploads\\video\\DEFAULTIMAGE.webp")).toBe(true);
    expect(isDefaultPosterPath("uploads/video/image-default.jpg")).toBe(true);
    expect(isDefaultPosterPath(null)).toBe(true);
    expect(isDefaultPosterPath("uploads/video/affiche.webp")).toBe(false);
  });

  test("n'accepte que les affiches locales sous uploads", () => {
    expect(normalizePublicPosterPath("uploads/video/1/poster.jpg")).toBe("/uploads/video/1/poster.jpg");
    expect(normalizePublicPosterPath("uploads\\series\\2\\poster.webp")).toBe("/uploads/series/2/poster.webp");
    expect(normalizePublicPosterPath("https://example.com/poster.jpg")).toBeNull();
    expect(normalizePublicPosterPath("uploads/video/../secret.jpg")).toBeNull();
    expect(normalizePublicPosterPath("uploads/video/poster.jpg?version=2")).toBeNull();
    expect(normalizePublicPosterPath("uploads/video/poster%2ejpg")).toBeNull();
    expect(normalizePublicPosterPath("uploads/video/poster\u0000.jpg")).toBeNull();
  });

  test("normalise et limite la description à 200 caractères", () => {
    const description = truncateMetaDescription(`  ${"mot ".repeat(60)}  `);

    expect(description).toHaveLength(200);
    expect(description.endsWith("…")).toBe(true);
    expect(description).not.toMatch(/\s{2,}/);
  });

  test("ne coupe pas un emoji au milieu d'un point de code", () => {
    const description = truncateMetaDescription("😀".repeat(205));

    expect(Array.from(description)).toHaveLength(200);
    expect(description.endsWith("…")).toBe(true);
  });
});
