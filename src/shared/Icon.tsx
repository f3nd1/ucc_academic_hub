// Tiny inline-SVG icon set. ToolDef.icon carries a Tabler icon NAME (the
// project's icon vocabulary); this component renders the matching 24×24 stroke
// glyph without pulling in the whole @tabler/icons-react dependency (which the
// sandbox network policy would block). Add a tool's icon here when registering
// it. Paths are the real Tabler outlines so swapping in the library later is a
// drop-in.

const PATHS: Record<string, string[]> = {
  'layout-grid': [
    'M4 4h6v6h-6z',
    'M14 4h6v6h-6z',
    'M4 14h6v6h-6z',
    'M14 14h6v6h-6z',
  ],
  'calendar-event': [
    'M4 5m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z',
    'M16 3v4',
    'M8 3v4',
    'M4 11h16',
    'M8 15h2v2h-2z',
  ],
  'clipboard-check': [
    'M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2',
    'M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z',
    'M9 14l2 2l4 -4',
  ],
  settings: [
    'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z',
    'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
  ],
  plus: ['M12 5l0 14', 'M5 12l14 0'],
};

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

/** Render a named icon as an inline SVG; unknown names render nothing. */
export function Icon({ name, size = 20, className }: IconProps) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
