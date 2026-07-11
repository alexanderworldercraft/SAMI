import { prisma } from "./db.js";
import { ETAT } from "../constants.js";

const normalizeItem = (item = {}) => {
  const type = item.type === "series" ? "series" : item.type === "video" ? "video" : null;
  const id = Number(item.id ?? item.VideoID ?? item.SeriesID);

  if (!type || !Number.isInteger(id) || id <= 0) {
    return null;
  }

  return { type, id };
};

const favoriteKey = (type, id) => `${type}:${id}`;

export const getFavoriteKeysForItems = async (userId, items = []) => {
  const normalized = items.map(normalizeItem).filter(Boolean);
  if (!userId || !normalized.length) return new Set();

  const videoIds = [...new Set(normalized.filter((item) => item.type === "video").map((item) => item.id))];
  const seriesIds = [...new Set(normalized.filter((item) => item.type === "series").map((item) => item.id))];

  if (!videoIds.length && !seriesIds.length) return new Set();

  const rows = await prisma.userFavoriteContent.findMany({
    where: {
      UserID: userId,
      OR: [
        videoIds.length ? { VideoID: { in: videoIds } } : null,
        seriesIds.length ? { SeriesID: { in: seriesIds } } : null,
      ].filter(Boolean),
    },
    select: {
      VideoID: true,
      SeriesID: true,
    },
  });

  return new Set(
    rows
      .map((row) =>
        row.VideoID
          ? favoriteKey("video", row.VideoID)
          : row.SeriesID
            ? favoriteKey("series", row.SeriesID)
            : null
      )
      .filter(Boolean)
  );
};

export const attachFavoriteStatus = async (items = [], userId) => {
  if (!userId || !items.length) return items;

  const keys = await getFavoriteKeysForItems(userId, items);
  return items.map((item) => ({
    ...item,
    IsFavorite: keys.has(favoriteKey(item.type, item.id)),
  }));
};

export const getFavoriteStatus = async (userId, items = []) => {
  const normalized = items.map(normalizeItem).filter(Boolean);
  const keys = await getFavoriteKeysForItems(userId, normalized);

  return normalized.map((item) => ({
    ...item,
    IsFavorite: keys.has(favoriteKey(item.type, item.id)),
  }));
};

export const toggleFavoriteContent = async ({ userId, type, id }) => {
  const item = normalizeItem({ type, id });
  if (!userId || !item) {
    const error = new Error("Contenu invalide.");
    error.statusCode = 400;
    throw error;
  }

  const where = item.type === "video"
    ? { UserID: userId, VideoID: item.id }
    : { UserID: userId, SeriesID: item.id };

  const existing = await prisma.userFavoriteContent.findFirst({
    where,
    select: { UserFavoriteContentID: true },
  });

  if (existing) {
    await prisma.userFavoriteContent.delete({
      where: { UserFavoriteContentID: existing.UserFavoriteContentID },
    });
    return { IsFavorite: false };
  }

  const contentExists = item.type === "video"
    ? await prisma.video.findFirst({
        where: { VideoID: item.id, EtatID: ETAT.ACTIVE },
        select: { VideoID: true },
      })
    : await prisma.series.findFirst({
        where: { SeriesID: item.id, EtatID: ETAT.ACTIVE },
        select: { SeriesID: true },
      });

  if (!contentExists) {
    const error = new Error("Contenu introuvable.");
    error.statusCode = 404;
    throw error;
  }

  await prisma.userFavoriteContent.create({
    data: item.type === "video"
      ? { UserID: userId, VideoID: item.id }
      : { UserID: userId, SeriesID: item.id },
  });

  return { IsFavorite: true };
};

export const buildUserFavoritesPayload = async (userId) => {
  const rows = await prisma.userFavoriteContent.findMany({
    where: { UserID: userId },
    orderBy: { CreateDate: "desc" },
    include: {
      Video: {
        include: {
          VideoGenres: { include: { Genre: true } },
        },
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
  });

  return rows
    .map((row) => {
      if (row.Video) {
        if (row.Video.EtatID !== ETAT.ACTIVE) return null;
        return {
          favoriteId: row.UserFavoriteContentID.toString(),
          favoriteDate: row.CreateDate,
          id: row.Video.VideoID,
          type: "video",
          Titre: row.Video.Titre,
          Resumer: row.Video.Resumer,
          Premium: row.Video.Premium,
          CheminImage: row.Video.CheminImage,
          Genres: row.Video.VideoGenres.map((vg) => vg.Genre.Nom),
          CreateDate: row.Video.CreateDate,
          IsFavorite: true,
        };
      }

      if (row.Series) {
        if (row.Series.EtatID !== ETAT.ACTIVE) return null;
        const firstSeason = row.Series.Saisons?.[0];
        const firstVideo = firstSeason?.Episodes?.[0];
        return {
          favoriteId: row.UserFavoriteContentID.toString(),
          favoriteDate: row.CreateDate,
          id: row.Series.SeriesID,
          type: "series",
          Titre: row.Series.Titre,
          Resumer: row.Series.Resumer,
          Premium: row.Series.Premium,
          CheminImage: row.Series.CheminImage,
          FirstVideoID: firstVideo?.VideoID || null,
          Saisons: row.Series.Saisons?.length || 0,
          Genres: row.Series.SeriesGenres.map((sg) => sg.Genre.Nom),
          CreateDate: row.Series.CreateDate,
          IsFavorite: true,
        };
      }

      return null;
    })
    .filter(Boolean);
};

export const buildFavoriteContentSummaryPayload = async ({
  search = "",
  sort = "desc",
  page = 1,
  take = 6,
} = {}) => {
  const [videoGroups, seriesGroups] = await Promise.all([
    prisma.userFavoriteContent.groupBy({
      by: ["VideoID"],
      where: { VideoID: { not: null } },
      _count: { UserID: true },
    }),
    prisma.userFavoriteContent.groupBy({
      by: ["SeriesID"],
      where: { SeriesID: { not: null } },
      _count: { UserID: true },
    }),
  ]);

  const videoIds = videoGroups.map((group) => group.VideoID).filter(Boolean);
  const seriesIds = seriesGroups.map((group) => group.SeriesID).filter(Boolean);

  const [videos, series] = await Promise.all([
    videoIds.length
      ? prisma.video.findMany({
          where: { VideoID: { in: videoIds }, EtatID: ETAT.ACTIVE },
          select: {
            VideoID: true,
            Titre: true,
            Resumer: true,
            CheminImage: true,
            Premium: true,
            CreateDate: true,
          },
        })
      : [],
    seriesIds.length
      ? prisma.series.findMany({
          where: { SeriesID: { in: seriesIds }, EtatID: ETAT.ACTIVE },
          include: {
            Saisons: {
              include: {
                Episodes: {
                  where: { EtatID: ETAT.ACTIVE },
                  take: 1,
                  orderBy: { Titre: "asc" },
                  select: { VideoID: true },
                },
              },
              orderBy: { Numero: "asc" },
            },
          },
        })
      : [],
  ]);

  const videoById = new Map(videos.map((video) => [video.VideoID, video]));
  const seriesById = new Map(series.map((serie) => [serie.SeriesID, serie]));

  const videoItems = videoGroups
    .map((group) => {
      const video = videoById.get(group.VideoID);
      if (!video) return null;

      return {
        id: video.VideoID,
        type: "video",
        title: video.Titre,
        resume: video.Resumer,
        image: video.CheminImage,
        premium: video.Premium,
        createDate: video.CreateDate,
        favoriteCount: group._count.UserID,
        targetUrl: `/lecture/${video.VideoID}`,
      };
    })
    .filter(Boolean);

  const seriesItems = seriesGroups
    .map((group) => {
      const serie = seriesById.get(group.SeriesID);
      if (!serie) return null;

      const firstVideoId = serie.Saisons?.[0]?.Episodes?.[0]?.VideoID || null;
      return {
        id: serie.SeriesID,
        type: "series",
        title: serie.Titre,
        resume: serie.Resumer,
        image: serie.CheminImage,
        premium: serie.Premium,
        createDate: serie.CreateDate,
        favoriteCount: group._count.UserID,
        targetUrl: firstVideoId ? `/lecture/${firstVideoId}` : "#",
        seasons: serie.Saisons?.length || 0,
      };
    })
    .filter(Boolean);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = [...videoItems, ...seriesItems].filter((item) =>
    normalizedSearch ? item.title.toLowerCase().includes(normalizedSearch) : true
  );

  const direction = sort === "asc" ? 1 : -1;
  const sorted = filtered.sort(
    (a, b) =>
      direction * (a.favoriteCount - b.favoriteCount) ||
      a.title.localeCompare(b.title, "fr")
  );

  const safeTake = Math.min(Math.max(Number(take) || 6, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeTake));
  const currentPage = Math.min(safePage, totalPages);
  const start = (currentPage - 1) * safeTake;

  return {
    items: sorted.slice(start, start + safeTake),
    totalItems,
    totalPages,
    currentPage,
    itemsPerPage: safeTake,
  };
};
