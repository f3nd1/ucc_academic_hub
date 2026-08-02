# CLAUDE.md — UCC Workspace

Instructions for AI agents working in this repository. This file is the
authoritative project context. **Where the README and this file disagree, this
file wins** — parts of the README predate the workspace shell and are stale
(it still says "two tools", claims xlsx is blocked, and describes an old
ERPNext production setup).

## What this is

A client-only React SPA ("UCC Workspace") for United Ceres College, Singapore.
It hosts multiple self-contained **tracker tools** behind one shell: Timetable
Generator, Module & Course Review, Student Survey Analysis, plus system pages
(Changelog, AI Log, Saved Items, Settings). The owner is Felix
(felix@unitedceres.edu.sg) — comfortable directing product decisions,
non-technical on server operations.

**There is no backend server.** The built `dist/` is served as static files by
nginx on a DigitalOcean droplet. Anything "server-like" is one of:

- **Supabase** (Postgres + auto-generated PostgREST) called directly from the
  browser — cloud sync snapshot + Saved Items tables (`supabase/schema.sql`).
- **The `/erp` reverse proxy** — nginx (production) and Vite dev/preview
  forward `/erp/*` to ERPNext, because ERPNext returns no CORS headers.
- **The Anthropic API** called directly from the browser (see AI rules below).

Never propose adding an Express/Prisma/Node backend to solve a problem;
solve it with Supabase, a static-safe pattern, or the existing proxies.

## Stack and commands

React 19, TypeScript ~6, Vite 8, react-router-dom 7, vitest 4, oxlint.
Client-side file work: `xlsx` (parsing), `docx` + `file-saver` (Word),
`jspdf` + `jspdf-autotable` (PDF). Icons are inline SVGs in
`src/shared/Icon.tsx` (no icon package — network policy blocked it).

```bash
npm run dev        # Vite dev server on 5173 (host:true), /erp proxy active
npm run build      # tsc -b && vite build (predev/prebuild regenerate changelog.json)
npm run lint       # oxlint
npm test           # vitest run
npm run preview    # serve the build on 4173, same /erp proxy
```

**Typecheck gotcha (learned the hard way):** the root `tsconfig.json` has
`"files": []`, so a bare `npx tsc --noEmit` at the root checks NOTHING and
exits 0. The trustworthy check is:

```bash
npx tsc --noEmit -p tsconfig.app.json
```

## Definition of done

Work is not finished until ALL of these pass, in this order:

1. `npx tsc --noEmit -p tsconfig.app.json` — clean.
2. `npx oxlint src/` — clean.
3. `npx vitest run` — every test passes. New logic gets new tests first.
4. `npm run build` — completes. (The >500 kB chunk warning for SurveyPage is
   known and accepted; do not chase it.)
5. **Browser verification** for anything with a UI surface: drive the real
   flow with Playwright against the dev server, assert the behaviour
   programmatically, and take a screenshot you actually look at.
   In this sandbox: `npm install --no-save playwright` (a later `npm install`
   prunes it — reinstall when needed) and launch with
   `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`
   (the bundled download does not match). Seed
   `localStorage['ucc-tour-done']='true'` in `addInitScript` or the first-run
   tour backdrop intercepts every click. Put throwaway scripts in a
   `scratch-e2e/` folder and delete it before committing.
6. Commit with a real message and push (see Git below). Report failures
   honestly — never claim verified without having done it.

## Architecture: the growth contract

`src/tools/registry.ts` is the entire growth contract. The sidebar, the Home
grid, and the routing table are all generated from one typed `TOOLS` array.

- **To add a tool:** append a `ToolDef` (id, name, description, Tabler icon
  name added to `Icon.tsx`, path, status, lazy component) and create its
  folder under `src/tools/<id>/`. Nothing else needs editing.
- `category: 'tool' | 'system'` controls placement: `'tool'` (default) shows
  in the sidebar "Tools" group and the Home grid; `'system'` (e.g. Changelog)
  goes to the sidebar "System" group and stays off Home.
- Tool pages are `lazy()`-loaded so heavy deps (xlsx, jspdf, docx, d3) stay
  out of the main bundle. Keep it that way.

Cross-tool services live in `src/shared/`; per-tool logic stays in the tool's
folder, split so it is testable:

- `<tool>Model.ts` — pure logic, no I/O, no DOM, fully unit-tested.
- `<tool>Parse.ts` / `<tool>Exports.ts` — file I/O at the edges.
- `<Tool>Page.tsx` — UI wiring only.

`src/data/changelog.json` is **generated** from git history by
`scripts/generate-changelog.ts` on every dev/build (predev/prebuild). It is
gitignored — never commit it, never let it block a pull.

## Hard rules (do not relax these)

- **Dates:** never derive a `YYYY-MM-DD` via `toISOString()` — Singapore is
  UTC+8 and UTC serialisation shifts dates back a day. Use the helpers in
  `src/shared/dates.ts`. Display format is always `DD MMMM YYYY`; ISO stays
  the internal value.
- **Credentials travel only in headers** (`Authorization: token key:secret`
  for ERPNext, `x-api-key` for Anthropic) — never in URLs.
- **ERPNext calls always go same-origin through `/erp`** — `erpBase()` in
  `src/erpnext.ts` returns the proxy prefix unconditionally. Never call the
  ERPNext host directly from the browser.
- **localStorage is namespaced:** each tool owns `ucc:<toolId>:*`; workspace
  settings live under `ucc-timetable-settings`. Every `ucc`-prefixed key is
  captured by the Supabase cloud-sync snapshot (`supabaseSync.ts`), so
  choosing a key decides whether it syncs. The Supabase URL/anon key
  themselves never sync (circular).
- **Settings + .env pattern:** any credential-ish setting can be supplied by
  a `VITE_*` var (`ENV_FIELD_MAP` in `src/shared/settings.ts`, declared in
  `src/vite-env.d.ts`, documented in `.env.example`). Env-backed values
  override stored ones, render read-only with a lock note in Settings, and
  are never persisted. Follow all four steps when adding one.
- **Supabase has no passcode by design** (Felix removed it). The anon key is
  public; the Project URL is the thing kept private. Don't reintroduce
  passcodes.
- **Destructive actions get a confirm** with a plain-English consequence
  ("This deletes the folder and everything inside it").
- **Every AI call is logged** to the AI Log (`appendAiLog` in
  `src/shared/aiLog.ts`) — prompt sent, output, token usage, estimated cost —
  including failures. No silent AI calls.
- Accepted risks — do not "fix" without asking: browser-held API keys
  (internal tool; noted in Settings banners), the xlsx 0.18.5 npm advisory
  (trusted internal uploads only), the SurveyPage chunk-size warning.

## Survey tool report rules (easy to get wrong)

The report engine (`surveyModel.ts`) builds typed `ReportBlock[]` — the
single source of truth rendered as HTML on screen, docx tables in Word, and
autotable grids in PDF. `buildReport()` is just the plain-text flattening.
Never render the report as one pre-wrapped text blob.

- Formal academic English; **commas, never em/en dashes**; constructive
  framing; never mention response rates, sample size, or statistical
  limitations; never invent data.
- Section numbers are assigned by a running counter so conditional sections
  (comparative, thematic, cross-module) never leave gaps.
- Input data is bilingual (Google Forms EN + 中文): Likert matching is
  prefix-based ("Strongly Agree 非常同意" → 5), metadata-column exclusion
  applies only to short headers (long question sentences legitimately contain
  words like "module"), and `cleanLabel()` strips embedded newlines for
  display while the exact original column string stays the lookup key.
- The AI report path (`surveyAi.ts`) sends the user-editable prompt
  (`ucc:survey:prompt`) as `system` and a deterministic computed data block
  as the user message — the model writes prose, never computes figures.
  Direct browser call to `https://api.anthropic.com/v1/messages` with
  `anthropic-version: 2023-06-01` and
  `anthropic-dangerous-direct-browser-access: true`. Default model constant:
  `DEFAULT_ANTHROPIC_MODEL` in `src/shared/settings.ts`. Cost estimates come
  from the manual price table in `src/shared/aiPricing.ts` — update it if
  Anthropic pricing changes, and keep costs labelled as estimates.

Open work: PR #11 (`claude/survey-report-concise-d3`) makes the report
concise — Q1..Qn short labels + dimensions, 120-word executive summary, D3
histograms (`SurveyHistogram.tsx`, bars filled from the `--accent` CSS var),
full question text confined to one reference appendix. If it has merged,
those conventions are also hard rules; delete this note.

## PDF export conventions (`src/shared/pdfBrand.ts`)

List, Calendar, and Hybrid/Planner all share this module; Survey's PDF
(`surveyExports.ts`) has its own hand-rolled layout but follows the same
rules by hand. Get these wrong and one export drifts from the other three.

- **No coloured header band.** `drawBrandHeaderBand()` is gone — it used to
  get cropped at the page top on some printers. Every header is plain black
  text on white via `drawPlainHeader()`. The table's own header ROW fill
  stays brand dark-navy (`BRAND.darkBlue`) deliberately — that's a separate,
  intentional decision, not a leftover: matching the on-screen accent colour
  would mean the PDF changes look depending on which of the 4 skins was
  active, which defeats the point of a print-stable brand.
- **Logo is PDF-only.** `public/ucc-logo.png` (pre-cropped from
  `UCC_1200x630.png`, which is mostly blank canvas) via `loadLogoDataUrl()` +
  `drawHeaderLogo()`. It was added to the on-screen sidebar once and reverted
  — don't re-add it there without being asked. Vertical position tracks the
  header's title line specifically (`textLineCenterYMm()`), not the header
  block as a whole.
- **Per-module colour tints are PDF-only too** (`MODULE_PALETTE` +
  `buildModuleColorMap(course.modules)`), used by Calendar and Hybrid, NOT
  mirrored on-screen — the on-screen Hybrid view still colours only by
  lesson kind (teaching/weekend/AL/holiday), same flat colour regardless of
  module. Don't assume a screen/PDF parity that doesn't exist; check before
  extending either one. Colour is deterministic by a module's position in
  `course.modules`, shared by both PDF builders so the same module is always
  the same colour in both. A cell whose lessons span two different modules
  (parallel delivery) is left uncoloured rather than guessing.
- **Grid lines are two weights, not one.** `BRAND_GRID_STYLE` is thin
  (0.15mm) by default; `outerBorderLineWidth(data)` in a `didParseCell` hook
  bumps only the table's true outer perimeter (plus the line under the last
  header row) to thick (0.3mm). Apply it unconditionally, before any
  `if (data.section !== 'body') return` early-out in the same hook, or head
  rows never get their outer edge.
- **Hybrid caps at 5 week-columns per page.** A 6-week month splits into a
  full page (weeks 1-5) plus a "(cont.)" continuation page for week 6 alone,
  same column widths on both — never shrink columns to fit a 6th week.

## Changelog date grouping (`changelogModel.ts`)

`git log --date=iso-strict` records each commit in the AUTHOR'S OWN local
offset — this repo's history mixes `+00:00` and `+08:00` commits. Reading a
commit's calendar day off the raw ISO string (`.slice(0, 10)`) can put two
commits seconds apart on different labelled days. `entryDay()`/`entryTime()`
convert every commit to Singapore time (UTC+8) first. `groupByDay()` also
sorts defensively before bucketing — `git log`'s default order follows the
commit graph, not a strict date sort, so a merge can genuinely surface
commits out of order. Get either one wrong and a date splits into two
non-contiguous groups on the Changelog page.

## Code style

- Comments explain **why**, in full sentences, and often record the bug that
  motivated the code ("Google Forms bilingual exports put the translation on
  a second line, so…"). No narrating-the-obvious comments; no
  change-log-style comments.
- Match the existing CSS system in `src/App.css`: theme via CSS variables
  (`--accent`, `--ink`, `--muted`, `--border`, `--summary-bg`…) so all four
  skins (Classic / Retro LCD / Y2K Pop / Cult of the Lamb) work; BEM-ish
  class names (`.sv-hist__bar`); reuse `.panel`, `.btn`, `.banner`,
  `.table-wrap`, `.hint` rather than inventing parallel components.
- Tests live in `tests/*.test.ts`, plain vitest, node environment (there is a
  `MemoryStorage` localStorage stand-in pattern — copy it). Test names state
  the behaviour and, for regressions, the real-world cause.

## Git, branches, deployment

- **The live branch is `claude/init-dlpied`** — the droplet pulls this. There
  is no `main` in active use. Feature work that needs review goes on a
  `claude/<topic>` branch with a PR into `claude/init-dlpied`; small
  requested fixes are committed directly to it. **Never merge a PR yourself
  unless Felix explicitly says to.**
- The GitHub repo was **renamed** `f3nd1/timetable` → `f3nd1/ucc_academic_hub`.
  Remotes and tooling may still use the old name; both work, but a stale
  remote once made the droplet's `git pull` silently no-op — if a deploy
  "changes nothing", check `git log --oneline -1` on the droplet first.
- Commit messages: imperative subject, then a body that explains what, why,
  and how it was verified. One feature-step per commit.
- **Production deploy** (Felix runs this; give him copy-paste blocks, one at
  a time, no jargon):

  ```bash
  cd /var/www/timetable
  git pull
  npm install
  npm run build -- --base=/ucc_academic_hub/
  ```

  The app is served at `https://<host>/ucc_academic_hub/` (nginx serves
  `dist/`; the SPA reads the base from `import.meta.env.BASE_URL`). After a
  deploy he must hard-refresh (Ctrl+Shift+R) — say so every time. If `git
  pull` reports "local changes would be overwritten", the fix is
  `git checkout -- <file>` then pull again.

## Working with Felix

- He tests on the live site with real UCC survey/course data and reports
  what he sees, sometimes with screenshots. Reproduce with his actual files
  when provided — synthetic data has missed real bugs here (bilingual
  headers being the standing example).
- Server-side instructions: assume no terminal fluency. Numbered steps,
  copy-paste blocks, what success looks like, what to paste back if it
  fails.
- When he asks "is X implemented?", audit against the spec he gives and
  answer with a concrete met/not-met list before writing any code.
- Lead with the outcome; keep the TLDR short; put detail after.
