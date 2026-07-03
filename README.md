# UCC School Timetable Generator

A client-only single-page app (React + TypeScript + Vite) that generates an
evenly-spread teaching timetable for a class group, previews it, and exports it
to CSV and PDF.

## Run

From the repository root:

```bash
npm install
npm run dev
```

Then open the forwarded port **5173** from the Codespace **Ports** tab. The dev
server binds to all interfaces (`server.host = true`) so the forwarded port
works.

Click **Load demo data** to fill the form with a sample class group, then
**Generate timetable** to see a result. Use **Clear** to empty the form.

Other scripts:

```bash
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm test          # vitest (scheduler, planner, dates, form model, exports)
npm run preview   # serve the production build
```

## Guided wizard & help

The app opens on a **step-by-step wizard**: Output (List / Calendar / Hybrid) →
Scope (course / module / class group) → Details → Calendar rules → Review &
generate. Per-step validation blocks going forward on invalid input; back
navigation is always allowed and no data is lost between steps. A **"Skip
wizard, use full form"** link switches to the legacy all-at-once layout (and
back) with data preserved. The chosen output opens that view after generating;
scope relabels the primary name field and the planner title.

A **help layer** — accessible field tooltips, inline hints, and a first-run
guided tour — is controlled by one **Help: On/Off** toggle in the nav
(persisted). The tour has Back/Next/Skip/Don't-show-again and a **Restart tour**
control; all help copy lives in `src/help/helpText.ts`.

## What it does

- **Course engine (v5)** — a Course holds one or more **Modules** (each with
  its own teacher, room, class group, lessons, activities, and times) and a
  **start month** (`YYYY-MM`). Every module begins on the 1st of its month, or
  the next valid teaching day if the 1st is a weekend or holiday. Two
  **delivery modes**:
  - *Series* — modules run sequentially (module N+1 starts the month after
    module N's last lesson month); each month's lessons spread roughly evenly
    across its valid teaching days and every remaining valid weekday becomes
    an **AL buffer day** (label from `AL_LABEL`).
  - *Parallel* — all modules start together and cluster onto contiguous valid
    days; no AL fill.
- **Conflict detection** — after generating, real lessons are scanned per date
  for teacher / classroom / class-group claims by different modules at
  overlapping time ranges. Conflicts are listed in a panel (with a green
  all-clear) and highlighted in all three views and the planner exports.
- **Module shift** — per-module *Shift +1 / +2 days* moves every lesson that
  many valid teaching days later, consuming AL buffer in series mode, and is
  rejected with a warning when the module's last lesson would pass the last
  valid teaching day of its final month. Conflicts re-scan after every shift.
- **Valid teaching day** = not a weekend, not a UCC holiday, not a Singapore
  public holiday.
- **Three views** — **List** (table with an Activity column), **Calendar**
  (7×6 month grid with clickable chips for every month containing lessons), and
  **Hybrid** (UCC ULEC course-planner matrix: month blocks of weekday rows ×
  week columns, each with Date/Activity/Teacher, colour-coded Weekend /
  SchoolHoliday / PublicHoliday cells). First-day-of-week applies to Calendar
  and Hybrid. Dates display as `DD MMMM YYYY` ("02 May 2026") while ISO stays
  the internal value everywhere.
- **Activities & named holidays** — an optional activity per lesson (paired to
  lesson names by index) and per-row holiday **table editors** (date picker
  shown as `DD MMMM YYYY`, optional name, add/remove rows); the name shows in
  the planner. The "Class group" field is labelled **Module Class Details**
  (data key unchanged).
- **Planner export** — from Hybrid view, **Planner (Sheets)** builds a Google
  Sheet reproducing the matrix (merged Week headers, month label merged down its
  rows, colour fills, dates as `DD MMMM YYYY` text — never serials), and
  **Planner (CSV)** exports the same shape with no OAuth needed.
- **Exports match the active view** — "PDF (current view)" renders the List
  table, the Calendar month grids, or the Hybrid planner matrix depending on
  the selected view (colour-coded, first-day-of-week aware, all dates
  `DD MMMM YYYY`); "CSV (list)" / "Sheets (list)" stay list-shaped with
  `Date (ISO)` plus a display `Date`. Plus a bulk `.ics` (Asia/Singapore),
  per-lesson **Add to Google Calendar** links, and the Hybrid planner's own
  Sheets/CSV exports.
- **ERPNext import with a field-mapping screen** — in Settings, "Load sample
  fields" fetches one record of the configured DocType and lists its real
  scalar field names; each app field (course/module name, teacher, classroom,
  Module Class Details, total lessons, start date/time, end time, optional
  activity) maps to one of those via a dropdown, persisted per DocType. Import
  fetches only the mapped fields, applies the saved mapping, and — with
  exactly one record — imports it directly with a note instead of showing a
  picker. **Lesson names are always typed manually** and are never imported.
- **Multi-group engine** — `generateMultiGroupSchedule` merges several groups
  against one holiday calendar, and `detectClashes` reports duplicate
  sessions, teacher/classroom/class-group contention, and holiday collisions.
  No dashboard UI yet; these back the future multi-group pass.
- **Settings** (`/settings`, persisted to localStorage) — ERPNext base URL /
  key / secret / DocType, Google OAuth client ID, and first day of week.

## Routing

`/` is the Timetable page and `/settings` is Settings; a top nav links both.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Domain model (`ClassGroupConfig`, `ScheduledLesson`, `HolidaySet`, `Clash`). Designed for multi-group; this pass renders one group. |
| `src/dateUtils.ts` | Timezone-safe local date helpers + `formatDisplayDate`. **Never** uses `toISOString()` for `YYYY-MM-DD` — Singapore is UTC+8 and UTC serialisation shifts dates back a day. |
| `src/courseEngine.ts` | v5 engine: month-anchored starts, series/parallel distribution + AL fill, whole-course generation, `detectConflicts`, `shiftModuleLater`. |
| `src/scheduler.ts` | Legacy v1 single-group engine plus `generateMultiGroupSchedule` and `detectClashes` (kept and tested). |
| `src/formModel.ts` | Raw form state, per-rule validation, and builders for config/holidays. |
| `src/exports.ts` | CSV + PDF exporters; on-screen (9) and data-export (10, with ISO+display date) column sets. |
| `src/planner.ts` | Builds the Hybrid `PlannerModel` (month blocks, week assignment, cell classification). |
| `src/plannerExports.ts` | Planner CSV + Google Sheets planner (merges, colour fills, date-as-text). |
| `src/erpnext.ts` | ERPNext token-auth import: connection test, sample-field discovery, mapped list/fetch — all via the dev proxy base path. |
| `src/erpFieldMapping.ts` | The fixed app target fields and per-DocType field-mapping persistence used by the Settings mapping screen. |
| `src/googleCalendar.ts` | Per-lesson calendar link + `.ics` builder (Asia/Singapore). |
| `src/googleSheets.ts` | GIS token flow + Sheets API v4 create/write. |
| `src/settings.ts` | localStorage settings model + `useSettings` hook. |
| `src/pages/` | `TimetablePage` (hosts shared state + wizard/full-form toggle + views + exports), `SettingsPage`. |
| `src/wizard/` | `Wizard`, `Stepper`, `wizardModel` (state, scope, persistence, per-step validation). |
| `src/components/` | `LabeledField`, and the `DetailsFields` / `RulesFields` groups shared by wizard and full form. |
| `src/FullForm.tsx` | Legacy all-at-once form (reuses the shared field groups). |
| `src/help/` | `HelpProvider` + `useHelp`, `Tooltip`, `Hint`, `Tour`, and `helpText.ts` (all copy). |
| `src/views/` | `ListView`, `MonthView` (Calendar), `HybridView` (planner matrix). |
| `src/App.tsx` | Router shell: header, nav, Help controls, routes, Tour. |

## Google integration notes

- **Google Sheets / OAuth**: create a Google Cloud project with the Sheets API
  enabled and a Web-application OAuth client ID whose Authorised JavaScript
  origin equals the Codespace forwarded URL (these can change per session — pin
  the port or update the origin). Without a client ID, use CSV and import it
  into Sheets manually.
- **ERPNext CORS**: in dev, every ERPNext call goes same-origin through the
  Vite proxy (`/erp` → the server hard-coded in `vite.config.ts`), so the
  Frappe site needs no CORS headers for the Codespace origin; restart the dev
  server after editing `vite.config.ts`. Production builds use the Base URL
  from Settings and must sit behind a real backend proxy (see the Settings
  security banner). Credentials travel only in the
  `Authorization: token <key>:<secret>` header — never in a URL. Auth failures
  surface as "Authentication failed (401/403)…"; network/preflight failures
  say so explicitly instead of a bare "Failed to fetch".

## Excel / SheetJS note

The SheetJS `.xlsx` path is not used: its CDN (required for 0.20.3) is blocked
by this environment's egress policy and the public npm `xlsx` build was ruled
out. So:

- The **Excel** button (`exportExcel` in `src/exports.ts`) stays a disabled stub.
- The **Hybrid planner** exports to **Google Sheets** instead — the Sheets API
  reproduces everything SheetJS would (merged headers, month labels merged down
  rows, colour fills, dates written as `DD MMMM YYYY` text, never serials) — with
  a **Planner (CSV)** fallback that needs no OAuth.

To enable a true `.xlsx` later, install SheetJS and implement `exportExcel` over
`DATA_COLUMN_HEADERS` / `dataRowFor`, then re-enable the button.

## Out of scope (structured to slot in later)

Multi-group dashboard, live clash detection (`detectClashes` /
`generateMultiGroupSchedule` are typed stubs), OAuth Calendar `events.insert`
(a TODO in `src/googleCalendar.ts`), drag-and-drop editing, SG holiday
auto-fetch, Excel import, and colour-coded groups.
