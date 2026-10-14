# Regional aggregation prototype

## Complete direct NUTS2/NUTS3 geography — 2026-10-13

Geographic regions → NUTS 2 / NUTS 3 now retains every official GISCO source
polygon, not just those containing a grid bus. Bus-free regions are explicitly
`geographyOnly` and `territoryOnly`: their polygons render, but the projection
creates no electrical node, capacity, asset or connection for them. They cannot
hide source members, and expanding a bus-free group does not remove its footprint.
Source buses outside land boundaries remain native. Missing selected-country
geometry is an explicit failure rather than a silently partial coverage result.

The separate Aggregate NUTS regions into clusters mode retains its existing
full-territory, asset-backed seed expansion. Eurostat growth retains its connected
grid-core policy. Direct NUTS grouping preserves official regional identities;
it does not assert electrical connectivity/equivalence for every administrative
unit. Previously saved incomplete schemes remain immutable; rebuild them to obtain
complete coverage.

Qualification against full GISCO 2024 country geometry: Belgium has 11 NUTS2
regions (9 grid-backed, 2 geography-only) and 44 NUTS3 regions (24/20). Netherlands
has 12 NUTS2 (12/0) and 40 NUTS3 (22/18). Spain has 19 NUTS2 (16/3) and 59 NUTS3
(47/12). All six cases have zero missing country area and zero overlaps. Every
mapped source bus is assigned exactly once; native NetCDF hashes remain unchanged.
Evidence: `D:/Artificial Intelligence/AI Architecture/.runtime/work/emil/atlas-complete-nuts/20261013/`.

Live publication uses `main.e7c55330.js`, verified on Atlas ports 3001 and 5176.
The restarted Atlas API returned complete Belgian NUTS2 and NUTS3 jobs with zero
coverage gaps and overlaps (`live-coverage-receipts.json`). 55 focused Python tests,
45 frontend tests and the production build passed. Browser screenshot verification
was blocked by the computer-use helper's sandbox setup failure; no visual-proof
claim is made. Refresh Atlas and rebuild old groupings to use the complete geometry.

## Network-backed Eurostat growth — 2026-10-12

Eurostat regions now require native Grid connections. Evidence ranks candidate
seeds, but every seed reserves a distinct connected source-grid core. A seed
without a bus can expand through empty neighbouring source units to an actual
core. Inseparable whole-NUTS units are closed together along reported source-bus
paths. Candidates already belonging to another core are skipped in evidence-rank
order, with the reason recorded. No city or capital has special handling.

Grid-bearing blocks grow only across existing source branches. All remaining
country territory joins the regions using distance and weighted evidence; unknown
measurements remain unknown. Impossible counts or disconnected pieces that cannot
be combined honestly produce an explicit error instead of empty electrical nodes
or invented branches. Native offshore buses outside land boundaries remain native.
Network checks report induced source components, crossing branch identities, seed
adjustments, and geographic adjacency components for every region. Geographically
separated units can still form an electrically connected zone; those cases warn.
Editing membership invalidates the original connectivity certificate.

The native NetCDF map parser now includes transformers alongside lines and links,
in both PyPSA Network and compatibility-table paths. Cache fingerprints include
this parser change. Belgium has 73 native buses and 92 branches: 78 lines, 2 links
and 12 transformers. Omitting the last group hid real voltage-level connections.
Source assets and their ratings/impedances are not modified. These are topology
checks, not an electrical equivalent, transfer-capacity result or solver run.

Real source-data qualification of density 6/10 and density+GDP 10 preserves all
44 Belgian NUTS3 units, zero country gaps/overlap, 69 grouped land buses and four
native offshore buses. Every generated region has one induced source-grid
component and actual crossing source branches. Density 10 also has geographically
adjacent source units in all ten regions; density 6 and composite 10 each disclose
one geographically separated zone. The native file SHA256 remains unchanged.
Receipts: `D:/Artificial Intelligence/AI Architecture/.runtime/work/emil/atlas-network-backed-growth/20261012/`.

Previously saved territory-only groupings stay immutable for compatibility and
warn when applied. Rebuild them with this method to obtain network-backed regions.

Open Mixed TSO rings → Aggregate countries into regions → Aggregation method.
Manual Aggregation edits membership directly. AI Aggregation currently provides
a deterministic topology proposal, not an LLM or an electrical equivalent.

Load the desired network extent first. The proposal uses loaded electricity
bus identities and links, excludes unresolved endpoints and other carriers,
and never falls back to invented adjacency. Rings themselves retain the
existing curated interconnection catalogue; automatic region membership uses
the loaded topology instead.

The engine starts from singleton countries, protects focus countries and
optionally their direct neighbours, and repeatedly merges adjacent groups.
The score is the count of shared country interfaces divided by the geometric
mean of group sizes. Alphabetical ties make the result reproducible. Parallel
lines do not increase the score. Maximum countries per region is the only
size control; it is never exceeded. Merging stops when no connected pair fits
that limit. Region count is an output, not a requested target. The preview
lists multi-country regions separately from countries that remain separate,
including protected countries and singletons. This heuristic is not a global
optimum or capacity assessment.

Proposals are previewed as membership lists before replacing staged regions.
Build mixed view applies them through the existing map-only projection.
Original caches are not rewritten; external source edge IDs remain attached
to displayed bundles. Internal links remain in the original caches. Summed
ratings are not transfer capability. AC/DC carrier keys remain separate.

Tests: 25 passing across the grouping engine, region projection, mixed plan,
and controls. Includes forty generated graph cases, input-order invariance,
focus protection, disconnected graphs, ambiguous endpoints, parallel lines,
and multiple external neighbours connected to multiple region members.

Live browser retest: 34 countries with Switzerland at full resolution,
protected neighbours at bidding-zone resolution and six proposed regions.
Regional nodes now bypass detailed-node thinning, use teal aggregate markers
and persistent membership labels. Inherited cluster/bus identities and source
multipart routes are replaced by regional identities/endpoints. The browser
visibly showed all six labels and connecting lines; the Iberian popup opened.
The proposal reported 11 unresolved endpoints and did not force disconnected
merges to meet a requested four groups. Those source-coverage limitations
remain explicit, not a claim of fully validated electrical equivalencing.

Future work: model-version persistence, richer load/generation similarity,
geographic compactness, an LLM constraint interface, and simulation-ready
equivalencing. These are not implemented by this prototype.

## Native PyPSA network groupings — 2026-10-12

Visualise → Regional clustering now also groups the original PyPSA buses,
independently of the country-level prototype above. Select countries, choose a
boundary level, then Build network grouping. The tool loads available native
detail first and reports actual job phases and country completion. Supported
choices are countries, NUTS 1/2/3, administrative levels 1/2/3, custom spatial
clusters, and the currently displayed Eurostat indicator clustering. Custom
spatial and Eurostat clustering permit up to 2,048 clusters, subject to available
distinct observations. Spatial clusters stay within countries; the manual editor
can merge selected groups across countries afterward.

Administrative names differ by country. ADM3 is not universally a city; source
names and boundary years are exposed in Boundary sources. NUTS geometry comes
from GISCO 2024; administrative geometry comes from geoBoundaries gbOpen. Missing
coverage leaves the affected buses native and shows a warning, never assigns them
to a guessed nearby polygon. Boundary downloads and caches remain on D:.

Edit group names, reassign buses, merge groups, and select per-property Sum,
Average or Capacity-weighted average rules before Save manual grouping. Saved
definitions are immutable, project-scoped records in
`atlas-land/.atlas-runtime/clustering/schemes/`; existing browser-only definitions
remain readable for compatibility. Registry metadata is lightweight; full source
membership is fetched only when selected. Registry routes are under
`/api/atlas/network-clusters/schemes` and work through both Atlas and Nohm proxies.

Model → Geography Domain → Manual network grouping loads and applies the saved
membership. Original source records remain unchanged. Capacities and aligned
dispatch arrays sum; selected costs use capacity weighting, prices average, and
missing or incompatible observations remain unknown. These defaults are editable.
Parallel interfaces aggregate separately by component/carrier/unit. Directional
dispatch aligns with the displayed interface before summing. Internal branches
remain in the source data, not drawn as self-loops. Explicit external reference
endpoints retain reported coordinates when the other country is not loaded;
ambiguous endpoints remain unaggregated with warnings. Summed ratings are not an
electrical equivalent or validated transfer capability.

Expand original detail or Expand individual groups restores original buses,
assets and branches. Expansion uses preserved source data, not fabricated
disaggregation of an aggregate. Saved membership is checked against country,
network filename and bus identity before use; incomplete groups remain native.
This is a reversible map/data projection, not a new runnable PyPSA or PLEXOS model.

Verification: 19 focused backend tests and 27 focused frontend tests pass, including
the 2,048-group projection. All 1,078 buses in the existing Spain source were
assigned in real-data tests to 16 occupied NUTS2 regions, 47 occupied provinces,
639 occupied municipalities, and 32 custom spatial clusters. Live browser checks
saved Spain regions demo in the PyPSA_EUr_Integration project, reopened it after a
refresh, applied aggregation, expanded Galicia alone and restored native detail.
Screenshots are in
`D:/Artificial Intelligence/AI Architecture/.runtime/work/emil/atlas-network-clusters/20261012/`.

Limitations: administrative coverage is provider-dependent; the tested Spain
source has no buses below 220 kV. Lower-voltage detail needs a new qualified source,
not splitting or inventing buses. The direct production Atlas and the :5176 API
proxy were verified; the Nohm project wrapper itself could not be verified because
its test tab stalled while opening Emil. AI natural-language control of the new
editor and simulation-ready network reduction were not added in this change.

## Geographic cluster topology — 2026-10-12 follow-up

Regional clustering now defaults to Aggregate NUTS regions into clusters.
Choose source NUTS2/NUTS3 geography and a target count (default 20), then Build
network grouping. Occupied source regions are grouped by spatial proximity across
the selected countries. All native buses in a source region share its assignment;
the requested count applies to the whole scope, not separately to each country.
The count cannot exceed the number of covered, occupied regions. Source polygons
are dissolved into one geographic feature per group. Physical buses are assigned
against full GISCO source polygons. The full-country correction below supersedes
the original occupied-only footprint and independent display simplification.

Building applies the completed membership directly to the map: one geographic
bus per group, loaded asset/input aggregation, and interfaces bundled only from
original crossing assets. The header distinguishes geographic nodes/interfaces
from source bus counts. Internal branches remain source data; no artificial
adjacency, electricity flow or validated transfer capability is calculated.
Numeric bus attributes follow the same explicit aggregation rules as assets;
missing data remains unknown. Expansion restores original records.

The Eurostat indicator workflow now hands its actual assignments to the same
aggregation path. A cluster spanning countries is one group, not split by country.
Full-resolution polygons are used for bus assignment, not the simplified colour
overlay. Indicator groups with no source model buses are reported explicitly and
are not invented as network nodes. Indicator similarity and spatial clustering
can both produce multipart footprints; electrically connected/contiguous
reduction is a distinct constraint to validate before runnable model generation.

Unpersisted groups are marked Preview in Geography Domain and can be expanded.
Save manual grouping persists the membership and dissolved geometry and keeps it
applied. Editing bus membership clears affected geographic footprints rather than
retaining false source-region boundaries; manual merges retain constituent
geometry. All original project/model inputs remain unchanged.

Checks: 25 focused backend tests, 32 focused frontend tests, scoped compilation,
production build and maintained source/bundle contract. The explicit 200-region
fixture becomes 20 buses, conserves 400 MW of generation, preserves 19 actual
cross-group connections and retains 180 internal branches. A real Spain check
groups 47 occupied NUTS3 regions and all 1,078 native buses into 20 groups without
coverage warnings. The live map reports 20 geographic nodes, 45 AC interfaces and
2 DC interfaces. Evidence is under
`D:/Artificial Intelligence/AI Architecture/.runtime/work/emil/atlas-geographic-regions/20261012/`.
Already bundled source interfaces retain their full physical branch IDs and
declared branch counts, not only the intermediate bundle identity.

## Full-country cluster coverage — 2026-10-12 correction

Aggregate NUTS regions into clusters now includes every source administrative
unit of each selected country, not only units containing model buses. Occupied
regions seed the requested number of asset-backed groups. Unoccupied land units
extend those groups through shared-border, same-country shortest paths; detached
islands use the nearest occupied source unit of their own country. These are
territorial assignments, not inferred electrical connections. No assets, inputs
or bus coordinates are invented. Countries without boundary evidence or any
on-land source buses cannot silently disappear from a full-country result.

Exact dissolved source polygons replace independent per-group simplification,
which could create seams. Group regionIds/regionCount include land-only units;
occupiedRegionCount and landOnlyRegionCount distinguish physical coverage from
territory. The count remains bounded by occupied source units so every group has
real model membership. Existing saved definitions are immutable; rebuild and
save a new grouping to obtain the corrected complete footprints.

Belgium qualification: all 44 GISCO 2024 NUTS3 units, including 20 without buses,
form eight groups. Their union exactly matches the GISCO national NUTS0 boundary,
with zero missing land or pairwise area overlap. All 73 source buses are retained:
69 are on-land members and four source-marked offshore substations remain native
at their actual coordinates. The live header therefore shows 12 nodes (eight
regional plus four offshore), 20 AC interfaces and two DC interfaces. Saved live
example: Belgium · 8 full-country regions, manual-1791813352008-j5giwd, project
PyPSA_EUr_Integration. Spain's 59 NUTS3 units (47 occupied, 12 land-only) likewise
retain full country/island coverage and all 1,078 buses in 20 groups.

Verification: 31 focused backend tests and 32 focused frontend tests; exact
country-union/overlap, conserved membership, shared-border seam, empty island,
input-order determinism and missing-country regressions. Backend-only patch;
the supervised Atlas API was reloaded, the unchanged live frontend build contract
was checked, and the actual Build network grouping / Save manual grouping UI
was verified at :3001. Evidence: D:/Artificial Intelligence/AI Architecture/
.runtime/work/emil/atlas-full-country-clusters/20261012/.

## Eurostat-seeded geographic growth — 2026-10-12

Regional clustering now has three separate tabs. Eurostat regions is the default
and creates territorial groups by competitive growth. Geographic regions retains
the spatial/native grouping tools. Regional typology retains the old weighted
K-means similarity analysis as a separate colour-class workflow; it no longer
automatically replaces the network with scattered statistical classes. Switching
methods clears the previous overlay/aggregate without changing native records.

Growth uses the full GISCO NUTS2/3 source units, not only complete indicator rows.
For each selected indicator, available observations are standardised by Z-score
or robust median/IQR. The weighted average of those standardised values ranks
complete seed profiles. The highest K profiles become fixed seeds (stable NUTS-ID
ties); a density-only selection ranks density, not total population. Zero variance
does not reduce K. Missing values are not imputed or treated as zero; the method
requires K complete seed profiles but includes every territory in the result.

Fronts expand across actual shared NUTS borders. A priority queue awards an
unassigned unit to the first arriving front, retaining each seed and its connected
growth path. Incremental cost is geographic distance, divided by median adjacent
distance, times [1 + evidence influence × mean(seed-profile contrast,
adjacent-profile contrast)]. Profile contrast is weighted RMS normalised indicator
difference over reported shared indicators. Thus geography, indicator weights,
scaling and the explicit boundary-evidence influence affect stopping points.
Without shared observations, that step uses geography alone. Detached components
without seeds attach as whole components to the best distance/evidence seed and
are disclosed; no electrical edge is inferred. This is a deterministic territorial
heuristic, not an optimal districting solver or validated electrical equivalent.

One dissolved GeoJSON feature and one geographic identity are produced per seed.
Official enclaves can make a footprint multipart; those parts are not extra
clusters. Regions with no native grid buses remain explicit territory-only groups
with a geographic display node, no invented physical bus/assets, and no fabricated
capacities or links. The editor can retain, merge and save them. Missing boundary
buses remain native; the header reports Regional clusters separately from Native
buses instead of mislabelling their sum as a cluster count. Physical crossing
interfaces and loaded data still follow the existing reversible projection.

Results retain seed IDs/values/scores, all source region IDs, missing-indicator
lists, detached components, source datasets/units/URLs/year, and the boundary
policy. Jobs expose real native-loading / indicator / boundary / region-growth
phases and use the bounded existing result cache; independent indicator reads run
in a bounded pool with atomic, collision-safe disk-cache writes on D:.

Qualification: 47 backend and 37 frontend focused tests pass, including weighted
seed changes, 50 generated frontier-influence cases, stable equal-value profiles,
unknown evidence coverage, islands, source conservation, territory-only registry
validation, editor preservation/merges, and tab separation. Five Python modules
compiled and production builds/contracts checked. Real Belgium density cases
requesting six and ten both cover all 44 NUTS3 units with exact national NUTS0
union, zero missing land/overlap and connected source-region adjacency per group.
The ten-region density case retains 69 regional source buses, four native offshore
buses and two territory-only clusters. Eight 2023 density observations are missing
on the selected NUTS2024 identities, explicitly disclosed rather than invented.
A density+GDP weighted case changes the seeds and preserves ten full-coverage
groups. Cached backend real-data runs completed in approximately 2.4–3.0 seconds.
Native source NC SHA256 is unchanged.

Direct live :3001 checks cover the six-region growth, independent old typology,
ten-region growth and saving. Saved example: Belgium · 10 Eurostat density regions,
manual-1791816390556-5h0zld, PyPSA_EUr_Integration. Live final bundle:
main.8deaa4ec.js. Previous hashed assets and entry-file rollback snapshots retained;
no Nohm UI/dist deployment, model-file edit, solver run, PR or merge.
Evidence/rollback: D:/Artificial Intelligence/AI Architecture/.runtime/work/emil/
atlas-eurostat-growth/20261012/. This change does not add calculated grid flows,
aggregate-border capacity or runnable reduced-model export.
