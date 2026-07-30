import { loadNamespaced, saveNamespaced } from './persistence';

// Persisted under the workspace namespace: localStorage "ucc:workspace:sidebarCollapsed".
const TOOL_ID = 'workspace';
const KEY = 'sidebarCollapsed';

export function loadSidebarCollapsed(): boolean {
  return loadNamespaced<boolean>(TOOL_ID, KEY, false);
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  saveNamespaced(TOOL_ID, KEY, collapsed);
}
