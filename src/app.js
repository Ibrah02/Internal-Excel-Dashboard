/* Spreadsheet Dashboard — offline, local, no subscription.
 * Loads .xlsx / .csv, detects column types, and builds an interactive dashboard.
 * Depends on globals: XLSX (SheetJS) and Chart (Chart.js), both vendored at build time. */
(function () {
  "use strict";

  var PALETTE = ["#0f6e56", "#378add", "#ef9f27", "#d85a30", "#7f77dd", "#1d9e75", "#d4537e", "#639922"];

  // Application state
  var state = {
    sheets: {},        // name -> { columns:[], rows:[{}] }
    sheetName: null,
    types: {},         // column -> 'number' | 'date' | 'category'
    dimension: null,
    measures: [],      // selected numeric columns
    agg: "sum",        // sum | avg | count
    chartType: "bar",  // bar | line
  };
  var charts = { main: null, share: null };

  // ---- Parsing -------------------------------------------------------------
  function parseCSV(text) {
    // Minimal CSV parser handling quoted fields and commas within quotes.
    var rows = [], row = [], field = "", inQ = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { field += c; }
      } else if (c === '"') { inQ = true; }
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else { field += c; }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (v) { return v !== ""; }); });
    if (!rows.length) return { columns: [], rows: [] };
    var cols = rows[0].map(function (h) { return String(h).trim(); });
    var data = rows.slice(1).map(function (r) {
      var o = {};
      cols.forEach(function (col, idx) { o[col] = coerce(r[idx]); });
      return o;
    });
    return { columns: cols, rows: data };
  }

  function coerce(v) {
    if (v === undefined || v === null || v === "") return null;
    var s = String(v).trim().replace(/,(?=\d{3}\b)/g, ""); // strip thousands separators
    if (s !== "" && !isNaN(s)) return Number(s);
    return v;
  }

  function parseWorkbook(arrayBuffer) {
    var wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    var sheets = {};
    wb.SheetNames.forEach(function (name) {
      var json = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true });
      var columns = json.length ? Object.keys(json[0]) : [];
      sheets[name] = { columns: columns, rows: json };
    });
    return sheets;
  }

  // ---- Type detection ------------------------------------------------------
  function detectTypes(sheet) {
    var types = {};
    sheet.columns.forEach(function (col) {
      var vals = sheet.rows.map(function (r) { return r[col]; }).filter(function (v) { return v !== null && v !== undefined && v !== ""; });
      if (!vals.length) { types[col] = "category"; return; }
      var nums = vals.filter(function (v) { return typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(v)); });
      var dates = vals.filter(function (v) { return v instanceof Date; });
      if (dates.length / vals.length > 0.7) types[col] = "date";
      else if (nums.length / vals.length > 0.8) types[col] = "number";
      else types[col] = "category";
    });
    return types;
  }

  // ---- Aggregation ---------------------------------------------------------
  function num(v) { return typeof v === "number" ? v : (v !== null && v !== "" && !isNaN(v) ? Number(v) : 0); }

  function groupBy(rows, dim) {
    var groups = {}, order = [];
    rows.forEach(function (r) {
      var key = labelOf(r[dim]);
      if (!(key in groups)) { groups[key] = []; order.push(key); }
      groups[key].push(r);
    });
    return { order: order, groups: groups };
  }

  function labelOf(v) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return v === null || v === undefined || v === "" ? "(blank)" : String(v);
  }

  // Order the group keys so time/period dimensions read chronologically and
  // numeric dimensions read by value; leave true categories in first-seen order.
  function sortedOrder(order, dim) {
    if (state.types[dim] === "date") {
      return order.slice().sort(function (a, b) { return (Date.parse(a) || 0) - (Date.parse(b) || 0); });
    }
    var allNumeric = order.length > 0 && order.every(function (k) { return k !== "(blank)" && k !== "" && !isNaN(k); });
    if (allNumeric) return order.slice().sort(function (a, b) { return Number(a) - Number(b); });
    return order;
  }

  function aggregate(groupRows, measure, agg) {
    if (agg === "count") return groupRows.length;
    var sum = groupRows.reduce(function (a, r) { return a + num(r[measure]); }, 0);
    if (agg === "avg") return groupRows.length ? sum / groupRows.length : 0;
    return sum;
  }

  // ---- Formatting ----------------------------------------------------------
  function fmt(n) {
    if (typeof n !== "number" || !isFinite(n)) return String(n);
    var abs = Math.abs(n);
    if (abs >= 1000) return Math.round(n).toLocaleString();
    return (Math.round(n * 100) / 100).toLocaleString();
  }

  // ---- Rendering -----------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function render() {
    var sheet = state.sheets[state.sheetName];
    if (!sheet || !sheet.rows.length) return;
    $("empty").style.display = "none";
    $("dash").style.display = "block";

    renderKpis(sheet);
    renderMainChart(sheet);
    renderShareChart(sheet);
    renderTable(sheet);
  }

  function renderKpis(sheet) {
    var tiles = [];
    tiles.push(["Rows", fmt(sheet.rows.length)]);
    if (state.dimension) {
      var distinct = new Set(sheet.rows.map(function (r) { return labelOf(r[state.dimension]); }));
      tiles.push([state.dimension + " values", fmt(distinct.size)]);
    }
    state.measures.forEach(function (m) {
      var total = sheet.rows.reduce(function (a, r) { return a + num(r[m]); }, 0);
      tiles.push(["Total " + m, fmt(total)]);
    });
    if (state.measures.length === 1) {
      var m = state.measures[0];
      var avg = sheet.rows.length ? sheet.rows.reduce(function (a, r) { return a + num(r[m]); }, 0) / sheet.rows.length : 0;
      tiles.push(["Avg " + m, fmt(avg)]);
    }
    $("kpis").innerHTML = tiles.map(function (t) {
      return '<div class="tile"><div class="lab">' + esc(t[0]) + '</div><div class="val">' + esc(t[1]) + "</div></div>";
    }).join("");
  }

  function renderMainChart(sheet) {
    if (!state.dimension || !state.measures.length) { destroy("main"); return; }
    var g = groupBy(sheet.rows, state.dimension);
    var order = sortedOrder(g.order, state.dimension);
    var datasets = state.measures.map(function (m, i) {
      return {
        label: (state.agg === "count" ? "count" : m),
        data: order.map(function (k) { return aggregate(g.groups[k], m, state.agg); }),
        backgroundColor: state.chartType === "line" ? "transparent" : PALETTE[i % PALETTE.length],
        borderColor: PALETTE[i % PALETTE.length],
        borderWidth: 2, tension: 0.3, fill: false,
      };
    });
    destroy("main");
    charts.main = new Chart($("mainChart"), {
      type: state.chartType,
      data: { labels: order, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1, position: "bottom" } },
        scales: { y: { ticks: { callback: function (v) { return fmt(v); } } } },
      },
    });
  }

  function renderShareChart(sheet) {
    var m = state.measures[0];
    if (!state.dimension || !m || state.agg === "count") { destroy("share"); $("shareCard").style.display = state.agg === "count" ? "none" : "block"; return; }
    $("shareCard").style.display = "block";
    var g = groupBy(sheet.rows, state.dimension);
    var order = sortedOrder(g.order, state.dimension);
    var vals = order.map(function (k) { return aggregate(g.groups[k], m, "sum"); });
    destroy("share");
    charts.share = new Chart($("shareChart"), {
      type: "doughnut",
      data: { labels: order, datasets: [{ data: vals, backgroundColor: order.map(function (_, i) { return PALETTE[i % PALETTE.length]; }) }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } } },
    });
  }

  function renderTable(sheet) {
    var cols = sheet.columns, rows = sheet.rows.slice(0, 100);
    var head = "<tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (r) {
      return "<tr>" + cols.map(function (c) { return "<td>" + esc(r[c] instanceof Date ? labelOf(r[c]) : (r[c] === null ? "" : r[c])) + "</td>"; }).join("") + "</tr>";
    }).join("");
    $("previewTable").innerHTML = head + body;
    $("tableNote").textContent = sheet.rows.length > 100 ? "showing first 100 of " + fmt(sheet.rows.length) + " rows" : fmt(sheet.rows.length) + " rows";
  }

  function destroy(key) { if (charts[key]) { charts[key].destroy(); charts[key] = null; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  // ---- Control wiring ------------------------------------------------------
  function buildControls() {
    var sheet = state.sheets[state.sheetName];
    state.types = detectTypes(sheet);
    var numeric = sheet.columns.filter(function (c) { return state.types[c] === "number"; });
    var categorical = sheet.columns.filter(function (c) { return state.types[c] !== "number"; });

    // sensible defaults
    state.dimension = categorical[0] || sheet.columns[0];
    state.measures = numeric.slice(0, 1);

    // sheet selector
    var sheetNames = Object.keys(state.sheets);
    $("sheetField").style.display = sheetNames.length > 1 ? "flex" : "none";
    $("sheetSelect").innerHTML = sheetNames.map(function (n) { return "<option" + (n === state.sheetName ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("");

    // dimension selector
    $("dimSelect").innerHTML = sheet.columns.map(function (c) {
      return "<option" + (c === state.dimension ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");

    // measures (checkboxes)
    $("measureBox").innerHTML = numeric.length
      ? numeric.map(function (c) {
          var on = state.measures.indexOf(c) >= 0;
          return '<label class="' + (on ? "on" : "") + '"><input type="checkbox" value="' + esc(c) + '"' + (on ? " checked" : "") + ">" + esc(c) + "</label>";
        }).join("")
      : '<span style="font-size:13px;color:var(--muted)">no numeric columns detected</span>';
  }

  function attachEvents() {
    $("fileInput").addEventListener("change", onFile);
    $("sheetSelect").addEventListener("change", function (e) { state.sheetName = e.target.value; buildControls(); render(); });
    $("dimSelect").addEventListener("change", function (e) { state.dimension = e.target.value; render(); });
    $("aggSelect").addEventListener("change", function (e) { state.agg = e.target.value; render(); });
    $("measureBox").addEventListener("change", function (e) {
      if (e.target.tagName !== "INPUT") return;
      var v = e.target.value;
      if (e.target.checked) { if (state.measures.indexOf(v) < 0) state.measures.push(v); }
      else { state.measures = state.measures.filter(function (m) { return m !== v; }); }
      e.target.closest("label").classList.toggle("on", e.target.checked);
      render();
    });
    document.querySelectorAll("#chartSeg button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll("#chartSeg button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        state.chartType = b.dataset.type;
        render();
      });
    });
  }

  function onFile(e) {
    var f = e.target.files[0];
    if (!f) return;
    $("err").textContent = "";
    var reader = new FileReader();
    reader.onerror = function () { $("err").textContent = "Could not read that file."; };
    reader.onload = function () {
      try {
        if (/\.csv$/i.test(f.name)) {
          var parsed = parseCSV(reader.result);
          state.sheets = { Sheet1: parsed };
        } else {
          state.sheets = parseWorkbook(reader.result);
        }
        var names = Object.keys(state.sheets);
        if (!names.length) { $("err").textContent = "No sheets found in that file."; return; }
        state.sheetName = names[0];
        buildControls();
        render();
      } catch (err) {
        $("err").textContent = "Could not parse that file: " + err.message;
      }
    };
    if (/\.csv$/i.test(f.name)) reader.readAsText(f);
    else reader.readAsArrayBuffer(f);
  }

  // expose hooks for automated verification (exercise the same parse paths as the file picker)
  window.__loadForTest = function (csvText) {
    state.sheets = { Sheet1: parseCSV(csvText) };
    state.sheetName = "Sheet1";
    buildControls();
    render();
  };
  window.__loadWorkbookForTest = function (arrayBuffer) {
    state.sheets = parseWorkbook(arrayBuffer);
    state.sheetName = Object.keys(state.sheets)[0];
    buildControls();
    render();
  };

  document.addEventListener("DOMContentLoaded", attachEvents);
})();
