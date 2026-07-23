// Pure, browser-independent scan analysis. Keep this module free of React and
// DOM APIs so the classifier can be tested with synthetic and fixture images.

export const BLOOD_PROFILES = [
  { label: "Bright Red", hMin: 0, hMax: 15, sMin: 45, sMax: 100, lMin: 25, lMax: 55, color: "#ef4444", severity: "urgent" },
  { label: "Dark Red", hMin: 340, hMax: 360, sMin: 40, sMax: 100, lMin: 15, lMax: 40, color: "#991b1b", severity: "urgent" },
  { label: "Maroon", hMin: 0, hMax: 20, sMin: 30, sMax: 80, lMin: 10, lMax: 25, color: "#7f1d1d", severity: "warning" },
  { label: "Brown Blood", hMin: 15, hMax: 40, sMin: 25, sMax: 70, lMin: 8, lMax: 22, color: "#b45309", severity: "warning" },
  { label: "Black (Tarry)", hMin: 0, hMax: 360, sMin: 0, sMax: 30, lMin: 2, lMax: 10, color: "#1f2937", severity: "caution" },
];

export const CONTENT_PROFILES = {
  urine: { label: "Urine", hMin: 35, hMax: 70, sMin: 15, sMax: 80, lMin: 35, lMax: 80, color: "#facc15" },
  stool: { label: "Stool", hMin: 10, hMax: 35, sMin: 20, sMax: 75, lMin: 12, lMax: 45, color: "#92400e" },
};
const CONTENT_PROFILE_LIST = Object.values(CONTENT_PROFILES);

export const BOWL_MASK = { centerX: 0.5, centerY: 0.56, radiusX: 0.38, radiusY: 0.44 };
export const MIN_BLOOD_PIXELS = 36;
export const MIN_BLOOD_RATIO = 0.002;
export const MIN_URINE_RATIO = 0.02;
export const MIN_STOOL_RATIO = 0.02;

export function isInBowlMask(x, y, width, height) {
  const cx = width * BOWL_MASK.centerX;
  const cy = height * BOWL_MASK.centerY;
  const rx = width * BOWL_MASK.radiusX;
  const ry = height * BOWL_MASK.radiusY;
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function matchesProfile(r, g, b, profiles) {
  const { h, s, l } = rgbToHsl(r, g, b);
  for (const profile of profiles) {
    const hMatch = profile.hMin <= profile.hMax
      ? h >= profile.hMin && h <= profile.hMax
      : h >= profile.hMin || h <= profile.hMax;
    if (hMatch && s >= profile.sMin && s <= profile.sMax && l >= profile.lMin && l <= profile.lMax) return profile;
  }
  return null;
}

function clusterDetections(pixels, width, height) {
  const gridSize = 12;
  const gridW = Math.ceil(width / gridSize);
  const gridH = Math.ceil(height / gridSize);
  const grid = new Array(gridW * gridH).fill(null).map(() => ({ count: 0, profiles: {} }));

  pixels.forEach(({ x, y, profile }) => {
    const cell = grid[Math.floor(y / gridSize) * gridW + Math.floor(x / gridSize)];
    cell.count++;
    cell.profiles[profile.label] = (cell.profiles[profile.label] || 0) + 1;
  });

  const visited = new Set();
  const boxes = [];
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const start = gy * gridW + gx;
      if (visited.has(start) || grid[start].count < 3) continue;
      const queue = [start];
      visited.add(start);
      let minX = gx, maxX = gx, minY = gy, maxY = gy, totalPixels = 0;
      const profileTotals = {};
      while (queue.length) {
        const cellIndex = queue.pop();
        const cellX = cellIndex % gridW, cellY = Math.floor(cellIndex / gridW);
        minX = Math.min(minX, cellX); maxX = Math.max(maxX, cellX);
        minY = Math.min(minY, cellY); maxY = Math.max(maxY, cellY);
        totalPixels += grid[cellIndex].count;
        Object.entries(grid[cellIndex].profiles).forEach(([label, count]) => {
          profileTotals[label] = (profileTotals[label] || 0) + count;
        });
        [[cellX - 1, cellY], [cellX + 1, cellY], [cellX, cellY - 1], [cellX, cellY + 1]].forEach(([nx, ny]) => {
          if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) return;
          const next = ny * gridW + nx;
          if (!visited.has(next) && grid[next].count >= 3) {
            visited.add(next);
            queue.push(next);
          }
        });
      }
      if (totalPixels < 8) continue;
      const dominant = Object.entries(profileTotals).sort((a, b) => b[1] - a[1])[0];
      const profile = BLOOD_PROFILES.find((item) => item.label === dominant[0]);
      boxes.push({
        x: minX * gridSize,
        y: minY * gridSize,
        w: (maxX - minX + 1) * gridSize,
        h: (maxY - minY + 1) * gridSize,
        label: profile.label,
        color: profile.color,
        severity: profile.severity,
        pixels: totalPixels,
      });
    }
  }
  return boxes;
}

export function assessImageQuality(imageData, width, height) {
  const data = imageData.data;
  let count = 0, sum = 0, sumSquares = 0, clipped = 0, dark = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (!isInBowlMask(x, y, width, height)) continue;
      const i = (y * width + x) * 4;
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
      sum += luminance;
      sumSquares += luminance * luminance;
      if (luminance >= 250) clipped++;
      if (luminance <= 15) dark++;
    }
  }
  if (!count) return { status: "inconclusive", reasons: ["The bowl area could not be identified."], averageLuminance: 0, clippedRatio: 0 };
  const averageLuminance = sum / count;
  const variance = Math.max(0, sumSquares / count - averageLuminance ** 2);
  const clippedRatio = clipped / count;
  const darkRatio = dark / count;
  const reasons = [];
  if (averageLuminance < 38 || darkRatio > 0.45) reasons.push("The scan is too dark.");
  if (averageLuminance > 220 || clippedRatio > 0.35) reasons.push("Glare or overexposure obscures the sample.");
  if (variance < 18) reasons.push("The image has too little visible detail.");
  return {
    status: reasons.length ? "inconclusive" : "usable",
    reasons,
    averageLuminance,
    clippedRatio,
    darkRatio,
  };
}

export function analyzeImageData(imageData, width, height) {
  const data = imageData.data;
  const bloodPixels = [];
  const contentCounts = { urine: 0, stool: 0 };
  let bowlSamples = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (!isInBowlMask(x, y, width, height)) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      bowlSamples++;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const content = matchesProfile(r, g, b, CONTENT_PROFILE_LIST);
      if (content === CONTENT_PROFILES.urine) contentCounts.urine++;
      else if (content === CONTENT_PROFILES.stool) contentCounts.stool++;
      const blood = matchesProfile(r, g, b, BLOOD_PROFILES);
      if (blood) bloodPixels.push({ x, y, profile: blood });
    }
  }
  const bloodRatio = bowlSamples ? bloodPixels.length / bowlSamples : 0;
  const urineRatio = bowlSamples ? contentCounts.urine / bowlSamples : 0;
  const stoolRatio = bowlSamples ? contentCounts.stool / bowlSamples : 0;
  const hasUrine = urineRatio >= MIN_URINE_RATIO;
  const hasStool = stoolRatio >= MIN_STOOL_RATIO;
  const sampleType = hasUrine && hasStool ? "both" : hasUrine ? "urine" : hasStool ? "stool" : "unknown";
  const quality = assessImageQuality(imageData, width, height);
  return {
    detections: bloodPixels.length >= MIN_BLOOD_PIXELS && bloodRatio >= MIN_BLOOD_RATIO ? clusterDetections(bloodPixels, width, height) : [],
    bloodPixels: bloodPixels.length,
    bloodRatio,
    sampleType,
    contentSummary: { urineRatio, stoolRatio },
    quality,
  };
}
