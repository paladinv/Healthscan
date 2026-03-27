# Changelog

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
