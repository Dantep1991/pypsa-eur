# Atlas presentation workflow

Scope: presentation mode, visible AI changes and view undo, asset inspection,
baseline comparison, and evidence-based candidate-site screening. No animated
dispatch, new model runs, inferred connection dates, or executable regional
equivalents are introduced.

Implementation sequence:
1. Reusable scene-state bridge: bounded in-memory immutable dataset snapshots,
   no model files changed, restore disabled during pending network/agent work.
2. Map presentation toolbar: saved named scenes, camera restore, exit/reset,
   displayed-record metrics and theme-aware accessible panels.
3. AI transaction feedback: before/after summary and highlight; undo restores
   captured map controls/data, not external model operations.
4. Inspectors for nodes, regions and connections, with member/source metadata
   and explicit unknown values. Existing detailed popups remain available.
5. Baseline comparison overlay with a draggable divider on one shared camera;
   compare displayed topology, not model-run economics or dispatch.
6. Candidate site screening around the map centre: actual electric bus locations,
   proximity to loaded water assets and existing land inspection endpoint.
   Missing capacity, queue, and water availability stay unknown. Land checks
   are indicative point checks, not parcel availability or permitting advice.

Validation: pure-function tests for scope, distance, missing values and summaries;
component tests for scene limits and visible controls; production build and live
browser verification. Source arrays are reused, not deep copied. Scenes last for
the current page session only. No publishing or PR is part of this request.

Delivered controls (map bottom-left): Present, Scenes, Compare, Inspect, Find a
site. AI map updates show a before/after activity card and map-only Undo.
Comparison uses one shared basemap/camera and a blue/gold topology divider;
oversized views are explicitly refused rather than truncated. Original live
network panes are hidden only while the comparison overlay is active.

Site screening is deliberately a first-stage evidence lens, not an optimiser:
it lists up to six nearby loaded electric bus locations and checks local land
cover/protection. Aggregated bus locations are regional representatives, not
parcels. Water proximity uses loaded water records; nearby published grid-access
records are shown separately and are not assumed to be electrically connected.
No available-power, water-capacity, permit or connection-date estimates are made.

Verification: 44 focused tests passed (including scene restoration, automatic
regional grouping, missing-data handling, request cancellation and rendering
budget guards). Live browser tests exercised Belgium NUTS3 → full via EMIL,
map undo, baseline/current rendering, scene restore (including resolution label),
methane → electricity scene restoration, actual land endpoint responses and
node/connection inspection. The release was also exercised inside the Nohm
Studio iframe in its inherited light theme.
