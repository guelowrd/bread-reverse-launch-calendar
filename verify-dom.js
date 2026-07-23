/*
 * Browserless smoke test of the real UI render path (app.js) using a tiny DOM
 * shim, no jsdom/chromium required. Confirms app.js builds the calendar/table
 * from model.js and that editing, defaults, export, drag/drop, click-highlight,
 * the legend filter, the floating details popup, and stable-across-filter week
 * trimming all work end to end.
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
["teaser", "launch", "reset", "add-task", "make-defaults", "restore-shipped", "export",
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
function tableRowCount() { return (els.tableview.innerHTML.match(/<tr class=/g) || []).length; }
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
check("calendar contains teaser anchor tag", cal.indexOf("TEASER") !== -1);
check("calendar contains launch anchor tag", cal.indexOf("LAUNCH") !== -1);
var todayISO = new Date().toISOString().slice(0, 10);
check("calendar highlights today's date cell", cal.indexOf('class="today" data-date="' + todayISO + '"') !== -1 || cal.indexOf('today" data-date="' + todayISO + '"') !== -1);
check("calendar highlights today's day number in dark blue", cal.indexOf('daynum today') !== -1 || cal.indexOf('daynum anchor today') !== -1);
check("calendar renders '7) PUBLIC: teaser if GO'", cal.indexOf("7) PUBLIC: teaser if GO") !== -1);
check("calendar renders '7) PUBLIC: Launch announcement'", cal.indexOf("7) PUBLIC: Launch announcement") !== -1);
check("calendar renders '0) v0.16 on devnet'", cal.indexOf("0) v0.16 on devnet") !== -1);
check("calendar renders '1) PRODUCT: Everything working e2e'", cal.indexOf("1) PRODUCT: Everything working e2e") !== -1);
check("calendar renders '2) STORES: submit final version'", cal.indexOf("2) STORES: submit final version") !== -1);
check("calendar renders '3) VISUAL IDENTITY: Board'", cal.indexOf("3) VISUAL IDENTITY: Board") !== -1);
check("calendar renders new '1) PRODUCT: company testing (try 2)'", cal.indexOf("1) PRODUCT: company testing (try 2)") !== -1);
check("calendar renders new '4) WEBSITE - new version out'", cal.indexOf("4) WEBSITE - new version out") !== -1);
check("no DEP badge anywhere in the calendar", cal.indexOf(">DEP<") === -1);
check("pills are draggable", cal.indexOf('draggable="true"') !== -1);
check("day cells carry data-date drop targets", cal.indexOf("data-date=") !== -1);
check("no Pin controls in calendar", cal.indexOf("data-pin") === -1);
check("legend populated (8 categories)", (els.legend.innerHTML.match(/legend-swatch/g) || []).length === 8);
["pat-cross", "pat-vertical", "pat-horizontal", "pat-diagonal", "pat-circle"].forEach(function (p) {
  check("legend swatch carries " + p, els.legend.innerHTML.indexOf(p) !== -1);
});
check("no warnings at defaults", els.warnings.innerHTML === "");
check("details popup hidden with nothing selected (no layout footprint)", els.details._cls["details-hidden"] === true && els.details.innerHTML === "");

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
var e2ePill = pillFor(cal, "product_e2e");
var pc = M.CATEGORIES.product.color, pt = M.CATEGORIES.product.tint;
check("product pill keeps pat-cross pattern class", e2ePill.indexOf("pat-cross") !== -1, e2ePill.slice(0, 200));
check("product pill sets category color (" + pc + ")", e2ePill.indexOf("color:" + pc) !== -1, e2ePill.slice(0, 200));
check("product pill sets category tint background (" + pt + ")", e2ePill.indexOf("background-color:" + pt) !== -1);
M.CATEGORY_ORDER.forEach(function (k) {
  var hasTask = M.SHIPPED_TASKS.some(function (t) { return t.category === k; });
  if (!hasTask) return;
  check("calendar applies " + k + " tint " + M.CATEGORIES[k].tint,
    cal.indexOf("background-color:" + M.CATEGORIES[k].tint) !== -1);
});
check("pill label chip keeps readable dark text", cal.indexOf('class="pill-text" style="color:#111"') !== -1);

console.log("\nSeparator-less / old labels are gone from calendar");
["0 v0.16 on devnet", "1 PRODUCT: Everything working e2e", "1 PRODUCT: final UI/Earn", "3 VIDEO: teaser final"].forEach(function (l) {
  check("absent from calendar: '" + l + "'", cal.indexOf(l) === -1);
});

console.log("\nLegend numeric prefixes use '{n}) ' and the renamed video category");
var legendHTML = els.legend.innerHTML;
[["0) v0.16 dependency"], ["1) Product / go-no-go"], ["2) Stores"], ["3) Video / design"],
 ["4) Website / waitlist"], ["5) Support"], ["6) Comms"], ["7) Public moment"]].forEach(function (p) {
  check("legend shows '" + p[0] + "'", legendHTML.indexOf(p[0]) !== -1);
});
check("legend does NOT show the old '3 Video' label", legendHTML.indexOf(">3 Video<") === -1 && legendHTML.indexOf("3 Video / design") === -1);

console.log("\nCalendar week trimming (default anchors, July starts at Jul 12-18)");
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
check("July first visible row shows day 12", julyFirstRow.indexOf(">12</span>") !== -1, julyFirstRow.slice(0, 160));
check("July first visible row shows day 18", julyFirstRow.indexOf(">18</span>") !== -1);
check("July first row holds earliest task '1) PRODUCT: date feasibility chat' on day 16",
  julyFirstRow.indexOf(">16</span>") !== -1 && julyFirstRow.indexOf("1) PRODUCT: date feasibility chat") !== -1, julyFirstRow.slice(0, 220));
check("July first row is NOT the Jul 5-11 week (no day 5 daynum)", julyFirstRow.indexOf(">5</span>") === -1);

console.log("\nCalendar week trimming expands when tasks move earlier");
els.teaser.value = "2026-07-13"; els.teaser._fire("change"); // pulls the v016 chain into June
var cal2 = els.calendar.innerHTML;
check("earlier teaser expands the span to include June 2026", cal2.indexOf("June 2026") !== -1);
els.reset._fire("click"); // restore defaults

// ---- Table view ------------------------------------------------------------
console.log("\nTable view (editable rows)");
els["view-table"]._fire("click");
var tbl = els.tableview.innerHTML;
check("table has 29 task rows", tableRowCount() === 29, "got " + tableRowCount());
check("table rows expose a per-row Remove control", els.tableview.innerHTML.indexOf('data-remove="') !== -1);
check("table shows a resolved date (2026-07-20 devnet)", tbl.indexOf("2026-07-20") !== -1);
check("label is editable (input)", tbl.indexOf('data-edit="label"') !== -1);
check("category is editable (select)", tbl.indexOf('data-edit="category"') !== -1);
check("anchor is editable (select)", tbl.indexOf('data-edit="anchor_id"') !== -1);
check("offset is editable (input)", tbl.indexOf('data-edit="offset"') !== -1);
check("NO Anchor type column/control", tbl.indexOf('data-edit="anchor_type"') === -1 && tbl.indexOf("Anchor type") === -1);
check("NO Ext. dep column/control", tbl.indexOf('data-edit="dep"') === -1 && tbl.indexOf("Ext. dep") === -1);
check("anchor dropdown uses optgroups", tbl.indexOf("<optgroup") !== -1);
check("anchor dropdown lists Teaser date and Launch date at top", tbl.indexOf(">Teaser date<") !== -1 && tbl.indexOf(">Launch date<") !== -1);
check("offset header names business days", tbl.indexOf("Offset (business days)") !== -1);
check("row Reset button present", tbl.indexOf('data-reset="') !== -1);
check("no Pin controls in table", tbl.indexOf("data-pin") === -1 && tbl.indexOf("PINNED") === -1);
check("table shows '7) PUBLIC: Launch announcement'", tbl.indexOf("7) PUBLIC: Launch announcement") !== -1);
check("table shows '0) v0.16 on testnet'", tbl.indexOf("0) v0.16 on testnet") !== -1);
check("table category select prefixes Public moment with '7)'", tbl.indexOf("7) Public moment") !== -1);
check("table category select shows renamed '3) Video / design'", tbl.indexOf("3) Video / design") !== -1);
check("'0) Client/wallet/Epoch upgrade done' renders at 2026-08-03 (guardian +4bd)",
  tbl.indexOf('<td class="date">2026-08-03</td>') !== -1 && tbl.indexOf("0) Client/wallet/Epoch upgrade done") !== -1);

// ---- Editing: label / category / anchor / offset ---------------------------
console.log("\nEdit label of a row");
fireEdit("label", "public_launch", "7) PUBLIC: Launch announcement (edited)");
check("label edit reflected in table", els.tableview.innerHTML.indexOf("7) PUBLIC: Launch announcement (edited)") !== -1);
fireRowReset("public_launch");
check("row reset restores label", els.tableview.innerHTML.indexOf("(edited)") === -1);

console.log("\nEdit offset of a teaser row -> recompute");
fireEdit("offset", "date_feasibility", "-20"); // teaser Aug 6 -20bd = 2026-07-09
check("offset edit recomputes to 2026-07-09", els.tableview.innerHTML.indexOf('<td class="date">2026-07-09</td>') !== -1);
fireRowReset("date_feasibility");

console.log("\nRe-anchor a task to an item anchor via the anchor dropdown (type/dep deduced)");
fireEdit("anchor_id", "date_feasibility", "stores_submit"); // becomes item anchor
fireEdit("offset", "date_feasibility", "1"); // stores_submit(2026-07-24) +1bd = 2026-07-27
check("re-anchored to item recomputes date to 2026-07-27",
  els.tableview.innerHTML.indexOf("1) PRODUCT: date feasibility chat") !== -1 && els.tableview.innerHTML.indexOf('<td class="date">2026-07-27</td>') !== -1);
check("re-anchor deduced item_anchor + external_dependency in the model",
  App.state.model.find(function (t) { return t.id === "date_feasibility"; }).anchor_type === "item_anchor" &&
  App.state.model.find(function (t) { return t.id === "date_feasibility"; }).external_dependency === true);
fireRowReset("date_feasibility");
check("row reset re-derives date anchor + clears external_dependency",
  App.state.model.find(function (t) { return t.id === "date_feasibility"; }).anchor_type === "date_anchor" &&
  App.state.model.find(function (t) { return t.id === "date_feasibility"; }).external_dependency === false);

// ---- Downstream recompute through the table (item anchor) ------------------
console.log("\nItem-anchor downstream recompute (edit parent, child follows)");
fireEdit("offset", "product_e2e", "1"); // 2bd later than default -1
var afterParent = els.tableview.innerHTML;
check("parent product_e2e moved to 2026-08-07", afterParent.indexOf("1) PRODUCT: Everything working e2e") !== -1 && afterParent.indexOf('<td class="date">2026-08-07</td>') !== -1);
check("downstream v016_devnet moved to 2026-07-22 (+2bd)", afterParent.indexOf("0) v0.16 on devnet") !== -1 && afterParent.indexOf('<td class="date">2026-07-22</td>') !== -1);
fireRowReset("product_e2e");

// ---- Cycle / invalid anchor warnings in the UI -----------------------------
console.log("\nCycle warning surfaces in the UI");
fireEdit("anchor_id", "product_e2e", "client_wallet_done"); // creates a cycle
check("cycle produces an error warning", els.warnings.innerHTML.indexOf("cycle") !== -1);
check("cycle marks a row unresolved in the table", els.tableview.innerHTML.indexOf("unresolved") !== -1);
els.reset._fire("click"); // restore

// ---- Critical dependency after launch warning ------------------------------
console.log("\nCritical-dependency-after-launch warning");
els["view-table"]._fire("click");
fireEdit("offset", "client_wallet_done", "40"); // push far past launch
check("warning fires for critical dependency landing after launch",
  els.warnings.innerHTML.indexOf("Critical dependency") !== -1 && els.warnings.innerHTML.indexOf("after launch") !== -1);
els.reset._fire("click");

// ---- Make current as defaults / reset / restore shipped --------------------
console.log("\nMake-current-as-defaults, Reset, Restore shipped");
els["view-table"]._fire("click");
fireEdit("offset", "public_teaser", "-3"); // teaser Aug 6 -3bd = 2026-08-03
els["make-defaults"]._fire("click");        // promote -3 to the default
fireEdit("offset", "public_teaser", "5");   // move away
els.reset._fire("click");                   // reset -> back to promoted default -3
check("reset returns to the promoted default (2026-08-03)", els.tableview.innerHTML.indexOf("7) PUBLIC: teaser if GO") !== -1 && els.tableview.innerHTML.indexOf('<td class="date">2026-08-03</td>') !== -1);
els["restore-shipped"]._fire("click");      // discard user default -> shipped offset 0
els["view-table"]._fire("click");
check("restore shipped returns public_teaser to teaser day 2026-08-06", els.tableview.innerHTML.indexOf('<td class="date">2026-08-06</td>') !== -1);

// ---- Export JSON -----------------------------------------------------------
console.log("\nExport JSON");
var exportText = App.exportJSON();
var parsed = JSON.parse(exportText);
check("export is valid JSON with 29 tasks", parsed.tasks.length === 29);
check("export is version 2", parsed.version === 2);
check("export carries teaser/launch anchors", parsed.teaser_date === "2026-08-06" && parsed.launch_date === "2026-08-13");
check("export includes per-task defaults", parsed.tasks.every(function (t) { return "default_offset_business_days" in t && "default_anchor_id" in t; }));
check("export still includes external_dependency for JSON compat", parsed.tasks.every(function (t) { return "external_dependency" in t && "default_external_dependency" in t; }));
check("exported external_dependency is derived (item anchor => true)", parsed.tasks.every(function (t) {
  var derived = t.anchor_id !== "teaser_date" && t.anchor_id !== "launch_date";
  return t.external_dependency === derived;
}));
check("export includes item anchor metadata", parsed.tasks.some(function (t) { return t.anchor_type === "item_anchor" && t.anchor_id === "product_e2e"; }));

console.log("\nExport reflects edits + promoted defaults");
fireEdit("offset", "public_teaser", "-2");
els["make-defaults"]._fire("click");
var parsed2 = JSON.parse(App.exportJSON());
var ptExp = parsed2.tasks.find(function (t) { return t.id === "public_teaser"; });
check("edited offset present in export", ptExp.offset_business_days === -2);
check("promoted default present in export", ptExp.default_offset_business_days === -2);
els["restore-shipped"]._fire("click");

// ---- localStorage persistence ---------------------------------------------
console.log("\nlocalStorage persistence across reload");
els["view-table"]._fire("click");
fireEdit("offset", "public_teaser", "-1"); // teaser -1bd
check("edit was written to localStorage", (storageData["bread-calendar-model-v2"] || "").indexOf("public_teaser") !== -1);
var window2 = loadApp({}, makeDocument());
window2.BreadApp.render();
window2 = loadApp({}, makeDocument());
els["view-table"]._fire("click");
var reloaded = JSON.parse(window2.BreadApp.exportJSON());
check("reloaded app restores the persisted edit", reloaded.tasks.find(function (t) { return t.id === "public_teaser"; }).offset_business_days === -1);
window = loadApp({}, makeDocument());
App = window.BreadApp;
els["restore-shipped"]._fire("click");

// ---- Old persisted model normalization -------------------------------------
console.log("\nOld persisted model is normalized on load (derived fields + missing tasks after restore)");
storageData["bread-calendar-model-v2"] = JSON.stringify({
  teaser: "2026-08-06", launch: "2026-08-13",
  // A stale row whose stored flags disagree with its anchor (should be repaired).
  tasks: [{
    id: "stores_live", label: "2 STORES: v.P-T live", category: "stores",
    anchor_type: "date_anchor", anchor_id: "stores_submit", offset_business_days: 6,
    external_dependency: false,
    default_label: "2 STORES: v.P-T live", default_category: "stores",
    default_anchor_type: "date_anchor", default_anchor_id: "stores_submit",
    default_offset_business_days: 6, default_external_dependency: false
  }]
});
var window3 = loadApp({}, makeDocument());
var stale = window3.BreadApp.state.model.find(function (t) { return t.id === "stores_live"; });
check("stale item anchor re-derived to item_anchor + external_dependency=true", stale.anchor_type === "item_anchor" && stale.external_dependency === true);
check("stale persisted label migrated to '{n}) text'", stale.label === "2) STORES: v.P-T live", stale.label);
check("stale persisted default_label migrated to '{n}) text'", stale.default_label === "2) STORES: v.P-T live", stale.default_label);
window3.BreadApp.state; // restore shipped brings back the full 29-task model
els = els; // (els still bound to the last-loaded window's document)
window = loadApp({}, makeDocument());
App = window.BreadApp;
els["restore-shipped"]._fire("click");
check("restore shipped yields the full 29-task model", App.state.model.length === 29);

// ---- Drag/drop: drop a pill on a date cell -> new business-day offset -------
console.log("\nDrag/drop recomputes offset by business-day distance");
els["view-cal"]._fire("click");
// public_teaser: anchor teaser 2026-08-06. Drop on 2026-08-10 (Mon) -> +2bd.
fireDragStart("public_teaser");
fireDrop("2026-08-10");
check("drag/drop set public_teaser offset to +2 (bd distance)", App.state.model.find(function (t) { return t.id === "public_teaser"; }).offset_business_days === 2);
els["view-table"]._fire("click");
check("dropped task now renders at 2026-08-10", els.tableview.innerHTML.indexOf('<td class="date">2026-08-10</td>') !== -1);
els["view-cal"]._fire("click");
// Drag a parent -> downstream item-anchored tasks recompute.
fireDragStart("product_e2e"); // anchor teaser 2026-08-06; drop on 2026-07-24 (Fri)
fireDrop("2026-07-24");
check("dragged parent product_e2e now at 2026-07-24", els.calendar.innerHTML.indexOf("1) PRODUCT: Everything working e2e") !== -1 && els.calendar.innerHTML.indexOf(">24</span>") !== -1);
var devnetResolved = M.recalc({ teaser: App.state.teaser, launch: App.state.launch, tasks: App.state.model });
check("downstream v016_devnet followed the dragged parent",
  M.findTask(devnetResolved.tasks, "v016_devnet").date === M.addBusinessDays("2026-07-24", -12));
els["restore-shipped"]._fire("click");

// ---- Click a calendar item highlights it and its anchor chain (no layout shift) -
console.log("\nClick-highlight: item + anchor chain via a FLOATING popup (no layout shift)");
els["view-cal"]._fire("click");
var calBefore = els.calendar.innerHTML;
var skelBefore = daySkeleton(calBefore), hdrsBefore = monthHeaders(calBefore);
firePillClick("client_wallet_done"); // chain: client -> guardian -> testnet -> devnet -> product_e2e -> teaser
check("selected id recorded", App.state.selectedId === "client_wallet_done");
var calHl = els.calendar.innerHTML;
check("selected pill highlighted (hl-self)", calHl.indexOf("hl-self") !== -1);
check("anchor pills highlighted (hl-anchor)", calHl.indexOf("hl-anchor") !== -1);
check("terminating teaser cell highlighted (hl-anchor-cell)", calHl.indexOf("hl-anchor-cell") !== -1);
check("selecting did NOT change the calendar month/week structure (no layout shift)",
  daySkeleton(calHl) === skelBefore && monthHeaders(calHl) === hdrsBefore);
check("details popup is shown (not hidden) and names the selected task",
  els.details._cls["details-hidden"] !== true && els.details.innerHTML.indexOf("0) Client/wallet/Epoch upgrade done") !== -1);
check("details popup uses a floating drag handle, not an inline layout panel",
  els.details.innerHTML.indexOf('id="details-drag"') !== -1);
check("details popup shows the anchor chain", els.details.innerHTML.indexOf("Anchor chain") !== -1 && els.details.innerHTML.indexOf("Everything working e2e") !== -1);
check("details popup omits anchor-type + external-dependency copy",
  els.details.innerHTML.indexOf("item anchor") === -1 && els.details.innerHTML.indexOf("date anchor") === -1 && els.details.innerHTML.toLowerCase().indexOf("external dependency") === -1);
// Clicking the same pill again clears the highlight and hides the popup.
firePillClick("client_wallet_done");
check("re-click clears the selection", App.state.selectedId === null);
check("highlight removed from calendar", els.calendar.innerHTML.indexOf("hl-self") === -1);
check("details popup hidden again after clearing", els.details._cls["details-hidden"] === true);

// ---- Legend category filter (existing behavior preserved) ------------------
els["restore-shipped"]._fire("click");
els["view-table"]._fire("click");
console.log("\nLegend filter: show-all / single / add / remove / double-click reset");
check("all 29 rows visible before any legend click", tableRowCount() === 29, "got " + tableRowCount());
var legend0 = els.legend.innerHTML;
check("legend items carry data-cat", (legend0.match(/data-cat=/g) || []).length === 8);
check("no selection -> every item active", (legend0.match(/legend-item active/g) || []).length === 8);
check("no selection -> nothing inactive", legend0.indexOf("legend-item inactive") === -1);

fireLegendClick("public"); // 2 public rows
check("only the 2 public rows remain", tableRowCount() === 2, "got " + tableRowCount());
check("public task still shown", els.tableview.innerHTML.indexOf('data-row-id="public_launch"') !== -1);
// A non-public task has no table ROW while filtered (its label may still appear
// inside other rows' anchor dropdowns, which intentionally list every task).
check("a non-public task row hidden", els.tableview.innerHTML.indexOf('data-row-id="date_feasibility"') === -1);
var legPublic = els.legend.innerHTML;
check("selected category aria-pressed=true", legPublic.indexOf('data-cat="public" role="button" tabindex="0" aria-pressed="true"') !== -1);
check("7 unselected categories inactive", (legPublic.match(/legend-item inactive/g) || []).length === 7);
check("legend keeps pattern cues while filtering", legPublic.indexOf("pat-circle") !== -1 && legPublic.indexOf("pat-cross") !== -1);
check("legend keeps '{n}) ' prefixes while filtering", legPublic.indexOf("7) Public moment") !== -1 && legPublic.indexOf("1) Product / go-no-go") !== -1);

fireLegendClick("product"); // add product (5 rows) -> 7
check("public + product rows shown (7)", tableRowCount() === 7, "got " + tableRowCount());
fireLegendClick("public"); // remove public -> 5
check("only product rows remain (5)", tableRowCount() === 5, "got " + tableRowCount());
fireLegendDblClick();
check("double-click resets to all 29 rows", tableRowCount() === 29, "got " + tableRowCount());
var legReset = els.legend.innerHTML;
check("double-click -> every item active", (legReset.match(/legend-item active/g) || []).length === 8);
check("double-click -> nothing selected", legReset.indexOf('aria-pressed="true"') === -1);

console.log("\nLegend filter also filters the calendar view (pills only) without trimming weeks");
els["view-cal"]._fire("click");
var calUnfiltered = els.calendar.innerHTML;
var skelUnfiltered = daySkeleton(calUnfiltered), hdrsUnfiltered = monthHeaders(calUnfiltered);
fireLegendClick("public");
var calFiltered = els.calendar.innerHTML;
check("calendar shows the selected category pill", calFiltered.indexOf("7) PUBLIC: Launch announcement") !== -1);
check("calendar hides a non-selected category pill", calFiltered.indexOf("5) SUPPORT: final polish done") === -1);
check("calendar still renders TEASER anchor while filtered", calFiltered.indexOf("TEASER") !== -1);
check("calendar still renders LAUNCH anchor while filtered", calFiltered.indexOf("LAUNCH") !== -1);
check("filtering a category does NOT change the month/week structure (stable trimming)",
  daySkeleton(calFiltered) === skelUnfiltered && monthHeaders(calFiltered) === hdrsUnfiltered);
// Add a second category and confirm structure still identical.
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
check("starts at 29 rows before add", tableRowCount() === 29, "got " + tableRowCount());
// Add via the model-actions button; it also switches to the table view.
els["add-task"]._fire("click");
check("Add task grows the table to 30 rows", tableRowCount() === 30, "got " + tableRowCount());
check("added task appears in the model with a unique id", App.state.model.length === 30);
var addedId = App.state.model[App.state.model.length - 1].id;
check("added task has a '{n}) ' default label", /^\d+\) /.test(App.state.model[App.state.model.length - 1].label));
check("added task defaults to product/teaser/offset 0",
  (function () { var t = App.state.model[App.state.model.length - 1]; return t.category === "product" && t.anchor_id === "teaser_date" && t.offset_business_days === 0; })());
check("added task is present in export", JSON.parse(App.exportJSON()).tasks.some(function (t) { return t.id === addedId; }));
check("added task is persisted to localStorage", (storageData["bread-calendar-model-v2"] || "").indexOf(addedId) !== -1);
// Remove the task we just added.
fireRemove(addedId);
check("Remove drops the row back to 29", tableRowCount() === 29, "got " + tableRowCount());
check("removed task is gone from the model", !App.state.model.some(function (t) { return t.id === addedId; }));
check("removed task is omitted from export", !JSON.parse(App.exportJSON()).tasks.some(function (t) { return t.id === addedId; }));
// Remove a shipped task that has dependents -> dependents re-anchor (no dangling).
fireRemove("company_testing");
check("removing a shipped task with dependents drops it (28 rows)", tableRowCount() === 28, "got " + tableRowCount());
check("dependent re-anchored to the removed task's anchor (teaser)",
  App.state.model.find(function (t) { return t.id === "company_testing_try_2"; }).anchor_id === "teaser_date");
check("no unresolved warnings after removal", els.warnings.innerHTML.indexOf("unresolved") === -1);
// Restore shipped brings the full 29-task model back (including the removed one).
els["restore-shipped"]._fire("click");
els["view-table"]._fire("click");
check("Restore shipped defaults brings back the full 29-task model", tableRowCount() === 29 && !!App.state.model.find(function (t) { return t.id === "company_testing"; }));

// ---- Static HTML checks ----------------------------------------------------
console.log("\nindex.html copy checks");
var htmlSrc = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
check("title is exactly 'Bread Reverse Launch Calendar'", htmlSrc.indexOf("<title>Bread Reverse Launch Calendar</title>") !== -1);
check("h1 is exactly 'Bread Reverse Launch Calendar'", htmlSrc.indexOf("<h1>Bread Reverse Launch Calendar</h1>") !== -1);
check("export control present", htmlSrc.indexOf('id="export"') !== -1);
check("add-task control present", htmlSrc.indexOf('id="add-task"') !== -1);
check("make-defaults control present", htmlSrc.indexOf('id="make-defaults"') !== -1);
check("restore-shipped control present", htmlSrc.indexOf('id="restore-shipped"') !== -1);
check("floating details popup present + starts hidden", htmlSrc.indexOf('id="details"') !== -1 && htmlSrc.indexOf("details-hidden") !== -1);
check("removed Lock 3-day gap feature", htmlSrc.indexOf("lockGap") === -1 && htmlSrc.indexOf("Lock 3-day gap") === -1);
check("no em dashes in index.html", htmlSrc.indexOf("—") === -1);

// ---- Static source hygiene checks (grep-style) -----------------------------
console.log("\nSource hygiene: removed UI concepts are gone");
var appSrc = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
var cssSrc = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
check("app.js: no 'Ext. dep' UI copy", appSrc.indexOf("Ext. dep") === -1);
check("app.js: no data-edit=\"dep\" control", appSrc.indexOf('data-edit="dep"') === -1);
check("app.js: no data-edit=\"anchor_type\" control", appSrc.indexOf('data-edit="anchor_type"') === -1);
check("app.js: no 'Anchor type' column label", appSrc.indexOf("Anchor type") === -1);
check("app.js: no DEP badge span", appSrc.indexOf('badge flag') === -1 && appSrc.indexOf(">DEP<") === -1);
check("styles.css: details popup is position:fixed (floating)", /\.details\s*\{[^}]*position:\s*fixed/.test(cssSrc));
check("styles.css: no leftover .badge.flag rule", cssSrc.indexOf(".badge.flag") === -1);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
