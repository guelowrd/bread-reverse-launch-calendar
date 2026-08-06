/*
 * QA scenario check for Bread Reverse Launch Calendar (wave-based graph model,
 * four date anchors). Documents the exact anchor inputs used in manual
 * verification and asserts business-day recalculation across the anchor graph:
 * the four date anchors (two editable in the top strip -- v0.16 testnet and Circle
 * -- plus the hidden Wave 2 / devnet past baselines) AND item anchors (downstream
 * chains recompute when a parent moves), and that each date anchor moves ONLY its
 * own subgraph.
 * Run: node qa-live-recalc-check.js
 */
const M = require("./model.js");

const D = M.defaultAnchors();
const scenarios = [
  { name: "default anchors", anchors: D },
  { name: "Wave 2 pushed one week later", anchors: Object.assign({}, D, { wave2_date: "2026-08-07" }) },
  { name: "Wave 2 pulled one week earlier", anchors: Object.assign({}, D, { wave2_date: "2026-07-24" }) },
  { name: "v0.16 testnet slips +3bd", anchors: Object.assign({}, D, { v016_testnet_date: "2026-08-10" }) },
  { name: "Circle announcement moves +5bd", anchors: Object.assign({}, D, { circle_announcement_date: "2026-08-19" }) },
  { name: "v0.16 devnet pulled earlier", anchors: Object.assign({}, D, { v016_devnet_date: "2026-07-10" }) },
];

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function byId(result, id) { const t = M.findTask(result.tasks, id); assert(t, `missing task ${id}`); return t; }

// Independent re-implementation of the expected date: resolve each task by
// walking its anchor chain to the terminating DATE anchor, then apply offsets
// from the root outward. This is deliberately NOT the model's resolver.
function expectedDate(tasks, id, anchors) {
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
  assert(root.anchor_type === "date_anchor" && M.isDateAnchorId(root.anchor_id), `${id} chain does not terminate at a date anchor`);
  let date = anchors[root.anchor_id];
  for (let i = chain.length - 1; i >= 0; i--) {
    date = M.addBusinessDays(date, chain[i].offset_business_days);
  }
  return date;
}

let assertions = 0;
for (const s of scenarios) {
  const result = M.recalc({ anchors: s.anchors });
  assert(result.tasks.length === 33, `${s.name}: expected 33 tasks`); assertions++;
  assert(result.errors.length === 0, `${s.name}: unexpected errors ${JSON.stringify(result.errors)}`); assertions++;
  for (const task of result.tasks) {
    const expected = expectedDate(M.SHIPPED_TASKS, task.id, s.anchors);
    assert(task.date === expected, `${s.name}: ${task.id} got ${task.date}, expected ${expected}`);
    assertions++;
  }
  console.log(`\n${s.name}`);
  console.log(`  anchors: ${M.DATE_ANCHOR_IDS.map((id) => id + "=" + s.anchors[id]).join(", ")}`);
  console.log(`  Wave 2 start: ${byId(result, "wave2_start").date} -> Wave 3 ${byId(result, "wave3_start").date} -> Wave 4 ${byId(result, "wave4_start").date} -> Wave 5 ${byId(result, "wave5_start").date}`);
  console.log(`  v0.16: devnet ${byId(result, "v016_devnet").date}, testnet ${byId(result, "v016_testnet").date} -> guardian ${byId(result, "guardian_upgrade_done").date} -> client/wallet ${byId(result, "client_wallet_done").date}`);
  console.log(`  Circle ${byId(result, "circle_announcement").date} -> website ${byId(result, "website_out").date} -> waitlist QA ${byId(result, "waitlist_qa").date}`);
}

// ---- Each date anchor moves ONLY its dependent subgraph --------------------
// Subgraphs owned by the three "fixed" anchors; wave2_date owns everything else.
const FIXED = {
  v016_devnet_date: ["v016_devnet"],
  v016_testnet_date: ["v016_testnet", "guardian_upgrade_done", "client_wallet_done"],
  circle_announcement_date: ["circle_announcement", "website_out", "waitlist_qa", "visual_identity_board"],
};
const def = M.recalc({ anchors: D });
const owned = {};
Object.keys(FIXED).forEach((aid) => FIXED[aid].forEach((id) => { owned[id] = aid; }));
const SUBGRAPHS = Object.assign(
  { wave2_date: M.SHIPPED_TASKS.map((t) => t.id).filter((id) => !owned[id]) },
  FIXED
);
M.DATE_ANCHOR_IDS.forEach((movedAnchor) => {
  const members = new Set(SUBGRAPHS[movedAnchor]);
  const anchors = Object.assign({}, D, { [movedAnchor]: M.addBusinessDays(D[movedAnchor], 5) });
  const r = M.recalc({ anchors });
  M.SHIPPED_TASKS.forEach((task) => {
    const d0 = byId(def, task.id).date;
    const d1 = byId(r, task.id).date;
    const want = members.has(task.id) ? M.addBusinessDays(d0, 5) : d0;
    assert(d1 === want, `moving ${movedAnchor} +5bd: ${task.id} should be ${want}, got ${d1}`);
    assertions++;
  });
});
console.log(`\nsubgraph independence: each of the four date anchors moves ONLY its dependent subgraph (${SUBGRAPHS.wave2_date.length}/1/3/4 tasks); the other chains stay put`);

// Item-anchor downstream recompute: move guardian_upgrade_done and confirm
// client_wallet_done shifts by the same delta, while the Wave 2 chain and the
// devnet/circle chains are unaffected.
const moved = M.defaultModel();
M.findTask(moved, "guardian_upgrade_done").offset_business_days = 1; // 3bd later than default -2
const rm = M.recalc({ tasks: moved });
assert(byId(rm, "client_wallet_done").date === M.addBusinessDays(byId(def, "client_wallet_done").date, 3),
  "client_wallet_done should shift +3bd when guardian moves"); assertions++;
assert(byId(rm, "v016_testnet").date === byId(def, "v016_testnet").date, "testnet (date-anchored parent) unaffected"); assertions++;
assert(byId(rm, "wave2_stores_live").date === byId(def, "wave2_stores_live").date, "Wave 2 chain unaffected by moving guardian"); assertions++;
console.log(`item-anchor downstream recompute: guardian +3bd shifts client/wallet +3bd; the testnet anchor and other chains are unaffected`);

// anchor_type is deduced from anchor_id; external_dependency is a STORED flag.
M.SHIPPED_TASKS.forEach((task) => {
  const isDate = M.isDateAnchorId(task.anchor_id);
  assert(task.anchor_type === (isDate ? "date_anchor" : "item_anchor"), `anchor_type derived for ${task.id}`); assertions++;
});
const items = M.SHIPPED_TASKS.filter((t) => t.anchor_type === "item_anchor");
assert(items.some((t) => t.external_dependency) && items.some((t) => !t.external_dependency),
  "external_dependency is a stored flag (item anchors are a mix of external and internal)"); assertions++;
assert(M.DATE_ANCHOR_IDS.length === 4, "exactly four date anchors in the model"); assertions++;
assert(M.CONTROL_ANCHOR_IDS.length === 2 &&
  M.CONTROL_ANCHOR_IDS.join(",") === "v016_testnet_date,circle_announcement_date",
  "exactly two editable control anchors, v0.16 testnet then Circle"); assertions++;
assert(M.CONTROL_ANCHOR_IDS.indexOf("v016_devnet_date") === -1 && M.CONTROL_ANCHOR_IDS.indexOf("wave2_date") === -1,
  "Wave 2 start and v0.16 devnet (past baselines) are not controls"); assertions++;
assert(M.isDateAnchorId("v016_devnet_date") && M.defaultAnchors().v016_devnet_date === "2026-07-17",
  "v016_devnet_date remains a valid, exported date anchor even without a control"); assertions++;
assert(M.isDateAnchorId("wave2_date") && M.defaultAnchors().wave2_date === "2026-07-31",
  "wave2_date remains a valid, exported date anchor even without a control"); assertions++;
console.log(`deduced/stored-field check: anchor_type derived for all ${M.SHIPPED_TASKS.length} tasks; external_dependency is a stored semantic flag; four date anchors (two editable)`);

// Add / remove: a new task is added with a unique id and resolves; removing a
// task with dependents re-anchors them to the removed task's anchor (no dangling
// anchors) and export reflects the add/omits the remove.
const addModel = M.defaultModel();
const added = M.makeTask(addModel, { id: "qa_extra", offset: 2 });
const addModel2 = addModel.concat([added]);
assert(added.id === "qa_extra" && addModel2.length === 34, "add: new task appended with a unique stable id"); assertions++;
assert(M.recalc({ tasks: addModel2 }).errors.length === 0, "add: model still resolves cleanly"); assertions++;
assert(M.exportModel(D, addModel2).tasks.some((t) => t.id === "qa_extra"), "add: export includes the added task"); assertions++;
const removed = M.removeTask(M.defaultModel(), "v016_testnet");
assert(removed.length === 32 && !M.findTask(removed, "v016_testnet"), "remove: task dropped from the model"); assertions++;
assert(M.findTask(removed, "guardian_upgrade_done").anchor_id === "v016_testnet_date", "remove: dependent re-anchored to removed task's anchor (v016_testnet_date)"); assertions++;
assert(M.recalc({ tasks: removed }).errors.length === 0, "remove: no dangling anchors after removal"); assertions++;
assert(M.exportModel(D, removed).tasks.every((t) => t.id !== "v016_testnet"), "remove: export omits the removed task"); assertions++;
console.log("add/remove check: add appends a unique-id task; remove re-anchors dependents with no dangling anchors");

// Export preserves the four anchors + version 3 + stored external_dependency.
const ex = M.exportModel(D, M.defaultModel());
assert(ex.version === 3 && ex.tasks.length === 33 &&
  ex.wave2_date === "2026-07-31" && ex.v016_devnet_date === "2026-07-17" &&
  ex.v016_testnet_date === "2026-08-05" && ex.circle_announcement_date === "2026-08-12", "export carries version 3 + four anchors + 33 tasks"); assertions++;
assert(ex.tasks.some((t) => t.external_dependency === true), "export preserves external_dependency data"); assertions++;

console.log(`\nPASS: ${assertions} QA scenario assertions passed.`);
