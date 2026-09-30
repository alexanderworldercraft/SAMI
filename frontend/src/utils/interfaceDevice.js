export const INTERFACE_MODES = { classic: "Classique", tactile: "Tactile", remote: "Télécommande (remote)" };
export const DEVICE_TYPES = { computer: "Ordinateur", phone: "Téléphone", tablet: "Tablette", tv: "TV", unknown: "Autre" };

export function detectInterfaceDevice(environment = window) {
  const nav = environment.navigator || {};
  const ua = nav.userAgent || "";
  const matches = (query) => Boolean(environment.matchMedia?.(query).matches);
  const tv = /smart[- ]?tv|hbbtv|tizen|web0s|webos|netcast|viera|bravia|googletv|google tv|android[ /_-]?tv|\baft[a-z0-9]*\b|roku|appletv/i.test(ua);
  const tablet = /ipad|tablet/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)) || (/macintosh/i.test(ua) && nav.maxTouchPoints > 1);
  const phone = !tablet && /mobile|iphone|ipod/i.test(ua);
  const type = tv ? "tv" : tablet ? "tablet" : phone ? "phone" : ua ? "computer" : "unknown";
  const primaryTouch = matches("(pointer: coarse)") && !matches("(hover: hover)");
  const mode = tv ? "remote" : primaryTouch ? "tactile" : "classic";
  return { Type: type, InterfaceMode: mode, Nom: DEVICE_TYPES[type] };
}

export const deviceStorageKey = (userId) => `sami.interface-device.${userId}`;
export function readDeviceKey(userId) {
  try {
    const key = localStorage.getItem(deviceStorageKey(userId));
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key || "") ? key : null;
  } catch (_) { return null; }
}
export function forgetDeviceKey(userId) {
  try { localStorage.removeItem(deviceStorageKey(userId)); } catch (_) { /* Stockage désactivé. */ }
}
export function saveDeviceKey(userId, key) {
  try {
    localStorage.setItem(deviceStorageKey(userId), key);
    return localStorage.getItem(deviceStorageKey(userId)) === key;
  } catch (_) { return false; }
}
export function newDeviceKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
