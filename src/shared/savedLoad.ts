import type { SavedItem } from './savedItems';

// A one-slot hand-off so the global "My Saved Items" page can load an item
// into a tool it then navigates to. The page calls requestLoad(item) and
// navigates to the tool's route; the tool, on mount, calls consumeLoad(toolId)
// and applies the payload if one is waiting for it. Tool pages unmount on
// navigation, so a mount-time check is enough — no provider/subscription
// needed. Inline "Open" inside a tool skips this entirely (it applies the
// payload directly), so this only carries the cross-page case.

let pending: SavedItem | null = null;

/** Stash an item to be picked up by the tool it belongs to on its next mount. */
export function requestLoad(item: SavedItem): void {
  pending = item;
}

/** If an item is waiting for `toolId`, return it (once) and clear the slot. */
export function consumeLoad(toolId: string): SavedItem | null {
  if (pending && pending.toolId === toolId) {
    const item = pending;
    pending = null;
    return item;
  }
  return null;
}
