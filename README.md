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

- **Two scheduling modes**
  - *Every weekday* — one session on every valid weekday from the start date
    until the total lesson count is reached.
  - *Per month* — a fixed number of lessons per month, spread evenly across the
    month's valid teaching days (even-interval selection). If a month cannot fit
    its lessons, generation stops with a clear error naming the month and both
    counts.
- **Valid teaching day** = not a weekend, not a UCC holiday, not a Singapore
  public holiday, and not already used (one session per day).
- **Three views** — **List** (table), **Calendar** (7×6 month grid), and
  **Hybrid** (UCC ULEC course-planner matrix: month blocks of weekday rows ×
  week columns, each with Date/Activity/Teacher, colour-coded Weekend /
  SchoolHoliday / PublicHoliday cells). First-day-of-week applies to Calendar
  and Hybrid. Dates display as `DD MMMM YYYY` ("02 May 2026") while ISO stays
  the internal value everywhere.
- **Activities & named holidays** — an optional activity per lesson (paired to
  lesson names by index) and holiday lines that accept `YYYY-MM-DD, Name`
  (e.g. `2026-08-09, National Day`); the name shows in the planner.
- **Planner export** — from Hybrid view, **Planner (Sheets)** builds a Google
  Sheet reproducing the matrix (merged Week headers, month label merged down its
  rows, colour fills, dates as `DD MMMM YYYY` text — never serials), and
  **Planner (CSV)** exports the same shape with no OAuth needed.
- **Exports** — CSV and PDF download `<classGroup>-timetable.*`; CSV carries
  both a `Date (ISO)` and a display `Date` column. Plus a bulk `.ics`
  (Asia/Singapore), per-lesson **Add to Google Calendar** links, and a
  **Google Sheets** export (OAuth token flow; needs a client ID in Settings).
- **ERPNext import** — pull a DocType into the form via token auth (adjust the
  field map in `src/erpnext.ts` to your schema).
- **Settings** (`/settings`, persisted to localStorage) — ERPNext base URL /
  key / secret / DocType, Google OAuth client ID, and first day of week.

## Routing

`/` is the Timetable page and `/settings` is Settings; a top nav links both.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Domain model (`ClassGroupConfig`, `ScheduledLesson`, `HolidaySet`, `Clash`). Designed for multi-group; this pass renders one group. |
| `src/dateUtils.ts` | Timezone-safe local date helpers + `formatDisplayDate`. **Never** uses `toISOString()` for `YYYY-MM-DD` — Singapore is UTC+8 and UTC serialisation shifts dates back a day. |
| `src/scheduler.ts` | `generateSchedule(config, holidays)` — both modes. Stubs for `generateMultiGroupSchedule` and `detectClashes`. |
| `src/formModel.ts` | Raw form state, per-rule validation, and builders for config/holidays. |
| `src/exports.ts` | CSV + PDF exporters; on-screen (9) and data-export (10, with ISO+display date) column sets. |
| `src/planner.ts` | Builds the Hybrid `PlannerModel` (month blocks, week assignment, cell classification). |
| `src/plannerExports.ts` | Planner CSV + Google Sheets planner (merges, colour fills, date-as-text). |
| `src/erpnext.ts` | ERPNext token-auth import + field map + connection test. |
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
- **ERPNext CORS**: the app calls ERPNext directly with an
  `Authorization: token <key>:<secret>` header, so the Frappe site must allow
  this origin (`allow_cors` in `site_config.json`). A Vite dev-proxy alternative
  is documented in `vite.config.ts`, but its target is static at config time.

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
