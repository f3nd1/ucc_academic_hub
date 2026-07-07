import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listFolders,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  listItems,
  loadItem,
  createItem,
  renameItem,
  moveItem,
  overwriteItem,
  deleteItem,
} from '../src/shared/savedItems';
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/settings';

const SETTINGS: AppSettings = {
  ...DEFAULT_SETTINGS,
  supabaseUrl: 'https://proj.supabase.co/',
  supabaseAnonKey: 'anon-key',
};

const NO_CLOUD: AppSettings = { ...DEFAULT_SETTINGS };

const stubFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return impl(url, init);
    }),
  );
  return calls;
};

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    statusText: status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : 'OK',
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

const folderRow = {
  id: 'f1',
  name: 'Term 1',
  parent_id: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
};
const itemRow = {
  id: 'i1',
  name: 'Sem A timetable',
  tool_id: 'timetable',
  folder_id: 'f1',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-03T00:00:00Z',
  payload: { version: 1, lessons: [] },
};

describe('config guard', () => {
  it('every method errors clearly when Supabase is not configured', async () => {
    for (const call of [
      () => listFolders(NO_CLOUD),
      () => createFolder(NO_CLOUD, 'x'),
      () => listItems(NO_CLOUD, 'timetable'),
      () => createItem(NO_CLOUD, { name: 'x', toolId: 'timetable', payload: {} }),
      () => deleteItem(NO_CLOUD, 'i1'),
    ]) {
      const r = await call();
      expect(r.ok).toBe(false);
      expect(r.message).toContain('Supabase');
    }
  });
});

describe('folders', () => {
  it('lists folders, mapping snake_case to camelCase and ordering by name', async () => {
    const calls = stubFetch(() => Promise.resolve(json(200, [folderRow])));
    const r = await listFolders(SETTINGS);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual([
      {
        id: 'f1',
        name: 'Term 1',
        parentId: null,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-02T00:00:00Z',
      },
    ]);
    expect(calls[0].url).toBe('https://proj.supabase.co/rest/v1/ucc_folders?select=*&order=name.asc');
    expect((calls[0].init!.headers as Record<string, string>).apikey).toBe('anon-key');
  });

  it('creates a folder with name + parent_id and returns the mapped row', async () => {
    const calls = stubFetch(() => Promise.resolve(json(201, [{ ...folderRow, parent_id: 'p9' }])));
    const r = await createFolder(SETTINGS, '  Term 1  ', 'p9');
    expect(r.ok).toBe(true);
    expect(r.data?.parentId).toBe('p9');
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body).toEqual({ name: 'Term 1', parent_id: 'p9' }); // trimmed
    expect((calls[0].init as RequestInit).method).toBe('POST');
  });

  it('renames and moves a folder via PATCH on its id', async () => {
    const calls = stubFetch(() => Promise.resolve(json(200, [folderRow])));
    await renameFolder(SETTINGS, 'f1', 'Renamed');
    await moveFolder(SETTINGS, 'f1', 'newparent');
    expect(calls[0].url).toContain('/ucc_folders?id=eq.f1');
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ name: 'Renamed' });
    expect(JSON.parse(calls[1].init!.body as string)).toEqual({ parent_id: 'newparent' });
  });

  it('refuses to move a folder into itself', async () => {
    const r = await moveFolder(SETTINGS, 'f1', 'f1');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('into itself');
  });

  it('deletes a folder (items move to root server-side)', async () => {
    const calls = stubFetch(() => Promise.resolve(json(204, undefined)));
    const r = await deleteFolder(SETTINGS, 'f1');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('moved to root');
    expect((calls[0].init as RequestInit).method).toBe('DELETE');
  });
});

describe('items', () => {
  it('lists item summaries (no payload column) filtered by tool and folder', async () => {
    const calls = stubFetch(() => Promise.resolve(json(200, [itemRow])));
    await listItems(SETTINGS, 'timetable', 'f1');
    expect(calls[0].url).toContain('select=id,name,tool_id,folder_id,created_at,updated_at');
    expect(calls[0].url).toContain('tool_id=eq.timetable');
    expect(calls[0].url).toContain('folder_id=eq.f1');
  });

  it('filters unfiled (root) items with folder_id=is.null', async () => {
    const calls = stubFetch(() => Promise.resolve(json(200, [])));
    await listItems(SETTINGS, 'timetable', null);
    expect(calls[0].url).toContain('folder_id=is.null');
  });

  it('loads one item WITH its payload', async () => {
    stubFetch(() => Promise.resolve(json(200, [itemRow])));
    const r = await loadItem(SETTINGS, 'i1');
    expect(r.ok).toBe(true);
    expect(r.data?.toolId).toBe('timetable');
    expect(r.data?.payload).toEqual({ version: 1, lessons: [] });
  });

  it('reports a missing item on load instead of returning empty data', async () => {
    stubFetch(() => Promise.resolve(json(200, [])));
    const r = await loadItem(SETTINGS, 'gone');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no longer exists');
  });

  it('creates an item with tool_id, folder_id, and payload', async () => {
    const calls = stubFetch(() => Promise.resolve(json(201, [itemRow])));
    const r = await createItem(SETTINGS, {
      name: 'Sem A timetable',
      toolId: 'timetable',
      folderId: 'f1',
      payload: { version: 1, lessons: [] },
    });
    expect(r.ok).toBe(true);
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body).toEqual({
      name: 'Sem A timetable',
      tool_id: 'timetable',
      folder_id: 'f1',
      payload: { version: 1, lessons: [] },
    });
  });

  it('renames, moves, and overwrites an item via PATCH', async () => {
    const calls = stubFetch(() => Promise.resolve(json(200, [itemRow])));
    await renameItem(SETTINGS, 'i1', 'New name');
    await moveItem(SETTINGS, 'i1', null);
    await overwriteItem(SETTINGS, 'i1', { version: 1, lessons: [1] });
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ name: 'New name' });
    expect(JSON.parse(calls[1].init!.body as string)).toEqual({ folder_id: null });
    expect(JSON.parse(calls[2].init!.body as string)).toEqual({ payload: { version: 1, lessons: [1] } });
  });

  it('surfaces a 404 with the "run the SQL" hint', async () => {
    stubFetch(() => Promise.resolve(json(404, { message: 'relation does not exist' })));
    const r = await listFolders(SETTINGS);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('schema.sql');
  });

  it('surfaces a 401 as an auth hint', async () => {
    stubFetch(() => Promise.resolve(json(401, { message: 'Invalid API key' })));
    const r = await listItems(SETTINGS, 'timetable');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Anon key');
  });
});
