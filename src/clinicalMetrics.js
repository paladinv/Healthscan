export const REQUIRED_STRATA = ["device_family", "browser", "lighting", "toilet_material", "sample_type", "confounder"];
export const VALID_ACTUAL_LABELS = ["positive", "negative"];
export const VALID_PREDICTED_LABELS = ["positive", "negative", "inconclusive"];

export const CONTROLLED_STRATUM_VALUES = Object.freeze({
  device_family: ["ios", "android", "phone", "tablet", "desktop", "synthetic", "other", "unknown"],
  browser: ["ios-safari", "android-chrome", "chrome", "safari", "firefox", "edge", "synthetic", "other", "unknown"],
  lighting: ["dim", "ok", "bright", "glare", "synthetic", "other", "unknown"],
  toilet_material: ["ceramic", "porcelain", "plastic", "stainless-steel", "synthetic", "other", "unknown"],
  sample_type: ["urine", "stool", "mixed", "synthetic", "other", "unknown"],
  confounder: ["none", "cleaner", "food-coloring", "medication-color", "menstrual-blood", "glare", "synthetic", "other", "unknown"],
});

const STRATUM_ALIASES = {
  device_family: { iphone: "ios", ipad: "tablet", "android-phone": "android", "android-tablet": "tablet", mobile: "phone", smartphone: "phone" },
  browser: { "ios safari": "ios-safari", "android chrome": "android-chrome", chromium: "chrome" },
  lighting: { dark: "dim", normal: "ok", good: "ok", overexposed: "bright" },
  toilet_material: { steel: "stainless-steel", "stainless steel": "stainless-steel" },
  sample_type: { urine: "urine", stool: "stool", "urine/stool": "mixed" },
  confounder: { "food coloring": "food-coloring", "medication color": "medication-color", "menstrual blood": "menstrual-blood" },
};

function normalizedToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, " ");
}

export function normalizeStratumValue(stratum, value) {
  if (!Object.hasOwn(CONTROLLED_STRATUM_VALUES, stratum)) return "unknown";
  const token = normalizedToken(value);
  if (!token) return "unknown";
  const candidate = STRATUM_ALIASES[stratum]?.[token] || token.replaceAll(" ", "-");
  return CONTROLLED_STRATUM_VALUES[stratum].includes(candidate) ? candidate : "other";
}

export function wilsonInterval(successes, trials, z = 1.96) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || trials < 0 || successes < 0 || successes > trials) throw new Error("Invalid binomial counts.");
  if (trials === 0) return { estimate: null, lower: null, upper: null };
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const spread = (z / denominator) * Math.sqrt((p * (1 - p) / trials) + (z * z / (4 * trials * trials)));
  return { estimate: p, lower: Math.max(0, center - spread), upper: Math.min(1, center + spread) };
}

function validatePredictionRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("At least one validation row is required.");
  rows.forEach((row, index) => {
    const actual = row.actual ?? row.reference;
    const predicted = row.predicted ?? row.prediction;
    if (!VALID_ACTUAL_LABELS.includes(actual) || !VALID_PREDICTED_LABELS.includes(predicted)) throw new Error(`Invalid label at row ${index + 1}.`);
  });
}

function calculateMetricsForRows(rows) {
  const counts = { tp: 0, tn: 0, fp: 0, fn: 0, inconclusive: 0, total: rows.length };
  rows.forEach((row) => {
    const actual = row.actual ?? row.reference;
    const predicted = row.predicted ?? row.prediction;
    if (predicted === "inconclusive") { counts.inconclusive++; return; }
    if (actual === "positive" && predicted === "positive") counts.tp++;
    if (actual === "negative" && predicted === "negative") counts.tn++;
    if (actual === "negative" && predicted === "positive") counts.fp++;
    if (actual === "positive" && predicted === "negative") counts.fn++;
  });
  const metric = (successes, trials) => wilsonInterval(successes, trials);
  return {
    counts,
    sensitivity: metric(counts.tp, counts.tp + counts.fn),
    specificity: metric(counts.tn, counts.tn + counts.fp),
    ppv: metric(counts.tp, counts.tp + counts.fp),
    npv: metric(counts.tn, counts.tn + counts.fn),
    inconclusiveRate: metric(counts.inconclusive, counts.total),
    determinateRate: metric(counts.total - counts.inconclusive, counts.total),
  };
}

function groupRows(rows, strata) {
  const grouped = {};
  for (const stratum of strata) {
    grouped[stratum] = new Map();
    for (const row of rows) {
      const value = normalizeStratumValue(stratum, row[stratum]);
      if (!grouped[stratum].has(value)) grouped[stratum].set(value, []);
      grouped[stratum].get(value).push(row);
    }
  }
  return grouped;
}

export function calculateClinicalMetrics(rows, { strata = REQUIRED_STRATA } = {}) {
  validatePredictionRows(rows);
  const overall = calculateMetricsForRows(rows);
  const stratified = {};
  for (const [stratum, groups] of Object.entries(groupRows(rows, strata))) {
    stratified[stratum] = {};
    for (const [value, group] of groups.entries()) stratified[stratum][value] = calculateMetricsForRows(group);
  }
  return {
    ...overall,
    overall,
    stratified,
    strata: [...strata],
    methodology: "Wilson 95% confidence intervals; classification metrics exclude inconclusive predictions and report them separately. Outputs contain aggregate counts only and omit case identifiers and row-level content.",
  };
}

export function parseCsv(csv) {
  const text = String(csv).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const finishField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
  };

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (afterQuote) {
      if (character === " " || character === "\t") continue;
      if (character === ",") finishField();
      else if (character === "\n" || character === "\r") {
        finishField();
        if (character === "\r" && text[index + 1] === "\n") index++;
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
      } else throw new Error("Malformed CSV: unexpected content after a quoted field.");
    } else if (character === '"' && field.length === 0) { quoted = true; }
    else if (character === ",") finishField();
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index++;
      finishField();
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += character;
    if (!quoted && !afterQuote && character === '"') afterQuote = true;
  }
  if (quoted) throw new Error("Malformed CSV: unterminated quoted field.");
  if (field.length || row.length || afterQuote) { finishField(); if (row.some((value) => value !== "")) rows.push(row); }
  return rows;
}

export function parseValidationCsv(csv) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error("CSV must include a header and at least one row.");
  const headers = rows[0].map((value) => value.trim());
  if (headers.some((header) => !header)) throw new Error("CSV headers cannot be empty.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique.");
  const actualIndex = headers.indexOf("actual");
  const predictedIndex = headers.indexOf("predicted");
  if (actualIndex < 0 || predictedIndex < 0) throw new Error("CSV must include actual,predicted columns.");
  return rows.slice(1).map((values, rowIndex) => {
    if (values.length > headers.length) throw new Error(`CSV row ${rowIndex + 2} has too many fields.`);
    const result = { actual: values[actualIndex]?.trim(), predicted: values[predictedIndex]?.trim() };
    for (const stratum of REQUIRED_STRATA) {
      const index = headers.indexOf(stratum);
      if (index >= 0) result[stratum] = normalizeStratumValue(stratum, values[index]);
    }
    return result;
  });
}
