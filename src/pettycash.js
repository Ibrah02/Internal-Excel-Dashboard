/* Petty cash book — offline, local, no subscription.
 * A dedicated screen: record monthly petty cash purchases, compute total spent,
 * cash remaining and the top-up to request against a fixed float (imprest system),
 * and export the month as an .xlsx to present to the manager.
 * Each purchase is unit cost x quantity = line total; category totals sum the line totals.
 * Depends on globals: XLSX (SheetJS, reads AND writes .xlsx) and Chart (Chart.js). */
(function () {
  "use strict";

  var PALETTE = ["#0f6e56", "#378add", "#ef9f27", "#d85a30", "#7f77dd", "#1d9e75", "#d4537e", "#639922"];

  // One petty cash book = a fixed float (ceiling) spent down over one month.
  var pc = {
    ceiling: 3000000,
    month: "",
    rows: [],            // [{date, item, category, unit, qty, receipt}]
  };
  var pcChart = null;
  var pcCtl = null; // sort/filter/search controls for the purchases table

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : 0; }
  function numStr(v) { return (v === "" || v == null) ? "" : String(num(v)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function money(n) { return "UGX " + Math.round(n).toLocaleString(); }
  function pad2(n) { return String(n).padStart(2, "0"); }

  // Days available in the chosen month, for the date dropdown.
  function daysInMonth(ym) {
    var m = /^(\d{4})-(\d{2})/.exec(ym || "");
    if (!m) return 31;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10), 0).getDate();
  }

  // A day-of-month dropdown whose value is the full YYYY-MM-DD date (month from the header).
  function daySelect(i, dateStr) {
    var ym = pc.month || "";
    var n = daysInMonth(ym);
    var selDay = /^\d{4}-\d{2}-(\d{2})/.test(dateStr) ? parseInt(dateStr.slice(8, 10), 10) : 0;
    var opts = '<option value=""' + (selDay ? "" : " selected") + ">Day</option>";
    for (var d = 1; d <= n; d++) {
      var val = ym ? ym + "-" + pad2(d) : "";
      opts += '<option value="' + val + '"' + (d === selDay ? " selected" : "") + ">" + d + "</option>";
    }
    return '<select class="day-sel" data-idx="' + i + '" data-f="date">' + opts + "</select>";
  }

  // ---- The arithmetic (the whole point) -----------------------------------
  function lineTotal(r) { return num(r.unit) * num(r.qty); }
  // A blank category reads as "NA" (Not Applicable) in the breakdown and the export.
  function catOf(r) { return (r.category || "").trim() || "NA"; }

  // Rows currently visible in the table (after sort/filter/search). The on-screen KPIs and the
  // category chart run over these so the manager can tick categories off and watch the impact on
  // the monthly cash. The EXPORT always uses the full month (pc.rows), never this filtered view.
  function visibleRows() {
    if (!pcCtl) return pc.rows.slice();
    return pcCtl.order().map(function (i) { return pc.rows[i]; });
  }

  function totalsOf(rows) {
    var spent = rows.reduce(function (a, r) { return a + lineTotal(r); }, 0);
    return { spent: spent, remaining: pc.ceiling - spent, topup: spent };
  }
  function byCategoryOf(rows) {
    var map = {}, order = [];
    rows.forEach(function (r) {
      var key = catOf(r);
      if (!(key in map)) { map[key] = 0; order.push(key); }
      map[key] += lineTotal(r);
    });
    return { order: order, map: map };
  }
  function totals() { return totalsOf(visibleRows()); }         // on-screen analysis view
  function byCategory() { return byCategoryOf(visibleRows()); } // on-screen analysis view

  // ---- Rendering ----------------------------------------------------------
  function blankRow() { return { date: "", item: "", category: "", unit: "", qty: "1", receipt: "" }; }

  // The purchases table supports sort / search / per-column filter via the shared TableTools engine.
  // Row identity is the original pc.rows index (data-idx), so sorting/filtering the VIEW never
  // disturbs the data; totals and the category chart always run over ALL rows, never the filtered view.
  function ensurePcTable() {
    if (pcCtl) return;
    var t = $("pcTable");
    t.innerHTML = "<thead></thead><tbody></tbody>";
    pcCtl = TableTools.attach({
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "item", label: "Item", type: "text" },
        { key: "category", label: "Category", type: "text" },
        { key: "unit", label: "Unit cost (UGX)", type: "number" },
        { key: "qty", label: "Qty", type: "number" },
        { key: "linetotal", label: "Line total", type: "number" },
        { key: "receipt", label: "Receipt no.", type: "text" },
      ],
      getValue: function (i, key) {
        var r = pc.rows[i]; if (!r) return "";
        if (key === "linetotal") return lineTotal(r);
        if (key === "unit" || key === "qty") return num(r[key]);
        return r[key];
      },
      rowCount: function () { return pc.rows.length; },
      theadEl: t.querySelector("thead"),
      searchEl: $("pcSearch"),
      extraHead: "<th></th>",
      renderBody: function () { renderPcBody(t.querySelector("tbody")); recompute(); },
    });
  }

  function renderTable() { ensurePcTable(); pcCtl.refresh(); }

  function renderPcBody(tbody) {
    if (!pc.rows.length) { tbody.innerHTML = '<tr><td colspan="8" class="pc-empty">No purchases yet. Click <b>+ Add row</b> to record one.</td></tr>'; return; }
    var order = pcCtl.order();
    if (!order.length) { tbody.innerHTML = '<tr><td colspan="8" class="pc-empty">No rows match the current search or filter.</td></tr>'; return; }
    tbody.innerHTML = order.map(function (i) {
      var r = pc.rows[i];
      return '<tr>' +
        '<td>' + daySelect(i, r.date) + '</td>' +
        '<td><input type="text" data-idx="' + i + '" data-f="item" value="' + esc(r.item) + '" placeholder="what was bought"></td>' +
        '<td><input type="text" data-idx="' + i + '" data-f="category" value="' + esc(r.category) + '" placeholder="e.g. transport"></td>' +
        '<td class="num"><input type="number" class="cost" data-idx="' + i + '" data-f="unit" value="' + esc(r.unit) + '" min="0" step="100" placeholder="0"></td>' +
        '<td class="num"><div class="qty-step">' +
          '<button type="button" class="step-btn" data-step="-1" data-idx="' + i + '" aria-label="Decrease quantity">&minus;</button>' +
          '<input type="number" class="qty-in" data-idx="' + i + '" data-f="qty" value="' + esc(r.qty) + '" min="0" step="1" placeholder="1">' +
          '<button type="button" class="step-btn" data-step="1" data-idx="' + i + '" aria-label="Increase quantity">+</button>' +
        '</div></td>' +
        '<td class="num lt" data-lt="' + i + '">' + esc(money(lineTotal(r))) + '</td>' +
        '<td><input type="text" data-idx="' + i + '" data-f="receipt" value="' + esc(r.receipt) + '" placeholder="receipt #"></td>' +
        '<td><button type="button" class="row-del" data-del="' + i + '" title="Delete row">&times;</button></td>' +
        '</tr>';
    }).join("");
  }

  function renderKpis() {
    var rows = visibleRows(), t = totalsOf(rows);
    var tiles = [
      { lab: "Total spent", val: money(t.spent) },
      { lab: "Cash remaining", val: money(t.remaining), warn: t.remaining < 0 },
      { lab: "Top-up to request", val: money(t.topup) },
      { lab: "Purchases", val: rows.length.toLocaleString() },
    ];
    $("pcKpis").innerHTML = tiles.map(function (tile) {
      return '<div class="tile' + (tile.warn ? " warn" : "") + '">' +
        '<div class="lab">' + esc(tile.lab) + '</div>' +
        '<div class="val">' + esc(tile.val) + '</div></div>';
    }).join("");
  }

  function renderChart() {
    var bc = byCategory();
    var order = bc.order.filter(function (k) { return bc.map[k] > 0; });
    if (pcChart) { pcChart.destroy(); pcChart = null; }
    if (!order.length) { $("pcBreakdownCard").style.display = "none"; return; }
    $("pcBreakdownCard").style.display = "block";
    pcChart = new Chart($("pcChart"), {
      type: "doughnut",
      data: {
        labels: order,
        datasets: [{ data: order.map(function (k) { return bc.map[k]; }), backgroundColor: order.map(function (_, i) { return PALETTE[i % PALETTE.length]; }) }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: function (c) { return c.label + ": " + money(c.parsed); } } },
        },
      },
    });
  }

  // When a filter/search narrows the view, make it unmistakable that the tiles and chart are an
  // analysis subset, not the true month, so a filtered figure is never presented as the whole.
  function updateFilterNote() {
    var el = $("pcFilterNote"); if (!el) return;
    var vis = visibleRows().length, all = pc.rows.length;
    if (vis === all) { el.style.display = "none"; return; }
    el.style.display = "block";
    el.innerHTML = "Analysis view: showing <b>" + vis + " of " + all + "</b> purchases. " +
      "The tiles and chart reflect the visible categories; the exported file always includes the full month.";
  }

  function recompute() { renderKpis(); renderChart(); updateFilterNote(); }
  function renderAll() { renderTable(); recompute(); }

  // ---- Export (the manager's presentation) --------------------------------
  function exportXlsx() {
    var t = totalsOf(pc.rows); // the record is always the full month, never the on-screen filter
    var monthLabel = pc.month || "(month not set)";

    var summary = [
      ["Petty cash summary"],
      ["Month", monthLabel],
      ["Float ceiling", pc.ceiling],
      ["Total spent", t.spent],
      ["Cash remaining", t.remaining],
      ["Top-up requested", t.topup],
      [],
      ["Category", "Spent"],
    ];
    var bc = byCategoryOf(pc.rows);
    bc.order.forEach(function (k) { summary.push([k, bc.map[k]]); });

    var tx = [["Date", "Item", "Category", "Unit cost", "Quantity", "Line total", "Receipt No."]];
    pc.rows.forEach(function (r) { tx.push([r.date, r.item, catOf(r), num(r.unit), num(r.qty), lineTotal(r), r.receipt]); });

    var wb = XLSX.utils.book_new();
    var wsSum = XLSX.utils.aoa_to_sheet(summary);
    wsSum["!cols"] = [{ wch: 22 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsSum, "Summary");
    var wsTx = XLSX.utils.aoa_to_sheet(tx);
    wsTx["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 16 }, { wch: 12 }, { wch: 9 }, { wch: 13 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsTx, "Transactions");

    var safeMonth = (pc.month || "month").replace(/[^0-9A-Za-z-]/g, "");
    XLSX.writeFile(wb, "PettyCash-" + safeMonth + ".xlsx");
  }

  // CSV of the FULL month's transactions (the record), independent of any on-screen filter.
  function exportCsv() {
    var aoa = [["Date", "Item", "Category", "Unit cost", "Quantity", "Line total", "Receipt No."]];
    pc.rows.forEach(function (r) { aoa.push([r.date, r.item, catOf(r), num(r.unit), num(r.qty), lineTotal(r), r.receipt]); });
    var safeMonth = (pc.month || "month").replace(/[^0-9A-Za-z-]/g, "");
    TableTools.downloadCSV("PettyCash-" + safeMonth + ".csv", aoa);
  }

  // ---- Load a prior month back in -----------------------------------------
  function headerKey(h) {
    var s = String(h).toLowerCase().replace(/[^a-z]/g, "");
    if (s.indexOf("date") >= 0) return "date";
    if (s.indexOf("item") >= 0 || s.indexOf("description") >= 0 || s.indexOf("particular") >= 0) return "item";
    if (s.indexOf("categor") >= 0) return "category";
    if (s.indexOf("unit") >= 0 || s.indexOf("rate") >= 0 || s.indexOf("price") >= 0) return "unit";
    if (s.indexOf("quant") >= 0 || s.indexOf("qty") >= 0) return "qty";
    if (s.indexOf("receipt") >= 0 || s.indexOf("ref") >= 0) return "receipt";
    if (s.indexOf("cost") >= 0 || s.indexOf("amount") >= 0 || s.indexOf("spent") >= 0 || s.indexOf("total") >= 0) return "linetotal";
    return null;
  }

  function toDateStr(v) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    var s = String(v == null ? "" : v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + "-" + m[2] + "-" + m[3] : s;
  }

  function importWorkbook(wb) {
    // Prefer a Transactions sheet (what we export); else the first sheet.
    var sheetName = wb.SheetNames.indexOf("Transactions") >= 0 ? "Transactions" : wb.SheetNames[0];
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false, cellDates: true });
    // Find the header row (the one that maps the most known columns).
    var headerRow = -1, mapping = null, best = 0;
    for (var i = 0; i < Math.min(aoa.length, 10); i++) {
      var map = aoa[i].map(headerKey);
      var hits = map.filter(Boolean).length;
      if (hits > best) { best = hits; headerRow = i; mapping = map; }
    }
    if (headerRow < 0 || best < 2) throw new Error("could not find a Date/Item/Cost header row");
    var rows = [];
    for (var r = headerRow + 1; r < aoa.length; r++) {
      var arr = aoa[r];
      if (!arr.some(function (v) { return String(v).trim() !== ""; })) continue;
      var vals = {};
      mapping.forEach(function (f, c) {
        if (!f) return;
        var v = arr[c];
        if (f === "date") vals.date = toDateStr(v);
        else if (f === "unit" || f === "qty" || f === "linetotal") vals[f] = numStr(v);
        else vals[f] = String(v == null ? "" : v).trim();
      });
      var row = blankRow();
      row.date = vals.date || "";
      row.item = vals.item || "";
      row.category = vals.category || "";
      row.receipt = vals.receipt || "";
      if (vals.unit !== undefined && vals.unit !== "") {
        // explicit unit cost (+ quantity if given, else 1)
        row.unit = vals.unit;
        row.qty = (vals.qty !== undefined && vals.qty !== "") ? vals.qty : "1";
      } else if (vals.linetotal !== undefined && vals.linetotal !== "") {
        // older/plain files with a single Cost/Amount column: treat as unit x 1
        row.unit = vals.linetotal;
        row.qty = "1";
      } else {
        row.qty = (vals.qty !== undefined && vals.qty !== "") ? vals.qty : "1";
      }
      var any = row.date || row.item || row.category || row.receipt || num(row.unit) > 0;
      if (any) rows.push(row);
    }

    // Pull the ceiling and month from a Summary sheet if present.
    if (wb.SheetNames.indexOf("Summary") >= 0) {
      var sum = XLSX.utils.sheet_to_json(wb.Sheets["Summary"], { header: 1, defval: "" });
      sum.forEach(function (line) {
        var label = String(line[0] || "").toLowerCase();
        if (label.indexOf("ceiling") >= 0 || label.indexOf("float") >= 0) {
          var c = num(line[1]); if (c > 0) { pc.ceiling = c; $("pcCeiling").value = c; }
        }
        if (label.indexOf("month") >= 0 && line[1]) { pc.month = String(line[1]).trim(); $("pcMonth").value = pc.month; }
      });
    }

    pc.rows = rows;
    renderAll();
  }

  function onLoad(e) {
    var f = e.target.files[0];
    if (!f) return;
    $("pcErr").textContent = "";
    var reader = new FileReader();
    reader.onerror = function () { $("pcErr").textContent = "Could not read that file."; };
    reader.onload = function () {
      try {
        var wb = /\.csv$/i.test(f.name)
          ? XLSX.read(reader.result, { type: "string", cellDates: true })
          : XLSX.read(reader.result, { type: "array", cellDates: true });
        importWorkbook(wb);
      } catch (err) {
        $("pcErr").textContent = "Could not load that file: " + err.message;
      }
    };
    if (/\.csv$/i.test(f.name)) reader.readAsText(f);
    else reader.readAsArrayBuffer(f);
    e.target.value = ""; // allow re-loading the same file
  }

  // ---- Navigation between screens -----------------------------------------
  function showScreen(name) {
    $("screen-dashboard").style.display = name === "dashboard" ? "block" : "none";
    $("screen-pettycash").style.display = name === "pettycash" ? "block" : "none";
    var ob = $("openBtn"); if (ob) ob.style.display = name === "dashboard" ? "" : "none"; // Open spreadsheet is dashboard-only
    document.querySelectorAll("#screenNav .nav-btn").forEach(function (b) {
      b.classList.toggle("on", b.dataset.screen === name);
    });
    if (name === "pettycash") recompute(); // charts size correctly once visible
  }

  // ---- Wiring -------------------------------------------------------------
  function attach() {
    document.querySelectorAll("#screenNav .nav-btn").forEach(function (b) {
      b.addEventListener("click", function () { showScreen(b.dataset.screen); });
    });

    var monthEl = $("pcMonth");
    if (!monthEl.value) { var d = new Date(); monthEl.value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
    pc.month = monthEl.value;
    monthEl.addEventListener("change", function () {
      pc.month = monthEl.value;
      // keep each row's day, move it into the newly chosen month (clamp overflow days)
      var n = daysInMonth(pc.month);
      pc.rows.forEach(function (r) {
        var m = /^\d{4}-\d{2}-(\d{2})/.exec(r.date);
        if (m) { r.date = pc.month + "-" + pad2(Math.min(parseInt(m[1], 10), n)); }
      });
      renderTable(); recompute();
    });

    $("pcCeiling").addEventListener("input", function (e) { pc.ceiling = num(e.target.value); recompute(); });

    $("pcAddRow").addEventListener("click", function () { pc.rows.push(blankRow()); renderTable(); recompute(); });

    // Delegated editing: update state on input, recompute without re-rendering (keeps focus).
    // For unit/qty also refresh that row's line-total cell in place.
    $("pcTable").addEventListener("input", function (e) {
      var el = e.target;
      if (el.dataset.idx === undefined) return;
      var idx = +el.dataset.idx;
      pc.rows[idx][el.dataset.f] = el.value;
      if (el.dataset.f === "unit" || el.dataset.f === "qty") {
        var cell = $("pcTable").querySelector('[data-lt="' + idx + '"]');
        if (cell) cell.textContent = money(lineTotal(pc.rows[idx]));
      }
      recompute();
    });
    $("pcTable").addEventListener("click", function (e) {
      // quantity steppers: +/- adjust by 1 (never below 0); typing still works for big numbers
      var step = e.target.closest("[data-step]");
      if (step) {
        var si = +step.dataset.idx;
        var next = Math.max(0, num(pc.rows[si].qty) + parseInt(step.dataset.step, 10));
        pc.rows[si].qty = String(next);
        var inp = $("pcTable").querySelector('input[data-f="qty"][data-idx="' + si + '"]');
        if (inp) inp.value = next;
        var cell = $("pcTable").querySelector('[data-lt="' + si + '"]');
        if (cell) cell.textContent = money(lineTotal(pc.rows[si]));
        recompute();
        return;
      }
      var del = e.target.closest("[data-del]");
      if (!del) return;
      pc.rows.splice(+del.dataset.del, 1);
      renderTable(); recompute();
    });

    $("pcExport").addEventListener("click", exportXlsx);
    $("pcExportCsv").addEventListener("click", exportCsv);
    $("pcPrint").addEventListener("click", function () { window.print(); });
    $("pcLoad").addEventListener("change", onLoad);

    // start with two blank rows so the screen isn't empty
    pc.rows = [blankRow(), blankRow()];
    renderAll();
  }

  // expose hooks for automated verification
  window.__pcSet = function (ceiling, rows) { pc.ceiling = ceiling; pc.rows = rows.slice(); $("pcCeiling").value = ceiling; renderAll(); return totals(); };
  window.__pcTotals = totals;
  window.__pcByCategory = byCategory;
  window.__pcImport = importWorkbook;

  document.addEventListener("DOMContentLoaded", attach);
})();
