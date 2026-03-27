
import { useState, useRef, useCallback, useEffect } from "react";
import jsPDF from "jspdf";
import QRCode from "qrcode";

// ─── COLOR SCIENCE: Blood Detection Ranges ───────────────────────────────────
// Blood in urine/stool appears across a spectrum:
//   Bright red    → fresh blood (urinary tract)
//   Dark red      → older blood or GI bleed
//   Brown/maroon  → digested blood (upper GI)
//   Black (tarry) → heavily digested blood (upper GI - melena)
// We detect these via HSL analysis on each pixel cluster.

const BLOOD_PROFILES = [
  { label: "Bright Red", hMin: 0, hMax: 15, sMin: 45, sMax: 100, lMin: 25, lMax: 55, color: "#ef4444", severity: "urgent" },
  { label: "Dark Red", hMin: 340, hMax: 360, sMin: 40, sMax: 100, lMin: 15, lMax: 40, color: "#991b1b", severity: "urgent" },
  { label: "Maroon", hMin: 0, hMax: 20, sMin: 30, sMax: 80, lMin: 10, lMax: 25, color: "#7f1d1d", severity: "warning" },
  { label: "Brown Blood", hMin: 15, hMax: 40, sMin: 25, sMax: 70, lMin: 8, lMax: 22, color: "#b45309", severity: "warning" },
  { label: "Black (Tarry)", hMin: 0, hMax: 360, sMin: 0, sMax: 30, lMin: 2, lMax: 10, color: "#1f2937", severity: "caution" },
];

// ─── CONTENT DETECTION: Urine/Stool Hints ────────────────────────────────────
const CONTENT_PROFILES = {
  urine: { label: "Urine", hMin: 35, hMax: 70, sMin: 15, sMax: 80, lMin: 35, lMax: 80, color: "#facc15" },
  stool: { label: "Stool", hMin: 10, hMax: 35, sMin: 20, sMax: 75, lMin: 12, lMax: 45, color: "#92400e" },
};

// ─── LIGHTING CHECK ───────────────────────────────────────────────────────────
// Thresholds tuned for typical indoor bathroom lighting on a phone camera.
// Luminance per pixel = 0.299R + 0.587G + 0.114B  (ITU-R BT.601)
// We sample only the central 60×60 % of the frame to ignore dark edges / borders.
const LIGHT_DIM_MAX = 38;   // avg luminance below this → too dim
const LIGHT_BRIGHT_MIN = 220; // avg luminance above this → too bright

// ─── DETECTION CONSTRAINTS ───────────────────────────────────────────────────
const BOWL_MASK = {
  centerX: 0.5,
  centerY: 0.56,
  radiusX: 0.38,
  radiusY: 0.44,
};
const MIN_BLOOD_PIXELS = 36;
const MIN_BLOOD_RATIO = 0.002;
const MIN_URINE_RATIO = 0.02;
const MIN_STOOL_RATIO = 0.02;
const FINDING_CROP_PAD_RATIO = 0.32;
const FINDING_CROP_MIN_PAD = 14;

function isInBowlMask(x, y, width, height) {
  const cx = width * BOWL_MASK.centerX;
  const cy = height * BOWL_MASK.centerY;
  const rx = width * BOWL_MASK.radiusX;
  const ry = height * BOWL_MASK.radiusY;
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function measureBrightness(videoEl, scratchCanvas) {
  if (!videoEl || videoEl.readyState < videoEl.HAVE_ENOUGH_DATA) return null;
  const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
  if (!vw || !vh) return null;

  // Define the central 60 % crop
  const cropX = vw * 0.2, cropY = vh * 0.2;
  const cropW = vw * 0.6, cropH = vh * 0.6;

  scratchCanvas.width = cropW;
  scratchCanvas.height = cropH;
  const ctx = scratchCanvas.getContext("2d");
  ctx.drawImage(videoEl, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const imageData = ctx.getImageData(0, 0, cropW, cropH);
  const d = imageData.data;
  let sum = 0, count = 0;
  // Sample every 4th pixel for speed
  for (let i = 0; i < d.length; i += 16) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    count++;
  }
  const avg = sum / count;

  if (avg < LIGHT_DIM_MAX) return { status: "dim", value: avg };
  if (avg > LIGHT_BRIGHT_MIN) return { status: "bright", value: avg };
  return { status: "ok", value: avg };
}

function rgbToHsl(r, g, b) {
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

function matchesBlood(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  for (const p of BLOOD_PROFILES) {
    const hMatch = p.hMin <= p.hMax
      ? h >= p.hMin && h <= p.hMax
      : h >= p.hMin || h <= p.hMax;
    if (hMatch && s >= p.sMin && s <= p.sMax && l >= p.lMin && l <= p.lMax) {
      return p;
    }
  }
  return null;
}

function matchesContent(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  for (const [key, p] of Object.entries(CONTENT_PROFILES)) {
    const hMatch = p.hMin <= p.hMax
      ? h >= p.hMin && h <= p.hMax
      : h >= p.hMin || h <= p.hMax;
    if (hMatch && s >= p.sMin && s <= p.sMax && l >= p.lMin && l <= p.lMax) {
      return key;
    }
  }
  return null;
}

// ─── CLUSTER NEARBY BLOOD PIXELS INTO BOUNDING BOXES ─────────────────────────
function clusterDetections(pixels, width, height) {
  const GRID = 12; // cluster grid cell size in px
  const gridW = Math.ceil(width / GRID);
  const gridH = Math.ceil(height / GRID);
  const grid = new Array(gridW * gridH).fill(null).map(() => ({ count: 0, profiles: {} }));

  pixels.forEach(({ x, y, profile }) => {
    const gx = Math.floor(x / GRID), gy = Math.floor(y / GRID);
    const cell = grid[gy * gridW + gx];
    cell.count++;
    cell.profiles[profile.label] = (cell.profiles[profile.label] || 0) + 1;
  });

  // Merge adjacent cells with enough signal into bounding boxes
  const visited = new Set();
  const boxes = [];
  const THRESHOLD = 3; // min pixels in a cell to count

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gy * gridW + gx;
      if (visited.has(idx) || grid[idx].count < THRESHOLD) continue;
      // BFS flood fill to find connected cluster
      const queue = [idx];
      visited.add(idx);
      let minX = gx, maxX = gx, minY = gy, maxY = gy;
      let totalPixels = 0;
      const profileTotals = {};
      while (queue.length) {
        const ci = queue.shift();
        const cx = ci % gridW, cy = Math.floor(ci / gridW);
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        totalPixels += grid[ci].count;
        Object.entries(grid[ci].profiles).forEach(([k, v]) => {
          profileTotals[k] = (profileTotals[k] || 0) + v;
        });
        // Check 4 neighbors
        const neighbors = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
        neighbors.forEach(([nx, ny]) => {
          if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) return;
          const ni = ny * gridW + nx;
          if (!visited.has(ni) && grid[ni].count >= THRESHOLD) {
            visited.add(ni);
            queue.push(ni);
          }
        });
      }
      if (totalPixels < 8) continue; // filter noise
      // Dominant profile
      const dominant = Object.entries(profileTotals).sort((a,b) => b[1]-a[1])[0];
      const prof = BLOOD_PROFILES.find(p => p.label === dominant[0]);
      boxes.push({
        x: minX * GRID, y: minY * GRID,
        w: (maxX - minX + 1) * GRID, h: (maxY - minY + 1) * GRID,
        label: prof.label, color: prof.color, severity: prof.severity, pixels: totalPixels
      });
    }
  }
  return boxes;
}

// ─── ANALYZE IMAGE DATA ───────────────────────────────────────────────────────
function analyzeImageData(imageData, width, height) {
  const data = imageData.data;
  const bloodPixels = [];
  const contentCounts = { urine: 0, stool: 0 };
  let bowlSamples = 0;
  // Sample every 2nd pixel for performance
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (!isInBowlMask(x, y, width, height)) continue;
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;
      bowlSamples++;
      const contentType = matchesContent(r, g, b);
      if (contentType) contentCounts[contentType]++;
      const profile = matchesBlood(r, g, b);
      if (profile) bloodPixels.push({ x, y, profile });
    }
  }
  const bloodRatio = bowlSamples ? bloodPixels.length / bowlSamples : 0;
  const contentSummary = {
    urineRatio: bowlSamples ? contentCounts.urine / bowlSamples : 0,
    stoolRatio: bowlSamples ? contentCounts.stool / bowlSamples : 0,
  };
  const hasUrine = contentSummary.urineRatio >= MIN_URINE_RATIO;
  const hasStool = contentSummary.stoolRatio >= MIN_STOOL_RATIO;
  const sampleType = hasUrine && hasStool ? "both" : hasUrine ? "urine" : hasStool ? "stool" : "unknown";

  if (bloodPixels.length < MIN_BLOOD_PIXELS || bloodRatio < MIN_BLOOD_RATIO) {
    return { detections: [], bloodPixels: bloodPixels.length, bloodRatio, sampleType, contentSummary };
  }

  return {
    detections: clusterDetections(bloodPixels, width, height),
    bloodPixels: bloodPixels.length,
    bloodRatio,
    sampleType,
    contentSummary,
  };
}

// ─── SEVERITY LEGEND INFO ─────────────────────────────────────────────────────
const SEVERITY_INFO = {
  urgent: { icon: "🔴", title: "Urgent", desc: "Bright or dark red blood may indicate bleeding in the urinary or lower digestive tract. Consult a doctor promptly." },
  warning: { icon: "🟠", title: "Warning", desc: "Maroon or brown coloring may indicate blood that has been partially digested, possibly from the upper GI tract." },
  caution: { icon: "⚫", title: "Caution", desc: "Very dark or tarry (black) stool may indicate upper GI bleeding (melena). Medical evaluation is recommended." },
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function HealthScanApp() {
  const [phase, setPhase] = useState("home"); // home | camera | scanning | results
  const [imageUrl, setImageUrl] = useState(null);
  const [detections, setDetections] = useState([]);
  const [bloodStats, setBloodStats] = useState({ pixels: 0, ratio: 0 });
  const [sampleType, setSampleType] = useState("unknown");
  const [findingCrops, setFindingCrops] = useState([]);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [toast, setToast] = useState(null);
  const [lightingStatus, setLightingStatus] = useState(null); // { status: "dim"|"ok"|"bright", value }
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const scratchCanvasRef = useRef(null); // off-screen canvas for brightness sampling
  const streamRef = useRef(null);
  const lightingIntervalRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // ── Start camera ──
  const startCamera = useCallback(async ({ quiet = false } = {}) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (err) {
          setToast("Camera playback was blocked. Tap Start Scan again to allow playback.");
        }
      }
      setPhase("camera");
    } catch (e) {
      if (quiet) {
        setToast("Tap Start Scan to enable the camera.");
        setPhase("home");
      } else {
        alert("Camera access denied or unavailable. Please enable camera permissions.");
      }
    }
  }, []);

  // ── Stop camera ──
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Capture snapshot ──
  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth, h = video.videoHeight;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const url = canvas.toDataURL("image/jpeg", 0.92);
    setImageUrl(url);
    stopCamera();
    setPhase("scanning");
  }, [stopCamera]);

  // ── Poll lighting while camera is live ──
  useEffect(() => {
    if (phase !== "camera") {
      clearInterval(lightingIntervalRef.current);
      lightingIntervalRef.current = null;
      setLightingStatus(null);
      return;
    }
    // Create a persistent off-screen canvas for brightness sampling
    if (!scratchCanvasRef.current) {
      scratchCanvasRef.current = document.createElement("canvas");
    }
    const tick = () => {
      const result = measureBrightness(videoRef.current, scratchCanvasRef.current);
      if (result) setLightingStatus(result);
    };
    tick(); // immediate first read
    lightingIntervalRef.current = setInterval(tick, 600);
    return () => { clearInterval(lightingIntervalRef.current); lightingIntervalRef.current = null; };
  }, [phase]);

  // ── Run analysis when scanning ──
  useEffect(() => {
    if (phase !== "scanning" || !imageUrl) return;
    const img = new Image();
    let cancelled = false;
    let timeoutId = null;
    img.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      // Simulate brief scanning delay for UX
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        const results = analyzeImageData(imageData, img.width, img.height);
        setDetections(results.detections);
        setBloodStats({ pixels: results.bloodPixels, ratio: results.bloodRatio });
        setSampleType(results.sampleType);
        setPhase("results");
      }, 1400);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [phase, imageUrl]);

  // ── Draw overlay on results ──
  useEffect(() => {
    if (phase !== "results" || !imageUrl || !overlayCanvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = overlayCanvasRef.current;
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      detections.forEach(box => {
        const pad = 6;
        const rx = box.x - pad, ry = box.y - pad;
        const rw = box.w + pad * 2, rh = box.h + pad * 2;
        // Semi-transparent fill
        ctx.fillStyle = box.color + "44";
        ctx.fillRect(rx, ry, rw, rh);
        // Border
        ctx.strokeStyle = box.color;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        // Label background
        const fontSize = Math.max(14, img.width * 0.022);
        ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
        const labelText = `${box.label} (${box.pixels}px)`;
        const tw = ctx.measureText(labelText).width + 16;
        const th = fontSize + 10;
        const ly = ry - th - 4 < 0 ? ry + rh + 4 : ry - th - 4;
        ctx.fillStyle = "#111827ee";
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(rx, ly, tw, th, 6);
        } else {
          const r = 6;
          ctx.moveTo(rx + r, ly);
          ctx.lineTo(rx + tw - r, ly);
          ctx.quadraticCurveTo(rx + tw, ly, rx + tw, ly + r);
          ctx.lineTo(rx + tw, ly + th - r);
          ctx.quadraticCurveTo(rx + tw, ly + th, rx + tw - r, ly + th);
          ctx.lineTo(rx + r, ly + th);
          ctx.quadraticCurveTo(rx, ly + th, rx, ly + th - r);
          ctx.lineTo(rx, ly + r);
          ctx.quadraticCurveTo(rx, ly, rx + r, ly);
        }
        ctx.fill();
        // Label text
        ctx.fillStyle = box.color;
        ctx.fillText(labelText, rx + 8, ly + fontSize + 2);
      });
    };
    img.src = imageUrl;
  }, [phase, imageUrl, detections]);

  const reset = () => {
    setImageUrl(null);
    setDetections([]);
    setBloodStats({ pixels: 0, ratio: 0 });
    setSampleType("unknown");
    setFindingCrops([]);
    setQrDataUrl(null);
    setToast(null);
    setPhase("home");
  };

  // ── Cleanup on unmount / phase change ──
  useEffect(() => { return () => stopCamera(); }, [stopCamera]);

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (!toast) return;
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2400);
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    };
  }, [toast]);

  // ── Auto-open camera from shortcut link ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("scan") !== "1") return;
    startCamera({ quiet: true });
  }, [startCamera]);

  // ── Generate crop previews for each finding ──
  useEffect(() => {
    if (phase !== "results" || !imageUrl || detections.length === 0) {
      setFindingCrops([]);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const crops = detections.map((box) => {
        const pad = Math.max(FINDING_CROP_MIN_PAD, Math.round(Math.max(box.w, box.h) * FINDING_CROP_PAD_RATIO));
        const cropX = Math.max(0, box.x - pad);
        const cropY = Math.max(0, box.y - pad);
        const cropW = Math.min(img.width - cropX, box.w + pad * 2);
        const cropH = Math.min(img.height - cropY, box.h + pad * 2);
        const thumbSize = 96;
        const canvas = document.createElement("canvas");
        canvas.width = thumbSize;
        canvas.height = thumbSize;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, thumbSize, thumbSize);
        const scale = Math.min(thumbSize / cropW, thumbSize / cropH);
        const dw = cropW * scale;
        const dh = cropH * scale;
        const dx = (thumbSize - dw) / 2;
        const dy = (thumbSize - dh) / 2;
        ctx.drawImage(img, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
        return canvas.toDataURL("image/jpeg", 0.9);
      });
      setFindingCrops(crops);
    };
    img.src = imageUrl;
    return () => { cancelled = true; };
  }, [phase, imageUrl, detections]);

  // ── Generate QR code for sharing ──
  useEffect(() => {
    if (phase !== "results") return;
    const value = `${window.location.origin}${window.location.pathname}`;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: "H",
      width: 180,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [phase]);

  const saveImage = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "healthscan-scan.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  const exportScanResults = useCallback(async () => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 36;
    const contentW = pageW - margin * 2;

    // Background
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageW, pageH, "F");

    // Header
    pdf.setTextColor(241, 245, 249);
    pdf.setFontSize(20);
    pdf.text("HealthScan — Scan Results", margin, 44);

    // Image
    const scanImg = canvas.toDataURL("image/png");
    const imgW = contentW;
    const imgH = (canvas.height / canvas.width) * imgW;
    let y = 68;
    pdf.addImage(scanImg, "PNG", margin, y, imgW, imgH);
    y += imgH + 16;

    // Summary badge
    const severity = highestSeverity || "caution";
    const severityColor = detections.length === 0
      ? [34, 197, 94]
      : severity === "urgent" ? [239, 68, 68] : severity === "warning" ? [245, 158, 11] : [148, 163, 184];
    pdf.setFillColor(30, 41, 59);
    pdf.setDrawColor(...severityColor);
    pdf.roundedRect(margin, y, contentW, 36, 8, 8, "FD");
    pdf.setTextColor(226, 232, 240);
    pdf.setFontSize(12);
    const summaryLabel = detections.length === 0
      ? "No blood detected"
      : `${SEVERITY_INFO[severity].title} — ${detections.length} detection${detections.length === 1 ? "" : "s"}`;
    pdf.text(summaryLabel, margin + 12, y + 22);
    y += 52;

    // Sample type
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(11);
    const sampleLabel = sampleType === "both" ? "Urine + Stool" : sampleType === "urine" ? "Urine" : sampleType === "stool" ? "Stool" : "Unknown";
    pdf.text(`Sample type: ${sampleLabel}`, margin, y);
    y += 20;

    // Detection list
    if (detections.length) {
      detections.forEach((d, index) => {
        pdf.setFillColor(30, 41, 59);
        pdf.setDrawColor(51, 65, 85);
        pdf.roundedRect(margin, y, contentW, 54, 8, 8, "FD");
        pdf.setFillColor(...hexToRgb(d.color));
        pdf.circle(margin + 16, y + 27, 5, "F");
        pdf.setTextColor(...hexToRgb(d.color));
        pdf.setFontSize(12);
        pdf.text(d.label, margin + 28, y + 24);
        pdf.setTextColor(148, 163, 184);
        pdf.setFontSize(10);
        pdf.text(`${d.pixels} matching pixels detected`, margin + 28, y + 40);

        const tagText = d.severity.toUpperCase();
        const tagW = pdf.getTextWidth(tagText) + 16;
        const tagX = margin + contentW - tagW - 12;
        pdf.setFillColor(17, 24, 39);
        pdf.roundedRect(tagX, y + 16, tagW, 22, 6, 6, "F");
        pdf.setTextColor(148, 163, 184);
        pdf.text(tagText, tagX + 8, y + 31);
        y += 64;

        if (y + 200 > pageH) {
          pdf.addPage();
          pdf.setFillColor(15, 23, 42);
          pdf.rect(0, 0, pageW, pageH, "F");
          y = 44;
        }
      });
    }

    // Medical note
    pdf.setFillColor(30, 41, 59);
    pdf.setDrawColor(71, 85, 105);
    pdf.roundedRect(margin, y, contentW, 80, 10, 10, "FD");
    pdf.setTextColor(203, 213, 225);
    pdf.setFontSize(12);
    pdf.text("What this may indicate", margin + 12, y + 22);
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(10);
    const noteText = detections.length === 0
      ? "No blood markers were detected in the scan. Continue monitoring regularly."
      : SEVERITY_INFO[severity].desc;
    const noteLines = pdf.splitTextToSize(noteText, contentW - 24);
    pdf.text(noteLines, margin + 12, y + 38);
    y += 96;

    // Links
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(10);
    const urineLink = "https://www.mayoclinic.org/diseases-conditions/blood-in-urine/symptoms-causes/syc-20353432";
    const stoolLink = "https://www.mayoclinic.org/symptoms/rectal-bleeding/basics/causes/sym-20050740";
    pdf.text("Learn more:", margin, y);
    pdf.setTextColor(59, 130, 246);
    pdf.textWithLink("Blood in urine (Mayo Clinic)", margin, y + 14, { url: urineLink });
    pdf.textWithLink("Rectal bleeding (Mayo Clinic)", margin, y + 30, { url: stoolLink });

    // QR code
    const qrValue = `${window.location.origin}${window.location.pathname}`;
    const qrData = await QRCode.toDataURL(qrValue, { errorCorrectionLevel: "H", width: 220, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } });
    pdf.addImage(qrData, "PNG", pageW - margin - 96, y - 4, 96, 96);
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(9);
    pdf.text("Scan to open HealthScan", pageW - margin - 120, y + 104);

    pdf.save("healthscan-scan-results.pdf");
  }, [detections, highestSeverity, sampleType]);

  function hexToRgb(hex) {
    const raw = hex.replace("#", "");
    const value = raw.length === 3 ? raw.split("").map((v) => v + v).join("") : raw;
    const num = parseInt(value, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  // Highest severity found
  const highestSeverity = detections.length
    ? (detections.some(d => d.severity === "urgent") ? "urgent" : detections.some(d => d.severity === "warning") ? "warning" : "caution")
    : null;

  const scanShortcutUrl = `${window.location.origin}${window.location.pathname}?scan=1`;

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Toast */}
      {toast && <div style={styles.toast}>{toast}</div>}

      {/* ── HOME ── */}
      {phase === "home" && (
        <div style={styles.screen}>
          <div style={styles.homeIcon}>
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <circle cx="36" cy="36" r="34" stroke="#22c55e" strokeWidth="2.5" fill="none" strokeDasharray="60 150" strokeLinecap="round" style={{ transform: "rotate(-30deg)", transformOrigin: "center" }} />
              <circle cx="36" cy="36" r="24" fill="#1e293b" />
              <path d="M28 36 L33 41 L44 30" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <h1 style={styles.homeTitle}>HealthScan</h1>
          <p style={styles.homeSub}>Toilet health monitoring via blood detection in urine & stool</p>
          <div style={styles.infoCard}>
            <p style={styles.infoText}>
              This app scans for signs of blood — ranging from <span style={{ color: "#ef4444" }}>bright red</span> to <span style={{ color: "#9ca3af" }}>black</span> — which may indicate urinary or colorectal conditions.
            </p>
            <p style={{ ...styles.infoText, marginTop: 8, fontSize: 12, color: "#6b7280" }}>
              ⚕️ This is a screening aid only. Always consult a healthcare professional for diagnosis.
            </p>
          </div>
          <button style={styles.primaryBtn} onClick={startCamera}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
              <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
            Start Scan
          </button>

          <div style={styles.shortcutCard}>
            <p style={styles.shortcutTitle}>iOS Scan Shortcut</p>
            <p style={styles.shortcutText}>
              Save a one-tap Home Screen shortcut that opens HealthScan directly to the scanner.
            </p>
            <a style={styles.shortcutLink} href={scanShortcutUrl}>
              Open Scan Shortcut Link
            </a>
            <p style={styles.shortcutHint}>
              Tip: In Safari, tap Share → Add to Home Screen to save this as a shortcut.
            </p>
          </div>
        </div>
      )}

      {/* ── CAMERA ── */}
      {phase === "camera" && (() => {
        const canCapture = !lightingStatus || lightingStatus.status === "ok";
        const lightColor = !lightingStatus ? "#64748b" : lightingStatus.status === "ok" ? "#22c55e" : "#f59e0b";
        const lightIcon = !lightingStatus ? "…" : lightingStatus.status === "ok" ? "☀️" : lightingStatus.status === "dim" ? "🌑" : "💡";
        const lightMsg = !lightingStatus ? "Checking lighting…"
          : lightingStatus.status === "dim" ? "Too dim — brighten the light"
          : lightingStatus.status === "bright" ? "Too bright — reduce direct light"
          : "Lighting OK";
        // Normalized bar fill: map [0..255] → [0..100]%
        const barPct = lightingStatus ? Math.round((lightingStatus.value / 255) * 100) : 50;

        return (
          <div style={styles.screen}>
            <div style={styles.cameraContainer}>
              <video ref={videoRef} style={styles.video} playsInline autoPlay muted />
              {/* Viewfinder corners */}
              <div style={styles.viewfinder}>
                <div style={styles.corner("top-left")} />
                <div style={styles.corner("top-right")} />
                <div style={styles.corner("bottom-left")} />
                <div style={styles.corner("bottom-right")} />
              </div>
              {/* Lighting indicator bar — sits at the top of the viewfinder */}
              <div style={styles.lightingBar}>
                <span style={{ fontSize: 14 }}>{lightIcon}</span>
                <div style={styles.lightingTrack}>
                  {/* Left marker: dim zone */}
                  <div style={styles.zoneMarkerLeft}>dim</div>
                  {/* Right marker: bright zone */}
                  <div style={styles.zoneMarkerRight}>bright</div>
                  {/* Track background zones */}
                  <div style={styles.lightingTrackBg} />
                  {/* Filled portion */}
                  <div style={{ ...styles.lightingFill, width: `${barPct}%`, background: lightColor, boxShadow: `0 0 6px ${lightColor}88` }} />
                  {/* Thumb */}
                  <div style={{ ...styles.lightingThumb, left: `calc(${barPct}% - 6px)`, borderColor: lightColor }} />
                </div>
                <span style={{ ...styles.lightingLabel, color: lightColor }}>{lightMsg}</span>
              </div>
              {/* Bottom hint */}
              <div style={styles.cameraHint}>Point at the toilet bowl</div>
            </div>
            <div style={styles.cameraActions}>
              <button style={styles.cancelBtn} onClick={() => { stopCamera(); setPhase("home"); }}>Cancel</button>
              <button
                style={{ ...styles.captureBtn, ...(canCapture ? {} : styles.captureBtnDisabled) }}
                onClick={canCapture ? capture : undefined}
                disabled={!canCapture}
              >
                <div style={{ ...styles.captureInner, ...(canCapture ? {} : { background: "#475569" }) }} />
              </button>
              <div style={{ width: 56 }} />
            </div>
            {/* Persistent warning text below buttons when lighting is bad */}
            {!canCapture && (
              <p style={styles.lightingWarning}>
                {lightingStatus.status === "dim"
                  ? "Move closer to a light source or turn on the bathroom light."
                  : "Step back or turn off direct overhead light to reduce glare."}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── SCANNING ── */}
      {phase === "scanning" && (
        <div style={styles.screen}>
          <div style={styles.scanPreview}>
            <img src={imageUrl} alt="scan" style={styles.previewImg} />
            <div style={styles.scanOverlay}>
              <div style={styles.scanLine} />
            </div>
          </div>
          <div style={styles.scanStatus}>
            <div style={styles.pulser} />
            <span style={styles.scanText}>Analyzing for blood markers…</span>
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {phase === "results" && (
        <div style={styles.screen}>
          <div style={styles.resultsHeader}>
            <button style={styles.backBtn} onClick={reset}>← Back</button>
            <span style={styles.resultsTitle}>Scan Results</span>
          </div>
          <div style={styles.resultImageWrap}>
            <canvas ref={overlayCanvasRef} style={styles.resultCanvas} />
          </div>

          {detections.length === 0 ? (
            <div style={styles.cleanCard}>
              <div style={styles.cleanIcon}>✓</div>
              <p style={styles.cleanTitle}>No blood detected</p>
              <p style={styles.cleanSub}>No signs of blood were found in this scan. Continue monitoring regularly.</p>
            </div>
          ) : (
            <>
              {/* Summary badge */}
              <div style={{ ...styles.summaryBadge, borderColor: highestSeverity === "urgent" ? "#ef4444" : highestSeverity === "warning" ? "#f59e0b" : "#6b7280" }}>
                <span style={styles.summaryLabel}>
                  {SEVERITY_INFO[highestSeverity].icon} {detections.length} detection{detections.length > 1 ? "s" : ""} — {SEVERITY_INFO[highestSeverity].title}
                </span>
              </div>

              {/* Sample type */}
              <div style={styles.sampleType}>
                <span style={styles.sampleLabel}>Sample type</span>
                <span style={styles.sampleValue}>
                  {sampleType === "both" ? "Urine + Stool" : sampleType === "urine" ? "Urine" : sampleType === "stool" ? "Stool" : "Unknown"}
                </span>
              </div>

              {/* Detection list */}
              <div style={styles.detectionList}>
                {detections.map((d, i) => (
                  <div key={i} style={styles.detectionCard}>
                    {findingCrops[i] && (
                      <img src={findingCrops[i]} alt={`${d.label} crop`} style={styles.findingThumb} />
                    )}
                    <div style={{ ...styles.detectionDot, background: d.color }} />
                    <div style={styles.detectionInfo}>
                      <span style={{ ...styles.detectionLabel, color: d.color }}>{d.label}</span>
                      <span style={styles.detectionMeta}>{d.pixels} matching pixels detected</span>
                    </div>
                    <span style={{ ...styles.severityTag, background: d.severity === "urgent" ? "#7f1d1d33" : d.severity === "warning" ? "#78350f33" : "#1f293633", color: d.severity === "urgent" ? "#fca5a5" : d.severity === "warning" ? "#fcd34d" : "#9ca3af" }}>
                      {d.severity}
                    </span>
                  </div>
                ))}
              </div>

              {/* Medical note */}
              <div style={styles.medicalNote}>
                <p style={styles.medicalTitle}>⚕️ What this may indicate</p>
                <p style={styles.medicalText}>{SEVERITY_INFO[highestSeverity].desc}</p>
                <p style={{ ...styles.medicalText, marginTop: 6, fontStyle: "italic", color: "#6b7280" }}>
                  This tool is for screening only. Please consult a healthcare professional for proper diagnosis and treatment.
                </p>
              </div>
            </>
          )}

          {/* Health info links */}
          <div style={styles.linkCard}>
            <p style={styles.linkTitle}>Learn more</p>
            <a style={styles.linkItem} href="https://www.mayoclinic.org/diseases-conditions/blood-in-urine/symptoms-causes/syc-20353432" target="_blank" rel="noreferrer">
              Blood in urine (Mayo Clinic)
            </a>
            <a style={styles.linkItem} href="https://www.mayoclinic.org/symptoms/rectal-bleeding/basics/causes/sym-20050740" target="_blank" rel="noreferrer">
              Rectal bleeding (Mayo Clinic)
            </a>
          </div>

          {/* QR code */}
          <div style={styles.qrCard}>
            <div>
              <p style={styles.qrTitle}>Open HealthScan on another device</p>
              <p style={styles.qrSub}>Scan this QR code to open the app.</p>
            </div>
            {qrDataUrl && <img src={qrDataUrl} alt="HealthScan QR" style={styles.qrImage} />}
          </div>

          <div style={styles.resultActions}>
            <button style={styles.secondaryBtn} onClick={saveImage}>Save Image</button>
            <button style={styles.primaryBtn} onClick={exportScanResults}>Export Scan Results</button>
          </div>

          <div style={styles.shortcutCard}>
            <p style={styles.shortcutTitle}>iOS Scan Shortcut</p>
            <p style={styles.shortcutText}>
              Save a one-tap Home Screen shortcut that opens HealthScan directly to the scanner.
            </p>
            <a style={styles.shortcutLink} href={scanShortcutUrl}>
              Open Scan Shortcut Link
            </a>
            <p style={styles.shortcutHint}>
              Tip: In Safari, tap Share → Add to Home Screen to save this as a shortcut.
            </p>
          </div>
          <button style={styles.ghostBtn} onClick={reset}>New Scan</button>
        </div>
      )}

      {/* ── SCAN LINE ANIMATION ── */}
      <style>{`
        @keyframes scanSlide {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scan-line-anim {
          animation: scanSlide 1.2s linear infinite;
        }
        .pulser-anim {
          animation: pulse 1s ease-in-out infinite;
        }
        .fade-in {
          animation: fadeIn 0.4s ease;
        }
      `}</style>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh", background: "#0f172a", color: "#f1f5f9",
    fontFamily: "'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  toast: {
    position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
    background: "#111827ee", color: "#e2e8f0", border: "1px solid #334155",
    padding: "10px 14px", borderRadius: 10, fontSize: 12.5,
    zIndex: 50, maxWidth: 320, textAlign: "center",
    boxShadow: "0 10px 20px #0f172a88",
  },
  screen: {
    width: "100%", maxWidth: 480, minHeight: "100vh",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "40px 20px 32px", gap: 20, boxSizing: "border-box",
  },

  // HOME
  homeIcon: { marginTop: 24 },
  homeTitle: { fontSize: 32, fontWeight: 700, letterSpacing: -0.5, color: "#f8fafc", margin: 0 },
  homeSub: { fontSize: 14, color: "#64748b", textAlign: "center", margin: 0, maxWidth: 280, lineHeight: 1.5 },
  infoCard: {
    background: "#1e293b", borderRadius: 14, padding: "16px 18px",
    border: "1px solid #334155", width: "100%", boxSizing: "border-box",
  },
  infoText: { margin: 0, fontSize: 13.5, color: "#94a3b8", lineHeight: 1.6 },

  // BUTTONS
  primaryBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff",
    border: "none", borderRadius: 14, padding: "14px 32px", fontSize: 16,
    fontWeight: 600, cursor: "pointer", width: "100%", maxWidth: 320,
    boxShadow: "0 4px 20px #16a34a44", transition: "transform 0.15s, box-shadow 0.15s",
  },
  secondaryBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "#0f172a", color: "#e2e8f0",
    border: "1px solid #334155", borderRadius: 14, padding: "14px 18px",
    fontSize: 15, fontWeight: 600, cursor: "pointer", width: "100%",
  },
  ghostBtn: {
    background: "transparent", color: "#64748b", border: "1px solid #334155",
    borderRadius: 12, padding: "10px 18px", fontSize: 14, cursor: "pointer",
    width: "100%", maxWidth: 320,
  },
  cancelBtn: {
    background: "transparent", color: "#64748b", border: "1px solid #334155",
    borderRadius: 10, padding: "8px 18px", fontSize: 14, cursor: "pointer",
  },

  // CAMERA
  cameraContainer: {
    width: "100%", position: "relative", borderRadius: 16, overflow: "hidden",
    background: "#1e293b", border: "1px solid #334155", aspectRatio: "4/3",
  },
  video: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  viewfinder: { position: "absolute", inset: "12%", pointerEvents: "none" },
  corner: (pos) => {
    const base = { position: "absolute", width: 24, height: 24, borderColor: "#22c55e", borderStyle: "solid" };
    const map = {
      "top-left": { top: 0, left: 0, borderWidth: "2px 0 0 2px", borderRadius: "4px 0 0 0" },
      "top-right": { top: 0, right: 0, borderWidth: "2px 2px 0 0", borderRadius: "0 4px 0 0" },
      "bottom-left": { bottom: 0, left: 0, borderWidth: "0 0 2px 2px", borderRadius: "0 0 0 4px" },
      "bottom-right": { bottom: 0, right: 0, borderWidth: "0 2px 2px 0", borderRadius: "0 0 4px 0" },
    };
    return { ...base, ...map[pos] };
  },
  cameraHint: {
    position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
    background: "#00000099", color: "#fff", fontSize: 13, padding: "5px 14px",
    borderRadius: 20, whiteSpace: "nowrap", fontWeight: 500,
  },
  cameraActions: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 320 },
  captureBtn: {
    width: 68, height: 68, borderRadius: "50%", border: "3px solid #fff",
    background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 0 0 2px #22c55e",
  },
  captureInner: { width: 52, height: 52, borderRadius: "50%", background: "#22c55e" },

  // SCANNING
  scanPreview: { width: "100%", position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid #334155" },
  previewImg: { width: "100%", display: "block" },
  scanOverlay: { position: "absolute", inset: 0, pointerEvents: "none" },
  scanLine: {
    position: "absolute", left: 0, right: 0, height: 3,
    background: "linear-gradient(90deg, transparent, #22c55e, transparent)",
    boxShadow: "0 0 12px #22c55e88",
    animation: "scanSlide 1.2s linear infinite",
  },
  scanStatus: { display: "flex", alignItems: "center", gap: 10, marginTop: 8 },
  pulser: { width: 12, height: 12, borderRadius: "50%", background: "#22c55e", animation: "pulse 1s ease-in-out infinite" },
  scanText: { fontSize: 14, color: "#22c55e", fontWeight: 500 },

  // RESULTS
  resultsHeader: { display: "flex", alignItems: "center", width: "100%", gap: 12 },
  backBtn: { background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer", padding: 0 },
  resultsTitle: { fontSize: 16, fontWeight: 600, color: "#94a3b8" },
  resultImageWrap: { width: "100%", borderRadius: 14, overflow: "hidden", border: "1px solid #334155" },
  resultCanvas: { width: "100%", display: "block" },

  // CLEAN
  cleanCard: {
    background: "#1e293b", border: "1px solid #166534", borderRadius: 16,
    padding: "28px 24px", textAlign: "center", width: "100%", boxSizing: "border-box",
  },
  cleanIcon: { fontSize: 36, color: "#22c55e", marginBottom: 8 },
  cleanTitle: { margin: 0, fontSize: 18, fontWeight: 600, color: "#f1f5f9" },
  cleanSub: { margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 },

  // DETECTIONS
  summaryBadge: {
    background: "#1e293b", border: "1px solid", borderRadius: 10, padding: "8px 16px", width: "100%", boxSizing: "border-box",
  },
  summaryLabel: { fontSize: 14, fontWeight: 600, color: "#e2e8f0" },
  sampleType: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#0f172a", border: "1px solid #334155", borderRadius: 10,
    padding: "8px 12px", color: "#94a3b8", fontSize: 12, boxSizing: "border-box",
  },
  sampleLabel: { textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, color: "#64748b", fontSize: 10 },
  sampleValue: { fontSize: 12.5, fontWeight: 600, color: "#e2e8f0" },
  detectionList: { display: "flex", flexDirection: "column", gap: 8, width: "100%" },
  detectionCard: {
    display: "flex", alignItems: "center", gap: 12,
    background: "#1e293b", borderRadius: 10, padding: "10px 14px", border: "1px solid #334155",
  },
  findingThumb: { width: 52, height: 52, borderRadius: 8, objectFit: "cover", border: "1px solid #1f2937" },
  detectionDot: { width: 14, height: 14, borderRadius: "50%", flexShrink: 0 },
  detectionInfo: { display: "flex", flexDirection: "column", flex: 1 },
  detectionLabel: { fontSize: 14, fontWeight: 600 },
  detectionMeta: { fontSize: 11.5, color: "#64748b" },
  severityTag: { fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  resultActions: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%",
  },

  // SHORTCUT CARD
  shortcutCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "14px 16px",
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  shortcutTitle: { margin: 0, fontSize: 13, fontWeight: 700, color: "#e2e8f0" },
  shortcutText: { margin: 0, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5 },
  shortcutLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    borderRadius: 10,
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#93c5fd",
    textDecoration: "none",
    fontSize: 12.5,
    fontWeight: 600,
    width: "fit-content",
  },
  shortcutHint: { margin: 0, fontSize: 11.5, color: "#64748b" },

  // LIGHTING BAR (inside camera viewfinder)
  lightingBar: {
    position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
    background: "#00000088", borderRadius: 10, padding: "8px 14px",
    zIndex: 2, minWidth: 200, pointerEvents: "none",
  },
  lightingTrack: {
    width: "100%", height: 6, position: "relative", display: "flex", alignItems: "center",
  },
  lightingTrackBg: {
    position: "absolute", inset: 0, borderRadius: 3,
    background: "linear-gradient(90deg, #1e293b 0%, #334155 20%, #475569 50%, #334155 80%, #1e293b 100%)",
  },
  lightingFill: {
    position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 3,
    transition: "width 0.4s ease, background 0.4s ease, box-shadow 0.4s ease",
  },
  lightingThumb: {
    position: "absolute", top: -4, width: 14, height: 14, borderRadius: "50%",
    background: "#0f172a", border: "2px solid", transition: "left 0.4s ease, border-color 0.4s ease",
    zIndex: 1,
  },
  zoneMarkerLeft: {
    position: "absolute", left: 0, top: -16, fontSize: 9, color: "#64748b", fontWeight: 600, letterSpacing: 0.5,
  },
  zoneMarkerRight: {
    position: "absolute", right: 0, top: -16, fontSize: 9, color: "#64748b", fontWeight: 600, letterSpacing: 0.5,
  },
  lightingLabel: {
    fontSize: 11.5, fontWeight: 600, transition: "color 0.3s ease", letterSpacing: 0.3,
  },
  lightingWarning: {
    margin: 0, fontSize: 12.5, color: "#fbbf24", textAlign: "center",
    maxWidth: 280, lineHeight: 1.5, fontWeight: 500,
    background: "#451a0333", border: "1px solid #78350f55", borderRadius: 8,
    padding: "8px 12px",
  },

  // CAPTURE BUTTON DISABLED
  captureBtnDisabled: {
    opacity: 0.4, cursor: "not-allowed", boxShadow: "0 0 0 2px #475569",
  },

  // MEDICAL NOTE
  medicalNote: {
    background: "#1e293b", border: "1px solid #475569", borderRadius: 12,
    padding: "14px 16px", width: "100%", boxSizing: "border-box",
  },
  medicalTitle: { margin: 0, fontSize: 13, fontWeight: 600, color: "#cbd5e1" },
  medicalText: { margin: "6px 0 0", fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5 },
  linkCard: {
    background: "#0f172a", border: "1px solid #334155", borderRadius: 12,
    padding: "12px 14px", width: "100%", boxSizing: "border-box",
  },
  linkTitle: { margin: 0, fontSize: 12, fontWeight: 600, color: "#e2e8f0" },
  linkItem: {
    display: "block", marginTop: 8, fontSize: 12.5, color: "#60a5fa",
    textDecoration: "none",
  },
  qrCard: {
    background: "#1e293b", border: "1px solid #334155", borderRadius: 12,
    padding: "12px 14px", width: "100%", boxSizing: "border-box",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  qrTitle: { margin: 0, fontSize: 12.5, fontWeight: 600, color: "#e2e8f0" },
  qrSub: { margin: "6px 0 0", fontSize: 11.5, color: "#94a3b8" },
  qrImage: { width: 84, height: 84, borderRadius: 8, background: "#fff", padding: 6 },
};
