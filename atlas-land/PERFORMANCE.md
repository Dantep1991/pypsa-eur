# Atlas browser performance checks

Production readiness is not established. The target remains an ordinary work
laptop (8 GB RAM, four CPU cores), including the complete Nohm host and voice.

## Initial analysis-code deferral (2026-09-06)

Results and the line-flow chart no longer bring Recharts into the initial map
bundle. They load through local Suspense/error boundaries on first use, with
an explicit retry for failed downloads. The flow component was extracted without
changing its API/rendering logic. Unused OpenLayers CSS was removed; package
dependencies and the shared node_modules installation were not changed.

| Root production artifact (gzip) | Before | After |
| --- | ---: | ---: |
| Initial JavaScript | 361.37 kB | 253.39 kB |
| Initial CSS | 19.92 kB | 18.87 kB |

Initial JS is 107.98 kB smaller (about 30%). Four optional JS chunks are 98.76,
6.00, 5.71 and 4.33 kB gzip; this defers work, it does not eliminate analysis
dependencies. Compiled source-map checks establish no Recharts, ResultsTab or
LineFlowChartPanel modules in the initial bundle. Every deferred chunk is served
as JavaScript under /atlas/ and absent from initial HTML references. This is a
download/module-graph comparison, not measured cold-start latency or heap use on
an ordinary laptop. Full production rendering of result/flow charts and Nohm
deployment asset-retention/cache policy still need acceptance checks.

## Carrier-isolated preparation (2026-09-06)

Country filtering now has one current memo per carrier. A changed hidden source
is filtered for its legend without rescanning unchanged source arrays or
replacing the selected map inputs. Four App regressions failed on identical-but-
new visible line arrays before the change; after it, both node and line array
identities remain unchanged on hidden-source completion. Reselecting that source
still shows its new records. Hook tests verify one filter call rather than five
for a one-source change, equivalent-country normalization, selected-source and
country invalidation, and no overlay filtering in standalone mode. This avoids
redundant preparation; it is not a measured percentage speedup or a heap cap.
Only the current five prepared source views are memoized, not a country history.

The foreground dev-browser spot check below used 1280x720 on a host confirmed as
32 logical processors / 127.9 GiB RAM. It used existing local data; cache warmth
was not controlled, and unit tests/builds ran during part of preparation. These
are not controlled A/B, production-bundle or work-laptop acceptance results.
Spain + France Full/Nodal power initially drew 3,137 links in 17 batches:
68.6 ms active construction, 7.0 ms longest batch, 6.6 ms final draw and 228.6 ms
elapsed including yields. Source totals with methane and water selected were
9,575 assets / 6,282 links; 41 undrawn source links remained explicitly reported.

| Three-carrier action | Rendered links | Batches | Active construction | Longest batch | Final draw | Elapsed incl. yields | Longest cleanup batch |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zoom out 1 | 6,216 | 32 | 156.2 ms | 7.0 ms | 8.8 ms | 515.1 ms | 4.0 ms |
| Zoom in 1 | 5,777 | 31 | 156.1 ms | 7.1 ms | 10.5 ms | 448.1 ms | 4.0 ms |
| Zoom out 2 | 6,216 | 32 | 164.7 ms | 7.0 ms | 8.7 ms | 492.1 ms | 4.0 ms |
| Zoom in 2 | 5,777 | 30 | 147.3 ms | 7.0 ms | 8.8 ms | 426.5 ms | 4.0 ms |
| Zoom out 3 | 6,216 | 32 | 156.7 ms | 7.0 ms | 11.3 ms | 511.1 ms | 4.0 ms |
| Zoom in 3 | 5,777 | 30 | 139.0 ms | 7.0 ms | 8.9 ms | 426.1 ms | 4.0 ms |

Settled DOM at the final zoom-in had three map canvases / fourteen Leaflet panes;
this is not a heap measurement. Expanded diagnostics obscured the lower carrier
legend during setup, so it was collapsed before selection/removal actions. The
six samples above exclude the initial view which still had Logistics selected.

## Opt-in line-render readout

Open Atlas with `?atlas-diagnostics=1` (append `&atlas-diagnostics=1` if the URL
already has a query), then expand **Line-render diagnostics · local** on the map.
For the current local frontend: http://localhost:3000/?atlas-diagnostics=1.
The same flag works under a deployment subpath. It is read at mount; remove it
and reload to disable. Ordinary sessions have no panel or per-feature timing.

The readout keeps the last completed drawing and cleanup samples separately.
These may describe different feature counts; an old or cancelled staging graph
can finish cleanup after a newer graph has been published. It sends no telemetry, writes
no browser storage, and retains no network records or trace history. While a
replacement is pending/failed it explicitly labels the retained sample as the
last completed drawing, not a measurement of the pending update.

Measurements use the browser's monotonic clock and report synchronous wall time,
not CPU cycles:

- Layer setup: creation of the replacement canvas/GeoJSON layer.
- Active construction: sum of construction batches; excludes yielding waits.
- Longest batch and longest single link: reveal pauses hidden by total averages.
  The scheduler aims for 7 ms / 200 features per batch, but cannot preempt a
  single expensive feature or garbage collection. This is not a hard deadline.
- Final canvas draw: drawing the completed hidden line buffer.
- Schedule cleanup: hide and detach the previous canvas and schedule removal
  of its paths. This is not the full cleanup duration.
- Elapsed including yields: from requesting a replacement to publication of
  its completion, including construction yields and any wait for an earlier
  retirement to release the staging slot. Excludes cleanup of the graph just
  replaced, which runs after the new drawing is visible.
- Cleanup: removed layers, batches, active removal time and longest removal
  batch are measured independently. Removal aims for 4 ms / 1,000 children per
  batch, not a hard deadline; a slow child or garbage collection can overrun it.
  Cleanup including yields ends at the last child batch. Final cleanup measures
  the subsequent removal of the empty group separately.

## Bounded line-layer lifetime

One committed graph and one staging **or** retiring graph are retained at most.
After a swap, the old canvas is detached immediately so it cannot redraw or
reproject hidden routes during a later zoom. Child layers are released across
animation frames. A newer request waits for the slot to become free; repeated
requests during that wait are superseded, so only the latest target is built.
This trades some update latency for bounded retained drawings and shorter
blocking work. It does not limit the size of one graph or the data cache.

Filtering out every line, including panning into an empty viewport, uses the
same lifecycle rather than unmounting the owner. Nodes/boundaries commit with
that empty line frame. Actual map/component unmount still cancels queued work
and removes the remainder synchronously; mode changes that unmount the owner
remain a separate profiling target. Failed retirement quarantines its slot
until map remount, rather than allowing abandoned graphs to accumulate.

These are **line-layer measurements**, not whole-map load time, input latency,
memory usage or a production certification. They exclude fetching, JSON decode,
React/geographic preparation, nodes/pies, raster tiles and browser compositing.
Background/hidden tabs can delay animation frames; keep the measured tab visible.
Diagnostic timing calls add a small amount of work, so compare like with like.

## Repeatable scenario

1. Record browser/build version, actual hardware/RAM, OS, viewport size, device
   pixel ratio, foreground/background state and whether the API/data cache is
   cold or warm. Use the production build for acceptance measurements.
2. Load Spain and France at Full / Nodal / 220 kV. Note loaded buses/links and
   wait for drawing to finish. Do not record an old sample during a pending draw.
3. Enable overlay, add methane and water, and wait for all three datasets and
   the line drawing to finish. Record loaded counts separately from in-view
   rendered links and explicitly reported undrawn source records.
4. Zoom out one step and in one step. Repeat at least three times and record
   each completed timing sample. Check for blank maps, persistent loading,
   dropped in-view links and unexpected camera motion.
5. Hide water, then methane: electricity must remain. Change resolution down
   and back up; nodes, lines and boundaries must describe the same resolution.
6. Separately measure cold/warm end-to-end loading, input response, long tasks,
   browser/process memory and longer-session retention with the browser's
   profiling facilities on the target device. Exercise voice, generation,
   demand, land and queue layers too; this narrow readout does not cover them.

The automated `npm run test:browser-budget` gate uses a 1366×768 viewport, 4× CPU
throttling and 10 Mbps / 40 ms networking by default. It records one cold load and
three warm reloads, budgets the coherent median-LCP warm run, and still applies
network, map, overflow and control-containment checks to every sample plus peak
heap across them. `npm run test:browser-network-budget` additionally loads Spain's
Grid, Storage, Supply and Demand fixtures, then performs three cached single-view
domain cycles. The cycle must make no parse requests, finish on the expected
domain and remain within post-GC heap/DOM limits. The browser gate also audits
the initial shell, expanded compact sidebar, every loaded domain and the final
cycled state for unnamed visible controls, duplicate IDs and broken ARIA
references. Viewport, sample count, cycle count and existing timing/memory
budgets can be overridden with the documented `NOHM_ATLAS_*` environment
variables in `scripts/browser-budget.cjs`.

To exercise the compiled `/atlas/` artifact against the running real API rather
than the managed cached fixture, enable the live backend and provide a country.
The budget runner owns a same-origin production preview, so React development
compilation is not misreported as end-user startup cost. The same interaction,
memory, network and accessibility gates apply; exact fixture counts are omitted
because the live catalogue is authoritative:

```powershell
$env:NOHM_ATLAS_PERF_LIVE_BACKEND='1'
$env:NOHM_ATLAS_PERF_COUNTRY='ES'
$env:NOHM_ATLAS_PERF_EXTRA_COUNTRIES='BE'
$env:NOHM_ATLAS_PERF_PREVIEW_PORT='3001'
$env:NOHM_ATLAS_PERF_OVERLAY_CARRIERS='gas,water'
npm run test:browser-budget
```

The exact preview origin (for this example `http://127.0.0.1:3001`) must be in
the backend's `NOHM_ATLAS_ALLOWED_ORIGINS`; the browser runner does not bypass or
rewrite the production origin check. Omit the preview-port variable for fixture
tests, which safely use an ephemeral local origin.

The optional overlay-carrier list accepts `gas`, `water`, `liquids` and
`logistics`. Each selected carrier is added through the real interface after a
Grid-only baseline and must settle without a PyPSA reparse, failed request,
memory/DOM breach or accessibility defect. Override its 30-second per-carrier
gate with `NOHM_ATLAS_OVERLAY_LOAD_BUDGET_MS` only when the deployment contract
deliberately specifies a different limit.

`NOHM_ATLAS_PERF_EXTRA_COUNTRIES` adds comma-separated live/deployed catalogue
countries after the primary country. Every lazy power domain must issue exactly
one parse response per loaded country; the later domain and carrier cycles must
remain cached. Extra countries are intentionally unavailable with the
single-country synthetic fixture.

`NOHM_ATLAS_PERF_URL` remains available for intentionally measuring an already
deployed URL, including its own frontend delivery path.

The same runner can send a natural-language instruction through the visible
EMIL composer and verify the state that the judge certifies. This is an opt-in
live/deployed check because it uses the configured planner and judge providers:

```powershell
$env:NOHM_ATLAS_PERF_LIVE_BACKEND='1'
$env:NOHM_ATLAS_PERF_PREVIEW_PORT='3001'
$env:NOHM_ATLAS_PERF_AGENT_COMMAND='Show me Europe at bidding zone level'
$env:NOHM_ATLAS_PERF_AGENT_EXPECT_COUNTRIES='34'
$env:NOHM_ATLAS_PERF_AGENT_EXPECT_RESOLUTION='Bidding zone'
$env:NOHM_ATLAS_PERF_AGENT_EXPECT_LAYERS='Grid'
$env:NOHM_ATLAS_PERF_AGENT_EXPECT_CARRIERS='electricity,gas,water' # only for an overlay command
npm run test:browser-budget
```

The gate does not accept a planner response alone. It waits for the visible
conversation to publish a verified result, then checks loaded country options,
the accessible resolution value, exact visible domains and, when requested, the
exact overlay carrier set. Request failures, memory/DOM limits, clipping and the
accessibility audit are also checked. Set
`NOHM_ATLAS_AGENT_COMMAND_BUDGET_MS` only when the deployment deliberately uses
a different command SLA.

## Current local observations (2026-09-06)

These are individual foreground live-frontend samples on the existing development
host, at a requested 1280x720 viewport. They are not a controlled A/B experiment,
statistical latency results, production-bundle measurements or work-laptop results.

| Drawing | Links | Batches | Active construction | Longest batch | Final draw | Old drawing removal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Spain NUTS3 | 83 | 1 | 3.2 ms | 3.2 ms | 0.1 ms | Not recorded |
| Spain + France nodal | 3,137 | 17 | 78.0 ms | 7.0 ms | 5.3 ms | Not recorded |
| Three carriers, zoomed out, before discard change | 6,216 | 32 | 170.9 ms | 7.0 ms | 10.8 ms | 48.0 ms |
| Three carriers, zoomed out, after discard change | 6,216 | 32 | 157.5 ms | 7.0 ms | 12.8 ms | 40.4 ms |
| Three carriers, zoomed back in, after discard change | 5,777 | 31 | 153.8 ms | 7.1 ms | 10.2 ms | 38.7 ms |

The three-carrier dataset had 9,575 assets and 6,282 loaded links. The current
source reported 41 undrawn links; off-screen culling explains additional
differences from loaded counts. Settled DOM state stayed at three canvases and
fourteen Leaflet panes. This is a structural observation, not a heap measurement.

The discard change prevents dirty-bound expansion and redraw requests for a
canvas being removed. A real-Leaflet regression confirms 2,000 removed paths
produce zero such expansions instead of 2,000, with no retained paths/queued
frames. The timing samples do not establish a reliable percentage speedup.

The table above records the earlier synchronous implementation. Cooperative
retirement now replaces that single removal pass; its active time and elapsed
time must not be compared directly with one synchronous blocking interval.
Whole-map, forced-unmount and target-hardware acceptance gates remain open.

### Cooperative retirement, fresh page (2026-09-06)

Final-code development frontend, foreground 1042x920 CSS pixels / DPR 1, same
France–Spain nodal dataset. No production-build or target-laptop timing claim.

| Transition | Removed layers | Cleanup batches | Active cleanup | Longest cleanup batch | Cleanup incl. yields |
| --- | ---: | ---: | ---: | ---: | ---: |
| Add power to methane + water | 3,079 | 5 | 19.4 ms | 4.0 ms | 79.4 ms |
| Zoom out | 6,216 | 18 | 68.8 ms | 4.0 ms | 283.4 ms |
| Zoom back in | 6,219 | 16 | 60.9 ms | 4.0 ms | 236.0 ms |
| Hide methane after hiding water | 4,168 | 12 | 51.2 ms | 8.1 ms | 183.7 ms |
| Hide the remaining Grid domain | 3,137 | 9 | 35.6 ms | 4.0 ms | 115.7 ms |

The 8.1 ms batch demonstrates that the 4 ms budget is not a hard maximum. Total
cleanup work was not consistently lower than the earlier synchronous samples;
the improvement being tested is shorter blocking intervals, not a claimed
throughput gain. Scheduling cleanup took 0.6–1.1 ms in these samples; final group
removal was 0.0–0.1 ms. Drawing 6,219 links after zoom-out took 168.7 ms active
construction / 7.0 ms largest batch / 9.8 ms final paint / 542.9 ms elapsed.

The fresh page settled at three canvases/fourteen panes. Hiding Grid committed
zero links and left two non-line canvases; restoring Grid brought back all
3,137 power links and three canvases without additional panes or captured
console errors. Removing water and methane did not remove power. These checks
covered one zoom-out/in pair, not the full repeated/long-session protocol above.
An earlier hot-reloaded page had an extra country canvas and was discarded from
this comparison; development HMR lifetime is not production lifetime evidence.

The final-carrier guard correctly refuses to deselect the last loaded carrier.
Separately hiding every domain is allowed. A subsequent UX pass fixed the
misleading reload instructions: cached-but-hidden domains now offer Show Grid,
and stale guard messages clear when the selection/filter context changes.

## Download failure and scope checks

Controlled App regressions found repeated automatic source initialization after
failure and an unscoped infrastructure domain retry. Automatic attempts are now
bounded per carrier/country scope; explicit reselection, country changes or a new
overlay session can retry. Domain requests always use overlay Geography rather
than a standalone all-Europe filter. All four infrastructure carriers are covered
for initial failures, failed rescope, explicit scoped retry and Supply hydration.
These are request-ownership/scope regressions, not transfer-size benchmarks.
An explicit overlapping-effect audit found four simultaneous infrastructure
JSON bodies despite the initializer's per-invocation two-item batch. The shared
carrier request owner now enforces two owned network requests across all callers,
holding a slot through response-body completion. The real-App regression peaks
at two and all four infrastructure carriers complete, alongside loaded power.

### Shared infrastructure download queue

- FIFO admission, two network slots by default, one latest request per carrier.
  Lightweight status reads bypass this queue but retain carrier cancellation
  ownership and their shorter timeout. Explicit domain requests and rescope
  requests use the same queue as initial downloads.
- The 90-second deadline includes waiting for a slot, headers and body. Queue
  supersession/cancellation/expiry removes work before fetch. Failure releases
  the slot; cancel-all drains the queue, and the client remains reusable for
  Strict Mode replay. The App's four infrastructure keys bound queued ownership.
- This bounds **owned infrastructure requests**, not all browser traffic or
  retained datasets. PyPSA parsing requests have their separate batch mechanism;
  raster tiles, status checks and other services are outside this queue. Mixed
  power/infrastructure arrival and total process memory still need profiling.
- Cancellation releases logical ownership immediately. Native fetch is aborted;
  if a non-cooperative transport ignores that signal, physical work may outlive
  the slot. Late headers are not decoded, and late bodies cannot commit. Already
  running synchronous JSON work cannot be preempted by this queue. No hard
  main-thread latency, whole-browser memory or target-laptop claim follows.

Live completion check, 2026-09-06, development browser at 1280x720: electricity
NUTS3 plus all four infrastructure carriers, then lazy Supply. Cells below are
loaded **assets / links**, not in-view counts or physical-site totals.

| Carrier | Belgium Grid | Belgium + Spain Grid | Belgium + Spain Grid + Supply |
| --- | ---: | ---: | ---: |
| Electricity | 17 / 21 | 63 / 104 | 310 / 104 |
| Methane | 98 / 129 | 338 / 389 | 346 / 389 |
| Water | 401 / 403 | 2,847 / 1,453 | 5,948 / 4,113 |
| Liquids | 0 / 112 | 0 / 476 | 68 / 476 |
| Logistics | 7 / 0 | 74 / 0 | 211 / 0 |

All stages settled ready; removing Supply and secondary carriers left all
63 electricity assets / 104 links. No captured console errors. This live check
does not establish a throughput speedup or target-device performance. The Grid
view still disclosed 37 source links without drawable geometry; the queue did
not omit source records to obtain its concurrency bound.

## Final all-Europe compound-agent gate (2026-09-06)

The compiled `/atlas/` artifact was exercised at 1366×768 with 4× CPU
throttling and 10 Mbps / 40 ms network emulation. The real EMIL composer received
“Show me Europe at bidding zone level with electricity, methane and water
overlay”; the gate waited for both the judge verdict and the final rendered map.

The final run loaded 34 countries / 34 PyPSA parse responses, Grid only, and the
exact electricity/gas/water carrier set in 24.774 seconds. It transferred 4.6
MB and settled at 156 MB retained JavaScript heap, 485 live DOM nodes and 918
retained browser nodes. No request failed or was cancelled, and the viewport,
clipping and accessibility checks passed.

Action heap is measured after an explicit V8 collection so the gate compares
retained steady state rather than nondeterministic temporary JSON/parsing
garbage; the 200 MB loaded-state ceiling is unchanged. The same treatment was
already used by the repeated domain-cycle leak gate. This is constrained-browser
evidence on the development workstation, not a physical 8 GB/four-core laptop
or authenticated Nohm-host result.

## Full-nodal dense overview gate (2026-09-06)

The first all-Europe Full / Nodal / 220 kV electricity + methane + water run
retained 233.6 MB after garbage collection. The source payload was not the main
cost: thousands of individual Leaflet Path instances were. Dense line views now
use one non-interactive canvas while retaining and drawing the complete selected
geometry. Interactive paths return automatically below 4,000 visible links, so
detail inspection remains available without a zoom-level-dependent memory cliff.

The final `main.52c28203.js` run completed the real EMIL command and judge in
23.506 seconds under 4× CPU and 10 Mbps / 40 ms emulation. It retained 136.8 MB
(41.4% below the baseline), 485 live DOM nodes and 919 retained browser nodes,
transferred 5.3 MB, and used three canvases / three SVG paths. All 34 country
parses completed; there were no failed requests or cancelled API requests. The
exact 34-country, Full / Nodal, Grid-only and electricity/gas/water assertions,
plus clipping and accessibility gates, passed.

A visible browser-control run also verified the UI disclosure and transition:
30,904 of 31,041 loaded links were drawn at the European overview, 107 source
links were explicitly reported as undrawable, and overview mode remained active
after zooming to a still-dense 8,967-link viewport. This is emulated-workstation
evidence, not physical target-laptop or long-session certification.

## Presentation-cache interaction gate (2026-09-06)

Opacity, visibility and camera changes now reuse the expensive spatial state:

- land tiles always use `opacity=100`; the slider changes the existing layer's
  CSS/Leaflet opacity and persists the final value through a presentation ref,
  without publishing a top-level React state update;
- dense overview GeoJSON remains stable at zoom 7 and below, so the canvas clips
  without rescanning the complete connection set on every camera event;
- a three-entry camera-raster LRU covers the common two-step zoom return path;
- normalized Web Mercator vertices and stable style groups are cached by route
  coordinate/data identity, so redraws avoid allocating Leaflet point objects
  or regrouping every connection;
- node and geographic-boundary panes remain mounted when hidden, avoiding
  renderer teardown/reconstruction;
- zoom 8 and above retains viewport density selection so interactive line
  inspection returns below the 4,000-link safety threshold.

The live production gate runs a six-cycle opacity/zoom/node/boundary soak after
EMIL loads and judges all 34 countries at Full / Nodal / 220 kV with Grid and
electricity/methane/water. The gate primes lazy presentation caches once before
taking the leak baseline. On `main.f08780ec.js` (226.49 kB gzip), under 4× CPU
and 10 Mbps / 40 ms emulation, the measured soak took 41.714 seconds (previously
42.108), with script time reduced from 21.825 to 20.498 seconds. Retained
JavaScript heap grew by 0.3 MB (137.9 to 138.2 MB), network parsing remained at
zero, and no request failed or was cancelled. The opacity actions used 133 ms on
the first cycle and 88 ms on average thereafter while retaining the same land
layer and opaque tile URLs. Exact map state, clipping and accessibility assertions
passed.

The full frontend suite passed 793 tests across 64 suites. The `/atlas/` preview contract
passed all nine executable subpath/proxy/security checks (two live deployment
candidate checks remain intentionally skipped).

The 2026-09-07 follow-up removes the final App reconciliation at slider release.
Structural land state still uses React, while opacity is composed through a
latest-value ref and written directly to the existing preference record. A live
Belgium NUTS3 check retained the same 32 opaque tile URLs, five canvas layers and
461 rendered links across repeated opacity changes. The focused map/App suites
passed 235 tests and the production build compiled as `main.28f8f3a0.js`
(226.74 kB gzip).

The same production artifact is now compressed on the wire by the bundled
preview server. Compression is negotiated from `Accept-Encoding`, cached by
the asset's size and modification time, and held in a bounded 16 MB cache.
Identity responses, `gzip;q=0`, HEAD requests and API proxying retain their
normal semantics. The preview contract passes 10 executable checks (two live
deployment checks remain intentionally skipped). Under the standard 1366×768,
4× CPU and 10 Mbps / 40 ms browser budget, cold transfer fell from about 0.8 MB
to 0.3 MB, cold completion from 3.582 s to 3.271 s, and cold LCP from 3.216 s to
2.564 s. The warm median completed in 1.733 s with 0.680 s LCP and about 0.1 MB
transfer; no request failed or was cancelled and the layout, clipping and
accessibility gates remained clean.

The final voice/readiness follow-up rebuilt the `/atlas/` artifact as
`main.29504bba.js` (226.83 kB gzip). On the exact compiled artifact, an isolated
Chrome run at 1366×768, 4× CPU and 10 Mbps / 40 ms completed cold/warm startup in
3.199 / 2.649 seconds with LCP at 2.456 / 1.508 seconds. It then submitted the
real compound EMIL command to load all 34 countries at Full / Nodal / 220 kV and
enable electricity, methane and water. Planner, parallel parsing, rendering and
judge completed in 29.886 seconds with 140.6 MB retained heap, 488 live DOM
nodes, 4 canvases, 3 SVG paths, 34 parse responses, zero failed requests and
zero cancelled API requests. The browser gate now records bounded map-agent
request/response diagnostics and aborts immediately on a terminal provider or
origin failure instead of consuming the full 180-second command allowance.

The same final artifact passes the compact loaded-network matrix at 1023×768.
Cold/warm startup completed in 2.993 / 3.356 seconds with LCP at 2.412 / 2.244
seconds. Spain loaded 1,078 buses and 1,273 grid connections in 3.965 seconds;
Storage, Supply and Demand then hydrated lazily in 3.200, 3.843 and 3.775
seconds. Peak heap was 32.2 MB. Ten complete domain cycles (40 switches)
finished in 20.593 seconds with zero network requests and zero retained-heap
growth. The expanded 320 px sidebar, footer action, map, and every enabled
control remained inside the 1023×768 viewport; accessibility checks were clean.

The 2026-09-07 land-overlay compositor follow-up removes the last per-tile work
from opacity changes. The raster selection still uses one immutable, fully
opaque tile URL and the existing browser/server caches, while slider input now
updates opacity on the single named Leaflet pane. It does not remount the tile
layer, walk the visible tile images, rebuild network GeoJSON, or publish a new
top-level Atlas frame. The map's land contract is also memoized across unrelated
workspace renders. The focused map and App suites pass 236 tests, including
explicit layer-identity, zero-frame-publication, and pane-compositor checks.

The exact `main.93aef83b.js` production artifact then passed the live browser
gate at 1366×768 with 4× CPU throttling and 10 Mbps / 40 ms networking. Cold
startup completed in **3.102 s** with **2.336 s LCP**; warm startup completed in
**1.706 s** with **0.608 s LCP**. Spain NUTS3 Grid loaded in **2.748 s**. EMIL
interpreted, applied and judged “show me Spain at NUTS3 level with grid” in
**8.951 s** with the expected one-country, one-layer state. Three subsequent
opacity/zoom/node/boundary cycles retained the same land layer and opaque tile
URLs, issued no parse request, produced no API failure, and grew retained heap
by only **0.3 MB**. Opacity steps consumed **20 ms** initially and **17 ms** on
average thereafter, with zero opacity long tasks.

## Shared boundary-data and HTTP cache (2026-09-07)

- `europe.geojson` is now a page-lifetime, single-flight resource. Map recovery,
  remounts and concurrent consumers share one parsed `FeatureCollection`; a
  failed or invalid response is evicted and can be retried. A stale request from
  an older asset mount cannot overwrite a newer cache entry.
- The production preview gives stable release data a one-day browser freshness
  window plus seven days of `stale-while-revalidate`, while the HTML shell stays
  `no-store`. Weak ETags support zero-byte `304` validation. Content-hashed code
  retains its one-year immutable policy.
- Through the live Nohm origin, the 1,499,884-byte boundary source negotiates to
  a 453,123-byte gzip response. A matching `If-None-Match` request returns
  **304 / 0 bytes**. The rebuilt startup bundle is `main.2c6fef64.js` at
  **228.65 kB gzip**.
- The complete frontend inventory passes **821/821** tests across 68 suites,
  including four resource-cache tests and 62 map-component tests. All **16/16**
  compiled preview/proxy/security checks pass. Browser control loaded Spain
  NUTS3 from the rebuilt bundle with 46 buses, 82 AC lines and one DC link; the
  map and land layer rendered normally.
