export const REMOTE_TARGETS = 'a[href],button,input:not([type="hidden"]),select,textarea,[tabindex]';

export function isRemoteTarget(element) {
  if (element.tabIndex < 0 || element.matches(":disabled") || element.getAttribute("aria-disabled") === "true" || element.closest('[inert],[aria-hidden="true"]')) return false;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  for (let node = element; node instanceof Element; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    // Les sliders utilisent un input transparent sur une piste visible.
    if (style.opacity === "0" && !(node === element && element.matches('input[type="range"]'))) return false;
  }
  return true;
}

export function getRemoteTargets(root = document) {
  const elements = Array.from(root.querySelectorAll(REMOTE_TARGETS));
  if (root instanceof Element && root.matches(REMOTE_TARGETS)) elements.unshift(root);
  return elements.filter(isRemoteTarget);
}

export function findDirectionalTarget(current, candidates, key) {
  const from = current.getBoundingClientRect();
  const vertical = key === "ArrowUp" || key === "ArrowDown";
  const sign = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
  const axis = vertical ? "y" : "x";
  const cross = vertical ? "x" : "y";
  const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  const origin = center(from);
  let best = null;
  let score = Infinity;
  for (const candidate of candidates) {
    if (candidate === current || current.contains(candidate) || candidate.contains(current)) continue;
    const point = center(candidate.getBoundingClientRect());
    const forward = (point[axis] - origin[axis]) * sign;
    if (forward <= 1) continue;
    const sideways = Math.abs(point[cross] - origin[cross]);
    const nextScore = forward + sideways * 3;
    if (nextScore < score) { best = candidate; score = nextScore; }
  }
  return best;
}

export function focusRemoteTarget(element) {
  element?.focus({ preventScroll: true });
  element?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}
