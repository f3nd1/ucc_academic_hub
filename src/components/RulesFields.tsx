import type { CourseForm, HolidayRow } from '../formModel';
import { emptyHolidayRow, holidayRowInvalid } from '../formModel';
import type { FirstDayOfWeek } from '../shared/settings';
import { formatDisplayDate } from '../shared/dates';
import { LabeledField } from './LabeledField';
import { Hint } from '../shared/help/Hint';
import { Tooltip } from '../shared/help/Tooltip';
import { TOOLTIPS, HINTS } from '../shared/help/helpText';

interface Props {
  form: CourseForm;
  update: (patch: Partial<CourseForm>) => void;
  firstDayOfWeek: FirstDayOfWeek;
  setFirstDayOfWeek: (day: FirstDayOfWeek) => void;
}

interface TableProps {
  label: string;
  helpKey: string;
  hintKey: string;
  rows: HolidayRow[];
  onChange: (rows: HolidayRow[]) => void;
}

/**
 * Editable holiday table: per-row date picker (stored ISO, shown alongside as
 * DD MMMM YYYY), optional name, a remove button per row, and an add-row
 * button. Rows with an unreal date flag inline; blank rows are ignored when
 * generating, so an empty table is fine.
 */
function HolidayTable({ label, helpKey, hintKey, rows, onChange }: TableProps) {
  const patchRow = (id: string, patch: Partial<HolidayRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="field">
      <span className="field__labelrow">
        <label>{label}</label>
        <Tooltip text={TOOLTIPS[helpKey]} />
      </span>

      <div className="holiday-table" role="group" aria-label={label}>
        {rows.length > 0 && (
          <div className="holiday-table__head">
            <span>Date</span>
            <span>Name (optional)</span>
            <span className="holiday-table__spacer" />
          </div>
        )}
        {rows.map((row) => {
          const invalid = holidayRowInvalid(row);
          return (
            <div className="holiday-table__rowwrap" key={row.id}>
              <div className="holiday-table__row">
                <span className="holiday-table__datecell">
                  <input
                    type="date"
                    aria-label={`${label} date`}
                    value={row.date}
                    className={invalid ? 'input--invalid' : undefined}
                    onChange={(e) => patchRow(row.id, { date: e.target.value })}
                  />
                  {row.date && !invalid && (
                    <span className="holiday-table__display">
                      {formatDisplayDate(row.date)}
                    </span>
                  )}
                </span>
                <input
                  aria-label={`${label} name`}
                  value={row.name}
                  placeholder="e.g. National Day"
                  onChange={(e) => patchRow(row.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  className="btn holiday-table__remove"
                  aria-label="Remove holiday"
                  title="Remove this holiday"
                  onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                >
                  –
                </button>
              </div>
              {invalid && (
                <p className="holiday-table__error" role="alert">
                  Not a real calendar date.
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn--demo holiday-table__add"
          onClick={() => onChange([...rows, emptyHolidayRow()])}
        >
          + Add holiday
        </button>
      </div>

      <Hint text={HINTS[hintKey]} />
    </div>
  );
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
        <HolidayTable
          label="UCC school holidays"
          helpKey="uccHolidays"
          hintKey="uccHolidays"
          rows={form.uccHolidays}
          onChange={(uccHolidays) => update({ uccHolidays })}
        />
        <HolidayTable
          label="Singapore public holidays"
          helpKey="publicHolidays"
          hintKey="publicHolidays"
          rows={form.publicHolidays}
          onChange={(publicHolidays) => update({ publicHolidays })}
        />
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
