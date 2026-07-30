/*
 * Deterministic verification for the Bread reverse calendar task/date model
 * (wave-based v3, four date anchors). Run: node verify.js   (exit 0 = all pass).
 *
 * Covers the wave-based graph model:
 *  0. Shipped defaults match the authoritative v3 JSON (baseline-model.json)
 *     EXACTLY (version 3, the FOUR date anchors, every task field including the
 *     stored external_dependency).
 *  1. The four anchors reproduce every task's expected date (date AND item
 *     anchors, including forward references).
 *  2. Exactly 33 tasks, each with a stable id distinct from its label.
 *  3. anchor_type is DERIVED from anchor_id; external_dependency is a STORED flag.
 *  4. Business-day arithmetic (forward/back across weekends, weekend anchors).
 *  5. Item anchors: moving a parent recomputes the whole downstream chain; a
 *     sibling chain rooted elsewhere is unaffected.
 *  6. Each of the FOUR date anchors moves ONLY its dependent subgraph; the other
 *     three chains are unchanged (no single master anchor).
 *  7. Forward references resolve (anchor defined later in the array).
 *  8. The v0.16 chain resolves through the testnet date anchor + item anchors.
 *  9. Cycle detection flags every member unresolved.
 * 10. Invalid anchor id is detected and reported (not thrown).
 * 11. The model is quiet at defaults and only surfaces unresolved-anchor errors;
 *     no legacy teaser/launch/single-anchor API remains.
 * 12. Editing: label / category / anchor (type re-derived, external preserved) /
 *     offset.
 * 13. Defaults: promoteToDefaults + resetToDefaults round-trip (incl. external).
 * 14. Export model (version 3, four date anchors) includes labels, anchors,
 *     offsets, external_dependency, and defaults.
 * 15. Wave labels present (incl. Wave 2 company-wide testing, "changes applied",
 *     Wave 3/4/5 decisions); old wave6 / single-anchor-era labels gone.
 * 16. Every label carries "{n}) " and category prefixes are contiguous 0..7.
 * 17. anchorChain / terminalDateAnchor walk up to the correct date anchor.
 * 18. Add / remove tasks (unique ids, dependent re-anchor, export/reset).
 * 19. Every supplied anchor_id resolves after the full graph loads.
 */
var M = require("./model.js");
var fs = require("fs");
var path = require("path");

var pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}
function byId(result, id) { return M.findTask(result.tasks, id); }

var TASK_COUNT = 33;
var ANCHOR_COUNT = 4;

// Expected default-resolved dates for all 33 tasks.
var EXPECT = {
  v016_devnet: "2026-07-17",
  wave2_decision: "2026-07-30",
  support_ready: "2026-07-30",
  wave2_start: "2026-07-31",
  wave2_feedback_changes: "2026-08-05",
  wave2_stores_submit: "2026-08-05",
  wave2_stores_live: "2026-08-06",
  guardian_upgrade_done: "2026-08-03",
  v016_testnet: "2026-08-05",
  client_wallet_done: "2026-08-07",
  wave3_decision: "2026-08-07",
  wave3_recruiting_ready: "2026-08-07",
  wave3_start: "2026-08-10",
  wave3_feedback_changes: "2026-08-13",
  wave3_stores_submit: "2026-08-13",
  wave3_stores_live: "2026-08-14",
  circle_announcement: "2026-08-12",
  waitlist_qa: "2026-08-11",
  website_out: "2026-08-12",
  visual_identity_board: "2026-08-07",
  teaser_final: "2026-08-17",
  wave4_comms_ready: "2026-08-17",
  wave4_decision: "2026-08-17",
  wave4_start: "2026-08-18",
  wave4_feedback_changes: "2026-08-21",
  wave4_stores_submit: "2026-08-21",
  wave4_stores_live: "2026-08-24",
  wave5_comms_ready: "2026-08-25",
  wave5_decision: "2026-08-25",
  wave5_start: "2026-08-26",
  wave5_feedback_changes: "2026-08-31",
  wave5_stores_submit: "2026-08-31",
  wave5_stores_live: "2026-09-01"
};

// Independent subgraph membership per date anchor (the tasks that MUST move when
// that anchor moves, and only those). wave2_date owns everything not owned by the
// other three anchors.
var FIXED_SUBGRAPHS = {
  v016_devnet_date: ["v016_devnet"],
  v016_testnet_date: ["v016_testnet", "guardian_upgrade_done", "client_wallet_done"],
  circle_announcement_date: ["circle_announcement", "website_out", "waitlist_qa"]
};

console.log("Test 0: shipped defaults match the authoritative v3 JSON (baseline-model.json) exactly");
var baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "baseline-model.json"), "utf8"));
var shipped = M.exportModel(M.defaultAnchors(), M.defaultModel());
check("baseline is version 3", baseline.version === 3, "got " + baseline.version);
check("shipped export is version 3", shipped.version === 3);
check("baseline has 33 tasks", baseline.tasks.length === TASK_COUNT, "got " + baseline.tasks.length);
check("baseline carries all four date anchors",
  baseline.wave2_date === "2026-07-31" && baseline.v016_devnet_date === "2026-07-17" &&
  baseline.v016_testnet_date === "2026-08-05" && baseline.circle_announcement_date === "2026-08-12");
M.DATE_ANCHOR_IDS.forEach(function (id) {
  check("shipped anchor " + id + " matches baseline", shipped[id] === baseline[id], shipped[id] + " vs " + baseline[id]);
});
check("no teaser/launch fields in baseline", !("teaser_date" in baseline) && !("launch_date" in baseline));
var baselineById = {};
baseline.tasks.forEach(function (t) { baselineById[t.id] = t; });
var shippedById = {};
shipped.tasks.forEach(function (t) { shippedById[t.id] = t; });
check("shipped and baseline have identical id sets", shipped.tasks.length === baseline.tasks.length &&
  shipped.tasks.every(function (t) { return !!baselineById[t.id]; }));
var FIELDS = ["label", "category", "anchor_type", "anchor_id", "offset_business_days", "external_dependency",
  "default_label", "default_category", "default_anchor_type", "default_anchor_id",
  "default_offset_business_days", "default_external_dependency"];
baseline.tasks.forEach(function (b) {
  var s = shippedById[b.id];
  if (!s) { check("baseline id still shipped: " + b.id, false); return; }
  FIELDS.forEach(function (f) {
    check(b.id + "." + f + " matches baseline", s[f] === b[f], JSON.stringify(s[f]) + " vs " + JSON.stringify(b[f]));
  });
  check("shipped label uses '{n}) ' separator: " + b.id, /^\d+\) /.test(s.label), s.label);
});

console.log("\nTest 1: the four anchors reproduce expected dates (date AND item anchors)");
var base = M.recalc({});
Object.keys(EXPECT).forEach(function (id) {
  var t = byId(base, id);
  check(id + " = " + EXPECT[id], t && t.date === EXPECT[id], t && ("got " + t.date));
});
check("no resolution errors at defaults", base.errors.length === 0, JSON.stringify(base.errors));
check("every expected id is a real task (no typo)", Object.keys(EXPECT).every(function (id) { return !!byId(base, id); }));
check("EXPECT covers all 33 tasks", Object.keys(EXPECT).length === TASK_COUNT);

console.log("\nTest 2: exactly 33 tasks, stable ids != labels");
check(TASK_COUNT + " tasks", base.tasks.length === TASK_COUNT, "got " + base.tasks.length);
var ids = {};
base.tasks.forEach(function (t) {
  check("id present & unique: " + t.id, !!t.id && !ids[t.id]); ids[t.id] = true;
  check("id differs from label: " + t.id, t.id !== t.label);
});
// Newly added decision tasks + removed wave6.
["wave3_decision", "wave4_decision", "wave5_decision"].forEach(function (id) {
  check("new decision task present: " + id, !!byId(base, id));
});
check("wave6_start removed from the model", !byId(base, "wave6_start"));

console.log("\nTest 3: anchor_type derived from anchor_id; external_dependency stored; four date anchors");
check("model exposes exactly four date anchors", M.DATE_ANCHOR_IDS.length === ANCHOR_COUNT &&
  M.DATE_ANCHOR_IDS.join(",") === "wave2_date,v016_devnet_date,v016_testnet_date,circle_announcement_date");
base.tasks.forEach(function (t) {
  var wantType = M.isDateAnchorId(t.anchor_id) ? "date_anchor" : "item_anchor";
  check("anchor_type derived for " + t.id, t.anchor_type === wantType, "got " + t.anchor_type);
});
// Each date anchor is used by at least one date-anchored task.
M.DATE_ANCHOR_IDS.forEach(function (aid) {
  check("date anchor " + aid + " is used by a task", base.tasks.some(function (t) { return t.anchor_type === "date_anchor" && t.anchor_id === aid; }));
});
var itemAnchored = base.tasks.filter(function (t) { return t.anchor_type === "item_anchor"; });
check("some item-anchored tasks are external", itemAnchored.some(function (t) { return t.external_dependency; }));
check("some item-anchored tasks are NOT external", itemAnchored.some(function (t) { return !t.external_dependency; }));
check("v016_devnet is external (date-anchored release)", byId(base, "v016_devnet").external_dependency === true && byId(base, "v016_devnet").anchor_type === "date_anchor");
check("wave2_feedback_changes is NOT external (internal product work)", byId(base, "wave2_feedback_changes").external_dependency === false);
check("website_out is external (website go-live)", byId(base, "website_out").external_dependency === true);
check("waitlist_qa is NOT external", byId(base, "waitlist_qa").external_dependency === false);
check("wave2_start (date anchor) is not external", byId(base, "wave2_start").external_dependency === false);
var cloned = M.cloneTasks(base.tasks);
check("external_dependency preserved through cloneTask", cloned.every(function (c) {
  return c.external_dependency === byId(base, c.id).external_dependency;
}));
var staleLabelModel = M.cloneTasks([{
  id: "stale_label", label: "2 STORES: old label", category: "stores",
  anchor_id: M.WAVE2_ANCHOR, offset_business_days: 0, external_dependency: false,
  default_label: "2 STORES: old label", default_category: "stores",
  default_anchor_id: M.WAVE2_ANCHOR, default_offset_business_days: 0, default_external_dependency: false
}]);
check("cloneTask migrates stale labels from '{n} text' to '{n}) text'", staleLabelModel[0].label === "2) STORES: old label", staleLabelModel[0].label);
check("cloneTask migrates stale default_label too", staleLabelModel[0].default_label === "2) STORES: old label", staleLabelModel[0].default_label);

console.log("\nTest 4: business-day arithmetic");
check("Mon +1 = Tue", M.addBusinessDays("2026-08-03", 1) === "2026-08-04");
check("Fri +1 skips weekend to Mon", M.addBusinessDays("2026-07-31", 1) === "2026-08-03");
check("Mon -1 skips weekend to Fri", M.addBusinessDays("2026-08-03", -1) === "2026-07-31");
check("offset 0 returns anchor", M.addBusinessDays("2026-07-31", 0) === "2026-07-31");
check("weekend anchor +0 stays put", M.addBusinessDays("2026-08-01", 0) === "2026-08-01");
check("Sat +1 = Mon", M.addBusinessDays("2026-08-01", 1) === "2026-08-03");
check("negative offset across weekend (Wave 2 start -5bd = 2026-07-24)", M.addBusinessDays("2026-07-31", -5) === "2026-07-24");
check("businessDaysBetween Fri..Wed = 3", M.businessDaysBetween("2026-07-31", "2026-08-05") === 3);
check("businessDaysBetween signed backward", M.businessDaysBetween("2026-08-05", "2026-07-31") === -3);
check("addBusinessDays(a, between(a,b)) === b", M.addBusinessDays("2026-07-24", M.businessDaysBetween("2026-07-24", "2026-09-02")) === "2026-09-02");

console.log("\nTest 5: item anchors recompute downstream by the same shift; siblings unaffected");
var m5 = M.defaultModel();
M.findTask(m5, "guardian_upgrade_done").offset_business_days = 0; // 2bd later (was -2)
var r5 = M.recalc({ tasks: m5 });
check("downstream client_wallet_done shifted +2bd", byId(r5, "client_wallet_done").date === M.addBusinessDays(EXPECT.client_wallet_done, 2));
check("v016_testnet (parent, date-anchored) unaffected", byId(r5, "v016_testnet").date === EXPECT.v016_testnet);
check("sibling chain (wave2_stores_live) unaffected", byId(r5, "wave2_stores_live").date === EXPECT.wave2_stores_live);
check("guardian itself moved", byId(r5, "guardian_upgrade_done").date === M.addBusinessDays(EXPECT.guardian_upgrade_done, 2));
check("moved flag set on guardian_upgrade_done", byId(r5, "guardian_upgrade_done").moved === true);
check("moved flag set on downstream client_wallet_done", byId(r5, "client_wallet_done").moved === true);
check("moved flag NOT set on sibling wave2_stores_live", byId(r5, "wave2_stores_live").moved === false);

console.log("\nTest 6: each date anchor moves ONLY its dependent subgraph");
// Build the wave2_date subgraph as everything NOT owned by the other three.
var ownedByOthers = {};
Object.keys(FIXED_SUBGRAPHS).forEach(function (aid) {
  FIXED_SUBGRAPHS[aid].forEach(function (id) { ownedByOthers[id] = aid; });
});
var wave2Subgraph = Object.keys(EXPECT).filter(function (id) { return !ownedByOthers[id]; });
var SUBGRAPHS = Object.assign({ wave2_date: wave2Subgraph }, FIXED_SUBGRAPHS);
// Partition sanity: subgraphs are disjoint and cover all 33 tasks.
var union = [];
M.DATE_ANCHOR_IDS.forEach(function (aid) { union = union.concat(SUBGRAPHS[aid]); });
check("subgraphs partition all 33 tasks (disjoint + complete)",
  union.length === TASK_COUNT && new Set(union).size === TASK_COUNT);
check("wave2_date subgraph has 26 tasks", SUBGRAPHS.wave2_date.length === 26, "got " + SUBGRAPHS.wave2_date.length);
M.DATE_ANCHOR_IDS.forEach(function (movedAnchor) {
  var members = {};
  SUBGRAPHS[movedAnchor].forEach(function (id) { members[id] = true; });
  var anchors = M.defaultAnchors();
  anchors[movedAnchor] = M.addBusinessDays(anchors[movedAnchor], 4); // +4bd
  var r = M.recalc({ anchors: anchors });
  check("moving " + movedAnchor + " keeps the graph resolved", r.errors.length === 0);
  var okMoved = true, okStill = true;
  Object.keys(EXPECT).forEach(function (id) {
    var got = byId(r, id).date;
    if (members[id]) { if (got !== M.addBusinessDays(EXPECT[id], 4)) okMoved = false; }
    else { if (got !== EXPECT[id]) okStill = false; }
  });
  check(movedAnchor + ": every subgraph task shifted +4bd", okMoved);
  check(movedAnchor + ": every OTHER task stayed put (independent chains)", okStill);
});
// Explicit independence spot-checks required by the brief.
var moveCircle = M.recalc({ anchors: Object.assign(M.defaultAnchors(), { circle_announcement_date: "2026-08-19" }) });
check("moving Circle does NOT move Wave 2 / v0.16 chains",
  byId(moveCircle, "wave2_start").date === EXPECT.wave2_start &&
  byId(moveCircle, "v016_testnet").date === EXPECT.v016_testnet &&
  byId(moveCircle, "website_out").date !== EXPECT.website_out);
var moveDevnet = M.recalc({ anchors: Object.assign(M.defaultAnchors(), { v016_devnet_date: "2026-07-20" }) });
check("moving v0.16 devnet moves ONLY v016_devnet",
  byId(moveDevnet, "v016_devnet").date === "2026-07-20" &&
  byId(moveDevnet, "v016_testnet").date === EXPECT.v016_testnet &&
  byId(moveDevnet, "wave2_start").date === EXPECT.wave2_start);

console.log("\nTest 7: forward references resolve (anchor defined later in the array)");
check("wave2_decision resolves through a forward reference (anchors wave2_start)", byId(base, "wave2_decision").date === EXPECT.wave2_decision);
check("guardian_upgrade_done resolves through a forward reference", byId(base, "guardian_upgrade_done").date === EXPECT.guardian_upgrade_done);
check("visual_identity_board resolves through a forward reference", byId(base, "visual_identity_board").date === EXPECT.visual_identity_board);
var decIdx = M.SHIPPED_TASKS.findIndex(function (t) { return t.id === "wave2_decision"; });
var startIdx = M.SHIPPED_TASKS.findIndex(function (t) { return t.id === "wave2_start"; });
check("wave2_decision is authored BEFORE its anchor wave2_start (a true forward ref)", decIdx < startIdx);

console.log("\nTest 8: v0.16 chain resolves through the testnet date anchor + item anchors");
check("v016_devnet = 2026-07-17 (own date anchor)", byId(base, "v016_devnet").date === "2026-07-17" && byId(base, "v016_devnet").anchor_id === "v016_devnet_date");
check("v016_testnet = 2026-08-05 (own date anchor)", byId(base, "v016_testnet").date === "2026-08-05" && byId(base, "v016_testnet").anchor_id === "v016_testnet_date");
check("guardian_upgrade_done = 2026-08-03 (testnet -2bd)", byId(base, "guardian_upgrade_done").date === "2026-08-03" && byId(base, "guardian_upgrade_done").anchor_id === "v016_testnet");
check("client_wallet_done = 2026-08-07 (guardian +4bd)", byId(base, "client_wallet_done").date === "2026-08-07");

console.log("\nTest 9: cycle detection");
var mc = M.defaultModel();
M.findTask(mc, "guardian_upgrade_done").anchor_id = "client_wallet_done"; // guardian -> client -> guardian
M.findTask(mc, "guardian_upgrade_done").anchor_type = "item_anchor";
var rc = M.recalc({ tasks: mc });
var cycleIds = rc.errors.map(function (e) { return e.id; });
["guardian_upgrade_done", "client_wallet_done"].forEach(function (id) {
  check("cycle flags " + id, cycleIds.indexOf(id) !== -1);
  check("cycle: " + id + " unresolved (date null)", byId(rc, id).date === null);
});
var cw = M.validate(rc);
check("cycle surfaces an error warning", cw.some(function (w) { return w.level === "error" && /cycle/.test(w.text); }));
check("non-cycle task still resolves (wave2_decision)", byId(rc, "wave2_decision").date === EXPECT.wave2_decision);

console.log("\nTest 10: invalid anchor id detected");
var mi = M.defaultModel();
M.findTask(mi, "wave2_stores_live").anchor_id = "does_not_exist";
var ri = M.recalc({ tasks: mi });
check("wave2_stores_live unresolved", byId(ri, "wave2_stores_live").date === null);
check("error message names the bad id", ri.errors.some(function (e) { return e.id === "wave2_stores_live" && /does_not_exist/.test(e.message); }));
check("validate surfaces invalid-anchor error", M.validate(ri).some(function (w) { return w.level === "error" && /wave2_stores_live|invalid anchor/i.test(w.text); }));

console.log("\nTest 11: model is quiet at defaults; no legacy single-anchor/teaser API");
check("no warnings at defaults", M.validate(base).length === 0, JSON.stringify(M.validate(base)));
check("no legacy teaser/launch/single-wave2 API",
  M.DEFAULT_TEASER === undefined && M.DEFAULT_LAUNCH === undefined && M.CRITICAL_AFTER_LAUNCH === undefined &&
  M.TEASER_ANCHOR === undefined && M.LAUNCH_ANCHOR === undefined && M.DEFAULT_WAVE2 === undefined);
var mw = M.defaultModel();
M.findTask(mw, "client_wallet_done").offset_business_days = 60;
check("pushing a task far out produces no warning (no launch concept)", M.validate(M.recalc({ tasks: mw })).length === 0);

console.log("\nTest 12: editing label / category / anchor / offset (type re-derived, external preserved)");
var me = M.defaultModel();
var e = M.findTask(me, "wave5_stores_live");
e.label = "2) STORES: post-Wave-5 build live (edited)";
e.category = "comms";
e.offset_business_days = 2;
var re = M.recalc({ tasks: me });
var et = byId(re, "wave5_stores_live");
check("label edit applied", et.label === "2) STORES: post-Wave-5 build live (edited)");
check("category edit applied", et.category === "comms");
check("offset edit recomputes date", et.date === M.addBusinessDays(EXPECT.wave5_stores_submit, 2));
var me2 = M.defaultModel();
var f = M.findTask(me2, "wave2_decision");
var beforeExt = f.external_dependency;
f.anchor_id = "wave2_stores_submit";
f.anchor_type = M.deriveAnchorType(f.anchor_id);
f.offset_business_days = 2;
var re2 = M.recalc({ tasks: me2 });
check("re-anchored to item recomputes from parent", byId(re2, "wave2_decision").date === M.addBusinessDays(EXPECT.wave2_stores_submit, 2));
check("re-anchored task reports item anchor", byId(re2, "wave2_decision").anchor_type === "item_anchor");
check("re-anchoring does NOT flip the stored external_dependency", byId(re2, "wave2_decision").external_dependency === beforeExt);
var f2 = M.findTask(me2, "wave2_decision");
f2.anchor_id = "circle_announcement_date"; // re-anchor to a DIFFERENT date anchor
f2.anchor_type = M.deriveAnchorType(f2.anchor_id);
var re3 = M.recalc({ tasks: me2 });
check("re-anchored to another date anchor resolves off that anchor", byId(re3, "wave2_decision").date === M.addBusinessDays(EXPECT.circle_announcement, 2));
check("re-anchored to a date anchor reports date_anchor", byId(re3, "wave2_decision").anchor_type === "date_anchor");
check("re-anchored to a date anchor keeps stored external flag", byId(re3, "wave2_decision").external_dependency === beforeExt);

console.log("\nTest 13: defaults round-trip (promote + reset), incl. external_dependency");
var md = M.defaultModel();
M.findTask(md, "wave5_stores_live").offset_business_days = -4;
M.findTask(md, "wave5_stores_live").label = "changed";
M.findTask(md, "wave5_stores_live").external_dependency = false; // flip stored flag (was true)
var promoted = M.promoteToDefaults(md);
check("promote copies current into default_*", M.findTask(promoted, "wave5_stores_live").default_offset_business_days === -4 && M.findTask(promoted, "wave5_stores_live").default_label === "changed");
check("promote copies stored external_dependency into default", M.findTask(promoted, "wave5_stores_live").default_external_dependency === false);
M.findTask(promoted, "wave5_stores_live").offset_business_days = 9;
M.findTask(promoted, "wave5_stores_live").external_dependency = true;
var resetted = M.resetToDefaults(promoted);
check("reset restores promoted default offset", M.findTask(resetted, "wave5_stores_live").offset_business_days === -4);
check("reset restores promoted default label", M.findTask(resetted, "wave5_stores_live").label === "changed");
check("reset restores promoted default external_dependency", M.findTask(resetted, "wave5_stores_live").external_dependency === false);
check("shipped model unchanged by edits", M.findTask(M.defaultModel(), "wave5_stores_live").offset_business_days === 1 && M.findTask(M.defaultModel(), "wave5_stores_live").external_dependency === true);

console.log("\nTest 14: export model (version 3, four date anchors) includes labels/anchors/offsets/external/defaults");
var ex = M.exportModel(M.defaultAnchors(), M.defaultModel());
check("export is version 3", ex.version === 3);
check("export has the four date anchors and no teaser/launch",
  ex.wave2_date === "2026-07-31" && ex.v016_devnet_date === "2026-07-17" &&
  ex.v016_testnet_date === "2026-08-05" && ex.circle_announcement_date === "2026-08-12" &&
  !("teaser_date" in ex) && !("launch_date" in ex));
check("export has 33 tasks", ex.tasks.length === TASK_COUNT);
var exOne = ex.tasks.find(function (t) { return t.id === "guardian_upgrade_done"; });
check("exported task carries anchor+offset", exOne.anchor_type === "item_anchor" && exOne.anchor_id === "v016_testnet" && exOne.offset_business_days === -2);
check("exported task carries stored external_dependency + defaults", exOne.external_dependency === true && exOne.default_external_dependency === true && exOne.default_anchor_id === "v016_testnet");
check("export round-trips through JSON", JSON.parse(JSON.stringify(ex)).tasks.length === TASK_COUNT);
// Custom anchor values are exported.
var exCustom = M.exportModel({ wave2_date: "2026-09-01" }, M.defaultModel());
check("export normalizes partial anchors (missing filled from defaults)",
  exCustom.wave2_date === "2026-09-01" && exCustom.v016_devnet_date === "2026-07-17");

console.log("\nTest 15: wave labels present; old wave6 / single-anchor-era labels gone");
var labels = base.tasks.map(function (t) { return t.label; });
["7) PUBLIC: Wave 6 targeted push if needed", "1) PRODUCT: Wave 2 company testing",
 "1) PRODUCT: Wave 2 feedback + changes", "1) PRODUCT: Wave 3 feedback + changes",
 "1) PRODUCT: Wave 4 feedback + changes", "1) PRODUCT: Wave 5 feedback + changes"].forEach(function (l) {
  check("obsolete label removed: '" + l + "'", labels.indexOf(l) === -1);
});
["1) PRODUCT: Wave 2 decision", "1) PRODUCT: Wave 2 company-wide testing",
 "1) PRODUCT: Wave 2 changes applied", "1) PRODUCT: Wave 3 changes applied",
 "1) PRODUCT: Wave 3 decision", "1) PRODUCT: Wave 4 decision", "1) PRODUCT: Wave 5 decision",
 "5) SUPPORT: intake workflow ready", "0) v0.16 on devnet", "0) v0.16 on testnet",
 "0) Guardian upgrade done", "0) Client/wallet/Epoch upgrade done",
 "1) PRODUCT: Wave 3 trusted-network testing", "7) PUBLIC: Circle announcement",
 "4) WEBSITE: new website + Bread waitlist live", "4) WAITLIST: form + CRM flow ready",
 "7) PUBLIC: Wave 4 teaser + waitlist push", "6) COMMS: Wave 4 channels + waitlist CTA ready",
 "7) PUBLIC: Wave 5 X waitlist follow-up", "6) COMMS: Wave 5 X push + How Bread Works ready",
 "2) STORES: post-Wave-2 build live"].forEach(function (l) {
  check("present: '" + l + "'", labels.indexOf(l) !== -1);
});
// Wave narrative anchoring spot checks (new model).
check("Wave 2 company-wide testing is the wave2_date anchor",
  byId(base, "wave2_start").anchor_type === "date_anchor" && byId(base, "wave2_start").anchor_id === "wave2_date");
check("Wave 3/4/5 each start +6bd from the prior wave start",
  byId(base, "wave3_start").anchor_id === "wave2_start" && byId(base, "wave3_start").offset_business_days === 6 &&
  byId(base, "wave4_start").anchor_id === "wave3_start" && byId(base, "wave4_start").offset_business_days === 6 &&
  byId(base, "wave5_start").anchor_id === "wave4_start" && byId(base, "wave5_start").offset_business_days === 6);
check("waitlist QA anchors website_out -1bd", byId(base, "waitlist_qa").anchor_id === "website_out" && byId(base, "waitlist_qa").offset_business_days === -1);
check("Circle announcement is a fixed date anchor (Public moment)",
  byId(base, "circle_announcement").category === "public" && byId(base, "circle_announcement").anchor_id === "circle_announcement_date");
check("website + waitlist sit in Website/waitlist; website anchors Circle",
  byId(base, "website_out").category === "landing" && byId(base, "website_out").anchor_id === "circle_announcement" &&
  byId(base, "waitlist_qa").category === "landing");
["wave2", "wave3", "wave4", "wave5"].forEach(function (w) {
  check(w + " changes applied is +3bd from the wave start", byId(base, w + "_feedback_changes").offset_business_days === 3 && byId(base, w + "_feedback_changes").anchor_id === w + "_start");
  check(w + " store submit is +0bd from changes applied", byId(base, w + "_stores_submit").offset_business_days === 0 && byId(base, w + "_stores_submit").anchor_id === w + "_feedback_changes");
  check(w + " store live is +1bd from submit", byId(base, w + "_stores_live").offset_business_days === 1 && byId(base, w + "_stores_live").anchor_id === w + "_stores_submit");
  check(w + " decision is -1bd from the wave start", byId(base, w + "_decision").offset_business_days === -1 && byId(base, w + "_decision").anchor_id === w + "_start");
});
check("category 4 name is 'Website / waitlist'", M.CATEGORIES.landing.name === "Website / waitlist");

console.log("\nTest 16: labels carry '{n}) ' and category prefixes contiguous 0..7");
var expectedNums = { v016: 0, product: 1, stores: 2, video: 3, landing: 4, support: 5, comms: 6, public: 7 };
Object.keys(expectedNums).forEach(function (k) {
  check("category " + k + " num = " + expectedNums[k], M.CATEGORIES[k].num === expectedNums[k], "got " + M.CATEGORIES[k].num);
});
base.tasks.forEach(function (t) {
  var expect = String(M.CATEGORIES[t.category].num) + ") ";
  check("label carries '{n}) ' for its category: " + t.label, t.label.indexOf(expect) === 0, "expected prefix '" + expect + "'");
});
check("COMMS rows prefixed with '6) COMMS'", base.tasks.filter(function (t) { return t.category === "comms"; }).every(function (t) { return t.label.indexOf("6) COMMS") === 0; }));
check("PUBLIC rows prefixed with '7) PUBLIC'", base.tasks.filter(function (t) { return t.category === "public"; }).every(function (t) { return t.label.indexOf("7) PUBLIC") === 0; }));

console.log("\nTest 17: anchorChain / terminalDateAnchor walk up to the correct date anchor");
var chain = M.anchorChain(M.SHIPPED_TASKS, "client_wallet_done");
check("chain is client/wallet -> guardian -> testnet",
  chain.join(",") === "client_wallet_done,guardian_upgrade_done,v016_testnet", chain.join(","));
check("terminal date anchor for client_wallet_done is v016_testnet_date", M.terminalDateAnchor(M.SHIPPED_TASKS, "client_wallet_done") === "v016_testnet_date");
check("terminal date anchor for wave5_stores_live is wave2_date", M.terminalDateAnchor(M.SHIPPED_TASKS, "wave5_stores_live") === "wave2_date");
check("terminal date anchor for waitlist_qa is circle_announcement_date", M.terminalDateAnchor(M.SHIPPED_TASKS, "waitlist_qa") === "circle_announcement_date");
check("terminal date anchor for v016_devnet is v016_devnet_date", M.terminalDateAnchor(M.SHIPPED_TASKS, "v016_devnet") === "v016_devnet_date");
var chain2 = M.anchorChain(M.SHIPPED_TASKS, "circle_announcement");
check("date-anchored task chain is just itself", chain2.join(",") === "circle_announcement");

console.log("\nTest 18: add / remove tasks (unique ids, dependent re-anchor, export/reset)");
var addBase = M.defaultModel();
var nt = M.makeTask(addBase, {});
check("makeTask defaults to product category", nt.category === "product");
check("makeTask defaults to Wave 2 date anchor", nt.anchor_id === M.WAVE2_ANCHOR && nt.anchor_type === "date_anchor");
check("makeTask defaults to offset 0 + not external", nt.offset_business_days === 0 && nt.external_dependency === false);
check("makeTask default label carries '{n}) ' prefix", /^\d+\) /.test(nt.label), nt.label);
check("makeTask id is unique + not a reserved date anchor", !M.findTask(addBase, nt.id) && !M.isDateAnchorId(nt.id));
var acc = M.defaultModel();
var idA = M.makeTask(acc, {}); acc = acc.concat([idA]);
var idB = M.makeTask(acc, {}); acc = acc.concat([idB]);
var idC = M.makeTask(acc, { id: "v016_testnet_date" }); acc = acc.concat([idC]); // collides with a date anchor id
check("repeated adds get distinct ids", idA.id !== idB.id);
check("explicit id colliding with a date anchor id is uniquified", idC.id !== "v016_testnet_date" && !M.isDateAnchorId(idC.id));
var withNew = M.defaultModel();
var extra = M.makeTask(withNew, { id: "extra_task", label: "1) PRODUCT: extra", category: "product", offset: 3 });
withNew = withNew.concat([extra]);
check("add grows the model to 34", withNew.length === 34);
var exAdd = M.exportModel(M.defaultAnchors(), withNew);
check("export includes the added task", exAdd.tasks.some(function (t) { return t.id === "extra_task"; }) && exAdd.tasks.length === 34);
var rAdd = M.recalc({ tasks: withNew });
check("added task resolves at Wave 2 +3bd", byId(rAdd, "extra_task").date === M.addBusinessDays(EXPECT.wave2_start, 3));

// Remove v016_testnet: dependent guardian_upgrade_done re-anchors to testnet's own
// anchor (v016_testnet_date), preserving offset.
var rem1 = M.removeTask(M.defaultModel(), "v016_testnet");
check("remove drops the task (33 -> 32)", rem1.length === 32 && !M.findTask(rem1, "v016_testnet"));
check("dependent guardian re-anchored to removed task's anchor (v016_testnet_date)",
  M.findTask(rem1, "guardian_upgrade_done").anchor_id === "v016_testnet_date" &&
  M.findTask(rem1, "guardian_upgrade_done").anchor_type === "date_anchor");
check("removal leaves no dangling anchors (no resolution errors)", M.recalc({ tasks: rem1 }).errors.length === 0);
check("export after removal omits the removed task", M.exportModel(M.defaultAnchors(), rem1).tasks.every(function (t) { return t.id !== "v016_testnet"; }));

var brokeModel = M.defaultModel();
var mid = M.makeTask(brokeModel, { id: "mid", anchor_id: "no_such_parent", offset: 4 });
var leaf = M.makeTask(brokeModel.concat([mid]), { id: "leaf", anchor_id: "mid", offset: 2 });
brokeModel = brokeModel.concat([mid, leaf]);
var remBroke = M.removeTask(brokeModel, "mid");
var leaf2 = M.findTask(remBroke, "leaf");
check("dependent of a removed task with an invalid anchor falls back to Wave 2 + 0",
  leaf2.anchor_id === M.WAVE2_ANCHOR && leaf2.offset_business_days === 0 && leaf2.anchor_type === "date_anchor");

check("defaultModel restores the shipped 33 tasks after edits", M.defaultModel().length === TASK_COUNT);
var mixed = M.removeTask(M.defaultModel(), "wave5_stores_live");
mixed = mixed.concat([M.makeTask(mixed, { id: "kept_add", label: "1) PRODUCT: kept", offset: 7 })]);
var mixedReset = M.resetToDefaults(mixed);
check("reset keeps an added task and the removed task stays gone",
  !!M.findTask(mixedReset, "kept_add") && !M.findTask(mixedReset, "wave5_stores_live") && mixedReset.length === TASK_COUNT);

console.log("\nTest 19: every supplied anchor_id resolves after the full graph loads");
var idSet = {};
M.SHIPPED_TASKS.forEach(function (t) { idSet[t.id] = true; });
M.SHIPPED_TASKS.forEach(function (t) {
  if (t.anchor_type === "date_anchor") {
    check(t.id + " date anchor id is a known anchor", M.isDateAnchorId(t.anchor_id), t.anchor_id);
  } else {
    check(t.id + " item anchor id references a real task", !!idSet[t.anchor_id] && !M.isDateAnchorId(t.anchor_id), t.anchor_id);
  }
});
check("full graph load leaves 0 unresolved anchors and 0 cycles", base.errors.length === 0);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
