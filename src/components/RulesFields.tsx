import type { CourseForm } from '../formModel';
import type { FirstDayOfWeek } from '../settings';
import { LabeledField } from './LabeledField';

interface Props {
  form: CourseForm;
  update: (patch: Partial<CourseForm>) => void;
  firstDayOfWeek: FirstDayOfWeek;
  setFirstDayOfWeek: (day: FirstDayOfWeek) => void;
}

/** The "Calendar rules" input group, shared by wizard Step 4 and the full form. */
export function RulesFields({
  form,
  update,
  firstDayOfWeek,
  setFirstDayOfWeek,
}: Props) {
  return (
    <>
      <div className="grid-2">
        <LabeledField
          id="uccHolidays"
          label="UCC school holidays (one per line, optional name)"
          helpKey="uccHolidays"
          hintKey="uccHolidays"
        >
          <textarea
            id="uccHolidays"
            rows={4}
            value={form.uccHolidaysRaw}
            onChange={(e) => update({ uccHolidaysRaw: e.target.value })}
            placeholder={'2026-09-01, Term Break\n2026-09-02'}
          />
        </LabeledField>
        <LabeledField
          id="publicHolidays"
          label="Singapore public holidays (one per line, optional name)"
          helpKey="publicHolidays"
          hintKey="publicHolidays"
        >
          <textarea
            id="publicHolidays"
            rows={4}
            value={form.publicHolidaysRaw}
            onChange={(e) => update({ publicHolidaysRaw: e.target.value })}
            placeholder={'2026-08-09, National Day\n2026-12-25, Christmas'}
          />
        </LabeledField>
      </div>

      <LabeledField label="First day of week" helpKey="firstDayOfWeek">
        <div className="radio-row">
          {(['monday', 'sunday'] as FirstDayOfWeek[]).map((day) => (
            <label className="radio" key={day}>
              <input
                type="radio"
                name="wizardFirstDay"
                checked={firstDayOfWeek === day}
                onChange={() => setFirstDayOfWeek(day)}
              />
              {day === 'monday' ? 'Monday' : 'Sunday'}
            </label>
          ))}
        </div>
      </LabeledField>
    </>
  );
}
