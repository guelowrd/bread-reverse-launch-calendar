# Bread Reverse Launch Calendar

A self-contained, no-build local artifact that turns Pam's static Bread reverse
launch calendar into an interactive one. Move the **teaser date** and **launch
date**, edit/add/remove any task, and drag tasks around the calendar; all
**29 tasks** recalculate from **business-day** offsets across an anchor **graph**.

The shipped default model is `bread-calendar-model.json`
(**teaser 2026-08-06**, **launch 2026-08-13**, 27 tasks) plus the two tasks added
in this revision, described under
[Default model](#default-model-the-shipped-29-row-schedule).

This model is a dependency graph:

- Every task has a **stable id** that is independent of its (editable) label.
- A task's anchor is either a **date anchor** (`teaser_date` / `launch_date`) or
  an **item anchor** (another task's id). You pick the anchor directly from one
  grouped dropdown; the **anchor type** and **external-dependency** flag are then
  **deduced** from that choice, not entered by hand (see below).
- Item-anchored tasks **recompute when their parent moves**, so a whole
  dependency chain shifts together.
- Cycles and invalid anchor ids are **detected and reported** instead of
  crashing.

Source material:

- PMM interactive spec: `/workspace/team/pam/bread_reverse_calendar_interactive_spec.md`
- Extracted business-day task rules/offsets: `/workspace/team/aurelia/bread-calendar-task-rules-offsets-spec.md`
- Static source generator: `/workspace/team/pam/bread_reverse_calendar.py`

## Run it

No build step, no dependencies.

- **Open locally:** double-click `index.html`, or open it in a browser
  (`file://` works, everything is relative).
- **Serve statically** (optional):
  ```
  cd /workspace/team/devina/bread-interactive-calendar
  python3 -m http.server 8000
  # then visit http://localhost:8000/
  ```

## What it does

- **Teaser date** and **Launch date** inputs. Editing either recalculates
  instantly. The two date anchors are independent: moving the teaser does not
  move launch-rooted chains, and vice versa.
- **Calendar view** (month grids covering whatever span the recalculated tasks
  occupy) and **Table view**. Today's date is highlighted in dark blue. Leading/trailing empty week rows are trimmed
  dynamically, so empty weeks at the start/end of a month are not rendered and
  the visible range expands/contracts as tasks move. **Week trimming is computed
  from the full resolved task set**, so toggling a category filter never changes
  which weeks are shown — it only hides/shows pills inside the already-fixed
  weeks (the teaser/launch anchor cells always render).
- **Fully editable task table.** Every row exposes:
  - **Label** (free text; the stable id underneath never changes).
  - **Category** (dropdown, all 8 categories, shown as `{n}) name`).
  - **Anchor** (one grouped dropdown). **Teaser date** and **Launch date** always
    sit at the top; every other task follows, grouped by category (optgroup
    labels `{n}) name`) and sorted by resolved date within each group. The
    current row is excluded. You never choose an "anchor type" first: picking
    teaser/launch makes it a date anchor, picking a task makes it an item anchor.
  - **Offset** in business days (number field).
  - **Reset row** restores that row to its stored defaults.
  - **Remove** deletes that task from the model.

  **Anchor type and external dependency are not editable** any more: both are
  **deduced from the anchor**. Anchoring to the teaser/launch date makes a task a
  `date_anchor` with `external_dependency = false`; anchoring to another task
  makes it an `item_anchor` with `external_dependency = true`. These fields are
  still exported (for JSON compatibility) but are always derived from `anchor_id`,
  never user-set, so they stay consistent after every edit, reset, import, and
  restore. There is **no `DEP` badge and no `Ext. dep` / `Anchor type` column**.
- **Add and remove tasks.** An **`Add task`** control (in the Model actions,
  next to Reset/Export) appends a new task with a unique **stable id**, a
  `{n}) New task` label, and sane defaults (category **product**, anchor **teaser
  date**, offset **0**); it shows up immediately in the table, calendar, export,
  and `localStorage`. Each table row also has a **`Remove`** button. Removing a
  task that other tasks anchor to does **not** leave dangling anchors: each
  dependent is **re-anchored to the removed task's own anchor** (preserving its
  offset) when that anchor is still valid, or falls back to the **teaser date
  with offset 0**. The two reserved date anchors (teaser/launch) are not tasks
  and cannot be removed. You can remove shipped tasks too; **Restore shipped
  defaults** brings the full shipped model back.
- **Item anchors recompute downstream.** Changing a parent task's date (by
  editing its offset/anchor, or by dragging it) moves every task anchored to it,
  and their descendants, by the same business-day distance.
- **Cycle / invalid-anchor detection.** If edits create an anchor cycle
  (A anchors B anchors ... anchors A) or point at a missing id, the affected
  rows are marked **unresolved** (not placed on the calendar) and a clear error
  warning is shown. The rest of the model still renders.
- **Drag and drop.** Drag a task pill onto any day cell in the calendar. The
  task keeps its current anchor; its **offset becomes the business-day distance**
  from that anchor's resolved date to the drop date. Downstream item-anchored
  tasks then recompute.
- **Click to highlight.** Click a task pill to highlight it and its **anchor
  chain** up to the terminating date anchor (the teaser/launch day cell is
  highlighted too). Details appear in a **floating popup** (position: fixed,
  outside document flow, draggable by its header) showing the task's id, resolved
  date, anchor, offset, category, and the full chain
  (`A <- B <- C <- teaser date`). Because the popup is not in the page flow,
  **selecting a task changes only highlight state, never the calendar layout** (no
  vertical shift). When nothing is selected the popup is hidden and reserves no
  space.
- **Warnings.** Launch before teaser (error), teaser-to-launch gap under 3
  business days (warning), any unresolved cycle/invalid anchor (error), and any
  **critical dependency that lands after launch** (error). See below.
- **Categories, colors, labels, and pattern cues** preserved: color is never the
  only cue. Each category also carries a hatch/stripe/cross/circle pattern plus
  its full text label. The **legend swatches render the same patterns as the
  calendar cells**. Weekend columns are pale yellow; teaser/launch digits are
  circled.
- **Legend category filter.** The legend doubles as a filter for both views:
  - **Click** a category to show only that category's tasks.
  - **Click another** to add it; **click a selected** one to remove it.
  - With **no categories selected**, everything shows ("show all").
  - **Double-click** the legend to reset to all categories visible.
  - Selected categories are marked **active** (bold label, solid outline,
    `aria-pressed="true"`); unselected are **inactive** (dimmed) while a
    selection is in effect. Keyboard accessible (Enter/Space). Filtering never
    changes computed dates or warnings.
- **Category numbering is contiguous 0..7** across the legend and every visible
  label, always shown with a `)` separator (`{n}) text`): `0) v0.16 dependency`,
  `1) Product / go-no-go`, `2) Stores`, `3) Video / design`, `4) Website /
  waitlist`, `5) Support`, `6) Comms`, `7) Public moment`. Every task label also
  carries its category number and separator, e.g. `0) v0.16 dependency`,
  `1) PRODUCT: date feasibility chat`.

## Editable defaults, export, and browser persistence

The artifact is a **static local page**: it cannot write back to its own source
files from the browser. So editable state lives in the browser instead:

- **`localStorage` holds your working model** (key `bread-calendar-model-v2`):
  every edit to a label, category, anchor, or offset, every task you **add or
  remove**, plus your chosen teaser/launch dates and any **user-chosen
  defaults**, is saved automatically and
  restored on the next page load in the same browser. Old persisted models are
  normalized on load: derived `anchor_type` / `external_dependency` are recomputed,
  and old `n text` labels are migrated to `n) text`.
- **`Set current as defaults`** promotes the current values into each task's
  `default_*` fields. Afterwards, **Reset** and export use those values.
- **`Reset to defaults`** restores every row to its **currently chosen defaults**
  (each task's `default_*`) and the default date anchors, and clears the legend
  filter and highlight.
- **`Restore shipped defaults`** discards both your edits **and** your chosen
  defaults, returning to the model shipped in `model.js`.
- **`Export JSON`** downloads the full current model
  (`bread-calendar-model.json`): teaser/launch dates and every task's id, label,
  category, anchor type/id, offset, external-dependency flag, **and** its
  `default_*` fields.

**Persistence vs shipped defaults, explicitly:**

| Where | What it holds | How to reset |
|---|---|---|
| `model.js` (source) | The **shipped** 29-task model and its defaults. Read-only from the browser. | n/a |
| `localStorage` (per browser) | Your working edits + chosen defaults + dates. | `Restore shipped defaults`, or clear site data. |
| Exported JSON file | A snapshot you can archive or hand off. | n/a |

Because persistence is per-browser `localStorage`, a different browser, a
private window, or cleared site data starts from the shipped defaults. There is
no server and nothing is written to disk except the JSON you explicitly export.

## Business-day offsets

Offsets are measured in **business days**, not calendar days.

- Monday to Friday are business days; Saturday and Sunday are skipped.
- **Offset 0** returns the anchor date verbatim.
- **Positive N** lands on the Nth business day forward; **negative N** backward.
- Weekends encountered while traversing are stepped over, never counted.
- **Weekend anchors:** offset 0 returns the weekend anchor as-is (and the task
  gets a `WKND` marker); any nonzero offset walks weekdays only.

`addBusinessDays()` and its inverse `businessDaysBetween()` implement this; the
latter is what drag/drop uses to convert a drop date into a new offset.

## Anchor model

Each task carries:

| field | meaning |
|---|---|
| `id` | stable internal id, independent of the label |
| `label` | visible, editable label (`{n}) text`) |
| `category` | one of the 8 categories |
| `anchor_id` | `teaser_date`, `launch_date`, or another task's id (the editable choice) |
| `anchor_type` | **derived**: `date_anchor` if `anchor_id` is teaser/launch, else `item_anchor` |
| `offset_business_days` | signed business-day offset from the anchor |
| `external_dependency` | **derived**: `false` for date anchors, `true` for item anchors |
| `default_*` | the reset/export baseline for each editable field |

`anchor_type` and `external_dependency` are always recomputed from `anchor_id`
(via `deriveAnchorType` / `deriveExternalDependency`), so an old persisted or
imported model whose stored flags disagree with its anchor is normalized on load.

Resolution walks item anchors to their parents (memoized), so a chain like
`0) Client/wallet/Epoch upgrade done <- 0) Guardian upgrade done <- 0) v0.16 on
testnet <- 0) v0.16 on devnet <- 1) PRODUCT: Everything working e2e <- teaser
date` resolves top to bottom and moves as one unit when any link moves.

## Default model: the shipped 29-row schedule

Default anchors: **teaser 2026-08-06** (Thu), **launch 2026-08-13** (Thu),
matching `bread-calendar-model.json`. Under these anchors the shipped model
resolves to (sorted by date):

| task | category | anchor | offset (bd) | default date |
|---|---|---|---:|---|
| `1) PRODUCT: date feasibility chat` | Product | teaser date | -15 | 2026-07-16 |
| `0) v0.16 on devnet` | v0.16 | item: `1) PRODUCT: Everything working e2e` | -12 | 2026-07-20 |
| `6) COMMS: article/social drafts` | Comms | teaser date | -13 | 2026-07-20 |
| `1) PRODUCT: company testing (try 1)` | Product | teaser date | -12 | 2026-07-21 |
| `5) SUPPORT: test workflow` | Support | item: `1) PRODUCT: company testing (try 1)` | 0 | 2026-07-21 |
| `3) VIDEO: teaser final` | Video / design | teaser date | -10 | 2026-07-23 |
| `2) STORES: submit post-tests (v.P-T)` | Stores | teaser date | -9 | 2026-07-24 |
| `3) LAUNCH VIDEO: storyboard` | Video / design | launch date | -13 | 2026-07-27 |
| `0) Guardian upgrade done` | v0.16 | item: `0) v0.16 on testnet` | -2 | 2026-07-28 |
| `3) VISUAL IDENTITY: Board` | Video / design | teaser date | -7 | 2026-07-28 |
| `1) PRODUCT: company testing (try 2)` | Product | item: `1) PRODUCT: company testing (try 1)` | +5 | 2026-07-28 |
| `3) LAUNCH VIDEO: capture` | Video / design | item: `3) LAUNCH VIDEO: storyboard` | +2 | 2026-07-29 |
| `4) WEBSITE - new version out` | Website / waitlist | teaser date | -6 | 2026-07-29 |
| `0) v0.16 on testnet` | v0.16 | item: `0) v0.16 on devnet` | +8 | 2026-07-30 |
| `2) STORES: v.P-T live` | Stores | item: `2) STORES: submit post-tests (v.P-T)` | +5 | 2026-07-31 |
| `6) COMMS: link pack ready` | Comms | item: `6) COMMS: article/social drafts` | +10 | 2026-08-03 |
| `0) Client/wallet/Epoch upgrade done` | v0.16 | item: `0) Guardian upgrade done` | +4 | 2026-08-03 |
| `2) STORES: submit final version` | Stores | teaser date | -3 | 2026-08-03 |
| `5) SUPPORT: final polish done` | Support | launch date | -7 | 2026-08-04 |
| `4) WAITLIST: sub form out` | Website / waitlist | teaser date | -1 | 2026-08-05 |
| `1) GO/NO-GO before teaser` | Product | teaser date | -1 | 2026-08-05 |
| `3) LAUNCH VIDEO: review` | Video / design | item: `3) LAUNCH VIDEO: capture` | +5 | 2026-08-05 |
| `1) PRODUCT: Everything working e2e` | Product | teaser date | -1 | 2026-08-05 |
| `7) PUBLIC: teaser if GO` | Public | teaser date | 0 | 2026-08-06 |
| `2) STORES: final version live` | Stores | item: `2) STORES: submit final version` | +5 | 2026-08-10 |
| `6) COMMS: launch final` | Comms | launch date | -2 | 2026-08-11 |
| `4) LANDING: page live` | Website / waitlist | launch date | -1 | 2026-08-12 |
| `3) LAUNCH VIDEO: final` | Video / design | item: `3) LAUNCH VIDEO: review` | +5 | 2026-08-12 |
| `7) PUBLIC: Launch announcement` | Public | launch date | 0 | 2026-08-13 |

The earliest task is `1) PRODUCT: date feasibility chat` (2026-07-16, a
Thursday), so with default anchors the July grid's first visible week row is
**July 12-18** (the Jun 28-Jul 4 and Jul 5-11 weeks are empty and trimmed).

### Relationship to `bread-calendar-model.json`

The shipped default **is** the attached `bread-calendar-model.json` baseline
(27 tasks, also copied into the repo as `baseline-model.json`) **plus the two
tasks added in this revision**. The baseline JSON already ships with the
`{n}) text` index separators and with `external_dependency` already consistent
with the anchor rule (item anchor => `true`, date anchor => `false`), so there
are **no separator or dependency deltas** — the only difference between shipped
and baseline is the two added tasks. `verify.js` (Test 0) asserts every baseline
row matches the shipped row exactly (label, category, `anchor_id`, offset,
`external_dependency`) and that exactly two ids are new.

`anchor_type` and `external_dependency` remain **derived** fields (recomputed
from `anchor_id`) that are still exported for JSON compatibility.

### Tasks added / changed in this revision

- **New task** `1) PRODUCT: company testing (try 2)` — item-anchored to
  `1) PRODUCT: company testing (try 1)` at **+5** business days
  (`company_testing_try_2`), landing 2026-07-28.
- **New task** `4) WEBSITE - new version out` — teaser date **-6** business days
  (`website_new_version_out`), landing 2026-07-29.
- **Category 4 renamed** from `Landing / waitlist` to **`Website / waitlist`**
  (the category **key** stays `landing` for backward compatibility; only the
  display name changed).

These take the shipped total from the baseline's 27 tasks to **29**.

## Critical-dependency warnings

If any of these tasks lands **after** the launch date, a blocking-style error
warning is shown (they are the dependencies that must be done by launch):

- `0) v0.16 on testnet`
- `0) Guardian upgrade done`
- `0) Client/wallet/Epoch upgrade done`
- `2) STORES: v.P-T live`
- `6) COMMS: launch final`
- `3) LAUNCH VIDEO: final`
- `5) SUPPORT: final polish done`

At the shipped defaults none of these lands after launch, so no critical warning
is shown.

## Files

| file | purpose |
|---|---|
| `index.html` | page shell + controls |
| `model.js` | task graph model (29 tasks) + business-day math + derived anchor_type/external_dependency + add/remove helpers + resolution/cycle detection; shared by browser and tests |
| `app.js` | browser UI: calendar/table rendering, editing, add/remove tasks, drag/drop, floating highlight popup, localStorage, export, legend filter |
| `baseline-model.json` | copy of the attached `bread-calendar-model.json` shipped baseline; `verify.js` compares shipped defaults against it |
| `styles.css` | layout, category colors/tints, pattern cues, highlight/drag styling |
| `verify.js` | Node test of the pure model (graph resolution, cycles, warnings, defaults, export) |
| `verify-dom.js` | Node smoke test that runs the real `app.js` render/event path via a tiny DOM shim |
| `qa-live-recalc-check.js` | QA scenario assertions for date + item-anchor recalculation |
| `qa-dom-live-recalc-check.js` | QA scenarios through the real `app.js` render/event path (incl. drag/drop, highlight) |
| `VERIFICATION.md` | Manual QA handoff with exact inputs, observed results, commands, and status |

## Where the model lives in code

The canonical rules are in `model.js`:

- `DEFAULT_TEASER` / `DEFAULT_LAUNCH` define the default date anchors
  (2026-08-06 / 2026-08-13).
- `CATEGORIES` / `CATEGORY_ORDER` define category names, colors, tints, patterns.
- `deriveAnchorType()` / `deriveExternalDependency()` deduce those two fields from
  `anchor_id`; `cloneTask()` / `promoteToDefaults()` / `resetToDefaults()` route
  through them so the derived fields always stay consistent (incl. normalizing old
  persisted/imported models).
- `SHIPPED_SPEC` / `SHIPPED_TASKS` is the shipped 29-row model; `defaultModel()`
  returns a fresh working clone.
- `makeTask()` builds a new task (unique id via `uniqueTaskId()`, product /
  teaser / offset-0 defaults); `removeTask()` deletes a task and re-anchors its
  dependents (to the removed task's anchor, or teaser + offset 0 as a fallback).
- `resolveGraph()` resolves dates through date/item anchors with memoized DFS and
  cycle/invalid-anchor detection; `recalc()` wraps it and computes `moved` flags.
- `validate()` produces gap, cycle/invalid, and critical-after-launch warnings.
- `promoteToDefaults()` / `resetToDefaults()` implement the defaults workflow;
  `exportModel()` builds the JSON payload; `anchorChain()` walks the highlight
  chain; `addBusinessDays()` / `businessDaysBetween()` are the date math.

`app.js` owns presentation and interaction; `styles.css` owns styling and
accessibility cues.

## Verify

```
node verify.js                   # model: graph resolution, item anchors, cycles, warnings, defaults, export
node verify-dom.js               # UI render path: editing, drag/drop, highlight, defaults, export, legend filter
node qa-live-recalc-check.js     # QA scenarios: date + item-anchor recalculation and independence
node qa-dom-live-recalc-check.js # QA scenarios through the real app.js event/render path
node --check model.js app.js verify.js verify-dom.js qa-live-recalc-check.js qa-dom-live-recalc-check.js
```

All exit `0` on success. See `VERIFICATION.md` for the latest inputs, observed
results, static-server check, and status.

## Local implementation choices (not PMM rules)

1. **Stable ids under editable labels.** Renaming a task never breaks anchors,
   because anchors reference ids, not labels.
2. **Drag/drop maps to offset, not to an absolute date.** Dropping a task keeps
   its anchor and sets the offset to the business-day distance from the anchor,
   so the task still moves with its anchor afterward.
3. **Unresolved tasks are not placed on the calendar.** A cycle/invalid-anchor
   row is shown as `unresolved` in the table and surfaced as a warning, rather
   than guessing a date.
4. **Weekend anchors** keep an offset-0 date on the weekend (with a `WKND`
   marker); any nonzero offset walks weekdays only.
5. **Month span is derived** from the resolved dates plus both anchors; empty
   leading/trailing week rows are trimmed dynamically.
6. All date math is **UTC-based** to avoid local-timezone off-by-one drift.
7. **Editable defaults live in `localStorage`**, since a static page cannot write
   its own source. `Restore shipped defaults` (or clearing site data) returns to
   the `model.js` shipped model.
8. **Removing a task re-anchors its dependents rather than orphaning them.** A
   dependent moves to the removed task's own anchor (keeping its offset) when
   that is still valid, else to the teaser date with offset 0. This keeps the
   graph resolvable with no dangling anchors and is covered by the tests.

## Assumptions and unresolved caveats

- Business-day offsets are Monday-Friday only; no holiday calendar is modeled.
- The external-dependency flag is **not editable**: it is deduced from the anchor
  (item anchor => external dependency). It is still exported for JSON
  compatibility but has no `DEP` badge or column in the UI.
- Browser edits and chosen defaults persist only in the current browser's
  `localStorage`; there is no server-side or cross-device persistence.
- Direct browser-tool verification of `file://` / `localhost` is blocked in this
  agent environment; the artifact uses only relative local files and is verified
  by the Node suites plus a static-server pass.
