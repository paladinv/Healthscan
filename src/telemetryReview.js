const ALLOWED_EVENT_TYPES = new Set(["scan_quality", "camera_error", "analysis_error"]);
const ALLOWED_SOURCES = new Set(["camera", "photo"]);
const ALLOWED_QUALITY = new Set(["unknown", "ok", "inconclusive"]);
const ALLOWED_REASONS = new Set(["dark", "bright", "low-detail", "frame", "camera", "analysis"]);
const ENVELOPE_KEYS = new Set(["kind", "schemaVersion", "events"]);
const EVENT_KEYS = new Set(["schemaVersion", "eventType", "source", "qualityStatus", "reasonCodes"]);

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains a disallowed field: ${key}.`);
}

export function normalizeTelemetryImport(value) {
  if (!value || typeof value !== "object" || value.kind !== "healthscan-quality-telemetry" || value.schemaVersion !== 1 || !Array.isArray(value.events)) throw new Error("Telemetry file format is invalid.");
  assertAllowedKeys(value, ENVELOPE_KEYS, "Telemetry envelope");
  return value.events.map((event, index) => {
    if (!event || typeof event !== "object") throw new Error(`Telemetry event ${index + 1} is invalid.`);
    assertAllowedKeys(event, EVENT_KEYS, `Telemetry event ${index + 1}`);
    if (event.schemaVersion !== undefined && event.schemaVersion !== 1) throw new Error(`Telemetry event ${index + 1} has an unsupported schema version.`);
    if (!ALLOWED_EVENT_TYPES.has(event.eventType) || !ALLOWED_SOURCES.has(event.source) || !ALLOWED_QUALITY.has(event.qualityStatus)) throw new Error(`Telemetry event ${index + 1} has an unsupported allowlisted value.`);
    if (event.reasonCodes !== undefined && (!Array.isArray(event.reasonCodes) || event.reasonCodes.length > 4 || event.reasonCodes.some((reason) => !ALLOWED_REASONS.has(reason)))) throw new Error(`Telemetry event ${index + 1} has a disallowed reason code.`);
    const reasonCodes = [...new Set(event.reasonCodes || [])];
    return { eventType: event.eventType, source: event.source, qualityStatus: event.qualityStatus, reasonCodes };
  });
}

export function aggregateTelemetryImport(value, { minimumCount = 10 } = {}) {
  if (!Number.isInteger(minimumCount) || minimumCount < 1) throw new Error("minimumCount must be a positive integer.");
  const events = normalizeTelemetryImport(typeof value === "string" ? JSON.parse(value) : value);
  const counts = new Map();
  for (const event of events) {
    const base = { eventType: event.eventType, source: event.source, qualityStatus: event.qualityStatus };
    const dimensions = [base, ...event.reasonCodes.map((reasonCode) => ({ ...base, reasonCode }))];
    for (const dimension of dimensions) {
      const key = JSON.stringify(dimension);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const cells = [...counts.entries()]
    .filter(([, count]) => count >= minimumCount)
    .map(([dimensions, count]) => ({ dimensions: JSON.parse(dimensions), count }));
  const eventsIncludedSuppressed = events.length < minimumCount;
  return {
    kind: "healthscan-quality-telemetry-aggregate",
    schemaVersion: 1,
    minimumCount,
    eventsIncluded: eventsIncludedSuppressed ? null : events.length,
    eventsIncludedSuppressed,
    cells,
  };
}
