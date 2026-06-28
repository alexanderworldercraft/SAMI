import React, { useEffect, useMemo, useState } from "react";
import VideoListTendance from "./VideoListTendance";
import GenreFeaturedVideoSection from "./GenreFeaturedVideoSection";
import api from '../services/api';
import { useNavigate } from "react-router-dom";
import { PlayIcon, SparklesIcon } from "@heroicons/react/24/solid";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const heroBackgroundUrl = "/wallpaper/herosection.avif";
const emptyResumeOverview = { latest: null, random: null, nextSeriesEpisode: null, nextSeriesEpisodes: [], total: 0 };

const HomePage = () => {
    const navigate = useNavigate();
    const [recommendations1, setRecommendations1] = useState();
    const [recommendations2, setRecommendations2] = useState();
    const [recommendations3, setRecommendations3] = useState();
    const [recommendations4, setRecommendations4] = useState();
    const [recommendations5, setRecommendations5] = useState();
    const [popular30Days, setPopular30Days] = useState();
    const [user, setUser] = useState(null);
    const [genre1, setGenre1] = useState('');
    const [genre2, setGenre2] = useState('');
    const [genre3, setGenre3] = useState('');
    const [genre4, setGenre4] = useState('');
    const [genre5, setGenre5] = useState('');
    const [genreIds, setGenreIds] = useState([]);
    const [allGenres, setAllGenres] = useState([]);
    const [homepageDefaultGenres, setHomepageDefaultGenres] = useState([]);
    const [featuredByGenreId, setFeaturedByGenreId] = useState({});
    const [resumeOverview, setResumeOverview] = useState(emptyResumeOverview);

    const pickRandomSubset = (items, size = 6) => {
        const source = Array.isArray(items) ? items.filter(Boolean) : [];
        if (source.length <= size) return source;
        const shuffled = [...source].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, size);
    };

    const recommendations1Display = useMemo(() => pickRandomSubset(recommendations1), [recommendations1]);
    const recommendations2Display = useMemo(() => pickRandomSubset(recommendations2), [recommendations2]);
    const recommendations3Display = useMemo(() => pickRandomSubset(recommendations3), [recommendations3]);
    const recommendations4Display = useMemo(() => pickRandomSubset(recommendations4), [recommendations4]);
    const recommendations5Display = useMemo(() => pickRandomSubset(recommendations5), [recommendations5]);
    const popularSuggestion = useMemo(() => {
        if (!Array.isArray(popular30Days) || popular30Days.length === 0) return null;
        return popular30Days[Math.floor(Math.random() * popular30Days.length)];
    }, [popular30Days]);

    const getAuthHeaders = () => {
        const token = localStorage.getItem("token");
        return token ? { Authorization: `Bearer ${token}` } : undefined;
    };

    const getImageUrl = (path) => {
        if (!path) return `./imageDefault.png`;
        if (/^https?:\/\//i.test(path)) return path;
        return `${apiUrl}/${path.replace(/^\/+/, "")}`;
    };

    const formatTimecode = (seconds) => {
        if (!Number.isFinite(seconds)) return "0:00";
        const totalSeconds = Math.max(0, Math.floor(seconds));
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        const paddedMins = hrs > 0 ? String(mins).padStart(2, "0") : String(mins);
        const paddedSecs = String(secs).padStart(2, "0");
        return hrs > 0 ? `${hrs}:${paddedMins}:${paddedSecs}` : `${paddedMins}:${paddedSecs}`;
    };

    const fetchRandomMedia = async () => {
        try {
            const response = await fetch(`${apiUrl}/api/videos/random-media`);
            const data = await response.json();
            if (data?.VideoID) {
                navigate(`/lecture/${data.VideoID}`);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération d'un média aléatoire :", error);
        }
    };

    const handleResumeClick = () => {
        const nextSeriesEpisode = Array.isArray(resumeOverview.nextSeriesEpisodes)
            ? resumeOverview.nextSeriesEpisodes[0]
            : resumeOverview.nextSeriesEpisode;
        const target = resumeOverview.latest?.Video || nextSeriesEpisode;
        if (target?.VideoID) {
            navigate(`/lecture/${target.VideoID}`);
            return;
        }

        fetchRandomMedia();
    };

    const handleExploreClick = () => {
        fetchRandomMedia();
    };

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await api.get('/users/me');
                setUser(response.data);
            } catch (error) {
                console.error("Erreur lors de la récupération de l'utilisateur :", error);
            }
        };
        fetchUser();
    }, []);

    useEffect(() => {
        const fetchGenres = async () => {
            try {
                const [genresResponse, defaultsResponse] = await Promise.all([
                    fetch(`${apiUrl}/api/genres`),
                    fetch(`${apiUrl}/api/genres/homepage-defaults`),
                ]);
                const data = await genresResponse.json();
                const defaults = await defaultsResponse.json();
                setAllGenres(Array.isArray(data) ? data : []);
                setHomepageDefaultGenres(
                    (Array.isArray(defaults) ? defaults : [])
                        .map((row) => row.Genre || row)
                        .filter((genre) => genre?.GenreID && genre?.Nom)
                        .slice(0, 5)
                );
            } catch (error) {
                console.error("Erreur lors de la récupération des genres :", error);
            }
        };

        fetchGenres();
    }, []);

    useEffect(() => {
        if (!user) {
            setResumeOverview(emptyResumeOverview);
            return;
        }

        const fetchResumeOverview = async () => {
            try {
                const response = await api.get("/videos/progress/resume");
                setResumeOverview({ ...emptyResumeOverview, ...(response.data || {}) });
            } catch (error) {
                console.error("Erreur lors de la récupération des reprises :", error);
                setResumeOverview(emptyResumeOverview);
            }
        };

        fetchResumeOverview();
    }, [user]);

    useEffect(() => {
        const fetchPopular30Days = async () => {
            try {
                const headers = getAuthHeaders();
                const response = await fetch(
                    `${apiUrl}/api/videos/popular-30-days`,
                    headers ? { headers } : undefined
                );
                const data = await response.json();
                setPopular30Days(data);
            } catch (error) {
                console.error("Erreur lors de la récupération des plus regardés (30j) :", error);
            }
        };
        fetchPopular30Days();
    }, []);

    useEffect(() => {
        const historicalFallbackNames = ["Épique", "Romance", "Animé", "Aventure", "Horreur"];
        const configuredFallbackNames = homepageDefaultGenres.length === 5
            ? homepageDefaultGenres.map((genre) => genre.Nom)
            : historicalFallbackNames;
        const configuredFallbackIds = homepageDefaultGenres.length === 5
            ? homepageDefaultGenres.map((genre) => genre.GenreID).filter(Boolean)
            : [];
        const fallbackNames = configuredFallbackNames;
        const resolveFallbackIds = () =>
            configuredFallbackIds.length === 5
                ? configuredFallbackIds
                : historicalFallbackNames
                .map((name) => allGenres.find((genre) => genre.Nom === name)?.GenreID)
                .filter(Boolean);
        const applyFallbackGenres = () => {
            setGenre1(fallbackNames[0] || "Épique");
            setGenre2(fallbackNames[1] || "Romance");
            setGenre3(fallbackNames[2] || "Animé");
            setGenre4(fallbackNames[3] || "Aventure");
            setGenre5(fallbackNames[4] || "Horreur");
            setGenreIds(resolveFallbackIds());
        };

        if (user) {
            console.log(user.UtilisateurID);

            // Appel à l'API pour obtenir les genres de l'utilisateur
            fetch(`${apiUrl}/api/genres/${user.UtilisateurID}`)
                .then(response => response.json())
                .then(data => {
                    // Mettre à jour les genres avec les valeurs de l'API
                    const userGenres = Array.isArray(data) ? data.map((item) => item?.Genre).filter(Boolean) : [];
                    const mergedGenres = Array.from({ length: 5 }, (_, index) => ({
                        Nom: userGenres[index]?.Nom || fallbackNames[index],
                        GenreID: userGenres[index]?.GenreID || resolveFallbackIds()[index],
                    }));
                    setGenre1(mergedGenres[0]?.Nom || "Épique");
                    setGenre2(mergedGenres[1]?.Nom || "Romance");
                    setGenre3(mergedGenres[2]?.Nom || "Animé");
                    setGenre4(mergedGenres[3]?.Nom || "Aventure");
                    setGenre5(mergedGenres[4]?.Nom || "Horreur");
                    setGenreIds(mergedGenres.map((genre) => genre.GenreID).filter(Boolean).slice(0, 5));
                })
                .catch(error => {
                    console.error('Error fetching genres:', error);
                    applyFallbackGenres();
                });
        } else {
            console.log("pas de user connecter");

            applyFallbackGenres();
        }
    }, [user, allGenres, homepageDefaultGenres]);

    useEffect(() => {
        const fetchFeatured = async () => {
            if (!genreIds.length) {
                setFeaturedByGenreId({});
                return;
            }

            try {
                const response = await fetch(`${apiUrl}/api/genres/featured?genreIds=${genreIds.join(",")}`);
                const data = await response.json();
                const byGenre = {};
                (Array.isArray(data) ? data : []).forEach((row) => {
                    if (row?.GenreID && row.item) byGenre[row.GenreID] = row.item;
                });
                setFeaturedByGenreId(byGenre);
            } catch (error) {
                console.error("Erreur lors de la récupération des contenus à la une :", error);
                setFeaturedByGenreId({});
            }
        };

        fetchFeatured();
    }, [genreIds]);

    useEffect(() => {
        if (genre1 && genre2 && genre3 && genre4 && genre5) {
            // Appel à l'API pour obtenir les recommandations
            const headers = getAuthHeaders();

            fetch(`${apiUrl}/api/videos/recommandation/1/${genre1}`, headers ? { headers } : undefined)
                .then(response => response.json())
                .then(data => setRecommendations1(data))
                .catch(error => console.error('Error fetching recommendations:', error));

            fetch(`${apiUrl}/api/videos/recommandation/2/${genre2}`, headers ? { headers } : undefined)
                .then(response => response.json())
                .then(data => setRecommendations2(data))
                .catch(error => console.error('Error fetching recommendations:', error));

            fetch(`${apiUrl}/api/videos/recommandation/3/${genre3}`, headers ? { headers } : undefined)
                .then(response => response.json())
                .then(data => setRecommendations3(data))
                .catch(error => console.error('Error fetching recommendations:', error));

            fetch(`${apiUrl}/api/videos/recommandation/4/${genre4}`, headers ? { headers } : undefined)
                .then(response => response.json())
                .then(data => setRecommendations4(data))
                .catch(error => console.error('Error fetching recommendations:', error));

            fetch(`${apiUrl}/api/videos/recommandation/5/${genre5}`, headers ? { headers } : undefined)
                .then(response => response.json())
                .then(data => setRecommendations5(data))
                .catch(error => console.error('Error fetching recommendations:', error));
        }
    }, [genre1, genre2, genre3, genre4, genre5]);

    const latestResume = resumeOverview.latest;
    const nextSeriesEpisodes = Array.isArray(resumeOverview.nextSeriesEpisodes)
        ? resumeOverview.nextSeriesEpisodes
        : [resumeOverview.nextSeriesEpisode].filter(Boolean);
    const nextSeriesEpisode = nextSeriesEpisodes[0] || null;
    const fallbackVideo = popularSuggestion;
    const resumeCardVideo = latestResume?.Video || nextSeriesEpisode || fallbackVideo;
    const isSeriesContinuation = !latestResume && !!nextSeriesEpisode;
    const resumeCardProgress = latestResume
        ? Math.max(0, Math.min(100, Number(latestResume.ProgressPercent || 0)))
        : 0;
    const resumeCardImage = resumeCardVideo?.SaisonID
        ? resumeCardVideo.SeriesCheminImage || resumeCardVideo.CheminImage
        : resumeCardVideo?.CheminImage;

    return (
        <div className="mx-auto max-w-[1800px] py-8">
            <section className="relative min-h-[420px] overflow-hidden rounded-2xl border border-sky-500/20 bg-slate-950 shadow-2xl shadow-sky-950/30">
                <img
                    src={heroBackgroundUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/65 to-slate-950/15" />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />

                <div className="relative z-10 grid min-h-[420px] items-center gap-8 px-6 py-10 md:grid-cols-[minmax(0,1fr)_360px] md:px-12 lg:px-16">
                    <div className="max-w-xl">
                        <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl">
                            Reprenez vos envies{" "}
                            <span className="bg-gradient-to-r from-sky-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                                d'évasion
                            </span>
                        </h1>
                        <p className="mt-5 max-w-md text-base text-slate-200 sm:text-lg">
                            Découvrez des histoires qui vous feront vibrer.
                        </p>

                        <div className="mt-8 flex flex-wrap gap-4">
                            <button
                                type="button"
                                onClick={handleResumeClick}
                                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/30 transition duration-200 hover:-translate-y-0.5 hover:shadow-sky-400/40"
                            >
                                <PlayIcon className="size-5" />
                                Reprendre
                            </button>
                            <button
                                type="button"
                                onClick={handleExploreClick}
                                className="inline-flex items-center gap-2 rounded-xl border border-sky-300/30 bg-slate-950/40 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-slate-950/40 backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-sky-300/60 hover:bg-sky-500/10"
                            >
                                <SparklesIcon className="size-5 text-sky-200" />
                                Explorer
                            </button>
                        </div>
                    </div>

                    <aside className="rounded-2xl border border-white/10 bg-slate-950/55 p-5 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                        <h2 className="text-sm font-bold">À reprendre</h2>
                        <div className="mt-4 flex items-center gap-4">
                            {resumeCardVideo ? (
                                <>
                                    <img
                                        src={getImageUrl(resumeCardImage)}
                                        alt=""
                                        className="h-24 w-20 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-2 text-sm font-bold text-white">
                                            {resumeCardVideo.SeriesTitre || resumeCardVideo.Titre}
                                        </p>
                                        {resumeCardVideo.SeriesTitre && (
                                            <p className="mt-1 line-clamp-1 text-xs text-slate-300">
                                                {resumeCardVideo.Titre}
                                            </p>
                                        )}
                                        {latestResume ? (
                                            <>
                                                <p className="mt-2 text-xs text-slate-300">
                                                    {formatTimecode(latestResume.Timecode)} / {formatTimecode(latestResume.Duration)}
                                                </p>
                                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-sky-300 to-blue-500"
                                                        style={{ width: `${resumeCardProgress}%` }}
                                                    />
                                                </div>
                                            </>
                                        ) : isSeriesContinuation ? (
                                            <p className="mt-2 text-xs text-slate-300">
                                                Prochain épisode à regarder.
                                            </p>
                                        ) : (
                                            <p className="mt-2 text-xs text-slate-300">
                                                Une suggestion populaire pour commencer.
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/lecture/${resumeCardVideo.VideoID || resumeCardVideo.id}`)}
                                        className="grid size-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition duration-200 hover:bg-sky-500/30"
                                        aria-label="Lire"
                                    >
                                        <PlayIcon className="size-5" />
                                    </button>
                                </>
                            ) : (
                                <div className="py-8 text-sm text-slate-300">
                                    Connectez-vous pour retrouver vos lectures en cours.
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </section>

            <div className="mt-10 space-y-10">
            <VideoListTendance
                videos={popular30Days}
                title="Tendances en ce moment"
                description="Les contenus les plus regardés sur les 30 derniers jours."
            />

            <GenreFeaturedVideoSection
                title={genre1}
                genreId={genreIds[0]}
                videos={recommendations1Display}
                featured={featuredByGenreId[genreIds[0]]}
            />

            <GenreFeaturedVideoSection
                title={genre2}
                genreId={genreIds[1]}
                videos={recommendations2Display}
                featured={featuredByGenreId[genreIds[1]]}
            />

            <GenreFeaturedVideoSection
                title={genre3}
                genreId={genreIds[2]}
                videos={recommendations3Display}
                featured={featuredByGenreId[genreIds[2]]}
            />

            <GenreFeaturedVideoSection
                title={genre4}
                genreId={genreIds[3]}
                videos={recommendations4Display}
                featured={featuredByGenreId[genreIds[3]]}
            />

            <GenreFeaturedVideoSection
                title={genre5}
                genreId={genreIds[4]}
                videos={recommendations5Display}
                featured={featuredByGenreId[genreIds[4]]}
            />
            </div>
        </div>
    );
};

export default HomePage;
