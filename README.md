# Bread Reverse Launch Calendar

A self-contained, no-build local artifact that turns Pam's static Bread reverse
launch calendar into an interactive one. Move either of the **two editable date
anchors** (v0.16 testnet, Circle announcement), edit/add/remove any task, and drag
tasks around the calendar; all **33 tasks** recalculate from **business-day**
offsets across an anchor **graph**. (Two further anchors — Wave 2 start and v0.16
devnet — are fixed past baselines that stay in the model but have no top control.)

The shipped default model is the authoritative wave-based v3 JSON
(`bread-calendar-model-v3.json`, copied into the repo as `baseline-model.json`):
four date anchors and 33 tasks spanning the Wave 2 → Wave 5 rollout plus the
v0.16 dependency chain and the Circle/website/waitlist launch chain.

This model is a dependency graph:

- Every task has a **stable id** that is independent of its (editable) label.
- A task's anchor is either one of the four **date anchors** or an **item
  anchor** (another task's id). You pick the anchor directly from one grouped
  dropdown; the **anchor type** is then **deduced** from that choice, not entered
  by hand.
- Item-anchored tasks **recompute when their parent moves**, so a whole
  dependency chain shifts together.
- Cycles and invalid anchor ids are **detected and reported** instead of
  crashing.

## The four date anchors

v3 has **four** independent date anchors, each rooting its **own** subgraph.
Moving one anchor recomputes only its dependent tasks; the other three chains are
untouched. Only **two** of them are exposed as editable inputs in the "Date
anchors" control strip, in this order: **v0.16 testnet**, then **Circle
announcement**. The **Wave 2 start** and **v0.16 devnet** dates are fixed **past**
baselines that stay in the model/export (so the authoritative JSON round-trips),
still feed the anchor dropdown and calendar chips, but have **no** editable control
(their `control` flag is `false`). Their tasks are still movable via offset,
drag/drop, or re-anchoring.

| anchor id | label | default | control | roots |
|---|---|---|:---:|---|
| `wave2_date` | Wave 2 start | **2026-07-31** |  | Wave 2 company-wide testing → changes → stores, and Waves 3/4/5 (Wave 3 `+16bd` off Wave 2 start, Wave 4 `+8bd` off Wave 3, Wave 5 `+6bd` off Wave 4), plus their decisions, comms, and teaser prep (fixed past baseline, no control) |
| `v016_devnet_date` | v0.16 devnet | **2026-07-17** |  | `0) v0.16 on devnet` (standalone; fixed past baseline, no control) |
| `v016_testnet_date` | v0.16 testnet | **2026-08-17** | ✓ | `0) v0.16 on testnet` (`+0bd`) → Guardian upgrade (`-2bd`) → Client/wallet/Epoch (`+4bd`) |
| `circle_announcement_date` | Circle announcement | **2026-08-12** | ✓ | `7) PUBLIC: Circle announcement` → website go-live → waitlist QA (`website_out -1bd`) and the visual-identity board (`website_out -2bd`) |

Earlier revisions used a **single** `wave2_date` anchor that moved the entire
graph. That is no longer true: the devnet/testnet releases and the Circle
announcement are fixed calendar commitments in their own right, so each is its
own anchor and moves only what depends on it. Wave 2 has now itself passed, so its
date is a hidden baseline like the devnet date.

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

- **Two editable date-anchor inputs** (v0.16 testnet, then Circle announcement),
  grouped and labelled under a "Date anchors" block. Editing one recalculates its
  dependent subgraph instantly; the other chains stay put. The Wave 2 start and
  v0.16 devnet dates are fixed past baselines and are **not** shown as controls.
- **Calendar view** (month grids covering whatever span the recalculated tasks
  occupy) and **Table view**. Today's date is highlighted in blue. Leading/
  trailing empty week rows are trimmed dynamically. **Week trimming is computed
  from the full resolved task set**, so toggling a category filter never changes
  which weeks are shown — it only hides/shows pills inside the already-fixed
  weeks. Each date anchor's day cell carries a quiet **anchor chip**
  (`WAVE 2`, `DEVNET`, `TESTNET`, `CIRCLE`).
- **Fully editable task table.** Every row exposes:
  - **Label** (free text; the stable id underneath never changes).
  - **Category** (dropdown, all 8 categories, shown as `{n}) name`).
  - **Anchor** (one grouped dropdown). The four **date anchors** sit at the top
    under a "Date anchors" optgroup; every other task follows, grouped by category
    (optgroup labels `{n}) name`) and sorted by resolved date within each group.
    The current row is excluded. You never choose an "anchor type" first: picking
    a date anchor makes it a date anchor, picking a task makes it an item anchor.
  - **Offset** in business days (number field; supports negative offsets).
  - **Reset row** restores that row to its stored defaults.
  - **Remove** deletes that task from the model.

  **Anchor type is not editable** — it is **deduced** from the anchor
  (`deriveAnchorType`): anchoring to a date anchor makes a task a `date_anchor`;
  anchoring to another task makes it an `item_anchor`. **`external_dependency` is
  a stored flag** carried in the model JSON and in `default_external_dependency`;
  it is preserved across edits, resets, import, and export, and drives the table
  and export semantics (it is not edited by hand).
- **Add and remove tasks.** An **`Add task`** control appends a new task with a
  unique **stable id**, a `{n}) New task` label, and sane defaults (category
  **product**, anchor **Wave 2 start**, offset **0**, not external); it shows up
  immediately in the table, calendar, export, and `localStorage`. Each table row
  also has a **`Remove`** button. Removing a task that other tasks anchor to does
  **not** leave dangling anchors: each dependent is **re-anchored to the removed
  task's own anchor** (preserving its offset) when that anchor is still valid, or
  falls back to the **Wave 2 date with offset 0**. The reserved date anchors are
  not tasks and cannot be removed. **Restore shipped defaults** brings the full
  shipped model back.
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
  chain** up to its terminating date-anchor cell. Details appear in a **floating
  popup** (position: fixed, draggable by its header) showing the task's id,
  resolved date, anchor, offset, category, **external-dependency flag**, and the
  full chain (`A <- B <- ... <- <date anchor>`). Because the popup is out of
  document flow, selecting a task changes only highlight state, never the layout.
- **Restrained, consistent styling.** Category is conveyed by a **soft tint fill
  plus a consistent 3px left accent** in the category color and a quiet neutral
  card outline — no category gets a heavier stroke than another, and there are no
  decorative hatch/stripe/circle patterns. Strong outlines are reserved for
  interaction state (selected / anchor highlight / focus). The numeric `{n})`
  label prefix is the non-color cue. Weekends use a restrained tint; gridlines are
  quiet. External dependencies carry **no badge** — the flag lives in the model,
  export, and details popup.
- **Legend category filter.** The legend doubles as a filter for both views:
  click a category to show only it, click another to add it, click a selected one
  to remove it; with none selected, everything shows. Double-click resets to all.
  Selected categories are marked **active** (`aria-pressed="true"`). Keyboard
  accessible (Enter/Space, visible focus). Filtering never changes computed dates
  or warnings.
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
| `anchor_id` | a date-anchor id or another task's id (the editable choice) |
| `anchor_type` | **derived**: `date_anchor` if `anchor_id` is one of the four date anchors, else `item_anchor` |
| `offset_business_days` | signed business-day offset from the anchor |
| `external_dependency` | **stored** semantic flag (waiting on an outside party) |
| `default_*` | the reset/export baseline for each editable field |

`anchor_type` is always recomputed from `anchor_id` (via `deriveAnchorType`), so
an old persisted or imported model whose stored `anchor_type` disagrees with its
anchor is normalized on load. `external_dependency` is **preserved** as stored
(there is no `deriveExternalDependency`): item anchors are a mix of external
(v0.16 chain, store go-lives, Circle, website) and internal (product changes,
comms prep, waitlist QA) work, so the flag cannot be derived from anchor type.

Resolution indexes the **full graph by id first**, then walks item anchors to
their parents (memoized DFS), so an item anchor may reference a task defined
**later** in the array (a forward reference) and still resolve. There are **no
multi-dependencies** — each task has exactly one anchor.

## Default model: the shipped 33-row schedule

Default anchors: **Wave 2 start 2026-07-31**, **v0.16 devnet 2026-07-17**,
**v0.16 testnet 2026-08-17**, **Circle announcement 2026-08-12**, matching
`baseline-model.json`. Under these anchors the shipped model resolves to (sorted
by date; the last column marks a **stored** external dependency):

| task | category | anchor | offset (bd) | date | ext |
|---|---|---|---:|---|:---:|
| `0) v0.16 on devnet` | v0.16 dependency | date: v0.16 devnet | +0 | 2026-07-17 | ✓ |
| `1) PRODUCT: Wave 2 decision` | Product / go-no-go | item: `1) PRODUCT: Wave 2 company-wide testing` | -1 | 2026-07-30 |  |
| `5) SUPPORT: intake workflow ready` | Support | item: `1) PRODUCT: Wave 2 company-wide testing` | -1 | 2026-07-30 |  |
| `1) PRODUCT: Wave 2 company-wide testing` | Product / go-no-go | date: Wave 2 start | +0 | 2026-07-31 |  |
| `1) PRODUCT: Wave 2 changes applied` | Product / go-no-go | item: `1) PRODUCT: Wave 2 company-wide testing` | +3 | 2026-08-05 |  |
| `2) STORES: submit post-Wave-2 build` | Stores | item: `1) PRODUCT: Wave 2 changes applied` | +0 | 2026-08-05 |  |
| `2) STORES: post-Wave-2 build live` | Stores | item: `2) STORES: submit post-Wave-2 build` | +1 | 2026-08-06 | ✓ |
| `3) VISUAL IDENTITY: board ready` | Video / design | item: `4) WEBSITE: new website + Bread waitlist live` | -2 | 2026-08-10 |  |
| `4) WAITLIST: form + CRM flow ready` | Website / waitlist | item: `4) WEBSITE: new website + Bread waitlist live` | -1 | 2026-08-11 |  |
| `7) PUBLIC: Circle announcement` | Public moment | date: Circle announcement | +0 | 2026-08-12 | ✓ |
| `4) WEBSITE: new website + Bread waitlist live` | Website / waitlist | item: `7) PUBLIC: Circle announcement` | +0 | 2026-08-12 | ✓ |
| `0) Guardian upgrade done` | v0.16 dependency | item: `0) v0.16 on testnet` | -2 | 2026-08-13 | ✓ |
| `0) v0.16 on testnet` | v0.16 dependency | date: v0.16 testnet | +0 | 2026-08-17 | ✓ |
| `0) Client/wallet/Epoch upgrade done` | v0.16 dependency | item: `0) Guardian upgrade done` | +4 | 2026-08-19 | ✓ |
| `6) COMMS: Wave 3 tester pack ready` | Comms | item: `1) PRODUCT: Wave 3 trusted-network testing` | -2 | 2026-08-20 |  |
| `1) PRODUCT: Wave 3 decision` | Product / go-no-go | item: `1) PRODUCT: Wave 3 trusted-network testing` | -1 | 2026-08-21 |  |
| `1) PRODUCT: Wave 3 trusted-network testing` | Product / go-no-go | item: `1) PRODUCT: Wave 2 company-wide testing` | +16 | 2026-08-24 |  |
| `1) PRODUCT: Wave 3 changes applied` | Product / go-no-go | item: `1) PRODUCT: Wave 3 trusted-network testing` | +3 | 2026-08-27 |  |
| `2) STORES: submit post-Wave-3 build` | Stores | item: `1) PRODUCT: Wave 3 changes applied` | +0 | 2026-08-27 |  |
| `2) STORES: post-Wave-3 build live` | Stores | item: `2) STORES: submit post-Wave-3 build` | +1 | 2026-08-28 | ✓ |
| `3) VIDEO: teaser final` | Video / design | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | -2 | 2026-09-01 |  |
| `6) COMMS: Wave 4 channels + waitlist CTA ready` | Comms | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | -2 | 2026-09-01 |  |
| `1) PRODUCT: Wave 4 decision` | Product / go-no-go | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | -1 | 2026-09-02 |  |
| `7) PUBLIC: Wave 4 teaser + waitlist push` | Public moment | item: `1) PRODUCT: Wave 3 trusted-network testing` | +8 | 2026-09-03 |  |
| `1) PRODUCT: Wave 4 changes applied` | Product / go-no-go | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | +3 | 2026-09-08 |  |
| `2) STORES: submit post-Wave-4 build` | Stores | item: `1) PRODUCT: Wave 4 changes applied` | +0 | 2026-09-08 |  |
| `2) STORES: post-Wave-4 build live` | Stores | item: `2) STORES: submit post-Wave-4 build` | +1 | 2026-09-09 | ✓ |
| `6) COMMS: Wave 5 X push + How Bread Works ready` | Comms | item: `7) PUBLIC: Wave 5 X waitlist follow-up` | -1 | 2026-09-10 |  |
| `1) PRODUCT: Wave 5 decision` | Product / go-no-go | item: `7) PUBLIC: Wave 5 X waitlist follow-up` | -1 | 2026-09-10 |  |
| `7) PUBLIC: Wave 5 X waitlist follow-up` | Public moment | item: `7) PUBLIC: Wave 4 teaser + waitlist push` | +6 | 2026-09-11 |  |
| `1) PRODUCT: Wave 5 changes applied` | Product / go-no-go | item: `7) PUBLIC: Wave 5 X waitlist follow-up` | +3 | 2026-09-16 |  |
| `2) STORES: submit post-Wave-5 build` | Stores | item: `1) PRODUCT: Wave 5 changes applied` | +0 | 2026-09-16 |  |
| `2) STORES: post-Wave-5 build live` | Stores | item: `2) STORES: submit post-Wave-5 build` | +1 | 2026-09-17 | ✓ |

The earliest content is `0) v0.16 on devnet` (2026-07-17, a Friday), so with the
default anchors the July grid's first visible week row is **Jul 12-18** (the empty
weeks before are trimmed). The latest is `2) STORES: post-Wave-5 build live`
(2026-09-17), so the calendar spans July → September 2026.

### Relationship to `baseline-model.json`

The shipped default **is** the authoritative v3 JSON (33 tasks, four date
anchors, copied into the repo as `baseline-model.json`). `verify.js` (Test 0)
asserts every baseline row matches the shipped row **exactly** — label, category,
`anchor_type`, `anchor_id`, offset, `external_dependency`, and all `default_*`
fields — that the top-level is `version: 3` with the four `*_date` anchor fields,
and that there are **no** `teaser_date` / `launch_date` fields.

## Narrative made visible

The requested storyline is reflected in the resolved graph and asserted by the
tests:

- **Support is ready before Wave 2 and active throughout** —
  `5) SUPPORT: intake workflow ready` (2026-07-30) lands before Wave 2 start
  (2026-07-31).
- **v0.16 chain** — Devnet (its own anchor) and Testnet (its own anchor, resolved
  at `+0bd` off the testnet date, i.e. the testnet date itself, 2026-08-17) →
  Guardian (`-2bd` off testnet) → Client/wallet/Epoch (`+4bd` off Guardian).
- **Waves cascade** — Wave 2 is the `wave2_date` anchor; Wave 3 is
  `wave2_start +16bd`, Wave 4 is `wave3_start +8bd`, Wave 5 is `wave4_start +6bd`.
  Each wave has a **decision** (`-1bd` off the wave start), **changes applied**
  (`+3bd`), a **store submit** (same day as changes), and a **store go-live**
  (`+1bd` off submit).
- **Circle / website / waitlist / visual identity** — Circle announcement is a
  fixed date anchor; the website go-live anchors Circle (`+0bd`), the waitlist QA
  is `website_out -1bd`, and the visual-identity board is `website_out -2bd`.

## External dependencies

Ten tasks ship with `external_dependency: true` — the things gated on an outside
party: `v016_devnet`, `v016_testnet`, `guardian_upgrade_done`,
`client_wallet_done`, `circle_announcement`, `website_out`, and each wave's store
go-live (`wave2_stores_live` … `wave5_stores_live`). The flag is **stored** and
**preserved** through edit/reset/import/export; it is surfaced as an "External
dependency: yes" line in the details popup (there is **no** EXT badge or special
border in the streamlined UI).

## Editable defaults, export, and browser persistence

The artifact is a **static local page**: it cannot write back to its own source
files. So editable state lives in the browser:

- **`localStorage` holds your working model** under the key
  `bread-calendar-model-v3r4` (a payload
  `{ schema: 3, revision: 4, anchors, tasks }`). Every edit, add/remove, the
  editable anchor dates (all four are persisted; only two are editable), and any
  user-chosen defaults are saved and restored on the next load. **Stale state cannot mask the new defaults:** the v3 schema is
  unchanged but the shipped defaults changed, so a new **storage key** plus a
  bumped **model revision** is used. Any prior-release state under the old
  `bread-calendar-model-v3r3` / `-v3r2` / `-v3` / `-v2` / `bread-calendar-model` keys is
  proactively removed on load, and a payload under the current key whose `schema`
  isn't `3` or `revision` isn't `4` is ignored. Accepted models are normalized on
  load (derived `anchor_type` recomputed; old `n text` labels migrated to `n) text`).
- **`Set current as defaults`** promotes the current values into each task's
  `default_*` fields. Afterwards, **Reset** and export use those values.
- **`Reset to defaults`** restores every row to its currently chosen defaults and
  the default anchor dates, and clears the legend filter and highlight.
- **`Restore shipped defaults`** discards edits **and** chosen defaults, returning
  to the model shipped in `model.js`.
- **`Export JSON`** downloads the full current model
  (`bread-calendar-model.json`): `version: 3`, the four date anchors
  (`wave2_date`, `v016_devnet_date`, `v016_testnet_date`,
  `circle_announcement_date`), and every task's id, label, category, anchor
  type/id, offset, `external_dependency`, and `default_*`.

## Files

| file | purpose |
|---|---|
| `index.html` | page shell + controls (two grouped date-anchor inputs — v0.16 testnet, then Circle; Wave 2 start + v0.16 devnet dates are fixed baselines with no control) |
| `model.js` | task graph model (33 tasks, four date anchors) + business-day math + derived `anchor_type` + stored `external_dependency` + add/remove helpers + resolution/cycle detection; shared by browser and tests |
| `app.js` | browser UI: calendar/table rendering, editing, add/remove, drag/drop, floating highlight popup, versioned+revisioned localStorage, export, legend filter |
| `baseline-model.json` | copy of the authoritative v3 JSON; `verify.js` compares shipped defaults against it |
| `styles.css` | layout, category colors/tints, soft-tint + left-accent card treatment, quiet gridlines, anchor chips, highlight/drag/focus styling |
| `verify.js` | Node test of the pure model (graph resolution, four-anchor subgraph movement, cycles, warnings, defaults, export) |
| `verify-dom.js` | Node smoke test that runs the real `app.js` render/event path via a tiny DOM shim (incl. stale/fresh localStorage + revision migration) |
| `qa-live-recalc-check.js` | QA scenario assertions for date + item-anchor recalculation and per-anchor subgraph independence |
| `qa-dom-live-recalc-check.js` | QA scenarios through the real `app.js` render/event path (drag/drop, highlight, filter, add/remove, stale storage) |
| `tools/gen-preview.js` | throwaway generator for `bread-calendar-v3-preview.png` (data-driven SVG render of the resolved graph) |
| `VERIFICATION.md` | manual QA handoff with exact inputs, observed results, commands, and status |

## Verify

```
node verify.js                   # model: graph resolution, four-anchor subgraphs, item anchors, cycles, warnings, defaults, export
node verify-dom.js               # UI render path: editing, drag/drop, highlight, defaults, export, legend filter, stale/fresh localStorage
node qa-live-recalc-check.js     # QA scenarios: per-anchor moves + item-anchor recalculation
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
5. **Month span is derived** from the resolved dates plus the four date anchors;
   empty leading/trailing week rows are trimmed dynamically.
6. All date math is **UTC-based** to avoid local-timezone off-by-one drift.
7. **Editable defaults live in versioned + revisioned `localStorage`**; a new
   storage key plus an explicit model revision and proactive legacy-key cleanup
   guarantee stale prior-release state can never shadow the shipped defaults.
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
