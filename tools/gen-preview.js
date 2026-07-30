/*
 * Generates a faithful, DATA-DRIVEN SVG preview of the wave-based v3 calendar
 * straight from model.js's resolved graph (real dates, the category colors/tints
 * from model.js, real task pills + EXT/WKND cues, the single WAVE 2 anchor cell),
 * then that SVG is rasterized to PNG by ImageMagick.
 *
 * This is NOT a Chromium browser capture (Chromium is present in the environment
 * but cannot run: it is missing ~13 system libraries that cannot be installed
 * without global changes). It is a truthful visualization of the actual model
 * output, used only to produce bread-calendar-v3-preview.png. Throwaway tooling,
 * not part of the shipped artifact.
 */
var M = require("../model.js");

var result = M.recalc({});
var wave2 = result.wave2;
var today = new Date().toISOString().slice(0, 10);

// ---- layout constants ------------------------------------------------------
var W = 1240, MARGIN = 20, COLW = (W - 2 * MARGIN) / 7;
var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function parseISO(iso) { var p = iso.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function toISO(dt) {
  return dt.getUTCFullYear() + "-" + String(dt.getUTCMonth() + 1).padStart(2, "0") + "-" + String(dt.getUTCDate()).padStart(2, "0");
}
function isWeekend(iso) { var d = parseISO(iso).getUTCDay(); return d === 0 || d === 6; }
function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

// tasks by date
var byDate = {};
result.tasks.forEach(function (t) { if (t.date) (byDate[t.date] = byDate[t.date] || []).push(t); });

// month span (task dates + wave2 anchor)
var allDates = result.tasks.filter(function (t) { return t.date; }).map(function (t) { return t.date; }).concat([wave2]);
var min = allDates.reduce(function (a, b) { return a < b ? a : b; });
var max = allDates.reduce(function (a, b) { return a > b ? a : b; });
var months = [];
var y = parseISO(min).getUTCFullYear(), mo = parseISO(min).getUTCMonth();
var ey = parseISO(max).getUTCFullYear(), em = parseISO(max).getUTCMonth();
while (y < ey || (y === ey && mo <= em)) { months.push({ year: y, month: mo }); mo++; if (mo > 11) { mo = 0; y++; } }

var svg = [];
var yCur = 0;

// ---- header ----------------------------------------------------------------
svg.push('<rect x="0" y="0" width="' + W + '" height="60" fill="#ffffff"/>');
svg.push('<text x="' + MARGIN + '" y="34" font-family="DejaVu Sans" font-size="24" font-weight="bold" fill="#111">Bread Reverse Launch Calendar</text>');
svg.push('<text x="' + MARGIN + '" y="52" font-family="DejaVu Sans" font-size="13" fill="#555">Wave 2 start: ' + wave2 + '  ·  wave-based v3 model  ·  ' + result.tasks.length + ' tasks</text>');
yCur = 74;

// ---- legend ----------------------------------------------------------------
var lx = MARGIN;
svg.push('<text x="' + lx + '" y="' + (yCur + 12) + '" font-family="DejaVu Sans" font-size="12" font-weight="bold" fill="#111">Legend:</text>');
lx += 62;
M.CATEGORY_ORDER.forEach(function (k) {
  var c = M.CATEGORIES[k];
  var label = c.num + ") " + c.name;
  var wsw = 22, txtw = label.length * 6.4 + 10;
  svg.push('<rect x="' + lx + '" y="' + yCur + '" width="' + wsw + '" height="16" rx="3" fill="' + c.tint + '" stroke="' + c.color + '" stroke-width="2"/>');
  svg.push('<text x="' + (lx + wsw + 5) + '" y="' + (yCur + 13) + '" font-family="DejaVu Sans" font-size="11" fill="#111">' + esc(label) + '</text>');
  lx += wsw + 5 + txtw + 10;
  if (lx > W - 160) { lx = MARGIN + 62; yCur += 24; }
});
yCur += 34;

// ---- months ----------------------------------------------------------------
function pillHeightForRow(weekIsos) {
  var maxPills = 0;
  weekIsos.forEach(function (iso) { if (byDate[iso]) maxPills = Math.max(maxPills, byDate[iso].length); });
  return 22 + maxPills * 20; // day number band + pills
}

months.forEach(function (m) {
  // month title
  svg.push('<text x="' + (W / 2) + '" y="' + (yCur + 20) + '" text-anchor="middle" font-family="DejaVu Sans" font-size="18" font-weight="bold" fill="#111">' + MONTHS[m.month] + " " + m.year + '</text>');
  yCur += 34;
  // weekday header
  for (var i = 0; i < 7; i++) {
    var hx = MARGIN + i * COLW;
    svg.push('<rect x="' + hx + '" y="' + yCur + '" width="' + COLW + '" height="22" fill="' + (i === 0 || i === 6 ? "#fffbe6" : "#f3f4f6") + '" stroke="#d9d9d9"/>');
    svg.push('<text x="' + (hx + COLW / 2) + '" y="' + (yCur + 15) + '" text-anchor="middle" font-family="DejaVu Sans" font-size="11" fill="#333">' + DOW[i] + '</text>');
  }
  yCur += 22;

  // build week rows with trimming
  var first = new Date(Date.UTC(m.year, m.month, 1));
  var cursor = new Date(Date.UTC(m.year, m.month, 1 - first.getUTCDay()));
  var weeks = [];
  for (var r = 0; r < 6; r++) {
    var days = [], hasContent = false;
    for (var c2 = 0; c2 < 7; c2++) {
      var iso = toISO(cursor);
      var inMonth = cursor.getUTCMonth() === m.month;
      if (inMonth && (iso === wave2 || byDate[iso])) hasContent = true;
      days.push({ iso: iso, day: cursor.getUTCDate(), inMonth: inMonth });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push({ days: days, hasContent: hasContent });
  }
  var fi = 0, li = weeks.length - 1;
  while (fi <= li && !weeks[fi].hasContent) fi++;
  while (li >= fi && !weeks[li].hasContent) li--;

  for (var wi = fi; wi <= li; wi++) {
    var wk = weeks[wi];
    var rowH = pillHeightForRow(wk.days.filter(function (d) { return d.inMonth; }).map(function (d) { return d.iso; }));
    for (var ci = 0; ci < 7; ci++) {
      var d = wk.days[ci];
      var cx = MARGIN + ci * COLW;
      var we = (ci === 0 || ci === 6);
      var bg = !d.inMonth ? "#fafafa" : we ? "#fffbe6" : "#ffffff";
      svg.push('<rect x="' + cx + '" y="' + yCur + '" width="' + COLW + '" height="' + rowH + '" fill="' + bg + '" stroke="#d9d9d9"/>');
      if (d.inMonth && d.iso === today) {
        svg.push('<rect x="' + (cx + 1.5) + '" y="' + (yCur + 1.5) + '" width="' + (COLW - 3) + '" height="' + (rowH - 3) + '" fill="none" stroke="#1d4ed8" stroke-width="3"/>');
      }
      // day number
      var numColor = d.inMonth ? "#111" : "#b7b7b7";
      if (d.inMonth && d.iso === wave2) {
        // circled anchor day
        svg.push('<circle cx="' + (cx + 16) + '" cy="' + (yCur + 15) + '" r="12" fill="none" stroke="#d55e00" stroke-width="3"/>');
        svg.push('<text x="' + (cx + 16) + '" y="' + (yCur + 19) + '" text-anchor="middle" font-family="DejaVu Sans" font-size="13" font-weight="bold" fill="#111">' + d.day + '</text>');
        svg.push('<text x="' + (cx + 34) + '" y="' + (yCur + 14) + '" font-family="DejaVu Sans" font-size="8" font-weight="bold" fill="#d55e00">WAVE 2</text>');
      } else {
        svg.push('<text x="' + (cx + 6) + '" y="' + (yCur + 18) + '" font-family="DejaVu Sans" font-size="14" font-weight="bold" fill="' + numColor + '">' + d.day + '</text>');
      }
      // pills
      if (d.inMonth && byDate[d.iso]) {
        byDate[d.iso].forEach(function (t, pi) {
          var cat = M.CATEGORIES[t.category];
          var py = yCur + 22 + pi * 20;
          var pw = COLW - 8;
          var dash = t.external_dependency ? ' stroke-dasharray="4 2"' : "";
          svg.push('<rect x="' + (cx + 4) + '" y="' + py + '" width="' + pw + '" height="17" rx="4" fill="' + cat.tint + '" stroke="' + cat.color + '" stroke-width="2"' + dash + '/>');
          var badge = (t.external_dependency ? " [EXT]" : "") + (t.weekend ? " [WKND]" : "");
          var full = t.label + badge;
          var maxChars = Math.floor((pw - 8) / 5.4);
          if (full.length > maxChars) full = full.slice(0, maxChars - 1) + "…";
          svg.push('<text x="' + (cx + 8) + '" y="' + (py + 12) + '" font-family="DejaVu Sans" font-size="9" fill="#111">' + esc(full) + '</text>');
        });
      }
    }
    yCur += rowH;
  }
  yCur += 20;
});

var H = yCur + 10;
var out =
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
  '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>' +
  svg.join("") +
  '</svg>';

require("fs").writeFileSync(process.argv[2] || "preview.svg", out);
console.log("wrote SVG " + W + "x" + Math.round(H) + " (" + result.tasks.length + " tasks, " + months.length + " months)");
