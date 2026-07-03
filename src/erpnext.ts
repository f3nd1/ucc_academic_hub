import type { AppSettings } from './settings';
import { EMPTY_FORM, type RawForm } from './formModel';

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
// This is a browser app calling a different origin (the ERPNext server), so the
// ERPNext/Frappe site must allow the Codespace origin. Two paths:
//
//  A) Direct fetch (used here): the Frappe site must enable CORS —
//     set `"allow_cors": "*"` (or the specific Codespace origin) in
//     site_config.json. Simplest when you control the ERPNext site.
//
//  B) Vite dev proxy: add a `/erpnext` proxy in vite.config.ts pointing at the
//     ERPNext base URL and call `/erpnext/api/...` instead. The catch is the
//     Vite proxy target is STATIC at config time, but the base URL lives in
//     Settings — so the proxy target would have to be hard-coded. Because of
//     that limitation we default to path A (direct fetch + server CORS).
// ---------------------------------------------------------------------------

/** ERPNext token-auth header. */
function authHeaders(settings: AppSettings): HeadersInit {
  return {
    Authorization: `token ${settings.erpApiKey}:${settings.erpApiSecret}`,
    Accept: 'application/json',
  };
}

/** Trim a trailing slash so we can join paths predictably. */
const trimBase = (url: string) => url.replace(/\/+$/, '');

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

  const url = `${trimBase(settings.erpBaseUrl)}/api/method/frappe.auth.get_logged_user`;
  try {
    const res = await fetch(url, { headers: authHeaders(settings) });
    if (!res.ok) {
      return {
        ok: false,
        message: `ERPNext responded ${res.status} ${res.statusText}.`,
      };
    }
    const body = (await res.json()) as { message?: string };
    return {
      ok: true,
      message: `Connected as ${body.message ?? 'user'}.`,
      data: body.message,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Request failed (often CORS): ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
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

/** Map one ERPNext doc into a RawForm (fields left blank stay empty). */
export function mapDocToForm(doc: Record<string, unknown>): RawForm {
  return {
    ...EMPTY_FORM,
    courseName: str(doc, ERPNEXT_FIELD_MAP.courseName),
    classGroup: str(doc, ERPNEXT_FIELD_MAP.classGroup),
    teacher: str(doc, ERPNEXT_FIELD_MAP.teacher),
    classroom: str(doc, ERPNEXT_FIELD_MAP.classroom),
    startDate: str(doc, ERPNEXT_FIELD_MAP.startDate),
    startTime: str(doc, ERPNEXT_FIELD_MAP.startTime).slice(0, 5), // HH:mm
    endTime: str(doc, ERPNEXT_FIELD_MAP.endTime).slice(0, 5),
    lessonNamesRaw: linesFrom(doc, ERPNEXT_FIELD_MAP.lessonNames),
    activitiesRaw: linesFrom(doc, ERPNEXT_FIELD_MAP.activities),
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

const corsHint = (err: unknown): string =>
  `Request failed (often CORS — the ERPNext site must allow this origin): ${
    err instanceof Error ? err.message : String(err)
  }`;

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
    `${trimBase(settings.erpBaseUrl)}/api/resource/` +
    `${encodeURIComponent(settings.erpDocType)}` +
    `?fields=${encodeURIComponent(fields)}&limit_page_length=50`;

  try {
    const res = await fetch(url, { headers: authHeaders(settings) });
    if (!res.ok)
      return {
        ok: false,
        message: `ERPNext responded ${res.status} ${res.statusText}. Check the DocType, keys, and permissions.`,
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
    return { ok: false, message: corsHint(err) };
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
): Promise<ErpResult<RawForm>> {
  const blocked = guard(settings);
  if (blocked) return blocked;

  const url =
    `${trimBase(settings.erpBaseUrl)}/api/resource/` +
    `${encodeURIComponent(settings.erpDocType)}/${encodeURIComponent(name)}`;

  try {
    const res = await fetch(url, { headers: authHeaders(settings) });
    if (!res.ok)
      return {
        ok: false,
        message: `ERPNext responded ${res.status} ${res.statusText} fetching "${name}".`,
      };
    const body = (await res.json()) as { data?: Record<string, unknown> };
    if (!body.data)
      return { ok: false, message: `Record "${name}" came back empty.` };
    return {
      ok: true,
      message: `Imported "${name}". Review the form, then Generate.`,
      data: mapDocToForm(body.data),
    };
  } catch (err) {
    return { ok: false, message: corsHint(err) };
  }
}
