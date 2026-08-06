/*
 * Bread reverse launch calendar: shared task/date model (wave-based v3).
 *
 * Source of truth: the authoritative v3 model JSON
 * (bread-calendar-model-v3.json, copied into the repo as baseline-model.json).
 * The schedule is a graph of anchored tasks:
 *
 *   - Every task has a STABLE id (independent of its editable label).
 *   - A task's anchor is either one of the editable DATE anchors or an ITEM
 *     anchor (another task's id). Item-anchored tasks recompute when their parent
 *     moves, so a whole dependency chain shifts together.
 *   - Offsets are BUSINESS DAYS (Monday-Friday); weekends are skipped.
 *   - There are FOUR date anchors, each rooting its OWN independent subgraph:
 *       * wave2_date               Wave 2 start -> Waves 2/3/4/5 chains, decisions,
 *                                  comms, stores, teaser (the bulk of the plan)
 *       * v016_devnet_date         v0.16 on devnet (standalone)
 *       * v016_testnet_date        v0.16 on testnet -> guardian -> client/wallet
 *       * circle_announcement_date Circle announcement -> website -> waitlist QA,
 *                                  visual-identity board
 *     Moving ONE date anchor recomputes only its dependent subgraph; the other
 *     three chains are unaffected. There is no single master anchor any more.
 *     Two of these anchors (Wave 2 start and v0.16 devnet) are now fixed PAST
 *     baselines with no editable top control; only v0.16 testnet and Circle
 *     announcement stay editable in the top strip (see DATE_ANCHORS `control`).
 *
 * This file is environment-agnostic: it runs unchanged in the browser (attaches
 * to window.BreadModel) and in Node (module.exports), so the UI and the Node
 * verifiers exercise the exact same resolution logic.
 */
(function (root) {
  "use strict";

  // ---- Editable date anchors -------------------------------------------------
  //
  // Each entry: stable id (also the top-level field name in the exported JSON),
  // a human label (used in the anchor dropdown / details), a SHORT chip label
  // shown on the calendar day cell, the shipped default date, and an optional
  // `control` flag. `control: false` keeps the anchor in the model/export and as a
  // valid task anchor, but hides its editable date input from the top control
  // strip -- used for anchors whose date is now a fixed PAST baseline: the v0.16
  // devnet date and the Wave 2 start date (Wave 2 is in the past). Their tasks are
  // still movable via offset / drag / re-anchor, and both anchors still resolve,
  // export, feed the anchor dropdown, show a calendar chip, and round-trip. Only
  // TWO anchors keep an editable top input: v0.16 testnet then Circle announcement.
  // The order here is the order used in the export and in the control strip.
  var DATE_ANCHORS = [
    { id: "wave2_date",               label: "Wave 2 start",        chip: "WAVE 2",  default: "2026-07-31", control: false },    // Friday (past; no control)
    { id: "v016_devnet_date",         label: "v0.16 devnet",        chip: "DEVNET",  default: "2026-07-17", control: false },    // Friday (past; no control)
    { id: "v016_testnet_date",        label: "v0.16 testnet",       chip: "TESTNET", default: "2026-08-17" },                    // Monday
    { id: "circle_announcement_date", label: "Circle announcement", chip: "CIRCLE",  default: "2026-08-12" }                     // Wednesday
  ];
  var DATE_ANCHOR_BY_ID = {};
  DATE_ANCHORS.forEach(function (a) { DATE_ANCHOR_BY_ID[a.id] = a; });
  var DATE_ANCHOR_IDS = DATE_ANCHORS.map(function (a) { return a.id; });
  // The subset of date anchors that get an editable input in the top control
  // strip (all except those marked `control: false`). Currently exactly two --
  // v0.16 testnet then Circle announcement -- because the Wave 2 start and v0.16
  // devnet dates are fixed past baselines. The model still resolves, exports, and
  // round-trips ALL four anchors regardless of this list.
  var CONTROL_ANCHOR_IDS = DATE_ANCHORS.filter(function (a) { return a.control !== false; }).map(function (a) { return a.id; });

  // Canonical fallback date anchor: brand-new tasks and orphaned dependents anchor
  // here when nothing more specific applies.
  var WAVE2_ANCHOR = "wave2_date";

  // Shipped default anchor dates, as a plain map keyed by anchor id.
  var DEFAULT_ANCHORS = {};
  DATE_ANCHORS.forEach(function (a) { DEFAULT_ANCHORS[a.id] = a.default; });

  // Category metadata. `num` is the stable numeric prefix shown (as "{num}) name")
  // in the legend and baked into every label as "{num}) ...". `color` is the
  // category accent; `tint` is the soft card fill. (Decorative hatch/stripe/circle
  // patterns were removed in the dashboard cleanup: category is conveyed by the
  // soft tint plus a consistent 3px left accent, and the numeric label prefix is
  // the non-color cue.)
  var CATEGORIES = {
    v016:    { num: 0, name: "v0.16 dependency",   color: "#4d4d4d", tint: "#eef0f2" },
    product: { num: 1, name: "Product / go-no-go", color: "#d55e00", tint: "#f7e3d5" },
    stores:  { num: 2, name: "Stores",             color: "#0072b2", tint: "#d9ebf7" },
    video:   { num: 3, name: "Video / design",     color: "#cc79a7", tint: "#f3ddea" },
    landing: { num: 4, name: "Website / waitlist", color: "#555555", tint: "#eceef0" },
    support: { num: 5, name: "Support",            color: "#009e73", tint: "#d5efe6" },
    comms:   { num: 6, name: "Comms",              color: "#b5850b", tint: "#f6e8c6" },
    public:  { num: 7, name: "Public moment",      color: "#8a7d00", tint: "#f4efb8" }
  };

  var CATEGORY_ORDER = ["v016", "product", "stores", "video", "landing", "support", "comms", "public"];

  // ---- Derived-field helper --------------------------------------------------
  //
  // `anchor_type` is deduced from `anchor_id`: selecting one of the editable date
  // anchors makes a task a date-anchor; anchoring to any other task makes it an
  // item-anchor. This helper is the single source of truth for that deduction.
  //
  // `external_dependency`, by contrast, is a STORED semantic flag (some item
  // anchors are external dependencies -- v0.16, store approvals, Circle, website
  // going live -- and some are not). It ships from the model JSON, is carried in
  // `default_external_dependency` for reset, and is preserved (never re-derived)
  // through clone / reset / import / export.
  function isDateAnchorId(anchorId) {
    return Object.prototype.hasOwnProperty.call(DATE_ANCHOR_BY_ID, anchorId);
  }
  function deriveAnchorType(anchorId) {
    return isDateAnchorId(anchorId) ? "date_anchor" : "item_anchor";
  }

  // ---- Shipped task list -----------------------------------------------------
  //
  // Each row: stable id, editable label, category, anchor_id (a date-anchor id or
  // another task id), signed business-day offset, and the stored
  // external_dependency flag. `anchor_type` is DERIVED from anchor_id (see helper
  // above). This mirrors baseline-model.json exactly. Item anchors may point at a
  // task defined LATER in this array (a forward reference); resolution indexes the
  // full graph by id before resolving, so authoring order does not matter. Display
  // sorts by resolved date.
  var SHIPPED_SPEC = [
    { id: "v016_devnet",            label: "0) v0.16 on devnet",                              category: "v016",    anchor_id: "v016_devnet_date",         offset:  0, external: true  },
    { id: "wave2_decision",         label: "1) PRODUCT: Wave 2 decision",                     category: "product", anchor_id: "wave2_start",              offset: -1, external: false },
    { id: "support_ready",          label: "5) SUPPORT: intake workflow ready",               category: "support", anchor_id: "wave2_start",              offset: -1, external: false },
    { id: "wave2_start",            label: "1) PRODUCT: Wave 2 company-wide testing",          category: "product", anchor_id: "wave2_date",               offset:  0, external: false },
    { id: "wave2_feedback_changes", label: "1) PRODUCT: Wave 2 changes applied",              category: "product", anchor_id: "wave2_start",              offset:  3, external: false },
    { id: "wave2_stores_submit",    label: "2) STORES: submit post-Wave-2 build",             category: "stores",  anchor_id: "wave2_feedback_changes",   offset:  0, external: false },
    { id: "wave2_stores_live",      label: "2) STORES: post-Wave-2 build live",               category: "stores",  anchor_id: "wave2_stores_submit",      offset:  1, external: true  },
    { id: "guardian_upgrade_done",  label: "0) Guardian upgrade done",                        category: "v016",    anchor_id: "v016_testnet",             offset: -2, external: true  },
    { id: "v016_testnet",           label: "0) v0.16 on testnet",                             category: "v016",    anchor_id: "v016_testnet_date",        offset:  0, external: true  },
    { id: "client_wallet_done",     label: "0) Client/wallet/Epoch upgrade done",             category: "v016",    anchor_id: "guardian_upgrade_done",    offset:  4, external: true  },
    { id: "wave3_decision",         label: "1) PRODUCT: Wave 3 decision",                     category: "product", anchor_id: "wave3_start",              offset: -1, external: false },
    { id: "wave3_recruiting_ready", label: "6) COMMS: Wave 3 tester pack ready",              category: "comms",   anchor_id: "wave3_start",              offset: -2, external: false },
    { id: "wave3_start",            label: "1) PRODUCT: Wave 3 trusted-network testing",      category: "product", anchor_id: "wave2_start",              offset: 16, external: false },
    { id: "wave3_feedback_changes", label: "1) PRODUCT: Wave 3 changes applied",              category: "product", anchor_id: "wave3_start",              offset:  3, external: false },
    { id: "wave3_stores_submit",    label: "2) STORES: submit post-Wave-3 build",             category: "stores",  anchor_id: "wave3_feedback_changes",   offset:  0, external: false },
    { id: "wave3_stores_live",      label: "2) STORES: post-Wave-3 build live",               category: "stores",  anchor_id: "wave3_stores_submit",      offset:  1, external: true  },
    { id: "circle_announcement",    label: "7) PUBLIC: Circle announcement",                  category: "public",  anchor_id: "circle_announcement_date", offset:  0, external: true  },
    { id: "waitlist_qa",            label: "4) WAITLIST: form + CRM flow ready",              category: "landing", anchor_id: "website_out",              offset: -1, external: false },
    { id: "website_out",            label: "4) WEBSITE: new website + Bread waitlist live",    category: "landing", anchor_id: "circle_announcement",      offset:  0, external: true  },
    { id: "visual_identity_board",  label: "3) VISUAL IDENTITY: board ready",                 category: "video",   anchor_id: "website_out",              offset: -2, external: false },
    { id: "teaser_final",           label: "3) VIDEO: teaser final",                          category: "video",   anchor_id: "wave4_start",              offset: -2, external: false },
    { id: "wave4_comms_ready",      label: "6) COMMS: Wave 4 channels + waitlist CTA ready",   category: "comms",   anchor_id: "wave4_start",              offset: -2, external: false },
    { id: "wave4_decision",         label: "1) PRODUCT: Wave 4 decision",                     category: "product", anchor_id: "wave4_start",              offset: -1, external: false },
    { id: "wave4_start",            label: "7) PUBLIC: Wave 4 teaser + waitlist push",        category: "public",  anchor_id: "wave3_start",              offset:  8, external: false },
    { id: "wave4_feedback_changes", label: "1) PRODUCT: Wave 4 changes applied",              category: "product", anchor_id: "wave4_start",              offset:  3, external: false },
    { id: "wave4_stores_submit",    label: "2) STORES: submit post-Wave-4 build",             category: "stores",  anchor_id: "wave4_feedback_changes",   offset:  0, external: false },
    { id: "wave4_stores_live",      label: "2) STORES: post-Wave-4 build live",               category: "stores",  anchor_id: "wave4_stores_submit",      offset:  1, external: true  },
    { id: "wave5_comms_ready",      label: "6) COMMS: Wave 5 X push + How Bread Works ready",  category: "comms",   anchor_id: "wave5_start",              offset: -1, external: false },
    { id: "wave5_decision",         label: "1) PRODUCT: Wave 5 decision",                     category: "product", anchor_id: "wave5_start",              offset: -1, external: false },
    { id: "wave5_start",            label: "7) PUBLIC: Wave 5 X waitlist follow-up",          category: "public",  anchor_id: "wave4_start",              offset:  6, external: false },
    { id: "wave5_feedback_changes", label: "1) PRODUCT: Wave 5 changes applied",              category: "product", anchor_id: "wave5_start",              offset:  3, external: false },
    { id: "wave5_stores_submit",    label: "2) STORES: submit post-Wave-5 build",             category: "stores",  anchor_id: "wave5_feedback_changes",   offset:  0, external: false },
    { id: "wave5_stores_live",      label: "2) STORES: post-Wave-5 build live",               category: "stores",  anchor_id: "wave5_stores_submit",      offset:  1, external: true  }
  ];

  // Expand a spec row into a full task object whose default_* fields mirror the
  // shipped values (used for "restore shipped defaults"). anchor_type is derived
  // from anchor_id; external_dependency is stored.
  function specToTask(s) {
    return {
      id: s.id,
      label: s.label,
      category: s.category,
      anchor_type: deriveAnchorType(s.anchor_id),
      anchor_id: s.anchor_id,
      offset_business_days: s.offset,
      external_dependency: !!s.external,
      default_label: s.label,
      default_category: s.category,
      default_anchor_type: deriveAnchorType(s.anchor_id),
      default_anchor_id: s.anchor_id,
      default_offset_business_days: s.offset,
      default_external_dependency: !!s.external
    };
  }

  // The immutable shipped task list. Callers get clones via defaultModel().
  var SHIPPED_TASKS = SHIPPED_SPEC.map(specToTask);

  function normalizeLabelSeparator(label) {
    return String(label == null ? "" : label).replace(/^(\d)\s+/, "$1) ");
  }

  // Clone AND normalize a task. anchor_type is always re-derived from anchor_id
  // (never trusted from the input), so an old persisted or imported model whose
  // stored anchor_type disagrees with its anchor is repaired here.
  // external_dependency is a stored flag and is preserved as given (defaulting to
  // the current value when a default is missing). Missing default_* fields fall
  // back to the current values. Labels from stale localStorage / imported models
  // are migrated from "{n} text" to "{n}) text".
  function cloneTask(t) {
    var anchorId = t.anchor_id;
    var defAnchorId = (t.default_anchor_id != null) ? t.default_anchor_id : anchorId;
    var ext = !!t.external_dependency;
    var defExt = (t.default_external_dependency != null) ? !!t.default_external_dependency : ext;
    var label = normalizeLabelSeparator(t.label);
    var defaultLabel = normalizeLabelSeparator((t.default_label != null) ? t.default_label : t.label);
    return {
      id: t.id,
      label: label,
      category: t.category,
      anchor_type: deriveAnchorType(anchorId),
      anchor_id: anchorId,
      offset_business_days: t.offset_business_days,
      external_dependency: ext,
      default_label: defaultLabel,
      default_category: (t.default_category != null) ? t.default_category : t.category,
      default_anchor_type: deriveAnchorType(defAnchorId),
      default_anchor_id: defAnchorId,
      default_offset_business_days: (t.default_offset_business_days != null) ? t.default_offset_business_days : t.offset_business_days,
      default_external_dependency: defExt
    };
  }

  function cloneTasks(tasks) { return tasks.map(cloneTask); }

  // A fresh working copy of the shipped model.
  function defaultModel() { return cloneTasks(SHIPPED_TASKS); }

  // A fresh copy of the shipped default anchor dates.
  function defaultAnchors() {
    var out = {};
    DATE_ANCHOR_IDS.forEach(function (id) { out[id] = DEFAULT_ANCHORS[id]; });
    return out;
  }

  // Coerce an arbitrary (possibly partial / stale) anchors object into a full,
  // valid anchor map: every known anchor id is present, non-string / missing
  // values fall back to the shipped default. Unknown keys are dropped.
  function normalizeAnchors(anchors) {
    var out = {};
    anchors = anchors || {};
    DATE_ANCHOR_IDS.forEach(function (id) {
      var v = anchors[id];
      out[id] = (typeof v === "string" && v) ? v : DEFAULT_ANCHORS[id];
    });
    return out;
  }

  // Set every task's default_* to its current values (used by "make current
  // values the defaults"). Returns a new array.
  function promoteToDefaults(tasks) {
    return tasks.map(function (t) {
      var c = cloneTask(t);
      c.default_label = normalizeLabelSeparator(t.label);
      c.default_category = t.category;
      c.default_anchor_id = t.anchor_id;
      c.default_anchor_type = deriveAnchorType(t.anchor_id);
      c.default_offset_business_days = t.offset_business_days;
      c.default_external_dependency = !!t.external_dependency;
      return c;
    });
  }

  // Reset each task's current values to its stored default_* (used by "reset to
  // current defaults"). Returns a new array.
  function resetToDefaults(tasks) {
    return tasks.map(function (t) {
      var c = cloneTask(t);
      c.label = t.default_label;
      c.category = t.default_category;
      c.anchor_id = t.default_anchor_id;
      c.anchor_type = deriveAnchorType(t.default_anchor_id);
      c.offset_business_days = t.default_offset_business_days;
      c.external_dependency = !!t.default_external_dependency;
      return c;
    });
  }

  // ---- Add / remove tasks ----------------------------------------------------
  //
  // The table view can add and remove tasks. Ids are STABLE, so add generates a
  // collision-free id and remove repairs any dependents that anchored to the
  // removed task (see removeTask). The reserved date-anchor ids are not tasks and
  // can never be generated or removed here.

  // Produce a unique, id-safe slug that is not already used by a task and is not a
  // reserved date-anchor id. Falls back to base_2, base_3, ...
  function uniqueTaskId(tasks, base) {
    var used = {};
    (tasks || []).forEach(function (t) { used[t.id] = true; });
    var slug = String(base == null ? "" : base).replace(/[^a-z0-9_]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
    if (!slug) slug = "task";
    function taken(id) { return used[id] || isDateAnchorId(id); }
    if (!taken(slug)) return slug;
    var i = 2;
    while (taken(slug + "_" + i)) i++;
    return slug + "_" + i;
  }

  // A sane default label ("{n}) New task") for a brand-new row, using the
  // category's numeric prefix so it matches the "{n}) text" convention.
  function defaultNewLabel(category, tasks) {
    var cat = CATEGORIES[category] || CATEGORIES.product;
    return cat.num + ") New task " + ((tasks ? tasks.length : 0) + 1);
  }

  // Build a fully-formed new task. opts: { id?, label?, category?, anchor_id?,
  // offset_business_days? / offset?, external_dependency? }. Defaults: category
  // product, anchor wave2_date, offset 0, external_dependency false. anchor_type is
  // derived and the default_* fields mirror the initial values (so Reset row is a
  // no-op until an edit). The task is NOT added to `tasks`; callers append it.
  function makeTask(tasks, opts) {
    opts = opts || {};
    var category = CATEGORIES[opts.category] ? opts.category : "product";
    var anchorId = (opts.anchor_id != null) ? opts.anchor_id : WAVE2_ANCHOR;
    var offset = (opts.offset_business_days != null) ? opts.offset_business_days
               : (opts.offset != null ? opts.offset : 0);
    offset = Number(offset) || 0;
    var external = !!opts.external_dependency;
    var id = uniqueTaskId(tasks, opts.id != null && opts.id !== "" ? opts.id : "task");
    var label = (opts.label != null && opts.label !== "") ? opts.label : defaultNewLabel(category, tasks);
    return cloneTask({
      id: id,
      label: label,
      category: category,
      anchor_id: anchorId,
      offset_business_days: offset,
      external_dependency: external,
      default_label: label,
      default_category: category,
      default_anchor_id: anchorId,
      default_offset_business_days: offset,
      default_external_dependency: external
    });
  }

  // Remove a task by id and return a new task array. Dependents that anchored to
  // the removed task are NOT left with a broken anchor: each is re-anchored to
  // the removed task's OWN anchor when that is still valid (a date anchor, or a
  // surviving task), preserving the dependent's offset; otherwise it falls back
  // to the Wave 2 date with offset 0. Both the live anchor and the stored default
  // anchor are repaired, so a later Reset cannot resurrect the broken id.
  function removeTask(tasks, id) {
    var target = findTask(tasks, id);
    var remaining = tasks.filter(function (t) { return t.id !== id; });
    if (!target) return remaining.map(cloneTask);
    var removedAnchor = target.anchor_id;
    var remainingIds = {};
    remaining.forEach(function (t) { remainingIds[t.id] = true; });
    function stillValid(anchorId) {
      return isDateAnchorId(anchorId) || !!remainingIds[anchorId];
    }
    remaining.forEach(function (t) {
      if (t.anchor_id === id) {
        if (stillValid(removedAnchor)) {
          t.anchor_id = removedAnchor;
        } else {
          t.anchor_id = WAVE2_ANCHOR;
          t.offset_business_days = 0;
        }
        t.anchor_type = deriveAnchorType(t.anchor_id);
      }
      if (t.default_anchor_id === id) {
        if (stillValid(removedAnchor)) {
          t.default_anchor_id = removedAnchor;
        } else {
          t.default_anchor_id = WAVE2_ANCHOR;
          t.default_offset_business_days = 0;
        }
        t.default_anchor_type = deriveAnchorType(t.default_anchor_id);
      }
    });
    return remaining.map(cloneTask);
  }

  // ---- Date helpers (UTC-based to avoid local-timezone drift) ----------------

  function parseISO(iso) {
    var p = String(iso).split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  function toISO(dt) {
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    var d = String(dt.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function addDays(iso, n) {
    var dt = parseISO(iso);
    dt.setUTCDate(dt.getUTCDate() + n);
    return toISO(dt);
  }

  function diffDays(isoA, isoB) {
    return Math.round((parseISO(isoA) - parseISO(isoB)) / 86400000);
  }

  function isWeekend(iso) {
    var dow = parseISO(iso).getUTCDay(); // 0 Sun .. 6 Sat
    return dow === 0 || dow === 6;
  }

  // ---- Business-day math -----------------------------------------------------
  //
  // Monday-Friday are business days; Saturday/Sunday are skipped.
  //   - Offset 0 returns the anchor date verbatim (even if the anchor is a
  //     weekend).
  //   - Positive N lands on the Nth business day forward; negative N backward.
  //   - Weekends encountered while traversing are stepped over, never counted.
  function addBusinessDays(iso, n) {
    if (!n) return iso;
    var dir = n > 0 ? 1 : -1;
    var remaining = Math.abs(n);
    var cur = iso;
    while (remaining > 0) {
      cur = addDays(cur, dir);
      if (!isWeekend(cur)) remaining--;
    }
    return cur;
  }

  // Signed count of business days from isoA to isoB. Inverse of addBusinessDays:
  // addBusinessDays(a, businessDaysBetween(a, b)) === b whenever b is reachable
  // (b is not a skipped weekend day in the walk).
  function businessDaysBetween(isoA, isoB) {
    if (isoA === isoB) return 0;
    var dir = isoB > isoA ? 1 : -1;
    var count = 0;
    var cur = isoA;
    while (cur !== isoB) {
      cur = addDays(cur, dir);
      if (!isWeekend(cur)) count++;
    }
    return dir * count;
  }

  // ---- Graph resolution ------------------------------------------------------
  //
  // Resolve each task's date. The full graph is indexed by id FIRST, so item
  // anchors may reference tasks defined later (forward references). Item-anchored
  // tasks resolve their parent first (memoized DFS). Cycles and invalid anchor ids
  // are detected and reported per task rather than throwing, so the UI can render
  // the rest of the model and surface a clear error for the broken rows.
  //
  // `anchors` is a map of date-anchor id -> ISO date (see normalizeAnchors). Each
  // date-anchored task reads its own anchor's date, so the four anchors seed four
  // independent subgraphs.
  //
  // Returns { byId, order, errors } where:
  //   byId[id]  = { date, anchor_date, error }  (date/anchor_date null if broken)
  //   errors    = [ { id, message } ]           (one per broken task)
  function resolveGraph(tasks, anchors) {
    var A = normalizeAnchors(anchors);
    var byIdTask = {};
    tasks.forEach(function (t) { byIdTask[t.id] = t; });

    var out = {};              // id -> { date, anchor_date, error }
    var errors = [];
    var stack = [];            // ids currently being resolved (cycle detection)

    function fail(id, message) {
      out[id] = { date: null, anchor_date: null, error: message };
      errors.push({ id: id, message: message });
      return out[id];
    }

    function resolve(id) {
      if (Object.prototype.hasOwnProperty.call(out, id)) return out[id];

      var t = byIdTask[id];
      if (!t) return fail(id, "unknown task id '" + id + "'");

      // Cycle: this id is already on the active resolution stack.
      var at = stack.indexOf(id);
      if (at !== -1) {
        var members = stack.slice(at).concat([id]);
        var msg = "anchor cycle: " + members.join(" -> ");
        stack.slice(at).forEach(function (cid) {
          if (!Object.prototype.hasOwnProperty.call(out, cid)) fail(cid, msg);
        });
        return out[id];
      }

      var anchorDate = null;
      if (t.anchor_type === "date_anchor") {
        if (isDateAnchorId(t.anchor_id)) anchorDate = A[t.anchor_id];
        else return fail(id, "invalid date anchor '" + t.anchor_id + "'");
      } else if (t.anchor_type === "item_anchor") {
        if (isDateAnchorId(t.anchor_id)) {
          return fail(id, "item anchor points at the date anchor id '" + t.anchor_id + "'; set anchor to a task or a date anchor");
        }
        if (!byIdTask[t.anchor_id]) {
          return fail(id, "invalid anchor id '" + t.anchor_id + "'");
        }
        stack.push(id);
        var parent = resolve(t.anchor_id);
        stack.pop();
        if (Object.prototype.hasOwnProperty.call(out, id)) return out[id];
        if (!parent || parent.date === null) {
          return fail(id, "anchor '" + t.anchor_id + "' could not be resolved");
        }
        anchorDate = parent.date;
      } else {
        return fail(id, "unknown anchor type '" + t.anchor_type + "'");
      }

      var offset = Number(t.offset_business_days) || 0;
      var date = addBusinessDays(anchorDate, offset);
      out[id] = { date: date, anchor_date: anchorDate, error: null };
      return out[id];
    }

    var order = tasks.map(function (t) { return t.id; });
    order.forEach(function (id) { resolve(id); });

    return { byId: out, order: order, errors: errors };
  }

  // ---- Core recalculation ----------------------------------------------------
  //
  // opts:
  //   anchors  date-anchor map (defaults to a fresh shipped anchor map)
  //   tasks    working task array (defaults to a fresh shipped model)
  //
  // Returns { anchors, tasks: [ resolved... ], errors, defaultDates }.
  // Each resolved task is the task object plus { date, weekend, anchor_date,
  // error, resolved, moved }. `moved` is true when the resolved date differs from
  // the date the task's OWN default_* fields would produce (under the same
  // anchors), i.e. a task-level edit -- not merely an anchor move.
  function recalc(opts) {
    opts = opts || {};
    var anchors = normalizeAnchors(opts.anchors);
    var tasks = opts.tasks ? opts.tasks : defaultModel();

    var g = resolveGraph(tasks, anchors);

    // Resolve the same tasks under their stored defaults to compute `moved`.
    var defaultTasks = resetToDefaults(tasks);
    var gd = resolveGraph(defaultTasks, anchors);

    var resolved = tasks.map(function (t) {
      var r = g.byId[t.id] || { date: null, anchor_date: null, error: "unresolved" };
      var dd = gd.byId[t.id] || { date: null };
      var out = cloneTask(t);
      out.date = r.date;
      out.anchor_date = r.anchor_date;
      out.error = r.error;
      out.resolved = r.date !== null && !r.error;
      out.weekend = r.date ? isWeekend(r.date) : false;
      out.default_date = dd.date;
      out.moved = out.resolved && dd.date !== null && r.date !== dd.date;
      return out;
    });

    return {
      anchors: anchors,
      tasks: resolved,
      errors: g.errors,
      defaultDates: gd.byId
    };
  }

  // ---- Validation / warnings -------------------------------------------------
  //
  // Produces graph errors (cycles / invalid anchors). An unresolved anchor is the
  // only structural problem to surface.
  function validate(result) {
    var warnings = [];

    (result.errors || []).forEach(function (e) {
      var t = findTask(result.tasks, e.id);
      var label = t ? t.label : e.id;
      warnings.push({ level: "error", text: '"' + label + '" is unresolved: ' + e.message + "." });
    });

    return warnings;
  }

  function findTask(tasks, id) {
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }

  // The chain of anchors from a task up to its date anchor: returns an ordered
  // list of ids [self, parent, ..., grandparent] ending at the item whose anchor
  // is a date anchor. Stops on cycles/invalid ids.
  function anchorChain(tasks, id) {
    var byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });
    var chain = [];
    var seen = {};
    var cur = id;
    while (cur && byId[cur] && !seen[cur]) {
      seen[cur] = true;
      chain.push(cur);
      var t = byId[cur];
      if (t.anchor_type === "item_anchor") cur = t.anchor_id;
      else cur = null; // date anchor: stop
    }
    return chain;
  }

  // The date-anchor id that terminates a task's anchor chain (e.g. "wave2_date"),
  // or null if the chain does not resolve to a date anchor. Used by the UI to
  // highlight the correct anchor cell for a selected task.
  function terminalDateAnchor(tasks, id) {
    var chain = anchorChain(tasks, id);
    if (!chain.length) return null;
    var last = findTask(tasks, chain[chain.length - 1]);
    if (last && last.anchor_type === "date_anchor" && isDateAnchorId(last.anchor_id)) {
      return last.anchor_id;
    }
    return null;
  }

  // Export the working model as a plain JSON-serializable object. The four date
  // anchors are emitted as top-level fields in the canonical order.
  function exportModel(anchors, tasks) {
    var A = normalizeAnchors(anchors);
    var out = {
      version: 3,
      exported_at: null // caller may stamp a timestamp
    };
    DATE_ANCHOR_IDS.forEach(function (id) { out[id] = A[id]; });
    out.tasks = cloneTasks(tasks);
    return out;
  }

  var api = {
    DATE_ANCHORS: DATE_ANCHORS,
    DATE_ANCHOR_IDS: DATE_ANCHOR_IDS,
    CONTROL_ANCHOR_IDS: CONTROL_ANCHOR_IDS,
    DATE_ANCHOR_BY_ID: DATE_ANCHOR_BY_ID,
    DEFAULT_ANCHORS: DEFAULT_ANCHORS,
    WAVE2_ANCHOR: WAVE2_ANCHOR,
    CATEGORIES: CATEGORIES,
    CATEGORY_ORDER: CATEGORY_ORDER,
    SHIPPED_TASKS: SHIPPED_TASKS,
    isDateAnchorId: isDateAnchorId,
    deriveAnchorType: deriveAnchorType,
    defaultModel: defaultModel,
    defaultAnchors: defaultAnchors,
    normalizeAnchors: normalizeAnchors,
    cloneTask: cloneTask,
    cloneTasks: cloneTasks,
    promoteToDefaults: promoteToDefaults,
    resetToDefaults: resetToDefaults,
    uniqueTaskId: uniqueTaskId,
    defaultNewLabel: defaultNewLabel,
    makeTask: makeTask,
    removeTask: removeTask,
    parseISO: parseISO,
    toISO: toISO,
    addDays: addDays,
    diffDays: diffDays,
    isWeekend: isWeekend,
    addBusinessDays: addBusinessDays,
    businessDaysBetween: businessDaysBetween,
    normalizeLabelSeparator: normalizeLabelSeparator,
    resolveGraph: resolveGraph,
    recalc: recalc,
    validate: validate,
    findTask: findTask,
    anchorChain: anchorChain,
    terminalDateAnchor: terminalDateAnchor,
    exportModel: exportModel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BreadModel = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
