/*
 * QA DOM scenario check for Bread Reverse Launch Calendar.
 * Drives the real app.js render/event path with a tiny DOM shim to verify live
 * recalculation, item-anchor downstream recompute, drag/drop, click-highlight,
 * and the legend category filter.
 * Run: node qa-dom-live-recalc-check.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const M = require("./model.js");

function makeEl(id) {
  const listeners = {};
  return {
    id, value: "", checked: false, innerHTML: "", _cls: {},
    classList: {
      add(c) { this._owner._cls[c] = true; },
      remove(c) { delete this._owner._cls[c]; },
      toggle(c, on) { if (on) this._owner._cls[c] = true; else delete this._owner._cls[c]; },
    },
    appendChild() {}, removeChild() {},
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    _fire(ev, arg) { (listeners[ev] || []).forEach((fn) => fn(arg || { target: {} })); },
  };
}

const els = {};
["teaser", "launch", "reset", "make-defaults", "restore-shipped", "export",
 "view-cal", "view-table", "warnings", "legend", "details", "calendar", "tableview"]
  .forEach((id) => { const e = makeEl(id); e.classList._owner = e; els[id] = e; });
const body = makeEl("body");
const document = {
  getElementById: (id) => els[id], body,
  createElement: () => ({ click() {}, style: {}, href: "", download: "" }),
};
const window = {};
const sandbox = { window, document, console };
sandbox.global = sandbox;
vm.createContext(sandbox);
["model.js", "app.js"].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), sandbox, { filename: f }));
const App = window.BreadApp;

let pass = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg); pass++; }
function setTableView() { els["view-table"]._fire("click"); }
function setDates(teaser, launch) {
  els.teaser.value = teaser; els.teaser._fire("change");
  els.launch.value = launch; els.launch._fire("change");
}
function rowHas(label, date) {
  return els.tableview.innerHTML.includes(`<td class="date">${date}</td>`) && els.tableview.innerHTML.includes(label);
}
function tableRows() { return (els.tableview.innerHTML.match(/<tr class=/g) || []).length; }
function fireEdit(field, id, value, checked) {
  body._fire("change", { target: {
    getAttribute: (k) => (k === "data-edit" ? field : k === "data-id" ? String(id) : null),
    value, checked: !!checked,
  } });
}
function fireDragStart(taskId) {
  els.calendar._fire("dragstart", { dataTransfer: null, target: {
    closest: (s) => (s === "[data-task-id]" ? { getAttribute: (k) => (k === "data-task-id" ? taskId : null) } : null),
  } });
}
function fireDrop(dateISO) {
  els.calendar._fire("drop", { preventDefault() {}, dataTransfer: null, target: {
    closest: (s) => (s === "[data-date]" ? { getAttribute: (k) => (k === "data-date" ? dateISO : null) } : null),
  } });
}
function firePillClick(taskId) {
  els.calendar._fire("click", { target: {
    closest: (s) => (s === "[data-task-id]" ? { getAttribute: (k) => (k === "data-task-id" ? taskId : null) } : null),
  } });
}
function report(name, teaser, launch, expectedTeaser, expectedLaunch) {
  setDates(teaser, launch);
  assert(rowHas("7) PUBLIC: teaser if GO", expectedTeaser), `${name}: teaser row did not render ${expectedTeaser}`);
  assert(rowHas("7) PUBLIC: Launch announcement", expectedLaunch), `${name}: launch row did not render ${expectedLaunch}`);
  console.log(`${name}: teaser=${teaser}, launch=${launch} -> teaser row ${expectedTeaser}, launch row ${expectedLaunch}`);
}

setTableView();
assert(tableRows() === 27, "table renders 27 rows");
report("default/static anchors", "2026-08-06", "2026-08-13", "2026-08-06", "2026-08-13");
report("teaser changed only", "2026-08-20", "2026-08-13", "2026-08-20", "2026-08-13");
report("launch changed only", "2026-08-06", "2026-08-20", "2026-08-06", "2026-08-20");
report("both anchors changed", "2026-08-20", "2026-08-27", "2026-08-20", "2026-08-27");
els.reset._fire("click");

// ---- Item-anchor downstream recompute through the UI -----------------------
setTableView();
fireEdit("offset", "product_e2e", "3"); // 4bd later than default -1
assert(rowHas("1) PRODUCT: Everything working e2e", "2026-08-11"), "parent product_e2e moved to 2026-08-11");
assert(rowHas("0) v0.16 on devnet", "2026-07-24"), "downstream v0.16 devnet followed parent (+4bd -> 2026-07-24)");
console.log("item-anchor downstream recompute verified through app.js table edit");
els.reset._fire("click");

// ---- Anchor type + external dependency are deduced, not shown --------------
setTableView();
assert(!els.tableview.innerHTML.includes('data-edit="anchor_type"') && !els.tableview.innerHTML.includes("Anchor type"), "no Anchor type control/column in the table");
assert(!els.tableview.innerHTML.includes('data-edit="dep"') && !els.tableview.innerHTML.includes("Ext. dep"), "no Ext. dep control/column in the table");
assert(els.tableview.innerHTML.includes("<optgroup") && els.tableview.innerHTML.includes(">Teaser date<") && els.tableview.innerHTML.includes(">Launch date<"), "anchor dropdown groups tasks with Teaser/Launch dates at the top");
// Re-anchoring to an item deduces item_anchor + external_dependency=true.
fireEdit("anchor_id", "email_list_ready", "landing_live");
const rean = App.state.model.find((t) => t.id === "email_list_ready");
assert(rean.anchor_type === "item_anchor" && rean.external_dependency === true, "re-anchor to item deduced item_anchor + external_dependency");
els.reset._fire("click");

// ---- Legend + pattern cues -------------------------------------------------
assert((els.legend.innerHTML.match(/legend-swatch/g) || []).length === 8, "legend renders all 8 categories");
["pat-cross", "pat-vertical", "pat-horizontal", "pat-diagonal", "pat-circle"].forEach((klass) => {
  assert(els.legend.innerHTML.includes(klass), `legend missing ${klass}`);
});
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
assert(css.includes(".pill .pill-text") && css.includes("background: rgba(255,255,255,0.9)") && app.includes("style=\"color:#111\""), "pill labels use high-contrast text treatment");
assert(css.includes(".legend-item") && css.includes("font-size: 12px"), "legend labels are explicit text, not color-only");

// ---- Drag/drop -------------------------------------------------------------
els["view-cal"]._fire("click");
fireDragStart("public_teaser"); // anchor teaser 2026-08-06; drop on 2026-08-10 (Mon) -> +2bd
fireDrop("2026-08-10");
assert(App.state.model.find((t) => t.id === "public_teaser").offset_business_days === 2, "drag/drop recomputed offset to +2 business days");
console.log("drag/drop offset recompute verified through app.js");
els.reset._fire("click");

// ---- Click-highlight (floating popup, no layout shift) ---------------------
els["view-cal"]._fire("click");
const calSkelBefore = (els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|");
firePillClick("v016_testnet"); // chain: testnet -> devnet -> product_e2e -> teaser
assert(App.state.selectedId === "v016_testnet", "click set the selected task");
assert(els.calendar.innerHTML.includes("hl-self") && els.calendar.innerHTML.includes("hl-anchor"), "highlight applied to item + anchors");
assert((els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|") === calSkelBefore, "selecting a pill does not change the calendar month/week structure");
assert(els.details._cls["details-hidden"] !== true && els.details.innerHTML.includes('id="details-drag"'), "details shown as a floating (draggable) popup");
assert(els.details.innerHTML.includes("Anchor chain") && els.details.innerHTML.includes("0) v0.16 on devnet"), "details popup shows the anchor chain");
console.log("click-highlight via floating popup (no layout shift) verified through app.js");
els.reset._fire("click");

// ---- Legend category filter (interactive) ----------------------------------
function fireLegend(cat) {
  els.legend._fire("click", { target: {
    closest: (sel) => (sel === "[data-cat]" ? { getAttribute: (k) => (k === "data-cat" ? cat : null) } : null),
  } });
}
setTableView();
assert(tableRows() === 27, "filter: all 27 rows visible before any legend selection");
// Capture the calendar structure so the filter can be shown NOT to trim weeks.
els["view-cal"]._fire("click");
const calSkelUnfiltered = (els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|");
setTableView();
fireLegend("public");
assert(tableRows() === 2, "filter: single category click narrows to that category");
assert(els.legend.innerHTML.includes('aria-pressed="true"'), "filter: selected legend item marks aria-pressed=true");
assert(els.legend.innerHTML.includes("legend-item inactive"), "filter: unselected legend items marked inactive");
els["view-cal"]._fire("click");
assert((els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|") === calSkelUnfiltered, "filter: category toggle does NOT change which weeks/days are shown");
setTableView();
fireLegend("product");
assert(tableRows() === 6, "filter: clicking another category adds it (public 2 + product 4)");
fireLegend("public");
assert(tableRows() === 4, "filter: clicking a selected category deselects it");
els.legend._fire("dblclick", { target: {} });
assert(tableRows() === 27, "filter: double-click resets to all categories visible");
console.log("legend filter: single/add/remove/double-click reset + stable week trimming verified through app.js");

// ---- Export ----------------------------------------------------------------
const exported = JSON.parse(App.exportJSON());
assert(exported.tasks.length === 27 && exported.teaser_date === "2026-08-06" && exported.version === 2, "export JSON carries the full 27-task version-2 model");
console.log("export JSON verified through app.js");

console.log(`PASS: ${pass} DOM/live-render QA assertions passed.`);
