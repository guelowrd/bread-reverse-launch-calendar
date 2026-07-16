/* Bread reverse launch calendar: browser UI. Uses window.BreadModel (model.js). */
(function () {
  "use strict";
  var M = window.BreadModel;
  var STORAGE_KEY = "bread-calendar-model-v2";

  // ---- Persistence (localStorage) -------------------------------------------
  // The app is a static local page: source files cannot be written from the
  // browser. So user edits (labels, anchors, offsets, categories, external-dep
  // flags, AND user-chosen defaults) live in localStorage. Clearing storage or
  // "Restore shipped defaults" returns to the model shipped in model.js.
  function hasStorage() {
    try { return typeof localStorage !== "undefined" && localStorage !== null; }
    catch (e) { return false; }
  }
  function loadPersisted() {
    if (!hasStorage()) return null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.tasks)) return null;
      return obj;
    } catch (e) { return null; }
  }
  function persist() {
    if (!hasStorage()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        teaser: state.teaser,
        launch: state.launch,
        tasks: state.model
      }));
    } catch (e) { /* ignore quota / disabled storage */ }
  }

  var persisted = loadPersisted();
  var state = {
    teaser: (persisted && persisted.teaser) || M.DEFAULT_TEASER,
    launch: (persisted && persisted.launch) || M.DEFAULT_LAUNCH,
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
    teaser: document.getElementById("teaser"),
    launch: document.getElementById("launch"),
    reset: document.getElementById("reset"),
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

  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function patternClass(cat) {
    switch (M.CATEGORIES[cat].pattern) {
      case "cross": return "pat-cross";
      case "vertical": return "pat-vertical";
      case "horizontal": return "pat-horizontal";
      case "diagonal": return "pat-diagonal";
      case "circle": return "pat-circle";
      default: return "";
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---- Highlight computation (click an item -> highlight it + its anchors) ---
  // Returns { ids: {id:true}, dateAnchor: "teaser"|"launch"|null, chain: [...] }.
  function computeHighlight() {
    var out = { ids: {}, dateAnchor: null, chain: [] };
    if (!state.selectedId) return out;
    var chain = M.anchorChain(state.model, state.selectedId);
    out.chain = chain;
    chain.forEach(function (id) { out.ids[id] = true; });
    if (chain.length) {
      var last = M.findTask(state.model, chain[chain.length - 1]);
      if (last && last.anchor_type === "date_anchor") {
        out.dateAnchor = last.anchor_id === M.TEASER_ANCHOR ? "teaser" : "launch";
      }
    }
    return out;
  }

  // ---- Task pill (calendar cell) --------------------------------------------
  function pillHTML(t, hl) {
    var cat = M.CATEGORIES[t.category];
    var pat = patternClass(t.category);
    var badges = "";
    if (t.weekend) badges += '<span class="badge weekend" title="Lands on a weekend">WKND</span>';
    if (t.moved) badges += '<span class="badge moved" title="Moved from default ' + (t.default_date || "?") + '">moved</span>';
    var cls = "pill " + pat;
    if (hl && hl.ids[t.id]) cls += (t.id === state.selectedId ? " hl-self" : " hl-anchor");
    // Category tint/fill + border color so each pill visually matches its legend
    // entry. `color` also drives `currentColor` for the pattern overlay, so the
    // hatch/stripe/cross/circle cue renders in the category color over the tint.
    // Longhand `background-color` (not the `background` shorthand) is used so the
    // pattern class's `background-image` survives the inline style. The label sits
    // on its own translucent white chip (.pill-text) so text stays readable, and
    // the DEP/WKND/moved badges keep their own backgrounds for legibility.
    var style = "color:" + cat.color + ";background-color:" + cat.tint +
      ";border-color:" + cat.color;
    return (
      '<div class="' + cls + '" draggable="true" style="' + style + '"' +
        ' data-task-id="' + t.id + '" data-date="' + t.date + '"' +
        ' title="' + escapeHTML(t.label) + ' (' + t.date + ')">' +
        '<span class="pill-text" style="color:#111">' + escapeHTML(t.label) + "</span>" +
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

  // Inclusive month span covering all resolved task dates + both anchors.
  function monthSpan(result) {
    var all = result.tasks.filter(function (t) { return t.date; }).map(function (t) { return t.date; });
    all = all.concat([result.teaser, result.launch]);
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
  // the month/week structure stable across filter changes: toggling a category
  // only hides/shows pills inside the already-fixed week rows.
  function renderCalendar(fullResult, visResult, hl) {
    var contentByDate = indexByDate(fullResult.tasks); // stable week structure
    var pillByDate = indexByDate(visResult.tasks);     // filtered pills
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
      // (a task pill or a teaser/launch anchor). Leading/trailing empty rows are
      // trimmed dynamically so the visible span follows the current dates.
      var weekRows = [];
      for (var row = 0; row < 6; row++) {
        var rowHTML = "<tr>";
        var rowHasContent = false;
        for (var col = 0; col < 7; col++) {
          var iso = M.toISO(cursor);
          var inMonth = cursor.getUTCMonth() === mo.month;
          var we = (col === 0 || col === 6);
          var isTeaser = iso === fullResult.teaser;
          var isLaunch = iso === fullResult.launch;
          // Week content is decided from the FULL set so filters never trim weeks.
          var hasContent = inMonth && !!contentByDate[iso];
          // Pills are drawn from the VISIBLE (filtered) set.
          var hasTasks = inMonth && !!pillByDate[iso];
          if (inMonth && (isTeaser || isLaunch || hasContent)) rowHasContent = true;
          var cls = [];
          if (we) cls.push("we");
          if (!inMonth) cls.push("other");
          if (inMonth && ((isTeaser && hl.dateAnchor === "teaser") || (isLaunch && hl.dateAnchor === "launch"))) cls.push("hl-anchor-cell");
          rowHTML += '<td class="' + cls.join(" ") + '" data-date="' + iso + '">';
          var dayCls = "daynum" + ((isTeaser || isLaunch) && inMonth ? " anchor" : "");
          rowHTML += '<span class="' + dayCls + '">' + cursor.getUTCDate() + "</span>";
          if (inMonth && isTeaser) rowHTML += '<span class="anchor-tag">TEASER</span>';
          if (inMonth && isLaunch) rowHTML += '<span class="anchor-tag">LAUNCH</span>';
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
      return t.anchor_id === M.TEASER_ANCHOR ? "teaser date" : "launch date";
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

  // Anchor dropdown for a task. Teaser/launch dates always sit at the top; every
  // other task follows, grouped by category (optgroup labels "{num}) name") and
  // sorted by resolved date within each group. The current row is excluded. The
  // user never picks an "anchor type" first: choosing teaser/launch makes it a
  // date anchor, choosing a task makes it an item anchor (derived in the model).
  // `resolvedTasks` is the FULL resolved task list (so the choices are complete
  // and carry dates for sorting even under a category filter).
  function anchorIdOptions(t, resolvedTasks) {
    var html = "";
    html += '<optgroup label="Dates">' +
      '<option value="teaser_date"' + (t.anchor_id === "teaser_date" ? " selected" : "") + ">Teaser date</option>" +
      '<option value="launch_date"' + (t.anchor_id === "launch_date" ? " selected" : "") + ">Launch date</option>" +
      "</optgroup>";
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
      "<th>Offset (business days)</th><th></th></tr></thead><tbody>";
    rows.forEach(function (t) {
      var trCls = [];
      if (t.weekend) trCls.push("is-weekend");
      if (t.moved) trCls.push("is-moved");
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
        '<td><button class="row-reset" data-reset="' + t.id + '">Reset row</button></td>' +
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
  // The details panel is a FLOATING popup (position: fixed, see styles.css): it
  // is rendered outside document flow so selecting a task changes only highlight
  // state, never the vertical layout of the calendar/table. When nothing is
  // selected the popup is hidden (and reserves no space). It can be dragged by
  // its header. Anchor-type and external-dependency copy are intentionally
  // omitted (both are now deduced, not shown).
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
    if (hl.dateAnchor) chainLabels.push(hl.dateAnchor + " date");
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
        "<div>Anchor chain: " + chainStr + "</div>" +
      "</div>";
  }

  // ---- Legend ---------------------------------------------------------------
  function renderLegend() {
    var selecting = anyCatSelected();
    var html = "";
    M.CATEGORY_ORDER.forEach(function (k) {
      var c = M.CATEGORIES[k];
      var pat = patternClass(k);
      var selected = !!state.activeCats[k];
      var active = !selecting || selected;
      var cls = "legend-item" + (active ? " active" : " inactive") + (selected ? " selected" : "");
      html += '<span class="' + cls + '" data-cat="' + k + '" role="button" tabindex="0"' +
        ' aria-pressed="' + (selected ? "true" : "false") + '"' +
        ' title="Click to filter to this category; double-click the legend to show all">' +
        '<span class="legend-swatch ' + pat + '" style="color:' + c.color + ";background:" + c.tint + ";border-color:" + c.color + '"></span>' +
        c.num + ") " + c.name + "</span>";
    });
    el.legend.innerHTML = html;
  }

  // ---- Main render ----------------------------------------------------------
  var lastResult = null;
  function render() {
    var result = M.recalc({ teaser: state.teaser, launch: state.launch, tasks: state.model });
    lastResult = result;
    var hl = computeHighlight();

    renderWarnings(result);
    renderLegend();
    renderDetails(result, hl);

    var filtered = {
      teaser: result.teaser,
      launch: result.launch,
      tasks: visibleTasks(result.tasks),
      errors: result.errors
    };
    if (state.view === "calendar") {
      el.calendar.classList.remove("hidden");
      el.tableview.classList.add("hidden");
      // full result drives the stable month/week structure; filtered drives pills.
      renderCalendar(result, filtered, hl);
    } else {
      el.calendar.classList.add("hidden");
      el.tableview.classList.remove("hidden");
      // full result (result) populates the anchor dropdown regardless of filter.
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
      // Selecting an anchor also deduces anchor_type and external_dependency.
      t.anchor_id = String(value);
      t.anchor_type = M.deriveAnchorType(t.anchor_id);
      t.external_dependency = M.deriveExternalDependency(t.anchor_id);
    }
    render();
  }

  // ---- Export ---------------------------------------------------------------
  function buildExport() {
    var payload = M.exportModel(state.teaser, state.launch, state.model);
    return payload;
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

  // ---- Event wiring ---------------------------------------------------------
  if (el.teaser) el.teaser.addEventListener("change", function () { state.teaser = el.teaser.value; render(); });
  if (el.launch) el.launch.addEventListener("change", function () { state.launch = el.launch.value; render(); });

  if (el.reset) el.reset.addEventListener("click", function () {
    // Reset to the CURRENTLY CHOSEN defaults (each task's default_* fields) and
    // the default date anchors; also clears the legend filter and highlight.
    state.model = M.resetToDefaults(state.model);
    state.teaser = M.DEFAULT_TEASER;
    state.launch = M.DEFAULT_LAUNCH;
    state.activeCats = {};
    state.selectedId = null;
    if (el.teaser) el.teaser.value = state.teaser;
    if (el.launch) el.launch.value = state.launch;
    render();
  });

  if (el.makeDefaults) el.makeDefaults.addEventListener("click", function () {
    // Promote current values to defaults so future Reset/export use them.
    state.model = M.promoteToDefaults(state.model);
    render();
  });

  if (el.restoreShipped) el.restoreShipped.addEventListener("click", function () {
    // Discard user edits AND user-chosen defaults; return to model.js shipped.
    state.model = M.defaultModel();
    state.teaser = M.DEFAULT_TEASER;
    state.launch = M.DEFAULT_LAUNCH;
    state.activeCats = {};
    state.selectedId = null;
    if (el.teaser) el.teaser.value = state.teaser;
    if (el.launch) el.launch.value = state.launch;
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

  // Delegated table edits (label / category / anchor_id / offset). anchor_type and
  // external_dependency are deduced from anchor_id, so they are not edited here.
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
    t.external_dependency = M.deriveExternalDependency(t.default_anchor_id);
    render();
  });

  // ---- Click a calendar pill: highlight item + anchor chain, show details ---
  el.calendar.addEventListener("click", function (e) {
    var pill = e.target && e.target.closest ? e.target.closest("[data-task-id]") : null;
    if (!pill) return;
    var id = pill.getAttribute("data-task-id");
    state.selectedId = state.selectedId === id ? null : id;
    render();
  });
  // Clear-highlight button lives in the details popup.
  document.body.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("#clear-select") : null;
    if (!btn) return;
    state.selectedId = null;
    render();
  });

  // ---- Draggable details popup ----------------------------------------------
  // The popup is position:fixed (out of document flow). Dragging its header moves
  // it via inline left/top so it never obstructs the selected item/chain. Guarded
  // so it is inert under the headless DOM shim used by the Node smoke tests.
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
  // The task keeps its current anchor; its offset becomes the business-day
  // distance from the anchor's resolved date to the drop date. Item-anchored
  // downstream tasks then recompute from the new position.
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
    select: function (id) { state.selectedId = id; render(); }
  };

  // ---- Init ----
  if (el.teaser) el.teaser.value = state.teaser;
  if (el.launch) el.launch.value = state.launch;
  setView("calendar");
})();
