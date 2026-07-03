import { useHelp } from './helpStore';

/** Muted one-line hint under a field. Hidden when the Help toggle is off. */
export function Hint({ text }: { text: string }) {
  const { helpEnabled } = useHelp();
  if (!helpEnabled) return null;
  return <p className="hint">{text}</p>;
}
