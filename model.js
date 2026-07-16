/*
 * Bread reverse launch calendar: shared task/date model.
 *
 * Source of truth: Gaylord's "next update" task table (see README "Default
 * model"). This revision moves the model to a graph of anchored tasks:
 *
 *   - Every task has a STABLE id (independent of its editable label).
 *   - A task's anchor is either a DATE anchor (`teaser_date` / `launch_date`)
 *     or an ITEM anchor (another task's id). Item-anchored tasks recompute when
 *     their parent moves, so a whole dependency chain shifts together.
 *   - Offsets are BUSINESS DAYS (Monday-Friday); weekends are skipped.
 *
 * This file is environment-agnostic: it runs unchanged in the browser (attaches
 * to window.BreadModel) and in Node (module.exports), so the UI and the Node
 * verifiers exercise the exact same resolution logic.
 */
(function (root) {
  "use strict";

  // Default date anchors (shipped baseline, from bread-calendar-model.json).
  var DEFAULT_TEASER = "2026-08-06"; // Thursday
  var DEFAULT_LAUNCH = "2026-08-13"; // Thursday
  var DEFAULT_GAP_DAYS = 3; // warn if teaser -> launch spans under 3 business days

  // The two reserved date-anchor ids.
  var TEASER_ANCHOR = "teaser_date";
  var LAUNCH_ANCHOR = "launch_date";

  // Category metadata. Colors / tints / patterns preserved from the original
  // spec's "Categories, colors, and visual labels to preserve" table. `num` is
  // the stable numeric prefix shown (as "{num}) name") in the legend and baked
  // into every label as "{num}) ...".
  var CATEGORIES = {
    v016:    { num: 0, name: "v0.16 dependency",   color: "#4d4d4d", tint: "#e5e7eb", pattern: "none" },
    product: { num: 1, name: "Product / go-no-go", color: "#d55e00", tint: "#f6d7c3", pattern: "cross" },
    stores:  { num: 2, name: "Stores",             color: "#0072b2", tint: "#cfe8f6", pattern: "vertical" },
    video:   { num: 3, name: "Video / design",     color: "#cc79a7", tint: "#f0d4e4", pattern: "horizontal" },
    landing: { num: 4, name: "Landing / waitlist", color: "#000000", tint: "#f1f5f9", pattern: "diagonal" },
    support: { num: 5, name: "Support",            color: "#009e73", tint: "#ccebdd", pattern: "none" },
    comms:   { num: 6, name: "Comms",              color: "#e69f00", tint: "#f8e1a5", pattern: "none" },
    public:  { num: 7, name: "Public moment",      color: "#f0e442", tint: "#fff7a8", pattern: "circle" }
  };

  var CATEGORY_ORDER = ["v016", "product", "stores", "video", "landing", "support", "comms", "public"];

  // Critical dependencies: if any of these lands AFTER launch, the schedule is
  // broken and the UI surfaces a blocking-style warning.
  var CRITICAL_AFTER_LAUNCH = [
    "v016_testnet",
    "guardian_upgrade_done",
    "client_wallet_done",
    "stores_live",
    "comms_launch_final",
    "launch_video_final",
    "support_final_polish"
  ];

  // ---- Derived-field helpers -------------------------------------------------
  //
  // As of this revision, `anchor_type` and `external_dependency` are NOT edited
  // by the user: they are deduced from `anchor_id`. Selecting the teaser or
  // launch date makes a task a date-anchor with no external dependency; anchoring
  // to any other task makes it an item-anchor and marks it an external dependency.
  // These helpers are the single source of truth for that deduction and are used
  // everywhere a task is created, cloned, edited, imported, reset, or promoted.
  function isDateAnchorId(anchorId) {
    return anchorId === TEASER_ANCHOR || anchorId === LAUNCH_ANCHOR;
  }
  function deriveAnchorType(anchorId) {
    return isDateAnchorId(anchorId) ? "date_anchor" : "item_anchor";
  }
  function deriveExternalDependency(anchorId) {
    // Date anchors (teaser/launch) are internal timing; any item anchor is an
    // external dependency.
    return !isDateAnchorId(anchorId);
  }

  // ---- Shipped task list -----------------------------------------------------
  //
  // Each row: stable id, editable label, category, anchor_id (teaser_date /
  // launch_date / another task id), signed business-day offset. `anchor_type`
  // and `external_dependency` are DERIVED from anchor_id (see helpers above), so
  // they are not listed here. Order follows bread-calendar-model.json (the
  // shipped baseline) with the three requested additions appended; display sorts
  // by resolved date.
  var SHIPPED_SPEC = [
    { id: "date_feasibility",            label: "1) PRODUCT: date feasibility chat",      category: "product", anchor_id: TEASER_ANCHOR,                    offset: -15 },
    { id: "company_testing",             label: "1) PRODUCT: company testing",            category: "product", anchor_id: TEASER_ANCHOR,                    offset: -12 },
    { id: "support_test_workflow",       label: "5) SUPPORT: test workflow",              category: "support", anchor_id: "company_testing",                offset:   0 },
    { id: "product_e2e",                 label: "1) PRODUCT: Everything working e2e",     category: "product", anchor_id: TEASER_ANCHOR,                    offset:  -1 },
    { id: "v016_devnet",                 label: "0) v0.16 on devnet",                     category: "v016",    anchor_id: "product_e2e",                    offset: -12 },
    { id: "video_teaser_final",          label: "3) VIDEO: teaser final",                 category: "video",   anchor_id: TEASER_ANCHOR,                    offset: -10 },
    { id: "launch_video_start",          label: "3) LAUNCH VIDEO: start",                 category: "video",   anchor_id: LAUNCH_ANCHOR,                    offset: -14 },
    { id: "stores_submit",               label: "2) STORES: submit post-tests (v.P-T)",   category: "stores",  anchor_id: TEASER_ANCHOR,                    offset:  -9 },
    { id: "launch_video_capture",        label: "3) LAUNCH VIDEO: capture",               category: "video",   anchor_id: "launch_video_start",             offset:   1 },
    { id: "landing_live",                label: "4) LANDING: page live",                  category: "landing", anchor_id: LAUNCH_ANCHOR,                    offset:  -1 },
    { id: "v016_testnet",                label: "0) v0.16 on testnet",                    category: "v016",    anchor_id: "v016_devnet",                    offset:   8 },
    { id: "comms_drafts",                label: "6) COMMS: article/social drafts",        category: "comms",   anchor_id: TEASER_ANCHOR,                    offset: -13 },
    { id: "guardian_upgrade_done",       label: "0) Guardian upgrade done",               category: "v016",    anchor_id: "v016_testnet",                   offset:  -2 },
    { id: "stores_live",                 label: "2) STORES: v.P-T live",                  category: "stores",  anchor_id: "stores_submit",                  offset:   6 },
    { id: "email_list_ready",            label: "4) WAITLIST: sub form out",              category: "landing", anchor_id: TEASER_ANCHOR,                    offset:  -1 },
    { id: "go_no_go",                    label: "1) GO/NO-GO before teaser",              category: "product", anchor_id: TEASER_ANCHOR,                    offset:  -1 },
    { id: "comms_link_pack",             label: "6) COMMS: link pack ready",              category: "comms",   anchor_id: "comms_drafts",                   offset:  10 },
    { id: "public_teaser",               label: "7) PUBLIC: teaser if GO",                category: "public",  anchor_id: TEASER_ANCHOR,                    offset:   0 },
    { id: "comms_launch_final",          label: "6) COMMS: launch final",                 category: "comms",   anchor_id: LAUNCH_ANCHOR,                    offset:  -2 },
    { id: "launch_video_review",         label: "3) LAUNCH VIDEO: review",                category: "video",   anchor_id: "launch_video_capture",           offset:   5 },
    { id: "support_final_polish",        label: "5) SUPPORT: final polish done",          category: "support", anchor_id: LAUNCH_ANCHOR,                    offset:  -7 },
    { id: "launch_video_final",          label: "3) LAUNCH VIDEO: final",                 category: "video",   anchor_id: "launch_video_review",            offset:   5 },
    { id: "public_launch",               label: "7) PUBLIC: Launch announcement",         category: "public",  anchor_id: LAUNCH_ANCHOR,                    offset:   0 },
    { id: "client_wallet_done",          label: "0) Client/wallet/Epoch upgrade done",    category: "v016",    anchor_id: "guardian_upgrade_done",          offset:   4 },
    // ---- Additions requested in this revision batch ----
    { id: "stores_submit_final_version", label: "2) STORES: submit final version",        category: "stores",  anchor_id: TEASER_ANCHOR,                    offset:  -3 },
    { id: "stores_final_version_live",   label: "2) STORES: final version live",          category: "stores",  anchor_id: "stores_submit_final_version",    offset:   5 },
    { id: "visual_identity_board",       label: "3) VISUAL IDENTITY: Board",              category: "video",   anchor_id: TEASER_ANCHOR,                    offset: -11 }
  ];

  // Expand a spec row into a full task object whose default_* fields mirror the
  // shipped values (used for "restore shipped defaults"). anchor_type and
  // external_dependency are derived from anchor_id.
  function specToTask(s) {
    return {
      id: s.id,
      label: s.label,
      category: s.category,
      anchor_type: deriveAnchorType(s.anchor_id),
      anchor_id: s.anchor_id,
      offset_business_days: s.offset,
      external_dependency: deriveExternalDependency(s.anchor_id),
      default_label: s.label,
      default_category: s.category,
      default_anchor_type: deriveAnchorType(s.anchor_id),
      default_anchor_id: s.anchor_id,
      default_offset_business_days: s.offset,
      default_external_dependency: deriveExternalDependency(s.anchor_id)
    };
  }

  // The immutable shipped task list. Callers get clones via defaultModel().
  var SHIPPED_TASKS = SHIPPED_SPEC.map(specToTask);

  function normalizeLabelSeparator(label) {
    return String(label == null ? "" : label).replace(/^(\d)\s+/, "$1) ");
  }

  // Clone AND normalize a task. anchor_type / external_dependency are always
  // re-derived from anchor_id (never trusted from the input), so an old persisted
  // or imported model whose stored flags disagree with its anchor is repaired
  // here. Missing default_* fields fall back to the current values. Labels from
  // stale localStorage / imported models are also migrated from "{n} text" to
  // "{n}) text" so old browser state does not keep the prior UI format alive.
  function cloneTask(t) {
    var anchorId = t.anchor_id;
    var defAnchorId = (t.default_anchor_id != null) ? t.default_anchor_id : anchorId;
    var label = normalizeLabelSeparator(t.label);
    var defaultLabel = normalizeLabelSeparator((t.default_label != null) ? t.default_label : t.label);
    return {
      id: t.id,
      label: label,
      category: t.category,
      anchor_type: deriveAnchorType(anchorId),
      anchor_id: anchorId,
      offset_business_days: t.offset_business_days,
      external_dependency: deriveExternalDependency(anchorId),
      default_label: defaultLabel,
      default_category: (t.default_category != null) ? t.default_category : t.category,
      default_anchor_type: deriveAnchorType(defAnchorId),
      default_anchor_id: defAnchorId,
      default_offset_business_days: (t.default_offset_business_days != null) ? t.default_offset_business_days : t.offset_business_days,
      default_external_dependency: deriveExternalDependency(defAnchorId)
    };
  }

  function cloneTasks(tasks) { return tasks.map(cloneTask); }

  // A fresh working copy of the shipped model.
  function defaultModel() { return cloneTasks(SHIPPED_TASKS); }

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
      c.default_external_dependency = deriveExternalDependency(t.anchor_id);
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
      c.external_dependency = deriveExternalDependency(t.default_anchor_id);
      return c;
    });
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
  // Resolve each task's date. Item-anchored tasks resolve their parent first
  // (memoized DFS). Cycles and invalid anchor ids are detected and reported per
  // task rather than throwing, so the UI can render the rest of the model and
  // surface a clear error for the broken rows.
  //
  // Returns { byId, order, errors } where:
  //   byId[id]  = { date, anchor_date, error }  (date/anchor_date null if broken)
  //   errors    = [ { id, message } ]           (one per broken task)
  function resolveGraph(tasks, teaser, launch) {
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
        // Flag every member of the cycle.
        stack.slice(at).forEach(function (cid) {
          if (!Object.prototype.hasOwnProperty.call(out, cid)) fail(cid, msg);
        });
        return out[id];
      }

      var anchorDate = null;
      if (t.anchor_type === "date_anchor") {
        if (t.anchor_id === TEASER_ANCHOR) anchorDate = teaser;
        else if (t.anchor_id === LAUNCH_ANCHOR) anchorDate = launch;
        else return fail(id, "invalid date anchor '" + t.anchor_id + "'");
      } else if (t.anchor_type === "item_anchor") {
        if (t.anchor_id === TEASER_ANCHOR || t.anchor_id === LAUNCH_ANCHOR) {
          return fail(id, "item anchor points at a date anchor id '" + t.anchor_id + "'; set anchor type to date");
        }
        if (!byIdTask[t.anchor_id]) {
          return fail(id, "invalid anchor id '" + t.anchor_id + "'");
        }
        stack.push(id);
        var parent = resolve(t.anchor_id);
        stack.pop();
        // If this task got flagged as a cycle member while resolving upstream.
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
  //   teaser  ISO string (defaults to DEFAULT_TEASER)
  //   launch  ISO string (defaults to DEFAULT_LAUNCH)
  //   tasks   working task array (defaults to a fresh shipped model)
  //
  // Returns { teaser, launch, tasks: [ resolved... ], errors, defaultDates }.
  // Each resolved task is the task object plus { date, weekend, anchor_date,
  // error, resolved, moved }. `moved` is true when the resolved date differs
  // from the date the task's OWN default_* fields would produce (so the UI can
  // badge user-moved rows).
  function recalc(opts) {
    opts = opts || {};
    var teaser = opts.teaser || DEFAULT_TEASER;
    var launch = opts.launch || DEFAULT_LAUNCH;
    var tasks = opts.tasks ? opts.tasks : defaultModel();

    var g = resolveGraph(tasks, teaser, launch);

    // Resolve the same tasks under their stored defaults to compute `moved`.
    var defaultTasks = resetToDefaults(tasks);
    var gd = resolveGraph(defaultTasks, teaser, launch);

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
      teaser: teaser,
      launch: launch,
      tasks: resolved,
      errors: g.errors,
      defaultDates: gd.byId
    };
  }

  // ---- Validation / warnings -------------------------------------------------
  //
  // Produces gap warnings (teaser/launch relationship), graph errors (cycles /
  // invalid anchors), and critical-dependency-after-launch warnings.
  function validate(result) {
    var warnings = [];
    var teaser = result.teaser;
    var launch = result.launch;

    var gap = businessDaysBetween(teaser, launch);
    if (gap < 0) {
      warnings.push({ level: "error", text: "Launch date (" + launch + ") is before teaser date (" + teaser + ")." });
    } else if (gap < DEFAULT_GAP_DAYS) {
      warnings.push({ level: "warn", text: "Teaser-to-launch gap is " + gap + " business day(s); under " + DEFAULT_GAP_DAYS + ". Launch-final tasks occupy the last business days before launch." });
    }

    // Graph errors (cycles / invalid anchor ids) block a clean schedule.
    (result.errors || []).forEach(function (e) {
      var t = findTask(result.tasks, e.id);
      var label = t ? t.label : e.id;
      warnings.push({ level: "error", text: '"' + label + '" is unresolved: ' + e.message + "." });
    });

    // Critical dependencies must not land after launch.
    result.tasks.forEach(function (t) {
      if (CRITICAL_AFTER_LAUNCH.indexOf(t.id) === -1) return;
      if (t.resolved && t.date > launch) {
        warnings.push({ level: "error", text: 'Critical dependency "' + t.label + '" (' + t.date + ") lands after launch (" + launch + ")." });
      }
    });

    return warnings;
  }

  function findTask(tasks, id) {
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }

  // The chain of anchors from a task up to its date anchor: returns an ordered
  // list of ids [self, parent, ..., grandparent] ending at the item whose
  // anchor is a date anchor. Stops on cycles/invalid ids.
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

  // Export the working model as a plain JSON-serializable object.
  function exportModel(teaser, launch, tasks) {
    return {
      version: 2,
      exported_at: null, // caller may stamp a timestamp
      teaser_date: teaser,
      launch_date: launch,
      tasks: cloneTasks(tasks)
    };
  }

  var api = {
    DEFAULT_TEASER: DEFAULT_TEASER,
    DEFAULT_LAUNCH: DEFAULT_LAUNCH,
    DEFAULT_GAP_DAYS: DEFAULT_GAP_DAYS,
    TEASER_ANCHOR: TEASER_ANCHOR,
    LAUNCH_ANCHOR: LAUNCH_ANCHOR,
    CATEGORIES: CATEGORIES,
    CATEGORY_ORDER: CATEGORY_ORDER,
    CRITICAL_AFTER_LAUNCH: CRITICAL_AFTER_LAUNCH,
    SHIPPED_TASKS: SHIPPED_TASKS,
    isDateAnchorId: isDateAnchorId,
    deriveAnchorType: deriveAnchorType,
    deriveExternalDependency: deriveExternalDependency,
    defaultModel: defaultModel,
    cloneTask: cloneTask,
    cloneTasks: cloneTasks,
    promoteToDefaults: promoteToDefaults,
    resetToDefaults: resetToDefaults,
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
    exportModel: exportModel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BreadModel = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
