import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { prisma } from "../services/db.js";

// Récupérer la valeur total des vidéos
export const getTotalVideos = async (request, reply) => {
  try {
    const count = await prisma.video.count(); // Compte le nombre total de vidéos
    reply.send({ total: count });
  } catch (error) {
    console.error("Erreur lors de la récupération du nombre de vidéos :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération du nombre de vidéos." });
  }
};

// Récupérer les vidéos et séries avec recherche, pagination, tri et filtres par genres
export const getVideosAndSeries = async (request, reply) => {
  const { page = 1, order = "asc", genres = "", search = "" } = request.query;
  const take = 30; // Nombre d'éléments par page
  const skip = (page - 1) * take;

  const genreIds = genres.split(",").map(Number).filter(Boolean);

  //console.log("Paramètres reçus :", { page, order, genres, search });

  const searchCondition = search
    ? {
      OR: [
        { Titre: { contains: search.toLowerCase() } },
        { Resumer: { contains: search.toLowerCase() } },
      ],
    }
    : {};

  const genreCondition =
    genreIds.length > 0
      ? {
        AND: genreIds.map((id) => ({
          VideoGenres: { some: { GenreID: id } },
        })),
      }
      : {};

  try {
    // Récupérer toutes les vidéos indépendantes
    const videos = await prisma.video.findMany({
      where: {
        AND: [
          { SaisonID: null }, // Exclure les vidéos liées à des saisons
          genreCondition,
          searchCondition,
        ],
      },
      orderBy: { Titre: order },
      include: {
        VideoGenres: {
          include: { Genre: true },
        },
      },
    });

    // Récupérer toutes les séries
    const series = await prisma.series.findMany({
      where: {
        AND: [
          genreIds.length > 0
            ? {
              AND: genreIds.map((id) => ({
                SeriesGenres: { some: { GenreID: id } },
              })),
            }
            : {},
          searchCondition,
        ],
      },
      orderBy: { Titre: order },
      include: {
        Saisons: {
          include: {
            Episodes: {
              take: 1, // Récupère uniquement la première vidéo de la saison
              orderBy: { Titre: "asc" },
            },
          },
          orderBy: { Numero: "asc" },
        },
      },
    });

    // Formater les séries pour inclure le premier épisode
    const seriesWithFirstVideo = series.map((serie) => {
      const firstSeason = serie.Saisons[0];
      const firstVideo = firstSeason?.Episodes[0];
      return {
        id: serie.SeriesID,
        type: "series",
        Titre: serie.Titre,
        Resumer: serie.Resumer,
        CheminImage: serie.CheminImage,
        FirstVideoID: firstVideo?.VideoID || null, // ID de la première vidéo
        Saisons: serie.Saisons.length, // Nombre de saisons
      };
    });

    // Fusionner et trier les résultats
    const allItems = [
      ...seriesWithFirstVideo,
      ...videos.map((video) => ({
        id: video.VideoID,
        type: "video",
        Titre: video.Titre,
        Resumer: video.Resumer,
        CheminImage: video.CheminImage,
        Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
      })),
    ].sort((a, b) => (order === "asc" ? a.Titre.localeCompare(b.Titre) : b.Titre.localeCompare(a.Titre)));

    // Pagination
    const paginatedItems = allItems.slice(skip, skip + take);

    reply.send({
      items: paginatedItems,
      totalPages: Math.ceil(allItems.length / take),
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des vidéos et séries :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération des vidéos et séries." });
  }
};

// Récupérer les détails d'une vidéo
export const getVideoDetails = async (request, reply) => {
  const { id } = request.params;

  try {
    // Récupérer la vidéo avec les informations nécessaires
    const video = await prisma.video.findUnique({
      where: { VideoID: parseInt(id) },
      include: {
        Saison: {
          include: {
            Series: {
              include: {
                Saisons: {
                  include: {
                    Episodes: {
                      orderBy: { Titre: "asc" }, // Tri des épisodes par titre (ordre ascendant)
                    },
                  },
                  orderBy: { Numero: "asc" }, // Tri des saisons par numéro (ordre ascendant)
                },
              },
            },
          },
        },
        VideoGenres: {
          include: { Genre: true },
        }
      },
    });

    // Récupérer et trier les sous-titres séparément
    const videoSubtitles = await prisma.videoSubtitle.findMany({
      where: { VideoID: parseInt(id) },
      orderBy: { Label: 'asc' }, // Tri des sous-titres par Label
    });

    // Ajouter les sous-titres triés à la réponse
    if (video) {
      video.VideoSubtitles = videoSubtitles; // Ajoute les sous-titres triés à l'objet vidéo
    }

    if (!video) {
      return reply.status(404).send({ error: "Vidéo non trouvée." });
    }

    // Si la vidéo fait partie d'une série, ajouter les informations supplémentaires
    if (video.Saison) {
      const series = video.Saison.Series;
      const saisons = series.Saisons.map((saison) => ({
        Numero: saison.Numero,
        Episodes: saison.Episodes.map((episode) => ({
          VideoID: episode.VideoID,
          Titre: episode.Titre,
        })),
      }));

      reply.send({
        type: "series",
        video: {
          VideoID: video.VideoID,
          Titre: video.Titre,
          Resumer: video.Resumer,
          CheminAcces: video.CheminAcces,
          CheminImage: video.CheminImage,
          Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
          VideoSubtitles: video.VideoSubtitles.map((subtitle) => ({
            Label: subtitle.Label,
            CheminSubtitle: subtitle.CheminSubtitle,
          })),
        },
        series: {
          Titre: series.Titre,
          Resumer: series.Resumer,
          Saisons: saisons,
        },
      });
    } else {
      reply.send({
        type: "film",
        video: {
          VideoID: video.VideoID,
          Titre: video.Titre,
          Resumer: video.Resumer,
          CheminAcces: video.CheminAcces,
          CheminImage: video.CheminImage,
          Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
          VideoSubtitles: video.VideoSubtitles.map((subtitle) => ({
            Label: subtitle.Label,
            CheminSubtitle: subtitle.CheminSubtitle,
          })),
        },
      });
    }
  } catch (error) {
    console.error("Erreur lors de la récupération des détails de la vidéo :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération de la vidéo." });
  }
};

// Récupérer les informations de navigation (précédent/suivant)
export const getNavigationInfo = async (request, reply) => {
  const { id } = request.params;

  try {
    // Obtenez les détails de la vidéo actuelle
    const currentVideo = await prisma.video.findUnique({
      where: { VideoID: parseInt(id) },
      select: { Titre: true }
    });

    if (!currentVideo) {
      return reply.status(404).send({ error: "Vidéo non trouvée." });
    }

    const currentTitle = currentVideo.Titre;

    // Vidéo précédente par titre (ordre ASC)
    const prevVideo = await prisma.video.findFirst({
      where: { Titre: { lt: currentTitle } },
      orderBy: { Titre: "desc" }, // Récupère le titre le plus proche avant l'actuel
      select: { VideoID: true, Titre: true }
    });

    // Vidéo suivante par titre (ordre ASC)
    const nextVideo = await prisma.video.findFirst({
      where: { Titre: { gt: currentTitle } },
      orderBy: { Titre: "asc" }, // Récupère le titre le plus proche après l'actuel
      select: { VideoID: true, Titre: true }
    });

    reply.send({
      PrevVideoID: prevVideo?.VideoID || null,
      PrevVideoTitre: prevVideo?.Titre || null,
      NextVideoID: nextVideo?.VideoID || null,
      NextVideoTitre: nextVideo?.Titre || null,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des informations de navigation :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération des informations de navigation." });
  }
};

// Ajouter une vidéo à une saison
export const addEpisode = async (request, reply) => {
  const { Titre, Resumer, CheminAcces, CheminImage, EtatID, GenreIDs, SeriesID, Numero } = request.body;

  try {
    // Trouver la saison correspondante
    const saison = await prisma.saison.findFirst({
      where: {
        SeriesID,
        Numero,
      },
    });

    if (!saison) {
      return reply.status(404).send({ error: "Saison introuvable pour cette série et ce numéro." });
    }

    // Ajouter la vidéo à la saison
    const video = await prisma.video.create({
      data: {
        Titre,
        Resumer,
        CheminAcces,
        CheminImage,
        EtatID,
        SaisonID: saison.SaisonID,
        VideoGenres: {
          create: GenreIDs.map((GenreID) => ({ GenreID })),
        },
      },
    });

    reply.status(201).send(video);
  } catch (error) {
    console.error("Erreur lors de l'ajout de la vidéo :", error);
    reply.status(500).send({ error: "Erreur lors de l'ajout de la vidéo." });
  }
};

// Ajouter une nouvelle vidéo
export const addVideo = async (req, reply, fastify) => {
  try {
    const parts = req.parts();
    const data = {};
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const videoDir = path.join(uploadsDir, 'videos');
    const hlsDir = path.join(videoDir, `hls_${Date.now()}`);
    const imageDir = path.join(uploadsDir, 'images');
    const subtitlesDir = path.join(uploadsDir, 'subtitles');
    const errorDir = path.join(uploadsDir, 'Error_videos');


    if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
    if (!fs.existsSync(subtitlesDir)) fs.mkdirSync(subtitlesDir, { recursive: true });
    if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir, { recursive: true });

    let videoTempPath;

    for await (const part of parts) {
      try {
        if (!part.file) {
          data[part.fieldname] = part.value ? part.value.trim() : undefined;
        } else {
          const extension = path.extname(part.filename).toLowerCase();
          const mimeType = part.mimetype;
          console.log(`Traitement du fichier : ${part.filename}, Type MIME : ${mimeType}`);

          if (mimeType.startsWith('video/') && extension.match(/\.(avi|mov|mkv|webm|flv|wmv|mp4)$/i)) {
            const filePath = path.join(videoDir, `${Date.now()}${extension}`);
            const writeStream = fs.createWriteStream(filePath);
            let uploadedBytes = 0;

            // Récupérer la taille totale depuis les en-têtes HTTP
            const totalBytes = parseInt(req.headers['content-length'], 10);
            if (!totalBytes || isNaN(totalBytes)) {
              console.warn('Impossible de déterminer la taille totale du fichier.');
            }

            part.file.on('data', (chunk) => {
              uploadedBytes += chunk.length;
              const progress = totalBytes
                ? Math.round((uploadedBytes / totalBytes) * 100)
                : null; // Si la taille totale est inconnue, ne calculez pas le pourcentage.

              if (progress !== null) {
                fastify.io.emit('progress', {
                  stage: 'upload',
                  progress: progress,
                });
              }
            });

            await new Promise((resolve, reject) => {
              part.file.pipe(writeStream)
                .on('finish', resolve)
                .on('error', reject);
            });

            videoTempPath = filePath;

            // Émettre un événement final une fois le téléchargement terminé
            fastify.io.emit('progress', {
              stage: 'upload',
              progress: 100,
            });

          } else if (mimeType.startsWith('image/') && extension.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            const filePath = path.join(imageDir, `${Date.now()}${extension}`);
            const writeStream = fs.createWriteStream(filePath);
            await new Promise((resolve, reject) => {
              part.file.pipe(writeStream)
                .on('finish', resolve)
                .on('error', reject);
            });
            data.imagePath = path.join('uploads', path.relative(uploadsDir, filePath));
          } else {
            console.warn(`Fichier ignoré : ${part.filename}, Type MIME : ${mimeType}, Extension : ${extension}`);
          }
        }
      } catch (err) {
        console.error(`Erreur lors du traitement de la partie "${part.fieldname}":`, err.message);
        continue;
      }
    }

    console.log('Données finales après traitement multipart :', data);

    if (!data.titre) {
      return reply.code(400).send({ error: 'Le titre est obligatoire.' });
    }

    if (!videoTempPath) {
      return reply.code(400).send({ error: 'Aucun fichier vidéo fourni.' });
    }

    data.genres = data.genres ? JSON.parse(data.genres) : [];
    data.SaisonID = data.SaisonID ? parseInt(data.SaisonID, 10) : null;

    let videoDuration = 0;

    ffmpeg.ffprobe(videoTempPath, (err, metadata) => {
      if (err) {
        console.error("Erreur lors de l'analyse des métadonnées :", err.message);
        reject(err);
      } else {
        videoDuration = metadata.format.duration || 0; // Assurez-vous qu'une valeur par défaut est définie
        console.log(`Durée totale de la vidéo : ${videoDuration} secondes.`);
      }
    });

    const timemarkToSeconds = (timemark) => {
      if (!timemark) return 0;
      const parts = timemark.split(':'); // Divise en [hh, mm, ss]
      const seconds = parseFloat(parts.pop()); // Récupère les secondes (ss.ss)
      const minutes = parseInt(parts.pop() || '0', 10); // Récupère les minutes (mm)
      const hours = parseInt(parts.pop() || '0', 10); // Récupère les heures (hh)
      return seconds + minutes * 60 + hours * 3600;
    };

    // Étape 1 : Extraction des sous-titres avant réencodage
    console.log("Début de l'extraction des sous-titres...");
    console.log("Analyse des flux de sous-titres...");
    const subtitlePaths = [];
    let subtitleCount = 0;
    await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoTempPath, (err, metadata) => {
        if (err) {
          console.error("Erreur lors de l'analyse des métadonnées :", err.message);
          reject(err);
        } else {
          // Compter les flux de type "subtitle"
          subtitleCount = metadata.streams.filter((stream) => stream.codec_type === 'subtitle').length;
          console.log(`Nombre de sous-titres détectés : ${subtitleCount}`);
          resolve();
        }
      });
    });

    if (subtitleCount > 0) {
      // Créer un sous-dossier unique pour regrouper les sous-titres de la vidéo
      const uniqueSubdir = path.join(subtitlesDir, `${Date.now()}`);
      if (!fs.existsSync(uniqueSubdir)) {
        fs.mkdirSync(uniqueSubdir, { recursive: true });
      }

      for (let i = 0; i < subtitleCount; i++) {
        const subtitlePath = path.join(uniqueSubdir, `subtitle_${i + 1}.vtt`);
        try {
          await new Promise((resolve, reject) => {
            ffmpeg(videoTempPath)
              .outputOptions([`-map 0:s:${i}`, '-c:s webvtt'])
              .output(subtitlePath)
              .on('end', () => {
                console.log(`Sous-titre ${i + 1} extrait avec succès.`);
                subtitlePaths.push(path.join('uploads', 'subtitles', path.relative(subtitlesDir, subtitlePath)));
                resolve();
              })
              .on('error', (err) => {
                console.warn(`Erreur lors de l'extraction du sous-titre ${i + 1} :`, err.message);
                reject(err);
              })
              .run();
          });
        } catch (err) {
          console.warn(`Le sous-titre ${i + 1} n'a pas pu être extrait.`);
        }
      }
    } else {
      console.warn("Aucun sous-titre détecté.");
    }

    // Étape 3 : Analyse des métadonnées
    console.log("Début de l'analyse des métadonnées...");

    const metadata = await new Promise((resolve, reject) =>
      ffmpeg.ffprobe(videoTempPath, (err, metadata) => {
        if (err) {
          console.error('Erreur lors de l’analyse des métadonnées :', err.message);
          detailedErrors.push({
            resolution: 'N/A',
            errorMessage: `Erreur lors de l’analyse des métadonnées : ${err.message}`,
            code: 'Metadata',
          });
        } else {
          //console.log('Métadonnées du fichier :', metadata);

          resolve(metadata);
        }
      })
    );

    function selectAudioTrack(metadata, preferredTags) {
      if (!metadata || !metadata.streams) {
        throw new Error("Métadonnées invalides ou streams manquants");
      }

      // Filtrer uniquement les pistes audio
      const audioStreams = metadata.streams.filter((stream) => stream.codec_type === "audio");

      // Parcourir les préférences
      for (const tag of preferredTags) {
        const matchedStream = audioStreams.find((stream) => {
          const language = stream.tags?.language?.toLowerCase() || "";
          const title = stream.tags?.title?.toLowerCase() || "";
          const languageMatch = language === tag.language.toLowerCase();
          const titleMatch = tag.description ? title.includes(tag.description.toLowerCase()) : true;
          return languageMatch && titleMatch;
        });

        if (matchedStream) {
          console.log("Piste audio sélectionnée :", matchedStream.index, matchedStream.tags);
          return matchedStream.index; // Retourne l'index de la piste audio correspondante
        }
      }

      // Si aucune correspondance précise n'est trouvée, retourner la première piste audio
      if (audioStreams.length > 0) {
        console.warn("Aucune correspondance précise trouvée. Utilisation de la première piste audio par défaut.");
        return audioStreams[0].index;
      }

      console.error("Aucune piste audio disponible dans le fichier.");
      return null;
    }

    // Liste des langues préférées (ordre de préférence)
    const preferredTags = [
      { language: "jap" },
      { language: "jpn" },
      { language: "fra", description: "VFF" }, // Français de France en priorité
      { language: "fre", description: "VFF" },
      { language: "fre", description: "FRE" },
      { language: "fra", description: "VFQ" },
      { language: "fre", description: "VFQ" },
      { language: "fra" },
      { language: "fre" },
    ];

    // Sélectionne l'index de la piste audio
    const audioTrackIndex = selectAudioTrack(metadata, preferredTags);

    if (audioTrackIndex === null) {
      throw new Error("Aucune piste audio disponible");
    }

    // Ajoute l'option pour sélectionner la piste audio
    const audioStreamOption = `-map 0:${audioTrackIndex}`;

    // Détermine l'index de la piste vidéo (généralement 0 si une seule vidéo)
    const videoStreamIndex = metadata.streams.findIndex((stream) => stream.codec_type === "video");

    if (videoStreamIndex === -1) {
      throw new Error("Aucun flux vidéo trouvé dans le fichier source");
    }
    // Ajoute l'option pour sélectionner la piste video
    const videoStreamOption = `-map 0:${videoStreamIndex}`;

    if (Math.abs(audioStreamOption.duration - videoStreamOption.duration) > 2) {
      console.warn("Des désynchronisations potentielles entre l'audio et la vidéo ont été détectées.");
    }

    const { width: originalWidth } = metadata.streams.find((stream) => stream.codec_type === 'video') || {};
    console.log(`Largeur d'origine détectée : ${originalWidth}px`);

    const resolutions = [
      { label: '240p', width: 426, bitrate: 500 },
      { label: '360p', width: 640, bitrate: 1000 },
      { label: '480p', width: 854, bitrate: 1500 },
      { label: '720p', width: 1280, bitrate: 4500 },
      { label: '1080p', width: 1920, bitrate: 12000 },
      { label: '4K', width: 3840, bitrate: 25000 },
    ].filter((res) => res.width <= originalWidth);
    console.log(`Résolutions filtrées : ${resolutions.map((res) => res.label).join(", ")}`);

    // Mise en place de la génération des log d'erreur
    const generateErrorLog = (title, errorDetails) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '');
      const errorFolder = path.join(errorDir, `${sanitizedTitle}_${timestamp}`);
      fs.mkdirSync(errorFolder, { recursive: true });
      const errorLogPath = path.join(errorFolder, `${sanitizedTitle}_${timestamp}.txt`);
      fs.writeFileSync(errorLogPath, errorDetails);
      fs.renameSync(videoTempPath, path.join(errorFolder, path.basename(videoTempPath)));
      return { errorLogPath, errorFolder };
    };

    // Étape 4 et 5 : Conversion HLS + master.m3u8
    console.log("Début de la conversion en HLS...");

    const playlistPaths = [];
    let detailedErrors = []; // Stocker les erreurs pour chaque résolution

    for (const res of resolutions) {
      console.log(`Traitement de la résolution ${res.label}...`);
      const resolutionDir = path.join(hlsDir, res.label);
      fs.mkdirSync(resolutionDir, { recursive: true });
      const resolutionPlaylist = path.join(resolutionDir, `playlist.m3u8`);

      try {
        await new Promise((resolve, reject) => {
          if (!fs.existsSync(videoTempPath)) {
            const errorMsg = "Le fichier vidéo source est introuvable.";
            console.error(errorMsg);
            return reject(new Error(errorMsg));
          }

          ffmpeg(videoTempPath)
          .inputOptions([
            '-hwaccel vaapi',
            '-vaapi_device /dev/dri/renderD128'
          ])
          .outputOptions([
            videoStreamOption,
            `-c:v h264_vaapi`,  // Encodeur matériel VAAPI
            `-vf format=nv12,hwupload,scale_vaapi=w=${res.width}:h=-2`, // Filtre VAAPI
            `-b:v ${res.bitrate}k`, // Bitrate vidéo (remplace CRF)
            `-hls_time 4`,
            `-hls_playlist_type vod`,
            `-profile:v high`,
            audioStreamOption,
            `-c:a aac`, // Encodeur audio AAC
            `-ac 2`,    // Force stéréo
            `-ar 48000`, // Fréquence audio
            `-b:a 256k`, // Bitrate audio
            '-af aresample=async=1:min_hard_comp=0.100:first_pts=0', // Remplissage des silences
          ])
            .output(resolutionPlaylist)
            .on('progress', (progress) => {
              const timemarkInSeconds = timemarkToSeconds(progress.timemark);
              if (!videoDuration || videoDuration <= 0) {
                console.error("Durée de la vidéo invalide :", videoDuration);
                return;
              }

              let percent = Math.round((timemarkInSeconds / videoDuration) * 100);
              percent = isNaN(percent) || percent < 0 || percent > 100 ? 25 : percent;

              fastify.io.emit('progress', {
                stage: 'conversion',
                resolution: res.label,
                progress: percent,
              });
            })
            .on('start', (cmdline) => {
              console.log('✅ Commande FFmpeg générée :', cmdline);
            })
            .on('end', resolve)
            .on('error', (err, stdout, stderr) => {
              console.error('❌ Erreur FFmpeg:', err.message);
              console.error('📝 Sortie standard FFmpeg:', stdout);
              console.error('🛑 Erreur détaillée FFmpeg:', stderr);
              reject(err);
            })
            .run();
        });

        playlistPaths.push({
          resolutionPlaylist: path.relative(videoDir, resolutionPlaylist),
          bitrate: res.bitrate,
          width: Math.round(res.width),
          height: Math.round(res.width * 9 / 16),
        });
      } catch (err) {
        console.warn(`Échec de la conversion pour la résolution ${res.label}. Passer à la suivante.`);
        continue;
      }
    }

    if (detailedErrors.length > 0) {
      const errorLog = detailedErrors
        .map(
          (err) =>
            `Résolution : ${err.resolution}\nErreur : ${err.errorMessage}\nCode de sortie : ${err.code}\n`
        )
        .join('\n');

      const { errorLogPath } = generateErrorLog(data.titre || 'VideoError', errorLog);
      return reply.code(500).send({
        error: 'Une ou plusieurs conversions ont échoué.',
        logPath: errorLogPath,
      });
    }

    if (playlistPaths.length === 0) {
      console.error("Échec de la conversion pour toutes les résolutions.");
      const { errorLogPath } = generateErrorLog(data.titre || 'VideoError', "Aucune conversion réussie.");
      return reply.code(500).send({
        error: 'Toutes les conversions ont échoué.',
        logPath: errorLogPath,
      });
    }

    console.log("Conversion HLS terminée pour toutes les résolutions.");

    fs.unlinkSync(videoTempPath);
    console.log("Fichier vidéo temporaire supprimé après conversion en HLS.");

    const masterPlaylistPath = path.join(hlsDir, 'master.m3u8');
    const relativeMasterPlaylistPath = path.join(
      'uploads',
      'videos',
      path.relative(videoDir, masterPlaylistPath) // Ajout correct du chemin relatif complet
    );
    const masterPlaylistContent = `#EXTM3U\n\n` +
      playlistPaths.map(({ resolutionPlaylist, bitrate, width, height }) =>
        `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate * 1000},RESOLUTION=${width}x${height}\n${path.relative(hlsDir, path.join(videoDir, resolutionPlaylist))}`
      ).join('\n');

    fs.writeFileSync(masterPlaylistPath, masterPlaylistContent);
    console.log("Fichier master.m3u8 généré avec succès.");

    // Étape 6 et 7 : Enregistrement et nettoyage
    console.log("Enregistrement des informations vidéo dans la base de données...");
    const video = await prisma.video.create({
      data: {
        Titre: data.titre,
        Resumer: data.resumer || null, // Inclure le résumé
        CheminAcces: relativeMasterPlaylistPath, // Chemin relatif correct : `uploads/videos/...`
        CheminImage: data.imagePath || 'uploads/images/default.png',
        EtatID: 1,
        SaisonID: data.SaisonID || null, // Inclure la saison
      },
    });

    if (data.genres) {
      await Promise.all(data.genres.map(async (genreId) => {
        await prisma.videoGenre.create({
          data: { VideoID: video.VideoID, GenreID: parseInt(genreId, 10) },
        });
      }));
    }

    if (subtitlePaths.length > 0) {
      await Promise.all(
        subtitlePaths.map(async (subtitlePath, index) => {
          await prisma.videoSubtitle.create({
            data: {
              Label: `Subtitle ${index + 1}`, // Nom unique ou spécifique
              CheminSubtitle: subtitlePath,
              VideoID: video.VideoID,
            },
          });
        })
      );
      console.log("Sous-titres multiples ajoutés dans la base de données.");
    }

    console.log("Vidéo ajoutée avec succès à la base de données :", video);
    reply.send({ message: 'Vidéo ajoutée avec succès.', video });
  } catch (err) {
    console.error(err);
    reply.code(500).send({ error: 'Erreur lors du traitement de la vidéo.' });
  }
};

export const getRandomFilm = async (req, reply) => {
  try {
    const film = await prisma.video.findFirst({
      where: { SaisonID: null },
      orderBy: { VideoID: 'desc' },
      skip: Math.floor(Math.random() * await prisma.video.count({ where: { SaisonID: null } }))
    });

    if (!film) return reply.status(404).send({ error: "Aucun film trouvé." });
    reply.send(film);
  } catch (error) {
    console.error("Erreur lors de la récupération d'un film aléatoire :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération du film." });
  }
};

export const getRandomSeriesFirstEpisode = async (req, reply) => {
  try {
    const series = await prisma.series.findFirst({
      orderBy: { SeriesID: 'desc' },
      skip: Math.floor(Math.random() * await prisma.series.count()),
      include: {
        Saisons: {
          orderBy: { Numero: 'asc' },
          take: 1,
          include: {
            Episodes: {
              orderBy: { Titre: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!series || !series.Saisons[0]?.Episodes[0]) {
      return reply.status(404).send({ error: "Aucune série avec épisode trouvé." });
    }

    reply.send(series.Saisons[0].Episodes[0]);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'épisode aléatoire :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération de l'épisode." });
  }
};

export const getRandomMedia = async (req, reply) => {
  try {
    const random = Math.random() > 0.5;
    if (random) {
      await getRandomFilm(req, reply);
    } else {
      await getRandomSeriesFirstEpisode(req, reply);
    }
  } catch (error) {
    console.error("Erreur lors de la récupération d'un média aléatoire :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération du média." });
  }
};