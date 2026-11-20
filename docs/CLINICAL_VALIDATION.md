# Clinical validation pipeline

HealthScan is not clinically validated. The example data in `data/clinical/example-non-clinical.csv` is synthetic and must never be used for public accuracy claims.

## Dataset and data dictionary

Use only consented, de-identified images collected under the applicable ethics/privacy process. Keep images in the controlled external dataset repository; this app and its metrics script consume labels and predictions only.

| Field | Required values | Meaning |
| --- | --- | --- |
| `case_id` | randomized opaque ID | No names, medical record numbers, or dates of birth |
| `actual` | `positive` / `negative` | Clinician-adjudicated reference label |
| `predicted` | `positive` / `negative` / `inconclusive` | App output using a locked release build |
| `reviewer_a`, `reviewer_b` | `positive` / `negative` / `uncertain` | Independent clinician labels |
| `adjudicated` | `positive` / `negative` | Final label after predefined disagreement adjudication |

Record capture device/browser, sample context, lighting/confounder strata, and release build separately from the CSV used for metrics. Never put identifying or raw image data in this repository.

## Review and adjudication

1. Two clinicians independently label each image while blinded to the app result.
2. A disagreement is sent to a third clinician or a predefined consensus panel.
3. Lock the adjudicated label, analysis thresholds, inclusion/exclusion rules, and metric definitions before unblinding predictions.
4. Keep an audit trail of reviewer IDs, protocol version, exclusions, and adjudication decisions in the controlled study system.

## Predetermined metrics

Run `npm run clinical:metrics -- --input path/to/deidentified.csv --output path/to/metrics.json`.

- Sensitivity = TP / (TP + FN)
- Specificity = TN / (TN + FP)
- PPV = TP / (TP + FP)
- NPV = TN / (TN + FN)
- Inconclusive rate = inconclusive / all cases
- Report the point estimate and two-sided 95% Wilson confidence interval for every metric.
- Primary classification metrics exclude inconclusive predictions from their classification denominator; the inconclusive rate is reported separately and must not be hidden.

The deterministic implementation is `src/clinicalMetrics.js`; its correctness is covered by `test/clinicalMetrics.test.mjs`.

The CSV reader supports quoted fields, embedded commas, escaped quotes, and multiline quoted fields. Metrics output contains only aggregate counts and estimates; identifiers, reviewer labels, and raw records are discarded by `parseValidationCsv`.

## Capture preflight evaluation

Run `npm run preflight:metrics -- --input path/to/deidentified-preflight.csv --output path/to/preflight-metrics.json` against a separate clinician-labeled, de-identified table. The required labels are `clinician_quality=usable|unusable` and `preflight_state=ready|advisory|blocked`. The output reports false-ready, missed-usable, advisory, and advisory-unusable rates with Wilson 95% intervals overall and across the same predefined strata. `data/clinical/example-preflight-non-clinical.csv` is synthetic and cannot validate the heuristics.

Lock the preflight thresholds, clinician usability definition, exclusions, strata, and acceptance limits before evaluating real data. Report false-ready and missed-usable errors as safety-relevant outcomes. Do not describe the preflight heuristics as validated until a clinician-reviewed study has met its locked criteria.

## Stratification matrix

Predefine counts and metrics overall and by: positive/negative reference label, urine/stool/mixed context, each blood-like colour profile, lighting quality, camera/device family, iOS Safari vs Android Chrome, PWA vs browser tab, image quality bucket, and relevant confounders such as cleaning products, food/medication colour, menstrual blood, toilet material, and water colour.

Do not publish accuracy, safety, or medical-device claims until the study has been completed, reviewed, and approved for the intended population and use.
