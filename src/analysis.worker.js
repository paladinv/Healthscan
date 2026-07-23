import { analyzeImageData } from "./analysis.js";

self.onmessage = ({ data }) => {
  try {
    const result = analyzeImageData(data.imageData, data.width, data.height);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Analysis failed" });
  }
};
