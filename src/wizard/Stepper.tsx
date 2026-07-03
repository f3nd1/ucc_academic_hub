interface Props {
  steps: readonly string[];
  current: number;
  onSelect: (index: number) => void;
}

/** Horizontal progress stepper. Back steps are always clickable. */
export function Stepper({ steps, current, onSelect }: Props) {
  return (
    <ol className="stepper" data-tour="stepper">
      {steps.map((label, i) => {
        const state =
          i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={label} className={`stepper__item stepper__item--${state}`}>
            <button
              type="button"
              className="stepper__btn"
              onClick={() => onSelect(i)}
              aria-current={i === current ? 'step' : undefined}
            >
              <span className="stepper__num">{i + 1}</span>
              <span className="stepper__label">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
