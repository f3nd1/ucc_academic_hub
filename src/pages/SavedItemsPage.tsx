import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOOLS } from '../tools/registry';
import { SavedItemsBrowser } from '../shared/SavedItemsBrowser';
import { requestLoad } from '../shared/savedLoad';
import type { SavedItem } from '../shared/savedItems';

/**
 * Global "My Saved Items" — every tool's saved items and folders in one place.
 * "Open" hands the item to the load bus and navigates to its tool, which picks
 * it up on mount. Registered as a plain page (not a tool-registry entry) since
 * it's cross-cutting infrastructure, not a tracker.
 */
export function SavedItemsPage() {
  const navigate = useNavigate();

  const { toolNames, toolPath } = useMemo(() => {
    const toolNames: Record<string, string> = {};
    const toolPath: Record<string, string> = {};
    for (const t of TOOLS) {
      toolNames[t.id] = t.name;
      toolPath[t.id] = t.path;
    }
    return { toolNames, toolPath };
  }, []);

  const onLoad = (item: SavedItem) => {
    const path = toolPath[item.toolId];
    if (!path) {
      window.alert(
        `This item was saved by a tool ("${item.toolId}") that isn't available here.`,
      );
      return;
    }
    requestLoad(item);
    navigate(path);
  };

  return (
    <div className="panel saved-items-page">
      <header className="saved-items-page__head">
        <h1>My Saved Items</h1>
        <p className="chg-sub">
          Everything you've saved from any tracker, organised into folders. Open
          an item to load it back into its tool. All dates show as DD MMMM YYYY.
        </p>
      </header>
      <SavedItemsBrowser onLoad={onLoad} toolNames={toolNames} loadLabel="Open" />
    </div>
  );
}

export default SavedItemsPage;
