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
  lessonNames: 'lesson_names', // expects newline text or child-table; TODO confirm
} as const;

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

/** Turn the mapped lesson-names value (newline text or child table) into lines. */
function lessonNamesFrom(doc: Record<string, unknown>): string {
  const raw = doc[ERPNEXT_FIELD_MAP.lessonNames];
  if (Array.isArray(raw)) {
    // Child table: try common label fields on each row.
    return raw
      .map((row) => {
        if (row && typeof row === 'object') {
          const r = row as Record<string, unknown>;
          return String(r.lesson_name ?? r.name ?? r.title ?? '').trim();
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
    lessonNamesRaw: lessonNamesFrom(doc),
  };
}

/**
 * Fetch the configured DocType and map the FIRST record into the form.
 * Returns a clear message on auth / CORS / mapping failure.
 */
export async function importFromErpnext(
  settings: AppSettings,
): Promise<ErpResult<RawForm>> {
  if (!settings.erpBaseUrl.trim())
    return { ok: false, message: 'Set an ERPNext base URL in Settings first.' };
  if (!settings.erpDocType.trim())
    return { ok: false, message: 'Set an ERPNext DocType in Settings first.' };

  const fields = JSON.stringify(Object.values(ERPNEXT_FIELD_MAP));
  const url =
    `${trimBase(settings.erpBaseUrl)}/api/resource/` +
    `${encodeURIComponent(settings.erpDocType)}` +
    `?fields=${encodeURIComponent(fields)}&limit_page_length=0`;

  try {
    const res = await fetch(url, { headers: authHeaders(settings) });
    if (!res.ok) {
      return {
        ok: false,
        message: `ERPNext responded ${res.status} ${res.statusText}. Check the DocType, keys, and permissions.`,
      };
    }
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    const rows = body.data ?? [];
    if (rows.length === 0) {
      return {
        ok: false,
        message: `No "${settings.erpDocType}" records returned to import.`,
      };
    }
    return {
      ok: true,
      message: `Imported 1 of ${rows.length} "${settings.erpDocType}" record(s). Review the form, then Generate.`,
      data: mapDocToForm(rows[0]),
    };
  } catch (err) {
    return {
      ok: false,
      message: `Import failed (often CORS — the ERPNext site must allow this origin): ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
