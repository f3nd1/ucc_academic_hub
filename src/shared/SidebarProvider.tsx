import { useCallback, useState, type ReactNode } from 'react';
import { loadSidebarCollapsed, saveSidebarCollapsed } from './sidebar';
import { SidebarCtx } from './sidebarStore';

/**
 * Single source of truth for whether the workspace sidebar is collapsed to an
 * icon rail. Sits above the router (like ThemeProvider) so the state survives
 * navigation between tools, and persists under "ucc:workspace:sidebarCollapsed"
 * so it is remembered across reloads, same pattern as the skin toggle.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(loadSidebarCollapsed);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    saveSidebarCollapsed(next);
  }, []);

  return (
    <SidebarCtx.Provider value={[collapsed, setCollapsed]}>
      {children}
    </SidebarCtx.Provider>
  );
}
