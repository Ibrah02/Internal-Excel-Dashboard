"""Generate PeerColab CLI input JSON for the Internal_Excel_tool intention spec.
Writes one JSON file per operation input + a batch manifest, all under out_dir.
Problem-space only: no solution, no app/file/chart naming. Em-dashes avoided.
"""
import json, os

LIB = "0fde6689-a5f9-4d7c-a4b0-9f7fe73295ff"
OUT = "/tmp/iet_intent"
os.makedirs(OUT, exist_ok=True)

pkg_desc = """# Internal monitoring tool - intention

## The problem
A person tracking research and monitoring indicators over time needs to turn the data they already hold into an at-a-glance read: current levels, movement over time, and breakdowns by category. Today that read depends on paid, subscription software licensed per seat.

## Why it matters
The capability is routine and ongoing, but it is locked behind a recurring licence fee and, often, a cloud dependency. Leaving it unsolved means paying annually and indefinitely for everyday internal reporting, keeping internal data inside a vendor's product, and depending on that vendor's licensing and roadmap for basic work. The opportunity is the same read without recurring cost, without data leaving the machine, and under the person's own control.

## The actor
For now there is a single actor: the monitoring analyst, who both prepares the data and reads the result. There is no separate viewer or approver yet. Held loosely: if others join later, "preparer" and "reader" may become roles of this one actor.

## How value flows
This is internal, so value is operational rather than sales. Four drivers, all named as load-bearing: cost avoided (no per-seat subscription), control kept (data stays local and offline), decisions reached faster (less manual effort to see the state), and ownership (no vendor lock-in). These are recorded as conditions under the "Operating constraints" branch.

## Data in play
Research and monitoring indicators tracked over time, similar in shape to the East Africa monitoring work: values per period, usually broken down by one or more categories such as region or type. The data is already held by the actor; no new collection is assumed.

## Overall success criteria
- The whole workflow incurs zero recurring licence cost.
- It runs with no internet connection and no data leaves the machine.
- The actor can go from data already held to a usable read of current state, trend, and breakdown, faster than the current manual process.
- Every figure shown reconciles exactly with the source data.

The top-level layers break the actor's problem into sub-problems, record the operating constraints, and trace the single behavioural flow to a decision."""

actor_desc = """# The monitoring analyst

The single actor for this intention. One person who both prepares the indicator data and reads the result to form a judgement. This layer groups that actor's distinct sub-problems; each leaf below carries its own measurable success criterion.

## Why one actor
Today only one person does this work, wearing both hats. Preparer and reader are not yet separate people, so they are treated as one actor. If the work later spreads to others, this may split into "preparer" and "reader" roles; that would be its own change, planned here first.

## The sub-problems
The actor's overall need, seeing the state of tracked indicators well enough to act, breaks into five concrete sub-problems: working from data already held, reading current state, reading movement over time, breaking down and comparing, and trusting the numbers."""

leaves = [
    ("Work directly from data already held",
     """# Work directly from data already held

## The problem
The actor already holds indicator data. Any step that requires re-keying, reformatting, or converting it before it can be read is friction that makes the read late or skipped.

## Why it matters
The value of a quick read collapses if preparing the data costs more than the insight it yields. The read has to begin from what is already on hand.

## Success criterion
The actor can begin from data already held and reach a read without manually re-entering or restructuring it first."""),
    ("See current state at a glance",
     """# See current state at a glance

## The problem
To act, the actor first needs the current level of the key indicators: where things stand right now, without recomputing totals or figures by hand on every look.

## Why it matters
Manual recomputation is slow and error-prone, and it makes the read something the actor avoids doing often. The current state should be immediate.

## Success criterion
The key indicators' current values are visible without the actor manually recomputing them on each look."""),
    ("See movement over time",
     """# See movement over time

## The problem
Monitoring is temporal. A single snapshot is not enough; the actor needs to see the direction an indicator is moving over the tracked period: rising, falling, or steady.

## Why it matters
Direction is what turns a number into a signal to act on. Without it, the actor cannot tell an improving situation from a worsening one.

## Success criterion
For any tracked indicator, the actor can tell its direction of movement across the period the data covers."""),
    ("Break down and compare",
     """# Break down and compare

## The problem
An overall figure hides where movement comes from. The actor needs to break an indicator down by the categories present in the data, such as region or type, and compare them.

## Why it matters
Action is usually targeted. Knowing which category is driving a change is what tells the actor where to look or intervene.

## Success criterion
The actor can compare an indicator across the categories present in the data."""),
    ("Trust the numbers",
     """# Trust the numbers

## The problem
A read is only useful if the actor can rely on it. If displayed figures might diverge from the source data, the actor cannot commit a decision to them.

## Why it matters
The whole point is to act on the read. Any doubt about accuracy sends the actor back to manual checking, removing the benefit.

## Success criterion
Every figure shown reconciles exactly with the source data it is drawn from."""),
]

constraints_desc = """# Operating constraints: local, free, owned

## Why this is its own branch
These are not features; they are conditions the whole intention must meet, and all four were named as load-bearing value. They constrain any acceptable outcome, so they are recorded once here rather than repeated inside every sub-problem.

## The constraints and their success criteria
- Free to run: the workflow incurs zero recurring licence or subscription cost.
- Local and offline: it functions with no internet connection.
- Private: the data never leaves the actor's machine.
- Owned: the actor does not depend on a vendor's licensing or roadmap to keep doing this work.

## Why they matter
The problem is not only "see the data"; it is "see the data without the recurring cost, cloud dependency, and vendor lock-in the current paid path imposes". Removing those is a large part of the value, so an outcome that shows the data but fails any of these constraints does not solve the problem."""

flow_desc = """# Behavioural flow: from data to decision

A behavioural flow is what the actor does, in order, independent of any tool or screen. There is one actor, so this is a single within-actor flow. It ends at a decision, the outcome the success criteria describe.

## The flow
1. The actor obtains the indicator data already held.
2. They read the current state: where the key indicators stand now.
3. They read the movement: which way each indicator is trending over the period.
4. They drill into a breakdown: which category is driving what they see.
5. They form the judgement or decision the read was for.

## Why capture it
The per-step outcomes map to the actor's sub-problems (current state, movement, breakdown). Tracing them as one flow shows how those pieces connect into the act of deciding, and gives any later solution a behavioural path to satisfy rather than isolated features."""


def w(name, obj):
    p = os.path.join(OUT, name)
    with open(p, "w") as f:
        json.dump(obj, f)
    return p


w("libtype.json", {"libraryType": "intentionRequirements"})
w("pkgdesc.json", {"id": LIB, "description": pkg_desc})
w("actor.json", {
    "name": "The monitoring analyst",
    "description": actor_desc,
    "usagePackages": [],
    "subLayers": [
        {"name": n, "description": d, "usagePackages": [], "subLayers": []}
        for (n, d) in leaves
    ],
})
w("constraints.json", {"name": "Operating constraints: local, free, owned", "description": constraints_desc, "usagePackages": []})
w("flow.json", {"name": "Behavioural flow: from data to decision", "description": flow_desc, "usagePackages": []})

batch = [
    {"verb": "run", "operationId": "Libraries.Library.UpdateLibraryVersionLibraryType", "inputPath": os.path.join(OUT, "libtype.json")},
    {"verb": "run", "operationId": "Libraries.Library.UpdateLibraryVersionPackageDescription", "inputPath": os.path.join(OUT, "pkgdesc.json")},
    {"verb": "run", "operationId": "Libraries.Library.DomainLayers.CreateDomainLayer", "inputPath": os.path.join(OUT, "actor.json")},
    {"verb": "run", "operationId": "Libraries.Library.DomainLayers.CreateDomainLayer", "inputPath": os.path.join(OUT, "constraints.json")},
    {"verb": "run", "operationId": "Libraries.Library.DomainLayers.CreateDomainLayer", "inputPath": os.path.join(OUT, "flow.json")},
]
w("batch.json", batch)
print("wrote inputs + batch.json to", OUT)
