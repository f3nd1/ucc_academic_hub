import { TEACHER_LABEL, CLASS_GROUP_LABEL } from '../constants';
import type { CourseForm, ModuleForm } from '../formModel';
import { LabeledField } from './LabeledField';
import { primaryNameLabel, type Scope } from '../wizard/wizardModel';

interface Props {
  form: CourseForm;
  update: (patch: Partial<CourseForm>) => void;
  updateModule: (id: string, patch: Partial<ModuleForm>) => void;
  addModule: () => void;
  duplicateModule: (id: string) => void;
  removeModule: (id: string) => void;
  scope: Scope;
}

/**
 * The "Details" input group, shared by wizard Step 3 and the full form.
 * Course-level fields first, then one editor block per module. "Per course"
 * scope exposes add/remove module rows; the other scopes edit a single module
 * whose name comes from the primary field.
 */
export function DetailsFields({
  form,
  update,
  updateModule,
  addModule,
  duplicateModule,
  removeModule,
  scope,
}: Props) {
  const multi = scope === 'course';
  const showModuleName = multi || form.modules.length > 1;

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

      {form.modules.map((mod, i) => (
        <fieldset className="module" key={mod.id}>
          <legend className="module__legend">
            {multi ? `Module ${i + 1}` : 'Module details'}
            <span className="module__legend-actions">
              <button
                type="button"
                className="linkbtn"
                onClick={() => duplicateModule(mod.id)}
              >
                Duplicate
              </button>
              {multi && form.modules.length > 1 && (
                <button
                  type="button"
                  className="linkbtn module__remove"
                  onClick={() => removeModule(mod.id)}
                >
                  Remove
                </button>
              )}
            </span>
          </legend>

          {showModuleName && (
            <LabeledField
              id={`modName-${mod.id}`}
              label="Module name"
              helpKey="moduleName"
            >
              <input
                id={`modName-${mod.id}`}
                value={mod.name}
                onChange={(e) => updateModule(mod.id, { name: e.target.value })}
                placeholder="e.g. Data Fundamentals"
              />
            </LabeledField>
          )}

          <div className="grid-2">
            <LabeledField
              id={`modGroup-${mod.id}`}
              label={CLASS_GROUP_LABEL}
              helpKey="classGroup"
            >
              <input
                id={`modGroup-${mod.id}`}
                value={mod.classGroup}
                onChange={(e) =>
                  updateModule(mod.id, { classGroup: e.target.value })
                }
                placeholder="e.g. DS-2026A"
              />
            </LabeledField>
            <LabeledField
              id={`modTeacher-${mod.id}`}
              label={TEACHER_LABEL}
              helpKey="teacher"
            >
              <input
                id={`modTeacher-${mod.id}`}
                value={mod.teacher}
                onChange={(e) => updateModule(mod.id, { teacher: e.target.value })}
                placeholder="e.g. Ms Tan"
              />
            </LabeledField>
          </div>

          <LabeledField
            id={`modRoom-${mod.id}`}
            label="Classroom"
            helpKey="classroom"
          >
            <input
              id={`modRoom-${mod.id}`}
              value={mod.classroom}
              onChange={(e) => updateModule(mod.id, { classroom: e.target.value })}
              placeholder="e.g. Room 3-01"
            />
          </LabeledField>

          <div className="grid-2">
            <LabeledField
              id={`modStartDate-${mod.id}`}
              label="Module Start Date"
              helpKey="moduleStartDate"
            >
              <input
                id={`modStartDate-${mod.id}`}
                type="date"
                value={mod.moduleStartDate}
                onChange={(e) =>
                  updateModule(mod.id, { moduleStartDate: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField
              id={`modEndDate-${mod.id}`}
              label="Module End Date"
              helpKey="moduleEndDate"
            >
              <input
                id={`modEndDate-${mod.id}`}
                type="date"
                value={mod.moduleEndDate}
                onChange={(e) =>
                  updateModule(mod.id, { moduleEndDate: e.target.value })
                }
              />
            </LabeledField>
          </div>

          <div className="grid-2">
            <LabeledField
              id={`modLessons-${mod.id}`}
              label="Lesson names (one per line)"
              helpKey="lessonNames"
              hintKey="lessonNames"
            >
              <textarea
                id={`modLessons-${mod.id}`}
                rows={4}
                value={mod.lessonNamesRaw}
                onChange={(e) =>
                  updateModule(mod.id, { lessonNamesRaw: e.target.value })
                }
                placeholder={'Introduction\nData Types\nControl Flow'}
              />
            </LabeledField>
            <LabeledField
              id={`modActivities-${mod.id}`}
              label="Activities (one per line, optional)"
              helpKey="activities"
              hintKey="activities"
            >
              <textarea
                id={`modActivities-${mod.id}`}
                rows={4}
                value={mod.activitiesRaw}
                onChange={(e) =>
                  updateModule(mod.id, { activitiesRaw: e.target.value })
                }
                placeholder={'Listening\nReading\nWriting'}
              />
            </LabeledField>
          </div>

          <div className="grid-3">
            <LabeledField
              id={`modTotal-${mod.id}`}
              label="Total lessons"
              helpKey="totalLessons"
            >
              <input
                id={`modTotal-${mod.id}`}
                type="number"
                min={1}
                value={mod.totalLessons}
                onChange={(e) =>
                  updateModule(mod.id, { totalLessons: e.target.value })
                }
                placeholder="e.g. 12"
              />
            </LabeledField>
            <LabeledField
              id={`modStart-${mod.id}`}
              label="Start time"
              helpKey="startTime"
            >
              <input
                id={`modStart-${mod.id}`}
                type="time"
                value={mod.startTime}
                onChange={(e) => updateModule(mod.id, { startTime: e.target.value })}
              />
            </LabeledField>
            <LabeledField
              id={`modEnd-${mod.id}`}
              label="End time"
              helpKey="endTime"
            >
              <input
                id={`modEnd-${mod.id}`}
                type="time"
                value={mod.endTime}
                onChange={(e) => updateModule(mod.id, { endTime: e.target.value })}
              />
            </LabeledField>
          </div>
        </fieldset>
      ))}

      {multi && (
        <button type="button" className="btn btn--demo" onClick={addModule}>
          + Add module
        </button>
      )}
    </>
  );
}
