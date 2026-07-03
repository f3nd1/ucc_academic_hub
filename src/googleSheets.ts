import type { Course, ScheduledLesson } from './types';
import { DATA_COLUMN_HEADERS, dataRowFor } from './exports';

// Minimal typings for the Google Identity Services token client. GIS is loaded
// from https://accounts.google.com/gsi/client at runtime (no npm package).
interface TokenResponse {
  access_token?: string;
  error?: string;
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}
interface GoogleGsi {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
      }) => TokenClient;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleGsi;
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/**
 * PREREQUISITES (also surfaced in Settings help text):
 *  - A Google Cloud project with the Google Sheets API enabled.
 *  - An OAuth client ID (Web application) whose Authorised JavaScript origin
 *    equals the Codespace forwarded URL. Codespace URLs can change per session,
 *    so pin the port to a stable URL or update the origin when it changes.
 *    Without a matching origin, the token request fails.
 */

/** Load the GIS client script once and resolve when ready. */
function loadGsi(): Promise<GoogleGsi> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(window.google);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    );
    const onReady = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google Identity Services failed to initialise.'));
    };
    if (existing) {
      existing.addEventListener('load', onReady);
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Google Identity Services.')),
      );
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = () =>
      reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });
}

/** Request an access token via the GIS token flow. */
export async function requestSheetsToken(clientId: string): Promise<string> {
  const google = await loadGsi();
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token)
          reject(new Error(resp.error ?? 'Authorisation was cancelled.'));
        else resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export interface SheetsResult {
  ok: boolean;
  message: string;
  url?: string;
}

/**
 * Create a Google Spreadsheet titled "<classGroup> Timetable", write the header
 * row plus every lesson (nine columns + the display-date column), and return
 * the new spreadsheet URL. The caller opens it in a new tab.
 */
export async function exportToGoogleSheets(
  lessons: ScheduledLesson[],
  course: Course,
  clientId: string,
): Promise<SheetsResult> {
  if (!clientId.trim())
    return {
      ok: false,
      message:
        'No Google OAuth client ID set in Settings. Use Export CSV and import it into Google Sheets instead.',
    };

  let token: string;
  try {
    token = await requestSheetsToken(clientId);
  } catch (err) {
    return {
      ok: false,
      message: `Google authorisation failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const authHeader = { Authorization: `Bearer ${token}` };
  const title = `${course.name || 'Course'} Timetable`;

  try {
    // 1) Create the spreadsheet.
    const createRes = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { title } }),
      },
    );
    if (!createRes.ok)
      return {
        ok: false,
        message: `Sheets create failed (${createRes.status} ${createRes.statusText}).`,
      };
    const created = (await createRes.json()) as {
      spreadsheetId: string;
      spreadsheetUrl: string;
    };

    // 2) Write header + rows.
    const values = [
      [...DATA_COLUMN_HEADERS],
      ...lessons.map((l) => dataRowFor(l)),
    ];
    const range = 'A1';
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values/${range}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      },
    );
    if (!updateRes.ok)
      return {
        ok: false,
        message: `Sheet created but writing values failed (${updateRes.status}).`,
        url: created.spreadsheetUrl,
      };

    return {
      ok: true,
      message: 'Google Sheet created.',
      url: created.spreadsheetUrl,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Google Sheets export failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
