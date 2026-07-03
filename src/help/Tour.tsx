import { useEffect, useLayoutEffect, useState } from 'react';
import { useHelp } from './helpStore';
import { TOUR_STEPS } from './helpText';

/**
 * First-run guided tour. Highlights target elements (by data-tour selector) and
 * walks through them with Back / Next / Skip / Don't show again. Independent of
 * the master Help toggle's tooltips/hints, but suppressed when help is off.
 */
export function Tour() {
  const { tourOpen, helpEnabled, closeTour } = useHelp();
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = TOUR_STEPS[idx];
  const isLast = idx === TOUR_STEPS.length - 1;

  // Reset to the first step whenever the tour (re)opens.
  useEffect(() => {
    if (tourOpen) setIdx(0);
  }, [tourOpen]);

  // Locate + highlight the current step's target element.
  useLayoutEffect(() => {
    if (!tourOpen) return;
    const measure = () => {
      const el = step.selector
        ? document.querySelector(step.selector)
        : null;
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [tourOpen, idx, step.selector]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tourOpen) closeTour(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourOpen, closeTour]);

  if (!tourOpen || !helpEnabled) return null;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="tour__backdrop" />
      {rect && (
        <div
          className="tour__ring"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div className="tour__card">
        <div className="tour__step">
          Step {idx + 1} of {TOUR_STEPS.length}
        </div>
        <h3 className="tour__title">{step.title}</h3>
        <p className="tour__body">{step.body}</p>
        <div className="tour__actions">
          <button
            type="button"
            className="linkbtn"
            onClick={() => closeTour(true)}
          >
            Don't show again
          </button>
          <div className="tour__nav">
            <button
              type="button"
              className="btn"
              onClick={() => closeTour(false)}
            >
              Skip
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
            >
              Back
            </button>
            {isLast ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => closeTour(true)}
              >
                Finish
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setIdx((i) => Math.min(TOUR_STEPS.length - 1, i + 1))}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
