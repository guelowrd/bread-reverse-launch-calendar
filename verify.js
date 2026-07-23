/*
 * Deterministic verification for the Bread reverse calendar task/date model.
 * Run: node verify.js   (exit code 0 = all pass, 1 = failure)
 *
 * Covers the graph model plus this revision batch:
 *  0. Shipped defaults match bread-calendar-model.json (baseline-model.json)
 *     exactly, plus the two tasks added in this revision (company_testing_try_2,
 *     website_new_version_out). The baseline JSON already ships normalized
 *     ("{n}) " labels + derived external_dependency), so there are no other deltas.
 *  1. Default anchors reproduce every task's expected date (date AND item anchors).
 *  2. Exactly 29 tasks, each with a stable id distinct from its label.
 *  3. external_dependency is DEDUCED from anchor_id (item anchor => true, date
 *     anchor => false); it is never user-set. anchor_type is likewise derived.
 *  4. Business-day arithmetic (forward/back across weekends, weekend anchors).
 *  5. Item anchors: moving a parent recomputes the whole downstream chain.
 *  6/7. Shifting teaser/launch moves the matching rooted chains only.
 *  8. The v0.16 chain resolves through item anchors to its default dates.
 *  9. Cycle detection flags every member unresolved.
 * 10. Invalid anchor id is detected and reported (not thrown).
 * 11. Critical-dependency-after-launch warnings fire (quiet at defaults).
 * 12. Editing: label / category / anchor (type+dep re-derived) / offset.
 * 13. Defaults: promoteToDefaults + resetToDefaults round-trip (with derivation).
 * 14. Export model (version 2) includes labels, anchors, offsets, and defaults.
 * 15. Renamed rows / new tasks are present; old labels gone.
 * 16. Every label carries "{n}) " and category prefixes are contiguous 0..7.
 * 17. anchorChain returns the ancestor chain up to a date anchor.
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

// Expected default-resolved dates for all 29 tasks (teaser 2026-08-06, launch
// 2026-08-13).
var EXPECT = {
  date_feasibility: "2026-07-16",
  company_testing: "2026-07-21",
  company_testing_try_2: "2026-07-28",
  support_test_workflow: "2026-07-21",
  product_e2e: "2026-08-05",
  v016_devnet: "2026-07-20",
  video_teaser_final: "2026-07-23",
  launch_video_start: "2026-07-27",
  stores_submit: "2026-07-24",
  launch_video_capture: "2026-07-29",
  landing_live: "2026-08-12",
  v016_testnet: "2026-07-30",
  comms_drafts: "2026-07-20",
  guardian_upgrade_done: "2026-07-28",
  stores_live: "2026-07-31",
  email_list_ready: "2026-08-05",
  go_no_go: "2026-08-05",
  comms_link_pack: "2026-08-03",
  public_teaser: "2026-08-06",
  comms_launch_final: "2026-08-11",
  launch_video_review: "2026-08-05",
  support_final_polish: "2026-08-04",
  launch_video_final: "2026-08-12",
  public_launch: "2026-08-13",
  client_wallet_done: "2026-08-03",
  stores_submit_final_version: "2026-08-03",
  stores_final_version_live: "2026-08-10",
  visual_identity_board: "2026-07-28",
  website_new_version_out: "2026-07-29"
};
var TASK_COUNT = 29;

console.log("Test 0: shipped defaults match baseline-model.json (attached JSON) + 2 added tasks");
var baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "baseline-model.json"), "utf8"));
var shipped = M.exportModel(M.DEFAULT_TEASER, M.DEFAULT_LAUNCH, M.defaultModel());
check("baseline is version 2", baseline.version === 2);
check("baseline has 27 tasks (the attached JSON)", baseline.tasks.length === 27, "got " + baseline.tasks.length);
check("shipped teaser matches baseline (2026-08-06)", shipped.teaser_date === baseline.teaser_date && shipped.teaser_date === "2026-08-06", shipped.teaser_date);
check("shipped launch matches baseline (2026-08-13)", shipped.launch_date === baseline.launch_date && shipped.launch_date === "2026-08-13", shipped.launch_date);
// The two tasks added in this batch are the only new ids vs the baseline JSON.
var ADDED_IDS = ["company_testing_try_2", "website_new_version_out"];
var baselineIds = baseline.tasks.map(function (t) { return t.id; });
var shippedById = {};
shipped.tasks.forEach(function (t) { shippedById[t.id] = t; });
check("shipped adds exactly the 2 requested tasks (27 baseline + 2 = 29)", shipped.tasks.length === baseline.tasks.length + 2 && shipped.tasks.length === TASK_COUNT, "got " + shipped.tasks.length);
ADDED_IDS.forEach(function (id) {
  check("added task present: " + id, !!shippedById[id] && baselineIds.indexOf(id) === -1);
});
// The baseline JSON is already normalized ("{n}) " labels + derived
// external_dependency), so every baseline row must match the shipped row EXACTLY
// (label, category, anchor_id, offset) and external_dependency must equal the
// value derived from the anchor.
baseline.tasks.forEach(function (b) {
  var s = shippedById[b.id];
  if (!s) { check("baseline id still shipped: " + b.id, false); return; }
  check("label matches baseline exactly: " + b.id, s.label === b.label, s.label + " vs " + b.label);
  check("shipped label uses '{n}) ' separator: " + b.id, /^\d+\) /.test(s.label), s.label);
  check("category matches baseline: " + b.id, s.category === b.category, s.category + " vs " + b.category);
  check("anchor_id matches baseline: " + b.id, s.anchor_id === b.anchor_id, s.anchor_id + " vs " + b.anchor_id);
  check("offset matches baseline: " + b.id, s.offset_business_days === b.offset_business_days, s.offset_business_days + " vs " + b.offset_business_days);
  var derived = M.deriveExternalDependency(b.anchor_id);
  check("external_dependency is derived from anchor: " + b.id, s.external_dependency === derived);
  check("external_dependency matches baseline (already normalized): " + b.id, s.external_dependency === b.external_dependency, s.external_dependency + " vs " + b.external_dependency);
});

console.log("\nTest 1: default anchors reproduce expected dates (date AND item anchors)");
var base = M.recalc({});
Object.keys(EXPECT).forEach(function (id) {
  var t = byId(base, id);
  check(id + " = " + EXPECT[id], t && t.date === EXPECT[id], t && ("got " + t.date));
});
check("no resolution errors at defaults", base.errors.length === 0, JSON.stringify(base.errors));

console.log("\nTest 2: exactly 29 tasks, stable ids != labels");
check(TASK_COUNT + " tasks", base.tasks.length === TASK_COUNT, "got " + base.tasks.length);
var ids = {};
base.tasks.forEach(function (t) {
  check("id present & unique: " + t.id, !!t.id && !ids[t.id]); ids[t.id] = true;
  check("id differs from label: " + t.id, t.id !== t.label);
});

console.log("\nTest 3: external_dependency + anchor_type are derived from anchor_id");
base.tasks.forEach(function (t) {
  var wantType = t.anchor_id === M.TEASER_ANCHOR || t.anchor_id === M.LAUNCH_ANCHOR ? "date_anchor" : "item_anchor";
  check("anchor_type derived for " + t.id, t.anchor_type === wantType, "got " + t.anchor_type);
  check("external_dependency derived for " + t.id, t.external_dependency === (wantType === "item_anchor"), "got " + t.external_dependency);
});
// Every item-anchored task is an external dependency; every date-anchored is not.
var itemAnchored = base.tasks.filter(function (t) { return t.anchor_type === "item_anchor"; }).map(function (t) { return t.id; });
var deps = base.tasks.filter(function (t) { return t.external_dependency; }).map(function (t) { return t.id; });
check("dep set == item-anchored set", itemAnchored.slice().sort().join(",") === deps.slice().sort().join(","), "deps=[" + deps + "]");
check("no DEP flags string is exposed by the model", base.tasks.every(function (t) { return typeof t.flags === "undefined"; }));
var staleLabelModel = M.cloneTasks([{
  id: "stale_label", label: "2 STORES: old label", category: "stores",
  anchor_id: M.TEASER_ANCHOR, offset_business_days: 0,
  default_label: "2 STORES: old label", default_category: "stores",
  default_anchor_id: M.TEASER_ANCHOR, default_offset_business_days: 0
}]);
check("cloneTask migrates stale labels from '{n} text' to '{n}) text'", staleLabelModel[0].label === "2) STORES: old label", staleLabelModel[0].label);
check("cloneTask migrates stale default_label too", staleLabelModel[0].default_label === "2) STORES: old label", staleLabelModel[0].default_label);

console.log("\nTest 4: business-day arithmetic");
check("Mon +1 = Tue", M.addBusinessDays("2026-08-03", 1) === "2026-08-04");
check("Fri +1 skips weekend to Mon", M.addBusinessDays("2026-08-07", 1) === "2026-08-10");
check("Mon -1 skips weekend to Fri", M.addBusinessDays("2026-08-03", -1) === "2026-07-31");
check("offset 0 returns anchor", M.addBusinessDays("2026-08-06", 0) === "2026-08-06");
check("weekend anchor +0 stays put", M.addBusinessDays("2026-08-08", 0) === "2026-08-08");
check("Sat +1 = Mon", M.addBusinessDays("2026-08-08", 1) === "2026-08-10");
check("businessDaysBetween Mon..Thu = 3", M.businessDaysBetween("2026-08-03", "2026-08-06") === 3);
check("businessDaysBetween signed backward", M.businessDaysBetween("2026-08-06", "2026-08-03") === -3);
check("addBusinessDays(a, between(a,b)) === b", M.addBusinessDays("2026-07-16", M.businessDaysBetween("2026-07-16", "2026-08-06")) === "2026-08-06");
check("teaser->launch default gap is 5 business days", M.businessDaysBetween(M.DEFAULT_TEASER, M.DEFAULT_LAUNCH) === 5);

console.log("\nTest 5: item anchors recompute downstream by the same shift");
var m5 = M.defaultModel();
M.findTask(m5, "product_e2e").offset_business_days = 1; // 2bd later (was -1)
var r5 = M.recalc({ tasks: m5 });
["v016_devnet", "v016_testnet", "guardian_upgrade_done", "client_wallet_done"].forEach(function (id) {
  var want = M.addBusinessDays(EXPECT[id], 2);
  check("downstream " + id + " shifted +2bd", byId(r5, id).date === want, "got " + byId(r5, id).date + " want " + want);
});
// A sibling chain rooted elsewhere is unaffected.
check("sibling chain (stores_live) unaffected", byId(r5, "stores_live").date === EXPECT.stores_live);
check("product_e2e itself moved", byId(r5, "product_e2e").date === M.addBusinessDays(EXPECT.product_e2e, 2));
check("moved flag set on product_e2e", byId(r5, "product_e2e").moved === true);
check("moved flag set on downstream v016_devnet", byId(r5, "v016_devnet").moved === true);

// Root date anchor per task (walk the chain to its terminating date anchor).
function rootAnchor(tasks, id) {
  var chain = M.anchorChain(tasks, id);
  var last = M.findTask(tasks, chain[chain.length - 1]);
  if (last && last.anchor_type === "date_anchor") return last.anchor_id === M.TEASER_ANCHOR ? "teaser" : "launch";
  return null;
}

console.log("\nTest 6: shift teaser +5 business days");
var newTeaser = M.addBusinessDays(M.DEFAULT_TEASER, 5);
var t6 = M.recalc({ teaser: newTeaser });
base.tasks.forEach(function (bt) {
  var root = rootAnchor(M.SHIPPED_TASKS, bt.id);
  var now = byId(t6, bt.id).date;
  if (root === "teaser") check("teaser-rooted moved +5bd: " + bt.id, now === M.addBusinessDays(bt.date, 5), "got " + now);
  else check("launch-rooted unchanged: " + bt.id, now === bt.date, "got " + now);
});

console.log("\nTest 7: shift launch +2 business days");
var newLaunch = M.addBusinessDays(M.DEFAULT_LAUNCH, 2);
var t7 = M.recalc({ launch: newLaunch });
base.tasks.forEach(function (bt) {
  var root = rootAnchor(M.SHIPPED_TASKS, bt.id);
  var now = byId(t7, bt.id).date;
  if (root === "launch") check("launch-rooted moved +2bd: " + bt.id, now === M.addBusinessDays(bt.date, 2), "got " + now);
  else check("teaser-rooted unchanged: " + bt.id, now === bt.date, "got " + now);
});

console.log("\nTest 8: v0.16 chain resolves through item anchors (default anchors)");
check("v016_devnet = 2026-07-20 (product_e2e -12bd)", byId(base, "v016_devnet").date === "2026-07-20");
check("v016_testnet = 2026-07-30 (devnet +8bd)", byId(base, "v016_testnet").date === "2026-07-30");
check("guardian_upgrade_done = 2026-07-28 (testnet -2bd)", byId(base, "guardian_upgrade_done").date === "2026-07-28");
check("client_wallet_done = 2026-08-03 (guardian +4bd)", byId(base, "client_wallet_done").date === "2026-08-03");
check("v016_devnet anchor is item_anchor -> product_e2e", byId(base, "v016_devnet").anchor_type === "item_anchor" && byId(base, "v016_devnet").anchor_id === "product_e2e");

console.log("\nTest 9: cycle detection");
var mc = M.defaultModel();
M.findTask(mc, "product_e2e").anchor_type = "item_anchor";
M.findTask(mc, "product_e2e").anchor_id = "client_wallet_done"; // e2e -> ... -> e2e cycle
var rc = M.recalc({ tasks: mc });
var cycleIds = rc.errors.map(function (e) { return e.id; });
["product_e2e", "v016_devnet", "v016_testnet", "guardian_upgrade_done", "client_wallet_done"].forEach(function (id) {
  check("cycle flags " + id, cycleIds.indexOf(id) !== -1);
  check("cycle: " + id + " unresolved (date null)", byId(rc, id).date === null);
});
var cw = M.validate(rc);
check("cycle surfaces an error warning", cw.some(function (w) { return w.level === "error" && /cycle/.test(w.text); }));
check("non-cycle task still resolves", byId(rc, "public_launch").date === "2026-08-13");

console.log("\nTest 10: invalid anchor id detected");
var mi = M.defaultModel();
M.findTask(mi, "stores_live").anchor_id = "does_not_exist";
var ri = M.recalc({ tasks: mi });
check("stores_live unresolved", byId(ri, "stores_live").date === null);
check("error message names the bad id", ri.errors.some(function (e) { return e.id === "stores_live" && /does_not_exist/.test(e.message); }));
check("validate surfaces invalid-anchor error", M.validate(ri).some(function (w) { return w.level === "error" && /stores_live|invalid anchor/i.test(w.text); }));

console.log("\nTest 11: critical-dependency-after-launch warnings");
check("no critical warnings at defaults", M.validate(base).length === 0, JSON.stringify(M.validate(base)));
var mw = M.defaultModel();
M.findTask(mw, "client_wallet_done").offset_business_days = 30;
var rw = M.recalc({ tasks: mw });
var warns = M.validate(rw);
check("client_wallet_done now lands after launch", byId(rw, "client_wallet_done").date > rw.launch);
check("warning fires for critical dep after launch", warns.some(function (w) { return w.level === "error" && /Critical dependency/.test(w.text) && /Client\/wallet/.test(w.text); }));
M.CRITICAL_AFTER_LAUNCH.forEach(function (id) {
  var mm = M.defaultModel();
  M.findTask(mm, id).anchor_type = "date_anchor";
  M.findTask(mm, id).anchor_id = M.LAUNCH_ANCHOR;
  M.findTask(mm, id).offset_business_days = 5; // 5bd after launch
  var rr = M.recalc({ tasks: mm });
  check("critical " + id + " after launch warns", M.validate(rr).some(function (w) { return w.level === "error" && /Critical dependency/.test(w.text); }));
});

console.log("\nTest 12: editing label / category / anchor / offset (type+dep re-derived)");
var me = M.defaultModel();
var e = M.findTask(me, "public_teaser");
e.label = "7) PUBLIC: teaser (edited)";
e.category = "comms";
e.offset_business_days = -2;
var re = M.recalc({ tasks: me });
var et = byId(re, "public_teaser");
check("label edit applied", et.label === "7) PUBLIC: teaser (edited)");
check("category edit applied", et.category === "comms");
check("offset edit recomputes date", et.date === M.addBusinessDays(M.DEFAULT_TEASER, -2));
// Re-anchor: switch date_feasibility from teaser to an item anchor on stores_submit.
var me2 = M.defaultModel();
var f = M.findTask(me2, "date_feasibility");
f.anchor_id = "stores_submit";
f.anchor_type = M.deriveAnchorType(f.anchor_id);
f.external_dependency = M.deriveExternalDependency(f.anchor_id);
f.offset_business_days = 2;
var re2 = M.recalc({ tasks: me2 });
check("re-anchored to item recomputes from parent", byId(re2, "date_feasibility").date === M.addBusinessDays(EXPECT.stores_submit, 2));
check("re-anchored task reports item anchor", byId(re2, "date_feasibility").anchor_type === "item_anchor");
check("re-anchored task now flagged external dependency", byId(re2, "date_feasibility").external_dependency === true);
// Re-anchor back to a date anchor clears the external-dependency flag.
var f2 = M.findTask(me2, "date_feasibility");
f2.anchor_id = M.LAUNCH_ANCHOR;
f2.anchor_type = M.deriveAnchorType(f2.anchor_id);
f2.external_dependency = M.deriveExternalDependency(f2.anchor_id);
var re3 = M.recalc({ tasks: me2 });
check("re-anchored to date clears external dependency", byId(re3, "date_feasibility").external_dependency === false);

console.log("\nTest 13: defaults round-trip (promote + reset)");
var md = M.defaultModel();
M.findTask(md, "public_teaser").offset_business_days = -4;
M.findTask(md, "public_teaser").label = "changed";
var promoted = M.promoteToDefaults(md);
check("promote copies current into default_*", M.findTask(promoted, "public_teaser").default_offset_business_days === -4 && M.findTask(promoted, "public_teaser").default_label === "changed");
M.findTask(promoted, "public_teaser").offset_business_days = 9;
var resetted = M.resetToDefaults(promoted);
check("reset restores promoted default offset", M.findTask(resetted, "public_teaser").offset_business_days === -4);
check("reset restores promoted default label", M.findTask(resetted, "public_teaser").label === "changed");
check("shipped model unchanged by edits", M.findTask(M.defaultModel(), "public_teaser").offset_business_days === 0);
// Promote also carries the derived default_external_dependency consistently.
var md2 = M.defaultModel();
var fd = M.findTask(md2, "date_feasibility");
fd.anchor_id = "stores_submit"; fd.anchor_type = "item_anchor"; fd.external_dependency = true;
var promoted2 = M.promoteToDefaults(md2);
check("promote derives default_external_dependency from default anchor", M.findTask(promoted2, "date_feasibility").default_external_dependency === true && M.findTask(promoted2, "date_feasibility").default_anchor_type === "item_anchor");

console.log("\nTest 14: export model (version 2) includes labels/anchors/offsets/defaults");
var ex = M.exportModel(M.DEFAULT_TEASER, M.DEFAULT_LAUNCH, M.defaultModel());
check("export is version 2", ex.version === 2);
check("export has teaser/launch", ex.teaser_date === M.DEFAULT_TEASER && ex.launch_date === M.DEFAULT_LAUNCH);
check("export has 29 tasks", ex.tasks.length === TASK_COUNT);
var exOne = ex.tasks.find(function (t) { return t.id === "v016_devnet"; });
check("exported task carries anchor+offset", exOne.anchor_type === "item_anchor" && exOne.anchor_id === "product_e2e" && exOne.offset_business_days === -12);
check("exported task still carries external_dependency + defaults for JSON compat", exOne.external_dependency === true && exOne.default_external_dependency === true && exOne.default_anchor_id === "product_e2e");
check("export round-trips through JSON", JSON.parse(JSON.stringify(ex)).tasks.length === TASK_COUNT);

console.log("\nTest 15: renamed rows / new tasks");
var labels = base.tasks.map(function (t) { return t.label; });
["1 PRODUCT: date feasibility chat", "0 v0.16 on devnet", "3 Video", "1 PRODUCT: final UI/Earn"].forEach(function (l) {
  check("no separator-less label present: '" + l + "'", labels.indexOf(l) === -1);
});
["0) v0.16 on devnet", "0) v0.16 on testnet", "1) PRODUCT: Everything working e2e",
 "2) STORES: submit final version", "2) STORES: final version live", "3) VISUAL IDENTITY: Board",
 "0) Client/wallet/Epoch upgrade done",
 // Rebaselined labels + the two tasks added in this revision.
 "1) PRODUCT: company testing (try 1)", "1) PRODUCT: company testing (try 2)",
 "3) LAUNCH VIDEO: storyboard", "4) WEBSITE - new version out"].forEach(function (l) {
  check("present: '" + l + "'", labels.indexOf(l) !== -1);
});
// Baseline stores tasks anchor / offset checks.
check("stores_submit_final_version = teaser -3bd (2026-08-03)", byId(base, "stores_submit_final_version").date === "2026-08-03");
check("stores_final_version_live = submit final +5bd (2026-08-10)", byId(base, "stores_final_version_live").date === "2026-08-10" && byId(base, "stores_final_version_live").anchor_id === "stores_submit_final_version");
check("visual_identity_board = teaser -7bd (2026-07-28)", byId(base, "visual_identity_board").date === "2026-07-28");
// The two tasks requested in this revision.
check("company_testing_try_2 = company_testing +5bd (2026-07-28)",
  byId(base, "company_testing_try_2").date === M.addBusinessDays(byId(base, "company_testing").date, 5) &&
  byId(base, "company_testing_try_2").date === "2026-07-28" &&
  byId(base, "company_testing_try_2").anchor_id === "company_testing" &&
  byId(base, "company_testing_try_2").category === "product");
check("website_new_version_out = teaser -6bd (2026-07-29)",
  byId(base, "website_new_version_out").date === "2026-07-29" &&
  byId(base, "website_new_version_out").anchor_id === M.TEASER_ANCHOR &&
  byId(base, "website_new_version_out").category === "landing");
check("Video / design category name preserved", M.CATEGORIES.video.name === "Video / design");
check("category 4 renamed to 'Website / waitlist'", M.CATEGORIES.landing.name === "Website / waitlist");

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

console.log("\nTest 17: anchorChain walks up to a date anchor");
var chain = M.anchorChain(M.SHIPPED_TASKS, "client_wallet_done");
check("chain is client/wallet -> guardian -> testnet -> devnet -> product_e2e",
  chain.join(",") === "client_wallet_done,guardian_upgrade_done,v016_testnet,v016_devnet,product_e2e", chain.join(","));
var chain2 = M.anchorChain(M.SHIPPED_TASKS, "public_launch");
check("date-anchored task chain is just itself", chain2.join(",") === "public_launch");

console.log("\nTest 18: add / remove tasks (unique ids, dependent re-anchor, export/reset)");
// makeTask defaults: product / teaser_date / offset 0, unique id, "{n}) " label.
var addBase = M.defaultModel();
var nt = M.makeTask(addBase, {});
check("makeTask defaults to product category", nt.category === "product");
check("makeTask defaults to teaser date anchor", nt.anchor_id === M.TEASER_ANCHOR && nt.anchor_type === "date_anchor");
check("makeTask defaults to offset 0 + not external", nt.offset_business_days === 0 && nt.external_dependency === false);
check("makeTask default label carries '{n}) ' prefix", /^\d+\) /.test(nt.label), nt.label);
check("makeTask id is unique + not a reserved date anchor", !M.findTask(addBase, nt.id) && nt.id !== M.TEASER_ANCHOR && nt.id !== M.LAUNCH_ANCHOR);
// Unique id generation across repeated adds (ids collide otherwise).
var acc = M.defaultModel();
var idA = M.makeTask(acc, {}); acc = acc.concat([idA]);
var idB = M.makeTask(acc, {}); acc = acc.concat([idB]);
var idC = M.makeTask(acc, { id: "date_feasibility" }); acc = acc.concat([idC]); // collides with a shipped id
check("repeated adds get distinct ids", idA.id !== idB.id);
check("explicit id colliding with an existing id is uniquified", idC.id !== "date_feasibility" && !M.findTask(M.defaultModel(), idC.id));
// Add appears in the model + export; a fresh explicit-id task round-trips.
var withNew = M.defaultModel();
var extra = M.makeTask(withNew, { id: "extra_task", label: "1) PRODUCT: extra", category: "product", offset: 3 });
withNew = withNew.concat([extra]);
check("add grows the model to 30", withNew.length === 30);
var exAdd = M.exportModel(M.DEFAULT_TEASER, M.DEFAULT_LAUNCH, withNew);
check("export includes the added task", exAdd.tasks.some(function (t) { return t.id === "extra_task"; }) && exAdd.tasks.length === 30);
var rAdd = M.recalc({ tasks: withNew });
check("added task resolves at teaser +3bd", byId(rAdd, "extra_task").date === M.addBusinessDays(M.DEFAULT_TEASER, 3));

// Remove: dependents re-anchor to the removed task's anchor when still valid.
// company_testing (teaser anchor) has dependents support_test_workflow +
// company_testing_try_2; removing it should re-anchor both to teaser_date.
var rem1 = M.removeTask(M.defaultModel(), "company_testing");
check("remove drops the task (29 -> 28)", rem1.length === 28 && !M.findTask(rem1, "company_testing"));
var depA = M.findTask(rem1, "support_test_workflow");
var depB = M.findTask(rem1, "company_testing_try_2");
check("dependent re-anchored to removed task's anchor (teaser_date)",
  depA.anchor_id === M.TEASER_ANCHOR && depA.anchor_type === "date_anchor" && depA.external_dependency === false);
check("second dependent re-anchored to teaser_date too", depB.anchor_id === M.TEASER_ANCHOR);
check("removal leaves no dangling anchors (no resolution errors)", M.recalc({ tasks: rem1 }).errors.length === 0);
check("export after removal omits the removed task", M.exportModel(M.DEFAULT_TEASER, M.DEFAULT_LAUNCH, rem1).tasks.every(function (t) { return t.id !== "company_testing"; }));

// Remove fallback: if the removed task's OWN anchor is invalid, dependents fall
// back to teaser_date with offset 0.
var brokeModel = M.defaultModel();
var mid = M.makeTask(brokeModel, { id: "mid", anchor_id: "no_such_parent", offset: 4 }); // mid anchors a missing id
var leaf = M.makeTask(brokeModel.concat([mid]), { id: "leaf", anchor_id: "mid", offset: 2 }); // leaf anchors mid
brokeModel = brokeModel.concat([mid, leaf]);
var remBroke = M.removeTask(brokeModel, "mid"); // mid's anchor (no_such_parent) is invalid
var leaf2 = M.findTask(remBroke, "leaf");
check("dependent of a removed task with an invalid anchor falls back to teaser+0",
  leaf2.anchor_id === M.TEASER_ANCHOR && leaf2.offset_business_days === 0 && leaf2.anchor_type === "date_anchor");

// Restore shipped defaults (defaultModel) brings back the full 29-task model even
// after adds/removes on a working copy.
check("defaultModel restores the shipped 29 tasks after edits", M.defaultModel().length === TASK_COUNT);
// resetToDefaults keeps the working task SET (added stays, removed stays gone) but
// restores each surviving task's fields to its stored defaults.
var mixed = M.removeTask(M.defaultModel(), "public_teaser");
mixed = mixed.concat([M.makeTask(mixed, { id: "kept_add", label: "1) PRODUCT: kept", offset: 7 })]);
var mixedReset = M.resetToDefaults(mixed);
check("reset keeps an added task and the removed task stays gone",
  !!M.findTask(mixedReset, "kept_add") && !M.findTask(mixedReset, "public_teaser") && mixedReset.length === 29);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
