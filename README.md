# Spreadsheet Dashboard

A local, offline tool that turns a spreadsheet into an at-a-glance dashboard.
Open an `.xlsx` or `.csv`, and it builds KPI tiles, a trend over time, a
category breakdown, and a data table from it. Built to replace paid Excel
dashboarding for local, single-user use: no subscription, no cloud, no
internet required.

## Use it

Open `dist/SpreadsheetDashboard.html` in any browser (double-click it), then
click **Open spreadsheet** and pick your `.xlsx`/`.csv`. Everything runs in the
page on your machine; the file you open never leaves it.

Controls:
- **Group by** — the dimension for the charts (a category, or a date/period).
- **Measure** — one or more numeric columns to chart.
- **Aggregate** — sum, average, or row count.
- **Bar / Line** — chart type (line for trends over time).

Date and numeric dimensions are ordered automatically (chronological / by
value) so trends read correctly; text categories keep their natural order.

## Build

The deliverable is a single self-contained HTML file. `build.py` inlines the
CSS, the app code, and the vendored libraries into it:

```
python3 build.py
# -> dist/SpreadsheetDashboard.html  (fully self-contained, ~1 MB)
```

## Layout

```
src/
  index.html   markup + view structure
  app.css      styles
  app.js       parsing (SheetJS), type detection, aggregation, rendering (Chart.js)
vendor/
  xlsx.full.min.js    SheetJS (reads .xlsx)     — bundled for offline use
  chart.umd.min.js    Chart.js (renders charts) — bundled for offline use
build.py       inlines everything into dist/SpreadsheetDashboard.html
dist/
  SpreadsheetDashboard.html   the single-file app to open
```

No build step is needed to *use* the tool once `dist/SpreadsheetDashboard.html`
exists; rebuild only after editing anything under `src/`.
