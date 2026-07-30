import { createContext, useContext } from 'react';

export type SidebarContextValue = [boolean, (collapsed: boolean) => void];

export const SidebarCtx = createContext<SidebarContextValue | null>(null);

/** Whether the workspace sidebar is collapsed to an icon rail, + setter. */
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarCtx);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
  return ctx;
}
