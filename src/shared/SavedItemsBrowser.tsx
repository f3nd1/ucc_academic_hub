import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettings } from './settingsStore';
import { Hint } from './help/Hint';
import { Icon } from './Icon';
import { formatDisplayDate } from './dates';
import {
  listFolders,
  listItems,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  loadItem,
  renameItem,
  moveItem,
  deleteItem,
  type Folder,
  type SavedItem,
  type SavedItemSummary,
} from './savedItems';

/** Left-panel selection: all items, unfiled (root), or a specific folder. */
type Selection = 'all' | 'root' | { folderId: string };

interface Props {
  /** Restrict to one tool's items; omit to show every tool's items. */
  toolId?: string;
  /** Called with the fully-loaded item (payload included) on "Load". */
  onLoad?: (item: SavedItem) => void;
  /** Human labels per toolId, shown in the item list when not tool-scoped. */
  toolNames?: Record<string, string>;
  /** Rendered in the item row's Load button (e.g. "Open"). */
  loadLabel?: string;
}

interface TreeNode {
  folder: Folder;
  children: TreeNode[];
}

/** Build a nested tree from the flat folder list (orphans surface at root). */
function buildTree(folders: Folder[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const f of folders) byId.set(f.id, { folder: f, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.folder.parentId ? byId.get(node.folder.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** All folder ids in the subtree under `id` (excluding `id`) — a folder may not
 *  be moved into itself or any of these, which would create a cycle. */
function descendantIds(id: string, folders: Folder[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const arr = childrenOf.get(f.parentId) ?? [];
    arr.push(f.id);
    childrenOf.set(f.parentId, arr);
  }
  const out = new Set<string>();
  const stack = [...(childrenOf.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(childrenOf.get(cur) ?? []));
  }
  return out;
}

/** Flatten folders to "— " indented options for the Move pickers. */
function folderOptions(folders: Folder[]): { id: string; label: string }[] {
  const tree = buildTree(folders);
  const out: { id: string; label: string }[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ id: n.folder.id, label: `${'— '.repeat(depth)}${n.folder.name}` });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}

/**
 * Shared file-manager: folder tree on the left, saved items on the right, with
 * create / rename / move / delete for both. Used identically by the global
 * "My Saved Items" page and by each tool's inline "Open" panel — pass a toolId
 * to scope it to one tool, and onLoad to receive the chosen item.
 */
export function SavedItemsBrowser({ toolId, onLoad, toolNames, loadLabel = 'Load' }: Props) {
  const [settings] = useSettings();
  const configured =
    settings.supabaseUrl.trim() !== '' && settings.supabaseAnonKey.trim() !== '';

  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<SavedItemSummary[]>([]);
  const [selection, setSelection] = useState<Selection>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Inline-edit state (folder or item rename).
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null);
  const [editingItem, setEditingItem] = useState<{ id: string; name: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingUnder, setCreatingUnder] = useState<string | null | 'root'>(null);

  const say = (ok: boolean, text: string) => setNotice({ ok, text });

  const refreshFolders = useCallback(async () => {
    const r = await listFolders(settings);
    if (r.ok && r.data) setFolders(r.data);
    else if (!r.ok) say(false, r.message);
  }, [settings]);

  const refreshItems = useCallback(async () => {
    const folderId =
      selection === 'all' ? undefined : selection === 'root' ? null : selection.folderId;
    const r = await listItems(settings, toolId, folderId);
    if (r.ok && r.data) setItems(r.data);
    else if (!r.ok) say(false, r.message);
  }, [settings, toolId, selection]);

  useEffect(() => {
    if (configured) void refreshFolders();
  }, [configured, refreshFolders]);
  useEffect(() => {
    if (configured) void refreshItems();
  }, [configured, refreshItems]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // --- Folder actions ---
  const doCreateFolder = async (parentId: string | null) => {
    if (!newFolderName.trim()) return;
    setBusy(true);
    const r = await createFolder(settings, newFolderName, parentId);
    setBusy(false);
    say(r.ok, r.message);
    if (r.ok) {
      setNewFolderName('');
      setCreatingUnder(null);
      if (parentId) setExpanded((p) => new Set(p).add(parentId));
      await refreshFolders();
    }
  };

  const doRenameFolder = async () => {
    if (!editingFolder) return;
    setBusy(true);
    const r = await renameFolder(settings, editingFolder.id, editingFolder.name);
    setBusy(false);
    say(r.ok, r.message);
    if (r.ok) {
      setEditingFolder(null);
      await refreshFolders();
    }
  };

  const doMoveFolder = async (id: string, parentId: string | null) => {
    setBusy(true);
    const r = await moveFolder(settings, id, parentId);
    setBusy(false);
    say(r.ok, r.message);
    if (r.ok) await refreshFolders();
  };

  const doDeleteFolder = async (folder: Folder) => {
    if (
      !window.confirm(
        `Delete folder "${folder.name}"? Its items and any subfolders move to root — they are not deleted.`,
      )
    )
      return;
    setBusy(true);
    const r = await deleteFolder(settings, folder.id);
    setBusy(false);
    say(r.ok, r.message);
    if (r.ok) {
      if (typeof selection !== 'string' && selection.folderId === folder.id) setSelection('all');
      await refreshFolders();
      await refreshItems();
    }
  };

  // --- Item actions ---
  const doLoad = async (id: string) => {
    setBusy(true);
    const r = await loadItem(settings, id);
    setBusy(false);
    if (!r.ok || !r.data) {
      say(false, r.message);
      return;
    }
    onLoad?.(r.data);
  };

  const doRenameItem = async () => {
    if (!editingItem) return;
    setBusy(true);
    const r = await renameItem(settings, editingItem.id, editingItem.name);
    setBusy(false);
    say(r.ok, r.message);
    if (r.ok) {
      setEditingItem(null);
      await refreshItems();
    }
  };

  const doMoveItem = async (id: string, folderId: string | null) => {
    setBusy(true);
    const r = await moveItem(settings, id, folderId);
    setBusy(false);
    say(r.ok, r.message);
    if (r.ok) await refreshItems();
  };

  const doDeleteItem = async (item: SavedItemSummary) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setBusy(true);
    const r = await deleteItem(settings, item.id);
    setBusy(false);
    say(r.ok, r.message);
    if (r.ok) await refreshItems();
  };

  const tree = useMemo(() => buildTree(folders), [folders]);
  const pickerOptions = useMemo(() => folderOptions(folders), [folders]);

  const currentFolderName =
    selection === 'all'
      ? 'All items'
      : selection === 'root'
        ? 'Unfiled'
        : (folders.find((f) => f.id === selection.folderId)?.name ?? 'Folder');

  if (!configured) {
    return (
      <div className="banner banner--warn" role="note">
        Cloud storage isn't set up yet. Add your Supabase Project URL and Anon
        key in <strong>Settings → Cloud sync</strong> to save and organise items.
      </div>
    );
  }

  const renderNode = (node: TreeNode, depth: number) => {
    const { folder } = node;
    const isSelected = typeof selection !== 'string' && selection.folderId === folder.id;
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(folder.id);
    return (
      <li key={folder.id} className="si-tree__node">
        <div
          className={`si-tree__row${isSelected ? ' si-tree__row--active' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <button
            type="button"
            className="si-tree__twist"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            onClick={() => toggleExpand(folder.id)}
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
          >
            <Icon name="chevron-right" size={14} className={isOpen ? 'si-tree__twist--open' : ''} />
          </button>

          {editingFolder?.id === folder.id ? (
            <input
              className="si-inline"
              autoFocus
              value={editingFolder.name}
              onChange={(e) => setEditingFolder({ id: folder.id, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doRenameFolder();
                if (e.key === 'Escape') setEditingFolder(null);
              }}
              onBlur={doRenameFolder}
              aria-label="Folder name"
            />
          ) : (
            <button
              type="button"
              className="si-tree__name"
              onClick={() => setSelection({ folderId: folder.id })}
            >
              <Icon name={isSelected ? 'folder-open' : 'folder'} size={16} />
              <span>{folder.name}</span>
            </button>
          )}

          <span className="si-tree__actions">
            <button
              type="button"
              className="linkbtn"
              title="New subfolder"
              onClick={() => {
                setCreatingUnder(folder.id);
                setNewFolderName('');
                setExpanded((p) => new Set(p).add(folder.id));
              }}
            >
              +
            </button>
            <button
              type="button"
              className="linkbtn"
              title="Rename"
              onClick={() => setEditingFolder({ id: folder.id, name: folder.name })}
            >
              Rename
            </button>
            <label className="si-move-field">
              <span className="si-move-label">Move to</span>
              <select
                className="si-move"
                aria-label={`Move folder "${folder.name}" to`}
                value={folder.parentId ?? ''}
                onChange={(e) => doMoveFolder(folder.id, e.target.value || null)}
              >
                <option value="">Unfiled (root)</option>
                {pickerOptions
                  .filter(
                    (o) =>
                      o.id !== folder.id &&
                      !descendantIds(folder.id, folders).has(o.id),
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="linkbtn si-danger"
              title="Delete this folder (its items move to root)"
              onClick={() => doDeleteFolder(folder)}
            >
              Delete
            </button>
          </span>
        </div>

        {creatingUnder === folder.id && (
          <div className="si-newfolder" style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}>
            <input
              className="si-inline"
              autoFocus
              placeholder="New subfolder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doCreateFolder(folder.id);
                if (e.key === 'Escape') setCreatingUnder(null);
              }}
            />
            <button type="button" className="btn" disabled={busy} onClick={() => doCreateFolder(folder.id)}>
              Add
            </button>
            <button type="button" className="linkbtn" onClick={() => setCreatingUnder(null)}>
              Cancel
            </button>
          </div>
        )}

        {hasChildren && isOpen && (
          <ul className="si-tree__children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="saved-items">
      <div className="saved-items__hint">
        <Hint text="Save your current work here to reopen it later. Group items into folders; deleting a folder keeps its items (they move to root)." />
      </div>

      {notice && (
        <div className={`banner ${notice.ok ? 'banner--ok' : 'banner--error'}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="saved-items__cols">
        {/* -------- Folder tree -------- */}
        <aside className="si-folders">
          <div className="si-folders__head">
            <span>Folders</span>
            <button
              type="button"
              className="btn btn--demo"
              onClick={() => {
                setCreatingUnder('root');
                setNewFolderName('');
              }}
            >
              + New folder
            </button>
          </div>

          <ul className="si-tree">
            <li>
              <button
                type="button"
                className={`si-tree__name si-tree__root${selection === 'all' ? ' si-tree__row--active' : ''}`}
                onClick={() => setSelection('all')}
              >
                <Icon name="layout-grid" size={16} />
                <span>All items</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`si-tree__name si-tree__root${selection === 'root' ? ' si-tree__row--active' : ''}`}
                onClick={() => setSelection('root')}
              >
                <Icon name="folder" size={16} />
                <span>Unfiled</span>
              </button>
            </li>
          </ul>

          {creatingUnder === 'root' && (
            <div className="si-newfolder">
              <input
                className="si-inline"
                autoFocus
                placeholder="New folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doCreateFolder(null);
                  if (e.key === 'Escape') setCreatingUnder(null);
                }}
              />
              <button type="button" className="btn" disabled={busy} onClick={() => doCreateFolder(null)}>
                Add
              </button>
              <button type="button" className="linkbtn" onClick={() => setCreatingUnder(null)}>
                Cancel
              </button>
            </div>
          )}

          {tree.length === 0 ? (
            <p className="si-empty">No folders yet. Create one to organise your items.</p>
          ) : (
            <ul className="si-tree">{tree.map((n) => renderNode(n, 0))}</ul>
          )}
        </aside>

        {/* -------- Item list -------- */}
        <section className="si-items">
          <div className="si-items__head">
            <h3>{currentFolderName}</h3>
            <span className="si-items__count">
              {items.length} item{items.length === 1 ? '' : 's'}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="si-empty">
              {selection === 'all'
                ? 'Nothing saved yet. Use the Save button in a tool to add items here.'
                : 'No items in this folder yet.'}
            </p>
          ) : (
            <ul className="si-list">
              {items.map((item) => (
                <li key={item.id} className="si-row">
                  <div className="si-row__main">
                    {editingItem?.id === item.id ? (
                      <input
                        className="si-inline"
                        autoFocus
                        value={editingItem.name}
                        onChange={(e) => setEditingItem({ id: item.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void doRenameItem();
                          if (e.key === 'Escape') setEditingItem(null);
                        }}
                        onBlur={doRenameItem}
                        aria-label="Item name"
                      />
                    ) : (
                      <span className="si-row__name">{item.name}</span>
                    )}
                    <span className="si-row__meta">
                      {!toolId && toolNames?.[item.toolId] && (
                        <span className="si-row__tool">{toolNames[item.toolId]}</span>
                      )}
                      Updated {formatDisplayDate(item.updatedAt.slice(0, 10))}
                    </span>
                  </div>
                  <div className="si-row__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busy || !onLoad}
                      onClick={() => doLoad(item.id)}
                    >
                      {loadLabel}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setEditingItem({ id: item.id, name: item.name })}
                    >
                      Rename
                    </button>
                    <label className="si-move-field">
                      <span className="si-move-label">Move to</span>
                      <select
                        className="si-move"
                        aria-label={`Move "${item.name}" to folder`}
                        value={item.folderId ?? ''}
                        onChange={(e) => doMoveItem(item.id, e.target.value || null)}
                      >
                        <option value="">Unfiled (root)</option>
                        {pickerOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn si-danger"
                      onClick={() => doDeleteItem(item)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
