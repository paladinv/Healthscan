import { useEffect, useState } from "react";
import { normalizeAccessibilityPreferences } from "./preferences.js";

const TIMEOUTS = [0, 1, 5, 15, 30];

export default function SettingsPanel(props) {
  const { styles, t, languages, language, setLanguage, accessibilityPrefs, setAccessibilityPrefs,
    historyStatus, historyRecords, historyUnlocked, historyFormMode, setHistoryFormMode,
    historyPasscode, setHistoryPasscode, historyConfirmPasscode, setHistoryConfirmPasscode,
    historyError, historyBusy, historyResetPending, setHistoryResetPending, submitHistoryAccess,
    lockHistory, confirmResetHistory, historyTimeoutMinutes, updateHistoryTimeout, recoveryMode,
    setRecoveryMode, recoveryPassphrase, setRecoveryPassphrase, recoveryFile, setRecoveryFile,
    recoveryError, recoveryBusy, exportRecoveryBackup, importRecoveryBackup, telemetryOptIn,
    setTelemetryPreference, downloadTelemetry, refreshHistoryStatus } = props;
  const [telemetryStatus, setTelemetryStatus] = useState({ loading: true, error: null });

  useEffect(() => {
    refreshHistoryStatus();
    import("./telemetry.js").then(({ isTelemetryOptedIn }) => {
      props.setTelemetryPreferenceState?.(isTelemetryOptedIn(window.localStorage));
      setTelemetryStatus({ loading: false, error: null });
    }).catch(() => setTelemetryStatus({ loading: false, error: "Photo-free telemetry is unavailable in this browser. No events will be recorded." }));
  }, [refreshHistoryStatus]);

  const toggleTelemetry = async (enabled) => {
    try {
      await setTelemetryPreference(enabled);
      setTelemetryStatus({ loading: false, error: null });
    } catch {
      setTelemetryStatus({ loading: false, error: "Photo-free telemetry could not be changed. No events were recorded." });
    }
  };

  const exportTelemetry = async () => {
    try { await downloadTelemetry(); }
    catch { setTelemetryStatus({ loading: false, error: "Photo-free telemetry export is unavailable. No data was uploaded." }); }
  };

  return <>
    <details style={styles.privacyDetails} open>
      <summary style={styles.privacySummary}>{t("privacy")}</summary>
      <p style={styles.privacyText}>Photos are analyzed in your browser and are not uploaded by HealthScan. Saving, exporting, or sharing sends data only to the destination you choose.</p>
      <p style={styles.privacyText}>This is a screening aid, not a medical device or diagnosis. Delete downloaded files separately.</p>
    </details>
    <details style={styles.privacyDetails}>
      <summary style={styles.privacySummary}>{t("language")} &amp; {t("accessibility")}</summary>
      <label style={styles.preferenceRow}>{t("language")}
        <select value={language} onChange={(event) => setLanguage(event.target.value)} style={styles.preferenceSelect} aria-label={t("language")}>
          {languages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label style={styles.preferenceRow}>{t("textSize")}
        <select value={accessibilityPrefs.textSize} onChange={(event) => setAccessibilityPrefs((current) => normalizeAccessibilityPreferences({ ...current, textSize: event.target.value }))} style={styles.preferenceSelect}>
          <option value="normal">{t("normal")}</option><option value="large">{t("large")}</option><option value="extra-large">{t("extraLarge")}</option>
        </select>
      </label>
      <label style={styles.preferenceRow}>{t("contrast")}
        <select value={accessibilityPrefs.contrast} onChange={(event) => setAccessibilityPrefs((current) => normalizeAccessibilityPreferences({ ...current, contrast: event.target.value }))} style={styles.preferenceSelect}>
          <option value="standard">{t("standard")}</option><option value="high">{t("high")}</option>
        </select>
      </label>
    </details>
    <details style={styles.privacyDetails}>
      <summary style={styles.privacySummary}>{t("history")}{historyRecords.length ? ` (${historyRecords.length})` : ""}</summary>
      <p style={styles.privacyText}>{historyStatus.available ? t("locked") : "Encrypted history requires IndexedDB and WebCrypto in this browser."}</p>
      {!historyUnlocked && historyFormMode === "closed" && historyStatus.available && <button style={styles.secondaryBtn} onClick={() => { setHistoryFormMode(historyStatus.configured ? "unlock" : "setup"); }}>{historyStatus.configured ? t("historyUnlock") : t("historySetup")}</button>}
      {historyUnlocked && <button style={styles.clearHistoryBtn} onClick={lockHistory}>{t("historyLock")}</button>}
      {historyFormMode !== "closed" && <form onSubmit={submitHistoryAccess} style={styles.historyForm}>
        <label style={styles.formLabel}>{t("passcode")}<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={historyPasscode} onChange={(event) => setHistoryPasscode(event.target.value)} style={styles.formInput} required /></label>
        {historyFormMode === "setup" && <label style={styles.formLabel}>{t("confirmPasscode")}<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={historyConfirmPasscode} onChange={(event) => setHistoryConfirmPasscode(event.target.value)} style={styles.formInput} required /></label>}
        <p style={styles.privacyText}>{t("passcodeHint")}</p>{historyError && <p style={styles.errorText} role="alert">{historyError}</p>}
        <div style={styles.formActions}><button type="submit" style={styles.primaryBtn} disabled={historyBusy}>{historyBusy ? "…" : historyFormMode === "setup" ? t("setup") : t("unlock")}</button><button type="button" style={styles.ghostBtn} onClick={() => setHistoryFormMode("closed")}>{t("cancel")}</button></div>
      </form>}
      {historyRecords.length > 0 && <div style={styles.historyList}>{historyRecords.slice(0, 5).map((record) => <div key={record.id} style={styles.historyRow}><span>{new Date(record.timestamp).toLocaleDateString()}</span><span>{record.status}</span></div>)}</div>}
      {(historyUnlocked || historyStatus.configured) && <button style={styles.clearHistoryBtn} onClick={() => setHistoryResetPending(true)}>{t("historyReset")}</button>}
      {historyResetPending && <div style={styles.confirmCard} role="alert"><p style={styles.privacyText}>{t("deleteConfirm")}</p><div style={styles.formActions}><button style={styles.clearHistoryBtn} onClick={confirmResetHistory} disabled={historyBusy}>{t("historyReset")}</button><button style={styles.ghostBtn} onClick={() => setHistoryResetPending(false)}>{t("cancel")}</button></div></div>}
      <label style={styles.preferenceRow}>Auto-lock timeout<select value={historyTimeoutMinutes} onChange={(event) => updateHistoryTimeout(event.target.value)} style={styles.preferenceSelect}>{TIMEOUTS.map((value) => <option key={value} value={value}>{value === 0 ? "Disabled" : `${value} minute${value === 1 ? "" : "s"}`}</option>)}</select></label>
      <p style={styles.privacyText}>The key and passcode are never stored. Hidden or idle history is cleared from memory.</p>
      <p style={styles.privacyText}>History unlock uses the passcode you set. No biometric unlock is enabled.</p>
      {historyUnlocked && <>
        <button style={styles.secondaryBtn} onClick={() => setRecoveryMode(recoveryMode === "closed" ? "export" : "closed")}>Backup / restore encrypted history</button>
        {recoveryMode !== "closed" && <div style={styles.historyForm}>
          <p style={styles.privacyText}>Use a separate recovery passphrase (12–128 characters). Losing it makes the backup unrecoverable.</p>
          <input type="password" autoComplete="off" minLength={12} maxLength={128} value={recoveryPassphrase} onChange={(event) => setRecoveryPassphrase(event.target.value)} style={styles.formInput} placeholder="Recovery passphrase" />
          {recoveryMode === "import" && <input type="file" accept="application/json,.json" onChange={(event) => setRecoveryFile(event.target.files?.[0] || null)} aria-label="Choose recovery backup" />}
          {recoveryError && <p style={styles.errorText} role="alert">{recoveryError}</p>}
          <div style={styles.formActions}><button style={styles.primaryBtn} onClick={recoveryMode === "export" ? exportRecoveryBackup : importRecoveryBackup} disabled={recoveryBusy}>{recoveryBusy ? "…" : recoveryMode === "export" ? "Export backup" : "Import backup"}</button><button style={styles.ghostBtn} onClick={() => setRecoveryMode(recoveryMode === "export" ? "import" : "export")}>{recoveryMode === "export" ? "Import instead" : "Export instead"}</button></div>
        </div>}
      </>}
    </details>
    <details style={styles.privacyDetails}>
      <summary style={styles.privacySummary}>Privacy-safe quality feedback</summary>
      {telemetryStatus.error && <p style={styles.errorText} role="alert">{telemetryStatus.error}</p>}
      <label style={styles.historyToggle}><input type="checkbox" checked={telemetryOptIn} disabled={telemetryStatus.loading || Boolean(telemetryStatus.error)} onChange={(event) => toggleTelemetry(event.target.checked)} /> Opt in to local photo-free quality events</label>
      <p style={styles.privacyText}>No images, labels, results, notes, passcodes, or precise timestamps are recorded. Nothing is uploaded automatically.</p>
      {telemetryOptIn && <button style={styles.clearHistoryBtn} onClick={exportTelemetry}>Export local events</button>}
    </details>
  </>;
}
