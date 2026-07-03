import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mapDocToForm,
  erpBase,
  testErpConnection,
  listErpRecords,
} from '../src/erpnext';
import { DEFAULT_SETTINGS, type AppSettings } from '../src/settings';

const SETTINGS: AppSettings = {
  ...DEFAULT_SETTINGS,
  erpBaseUrl: 'https://sms.unitedceres.edu.sg/',
  erpApiKey: 'the-key',
  erpApiSecret: 'the-secret',
  erpDocType: 'Course Schedule',
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

describe('listErpRecords', () => {
  it('builds the list URL from the proxy base with no credentials in it', async () => {
    const calls = stubFetch(() =>
      Promise.resolve(jsonResponse(200, { data: [{ name: 'CS-001', course_name: 'ULEC' }] })),
    );
    const result = await listErpRecords(SETTINGS);
    expect(result.ok).toBe(true);
    expect(calls[0].url).toMatch(/^\/erp\/api\/resource\/Course%20Schedule\?fields=/);
    expect(calls[0].url).not.toContain('the-secret');
  });

  it('distinguishes 403 on the DocType as an auth/permission failure', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(403, {})));
    const result = await listErpRecords(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication failed (403 Forbidden)');
    expect(result.message).toContain('listing "Course Schedule"');
  });
});

describe('mapDocToForm', () => {
  it('maps flat string fields and slices times to HH:mm', () => {
    const form = mapDocToForm({
      course_name: 'ULEC English',
      class_group: 'ULEC-1A',
      teacher: 'Ms Tan',
      classroom: 'R2',
      start_date: '2026-07-06',
      start_time: '09:00:00',
      end_time: '10:30:00',
      lesson_names: 'L1\nL2',
    });
    expect(form.courseName).toBe('ULEC English');
    expect(form.startMonth).toBe('2026-07');
    const mod = form.modules[0];
    expect(mod.name).toBe('ULEC English');
    expect(mod.classGroup).toBe('ULEC-1A');
    expect(mod.startTime).toBe('09:00');
    expect(mod.endTime).toBe('10:30');
    expect(mod.lessonNamesRaw).toBe('L1\nL2');
  });

  it('extracts child-table rows via the label fieldname fallbacks', () => {
    const form = mapDocToForm({
      lesson_names: [
        { lesson_name: 'Part 1 Lesson 1' },
        { title: 'Part 1 Lesson 2' },
        { name: 'row-3-id', lesson_name: 'Part 1 Lesson 3' },
      ],
      activities: [{ activity: 'Listening' }, { activity: 'Reading' }],
    });
    expect(form.modules[0].lessonNamesRaw).toBe(
      'Part 1 Lesson 1\nPart 1 Lesson 2\nPart 1 Lesson 3',
    );
    expect(form.modules[0].activitiesRaw).toBe('Listening\nReading');
  });

  it('missing fields stay empty rather than "undefined"', () => {
    const form = mapDocToForm({});
    expect(form.courseName).toBe('');
    expect(form.modules[0].lessonNamesRaw).toBe('');
    expect(form.modules[0].activitiesRaw).toBe('');
    expect(form.modules[0].startTime).toBe('');
  });

  it('non-string child rows and empty labels are skipped', () => {
    const form = mapDocToForm({
      lesson_names: [{ lesson_name: '  ' }, 'plain-string', 42, null],
    });
    expect(form.modules[0].lessonNamesRaw).toBe('plain-string\n42');
  });
});
