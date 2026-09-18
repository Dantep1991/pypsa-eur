# Atlas runtime and Nohm integration

The combined launcher registers electricity, methane, water, liquids,
logistics, grid access, land, regional clustering and voice. Do not use the
legacy `app.py` launcher as the Atlas entry point: it omits the extension
services.

## Run configuration

Run `python scripts/run_atlas_backend_stable.py` from the PyPSA EUr checkout.
It uses Waitress (Windows-compatible WSGI) on **127.0.0.1:5001**, with eight
worker threads. The NetCDF/HDF5 lock remains: parsing those files is serialized
for safety while independent health, tile and UI requests can be served.
Waitress does not provide user authentication or make this workspace API safe
to expose to the Internet.

Install the backend requirements in the intended Python environment first.
Configuration is supplied through environment variables, not source edits:

| Variable | Default / purpose |
| --- | --- |
| `NOHM_ATLAS_ROOT` | Backend directory containing `app.py`; defaults to sibling `Models/2026/nova-energy-analyst`. |
| `NOHM_ATLAS_RUNTIME_DATA` | Writable runtime database mirror; defaults to `.atlas-runtime` in the PyPSA EUr checkout. |
| `NOHM_ATLAS_PORT` | `5001`; accepts 1–65535. |
| `NOHM_ATLAS_THREADS` | `8`; accepts 2–32. Increasing this does not bypass the NetCDF lock. |
| `NOHM_ATLAS_ALLOWED_ORIGINS` | Exact comma-separated browser origins. Defaults to HTTP localhost, 127.0.0.1 and IPv6 localhost on port 3000. Setting it replaces the defaults; wildcards and URL paths are rejected. |
| `NOHM_ATLAS_ALLOWED_HOSTS` | Optional extra exact API hostnames, without ports. Loopback and configured origin hostnames are allowed automatically. |
| `NOHM_PLATFORM_ROOT` | Optional explicit Nohm checkout containing `src/ai/llm_calls/llm_client.py`. The launcher adds it to Python's import path. An integrated host can provide that package directly instead. No keys are copied. |
| `OPENAI_API_KEY` | Legacy server-side speech/other-modality credential, **not** the map planner's text-model connection. Never put it in React build variables. |
| `NOHM_OPENAI_ENV_FILE` | Optional explicit environment file for the legacy OpenAI modalities. Loads only `OPENAI_API_KEY` without replacing a deployed value. It does not configure the shared Nohm text model. |
| `NOHM_ATLAS_LOCAL_LOGS` | The combined launcher defaults to `1`, avoiding legacy Google OAuth startup. |
| `NOHM_ATLAS_MAP_CACHE` | `1`; set to `0`, `false` or `off` to bypass the persistent network-map response cache. |
| `NOHM_ATLAS_MAP_CACHE_DIR` | Defaults to `map-responses` inside the runtime directory. Disposable, bounded cache; never a source-data directory. |
| `NOHM_ATLAS_CLUSTER_CACHE_DIR` | Defaults to `atlas-land/.atlas-runtime/clustering`. Holds atomic Eurostat (24 h) and GISCO (7 day) source caches; safe to rebuild. |

The backend also retains its existing dotenv loading. A deployed process
environment takes precedence. Treat environment files as secrets: keep them
outside frontend assets, build output and version control.

### Shared Nohm text AI

Atlas's map planner, independent judge and PyPSA place resolver use
`src.ai.llm_calls.llm_client.llm_chat`. Nohm owns the provider, centrally governed
model, hosted/local runtime and existing secret lookup. Atlas does not select a
second model or fall back to direct OpenAI/DeepSeek when that client fails.
`ATLAS_AGENT_MODEL`, `ATLAS_AGENT_JUDGE_MODEL` and `OPENAI_MODEL` no longer override
these three operations. The older, separate analyst endpoints are not migrated
by this adapter.

For this local checkout, set the platform path in the shell used by the normal
launcher, then start the existing combined launcher:

```powershell
$env:NOHM_PLATFORM_ROOT='D:\Artificial Intelligence\AI Architecture'
python scripts/run_atlas_backend_stable.py
```

Install the shared Nohm client dependencies in the selected Python environment.
There is no new Atlas key file, user account or login step. This integration does
not validate or bypass host authentication. A conflicting already imported `src`
package is rejected at startup, rather than silently replacing host modules.
No path is inferred by searching the user's drives.

Each text operation makes one request through the shared client, with a transport
timeout (planner 30 s; judge/place resolver 20 s). JSON-mode output is still
validated: malformed, non-object, duplicate-field, non-finite and oversized
responses are rejected. Raw provider errors are not exposed to the browser or
logged by the adapter. Missing connectivity leaves planning unavailable; an
invalid/low-confidence judge response is **unverified**, never a successful
verification. Explicit zero confidence is not promoted to a guessed action.

The live process must be restarted normally to load source changes. Source tests
or a Flask test-client probe do not update the server already listening on 5001.
Speech remains a separate Nohm modality; a successful OpenRouter text call is not
proof of Realtime/STT/TTS readiness.

When Nohm is available, the standalone launcher also calls Nohm's existing
`ensure_provider_env("openai")` before Atlas loads its legacy `.env`. This lets
the shared speech configuration take precedence over an old implicit Atlas
default. Explicit `OPENAI_API_KEY` or `NOHM_OPENAI_ENV_FILE` deployment settings
still take precedence and are never silently replaced. No credential file is
modified. Voice errors are redacted and all voice responses use `no-store`.
The voice status response describes **configuration**, not an authenticated
provider check. Idle browser mounting no longer fetches that unused status
endpoint; a user-started voice handshake supplies the actual connection state.

`GET /api/atlas/ready` returns HTTP 200 only when all nine service route groups
are registered. Its `scope` is `api_routes`; this is deliberately **not** a claim
that datasets are current, a model is solvable, or voice providers are online.
Check each `/api/atlas/{carrier}/status`, `/api/atlas/land/status`,
`/api/atlas/grid-access/status`, `/api/atlas/clusters/status` and
`/api/voice/status` for service availability.

## Regional clustering

`GET /api/atlas/clusters` builds a country-scoped NUTS 2 or NUTS 3 typology
from current Eurostat dissemination data and GISCO NUTS 2024 geometry. It
supports one indicator or a weighted indicator stack, z-score or robust IQR
scaling, and two to eight deterministic K-means clusters. Independent upstream
series are fetched concurrently with a bounded worker pool. Exact results are
held in a small process cache and receive a five-minute private browser cache;
official source responses are cached atomically on disk with stale fallback.
The response includes map geometry, unscaled cluster profiles, assignments and
provenance. NUTS 3 is intentionally limited to indicators published at that
level; labour-rate indicators remain NUTS 2 only.

Set `NOHM_ATLAS_PERF_CLUSTERING=1` together with
`NOHM_ATLAS_PERF_COUNTRY=ES` when running `npm run test:browser-budget` to add
the real Chromium NUTS 2/3, visibility and no-remount opacity checks to the
normal consumer-hardware gate.

## Preload network and component maps for interactive use

After producing country networks or deploying parser changes, start the API
and run this from the PyPSA EUr checkout:

```powershell
python atlas-land/scripts/warm_grid_map_cache.py --report .atlas-runtime/grid-cache-warmup.json
python atlas-land/scripts/warm_grid_map_cache.py --scopes grid,supply,storage,demand --demand-year 2025 --report .atlas-runtime/component-cache-warmup.json
```

This calls the real parser for every catalogued, validated geographic and
full-nodal country network, then checks that a second request is an exact
cache hit. It does not build, solve, simplify or invent data. Use `--countries
FR,ES` or `--levels bidding_zone,nuts3,full` for a subset; omit them for all
34 countries and six available resolutions. After a server restart,
`--require-initial-hit` verifies that none of those entries needs parsing again.
`--base-url` selects a candidate API. `--compare-url` optionally compares each
decoded response byte-for-byte with an independently running baseline API.
The default scope remains Grid. `--scopes` also accepts `supply`, `storage`,
`demand`, `full` and `lines_only`. Use the study/UI's actual demand year and,
when overridden, `--demand-scenario` and `--annual-demand-gwh`; different demand
parameters intentionally have different entries. Omitted parameters use the
API defaults, which need not be the UI defaults.

The cache stores compressed copies of **exact parser JSON responses**, not
mutable PyPSA network objects. Provisional demand remains explicitly labelled
as provisional; a cache hit does not validate a model or make missing data real. Source NetCDF,
boundary file set/content, reference topology, parser code and library-version
changes invalidate entries. Parser invalidation follows the transitive set of
same-module functions used by the map parser, so editing an unrelated API route
does not flush every geographic response. The legacy `granularity_prefix`
request value is deliberately excluded for catalogued geographic/full networks:
those routes resolve fixed files by country and resolution, so the prefix cannot
change their output and must not create duplicate cache entries. A running worker
whose parser dependencies were edited bypasses caching until restarted; it cannot
label old output as a new parser version. Compatibility fallback responses are not persisted. Missing, corrupt
or unwritable cache files fall back to the existing parser. Supply/Storage
also fingerprint the resolved plant inventory. Demand fingerprints bus weights,
the ETM composition catalogue, scenario, year and annual total (including the
environment default). Missing files participate in invalidation. Content hashes
detect changes even when timestamps and file sizes are preserved. Parsed source
caches are content-aware and bounded too. HTTP-200 partial inventory failures
are not persisted, and the frontend keeps the previously committed map on error.

Limits are 1,536 entries, 256 MiB compressed total and 32 MiB decoded per entry.
Eviction only removes digest-named cache files, never source networks. Startup
does not wait for preloading; run the command as a deployment/data-refresh step
before accepting interactive traffic when cold-load latency matters.

`X-Atlas-Map-Cache` reports `hit`, `miss` or `bypass`. JSON map responses larger
than 2 KiB use gzip when accepted and beneficial; browsers decode this normally.
This reduces transfer size without introducing a browser-side Parquet decoder.
HTTP responses remain `no-store`: the reusable cache is server-side and
workspace-local. Arbitrary distills and remote networks remain uncached because
their complete dependency sets are not established here.

The report distinguishes a valid cached empty response from usable data via
its inventory `loaded`/`reason` fields. Demand validation additionally checks
served bus totals, the flat-profile conversion, and shared ETM sector/subsector
templates. Do not treat an empty layer as zero demand.

## Offline demand cache workflow

The existing backend `scripts/build_pypsa_demand_weights.py` now covers all 34
downloaded countries at Bidding, e-Highway, NUTS1/2/3 and Full/Nodal. Run it in
a separate build environment using backend `requirements-demand.txt`; do not
upgrade the live API's PyPSA environment. The builder checks that the PyPSA
version matches the geographic caches (currently 1.2.4).

From the backend directory, using that environment's Python:

```powershell
python scripts/build_pypsa_demand_weights.py --all --dry-run --pypsa-root "D:\Energy models\PyPSA\PyPSA EUr"
python scripts/build_pypsa_demand_weights.py --all --pypsa-root "D:\Energy models\PyPSA\PyPSA EUr"
```

`--countries ES FR BE`, `--levels nuts3 full`, `--annual-demand-gwh 100` and
`--report PATH` allow scoped runs. `--include-numeric` is an explicit legacy
option: those older caches use labelled nearest-centroid allocation and are
not the geographic workflow. Existing numeric weights are untouched by default.

- Full/Nodal uses eligible country AC buses with `substation_lv=true`.
- Geographic aggregation follows the original PyPSA-Eur transformer/converter,
  link and stub simplification maps, then the saved `network_bus_id` mapping.
  Disconnected physical buses in the same geographic zone remain distinct.
  Source hashes, saved memberships/coordinates, target IDs, bus counts and
  weight/energy totals are checked before publication. The `.nc` networks and
  geographic polygons are never rewritten by the demand builder.
- EU27 spatial weights use JRC's 2019 1-km electricity raster, read in polygon
  windows. Its coverage must not be inferred from positive border pixels in
  non-EU countries. Great Britain uses PyPSA-Eur's DESNZ 2019 local-authority
  distribution with its public NUTS3 fallback; other countries use PyPSA-Eur's
  existing 60% GDP / 40% population, area-overlap distribution. These are
  differing spatial proxies, not equally detailed observed bus demand.
- The reference control total remains **100 GWh per country per year**, with
  a flat 8,760-hour profile. It is explicitly provisional. Proprietary NUTS3
  demand and real hourly profiles are not connected by this workflow.
- Sector/subsector shares come only from the existing ETM `DEMAND_OUTPUT`
  catalogue. AL, BA, ME, MK and XK have no composition in that workbook;
  their totals remain available without substituted country shares.
- The builder copies the validated composition catalogue beside each target,
  writes weight files atomically, and backs up replaced derived files under
  `.demand-backups/<old-content-sha256>/`. Its manifest records every input
  and output hash. Dry-run reports do not publish weight/catalogue files.
  A failed country remains a reported failure; partial source coverage is not
  silently renormalized into a successful result.

After publication, warm the Demand response scope with the API preloader above.
Changed weights/catalogues automatically invalidate affected map responses.
No raster or spreadsheet processing is performed in the browser.

### Reproduce the Windows demand-builder verification environment

`requirements-demand-qa-windows-py313.txt` in the backend is the complete
version snapshot tested on Windows x64 / CPython 3.13.4, including transitive
dependencies and pytest. It is separate from the live API, the study solver and
Nohm's shared Python installation. Do not install it into those environments.
The general `requirements-demand.txt` remains the top-level build contract;
use the QA snapshot to reproduce the tested versions on the stated platform.
This is a version snapshot, not a hash-locked supply-chain or cross-platform
qualification. Revalidate deliberately when updating its dependencies.

From the backend directory, create a new dedicated environment (do not reuse
an unrelated existing environment):

```powershell
python -m venv .venv-demand
& .venv-demand/Scripts/python.exe -m pip install -r requirements-demand-qa-windows-py313.txt
& .venv-demand/Scripts/python.exe -m pip check
& .venv-demand/Scripts/python.exe -c "import rasterio, rasterstats, pypsa; print('Demand builder dependencies imported')"
& .venv-demand/Scripts/python.exe -m pytest tests/test_demand_weight_build.py -q -rs
& .venv-demand/Scripts/python.exe scripts/build_pypsa_demand_weights.py --all --dry-run --pypsa-root "D:\Energy models\PyPSA\PyPSA EUr" --report "D:\Energy models\PyPSA\PyPSA EUr\.atlas-runtime\demand-environment-validation.json"
```

The import precheck must succeed, all 25 tests must run without skips, and the
dry-run report must have `complete: true` with no failures. This validates real
source memberships, coverage and demand conservation without publishing new
weights. `--report` still writes the diagnostic report; source networks, rasters,
catalogues and existing weight files remain untouched. Do not treat a passing
test run in the live API environment with skipped raster tests as this gate.

The tested stack emits a NetCDF/Cython `numpy.ndarray size changed` warning
(expected 16 / observed 96) under pytest and affine pending-deprecation warnings.
The same NetCDF warning reproduces in the clean environment, and NumPy's own
initialization normally filters it; it does not by itself establish a broken
shared installation. The exact warning also has an
[upstream NetCDF report](https://github.com/Unidata/netcdf4-python/issues/1354).
These warnings have not been globally suppressed. Numerical/data checks, not
warning suppression, are the evidence for this workflow; future dependency
upgrades still require revalidation.

Source coverage and methods: [JRC EU energy atlas dataset](https://data.jrc.ec.europa.eu/dataset/76a6b550-253c-44a4-9a4c-d22079e7bf62)
and the local PyPSA-Eur `scripts/build_electricity_demand_base.py` functions.

## Nohm host boundary

- Nohm's canonical local operator launcher now starts and verifies Atlas API
  port 5001 and immutable frontend port 3001 together with the Nohm stack. It
  validates the checkout and Atlas Python imports, rebuilds only when source or
  the `/atlas-api` build contract changed, writes Atlas logs into the Nohm launch
  log directory, and checks `/api/atlas/ready`, `/atlas/`, and both Nohm proxy
  paths before reporting ready. Use
  `D:\Artificial Intelligence\AI Architecture\src\user_interfaces\Nohm\run_nohm.bat`;
  override discovery with `NOHM_ATLAS_CHECKOUT` and `NOHM_ATLAS_PYTHON`.
- Nohm's `/products/atlas` product route now points to the same-origin
  `/atlas/` mount. The retired plain-HTTP S3 iframe must not be restored. The
  host component lives in
  `src/user_interfaces/Nohm/src/modules/products/pages/ProductModelling.jsx`;
  its Vite proxy defaults to the Atlas production preview on port 3001 and the
  loopback API on port 5001. Restart Nohm after proxy-config changes.
- The embed readiness contract is two-way and versioned. Atlas sets
  `data-nohm-atlas-ready="1"` for same-origin verification and answers
  `nohm.atlas.ping.v1` with `nohm.atlas.ready.v1`. Nohm validates both the
  iframe window and expected origin, covers the frame until ready, and offers
  retry/open-separately recovery after a bounded slow start. Build Atlas with
  `REACT_APP_API_URL=/atlas-api` for this route.
- Serve `atlas-land/app/build` after `npm run build`, not the React development
  server. The package homepage fixes CRA's production asset mount at `/atlas`;
  `PUBLIC_URL` may still override it for an intentionally different host mount.
  Public country and node data use that base too and remain independent of the API
  prefix. An actual compiled-bundle HTTP smoke test is available below; the
  authenticated Nohm browser integration remains a separate gate.
- The browser API base defaults to the same origin outside local port 3000.
  Configure `window.__NOHM_ATLAS_API_BASE__` before loading the bundle or set
  `REACT_APP_API_URL` at build time when a proxy prefix is needed. A prefix is
  prepended to the complete existing route, including `/api/...` or `/health`.
- Route requests through Nohm's authenticated server-side proxy to the
  loopback API. The proxy must authorize operations and workspace access,
  enforce Nohm's CSRF policy and strip untrusted identity/forwarding headers.
  The Atlas launcher does not trust arbitrary `X-Forwarded-*` headers.
- List the actual Nohm browser origin in `NOHM_ATLAS_ALLOWED_ORIGINS`.
  Unknown origins are rejected before route execution, including simple form
  POSTs; this is defense in depth, not a replacement for authentication.
- Reuse Nohm's authenticated voice routes with
  `REACT_APP_NOHM_VOICE_API_BASE=/api/nohm/voice`. Voice responses, especially
  ephemeral credentials, are marked `no-store` by the standalone adapter.
- The legacy runtime still has process-global workspace/model state. Do not
  share one instance between unrelated users or tenants. Use an isolated
  process/data directory per workspace until Nohm session isolation is wired
  and tested. Long-running model jobs require their own job lifecycle contract.
- TLS, identity, CSRF, rate limits, process supervision, backups, data licenses,
  and user/tenant isolation are host responsibilities and remain integration
  sign-off items. A successful local demo does not establish these guarantees.

Nohm's existing `QualifiedProductionReadinessAssessment` and
`NohmProductionPromotionService` govern retained modelling-engine result
packages and route/comparison qualification. Their contract explicitly says it
is **not a deployment certificate**. Do not use a passed PyPSA/Nohm Flow result
assessment to waive the Atlas web-host controls above; deployment promotion
needs separate evidence owned by the destination environment.

## Isolated production-bundle preview

The dependency-free `app/scripts/preview.cjs` is a **loopback smoke host**, not
Nohm's authenticated server. It serves the compiled app at `/atlas/` and forwards
`/atlas-api/...` to a separately configured candidate. It preserves browser
Origin, streams compressed responses and rejects foreign Host/Origin headers.
Missing data/assets return 404 JSON, never a misleading successful HTML page.

Start a candidate through the normal launcher in a separate shell, with the
shared Nohm client available using the environment contract above:

```powershell
$env:NOHM_ATLAS_PORT='5003'
$env:NOHM_ATLAS_ALLOWED_ORIGINS='http://127.0.0.1:3001'
python scripts/run_atlas_backend_stable.py
```

From `atlas-land/app`, in another shell:

```powershell
$env:PUBLIC_URL='/atlas'
$env:REACT_APP_API_URL='/atlas-api'
$env:BUILD_PATH='build-preview'
npm run build
$env:NOHM_ATLAS_TEST_BUILD='build-preview'
npm run test:preview
npm run preview
```

Open `http://127.0.0.1:3001/atlas/` (use that exact origin). Do not rewrite the
browser Origin to get around a denied API request. Defaults can be overridden
with `NOHM_ATLAS_PREVIEW_PORT`, `NOHM_ATLAS_PREVIEW_MOUNT`,
`NOHM_ATLAS_PREVIEW_API_PREFIX`, `NOHM_ATLAS_PREVIEW_BUILD`, and
`NOHM_ATLAS_PREVIEW_BACKEND` (HTTP loopback only). A local Nohm iframe proxy may
be admitted with `NOHM_ATLAS_PREVIEW_ALLOWED_ORIGINS` as a comma-separated list
of exact HTTP loopback origins; wildcard, remote, credentialed and path-bearing
values are rejected. Match the build variables and
candidate origin when changing mounts/ports. Use a separate shell for the normal
root build so these preview build variables do not carry over unintentionally.

Natural-language map commands now require a valid model plan. The browser no
longer uses keyword fallbacks or overwrites model actions with keyword-derived
guesses. An unavailable/uncertain plan leaves the map unchanged and shows an
explicit message; a stalled interpreter request aborts after 45 seconds. Manual
map controls remain available. Validating map/API route readiness or the presence
of a credential is **not** proof that a provider accepts that credential.

## Verification and recovery

### Agent display controls

`set_map_display` accepts optional boolean `node_markers` and
`geographic_boundaries`; it changes display only. The sidebar remains a separate
`toggle_domain_controls` action. The frontend includes `mapDisplay` in observed
planner/judge state. Deploy both frontend and backend definitions before claiming
these commands are supported end to end; old backends reject the new intent.
From the PyPSA root, `python atlas-land/tests/smoke_map_display_agent.py` is an
opt-in real-provider check requiring the normal `NOHM_PLATFORM_ROOT` configuration.
It checks multilingual plans and a judge mismatch fixture in process, without
starting a listener or controlling a real map. It is not a microphone/UI test.

### Lazy component response capability

The PyPSA catalogue advertises
`capabilities.parse_nc_omit_geojson_overlays: true` when the backend supports the
boolean `include_geojson_overlays` parse-nc option. Its default is `true` for
backward compatibility; non-booleans return 400. The frontend sends `false` only
for staged Supply, Storage and Demand requests after capability negotiation.
Grid requests retain geographic boundaries and remain the owner of that geometry
when layers are merged. Legacy component responses may repeat the boundaries;
the frontend ignores those duplicates rather than remounting the same shapes.

Cache keys distinguish compact and normal responses. Compact keys omit only
boundary-file fingerprints, retaining network/inventory/demand/code invalidation.
Deploying the frontend alone preserves compatibility but does not reduce legacy
server downloads. Activate the updated backend through the normal deployment
procedure, then reload the catalogue to enable compact requests. This is a JSON
payload reduction, not a switch to Parquet or a lossy simplification of the grid.

From the PyPSA root, the opt-in check
`python atlas-land/tests/smoke_compact_overlays.py FR ES BE` compares real NUTS3
responses in process without replacing the running server. It checks exact
non-boundary payload equality, persistent-cache hits, gzip decoding equality and
invalid-option rejection. It does not establish live deployment or cold-hardware
performance.

### Multipart water geometry release

The staged water repair changes WFD river geometry from a single path to a
`MultiLineString` object inside `geometry_json`. It requires the updated
`atlas_water.py` reader and frontend `coordinate_paths` support in the same
release. Old flat database rows remain supported. Do not publish the new database
to an old reader, or flatten the paths: that would invent joins between branches.
The combined all-routes candidate also restores mapped utility-pipe bends from
cached WKT. Single-part utilities retain the flat-route API representation; future
multipart utility inputs use the same multipart contract as rivers.

From the backend directory, create a fresh, non-overwriting candidate with:

```powershell
python scripts/stage_water_multipart.py --output data/water/candidates/<release>/atlas_water.db
```

The script copies the source DB, updates only cached river and mapped utility geometry, checks
integrity and exact preservation of other fields/tables, and writes an audit
sidecar with hashes. It does not activate the candidate or update a runtime mirror.
Verify it from the PyPSA root using:

```powershell
python atlas-land/tests/smoke_water_multipart.py --candidate <absolute-candidate-db-path>
```

The check uses in-process Flask and production JavaScript geometry, without a
listener or changing the running server. The preferred 2026-09-06 candidate is
`data/water/candidates/all-routes-20260906/atlas_water.db` in the backend, combining
the WFD and utility repairs; the earlier multipart-only candidate is retained.
Run `python scripts/audit_water_route_fidelity.py --candidate <candidate>` in the
backend for independent cached-WKT comparison. Candidate hashes and evidence are
recorded in `READINESS.md`. The normal controlled deployment must retain the old
DB as rollback material and publish the candidate alongside the matching API and
frontend. Test full-branch rendering/memory in the browser before sign-off. The
main runtime has not been replaced in this pass because its replacement was
previously denied; no alternate termination or routing workaround was used.

### Service checks

Land and Grid Access bootstrap status metadata once in a visible tab. They poll
every 60 seconds only while their overlay or controls are active, pause and abort
status requests in hidden tabs, and refresh active services on return. Failures
back off from 5 to 60 seconds; a status request is bounded at 10 seconds. Opening
an inactive overlay requests fresh status, so a stale startup failure does not
require a page reload. These rules apply to service metadata only, not model jobs,
voice sessions or explicit user commands. Queue map requests have their separate
30-second timeout and Retry control.

1. Start a candidate on another loopback port using `NOHM_ATLAS_PORT`.
2. Check readiness, every service status, allowed-origin preflight, denied
   origins and representative data requests. Do not print voice credentials.
3. Wait for active map/model work to finish before replacing the old process.
   Identify the exact process owning the Atlas port; never kill all Python or
   Node processes. A health timeout alone does not prove that process died.
4. Start the validated launcher on the application port, recheck readiness and
   perform a browser smoke test. Preserve logs for diagnosis.

The server choice and browser policy follow the official
[Flask Waitress deployment guidance](https://flask.palletsprojects.com/en/stable/deploying/waitress/),
[Flask-CORS API contract](https://flask-cors.readthedocs.io/en/latest/api.html),
and [Flask security guidance](https://flask.palletsprojects.com/en/stable/web-security/).
See `READINESS.md` for current evidence and unfinished production checks.
Use `PRODUCTION_ACCEPTANCE.md` for the destination-host promotion record; every
row remains HOLD until evidence from the immutable deployed release is linked.

Regenerate `DATA_SOURCE_REGISTER.md` and its JSON evidence before packaging a
data release:

```powershell
python atlas-land\scripts\audit_source_governance.py
```

The generator reads the published databases' `source_registry` tables and their
release-manifest hashes. It never grants legal approval: named open terms still
require attribution/compliance review, while vague publisher terms and the two
ENTSOG MVP permissions remain explicit production holds.

## Source refresh trust and recovery

The source backend's water, liquids, logistics and grid-access builders now use
Requests' default certificate/hostname verification. If the deployment network
uses an organisation CA, configure `REQUESTS_CA_BUNDLE` with an approved PEM trust
bundle in the refresh job's environment (`CURL_CA_BUNDLE` is the Requests fallback).
This is certificate trust, not Nohm user login or an AI API key. Do not restore
`verify=False` or suppress certificate warnings to work around a failing source.

Water refreshes build/validate a separate candidate before touching published
files and reject failed-country or empty builds. A persistent `.water-refresh.lock`
file carries an OS-held writer lock; do not delete it to admit another writer.
Normal failed publication restores previous exports. If restoration also fails,
the command reports a retained `.water-build-*` recovery directory; preserve it
and restore the named exports before attempting another refresh. The serving DB
is replaced atomically, but the SQLite/manifest/Parquet set is not a crash-atomic
multi-file generation. Other builders still need the equivalent publication audit.

Cached-source hashes do not establish that historical downloads (made before this
change) used verified transport. No full publisher refresh was performed during
the hardening pass. Before scheduling production refreshes, run the real HTTPS
integration tests with `NOHM_RUN_LOCAL_TLS_TESTS=1` and test the publisher endpoints
on the deployment host. The test certificates require the QA-only `cryptography`
package. This Windows host currently resets even the trusted local TLS self-check;
the opt-in suite is explicitly unverified, not counted as passing. Request-boundary,
cache preservation and water publication/recovery tests have passed separately.
