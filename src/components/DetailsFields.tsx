import { TEACHER_LABEL } from '../constants';
import type { RawForm } from '../formModel';
import { LabeledField } from './LabeledField';
import { primaryNameLabel, type Scope } from '../wizard/wizardModel';

interface Props {
  form: RawForm;
  update: (patch: Partial<RawForm>) => void;
  scope: Scope;
}

/** The "Details" input group, shared by wizard Step 3 and the full form. */
export function DetailsFields({ form, update, scope }: Props) {
  const perMonthDisabled = form.mode !== 'permonth';
  return (
    <>
      <LabeledField id="courseName" label={primaryNameLabel(scope)} helpKey="primaryName">
        <input
          id="courseName"
          value={form.courseName}
          onChange={(e) => update({ courseName: e.target.value })}
          placeholder="e.g. Foundations of Data Science"
        />
      </LabeledField>

      <div className="grid-2">
        <LabeledField id="classGroup" label="Class group" helpKey="classGroup">
          <input
            id="classGroup"
            value={form.classGroup}
            onChange={(e) => update({ classGroup: e.target.value })}
            placeholder="e.g. DS-2026A"
          />
        </LabeledField>
        <LabeledField id="teacher" label={TEACHER_LABEL} helpKey="teacher">
          <input
            id="teacher"
            value={form.teacher}
            onChange={(e) => update({ teacher: e.target.value })}
            placeholder="e.g. Ms Tan"
          />
        </LabeledField>
      </div>

      <LabeledField id="classroom" label="Classroom" helpKey="classroom">
        <input
          id="classroom"
          value={form.classroom}
          onChange={(e) => update({ classroom: e.target.value })}
          placeholder="e.g. Room 3-01"
        />
      </LabeledField>

      <div className="grid-2">
        <LabeledField
          id="lessonNames"
          label="Lesson names (one per line)"
          helpKey="lessonNames"
          hintKey="lessonNames"
        >
          <textarea
            id="lessonNames"
            rows={4}
            value={form.lessonNamesRaw}
            onChange={(e) => update({ lessonNamesRaw: e.target.value })}
            placeholder={'Introduction\nData Types\nControl Flow'}
          />
        </LabeledField>
        <LabeledField
          id="activities"
          label="Activities (one per line, optional)"
          helpKey="activities"
          hintKey="activities"
        >
          <textarea
            id="activities"
            rows={4}
            value={form.activitiesRaw}
            onChange={(e) => update({ activitiesRaw: e.target.value })}
            placeholder={'Listening\nReading\nWriting'}
          />
        </LabeledField>
      </div>

      <div className="grid-2">
        <LabeledField id="totalLessons" label="Total lessons" helpKey="totalLessons">
          <input
            id="totalLessons"
            type="number"
            min={1}
            value={form.totalLessons}
            onChange={(e) => update({ totalLessons: e.target.value })}
            placeholder="e.g. 20"
          />
        </LabeledField>
        <LabeledField
          id="lessonsPerMonth"
          label="Lessons per month"
          helpKey="lessonsPerMonth"
          hintKey="lessonsPerMonth"
        >
          <input
            id="lessonsPerMonth"
            type="number"
            min={1}
            value={form.lessonsPerMonth}
            onChange={(e) => update({ lessonsPerMonth: e.target.value })}
            disabled={perMonthDisabled}
            placeholder={perMonthDisabled ? 'Per month mode only' : 'e.g. 8'}
          />
        </LabeledField>
      </div>

      <LabeledField label="Scheduling mode" helpKey="mode">
        <div className="segmented" role="group" aria-label="Scheduling mode">
          <button
            type="button"
            className={form.mode === 'weekday' ? 'active' : ''}
            aria-pressed={form.mode === 'weekday'}
            onClick={() => update({ mode: 'weekday' })}
          >
            Every weekday
          </button>
          <button
            type="button"
            className={form.mode === 'permonth' ? 'active' : ''}
            aria-pressed={form.mode === 'permonth'}
            onClick={() => update({ mode: 'permonth' })}
          >
            Per month
          </button>
        </div>
      </LabeledField>

      <div className="grid-3">
        <LabeledField id="startDate" label="Start date" helpKey="startDate">
          <input
            id="startDate"
            type="date"
            value={form.startDate}
            onChange={(e) => update({ startDate: e.target.value })}
          />
        </LabeledField>
        <LabeledField id="startTime" label="Start time" helpKey="startTime">
          <input
            id="startTime"
            type="time"
            value={form.startTime}
            onChange={(e) => update({ startTime: e.target.value })}
          />
        </LabeledField>
        <LabeledField id="endTime" label="End time" helpKey="endTime">
          <input
            id="endTime"
            type="time"
            value={form.endTime}
            onChange={(e) => update({ endTime: e.target.value })}
          />
        </LabeledField>
      </div>
    </>
  );
}
