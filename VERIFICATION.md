# Bread Reverse Launch Calendar verification

Verification date: 2026-07-23 (add/remove + re-baseline update) UTC

Scope: the add/remove-tasks revision of the artifact in this directory. The model
is an anchor **graph** (stable ids, date + item anchors, downstream recomputation,
cycle/invalid detection) with drag/drop, click-to-highlight, editable task rows,
user-chosen defaults with `localStorage` persistence, and JSON export. This pass
re-baselines the shipped defaults to the attached `bread-calendar-model.json`
(27 tasks, copied into the repo as `baseline-model.json`) and applies the
requested model/UI changes: two new tasks — `1) PRODUCT: company testing (try 2)`
and `4) WEBSITE - new version out` — taking the shipped total to **29**; category
4 renamed to **`Website / waitlist`** (key stays `landing`); and an
**add/remove-tasks** capability in the table view (an `Add task` model action plus
a per-row `Remove` button, with dependents re-anchored on removal). Prior behavior
that had to be preserved was preserved and re-verified: derived (not editable)
`anchor_type` / `external_dependency`, `{n}) text` index separators, the floating
highlight popup with no layout shift, stable calendar week trimming across category
filters, the legend category filter (click toggles, double-click resets all),
dynamic empty-week trimming, contiguous `0..7` category numbering, no Pin feature,
no Lock-3-day-gap feature, and legend pattern cues. Stale-`localStorage` label
normalization (`n text` -> `n) text`) still migrates on load.

## Model / default anchor check

- Default teaser anchor: **2026-08-06** (Thursday); `7) PUBLIC: teaser if GO` at
  offset 0.
- Default launch anchor: **2026-08-13** (Thursday); `7) PUBLIC: Launch
  announcement` at offset 0.
- Rule: `computed_date = addBusinessDays(anchor_date, offset_business_days)`,
  where the anchor date is `teaser_date`, `launch_date`, or the resolved date of
  another task (item anchor). Teaser-rooted chains move only with the teaser;
  launch-rooted chains move only with the launch.
- The shipped **29-task** model, its ids/anchors/offsets, and the resolved
  default dates are enumerated in `README.md` ("Default model: the shipped 29-row
  schedule"). `verify.js` asserts every one of the 29 default dates and compares
  the shipped defaults against `baseline-model.json` (Test 0).

Baseline relationship asserted (`verify.js` Test 0), vs the attached
`bread-calendar-model.json` (kept as `baseline-model.json`):

- The baseline JSON (27 tasks) already ships with `{n}) text` index separators
  and with `external_dependency` already consistent with the anchor rule (item
  anchor => `true`, date anchor => `false`), so there are **no separator or
  dependency deltas**. Test 0 asserts every baseline row matches the shipped row
  **exactly** (label, category, `anchor_id`, offset, `external_dependency`).
- The only difference is the **two added tasks** (below): 27 baseline + 2 = 29.
- `anchor_type` / `external_dependency` remain **derived** and are still exported
  for JSON compatibility.

Tasks added in this revision (`verify.js` task-list tests):

- `1) PRODUCT: company testing (try 2)` — item-anchored to
  `1) PRODUCT: company testing (try 1)` at **+5** business days
  (`company_testing_try_2`), resolving 2026-07-28.
- `4) WEBSITE - new version out` — teaser date **-6** business days
  (`website_new_version_out`), resolving 2026-07-29.

Category 4 renamed to **`Website / waitlist`** (key stays `landing`), asserted in
`verify.js` (`M.CATEGORIES.landing.name === "Website / waitlist"`) and
`verify-dom.js` (legend shows `4) Website / waitlist`).

## Manual QA inputs and observed results

Exercised through the shared model and the real `app.js` render/event path via
the QA scripts.

| Scenario | Input teaser | Input launch | Observed teaser row | Observed launch row | Result |
|---|---|---|---|---|---|
| Default/static anchors | 2026-08-06 | 2026-08-13 | `7) PUBLIC: teaser if GO` -> 2026-08-06 | `7) PUBLIC: Launch announcement` -> 2026-08-13 | PASS |
| Teaser changed only | 2026-08-13 | 2026-08-13 | `7) PUBLIC: teaser if GO` -> 2026-08-13 | launch row stayed 2026-08-13 | PASS |
| Launch changed only | 2026-08-06 | 2026-08-20 | teaser row stayed 2026-08-06 | `7) PUBLIC: Launch announcement` -> 2026-08-20 | PASS |
| Both anchors changed | 2026-08-13 | 2026-08-20 | teaser row -> 2026-08-13 | launch row -> 2026-08-20 | PASS |

Graph-specific observations:

- **Item-anchor chain (default anchors):** `1) PRODUCT: Everything working e2e`
  2026-08-05 -> `0) v0.16 on devnet` 2026-07-20 -> `0) v0.16 on testnet`
  2026-07-30 -> `0) Guardian upgrade done` 2026-07-28 -> `0) Client/wallet/Epoch
  upgrade done` 2026-08-03, all through item anchors.
- **Downstream recompute:** editing/dragging `1) PRODUCT: Everything working e2e`
  by +N business days shifts the entire v0.16 chain by +N business days; sibling
  chains (e.g. the stores chain) are unaffected.
- **Drag/drop:** dragging a teaser-anchored pill onto a later day sets its offset
  to the business-day distance from the teaser and re-renders it at the drop date.
- **Click-highlight:** clicking `0) Client/wallet/Epoch upgrade done` highlights
  it, its item-anchor ancestors, and the teaser day cell, and the details **popup**
  prints the chain up to `teaser date`.
- **Cycle / invalid anchor:** creating a cycle marks every member `unresolved`
  and shows an error warning; an invalid anchor id shows an invalid-anchor error.
- **Critical-after-launch:** pushing any of the seven critical dependencies past
  launch shows a `Critical dependency ... lands after launch` error; none fires
  at the defaults.
- **Add task:** the `Add task` model action appends a task with a unique stable
  id, a `{n}) New task` label, and product / teaser / offset-0 defaults; it shows
  up immediately in the table, calendar, export, and `localStorage` (29 -> 30).
- **Remove task:** the per-row `Remove` button deletes a task (30 -> 29). Removing
  a task with dependents (e.g. `company_testing`, whose dependents are
  `support_test_workflow` and `company_testing_try_2`) re-anchors each dependent
  to the removed task's own anchor (teaser date here), leaving no dangling anchors
  and no `unresolved` warning; `Restore shipped defaults` brings the full 29-task
  model back.

## Derived-field / UI-removal checks

- `anchor_type` and `external_dependency` are **derived from `anchor_id`** for all
  29 tasks (`qa-live-recalc-check.js` deduced-field check): anchoring to
  teaser/launch => `date_anchor` + `external_dependency = false`; anchoring to a
  task => `item_anchor` + `external_dependency = true`. They stay consistent after
  edits, resets, import, and restore (old persisted models are normalized on load).
- There is **no `Ext. dep` column, no `DEP` badge, and no `Anchor type` control**
  in the UI (`verify-dom.js` / `qa-dom-live-recalc-check.js` assert their absence
  in the rendered table, calendar pills, and details copy).
- The **Anchor dropdown** puts Teaser date and Launch date at the top, then every
  other task grouped by category (`{n}) name` optgroups) and sorted by resolved
  date, excluding the current row.

## Selection popup / no-layout-shift check

- Selecting a task pill changes only **highlight state**; the calendar's month/week
  HTML structure is unchanged before vs after selection
  (`qa-dom-live-recalc-check.js`).
- Details render in a **floating popup** (position: fixed, outside document flow,
  draggable by its header). When nothing is selected the popup is hidden and
  reserves no space, so no vertical layout shift occurs.

## Stable-week-trimming check

- Empty leading/trailing week rows are trimmed from the **full resolved task set**,
  not the currently filtered categories.
- Toggling a legend category filter never changes which weeks/month rows render
  (first/last visible week dates are identical filtered vs unfiltered); it only
  hides/shows pills inside the already-fixed weeks. The teaser/launch anchor cells
  always render. Verified in `qa-dom-live-recalc-check.js` (legend filter + stable
  week trimming).

## Commands run

```bash
cd /workspace/team/devina/bread-interactive-calendar
node verify.js
node verify-dom.js
node qa-live-recalc-check.js
node qa-dom-live-recalc-check.js
node --check model.js app.js verify.js verify-dom.js qa-live-recalc-check.js qa-dom-live-recalc-check.js
```

Observed command results:

- `node verify.js` -> `=== 552 passed, 0 failed ===`
- `node verify-dom.js` -> `=== 172 passed, 0 failed ===`
- `node qa-live-recalc-check.js` -> `PASS: 251 QA scenario assertions passed.`
- `node qa-dom-live-recalc-check.js` -> `PASS: 45 DOM/live-render QA assertions passed.`
- `node --check ...` -> exit 0 for every JS file.

## Feature coverage map (requested verification -> tests)

- Shipped defaults match `baseline-model.json` with documented deltas ->
  `verify.js` Test 0.
- Business-day item anchors and downstream recomputation -> `verify.js` item-anchor
  tests; `qa-live` item-anchor section; `verify-dom.js` item-anchor downstream
  recompute; `qa-dom` item-anchor section.
- Warnings when critical dependencies land after launch -> `verify.js` critical
  tests; `verify-dom.js` critical-dependency-after-launch warning.
- Derived (not editable) `anchor_type` / `external_dependency`; no `Ext. dep` /
  `Anchor type` / `DEP` badge -> `qa-live` deduced-field check; `verify-dom.js` /
  `qa-dom` absence assertions.
- Anchor dropdown order (teaser/launch first, then grouped by category) ->
  `verify-dom.js` anchor-options test.
- Floating details popup with no layout shift -> `qa-dom` selection / structure
  tests.
- Stable week trimming across category filters -> `qa-dom` legend filter + week
  trimming.
- Set current as default / reset / restore shipped / export JSON -> `verify.js`
  defaults/export tests; `verify-dom.js` make-current-as-defaults / export JSON.
- Add / remove tasks (unique id, dependent re-anchor on removal, export
  includes adds / omits removes, reset/restore behavior) -> `verify.js` Test 18;
  `qa-live-recalc-check.js` add/remove check; `verify-dom.js` add/remove section;
  `qa-dom-live-recalc-check.js` add/remove section.
- Category 4 renamed to `Website / waitlist` -> `verify.js` (`CATEGORIES.landing`
  name) + `verify-dom.js` legend `4) Website / waitlist` assertion.
- Drag/drop recalculates offset -> `verify-dom.js` drag/drop; `qa-dom` drag/drop.
- Clicking item highlights item + anchor chain -> `verify-dom.js` click-highlight;
  `qa-dom` click-highlight.
- Cycle / invalid anchor detection -> `verify.js` cycle/invalid tests;
  `verify-dom.js` cycle warning.
- Existing legend filter behavior -> `verify-dom.js` legend filter; `qa-dom`
  legend filter.
- localStorage persistence -> `verify-dom.js` localStorage persistence.

## Category readability check

- Legend renders all 8 categories with full text labels and `{n}) text` numeric
  prefixes (`0) v0.16 dependency` ... `7) Public moment`; video is
  `3) Video / design`; category 4 is `4) Website / waitlist`).
- Category cues are not color-only: cross / vertical / horizontal / diagonal /
  circle pattern classes render in the legend and calendar pills.
- Task pill labels use black `#111` text over `rgba(255,255,255,0.9)` so tints
  and patterns do not obscure the label.

## Local/static behavior

- `index.html` references only relative local files (`styles.css`, `model.js`,
  `app.js`); no module/CORS-only loading, so the documented local-file open path
  is consistent with the implementation.
- User edits and chosen defaults persist in the browser's `localStorage` (key
  `bread-calendar-model-v2`); `Restore shipped defaults` or clearing site data
  returns to the shipped 29-task model. Nothing is written to disk except the JSON
  the user explicitly exports.
- Direct browser-tool navigation of `file://` / `localhost` is blocked in this
  agent environment, so the UI was driven through the Node DOM-shim suites rather
  than a visual browser session.

## Defects or unresolved questions

No recalculation, resolution, drag/drop, highlight, persistence, or
legend-filter defects found. No PMM/date-rule questions remain unreported.
