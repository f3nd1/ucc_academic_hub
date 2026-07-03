import { useId, useState } from 'react';
import { useHelp } from './helpStore';

interface Props {
  text: string;
}

/**
 * Accessible info tooltip: a focusable button revealing a short description on
 * hover or focus, linked via aria-describedby and dismissible with Escape.
 * Renders nothing when the master Help toggle is off.
 */
export function Tooltip({ text }: Props) {
  const { helpEnabled } = useHelp();
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!helpEnabled) return null;

  return (
    <span className="tip">
      <button
        type="button"
        className="tip__btn"
        aria-label="More information"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        i
      </button>
      {open && (
        <span role="tooltip" id={id} className="tip__bubble">
          {text}
        </span>
      )}
    </span>
  );
}
