/* Shared table controls: sort, search, and per-column (Excel AutoFilter-style) value filters.
 * The host owns the table body; this manages the header row, wires a search box, and returns
 * the ordered + filtered list of row indices to display. Row identity is the original index,
 * so a host with editable rows can sort/filter the VIEW without disturbing the underlying data.
 * Offline, no dependencies. */
(function () {
  "use strict";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function isBlank(v) { return v === null || v === undefined || v === ""; }
  function toNum(v) { if (typeof v === "number") return v; var n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : null; }
  function toTime(v) { if (v instanceof Date) return v.getTime(); var t = Date.parse(v); return isNaN(t) ? null : t; }
  function display(v) { if (v instanceof Date) return v.toISOString().slice(0, 10); return isBlank(v) ? "" : String(v); }

  // Ascending comparator; blanks sort last regardless of direction handling by caller.
  function compare(a, b, type) {
    var ba = isBlank(a), bb = isBlank(b);
    if (ba && bb) return 0;
    if (ba) return 1;
    if (bb) return -1;
    if (type === "number") { var na = toNum(a), nb = toNum(b); if (na === null && nb === null) return 0; if (na === null) return 1; if (nb === null) return -1; return na - nb; }
    if (type === "date") { var ta = toTime(a), tb = toTime(b); if (ta === null && tb === null) return 0; if (ta === null) return 1; if (tb === null) return -1; return ta - tb; }
    return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
  }

  // One shared open filter panel at a time; one document listener closes it on outside click.
  var openPanel = null;
  document.addEventListener("click", function (e) {
    if (openPanel && !openPanel.contains(e.target) && !(e.target.closest && e.target.closest("[data-filter]"))) {
      openPanel.remove(); openPanel = null;
    }
  });

  function attach(opts) {
    // opts: { columns:[{key,label,type}], getValue(i,key), rowCount(), theadEl, searchEl?, extraHead?, renderBody() }
    var cols = opts.columns ? opts.columns.slice() : [];
    var st = { sortKey: null, dir: 0, search: "", filters: {} }; // filters[key] = Set(display strings) or undefined

    function colByKey(k) { for (var i = 0; i < cols.length; i++) if (cols[i].key === k) return cols[i]; return null; }
    function val(i, k) { return opts.getValue(i, k); }

    function passesSearch(i) {
      if (!st.search) return true;
      var q = st.search.toLowerCase();
      for (var c = 0; c < cols.length; c++) { if (display(val(i, cols[c].key)).toLowerCase().indexOf(q) >= 0) return true; }
      return false;
    }
    function passesFilters(i) {
      for (var k in st.filters) { var s = st.filters[k]; if (!s) continue; if (!s.has(display(val(i, k)))) return false; }
      return true;
    }
    function order() {
      var n = opts.rowCount(), idx = [];
      for (var i = 0; i < n; i++) if (passesFilters(i) && passesSearch(i)) idx.push(i);
      if (st.sortKey != null && st.dir !== 0) {
        var col = colByKey(st.sortKey), type = col ? col.type : "text";
        idx.sort(function (a, b) { return compare(val(a, st.sortKey), val(b, st.sortKey), type) * st.dir; });
      }
      return idx;
    }

    function buildHead() {
      return cols.map(function (col) {
        var arrow = st.sortKey === col.key ? (st.dir > 0 ? ' <span class="tt-ar">&#9650;</span>' : (st.dir < 0 ? ' <span class="tt-ar">&#9660;</span>' : "")) : "";
        var on = st.filters[col.key] ? " on" : "";
        return '<th class="tt-th"><span class="tt-sort" data-sort="' + esc(col.key) + '">' + esc(col.label) + arrow + "</span>" +
          '<button type="button" class="tt-filter' + on + '" data-filter="' + esc(col.key) + '" title="Filter">&#9662;</button></th>';
      }).join("") + (opts.extraHead || "");
    }
    function renderHead() { opts.theadEl.innerHTML = "<tr>" + buildHead() + "</tr>"; }
    function refresh() { renderHead(); opts.renderBody(); }

    function cycleSort(k) {
      if (st.sortKey !== k) { st.sortKey = k; st.dir = 1; }
      else if (st.dir === 1) st.dir = -1;
      else if (st.dir === -1) { st.dir = 0; st.sortKey = null; }
      else st.dir = 1;
      refresh();
    }

    function openFilter(key, anchor) {
      if (openPanel) { openPanel.remove(); openPanel = null; }
      var col = colByKey(key), seen = {}, values = [], n = opts.rowCount();
      for (var i = 0; i < n; i++) { var d = display(val(i, key)); if (!(d in seen)) { seen[d] = 1; values.push(d); } }
      values.sort(function (a, b) { return compare(a, b, col ? col.type : "text"); });
      var cur = st.filters[key];
      var p = document.createElement("div");
      p.className = "tt-panel";
      p.innerHTML =
        '<div class="tt-actions"><button type="button" data-all>All</button><button type="button" data-none>None</button></div>' +
        '<div class="tt-list">' + values.map(function (v) {
          var ck = !cur || cur.has(v);
          return '<label><input type="checkbox" value="' + esc(v) + '"' + (ck ? " checked" : "") + ">" + (v === "" ? "<i>(blank)</i>" : esc(v)) + "</label>";
        }).join("") + "</div>" +
        '<div class="tt-apply"><button type="button" data-apply>Apply</button></div>';
      document.body.appendChild(p);
      var r = anchor.getBoundingClientRect();
      p.style.left = Math.max(6, Math.min(r.left, (window.innerWidth || 800) - 232)) + "px";
      p.style.top = (r.bottom + (window.scrollY || 0) + 3) + "px";
      openPanel = p;
      p.addEventListener("click", function (e) {
        var t = e.target;
        if (t.hasAttribute && t.hasAttribute("data-all")) { p.querySelectorAll("input").forEach(function (x) { x.checked = true; }); }
        else if (t.hasAttribute && t.hasAttribute("data-none")) { p.querySelectorAll("input").forEach(function (x) { x.checked = false; }); }
        else if (t.hasAttribute && t.hasAttribute("data-apply")) {
          var all = true, set = new Set();
          p.querySelectorAll("input").forEach(function (x) { if (x.checked) set.add(x.value); else all = false; });
          if (all) delete st.filters[key]; else st.filters[key] = set;
          if (openPanel) { openPanel.remove(); openPanel = null; }
          refresh();
        }
      });
    }

    opts.theadEl.addEventListener("click", function (e) {
      var s = e.target.closest("[data-sort]"); if (s) { cycleSort(s.getAttribute("data-sort")); return; }
      var f = e.target.closest("[data-filter]"); if (f) { e.stopPropagation(); openFilter(f.getAttribute("data-filter"), f); return; }
    });
    if (opts.searchEl) { opts.searchEl.addEventListener("input", function (e) { st.search = e.target.value; opts.renderBody(); }); }

    // Reconfigure for a new column set (e.g., the Dashboard loads a different sheet); clears state.
    function reset(newCols) {
      cols = newCols ? newCols.slice() : [];
      st.sortKey = null; st.dir = 0; st.search = ""; st.filters = {};
      if (opts.searchEl) opts.searchEl.value = "";
      refresh();
    }

    return { order: order, refresh: refresh, reset: reset, renderHead: renderHead, state: st };
  }

  window.TableTools = { attach: attach };
})();
