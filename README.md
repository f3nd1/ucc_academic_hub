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
- **Three views** — List (table), Agenda (grouped by day), and Month (7×6
  calendar grid with a first-day-of-week option). Dates display as
  `DD MMMM YYYY` ("01 July 2026") while ISO stays the internal value.
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
| `src/erpnext.ts` | ERPNext token-auth import + field map + connection test. |
| `src/googleCalendar.ts` | Per-lesson calendar link + `.ics` builder (Asia/Singapore). |
| `src/googleSheets.ts` | GIS token flow + Sheets API v4 create/write. |
| `src/settings.ts` | localStorage settings model + `useSettings` hook. |
| `src/pages/` | `TimetablePage` (form + views + exports), `SettingsPage`. |
| `src/views/` | `ListView`, `AgendaView`, `MonthView`. |
| `src/App.tsx` | Router shell: header, nav, routes. |

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

## Known limitation: Excel export

Excel export is stubbed (`exportExcel` in `src/exports.ts`, button disabled in
the UI). The build spec requires SheetJS **0.20.3** from the SheetJS CDN
tarball, but that host is blocked by this environment's network egress policy,
and the public npm `xlsx` build was explicitly ruled out. Once SheetJS 0.20.3
is installable, wire up `exportExcel` (`aoa_to_sheet`, sized columns, sheet
`"Timetable"`, file `<classGroup>-timetable.xlsx`) and re-enable the button.

## Out of scope (structured to slot in later)

Multi-group dashboard, live clash detection (`detectClashes` /
`generateMultiGroupSchedule` are typed stubs), OAuth Calendar `events.insert`
(a TODO in `src/googleCalendar.ts`), drag-and-drop editing, SG holiday
auto-fetch, Excel import, and colour-coded groups.
