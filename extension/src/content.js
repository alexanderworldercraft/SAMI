(() => {
  if (globalThis.__samiMediaCollector) return;
  globalThis.__samiMediaCollector = true;
  const urls = new Set();
  const report = (url, kind) => {
    if (!/^https?:\/\//i.test(url || "") || urls.has(url)) return;
    if (urls.size > 500) urls.clear();
    urls.add(url);
    chrome.runtime.sendMessage({ type: "REPORT_MEDIA", url, kind }).catch(() => {});
  };
  const resources = (entries) => entries.forEach((entry) => {
    if (/\.(?:m3u8|mpd|mp4|webm|m4a|mp3)(?:$|\?)/i.test(entry.name)
      || /\.googlevideo\.com\/videoplayback\?/.test(entry.name)) report(entry.name);
  });
  const scan = () => {
    document.querySelectorAll("video,audio").forEach((media) => {
      [media.currentSrc, media.src, ...[...media.querySelectorAll("source")].map((source) => source.src)]
        .forEach((url) => report(url, media.tagName === "AUDIO" ? "audio" : "video"));
    });
    resources(performance.getEntriesByType("resource"));
  };
  const pageInfo = () => ({
    url: location.href,
    title: document.querySelector('meta[property="og:title"]')?.content || document.title,
    description: document.querySelector('meta[property="og:description"]')?.content || document.querySelector('meta[name="description"]')?.content || "",
    image: document.querySelector('meta[property="og:image"]')?.content || "",
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === "GET_PAGE_INFO" && window === window.top) { scan(); respond(pageInfo()); }
    if (message.type === "SCAN_MEDIA") { urls.clear(); scan(); respond({ ok: true }); }
  });
  new PerformanceObserver((list) => resources(list.getEntries())).observe({ type: "resource", buffered: true });
  document.addEventListener("loadedmetadata", scan, true);
  document.addEventListener("play", scan, true);
  scan();
})();
