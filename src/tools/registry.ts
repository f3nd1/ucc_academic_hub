import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

/** Lifecycle badge shown on the tool's card and sidebar entry. */
export type ToolStatus = 'active' | 'new' | 'beta';

/**
 * One workspace tracker. This is the entire growth contract: to add a tool,
 * append a ToolDef here and create its page component. The sidebar, the Home
 * tools grid, and the routing table are all generated from this array, so
 * nothing else needs editing.
 */
export interface ToolDef {
  id: string;
  name: string;
  description: string;
  /** Tabler icon name (see src/shared/Icon.tsx for the rendered set). */
  icon: string;
  /** Route path, e.g. "/timetable". */
  path: string;
  status: ToolStatus;
  /** Lazily-loaded page; code for a tool is only fetched when first opened. */
  component: LazyExoticComponent<ComponentType>;
}

const timetable: ToolDef = {
  id: 'timetable',
  name: 'Timetable Generator',
  description:
    'Build course, module, or class-group timetables with a guided wizard — schedule modules, catch clashes, and export to PDF, Sheets, or calendar.',
  icon: 'calendar-event',
  path: '/timetable',
  status: 'active',
  component: lazy(() => import('./timetable/TimetablePage')),
};

export const TOOLS: ToolDef[] = [timetable];
