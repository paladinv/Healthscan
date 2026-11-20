# HealthScan release checklist

The static check (`npm run release:check`) verifies repository readiness only. It does not simulate camera permissions or claim real-device coverage.

## Clinical and product gate

- [ ] Clinician-reviewed, consented, de-identified validation dataset completed.
- [ ] Dual review, adjudication, inclusion/exclusion rules, and thresholds locked before unblinding.
- [ ] Sensitivity, specificity, PPV, NPV, inconclusive rate, and Wilson 95% CIs reported overall and by the predefined strata.
- [ ] Preflight false-ready, missed-usable, advisory, and advisory-unusable rates reported overall and by the predefined strata.
- [ ] No medical positioning or accuracy claim is published before clinician/regulatory review.
- [ ] Non-diagnostic urgent-care copy reviewed for each supported locale.
- [ ] Every supported locale has complete keys and a clinician reviewer, evidence reference, and signed UTC timestamp recorded in the locale-review release gate.

## iOS Safari device lab

- [ ] First-time camera allow works.
- [ ] Deny, revoke in Settings, and retry flows are understandable.
- [ ] Rear camera preview, framing controls, preflight warnings, and capture work.
- [ ] Background/resume stops and safely restarts camera tracks.
- [ ] Home Screen PWA launch, offline reload after first visit, photo fallback, exports, and share behavior work.
- [ ] VoiceOver announces headings, checklist state, sliders, results, errors, and focus transitions.
- [ ] Every evidence row records the exact device, OS/browser versions, tester, evidence reference, and UTC ISO timestamp.

## Android Chrome device lab

- [ ] First-time camera allow works.
- [ ] Deny, revoke in site settings, and retry flows are understandable.
- [ ] Rear camera preview, framing controls, preflight warnings, and capture work.
- [ ] Background/resume stops and safely restarts camera tracks.
- [ ] Installed PWA launch, offline reload after first visit, photo fallback, exports, and share behavior work.
- [ ] TalkBack announces headings, checklist state, sliders, results, errors, and focus transitions.
- [ ] Every evidence row records the exact device, OS/browser versions, tester, evidence reference, and UTC ISO timestamp.

## Privacy and security

- [ ] Encrypted history setup, unlock, lock, migration, wrong-passcode, unavailable-WebCrypto, and reset flows tested.
- [ ] No passcode, derived key, or scan image is persisted.
- [ ] Legacy plaintext history is removed only after successful encrypted writes.
- [ ] Reset confirmation and deletion behavior are documented.
- [ ] Storage contents are treated as untrusted and malformed records are ignored safely.
- [ ] Photo-free feedback contains no image, timestamp, sample type, detection, or health result.

## Accessibility, performance, and regression

- [ ] Normal/large/extra-large text and standard/high contrast settings work with keyboard and assistive technology.
- [ ] Results communicate meaning with text and status, not color alone.
- [ ] `npm test`, `npm run build`, and `npm run release:check` pass.
- [ ] Scan processing remains in the worker where available; benchmark scan latency and bundle size against the prior release.
- [ ] Browser smoke test has no uncaught console errors.
- [ ] `npm run performance:check` passes after `npm run build`; the report records the residual delta from the 60.49 KiB historical entry baseline.
- [ ] `npm run translation:check` passes and every non-source locale has clinician review evidence before public medical positioning.
- [ ] `npm run telemetry:aggregate` is run only on user-exported JSON and retains no row-level events or identifiers.
