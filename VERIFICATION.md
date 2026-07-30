# Bread Reverse Launch Calendar verification

Verification date: 2026-07-30 (wave-based v3 rework) UTC

Scope: the wave-based **v3** rework of the artifact in this directory. The
teaser/launch two-anchor model (29 tasks) is replaced by a single editable date
anchor — **`wave2_date`, Wave 2 start, initial 2026-07-31** — rooting a **31-task**
Wave 2 → Wave 6 rollout. The model remains an anchor **graph** (stable ids, one
date anchor + item anchors, forward references, downstream recomputation,
cycle/invalid detection) with drag/drop, click-to-highlight, editable rows,
add/remove, user-chosen defaults with versioned `localStorage`, and JSON export.

Preserved from before and re-verified: business-day math, item anchors, negative
offsets, forward references, category colours/patterns, `default_*` reset, the
floating highlight popup with no layout shift, stable calendar week trimming
across category filters, the legend category filter, contiguous `0..7` category
numbering, and stale-`localStorage` label normalization (`n text` → `n) text`).

Changed for v3: `anchor_type` is still **derived** from `anchor_id`, but
`external_dependency` is now a **stored** semantic flag (item anchors are a mix of
external and internal work), surfaced as an `EXT` cue. Storage is versioned
(`bread-calendar-model-v3`, `schema: 3`) with proactive legacy-key cleanup so
stale pre-wave state cannot mask the new defaults.

## Model / default anchor check

- Default date anchor: **Wave 2 start 2026-07-31** (Friday);
  `1) PRODUCT: Wave 2 company testing` at offset 0.
- Rule: `computed_date = addBusinessDays(anchor_date, offset_business_days)`,
  where the anchor date is `wave2_date` or the resolved date of another task
  (item anchor). Because the whole graph roots at `wave2_date`, moving Wave 2
  shifts every task by the same business-day distance.
- The shipped **31-task** model, its ids/anchors/offsets, `external_dependency`
  flags, and resolved default dates are enumerated in `README.md` ("Default model:
  the shipped 31-row schedule"). `verify.js` asserts every one of the 31 default
  dates and compares the shipped defaults field-by-field against
  `baseline-model.json` (Test 0).

Baseline relationship asserted (`verify.js` Test 0), vs the authoritative v3 JSON
(kept as `baseline-model.json`):

- Top-level is `version: 3` with a `wave2_date`; there are **no** `teaser_date` /
  `launch_date` fields.
- Every baseline row matches the shipped row **exactly** — label, category,
  `anchor_type`, `anchor_id`, `offset_business_days`, `external_dependency`, and
  all `default_*` fields.
- Exactly **31** tasks.

## Manual QA inputs and observed results

Exercised through the shared model and the real `app.js` render/event path via the
QA scripts. There is one date anchor now, so scenarios move Wave 2 and observe the
whole-graph shift.

| Scenario | Wave 2 date | Observed Wave 2 start row | Observed Wave 6 row | Result |
|---|---|---|---|---|
| Default anchor | 2026-07-31 | `1) PRODUCT: Wave 2 company testing` → 2026-07-31 | `7) PUBLIC: Wave 6 targeted push if needed` → 2026-09-02 | PASS |
| Wave 2 moved +5 bd | 2026-08-07 | Wave 2 start → 2026-08-07 | Wave 6 → 2026-09-09 | PASS |
| Wave 2 moved earlier | 2026-07-20 | Wave 2 start → 2026-07-20 | Wave 6 → 2026-08-20 | PASS |

Graph-specific observations:

- **All anchors resolve, no cycles:** `recalc()` returns 31 tasks with an empty
  `errors` array at the defaults; `validate()` is empty.
- **Narrative ordering:** `5) SUPPORT: intake workflow ready` (2026-07-30) and
  `0) v0.16 on devnet` (2026-07-24) both land before Wave 2 start (2026-07-31);
  Wave 3 (2026-08-10) follows `0) v0.16 on testnet` (2026-08-05); Circle
  (2026-08-12) precedes/aligns the website go-live; Wave 4 (2026-08-19) is exactly
  `website_out +5 bd`; waves ascend Wave 2 < Wave 3 < Wave 4 < Wave 5 < Wave 6.
- **Item-anchor chain (default anchor):** `1) PRODUCT: Wave 2 company testing`
  2026-07-31 → `0) v0.16 on devnet` 2026-07-24 → `0) v0.16 on testnet` 2026-08-05
  → `0) Guardian upgrade done` 2026-08-03 → `0) Client/wallet/Epoch upgrade done`
  2026-08-07, all through item anchors, including a **forward reference** (Guardian
  anchors testnet, defined later in the array).
- **Downstream recompute:** editing/dragging a parent by ±N business days shifts
  its descendants by ±N business days; sibling chains are unaffected; `moved`
  flags are set on the shifted rows.
- **Move Wave 2:** setting the Wave 2 date +5 bd shifts **every** task by +5 bd.
- **Negative offsets:** e.g. `wave2_decision` at `wave2_date -1 bd` = 2026-07-30;
  editing it to `-5 bd` = 2026-07-24; `v016_devnet` at `-5 bd` off Wave 2 start.
- **Weekends:** offset-0 weekend anchors keep the weekend date with a `WKND`
  marker; nonzero offsets walk weekdays only (business-day tests in `verify.js`).
- **Drag/drop:** dragging a Wave 2-anchored pill to a later day sets its offset to
  the business-day distance and re-renders it at the drop date.
- **Click-highlight:** clicking `0) Client/wallet/Epoch upgrade done` highlights it,
  its item-anchor ancestors, and the Wave 2 day cell; the details **popup** prints
  the chain up to `Wave 2 start` and the `External dependency: yes` line.
- **Cycle / invalid anchor:** creating a cycle marks every member `unresolved` and
  shows an error warning; an invalid anchor id shows an invalid-anchor error.
- **Add task:** the `Add task` action appends a task with a unique stable id, a
  `{n}) New task` label, and product / Wave 2 start / offset-0 / not-external
  defaults; it shows up immediately in the table, calendar, export, and
  `localStorage` (31 → 32).
- **Remove task:** the per-row `Remove` button deletes a task (32 → 31). Removing
  a task with dependents (e.g. `wave2_start`, whose dependents include
  `support_ready`, `v016_devnet`, and `wave2_feedback_changes`) re-anchors each
  dependent to the removed task's own anchor (the Wave 2 date here), leaving no
  dangling anchors and no `unresolved` warning; `Restore shipped defaults` brings
  the full 31-task model back.

## Derived / stored field checks

- `anchor_type` is **derived from `anchor_id`** for all 31 tasks (Wave 2 date →
  `date_anchor`, otherwise `item_anchor`) and re-derived on load, so a stale
  persisted `anchor_type` is repaired.
- `external_dependency` is a **stored** flag: item-anchored tasks are a mix of
  external (`v016_*`, `*_stores_live`, `circle_announcement`, `website_out`) and
  internal (`wave*_feedback_changes`, `wave*_comms_ready`, `waitlist_qa`) work.
  Re-anchoring a task preserves its stored flag (it is **not** re-derived); a row
  reset restores `default_external_dependency`.
- There is **no `Anchor type` control and no editable external-dependency
  control** in the UI; external tasks show a read-only `EXT` mark
  (`verify-dom.js` / `qa-dom-live-recalc-check.js`).
- The **Anchor dropdown** puts **Wave 2 start** at the top (single date option),
  then every other task grouped by category (`{n}) name` optgroups) sorted by
  resolved date, excluding the current row; it lists **no** Teaser/Launch options.

## Stale / fresh localStorage check

- **Fresh state** (no persisted model) → the full shipped 31-task model and the
  default Wave 2 date.
- **Stale pre-wave (v2) state** under `bread-calendar-model-v2` is **ignored** (no
  teaser-era task leaks in) and the legacy key is **removed** on load.
- **Wrong-schema** payload under the v3 key (`schema !== 3`) is **discarded** →
  shipped defaults.
- **Valid v3 state** is restored; a stale `{n} text` label in it is migrated to
  `{n}) text` (both `label` and `default_label`).

Verified in `verify-dom.js` (fresh / stale / wrong-schema / valid-with-stale-label
sections) and `qa-dom-live-recalc-check.js` (stale-localStorage section).

## Selection popup / no-layout-shift check

- Selecting a task pill changes only **highlight state**; the calendar's
  month/week HTML skeleton is unchanged before vs after selection.
- Details render in a **floating popup** (position: fixed, draggable by its
  header). When nothing is selected the popup is hidden and reserves no space.

## Stable-week-trimming check

- Empty leading/trailing week rows are trimmed from the **full resolved task set**,
  not the currently filtered categories.
- Toggling a legend category filter never changes which weeks render (day-number
  skeleton identical filtered vs unfiltered); it only hides/shows pills. The Wave 2
  anchor cell always renders. Moving Wave 2 earlier expands the span (June 2026
  appears). Verified in `verify-dom.js` and `qa-dom-live-recalc-check.js`.

## Commands run

```bash
cd /workspace/team/devina/bread-reverse-launch-calendar-repo-1784802626
node verify.js
node verify-dom.js
node qa-live-recalc-check.js
node qa-dom-live-recalc-check.js
node --check model.js app.js verify.js verify-dom.js qa-live-recalc-check.js qa-dom-live-recalc-check.js
```

Observed command results:

- `node verify.js` → `=== 761 passed, 0 failed ===` (exit 0)
- `node verify-dom.js` → `=== 186 passed, 0 failed ===` (exit 0)
- `node qa-live-recalc-check.js` → `PASS: 211 QA scenario assertions passed.` (exit 0)
- `node qa-dom-live-recalc-check.js` → `PASS: 57 DOM/live-render QA assertions passed.` (exit 0)
- `node --check ...` → exit 0 for every JS file.

## Feature coverage map (requested verification → tests)

- All anchors resolve, no cycles at defaults → `verify.js` Test 1 / Test 0;
  `qa-live` scenario loop (`errors.length === 0`).
- Business-day item anchors + downstream recomputation → `verify.js` item-anchor
  tests; `qa-live` item-anchor section; `verify-dom.js` + `qa-dom` downstream
  recompute.
- Negative offsets + weekends → `verify.js` business-day tests; `verify-dom.js`
  negative-offset edit.
- Forward references resolve → `verify.js` forward-reference test (Guardian ←
  testnet).
- Moving Wave 2 shifts the whole graph → `verify.js` Wave 2 move test; `qa-live`
  scenarios; `verify-dom.js` + `qa-dom` whole-graph shift.
- Edit / reset behaviour (label / category / anchor / offset; row reset; make
  defaults / reset / restore shipped) → `verify.js` edit + defaults tests;
  `verify-dom.js` editing + defaults sections.
- `anchor_type` derived, `external_dependency` stored/preserved → `verify.js`
  Test 3; `qa-live` deduced/stored-field check; `verify-dom.js` + `qa-dom`
  re-anchor sections.
- Categories / visibility / legend filter → `verify.js` category-numbering test;
  `verify-dom.js` + `qa-dom` legend filter + pattern cues.
- Store submissions (Waves 2–5) present and resolving → `verify-dom.js` +
  `qa-dom` store-row assertions.
- Add / remove tasks (unique id, dependent re-anchor, export/reset) → `verify.js`
  Test 18; `qa-live` add/remove; `verify-dom.js` + `qa-dom` add/remove.
- Cycle / invalid anchor detection → `verify.js` cycle/invalid tests;
  `verify-dom.js` cycle warning.
- Drag/drop recalculates offset → `verify-dom.js` + `qa-dom` drag/drop.
- Floating details popup, no layout shift → `verify-dom.js` + `qa-dom` selection
  tests.
- Stale / fresh localStorage → `verify-dom.js` stale/fresh sections; `qa-dom`
  stale-storage section.

## Category readability check

- Legend renders all 8 categories with full text labels and `{n}) text` prefixes
  (`0) v0.16 dependency` … `7) Public moment`; `3) Video / design`;
  `4) Website / waitlist`).
- Category cues are not colour-only: cross / vertical / horizontal / diagonal /
  circle pattern classes render in the legend and calendar pills; external
  dependencies add an `EXT` badge + dashed pill border.
- Task pill labels use black `#111` text over `rgba(255,255,255,0.9)`.

## Browser rendering / preview

- **Chromium is present** in the environment (Playwright cache,
  `chromium-1228`, aarch64) but **cannot start**: it is missing ~13 shared
  libraries (`libnspr4`, `libnss3`, `libgbm`, `libX*`, `libasound`, …) that are
  not on the system and cannot be installed without global changes, which is out
  of scope. No `wkhtmltoimage` / `rsvg-convert` / headless browser is available
  either.
- `bread-calendar-v3-preview.png` is therefore produced as a **data-driven SVG
  render** of the actual resolved graph (`tools/gen-preview.js` reads `model.js`
  and emits the real dates, category colours/tints, task pills, `EXT`/`WKND`
  cues, and the circled Wave 2 anchor), rasterized with ImageMagick. It is a
  faithful visualization of the model output, **not** a Chromium screenshot.

## Local/static behavior

- `index.html` references only relative local files (`styles.css`, `model.js`,
  `app.js`); a single `#wave2` date input drives the whole graph.
- User edits and chosen defaults persist under `localStorage` key
  `bread-calendar-model-v3` (`schema: 3`); pre-wave keys are cleared on load;
  `Restore shipped defaults` or clearing site data returns to the shipped 31-task
  model. Nothing is written to disk except the JSON the user explicitly exports.

## Defects or unresolved questions

No recalculation, resolution, drag/drop, highlight, persistence, or legend-filter
defects found. The only environmental limitation is browser rendering (above),
handled by the data-driven SVG preview. No PMM/date-rule questions remain
unreported.
