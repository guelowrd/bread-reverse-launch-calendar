/*
 * QA scenario check for Bread Reverse Launch Calendar (wave-based graph model).
 * Documents the exact anchor inputs used in manual verification and asserts
 * business-day recalculation across the anchor graph: the single Wave 2 date
 * anchor AND item anchors (downstream chains recompute when a parent moves).
 * Run: node qa-live-recalc-check.js
 */
const M = require("./model.js");

const scenarios = [
  { name: "default anchor (Wave 2 = 2026-07-31, Fri)", wave2: "2026-07-31" },
  { name: "Wave 2 pushed one week later (Fri)", wave2: "2026-08-07" },
  { name: "Wave 2 pulled one week earlier (Fri)", wave2: "2026-07-24" },
  { name: "Wave 2 on a Monday", wave2: "2026-08-03" },
];

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function byId(result, id) { const t = M.findTask(result.tasks, id); assert(t, `missing task ${id}`); return t; }

// Independent re-implementation of the expected date: resolve each task by
// walking its anchor chain to the terminating Wave 2 date anchor, then apply
// offsets from the root outward. This is deliberately NOT the model's resolver.
function expectedDate(tasks, id, wave2) {
  const byIdMap = {};
  tasks.forEach((t) => { byIdMap[t.id] = t; });
  const chain = [];
  let cur = id;
  const seen = {};
  while (cur && byIdMap[cur] && !seen[cur]) {
    seen[cur] = true;
    chain.push(byIdMap[cur]);
    const t = byIdMap[cur];
    cur = t.anchor_type === "item_anchor" ? t.anchor_id : null;
  }
  const root = chain[chain.length - 1];
  assert(root.anchor_id === M.WAVE2_ANCHOR, `${id} chain does not terminate at the Wave 2 date anchor`);
  let date = wave2;
  for (let i = chain.length - 1; i >= 0; i--) {
    date = M.addBusinessDays(date, chain[i].offset_business_days);
  }
  return date;
}

let assertions = 0;
for (const s of scenarios) {
  const result = M.recalc({ wave2: s.wave2 });
  assert(result.tasks.length === 31, `${s.name}: expected 31 tasks`); assertions++;
  assert(result.errors.length === 0, `${s.name}: unexpected errors ${JSON.stringify(result.errors)}`); assertions++;
  for (const task of result.tasks) {
    const expected = expectedDate(M.SHIPPED_TASKS, task.id, s.wave2);
    assert(task.date === expected, `${s.name}: ${task.id} got ${task.date}, expected ${expected}`);
    assertions++;
  }
  console.log(`\n${s.name}`);
  console.log(`  inputs: wave2=${s.wave2}`);
  console.log(`  Wave 2 start: ${byId(result, "wave2_start").date}`);
  console.log(`  v0.16 chain: devnet ${byId(result, "v016_devnet").date} -> testnet ${byId(result, "v016_testnet").date} -> guardian ${byId(result, "guardian_upgrade_done").date} -> client/wallet ${byId(result, "client_wallet_done").date}`);
  console.log(`  Circle ${byId(result, "circle_announcement").date} -> website ${byId(result, "website_out").date} -> Wave 4 ${byId(result, "wave4_start").date} -> Wave 5 ${byId(result, "wave5_start").date} -> Wave 6 ${byId(result, "wave6_start").date}`);
}

// Cross-scenario: EVERY task roots at the single Wave 2 date anchor, so moving
// Wave 2 shifts the whole graph and no task is left behind.
const def = M.recalc({ wave2: "2026-07-31" });
const later = M.recalc({ wave2: "2026-08-07" });
M.SHIPPED_TASKS.forEach((task) => {
  const d0 = byId(def, task.id).date;
  const d1 = byId(later, task.id).date;
  assert(d1 === M.addBusinessDays(d0, 5), `moving Wave 2 +5bd should move ${task.id} +5bd`); assertions++;
});
console.log(`\nwhole-graph shift: moving Wave 2 +5bd shifts all 31 tasks +5bd (single rooted anchor)`);

// Item-anchor downstream recompute: move v016_devnet and confirm the v0.16 chain
// and everything downstream of testnet shifts by the same business-day delta,
// while the Wave 2 stores chain (rooted at wave2_start) is unaffected.
const moved = M.defaultModel();
M.findTask(moved, "v016_devnet").offset_business_days = -1; // 4bd later than default -5
const rm = M.recalc({ tasks: moved });
["v016_testnet", "guardian_upgrade_done", "client_wallet_done", "wave3_start", "circle_announcement", "website_out", "wave4_start", "wave6_start"].forEach((id) => {
  const want = M.addBusinessDays(byId(def, id).date, 4);
  assert(byId(rm, id).date === want, `downstream ${id} should shift +4bd to ${want}, got ${byId(rm, id).date}`);
  assertions++;
});
assert(byId(rm, "wave2_stores_live").date === byId(def, "wave2_stores_live").date, "wave2 stores chain must be unaffected by moving v016_devnet"); assertions++;
console.log(`item-anchor downstream recompute: v016_devnet +4bd shifts the v0.16 chain and all downstream waves +4bd; the Wave 2 stores chain is unaffected`);

// anchor_type is deduced from anchor_id; external_dependency is a STORED flag.
M.SHIPPED_TASKS.forEach((task) => {
  const isDate = task.anchor_id === M.WAVE2_ANCHOR;
  assert(task.anchor_type === (isDate ? "date_anchor" : "item_anchor"), `anchor_type derived for ${task.id}`); assertions++;
});
const items = M.SHIPPED_TASKS.filter((t) => t.anchor_type === "item_anchor");
assert(items.some((t) => t.external_dependency) && items.some((t) => !t.external_dependency),
  "external_dependency is a stored flag (item anchors are a mix of external and internal)"); assertions++;
console.log(`deduced/stored-field check: anchor_type derived for all ${M.SHIPPED_TASKS.length} tasks; external_dependency is a stored semantic flag`);

// Add / remove: a new task is added with a unique id and resolves; removing a
// task with dependents re-anchors them to the removed task's anchor (no dangling
// anchors) and export reflects the add/omits the remove.
const addModel = M.defaultModel();
const added = M.makeTask(addModel, { id: "qa_extra", offset: 2 });
const addModel2 = addModel.concat([added]);
assert(added.id === "qa_extra" && addModel2.length === 32, "add: new task appended with a unique stable id"); assertions++;
assert(M.recalc({ tasks: addModel2 }).errors.length === 0, "add: model still resolves cleanly"); assertions++;
assert(M.exportModel(M.DEFAULT_WAVE2, addModel2).tasks.some((t) => t.id === "qa_extra"), "add: export includes the added task"); assertions++;
const removed = M.removeTask(M.defaultModel(), "v016_testnet");
assert(removed.length === 30 && !M.findTask(removed, "v016_testnet"), "remove: task dropped from the model"); assertions++;
assert(M.findTask(removed, "wave3_start").anchor_id === "v016_devnet", "remove: dependent re-anchored to removed task's anchor (v016_devnet)"); assertions++;
assert(M.recalc({ tasks: removed }).errors.length === 0, "remove: no dangling anchors after removal"); assertions++;
assert(M.exportModel(M.DEFAULT_WAVE2, removed).tasks.every((t) => t.id !== "v016_testnet"), "remove: export omits the removed task"); assertions++;
console.log("add/remove check: add appends a unique-id task; remove re-anchors dependents with no dangling anchors");

console.log(`\nPASS: ${assertions} QA scenario assertions passed.`);
