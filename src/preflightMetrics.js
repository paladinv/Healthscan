import { normalizeStratumValue, REQUIRED_STRATA, wilsonInterval } from "./clinicalMetrics.js";

const QUALITY_LABELS = new Set(["usable", "unusable"]);
const PREFLIGHT_STATES = new Set(["ready", "advisory", "blocked"]);
const metric = (successes, trials) => wilsonInterval(successes, trials);

function calculateRows(rows) {
  const counts = { total: rows.length, usable: 0, unusable: 0, ready: 0, advisory: 0, blocked: 0, falseReady: 0, missedUsable: 0, advisoryUnusable: 0 };
  for (const row of rows) {
    counts[row.clinician_quality]++;
    counts[row.preflight_state]++;
    if (row.preflight_state === "ready" && row.clinician_quality === "unusable") counts.falseReady++;
    if (row.preflight_state === "blocked" && row.clinician_quality === "usable") counts.missedUsable++;
    if (row.preflight_state === "advisory" && row.clinician_quality === "unusable") counts.advisoryUnusable++;
  }
  return {
    counts,
    falseReadyRate: metric(counts.falseReady, counts.ready),
    missedUsableRate: metric(counts.missedUsable, counts.usable),
    advisoryRate: metric(counts.advisory, counts.total),
    advisoryUnusableRate: metric(counts.advisoryUnusable, counts.advisory),
  };
}

export function calculatePreflightMetrics(rows, { strata = REQUIRED_STRATA } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("At least one preflight evaluation row is required.");
  rows.forEach((row, index) => { if (!QUALITY_LABELS.has(row.clinician_quality) || !PREFLIGHT_STATES.has(row.preflight_state)) throw new Error(`Invalid preflight label at row ${index + 1}.`); });
  const stratified = {};
  for (const stratum of strata) {
    const groups = {};
    for (const row of rows) {
      const value = normalizeStratumValue(stratum, row[stratum]);
      (groups[value] ||= []).push(row);
    }
    stratified[stratum] = Object.fromEntries(Object.entries(groups).map(([value, group]) => [value, calculateRows(group)]));
  }
  return { overall: calculateRows(rows), stratified, strata: [...strata], methodology: "Aggregate preflight evaluation only; outputs omit IDs, images, and row-level content." };
}

export function parsePreflightCsv(csv, parseCsv) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error("CSV must include a header and at least one row.");
  const headers = rows[0].map((value) => value.trim());
  const qualityIndex = headers.indexOf("clinician_quality");
  const stateIndex = headers.indexOf("preflight_state");
  if (qualityIndex < 0 || stateIndex < 0) throw new Error("CSV must include clinician_quality,preflight_state columns.");
  return rows.slice(1).map((values) => {
    const result = { clinician_quality: values[qualityIndex]?.trim(), preflight_state: values[stateIndex]?.trim() };
    for (const stratum of REQUIRED_STRATA) { const index = headers.indexOf(stratum); if (index >= 0) result[stratum] = normalizeStratumValue(stratum, values[index]); }
    return result;
  });
}
