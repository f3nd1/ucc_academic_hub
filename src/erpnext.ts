import type { AppSettings } from './shared/settings';
import { EMPTY_FORM, type CourseForm } from './formModel';
import type { ErpFieldMapping } from './erpFieldMapping';

// ---------------------------------------------------------------------------
// CORS / networking note
// ---------------------------------------------------------------------------
// This is a browser app calling the ERPNext server. The ERPNext site does not
// return CORS headers for the Codespace origin, so a direct cross-origin fetch
// dies in the browser with "Failed to fetch" (curl works — no CORS there).
//
//  - DEV: every request goes to same-origin '/erp/...', which the Vite dev
//    proxy (vite.config.ts) forwards to the ERPNext server — no CORS involved.
//    The proxy target is static at config time; restart the dev server after
//    changing vite.config.ts.
//  - PROD: requests use the base URL from Settings. That deployment must sit
//    behind a real backend proxy (see the Settings security banner) — the
//    browser must never hold the secret on a shared/public URL.
// ---------------------------------------------------------------------------

/** ERPNext token-auth header. The key/secret travel ONLY here — never in the
 *  URL or query string. */
function authHeaders(settings: AppSettings): HeadersInit {
  return {
    Authorization: `token ${settings.erpApiKey}:${settings.erpApiSecret}`,
    Accept: 'application/json',
  };
}

/** Trim a trailing slash so we can join paths predictably. */
const trimBase = (url: string) => url.replace(/\/+$/, '');

/**
 * Base path for every ERPNext request. In dev this is the same-origin '/erp'
 * prefix handled by the Vite proxy; in a real deployment it is the configured
 * base URL. `dev` is injectable for tests (vitest runs with DEV=true).
 */
export const erpBase = (
  settings: AppSettings,
  dev: boolean = import.meta.env.DEV,
): string => (dev ? '/erp' : trimBase(settings.erpBaseUrl));

/** Turn a non-2xx response into a message that says WHICH kind of failure. */
const statusMessage = (res: Response, context = ''): string =>
  res.status === 401 || res.status === 403
    ? `Authentication failed (${res.status} ${res.statusText})${context} — check the API key, secret, and the user's role permissions.`
    : `ERPNext responded ${res.status} ${res.statusText}${context}.`;

/**
 * The fetch itself threw: the request never got an HTTP response. Cross-origin
 * that usually means CORS/preflight; same-origin via the dev proxy it means
 * the proxy or network, not auth (auth failures arrive as 401/403 above).
 */
const networkFailure = (err: unknown): string =>
  `Could not reach ERPNext (network or CORS preflight failure — no HTTP response): ${
    err instanceof Error ? err.message : String(err)
  }. In dev, restart the dev server if vite.config.ts changed.`;

export interface ErpResult<T> {
  ok: boolean;
  message: string;
  data?: T;
}

/**
 * Lightweight connectivity + auth check. Calls Frappe's logged-user endpoint,
 * which requires a valid token and returns the user on success.
 */
export async function testErpConnection(
  settings: AppSettings,
): Promise<ErpResult<string>> {
  if (!settings.erpBaseUrl.trim())
    return { ok: false, message: 'Set an ERPNext base URL first.' };
  if (!settings.erpApiKey.trim() || !settings.erpApiSecret.trim())
    return { ok: false, message: 'Set an ERPNext API key and secret first.' };

  // Lightweight auth check: requires a valid token, returns the user.
  const url = `${erpBase(settings)}/api/method/frappe.auth.get_logged_user`;
  try {
    const res = await fetch(url, { headers: authHeaders(settings) });
    if (!res.ok) return { ok: false, message: statusMessage(res) };
    const body = (await res.json()) as { message?: string };
    return {
      ok: true,
      message: `Connected as ${body.message ?? 'user'}.`,
      data: body.message,
    };
  } catch (err) {
    return { ok: false, message: networkFailure(err) };
  }
}

/** Read a mapped field from an ERPNext doc as a string. */
const str = (doc: Record<string, unknown>, field: string): string => {
  const v = doc[field];
  return v == null ? '' : String(v);
};

/** Read the ERPNext field the user mapped to `target`, or '' when unmapped. */
const mapped = (
  doc: Record<string, unknown>,
  mapping: ErpFieldMapping,
  target: string,
): string => {
  const key = mapping[target];
  return key ? str(doc, key) : '';
};

/**
 * Map one ERPNext doc into a CourseForm holding a single module, using the
 * user's saved field mapping. Unmapped targets stay blank. Lesson names are
 * NOT sourced from ERPNext — they are always typed manually in the app. The
 * start month is derived from the mapped start date (YYYY-MM-DD -> YYYY-MM).
 */
export function mapDocToForm(
  doc: Record<string, unknown>,
  mapping: ErpFieldMapping,
): CourseForm {
  const name = mapped(doc, mapping, 'courseName');
  return {
    ...EMPTY_FORM,
    courseName: name,
    startMonth: mapped(doc, mapping, 'startDate').slice(0, 7), // YYYY-MM
    modules: [
      {
        id: 'mod-erpnext',
        name,
        classGroup: mapped(doc, mapping, 'classGroup'),
        teacher: mapped(doc, mapping, 'teacher'),
        classroom: mapped(doc, mapping, 'classroom'),
        lessonNamesRaw: '', // manual — never imported
        activitiesRaw: mapped(doc, mapping, 'activity'),
        totalLessons: mapped(doc, mapping, 'totalLessons'),
        startTime: mapped(doc, mapping, 'startTime').slice(0, 5), // HH:mm
        endTime: mapped(doc, mapping, 'endTime').slice(0, 5),
      },
    ],
  };
}

/** A field value counts as scalar (mappable) when it isn't an array or a
 *  plain object — those are child tables / links, out of scope here. */
const isScalar = (v: unknown): boolean =>
  !Array.isArray(v) && (typeof v !== 'object' || v === null);

export interface ErpSampleFields {
  /** The document name the sample was pulled from (shown for reference). */
  recordName: string;
  /** Every top-level scalar field key found on that document, sorted. */
  fields: string[];
}

/**
 * Pull one record of `docType` and return its scalar field names, so the
 * Settings mapping screen can offer real fieldnames instead of guesses.
 * Two round trips: the list endpoint (cheapest way to find A record), then
 * the single-doc endpoint (list queries omit some fields Frappe reserves for
 * document reads).
 */
export async function fetchSampleFields(
  settings: AppSettings,
  docType: string,
): Promise<ErpResult<ErpSampleFields>> {
  if (!settings.erpBaseUrl.trim())
    return { ok: false, message: 'Set an ERPNext base URL in Settings first.' };
  if (!docType.trim())
    return { ok: false, message: 'Enter a DocType first.' };

  const listUrl =
    `${erpBase(settings)}/api/resource/${encodeURIComponent(docType)}` +
    `?limit_page_length=1`;
  try {
    const listRes = await fetch(listUrl, { headers: authHeaders(settings) });
    if (!listRes.ok)
      return {
        ok: false,
        message: statusMessage(listRes, ` listing "${docType}"`),
      };
    const listBody = (await listRes.json()) as {
      data?: Record<string, unknown>[];
    };
    const first = listBody.data?.[0];
    const recordName = first ? str(first, 'name') : '';
    if (!recordName)
      return {
        ok: false,
        message: `No "${docType}" records found — create one in ERPNext first.`,
      };

    const docUrl =
      `${erpBase(settings)}/api/resource/${encodeURIComponent(docType)}` +
      `/${encodeURIComponent(recordName)}`;
    const docRes = await fetch(docUrl, { headers: authHeaders(settings) });
    if (!docRes.ok)
      return {
        ok: false,
        message: statusMessage(docRes, ` fetching "${recordName}"`),
      };
    const docBody = (await docRes.json()) as { data?: Record<string, unknown> };
    if (!docBody.data)
      return { ok: false, message: `Record "${recordName}" came back empty.` };

    const fields = Object.entries(docBody.data)
      .filter(([, v]) => isScalar(v))
      .map(([key]) => key)
      .sort();
    return {
      ok: true,
      message: `Loaded ${fields.length} field(s) from "${recordName}".`,
      data: { recordName, fields },
    };
  } catch (err) {
    return { ok: false, message: networkFailure(err) };
  }
}

/** One row of the record picker. */
export interface ErpRecordSummary {
  /** Frappe document name (the id used to fetch the full doc). */
  name: string;
  /** Human label assembled from the course / class-group fields. */
  label: string;
}

const guard = (settings: AppSettings): ErpResult<never> | null => {
  if (!settings.erpBaseUrl.trim())
    return { ok: false, message: 'Set an ERPNext base URL in Settings first.' };
  if (!settings.erpDocType.trim())
    return { ok: false, message: 'Set an ERPNext DocType in Settings first.' };
  return null;
};

/**
 * List records of the configured DocType for the picker, requesting only the
 * fields the saved mapping actually uses (plus "name"). Note the fetched
 * fields here are for the picker's label only — the actual import re-fetches
 * the single doc so every mapped field is present regardless of what the list
 * endpoint happens to return.
 */
export async function listErpRecords(
  settings: AppSettings,
  mapping: ErpFieldMapping,
): Promise<ErpResult<ErpRecordSummary[]>> {
  const blocked = guard(settings);
  if (blocked) return blocked;

  const mappedKeys = Object.values(mapping).filter(
    (v): v is string => v != null,
  );
  const fields = JSON.stringify(['name', ...new Set(mappedKeys)]);
  const url =
    `${erpBase(settings)}/api/resource/` +
    `${encodeURIComponent(settings.erpDocType)}` +
    `?fields=${encodeURIComponent(fields)}&limit_page_length=50`;

  try {
    const res = await fetch(url, { headers: authHeaders(settings) });
    if (!res.ok)
      return {
        ok: false,
        message: statusMessage(res, ` listing "${settings.erpDocType}"`),
      };
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    const rows = body.data ?? [];
    if (rows.length === 0)
      return {
        ok: false,
        message: `No "${settings.erpDocType}" records found to import.`,
      };
    const records = rows.map((row) => {
      const name = str(row, 'name');
      const course = mapped(row, mapping, 'courseName');
      const group = mapped(row, mapping, 'classGroup');
      const label = [course, group].filter(Boolean).join(' — ') || name;
      return { name, label };
    });
    return {
      ok: true,
      message: `Found ${records.length} record(s). Pick one to import.`,
      data: records,
    };
  } catch (err) {
    return { ok: false, message: networkFailure(err) };
  }
}

/**
 * Fetch ONE document by name and map it into the form via the saved field
 * mapping, for review before generating. Lesson names stay whatever the user
 * had typed — this never overwrites them.
 */
export async function fetchErpRecord(
  settings: AppSettings,
  mapping: ErpFieldMapping,
  name: string,
): Promise<ErpResult<CourseForm>> {
  const blocked = guard(settings);
  if (blocked) return blocked;

  const url =
    `${erpBase(settings)}/api/resource/` +
    `${encodeURIComponent(settings.erpDocType)}/${encodeURIComponent(name)}`;

  try {
    const res = await fetch(url, { headers: authHeaders(settings) });
    if (!res.ok)
      return { ok: false, message: statusMessage(res, ` fetching "${name}"`) };
    const body = (await res.json()) as { data?: Record<string, unknown> };
    if (!body.data)
      return { ok: false, message: `Record "${name}" came back empty.` };
    return {
      ok: true,
      message: `Imported "${name}". Review the form, then Generate.`,
      data: mapDocToForm(body.data, mapping),
    };
  } catch (err) {
    return { ok: false, message: networkFailure(err) };
  }
}
