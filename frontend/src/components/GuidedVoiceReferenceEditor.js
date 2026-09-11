import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import api from "../services/api";

export default function GuidedVoiceReferenceEditor({ videoId, count, busy, onSubmit, onCancel }) {
  const videoRef = useRef(null);
  const playbackEnd = useRef(null);
  const [groups, setGroups] = useState(() => Array.from({ length: count }, () => ({ ranges: [{ start: "", end: "" }] })));
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let hls;
    api.get(`/videos/${videoId}`).then(response => {
      if (!active) return;
      const video = response.data?.video;
      const element = videoRef.current;
      if (!video || !element) throw new Error("Vidéo indisponible.");
      const base = String(process.env.REACT_APP_URL_LOCAL || "").replace(/\/$/, "");
      const url = `${base}/api/media/videos/${videoId}/master.m3u8?originalOnly=1`;
      if (Hls.isSupported()) {
        hls = new Hls({ xhrSetup: xhr => {
          xhr.withCredentials = true;
          if (video.mediaAccessToken) xhr.setRequestHeader("X-SAMI-Media-Token", video.mediaAccessToken);
        } });
        hls.on(Hls.Events.ERROR, (_event, data) => { if (active && data.fatal) setError("Lecture source impossible. Vérifiez votre session et rechargez la préparation."); });
        hls.loadSource(url); hls.attachMedia(element);
      } else if (element.canPlayType("application/vnd.apple.mpegurl")) element.src = url;
      else setError("Ce navigateur ne permet pas la lecture HLS.");
    }).catch(() => { if (active) setError("Impossible de charger la vidéo source."); });
    return () => { active = false; hls?.destroy(); };
  }, [videoId]);
  const change = (groupIndex, rangeIndex, key, value) => setGroups(previous => previous.map((group, gi) => gi !== groupIndex ? group : {
    ...group, ranges: group.ranges.map((range, ri) => ri !== rangeIndex ? range : { ...range, [key]: value }),
  }));
  const ranges = groups.flatMap(group => group.ranges);
  const sorted = ranges.map(range => ({ start: Number(range.start), end: Number(range.end) })).sort((a, b) => a.start - b.start);
  const valid = duration > 0 && ranges.every(range => range.start !== "" && range.end !== ""
    && Number.isFinite(Number(range.start)) && Number.isFinite(Number(range.end))
    && Number(range.start) >= 0 && Number(range.end) <= duration
    && Number(range.end) - Number(range.start) >= 2 && Number(range.end) - Number(range.start) <= 12)
    && sorted.every((range, index) => index === 0 || range.start >= sorted[index - 1].end);
  const buttonClass = "rounded-lg border border-sky-400/40 px-3 py-2 text-sm font-bold disabled:opacity-50";
  return <section className="space-y-4 rounded-2xl border border-sky-400/40 p-5" aria-label="Passages de référence par intervenant">
    <h3 className="font-black">Choisir les voix de référence</h3>
    <p className="text-sm">Audio d’origine uniquement. Choisissez 1 à 5 passages par intervenant, de 2 à 12 secondes chacun (3 secondes ou plus conseillées), avec une seule voix et sans couper les mots. Une référence principale sera choisie parmi ces passages ; les autres serviront d’alternatives.</p>
    <video ref={videoRef} controls playsInline crossOrigin="use-credentials" aria-label="Vidéo source pour les références"
      onError={() => setError("Lecture source impossible. Vérifiez votre session et rechargez la préparation.")}
      className="max-h-96 w-full bg-black" onLoadedMetadata={() => setDuration(videoRef.current.duration)}
      onDurationChange={() => { if (Number.isFinite(videoRef.current.duration)) setDuration(videoRef.current.duration); }}
      onTimeUpdate={() => { if (playbackEnd.current !== null && videoRef.current.currentTime >= playbackEnd.current) { videoRef.current.pause(); playbackEnd.current = null; } }} />
    {error && <p role="alert">{error}</p>}
    {groups.map((group, gi) => <fieldset key={gi} disabled={busy} className="space-y-3 rounded-xl border border-slate-400/30 p-3">
      <legend className="font-bold">Intervenant {gi + 1}</legend>
      {group.ranges.map((range, ri) => <div key={ri} className="flex flex-wrap items-end gap-2">
        <label>Début (secondes)<input aria-label={`Début intervenant ${gi + 1} passage ${ri + 1}`} type="number" step="0.001" min="0" value={range.start}
          onChange={event => change(gi, ri, "start", event.target.value)} className="block w-32 rounded border p-2 text-slate-950" /></label>
        <button type="button" className={buttonClass} onClick={() => change(gi, ri, "start", videoRef.current.currentTime.toFixed(3))}>Marquer le début</button>
        <label>Fin (secondes)<input aria-label={`Fin intervenant ${gi + 1} passage ${ri + 1}`} type="number" step="0.001" min="0" value={range.end}
          onChange={event => change(gi, ri, "end", event.target.value)} className="block w-32 rounded border p-2 text-slate-950" /></label>
        <button type="button" className={buttonClass} onClick={() => change(gi, ri, "end", videoRef.current.currentTime.toFixed(3))}>Marquer la fin</button>
        <button type="button" className={buttonClass} disabled={range.start === "" || Number(range.end) <= Number(range.start)} onClick={() => {
          videoRef.current.currentTime = Number(range.start); playbackEnd.current = Number(range.end);
          videoRef.current.play().catch(() => setError("Lancez la lecture avec le bouton du lecteur."));
        }}>Écouter ce passage</button>
        {group.ranges.length > 1 && <button type="button" className={buttonClass} onClick={() => setGroups(previous => previous.map((item, index) => index !== gi ? item : { ranges: item.ranges.filter((_r, index) => index !== ri) }))}>Retirer</button>}
      </div>)}
      <button type="button" disabled={group.ranges.length >= 5} className={buttonClass} onClick={() => setGroups(previous => previous.map((item, index) => index !== gi ? item : { ranges: [...item.ranges, { start: "", end: "" }] }))}>Ajouter un passage pour l’intervenant {gi + 1}</button>
    </fieldset>)}
    {!valid && <p className="text-sm">Complétez les passages de chaque intervenant : 2 à 12 secondes, dans la vidéo et sans chevauchement.</p>}
    <div className="flex gap-3">
      <button type="button" className={buttonClass} disabled={!valid || busy || Boolean(error)} onClick={() => onSubmit(groups.map(group => ({ ranges: group.ranges.map(range => ({ start: Number(range.start), end: Number(range.end) })) })))}>Valider les passages et générer l’extrait</button>
      <button type="button" className={buttonClass} disabled={busy} onClick={onCancel}>Revenir aux options</button>
    </div>
  </section>;
}
