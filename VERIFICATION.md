# Bread Reverse Launch Calendar verification

Verification date: 2026-08-06 (defaults + active-anchors update) UTC

Scope: the wave-based **v3** artifact in this directory, updated to new shipped
defaults (seven task definitions changed: `teaser_final`, `v016_testnet`,
`visual_identity_board`, `wave3_recruiting_ready`, `wave3_start`,
`wave4_comms_ready`, `wave4_start`) and a narrower top control strip. There are
still **four date anchors** and **33 tasks**: **`wave2_date` (Wave 2 start,
2026-07-31)**, **`v016_devnet_date` (2026-07-17)**, **`v016_testnet_date`
(2026-08-17)**, and **`circle_announcement_date` (2026-08-12)**. Each anchor roots
its **own** subgraph; moving one recomputes only its dependents. Only **two**
anchors are exposed as editable top inputs, in order: **v0.16 testnet**, then
**Circle announcement**. The **Wave 2 start** and **v0.16 devnet** dates are fixed
**past** baselines that stay in the model/export, the anchor dropdown, and the
calendar chips but have **no** editable control (their tasks are still movable via
offset / drag / re-anchor). The model remains an anchor **graph** (stable ids,
date + item anchors, forward references, downstream recomputation, cycle/invalid
detection) with drag/drop, click-to-highlight, editable rows, add/remove,
user-chosen defaults with versioned+revisioned `localStorage`, and JSON export.

Preserved from before and re-verified: business-day math, item anchors, negative
offsets, forward references, category colours, `default_*` reset, the floating
highlight popup with no layout shift, stable calendar week trimming across
category filters, the legend category filter, contiguous `0..7` category
numbering, and stale-`localStorage` label normalization (`n text` → `n) text`).

Changed in this update:

- **New shipped defaults** for seven tasks: `v016_testnet` is anchored to its own
  testnet date at `+0bd` (the testnet date is 2026-08-17, so the milestone and the
  editable control now agree); `wave3_start` `+16bd` (was `+6bd`) off `wave2_start`; `wave4_start`
  `+8bd` (was `+6bd`) off `wave3_start`; `wave3_recruiting_ready`, `teaser_final`,
  and `wave4_comms_ready` all `-2bd`; and `visual_identity_board` re-anchored from
  `wave4_start` (`-7bd`) to `website_out` (`-2bd`), moving it into the Circle
  subgraph. `baseline-model.json` is byte-for-byte the authoritative JSON and
  `verify.js` Test 0 re-asserts full parity.
- **Narrower control strip:** Wave 2 has passed, so `wave2_date` joins
  `v016_devnet_date` as a hidden past baseline — its editable top input is removed
  (same `control: false` pattern as devnet). The top strip now has exactly two
  inputs, in order: **v0.16 testnet**, then **Circle announcement**. `wave2_date`
  still resolves, exports, seeds the anchor dropdown, shows its `WAVE 2` chip, and
  round-trips. Anchor day cells still carry chips (`WAVE 2` / `DEVNET` / `TESTNET`
  / `CIRCLE`).
- **Storage migration:** the v3 schema and export version are unchanged, but the
  shipped defaults changed, so a new **storage key** (`bread-calendar-model-v3r4`)
  plus a bumped model **revision** (`revision: 4`) is used, with proactive cleanup
  of the prior `bread-calendar-model-v3r3` / `-v3r2` / `-v3` / `-v2` / `bread-calendar-model`
  keys so stale prior-release state cannot mask the new defaults.

`anchor_type` is still **derived** from `anchor_id`; `external_dependency` remains
a **stored** semantic flag, preserved through edit/reset/import/export.

## Model / default anchor check

- Default anchors: **Wave 2 start 2026-07-31**, **v0.16 devnet 2026-07-17**,
  **v0.16 testnet 2026-08-17**, **Circle announcement 2026-08-12**.
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
| `wave2_date` (hidden; model-level) | the 25-task Wave 2 → Waves 3/4/5 chain | v0.16 devnet, v0.16 testnet chain, Circle/website/waitlist/visual-identity |
| `v016_devnet_date` (hidden; model-level) | `v016_devnet` only | everything else |
| `v016_testnet_date` | `v016_testnet`, `guardian_upgrade_done`, `client_wallet_done` | everything else |
| `circle_announcement_date` | `circle_announcement`, `website_out`, `waitlist_qa`, `visual_identity_board` | everything else |

The four subgraphs are a **disjoint partition** of all 33 tasks (verified).

## Manual QA inputs and observed results

Exercised through the shared model and the real `app.js` render/event path via the
QA scripts.

The two editable inputs are v0.16 testnet and Circle; the QA DOM scenarios drive
the visible **v0.16 testnet** control and confirm only its chain moves:

| Scenario | v016_testnet_date | Observed v0.16 testnet row | Observed client/wallet row | Result |
|---|---|---|---|---|
| Default anchors | 2026-08-17 | `0) v0.16 on testnet` → 2026-08-17 | `0) Client/wallet/Epoch upgrade done` → 2026-08-19 | PASS |
| Testnet moved +5 bd | 2026-08-24 | v0.16 testnet → 2026-08-24 | client/wallet → 2026-08-26 | PASS |
| Testnet moved earlier | 2026-07-29 | v0.16 testnet → 2026-07-29 | client/wallet → 2026-07-31 | PASS |

Graph-specific observations:

- **All anchors resolve, no cycles:** `recalc()` returns 33 tasks with an empty
  `errors` array at the defaults; `validate()` is empty.
- **Every supplied `anchor_id` resolves** after the full graph loads: each
  date-anchored task names one of the four anchors, and each item-anchored task
  names a real task (`verify.js` Test 19).
- **Narrative ordering:** `5) SUPPORT: intake workflow ready` (2026-07-30) and
  `0) v0.16 on devnet` (2026-07-17) both land before Wave 2 start (2026-07-31);
  Wave 3 (2026-08-24) is `wave2_start +16bd`; Circle (2026-08-12) precedes/aligns
  the website go-live; waitlist QA is `website_out -1bd`; waves ascend
  Wave 2 < Wave 3 < Wave 4 < Wave 5.
- **Item-anchor chain (default anchors):** `0) v0.16 on testnet` 2026-08-17
  (its own testnet date, `+0bd`) → `0) Guardian upgrade done` 2026-08-13 (`-2bd`, a
  **forward reference** — guardian is authored before testnet) →
  `0) Client/wallet/Epoch upgrade done` 2026-08-19 (`+4bd`).
- **Downstream recompute:** editing/dragging a parent by ±N business days shifts
  its descendants by ±N business days; sibling chains are unaffected; `moved`
  flags are set on the shifted rows.
- **Independent anchors:** moving `circle_announcement_date +5bd` shifts only
  `circle_announcement`, `website_out`, `waitlist_qa`, `visual_identity_board`; the
  Wave 2 and v0.16 chains
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
- **Prior-release v3r3 state** under `bread-calendar-model-v3r3` is **ignored** and
  the key is **removed** on load.
- **Prior-release v3r2 state** under `bread-calendar-model-v3r2` is **ignored** and
  the key is **removed** on load.
- **Prior-release single-anchor v3 state** under `bread-calendar-model-v3` is
  **ignored** (no `wave6` task leaks in) and the key is **removed** on load.
- **Pre-wave (v2) state** under `bread-calendar-model-v2` is **ignored** and the
  key is **removed** on load.
- **Wrong-revision** payload under the current key (`revision !== 4`) is
  **discarded** → shipped defaults.
- **Valid v3r4 state** is restored; a stale `{n} text` label in it is migrated to
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

- `node verify.js` → `=== 840 passed, 0 failed ===` (exit 0)
- `node verify-dom.js` → `=== 231 passed, 0 failed ===` (exit 0)
- `node qa-live-recalc-check.js` → `PASS: 393 QA scenario assertions passed.` (exit 0)
- `node qa-dom-live-recalc-check.js` → `PASS: 73 DOM/live-render QA assertions passed.` (exit 0)
- `node --check ...` → exit 0 for every JS file (including `tools/gen-preview.js`).

## Feature coverage map (requested verification → tests)

- 4 date anchors, 33 tasks, 0 unresolved anchors, 0 cycles, correct default dates
  → `verify.js` Test 0 / Test 1 / Test 19; `qa-live` scenario loop.
- Each anchor moves only its dependent subgraph; independent chains unchanged →
  `verify.js` Test 6; `qa-live` subgraph section; `qa-dom` per-anchor section.
- v0.16 devnet date control hidden (3 editable inputs), yet the anchor stays in
  the model/export and the devnet task remains present and movable via its offset
  → `verify.js` Test 20; `verify-dom.js` devnet-control-hidden + HTML-input-count
  sections; `qa-dom` devnet section; `qa-live` control-anchor assertions.
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
  `app.js`); two grouped date inputs (`#v016_testnet_date`, then
  `#circle_announcement_date`) drive their subgraphs. The Wave 2 start and v0.16
  devnet dates are fixed past baselines with **no** control input, but stay in the
  model/export and as their tasks' anchors.
- User edits and chosen defaults persist under `localStorage` key
  `bread-calendar-model-v3r4` (`schema: 3`, `revision: 4`); prior-release keys are
  cleared on load; `Restore shipped defaults` or clearing site data returns to the
  shipped 33-task model. Nothing is written to disk except the JSON the user
  explicitly exports.

## Defects or unresolved questions

No recalculation, resolution, drag/drop, highlight, persistence, or legend-filter
defects found. The only environmental limitation is browser rendering (above),
handled by the data-driven SVG preview. No PMM/date-rule questions remain
unreported.
