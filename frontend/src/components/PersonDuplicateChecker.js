import React, { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const dangerButtonClass = "inline-flex items-center justify-center rounded-lg border border-red-300/50 bg-red-500/15 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";

const personLabel = (person) => {
  const identity = [person?.Prenom, person?.Nom].filter(Boolean).join(" ");
  return person?.Surnom ? `${identity} (${person.Surnom})` : identity;
};

const PersonCard = ({ person, selected, canDecide, onSelect }) => {
  const imageSrc = person.CheminImage ? `${apiUrl}/${person.CheminImage}` : "";
  return (
    <label className={`relative grid cursor-pointer grid-cols-[5rem_1fr] gap-4 rounded-xl border p-4 transition ${selected ? "border-sky-400 bg-sky-500/10 ring-2 ring-sky-300/30" : "border-sky-500/10 bg-white/65 hover:border-sky-400/40 dark:bg-slate-950/45"}`}>
      <input
        type="radio"
        name={`duplicate-keeper-${person.pairKey}`}
        value={person.PersonneID}
        aria-label={`Conserver ${personLabel(person)} (#${person.PersonneID})`}
        checked={selected}
        disabled={!canDecide}
        onChange={() => onSelect(person.PersonneID)}
        className="sr-only"
      />
      <div className="flex h-24 w-20 items-center justify-center overflow-hidden rounded-lg border border-sky-500/15 bg-slate-200 text-xl font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        {imageSrc ? (
          <img src={imageSrc} alt={personLabel(person)} className="h-full w-full object-cover" />
        ) : (
          `${person.Prenom?.[0] || ""}${person.Nom?.[0] || ""}`
        )}
      </div>
      <div className="min-w-0">
        <p className="font-black text-slate-950 dark:text-white">{personLabel(person)}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Personne #{person.PersonneID}</p>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          {person.videoLinks} lien(s) film/vidéo · {person.seriesLinks} lien(s) série
        </p>
        {canDecide && (
          <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${selected ? "bg-sky-500/20 text-sky-700 dark:text-sky-200" : "bg-slate-500/10 text-slate-500 dark:text-slate-300"}`}>
            {selected ? "Fiche à conserver" : "Conserver cette fiche"}
          </span>
        )}
      </div>
    </label>
  );
};

const PersonDuplicateChecker = ({ onPeopleChanged }) => {
  const [user, setUser] = useState(null);
  const [result, setResult] = useState(null);
  const [keepers, setKeepers] = useState({});
  const [checking, setChecking] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    api.get("/users/me")
      .then((response) => setUser(response.data))
      .catch(() => setUser(null));
  }, []);

  const canDecide = user?.GradeID === 1;
  const pairs = useMemo(() => result?.pairs ?? [], [result?.pairs]);
  const doubtPairs = useMemo(() => pairs.filter((pair) => pair.status === "doubt"), [pairs]);
  const newPairs = useMemo(() => pairs.filter((pair) => pair.status === "new"), [pairs]);

  const replacePairs = (updater) => {
    setResult((current) => current ? { ...current, pairs: updater(current.pairs ?? []) } : current);
  };

  const handleCheck = async () => {
    setChecking(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await api.get("/people/admin/duplicates");
      setResult(response.data);
      setKeepers({});
      setMessage(`Vérification terminée : ${response.data?.scannedPeople ?? 0} personnes analysées.`);
    } catch (error) {
      console.error("Erreur lors de la vérification des doublons :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de vérifier les doublons.");
    } finally {
      setChecking(false);
    }
  };

  const handleReview = async (pair, decision) => {
    setPendingKey(pair.key);
    setMessage("");
    setErrorMessage("");
    try {
      await api.put("/people/admin/duplicates/review", {
        personAId: pair.personA.PersonneID,
        personBId: pair.personB.PersonneID,
        decision,
      });
      if (decision === "doubt") {
        replacePairs((current) => current.map((item) => (
          item.key === pair.key ? { ...item, status: "doubt" } : item
        )));
        setMessage("La paire a été conservée dans les dossiers en doute.");
      } else {
        replacePairs((current) => current.filter((item) => item.key !== pair.key));
        setMessage("Les deux personnes ont été marquées comme différentes.");
      }
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la décision :", error);
      setErrorMessage(error.response?.data?.error || "Impossible d'enregistrer cette décision.");
    } finally {
      setPendingKey("");
    }
  };

  const handleMerge = async (pair) => {
    const keepPersonId = Number(keepers[pair.key]);
    if (!keepPersonId) {
      setErrorMessage("Choisis d'abord la fiche à conserver.");
      return;
    }
    const mergePersonId = keepPersonId === pair.personA.PersonneID
      ? pair.personB.PersonneID
      : pair.personA.PersonneID;
    const keeper = keepPersonId === pair.personA.PersonneID ? pair.personA : pair.personB;
    const merged = mergePersonId === pair.personA.PersonneID ? pair.personA : pair.personB;
    if (!window.confirm(`Fusionner « ${personLabel(merged)} » dans « ${personLabel(keeper)} » ? Les associations seront transférées et la fiche secondaire sera placée dans la corbeille.`)) return;

    setPendingKey(pair.key);
    setMessage("");
    setErrorMessage("");
    try {
      await api.post("/people/admin/duplicates/merge", { keepPersonId, mergePersonId });
      replacePairs((current) => current.filter((item) => item.key !== pair.key));
      setKeepers((current) => {
        const next = { ...current };
        delete next[pair.key];
        return next;
      });
      await onPeopleChanged?.();
      setMessage(`Fusion terminée. La fiche #${keepPersonId} a été conservée.`);
    } catch (error) {
      console.error("Erreur lors de la fusion des personnes :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de fusionner ces personnes.");
    } finally {
      setPendingKey("");
    }
  };

  const renderPair = (pair) => {
    const busy = pendingKey === pair.key;
    const selectedKeeper = Number(keepers[pair.key] || 0);
    return (
      <li key={pair.key} className="rounded-2xl border border-sky-500/10 bg-white/60 p-5 shadow-sm dark:bg-slate-950/40">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${pair.status === "doubt" ? "bg-amber-500/15 text-amber-700 dark:text-amber-200" : "bg-sky-500/15 text-sky-700 dark:text-sky-200"}`}>
              {pair.status === "doubt" ? "Doute à revoir" : "Doublon possible"}
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Similarité {pair.score}%</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Prénom {pair.firstNameScore}% · Nom {pair.lastNameScore}%</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <PersonCard
            person={{ ...pair.personA, pairKey: pair.key }}
            selected={selectedKeeper === pair.personA.PersonneID}
            canDecide={canDecide}
            onSelect={(personId) => setKeepers((current) => ({ ...current, [pair.key]: personId }))}
          />
          <PersonCard
            person={{ ...pair.personB, pairKey: pair.key }}
            selected={selectedKeeper === pair.personB.PersonneID}
            canDecide={canDecide}
            onSelect={(personId) => setKeepers((current) => ({ ...current, [pair.key]: personId }))}
          />
        </div>

        {canDecide && (
          <div className="mt-4 flex flex-col gap-2 border-t border-sky-500/10 pt-4 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={() => handleMerge(pair)} disabled={busy || !selectedKeeper} className={dangerButtonClass}>
              {busy ? "Traitement..." : "Fusionner"}
            </button>
            <button type="button" onClick={() => handleReview(pair, "doubt")} disabled={busy || pair.status === "doubt"} className={buttonClass}>
              Doute
            </button>
            <button type="button" onClick={() => handleReview(pair, "distinct")} disabled={busy} className={buttonClass}>
              Personnes bien différentes
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-violet-400/15 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-violet-950/20">
      <div className="border-b border-violet-400/15 bg-gradient-to-r from-violet-500/15 via-sky-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-violet-600 dark:text-violet-300">Qualité des données</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Vérification des doublons</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Compare les prénoms et noms en tolérant les accents, variantes Unicode et petites différences d'orthographe.
        </p>
      </div>

      <div className="relative p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(139,92,246,0.10),transparent_28%),radial-gradient(circle_at_88%_0%,rgba(14,165,233,0.08),transparent_24%)]" />
        <div className="relative">
          {message && <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</div>}
          {errorMessage && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{errorMessage}</div>}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                La vérification est lancée uniquement à la demande.
              </p>
              {!canDecide && user && (
                <p className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                  Les décisions et fusions sont réservées au super-administrateur.
                </p>
              )}
            </div>
            <button type="button" onClick={handleCheck} disabled={checking || Boolean(pendingKey)} className={buttonClass}>
              <ArrowPathIcon className={`size-5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Vérification..." : "Vérifier"}
            </button>
          </div>

          {result && pairs.length === 0 && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-4 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              <CheckCircleIcon className="size-6 shrink-0" /> Aucun doublon potentiel à examiner.
            </div>
          )}

          {doubtPairs.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">
                <ExclamationTriangleIcon className="size-5 text-amber-500" /> Doutes à revoir ({doubtPairs.length})
              </h3>
              <ul className="space-y-4">{doubtPairs.map(renderPair)}</ul>
            </div>
          )}

          {newPairs.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Nouveaux doublons possibles ({newPairs.length})</h3>
              <ul className="space-y-4">{newPairs.map(renderPair)}</ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default PersonDuplicateChecker;
