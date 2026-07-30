import { prisma } from "./db.js";
import { ETAT } from "../constants.js";

const contentKeyForVideo = (id) => `video:${id}`;
const contentKeyForSeries = (id) => `series:${id}`;

const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const toVideoItem = (video) => ({
  id: video.VideoID,
  type: "video",
  Titre: video.Titre,
  Resumer: video.Resumer,
  Premium: video.Premium,
  CheminImage: video.CheminImage,
  Genres: (video.VideoGenres || []).map((vg) => vg.Genre.Nom),
  FeaturedBadge: "À la une",
});

const toSeriesItem = (series) => {
  const firstSeason = series.Saisons?.[0];
  const firstVideo = firstSeason?.Episodes?.[0];

  return {
    id: series.SeriesID,
    type: "series",
    Titre: series.Titre,
    Resumer: series.Resumer,
    Premium: series.Premium,
    CheminImage: series.CheminImage,
    FirstVideoID: firstVideo?.VideoID || null,
    Saisons: series.Saisons?.length || 0,
    Genres: (series.SeriesGenres || []).map((sg) => sg.Genre.Nom),
    FeaturedBadge: "À la une",
  };
};

const buildCandidatesByGenre = async () => {
  const genres = await prisma.genre.findMany({
    orderBy: { Nom: "asc" },
    select: { GenreID: true, Nom: true },
  });

  const [videoLinks, seriesLinks] = await Promise.all([
    prisma.videoGenre.findMany({
      where: {
        Video: {
          SaisonID: null,
          EtatID: ETAT.ACTIVE,
        },
      },
      select: { GenreID: true, VideoID: true },
    }),
    prisma.seriesGenre.findMany({
      select: { GenreID: true, SeriesID: true },
    }),
  ]);

  const candidatesByGenre = new Map(
    genres.map((genre) => [genre.GenreID, { genre, candidates: [] }])
  );

  videoLinks.forEach((link) => {
    candidatesByGenre.get(link.GenreID)?.candidates.push({
      contentKey: contentKeyForVideo(link.VideoID),
      type: "video",
      videoId: link.VideoID,
      seriesId: null,
    });
  });

  seriesLinks.forEach((link) => {
    candidatesByGenre.get(link.GenreID)?.candidates.push({
      contentKey: contentKeyForSeries(link.SeriesID),
      type: "series",
      videoId: null,
      seriesId: link.SeriesID,
    });
  });

  return [...candidatesByGenre.values()].map(({ genre, candidates }) => {
    const uniqueCandidates = Array.from(
      new Map(candidates.map((candidate) => [candidate.contentKey, candidate])).values()
    );

    return {
      ...genre,
      candidates: uniqueCandidates,
      candidateCount: uniqueCandidates.length,
    };
  });
};

export const rotateGenreFeaturedContent = async () => {
  const [genreCandidates, currentRows] = await Promise.all([
    buildCandidatesByGenre(),
    prisma.genreFeaturedContent.findMany({
      select: {
        GenreID: true,
        ContentKey: true,
        PreviousContentKey: true,
      },
    }),
  ]);

  const currentByGenre = new Map(currentRows.map((row) => [row.GenreID, row]));
  const previousContentKeys = new Set(
    currentRows
      .map((row) => row.ContentKey)
      .filter(Boolean)
  );
  const selectedContentKeys = new Set();
  const now = new Date();

  const orderedGenres = genreCandidates.sort(
    (a, b) => a.candidateCount - b.candidateCount || a.Nom.localeCompare(b.Nom)
  );

  const updates = [];
  const summary = [];

  for (const genre of orderedGenres) {
    const eligible = shuffle(genre.candidates).filter(
      (candidate) =>
        !previousContentKeys.has(candidate.contentKey) &&
        !selectedContentKeys.has(candidate.contentKey)
    );
    const selected = eligible[0] || null;
    const previous = currentByGenre.get(genre.GenreID)?.ContentKey || null;

    if (selected) {
      selectedContentKeys.add(selected.contentKey);
    }

    const data = {
      VideoID: selected?.videoId || null,
      SeriesID: selected?.seriesId || null,
      ContentKey: selected?.contentKey || null,
      PreviousContentKey: previous,
      CandidateCount: genre.candidateCount,
      ActiveFrom: now,
    };

    updates.push(
      prisma.genreFeaturedContent.upsert({
        where: { GenreID: genre.GenreID },
        create: {
          GenreID: genre.GenreID,
          ...data,
        },
        update: data,
      })
    );

    summary.push({
      GenreID: genre.GenreID,
      Nom: genre.Nom,
      CandidateCount: genre.candidateCount,
      ContentKey: selected?.contentKey || null,
      skippedBecauseNoEligibleContent: !selected,
    });
  }

  await prisma.$transaction(updates);

  return {
    rotatedAt: now,
    genres: summary,
  };
};

export const getGenreFeaturedContent = async (genreIds = []) => {
  const sanitizedIds = genreIds.map(Number).filter(Number.isInteger);

  const rows = await prisma.genreFeaturedContent.findMany({
    where: {
      ...(sanitizedIds.length > 0
        ? { GenreID: { in: sanitizedIds } }
        : {}),
      OR: [
        {
          VideoID: { not: null },
          Video: { EtatID: ETAT.ACTIVE },
        },
        { SeriesID: { not: null } },
      ],
    },
    include: {
      Genre: true,
      Video: {
        include: { VideoGenres: { include: { Genre: true } } },
      },
      Series: {
        include: {
          SeriesGenres: { include: { Genre: true } },
          Saisons: {
            include: {
              Episodes: {
                where: { EtatID: ETAT.ACTIVE },
                take: 1,
                orderBy: { Titre: "asc" },
              },
            },
            orderBy: { Numero: "asc" },
          },
        },
      },
    },
    orderBy: { Genre: { Nom: "asc" } },
  });

  return rows.map((row) => ({
    GenreID: row.GenreID,
    Genre: row.Genre,
    ContentKey: row.ContentKey,
    PreviousContentKey: row.PreviousContentKey,
    CandidateCount: row.CandidateCount,
    ActiveFrom: row.ActiveFrom,
    item: row.Video ? toVideoItem(row.Video) : row.Series ? toSeriesItem(row.Series) : null,
  }));
};
