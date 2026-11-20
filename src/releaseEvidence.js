export const REQUIRED_RELEASE_GATES = ["clinical", "security", "accessibility", "device", "performance", "locale-review"];

export function validateReleaseEvidence(value) {
  const failures = [];
  if (!value || typeof value !== "object" || value.schemaVersion !== 1 || typeof value.release !== "string" || !value.gates || typeof value.gates !== "object") {
    return ["Evidence must include schemaVersion 1, release, and gates."];
  }
  for (const gate of REQUIRED_RELEASE_GATES) {
    const evidence = value.gates[gate];
    if (!evidence || evidence.status !== "passed" || evidence.signedOff !== true) failures.push(`${gate}: status must be passed and signedOff must be true`);
    if (!evidence?.evidenceRef || typeof evidence.evidenceRef !== "string") failures.push(`${gate}: evidenceRef is required`);
    if (!evidence?.signedBy || typeof evidence.signedBy !== "string") failures.push(`${gate}: signedBy is required`);
    if (!evidence?.signedAt || Number.isNaN(Date.parse(evidence.signedAt))) failures.push(`${gate}: signedAt must be an ISO date`);
  }
  return failures;
}

export function isReleaseEvidenceReady(value) {
  return validateReleaseEvidence(value).length === 0;
}
