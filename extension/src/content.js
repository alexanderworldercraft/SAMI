function pageInfo() {
  const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
  const title = document.querySelector('meta[property="og:title"]')?.content || document.title;
  const description = document.querySelector('meta[property="og:description"]')?.content
    || document.querySelector('meta[name="description"]')?.content || "";
  const image = document.querySelector('meta[property="og:image"]')?.content || "";
  const candidates = [...document.querySelectorAll("video")].flatMap((video) => [
    video.currentSrc, video.src, ...[...video.querySelectorAll("source")].map((source) => source.src),
  ]).filter((url) => /^https?:\/\//.test(url || ""));
  return { url: canonical, title, description, image, mediaUrls: [...new Set(candidates)] };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_INFO") sendResponse(pageInfo());
});

if (!document.getElementById("sami-extension-import-button")) {
  const button = document.createElement("button");
  button.id = "sami-extension-import-button";
  button.textContent = "Importer dans __APP_NAME__";
  button.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_POPUP_HINT" }));
  document.documentElement.appendChild(button);
}
