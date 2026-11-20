# Changelog

## Unreleased
- Add stratified clinical and preflight metrics with quoted CSV parsing, Wilson intervals, and synthetic-only fixtures.
- Make device and accessibility evidence validation fail closed on missing pass outcomes, tester metadata, supported platforms, or UTC ISO timestamps.
- Add locale key coverage and clinician-review evidence checks; all current locales remain pending review.
- Add strict offline telemetry aggregation with allowlisted fields and k=10 suppression by default.
- Add deterministic initial-entry and analysis-worker gzip budgets to `release:check`.
- Remove capability-only platform-authenticator status; history unlock is explicitly passcode-only.

## 1.2.2 - 2026-07-27
- Replace the fixed capture region with an adjustable oval that is carried through worker and fallback analysis.
- Add opt-in, photo-free scan-quality feedback export; feedback is not uploaded by the app.
- Document clinical validation, real-device camera, VoiceOver/TalkBack, and encrypted-history release gates.
- Refresh the service-worker cache for the updated release.

## 1.2.0 - 2026-07-23
- Add scan-quality gating with inconclusive results for dark, glare-heavy, or low-detail images.
- Move analysis into a testable module and Web Worker with scaled image processing.
- Add photo upload fallback, retake flow, manual sample-type correction, and native image sharing.
- Replace diagnostic-sounding result copy with screening-focused language and red-flag guidance.
- Add privacy/limitations disclosure and optional summary-only local history.
- Add accessible status messaging, focus handling, reduced-motion support, and result labels.
- Lazy-load PDF/QR dependencies and improve service-worker update handling.
- Add automated analysis tests and documentation for privacy and limitations.

## 1.2.1 - 2026-07-24
- Remove the duplicate in-component classifier so the worker and fallback always use one source of truth.
- Add an oval capture guide that matches the analysis region and a lightweight blur/detail quality check.
- Refresh the service-worker cache for the updated release.

## 1.1.0 - 2026-02-03
- Limit blood analysis to the toilet bowl area to reduce false positives.
- Detect urine/stool presence and handle mixed samples.
- Add minimum blood pixel thresholds to suppress noise.
- Add finding thumbnails with larger crop padding.
- Fix camera playback handling for `video.play()` failures.
- Add `roundRect` fallback for Safari when rendering labels on canvas.
- Clean up scan-time async work to avoid state updates after unmount.
- Add `Save Image` and `Export Scan Results` actions.
- Export a Scan Results PDF that mirrors the app layout.
- Add working QR code generation for app sharing.
- Include Mayo Clinic links for blood in urine and rectal bleeding.
- Update documentation to reflect detection and export changes.

## 1.0.0 - 2026-01-20
- Initial release with camera capture, blood detection, and PWA support.
