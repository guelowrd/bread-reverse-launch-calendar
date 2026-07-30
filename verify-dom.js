/*
 * Browserless smoke test of the real UI render path (app.js) using a tiny DOM
 * shim, no jsdom/chromium required. Confirms app.js builds the calendar/table
 * from model.js (wave-based v3, four date anchors) and that editing, defaults,
 * export, drag/drop, click-highlight, the legend filter, the floating details
 * popup, stable-across-filter week trimming, the four editable date anchors, the
 * streamlined (no-EXT-badge, no-pattern) card treatment, and stale-/fresh-
 * localStorage handling (new storage key + model revision) all work end to end.
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

var TASK_COUNT = 33;
var STORAGE_KEY = "bread-calendar-model-v3r2";

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
["wave2_date", "v016_devnet_date", "v016_testnet_date", "circle_announcement_date",
 "reset", "add-task", "make-defaults", "restore-shipped", "export",
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
function setAnchor(id, iso) { els[id].value = iso; els[id]._fire("change"); }
function tableRowCount() { return (els.tableview.innerHTML.match(/<tr class=/g) || []).length; }
// A row "has" a label+date if both appear in the table (robust to the WKND
// mark that decorates a date cell).
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
check("calendar shows September 2026 header (Wave 5 store-live lands 2026-09-01)", cal.indexOf("September 2026") !== -1);
check("calendar renders the WAVE 2 anchor chip", cal.indexOf("WAVE 2") !== -1);
check("calendar renders the DEVNET anchor chip", cal.indexOf("DEVNET") !== -1);
check("calendar renders the TESTNET anchor chip", cal.indexOf("TESTNET") !== -1);
check("calendar renders the CIRCLE anchor chip", cal.indexOf("CIRCLE") !== -1);
check("no legacy TEASER anchor tag", cal.indexOf(">TEASER<") === -1 && cal.indexOf("TEASER</span>") === -1);
check("no legacy LAUNCH anchor tag", cal.indexOf(">LAUNCH<") === -1 && cal.indexOf("LAUNCH</span>") === -1);
var todayISO = new Date().toISOString().slice(0, 10);
check("calendar highlights today's date cell", cal.indexOf('class="today" data-date="' + todayISO + '"') !== -1 || cal.indexOf('today" data-date="' + todayISO + '"') !== -1);
check("calendar renders '1) PRODUCT: Wave 2 company-wide testing'", cal.indexOf("1) PRODUCT: Wave 2 company-wide testing") !== -1);
check("calendar renders '0) v0.16 on devnet'", cal.indexOf("0) v0.16 on devnet") !== -1);
check("calendar renders '7) PUBLIC: Circle announcement'", cal.indexOf("7) PUBLIC: Circle announcement") !== -1);
check("calendar renders '1) PRODUCT: Wave 3 decision'", cal.indexOf("1) PRODUCT: Wave 3 decision") !== -1);
check("calendar renders '1) PRODUCT: Wave 5 decision'", cal.indexOf("1) PRODUCT: Wave 5 decision") !== -1);
check("calendar renders '5) SUPPORT: intake workflow ready'", cal.indexOf("5) SUPPORT: intake workflow ready") !== -1);
check("no legacy Wave 6 label on the calendar", cal.indexOf("Wave 6") === -1);
check("pills are draggable", cal.indexOf('draggable="true"') !== -1);
check("day cells carry data-date drop targets", cal.indexOf("data-date=") !== -1);
check("legend populated (8 categories)", (els.legend.innerHTML.match(/legend-swatch/g) || []).length === 8);
check("no warnings at defaults", els.warnings.innerHTML === "");
check("details popup hidden with nothing selected (no layout footprint)", els.details._cls["details-hidden"] === true && els.details.innerHTML === "");

console.log("\nStreamlined dashboard cleanup: no EXT badge, no decorative patterns");
check("no EXT badge text anywhere on the calendar", cal.indexOf(">EXT<") === -1 && cal.indexOf("badge ext") === -1);
check("no dashed/heavy external pill class on the calendar", cal.indexOf("is-external") === -1);
["pat-cross", "pat-vertical", "pat-horizontal", "pat-diagonal", "pat-circle"].forEach(function (p) {
  check("no decorative pattern class '" + p + "' on the calendar", cal.indexOf(p) === -1);
  check("no decorative pattern class '" + p + "' in the legend", els.legend.innerHTML.indexOf(p) === -1);
});
check("pills carry a category left-accent (border-left-color) treatment", cal.indexOf("border-left-color:") !== -1);
check("pills carry a data-category hook", cal.indexOf("data-category=") !== -1);
check("legend swatches use the soft-tint + left-accent treatment", els.legend.innerHTML.indexOf("border-left-color:") !== -1);

console.log("\nNarrative ordering visible on the calendar (support + v0.16 before Wave 2 start)");
var resInit = M.recalc({ anchors: App.state.anchors, tasks: App.state.model });
function d(id) { return M.findTask(resInit.tasks, id).date; }
check("support intake workflow ready (2026-07-30) is before Wave 2 start (2026-07-31)", d("support_ready") < d("wave2_start"), d("support_ready") + " vs " + d("wave2_start"));
check("v0.16 on devnet (2026-07-17) is before Wave 2 start", d("v016_devnet") < d("wave2_start"));
check("Wave 3 starts after Wave 2 start (wave3_start = wave2_start +6bd)",
  d("wave3_start") > d("wave2_start") && d("wave3_start") === M.addBusinessDays(d("wave2_start"), 6));
check("Circle announcement precedes website + waitlist go-live (same or earlier)",
  d("circle_announcement") <= d("website_out") && M.findTask(resInit.tasks, "website_out").anchor_id === "circle_announcement");
check("waitlist QA is 1bd before the website goes live",
  d("waitlist_qa") === M.addBusinessDays(d("website_out"), -1));
check("Waves ascend: Wave2 < Wave3 < Wave4 < Wave5",
  d("wave2_start") < d("wave3_start") && d("wave3_start") < d("wave4_start") && d("wave4_start") < d("wave5_start"));

console.log("\nCalendar pills carry category tint + left accent (not just a class)");
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
check("v016 pill sets category tint background (" + vt + ")", devnetPill.indexOf("background-color:" + vt) !== -1, devnetPill.slice(0, 200));
check("v016 pill sets category left accent (" + vc + ")", devnetPill.indexOf("border-left-color:" + vc) !== -1, devnetPill.slice(0, 200));
M.CATEGORY_ORDER.forEach(function (k) {
  var hasTask = M.SHIPPED_TASKS.some(function (t) { return t.category === k; });
  if (!hasTask) return;
  check("calendar applies " + k + " tint " + M.CATEGORIES[k].tint,
    cal.indexOf("background-color:" + M.CATEGORIES[k].tint) !== -1);
});
check("pill label uses the .pill-text chip", cal.indexOf('class="pill-text"') !== -1);

console.log("\nLegend numeric prefixes use '{n}) ' and the renamed website category");
var legendHTML = els.legend.innerHTML;
[["0) v0.16 dependency"], ["1) Product / go-no-go"], ["2) Stores"], ["3) Video / design"],
 ["4) Website / waitlist"], ["5) Support"], ["6) Comms"], ["7) Public moment"]].forEach(function (p) {
  check("legend shows '" + p[0] + "'", legendHTML.indexOf(p[0]) !== -1);
});

console.log("\nCalendar week trimming (default anchors: earliest content Jul 17 devnet)");
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
check("July first visible row holds earliest content day 17", julyFirstRow.indexOf(">17</span>") !== -1, julyFirstRow.slice(0, 200));
check("July first row holds '0) v0.16 on devnet'", julyFirstRow.indexOf("0) v0.16 on devnet") !== -1);
check("July trims the empty Jul 5-11 week (no day 11 daynum)", julyBlock.indexOf(">11</span>") === -1);
check("July trims the empty Jul 1-4 span (no day 4 daynum)", julyBlock.indexOf(">4</span>") === -1);

console.log("\nCalendar week trimming expands when a date anchor moves earlier");
setAnchor("v016_devnet_date", "2026-06-16"); // pulls the isolated devnet task into June
var cal2 = els.calendar.innerHTML;
check("earlier v0.16 devnet anchor expands the span to include June 2026", cal2.indexOf("June 2026") !== -1);
els.reset._fire("click"); // restore defaults
check("reset returns the Wave 2 date input to the default 2026-07-31", els.wave2_date.value === "2026-07-31");
check("reset returns the v0.16 devnet input to the default 2026-07-17", els.v016_devnet_date.value === "2026-07-17");

// ---- Table view ------------------------------------------------------------
console.log("\nTable view (editable rows)");
els["view-table"]._fire("click");
var tbl = els.tableview.innerHTML;
check("table has 33 task rows", tableRowCount() === TASK_COUNT, "got " + tableRowCount());
check("table rows expose a per-row Remove control", tbl.indexOf('data-remove="') !== -1);
check("table shows resolved Wave 2 start date 2026-07-31", tbl.indexOf("2026-07-31") !== -1);
check("label is editable (input)", tbl.indexOf('data-edit="label"') !== -1);
check("category is editable (select)", tbl.indexOf('data-edit="category"') !== -1);
check("anchor is editable (select)", tbl.indexOf('data-edit="anchor_id"') !== -1);
check("offset is editable (input)", tbl.indexOf('data-edit="offset"') !== -1);
check("NO Anchor type column/control", tbl.indexOf('data-edit="anchor_type"') === -1 && tbl.indexOf("Anchor type") === -1);
check("NO editable Ext. dep control (external is a stored, not-edited, flag)", tbl.indexOf('data-edit="dep"') === -1 && tbl.indexOf('data-edit="external') === -1);
check("NO EXT mark/badge in the table (streamlined cleanup)", tbl.indexOf('class="ext-mark"') === -1 && tbl.indexOf(">EXT<") === -1);
check("anchor dropdown uses optgroups", tbl.indexOf("<optgroup") !== -1);
check("anchor dropdown groups the four date anchors under 'Date anchors'", tbl.indexOf('<optgroup label="Date anchors">') !== -1);
check("anchor dropdown lists all four date anchor labels",
  tbl.indexOf(">Wave 2 start<") !== -1 && tbl.indexOf(">v0.16 devnet<") !== -1 &&
  tbl.indexOf(">v0.16 testnet<") !== -1 && tbl.indexOf(">Circle announcement<") !== -1);
check("anchor dropdown has NO Teaser/Launch options", tbl.indexOf(">Teaser date<") === -1 && tbl.indexOf(">Launch date<") === -1);
check("offset header names business days", tbl.indexOf("Offset (business days)") !== -1);
check("row Reset button present", tbl.indexOf('data-reset="') !== -1);
check("table shows '0) Client/wallet/Epoch upgrade done' at 2026-08-07 (guardian +4bd)",
  rowHas("0) Client/wallet/Epoch upgrade done", "2026-08-07"));
check("table shows '1) PRODUCT: Wave 4 decision' at 2026-08-17",
  rowHas("1) PRODUCT: Wave 4 decision", "2026-08-17"));
check("table category select prefixes Public moment with '7)'", tbl.indexOf("7) Public moment") !== -1);
check("table category select shows renamed '4) Website / waitlist'", tbl.indexOf("4) Website / waitlist") !== -1);
["wave2_stores_submit", "wave2_stores_live", "wave3_stores_submit", "wave3_stores_live",
 "wave4_stores_submit", "wave4_stores_live", "wave5_stores_submit", "wave5_stores_live"].forEach(function (id) {
  check("store row present in table: " + id, tbl.indexOf('data-row-id="' + id + '"') !== -1);
});
["wave3_decision", "wave4_decision", "wave5_decision"].forEach(function (id) {
  check("decision row present in table: " + id, tbl.indexOf('data-row-id="' + id + '"') !== -1);
});
check("no wave6_start row in the table", tbl.indexOf('data-row-id="wave6_start"') === -1);

// ---- Editing: label / row reset --------------------------------------------
console.log("\nEdit label of a row + row reset");
fireEdit("label", "wave5_stores_live", "2) STORES: post-Wave-5 build live (edited)");
check("label edit reflected in table", els.tableview.innerHTML.indexOf("(edited)") !== -1);
fireRowReset("wave5_stores_live");
check("row reset restores label", els.tableview.innerHTML.indexOf("(edited)") === -1);

console.log("\nEdit offset of an item-anchored row -> negative offset recompute");
fireEdit("offset", "wave2_decision", "-5"); // wave2_start 2026-07-31 -5bd = 2026-07-24
check("negative offset edit recomputes wave2_decision to 2026-07-24", rowHas("1) PRODUCT: Wave 2 decision", "2026-07-24"));
fireRowReset("wave2_decision");
check("row reset restores wave2_decision to 2026-07-30", rowHas("1) PRODUCT: Wave 2 decision", "2026-07-30"));

console.log("\nRe-anchor a task to an item anchor via the dropdown (type deduced, external preserved)");
var beforeExt = App.state.model.find(function (t) { return t.id === "support_ready"; }).external_dependency;
fireEdit("anchor_id", "support_ready", "wave2_feedback_changes");
var sr = App.state.model.find(function (t) { return t.id === "support_ready"; });
check("re-anchor deduces item_anchor", sr.anchor_type === "item_anchor" && sr.anchor_id === "wave2_feedback_changes");
check("re-anchor preserves the stored external_dependency flag (not re-derived)", sr.external_dependency === beforeExt);
fireRowReset("support_ready");
check("row reset restores original anchor", App.state.model.find(function (t) { return t.id === "support_ready"; }).anchor_id === "wave2_start");

// ---- Downstream recompute through the table (item anchor) ------------------
console.log("\nItem-anchor downstream recompute (edit parent, child follows)");
// guardian_upgrade_done anchors the v016_testnet date anchor; client_wallet_done
// anchors guardian, so moving guardian moves client_wallet_done too.
var clientBefore = M.findTask(M.recalc({ anchors: App.state.anchors, tasks: App.state.model }).tasks, "client_wallet_done").date;
fireEdit("offset", "guardian_upgrade_done", "0"); // 2bd later than default -2
var afterParent = M.recalc({ anchors: App.state.anchors, tasks: App.state.model });
check("downstream client_wallet_done followed the parent (+2bd)",
  M.findTask(afterParent.tasks, "client_wallet_done").date === M.addBusinessDays(clientBefore, 2),
  M.findTask(afterParent.tasks, "client_wallet_done").date);
check("downstream client_wallet_done flagged moved", M.findTask(afterParent.tasks, "client_wallet_done").moved === true);
fireRowReset("guardian_upgrade_done");

// ---- Cycle / invalid anchor warnings in the UI -----------------------------
console.log("\nCycle warning surfaces in the UI");
fireEdit("anchor_id", "wave3_start", "wave3_stores_live"); // wave3_start -> ... -> wave3_start
check("cycle produces an error warning", els.warnings.innerHTML.indexOf("cycle") !== -1);
check("cycle marks a row unresolved in the table", els.tableview.innerHTML.indexOf("unresolved") !== -1);
els.reset._fire("click"); // restore
els["view-table"]._fire("click");
check("reset clears the cycle (no unresolved rows)", els.tableview.innerHTML.indexOf("unresolved") === -1 && els.warnings.innerHTML === "");

// ---- Moving a date anchor shifts ONLY its subgraph -------------------------
console.log("\nMoving the Wave 2 date shifts only the Wave 2 subgraph; other chains stay put");
var beforeMove = M.recalc({ anchors: M.defaultAnchors(), tasks: M.defaultModel() });
setAnchor("wave2_date", "2026-08-07"); // +5 business days later
els["view-table"]._fire("click");
var afterMove = M.recalc({ anchors: App.state.anchors, tasks: App.state.model });
function movedBy(id, bd) { return M.findTask(afterMove.tasks, id).date === M.addBusinessDays(M.findTask(beforeMove.tasks, id).date, bd); }
check("wave2_start shifted +5bd", movedBy("wave2_start", 5));
check("wave5_stores_live (deep in the Wave 2 chain) shifted +5bd", movedBy("wave5_stores_live", 5));
check("v0.16 devnet (own anchor) did NOT move", movedBy("v016_devnet", 0));
check("v0.16 testnet (own anchor) did NOT move", movedBy("v016_testnet", 0));
check("Circle announcement (own anchor) did NOT move", movedBy("circle_announcement", 0));
check("website_out (Circle subgraph) did NOT move", movedBy("website_out", 0));
els.reset._fire("click");

console.log("\nMoving the Circle date shifts only the website/waitlist chain");
var circleBefore = M.recalc({ anchors: M.defaultAnchors(), tasks: M.defaultModel() });
setAnchor("circle_announcement_date", "2026-08-19"); // +5 business days later
var circleAfter = M.recalc({ anchors: App.state.anchors, tasks: App.state.model });
function movedBy2(res0, res1, id, bd) { return M.findTask(res1.tasks, id).date === M.addBusinessDays(M.findTask(res0.tasks, id).date, bd); }
check("Circle announcement shifted +5bd", movedBy2(circleBefore, circleAfter, "circle_announcement", 5));
check("website_out + waitlist_qa followed Circle +5bd",
  movedBy2(circleBefore, circleAfter, "website_out", 5) && movedBy2(circleBefore, circleAfter, "waitlist_qa", 5));
check("Wave 2 chain unaffected by moving Circle", movedBy2(circleBefore, circleAfter, "wave2_start", 0) && movedBy2(circleBefore, circleAfter, "wave5_stores_live", 0));
els.reset._fire("click");

// ---- Make current as defaults / reset / restore shipped --------------------
console.log("\nMake-current-as-defaults, Reset, Restore shipped");
els["view-table"]._fire("click");
fireEdit("offset", "wave5_stores_live", "3"); // move it out
els["make-defaults"]._fire("click");          // promote +3 as the default
fireEdit("offset", "wave5_stores_live", "8");  // move away
els.reset._fire("click");                      // reset -> back to promoted default +3
check("reset returns to the promoted default offset (+3)",
  App.state.model.find(function (t) { return t.id === "wave5_stores_live"; }).offset_business_days === 3);
els["restore-shipped"]._fire("click");         // discard user default -> shipped offset 1
check("restore shipped returns wave5_stores_live to the shipped offset (+1)",
  App.state.model.find(function (t) { return t.id === "wave5_stores_live"; }).offset_business_days === 1);

// ---- Export JSON -----------------------------------------------------------
console.log("\nExport JSON (version 3, four date anchors)");
var exportText = App.exportJSON();
var parsed = JSON.parse(exportText);
check("export is valid JSON with 33 tasks", parsed.tasks.length === TASK_COUNT);
check("export is version 3", parsed.version === 3);
check("export carries all four date anchors",
  parsed.wave2_date === "2026-07-31" && parsed.v016_devnet_date === "2026-07-17" &&
  parsed.v016_testnet_date === "2026-08-05" && parsed.circle_announcement_date === "2026-08-12");
check("export has no teaser/launch fields", !("teaser_date" in parsed) && !("launch_date" in parsed));
check("export includes per-task defaults", parsed.tasks.every(function (t) { return "default_offset_business_days" in t && "default_anchor_id" in t; }));
check("export carries external_dependency (stored) for every task", parsed.tasks.every(function (t) { return "external_dependency" in t && "default_external_dependency" in t; }));
check("export still preserves external_dependency=true rows (survives cleanup)", parsed.tasks.some(function (t) { return t.external_dependency === true; }));
check("export includes item anchor metadata", parsed.tasks.some(function (t) { return t.anchor_type === "item_anchor" && t.anchor_id === "circle_announcement"; }));

console.log("\nExport reflects edits + promoted defaults");
fireEdit("offset", "wave5_stores_live", "-2");
els["make-defaults"]._fire("click");
var parsed2 = JSON.parse(App.exportJSON());
var w5 = parsed2.tasks.find(function (t) { return t.id === "wave5_stores_live"; });
check("edited offset present in export", w5.offset_business_days === -2);
check("promoted default present in export", w5.default_offset_business_days === -2);
els["restore-shipped"]._fire("click");

// ---- localStorage persistence ----------------------------------------------
console.log("\nlocalStorage persistence across reload (schema-3 revision-2 key)");
els["view-table"]._fire("click");
fireEdit("offset", "wave5_stores_live", "4");
check("edit was written to the v3r2 storage key", (storageData[STORAGE_KEY] || "").indexOf("wave5_stores_live") !== -1);
check("persisted payload carries schema:3 + revision:2 + anchors",
  /"schema":3/.test(storageData[STORAGE_KEY]) && /"revision":2/.test(storageData[STORAGE_KEY]) && /"wave2_date":"2026-07-31"/.test(storageData[STORAGE_KEY]));
var window2 = loadApp({}, makeDocument());
els["view-table"]._fire("click");
var reloaded = JSON.parse(window2.BreadApp.exportJSON());
check("reloaded app restores the persisted edit", reloaded.tasks.find(function (t) { return t.id === "wave5_stores_live"; }).offset_business_days === 4);
window = loadApp({}, makeDocument());
App = window.BreadApp;
els["restore-shipped"]._fire("click");

// ---- Stale / fresh localStorage handling -----------------------------------
console.log("\nFresh state (no persisted model) -> shipped defaults");
storageData = {};
var winFresh = loadApp({}, makeDocument());
check("fresh load yields the full shipped 33-task model", winFresh.BreadApp.state.model.length === TASK_COUNT);
check("fresh load uses the default four anchors",
  winFresh.BreadApp.state.anchors.wave2_date === "2026-07-31" &&
  winFresh.BreadApp.state.anchors.v016_devnet_date === "2026-07-17" &&
  winFresh.BreadApp.state.anchors.v016_testnet_date === "2026-08-05" &&
  winFresh.BreadApp.state.anchors.circle_announcement_date === "2026-08-12");

console.log("\nStale prior-release single-anchor v3 state cannot mask the new defaults");
storageData = {};
storageData["bread-calendar-model-v3"] = JSON.stringify({
  schema: 3, wave2: "2026-07-31",
  tasks: [{ id: "wave6_start", label: "7) PUBLIC: Wave 6 targeted push if needed", category: "public",
    anchor_type: "item_anchor", anchor_id: "wave5_stores_live", offset_business_days: 1 }]
});
var winStale = loadApp({}, makeDocument());
check("old single-anchor (v3) state is ignored -> shipped 33-task model", winStale.BreadApp.state.model.length === TASK_COUNT);
check("no wave6 task leaks in from prior-release state", !winStale.BreadApp.state.model.some(function (t) { return t.id === "wave6_start"; }));
check("legacy single-anchor v3 key is proactively removed on load", !Object.prototype.hasOwnProperty.call(storageData, "bread-calendar-model-v3"));

console.log("\nStale pre-wave (v2) state cannot mask the new defaults");
storageData = {};
storageData["bread-calendar-model-v2"] = JSON.stringify({
  teaser: "2026-08-06", launch: "2026-08-13",
  tasks: [{ id: "public_teaser", label: "7 PUBLIC: teaser if GO", category: "public",
    anchor_type: "date_anchor", anchor_id: "teaser_date", offset_business_days: 0 }]
});
var winV2 = loadApp({}, makeDocument());
check("old teaser/launch (v2) state is ignored -> shipped 33-task model", winV2.BreadApp.state.model.length === TASK_COUNT);
check("legacy v2 key is proactively removed on load", !Object.prototype.hasOwnProperty.call(storageData, "bread-calendar-model-v2"));

console.log("\nWrong-revision payload under the current key is discarded");
storageData = {};
storageData[STORAGE_KEY] = JSON.stringify({ schema: 3, revision: 1, anchors: { wave2_date: "2026-07-31" }, tasks: [{ id: "x" }] });
var winBadRev = loadApp({}, makeDocument());
check("revision-1 payload ignored -> shipped 33-task model", winBadRev.BreadApp.state.model.length === TASK_COUNT);

console.log("\nValid v3r2 state with a stale '{n} text' label is restored + normalized");
storageData = {};
storageData[STORAGE_KEY] = JSON.stringify({
  schema: 3, revision: 2,
  anchors: { wave2_date: "2026-07-31", v016_devnet_date: "2026-07-17", v016_testnet_date: "2026-08-05", circle_announcement_date: "2026-08-12" },
  tasks: [{
    id: "wave2_start", label: "1 PRODUCT: Wave 2 company-wide testing", category: "product",
    anchor_type: "date_anchor", anchor_id: "wave2_date", offset_business_days: 0,
    external_dependency: false,
    default_label: "1 PRODUCT: Wave 2 company-wide testing", default_category: "product",
    default_anchor_type: "date_anchor", default_anchor_id: "wave2_date",
    default_offset_business_days: 0, default_external_dependency: false
  }]
});
var winV3 = loadApp({}, makeDocument());
var restored = winV3.BreadApp.state.model.find(function (t) { return t.id === "wave2_start"; });
check("valid v3r2 state is restored (single persisted task)", winV3.BreadApp.state.model.length === 1 && !!restored);
check("stale '{n} text' label migrated to '{n}) text'", restored.label === "1) PRODUCT: Wave 2 company-wide testing", restored.label);
check("stale default_label migrated too", restored.default_label === "1) PRODUCT: Wave 2 company-wide testing", restored.default_label);
// Reset back to a clean shipped app for the interactive sections below.
storageData = {};
window = loadApp({}, makeDocument());
App = window.BreadApp;

// ---- Drag/drop -------------------------------------------------------------
console.log("\nDrag/drop recomputes offset by business-day distance");
els["view-cal"]._fire("click");
// wave2_decision: anchor is wave2_start (2026-07-31). Drop on 2026-08-04 (Tue) -> +2bd.
fireDragStart("wave2_decision");
fireDrop("2026-08-04");
check("drag/drop set wave2_decision offset to +2 (bd distance)", App.state.model.find(function (t) { return t.id === "wave2_decision"; }).offset_business_days === 2);
els["view-table"]._fire("click");
check("dropped task now renders at 2026-08-04", rowHas("1) PRODUCT: Wave 2 decision", "2026-08-04"));
els["view-cal"]._fire("click");
// Drag a parent -> downstream item-anchored task recomputes.
var clientBeforeDrag = M.findTask(M.recalc({ anchors: App.state.anchors, tasks: App.state.model }).tasks, "client_wallet_done").date;
fireDragStart("guardian_upgrade_done"); // anchor is testnet 2026-08-05; drop on 2026-08-06 (Thu) -> +1bd
fireDrop("2026-08-06");
var afterDrag = M.recalc({ anchors: App.state.anchors, tasks: App.state.model });
check("dragged parent guardian_upgrade_done now at 2026-08-06", M.findTask(afterDrag.tasks, "guardian_upgrade_done").date === "2026-08-06");
check("downstream client_wallet_done followed the dragged parent",
  M.findTask(afterDrag.tasks, "client_wallet_done").date === M.addBusinessDays("2026-08-06", 4));
els["restore-shipped"]._fire("click");

// ---- Click a calendar item highlights it and its anchor chain (no layout shift) -
console.log("\nClick-highlight: item + anchor chain via a FLOATING popup (no layout shift)");
els["view-cal"]._fire("click");
var calBefore = els.calendar.innerHTML;
var skelBefore = daySkeleton(calBefore), hdrsBefore = monthHeaders(calBefore);
firePillClick("client_wallet_done"); // chain: client -> guardian -> testnet -> v0.16 testnet date
check("selected id recorded", App.state.selectedId === "client_wallet_done");
var calHl = els.calendar.innerHTML;
check("selected pill highlighted (hl-self)", calHl.indexOf("hl-self") !== -1);
check("anchor pills highlighted (hl-anchor)", calHl.indexOf("hl-anchor") !== -1);
check("terminating testnet anchor cell highlighted (hl-anchor-cell)", calHl.indexOf("hl-anchor-cell") !== -1);
check("selecting did NOT change the calendar month/week structure (no layout shift)",
  daySkeleton(calHl) === skelBefore && monthHeaders(calHl) === hdrsBefore);
check("details popup is shown (not hidden) and names the selected task",
  els.details._cls["details-hidden"] !== true && els.details.innerHTML.indexOf("0) Client/wallet/Epoch upgrade done") !== -1);
check("details popup uses a floating drag handle, not an inline layout panel",
  els.details.innerHTML.indexOf('id="details-drag"') !== -1);
check("details popup shows the anchor chain terminating at 'v0.16 testnet'",
  els.details.innerHTML.indexOf("Anchor chain") !== -1 && els.details.innerHTML.indexOf("v0.16 testnet") !== -1);
check("details popup shows the external-dependency flag", els.details.innerHTML.indexOf("External dependency: yes") !== -1);
firePillClick("client_wallet_done");
check("re-click clears the selection", App.state.selectedId === null);
check("highlight removed from calendar", els.calendar.innerHTML.indexOf("hl-self") === -1);
check("details popup hidden again after clearing", els.details._cls["details-hidden"] === true);

// ---- Legend category filter ------------------------------------------------
els["restore-shipped"]._fire("click");
els["view-table"]._fire("click");
console.log("\nLegend filter: show-all / single / add / remove / double-click reset");
check("all 33 rows visible before any legend click", tableRowCount() === TASK_COUNT, "got " + tableRowCount());
var legend0 = els.legend.innerHTML;
check("legend items carry data-cat", (legend0.match(/data-cat=/g) || []).length === 8);
check("no selection -> every item active", (legend0.match(/legend-item active/g) || []).length === 8);
check("no selection -> nothing inactive", legend0.indexOf("legend-item inactive") === -1);

var publicCount = M.SHIPPED_TASKS.filter(function (t) { return t.category === "public"; }).length; // 3
var productCount = M.SHIPPED_TASKS.filter(function (t) { return t.category === "product"; }).length; // 10
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
check("double-click resets to all 33 rows", tableRowCount() === TASK_COUNT, "got " + tableRowCount());

console.log("\nLegend filter also filters the calendar (pills only) without trimming weeks");
els["view-cal"]._fire("click");
var calUnfiltered = els.calendar.innerHTML;
var skelUnfiltered = daySkeleton(calUnfiltered), hdrsUnfiltered = monthHeaders(calUnfiltered);
fireLegendClick("public");
var calFiltered = els.calendar.innerHTML;
check("calendar shows the selected category pill", calFiltered.indexOf("7) PUBLIC: Wave 4 teaser + waitlist push") !== -1);
check("calendar hides a non-selected category pill", calFiltered.indexOf("5) SUPPORT: intake workflow ready") === -1);
check("calendar still renders the WAVE 2 anchor chip while filtered", calFiltered.indexOf("WAVE 2") !== -1);
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
check("starts at 33 rows before add", tableRowCount() === TASK_COUNT, "got " + tableRowCount());
els["add-task"]._fire("click");
check("Add task grows the table to 34 rows", tableRowCount() === TASK_COUNT + 1, "got " + tableRowCount());
var addedId = App.state.model[App.state.model.length - 1].id;
check("added task has a '{n}) ' default label", /^\d+\) /.test(App.state.model[App.state.model.length - 1].label));
check("added task defaults to product/Wave 2 date/offset 0",
  (function () { var t = App.state.model[App.state.model.length - 1]; return t.category === "product" && t.anchor_id === "wave2_date" && t.offset_business_days === 0; })());
check("added task is present in export", JSON.parse(App.exportJSON()).tasks.some(function (t) { return t.id === addedId; }));
check("added task is persisted to localStorage", (storageData[STORAGE_KEY] || "").indexOf(addedId) !== -1);
fireRemove(addedId);
check("Remove drops the row back to 33", tableRowCount() === TASK_COUNT, "got " + tableRowCount());
check("removed task is gone from the model", !App.state.model.some(function (t) { return t.id === addedId; }));
// Remove a shipped task that has dependents -> dependents re-anchor (no dangling).
// wave2_start has dependents (support_ready, wave2_decision, wave2_feedback_changes,
// wave3_start); its own anchor is the Wave 2 date, so dependents re-anchor to wave2_date.
fireRemove("wave2_start");
check("removing a shipped task with dependents drops it (32 rows)", tableRowCount() === TASK_COUNT - 1, "got " + tableRowCount());
check("dependent re-anchored to the removed task's anchor (Wave 2 date)",
  App.state.model.find(function (t) { return t.id === "wave2_feedback_changes"; }).anchor_id === "wave2_date");
check("no unresolved warnings after removal", els.warnings.innerHTML.indexOf("unresolved") === -1);
els["restore-shipped"]._fire("click");
els["view-table"]._fire("click");
check("Restore shipped defaults brings back the full 33-task model", tableRowCount() === TASK_COUNT && !!App.state.model.find(function (t) { return t.id === "wave2_start"; }));

// ---- Static HTML checks ----------------------------------------------------
console.log("\nindex.html copy checks");
var htmlSrc = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
check("title is exactly 'Bread Reverse Launch Calendar'", htmlSrc.indexOf("<title>Bread Reverse Launch Calendar</title>") !== -1);
check("h1 is exactly 'Bread Reverse Launch Calendar'", htmlSrc.indexOf("<h1>Bread Reverse Launch Calendar</h1>") !== -1);
check("grouped 'Date anchors' control block present", htmlSrc.indexOf("Date anchors") !== -1 && htmlSrc.indexOf('class="control anchors"') !== -1);
check("all four date inputs present",
  htmlSrc.indexOf('id="wave2_date"') !== -1 && htmlSrc.indexOf('id="v016_devnet_date"') !== -1 &&
  htmlSrc.indexOf('id="v016_testnet_date"') !== -1 && htmlSrc.indexOf('id="circle_announcement_date"') !== -1);
check("date inputs are clearly labelled", htmlSrc.indexOf("Wave 2 start") !== -1 && htmlSrc.indexOf("v0.16 devnet") !== -1 && htmlSrc.indexOf("v0.16 testnet") !== -1 && htmlSrc.indexOf("Circle announcement") !== -1);
check("no legacy single wave2 input id", htmlSrc.indexOf('id="wave2"') === -1);
check("no teaser input", htmlSrc.indexOf('id="teaser"') === -1);
check("no launch input", htmlSrc.indexOf('id="launch"') === -1);
check("export control present", htmlSrc.indexOf('id="export"') !== -1);
check("add-task control present", htmlSrc.indexOf('id="add-task"') !== -1);
check("floating details popup present + starts hidden", htmlSrc.indexOf('id="details"') !== -1 && htmlSrc.indexOf("details-hidden") !== -1);

// ---- Static source hygiene checks (grep-style) -----------------------------
console.log("\nSource hygiene: legacy concepts + decorative noise are gone");
var appSrc = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
var cssSrc = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
check("app.js: no DEFAULT_TEASER/DEFAULT_LAUNCH usage", appSrc.indexOf("DEFAULT_TEASER") === -1 && appSrc.indexOf("DEFAULT_LAUNCH") === -1);
check("app.js: no TEASER_ANCHOR/LAUNCH_ANCHOR usage", appSrc.indexOf("TEASER_ANCHOR") === -1 && appSrc.indexOf("LAUNCH_ANCHOR") === -1);
check("app.js: no legacy DEFAULT_WAVE2 single-anchor usage", appSrc.indexOf("DEFAULT_WAVE2") === -1);
check("app.js: no patternClass / decorative pattern usage", appSrc.indexOf("patternClass") === -1 && appSrc.indexOf("pat-cross") === -1);
check("app.js: no EXT badge markup", appSrc.indexOf(">EXT<") === -1 && appSrc.indexOf('"badge ext"') === -1 && appSrc.indexOf("ext-mark") === -1);
check("app.js: uses the four date anchors (DATE_ANCHOR_IDS + normalizeAnchors)", appSrc.indexOf("DATE_ANCHOR_IDS") !== -1 && appSrc.indexOf("normalizeAnchors") !== -1);
check("styles.css: details popup is position:fixed (floating)", /\.details\s*\{[^}]*position:\s*fixed/.test(cssSrc));
check("styles.css: no .badge.ext external cue remains", cssSrc.indexOf(".badge.ext") === -1);
check("styles.css: no decorative pattern classes remain", ["pat-cross", "pat-vertical", "pat-horizontal", "pat-diagonal", "pat-circle"].every(function (p) { return cssSrc.indexOf(p) === -1; }));
check("styles.css: pills use a left-accent + neutral outline card treatment", cssSrc.indexOf("border-left") !== -1 && cssSrc.indexOf("--card-outline") !== -1);
check("styles.css: consistent focus-visible states", cssSrc.indexOf(":focus-visible") !== -1);
check("styles.css: quiet anchor chip styling present", cssSrc.indexOf(".anchor-tag") !== -1);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
