import { useEffect, useState } from 'react';
import type { FirstDayOfWeek, ThemeMode } from '../shared/settings';
import { useSettings } from '../shared/settingsStore';
import { testErpConnection, fetchSampleFields } from '../erpnext';
import {
  APP_TARGET_FIELDS,
  loadErpFieldMapping,
  saveErpFieldMapping,
  type ErpFieldMapping,
} from '../erpFieldMapping';
import { Hint } from '../shared/help/Hint';
import { useTheme } from '../shared/themeStore';
import { SKINS, type Skin } from '../shared/theme';

const NOT_MAPPED = '';

export function SettingsPage() {
  const [settings, update] = useSettings();
  const [skin, setSkin] = useTheme();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Sample fields + mapping are keyed off the current DocType. Switching
  // DocType reloads its own saved mapping and clears the loaded field list
  // (a sample from a different DocType would be meaningless here).
  const [sampleFields, setSampleFields] = useState<string[]>([]);
  const [sampleRecordName, setSampleRecordName] = useState<string | null>(null);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldsResult, setFieldsResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [mapping, setMapping] = useState<ErpFieldMapping>(() =>
    loadErpFieldMapping(settings.erpDocType),
  );

  useEffect(() => {
    setMapping(loadErpFieldMapping(settings.erpDocType));
    setSampleFields([]);
    setSampleRecordName(null);
    setFieldsResult(null);
    // Only re-run when the DocType itself changes, not on every settings edit.
  }, [settings.erpDocType]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testErpConnection(settings);
    setTestResult(result);
    setTesting(false);
  };

  const handleLoadFields = async () => {
    setLoadingFields(true);
    setFieldsResult(null);
    const result = await fetchSampleFields(settings, settings.erpDocType);
    if (result.ok && result.data) {
      setSampleFields(result.data.fields);
      setSampleRecordName(result.data.recordName);
    } else {
      setSampleFields([]);
      setSampleRecordName(null);
    }
    setFieldsResult({ ok: result.ok, message: result.message });
    setLoadingFields(false);
  };

  const handleMapField = (appField: string, erpField: string) => {
    const next: ErpFieldMapping = {
      ...mapping,
      [appField]: erpField === NOT_MAPPED ? null : erpField,
    };
    setMapping(next);
    saveErpFieldMapping(settings.erpDocType, next);
  };

  return (
    <div className="panel settings">
      <h2>Settings</h2>

      <div className="banner banner--warn" role="note">
        <strong>Security:</strong> storing the ERPNext API secret in the browser
        is acceptable only for internal dev use in a Codespace. Do not deploy
        this to a shared or public URL with the secret in localStorage. For
        production, move ERPNext calls behind a thin server-side proxy so the
        secret never reaches the browser.
      </div>

      <h3>ERPNext</h3>
      <div className="field">
        <label htmlFor="erpBaseUrl">Base URL</label>
        <input
          id="erpBaseUrl"
          value={settings.erpBaseUrl}
          onChange={(e) => update({ erpBaseUrl: e.target.value })}
          placeholder="https://erp.unitedceres.edu.sg"
        />
        <p className="hint">
          In dev, requests avoid CORS by going same-origin through the Vite
          proxy (<code>/erp</code> → the server in <code>vite.config.ts</code>);
          this URL is used by production builds.
        </p>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="erpApiKey">API key</label>
          <input
            id="erpApiKey"
            value={settings.erpApiKey}
            onChange={(e) => update({ erpApiKey: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="erpApiSecret">API secret</label>
          <input
            id="erpApiSecret"
            type="password"
            value={settings.erpApiSecret}
            onChange={(e) => update({ erpApiSecret: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="erpDocType">DocType to import from</label>
        <input
          id="erpDocType"
          value={settings.erpDocType}
          onChange={(e) => update({ erpDocType: e.target.value })}
          placeholder="e.g. Course"
        />
      </div>
      <div className="actions">
        <button className="btn" onClick={handleTest} disabled={testing}>
          {testing ? 'Testing…' : 'Test ERPNext connection'}
        </button>
        <button
          className="btn"
          onClick={handleLoadFields}
          disabled={loadingFields || !settings.erpDocType.trim()}
        >
          {loadingFields ? 'Loading…' : 'Load sample fields'}
        </button>
      </div>
      {testResult && (
        <div
          className={`banner ${testResult.ok ? 'banner--ok' : 'banner--error'}`}
          role="status"
        >
          {testResult.message}
        </div>
      )}
      {fieldsResult && (
        <div
          className={`banner ${fieldsResult.ok ? 'banner--ok' : 'banner--error'}`}
          role="status"
        >
          {fieldsResult.message}
        </div>
      )}

      <div className="erp-mapping">
        <p className="erp-mapping__title">Field mapping</p>
        <Hint text="Left is the field name in ERPNext. Right is where it goes in this app. Load a sample record first to see your field names." />
        {sampleRecordName && (
          <p className="hint">Sample fields loaded from record "{sampleRecordName}".</p>
        )}
        {sampleFields.length === 0 && (
          <p className="hint">Load sample fields first to populate the dropdowns.</p>
        )}
        <div className="erp-mapping__head">
          <span>ERPNext field</span>
          <span aria-hidden="true" />
          <span>App field</span>
        </div>
        {APP_TARGET_FIELDS.map(({ key, label }) => (
          <div className="erp-mapping__row" key={key}>
            <select
              aria-label={`ERPNext field mapped to ${label}`}
              value={mapping[key] ?? NOT_MAPPED}
              onChange={(e) => handleMapField(key, e.target.value)}
              disabled={sampleFields.length === 0}
            >
              <option value={NOT_MAPPED}>— not mapped —</option>
              {sampleFields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <span className="erp-mapping__arrow" aria-hidden="true">
              →
            </span>
            <span className="erp-mapping__target">{label}</span>
          </div>
        ))}
        <p className="hint">Lesson names are entered manually.</p>
      </div>

      <h3 className="settings__subhead">Google</h3>
      <div className="field">
        <label htmlFor="googleClientId">OAuth client ID</label>
        <input
          id="googleClientId"
          value={settings.googleClientId}
          onChange={(e) => update({ googleClientId: e.target.value })}
          placeholder="xxxxxxxx.apps.googleusercontent.com"
        />
        <p className="field__help">
          Web-application OAuth client ID with the Google Sheets API enabled. Its
          Authorised JavaScript origin must equal this app's forwarded Codespace
          URL — Codespace URLs can change per session, so pin the port to a stable
          URL or update the origin when it changes. Without a client ID, use CSV
          export and import it into Google Sheets manually.
        </p>
      </div>

      <h3 className="settings__subhead">Changelog</h3>
      <div className="field">
        <label htmlFor="repoUrl">GitHub repository URL</label>
        <input
          id="repoUrl"
          value={settings.repoUrl}
          onChange={(e) => update({ repoUrl: e.target.value })}
          placeholder="https://github.com/owner/repo"
        />
        <p className="field__help">
          Optional. When set, each commit in the Changelog links to
          <code> {'{repo}'}/commit/{'{hash}'}</code> on GitHub.
        </p>
      </div>

      <h3 className="settings__subhead">Calendar</h3>
      <div className="field">
        <label>First day of week</label>
        <div className="radio-row">
          {(['monday', 'sunday'] as FirstDayOfWeek[]).map((day) => (
            <label className="radio" key={day}>
              <input
                type="radio"
                name="firstDayOfWeek"
                checked={settings.firstDayOfWeek === day}
                onChange={() => update({ firstDayOfWeek: day })}
              />
              {day === 'monday' ? 'Monday' : 'Sunday'}
            </label>
          ))}
        </div>
      </div>

      <h3 className="settings__subhead">Appearance</h3>
      <div className="field">
        <label htmlFor="workspaceTheme">Theme</label>
        <select
          id="workspaceTheme"
          value={skin}
          onChange={(e) => setSkin(e.target.value as Skin)}
        >
          {SKINS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Hint text={SKINS.find((s) => s.value === skin)?.hint ?? ''} />
        <p className="field__help">
          Restyles the whole workspace and every tracker instantly. Applies
          across light and dark; Retro LCD and Y2K Pop keep their own fixed
          palette. Remembered on this device.
        </p>
      </div>
      <div className="field">
        <label>Colour mode</label>
        <div className="radio-row">
          {(
            [
              ['system', 'System'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ] as [ThemeMode, string][]
          ).map(([mode, label]) => (
            <label className="radio" key={mode}>
              <input
                type="radio"
                name="colourMode"
                checked={settings.theme === mode}
                onChange={() => update({ theme: mode })}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="field__help">
          System follows your operating-system preference; Light and Dark force
          the mode. Classic follows this; the other themes pin their palette.
        </p>
      </div>

      <p className="settings__saved">Changes are saved automatically.</p>
    </div>
  );
}
