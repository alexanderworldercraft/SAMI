import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  FilmIcon,
  LinkIcon,
  PencilSquareIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import api from "../services/api";
import VideoList from "./VideoList";
import PersonLinkContentForm from "./PersonLinkContentForm";
import ImageUploader from "./ImageUploader";
import Notification from "./Notification";
import { cancelButtonClass, saveButtonClass } from "./contentDetailStyles";
import { scrollToPageTop } from "../utils/scrollToPageTop";
import { buildPersonPageMetadata } from "../utils/personPageMetadata";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const toVideoCards = (items = []) =>
  items.map((video) => ({
    type: "video",
    id: video.VideoID,
    Titre: video.Titre,
    CheminImage: video.CheminImage,
    Resumer: video.Resumer,
    Genres: video.Genres || [],
  }));

const toSeriesCards = (items = []) =>
  items.map((serie) => ({
    type: "series",
    id: serie.SeriesID,
    Titre: serie.Titre,
    CheminImage: serie.CheminImage,
    Resumer: serie.Resumer,
    FirstVideoID: serie.FirstVideoID || null,
    Genres: serie.Genres || [],
  }));

const mergeContents = (videos = [], series = []) =>
  [...toVideoCards(videos), ...toSeriesCards(series)].sort((first, second) =>
    (first.Titre || "").localeCompare(second.Titre || "", "fr", { sensitivity: "base" })
  );

const formatDate = (value) => {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString("fr-FR");
};

export default function PersonDetailsPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [realisation, setRealisation] = useState([]);
  const [distribution, setDistribution] = useState([]);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [newImageFile, setNewImageFile] = useState(null);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [unlinkingKey, setUnlinkingKey] = useState("");
  const [notification, setNotification] = useState(null);

  const canEdit = Boolean(me && (me.GradeID === 1 || me.GradeID === 2));

  const applyPersonData = useCallback((nextData) => {
    setData(nextData);
    setRealisation(
      mergeContents(nextData?.videos?.Realisateur, nextData?.series?.Realisateur)
    );
    setDistribution(mergeContents(nextData?.videos?.Acteur, nextData?.series?.Acteur));
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        const response = await api.get(`/people/${id}`);
        if (active) applyPersonData(response.data);
      } catch (error) {
        console.error(error);
        if (active) setErr("Impossible de charger cette personne.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [applyPersonData, id]);

  useEffect(() => {
    let active = true;

    api
      .get("/users/me")
      .then((response) => {
        if (active) setMe(response.data);
      })
      .catch(() => {
        if (active) setMe(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const fullName = useMemo(() => {
    const person = data?.personne;
    if (!person) return "";
    const name = [person.Prenom, person.Nom].filter(Boolean).join(" ");
    if (person.Surnom) return name ? `${name} “${person.Surnom}”` : person.Surnom;
    return name || "Personne sans nom";
  }, [data]);

  const refreshPerson = async () => {
    try {
      const response = await api.get(`/people/${id}`);
      applyPersonData(response.data);
    } catch (error) {
      console.error(error);
      setNotification({ type: "error", message: "Le lien a été créé, mais la fiche n’a pas pu être actualisée." });
    }
  };

  const saveImage = async () => {
    const personId = data?.personne?.PersonneID;
    if (!newImageFile || !personId) return;

    try {
      setIsSavingImage(true);
      const formData = new FormData();
      formData.append("image", newImageFile);
      const response = await api.put(`/people/${personId}/photo`, formData);
      setData((current) =>
        current
          ? {
              ...current,
              personne: { ...current.personne, CheminImage: response.data.CheminImage },
            }
          : current
      );
      setIsEditingImage(false);
      setNewImageFile(null);
      setNotification({ type: "success", message: "La photo de la personne a été mise à jour." });
    } catch (error) {
      console.error(error);
      setNotification({
        type: "error",
        message: error?.response?.data?.message || "Impossible de mettre à jour la photo.",
      });
    } finally {
      setIsSavingImage(false);
    }
  };

  const removeContent = async (item, role) => {
    const personId = data?.personne?.PersonneID;
    if (!personId) return;

    const roleLabel = role === "realisation" ? "réalisation" : "distribution";
    const confirmed = window.confirm(
      `Retirer « ${item.Titre} » de la section ${roleLabel} de ${fullName} ?`
    );
    if (!confirmed) return;

    const key = `${role}-${item.type}-${item.id}`;
    try {
      setUnlinkingKey(key);
      await api.delete(`/people/${personId}/unlink`, {
        data: {
          type: item.type,
          contenuId: item.id,
          EstActeur: role === "distribution",
          EstRealisateur: role === "realisation",
        },
      });

      const removeItem = (current) =>
        current.filter((candidate) => !(candidate.type === item.type && candidate.id === item.id));
      if (role === "realisation") setRealisation(removeItem);
      else setDistribution(removeItem);

      setNotification({
        type: "success",
        message: `« ${item.Titre} » a été retiré de la section ${roleLabel}.`,
      });
    } catch (error) {
      console.error(error);
      setNotification({
        type: "error",
        message: error?.response?.data?.message || "Impossible de retirer ce contenu.",
      });
    } finally {
      setUnlinkingKey("");
    }
  };

  const renderRemoveButton = (item, role) => {
    const roleLabel = role === "realisation" ? "réalisation" : "distribution";
    const key = `${role}-${item.type}-${item.id}`;
    return (
      <button
        type="button"
        onClick={() => removeContent(item, role)}
        disabled={unlinkingKey === key}
        aria-label={`Retirer ${item.Titre} de la ${roleLabel}`}
        title={`Retirer de la ${roleLabel}`}
        className="inline-flex items-center gap-1 rounded-lg border border-rose-300/40 bg-rose-600/90 px-2.5 py-1.5 text-xs font-bold text-white shadow-lg transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
      >
        <XMarkIcon className="h-4 w-4" aria-hidden="true" />
        {unlinkingKey === key ? "Retrait…" : "Retirer"}
      </button>
    );
  };

  const renderContentSection = ({ role, title, description, items }) => (
    <section className="overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 dark:bg-slate-900/80 dark:shadow-black/20">
      <header className="relative overflow-hidden border-b border-sky-500/10 bg-gradient-to-br from-sky-500/10 via-transparent to-indigo-500/10 px-5 py-5 sm:px-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_48%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-sky-600 dark:text-sky-400">
              Filmographie
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-500/15 bg-white/75 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-slate-950/45 dark:text-slate-200">
            <FilmIcon className="h-4 w-4 text-sky-500" aria-hidden="true" />
            {items.length} contenu{items.length > 1 ? "s" : ""}
          </span>
        </div>
      </header>
      <div className="p-4 sm:p-6">
        <VideoList
          videos={items}
          linkAnchor="#lecture-top"
          onContentClick={scrollToPageTop}
          overlayActions={canEdit ? (item) => renderRemoveButton(item, role) : undefined}
        />
      </div>
    </section>
  );

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-sky-500/10 bg-white/75 text-sm font-semibold text-slate-500 shadow-xl dark:bg-slate-900/75 dark:text-slate-400">
          Chargement de la personne…
        </div>
      </main>
    );
  }

  if (err || !data?.personne) {
    return (
      <main className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-6 py-8 text-center font-semibold text-rose-700 dark:text-rose-300">
          {err || "Cette personne est introuvable."}
        </div>
      </main>
    );
  }

  const person = data.personne;
  const siteName = process.env.REACT_APP_NAME || "SAMI";
  const pageOrigin = typeof window !== "undefined" ? window.location.origin : apiUrl;
  const pageMetadata = buildPersonPageMetadata({
    id,
    person,
    siteName,
    pageOrigin,
    assetOrigin: apiUrl || pageOrigin,
  });

  return (
    <main className="container mx-auto space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <Helmet>
        <title>{pageMetadata.title}</title>
        <meta name="description" content={pageMetadata.description} />
        <meta name="application-name" content={pageMetadata.siteName} />
        <link rel="canonical" href={pageMetadata.canonicalUrl} />
        <meta property="og:type" content={pageMetadata.openGraphType} />
        <meta property="og:locale" content="fr_FR" />
        <meta property="og:site_name" content={pageMetadata.siteName} />
        <meta property="og:title" content={pageMetadata.title} />
        <meta property="og:description" content={pageMetadata.description} />
        <meta property="og:url" content={pageMetadata.canonicalUrl} />
        <meta property="og:image" content={pageMetadata.imageUrl} />
        <meta property="og:image:alt" content={pageMetadata.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageMetadata.title} />
        <meta name="twitter:description" content={pageMetadata.description} />
        <meta name="twitter:image" content={pageMetadata.imageUrl} />
        <meta name="twitter:image:alt" content={pageMetadata.imageAlt} />
      </Helmet>
      {notification ? (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-900/80 dark:shadow-black/20">
        <header className="relative overflow-hidden border-b border-sky-500/10 bg-gradient-to-br from-sky-500/10 via-transparent to-indigo-500/10 px-6 py-7 sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_46%)]" />
          <div className="relative">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">
              Fiche personne
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              {fullName}
            </h1>
          </div>
        </header>

        <div className="grid gap-7 p-5 sm:p-7 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div>
            {!isEditingImage ? (
              <div className="group relative overflow-hidden rounded-2xl border border-sky-500/15 bg-gradient-to-br from-slate-950 to-slate-900 shadow-xl">
                {person.CheminImage ? (
                  <img
                    src={`${apiUrl}/${person.CheminImage}`}
                    alt={fullName}
                    className="aspect-2/3 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={`Photo manquante pour ${fullName}`}
                    className="flex aspect-2/3 items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(14,165,233,0.2),transparent_45%)] px-5 text-center"
                  >
                    <div>
                      <UserCircleIcon className="mx-auto h-14 w-14 text-sky-400/70" aria-hidden="true" />
                      <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-300">
                        Photo manquante
                      </p>
                    </div>
                  </div>
                )}

                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingImage(true)}
                    className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-300"
                    title="Modifier la photo"
                  >
                    <PencilSquareIcon className="h-5 w-5" aria-hidden="true" />
                    <span className="sr-only">Modifier la photo</span>
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-sky-500/15 bg-slate-50/80 p-4 shadow-inner dark:bg-slate-950/35">
                <ImageUploader setImage={setNewImageFile} />
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={saveImage}
                    disabled={isSavingImage || !newImageFile}
                    className={saveButtonClass}
                  >
                    {isSavingImage ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingImage(false);
                      setNewImageFile(null);
                    }}
                    className={cancelButtonClass}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col justify-center">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-sky-600 dark:text-sky-400">
              Profil
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{fullName}</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-500/15 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <CalendarDaysIcon className="h-5 w-5 text-sky-500" aria-hidden="true" />
                Ajouté le {formatDate(person.CreateDate)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-500/15 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <FilmIcon className="h-5 w-5 text-sky-500" aria-hidden="true" />
                {realisation.length + distribution.length} rôle{realisation.length + distribution.length > 1 ? "s" : ""} lié{realisation.length + distribution.length > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Découvrez les films et séries liés à cette personne, regroupés par réalisation et distribution.
            </p>
          </div>
        </div>
      </section>

      {canEdit ? (
        <section className="relative z-30 overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 shadow-lg shadow-slate-950/5 dark:bg-slate-900/80">
          <button
            type="button"
            onClick={() => setAdminPanelOpen((isOpen) => !isOpen)}
            aria-expanded={adminPanelOpen}
            aria-controls="person-content-link-panel"
            className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left transition hover:bg-sky-500/5 sm:px-6"
          >
            <span className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
                <LinkIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xs font-bold uppercase tracking-[0.14em] text-sky-600 dark:text-sky-400">
                  Administration
                </span>
                <span className="block font-black text-slate-950 dark:text-white">Lier un contenu</span>
              </span>
            </span>
            <ChevronDownIcon
              className={`h-5 w-5 text-sky-500 transition ${adminPanelOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          {adminPanelOpen ? (
            <div id="person-content-link-panel" className="border-t border-sky-500/10 px-5 pb-5 sm:px-6 sm:pb-6">
              <PersonLinkContentForm personId={person.PersonneID} onLinked={refreshPerson} />
            </div>
          ) : null}
        </section>
      ) : null}

      {realisation.length > 0
        ? renderContentSection({
            role: "realisation",
            title: "Réalisation",
            description: "Films et séries réalisés par cette personne.",
            items: realisation,
          })
        : null}

      {distribution.length > 0
        ? renderContentSection({
            role: "distribution",
            title: "Distribution",
            description: "Films et séries dans lesquels cette personne apparaît.",
            items: distribution,
          })
        : null}

      {realisation.length === 0 && distribution.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-500/20 bg-white/70 px-6 text-center shadow-sm dark:bg-slate-900/60">
          <FilmIcon className="h-10 w-10 text-sky-500" aria-hidden="true" />
          <p className="mt-3 font-bold text-slate-900 dark:text-white">Aucun contenu lié</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Les films et séries associés apparaîtront ici.
          </p>
        </div>
      ) : null}
    </main>
  );
}
