import { STRINGS } from "../src/i18n.js";
import { TRANSLATION_REVIEW_REGISTRY, validateTranslationRegistry } from "../src/translationRegistry.js";

const failures = validateTranslationRegistry(STRINGS, TRANSLATION_REVIEW_REGISTRY);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exitCode = 1; }
else console.log("Translation completeness passed. Clinician review remains pending for draft locales.");
