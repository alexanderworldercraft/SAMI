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
