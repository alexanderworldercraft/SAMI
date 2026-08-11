import { describe, expect, it, vi } from "vitest";

import { ETAT } from "../constants.js";
import {
  buildLectureSocialMeta,
  getLectureSocialMetadata,
  injectSocialMetaBlock,
  parseLectureVideoId,
  renderSocialMetaBlock,
  resolvePublicOrigin,
  SOCIAL_META_END,
  SOCIAL_META_START,
} from "../services/socialPreviewService.js";

describe("socialPreviewService", () => {
  it("charge une projection minimale active sans filtrer les contenus Premium", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      VideoID: 42,
      Titre: "Film Premium",
      Resumer: "Résumé du film",
      CheminImage: "uploads/video/42/affiche/poster.webp",
      Saison: null,
    });

    const metadata = await getLectureSocialMetadata(42, {
      database: { video: { findFirst } },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        VideoID: 42,
        EtatID: ETAT.ACTIVE,
      },
      select: {
        VideoID: true,
        Titre: true,
        Resumer: true,
        CheminImage: true,
        Saison: {
          select: {
            Numero: true,
            Series: {
              select: {
                Titre: true,
                Resumer: true,
                CheminImage: true,
                EtatID: true,
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(findFirst.mock.calls[0][0])).not.toContain("CheminAcces");
    expect(JSON.stringify(findFirst.mock.calls[0][0])).not.toContain("Premium");
    expect(metadata).toEqual({
      type: "movie",
      videoId: 42,
      video: {
        title: "Film Premium",
        summary: "Résumé du film",
        image: "uploads/video/42/affiche/poster.webp",
      },
      season: null,
      series: null,
    });
  });

  it("masque un épisode lorsque sa série est inactive", async () => {
    const database = {
      video: {
        findFirst: vi.fn().mockResolvedValue({
          VideoID: 73,
          Titre: "Épisode privé",
          Resumer: "Résumé",
          CheminImage: "uploads/video/73/affiche/poster.jpg",
          Saison: {
            Numero: 2,
            Series: {
              Titre: "Série supprimée",
              Resumer: "Résumé série",
              CheminImage: "uploads/serie/8/poster.jpg",
              EtatID: ETAT.DELETED,
            },
          },
        }),
      },
    };

    await expect(
      getLectureSocialMetadata(73, { database })
    ).resolves.toBeNull();
  });

  it("préfère l'affiche de série même lorsque l'épisode a sa propre affiche", () => {
    const summary = `  ${"Résumé très détaillé. ".repeat(20)}  `;
    const meta = buildLectureSocialMeta({
      videoId: 73,
      appName: "SAMI Privé",
      publicOrigin: "https://sami.example",
      content: {
        type: "episode",
        videoId: 73,
        video: {
          title: "Épisode 4",
          summary,
          image: "uploads/video/73/affiche-episode.webp",
        },
        season: { number: 2 },
        series: {
          title: "La Série",
          summary: "Résumé de la série",
          image: "uploads/serie/8/affiche.webp",
        },
      },
    });

    expect(meta.type).toBe("video.episode");
    expect(meta.title).toBe("Épisode 4 (Saison 2 - La Série) - SAMI Privé");
    expect(meta.description.length).toBeLessThanOrEqual(200);
    expect(meta.description.endsWith("…")).toBe(true);
    expect(meta.imageUrl).toBe("https://sami.example/uploads/serie/8/affiche.webp");
    expect(meta.imageAlt).toBe("Affiche de La Série");
    expect(meta.canonicalUrl).toBe("https://sami.example/lecture/73");
  });

  it("utilise l'affiche de l'épisode lorsque la série n'a pas d'affiche exploitable", () => {
    const meta = buildLectureSocialMeta({
      videoId: 73,
      appName: "SAMI Privé",
      publicOrigin: "https://sami.example",
      content: {
        type: "episode",
        videoId: 73,
        video: {
          title: "Épisode 4",
          summary: "Résumé",
          image: "uploads/video/73/affiche-episode.webp",
        },
        season: { number: 2 },
        series: {
          title: "La Série",
          summary: "Résumé de la série",
          image: "uploads/images/imageDefault.PNG",
        },
      },
    });

    expect(meta.imageUrl).toBe("https://sami.example/uploads/video/73/affiche-episode.webp");
    expect(meta.imageAlt).toBe("Affiche de Épisode 4");
  });

  it("conserve l'affiche vidéo pour un film", () => {
    const meta = buildLectureSocialMeta({
      videoId: 74,
      appName: "SAMI Privé",
      publicOrigin: "https://sami.example",
      content: {
        type: "movie",
        videoId: 74,
        video: {
          title: "Le Film",
          summary: "Résumé du film",
          image: "uploads/video/74/affiche-film.webp",
        },
        series: {
          title: "Série ignorée",
          image: "uploads/serie/8/affiche-serie.webp",
        },
      },
    });

    expect(meta.type).toBe("video.movie");
    expect(meta.imageUrl).toBe("https://sami.example/uploads/video/74/affiche-film.webp");
    expect(meta.imageAlt).toBe("Affiche de Le Film");
  });

  it("échappe le HTML et remplace un bloc existant sans doublon", () => {
    const meta = buildLectureSocialMeta({
      videoId: 9,
      appName: 'SAMI "Privé"',
      publicOrigin: "https://sami.example",
      content: {
        type: "movie",
        videoId: 9,
        video: {
          title: "</title><script>alert('xss')</script>",
          summary: 'Résumé "dangereux" & détaillé',
          image: "uploads/video/9/affiche/poster.jpg",
        },
      },
    });
    const block = renderSocialMetaBlock(meta);
    const template = [
      "<html><head>",
      SOCIAL_META_START,
      '<meta property="og:title" content="Ancien" />',
      SOCIAL_META_END,
      "</head><body></body></html>",
    ].join("\n");

    const html = injectSocialMetaBlock(template, block);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;/title&gt;&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(html).toContain("Résumé &quot;dangereux&quot; &amp; détaillé");
    expect(html).not.toContain('content="Ancien"');
    expect(html.match(/name="sami-meta-start"/g)).toHaveLength(1);
    expect(html).toContain('<title data-rh="true">');
    expect(html).toContain('<link data-rh="true" rel="canonical"');
  });

  it("remplace aussi les sentinelles conservées dans un build CRA minifié", () => {
    const genericBlock = [
      '<meta content="" name="sami-meta-start"/>',
      '<title data-rh="true">Titre générique</title>',
      '<meta data-rh="true" property="og:title" content="Titre générique"/>',
      '<meta content="" name="sami-meta-end"/>',
    ].join("");
    const dynamicBlock = renderSocialMetaBlock(
      buildLectureSocialMeta({
        content: null,
        videoId: 42,
        appName: "SAMI",
        publicOrigin: "https://sami.example",
      })
    );

    const html = injectSocialMetaBlock(
      `<!doctype html><html><head>${genericBlock}</head><body></body></html>`,
      dynamicBlock
    );

    expect(html).not.toContain("Titre générique");
    expect(html.match(/name="sami-meta-start"/g)).toHaveLength(1);
    expect(html.match(/name="sami-meta-end"/g)).toHaveLength(1);
    expect(html).toContain("https://sami.example/lecture/42");
  });

  it("rejette une affiche vidéo traversante puis utilise l'affiche valide de la série", () => {
    const meta = buildLectureSocialMeta({
      videoId: 9,
      appName: "SAMI Privé",
      publicOrigin: "https://sami.example",
      content: {
        type: "episode",
        videoId: 9,
        video: {
          title: "Épisode",
          summary: "Résumé",
          image: "uploads/video/9/../secret.jpg",
        },
        season: { number: 1 },
        series: {
          title: "Série sûre",
          summary: "Résumé série",
          image: "uploads/serie/3/affiche.jpg",
        },
      },
    });

    expect(meta.imageUrl).toBe("https://sami.example/uploads/serie/3/affiche.jpg");
    expect(meta.imageAlt).toBe("Affiche de Série sûre");
  });

  it("décrit le logo lorsque toutes les affiches sont rejetées", () => {
    const meta = buildLectureSocialMeta({
      videoId: 9,
      appName: "SAMI Privé",
      publicOrigin: "https://sami.example",
      content: {
        type: "movie",
        videoId: 9,
        video: {
          title: "Film",
          summary: "Résumé",
          image: "https://evil.example/poster.jpg",
        },
      },
    });

    expect(meta.imageUrl).toBe("https://sami.example/logo512.png");
    expect(meta.imageAlt).toBe("Logo de SAMI Privé");
  });

  it("refuse les identifiants hors plage et ignore toujours un Host malveillant", () => {
    for (const value of ["0", "-1", "1.5", "1e3", "2147483648", "abc", ""]) {
      expect(parseLectureVideoId(value)).toBeNull();
    }
    expect(parseLectureVideoId("2147483647")).toBe(2_147_483_647);

    expect(
      resolvePublicOrigin("javascript:alert(1)", {
        protocol: "https",
        host: "evil.example",
        headers: { host: "evil.example" },
      })
    ).toBe("http://localhost");
    expect(
      resolvePublicOrigin("ftp://bad.example, https://sami.example/app")
    ).toBe("https://sami.example");
  });
});
