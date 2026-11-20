export const TRANSLATION_REVIEW_REGISTRY = {
  en: { status: "pending", localeRole: "source", clinicianReviewed: false, reviewer: null, evidenceRef: null, signedAt: null },
  es: { status: "pending", localeRole: "translation", clinicianReviewed: false, reviewer: null, evidenceRef: null, signedAt: null },
  fr: { status: "pending", localeRole: "draft", clinicianReviewed: false, reviewer: null, evidenceRef: null, signedAt: null },
};

export const REQUIRED_URGENT_KEYS = ["nonDiagnostic", "urgentTitle", "urgentCopy"];

export const REGIONAL_RESOURCES = {
  default: { label: "Local emergency services", kind: "generic", instructionKey: "urgentCopy" },
  en: { label: "Local emergency services", kind: "generic", instructionKey: "urgentCopy" },
  es: { label: "Servicios de emergencia locales", kind: "generic", instructionKey: "urgentCopy" },
  fr: { label: "Services d’urgence locaux", kind: "generic", instructionKey: "urgentCopy" },
};

export function validateTranslationRegistry(strings, registry = TRANSLATION_REVIEW_REGISTRY) {
  const failures = [];
  const source = strings?.en;
  if (!source || typeof source !== "object") return ["en: source locale is missing."];
  const sourceKeys = Object.keys(source).sort();
  for (const [locale, metadata] of Object.entries(registry)) {
    if (!strings?.[locale]) { failures.push(`${locale}: translation is missing`); continue; }
    const localeKeys = Object.keys(strings[locale]).sort();
    for (const key of sourceKeys) if (typeof strings[locale][key] !== "string" || !strings[locale][key].trim()) failures.push(`${locale}: missing translation key ${key}`);
    for (const key of REQUIRED_URGENT_KEYS) if (typeof strings[locale][key] !== "string" || !strings[locale][key].trim()) failures.push(`${locale}: missing urgent-care key ${key}`);
    for (const key of localeKeys) if (!sourceKeys.includes(key)) failures.push(`${locale}: unknown translation key ${key}`);
    if (!metadata) { failures.push(`${locale}: review metadata is missing`); continue; }
    if (!["pending", "reviewed"].includes(metadata.status)) failures.push(`${locale}: status must be pending or reviewed`);
    if (metadata.clinicianReviewed === true && (metadata.status !== "reviewed" || !metadata.evidenceRef || !metadata.reviewer || !isIsoTimestamp(metadata.signedAt))) failures.push(`${locale}: clinician review requires reviewed status, reviewer, evidenceRef, and signed ISO timestamp`);
    if (metadata.status === "reviewed" && metadata.clinicianReviewed !== true) failures.push(`${locale}: reviewed status requires clinicianReviewed=true`);
    if (!REGIONAL_RESOURCES[locale] && !REGIONAL_RESOURCES.default) failures.push(`${locale}: regional resource fallback is missing`);
  }
  return failures;
}

function isIsoTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}
