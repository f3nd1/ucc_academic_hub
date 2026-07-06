import type { AppSettings } from './shared/settings';
import { EMPTY_FORM, type CourseForm } from './formModel';
import type { ErpFieldMapping } from './erpFieldMapping';

// ---------------------------------------------------------------------------
// CORS / networking note
// ---------------------------------------------------------------------------
// This is a browser app calling the ERPNext server. The ERPNext site does not
// return CORS headers, so a DIRECT cross-origin fetch from the browser dies
// with "Failed to fetch" / a CORS preflight block (curl works — no CORS there).
//
// So the browser NEVER calls ERPNext directly. Every request goes to the
// same-origin '/erp/...' path, and whatever serves the app forwards it to the
// real ERPNext server:
//   - npm run dev      → the Vite dev-server proxy (server.proxy)
//   - npm run preview  → the Vite preview-server proxy (preview.proxy)
//   - any other host   → must add an equivalent '/erp' reverse proxy (e.g.
//                        an nginx `location /erp/ { proxy_pass ...; }`)
// The proxy target is set in vite.config.ts (ERP_PROXY_TARGET), STATIC at
// startup — restart the server after changing it. Because the call is always
// same-origin there is no CORS in ANY mode, dev or deployed.
// ---------------------------------------------------------------------------

/** ERPNext token-auth header. The key/secret travel ONLY here — never in the
 *  URL or query string. */
function authHeaders(settings: AppSettings): HeadersInit {
  return {
    Authorization: `token ${settings.erpApiKey}:${settings.erpApiSecret}`,
    Accept: 'application/json',
  };
}

/** Same-origin prefix that the app's serving proxy forwards to ERPNext. */
export const ERP_PROXY_PREFIX = '/erp';

/**
 * Base path for every ERPNext request. ALWAYS the same-origin '/erp' prefix, in
 * dev and in a deployed build alike — the browser never calls ERPNext directly
 * (that is what causes the CORS block). The host's '/erp' proxy (Vite dev or
 * preview, or an nginx location) forwards it to the configured ERPNext server.
 * `settings` is accepted for call-site symmetry and future per-site routing.
 */
export const erpBase = (_settings?: AppSettings): string => ERP_PROXY_PREFIX;

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
  }. Requests go same-origin through the /erp proxy — serve the app with ` +
  `"npm run dev" or "npm run preview" (a bare static host needs its own /erp ` +
  `reverse proxy), and restart it if vite.config.ts changed.`;

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
        // The module's scheduling window: start from the mapped start date;
        // the end date is set manually in the app.
        moduleStartDate: mapped(doc, mapping, 'startDate'),
        moduleEndDate: '',
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

  // Each step is logged so the browser console shows exactly where a failure
  // happens (which request, what status) instead of the dropdowns silently
  // staying empty.
  const fail = (message: string): ErpResult<ErpSampleFields> => {
    console.error('[ERPNext] Load sample fields failed:', message);
    return { ok: false, message };
  };

  const base = erpBase(settings);
  const listUrl =
    `${base}/api/resource/${encodeURIComponent(docType)}?limit_page_length=1`;
  try {
    console.info('[ERPNext] Load sample fields — listing:', listUrl);
    const listRes = await fetch(listUrl, { headers: authHeaders(settings) });
    console.info(
      `[ERPNext] list response: ${listRes.status} ${listRes.statusText}`,
    );
    if (!listRes.ok) return fail(statusMessage(listRes, ` listing "${docType}"`));

    const listBody = (await listRes.json()) as {
      data?: Record<string, unknown>[];
    };
    const first = listBody.data?.[0];
    const recordName = first ? str(first, 'name') : '';
    console.info('[ERPNext] first record name:', recordName || '(none)');
    if (!recordName)
      return fail(
        `No "${docType}" records found. Check the DocType name (it is ` +
          `case-sensitive, e.g. "Course") and that this user can read it, then ` +
          `create at least one record in ERPNext.`,
      );

    const docUrl =
      `${base}/api/resource/${encodeURIComponent(docType)}` +
      `/${encodeURIComponent(recordName)}`;
    console.info('[ERPNext] fetching record:', docUrl);
    const docRes = await fetch(docUrl, { headers: authHeaders(settings) });
    console.info(
      `[ERPNext] record response: ${docRes.status} ${docRes.statusText}`,
    );
    if (!docRes.ok) return fail(statusMessage(docRes, ` fetching "${recordName}"`));

    const docBody = (await docRes.json()) as { data?: Record<string, unknown> };
    if (!docBody.data) return fail(`Record "${recordName}" came back empty.`);

    const fields = Object.entries(docBody.data)
      .filter(([, v]) => isScalar(v))
      .map(([key]) => key)
      .sort();
    console.info(`[ERPNext] ${fields.length} scalar field(s):`, fields);
    if (fields.length === 0)
      return fail(
        `Record "${recordName}" has no simple fields to map — it only holds ` +
          `child tables or links. Pick a DocType with plain fields.`,
      );

    return {
      ok: true,
      message: `Loaded ${fields.length} field(s) from record "${recordName}".`,
      data: { recordName, fields },
    };
  } catch (err) {
    return fail(networkFailure(err));
  }
}

/**
 * List real DocType names from ERPNext so the "DocType to import from" box
 * can be picked from a searchable list instead of typed blind (DocType names
 * are case-sensitive and easy to mistype). Requires the API user to have read
 * permission on the "DocType" doctype itself — usually a System Manager-only
 * permission; a 403 here just means that's missing, and the field can still
 * be typed manually. Child-table doctypes (istable=1) are excluded — they are
 * never valid top-level import sources.
 */
export async function listErpDocTypes(
  settings: AppSettings,
): Promise<ErpResult<string[]>> {
  if (!settings.erpBaseUrl.trim())
    return { ok: false, message: 'Set an ERPNext base URL in Settings first.' };
  if (!settings.erpApiKey.trim() || !settings.erpApiSecret.trim())
    return { ok: false, message: 'Set an ERPNext API key and secret first.' };

  const fields = JSON.stringify(['name', 'istable']);
  // limit_page_length=0 is Frappe's "no limit" — a site can have hundreds of
  // DocTypes and the picker filters client-side, so fetch them all at once.
  const url =
    `${erpBase(settings)}/api/resource/DocType` +
    `?fields=${encodeURIComponent(fields)}&limit_page_length=0`;

  try {
    const res = await fetch(url, { headers: authHeaders(settings) });
    if (!res.ok)
      return { ok: false, message: statusMessage(res, ' listing DocTypes') };
    const body = (await res.json()) as {
      data?: { name: string; istable?: 0 | 1 }[];
    };
    const names = (body.data ?? [])
      .filter((d) => !d.istable)
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
    if (names.length === 0)
      return {
        ok: false,
        message:
          'No DocTypes found — check that this API user has read permission on "DocType".',
      };
    return {
      ok: true,
      message: `Found ${names.length} DocType(s). Pick one to import from.`,
      data: names,
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
