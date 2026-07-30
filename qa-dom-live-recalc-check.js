/*
 * QA DOM scenario check for Bread Reverse Launch Calendar (wave-based v3).
 * Drives the real app.js render/event path with a tiny DOM shim to verify live
 * recalculation off the single Wave 2 date anchor, item-anchor downstream
 * recompute, drag/drop, click-highlight, the legend category filter, external-
 * dependency cues, and add/remove.
 * Run: node qa-dom-live-recalc-check.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const M = require("./model.js");

const TASK_COUNT = 31;

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
["wave2", "reset", "add-task", "make-defaults", "restore-shipped", "export",
 "view-cal", "view-table", "warnings", "legend", "details", "calendar", "tableview"]
  .forEach((id) => { const e = makeEl(id); e.classList._owner = e; els[id] = e; });
const body = makeEl("body");
const storageData = {};
const localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(storageData, k) ? storageData[k] : null),
  setItem: (k, v) => { storageData[k] = String(v); },
  removeItem: (k) => { delete storageData[k]; },
};
const document = {
  getElementById: (id) => els[id], body,
  createElement: () => ({ click() {}, style: {}, href: "", download: "" }),
};
const window = {};
const sandbox = { window, document, console, localStorage };
sandbox.global = sandbox;
vm.createContext(sandbox);
["model.js", "app.js"].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), sandbox, { filename: f }));
const App = window.BreadApp;

let pass = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg); pass++; }
function setTableView() { els["view-table"]._fire("click"); }
function setWave2(iso) { els.wave2.value = iso; els.wave2._fire("change"); }
function rowHas(label, date) {
  return els.tableview.innerHTML.includes(`<td class="date">${date}`) && els.tableview.innerHTML.includes(label);
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

// The whole graph is rooted at the single Wave 2 date, so moving that date moves
// every task by the same business-day distance. Verify Wave 2 and Wave 6 rows.
function report(name, wave2) {
  setWave2(wave2);
  const expWave2 = M.addBusinessDays(wave2, 0);
  const expWave6 = M.findTask(M.recalc({ wave2, tasks: M.defaultModel() }).tasks, "wave6_start").date;
  assert(rowHas("1) PRODUCT: Wave 2 company testing", expWave2), `${name}: Wave 2 start row did not render ${expWave2}`);
  assert(rowHas("7) PUBLIC: Wave 6 targeted push if needed", expWave6), `${name}: Wave 6 row did not render ${expWave6}`);
  console.log(`${name}: wave2=${wave2} -> Wave 2 start ${expWave2}, Wave 6 ${expWave6}`);
}

setTableView();
assert(tableRows() === TASK_COUNT, "table renders 31 rows");
report("default anchor", "2026-07-31");
report("Wave 2 moved +5bd", "2026-08-07");
report("Wave 2 moved earlier", "2026-07-20");
els.reset._fire("click");
assert(els.wave2.value === "2026-07-31", "reset restores the default Wave 2 date");

// ---- Moving the Wave 2 date shifts the ENTIRE graph by the same distance ----
const before = M.recalc({ wave2: "2026-07-31", tasks: M.defaultModel() });
setWave2("2026-08-07"); // +5 business days
const after = M.recalc({ wave2: App.state.wave2, tasks: App.state.model });
assert(
  M.SHIPPED_TASKS.every((s) => M.findTask(after.tasks, s.id).date === M.addBusinessDays(M.findTask(before.tasks, s.id).date, 5)),
  "moving the Wave 2 date shifts every task by the same +5 business days"
);
console.log("whole-graph shift off the single Wave 2 date verified through app.js");
els.reset._fire("click");

// ---- Item-anchor downstream recompute through the UI -----------------------
setTableView();
const testnetBefore = M.findTask(M.recalc({ wave2: App.state.wave2, tasks: App.state.model }).tasks, "v016_testnet").date;
fireEdit("offset", "v016_devnet", "-2"); // 3bd later than default -5
const afterEdit = M.recalc({ wave2: App.state.wave2, tasks: App.state.model });
assert(M.findTask(afterEdit.tasks, "v016_testnet").date === M.addBusinessDays(testnetBefore, 3),
  "downstream v016_testnet followed the parent (+3bd) through an app.js table edit");
assert(M.findTask(afterEdit.tasks, "wave3_start").moved === true,
  "wave3_start (anchored to testnet) is flagged moved after the parent edit");
console.log("item-anchor downstream recompute verified through app.js table edit");
els.reset._fire("click");

// ---- Anchor type deduced; external dependency shown, not editable ----------
setTableView();
assert(!els.tableview.innerHTML.includes('data-edit="anchor_type"') && !els.tableview.innerHTML.includes("Anchor type"), "no Anchor type control/column in the table");
assert(!els.tableview.innerHTML.includes('data-edit="dep"') && !els.tableview.innerHTML.includes('data-edit="external'), "external_dependency is not an editable control");
assert(els.tableview.innerHTML.includes('class="ext-mark"'), "external dependencies are marked (EXT) in the table");
assert(els.tableview.innerHTML.includes("<optgroup") && els.tableview.innerHTML.includes(">Wave 2 start<") &&
  !els.tableview.innerHTML.includes(">Teaser date<") && !els.tableview.innerHTML.includes(">Launch date<"),
  "anchor dropdown groups tasks with the single Wave 2 start date at the top");
// Re-anchoring to an item deduces item_anchor and PRESERVES the stored external flag.
const beforeExt = App.state.model.find((t) => t.id === "wave3_start").external_dependency;
fireEdit("anchor_id", "wave3_start", "v016_devnet");
const rean = App.state.model.find((t) => t.id === "wave3_start");
assert(rean.anchor_type === "item_anchor" && rean.external_dependency === beforeExt,
  "re-anchor deduces item_anchor and preserves the stored external_dependency flag");
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
fireDragStart("wave2_decision"); // anchor Wave 2 date 2026-07-31; drop on 2026-08-04 (Tue) -> +2bd
fireDrop("2026-08-04");
assert(App.state.model.find((t) => t.id === "wave2_decision").offset_business_days === 2, "drag/drop recomputed offset to +2 business days");
console.log("drag/drop offset recompute verified through app.js");
els.reset._fire("click");

// ---- Click-highlight (floating popup, no layout shift) ---------------------
els["view-cal"]._fire("click");
const calSkelBefore = (els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|");
firePillClick("v016_testnet"); // chain: testnet -> devnet -> wave2_start -> Wave 2 date
assert(App.state.selectedId === "v016_testnet", "click set the selected task");
assert(els.calendar.innerHTML.includes("hl-self") && els.calendar.innerHTML.includes("hl-anchor"), "highlight applied to item + anchors");
assert((els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|") === calSkelBefore, "selecting a pill does not change the calendar month/week structure");
assert(els.details._cls["details-hidden"] !== true && els.details.innerHTML.includes('id="details-drag"'), "details shown as a floating (draggable) popup");
assert(els.details.innerHTML.includes("Anchor chain") && els.details.innerHTML.includes("0) v0.16 on devnet") && els.details.innerHTML.includes("Wave 2 start"),
  "details popup shows the anchor chain terminating at the Wave 2 start date");
assert(els.details.innerHTML.includes("External dependency: yes"), "details popup shows the stored external-dependency flag");
console.log("click-highlight via floating popup (no layout shift) verified through app.js");
els.reset._fire("click");

// ---- Legend category filter (interactive) ----------------------------------
function fireLegend(cat) {
  els.legend._fire("click", { target: {
    closest: (sel) => (sel === "[data-cat]" ? { getAttribute: (k) => (k === "data-cat" ? cat : null) } : null),
  } });
}
const publicCount = M.SHIPPED_TASKS.filter((t) => t.category === "public").length; // 5
const productCount = M.SHIPPED_TASKS.filter((t) => t.category === "product").length; // 8
setTableView();
assert(tableRows() === TASK_COUNT, "filter: all 31 rows visible before any legend selection");
els["view-cal"]._fire("click");
const calSkelUnfiltered = (els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|");
setTableView();
fireLegend("public");
assert(tableRows() === publicCount, "filter: single category click narrows to that category");
assert(els.legend.innerHTML.includes('aria-pressed="true"'), "filter: selected legend item marks aria-pressed=true");
assert(els.legend.innerHTML.includes("legend-item inactive"), "filter: unselected legend items marked inactive");
els["view-cal"]._fire("click");
assert((els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|") === calSkelUnfiltered, "filter: category toggle does NOT change which weeks/days are shown");
setTableView();
fireLegend("product");
assert(tableRows() === publicCount + productCount, "filter: clicking another category adds it (public + product)");
fireLegend("public");
assert(tableRows() === productCount, "filter: clicking a selected category deselects it");
els.legend._fire("dblclick", { target: {} });
assert(tableRows() === TASK_COUNT, "filter: double-click resets to all categories visible");
console.log("legend filter: single/add/remove/double-click reset + stable week trimming verified through app.js");

// ---- Store submissions (Waves 2-5) are all present and resolve -------------
setTableView();
["wave2_stores_submit", "wave2_stores_live", "wave3_stores_submit", "wave3_stores_live",
 "wave4_stores_submit", "wave4_stores_live", "wave5_stores_submit", "wave5_stores_live"].forEach((id) => {
  assert(els.tableview.innerHTML.includes(`data-row-id="${id}"`), `store submission row present: ${id}`);
});
console.log("store submissions for Waves 2-5 present in the table");

// ---- Add / remove tasks through the UI -------------------------------------
function fireRemove(id) {
  body._fire("click", { target: {
    closest: (sel) => (sel === "[data-remove]" ? { getAttribute: () => String(id) } : null),
  } });
}
els["restore-shipped"]._fire("click");
setTableView();
assert(tableRows() === TASK_COUNT, "add/remove: starts at 31 rows");
els["add-task"]._fire("click");
assert(tableRows() === TASK_COUNT + 1 && App.state.model.length === TASK_COUNT + 1, "add: Add task appends a row (31 -> 32)");
const addedId = App.state.model[App.state.model.length - 1].id;
assert(JSON.parse(App.exportJSON()).tasks.some((t) => t.id === addedId), "add: added task is in the export");
fireRemove(addedId);
assert(tableRows() === TASK_COUNT && !App.state.model.some((t) => t.id === addedId), "remove: added task removed (32 -> 31)");
fireRemove("wave2_start");
assert(tableRows() === TASK_COUNT - 1 && App.state.model.find((t) => t.id === "wave2_feedback_changes").anchor_id === "wave2_date",
  "remove: removing a task with dependents re-anchors them to the removed task's anchor (Wave 2 date)");
assert(M.recalc({ wave2: App.state.wave2, tasks: App.state.model }).errors.length === 0, "remove: no dangling anchors after removal");
els["restore-shipped"]._fire("click");
setTableView();
assert(tableRows() === TASK_COUNT && !!App.state.model.find((t) => t.id === "wave2_start"), "restore shipped brings back the full 31-task model after add/remove");
console.log("add/remove tasks (unique id, dependent re-anchor, export/restore) verified through app.js");

// ---- Stale localStorage cannot mask the new defaults -----------------------
storageData["bread-calendar-model-v2"] = JSON.stringify({ teaser: "2026-08-06", launch: "2026-08-13", tasks: [{ id: "public_teaser" }] });
const staleWin = {};
const staleSandbox = { window: staleWin, document: { getElementById: (id) => els[id], body, createElement: () => ({ click() {}, style: {} }) }, console, localStorage };
staleSandbox.global = staleSandbox;
vm.createContext(staleSandbox);
["model.js", "app.js"].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), staleSandbox, { filename: f }));
assert(staleWin.BreadApp.state.model.length === TASK_COUNT, "stale pre-wave (v2) state is ignored -> shipped 31-task model");
assert(!Object.prototype.hasOwnProperty.call(storageData, "bread-calendar-model-v2"), "legacy v2 storage key is removed on load");
console.log("stale-localStorage handling verified through app.js");

// ---- Export ----------------------------------------------------------------
const exported = JSON.parse(window.BreadApp.exportJSON());
assert(exported.tasks.length === TASK_COUNT && exported.wave2_date === "2026-07-31" && exported.version === 3, "export JSON carries the full 31-task version-3 model");
console.log("export JSON verified through app.js");

console.log(`PASS: ${pass} DOM/live-render QA assertions passed.`);
