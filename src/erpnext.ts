import type { AppSettings } from './settings';
import { EMPTY_FORM, type CourseForm } from './formModel';

// ---------------------------------------------------------------------------
// FIELD MAPPING — adjust these to the real ERPNext DocType schema.
// Keys are the app's fields; values are the ERPNext fieldnames to read from.
// ---------------------------------------------------------------------------
export const ERPNEXT_FIELD_MAP = {
  courseName: 'course_name', // TODO confirm against DocType
  classGroup: 'class_group',
  teacher: 'teacher',
  classroom: 'classroom',
  startDate: 'start_date',
  startTime: 'start_time',
  endTime: 'end_time',
  lessonNames: 'lesson_names', // newline text or child table; TODO confirm
  activities: 'activities', // newline text or child table; TODO confirm
} as const;

/** Label fieldnames tried, in order, on each child-table row. */
const CHILD_ROW_LABEL_FIELDS = [
  'lesson_name',
  'activity',
  'title',
  'name',
] as const;

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

/**
 * Turn a mapped multi-line value (newline text OR a child table) into textarea
 * lines. Child-table rows try the common label fieldnames in order.
 */
function linesFrom(doc: Record<string, unknown>, field: string): string {
  const raw = doc[field];
  if (Array.isArray(raw)) {
    return raw
      .map((row) => {
        if (row == null) return ''; // String(null) would leak a literal "null"
        if (typeof row === 'object') {
          const r = row as Record<string, unknown>;
          for (const key of CHILD_ROW_LABEL_FIELDS) {
            const v = r[key];
            if (typeof v === 'string' && v.trim()) return v.trim();
          }
          return '';
        }
        return String(row).trim();
      })
      .filter(Boolean)
      .join('\n');
  }
  return typeof raw === 'string' ? raw : '';
}

/**
 * Map one ERPNext doc into a CourseForm holding a single module. The start
 * month is derived from the DocType's start date (YYYY-MM-DD -> YYYY-MM).
 */
export function mapDocToForm(doc: Record<string, unknown>): CourseForm {
  const name = str(doc, ERPNEXT_FIELD_MAP.courseName);
  return {
    ...EMPTY_FORM,
    courseName: name,
    startMonth: str(doc, ERPNEXT_FIELD_MAP.startDate).slice(0, 7), // YYYY-MM
    modules: [
      {
        id: 'mod-erpnext',
        name,
        classGroup: str(doc, ERPNEXT_FIELD_MAP.classGroup),
        teacher: str(doc, ERPNEXT_FIELD_MAP.teacher),
        classroom: str(doc, ERPNEXT_FIELD_MAP.classroom),
        lessonNamesRaw: linesFrom(doc, ERPNEXT_FIELD_MAP.lessonNames),
        activitiesRaw: linesFrom(doc, ERPNEXT_FIELD_MAP.activities),
        totalLessons: '',
        startTime: str(doc, ERPNEXT_FIELD_MAP.startTime).slice(0, 5), // HH:mm
        endTime: str(doc, ERPNEXT_FIELD_MAP.endTime).slice(0, 5),
      },
    ],
  };
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
 * List records of the configured DocType for the picker. Uses the list
 * endpoint with a small field set — child tables are NOT returned by list
 * queries, which is exactly why the actual import fetches the single doc.
 */
export async function listErpRecords(
  settings: AppSettings,
): Promise<ErpResult<ErpRecordSummary[]>> {
  const blocked = guard(settings);
  if (blocked) return blocked;

  const fields = JSON.stringify([
    'name',
    ERPNEXT_FIELD_MAP.courseName,
    ERPNEXT_FIELD_MAP.classGroup,
  ]);
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
      const course = str(row, ERPNEXT_FIELD_MAP.courseName);
      const group = str(row, ERPNEXT_FIELD_MAP.classGroup);
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
 * Fetch ONE document by name — the single-doc endpoint returns child tables
 * (lesson names / activities), which list queries omit — and map it into the
 * form for review before generating.
 */
export async function fetchErpRecord(
  settings: AppSettings,
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
      data: mapDocToForm(body.data),
    };
  } catch (err) {
    return { ok: false, message: networkFailure(err) };
  }
}
