import {
  buildAmbientDomeColors,
  extractWeightedPerimeterColors,
  isPerimeterCell,
  normalizeAmbientLightPreferences,
} from "./ambientLight";

it("normalise les préférences d'ambiance sur le contrat du compte", () => {
  expect(normalizeAmbientLightPreferences({
    ambientLightEnabled: false,
    ambientLightMode: "advanced",
    ambientLightRefreshRate: 60,
    ambientLightGridSize: 9,
  })).toEqual({
    ambientLightEnabled: false,
    ambientLightMode: "advanced",
    ambientLightRefreshRate: 60,
    ambientLightGridSize: 9,
  });

  expect(normalizeAmbientLightPreferences({
    ambientLightMode: "inconnu",
    ambientLightRefreshRate: 96,
    ambientLightGridSize: 12,
  })).toEqual({
    ambientLightEnabled: true,
    ambientLightMode: "classic",
    ambientLightRefreshRate: 6,
    ambientLightGridSize: 3,
  });
});

it("ne conserve que le pourtour de la grille avancée", () => {
  expect(isPerimeterCell(0, 2, 5)).toBe(true);
  expect(isPerimeterCell(2, 0, 5)).toBe(true);
  expect(isPerimeterCell(4, 2, 5)).toBe(true);
  expect(isPerimeterCell(2, 4, 5)).toBe(true);
  expect(isPerimeterCell(2, 2, 5)).toBe(false);
});

it("calcule une couleur pondérée indépendante pour chaque secteur du pourtour", () => {
  const gridSize = 3;
  const data = new Uint8ClampedArray(gridSize * gridSize * 4);
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const offset = (row * gridSize + column) * 4;
      data[offset] = column * 80;
      data[offset + 1] = row * 80;
      data[offset + 2] = 20;
      data[offset + 3] = 255;
    }
  }

  const colors = extractWeightedPerimeterColors({ data, width: 3, height: 3 }, gridSize);

  expect(colors).toHaveLength(8);
  expect(colors).not.toContainEqual(expect.objectContaining({ row: 1, column: 1 }));
  expect(colors.find(({ row, column }) => row === 0 && column === 2)?.color)
    .toEqual([160, 0, 20]);
  expect(colors.find(({ row, column }) => row === 2 && column === 0)?.color)
    .toEqual([0, 160, 20]);
});

it("prolonge le pourtour dans tout le dôme sans laisser de cellule noire", () => {
  const perimeterColors = [
    { row: 0, column: 0, color: [20, 20, 20] },
    { row: 0, column: 1, color: [100, 0, 0] },
    { row: 0, column: 2, color: [20, 20, 20] },
    { row: 1, column: 0, color: [0, 100, 0] },
    { row: 1, column: 2, color: [0, 0, 100] },
    { row: 2, column: 0, color: [20, 20, 20] },
    { row: 2, column: 1, color: [100, 100, 0] },
    { row: 2, column: 2, color: [20, 20, 20] },
  ];

  const domeColors = buildAmbientDomeColors(perimeterColors, 3);

  expect(domeColors).toHaveLength(9);
  expect(domeColors.find(({ row, column }) => row === 0 && column === 1)?.color)
    .toEqual([100, 0, 0]);
  expect(domeColors.find(({ row, column }) => row === 1 && column === 1)?.color)
    .toEqual([50, 50, 25]);

  const largePerimeter = [];
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      if (isPerimeterCell(row, column, 9)) {
        largePerimeter.push({ row, column, color: [40, 80, 120] });
      }
    }
  }
  const largeDome = buildAmbientDomeColors(largePerimeter, 9);
  expect(largeDome).toHaveLength(81);
  expect(largeDome.every(({ color }) => color.some((channel) => channel > 3))).toBe(true);
});
