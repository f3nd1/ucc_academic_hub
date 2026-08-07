import { useId, useState } from 'react';
import type { CourseForm, HolidayRow } from '../formModel';
import { emptyHolidayRow, holidayRowInvalid } from '../formModel';
import { holidayTemplateCsv, importHolidayRows } from '../holidayImport';
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
  const uploadId = useId();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(
    null,
  );

  const patchRow = (id: string, patch: Partial<HolidayRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  /**
   * Hand over a filled-in example of exactly what the uploader accepts. CSV
   * rather than .xlsx so this stays a plain Blob — pulling SheetJS in just to
   * WRITE four rows would load a ~400 kB parser for a file the uploader reads
   * back as text anyway.
   */
  const downloadTemplate = () => {
    // The BOM keeps Excel from mangling the file when it opens a bare CSV.
    const blob = new Blob([`﻿${holidayTemplateCsv()}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'holiday-upload-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /**
   * Read an .xlsx/.csv of Date + optional Name and APPEND its rows. SheetJS is
   * imported dynamically so a ~400 kB parser only loads for someone who
   * actually uploads a file, rather than riding along in the timetable chunk
   * for everyone.
   *
   * `cellDates` gets real .xlsx date cells back as Date objects, which carry
   * no day/month ambiguity. `raw` is load-bearing and must stay: without it
   * SheetJS parses CSV text itself, and it reads a slashed date MONTH-first
   * (02/09/2026 became 9 February, not 2 September) and silently rolls an
   * impossible one over (2026-02-30 became 2 March) before our own validation
   * ever sees it. With `raw` the CSV cell arrives as the original string and
   * toIsoDate applies the day-first reading and the real-calendar-date check
   * the manual date pickers use. It does not affect .xlsx date cells.
   */
  const upload = async (file: File) => {
    setStatus(null);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        cellDates: true,
        raw: true,
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) {
        setStatus({ text: 'That file has no sheets to read.', error: true });
        return;
      }
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: '',
      });
      const result = importHolidayRows(matrix, rows);
      if (result.rows.length > 0) onChange([...rows, ...result.rows]);
      setStatus({
        text: result.summary,
        error: result.added === 0 && result.invalidRows.length > 0,
      });
    } catch (err) {
      setStatus({
        text: `Could not read that file: ${
          err instanceof Error ? err.message : String(err)
        }`,
        error: true,
      });
    }
  };

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
        <div className="holiday-table__actions">
          <button
            type="button"
            className="btn btn--demo holiday-table__add"
            onClick={() => onChange([...rows, emptyHolidayRow()])}
          >
            + Add holiday
          </button>
          {/* A fast-entry path alongside the manual table, never a
              replacement for it: uploaded rows append to whatever is
              already there. The input is ordered BEFORE its label so the
              focus-visible sibling rule in App.css can reach it. */}
          <input
            id={uploadId}
            type="file"
            className="holiday-table__file"
            accept=".xlsx,.xls,.csv"
            aria-label={`Upload ${label} from a spreadsheet`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear the input so re-picking the same file fires onChange again.
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
          <label className="btn btn--demo holiday-table__upload" htmlFor={uploadId}>
            Upload from file
          </label>
          <button
            type="button"
            className="linkbtn"
            onClick={downloadTemplate}
          >
            Download template
          </button>
        </div>
        <p className="hint holiday-table__uploadhint">
          Excel or CSV with a Date column and an optional Name column.{' '}
          <strong>Date format: DD/MM/YYYY</strong> (09/08/2026 is 9 August).
          Name is optional. Rows are added to the table above; dates already
          listed are skipped.
        </p>
        {status && (
          <p
            className={`holiday-table__status${status.error ? ' holiday-table__status--error' : ''}`}
            role="status"
          >
            {status.text}
          </p>
        )}
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
