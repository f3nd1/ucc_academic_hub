import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mapDocToForm,
  erpBase,
  testErpConnection,
  listErpRecords,
  fetchErpRecord,
  fetchSampleFields,
} from '../src/erpnext';
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/settings';
import type { ErpFieldMapping } from '../src/erpFieldMapping';

const SETTINGS: AppSettings = {
  ...DEFAULT_SETTINGS,
  erpBaseUrl: 'https://sms.unitedceres.edu.sg/',
  erpApiKey: 'the-key',
  erpApiSecret: 'the-secret',
  erpDocType: 'Course Schedule',
};

const MAPPING: ErpFieldMapping = {
  courseName: 'course_name',
  classGroup: 'class_group',
  teacher: 'teacher',
  classroom: 'classroom',
  totalLessons: 'no_of_lessons',
  startDate: 'start_date',
  startTime: 'start_time',
  endTime: 'end_time',
  activity: 'activity',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubFetch = (impl: (url: string) => Promise<Response>) => {
  const calls: { url: string; headers: HeadersInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers ?? {} });
      return impl(url);
    }),
  );
  return calls;
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'OK',
    headers: { 'Content-Type': 'application/json' },
  });

describe('erpBase', () => {
  it('is the same-origin proxy prefix in dev', () => {
    expect(erpBase(SETTINGS, true)).toBe('/erp');
  });

  it('is the configured base URL (trailing slash trimmed) in prod', () => {
    expect(erpBase(SETTINGS, false)).toBe('https://sms.unitedceres.edu.sg');
  });
});

describe('testErpConnection', () => {
  it('succeeds through the dev proxy and never puts the secret in the URL', async () => {
    const calls = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { message: 'felix@unitedceres.edu.sg' })),
    );
    const result = await testErpConnection(SETTINGS);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('felix@unitedceres.edu.sg');
    // vitest runs with import.meta.env.DEV = true → same-origin proxy path.
    expect(calls[0].url).toBe('/erp/api/method/frappe.auth.get_logged_user');
    expect(calls[0].url).not.toContain('the-key');
    expect(calls[0].url).not.toContain('the-secret');
    // The token travels only in the Authorization header.
    expect((calls[0].headers as Record<string, string>).Authorization).toBe(
      'token the-key:the-secret',
    );
  });

  it('reports 401/403 as an auth failure, not "Failed to fetch"', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(401, {})));
    const result = await testErpConnection(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication failed (401 Unauthorized)');
    expect(result.message).toContain('key');
  });

  it('reports a thrown fetch as a network/preflight failure', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await testErpConnection(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('network or CORS preflight failure');
    expect(result.message).toContain('Failed to fetch');
  });
});

describe('fetchSampleFields', () => {
  it('lists one record then fetches its full doc for scalar field names', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('limit_page_length=1')) {
        return Promise.resolve(jsonResponse(200, { data: [{ name: 'CS-0001' }] }));
      }
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            name: 'CS-0001',
            course_name: 'ULEC English',
            start_date: '2026-07-06',
            no_of_lessons: 8,
            docstatus: 0,
            child_rows: [{ x: 1 }],
            meta: { nested: true },
          },
        }),
      );
    });
    const result = await fetchSampleFields(SETTINGS, 'Course Schedule');
    expect(result.ok).toBe(true);
    expect(result.data?.recordName).toBe('CS-0001');
    // Scalar fields only — array/object (child table / link) fields excluded.
    expect(result.data?.fields).toEqual(
      ['course_name', 'docstatus', 'name', 'no_of_lessons', 'start_date'].sort(),
    );
    expect(result.data?.fields).not.toContain('child_rows');
    expect(result.data?.fields).not.toContain('meta');
    expect(calls.every((c) => c.url.startsWith('/erp/'))).toBe(true);
    expect(calls.some((c) => c.url.includes('the-secret'))).toBe(false);
  });

  it('reports when the DocType has no records', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, { data: [] })));
    const result = await fetchSampleFields(SETTINGS, 'Course Schedule');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No "Course Schedule" records found');
  });

  it('surfaces a 403 while listing as an auth failure', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(403, {})));
    const result = await fetchSampleFields(SETTINGS, 'Course Schedule');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication failed (403 Forbidden)');
  });

  it('surfaces a network/CORS failure (fetch throws)', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await fetchSampleFields(SETTINGS, 'Course Schedule');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('network or CORS');
  });

  it('errors (not silent success) when the record has no scalar fields', async () => {
    stubFetch((url) =>
      url.includes('limit_page_length=1')
        ? Promise.resolve(jsonResponse(200, { data: [{ name: 'CS-0001' }] }))
        : Promise.resolve(
            jsonResponse(200, {
              data: { rows: [{ x: 1 }], link_obj: { a: 1 } },
            }),
          ),
    );
    const result = await fetchSampleFields(SETTINGS, 'Course Schedule');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('no simple fields to map');
  });

  it('requires a DocType before fetching', async () => {
    const result = await fetchSampleFields(SETTINGS, '');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('DocType');
  });
});

describe('listErpRecords', () => {
  it('builds the fields query from only the mapped source keys, no credentials in it', async () => {
    const calls = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { data: [{ name: 'CS-001', course_name: 'ULEC' }] })),
    );
    const result = await listErpRecords(SETTINGS, MAPPING);
    expect(result.ok).toBe(true);
    expect(calls[0].url).toMatch(/^\/erp\/api\/resource\/Course%20Schedule\?fields=/);
    const fieldsParam = new URL(calls[0].url, 'http://x').searchParams.get('fields')!;
    const fields = JSON.parse(fieldsParam) as string[];
    expect(fields).toContain('name');
    expect(fields).toContain('course_name');
    expect(fields).toContain('class_group');
    expect(calls[0].url).not.toContain('the-secret');
  });

  it('distinguishes 403 on the DocType as an auth/permission failure', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(403, {})));
    const result = await listErpRecords(SETTINGS, MAPPING);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication failed (403 Forbidden)');
    expect(result.message).toContain('listing "Course Schedule"');
  });

  it('labels records from the mapped course/class-group fields', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          data: [{ name: 'CS-001', course_name: 'ULEC English', class_group: 'ULEC-1A' }],
        }),
      ),
    );
    const result = await listErpRecords(SETTINGS, MAPPING);
    expect(result.data?.[0].label).toBe('ULEC English — ULEC-1A');
  });
});

describe('fetchErpRecord', () => {
  it('maps the fetched doc through the mapping and leaves lesson names blank', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(200, {
          data: {
            name: 'CS-001',
            course_name: 'ULEC English',
            class_group: 'ULEC-1A',
            teacher: 'Ms Tan',
            classroom: 'R2',
            start_date: '2026-07-06',
            start_time: '09:00:00',
            end_time: '10:30:00',
            no_of_lessons: 8,
            activity: 'Listening',
          },
        }),
      ),
    );
    const result = await fetchErpRecord(SETTINGS, MAPPING, 'CS-001');
    expect(result.ok).toBe(true);
    expect(result.data?.courseName).toBe('ULEC English');
    expect(result.data?.startMonth).toBe('2026-07');
    const mod = result.data!.modules[0];
    expect(mod.classGroup).toBe('ULEC-1A');
    expect(mod.totalLessons).toBe('8');
    expect(mod.activitiesRaw).toBe('Listening');
    expect(mod.lessonNamesRaw).toBe(''); // never imported — always manual
  });
});

describe('mapDocToForm', () => {
  it('maps flat fields via the mapping and slices times to HH:mm', () => {
    const form = mapDocToForm(
      {
        course_name: 'ULEC English',
        class_group: 'ULEC-1A',
        teacher: 'Ms Tan',
        classroom: 'R2',
        start_date: '2026-07-06',
        start_time: '09:00:00',
        end_time: '10:30:00',
      },
      MAPPING,
    );
    expect(form.courseName).toBe('ULEC English');
    expect(form.startMonth).toBe('2026-07');
    const mod = form.modules[0];
    expect(mod.name).toBe('ULEC English');
    expect(mod.classGroup).toBe('ULEC-1A');
    expect(mod.startTime).toBe('09:00');
    expect(mod.endTime).toBe('10:30');
  });

  it('unmapped targets stay blank rather than "undefined"', () => {
    const form = mapDocToForm({ course_name: 'ULEC English' }, {});
    expect(form.courseName).toBe('');
    expect(form.modules[0].classGroup).toBe('');
    expect(form.modules[0].totalLessons).toBe('');
    expect(form.modules[0].startTime).toBe('');
  });

  it('never reads a lesson-names field — that target does not exist', () => {
    const form = mapDocToForm(
      { course_name: 'X', lesson_names: ['a', 'b'] },
      { ...MAPPING, courseName: 'course_name' },
    );
    expect(form.modules[0].lessonNamesRaw).toBe('');
  });

  it('missing doc values stay empty rather than "null"', () => {
    const form = mapDocToForm({ course_name: null }, { courseName: 'course_name' });
    expect(form.courseName).toBe('');
  });
});
