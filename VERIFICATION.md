# Bread Reverse Launch Calendar verification

Verification date: 2026-07-30 (four-anchor v3 update + UI streamline) UTC

Scope: the wave-based **v3** artifact in this directory, updated to **four
editable date anchors** and **33 tasks**, plus a restrained dashboard UI cleanup.
The four anchors are **`wave2_date` (Wave 2 start, 2026-07-31)**,
**`v016_devnet_date` (2026-07-17)**, **`v016_testnet_date` (2026-08-05)**, and
**`circle_announcement_date` (2026-08-12)**. Each anchor roots its **own**
subgraph; moving one recomputes only its dependents. The model remains an anchor
**graph** (stable ids, date + item anchors, forward references, downstream
recomputation, cycle/invalid detection) with drag/drop, click-to-highlight,
editable rows, add/remove, user-chosen defaults with versioned+revisioned
`localStorage`, and JSON export.

Preserved from before and re-verified: business-day math, item anchors, negative
offsets, forward references, category colours, `default_*` reset, the floating
highlight popup with no layout shift, stable calendar week trimming across
category filters, the legend category filter, contiguous `0..7` category
numbering, and stale-`localStorage` label normalization (`n text` → `n) text`).

Changed in this update:

- **Four date anchors** replace the single `wave2_date` master. `wave3/4/5_start`
  each anchor the prior wave start `+6bd`; the v0.16 testnet chain and the
  Circle/website/waitlist chain root at their own date anchors. Added
  `wave3_decision`, `wave4_decision`, `wave5_decision`; removed `wave6_start`
  (33 tasks total).
- **UI streamline:** removed the `EXT` badge and the heavy dashed external border
  and the decorative hatch/stripe/circle patterns. Category is now conveyed by a
  soft tint + a consistent 3px left accent + a quiet neutral outline; strong
  outlines are reserved for interaction state (selected/anchor/focus). Anchor day
  cells carry a quiet chip (`WAVE 2` / `DEVNET` / `TESTNET` / `CIRCLE`). The four
  anchor inputs are grouped and labelled.
- **Storage migration:** the v3 schema is unchanged but the structure/defaults
  changed, so a new **storage key** (`bread-calendar-model-v3r2`) plus an explicit
  model **revision** (`revision: 2`) is used, with proactive cleanup of the prior
  `bread-calendar-model-v3` / `-v2` / `bread-calendar-model` keys so stale
  prior-release state cannot mask the new defaults.

`anchor_type` is still **derived** from `anchor_id`; `external_dependency` remains
a **stored** semantic flag, preserved through edit/reset/import/export.

## Model / default anchor check

- Default anchors: **Wave 2 start 2026-07-31**, **v0.16 devnet 2026-07-17**,
  **v0.16 testnet 2026-08-05**, **Circle announcement 2026-08-12**.
- Rule: `computed_date = addBusinessDays(anchor_date, offset_business_days)`,
  where the anchor date is one of the four date anchors or the resolved date of
  another task (item anchor).
- The shipped **33-task** model, its ids/anchors/offsets, `external_dependency`
  flags, and resolved default dates are enumerated in `README.md` ("Default model:
  the shipped 33-row schedule"). `verify.js` asserts every one of the 33 default
  dates and compares the shipped defaults field-by-field against
  `baseline-model.json` (Test 0).

Baseline relationship asserted (`verify.js` Test 0), vs the authoritative v3 JSON
(kept as `baseline-model.json`):

- Top-level is `version: 3` with the four `*_date` anchor fields; there are
  **no** `teaser_date` / `launch_date` fields.
- Every baseline row matches the shipped row **exactly** — label, category,
  `anchor_type`, `anchor_id`, `offset_business_days`, `external_dependency`, and
  all `default_*` fields.
- Exactly **33** tasks; **4** date anchors; **0** unresolved anchors; **0** cycles.

## Per-anchor subgraph independence

Moving a single anchor `+4/+5 bd` moves exactly its dependent subgraph and leaves
the other chains unchanged (asserted in `verify.js` Test 6, `qa-live` subgraph
section, and `qa-dom` per-anchor section):

| anchor moved | tasks that shift | tasks that stay put |
|---|---|---|
| `wave2_date` | the 26-task Wave 2 → Waves 3/4/5 chain | v0.16 devnet, v0.16 testnet chain, Circle/website/waitlist |
| `v016_devnet_date` | `v016_devnet` only | everything else |
| `v016_testnet_date` | `v016_testnet`, `guardian_upgrade_done`, `client_wallet_done` | everything else |
| `circle_announcement_date` | `circle_announcement`, `website_out`, `waitlist_qa` | everything else |

The four subgraphs are a **disjoint partition** of all 33 tasks (verified).

## Manual QA inputs and observed results

Exercised through the shared model and the real `app.js` render/event path via the
QA scripts.

| Scenario | wave2_date | Observed Wave 2 start row | Observed Wave 5 store-live row | Result |
|---|---|---|---|---|
| Default anchors | 2026-07-31 | `1) PRODUCT: Wave 2 company-wide testing` → 2026-07-31 | `2) STORES: post-Wave-5 build live` → 2026-09-01 | PASS |
| Wave 2 moved +5 bd | 2026-08-07 | Wave 2 start → 2026-08-07 | Wave 5 store-live → 2026-09-08 | PASS |
| Wave 2 moved earlier | 2026-07-20 | Wave 2 start → 2026-07-20 | Wave 5 store-live → 2026-08-24 | PASS |

Graph-specific observations:

- **All anchors resolve, no cycles:** `recalc()` returns 33 tasks with an empty
  `errors` array at the defaults; `validate()` is empty.
- **Every supplied `anchor_id` resolves** after the full graph loads: each
  date-anchored task names one of the four anchors, and each item-anchored task
  names a real task (`verify.js` Test 19).
- **Narrative ordering:** `5) SUPPORT: intake workflow ready` (2026-07-30) and
  `0) v0.16 on devnet` (2026-07-17) both land before Wave 2 start (2026-07-31);
  Wave 3 (2026-08-10) is `wave2_start +6bd`; Circle (2026-08-12) precedes/aligns
  the website go-live; waitlist QA is `website_out -1bd`; waves ascend
  Wave 2 < Wave 3 < Wave 4 < Wave 5.
- **Item-anchor chain (default anchors):** `0) v0.16 on testnet` 2026-08-05 →
  `0) Guardian upgrade done` 2026-08-03 (`-2bd`, a **forward reference** — guardian
  is authored before testnet) → `0) Client/wallet/Epoch upgrade done` 2026-08-07
  (`+4bd`).
- **Downstream recompute:** editing/dragging a parent by ±N business days shifts
  its descendants by ±N business days; sibling chains are unaffected; `moved`
  flags are set on the shifted rows.
- **Independent anchors:** moving `circle_announcement_date +5bd` shifts only
  `circle_announcement`, `website_out`, `waitlist_qa`; the Wave 2 and v0.16 chains
  are unchanged. Moving `v016_devnet_date` shifts only `v016_devnet`.
- **Negative offsets:** e.g. `wave2_decision` at `wave2_start -1 bd` = 2026-07-30;
  editing it to `-5 bd` = 2026-07-24; guardian at `-2 bd` off testnet.
- **Weekends:** offset-0 weekend anchors keep the weekend date with a `WKND`
  marker; nonzero offsets walk weekdays only (business-day tests in `verify.js`).
- **Drag/drop:** dragging a pill to a later day sets its offset to the
  business-day distance from its anchor and re-renders it at the drop date;
  downstream item anchors follow.
- **Click-highlight:** clicking `0) Client/wallet/Epoch upgrade done` highlights it,
  its item-anchor ancestors, and the **v0.16 testnet** anchor cell; the details
  **popup** prints the chain up to `v0.16 testnet` and the `External dependency:
  yes` line.
- **Cycle / invalid anchor:** creating a cycle marks every member `unresolved` and
  shows an error warning; an invalid anchor id shows an invalid-anchor error.
- **Add task:** the `Add task` action appends a task with a unique stable id, a
  `{n}) New task` label, and product / Wave 2 start / offset-0 / not-external
  defaults; it shows up immediately in the table, calendar, export, and
  `localStorage` (33 → 34).
- **Remove task:** the per-row `Remove` button deletes a task (34 → 33). Removing
  a task with dependents (e.g. `wave2_start`, whose dependents include
  `support_ready`, `wave2_decision`, `wave2_feedback_changes`, `wave3_start`)
  re-anchors each dependent to the removed task's own anchor (the Wave 2 date
  here), leaving no dangling anchors and no `unresolved` warning; `Restore shipped
  defaults` brings the full 33-task model back.

## Derived / stored field checks

- `anchor_type` is **derived from `anchor_id`** for all 33 tasks (a date-anchor id
  → `date_anchor`, otherwise `item_anchor`) and re-derived on load, so a stale
  persisted `anchor_type` is repaired.
- `external_dependency` is a **stored** flag: item-anchored tasks are a mix of
  external (`v016_*`, `*_stores_live`, `circle_announcement`, `website_out`) and
  internal (`wave*_feedback_changes`, `wave*_comms_ready`, `waitlist_qa`,
  decisions) work. Re-anchoring a task preserves its stored flag (it is **not**
  re-derived); a row reset restores `default_external_dependency`; the flag
  survives export/reset.
- There is **no `Anchor type` control and no editable external-dependency
  control** in the UI. External state is **not** shown as an `EXT` badge anymore —
  it lives in the model/export and the details popup only (`verify-dom.js` /
  `qa-dom-live-recalc-check.js` assert no `EXT` text/badge and no heavy dashed
  external styling).
- The **Anchor dropdown** puts the **four date anchors** at the top under a
  "Date anchors" optgroup, then every other task grouped by category (`{n}) name`
  optgroups) sorted by resolved date, excluding the current row; it lists **no**
  Teaser/Launch options.

## Stale / fresh localStorage check

- **Fresh state** (no persisted model) → the full shipped 33-task model and the
  four default anchor dates.
- **Prior-release single-anchor v3 state** under `bread-calendar-model-v3` is
  **ignored** (no `wave6` task leaks in) and the key is **removed** on load.
- **Pre-wave (v2) state** under `bread-calendar-model-v2` is **ignored** and the
  key is **removed** on load.
- **Wrong-revision** payload under the current key (`revision !== 2`) is
  **discarded** → shipped defaults.
- **Valid v3r2 state** is restored; a stale `{n} text` label in it is migrated to
  `{n}) text` (both `label` and `default_label`).

Verified in `verify-dom.js` (fresh / stale-v3 / stale-v2 / wrong-revision /
valid-with-stale-label sections) and `qa-dom-live-recalc-check.js`
(stale-localStorage section).

## Selection popup / no-layout-shift check

- Selecting a task pill changes only **highlight state**; the calendar's
  month/week HTML skeleton is unchanged before vs after selection.
- Details render in a **floating popup** (position: fixed, draggable by its
  header). When nothing is selected the popup is hidden and reserves no space.

## Stable-week-trimming check

- Empty leading/trailing week rows are trimmed from the **full resolved task set**,
  not the currently filtered categories.
- Toggling a legend category filter never changes which weeks render (day-number
  skeleton identical filtered vs unfiltered); it only hides/shows pills. Anchor
  cells always render. Moving an anchor earlier expands the span (June 2026 appears
  when `v016_devnet_date` is pulled into June). Verified in `verify-dom.js` and
  `qa-dom-live-recalc-check.js`.

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

- `node verify.js` → `=== 818 passed, 0 failed ===` (exit 0)
- `node verify-dom.js` → `=== 216 passed, 0 failed ===` (exit 0)
- `node qa-live-recalc-check.js` → `PASS: 389 QA scenario assertions passed.` (exit 0)
- `node qa-dom-live-recalc-check.js` → `PASS: 68 DOM/live-render QA assertions passed.` (exit 0)
- `node --check ...` → exit 0 for every JS file.

## Feature coverage map (requested verification → tests)

- 4 date anchors, 33 tasks, 0 unresolved anchors, 0 cycles, correct default dates
  → `verify.js` Test 0 / Test 1 / Test 19; `qa-live` scenario loop.
- Each anchor moves only its dependent subgraph; independent chains unchanged →
  `verify.js` Test 6; `qa-live` subgraph section; `qa-dom` per-anchor section.
- Business-day item anchors + downstream recomputation → `verify.js` item-anchor
  tests; `qa-live` item-anchor section; `verify-dom.js` + `qa-dom` downstream
  recompute.
- Negative offsets + weekends → `verify.js` business-day tests; `verify-dom.js`
  negative-offset edit.
- Forward references resolve → `verify.js` forward-reference test (Guardian ←
  testnet).
- Every supplied `anchor_id` resolves after full graph load → `verify.js` Test 19.
- Edit / reset behaviour (label / category / anchor / offset; row reset; make
  defaults / reset / restore shipped) → `verify.js` edit + defaults tests;
  `verify-dom.js` editing + defaults sections.
- `anchor_type` derived, `external_dependency` stored/preserved → `verify.js`
  Test 3; `qa-live` deduced/stored-field check; `verify-dom.js` + `qa-dom`
  re-anchor sections.
- No visible `EXT` text/badge, no heavy external dashed styling, consistent quiet
  card treatment; `external_dependency` survives export/reset → `verify-dom.js`
  cleanup section; `qa-dom` streamlined-swatch section.
- Categories / visibility / legend filter → `verify.js` category-numbering test;
  `verify-dom.js` + `qa-dom` legend filter.
- Store submissions + Wave 3/4/5 decisions present and resolving → `verify-dom.js`
  + `qa-dom` row assertions; `wave6_start` absence asserted.
- Add / remove tasks (unique id, dependent re-anchor, export/reset) → `verify.js`
  Test 18; `qa-live` add/remove; `verify-dom.js` + `qa-dom` add/remove.
- Cycle / invalid anchor detection → `verify.js` cycle/invalid tests;
  `verify-dom.js` cycle warning.
- Drag/drop recalculates offset → `verify-dom.js` + `qa-dom` drag/drop.
- Floating details popup, no layout shift → `verify-dom.js` + `qa-dom` selection
  tests.
- Stale / fresh localStorage + revision migration → `verify-dom.js` stale/fresh
  sections; `qa-dom` stale-storage section.

## Category readability check

- Legend renders all 8 categories with full text labels and `{n}) text` prefixes
  (`0) v0.16 dependency` … `7) Public moment`; `3) Video / design`;
  `4) Website / waitlist`).
- Category cues are not colour-only: the numeric `{n})` prefix on every label and
  legend entry is the non-colour cue, alongside the soft tint + 3px left accent.
  (The decorative hatch/stripe/circle patterns and the `EXT` badge were removed in
  the streamline; no category gets a heavier stroke than another.)
- Task pill labels use dark `#1a1a1a` text over the soft category tint; a visible
  `:focus-visible` outline is applied to every interactive control.

## Browser rendering / preview

- **Chromium is present** in the environment but **cannot start**: it is missing
  ~13 shared libraries (`libnspr4`, `libnss3`, `libgbm`, `libX*`, `libasound`, …)
  that are not on the system and cannot be installed without global changes, which
  is out of scope. No `wkhtmltoimage` / `rsvg-convert` / headless browser is
  available either.
- `bread-calendar-v3-preview.png` is therefore produced as a **data-driven SVG
  render** of the actual resolved graph (`tools/gen-preview.js` reads `model.js`
  and emits the real dates, category colours/tints, the streamlined soft-tint +
  left-accent task cards, the `WKND` cue, and the four anchor chips), rasterized
  with ImageMagick. It is a faithful visualization of the model output and the new
  visual language, **not** a Chromium screenshot.

## Local/static behavior

- `index.html` references only relative local files (`styles.css`, `model.js`,
  `app.js`); four grouped date inputs (`#wave2_date`, `#v016_devnet_date`,
  `#v016_testnet_date`, `#circle_announcement_date`) drive their subgraphs.
- User edits and chosen defaults persist under `localStorage` key
  `bread-calendar-model-v3r2` (`schema: 3`, `revision: 2`); prior-release keys are
  cleared on load; `Restore shipped defaults` or clearing site data returns to the
  shipped 33-task model. Nothing is written to disk except the JSON the user
  explicitly exports.

## Defects or unresolved questions

No recalculation, resolution, drag/drop, highlight, persistence, or legend-filter
defects found. The only environmental limitation is browser rendering (above),
handled by the data-driven SVG preview. No PMM/date-rule questions remain
unreported.
