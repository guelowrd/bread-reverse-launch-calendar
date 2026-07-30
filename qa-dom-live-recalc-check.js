/*
 * QA DOM scenario check for Bread Reverse Launch Calendar (wave-based v3, four
 * date anchors). Drives the real app.js render/event path with a tiny DOM shim to
 * verify live recalculation off the four editable date anchors (each moving only
 * its own subgraph), item-anchor downstream recompute, drag/drop, click-highlight,
 * the legend category filter, the streamlined (no-EXT-badge) card treatment, and
 * add/remove.
 * Run: node qa-dom-live-recalc-check.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const M = require("./model.js");

const TASK_COUNT = 33;
const STORAGE_KEY = "bread-calendar-model-v3r2";

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
// v016_devnet_date has no control input (fixed past baseline), so it is omitted
// here to mirror the real DOM (getElementById returns undefined).
["wave2_date", "v016_testnet_date", "circle_announcement_date",
 "reset", "add-task", "make-defaults", "restore-shipped", "export",
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
function setAnchor(id, iso) { els[id].value = iso; els[id]._fire("change"); }
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

// Moving the Wave 2 date moves the Wave 2 subgraph (Wave 2 start + the Waves
// 3/4/5 chains). Verify Wave 2 start and a deep Wave 5 task through the UI.
function report(name, wave2) {
  setAnchor("wave2_date", wave2);
  const exp = M.recalc({ anchors: Object.assign(M.defaultAnchors(), { wave2_date: wave2 }), tasks: M.defaultModel() });
  const expWave2 = M.findTask(exp.tasks, "wave2_start").date;
  const expWave5 = M.findTask(exp.tasks, "wave5_stores_live").date;
  assert(rowHas("1) PRODUCT: Wave 2 company-wide testing", expWave2), `${name}: Wave 2 start row did not render ${expWave2}`);
  assert(rowHas("2) STORES: post-Wave-5 build live", expWave5), `${name}: Wave 5 store-live row did not render ${expWave5}`);
  console.log(`${name}: wave2=${wave2} -> Wave 2 start ${expWave2}, Wave 5 store-live ${expWave5}`);
}

setTableView();
assert(tableRows() === TASK_COUNT, "table renders 33 rows");
report("default anchor", "2026-07-31");
report("Wave 2 moved +5bd", "2026-08-07");
report("Wave 2 moved earlier", "2026-07-20");
els.reset._fire("click");
assert(els.wave2_date.value === "2026-07-31", "reset restores the default Wave 2 date");

// ---- Each date anchor moves ONLY its own subgraph through the UI -----------
const FIXED = {
  v016_devnet_date: ["v016_devnet"],
  v016_testnet_date: ["v016_testnet", "guardian_upgrade_done", "client_wallet_done"],
  circle_announcement_date: ["circle_announcement", "website_out", "waitlist_qa"],
};
const owned = {};
Object.keys(FIXED).forEach((aid) => FIXED[aid].forEach((id) => { owned[id] = aid; }));
const SUBGRAPHS = Object.assign({ wave2_date: M.SHIPPED_TASKS.map((t) => t.id).filter((id) => !owned[id]) }, FIXED);
// Only the CONTROL anchors have a UI date input to drive; the devnet anchor is a
// fixed past baseline with no control (its model-level subgraph independence is
// covered in verify.js / qa-live-recalc-check.js).
M.CONTROL_ANCHOR_IDS.forEach((movedAnchor) => {
  const before = M.recalc({ anchors: M.defaultAnchors(), tasks: M.defaultModel() });
  els["restore-shipped"]._fire("click");
  setAnchor(movedAnchor, M.addBusinessDays(M.defaultAnchors()[movedAnchor], 5));
  const after = M.recalc({ anchors: App.state.anchors, tasks: App.state.model });
  const members = new Set(SUBGRAPHS[movedAnchor]);
  const ok = M.SHIPPED_TASKS.every((s) => {
    const d0 = M.findTask(before.tasks, s.id).date;
    const d1 = M.findTask(after.tasks, s.id).date;
    return d1 === (members.has(s.id) ? M.addBusinessDays(d0, 5) : d0);
  });
  assert(ok, `moving ${movedAnchor} +5bd through the UI moved only its subgraph`);
});
els["restore-shipped"]._fire("click");
console.log("per-anchor subgraph independence verified through app.js (each control date anchor moves only its own chain)");

// ---- Devnet date control hidden, task still present + movable ---------------
assert(M.CONTROL_ANCHOR_IDS.length === 3 && M.CONTROL_ANCHOR_IDS.indexOf("v016_devnet_date") === -1,
  "v016_devnet_date is not a control anchor (no UI date input)");
assert(!els["v016_devnet_date"], "the devnet date input is absent from the DOM");
setTableView();
assert(els.tableview.innerHTML.includes('data-row-id="v016_devnet"'), "devnet task row is still present in the table");
assert(App.state.model.find((t) => t.id === "v016_devnet").anchor_id === "v016_devnet_date", "devnet task keeps its v016_devnet_date anchor");
const devBefore = M.findTask(M.recalc({ anchors: App.state.anchors, tasks: App.state.model }).tasks, "v016_devnet").date;
fireEdit("offset", "v016_devnet", "-3"); // 3bd earlier than its fixed baseline
const devAfter = M.recalc({ anchors: App.state.anchors, tasks: App.state.model });
assert(M.findTask(devAfter.tasks, "v016_devnet").date === M.addBusinessDays(devBefore, -3),
  "devnet task is still movable via its offset (no date control needed)");
assert(JSON.parse(App.exportJSON()).v016_devnet_date === "2026-07-17", "export still round-trips the fixed devnet baseline date");
els["restore-shipped"]._fire("click");
console.log("devnet date control hidden; devnet task present, movable, and its anchor date still exported");

// ---- Item-anchor downstream recompute through the UI -----------------------
setTableView();
const clientBefore = M.findTask(M.recalc({ anchors: App.state.anchors, tasks: App.state.model }).tasks, "client_wallet_done").date;
fireEdit("offset", "guardian_upgrade_done", "1"); // 3bd later than default -2
const afterEdit = M.recalc({ anchors: App.state.anchors, tasks: App.state.model });
assert(M.findTask(afterEdit.tasks, "client_wallet_done").date === M.addBusinessDays(clientBefore, 3),
  "downstream client_wallet_done followed the parent (+3bd) through an app.js table edit");
assert(M.findTask(afterEdit.tasks, "client_wallet_done").moved === true,
  "client_wallet_done is flagged moved after the parent edit");
console.log("item-anchor downstream recompute verified through app.js table edit");
els.reset._fire("click");

// ---- Anchor type deduced; external dependency stored (no EXT badge) --------
setTableView();
assert(!els.tableview.innerHTML.includes('data-edit="anchor_type"') && !els.tableview.innerHTML.includes("Anchor type"), "no Anchor type control/column in the table");
assert(!els.tableview.innerHTML.includes('data-edit="dep"') && !els.tableview.innerHTML.includes('data-edit="external'), "external_dependency is not an editable control");
assert(!els.tableview.innerHTML.includes('class="ext-mark"') && !els.tableview.innerHTML.includes(">EXT<"), "no EXT badge/mark in the table (streamlined cleanup)");
assert(els.tableview.innerHTML.includes('<optgroup label="Date anchors">') &&
  els.tableview.innerHTML.includes(">Wave 2 start<") && els.tableview.innerHTML.includes(">Circle announcement<") &&
  !els.tableview.innerHTML.includes(">Teaser date<") && !els.tableview.innerHTML.includes(">Launch date<"),
  "anchor dropdown groups the four date anchors under 'Date anchors'");
// Re-anchoring to an item deduces item_anchor and PRESERVES the stored external flag.
const beforeExt = App.state.model.find((t) => t.id === "wave3_start").external_dependency;
fireEdit("anchor_id", "wave3_start", "v016_devnet");
const rean = App.state.model.find((t) => t.id === "wave3_start");
assert(rean.anchor_type === "item_anchor" && rean.external_dependency === beforeExt,
  "re-anchor deduces item_anchor and preserves the stored external_dependency flag");
els.reset._fire("click");

// ---- Legend + streamlined swatches -----------------------------------------
assert((els.legend.innerHTML.match(/legend-swatch/g) || []).length === 8, "legend renders all 8 categories");
["pat-cross", "pat-vertical", "pat-horizontal", "pat-diagonal", "pat-circle"].forEach((klass) => {
  assert(!els.legend.innerHTML.includes(klass), `legend must not use decorative pattern ${klass}`);
});
assert(els.legend.innerHTML.includes("border-left-color:"), "legend swatches use the soft-tint + left-accent treatment");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
assert(css.includes(".pill") && css.includes("border-left") && css.includes("--card-outline"), "pills use a consistent left-accent + neutral outline card treatment");
assert(css.includes(":focus-visible"), "focus-visible states preserved for accessibility");
assert(!css.includes(".badge.ext") && !app.includes(">EXT<"), "no EXT badge styling/markup remains");
assert(els.calendar.innerHTML.includes("WAVE 2") && els.calendar.innerHTML.includes("DEVNET") &&
  els.calendar.innerHTML.includes("TESTNET") && els.calendar.innerHTML.includes("CIRCLE"), "all four anchor chips render on the calendar");

// ---- Drag/drop -------------------------------------------------------------
els["view-cal"]._fire("click");
fireDragStart("wave2_decision"); // anchor wave2_start 2026-07-31; drop on 2026-08-04 (Tue) -> +2bd
fireDrop("2026-08-04");
assert(App.state.model.find((t) => t.id === "wave2_decision").offset_business_days === 2, "drag/drop recomputed offset to +2 business days");
console.log("drag/drop offset recompute verified through app.js");
els.reset._fire("click");

// ---- Click-highlight (floating popup, no layout shift) ---------------------
els["view-cal"]._fire("click");
const calSkelBefore = (els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|");
firePillClick("client_wallet_done"); // chain: client -> guardian -> testnet -> v0.16 testnet date
assert(App.state.selectedId === "client_wallet_done", "click set the selected task");
assert(els.calendar.innerHTML.includes("hl-self") && els.calendar.innerHTML.includes("hl-anchor"), "highlight applied to item + anchors");
assert(els.calendar.innerHTML.includes("hl-anchor-cell"), "terminating testnet anchor cell highlighted");
assert((els.calendar.innerHTML.match(/class="daynum[^"]*">\d+</g) || []).join("|") === calSkelBefore, "selecting a pill does not change the calendar month/week structure");
assert(els.details._cls["details-hidden"] !== true && els.details.innerHTML.includes('id="details-drag"'), "details shown as a floating (draggable) popup");
assert(els.details.innerHTML.includes("Anchor chain") && els.details.innerHTML.includes("0) Guardian upgrade done") && els.details.innerHTML.includes("v0.16 testnet"),
  "details popup shows the anchor chain terminating at the v0.16 testnet date anchor");
assert(els.details.innerHTML.includes("External dependency: yes"), "details popup shows the stored external-dependency flag");
console.log("click-highlight via floating popup (no layout shift) verified through app.js");
els.reset._fire("click");

// ---- Legend category filter (interactive) ----------------------------------
function fireLegend(cat) {
  els.legend._fire("click", { target: {
    closest: (sel) => (sel === "[data-cat]" ? { getAttribute: (k) => (k === "data-cat" ? cat : null) } : null),
  } });
}
const publicCount = M.SHIPPED_TASKS.filter((t) => t.category === "public").length; // 3
const productCount = M.SHIPPED_TASKS.filter((t) => t.category === "product").length; // 10
setTableView();
assert(tableRows() === TASK_COUNT, "filter: all 33 rows visible before any legend selection");
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

// ---- Store submissions + decisions (Waves 2-5) present and resolve ---------
setTableView();
["wave2_stores_submit", "wave2_stores_live", "wave3_stores_submit", "wave3_stores_live",
 "wave4_stores_submit", "wave4_stores_live", "wave5_stores_submit", "wave5_stores_live",
 "wave3_decision", "wave4_decision", "wave5_decision"].forEach((id) => {
  assert(els.tableview.innerHTML.includes(`data-row-id="${id}"`), `row present: ${id}`);
});
assert(!els.tableview.innerHTML.includes('data-row-id="wave6_start"'), "wave6_start removed from the model");
console.log("store submissions + Wave 3/4/5 decisions present in the table; wave6 gone");

// ---- Add / remove tasks through the UI -------------------------------------
function fireRemove(id) {
  body._fire("click", { target: {
    closest: (sel) => (sel === "[data-remove]" ? { getAttribute: () => String(id) } : null),
  } });
}
els["restore-shipped"]._fire("click");
setTableView();
assert(tableRows() === TASK_COUNT, "add/remove: starts at 33 rows");
els["add-task"]._fire("click");
assert(tableRows() === TASK_COUNT + 1 && App.state.model.length === TASK_COUNT + 1, "add: Add task appends a row (33 -> 34)");
const addedId = App.state.model[App.state.model.length - 1].id;
assert(JSON.parse(App.exportJSON()).tasks.some((t) => t.id === addedId), "add: added task is in the export");
fireRemove(addedId);
assert(tableRows() === TASK_COUNT && !App.state.model.some((t) => t.id === addedId), "remove: added task removed (34 -> 33)");
fireRemove("wave2_start");
assert(tableRows() === TASK_COUNT - 1 && App.state.model.find((t) => t.id === "wave2_feedback_changes").anchor_id === "wave2_date",
  "remove: removing a task with dependents re-anchors them to the removed task's anchor (Wave 2 date)");
assert(M.recalc({ anchors: App.state.anchors, tasks: App.state.model }).errors.length === 0, "remove: no dangling anchors after removal");
els["restore-shipped"]._fire("click");
setTableView();
assert(tableRows() === TASK_COUNT && !!App.state.model.find((t) => t.id === "wave2_start"), "restore shipped brings back the full 33-task model after add/remove");
console.log("add/remove tasks (unique id, dependent re-anchor, export/restore) verified through app.js");

// ---- Stale localStorage cannot mask the new defaults -----------------------
// Prior-release single-anchor v3 payload + pre-wave v2 payload are both ignored.
storageData["bread-calendar-model-v3"] = JSON.stringify({ schema: 3, wave2: "2026-07-31", tasks: [{ id: "wave6_start" }] });
storageData["bread-calendar-model-v2"] = JSON.stringify({ teaser: "2026-08-06", launch: "2026-08-13", tasks: [{ id: "public_teaser" }] });
const staleWin = {};
const staleSandbox = { window: staleWin, document: { getElementById: (id) => els[id], body, createElement: () => ({ click() {}, style: {} }) }, console, localStorage };
staleSandbox.global = staleSandbox;
vm.createContext(staleSandbox);
["model.js", "app.js"].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), staleSandbox, { filename: f }));
assert(staleWin.BreadApp.state.model.length === TASK_COUNT, "stale prior-release state is ignored -> shipped 33-task model");
assert(!Object.prototype.hasOwnProperty.call(storageData, "bread-calendar-model-v3") && !Object.prototype.hasOwnProperty.call(storageData, "bread-calendar-model-v2"),
  "legacy storage keys (single-anchor v3 + pre-wave v2) are removed on load");
console.log("stale-localStorage handling verified through app.js");

// ---- Export ----------------------------------------------------------------
const exported = JSON.parse(window.BreadApp.exportJSON());
assert(exported.tasks.length === TASK_COUNT && exported.version === 3 &&
  exported.wave2_date === "2026-07-31" && exported.v016_devnet_date === "2026-07-17" &&
  exported.v016_testnet_date === "2026-08-05" && exported.circle_announcement_date === "2026-08-12",
  "export JSON carries the full 33-task version-3 model with four anchors");
console.log("export JSON verified through app.js");

console.log(`PASS: ${pass} DOM/live-render QA assertions passed.`);
