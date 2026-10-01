export const sanitizeError = (value) => String(value).replace(/https?:\/\/[^\s\]"<>]+/g, "[URL média]");
export function httpUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Adresse média HTTP(S) invalide.");
  return url;
}
export function safeHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) =>
    ["cookie", "authorization", "referer", "origin", "user-agent"].includes(name.toLowerCase()) && value)
    .map(([name, value]) => [name.toLowerCase(), String(value).replace(/[\r\n]/g, "")]));
}
export function headersFor(url, candidate) {
  const origin = httpUrl(url).origin;
  const source = httpUrl(candidate.url).origin;
  const base = safeHeaders(candidate.headers);
  if (origin !== source) { delete base.cookie; delete base.authorization; }
  const observed = safeHeaders(candidate.headersByOrigin?.[origin]);
  return origin === source ? { ...observed, ...base } : { ...base, ...observed };
}
export function httpError(status) {
  const hint = { 401: "Session requise ou expirée.", 403: "Accès refusé : lien expiré, session ou adresse réseau différente du navigateur.",
    404: "Média introuvable.", 410: "Lien expiré : rechargez la page et relancez la lecture.",
    416: "Le serveur refuse la plage d’octets demandée.", 429: "Trop de requêtes : attendez avant de réessayer.",
    451: "Ressource indisponible pour des raisons légales." }[status] || "Le serveur média refuse la requête.";
  const error = new Error(`HTTP ${status}. ${hint}`); error.status = status; return error;
}
export async function fetchMedia(url, candidate, { signal, range, fetchImpl = fetch } = {}) {
  let target = httpUrl(url).href;
  for (let count = 0; count < 6; count++) {
    const headers = headersFor(target, candidate);
    if (range) headers.range = range;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 45000);
    let response;
    try {
      response = await fetchImpl(target, { headers, redirect: "manual", signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal });
    } finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location"); await response.body?.cancel();
      if (!location) throw httpError(response.status);
      target = httpUrl(new URL(location, target)).href; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw httpError(response.status); }
    // Bound each stalled read, not the total duration of a multi-hour download.
    if (response.body) {
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        async pull(controller) {
          const idle = setTimeout(() => timeout.abort(), 45000);
          try {
            const { done, value } = await reader.read();
            if (done) controller.close(); else controller.enqueue(value);
          } catch (error) { controller.error(error); }
          finally { clearTimeout(idle); }
        },
        cancel(reason) { return reader.cancel(reason); },
      });
      response = new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    return { response, url: target };
  }
  throw new Error("Trop de redirections du serveur média.");
}
export async function boundedText(response, max = 4 * 1024 * 1024) {
  let length = 0; const chunks = [];
  for await (const chunk of response.body) {
    length += chunk.length; if (length > max) throw new Error("Manifeste trop volumineux."); chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
