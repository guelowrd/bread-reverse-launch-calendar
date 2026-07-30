/*
 * Deterministic verification for the Bread reverse calendar task/date model
 * (wave-based v3). Run: node verify.js   (exit code 0 = all pass, 1 = failure)
 *
 * Covers the wave-based graph model:
 *  0. Shipped defaults match the authoritative v3 JSON (baseline-model.json)
 *     EXACTLY (version 3, wave2_date, every task field including the stored
 *     external_dependency).
 *  1. The single Wave 2 anchor reproduces every task's expected date (date AND
 *     item anchors, including forward references).
 *  2. Exactly 31 tasks, each with a stable id distinct from its label.
 *  3. anchor_type is DERIVED from anchor_id; external_dependency is a STORED flag
 *     (item anchors are a mix of external and internal, so it is not derivable).
 *  4. Business-day arithmetic (forward/back across weekends, weekend anchors).
 *  5. Item anchors: moving a parent recomputes the whole downstream chain; a
 *     sibling chain rooted elsewhere is unaffected.
 *  6. Moving the Wave 2 date shifts the ENTIRE graph by the same business days.
 *  7. Forward references resolve (anchor defined later in the array).
 *  8. The v0.16 chain resolves through item anchors to its default dates.
 *  9. Cycle detection flags every member unresolved.
 * 10. Invalid anchor id is detected and reported (not thrown).
 * 11. No teaser/launch, gap, or critical-after-launch warnings remain; the model
 *     is quiet at defaults and only surfaces unresolved-anchor errors.
 * 12. Editing: label / category / anchor (type re-derived, external preserved) /
 *     offset.
 * 13. Defaults: promoteToDefaults + resetToDefaults round-trip (incl. external).
 * 14. Export model (version 3, wave2_date) includes labels, anchors, offsets,
 *     external_dependency, and defaults.
 * 15. Wave labels present; old teaser/launch-era labels gone.
 * 16. Every label carries "{n}) " and category prefixes are contiguous 0..7.
 * 17. anchorChain returns the ancestor chain up to the Wave 2 date anchor.
 * 18. Add / remove tasks (unique ids, dependent re-anchor, export/reset).
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

// Expected default-resolved dates for all 31 tasks (wave2 2026-07-31, Friday).
var EXPECT = {
  wave2_decision: "2026-07-30",
  support_ready: "2026-07-30",
  wave2_start: "2026-07-31",
  v016_devnet: "2026-07-24",
  guardian_upgrade_done: "2026-08-03",
  v016_testnet: "2026-08-05",
  client_wallet_done: "2026-08-07",
  wave2_feedback_changes: "2026-08-05",
  wave2_stores_submit: "2026-08-05",
  wave2_stores_live: "2026-08-06",
  wave3_recruiting_ready: "2026-08-07",
  wave3_start: "2026-08-10",
  wave3_feedback_changes: "2026-08-13",
  wave3_stores_submit: "2026-08-13",
  wave3_stores_live: "2026-08-14",
  circle_announcement: "2026-08-12",
  waitlist_qa: "2026-08-11",
  website_out: "2026-08-12",
  visual_identity_board: "2026-08-10",
  teaser_final: "2026-08-18",
  wave4_comms_ready: "2026-08-18",
  wave4_start: "2026-08-19",
  wave4_feedback_changes: "2026-08-24",
  wave4_stores_submit: "2026-08-24",
  wave4_stores_live: "2026-08-25",
  wave5_comms_ready: "2026-08-25",
  wave5_start: "2026-08-26",
  wave5_feedback_changes: "2026-08-31",
  wave5_stores_submit: "2026-08-31",
  wave5_stores_live: "2026-09-01",
  wave6_start: "2026-09-02"
};
var TASK_COUNT = 31;

console.log("Test 0: shipped defaults match the authoritative v3 JSON (baseline-model.json) exactly");
var baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "baseline-model.json"), "utf8"));
var shipped = M.exportModel(M.DEFAULT_WAVE2, M.defaultModel());
check("baseline is version 3", baseline.version === 3, "got " + baseline.version);
check("shipped export is version 3", shipped.version === 3);
check("baseline has 31 tasks", baseline.tasks.length === TASK_COUNT, "got " + baseline.tasks.length);
check("shipped wave2_date matches baseline (2026-07-31)", shipped.wave2_date === baseline.wave2_date && shipped.wave2_date === "2026-07-31", shipped.wave2_date);
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

console.log("\nTest 1: the Wave 2 anchor reproduces expected dates (date AND item anchors)");
var base = M.recalc({});
Object.keys(EXPECT).forEach(function (id) {
  var t = byId(base, id);
  check(id + " = " + EXPECT[id], t && t.date === EXPECT[id], t && ("got " + t.date));
});
check("no resolution errors at defaults", base.errors.length === 0, JSON.stringify(base.errors));
check("every expected id is a real task (no typo)", Object.keys(EXPECT).every(function (id) { return !!byId(base, id); }));

console.log("\nTest 2: exactly 31 tasks, stable ids != labels");
check(TASK_COUNT + " tasks", base.tasks.length === TASK_COUNT, "got " + base.tasks.length);
var ids = {};
base.tasks.forEach(function (t) {
  check("id present & unique: " + t.id, !!t.id && !ids[t.id]); ids[t.id] = true;
  check("id differs from label: " + t.id, t.id !== t.label);
});

console.log("\nTest 3: anchor_type derived from anchor_id; external_dependency is a stored flag");
base.tasks.forEach(function (t) {
  var wantType = t.anchor_id === M.WAVE2_ANCHOR ? "date_anchor" : "item_anchor";
  check("anchor_type derived for " + t.id, t.anchor_type === wantType, "got " + t.anchor_type);
});
// external_dependency is NOT a function of anchor type: there exist item-anchored
// tasks that are external (v016/store-live/Circle/website) AND item-anchored tasks
// that are internal (feedback, submit, comms, waitlist QA). This proves it is a
// stored semantic flag, not derived.
var itemAnchored = base.tasks.filter(function (t) { return t.anchor_type === "item_anchor"; });
check("some item-anchored tasks are external", itemAnchored.some(function (t) { return t.external_dependency; }));
check("some item-anchored tasks are NOT external", itemAnchored.some(function (t) { return !t.external_dependency; }));
check("v016_devnet is external (waiting on the v0.16 release)", byId(base, "v016_devnet").external_dependency === true);
check("wave2_feedback_changes is NOT external (internal product work)", byId(base, "wave2_feedback_changes").external_dependency === false);
check("website_out is external (website go-live)", byId(base, "website_out").external_dependency === true);
check("waitlist_qa is NOT external", byId(base, "waitlist_qa").external_dependency === false);
// The date-anchored Wave 2 rows are internal.
check("wave2_start (date anchor) is not external", byId(base, "wave2_start").external_dependency === false);
// Stored external flag survives a clone unchanged.
var cloned = M.cloneTasks(base.tasks);
check("external_dependency preserved through cloneTask", cloned.every(function (c) {
  return c.external_dependency === byId(base, c.id).external_dependency;
}));
// Stale-label migration ("{n} text" -> "{n}) text") still works.
var staleLabelModel = M.cloneTasks([{
  id: "stale_label", label: "2 STORES: old label", category: "stores",
  anchor_id: M.WAVE2_ANCHOR, offset_business_days: 0, external_dependency: false,
  default_label: "2 STORES: old label", default_category: "stores",
  default_anchor_id: M.WAVE2_ANCHOR, default_offset_business_days: 0, default_external_dependency: false
}]);
check("cloneTask migrates stale labels from '{n} text' to '{n}) text'", staleLabelModel[0].label === "2) STORES: old label", staleLabelModel[0].label);
check("cloneTask migrates stale default_label too", staleLabelModel[0].default_label === "2) STORES: old label", staleLabelModel[0].default_label);

console.log("\nTest 4: business-day arithmetic (Wave 2 anchor 2026-07-31 is a Friday)");
check("Mon +1 = Tue", M.addBusinessDays("2026-08-03", 1) === "2026-08-04");
check("Fri +1 skips weekend to Mon", M.addBusinessDays("2026-07-31", 1) === "2026-08-03");
check("Mon -1 skips weekend to Fri", M.addBusinessDays("2026-08-03", -1) === "2026-07-31");
check("offset 0 returns anchor", M.addBusinessDays("2026-07-31", 0) === "2026-07-31");
check("weekend anchor +0 stays put", M.addBusinessDays("2026-08-01", 0) === "2026-08-01");
check("Sat +1 = Mon", M.addBusinessDays("2026-08-01", 1) === "2026-08-03");
check("negative offset across weekend (Wave 2 -5bd = 2026-07-24)", M.addBusinessDays(M.DEFAULT_WAVE2, -5) === "2026-07-24");
check("businessDaysBetween Fri..Wed = 3", M.businessDaysBetween("2026-07-31", "2026-08-05") === 3);
check("businessDaysBetween signed backward", M.businessDaysBetween("2026-08-05", "2026-07-31") === -3);
check("addBusinessDays(a, between(a,b)) === b", M.addBusinessDays("2026-07-24", M.businessDaysBetween("2026-07-24", "2026-09-02")) === "2026-09-02");

console.log("\nTest 5: item anchors recompute downstream by the same shift; siblings unaffected");
var m5 = M.defaultModel();
M.findTask(m5, "v016_devnet").offset_business_days = -3; // 2bd later (was -5)
var r5 = M.recalc({ tasks: m5 });
["v016_testnet", "guardian_upgrade_done", "client_wallet_done", "wave3_start", "circle_announcement", "website_out", "wave4_start", "wave6_start"].forEach(function (id) {
  var want = M.addBusinessDays(EXPECT[id], 2);
  check("downstream " + id + " shifted +2bd", byId(r5, id).date === want, "got " + byId(r5, id).date + " want " + want);
});
// The Wave 2 stores chain roots at wave2_start, not v016_devnet, so it is unaffected.
check("sibling chain (wave2_stores_live) unaffected", byId(r5, "wave2_stores_live").date === EXPECT.wave2_stores_live);
check("wave2_decision (date-anchored) unaffected", byId(r5, "wave2_decision").date === EXPECT.wave2_decision);
check("v016_devnet itself moved", byId(r5, "v016_devnet").date === M.addBusinessDays(EXPECT.v016_devnet, 2));
check("moved flag set on v016_devnet", byId(r5, "v016_devnet").moved === true);
check("moved flag set on downstream client_wallet_done", byId(r5, "client_wallet_done").moved === true);
check("moved flag NOT set on sibling wave2_stores_live", byId(r5, "wave2_stores_live").moved === false);

console.log("\nTest 6: moving the Wave 2 date shifts the ENTIRE graph by the same business days");
var newWave2 = M.addBusinessDays(M.DEFAULT_WAVE2, 5);
var t6 = M.recalc({ wave2: newWave2 });
check("no errors after moving Wave 2", t6.errors.length === 0);
base.tasks.forEach(function (bt) {
  var now = byId(t6, bt.id).date;
  check("everything moved +5bd: " + bt.id, now === M.addBusinessDays(bt.date, 5), "got " + now);
});
var newWave2Back = M.addBusinessDays(M.DEFAULT_WAVE2, -4);
var t6b = M.recalc({ wave2: newWave2Back });
check("moving Wave 2 backward shifts wave6_start backward too",
  byId(t6b, "wave6_start").date === M.addBusinessDays(EXPECT.wave6_start, -4));

console.log("\nTest 7: forward references resolve (anchor defined later in the array)");
// support_ready (index 1) anchors wave2_start (index 2); guardian (index 4) anchors
// v016_testnet (index 5); visual_identity_board anchors wave4_start (later).
check("support_ready resolves through a forward reference", byId(base, "support_ready").date === EXPECT.support_ready);
check("guardian_upgrade_done resolves through a forward reference", byId(base, "guardian_upgrade_done").date === EXPECT.guardian_upgrade_done);
check("visual_identity_board resolves through a forward reference", byId(base, "visual_identity_board").date === EXPECT.visual_identity_board);
var supportIdx = M.SHIPPED_TASKS.findIndex(function (t) { return t.id === "support_ready"; });
var startIdx = M.SHIPPED_TASKS.findIndex(function (t) { return t.id === "wave2_start"; });
check("support_ready is authored BEFORE its anchor wave2_start (a true forward ref)", supportIdx < startIdx);

console.log("\nTest 8: v0.16 chain resolves through item anchors (default anchor)");
check("v016_devnet = 2026-07-24 (wave2_start -5bd)", byId(base, "v016_devnet").date === "2026-07-24");
check("v016_testnet = 2026-08-05 (devnet +8bd)", byId(base, "v016_testnet").date === "2026-08-05");
check("guardian_upgrade_done = 2026-08-03 (testnet -2bd)", byId(base, "guardian_upgrade_done").date === "2026-08-03");
check("client_wallet_done = 2026-08-07 (guardian +4bd)", byId(base, "client_wallet_done").date === "2026-08-07");
check("v016_devnet anchor is item_anchor -> wave2_start", byId(base, "v016_devnet").anchor_type === "item_anchor" && byId(base, "v016_devnet").anchor_id === "wave2_start");

console.log("\nTest 9: cycle detection");
var mc = M.defaultModel();
M.findTask(mc, "wave2_start").anchor_type = "item_anchor";
M.findTask(mc, "wave2_start").anchor_id = "client_wallet_done"; // wave2_start -> ... -> wave2_start
var rc = M.recalc({ tasks: mc });
var cycleIds = rc.errors.map(function (e) { return e.id; });
["wave2_start", "v016_devnet", "v016_testnet", "guardian_upgrade_done", "client_wallet_done"].forEach(function (id) {
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

console.log("\nTest 11: no gap / critical-after-launch warnings survive the wave rework");
check("no warnings at defaults", M.validate(base).length === 0, JSON.stringify(M.validate(base)));
check("model exposes no launch/teaser/critical API", M.DEFAULT_TEASER === undefined && M.DEFAULT_LAUNCH === undefined && M.CRITICAL_AFTER_LAUNCH === undefined && M.TEASER_ANCHOR === undefined && M.LAUNCH_ANCHOR === undefined);
// Pushing a task far out no longer produces a "critical dependency after launch"
// style warning (there is no launch): the model stays quiet unless a graph breaks.
var mw = M.defaultModel();
M.findTask(mw, "client_wallet_done").offset_business_days = 60;
check("pushing a task far out produces no warning (no launch concept)", M.validate(M.recalc({ tasks: mw })).length === 0);

console.log("\nTest 12: editing label / category / anchor / offset (type re-derived, external preserved)");
var me = M.defaultModel();
var e = M.findTask(me, "wave6_start");
e.label = "7) PUBLIC: Wave 6 (edited)";
e.category = "comms";
e.offset_business_days = 2;
var re = M.recalc({ tasks: me });
var et = byId(re, "wave6_start");
check("label edit applied", et.label === "7) PUBLIC: Wave 6 (edited)");
check("category edit applied", et.category === "comms");
check("offset edit recomputes date", et.date === M.addBusinessDays(EXPECT.wave5_stores_live, 2));
// Re-anchor wave2_decision from the Wave 2 date to an item anchor.
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
// Re-anchor back to the date anchor; still no change to the stored external flag.
var f2 = M.findTask(me2, "wave2_decision");
f2.anchor_id = M.WAVE2_ANCHOR;
f2.anchor_type = M.deriveAnchorType(f2.anchor_id);
var re3 = M.recalc({ tasks: me2 });
check("re-anchored back to date anchor keeps stored external flag", byId(re3, "wave2_decision").external_dependency === beforeExt);
check("re-anchored back to date anchor reports date_anchor", byId(re3, "wave2_decision").anchor_type === "date_anchor");

console.log("\nTest 13: defaults round-trip (promote + reset), incl. external_dependency");
var md = M.defaultModel();
M.findTask(md, "wave6_start").offset_business_days = -4;
M.findTask(md, "wave6_start").label = "changed";
M.findTask(md, "wave6_start").external_dependency = true; // flip stored flag
var promoted = M.promoteToDefaults(md);
check("promote copies current into default_*", M.findTask(promoted, "wave6_start").default_offset_business_days === -4 && M.findTask(promoted, "wave6_start").default_label === "changed");
check("promote copies stored external_dependency into default", M.findTask(promoted, "wave6_start").default_external_dependency === true);
M.findTask(promoted, "wave6_start").offset_business_days = 9;
M.findTask(promoted, "wave6_start").external_dependency = false;
var resetted = M.resetToDefaults(promoted);
check("reset restores promoted default offset", M.findTask(resetted, "wave6_start").offset_business_days === -4);
check("reset restores promoted default label", M.findTask(resetted, "wave6_start").label === "changed");
check("reset restores promoted default external_dependency", M.findTask(resetted, "wave6_start").external_dependency === true);
check("shipped model unchanged by edits", M.findTask(M.defaultModel(), "wave6_start").offset_business_days === 1 && M.findTask(M.defaultModel(), "wave6_start").external_dependency === false);

console.log("\nTest 14: export model (version 3, wave2_date) includes labels/anchors/offsets/external/defaults");
var ex = M.exportModel(M.DEFAULT_WAVE2, M.defaultModel());
check("export is version 3", ex.version === 3);
check("export has wave2_date and no teaser/launch", ex.wave2_date === M.DEFAULT_WAVE2 && !("teaser_date" in ex) && !("launch_date" in ex));
check("export has 31 tasks", ex.tasks.length === TASK_COUNT);
var exOne = ex.tasks.find(function (t) { return t.id === "v016_testnet"; });
check("exported task carries anchor+offset", exOne.anchor_type === "item_anchor" && exOne.anchor_id === "v016_devnet" && exOne.offset_business_days === 8);
check("exported task carries stored external_dependency + defaults", exOne.external_dependency === true && exOne.default_external_dependency === true && exOne.default_anchor_id === "v016_devnet");
check("export round-trips through JSON", JSON.parse(JSON.stringify(ex)).tasks.length === TASK_COUNT);

console.log("\nTest 15: wave labels present; old teaser/launch-era labels gone");
var labels = base.tasks.map(function (t) { return t.label; });
["7) PUBLIC: teaser if GO", "7) PUBLIC: Launch announcement", "3) LAUNCH VIDEO: storyboard",
 "3) LAUNCH VIDEO: capture", "3) LAUNCH VIDEO: review", "3) LAUNCH VIDEO: final",
 "2) STORES: submit final version", "2) STORES: final version live", "1) GO/NO-GO before teaser",
 "1) PRODUCT: company testing (try 1)", "1) PRODUCT: company testing (try 2)",
 "4) LANDING: page live", "4) WEBSITE - new version out", "6) COMMS: launch final"].forEach(function (l) {
  check("obsolete label removed: '" + l + "'", labels.indexOf(l) === -1);
});
["1) PRODUCT: Wave 2 decision", "1) PRODUCT: Wave 2 company testing",
 "5) SUPPORT: intake workflow ready", "0) v0.16 on devnet", "0) v0.16 on testnet",
 "0) Guardian upgrade done", "0) Client/wallet/Epoch upgrade done",
 "1) PRODUCT: Wave 3 trusted-network testing", "7) PUBLIC: Circle announcement",
 "4) WEBSITE: new website + Bread waitlist live", "4) WAITLIST: form + CRM flow ready",
 "7) PUBLIC: Wave 4 teaser + waitlist push", "6) COMMS: Wave 4 channels + waitlist CTA ready",
 "7) PUBLIC: Wave 5 X waitlist follow-up", "6) COMMS: Wave 5 X push + How Bread Works ready",
 "7) PUBLIC: Wave 6 targeted push if needed", "2) STORES: post-Wave-2 build live"].forEach(function (l) {
  check("present: '" + l + "'", labels.indexOf(l) !== -1);
});
// Wave narrative anchoring spot checks.
check("Wave 3 comes after v0.16 testnet (wave3_start anchors v016_testnet +3bd)",
  byId(base, "wave3_start").anchor_id === "v016_testnet" && byId(base, "wave3_start").date === "2026-08-10");
check("Circle announcement is a Public moment", byId(base, "circle_announcement").category === "public");
check("website + waitlist sit in Website/waitlist and anchor Circle",
  byId(base, "website_out").category === "landing" && byId(base, "website_out").anchor_id === "circle_announcement" &&
  byId(base, "waitlist_qa").category === "landing" && byId(base, "waitlist_qa").anchor_id === "circle_announcement");
check("Wave 4 is 5bd after the website goes live", byId(base, "wave4_start").anchor_id === "website_out" && byId(base, "wave4_start").offset_business_days === 5);
["wave2", "wave3", "wave4", "wave5"].forEach(function (w) {
  check(w + " feedback/changes is +3bd from the wave start", byId(base, w + "_feedback_changes").offset_business_days === 3);
  check(w + " store submit is +0bd from feedback/changes", byId(base, w + "_stores_submit").offset_business_days === 0 && byId(base, w + "_stores_submit").anchor_id === w + "_feedback_changes");
  check(w + " store live is +1bd from submit", byId(base, w + "_stores_live").offset_business_days === 1 && byId(base, w + "_stores_live").anchor_id === w + "_stores_submit");
});
check("Wave 6 is optional and anchors the Wave 5 store-live", byId(base, "wave6_start").anchor_id === "wave5_stores_live");
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

console.log("\nTest 17: anchorChain walks up to the Wave 2 date anchor");
var chain = M.anchorChain(M.SHIPPED_TASKS, "client_wallet_done");
check("chain is client/wallet -> guardian -> testnet -> devnet -> wave2_start",
  chain.join(",") === "client_wallet_done,guardian_upgrade_done,v016_testnet,v016_devnet,wave2_start", chain.join(","));
var chain2 = M.anchorChain(M.SHIPPED_TASKS, "wave2_decision");
check("date-anchored task chain is just itself", chain2.join(",") === "wave2_decision");

console.log("\nTest 18: add / remove tasks (unique ids, dependent re-anchor, export/reset)");
var addBase = M.defaultModel();
var nt = M.makeTask(addBase, {});
check("makeTask defaults to product category", nt.category === "product");
check("makeTask defaults to Wave 2 date anchor", nt.anchor_id === M.WAVE2_ANCHOR && nt.anchor_type === "date_anchor");
check("makeTask defaults to offset 0 + not external", nt.offset_business_days === 0 && nt.external_dependency === false);
check("makeTask default label carries '{n}) ' prefix", /^\d+\) /.test(nt.label), nt.label);
check("makeTask id is unique + not the reserved date anchor", !M.findTask(addBase, nt.id) && nt.id !== M.WAVE2_ANCHOR);
var acc = M.defaultModel();
var idA = M.makeTask(acc, {}); acc = acc.concat([idA]);
var idB = M.makeTask(acc, {}); acc = acc.concat([idB]);
var idC = M.makeTask(acc, { id: "wave2_start" }); acc = acc.concat([idC]); // collides with a shipped id
check("repeated adds get distinct ids", idA.id !== idB.id);
check("explicit id colliding with an existing id is uniquified", idC.id !== "wave2_start" && !M.findTask(M.defaultModel(), idC.id));
var withNew = M.defaultModel();
var extra = M.makeTask(withNew, { id: "extra_task", label: "1) PRODUCT: extra", category: "product", offset: 3 });
withNew = withNew.concat([extra]);
check("add grows the model to 32", withNew.length === 32);
var exAdd = M.exportModel(M.DEFAULT_WAVE2, withNew);
check("export includes the added task", exAdd.tasks.some(function (t) { return t.id === "extra_task"; }) && exAdd.tasks.length === 32);
var rAdd = M.recalc({ tasks: withNew });
check("added task resolves at Wave 2 +3bd", byId(rAdd, "extra_task").date === M.addBusinessDays(M.DEFAULT_WAVE2, 3));

// Remove: v016_testnet has dependents guardian_upgrade_done, wave3_start,
// circle_announcement; removing it re-anchors each to v016_testnet's OWN anchor
// (v016_devnet), preserving offsets.
var rem1 = M.removeTask(M.defaultModel(), "v016_testnet");
check("remove drops the task (31 -> 30)", rem1.length === 30 && !M.findTask(rem1, "v016_testnet"));
["guardian_upgrade_done", "wave3_start", "circle_announcement"].forEach(function (id) {
  check("dependent " + id + " re-anchored to removed task's anchor (v016_devnet)", M.findTask(rem1, id).anchor_id === "v016_devnet");
});
check("removal leaves no dangling anchors (no resolution errors)", M.recalc({ tasks: rem1 }).errors.length === 0);
check("export after removal omits the removed task", M.exportModel(M.DEFAULT_WAVE2, rem1).tasks.every(function (t) { return t.id !== "v016_testnet"; }));

// Remove fallback: if the removed task's OWN anchor is invalid, dependents fall
// back to the Wave 2 date with offset 0.
var brokeModel = M.defaultModel();
var mid = M.makeTask(brokeModel, { id: "mid", anchor_id: "no_such_parent", offset: 4 });
var leaf = M.makeTask(brokeModel.concat([mid]), { id: "leaf", anchor_id: "mid", offset: 2 });
brokeModel = brokeModel.concat([mid, leaf]);
var remBroke = M.removeTask(brokeModel, "mid");
var leaf2 = M.findTask(remBroke, "leaf");
check("dependent of a removed task with an invalid anchor falls back to Wave 2 + 0",
  leaf2.anchor_id === M.WAVE2_ANCHOR && leaf2.offset_business_days === 0 && leaf2.anchor_type === "date_anchor");

check("defaultModel restores the shipped 31 tasks after edits", M.defaultModel().length === TASK_COUNT);
var mixed = M.removeTask(M.defaultModel(), "wave6_start");
mixed = mixed.concat([M.makeTask(mixed, { id: "kept_add", label: "1) PRODUCT: kept", offset: 7 })]);
var mixedReset = M.resetToDefaults(mixed);
check("reset keeps an added task and the removed task stays gone",
  !!M.findTask(mixedReset, "kept_add") && !M.findTask(mixedReset, "wave6_start") && mixedReset.length === 31);

console.log("\n=== " + pass + " passed, " + fail + " failed ===");
process.exit(fail === 0 ? 0 : 1);
