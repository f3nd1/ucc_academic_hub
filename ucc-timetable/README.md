# UCC School Timetable Generator

A client-only single-page app (React + TypeScript + Vite) that generates an
evenly-spread teaching timetable for a class group, previews it, and exports it
to CSV and PDF.

## Run

```bash
cd ucc-timetable
npm install
npm run dev
```

Then open the forwarded port **5173** from the Codespace **Ports** tab. The dev
server binds to all interfaces (`server.host = true`) so the forwarded port
works.

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
- **Preview table** with all nine columns plus a summary strip (total, first
  date, last date).
- **Exports** — CSV (native Blob, all fields quoted) and PDF (jsPDF landscape
  via `jspdf-autotable`). Both download the file `<classGroup>-timetable.*`.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Domain model (`ClassGroupConfig`, `ScheduledLesson`, `HolidaySet`, `Clash`). Designed for multi-group; this pass renders one group. |
| `src/dateUtils.ts` | Timezone-safe local date helpers. **Never** uses `toISOString()` for `YYYY-MM-DD` — Singapore is UTC+8 and UTC serialisation shifts dates back a day. |
| `src/scheduler.ts` | `generateSchedule(config, holidays)` — both modes. Stubs for `generateMultiGroupSchedule` and `detectClashes`. |
| `src/formModel.ts` | Raw form state, per-rule validation, and builders for config/holidays. |
| `src/exports.ts` | CSV + PDF exporters and the nine-column header list. |
| `src/constants.ts` | `TEACHER_LABEL` — single source for the "Teacher" label/header. |
| `src/App.tsx` | Two-column UI: setup + holidays on the left, preview + exports on the right. |

## Known limitation: Excel export

Excel export is stubbed (`exportExcel` in `src/exports.ts`, button disabled in
the UI). The build spec requires SheetJS **0.20.3** from the SheetJS CDN
tarball, but that host is blocked by this environment's network egress policy,
and the public npm `xlsx` build was explicitly ruled out. Once SheetJS 0.20.3
is installable, wire up `exportExcel` (`aoa_to_sheet`, sized columns, sheet
`"Timetable"`, file `<classGroup>-timetable.xlsx`) and re-enable the button.

## Out of scope (structured to slot in later)

Drag-and-drop editing, calendar/monthly view, SG holiday auto-fetch, Google
Calendar export, Excel import, colour-coded groups, approval workflow, and live
clash detection (`detectClashes` / `generateMultiGroupSchedule` are typed stubs).
