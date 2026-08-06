/* Bread reverse launch calendar: browser UI. Uses window.BreadModel (model.js). */
(function () {
  "use strict";
  var M = window.BreadModel;
  // Versioned storage key + explicit model revision. The v3 SCHEMA is unchanged,
  // but the shipped DEFAULTS changed again (new task offsets/anchors, and Wave 2 is
  // now a hidden past baseline), so a new storage KEY plus a bumped REVISION stamp
  // guarantees that stale schema-3 state from the previous release cannot mask or
  // shadow the new shipped defaults: the old keys are different buckets (proactively
  // removed on load) and a payload with the wrong revision under the new key is
  // discarded. Exported JSON stays version 3; only this persistence revision moves.
  var STORAGE_KEY = "bread-calendar-model-v3r3";
  var STORAGE_SCHEMA = 3;
  var STORAGE_REVISION = 3;
  var LEGACY_STORAGE_KEYS = ["bread-calendar-model-v3r2", "bread-calendar-model-v3", "bread-calendar-model-v2", "bread-calendar-model"];

  // ---- Persistence (localStorage) -------------------------------------------
  // The app is a static local page: source files cannot be written from the
  // browser. So user edits (labels, anchors, offsets, categories, external-dep
  // flags, the four date anchors, AND user-chosen defaults) live in localStorage.
  // Clearing storage or "Restore shipped defaults" returns to the model shipped in
  // model.js.
  function hasStorage() {
    try { return typeof localStorage !== "undefined" && localStorage !== null; }
    catch (e) { return false; }
  }
  // Drop any prior-release persisted state (old single-anchor v3 key and the
  // pre-wave v2/teaser keys) so it can never resurface or shadow the new defaults.
  function dropLegacyStorage() {
    if (!hasStorage()) return;
    LEGACY_STORAGE_KEYS.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
  }
  function loadPersisted() {
    if (!hasStorage()) return null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      // Only accept current schema AND revision. Anything else (missing fields, a
      // previous-release single-anchor blob copied under this key, a future
      // version) is discarded so it cannot mask the shipped defaults.
      if (!obj || obj.schema !== STORAGE_SCHEMA || obj.revision !== STORAGE_REVISION || !Array.isArray(obj.tasks)) return null;
      if (!obj.anchors || typeof obj.anchors !== "object") return null;
      if (typeof obj.anchors.wave2_date !== "string" || !obj.anchors.wave2_date) return null;
      return obj;
    } catch (e) { return null; }
  }
  function persist() {
    if (!hasStorage()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        schema: STORAGE_SCHEMA,
        revision: STORAGE_REVISION,
        anchors: state.anchors,
        tasks: state.model
      }));
    } catch (e) { /* ignore quota / disabled storage */ }
  }

  dropLegacyStorage();
  var persisted = loadPersisted();
  var state = {
    anchors: M.normalizeAnchors(persisted ? persisted.anchors : null),
    model: persisted ? M.cloneTasks(persisted.tasks) : M.defaultModel(),
    view: "calendar",     // "calendar" | "table"
    activeCats: {},        // { categoryKey: true } (legend filter; empty = show all)
    selectedId: null       // currently highlighted task id
  };

  // ---- Legend filter helpers ------------------------------------------------
  function anyCatSelected() { return Object.keys(state.activeCats).length > 0; }
  function visibleTasks(tasks) {
    if (!anyCatSelected()) return tasks;
    return tasks.filter(function (t) { return state.activeCats[t.category]; });
  }

  // ---- DOM refs -------------------------------------------------------------
  var el = {
    reset: document.getElementById("reset"),
    addTask: document.getElementById("add-task"),
    makeDefaults: document.getElementById("make-defaults"),
    restoreShipped: document.getElementById("restore-shipped"),
    exportBtn: document.getElementById("export"),
    viewCal: document.getElementById("view-cal"),
    viewTable: document.getElementById("view-table"),
    warnings: document.getElementById("warnings"),
    legend: document.getElementById("legend"),
    details: document.getElementById("details"),
    calendar: document.getElementById("calendar"),
    tableview: document.getElementById("tableview")
  };
  // One date input per CONTROL date anchor, keyed by anchor id (the input's id in
  // index.html is exactly the anchor id). Anchors marked non-control (the fixed past
  // Wave 2 start and v0.16 devnet dates) have no input here; they stay in the model,
  // export, and task anchor dropdown, still show a calendar chip, and their tasks
  // remain movable. Only two inputs remain: v0.16 testnet then Circle announcement.
  el.anchorInputs = {};
  M.CONTROL_ANCHOR_IDS.forEach(function (id) { el.anchorInputs[id] = document.getElementById(id); });

  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function localTodayISO() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---- Highlight computation (click an item -> highlight it + its anchors) ---
  // Returns { ids: {id:true}, dateAnchor: <anchor id>|null, chain: [...] }.
  function computeHighlight() {
    var out = { ids: {}, dateAnchor: null, chain: [] };
    if (!state.selectedId) return out;
    var chain = M.anchorChain(state.model, state.selectedId);
    out.chain = chain;
    chain.forEach(function (id) { out.ids[id] = true; });
    out.dateAnchor = M.terminalDateAnchor(state.model, state.selectedId);
    return out;
  }

  // ---- Task pill (calendar cell) --------------------------------------------
  //
  // Category is conveyed by a soft tint fill plus a consistent 3px LEFT accent in
  // the category color (no per-category full stroke, no decorative patterns). A
  // quiet neutral outline/shadow is applied uniformly in CSS. External
  // dependencies carry NO badge and NO special border here -- the flag stays in
  // the model/export and in the details popup only.
  function pillHTML(t, hl) {
    var cat = M.CATEGORIES[t.category];
    var badges = "";
    if (t.weekend) badges += '<span class="badge weekend" title="Lands on a weekend">WKND</span>';
    if (t.moved) badges += '<span class="badge moved" title="Moved from default ' + (t.default_date || "?") + '">moved</span>';
    var cls = "pill";
    if (hl && hl.ids[t.id]) cls += (t.id === state.selectedId ? " hl-self" : " hl-anchor");
    var style = "background-color:" + cat.tint + ";border-left-color:" + cat.color;
    return (
      '<div class="' + cls + '" draggable="true" style="' + style + '"' +
        ' data-task-id="' + t.id + '" data-date="' + t.date + '"' +
        ' data-category="' + t.category + '"' +
        ' title="' + escapeHTML(t.label) + ' (' + t.date + ')">' +
        '<span class="pill-text">' + escapeHTML(t.label) + "</span>" +
        (badges ? '<div class="badges">' + badges + "</div>" : "") +
      "</div>"
    );
  }

  function indexByDate(tasks) {
    var map = {};
    tasks.forEach(function (t) {
      if (!t.date) return; // unresolved tasks are not placed on the calendar
      (map[t.date] = map[t.date] || []).push(t);
    });
    return map;
  }

  // Map anchor date -> [anchor meta] so a day cell can render its anchor chip(s).
  function anchorsByDate(anchors) {
    var map = {};
    M.DATE_ANCHORS.forEach(function (a) {
      var iso = anchors[a.id];
      if (!iso) return;
      (map[iso] = map[iso] || []).push(a);
    });
    return map;
  }

  // Inclusive month span covering all resolved task dates + every date anchor.
  function monthSpan(result) {
    var all = result.tasks.filter(function (t) { return t.date; }).map(function (t) { return t.date; });
    M.DATE_ANCHOR_IDS.forEach(function (id) { all.push(result.anchors[id]); });
    var min = all.reduce(function (a, b) { return a < b ? a : b; });
    var max = all.reduce(function (a, b) { return a > b ? a : b; });
    var d0 = M.parseISO(min), d1 = M.parseISO(max);
    var months = [];
    var y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    var ey = d1.getUTCFullYear(), em = d1.getUTCMonth();
    while (y < ey || (y === ey && m <= em)) {
      months.push({ year: y, month: m });
      m++; if (m > 11) { m = 0; y++; }
    }
    return months;
  }

  // renderCalendar takes the FULL resolved result (fullResult) to decide the
  // month span and which weeks carry content, and a VISIBLE result (visResult,
  // after the legend category filter) to decide which pills to draw. This keeps
  // the month/week structure stable across filter changes.
  function renderCalendar(fullResult, visResult, hl) {
    var contentByDate = indexByDate(fullResult.tasks); // stable week structure
    var pillByDate = indexByDate(visResult.tasks);     // filtered pills
    var anchorByDate = anchorsByDate(fullResult.anchors);
    var today = localTodayISO();
    var months = monthSpan(fullResult);
    var html = "";
    months.forEach(function (mo) {
      html += '<div class="month" data-month="' + mo.year + "-" + (mo.month + 1) + '"><h2>' + MONTH_NAMES[mo.month] + " " + mo.year + "</h2>";
      html += '<table class="cal"><thead><tr>';
      DOW.forEach(function (d, i) {
        html += '<th class="' + (i === 0 || i === 6 ? "we" : "") + '">' + d + "</th>";
      });
      html += "</tr></thead><tbody>";

      var first = new Date(Date.UTC(mo.year, mo.month, 1));
      var startOffset = first.getUTCDay();
      var cursor = new Date(Date.UTC(mo.year, mo.month, 1 - startOffset));

      // Build six week rows, tracking whether each carries in-month content
      // (a task pill or any date anchor). Leading/trailing empty rows are trimmed
      // dynamically so the visible span follows the current dates.
      var weekRows = [];
      for (var row = 0; row < 6; row++) {
        var rowHTML = "<tr>";
        var rowHasContent = false;
        for (var col = 0; col < 7; col++) {
          var iso = M.toISO(cursor);
          var inMonth = cursor.getUTCMonth() === mo.month;
          var we = (col === 0 || col === 6);
          var cellAnchors = anchorByDate[iso] || null;
          // Week content is decided from the FULL set so filters never trim weeks.
          var hasContent = inMonth && !!contentByDate[iso];
          // Pills are drawn from the VISIBLE (filtered) set.
          var hasTasks = inMonth && !!pillByDate[iso];
          if (inMonth && (cellAnchors || hasContent)) rowHasContent = true;
          var cls = [];
          if (we) cls.push("we");
          if (!inMonth) cls.push("other");
          if (inMonth && iso === today) cls.push("today");
          if (inMonth && cellAnchors) cls.push("anchor-day");
          var highlighted = inMonth && cellAnchors && hl.dateAnchor &&
            cellAnchors.some(function (a) { return a.id === hl.dateAnchor; });
          if (highlighted) cls.push("hl-anchor-cell");
          rowHTML += '<td class="' + cls.join(" ") + '" data-date="' + iso + '">';
          var dayCls = "daynum" + (cellAnchors && inMonth ? " anchor" : "") + (inMonth && iso === today ? " today" : "");
          rowHTML += '<span class="' + dayCls + '"' + (inMonth && iso === today ? ' title="Today"' : "") + '>' + cursor.getUTCDate() + "</span>";
          if (inMonth && cellAnchors) {
            cellAnchors.forEach(function (a) {
              rowHTML += '<span class="anchor-tag" title="' + escapeHTML(a.label) + '">' + escapeHTML(a.chip) + "</span>";
            });
          }
          if (hasTasks) {
            pillByDate[iso].forEach(function (t) { rowHTML += pillHTML(t, hl); });
          }
          rowHTML += "</td>";
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        rowHTML += "</tr>";
        weekRows.push({ html: rowHTML, hasContent: rowHasContent });
      }

      var firstIdx = 0, lastIdx = weekRows.length - 1;
      while (firstIdx <= lastIdx && !weekRows[firstIdx].hasContent) firstIdx++;
      while (lastIdx >= firstIdx && !weekRows[lastIdx].hasContent) lastIdx--;
      for (var r = firstIdx; r <= lastIdx; r++) html += weekRows[r].html;

      html += "</tbody></table></div>";
    });
    el.calendar.innerHTML = html;
  }

  // ---- Table view (fully editable rows) -------------------------------------
  function anchorLabel(result, t) {
    if (t.anchor_type === "date_anchor") {
      var a = M.DATE_ANCHOR_BY_ID[t.anchor_id];
      return a ? a.label : ("? " + t.anchor_id);
    }
    var p = M.findTask(result.tasks, t.anchor_id);
    return p ? p.label : ("? " + t.anchor_id);
  }

  function categoryOptions(sel) {
    return M.CATEGORY_ORDER.map(function (k) {
      var c = M.CATEGORIES[k];
      return '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + c.num + ") " + escapeHTML(c.name) + "</option>";
    }).join("");
  }

  // Anchor dropdown for a task. The four editable date anchors sit at the top
  // (grouped under "Date anchors"); every other task follows, grouped by category
  // (optgroup labels "{num}) name") and sorted by resolved date within each group.
  // The current row is excluded. The user never picks an "anchor type" first:
  // choosing a date anchor makes it a date anchor, choosing a task makes it an item
  // anchor (derived in the model).
  function anchorIdOptions(t, resolvedTasks) {
    var html = '<optgroup label="Date anchors">';
    M.DATE_ANCHORS.forEach(function (a) {
      html += '<option value="' + a.id + '"' + (t.anchor_id === a.id ? " selected" : "") + ">" + escapeHTML(a.label) + "</option>";
    });
    html += "</optgroup>";
    M.CATEGORY_ORDER.forEach(function (k) {
      var c = M.CATEGORIES[k];
      var members = resolvedTasks.filter(function (o) { return o.category === k && o.id !== t.id; });
      if (!members.length) return;
      members.sort(function (a, b) {
        var da = a.date || "9999-99-99", db = b.date || "9999-99-99";
        return da < db ? -1 : da > db ? 1 : 0;
      });
      html += '<optgroup label="' + escapeHTML(c.num + ") " + c.name) + '">';
      members.forEach(function (o) {
        html += '<option value="' + o.id + '"' + (t.anchor_id === o.id ? " selected" : "") + ">" + escapeHTML(o.label) + "</option>";
      });
      html += "</optgroup>";
    });
    return html;
  }

  // rows come from the (possibly filtered) result; anchorAll is the full resolved
  // list used to populate the anchor dropdown regardless of the category filter.
  function renderTable(result, hl, anchorAll) {
    var allTasks = (anchorAll && anchorAll.tasks) ? anchorAll.tasks : result.tasks;
    var rows = result.tasks.slice().sort(function (a, b) {
      var da = a.date || "9999-99-99", db = b.date || "9999-99-99";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    var html = '<table class="tasks"><thead><tr>' +
      "<th>Date</th><th>Category</th><th>Label</th><th>Anchor</th>" +
      "<th>Offset (business days)</th><th>Actions</th></tr></thead><tbody>";
    rows.forEach(function (t) {
      var trCls = [];
      if (t.weekend) trCls.push("is-weekend");
      if (t.moved) trCls.push("is-moved");
      if (t.external_dependency) trCls.push("is-external"); // semantic hook only (no heavy styling)
      if (t.error) trCls.push("is-error");
      if (hl.ids[t.id]) trCls.push("is-highlight");
      var wkndMark = t.weekend ? ' <span class="wknd-mark" title="Lands on a weekend">WKND</span>' : "";
      var dateCell = t.error
        ? '<span class="err-mark" title="' + escapeHTML(t.error) + '">unresolved</span>'
        : (escapeHTML(t.date) + wkndMark);
      html += '<tr class="' + trCls.join(" ") + '" data-row-id="' + t.id + '">' +
        '<td class="date">' + dateCell + "</td>" +
        '<td><select class="edit" data-edit="category" data-id="' + t.id + '">' + categoryOptions(t.category) + "</select></td>" +
        '<td><input class="edit label" type="text" data-edit="label" data-id="' + t.id + '" value="' + escapeHTML(t.label) + '"></td>' +
        '<td><select class="edit" data-edit="anchor_id" data-id="' + t.id + '">' + anchorIdOptions(t, allTasks) + "</select></td>" +
        '<td><input class="edit num" type="number" step="1" data-edit="offset" data-id="' + t.id + '" value="' + t.offset_business_days + '"></td>' +
        '<td class="row-actions">' +
          '<button class="row-reset" data-reset="' + t.id + '">Reset row</button>' +
          '<button class="row-remove" data-remove="' + t.id + '" title="Remove this task from the model">Remove</button>' +
        "</td>" +
        "</tr>";
    });
    html += "</tbody></table>";
    el.tableview.innerHTML = html;
  }

  function renderWarnings(result) {
    var warnings = M.validate(result);
    if (!warnings.length) { el.warnings.innerHTML = ""; return; }
    el.warnings.innerHTML = warnings.map(function (w) {
      return '<div class="warn-item ' + w.level + '">' + escapeHTML(w.text) + "</div>";
    }).join("");
  }

  // ---- Details / highlight popup --------------------------------------------
  //
  // The details panel is a FLOATING popup (position: fixed, see styles.css): it is
  // rendered outside document flow so selecting a task changes only highlight
  // state, never the vertical layout of the calendar/table. When nothing is
  // selected the popup is hidden. It can be dragged by its header.
  function renderDetails(result, hl) {
    if (!state.selectedId) {
      el.details.classList.add("details-hidden");
      el.details.innerHTML = "";
      return;
    }
    var t = M.findTask(result.tasks, state.selectedId);
    if (!t) { el.details.classList.add("details-hidden"); el.details.innerHTML = ""; return; }
    el.details.classList.remove("details-hidden");
    var chainLabels = hl.chain.map(function (id) {
      var ct = M.findTask(result.tasks, id);
      return ct ? escapeHTML(ct.label) : id;
    });
    // Append the terminating date anchor to the chain for legibility.
    if (hl.dateAnchor && M.DATE_ANCHOR_BY_ID[hl.dateAnchor]) {
      chainLabels.push(escapeHTML(M.DATE_ANCHOR_BY_ID[hl.dateAnchor].label));
    }
    var chainStr = chainLabels.join(" &larr; ");
    var anchorStr = escapeHTML(anchorLabel(result, t));
    var dateStr = t.error ? ("unresolved: " + escapeHTML(t.error)) : escapeHTML(t.date) + (t.weekend ? " (weekend)" : "");
    el.details.innerHTML =
      '<div class="details-drag" id="details-drag" title="Drag to move">' +
        '<span class="details-drag-title">Selected task</span>' +
        '<button class="clear-select" id="clear-select" title="Clear highlight">Clear</button>' +
      "</div>" +
      '<div class="details-body">' +
        '<strong>' + escapeHTML(t.label) + "</strong> " +
        '<span class="details-id">[' + escapeHTML(t.id) + "]</span>" +
        "<div>Date: " + dateStr + "</div>" +
        "<div>Anchor: " + anchorStr + ", offset " + t.offset_business_days + " business days</div>" +
        "<div>Category: " + M.CATEGORIES[t.category].num + ") " + escapeHTML(M.CATEGORIES[t.category].name) + "</div>" +
        "<div>External dependency: " + (t.external_dependency ? "yes" : "no") + "</div>" +
        "<div>Anchor chain: " + chainStr + "</div>" +
      "</div>";
  }

  // ---- Legend ---------------------------------------------------------------
  //
  // Swatches use the same soft tint + left accent as the calendar pills (no
  // decorative patterns). The numeric "{n})" prefix is the non-color cue.
  function renderLegend() {
    var selecting = anyCatSelected();
    var html = "";
    M.CATEGORY_ORDER.forEach(function (k) {
      var c = M.CATEGORIES[k];
      var selected = !!state.activeCats[k];
      var active = !selecting || selected;
      var cls = "legend-item" + (active ? " active" : " inactive") + (selected ? " selected" : "");
      html += '<span class="' + cls + '" data-cat="' + k + '" role="button" tabindex="0"' +
        ' aria-pressed="' + (selected ? "true" : "false") + '"' +
        ' title="Click to filter to this category; double-click the legend to show all">' +
        '<span class="legend-swatch" style="background:' + c.tint + ";border-left-color:" + c.color + '"></span>' +
        c.num + ") " + c.name + "</span>";
    });
    el.legend.innerHTML = html;
  }

  // ---- Main render ----------------------------------------------------------
  var lastResult = null;
  function render() {
    var result = M.recalc({ anchors: state.anchors, tasks: state.model });
    lastResult = result;
    var hl = computeHighlight();

    renderWarnings(result);
    renderLegend();
    renderDetails(result, hl);

    var filtered = {
      anchors: result.anchors,
      tasks: visibleTasks(result.tasks),
      errors: result.errors
    };
    if (state.view === "calendar") {
      el.calendar.classList.remove("hidden");
      el.tableview.classList.add("hidden");
      renderCalendar(result, filtered, hl);
    } else {
      el.calendar.classList.add("hidden");
      el.tableview.classList.remove("hidden");
      renderTable(filtered, hl, result);
    }
    persist();
  }

  // ---- Field editing --------------------------------------------------------
  function setField(id, field, value) {
    var t = M.findTask(state.model, id);
    if (!t) return;
    if (field === "label") {
      t.label = String(value);
    } else if (field === "category") {
      if (M.CATEGORIES[value]) t.category = value;
    } else if (field === "offset") {
      var n = parseInt(value, 10);
      t.offset_business_days = isNaN(n) ? 0 : n;
    } else if (field === "anchor_id") {
      // Selecting an anchor also deduces anchor_type. external_dependency is a
      // stored semantic flag and is NOT changed by re-anchoring.
      t.anchor_id = String(value);
      t.anchor_type = M.deriveAnchorType(t.anchor_id);
    }
    render();
  }

  // ---- Add / remove tasks ---------------------------------------------------
  function addTask(opts) {
    var t = M.makeTask(state.model, opts || {});
    state.model = state.model.concat([t]);
    render();
    return t;
  }
  function removeTask(id) {
    if (!M.findTask(state.model, id)) return;
    state.model = M.removeTask(state.model, id);
    if (state.selectedId === id) state.selectedId = null;
    render();
  }

  // ---- Export ---------------------------------------------------------------
  function buildExport() {
    return M.exportModel(state.anchors, state.model);
  }
  function exportJSON() {
    var payload = buildExport();
    var text = JSON.stringify(payload, null, 2);
    try {
      if (typeof Blob !== "undefined" && typeof URL !== "undefined" && URL.createObjectURL) {
        var blob = new Blob([text], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "bread-calendar-model.json";
        if (document.body && document.body.appendChild) document.body.appendChild(a);
        a.click();
        if (document.body && document.body.removeChild) document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) { /* download not available in this environment */ }
    return text;
  }

  // ---- Anchor date inputs ---------------------------------------------------
  function syncAnchorInputs() {
    M.CONTROL_ANCHOR_IDS.forEach(function (id) {
      if (el.anchorInputs[id]) el.anchorInputs[id].value = state.anchors[id];
    });
  }

  // ---- Event wiring ---------------------------------------------------------
  M.CONTROL_ANCHOR_IDS.forEach(function (id) {
    var input = el.anchorInputs[id];
    if (!input) return;
    input.addEventListener("change", function () {
      state.anchors[id] = input.value;
      render();
    });
  });

  if (el.reset) el.reset.addEventListener("click", function () {
    // Reset to the CURRENTLY CHOSEN defaults (each task's default_* fields) and
    // the default date anchors; also clears the legend filter and highlight.
    state.model = M.resetToDefaults(state.model);
    state.anchors = M.defaultAnchors();
    state.activeCats = {};
    state.selectedId = null;
    syncAnchorInputs();
    render();
  });

  if (el.addTask) el.addTask.addEventListener("click", function () {
    addTask();
    if (state.view !== "table") setView("table");
  });

  if (el.makeDefaults) el.makeDefaults.addEventListener("click", function () {
    state.model = M.promoteToDefaults(state.model);
    render();
  });

  if (el.restoreShipped) el.restoreShipped.addEventListener("click", function () {
    // Discard user edits AND user-chosen defaults; return to model.js shipped.
    state.model = M.defaultModel();
    state.anchors = M.defaultAnchors();
    state.activeCats = {};
    state.selectedId = null;
    syncAnchorInputs();
    render();
  });

  if (el.exportBtn) el.exportBtn.addEventListener("click", function () { exportJSON(); });

  if (el.viewCal) el.viewCal.addEventListener("click", function () { setView("calendar"); });
  if (el.viewTable) el.viewTable.addEventListener("click", function () { setView("table"); });

  // ---- Legend category filter ----
  function toggleCat(cat) {
    if (!M.CATEGORIES[cat]) return;
    if (state.activeCats[cat]) delete state.activeCats[cat];
    else state.activeCats[cat] = true;
    render();
  }
  function showAllCats() { state.activeCats = {}; render(); }
  el.legend.addEventListener("click", function (e) {
    var item = e.target && e.target.closest ? e.target.closest("[data-cat]") : null;
    if (!item) return;
    toggleCat(item.getAttribute("data-cat"));
  });
  el.legend.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    var item = e.target && e.target.closest ? e.target.closest("[data-cat]") : null;
    if (!item) return;
    if (e.preventDefault) e.preventDefault();
    toggleCat(item.getAttribute("data-cat"));
  });
  el.legend.addEventListener("dblclick", function () { showAllCats(); });

  function setView(v) {
    state.view = v;
    el.viewCal.classList.toggle("active", v === "calendar");
    el.viewTable.classList.toggle("active", v === "table");
    render();
  }

  // Delegated table edits (label / category / anchor_id / offset).
  document.body.addEventListener("change", function (e) {
    var t = e.target;
    var field = t && t.getAttribute ? t.getAttribute("data-edit") : null;
    if (!field) return;
    var id = t.getAttribute("data-id");
    setField(id, field, t.value);
  });

  // Delegated per-row reset (restore this row to its stored defaults).
  document.body.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-reset]") : null;
    if (!btn) return;
    var id = btn.getAttribute("data-reset");
    var t = M.findTask(state.model, id);
    if (!t) return;
    t.label = t.default_label;
    t.category = t.default_category;
    t.anchor_id = t.default_anchor_id;
    t.anchor_type = M.deriveAnchorType(t.default_anchor_id);
    t.offset_business_days = t.default_offset_business_days;
    t.external_dependency = !!t.default_external_dependency;
    render();
  });

  // Delegated per-row remove (delete this task from the model).
  document.body.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-remove]") : null;
    if (!btn) return;
    removeTask(btn.getAttribute("data-remove"));
  });

  // ---- Click a calendar pill: highlight item + anchor chain, show details ---
  el.calendar.addEventListener("click", function (e) {
    var pill = e.target && e.target.closest ? e.target.closest("[data-task-id]") : null;
    if (!pill) return;
    var id = pill.getAttribute("data-task-id");
    state.selectedId = state.selectedId === id ? null : id;
    render();
  });
  document.body.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("#clear-select") : null;
    if (!btn) return;
    state.selectedId = null;
    render();
  });

  // ---- Draggable details popup ----------------------------------------------
  var popupDrag = null;
  document.body.addEventListener("mousedown", function (e) {
    var handle = e.target && e.target.closest ? e.target.closest("#details-drag") : null;
    if (!handle) return;
    if (!el.details.getBoundingClientRect) return;
    var rect = el.details.getBoundingClientRect();
    popupDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    if (e.preventDefault) e.preventDefault();
  });
  document.body.addEventListener("mousemove", function (e) {
    if (!popupDrag || !el.details.style) return;
    el.details.style.left = (e.clientX - popupDrag.dx) + "px";
    el.details.style.top = (e.clientY - popupDrag.dy) + "px";
    el.details.style.right = "auto";
    el.details.style.bottom = "auto";
  });
  document.body.addEventListener("mouseup", function () { popupDrag = null; });

  // ---- Drag/drop: drop a pill on a day cell -> new business-day offset -------
  var dragId = null;
  el.calendar.addEventListener("dragstart", function (e) {
    var pill = e.target && e.target.closest ? e.target.closest("[data-task-id]") : null;
    if (!pill) return;
    dragId = pill.getAttribute("data-task-id");
    if (e.dataTransfer) {
      try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (err) {}
    }
  });
  el.calendar.addEventListener("dragover", function (e) {
    var cell = e.target && e.target.closest ? e.target.closest("[data-date]") : null;
    if (!cell) return;
    if (e.preventDefault) e.preventDefault(); // allow drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  });
  el.calendar.addEventListener("drop", function (e) {
    var cell = e.target && e.target.closest ? e.target.closest("[data-date]") : null;
    if (!cell) return;
    if (e.preventDefault) e.preventDefault();
    var id = dragId;
    if ((!id || !M.findTask(state.model, id)) && e.dataTransfer) {
      try { id = e.dataTransfer.getData("text/plain"); } catch (err) {}
    }
    dragId = null;
    if (!id) return;
    var dropDate = cell.getAttribute("data-date");
    if (!dropDate) return;
    dropTaskOnDate(id, dropDate);
  });

  function dropTaskOnDate(id, dropDate) {
    var t = M.findTask(state.model, id);
    if (!t) return;
    var resolved = lastResult ? M.findTask(lastResult.tasks, id) : null;
    var anchorDate = resolved ? resolved.anchor_date : null;
    if (!anchorDate) return; // unresolved anchor: cannot compute a distance
    t.offset_business_days = M.businessDaysBetween(anchorDate, dropDate);
    render();
  }

  // ---- Public hooks (for tests / programmatic use) --------------------------
  window.BreadApp = {
    state: state,
    render: render,
    exportJSON: exportJSON,
    buildExport: buildExport,
    dropTaskOnDate: dropTaskOnDate,
    setField: setField,
    addTask: addTask,
    removeTask: removeTask,
    select: function (id) { state.selectedId = id; render(); }
  };

  // ---- Init ----
  syncAnchorInputs();
  setView("calendar");
})();
