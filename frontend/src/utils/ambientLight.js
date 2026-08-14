export const AMBIENT_LIGHT_STORAGE_KEY = "sami-ambient-light-enabled";
export const AMBIENT_LIGHT_DEFAULT_COLOR = "rgb(3, 3, 3)";
export const AMBIENT_LIGHT_REFRESH_RATES = [3, 6, 12, 24, 48, 60];

export const DEFAULT_AMBIENT_LIGHT_PREFERENCES = Object.freeze({
  ambientLightEnabled: true,
  ambientLightMode: "classic",
  ambientLightRefreshRate: 6,
  ambientLightGridSize: 3,
});

export const normalizeAmbientLightPreferences = (input = {}) => ({
  ambientLightEnabled: typeof input.ambientLightEnabled === "boolean"
    ? input.ambientLightEnabled
    : DEFAULT_AMBIENT_LIGHT_PREFERENCES.ambientLightEnabled,
  ambientLightMode: input.ambientLightMode === "advanced" ? "advanced" : "classic",
  ambientLightRefreshRate: AMBIENT_LIGHT_REFRESH_RATES.includes(input.ambientLightRefreshRate)
    ? input.ambientLightRefreshRate
    : DEFAULT_AMBIENT_LIGHT_PREFERENCES.ambientLightRefreshRate,
  ambientLightGridSize: Number.isInteger(input.ambientLightGridSize)
    && input.ambientLightGridSize >= 3
    && input.ambientLightGridSize <= 9
    ? input.ambientLightGridSize
    : DEFAULT_AMBIENT_LIGHT_PREFERENCES.ambientLightGridSize,
});

export const readLegacyAmbientLightEnabled = () => {
  try {
    const storedValue = localStorage.getItem(AMBIENT_LIGHT_STORAGE_KEY);
    if (storedValue === null) return null;
    return storedValue !== "false";
  } catch (error) {
    return null;
  }
};

export const isPerimeterCell = (row, column, gridSize) => (
  row === 0 || column === 0 || row === gridSize - 1 || column === gridSize - 1
);

const computeWeightedColor = (pixels, width, startX, startY, endX, endY) => {
  let red = 0;
  let green = 0;
  let blue = 0;
  let totalWeight = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = pixels[offset + 3] / 255;
      if (alpha === 0) continue;

      const maxChannel = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
      const brightnessWeight = 0.35 + (maxChannel / 255) * 0.65;
      const weight = alpha * brightnessWeight;
      red += pixels[offset] * weight;
      green += pixels[offset + 1] * weight;
      blue += pixels[offset + 2] * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return [3, 3, 3];
  return [
    Math.round(red / totalWeight),
    Math.round(green / totalWeight),
    Math.round(blue / totalWeight),
  ];
};

export const extractWeightedPerimeterColors = (imageData, gridSize) => {
  const { data, width, height } = imageData;
  const colors = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      if (!isPerimeterCell(row, column, gridSize)) continue;

      const startX = Math.floor((column * width) / gridSize);
      const endX = Math.max(startX + 1, Math.floor(((column + 1) * width) / gridSize));
      const startY = Math.floor((row * height) / gridSize);
      const endY = Math.max(startY + 1, Math.floor(((row + 1) * height) / gridSize));
      colors.push({
        row,
        column,
        color: computeWeightedColor(data, width, startX, startY, endX, endY),
      });
    }
  }

  return colors;
};

const blendColorsByDistance = (candidates) => {
  const totals = [0, 0, 0];
  let totalWeight = 0;

  candidates.forEach(({ color, distance }) => {
    const weight = 1 / Math.max(1, distance) ** 2;
    totals[0] += color[0] * weight;
    totals[1] += color[1] * weight;
    totals[2] += color[2] * weight;
    totalWeight += weight;
  });

  return totals.map((channel) => Math.round(channel / totalWeight));
};

export const buildAmbientDomeColors = (perimeterColors, gridSize) => {
  const colorsByPosition = new Map(
    perimeterColors.map(({ row, column, color }) => [`${row}:${column}`, color])
  );
  const domeColors = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const perimeterColor = colorsByPosition.get(`${row}:${column}`);
      if (perimeterColor) {
        domeColors.push({ row, column, color: perimeterColor });
        continue;
      }

      domeColors.push({
        row,
        column,
        color: blendColorsByDistance([
          { color: colorsByPosition.get(`0:${column}`), distance: row },
          {
            color: colorsByPosition.get(`${gridSize - 1}:${column}`),
            distance: gridSize - 1 - row,
          },
          { color: colorsByPosition.get(`${row}:0`), distance: column },
          {
            color: colorsByPosition.get(`${row}:${gridSize - 1}`),
            distance: gridSize - 1 - column,
          },
        ]),
      });
    }
  }

  return domeColors;
};

export const extractWeightedFrameColor = (imageData) => computeWeightedColor(
  imageData.data,
  imageData.width,
  0,
  0,
  imageData.width,
  imageData.height
);
