import { useState } from 'react';
import type { FirstDayOfWeek } from '../settings';
import { useSettings } from '../settingsStore';
import { testErpConnection } from '../erpnext';

export function SettingsPage() {
  const [settings, update] = useSettings();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testErpConnection(settings);
    setTestResult(result);
    setTesting(false);
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
          placeholder="e.g. Course Schedule"
        />
      </div>
      <div className="actions">
        <button className="btn" onClick={handleTest} disabled={testing}>
          {testing ? 'Testing…' : 'Test ERPNext connection'}
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

      <p className="settings__saved">Changes are saved automatically.</p>
    </div>
  );
}
