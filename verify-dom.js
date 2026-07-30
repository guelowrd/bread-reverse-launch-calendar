/*
 * Browserless smoke test of the real UI render path (app.js) using a tiny DOM
 * shim, no jsdom/chromium required. Confirms app.js builds the calendar/table
 * from model.js (wave-based v3) and that editing, defaults, export, drag/drop,
 * click-highlight, the legend filter, the floating details popup, stable-across-
 * filter week trimming, the single Wave 2 date anchor, external-dependency cues,
 * and stale-/fresh-localStorage handling all work end to end.
 * Run: node verify-dom.js   (exit 0 = pass)
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var M = require("./model.js");

var pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}

var TASK_COUNT = 31;

// ---- Minimal DOM shim ------------------------------------------------------
function makeEl(id) {
  var listeners = {};
  return {
    id: id, value: "", checked: false, disabled: false, innerHTML: "",
    _cls: {},
    classList: {
      add: function (c) { this._owner._cls[c] = true; },
      remove: function (c) { delete this._owner._cls[c]; },
      toggle: function (c, on) { if (on) this._owner._cls[c] = true; else delete this._owner._cls[c]; }
    },
    appendChild: function () {}, removeChild: function () {},
    addEventListener: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    _fire: function (ev, arg) { (listeners[ev] || []).forEach(function (fn) { fn(arg || { target: {} }); }); }
  };
}

var els = {};
["wave2", "reset", "add-task", "make-defaults", "restore-shipped", "export",
 "view-cal", "view-table", "warnings", "legend", "details", "calendar", "tableview"]
  .forEach(function (id) { var e = makeEl(id); e.classList._owner = e; els[id] = e; });

var body = makeEl("body");

// A tiny in-memory localStorage so persistence can be exercised.
var storageData = {};
var localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(storageData, k) ? storageData[k] : null; },
  setItem: function (k, v) { storageData[k] = String(v); },
  removeItem: function (k) { delete storageData[k]; }
};

function makeDocument() {
  return {
    getElementById: function (id) { return els[id]; },
    body: body,
    createElement: function () { return { click: function () {}, style: {}, href: "", download: "" }; }
  };
}

function loadApp(win, doc) {
  var sandbox = { window: win, document: doc, console: console, localStorage: localStorage };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  ["model.js", "app.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), sandbox, { filename: f });
  });
  return win;
}

var window = loadApp({}, makeDocument());
var App = window.BreadApp;

// ---- Event helpers ---------------------------------------------------------
function fireEdit(field, id, value, checked) {
  body._fire("change", { target: {
    getAttribute: function (k) { return k === "data-edit" ? field : k === "data-id" ? String(id) : null; },
    value: value, checked: !!checked
  } });
}
function fireRowReset(id) {
  body._fire("click", { target: {
    closest: function (sel) { return sel === "[data-reset]" ? { getAttribute: function () { return String(id); } } : null; }
  } });
}
function fireLegendClick(cat) {
  els.legend._fire("click", { target: {
    closest: function (sel) { return sel === "[data-cat]" ? { getAttribute: function (k) { return k === "data-cat" ? cat : null; } } : null; }
  } });
}
function fireLegendDblClick() { els.legend._fire("dblclick", { target: {} }); }
function firePillClick(taskId) {
  els.calendar._fire("click", { target: {
    closest: function (sel) { return sel === "[data-task-id]" ? { getAttribute: function (k) { return k === "data-task-id" ? taskId : null; } } : null; }
  } });
}
function fireDragStart(taskId) {
  els.calendar._fire("dragstart", { dataTransfer: null, target: {
    closest: function (sel) { return sel === "[data-task-id]" ? { getAttribute: function (k) { return k === "data-task-id" ? taskId : null; } } : null; }
  } });
}
function fireDrop(dateISO) {
  els.calendar._fire("drop", { preventDefault: function () {}, dataTransfer: null, target: {
    closest: function (sel) { return sel === "[data-date]" ? { getAttribute: function (k) { return k === "data-date" ? dateISO : null; } } : null; }
  } });
}
function setWave2(iso) { els.wave2.value = iso; els.wave2._fire("change"); }
function tableRowCount() { return (els.tableview.innerHTML.match(/<tr class=/g) || []).length; }
// A row "has" a label+date if both appear in the table (robust to the EXT/WKND
// marks that decorate a date cell).
function rowHas(label, date) {
  return els.tableview.innerHTML.indexOf('<td class="date">' + date) !== -1 &&
    els.tableview.innerHTML.indexOf(label) !== -1;
}
// Day-number skeleton of the calendar (independent of pills/highlight classes).
function daySkeleton(html) {
  return (html.match(/class="daynum[^"]*">\d+</g) || []).join("|");
}
function monthHeaders(html) { return (html.match(/<h2>[^<]+<\/h2>/g) || []).join("|"); }

// ============================================================================
console.log("Initial render (defaults, calendar view)");
var cal = els.calendar.innerHTML;
check("calendar shows July 2026 header", cal.indexOf("July 2026") !== -1);
check("calendar shows August 2026 header", cal.indexOf("August 2026") !== -1);
check("calendar shows September 2026 header (Wave 6 lands 2026-09-02)", cal.indexOf("September 2026") !== -1);
check("calendar contains the single WAVE 2 anchor tag", cal.indexOf("WAVE 2") !== -1);
check("no legacy TEASER anchor tag", cal.indexOf(">TEASER<") === -1 && cal.indexOf("TEASER</span>") === -1);
check("no legacy LAUNCH anchor tag", cal.indexOf(">LAUNCH<") === -1 && cal.indexOf("LAUNCH</span>") === -1);
var todayISO = new Date().toISOString().slice(0, 10);
check("calendar highlights today's date cell", cal.indexOf('class="today" data-date="' + todayISO + '"') !== -1 || cal.indexOf('today" data-date="' + todayISO + '"') !== -1);
check("calendar renders '1) PRODUCT: Wave 2 company testing'", cal.indexOf("1) PRODUCT: Wave 2 company testing") !== -1);
check("calendar renders '0) v0.16 on devnet'", cal.indexOf("0) v0.16 on devnet") !== -1);
check("calendar renders '7) PUBLIC: Circle announcement'", cal.indexOf("7) PUBLIC: Circle announcement") !== -1);
check("calendar renders '7) PUBLIC: Wave 4 teaser + waitlist push'", cal.indexOf("7) PUBLIC: Wave 4 teaser + waitlist push") !== -1);
check("calendar renders '7) PUBLIC: Wave 6 targeted push if needed'", cal.indexOf("7) PUBLIC: Wave 6 targeted push if needed") !== -1);
check("calendar renders '5) SUPPORT: intake workflow ready'", cal.indexOf("5) SUPPORT: intake workflow ready") !== -1);
check("calendar shows an EXT badge for external dependencies", cal.indexOf(">EXT<") !== -1);
check("external pill carries the is-external class", cal.indexOf("is-external") !== -1);
check("pills are draggable", cal.indexOf('draggable="true"') !== -1);
check("day cells carry data-date drop targets", cal.indexOf("data-date=") !== -1);
check("legend populated (8 categories)", (els.legend.innerHTML.match(/legend-swatch/g) || []).length === 8);
["pat-cross", "pat-vertical", "pat-horizontal", "pat-diagonal", "pat-circle"].forEach(function (p) {
  check("legend swatch carries " + p, els.legend.innerHTML.indexOf(p) !== -1);
});
check("no warnings at defaults", els.warnings.innerHTML === "");
check("details popup hidden with nothing selected (no layout footprint)", els.details._cls["details-hidden"] === true && els.details.innerHTML === "");

console.log("\nNarrative ordering visible on the calendar (support + v0.16 before Wave 2 start)");
var resInit = M.recalc({ wave2: App.state.wave2, tasks: App.state.model });
function d(id) { return M.findTask(resInit.tasks, id).date; }
check("support intake workflow ready (2026-07-30) is before Wave 2 start (2026-07-31)", d("support_ready") < d("wave2_start"), d("support_ready") + " vs " + d("wave2_start"));
check("v0.16 on devnet (2026-07-24) is before Wave 2 start", d("v016_devnet") < d("wave2_start"));
check("v0.16 chain devnet<testnet and Wave 3 starts after testnet",
  d("v016_devnet") < d("v016_testnet") && d("wave3_start") > d("v016_testnet"));
check("Circle announcement precedes website + waitlist go-live (same or earlier)",
  d("circle_announcement") <= d("website_out") && M.findTask(resInit.tasks, "website_out").anchor_id === "circle_announcement");
check("Wave 4 (2026-08-19) lands 5bd after website go-live (2026-08-12)",
  d("wave4_start") === M.addBusinessDays(d("website_out"), 5));
check("Waves ascend: Wave2 < Wave3 < Wave4 < Wave5 < Wave6",
  d("wave2_start") < d("wave3_start") && d("wave3_start") < d("wave4_start") &&
  d("wave4_start") < d("wave5_start") && d("wave5_start") < d("wave6_start"));

console.log("\nCalendar pills carry category color/tint (not just pattern class)");
function pillFor(html, taskId) {
  var marker = 'data-task-id="' + taskId + '"';
  var at = html.indexOf(marker);
  if (at === -1) return "";
  var start = html.lastIndexOf("<div", at);
  var end = html.indexOf("</span>", at);
  return start === -1 || end === -1 ? "" : html.slice(start, end);
}
var devnetPill = pillFor(cal, "v016_devnet");
var vc = M.CATEGORIES.v016.color, vt = M.CATEGORIES.v016.tint;
check("v016 pill sets category color (" + vc + ")", devnetPill.indexOf("color:" + vc) !== -1, devnetPill.slice(0, 200));
check("v016 pill sets category tint background (" + vt + ")", devnetPill.indexOf("background-color:" + vt) !== -1, devnetPill.slice(0, 200));
check("v016 pill sets category border color", devnetPill.indexOf("border-color:" + vc) !== -1);
var testingPill = pillFor(cal, "wave2_start");
var pc = M.CATEGORIES.product.color, pt = M.CATEGORIES.product.tint;
check("product pill keeps pat-cross pattern class", testingPill.indexOf("pat-cross") !== -1, testingPill.slice(0, 200));
check("product pill sets category color (" + pc + ")", testingPill.indexOf("color:" + pc) !== -1, testingPill.slice(0, 200));
M.CATEGORY_ORDER.forEach(function (k) {
  var hasTask = M.SHIPPED_TASKS.some(function (t) { return t.category === k; });
  if (!hasTask) return;
  check("calendar applies " + k + " tint " + M.CATEGORIES[k].tint,
    cal.indexOf("background-color:" + M.CATEGORIES[k].tint) !== -1);
});
check("pill label chip keeps readable dark text", cal.indexOf('class="pill-text" style="color:#111"') !== -1);

console.log("\nOld teaser/launch-era labels are gone from the calendar");
["7) PUBLIC: teaser if GO", "7) PUBLIC: Launch announcement", "3) LAUNCH VIDEO: storyboard",
 "6) COMMS: launch final", "1) PRODUCT: date feasibility chat", "0 v0.16 on devnet"].forEach(function (l) {
  check("absent from calendar: '" + l + "'", cal.indexOf(l) === -1);
});

console.log("\nLegend numeric prefixes use '{n}) ' and the renamed website category");
var legendHTML = els.legend.innerHTML;
[["0) v0.16 dependency"], ["1) Product / go-no-go"], ["2) Stores"], ["3) Video / design"],
 ["4) Website / waitlist"], ["5) Support"], ["6) Comms"], ["7) Public moment"]].forEach(function (p) {
  check("legend shows '" + p[0] + "'", legendHTML.indexOf(p[0]) !== -1);
});

console.log("\nCalendar week trimming (default anchors: earliest task v0.16 devnet 2026-07-24)");
function monthBlock(name, nextName) {
  var s = cal.indexOf(name);
  var e = nextName ? cal.indexOf(nextName) : cal.length;
  return s === -1 ? "" : cal.slice(s, e === -1 ? cal.length : e);
}
function firstBodyRow(block) {
  var b = block.indexOf("<tbody>");
  if (b === -1) return "";
  var seg = block.slice(b);
  var start = seg.indexOf("<tr>");
  var end = seg.indexOf("</tr>");
  return start === -1 || end === -1 ? "" : seg.slice(start, end);
}
var julyBlock = monthBlock("July 2026", "August 2026");
var julyFirstRow = firstBodyRow(julyBlock);
check("July first visible row holds earliest task day 24", julyFirstRow.indexOf(">24</span>") !== -1, julyFirstRow.slice(0, 200));
check("July first row holds '0) v0.16 on devnet'", julyFirstRow.indexOf("0) v0.16 on devnet") !== -1);
check("July trims the empty Jul 12-18 week (no day 18 daynum)", julyBlock.indexOf(">18</span>") === -1);
check("July trims the empty Jul 5-11 week (no day 11 daynum)", julyBlock.indexOf(">11</span>") === -1);

console.log("\nCalendar week trimming expands when the Wave 2 date moves earlier");
setWave2("2026-07-06"); // pulls the v016 chain (devnet = wave2_start -5bd) into June
var cal2 = els.calendar.innerHTML;
check("earlier Wave 2 expands the span to include June 2026", cal2.indexOf("June 2026") !== -1);
els.reset._fire("click"); // restore defaults
check("reset returns Wave 2 date input to the default 2026-07-31", els.wave2.value === "2026-07-31");

// ---- Table view ------------------------------------------------------------
console.log("\nTable view (editable rows)");
els["view-table"]._fire("click");
var tbl = els.tableview.innerHTML;
check("table has 31 task rows", tableRowCount() === TASK_COUNT, "got " + tableRowCount());
check("table rows expose a per-row Remove control", tbl.indexOf('data-remove="') !== -1);
check("table shows resolved Wave 2 start date 2026-07-31", tbl.indexOf("2026-07-31") !== -1);
check("label is editable (input)", tbl.indexOf('data-edit="label"') !== -1);
check("category is editable (select)", tbl.indexOf('data-edit="category"') !== -1);
check("anchor is editable (select)", tbl.indexOf('data-edit="anchor_id"') !== -1);
check("offset is editable (input)", tbl.indexOf('data-edit="offset"') !== -1);
check("NO Anchor type column/control", tbl.indexOf('data-edit="anchor_type"') === -1 && tbl.indexOf("Anchor type") === -1);
check("NO editable Ext. dep control (external is a shown, not-edited, flag)", tbl.indexOf('data-edit="dep"') === -1 && tbl.indexOf('data-edit="external') === -1);
check("external rows show an EXT mark in the date cell", tbl.indexOf('class="ext-mark"') !== -1);
check("anchor dropdown uses optgroups", tbl.indexOf("<optgroup") !== -1);
check("anchor dropdown lists 'Wave 2 start' at top", tbl.indexOf(">Wave 2 start<") !== -1);
check("anchor dropdown has NO Teaser/Launch options", tbl.indexOf(">Teaser date<") === -1 && tbl.indexOf(">Launch date<") === -1);
check("offset header names business days", tbl.indexOf("Offset (business days)") !== -1);
check("row Reset button present", tbl.indexOf('data-reset="') !== -1);
check("table shows '0) Client/wallet/Epoch upgrade done' at 2026-08-07 (guardian +4bd)",
  rowHas("0) Client/wallet/Epoch upgrade done", "2026-08-07"));
check("table category select prefixes Public moment with '7)'", tbl.indexOf("7) Public moment") !== -1);
check("table category select shows renamed '4) Website / waitlist'", tbl.indexOf("4) Website / waitlist") !== -1);
// Every store submission + go-live row is present (Waves 2-5).
["wave2_stores_submit", "wave2_stores_live", "wave3_stores_submit", "wave3_stores_live",
 "wave4_stores_submit", "wave4_stores_live", "wave5_stores_submit", "wave5_stores_live"].forEach(function (id) {
  check("store row present in table: " + id, tbl.indexOf('data-row-id="' + id + '"') !== -1);
});

// ---- Editing: label / row reset --------------------------------------------
console.log("\nEdit label of a row + row reset");
fireEdit("label", "wave6_start", "7) PUBLIC: Wave 6 targeted push if needed (edited)");
check("label edit reflected in table", els.tableview.innerHTML.indexOf("(edited)") !== -1);
fireRowReset("wave6_start");
check("row reset restores label", els.tableview.innerHTML.indexOf("(edited)") === -1);

console.log("\nEdit offset of the Wave 2 anchor row -> negative offset recompute");
fireEdit("offset", "wave2_decision", "-5"); // wave2 2026-07-31 -5bd = 2026-07-24
check("negative offset edit recomputes wave2_decision to 2026-07-24", rowHas("1) PRODUCT: Wave 2 decision", "2026-07-24"));
fireRowReset("wave2_decision");
check("row reset restores wave2_decision to 2026-07-30", rowHas("1) PRODUCT: Wave 2 decision", "2026-07-30"));

console.log("\nRe-anchor a task to an item anchor via the dropdown (type deduced, external preserved)");
// support_ready is internal (external=false), item-anchored to wave2_start.
var beforeExt = App.state.model.find(function (t) { return t.id === "support_ready"; }).external_dependency;
fireEdit("anchor_id", "support_ready", "wave2_feedback_changes");
var sr = App.state.model.find(function (t) { return t.id === "support_ready"; });
check("re-anchor deduces item_anchor", sr.anchor_type === "item_anchor" && sr.anchor_id === "wave2_feedback_changes");
check("re-anchor preserves the stored external_dependency flag (not re-derived)", sr.external_dependency === beforeExt);
fireRowReset("support_ready");
check("row reset restores original anchor", App.state.model.find(function (t) { return t.id === "support_ready"; }).anchor_id === "wave2_start");

// ---- Downstream recompute through the table (item anchor) ------------------
console.log("\nItem-anchor downstream recompute (edit parent, child follows)");
// v016_testnet anchors v016_devnet; wave3_start + circle_announcement anchor testnet.
var testnetBefore = M.findTask(M.recalc({ wave2: App.state.wave2, tasks: App.state.model }).tasks, "v016_testnet").date;
fireEdit("offset", "v016_devnet", "-3"); // 2bd later than default -5
var afterParent = M.recalc({ wave2: App.state.wave2, tasks: App.state.model });
check("downstream v016_testnet followed the parent (+2bd)",
  M.findTask(afterParent.tasks, "v016_testnet").date === M.addBusinessDays(testnetBefore, 2),
  M.findTask(afterParent.tasks, "v016_testnet").date);
check("downstream wave3_start (anchored to testnet) also moved",
  M.findTask(afterParent.tasks, "wave3_start").moved === true);
fireRowReset("v016_devnet");

// ---- Cycle / invalid anchor warnings in the UI -----------------------------
console.log("\nCycle warning surfaces in the UI");
fireEdit("anchor_id", "wave2_start", "wave2_stores_live"); // wave2_start -> ... -> wave2_start
check("cycle produces an error warning", els.warnings.innerHTML.indexOf("cycle") !== -1);
check("cycle marks a row unresolved in the table", els.tableview.innerHTML.indexOf("unresolved") !== -1);
els.reset._fire("click"); // restore
els["view-table"]._fire("click");
check("reset clears the cycle (no unresolved rows)", els.tableview.innerHTML.indexOf("unresolved") === -1 && els.warnings.innerHTML === "");

// ---- Moving the Wave 2 date shifts the whole graph -------------------------
console.log("\nMoving the Wave 2 date shifts the whole downstream chain");
var beforeMove = M.recalc({ wave2: "2026-07-31", tasks: M.defaultModel() });
setWave2("2026-08-07"); // +5 business days later
els["view-table"]._fire("click");
var afterMove = M.recalc({ wave2: App.state.wave2, tasks: App.state.model });
var allShifted = M.SHIPPED_TASKS.every(function (s) {
  var b = M.findTask(beforeMove.tasks, s.id).date;
  var a = M.findTask(afterMove.tasks, s.id).date;
  return a === M.addBusinessDays(b, 5);
});
check("every task shifted +5 business days with the Wave 2 date", allShifted);
els.reset._fire("click");

// ---- Make current as defaults / reset / restore shipped --------------------
console.log("\nMake-current-as-defaults, Reset, Restore shipped");
els["view-table"]._fire("click");
fireEdit("offset", "wave6_start", "3"); // move Wave 6 out
els["make-defaults"]._fire("click");        // promote +3 as the default
fireEdit("offset", "wave6_start", "8");     // move away
els.reset._fire("click");                   // reset -> back to promoted default +3
check("reset returns to the promoted default offset (+3)",
  App.state.model.find(function (t) { return t.id === "wave6_start"; }).offset_business_days === 3);
els["restore-shipped"]._fire("click");      // discard user default -> shipped offset 1
check("restore shipped returns wave6_start to the shipped offset (+1)",
  App.state.model.find(function (t) { return t.id === "wave6_start"; }).offset_business_days === 1);

// ---- Export JSON -----------------------------------------------------------
console.log("\nExport JSON (version 3, wave2_date)");
var exportText = App.exportJSON();
var parsed = JSON.parse(exportText);
check("export is valid JSON with 31 tasks", parsed.tasks.length === TASK_COUNT);
check("export is version 3", parsed.version === 3);
check("export carries the wave2_date anchor (2026-07-31)", parsed.wave2_date === "2026-07-31");
check("export has no teaser/launch fields", !("teaser_date" in parsed) && !("launch_date" in parsed));
check("export includes per-task defaults", parsed.tasks.every(function (t) { return "default_offset_business_days" in t && "default_anchor_id" in t; }));
check("export carries external_dependency (stored) for every task", parsed.tasks.every(function (t) { return "external_dependency" in t && "default_external_dependency" in t; }));
check("export includes item anchor metadata", parsed.tasks.some(function (t) { return t.anchor_type === "item_anchor" && t.anchor_id === "circle_announcement"; }));

console.log("\nExport reflects edits + promoted defaults");
fireEdit("offset", "wave6_start", "-2");
els["make-defaults"]._fire("click");
var parsed2 = JSON.parse(App.exportJSON());
var w6 = parsed2.tasks.find(function (t) { return t.id === "wave6_start"; });
check("edited offset present in export", w6.offset_business_days === -2);
check("promoted default present in export", w6.default_offset_business_days === -2);
els["restore-shipped"]._fire("click");

// ---- localStorage persistence ----------------------------------------------
console.log("\nlocalStorage persistence across reload (schema-3 key)");
els["view-table"]._fire("click");
fireEdit("offset", "wave6_start", "4");
check("edit was written to the v3 storage key", (storageData["bread-calendar-model-v3"] || "").indexOf("wave6_start") !== -1);
check("persisted payload carries schema:3 + wave2", /"schema":3/.test(storageData["bread-calendar-model-v3"]) && /"wave2":"2026-07-31"/.test(storageData["bread-calendar-model-v3"]));
var window2 = loadApp({}, makeDocument());
els["view-table"]._fire("click");
var reloaded = JSON.parse(window2.BreadApp.exportJSON());
check("reloaded app restores the persisted edit", reloaded.tasks.find(function (t) { return t.id === "wave6_start"; }).offset_business_days === 4);
window = loadApp({}, makeDocument());
App = window.BreadApp;
els["restore-shipped"]._fire("click");

// ---- Stale / fresh localStorage handling -----------------------------------
console.log("\nFresh state (no persisted model) -> shipped defaults");
storageData = {};
var winFresh = loadApp({}, makeDocument());
check("fresh load yields the full shipped 31-task model", winFresh.BreadApp.state.model.length === TASK_COUNT);
check("fresh load uses the default Wave 2 date", winFresh.BreadApp.state.wave2 === "2026-07-31");

console.log("\nStale pre-wave (v2) state cannot mask the new defaults");
storageData = {};
storageData["bread-calendar-model-v2"] = JSON.stringify({
  teaser: "2026-08-06", launch: "2026-08-13",
  tasks: [{ id: "public_teaser", label: "7 PUBLIC: teaser if GO", category: "public",
    anchor_type: "date_anchor", anchor_id: "teaser_date", offset_business_days: 0 }]
});
var winStale = loadApp({}, makeDocument());
check("old teaser/launch (v2) state is ignored -> shipped 31-task model", winStale.BreadApp.state.model.length === TASK_COUNT);
check("no teaser-era task leaks in from v2 state", !winStale.BreadApp.state.model.some(function (t) { return t.id === "public_teaser"; }));
check("legacy v2 key is proactively removed on load", !Object.prototype.hasOwnProperty.call(storageData, "bread-calendar-model-v2"));

console.log("\nStale wrong-schema payload under the v3 key is discarded");
storageData = {};
storageData["bread-calendar-model-v3"] = JSON.stringify({ schema: 2, wave2: "2026-07-31", tasks: [{ id: "x" }] });
var winBadSchema = loadApp({}, makeDocument());
check("wrong-schema v3 payload ignored -> shipped 31-task model", winBadSchema.BreadApp.state.model.length === TASK_COUNT);

console.log("\nValid v3 state with a stale '{n} text' label is restored + normalized");
storageData = {};
storageData["bread-calendar-model-v3"] = JSON.stringify({
  schema: 3, wave2: "2026-07-31",
  tasks: [{
    id: "wave2_start", label: "1 PRODUCT: Wave 2 company testing", category: "product",
    anchor_type: "date_anchor", anchor_id: "wave2_date", offset_business_days: 0,
    external_dependency: false,
    default_label: "1 PRODUCT: Wave 2 company testing", default_category: "product",
    default_anchor_type: "date_anchor", default_anchor_id: "wave2_date",
    default_offset_business_days: 0, default_external_dependency: false
  }]
});
var winV3 = loadApp({}, makeDocument());
var restored = winV3.BreadApp.state.model.find(function (t) { return t.id === "wave2_start"; });
check("valid v3 state is restored (single persisted task)", winV3.BreadApp.state.model.length === 1 && !!restored);
check("stale '{n} text' label migrated to '{n}) text'", restored.label === "1) PRODUCT: Wave 2 company testing", restored.label);
check("stale default_label migrated too", restored.default_label === "1) PRODUCT: Wave 2 company testing", restored.default_label);
// Reset back to a clean shipped app for the interactive sections below.
storageData = {};
window = loadApp({}, makeDocument());
App = window.BreadApp;

// ---- Drag/drop -------------------------------------------------------------
console.log("\nDrag/drop recomputes offset by business-day distance");
els["view-cal"]._fire("click");
// wave2_decision: anchor Wave 2 date 2026-07-31. Drop on 2026-08-04 (Tue) -> +2bd.
fireDragStart("wave2_decision");
fireDrop("2026-08-04");
check("drag/drop set wave2_decision offset to +2 (bd distance)", App.state.model.find(function (t) { return t.id === "wave2_decision"; }).offset_business_days === 2);
els["view-table"]._fire("click");
check("dropped task now renders at 2026-08-04", rowHas("1) PRODUCT: Wave 2 decision", "2026-08-04"));
els["view-cal"]._fire("click");
// Drag a parent -> downstream item-anchored tasks recompute.
var testnetBeforeDrag = M.findTask(M.recalc({ wave2: App.state.wave2, tasks: App.state.model }).tasks, "v016_testnet").date;
fireDragStart("v016_devnet"); // drop on 2026-07-22 (Wed)
fireDrop("2026-07-22");
var afterDrag = M.recalc({ wave2: App.state.wave2, tasks: App.state.model });
check("dragged parent v016_devnet now at 2026-07-22", M.findTask(afterDrag.tasks, "v016_devnet").date === "2026-07-22");
check("downstream v016_testnet followed the dragged parent",
  M.findTask(afterDrag.tasks, "v016_testnet").date === M.addBusinessDays("2026-07-22", 8));
els["restore-shipped"]._fire("click");

// ---- Click a calendar item highlights it and its anchor chain (no layout shift) -
console.log("\nClick-highlight: item + anchor chain via a FLOATING popup (no layout shift)");
els["view-cal"]._fire("click");
var calBefore = els.calendar.innerHTML;
var skelBefore = daySkeleton(calBefore), hdrsBefore = monthHeaders(calBefore);
firePillClick("client_wallet_done"); // chain: client -> guardian -> testnet -> devnet -> wave2_start -> Wave 2 date
check("selected id recorded", App.state.selectedId === "client_wallet_done");
var calHl = els.calendar.innerHTML;
check("selected pill highlighted (hl-self)", calHl.indexOf("hl-self") !== -1);
check("anchor pills highlighted (hl-anchor)", calHl.indexOf("hl-anchor") !== -1);
check("terminating Wave 2 cell highlighted (hl-anchor-cell)", calHl.indexOf("hl-anchor-cell") !== -1);
check("selecting did NOT change the calendar month/week structure (no layout shift)",
  daySkeleton(calHl) === skelBefore && monthHeaders(calHl) === hdrsBefore);
check("details popup is shown (not hidden) and names the selected task",
  els.details._cls["details-hidden"] !== true && els.details.innerHTML.indexOf("0) Client/wallet/Epoch upgrade done") !== -1);
check("details popup uses a floating drag handle, not an inline layout panel",
  els.details.innerHTML.indexOf('id="details-drag"') !== -1);
check("details popup shows the anchor chain terminating at 'Wave 2 start'",
  els.details.innerHTML.indexOf("Anchor chain") !== -1 && els.details.innerHTML.indexOf("Wave 2 start") !== -1);
check("details popup shows the external-dependency flag", els.details.innerHTML.indexOf("External dependency: yes") !== -1);
firePillClick("client_wallet_done");
check("re-click clears the selection", App.state.selectedId === null);
check("highlight removed from calendar", els.calendar.innerHTML.indexOf("hl-self") === -1);
check("details popup hidden again after clearing", els.details._cls["details-hidden"] === true);

// ---- Legend category filter ------------------------------------------------
els["restore-shipped"]._fire("click");
els["view-table"]._fire("click");
console.log("\nLegend filter: show-all / single / add / remove / double-click reset");
check("all 31 rows visible before any legend click", tableRowCount() === TASK_COUNT, "got " + tableRowCount());
var legend0 = els.legend.innerHTML;
check("legend items carry data-cat", (legend0.match(/data-cat=/g) || []).length === 8);
check("no selection -> every item active", (legend0.match(/legend-item active/g) || []).length === 8);
check("no selection -> nothing inactive", legend0.indexOf("legend-item inactive") === -1);

var publicCount = M.SHIPPED_TASKS.filter(function (t) { return t.category === "public"; }).length; // 5
var productCount = M.SHIPPED_TASKS.filter(function (t) { return t.category === "product"; }).length; // 8
fireLegendClick("public");
check("only the public rows remain (" + publicCount + ")", tableRowCount() === publicCount, "got " + tableRowCount());
check("public task still shown", els.tableview.innerHTML.indexOf('data-row-id="wave4_start"') !== -1);
check("a non-public task row hidden", els.tableview.innerHTML.indexOf('data-row-id="wave2_start"') === -1);
var legPublic = els.legend.innerHTML;
check("selected category aria-pressed=true", legPublic.indexOf('data-cat="public" role="button" tabindex="0" aria-pressed="true"') !== -1);
check("7 unselected categories inactive", (legPublic.match(/legend-item inactive/g) || []).length === 7);

fireLegendClick("product");
check("public + product rows shown (" + (publicCount + productCount) + ")", tableRowCount() === publicCount + productCount, "got " + tableRowCount());
fireLegendClick("public");
check("only product rows remain (" + productCount + ")", tableRowCount() === productCount, "got " + tableRowCount());
fireLegendDblClick();
check("double-click resets to all 31 rows", tableRowCount() === TASK_COUNT, "got " + tableRowCount());

console.log("\nLegend filter also filters the calendar (pills only) without trimming weeks");
els["view-cal"]._fire("click");
var calUnfiltered = els.calendar.innerHTML;
var skelUnfiltered = daySkeleton(calUnfiltered), hdrsUnfiltered = monthHeaders(calUnfiltered);
fireLegendClick("public");
var calFiltered = els.calendar.innerHTML;
check("calendar shows the selected category pill", calFiltered.indexOf("7) PUBLIC: Wave 4 teaser + waitlist push") !== -1);
check("calendar hides a non-selected category pill", calFiltered.indexOf("5) SUPPORT: intake workflow ready") === -1);
check("calendar still renders the WAVE 2 anchor while filtered", calFiltered.indexOf("WAVE 2") !== -1);
check("filtering a category does NOT change the month/week structure (stable trimming)",
  daySkeleton(calFiltered) === skelUnfiltered && monthHeaders(calFiltered) === hdrsUnfiltered);
fireLegendClick("v016");
check("adding another category still does NOT change the month/week structure",
  daySkeleton(els.calendar.innerHTML) === skelUnfiltered && monthHeaders(els.calendar.innerHTML) === hdrsUnfiltered);
els["restore-shipped"]._fire("click");

// ---- Add / remove tasks through the UI -------------------------------------
console.log("\nAdd / remove tasks from the table view");
function fireRemove(id) {
  body._fire("click", { target: {
    closest: function (sel) { return sel === "[data-remove]" ? { getAttribute: function () { return String(id); } } : null; }
  } });
}
els["restore-shipped"]._fire("click");
els["view-table"]._fire("click");
check("starts at 31 rows before add", tableRowCount() === TASK_COUNT, "got " + tableRowCount());
els["add-task"]._fire("click");
check("Add task grows the table to 32 rows", tableRowCount() === TASK_COUNT + 1, "got " + tableRowCount());
var addedId = App.state.model[App.state.model.length - 1].id;
check("added task has a '{n}) ' default label", /^\d+\) /.test(App.state.model[App.state.model.length - 1].label));
check("added task defaults to product/Wave 2 date/offset 0",
  (function () { var t = App.state.model[App.state.model.length - 1]; return t.category === "product" && t.anchor_id === "wave2_date" && t.offset_business_days === 0; })());
check("added task is present in export", JSON.parse(App.exportJSON()).tasks.some(function (t) { return t.id === addedId; }));
check("added task is persisted to localStorage", (storageData["bread-calendar-model-v3"] || "").indexOf(addedId) !== -1);
fireRemove(addedId);
check("Remove drops the row back to 31", tableRowCount() === TASK_COUNT, "got " + tableRowCount());
check("removed task is gone from the model", !App.state.model.some(function (t) { return t.id === addedId; }));
// Remove a shipped task that has dependents -> dependents re-anchor (no dangling).
// wave2_start has dependents (support_ready, v016_devnet, wave2_feedback_changes);
// its own anchor is the Wave 2 date, so dependents re-anchor to wave2_date.
fireRemove("wave2_start");
check("removing a shipped task with dependents drops it (30 rows)", tableRowCount() === TASK_COUNT - 1, "got " + tableRowCount());
check("dependent re-anchored to the removed task's anchor (Wave 2 date)",
  App.state.model.find(function (t) { return t.id === "wave2_feedback_changes"; }).anchor_id === "wave2_date");
check("no unresolved warnings after removal", els.warnings.innerHTML.indexOf("unresolved") === -1);
els["restore-shipped"]._fire("click");
els["view-table"]._fire("click");
check("Restore shipped defaults brings back the full 31-task model", tableRowCount() === TASK_COUNT && !!App.state.model.find(function (t) { return t.id === "wave2_start"; }));

// ---- Static HTML checks ----------------------------------------------------
console.log("\nindex.html copy checks");
var htmlSrc = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
check("title is exactly 'Bread Reverse Launch Calendar'", htmlSrc.indexOf("<title>Bread Reverse Launch Calendar</title>") !== -1);
check("h1 is exactly 'Bread Reverse Launch Calendar'", htmlSrc.indexOf("<h1>Bread Reverse Launch Calendar</h1>") !== -1);
check("single Wave 2 date input present", htmlSrc.indexOf('id="wave2"') !== -1 && htmlSrc.indexOf("Wave 2 start") !== -1);
check("no teaser input", htmlSrc.indexOf('id="teaser"') === -1);
check("no launch input", htmlSrc.indexOf('id="launch"') === -1);
check("export control present", htmlSrc.indexOf('id="export"') !== -1);
check("add-task control present", htmlSrc.indexOf('id="add-task"') !== -1);
check("floating details popup present + starts hidden", htmlSrc.indexOf('id="details"') !== -1 && htmlSrc.indexOf("details-hidden") !== -1);

// ---- Static source hygiene checks (grep-style) -----------------------------
console.log("\nSource hygiene: teaser/launch concepts are gone from app.js");
var appSrc = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
var cssSrc = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
check("app.js: no DEFAULT_TEASER/DEFAULT_LAUNCH usage", appSrc.indexOf("DEFAULT_TEASER") === -1 && appSrc.indexOf("DEFAULT_LAUNCH") === -1);
check("app.js: no TEASER_ANCHOR/LAUNCH_ANCHOR usage", appSrc.indexOf("TEASER_ANCHOR") === -1 && appSrc.indexOf("LAUNCH_ANCHOR") === -1);
check("app.js: no deriveExternalDependency call (external is stored)", appSrc.indexOf("deriveExternalDependency") === -1);
check("app.js: uses the Wave 2 date anchor (DEFAULT_WAVE2 + wave2_date)", appSrc.indexOf("DEFAULT_WAVE2") !== -1 && appSrc.indexOf("wave2_date") !== -1);
check("styles.css: details popup is position:fixed (floating)", /\.details\s*\{[^}]*position:\s*fixed/.test(cssSrc));
check("styles.css: has an external-dependency cue", cssSrc.indexOf(".badge.ext") !== -1);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
