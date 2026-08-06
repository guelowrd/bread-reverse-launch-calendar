# Bread reverse launch calendar - local UI structure plan

> **Status: superseded planning doc (kept for design history).** This file was
> the early UI/layout sketch and predates the shipped anchor-**graph** model. The
> shipped artifact ships a **33-task business-day dependency graph** rooted at
> **four editable date anchors** — Wave 2 start (2026-07-31), v0.16 devnet
> (2026-07-17), v0.16 testnet (2026-08-17), Circle announcement (2026-08-12) — not
> the older teaser/launch "every task hangs off teaser or launch" list once
> drafted here. It hides the derived `anchor_type` and the stored
> `external_dependency` fields (no `Ext. dep` / `Anchor type` UI), and the
> streamlined dashboard uses a soft tint + 3px left accent per category with **no**
> `EXT`/`DEP` badge and **no** decorative patterns. Where this document disagrees
> with the shipped app, the shipped app wins. For the authoritative task list,
> anchor/offset model, and behavior, see **`README.md`** (esp. "Default model: the
> shipped 33-row schedule", "The four date anchors", and "Anchor model") and the QA
> record in **`VERIFICATION.md`**. The layout/legend/responsive guidance below is
> still broadly accurate in spirit, except the early date defaults, the single/two
> date inputs, the editable Ext. dep / Anchor type fields, and the pattern/badge
> cues it sketches, which the shipped app changed (see README).

Source visual inspected: `/workspace/team/pam/bread-reverse-calendar-aug6-2026.png`.

Goal: define a feasible self-contained static HTML/CSS/JS interface for moving the Bread teaser date and launch date while keeping the reverse-calendar structure readable locally in a browser.

## 1. Overall layout

Use one page with four clear regions:

```text
<body>
  <main class="app-shell">
    <header class="app-header">
      <h1>Bread Reverse Launch Calendar</h1>
      <div class="anchor-controls">...</div>
      <div class="status-strip">...</div>
    </header>

    <section class="legend-panel" aria-label="Category legend">...</section>

    <section class="calendar-panel" aria-label="Calendar timeline">
      <div class="month-stack">...</div>
    </section>

    <section class="task-panel" aria-label="Task details">...</section>
  </main>
</body>
```

Keep the visual priority on the calendar. Controls and legend should be compact, sticky or near the top, and not visually louder than the task grid.

## 2. Header and required controls

### Title

Use exactly:

```text
Bread Reverse Launch Calendar
```

Avoid explanatory copy that repeats obvious behavior. Keep the header clean.

### Required date controls

```text
<header class="app-header">
  <h1>Bread Reverse Launch Calendar</h1>

  <form class="anchor-controls">
    <label>
      Teaser date
      <input id="teaserDate" type="date" value="2026-08-06">
    </label>

    <label>
      Launch date
      <input id="launchDate" type="date" value="2026-08-13">
    </label>

    <button type="button" id="resetDates">Reset dates</button>
  </form>

  <div class="status-strip" aria-live="polite">
    <!-- short validation/warning chips only when needed -->
  </div>
</header>
```

Required behavior:

- Teaser input updates all teaser-anchored tasks.
- Launch input updates all launch-anchored tasks.
- Default teaser date: 2026-08-06.
- Default launch date: 2026-08-13.
- Reset dates restores both defaults.
- Validate `launchDate >= teaserDate` and show a small warning chip if not.
- If a calculated task lands on a weekend, keep it on that weekend date and show a small `weekend` badge on the task pill. Do not silently move it.

Optional but useful:

- Show a compact gap chip such as `Gap: 3 days` or `Gap: 3 business days`, depending on the final offset model.
- Do not include a lock-gap or pin feature unless Gaylord explicitly asks for it.

## 3. Calendar display approach

### Calendar grid

Use a stacked month view, matching the reference image:

```text
<section class="calendar-panel">
  <article class="month" data-month="2026-07">
    <h2>July 2026</h2>
    <div class="weekday-row">
      <div>Sunday</div> ... <div>Saturday</div>
    </div>
    <div class="calendar-grid">
      <button/article class="day-cell weekend other-month">...</button/article>
      ...
    </div>
  </article>

  <article class="month" data-month="2026-08">...</article>
</section>
```

Render the month span dynamically:

- Include every month from the earliest recalculated task date through the latest recalculated task date.
- Use Sunday-start weeks to match the visual reference.
- Always show full weeks around each month.
- Pale yellow weekend columns.
- Gray previous/next-month day numbers.
- Large bold date numerals inside each cell.

### Day cell structure

```text
<div class="day-cell is-weekend is-other-month">
  <div class="date-row">
    <span class="date-number anchor-teaser">3</span>
  </div>

  <div class="task-stack">
    <button class="task-pill category-public" data-task-id="public-teaser-if-go">
      <span class="task-label">PUBLIC: teaser if GO</span>
      <span class="task-badges">...</span>
    </button>
  </div>
</div>
```

Task pill rules:

- Preserve visible task labels from the source/spec where practical.
- Use text labels as the primary cue. Color and pattern are secondary.
- Keep task pills short enough to fit in a cell. Wrap to two lines max, then truncate with ellipsis if needed.
- Sort tasks inside a day by category number/prefix first, then by source order.
- If more tasks than fit cleanly, show the first 3 and a `+N more` row that opens/highlights the task detail list. For the current source, 3 tasks per day usually fits.

### Anchor date circles

The reference circles both anchor dates in August:

- Teaser anchor: 2026-08-06.
- Launch anchor: 2026-08-13.

Implement as a circle around the date number, not the full day cell:

```css
.date-number.is-anchor::before { border-radius: 999px; }
.date-number.is-teaser-anchor { outline: black + orange ring; }
.date-number.is-launch-anchor { outline: black + orange ring; }
```

Add small accessible labels via `aria-label`, not visible explanatory text.

## 4. Task detail panel

Provide a compact table/list below the calendar for local use and debugging. This makes the artifact useful when dates shift and the calendar gets dense.

Recommended structure:

```text
<section class="task-panel">
  <div class="task-panel-header">
    <h2>Tasks</h2>
    <div class="task-filters">
      <select id="categoryFilter">All categories</select>
      <select id="anchorFilter">All anchors</select>
    </div>
  </div>

  <table class="task-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Task</th>
        <th>Category</th>
        <th>Anchor</th>
        <th>Offset</th>
        <th>Flags</th>
      </tr>
    </thead>
    <tbody>...</tbody>
  </table>
</section>
```

Keep this secondary. The calendar is the main artifact.

If a manual-edit mode is needed, make these fields editable per row:

- Anchor: `teaser` or `launch`.
- Offset: signed integer.
- Flags: short 3-letter symbol or empty.
- Reset row: restores that row's default anchor, offset, and flags.

If manual edit mode is not needed in the first pass, keep the table read-only and document the task model in JS.

## 5. Category and color treatment

Use the source palette because it is already colorblind-aware-ish and backed by labels/patterns.

| Category | Visible prefixes | Border | Tint | Pattern cue | Notes |
|---|---|---:|---:|---|---|
| v0.16 dependency | `0 v0.16`, `0 Guardian`, `0 Client/wallet` | `#4d4d4d` | `#e5e7eb` | solid/no pattern | Add dependency badge for external items. |
| Product / go-no-go | `1 PRODUCT`, `1 GO/NO-GO`, `1 LAUNCH` | `#d55e00` | `#f6d7c3` | crossed diagonal X | Includes product gates and launch announcement unless renamed to public. |
| Stores | `2 STORES` | `#0072b2` | `#cfe8f6` | vertical stripes | External store-review dependencies should be badged. |
| Video | `3 VIDEO`, `3 LAUNCH VIDEO` | `#cc79a7` | `#f0d4e4` | horizontal stripes | Keep teaser video and launch video distinct by label text. |
| Website / waitlist | `4 LANDING`, `4 WAITLIST`, `4 WEBSITE` | `#000000` | `#f1f5f9` | diagonal slashes | Black outline matches reference. Category 4 display name is `Website / waitlist` (key stays `landing`). |
| Support | `5 SUPPORT` | `#009e73` | `#ccebdd` | solid/no pattern | Support prep/polish. |
| Comms | `COMMS` | `#e69f00` | `#f8e1a5` | solid/no pattern | Article/social/link pack/final copy. |
| Public moment | `PUBLIC` | `#f0e442` | `#fff7a8` | circled anchor/date cue | Teaser public moment. |

Legend requirements:

- Show both color and pattern cues in legend swatches.
- Do not rely on color alone.
- Keep legend in one or two rows above the calendar on desktop.
- On mobile, allow horizontal scroll or wrap into compact chips.

## 6. Specific visible tasks from the reference/spec

> Refreshed to the shipped **29-task graph model**. Each task has a stable id
> and either a **date anchor** (`teaser_date` / `launch_date`) or an **item
> anchor** (another task's id), with a signed **business-day** offset. This
> replaces the earlier flat list once sketched here. The full, authoritative
> task list — labels (`{n}) text`), anchors, business-day offsets, and resolved
> default dates at teaser 2026-08-06 / launch 2026-08-13 — lives in `README.md`
> ("Default model: the shipped 33-row schedule"). Do not maintain a second copy
> here; that table is the single source of truth. (The dates/counts in this
> historical section are two generations stale — see README for the current
> four-anchor, 33-task model.)

The shipped 29-task set **is** the attached `bread-calendar-model.json` baseline
(27 tasks, kept as `baseline-model.json`) plus the two tasks added in this
revision. The baseline JSON already ships with `{n}) text` index separators and
with `external_dependency` consistent with the anchor rule, so there are no
separator/dependency deltas — the only difference is the two added tasks
(`1) PRODUCT: company testing (try 2)`, item-anchored to
`1) PRODUCT: company testing (try 1)` +5 bd; and `4) WEBSITE - new version out`,
teaser -6 bd). Category 4's display name is `Website / waitlist` (key stays
`landing`). See `README.md` for the authoritative table.

## 7. Responsive and local-browser considerations

### Desktop

- Max width can be wide, around 1400-1600px, centered.
- Calendar cells should remain tall enough for 2-3 task pills.
- Use CSS Grid for weekday/month layout.
- Keep controls and legend above the calendar.

### Tablet

- Keep the 7-column calendar, but reduce cell height and font sizes.
- Allow horizontal overflow if necessary rather than destroying the calendar structure.
- The task table can become horizontally scrollable.

### Mobile

Primary mobile option:

- Keep a horizontally scrollable 7-column calendar inside `.calendar-scroll`.
- Preserve day-of-week columns and weekend tint.
- Make the table/list below the calendar the easier mobile reading mode.

Alternative mobile option if scroll is too awkward:

- Switch to an agenda list grouped by week/date under 640px.
- Keep the calendar available behind a `Calendar` tab or top toggle.

### Local/static constraints

- No build step required.
- No network dependencies.
- Files should be `index.html`, `styles.css`, `model.js`, `app.js`, and optional `verify.js`/`verify-dom.js`.
- Use plain JS `Date` handling carefully. Prefer storing dates as ISO strings and converting via UTC/noon helpers to avoid timezone off-by-one issues.
- Persist user edits in memory only for first pass, or `localStorage` only if explicitly useful. Include a visible reset path if using localStorage.

## 8. Assumptions and implementation decisions

- The visual reference is a planning calendar, not a pixel-perfect app mock. Preserve structure, categories, colors, patterns, anchor circles, and labels, but do not try to reproduce the 2400px PNG exactly.
- The shipped model has **29 tasks** resolved through a business-day anchor
  **graph** (date anchors plus item anchors), not the earlier flat list.
- Teaser and launch are independent anchors unless Gaylord explicitly asks for linked movement.
- External dependencies still recalculate by default. (Shipped change: the
  `external_dependency` flag is now **derived from the anchor** and is not shown
  as a badge or column — see `README.md`. This early sketch's "flag them
  visually" idea was dropped.)
- Current source spec uses calendar-day offsets. If Gaylord's later revision is the active requirement, use business-day offsets in the same UI structure and relabel the offset column/chip accordingly.
- Do not add lock-gap or pin controls by default.
- Avoid long explanatory UI copy. Put implementation notes in README, not in the visible app.

## 9. Acceptance checklist for Devina

- `index.html` opens locally with no server and no network calls.
- Teaser date input updates teaser-anchored task dates live.
- Launch date input updates launch-anchored task dates live.
- Default dates reproduce the source calendar dates.
- Legend swatches include the same pattern cues used in task pills.
- Anchor dates are circled on the date number.
- Weekend columns are pale yellow.
- Weekend recalculations are displayed on weekends with a warning badge, not auto-shifted.
- The task detail view exposes date, task, category, anchor, and offset. (Shipped
  change: `external_dependency` / `anchor_type` are derived and hidden — no
  Ext. dep / Anchor type column and no `DEP` badge; see `README.md`.)
- README documents the offset model, assumptions, and verification commands.
