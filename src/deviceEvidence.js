export const REQUIRED_DEVICE_SCENARIOS = ["allow", "deny", "revoke", "background-resume", "pwa-offline", "photo-fallback"];
export const REQUIRED_ACCESSIBILITY_AUDITS = ["voiceover", "talkback"];

function hasSignedEvidence(value) {
  return typeof value?.evidenceRef === "string" && value.evidenceRef.trim()
    && typeof value?.signedBy === "string" && value.signedBy.trim()
    && typeof value?.signedAt === "string" && isIsoTimestamp(value.signedAt);
}

function isIsoTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

export function validateDeviceEvidence(value) {
  const failures = [];
  if (!value || typeof value !== "object" || value.schemaVersion !== 2 || !Array.isArray(value.runs) || !Array.isArray(value.accessibilityAudits)) return ["Device evidence must include schemaVersion 2, runs, and accessibilityAudits."];
  const seen = new Set();
  for (const run of value.runs) {
    if (!run || typeof run !== "object" || !["ios-safari", "android-chrome"].includes(run.platform) || !REQUIRED_DEVICE_SCENARIOS.includes(run.scenario) || typeof run.device !== "string" || !run.device.trim() || typeof run.osVersion !== "string" || !run.osVersion.trim() || typeof run.browserVersion !== "string" || !run.browserVersion.trim() || typeof run.tester !== "string" || !run.tester.trim() || run.outcome !== "pass" || !hasSignedEvidence(run)) {
      failures.push("Each device run needs a supported platform/scenario, device, OS/browser versions, tester, pass outcome, and signed ISO evidence.");
    } else if (seen.has(`${run.platform}:${run.scenario}`)) {
      failures.push(`${run.platform}: duplicate ${run.scenario} evidence entry`);
    } else seen.add(`${run.platform}:${run.scenario}`);
  }
  for (const platform of ["ios-safari", "android-chrome"]) for (const scenario of REQUIRED_DEVICE_SCENARIOS) if (!seen.has(`${platform}:${scenario}`)) failures.push(`${platform}: missing passing ${scenario}`);
  const auditKinds = new Set();
  for (const audit of value.accessibilityAudits) {
    if (!audit || typeof audit !== "object" || !REQUIRED_ACCESSIBILITY_AUDITS.includes(audit.kind) || typeof audit.tester !== "string" || !audit.tester.trim() || audit.outcome !== "pass" || !hasSignedEvidence(audit)) failures.push("Each VoiceOver/TalkBack audit needs a tester, pass outcome, and signed ISO evidence.");
    else auditKinds.add(audit.kind);
  }
  for (const kind of REQUIRED_ACCESSIBILITY_AUDITS) if (!auditKinds.has(kind)) failures.push(`${kind}: missing passing accessibility audit`);
  return failures;
}
