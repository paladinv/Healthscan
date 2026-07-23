import test from "node:test";
import assert from "node:assert/strict";
import { analyzeImageData, assessImageQuality } from "../src/analysis.js";

function image(width, height, [r, g, b, a = 255] = [100, 100, 100, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, a], i);
  return { data };
}

function paint(imageData, width, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      imageData.data.set([...color, 255], (y * width + x) * 4);
    }
  }
}

test("returns no detections for a neutral sample", () => {
  const width = 160, height = 120;
  const data = image(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 80 : 120;
      data.data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  const result = analyzeImageData(data, width, height);
  assert.equal(result.detections.length, 0);
  assert.equal(result.sampleType, "unknown");
  assert.equal(result.quality.status, "usable");
});

test("detects a sufficiently large bright-red cluster inside the bowl mask", () => {
  const width = 160, height = 120;
  const data = image(width, height);
  paint(data, width, 52, 42, 108, 92, [220, 20, 20]);
  const result = analyzeImageData(data, width, height);
  assert.ok(result.detections.length > 0);
  assert.equal(result.detections[0].label, "Bright Red");
  assert.equal(result.detections[0].severity, "urgent");
});

test("marks a glare-heavy image as inconclusive", () => {
  const width = 160, height = 120;
  const data = image(width, height, [255, 255, 255]);
  const quality = assessImageQuality(data, width, height);
  assert.equal(quality.status, "inconclusive");
  assert.ok(quality.reasons.length > 0);
});
