import test from "node:test";
import assert from "node:assert/strict";
import { calculateClinicalMetrics, normalizeStratumValue, parseValidationCsv } from "../src/clinicalMetrics.js";
import { calculatePreflightMetrics, parsePreflightCsv } from "../src/preflightMetrics.js";
import { aggregateTelemetryImport } from "../src/telemetryReview.js";
import { validateTranslationRegistry } from "../src/translationRegistry.js";
import { REQUIRED_ACCESSIBILITY_AUDITS, REQUIRED_DEVICE_SCENARIOS, validateDeviceEvidence } from "../src/deviceEvidence.js";
import { HISTORICAL_INITIAL_ENTRY_GZIP_BYTES, PERFORMANCE_BUDGETS } from "../scripts/performance-check.mjs";
import { REQUIRED_RELEASE_GATES, validateReleaseEvidence } from "../src/releaseEvidence.js";

test("parses quoted commas, escaped quotes, multiline fields, and omits identifiers from metrics", () => {
  const rows = parseValidationCsv([
    'case_id,actual,predicted,device_family,browser,lighting,toilet_material,sample_type,confounder,reviewer_a',
    'EX-1,positive,positive,"Phone, synthetic","Browser ""A""",ok,ceramic,urine,"none\ncontrolled",positive',
    'EX-2,negative,inconclusive,phone,browser,dim,plastic,stool,none,negative',
  ].join("\n"));
  assert.equal(rows[0].device_family, "other");
  assert.equal(rows[0].browser, "other");
  assert.equal(rows[0].confounder, "other");
  const metrics = calculateClinicalMetrics(rows);
  assert.equal(metrics.stratified.device_family.other.counts.total, 1);
  assert.equal(normalizeStratumValue("device_family", "patient-identifier-123"), "other");
  assert.doesNotMatch(JSON.stringify(metrics), /EX-1|reviewer_a/);
});

test("rejects malformed or ambiguous validation CSV input", () => {
  assert.throws(() => parseValidationCsv("actual,predicted,actual\npositive,positive,positive\n"), /unique/);
  assert.throws(() => parseValidationCsv('actual,predicted\n"positive,positive\n'), /unterminated/);
  assert.throws(() => parseValidationCsv("actual,predicted\npositive,positive,extra\n"), /too many/);
});

test("reports preflight rates overall and by stratum", () => {
  const rows = parsePreflightCsv([
    "clinician_quality,preflight_state,lighting,device_family",
    "usable,ready,ok,phone",
    "unusable,ready,ok,phone",
    "usable,blocked,dim,tablet",
    "unusable,advisory,bright,tablet",
  ].join("\n"), (value) => value.split("\n").map((line) => line.split(",")));
  const metrics = calculatePreflightMetrics(rows);
  assert.equal(metrics.overall.counts.falseReady, 1);
  assert.equal(metrics.overall.counts.missedUsable, 1);
  assert.equal(metrics.overall.advisoryRate.estimate, 0.25);
  assert.equal(metrics.stratified.device_family.tablet.counts.total, 2);
  const rawValueMetrics = calculatePreflightMetrics([{ clinician_quality: "usable", preflight_state: "ready", device_family: "patient-identifier-123" }]);
  assert.equal(rawValueMetrics.stratified.device_family.other.counts.total, 1);
  assert.equal(rawValueMetrics.stratified.device_family["patient-identifier-123"], undefined);
});

test("telemetry aggregation rejects identifiers and suppresses small cells", () => {
  const events = Array.from({ length: 10 }, () => ({ eventType: "scan_quality", source: "camera", qualityStatus: "ok", reasonCodes: [] }));
  const result = aggregateTelemetryImport({ kind: "healthscan-quality-telemetry", schemaVersion: 1, events }, { minimumCount: 10 });
  assert.equal(result.cells.length, 1);
  assert.equal(result.cells[0].count, 10);
  const small = aggregateTelemetryImport({ kind: "healthscan-quality-telemetry", schemaVersion: 1, events: events.slice(0, 9) });
  assert.equal(small.eventsIncluded, null);
  assert.equal(small.eventsIncludedSuppressed, true);
  assert.throws(() => aggregateTelemetryImport({ kind: "healthscan-quality-telemetry", schemaVersion: 1, events: [{ eventType: "scan_quality", source: "camera", qualityStatus: "ok", userId: "secret" }] }), /disallowed field/);
  assert.throws(() => aggregateTelemetryImport({ kind: "healthscan-quality-telemetry", schemaVersion: 1, events: [{ eventType: "scan_quality", source: "camera", qualityStatus: "ok", reasonCodes: ["secret"] }] }), /disallowed reason/);
});

test("translation review requires complete keys and signed clinician evidence", () => {
  const strings = { en: { urgentTitle: "Urgent", nonDiagnostic: "No diagnosis", urgentCopy: "Seek care", start: "Start" }, es: { urgentTitle: "Urgente", nonDiagnostic: "No diagnóstico", urgentCopy: "Busque atención", start: "Iniciar" } };
  const registry = { en: { status: "pending", clinicianReviewed: false }, es: { status: "pending", clinicianReviewed: false } };
  assert.deepEqual(validateTranslationRegistry(strings, registry), []);
  assert.ok(validateTranslationRegistry({ ...strings, es: { urgentTitle: "Urgente" } }, registry).some((failure) => failure.includes("missing translation key")));
  assert.ok(validateTranslationRegistry(strings, { ...registry, es: { status: "reviewed", clinicianReviewed: true } }).some((failure) => failure.includes("signed ISO timestamp")));
});

test("device evidence requires passing signed runs for both supported platforms and accessibility audits", () => {
  const evidence = {
    schemaVersion: 2,
    runs: ["ios-safari", "android-chrome"].flatMap((platform) => REQUIRED_DEVICE_SCENARIOS.map((scenario) => ({ platform, scenario, device: "device", osVersion: "1", browserVersion: "1", tester: "tester", outcome: "pass", evidenceRef: "lab/run-1", signedBy: "reviewer", signedAt: "2026-11-19T12:00:00.000Z" }))),
    accessibilityAudits: REQUIRED_ACCESSIBILITY_AUDITS.map((kind) => ({ kind, tester: "tester", outcome: "pass", evidenceRef: "lab/a11y-1", signedBy: "reviewer", signedAt: "2026-11-19T12:00:00.000Z" })),
  };
  assert.deepEqual(validateDeviceEvidence(evidence), []);
  assert.ok(validateDeviceEvidence({ ...evidence, runs: evidence.runs.map((run) => ({ ...run, tester: "" })) }).some((failure) => failure.includes("tester")));
  assert.ok(validateDeviceEvidence({ ...evidence, accessibilityAudits: evidence.accessibilityAudits.map((audit) => ({ ...audit, signedAt: "2026-11-19" })) }).some((failure) => failure.includes("ISO")));
});

test("performance budgets are explicit and retain the historical baseline in the report contract", () => {
  assert.ok(PERFORMANCE_BUDGETS.initialEntryGzipBytes > HISTORICAL_INITIAL_ENTRY_GZIP_BYTES);
  assert.ok(PERFORMANCE_BUDGETS.workerGzipBytes > 0);
});

test("locale review is a required signed release gate", () => {
  assert.ok(REQUIRED_RELEASE_GATES.includes("locale-review"));
  const gates = Object.fromEntries(REQUIRED_RELEASE_GATES.map((gate) => [gate, { status: "pending", signedOff: false, evidenceRef: "", signedBy: "", signedAt: "" }]));
  assert.ok(validateReleaseEvidence({ schemaVersion: 1, release: "example", gates }).some((failure) => failure.startsWith("locale-review:")));
});
