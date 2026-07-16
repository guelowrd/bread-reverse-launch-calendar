/*
 * QA scenario check for Bread Reverse Launch Calendar (graph model).
 * Documents the exact anchor inputs used in manual verification and asserts
 * business-day recalculation across the anchor graph: date anchors AND item
 * anchors (downstream chains recompute when a parent moves).
 * Run: node qa-live-recalc-check.js
 */
const M = require("./model.js");

const scenarios = [
  { name: "default/static anchors", teaser: "2026-08-06", launch: "2026-08-13" },
  { name: "teaser changed only", teaser: "2026-08-20", launch: "2026-08-13" },
  { name: "launch changed only", teaser: "2026-08-06", launch: "2026-08-20" },
  { name: "both anchors changed", teaser: "2026-08-20", launch: "2026-08-27" },
];

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function byId(result, id) { const t = M.findTask(result.tasks, id); assert(t, `missing task ${id}`); return t; }

// Independent re-implementation of the expected date: resolve each task by
// walking its anchor chain to the terminating date anchor, then apply offsets
// from the root outward. This is deliberately NOT the model's resolver.
function expectedDate(tasks, id, teaser, launch) {
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
  let date = root.anchor_id === M.TEASER_ANCHOR ? teaser : launch;
  // Apply offsets from the root down to the requested task.
  for (let i = chain.length - 1; i >= 0; i--) {
    date = M.addBusinessDays(date, chain[i].offset_business_days);
  }
  return date;
}

let assertions = 0;
for (const s of scenarios) {
  const result = M.recalc({ teaser: s.teaser, launch: s.launch });
  assert(result.tasks.length === 27, `${s.name}: expected 27 tasks`); assertions++;
  assert(result.errors.length === 0, `${s.name}: unexpected errors ${JSON.stringify(result.errors)}`); assertions++;
  for (const task of result.tasks) {
    const expected = expectedDate(M.SHIPPED_TASKS, task.id, s.teaser, s.launch);
    assert(task.date === expected, `${s.name}: ${task.id} got ${task.date}, expected ${expected}`);
    assertions++;
  }
  console.log(`\n${s.name}`);
  console.log(`  inputs: teaser=${s.teaser}, launch=${s.launch}`);
  console.log(`  teaser milestone (public teaser): ${byId(result, "public_teaser").date}`);
  console.log(`  launch milestone (public launch): ${byId(result, "public_launch").date}`);
  console.log(`  v0.16 chain: devnet ${byId(result, "v016_devnet").date} -> testnet ${byId(result, "v016_testnet").date} -> guardian ${byId(result, "guardian_upgrade_done").date} -> client/wallet ${byId(result, "client_wallet_done").date}`);
}

// Root date anchor per task.
function rootAnchor(id) {
  const chain = M.anchorChain(M.SHIPPED_TASKS, id);
  const last = M.findTask(M.SHIPPED_TASKS, chain[chain.length - 1]);
  return last.anchor_id === M.TEASER_ANCHOR ? "teaser" : "launch";
}

// Cross-scenario independence: teaser-rooted chains follow the teaser; launch-
// rooted chains follow the launch; each is independent of the other anchor.
const def = M.recalc({ teaser: "2026-08-06", launch: "2026-08-13" });
const teaserOnly = M.recalc({ teaser: "2026-08-20", launch: "2026-08-13" });
const launchOnly = M.recalc({ teaser: "2026-08-06", launch: "2026-08-20" });

M.SHIPPED_TASKS.forEach((task) => {
  const root = rootAnchor(task.id);
  const d = byId(def, task.id).date;
  if (root === "teaser") {
    assert(byId(teaserOnly, task.id).date !== d, `teaser-only should move teaser-rooted ${task.id}`); assertions++;
    assert(byId(launchOnly, task.id).date === d, `launch-only should not move teaser-rooted ${task.id}`); assertions++;
  } else {
    assert(byId(teaserOnly, task.id).date === d, `teaser-only should not move launch-rooted ${task.id}`); assertions++;
    assert(byId(launchOnly, task.id).date !== d, `launch-only should move launch-rooted ${task.id}`); assertions++;
  }
});

// Item-anchor downstream recompute: move product_e2e and confirm the whole
// v0.16 chain shifts by the same business-day delta.
const moved = M.defaultModel();
M.findTask(moved, "product_e2e").offset_business_days = 3; // 4bd later than default -1
const rm = M.recalc({ tasks: moved });
["v016_devnet", "v016_testnet", "guardian_upgrade_done", "client_wallet_done"].forEach((id) => {
  const want = M.addBusinessDays(byId(def, id).date, 4);
  assert(byId(rm, id).date === want, `downstream ${id} should shift +4bd to ${want}, got ${byId(rm, id).date}`);
  assertions++;
});
console.log(`\nitem-anchor downstream recompute: product_e2e +4bd shifts the whole v0.16 chain +4bd`);

// external_dependency + anchor_type are deduced from anchor_id (never user-set).
M.SHIPPED_TASKS.forEach((task) => {
  const isDate = task.anchor_id === M.TEASER_ANCHOR || task.anchor_id === M.LAUNCH_ANCHOR;
  assert(task.anchor_type === (isDate ? "date_anchor" : "item_anchor"), `anchor_type derived for ${task.id}`); assertions++;
  assert(task.external_dependency === !isDate, `external_dependency derived for ${task.id}`); assertions++;
});
console.log(`deduced-field check: anchor_type + external_dependency derived from anchor_id for all ${M.SHIPPED_TASKS.length} tasks`);

console.log(`\nPASS: ${assertions} QA scenario assertions passed.`);
