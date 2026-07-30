# Bread Reverse Launch Calendar

A self-contained, no-build local artifact that turns Pam's static Bread reverse
launch calendar into an interactive one. Move the **Wave 2 start date**,
edit/add/remove any task, and drag tasks around the calendar; all **31 tasks**
recalculate from **business-day** offsets across an anchor **graph**.

The shipped default model is the authoritative wave-based v3 JSON
(`bread-calendar-model-v3.json`, copied into the repo as `baseline-model.json`):
**Wave 2 start 2026-07-31**, 31 tasks, spanning the Wave 2 → Wave 6 rollout.

This model is a dependency graph:

- Every task has a **stable id** that is independent of its (editable) label.
- A task's anchor is either the single **date anchor** (`wave2_date`, the Wave 2
  start) or an **item anchor** (another task's id). You pick the anchor directly
  from one grouped dropdown; the **anchor type** is then **deduced** from that
  choice, not entered by hand.
- Item-anchored tasks **recompute when their parent moves**, so a whole
  dependency chain shifts together.
- Cycles and invalid anchor ids are **detected and reported** instead of
  crashing.

## What changed in v3 (from the teaser/launch model)

The previous model had two independent date anchors — a **teaser** and a
**launch** — and 29 tasks describing a single teaser→launch moment. v3 replaces
that with a **wave-based rollout** rooted at a **single** editable date anchor:

- **One date anchor:** `wave2_date` (initial **2026-07-31**, label **Wave 2
  start**). There is no `teaser_date` / `launch_date` any more. Moving Wave 2
  shifts the **entire** downstream chain.
- **The narrative is Wave 2 → feedback/changes → stores → Wave 3 → Wave 4 →
  Wave 5 → optional Wave 6.** Support is ready before Wave 2 and active
  throughout; the v0.16 dependency chain (Devnet → Testnet → Guardian →
  Client/wallet/Epoch) feeds the waves; Circle sits under Public with the
  website + waitlist go-live beneath it; Wave 4 lands 5 business days after the
  website is live; Wave 6 is optional.
- **Removed obsolete rows:** the launch article, the launch-video
  storyboard/capture/review/final chain, the broad/public launch, the
  teaser/launch pair, versioned tiers, the "Where cleared" and retry tasks.
- **`external_dependency` is now a stored, meaningful flag** (not derived).
  Some item-anchored tasks are things we wait on an outside party for (v0.16
  releases, app-store approvals, the Circle announcement, the website going
  live) and some are internal work; the flag distinguishes them and is shown as
  an **EXT** cue on the calendar/table and in the details popup.

## Run it

No build step, no dependencies.

- **Open locally:** double-click `index.html`, or open it in a browser
  (`file://` works, everything is relative).
- **Serve statically** (optional):
  ```
  cd /workspace/team/devina/bread-reverse-launch-calendar-repo-1784802626
  python3 -m http.server 8000
  # then visit http://localhost:8000/
  ```

## What it does

- **Wave 2 start** date input. Editing it recalculates the whole graph instantly,
  because every task ultimately roots at the Wave 2 date (directly or through an
  item-anchor chain).
- **Calendar view** (month grids covering whatever span the recalculated tasks
  occupy) and **Table view**. Today's date is highlighted in dark blue. Leading/
  trailing empty week rows are trimmed dynamically. **Week trimming is computed
  from the full resolved task set**, so toggling a category filter never changes
  which weeks are shown — it only hides/shows pills inside the already-fixed
  weeks (the Wave 2 anchor cell always renders).
- **Fully editable task table.** Every row exposes:
  - **Label** (free text; the stable id underneath never changes).
  - **Category** (dropdown, all 8 categories, shown as `{n}) name`).
  - **Anchor** (one grouped dropdown). **Wave 2 start** sits at the top; every
    other task follows, grouped by category (optgroup labels `{n}) name`) and
    sorted by resolved date within each group. The current row is excluded. You
    never choose an "anchor type" first: picking Wave 2 start makes it a date
    anchor, picking a task makes it an item anchor.
  - **Offset** in business days (number field; supports negative offsets).
  - **Reset row** restores that row to its stored defaults.
  - **Remove** deletes that task from the model.

  **Anchor type is not editable** — it is **deduced** from the anchor
  (`deriveAnchorType`): anchoring to the Wave 2 date makes a task a `date_anchor`;
  anchoring to another task makes it an `item_anchor`. **`external_dependency` is
  a stored flag** carried in the model JSON and in `default_external_dependency`;
  it is preserved across edits, resets, import, and export, and is surfaced as an
  **EXT** marker rather than being edited by hand.
- **Add and remove tasks.** An **`Add task`** control appends a new task with a
  unique **stable id**, a `{n}) New task` label, and sane defaults (category
  **product**, anchor **Wave 2 start**, offset **0**, not external); it shows up
  immediately in the table, calendar, export, and `localStorage`. Each table row
  also has a **`Remove`** button. Removing a task that other tasks anchor to does
  **not** leave dangling anchors: each dependent is **re-anchored to the removed
  task's own anchor** (preserving its offset) when that anchor is still valid, or
  falls back to the **Wave 2 date with offset 0**. The reserved date anchor
  (`wave2_date`) is not a task and cannot be removed. **Restore shipped defaults**
  brings the full shipped model back.
- **Item anchors recompute downstream.** Changing a parent task's date (by
  editing its offset/anchor, or by dragging it) moves every task anchored to it,
  and their descendants, by the same business-day distance.
- **Cycle / invalid-anchor detection.** If edits create an anchor cycle or point
  at a missing id, the affected rows are marked **unresolved** (not placed on the
  calendar) and a clear error warning is shown. The rest of the model still
  renders.
- **Drag and drop.** Drag a task pill onto any day cell. The task keeps its
  current anchor; its **offset becomes the business-day distance** from that
  anchor's resolved date to the drop date. Downstream item-anchored tasks then
  recompute.
- **Click to highlight.** Click a task pill to highlight it and its **anchor
  chain** up to the Wave 2 date cell. Details appear in a **floating popup**
  (position: fixed, draggable by its header) showing the task's id, resolved
  date, anchor, offset, category, **external-dependency flag**, and the full
  chain (`A <- B <- ... <- Wave 2 start`). Because the popup is out of document
  flow, selecting a task changes only highlight state, never the calendar layout.
- **Categories, colors, labels, and pattern cues** preserved: color is never the
  only cue. Each category carries a hatch/stripe/cross/circle pattern plus its
  full text label. The **legend swatches render the same patterns as the calendar
  cells**. Weekend columns are pale yellow; the Wave 2 anchor digit is circled.
  **External dependencies** carry an `EXT` badge and a dashed pill border.
- **Legend category filter.** The legend doubles as a filter for both views:
  click a category to show only it, click another to add it, click a selected one
  to remove it; with none selected, everything shows. Double-click resets to all.
  Selected categories are marked **active** (`aria-pressed="true"`). Keyboard
  accessible (Enter/Space). Filtering never changes computed dates or warnings.
- **Category numbering is contiguous 0..7** across the legend and every visible
  label (`{n}) text`): `0) v0.16 dependency`, `1) Product / go-no-go`,
  `2) Stores`, `3) Video / design`, `4) Website / waitlist`, `5) Support`,
  `6) Comms`, `7) Public moment`.

## Business-day offsets

Offsets are measured in **business days**, not calendar days.

- Monday to Friday are business days; Saturday and Sunday are skipped.
- **Offset 0** returns the anchor date verbatim.
- **Positive N** lands on the Nth business day forward; **negative N** backward.
- Weekends encountered while traversing are stepped over, never counted.
- **Weekend anchors:** offset 0 returns the weekend anchor as-is (with a `WKND`
  marker); any nonzero offset walks weekdays only.

`addBusinessDays()` and its inverse `businessDaysBetween()` implement this; the
latter is what drag/drop uses to convert a drop date into a new offset.

## Anchor model

Each task carries:

| field | meaning |
|---|---|
| `id` | stable internal id, independent of the label |
| `label` | visible, editable label (`{n}) text`) |
| `category` | one of the 8 categories |
| `anchor_id` | `wave2_date` or another task's id (the editable choice) |
| `anchor_type` | **derived**: `date_anchor` if `anchor_id` is `wave2_date`, else `item_anchor` |
| `offset_business_days` | signed business-day offset from the anchor |
| `external_dependency` | **stored** semantic flag (waiting on an outside party) |
| `default_*` | the reset/export baseline for each editable field |

`anchor_type` is always recomputed from `anchor_id` (via `deriveAnchorType`), so
an old persisted or imported model whose stored `anchor_type` disagrees with its
anchor is normalized on load. `external_dependency` is **preserved** as stored
(there is no `deriveExternalDependency`): item anchors are a mix of external
(v0.16 chain, store go-lives, Circle, website) and internal (product feedback,
comms prep, waitlist QA) work, so the flag cannot be derived from anchor type.

Resolution indexes the **full graph by id first**, then walks item anchors to
their parents (memoized DFS), so an item anchor may reference a task defined
**later** in the array (a forward reference) and still resolve. There are **no
multi-dependencies** — each task has exactly one anchor.

## Default model: the shipped 31-row schedule

Default anchor: **Wave 2 start 2026-07-31** (Friday), matching
`baseline-model.json`. Under this anchor the shipped model resolves to (sorted by
date; **EXT** = stored external dependency):

| task | category | anchor | offset (bd) | date | EXT |
|---|---|---|---:|---|:---:|
| `0) v0.16 on devnet` | v0.16 | item: `1) PRODUCT: Wave 2 company testing` | -5 | 2026-07-24 | ✓ |
| `1) PRODUCT: Wave 2 decision` | Product | Wave 2 start | -1 | 2026-07-30 | |
| `5) SUPPORT: intake workflow ready` | Support | item: `1) PRODUCT: Wave 2 company testing` | -1 | 2026-07-30 | |
| `1) PRODUCT: Wave 2 company testing` | Product | Wave 2 start | 0 | 2026-07-31 | |
| `0) Guardian upgrade done` | v0.16 | item: `0) v0.16 on testnet` | -2 | 2026-08-03 | ✓ |
| `0) v0.16 on testnet` | v0.16 | item: `0) v0.16 on devnet` | +8 | 2026-08-05 | ✓ |
| `1) PRODUCT: Wave 2 feedback + changes` | Product | item: `1) PRODUCT: Wave 2 company testing` | +3 | 2026-08-05 | |
| `2) STORES: submit post-Wave-2 build` | Stores | item: `1) PRODUCT: Wave 2 feedback + changes` | 0 | 2026-08-05 | |
| `2) STORES: post-Wave-2 build live` | Stores | item: `2) STORES: submit post-Wave-2 build` | +1 | 2026-08-06 | ✓ |
| `0) Client/wallet/Epoch upgrade done` | v0.16 | item: `0) Guardian upgrade done` | +4 | 2026-08-07 | ✓ |
| `6) COMMS: Wave 3 tester pack ready` | Comms | item: `1) PRODUCT: Wave 3 trusted-network testing` | -1 | 2026-08-07 | |
| `1) PRODUCT: Wave 3 trusted-network testing` | Product | item: `0) v0.16 on testnet` | +3 | 2026-08-10 | |
| `3) VISUAL IDENTITY: board ready` | Video / design | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | -7 | 2026-08-10 | |
| `4) WAITLIST: form + CRM flow ready` | Website / waitlist | item: `7) PUBLIC: Circle announcement` | -1 | 2026-08-11 | |
| `7) PUBLIC: Circle announcement` | Public | item: `0) v0.16 on testnet` | +5 | 2026-08-12 | ✓ |
| `4) WEBSITE: new website + Bread waitlist live` | Website / waitlist | item: `7) PUBLIC: Circle announcement` | 0 | 2026-08-12 | ✓ |
| `1) PRODUCT: Wave 3 feedback + changes` | Product | item: `1) PRODUCT: Wave 3 trusted-network testing` | +3 | 2026-08-13 | |
| `2) STORES: submit post-Wave-3 build` | Stores | item: `1) PRODUCT: Wave 3 feedback + changes` | 0 | 2026-08-13 | |
| `2) STORES: post-Wave-3 build live` | Stores | item: `2) STORES: submit post-Wave-3 build` | +1 | 2026-08-14 | ✓ |
| `3) VIDEO: teaser final` | Video / design | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | -1 | 2026-08-18 | |
| `6) COMMS: Wave 4 channels + waitlist CTA ready` | Comms | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | -1 | 2026-08-18 | |
| `7) PUBLIC: Wave 4 teaser + waitlist push` | Public | item: `4) WEBSITE: new website + Bread waitlist live` | +5 | 2026-08-19 | |
| `1) PRODUCT: Wave 4 feedback + changes` | Product | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | +3 | 2026-08-24 | |
| `2) STORES: submit post-Wave-4 build` | Stores | item: `1) PRODUCT: Wave 4 feedback + changes` | 0 | 2026-08-24 | |
| `2) STORES: post-Wave-4 build live` | Stores | item: `2) STORES: submit post-Wave-4 build` | +1 | 2026-08-25 | ✓ |
| `6) COMMS: Wave 5 X push + How Bread Works ready` | Comms | item: `7) PUBLIC: Wave 5 X waitlist follow-up` | -1 | 2026-08-25 | |
| `7) PUBLIC: Wave 5 X waitlist follow-up` | Public | item: `2) STORES: post-Wave-4 build live` | +1 | 2026-08-26 | |
| `1) PRODUCT: Wave 5 feedback + changes` | Product | item: `7) PUBLIC: Wave 5 X waitlist follow-up` | +3 | 2026-08-31 | |
| `2) STORES: submit post-Wave-5 build` | Stores | item: `1) PRODUCT: Wave 5 feedback + changes` | 0 | 2026-08-31 | |
| `2) STORES: post-Wave-5 build live` | Stores | item: `2) STORES: submit post-Wave-5 build` | +1 | 2026-09-01 | ✓ |
| `7) PUBLIC: Wave 6 targeted push if needed` | Public | item: `2) STORES: post-Wave-5 build live` | +1 | 2026-09-02 | |

The earliest task is `0) v0.16 on devnet` (2026-07-24, a Friday), so with the
default anchor the July grid's first visible week row is **Jul 19-25** (the empty
weeks before are trimmed). The latest is `7) PUBLIC: Wave 6 targeted push if
needed` (2026-09-02), so the calendar spans July → September 2026.

### Relationship to `baseline-model.json`

The shipped default **is** the authoritative v3 JSON (31 tasks, copied into the
repo as `baseline-model.json`). `verify.js` (Test 0) asserts every baseline row
matches the shipped row **exactly** — label, category, `anchor_type`,
`anchor_id`, offset, `external_dependency`, and all `default_*` fields — that the
top-level is `version: 3` with a `wave2_date`, and that there are **no**
`teaser_date` / `launch_date` fields.

## Narrative made visible

The requested storyline is reflected in the resolved graph and asserted by the
tests:

- **Support is ready before Wave 2 and active throughout** —
  `5) SUPPORT: intake workflow ready` (2026-07-30) lands before Wave 2 start
  (2026-07-31).
- **v0.16 chain** — Devnet → Testnet (`+8bd`) → Guardian (`-2bd` off testnet) →
  Client/wallet/Epoch (`+4bd` off Guardian); Devnet is scheduled before Wave 2.
- **Wave 3 after testnet** — `1) PRODUCT: Wave 3 trusted-network testing` is item-
  anchored to `0) v0.16 on testnet` at `+3bd`.
- **Circle under Public; website + waitlist under Circle** — Circle announcement
  is a Public moment; the website go-live and the waitlist QA both anchor to it.
- **Wave 4 lands 5bd after the website is live** — `7) PUBLIC: Wave 4 teaser +
  waitlist push` is `website_out +5bd`. Wave 4 channels are X teaser, Website,
  Newsletter, Telegram with a "Subscribe to waitlist" CTA (comms + video prep
  rows).
- **Wave 5** is the second X waitlist push plus "How Bread Works"; **Wave 6** is
  the optional targeted push.
- **feedback/changes `+3bd`** after each wave start; **store submit** the same day
  as feedback and **store go-live `+1bd`** after submit, for Waves 2–5.

## External dependencies

Ten tasks ship with `external_dependency: true` — the things gated on an outside
party: `v016_devnet`, `v016_testnet`, `guardian_upgrade_done`,
`client_wallet_done`, `circle_announcement`, `website_out`, and each wave's store
go-live (`wave2_stores_live` … `wave5_stores_live`). They render with an `EXT`
badge and a dashed pill border on the calendar, an `EXT` mark in the table, and an
"External dependency: yes" line in the details popup.

## Editable defaults, export, and browser persistence

The artifact is a **static local page**: it cannot write back to its own source
files. So editable state lives in the browser:

- **`localStorage` holds your working model** under the **versioned** key
  `bread-calendar-model-v3` (a payload `{ schema: 3, wave2, tasks }`). Every edit,
  add/remove, the chosen Wave 2 date, and any user-chosen defaults are saved and
  restored on the next load. **Stale state cannot mask the new defaults:** any
  pre-wave state under the old `bread-calendar-model-v2` / `bread-calendar-model`
  keys is proactively removed on load, and a payload whose `schema` is not `3` is
  ignored. Accepted models are normalized on load (derived `anchor_type`
  recomputed; old `n text` labels migrated to `n) text`).
- **`Set current as defaults`** promotes the current values into each task's
  `default_*` fields. Afterwards, **Reset** and export use those values.
- **`Reset to defaults`** restores every row to its currently chosen defaults and
  the default Wave 2 date, and clears the legend filter and highlight.
- **`Restore shipped defaults`** discards edits **and** chosen defaults, returning
  to the model shipped in `model.js`.
- **`Export JSON`** downloads the full current model
  (`bread-calendar-model.json`): `version: 3`, `wave2_date`, and every task's id,
  label, category, anchor type/id, offset, `external_dependency`, and `default_*`.

## Files

| file | purpose |
|---|---|
| `index.html` | page shell + controls (single Wave 2 date input) |
| `model.js` | task graph model (31 tasks) + business-day math + derived `anchor_type` + stored `external_dependency` + add/remove helpers + resolution/cycle detection; shared by browser and tests |
| `app.js` | browser UI: calendar/table rendering, editing, add/remove, drag/drop, floating highlight popup, versioned localStorage, export, legend filter |
| `baseline-model.json` | copy of the authoritative v3 JSON; `verify.js` compares shipped defaults against it |
| `styles.css` | layout, category colors/tints, pattern cues, external-dependency cue, highlight/drag styling |
| `verify.js` | Node test of the pure model (graph resolution, cycles, warnings, defaults, export) |
| `verify-dom.js` | Node smoke test that runs the real `app.js` render/event path via a tiny DOM shim (incl. stale/fresh localStorage) |
| `qa-live-recalc-check.js` | QA scenario assertions for date + item-anchor recalculation |
| `qa-dom-live-recalc-check.js` | QA scenarios through the real `app.js` render/event path (drag/drop, highlight, filter, add/remove, stale storage) |
| `tools/gen-preview.js` | throwaway generator for `bread-calendar-v3-preview.png` (data-driven SVG render of the resolved graph) |
| `VERIFICATION.md` | manual QA handoff with exact inputs, observed results, commands, and status |

## Verify

```
node verify.js                   # model: graph resolution, item anchors, cycles, warnings, defaults, export
node verify-dom.js               # UI render path: editing, drag/drop, highlight, defaults, export, legend filter, stale/fresh localStorage
node qa-live-recalc-check.js     # QA scenarios: Wave 2 move + item-anchor recalculation
node qa-dom-live-recalc-check.js # QA scenarios through the real app.js event/render path
node --check model.js app.js verify.js verify-dom.js qa-live-recalc-check.js qa-dom-live-recalc-check.js
```

All exit `0` on success. See `VERIFICATION.md` for the latest inputs, observed
results, and status.

## Local implementation choices (not PMM rules)

1. **Stable ids under editable labels.** Renaming a task never breaks anchors.
2. **Drag/drop maps to offset, not to an absolute date**, so a dropped task still
   moves with its anchor afterward.
3. **Unresolved tasks are not placed on the calendar.** A cycle/invalid-anchor row
   is shown as `unresolved` and surfaced as a warning rather than guessing a date.
4. **Weekend anchors** keep an offset-0 date on the weekend (with a `WKND` marker).
5. **Month span is derived** from the resolved dates plus the Wave 2 anchor; empty
   leading/trailing week rows are trimmed dynamically.
6. All date math is **UTC-based** to avoid local-timezone off-by-one drift.
7. **Editable defaults live in versioned `localStorage`**; a schema bump (v2 → v3)
   plus proactive legacy-key cleanup guarantees stale pre-wave state can never
   shadow the shipped defaults.
8. **Removing a task re-anchors its dependents rather than orphaning them.**
9. **`external_dependency` is a stored semantic flag**, not derived from anchor
   type, because item anchors are a mix of external and internal work.

## Assumptions and unresolved caveats

- Business-day offsets are Monday–Friday only; no holiday calendar is modeled.
- Browser edits and chosen defaults persist only in the current browser's
  `localStorage`; there is no server-side or cross-device persistence.
- Direct browser-tool verification of `file://` / `localhost` is not available in
  this agent environment (the bundled Chromium cannot start — it is missing
  system libraries that cannot be installed without global changes). The artifact
  uses only relative local files and is verified by the Node suites; the
  `bread-calendar-v3-preview.png` preview is a data-driven SVG render of the
  resolved graph (via `tools/gen-preview.js` + ImageMagick), not a browser
  screenshot.
