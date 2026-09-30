import { findDirectionalTarget, getRemoteTargets } from "./spatialNavigation";

const target = (x, y) => {
  const element = document.createElement("button");
  element.getBoundingClientRect = () => ({ left: x, top: y, width: 100, height: 50 });
  return element;
};

test("les flèches suivent les lignes et colonnes plutôt qu'une diagonale", () => {
  const current = target(150, 100);
  const right = target(300, 100);
  const diagonal = target(220, 220);
  const down = target(150, 250);
  const left = target(0, 100);
  const up = target(150, 0);
  const candidates = [current, right, diagonal, down, left, up];
  expect(findDirectionalTarget(current, candidates, "ArrowRight")).toBe(right);
  expect(findDirectionalTarget(current, candidates, "ArrowDown")).toBe(down);
  expect(findDirectionalTarget(current, candidates, "ArrowLeft")).toBe(left);
  expect(findDirectionalTarget(current, candidates, "ArrowUp")).toBe(up);
  expect(findDirectionalTarget(up, candidates, "ArrowUp")).toBeNull();
});

test("ignore les commandes masquées ou désactivées et garde les sliders visibles", () => {
  const root = document.createElement("div");
  const visible = target(0, 0);
  const disabled = target(100, 0); disabled.disabled = true;
  const hidden = target(200, 0); hidden.style.opacity = "0";
  const panel = document.createElement("div"); panel.style.opacity = "0";
  panel.append(target(300, 0));
  const slider = document.createElement("input"); slider.type = "range"; slider.style.opacity = "0";
  slider.getBoundingClientRect = visible.getBoundingClientRect;
  root.append(visible, disabled, hidden, panel, slider); document.body.append(root);
  expect(getRemoteTargets(root)).toEqual([visible, slider]);
  root.remove();
});
