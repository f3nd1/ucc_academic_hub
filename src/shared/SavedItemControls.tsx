import { useEffect, useMemo, useState } from 'react';
import { useSettings } from './settingsStore';
import { SavedItemsBrowser } from './SavedItemsBrowser';
import { consumeLoad } from './savedLoad';
import {
  listFolders,
  createItem,
  overwriteItem,
  type Folder,
  type SavedItem,
  type LoadedItem,
} from './savedItems';

interface Props {
  toolId: string;
  /** Whether there is anything worth saving right now (e.g. a generated result). */
  canSave: boolean;
  /** Build the JSON payload to persist for the current tool state. */
  buildPayload: () => unknown;
  /** Apply a loaded payload back into the tool's state. */
  applyPayload: (payload: unknown) => void;
  /** The item currently loaded/saved (enables "Save over this one"). */
  loaded: LoadedItem | null;
  setLoaded: (v: LoadedItem | null) => void;
  /** Called after a successful save (create or overwrite) — e.g. to reset a
   *  tool's "unsaved changes" baseline. */
  onAfterSave?: () => void;
}

function folderPickerOptions(folders: Folder[]): { id: string; label: string }[] {
  // Flat, name-sorted; depth prefix keeps nested folders readable.
  const byId = new Map(folders.map((f) => [f.id, f]));
  const depth = (f: Folder): number => {
    let d = 0;
    let cur: Folder | undefined = f;
    while (cur?.parentId) {
      cur = byId.get(cur.parentId);
      d++;
      if (d > 50) break;
    }
    return d;
  };
  return [...folders]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({ id: f.id, label: `${'— '.repeat(depth(f))}${f.name}` }));
}

/**
 * Shared Save / Open controls for any tool. Renders the two buttons plus their
 * dialogs, handles "Save as new" / "Save (overwrite)", and — on mount — picks
 * up any item handed over from the global "My Saved Items" page (via the load
 * bus) and applies it. Tools drop this in with a buildPayload/applyPayload pair.
 */
export function SavedItemControls({
  toolId,
  canSave,
  buildPayload,
  applyPayload,
  loaded,
  setLoaded,
  onAfterSave,
}: Props) {
  const [settings] = useSettings();
  const configured =
    settings.supabaseUrl.trim() !== '' && settings.supabaseAnonKey.trim() !== '';

  const [openBrowser, setOpenBrowser] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Pick up a cross-page "Open" hand-off from the global Saved Items page.
  useEffect(() => {
    const item = consumeLoad(toolId);
    if (item) {
      applyPayload(item.payload);
      setLoaded({ id: item.id, name: item.name });
    }
    // Run once on mount — the bus is drained on read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickerOptions = useMemo(() => folderPickerOptions(folders), [folders]);

  const openSaveDialog = async () => {
    setNotice(null);
    setName(loaded?.name ?? '');
    setFolderId('');
    setSaveOpen(true);
    const r = await listFolders(settings);
    if (r.ok && r.data) setFolders(r.data);
  };

  const doSaveNew = async () => {
    setBusy(true);
    const r = await createItem(settings, {
      name,
      toolId,
      folderId: folderId || null,
      payload: buildPayload(),
    });
    setBusy(false);
    setNotice({ ok: r.ok, text: r.message });
    if (r.ok && r.data) {
      setLoaded({ id: r.data.id, name: r.data.name });
      onAfterSave?.();
      setSaveOpen(false);
    }
  };

  const doOverwrite = async () => {
    if (!loaded) return;
    setBusy(true);
    const r = await overwriteItem(settings, loaded.id, buildPayload());
    setBusy(false);
    setNotice({ ok: r.ok, text: r.message });
    if (r.ok) {
      onAfterSave?.();
      setSaveOpen(false);
    }
  };

  const onBrowserLoad = (item: SavedItem) => {
    applyPayload(item.payload);
    setLoaded({ id: item.id, name: item.name });
    setOpenBrowser(false);
    setNotice({ ok: true, text: `Opened "${item.name}".` });
  };

  const saveTitle = configured
    ? undefined
    : 'Set up Supabase cloud storage in Settings to save items.';

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={openSaveDialog}
        disabled={!canSave || !configured}
        title={!canSave ? 'Nothing to save yet.' : saveTitle}
      >
        {loaded ? 'Save' : 'Save…'}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => setOpenBrowser(true)}
        disabled={!configured}
        title={saveTitle}
      >
        Open…
      </button>

      {notice && !saveOpen && !openBrowser && (
        <span className={`si-flash ${notice.ok ? 'si-flash--ok' : 'si-flash--err'}`}>
          {notice.text}
        </span>
      )}

      {/* -------- Save dialog -------- */}
      {saveOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Save item">
          <div className="modal__backdrop" onClick={() => setSaveOpen(false)} />
          <div className="modal__panel modal__panel--narrow">
            <div className="modal__head">
              <h3>Save</h3>
              <button type="button" className="linkbtn" onClick={() => setSaveOpen(false)}>
                Close
              </button>
            </div>
            <div className="field">
              <label htmlFor="si-save-name">Name</label>
              <input
                id="si-save-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Semester A — Data Science"
              />
            </div>
            <div className="field">
              <label htmlFor="si-save-folder">Folder</label>
              <select
                id="si-save-folder"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                <option value="">Unfiled (root)</option>
                {pickerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {notice && (
              <div className={`banner ${notice.ok ? 'banner--ok' : 'banner--error'}`} role="status">
                {notice.text}
              </div>
            )}
            <div className="actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !name.trim()}
                onClick={doSaveNew}
              >
                {loaded ? 'Save as new' : 'Save'}
              </button>
              {loaded && (
                <button type="button" className="btn" disabled={busy} onClick={doOverwrite}>
                  Save over "{loaded.name}"
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------- Open browser -------- */}
      {openBrowser && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Open saved item">
          <div className="modal__backdrop" onClick={() => setOpenBrowser(false)} />
          <div className="modal__panel">
            <div className="modal__head">
              <h3>Open a saved item</h3>
              <button type="button" className="linkbtn" onClick={() => setOpenBrowser(false)}>
                Close
              </button>
            </div>
            <SavedItemsBrowser toolId={toolId} onLoad={onBrowserLoad} loadLabel="Open" />
          </div>
        </div>
      )}
    </>
  );
}
