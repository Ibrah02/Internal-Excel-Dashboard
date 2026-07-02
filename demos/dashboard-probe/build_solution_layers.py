"""Generate PeerColab CLI inputs for the Excel_tool_app UI structural breakdown.
Solution-side domain layers: package desc (root), the Monitoring dashboard context
(+ flow + two views), and a build rollout under Features & TODOs.
Layers link back to the intention; em-dashes avoided in prose.
"""
import json, os

LIB = "4bce6f9f-9ee8-4502-bcf9-b16e006308b8"
FEATURES_TODOS = "a37891c4-a41b-42ea-867c-b3ae6e04d2ba"
OUT = "/tmp/iet_solution"
os.makedirs(OUT, exist_ok=True)

pkg_desc = """# Excel tool app

A local, offline application that turns a spreadsheet of monitoring indicators into an at-a-glance read: current state, movement over time, and breakdowns by category. It runs entirely on the user's machine, needs no internet, and costs nothing to run.

## Why it exists
It serves the monitoring analyst, the single actor in the intention specification (IntentionRequirements library). They track research and monitoring indicators over time and need to see where things stand and which way they are moving, without the recurring cost, cloud dependency, and vendor lock-in of paid spreadsheet software. This app delivers that read from data they already hold.

## What it does
The analyst opens a spreadsheet they already have; the app builds a dashboard from it: headline figures, a trend over time, and a breakdown by category, with the underlying rows available to confirm every figure reconciles with the source.

## How it is built
A single self-contained page (a client-side SPA) with the charting and spreadsheet-reading libraries bundled in, so it opens by double-click and works with no server and no connection. Architecture lives in the sub-layers under "Monitoring dashboard"."""

context_desc = """# Monitoring dashboard

The product capability this app exposes: turning a spreadsheet of indicators into a read the analyst can act on. This is the single bounded context; the app is one page, so everything below is depth within it, not a parallel branch.

## What it groups
- The single UX flow the analyst follows (read the current state and act).
- The dashboard entry view (headline figures, trend, breakdown, and controls).
- The data table drill view (underlying rows, for reconciliation).

## Why one context
One role and one application, shipped as one file, means one bounded context. Splitting it would add structure the product does not have."""

flow_desc = """# Flow: read the current state and act

The single UX flow for the monitoring analyst. There is only one role, so there are no cross-role hand-offs. It realizes the intention's "Behavioural flow: from data to decision" in interface terms and links back to it; it does not restate the problem-space behaviour.

## The steps
1. Bring in data already held: the analyst opens a spreadsheet they already have. Realizes "Work directly from data already held".
2. Read current state: headline figures appear without manual recomputation. Realizes "See current state at a glance".
3. Read movement: a trend over the tracked period shows direction. Realizes "See movement over time".
4. Break down and compare: the analyst groups the figures by a category to see where movement comes from. Realizes "Break down and compare".
5. Verify and decide: the analyst checks the underlying rows so figures reconcile with source, then acts. Realizes "Trust the numbers".

## Where each step happens
Steps 1 to 4 happen on the Dashboard entry view; step 5's verification happens on the Data table drill view. Those view links are the dependency edges impact analysis reads."""

dashboard_desc = """# Dashboard (entry view)

The first surface the analyst sees and where most of the flow happens. Its job is to make the current state, the trend, and a breakdown legible at a glance from whatever spreadsheet the analyst opens.

## States
- No data yet: an empty state that invites the analyst to open a spreadsheet.
- With data: the read is built automatically.

## What it shows
- Headline figures (KPI tiles): the key current values, computed for the analyst.
- Trend over time: how a chosen measure moves across the periods in the data.
- Breakdown by category: a chosen measure compared across a category present in the data.

## Controls
- Open spreadsheet: the entry action that brings data in (xlsx or csv).
- Group by, measure, aggregate, and chart type: let the analyst steer what the read shows, so the app works on any spreadsheet rather than a fixed schema.

## Why one surface
The analyst's flow is a single read-and-adjust loop, so keeping figures, trend, breakdown, and controls together lets them adjust and re-read without navigating away."""

table_desc = """# Data table (drill view)

The underlying rows behind the dashboard, reachable from it. Its job is trust: the analyst can see the source data the figures are computed from and confirm they reconcile.

## Why it exists
A read is only actionable if the analyst trusts it (the "Trust the numbers" acceptance criterion). Showing the raw rows lets them check any headline figure against its source rather than taking it on faith.

## What it shows
The parsed rows and columns from the opened spreadsheet, as loaded, so what the dashboard computed on is visible."""

rollout_desc = """# Build the monitoring dashboard app (rollout)

The initial build of Excel_tool_app: a single self-contained page that reads a spreadsheet and renders the Dashboard and Data table views for the monitoring analyst.

## Scope
- Read .xlsx and .csv from a file the analyst opens locally.
- Detect column types and let the analyst choose group-by, measure, aggregate, and chart type, so it works on any spreadsheet.
- Render KPI tiles (current state), a trend chart (movement over time), a breakdown chart (compare by category), and a data table (reconciliation).
- Ship as one offline HTML file with the charting and spreadsheet-reading libraries bundled; no server, no internet.

## Approach
UX-first, with a throwaway probe already built and validated visually. The probe under apps/spreadsheet-dashboard/ is the starting point; harden it into the real single-file build for this library.

## Done when
- Opening a real .xlsx or .csv produces the dashboard with figures that reconcile with the source (the intention's success criteria).
- Runs offline by double-click, at zero recurring cost, with data never leaving the machine.

Simple rollout shape: ships in essentially one build. Promote to Multi-phase only if status starts churning separately from scope."""


def w(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f)


w("pkgdesc.json", {"id": LIB, "description": pkg_desc})
w("context.json", {
    "name": "Monitoring dashboard",
    "description": context_desc,
    "usagePackages": [],
    "subLayers": [
        {"name": "Flow: read the current state and act", "description": flow_desc, "usagePackages": [], "subLayers": []},
        {"name": "Dashboard (entry view)", "description": dashboard_desc, "usagePackages": [], "subLayers": []},
        {"name": "Data table (drill view)", "description": table_desc, "usagePackages": [], "subLayers": []},
    ],
})
w("rollout.json", {
    "name": "Build the monitoring dashboard app (rollout)",
    "description": rollout_desc,
    "usagePackages": [],
    "parentId": FEATURES_TODOS,
})

batch = [
    {"verb": "run", "operationId": "Libraries.Library.UpdateLibraryVersionPackageDescription", "inputPath": os.path.join(OUT, "pkgdesc.json")},
    {"verb": "run", "operationId": "Libraries.Library.DomainLayers.CreateDomainLayer", "inputPath": os.path.join(OUT, "context.json")},
    {"verb": "run", "operationId": "Libraries.Library.DomainLayers.CreateDomainLayer", "inputPath": os.path.join(OUT, "rollout.json")},
]
w("batch.json", batch)
print("wrote solution-layer inputs + batch.json to", OUT)
