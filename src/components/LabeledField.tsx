import type { ReactNode } from 'react';
import { Tooltip } from '../help/Tooltip';
import { Hint } from '../help/Hint';
import { TOOLTIPS, HINTS } from '../help/helpText';

interface Props {
  id?: string;
  label: ReactNode;
  /** Key into TOOLTIPS; shows an info tooltip when help is on. */
  helpKey?: string;
  /** Key into HINTS; shows an inline hint when help is on. */
  hintKey?: string;
  children: ReactNode;
}

/** Field shell: label (+ optional tooltip) above the control, hint below. */
export function LabeledField({ id, label, helpKey, hintKey, children }: Props) {
  const tip = helpKey ? TOOLTIPS[helpKey] : undefined;
  const hint = hintKey ? HINTS[hintKey] : undefined;
  return (
    <div className="field">
      <span className="field__labelrow">
        <label htmlFor={id}>{label}</label>
        {tip && <Tooltip text={tip} />}
      </span>
      {children}
      {hint && <Hint text={hint} />}
    </div>
  );
}
