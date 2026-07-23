# Changelog

## 1.2.0 - 2026-07-23
- Add scan-quality gating with inconclusive results for dark, glare-heavy, or low-detail images.
- Move analysis into a testable module and Web Worker with scaled image processing.
- Add photo upload fallback, retake flow, manual sample-type correction, and native image sharing.
- Replace diagnostic-sounding result copy with screening-focused language and red-flag guidance.
- Add privacy/limitations disclosure and optional summary-only local history.
- Add accessible status messaging, focus handling, reduced-motion support, and result labels.
- Lazy-load PDF/QR dependencies and improve service-worker update handling.
- Add automated analysis tests and documentation for privacy and limitations.

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
