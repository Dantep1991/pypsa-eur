# Nohm Atlas integration readiness

Status: **local Nohm integration candidate ready; external production promotion
pending**. The dated sections below are an append-only engineering record and
include historical blockers that later sections may supersede.

## Current go/no-go snapshot — 2026-09-07

| Requirement | Current authoritative evidence | Decision |
| --- | --- | --- |
| Consumer work-laptop browser | 4× CPU and 10 Mbps / 40 ms gates pass at 1366×768 and 1023×600. Full Spain Grid/Storage/Supply/Demand peaks at 32.2/29.8 MB heap; repeated domain cycles make zero requests, parses or heap growth. The combined 1023×600 all-Europe Full/Nodal electricity + methane + water case passes at 132.9 MB. No clipping, overflow or accessibility findings. | **GO for local/integration use.** Physical target-device acceptance remains external. |
| Map features and UX | Current frontend inventory is 845/845 tests across 70 suites. Browser control verifies country/resolution/layer changes, mixed TSO rings, stable opacity/tile identity, voice-shell render isolation, embedded Nohm loading and compact assistant geometry. | **GO.** |
| Data/API responsiveness | 816/816 Grid/Supply/Storage/Demand responses across 34 countries and six resolutions survive a full restart as initial disk-cache hits; 97.8 ms median, 212.4 ms maximum repeated hit. The catalogue now serves warm in 12–17 ms through Waitress and about 7 ms for an unchanged 304. Backend inventory is 304 passing tests with 44 documented optional/environment skips. | **GO for published local datasets.** |
| Agent and judge | Live compact command produced exactly BE+FR, NUTS3, Grid+Supply and received a passing independent verdict in 9.293 s. Three interaction-soak cycles retained the state with +0.5 MB post-GC heap and no unexpected cancellation. | **GO.** |
| Speech services | Kokoro TTS and OpenAI STT roundtrip passes (639 ms / 2.525 s) with exact Atlas vocabulary. Recovery, interruption and fallback paths are automated. | **GO for service integration; HOLD physical microphone/accent/noise acceptance.** |
| Nohm product integration | Browser-controlled `/products/atlas` iframe clears its loading state; Spain loads through same-origin `/atlas-api` in 224 ms. Direct and proxied health return HTTP 200; launcher check-only passes. | **GO locally; HOLD production host.** |
| Release/proxy contract | The current `/atlas` production build compiles successfully as `main.0e76faa5.js` with a 231.90 kB gzip startup bundle. Its v2 build contract binds the complete frontend source tree, asset manifest and main bundle to SHA-256 identities; the Nohm launcher verifies those assets before reuse. `/atlas-api` forwarding and the compiled artifact pass all 14 applicable preview, proxy, origin, compression, path-normalization and deferred-chunk checks; two destination/live-host checks remain explicitly opt-in. The Nohm origin serves the HTML shell with `no-store` and content-hashed code with a one-year immutable cache. A 2026-09-07 production-dependency audit reported zero known findings across 49 production dependencies. | **GO for the current artifact.** |
| Production host and governance | Authenticated TLS deployment, per-user/tenant isolation, process supervision, physical target hardware, physical microphone matrix, source-data licence approval, refresh/backups and disaster recovery require the destination environment and accountable owners. The generated source register now inventories 28 published source families: 10 have named open terms, 16 need terms review and two ENTSOG sources explicitly need distribution permission. | **NO-GO until externally signed off.** |

**Release decision:** proceed with controlled Nohm integration and stakeholder
demonstration. Do not promote as an unattended public production service until
the final host/governance row is evidenced and signed off.

Destination owners should record those external gates in
[`PRODUCTION_ACCEPTANCE.md`](PRODUCTION_ACCEPTANCE.md); it is fail-closed and
keeps release identity, evidence, owner and date together.

The current engineering source inventory is
[`DATA_SOURCE_REGISTER.md`](DATA_SOURCE_REGISTER.md), backed by the machine-readable
`data-governance/source-register.json`. It is intentionally not a legal approval.

Nohm's current `QualifiedProductionReadinessAssessment` is intentionally scoped
to retained modelling-engine results and declares that it is not a deployment
certificate. It cannot be used to satisfy or bypass the host/governance row.

## Results source-observation preview — 2026-09-06

- The previous preview summed every loaded row sharing a date and labelled
  incompatible values “Mixed units”. Replaced that with unaggregated scatter
  observations: no implicit totals, averaging, interpolation or deduplication.
  Distinct measurements and repeated timestamps are preserved. Unit/time-basis
  selection is explicit, reports displayed versus available observation counts,
  and never causes a network request. Date labels change formatting only.
- Qualified ISO timestamps are plotted in UTC while retaining their original
  timestamp for inspection. Dates with no offset use a separate source-time
  axis; the browser's local timezone does not reinterpret them. Calendar-invalid
  dates, unsupported formats, invalid/non-finite values and malformed units are
  counted rather than silently rolled over, converted to zero or plotted.
  Missing units remain a separate, explicitly unnamed group, not a known unit.
- Added an on-demand source-row table for the displayed group, so coincident
  points and their measurement metadata can be inspected without inventing
  jitter or connecting unrelated observations. Tooltip metadata is React-escaped,
  on a dark surface with light text. The table is not mounted until requested, and the API adapter
  rejects responses exceeding its requested 100-row page before chart rendering.
- The configured backend simulation folder, nova-energy-analyst/plexosFiles/
  EmilFiles/Day, does not exist in the inspected checkout. Do not substitute the
  infrastructure Parquet caches for simulation outputs or claim study-data
  validation. The current-page preview remains explicitly labelled as such.
  Full-study aggregation needs source-specific quantity/duration/series semantics
  and a real dataset; it is not implemented by summing a page or averaging MW.
- Tests cover duplicate preservation, unit/clock separation, numeric validation,
  leap dates/invalid rollover, time offsets and source time, filtering, unit/date
  controls without new fetches, invalid-row messages, and the source table. A
  separate real-Recharts test supplies only jsdom layout dimensions and verifies
  scatter symbols/finite SVG geometry without synthetic line interpolation;
  the tooltip is tested for exact timestamp/value and escaped metadata.
- Final verification: 735 tests / 60 suites passed in 188.2 seconds, including
  44 added regressions. Root and /atlas/ builds and all 9 compiled-preview HTTP
  checks passed. Root main.a603f7f6.js is 252.48 kB gzip; subpath
  main.fbadf5b6.js is 252.50 kB. Deferred Results 74.83facdfc.chunk.js is
  9.24 kB, chart vendor 348.34985070.chunk.js is 98.90 kB, flow panel
  642.72fcca8a.chunk.js is 6.37 kB and CSS main.ae6b3d5a.css is 18.96 kB.
  The existing Node fs.F_OK warning remains. Browser QA tab 51 confirmed the
  unchanged Logistics/All Europe startup view, ready status and visible map
  without console errors. No settings were changed, no microphone captured,
  and the temporary tab was closed. This is a startup smoke check, not live
  Results chart/data acceptance or a constrained-hardware benchmark.

## Results assistant stream lifecycle — 2026-09-06

- Replaced the Results assistant's unbounded, uncancellable stream with explicit
  request ownership. Stop, manual file/filter/page changes and leaving the panel
  abort browser work; late events cannot select files, append answers or finish a
  newer request. First answer/error ends that request exactly once. Input becomes
  available immediately after Stop/failure, including abort-ignoring transports.
- Added a 45-second idle deadline and a five-minute absolute deadline. Valid
  heartbeat/progress events extend only the idle deadline. Parsing handles
  byte-split UTF-8, CR/LF/CRLF and multiline SSE data, caps an event at 1,000,000
  characters and a response at 8,000,000 bytes, and rejects incomplete streams.
  Callback exceptions and server error events propagate instead of being caught
  as JSON parsing failures. HTTP failures do not parse or expose server bodies.
  Reader cancellation/release and timers are cleaned up on terminal paths.
- Results messages now use context-bound functional state updates in App, also
  used for the existing Copilot context. Batched/late updates preserve intervening
  messages without targeting a newly selected context; message IDs are independent
  of a captured array length. Removed obsolete chat state from useResultsState.
- Results UI adds Stop analysis, an accessible question label/conversation log,
  and a viewport-bounded chat height. The heading accurately refers to simulation
  results generally: this backend selects files from the question and does not
  accept the currently displayed file as an explicit request parameter.
- Thirty new regressions cover stream framing and size limits, failed/unfinished
  responses, callback failures, cancellation before/after headers and stalled
  reads, first-answer ownership, timeouts, concurrent messages, Stop/deactivation,
  and manual selection. Actual Results controls are exercised with the real
  parser/hook and injected byte streams; only chart drawing is mocked there.
- Browser QA tab 50 ran “Show ports in Belgium. Keep the logistics workspace and
  grid layer.” The live planner/judge completed, the country became BE, Grid
  remained the only selected domain, and seven maritime assets were reported
  loaded. Screenshot confirmed the Belgium view and assistant response. No
  console errors or microphone capture. This checks the map/text-agent path, not
  live Results analysis: the current map shell still has no Results navigation.
- Final verification: 691 tests / 58 suites passed in 186.2 seconds. Root and
  /atlas/ production builds plus all 9 compiled-preview HTTP checks passed.
  Root main.a8c437b6.js is 252.48 kB gzip; subpath main.45bf2d12.js is 252.49 kB.
  Deferred Results 405.1f8be1ea.chunk.js is 7.74 kB; vendor/flow chunks remain
  98.76/6.37 kB and CSS main.9d378f59.css is 18.89 kB. The new stream code stays
  outside startup. The existing Node fs.F_OK deprecation warning remains.
  QA preferences were restored to Logistics/All Europe, assistant closed and
  voice off, then temporary tab 50 was closed. These are strong-host checks,
  not proof of ordinary-laptop or real-microphone production acceptance.
- Important limitation: the inspected backend starts an independent analysis
  thread and does not provide job cancellation. Stop is explicitly described as
  stopping receipt in the browser; it must not claim the server job was cancelled.
  Server job ownership/cancellation, full-file aggregation and mixed-unit/time
  semantics still need implementation/verification before Results sign-off.

## Results request ownership and legacy cleanup — 2026-09-06

- Results file metadata, filter choices and paginated rows now have independent
  request ownership. File/query changes mask old rows immediately, cancel old
  work and reject late headers/body completions. Each resource has a 30-second
  deadline and an explicit retry that repeats only failed resources. Retention
  is bounded to one snapshot per resource, not a history of files/pages.
- File selection is synchronous and resets page/filters together. Data filters
  reset to page one; date-resolution presentation changes do not request rows.
  File selection remains available during loads; pagination waits for the
  current resources. Malformed file/filter/pagination responses are contained,
  with generic errors rather than raw service bodies or paths. Empty results
  show a single empty page instead of “Page 1 of 0”.
- Removed 427 lines of legacy Results state, calculations, fetch/stream handlers
  and effects from App.js. That disconnected implementation still requested the
  catalogue when the Results component mounted. The child now exclusively owns
  Results data reads. The shared parent chat history remains unchanged.
- Fifteen new tests cover stale file/page responses, stalled headers/body,
  independent retry, inactive/unmounted cleanup, malformed responses and actual
  file/filter/pagination controls. Component tests use the real state and HTTP
  adapter, mocking only chart drawing. The chart explicitly labels itself a
  current-page preview; this is not a complete-file aggregation implementation.
- Browser QA tab 49: Belgium NUTS3 loaded 17 buses, 21 AC lines and 68 supply
  components. Screenshot confirmed boundaries, grid and generation pies, with
  no browser console errors. This is a dev-map regression check, not live
  Results chart acceptance: the current map shell does not expose a Results
  navigation control. No hidden React state or synthetic navigation was used.
  Restored Logistics/All Europe preferences; no microphone or backend changes.
- Final post-cleanup verification: 661 tests / 55 suites passed in 187.8 seconds;
  both production builds and all 9 compiled-preview HTTP checks passed. Root
  main.0970326a.js is 252.56 kB gzip (829 bytes below the pre-cleanup build);
  /atlas/ main.79d47851.js is 252.58 kB. CSS main.8acc9cd2.css remains 18.87 kB;
  deferred Results 182.e065480d.chunk.js is 6.65 kB, chart vendor
  348.8c56cdd2.chunk.js remains 98.76 kB, flow chart
  642.c8e18d1e.chunk.js remains 6.37 kB. Optional chunks are not startup HTML
  entrypoints and are served correctly under /atlas/. These artifact sizes and
  strong-host test times are not target-laptop latency measurements. The existing
  Node fs.F_OK deprecation warning remains; temporary QA tab 49 was closed.
- Follow-up: client chat ownership/error propagation and parent concurrent
  updates are addressed in the section above. Full-file aggregation,
  mixed-unit/time semantics and real integrated dataset/chart validation remain.

## Flow-profile request ownership and recovery — 2026-09-06

- The extracted flow chart still had its original unguarded fetches: changing
  asset/period could publish a late response under newer controls, missing input
  stayed loading, and recommended_view could trigger repeated period changes.
  Added useLineFlowProfile with exact-query/retry ownership, immediate masking
  of stale values, abort on replacement/unmount and a 30-second deadline that
  ends the loading state even if the transport ignores abort. Late headers are
  not decoded and late bodies cannot publish. Retry is explicit and local.
- Missing-series HTTP 404 retains the existing no-data message, matching the
  inspected backend route. Other errors show a redacted retryable failure;
  malformed/non-finite plot data is rejected. Period buttons expose pressed
  state. An allowed recommendation can adjust a sparse profile only once per
  asset visit, and manual period selection prevents automatic override.
- Thirteen new component regressions cover stale headers/body, asset/period
  changes, stalled headers/body plus retry, no input, recommendation loops and
  manual choice, invalid payloads, 404 versus service error, and teardown.
  Recharts drawing is mocked in fault-injection tests; the existing deferred
  import test also loads the real component. This is not a live solved-flow
  chart/browser validation. No browser or backend mutation was needed this pass.
- Full suite: 646 tests / 53 suites passed in 187.4 seconds. Root
  main.d7b7946a.js 253.39 kB gzip; /atlas/ main.ea81950c.js 253.40 kB;
  CSS main.8acc9cd2.css 18.87 kB. Flow chunk 642.c8e18d1e is 6.37 kB;
  chart safeguards remain outside startup. Nine compiled-preview checks pass,
  including chart module separation and subpath delivery.
- Follow-up from source inspection: ResultsTab's separate metadata, filter and
  page fetches still publish without current-file/query ownership; its file
  handler can launch work after older filter requests finish. It also exposes
  raw service error text. Address these alongside actual result/chart rendering
  and the remaining laptop, voice and Nohm-host acceptance gates.

## Deferred analysis tooling and startup payload — 2026-09-06

- Removed static Recharts imports from App by extracting its existing line-flow
  component and loading it and ResultsTab on demand. A reusable local boundary
  shows loading state, contains chunk/render failures, and retries with a fresh
  React.lazy instance without reloading the map. Removed the unreferenced
  OpenLayers stylesheet. Existing analysis APIs and chart content are retained;
  dependencies/shared node_modules were not mutated.
- Root initial JS fell from 361.37 to 253.39 kB gzip (107.98 kB/about 30%).
  Root main.4a083439.js; /atlas/ main.a518b0e1.js 253.41 kB. Initial CSS
  main.8acc9cd2.css is 18.87 kB, down from 19.92. Optional chunks are 98.76,
  6.00, 5.71 and 4.33 kB gzip. These are emitted-artifact sizes, not observed
  work-laptop load-time/memory improvements; see PERFORMANCE.md.
- Tests cover delayed import, state/prop preservation, local failure/redacted
  message, retry, and dynamically importing the real flow panel with its query
  parameters and period controls. Full suite: 633 tests / 52 suites passed in
  185.2 seconds. Nine compiled-preview checks pass; the compiled-artifact check
  now verifies absence of chart modules from the main source map and serves all
  deferred chunks under /atlas/ without eager HTML references.
- Browser tab 48 at 1280x720: Logistics startup, then France NUTS3 Grid + Supply
  loaded and rendered (93 buses, 181 AC lines, 280 supply components); screenshot
  checked. Script elements still contained only the dev bundle, with no optional
  analysis chunks. No captured console errors. This was a dev-map smoke check,
  not a live result/flow-chart rendering or chunk-failure-in-browser test.
- Removed QA France and restored Logistics All Europe; closed tab 48 after ready.
  No user-tab, microphone, backend restart, credentials or staged-data changes.
  Remaining gates include ordinary-hardware profiling, live voice, Nohm host
  isolation/deployment and full chart/data/agent coverage.

## Popup inspection camera recovery — 2026-09-06

- Fixed the close-popup/next-zoom displacement reproduced in the previous pass.
  An installed map observer snapshots the camera before Leaflet's popup auto-pan.
  The popup's Close button or Escape can restore that snapshot once, immediately,
  with no camera animation. Automatic closures do not restore it; a deliberate
  drag, zoom, resize or other movement discards the snapshot. It retains only one
  origin and popup and removes all listeners/timers on unmount.
- Initial tests passed but live native clicking exposed a capture/bubble timing
  defect: a microtask expired the close token before Leaflet's closing listener.
  Temporary scoped event tracing isolated this. Expiration now uses a zero-delay
  task, cleared on completion/unmount; diagnostic logging was removed. Added a
  regression for microtask checkpoints between native event listeners.
- Eleven new cases cover repeated auto-pan, deliberate navigation, automatic
  closure/replacement, Escape/non-closing keys, no-pan/disabled Escape, event-task
  ordering and cleanup. A real installed Leaflet map (synthetic dimensions and
  nonanimated pan) reproduces the old shifted camera and verifies recovery with
  the observer. Final full run: 630 tests / 51 suites, 179.4 seconds. Root
  main.d0efa87c.js 361.37 kB gzip; /atlas/ main.b65918a9.js 361.38 kB;
  CSS main.a07e6b4d.css 19.92 kB. Nine compiled-preview checks pass.
- Live browser tab 47, Belgium NUTS3 Grid + Supply at 1280x720: BE236 moved from
  (470,137) to (470,653) during inspection, then returned exactly to (470,137)
  with Close. Next zoom stayed over Belgium with 14 in-view pies, rather than
  the empty Netherlands view. Escape also restored the original position.
  A deliberate horizontal drag closed the popup and retained y=653 plus the
  new horizontal offset, proving that the recovery did not undo the user's pan.
- Opened EMIL after another popup inspection and sent the real text command
  "Zoom into Brussels. Keep the current network and layers." The live planner
  and judge completed; screenshot confirmed Brussels centred with Belgium NUTS3
  and both Grid/Supply still enabled. Voice remained off, and no console errors
  were captured. Restored Logistics All Europe with assistant closed and removed
  the QA electricity country; closed tab 47 after ready. No user-tab, microphone,
  backend restart, credentials or staged-data activation action was performed.
- Remaining acceptance still includes actual laptop/frame-time/long-session
  measurements, representative voice and the Nohm host. No claim that all popup
  placement or camera edge cases are finished. Clicking outside the popup or
  automatic dismissal intentionally retains the current view; this recovery is
  limited to explicit Close/Escape inspection dismissal.

## Dark basemap transition cleanup and popup-camera finding — 2026-09-06

- Browser tab 46 confirmed Leaflet's default rgb(221,221,221) backing beneath
  the dark basemap. Zooming also visibly superimposed oversized old labels and
  new labels. Installed Leaflet GridLayer source shows a 200 ms tile cross-fade
  and delayed old-tile pruning. Disabled tile fading (not camera motion), set
  the map backing to #202124, and made base/reference tiles wait for the final
  zoom level. Existing two-tile buffer, idle updates and non-retina policy remain.
- Added a map-component configuration regression; it failed before the change.
  Sixty-three camera/canvas/telemetry tests pass. Full verification: 619 tests /
  50 suites, 176.0 seconds; root main.bb9c2c01.js 360.96 kB gzip, /atlas/
  main.36c7aa48.js 360.97 kB; unchanged CSS main.6871e992.css 19.89 kB.
  Nine compiled-preview checks pass.
- Reloaded the isolated browser to apply immutable MapContainer options. The
  computed backing became rgb(32,33,36), and leaflet-fade-anim was absent.
  Repeated Belgium NUTS3 Grid + Supply zoom: screenshot no longer had doubled
  labels. Immediate DOM observations counted 96 tiles before versus 48 after;
  these are point observations, not a controlled memory/latency benchmark.
  Camera animation can still briefly scale the vector canvas before repainting.
- Important unresolved UX finding: click the largest Belgian generation pie
  (BE236), close the tall popup, then zoom in. The popup's automatic pan leaves
  the map centred farther north; the settled view was over the Netherlands with
  zero in-view pies. Fit loaded network restored all 17 pies. This is camera
  displacement, not missing supply data. Installed Popup._adjustPan fires
  autopanstart before panBy; usePopupViewportBounds currently freezes culling
  while open but deliberately does not restore the pre-popup camera. Follow up
  with an intentional close/navigation policy that does not fight user drags,
  agent commands, replacement popups or data updates. Dark backing does not fix
  this behaviour, and this turn does not establish smooth-camera acceptance.
- No captured browser console errors. Removed the QA country, restored Logistics
  All Europe and closed tab 46 after ready. User tab, microphone, backend process,
  credentials and staged datasets were untouched. Hardware/live-voice/Nohm-host
  acceptance remains open.

## Generation composition reuse and deferred tooltips — 2026-09-06

- Navigation previously rebuilt carrier aggregates, segment arrays and formatted
  tooltip HTML for every selected generation site. A real map-component regression
  failed before the change on segment identity after zoom/pan. Generation sites
  now have a weakly keyed composition resolver: unchanged source/filter snapshots
  reuse totals and segments; only inspected sites format tooltip HTML. Replaced
  sites are not retained in a historical cache. Zoom-aware icon sizing remains
  separate, and dispatch shares still use installed capacity for symbol sizing.
- Seven added cases cover real-map navigation reuse and tooltip binding, lazy
  formatting, filtered source replacement, dispatch/carrier aggregation, numeric
  fallbacks, escaped source text and empty-result caching. Sixty targeted tests
  passed, followed by 618 tests / 50 suites in 179.8 seconds. Root bundle
  main.bd3db5e9.js and /atlas/ main.1f30638d.js are 360.94 kB gzip;
  CSS main.6871e992.css is unchanged at 19.89 kB. Nine compiled-preview checks pass.
- Isolated browser tab 45 at 1280x720: Belgium NUTS3 Grid + Supply displayed
  capacity-sized pies. Clicking BE236 exposed its component popup and generated
  tooltip (7,436.7 MW; nuclear 41.1%, wind 38.6%, gas 13.8%, plus other carriers).
  Zoom/fit and Supply hide/show settled with the layer restored. Solar filtering
  removed every solar slice and reduced 17 pies to 16; restoring it returned
  17 pies with solar. No captured console errors. The browser API has no hover
  action, so independent hover-only interaction remains covered by component
  tests, not a live pointer hover test.
- A transient blank map frame occurred during a camera transition and recovered
  on the next observation. Do not treat this run as smooth-camera acceptance or
  an ordinary-laptop benchmark. Follow up with constrained-hardware camera/frame
  profiling; this change proves avoided computation, not a measured latency gain.
- Restored Logistics All Europe, removed the QA electricity country and closed
  the QA tab after ready. No user-tab operation, microphone capture, backend
  restart, credentials change or staged-data activation was performed.

## Voice interruption and stalled-response recovery — 2026-09-06

- Fault-injected speech responses reproduced a queue stall: the existing
  45-second timer/interruption aborted the fetch signal, but awaiting headers,
  audio or an error body still held processQueue when the transport ignored
  cancellation. Six cases failed before the fix; subsequent instructions could
  not execute until the old response settled.
- Extracted the existing WebRTC cancellation wait into a shared voice helper.
  Speech and push-to-talk transcription now race each response/body stage with
  cancellation. Factories prevent starting cancelled work; listeners are removed
  on settlement and late rejections are consumed. A late header cannot trigger
  body decoding, and late audio/transcripts cannot play or submit commands.
  Existing speech/transcription deadlines, Nohm routes, microphone policy and
  provider configuration remain unchanged. This bounds caller ownership; it
  cannot preempt synchronous decoding or forcibly stop an abort-ignoring transport.
- Seventeen new cases cover stalled speech headers/audio/error bodies after
  interruption, timeout or session restart; stalled transcription headers/body
  after timeout or restart; retry capture and stale transcript rejection; and
  helper listener cleanup/cancellation. The actual voice hook and existing
  WebRTC lifecycle suite pass. Network and microphone faults are simulated,
  not observed with a representative physical microphone or live speech service.
- Verification: 611 tests / 49 suites passed in 181.6 seconds. Root build
  main.da54855c.js and /atlas/ main.65d40d08.js are both 360.89 kB gzip;
  CSS main.6871e992.css remains 19.89 kB. Nine compiled-preview checks passed.
- Browser check at 1280x720: selected Conversation with the mic off, collapsed
  settings, closed/reopened EMIL, and confirmed retained mode plus Voice off.
  A real text request to show Belgium in Logistics completed and its live judge
  verified the country. No captured console errors. Restored Command stream,
  expanded settings, Logistics All Europe and assistant closed; closed QA tab 44
  after ready. User tab was not operated on, and no microphone/permission,
  credentials, backend restart or staged-data activation action was performed.
- Remaining gates include live voice under real microphones/noise/languages,
  constrained-hardware performance, broader agent/data coverage and the actual
  Nohm host integration. These recovery tests are not production certification.

## Shared overlay domain hydration and conversation continuity — 2026-09-06

- Eight real-App regressions reproduced country-unscoped infrastructure calls
  from shared layer commands, despite the visible overlay using FR or BE+FR.
  Manual and agent overlay domain controls now share one loader and visibility
  commit. It uses current committed Geography, not the exit workspace's country
  filter or a stale pre-command closure. Compound country/resolution/layer
  commands hydrate the full new membership, including power and selected sources.
- Only missing domains are requested. Source-country replacements include Grid
  and required visible domains; stale initializations are superseded through the
  existing bounded request owner. Jobs are awaited in pairs and failures are
  reported by carrier. Source units and provenance are not merged. There is no
  new history cache, whole-Europe fallback or backend/schema change.
- Failed shared hydration does not replace domain visibility or disable an
  existing Access overlay. Manual retries reuse successful source/power caches.
  A newer hide, Access-only view, country scope or carrier selection invalidates
  the old visibility commit. Agent hide can take effect during a power domain
  batch without another download; late completion cannot re-enable the layer.
  Per-carrier legend coverage replaces misleading power-only absence statements
  in combined-view confirmations.
- Live browser testing exposed an additional UX defect: a model plan reaffirming
  the overlay carriers closed the conversation panel. Two App cases reproduced
  it. Agent overlay actions now retain conversation focus, and unchanged carrier
  selections reuse their existing state array. Manual legend focus is unchanged;
  microphone ownership was already independent and was not tested live here.
- Added 15 App cases: shared Supply/Demand/Storage hydration, cached manual
  reuse, hide without fetch, four-carrier compound Geography, failed-source
  retry, late hide/Access/country changes, in-flight power hide, and conversation
  retention on enabling/reaffirming overlays. Full regression run: 593 tests /
  48 suites passed in 181.931 seconds; the subsequently added in-flight-power
  hide case passed separately (594 tests now in the catalogue). No source edits
  followed that full run; the added test is the only subsequent code-file edit.
- Final root main.ea3e0ed7.js and /atlas/ main.c4c3fffa.js are both 360.82 kB
  gzip; CSS main.6871e992.css remains 19.89 kB. Nine compiled-preview checks
  passed. These checks do not establish ordinary-laptop performance acceptance.
- Live planner/judge checks at 1280x720: Belgium supply-only showed 68 power
  supply assets and nine logistics supply assets. Reaffirming power/logistics
  and adding Grid then kept EMIL open. Adding France at NUTS2 with Grid+Supply
  showed 122 Grid and 242 Supply assets, 50 links. “Hide supply” left 29 power
  nodes / 50 links and 93 logistics assets. Screenshots, layer controls, legend
  and real judge agreed; no captured console errors. This was text, not mic input.
- Restored Logistics All Europe, overlay off and logistics-only overlay choice;
  closed QA tab 43 after its restored data reported ready. The user's
  existing tab was not operated on. No backend restart, staged data activation,
  credentials or security changes were made. Broader agent/model-setting scope,
  live voice, target-laptop, Nohm-host and data-acceptance gates remain open.

## EMIL edits shared overlay Geography — 2026-09-06

- Reproduced the execution mismatch after the preceding context fix: default
  overlay country commands still used the return workspace's source filter,
  and default resolution commands were rejected as infrastructure operations.
  Eight App cases failed before the routing fix (four exit-workspace carriers,
  country editing and resolution stepping). The map's combined resolution
  remains `overlay`; tests inspect actual power source filenames and records.
- Default actions now retain overlay scope instead of deriving it from the
  exit workspace. Shared country edits use the PyPSA membership transaction
  already used by Geography, and do not switch the return workspace to power.
  Explicit source-carrier requests remain distinguished: requesting NUTS for
  gas/water/liquids/logistics reports the source-topology limitation and does
  not silently change the power network.
- Twelve new real-App cases cover add/remove/replace/all-country commands,
  NUTS2 → NUTS3 → Full/Nodal → NUTS3, all four infrastructure exit workspaces,
  selected infrastructure datasets following BE/FR membership and removal,
  and the explicit source-resolution guard. The fixtures inspect source
  request countries and rendered records, not just assistant confirmations.
- Live browser check at 1280x720, power + logistics overlay, Logistics selected
  as workspace on exit: EMIL added Belgium alongside France at NUTS2, stepped
  to NUTS3 on “Increase granularity one level”, then removed France on “Remove
  France from the view”. Real planner and judge completed all three commands.
  Final visible Belgium inventory was 17 power assets / 21 links plus seven
  logistics assets; screenshot and legend confirmed France was removed.
  No captured console errors. Restored Logistics All Europe, overlay off,
  logistics-only overlay selection; closed QA tab 42 after ready. User tab 1
  was not operated on and the microphone remained off.
- Builds: root main.d967d1b4.js and /atlas/ main.96493f67.js, both 360.29 kB
  gzip; CSS main.6871e992.css remains 19.89 kB. Nine compiled-preview checks
  passed. Final full regression rerun: 579 tests / 48 suites passed in 156.625
  seconds. An earlier run inspected the asynchronous assistant reply too soon;
  that test now advances the judge timer before inspecting the message.
- Remaining action-parity work: setAtlasDomainsFromAgent still chooses a
  standalone carrier; shared overlay Supply/Storage/Demand requests need the
  same country-scoped, bounded lazy hydration as manual overlay controls,
  including compound geography-plus-domain requests and source failures.
  This change does not establish full model-settings, voice or command parity.
  Ordinary-laptop, Nohm-host and data-acceptance gates remain open. No backend
  restart, staged data activation or credential/security changes were made.

## EMIL observes shared overlay Geography — 2026-09-06

- Four App cases reproduced a context mismatch: an overlay showing FR reported
  the standalone BE country filter when its return workspace was methane, water,
  liquids or logistics. Shared-country navigation could therefore target BE.
- Overlay context now reports networkCarrier=overlay and a separate
  workspaceCarrier, shared country membership and active country, no fictional
  single activeNetwork, and electricity-scoped cache resolution. The control
  schema explains these scopes. Standalone context retains its source semantics.
  The four regressions inspect the actual interpreter request and verify that
  fit_selection issues a France viewport target despite standalone BE.
- Selected-marker lookup considers selected overlay source datasets rather than
  the exit workspace. A unique match includes carrier ownership; colliding IDs
  are reported as ambiguous without guessed coordinates. Two additional cases
  cover a gas-only ID and a gas/power ID collision. This is not a full redesign
  of scoped marker selection IDs or source-country collision handling.
- Real browser/AI check at 1280x720: loaded France, set standalone Logistics to
  Belgium, entered the France logistics overlay, and asked to fit the current
  country selection without changing data or layers. The live planner returned
  a coordinated action, the frontend framed France, and the live judge confirmed
  unchanged layers/data. France and 86 logistics assets remained visible. No
  captured console errors. This is fresh evidence that this real text planning
  and judging path works; earlier credential blockers do not describe this call.
  It is not live microphone/voice or broad model acceptance.
- Restored Logistics All Europe, overlay off and logistics-only overlay choice;
  closed the QA tab after ready. The user's existing tab was not operated on.
- Verification: 567 tests / 48 suites passed in 136.66 seconds. Root build
  main.6508b25a.js and /atlas/ main.b370508a.js are both 360.27 kB gzip;
  CSS main.6871e992.css remains 19.89 kB. Nine compiled-preview checks passed.
- Next agent audit: action execution still contains standalone-carrier routing
  (executeAtlasDirectAction / setAtlasDomainsFromAgent / electricity-only intent
  guard). Correct context alone does not prove overlay add-country, resolution
  and shared-domain requests use the manual overlay workflow. Test and address
  that routing before claiming full text/voice control parity. Ordinary-laptop,
  Nohm-host, boundary-data and other acceptance gates remain open. No backend
  restart, data activation, credentials changes or microphone test was performed.

## Regional boundaries follow visible power — 2026-09-06

- Four real-App regressions confirmed that a non-power-only overlay still
  received PyPSA NUTS polygons whenever Electricity was selected as the return
  workspace. In overlay mode, geographic model polygons now depend only on
  whether power is selected in the carrier legend. Standalone power still uses
  its current network's polygons. A stable empty array avoids re-preparing empty
  geographic inputs on unrelated renders.
- Tests cover all four infrastructure carrier choices, unchanged shared country
  codes, changing the exit workspace in either direction, adding/removing power
  and returning to standalone power. All four failed before the fix.
- Live check at 1280x720: French logistics-only overlay showed its country outline
  without NUTS subdivisions while Electricity was the exit workspace. Adding
  power restored NUTS3 polygons; changing the exit workspace to Methane and then
  hiding power removed those subdivisions while preserving France and its 86
  logistics assets. No captured console errors. Restored Logistics All Europe,
  overlay off and logistics-only overlay selection; closed the QA tab after ready.
- Verification: 561 tests / 48 suites passed in 133.346 seconds. Root build
  main.715dbd0b.js is 359.99 kB gzip; /atlas/ main.c7725d8b.js is 360.00 kB;
  CSS main.6871e992.css remains 19.89 kB. Nine compiled-preview checks passed.
- This corrects display ownership, not boundary source accuracy or the pending
  source-data migration. Ordinary-laptop profiling, deployed Nohm integration,
  live voice and broader data/agent acceptance gates remain open. No backend
  restart, staged data activation or microphone test was performed.

## Hidden-source completion no longer invalidates the visible overlay — 2026-09-06

- Four App regressions reproduced a performance defect: finishing a hidden
  carrier download replaced the visible power node/line arrays with identical
  copies. The combined country-filter memo rescanned every source whenever any
  source changed, and the selected view then cloned the unchanged power records.
- Added per-carrier current-value country memos and a selected-input projection.
  Hidden-source changes still update country-scoped legend records but preserve
  visible inputs. Standalone mode skips overlay filtering. Hook tests verify one
  source filter call rather than five for a one-source update, equivalent-country
  normalization, selected-source/country invalidation, and disabling preparation.
  App cases verify retained node/line array identities and new hidden data becoming
  visible on reselection. No accumulating multi-country history cache was added.
- Verification: 557 tests / 48 suites passed in 122.851 seconds. Root build
  main.823a364c.js is 359.97 kB gzip; /atlas/ main.55c8aefd.js is 359.98 kB; CSS
  main.6871e992.css remains 19.89 kB. Nine compiled-preview checks passed.
- Browser check: Spain + France Full/Nodal with electricity, methane and water
  had 9,575 assets / 6,282 links. Three zoom-out/in repetitions completed without
  blank maps or persistent drawing state. Rendered links alternated between
  6,216 and 5,777; 41 undrawn source links remained disclosed. Removing water and
  methane left 2,282 power assets and all 3,137 power links rendered. No captured
  console errors. Detailed per-sample timings and limitations are in PERFORMANCE.md.
- This was the dev frontend at 1280x720 on a confirmed 32-logical-processor,
  127.9-GiB host, not a controlled before/after or ordinary work-laptop result.
  The timings exclude decode, React preparation, nodes and compositing. Expanded
  diagnostics overlapped the lower carrier legend; it was collapsed before
  removal actions. Production-bundle profiling on target hardware, Nohm host,
  live voice and the broader coverage/data-quality gates remain unproven.
  Restored Logistics All Europe, overlay off and the logistics-only overlay
  preference, then closed the QA tab after it reported ready. No backend restart,
  data activation or microphone test was performed.

## In-flight infrastructure ownership across modes — 2026-09-06

- Twelve delayed-response App regressions reproduced missing cancellation when
  entering overlay from a loading standalone carrier. They span methane, water,
  liquids and logistics at status, network-header and network-body phases.
- Workspace mode changes now invalidate obsolete per-carrier request and
  initializer identities before cancelling transport. Switching standalone
  workspaces also cancels the previous workspace's pending infrastructure read.
  Loading flags are released immediately. Interrupted domain inventories are
  invalidated so scoped initialization can recover all requested visible domains
  rather than treating a partially hydrated Grid as complete. Settled caches
  are not invalidated by this cancellation path.
- Added a read-only pending-ownership query to the existing shared request
  manager; its test covers full body ownership, cancellation and late settlement.
  App checks verify that late headers are never decoded, late bodies cannot
  alter geometry/Supply/camera, and a fresh standalone request remains possible.
  Eight reverse-transition cases verify that late overlay status/body responses
  cannot replace the restored standalone dataset. A multi-carrier case verifies
  two held body reads plus queued work cancel on exit without later batch fetches.
- Browser check at 1280x720 switched into overlay immediately after starting
  Methane. French NUTS3 Grid + Supply remained usable at 373 assets / 181 links;
  Methane remained Not loaded until explicitly selected. Selecting methane then
  immediately leaving overlay recovered the standalone All Europe workspace.
  Re-entering overlay remained usable. No captured console errors. Restored
  Logistics All Europe, overlay off and logistics-only overlay preference.
  Deliberate network delays were exercised in App tests, not injected in the
  browser; the live check does not establish transport-phase timing guarantees.
- Verification: 549 tests / 47 suites passed in 125.12 seconds. Root build
  main.201e6c85.js and /atlas/ build main.67ceab5d.js both report 359.67 kB gzip;
  CSS main.6871e992.css remains 19.89 kB. Nine compiled-preview checks passed.
  Closed only the QA tab after the restored logistics workspace reported ready.
- Cancellation is logical ownership protection, not preemption of an already
  executing synchronous JSON decode. Full Nohm integration, ordinary-laptop
  performance, mixed agent/voice actions and the broader acceptance matrix remain
  open. No backend restart, data activation or microphone test was performed.

## Overlay workspace switching avoids unrelated downloads — 2026-09-06

- Eight new real-App cases failed before the change: switching the primary
  workspace during overlay started an unscoped all-Europe infrastructure
  request; restored overlay sessions did the same before choosing Geography.
  Standalone initialization also reset the overlay domain filters.
- Consolidated standalone transition handling. In overlay, the primary selector
  now only remembers the workspace to open on exit; the label and tooltip make
  this explicit. Shared-country overlay loaders own visible carrier downloads.
  Standalone country scope is restored on exit when needed. Successful matching
  caches are retained rather than reloaded merely because overlay was closed.
- Regressions cover all four infrastructure carriers: no request on workspace
  selection alone, identical map geometry and unchanged Supply selection, no new
  viewport command, preserved overlay selections, FR-only load after selecting
  the carrier, and the standalone request on exit. Restored overlay startup
  waits for shared Geography. Four additional StrictMode startup tests caught
  an effect-replay regression during implementation; transition ownership is
  now reset along with request cancellation during teardown, and all pass.
- Live 1280x720 comparison: the French NUTS3 power Grid + Supply view stayed at
  373 assets / 181 links with the same visible extent when the return workspace
  changed to Methane. Methane remained Not loaded. Explicit legend selection
  then loaded 683 methane assets / 790 links while power Supply remained visible.
  No captured console errors. Restored Logistics All Europe, overlay off and
  the original logistics-only overlay selection, then closed the QA tab.
- Verification: 527 tests / 47 suites passed in 109.649 seconds. Root build
  main.007a22a5.js is 359.50 kB gzip; /atlas/ build main.becea339.js is 359.51 kB;
  CSS remains main.6871e992.css, 19.89 kB. Nine compiled-preview checks passed.
- Next transition coverage: mode/workspace changes while a standalone status or
  body request is already in flight. The settled-state tests above do not prove
  those late completions cannot reset filters or issue a stale camera focus.
  Broader laptop-performance, Nohm-host, full carrier/agent and live-voice
  acceptance remain open. No backend restart, staged data activation or
  microphone test was performed.

## Shared Geography from every overlay entry workspace — 2026-09-06

- Reproduced the sidebar routing bug with four real-App regressions: starting
  in methane, water, liquids or logistics left the standalone country selector
  visible in overlay mode and hid the actual shared Add country control. All
  four cases failed before the fix. Overlay now renders the shared sidebar
  independently of the primary carrier; standalone controls return on exit.
- Labelled shared countries as applying to all overlay carriers. Build,
  resolution, operations, detailed carrier filters and More Settings explicitly
  identify their power-only scope in this mode; other carriers retain source
  topology. No primary-carrier change is required to access shared Geography.
- The regressions verify FR then BE+FR shared request scopes, unchanged primary
  carrier and restoration of the original standalone BE selection and request
  on exit. They exercise existing App handlers, not a substitute controller.
- Live browser verification at 1280x720 started in Logistics with BE selected:
  overlay exposed shared Geography immediately; adding FR showed 86 logistics
  assets, adding BE showed 93, exiting restored BE and its 7 assets. No captured
  console errors. Restored the entry All Europe logistics workspace, overlay
  off, and closed only the QA tab. The user tab was not operated on.
- Verification: 515 tests / 47 suites passed in 97.373 seconds. Root build
  main.ae9c11d8.js is 359.40 kB gzip; /atlas/ build main.bd491862.js is 359.41 kB;
  CSS main.6871e992.css remains 19.89 kB. All nine compiled-preview checks passed.
- This fixes access to the existing shared-country mechanism; it does not
  decouple that mechanism from the PyPSA country cache catalogue. Independent
  carrier-only geographies and changing the primary carrier during an active
  overlay still need broader acceptance coverage. Ordinary-laptop performance,
  deployed Nohm integration and live voice acceptance remain unproven. No backend
  restart, staged dataset activation or microphone test was performed.

## Valid-empty overlay sources remain usable — 2026-09-06

- A real-App regression confirmed that a successful empty Grid response was
  labelled Load on selection and disabled other domains. Overlay inventory now
  separates successful loading from record presence (`loaded` / `hasRecords`).
  Empty caches remain loaded and eligible for lazy Supply/Demand/Storage; they
  are not presented as failures or repeatedly fetched merely for being empty.
- The legend distinguishes No records for loaded layers, Hidden · no records,
  update failure after an earlier empty result, and data hidden by filters.
  Empty-source indicators are neutral rather than a green records-present dot.
  Coverage text explicitly limits the conclusion to loaded layers/countries:
  other domains may contain records and absence in this source is not proof of
  absent infrastructure. Loaded-source counts include successful empty responses.
- The last-network safeguard still protects a known non-empty source from being
  replaced solely by a known-empty one. Empty/failed selections themselves can
  be deselected. This checks source records, not proof of drawable geometry.
  Automatic fallback prefers loaded sources with records before an empty cache.
- Verification: 511 tests / 47 suites passed in 97.219 seconds. New four-carrier
  App cases verify empty Grid, enabled domain controls, country-scoped Supply
  hydration, no extra Grid request and resulting map assets. Helper and App
  regressions cover empty-source removal and protection of the remaining power
  network. Root main.4e7d100c.js and /atlas/ main.c2ffaaad.js both build at
  359.32 kB gzip; CSS main.6871e992.css is 19.89 kB. Nine compiled-preview
  subpath/proxy tests passed.
- Live test at 1280x720 used the existing North Macedonia logistics data, not
  injected failures: Grid returned 0 assets / 0 links; its overlay remained
  loaded and Demand controls stayed enabled. Loading Demand displayed two
  assets / zero links and cleared the empty-source notice. Hiding Demand then
  correctly showed loaded-but-filtered, with no captured console errors.
  Restored the entry logistics workspace with overlay off. No backend restart,
  data activation or microphone test was performed.
- Next UX issue observed live: enabling overlay while the primary carrier is
  Logistics retains its standalone country sidebar, although overlay Geography
  is controlled by the electricity country selection. The shared Add country
  control only appeared after changing the primary carrier to Electricity.
  Make shared overlay Geography accessible independently of the primary carrier.
  Ordinary-laptop, mixed-transfer, full Nohm-host and live voice gates remain open.

## Shared infrastructure transfer budget — 2026-09-06

- Verified that the initializer's two-item batches did not provide a global
  concurrency limit: the real App, with network bodies deliberately held open,
  started all four infrastructure downloads as effects overlapped. The new
  regression failed with four active JSON bodies before the fix and passes with
  a peak of two; every carrier still finishes and reaches the map.
- Moved enforcement to the shared carrier request manager. One FIFO budget
  covers initial downloads, domain hydration, country rescope and retries for
  methane, water, liquids and logistics, through fetch and full body completion.
  Status checks remain independent of these two network slots. Existing latest-
  per-carrier cancellation and response validation remain in place.
- Queue waits are included in the existing 90-second network deadline. Obsolete,
  cancelled or expired queued requests never fetch; malformed bodies release
  their slot. Cancel-all removes pending jobs and permits reuse. New regressions
  cover queued supersession, queued expiry, status bypass, body failure and
  invalid concurrency settings. See PERFORMANCE.md for ownership limitations:
  this is not a cap on PyPSA/raster/all browser traffic or cached dataset memory.
- Verification: 504 tests / 47 suites passed in 92.802 seconds. The request-owner
  suite passed 25 cases, including the existing ignored-abort and late-body
  protections. Root build main.ab87055f.js is 359.21 kB gzip; /atlas/
  main.5eb2aa75.js is 359.22 kB; CSS main.1f07080c.css remains 19.88 kB.
  All nine compiled subpath/proxy preview checks passed.
- Live browser at 1280x720: loaded Belgium, selected all five carriers, added
  Spain, then enabled Supply across them. Both Grid and Grid + Supply settled
  ready, with no captured console errors. Removing Supply and all four secondary
  carriers left electricity's 63 assets / 104 links intact. Restored overlay-off
  and the entry logistics workspace. Detailed source counts are in PERFORMANCE.md.
  The browser check verifies completion/UI behaviour, not measured transport
  concurrency; held-body App tests establish that bound. No backend restart,
  microphone use or data activation occurred.
- Remaining: ordinary-laptop CPU/heap/input measurements, mixed PyPSA and
  infrastructure transfer peaks, Nohm host and live voice acceptance. Valid-empty
  source inventories versus geometric presence still need the next UX audit.

## Empty-overlay recovery and bounded failure retries — 2026-09-06

- Empty maps now distinguish missing country selection, loading, failed
  sources, unselected networks, missing geographic coverage and hidden domains
  or carrier filters. When all domains are hidden, Show Grid uses the existing
  domain action: cached data is restored without changing the camera or loading
  unrelated domains. The legend labels filtered-out data as Loaded · hidden by
  filters instead of implying that the loaded dataset contains zero records.
- Last-carrier/power guard messages clear when their selection/filter context
  changes. Actual load failures persist through unrelated filter changes;
  country-specific failures expire when that country scope changes. Notices
  have larger text and an explicit Dismiss button. The last-carrier guard now
  correctly says selected, not visible: users may intentionally hide domains.
- A controlled failure regression exposed an unbounded automatic retry path:
  one methane selection made three status requests before the test bounded the
  loop. Initializer loading-state changes reran the overlay effect after each
  failure. Automatic attempts are now owned per carrier/country scope, including
  rescope replacements; their failure cannot fall back into lazy initialization.
  Explicit reselection, a new country scope or re-entering overlay mode permits
  another attempt. Failure state is exposed in the carrier legend. Ownership
  maps contain at most one entry per supported carrier and clear on teardown.
- The same regression exposed a missing country parameter on explicit overlay
  domain loads/retries, which inherited a standalone all-Europe filter. All four
  infrastructure loaders now receive the selected overlay countries; no-country
  overlay loads are refused. This prevents accidental all-Europe hydration from
  a small-country domain selection. No dataset was truncated or activated.
- Automated: 494 tests / 47 suites passed in 94.518 seconds. Four-carrier cases
  cover stopped initial failures, explicit reselection recovery, failed country
  rescope, scoped Grid retry, new-country recovery and lazy Supply loading with
  the same country scope. The real-App hidden-Grid test verifies unchanged parse
  request count, geometry restoration and no camera command. Final legend copy
  and its real-App wiring passed two additional targeted regressions (9.666 s).
- Final builds: root main.f864ab2c.js, 358.99 kB gzip; /atlas/
  main.613bba86.js, 359 kB gzip; CSS main.1f07080c.css, 19.88 kB.
  All nine compiled subpath/proxy preview checks passed on the final subpath build.
- Live browser QA in an isolated tab at 1280x720: no-country instructions,
  Belgium logistics with seven Grid assets, hidden-domain guidance and Show Grid,
  automatic guard clearing, explicit dismissal and restored loaded counts. No
  captured console errors. Restored overlay-off and the entry logistics workspace.
  Failure injection was automated/mocked, not performed on the live service.
- Readiness is still unproven: these checks do not measure cold-load/input/heap
  behaviour on an ordinary laptop or complete Nohm host/voice acceptance. Further
  audit should include overlapping overlay-load effects versus the intended
  concurrency cap, and valid-empty source inventories versus geometry presence.

## Cooperative line retirement and empty-view filtering — 2026-09-06

- Replaced synchronous old-line disposal with cancellable, frame-scheduled
  removal (4 ms budget, at most 1,000 children per batch). The old canvas is
  hidden/detached immediately; it cannot reproject retired paths during another
  zoom. Processed references are released as removal proceeds. No source routes
  are omitted or changed to obtain this optimisation.
- Retain at most one committed drawing and one staging/retiring drawing. New
  requests wait for retirement to free the slot; repeated waiting requests are
  superseded so only the latest builds. Removal failure quarantines the slot
  until map remount instead of accumulating abandoned graphs. Actual component
  unmount still cancels frames and synchronously releases remaining layers.
- Keep the line owner mounted for zero-feature views. Hiding every line or
  panning into an empty viewport now commits an empty frame and cooperatively
  retires the old graph. Nodes/boundaries wait for the corresponding line frame,
  including empty views. Restore during retirement waits safely for its slot.
- Diagnostics distinguish scheduling, construction, cleanup batches and final
  disposal. The last completed drawing and cleanup are separate samples, not
  misleadingly combined. Normal sessions remain unprofiled; no telemetry.
- Automated verification: 482 tests / 47 suites passed in 77.327 seconds;
  targeted map/lifecycle checks passed 85 tests / five suites. Coverage includes
  15 superseding requests, empty-frame/restoration, failed retirement, unmount
  with a waiting request, 50 completed replacements, Strict Mode, and installed
  Leaflet removal after canvas detachment with unchanged source geometry.
  The final diagnostic copy also passed its seven targeted tests.
- Final production builds passed: root main.d68fff63.js and /atlas/
  main.d0594cf3.js, both 357.81 kB gzip; CSS main.1b3702be.css 19.85 kB.
  All nine compiled-preview subpath/proxy tests passed against that subpath build.
- Fresh-page live QA (1042x920, DPR 1): Spain + France nodal, 9,575 assets /
  6,282 loaded links, electricity/methane/water. Zoom-out/in cleanup removed
  6,216/6,219 layers in 18/16 batches, largest 4.0 ms; a later carrier removal
  peaked at 8.1 ms (budget is not preemptive). Hiding Grid committed zero links
  and retired 3,137 layers in nine batches, largest 4.0 ms. Restoring returned
  all 3,137 electricity links. Three canvases/fourteen panes settled when shown,
  two canvases with Grid hidden, no captured console errors. See PERFORMANCE.md
  for individual samples, changed metric semantics and limitations.
- Remaining: whole-map/forced-unmount costs, production-host and normal-laptop
  acceptance, longer-session repetitions and voice verification. No backend
  restart or data activation. The source's 41 undrawn links remain disclosed.
  Fresh-page results exclude a hot-reload-only extra country canvas. Empty
  overlay instructions and stale last-carrier warning need a further UX pass.

## Measured line-render stages and teardown — 2026-09-06

- Added an opt-in `atlas-diagnostics=1` local readout. It measures replacement
  setup, active construction/batches/single-feature maximum, final canvas draw,
  previous-drawing retirement and elapsed time including yields. It is off by
  default, keeps one completed sample without source data/history, and sends no
  telemetry. See [PERFORMANCE.md](PERFORMANCE.md) for scope and a repeatable
  target-device scenario. These are not whole-browser/hardware measurements.
- Foreground browser measurements at requested 1280x720 identified a synchronous
  retirement bottleneck: 6,216 three-carrier links took 48.0 ms to remove the old
  drawing, while construction was distributed over 32 batches (7.0 ms maximum).
  This evidence changes the next performance target to old-layer teardown.
- Owned canvases now stop accepting dirty-bound/redraw work before disposal,
  including replacement, failed staging and unmount. A real installed-Leaflet
  regression with 2,000 removed paths confirms dirty-bound expansions drop from
  2,000 to zero, queued redraws from one to zero, and no retained paths. No global
  Leaflet patch or topology simplification was introduced.
- Post-change live samples: 6,216 links / 157.5 ms active construction / 7.0 ms
  largest batch / 12.8 ms final draw / 40.4 ms retirement; zoom back in measured
  5,777 / 153.8 / 7.1 / 10.2 / 38.7 respectively. These single samples are not a
  controlled speedup claim. Retirement remains synchronous and needs further
  work. Combined dataset: 9,575 assets / 6,282 links; source's 41 undrawn links
  remain disclosed. Three canvases/fourteen panes remained after both zooms;
  no captured console errors. Restored overlay-off, the entry logistics carrier
  and viewport, and closed the separate QA tab. No backend/data activation.
- Final frontend suite: 470 tests / 46 suites passed in 77.718 seconds. Both
  production builds passed: main.442406bf.js (root), main.dbde0235.js (/atlas/),
  both 356.98 kB gzip; main.1b3702be.css 19.85 kB. All nine compiled-preview
  subpath/proxy HTTP checks passed on the final subpath build.
- Next: investigate bounded, cancellable old-layer teardown while preserving
  the committed map and bounded retained buffers. Then measure remaining
  preparation/node/whole-map costs on target hardware; the new readout excludes
  those stages and does not close the work-laptop or Nohm-host acceptance gate.

## Infrastructure readiness and count semantics — 2026-09-06

- Fixed four infrastructure panels that displayed a ready checkmark whenever
  network loading stopped, including failure and before any dataset had loaded.
  The shared InfrastructureLoadStatus component now distinguishes source checks,
  downloads, not loaded, loaded, valid-empty and failed updates. A successful
  status endpoint is not proof that map data has loaded. Failed additive updates
  explicitly distinguish retained loaded layers from the failed request.
- Added a recovery button next to errors, labelled Reload grid and explicitly
  explaining that this resets to Grid; it does not falsely promise to retry a
  failed secondary layer. Other layers remain lazy-loaded. Status text is a
  named, atomic live region, errors wrap, and spinner motion is disabled for
  reduced-motion users. Country controls are disabled while checking/loading.
- Successful status responses must declare available=true and provide a country
  array. An HTTP-200 available=false response is still an unavailable source and
  does not trigger a network download. Initialisation cleanup releases its Status
  phase on failure without clearing a newer request's phase.
- Sidebar counts are labelled Database totals / all countries. Unknown source
  domain counts render as an em dash, not a known zero. The logistics footer no
  longer combines loaded assets with database-wide physical port/airport counts:
  its memoized maritime and aviation counts use the same loaded records as its
  total. These are asset counts by mode, not inferred unique physical sites.
- Automated evidence: 459 tests / 45 suites passed in 81.129 seconds. Added
  16 shared-panel cases, five status-response validation cases, four actual-App
  checking/failure/reload/empty-response cases and a loaded-logistics-count case.
  The latter uses deliberately different source totals and an unknown-mode
  record to ensure global totals cannot leak into loaded-mode counts.
- Production builds passed: root main.1c9f6fb0.js, 355.94 kB gzip; /atlas/
  main.17c2d2ac.js, 355.94 kB gzip; CSS main.6e43ec4b.css, 19.8 kB gzip.
  The compiled subpath/proxy preview HTTP checks also passed (nine tests).
- Live browser: all four carrier panels showed Checking before their datasets
  became ready. Belgian methane country changes showed Loading; the completed
  status and database-total label fit the 1280x720 panel. Logistics status and
  country controls were readable at 800x450 with a scrollable sidebar. Its Europe
  Grid overview showed 1,098 loaded maritime assets and zero loaded aviation
  assets (previous footer showed unrelated 1,200 ports / 415 airfields). Belgium
  Grid showed 7/7/0; adding Demand updated loaded/maritime/aviation to 17/12/5.
  No captured browser console errors. Restored the viewport, electricity carrier
  and expanded sidebar before closing the isolated QA tab.
- Limits: failure/empty states were exercised with controlled automated API
  responses, not by taking the user's server offline. No backend restart, data
  activation or real-microphone test occurred. These UX checks do not establish
  low-memory work-laptop performance or final Nohm production readiness.

## Bounded infrastructure downloads — 2026-09-06

- Replaced the methane, water, liquids and logistics network/status fetches in
  App with one request owner per carrier. A newer request aborts the older
  same-carrier request; different carriers still transfer independently. Unmount
  invalidates dataset commits and cancels pending requests. Completed hidden
  carrier datasets remain cached for fast toggling; this is not a cache eviction
  policy and does not establish a bound on the size of a single dataset.
- Network deadlines cover both response headers and JSON body completion
  (90 seconds); status checks have a 30-second deadline. Cancellation/timeout
  also settles the caller if a transport ignores abort. Late response headers
  are not followed by a large JSON decode. Invalid JSON or a successful response
  missing facilities/connections arrays can no longer mark domains loaded.
- Initialisation uses unique ownership tokens: cancelled status checks cannot
  start obsolete downloads, clear newer initialisation, or publish cancellation
  as a source failure. Existing dataset generation guards remain in place.
- Automated evidence: 433 tests / 44 suites passed in 78.602 seconds, including
  11 request-owner cases and six real-App wiring cases. These cover concurrent
  carriers, stale headers/bodies, cleanup/reuse, malformed and valid-empty
  responses, status supersession, and a stalled methane body that times out,
  unlocks reload and successfully retries. Network responses/map rendering are
  mocked in App regressions; these are not real-device transport benchmarks.
- Both production builds passed: root main.186474b8.js, 355.14 kB gzip;
  /atlas/ main.802a94ac.js, 355.15 kB gzip. CSS remains 19.75 kB.
  All nine compiled subpath/proxy preview HTTP tests passed.
- Live browser QA in a separate tab: Belgian NUTS3 electricity (17 assets,
  21 links), methane (98/129) and water (401/403) loaded together. Adding France
  updated all carriers: power 110/202, methane 766/914, water 4,339/1,453.
  Hiding water and methane retained the visible electric grid with all 202
  links rendered. No captured browser console errors. Restored overlay-off
  preference and closed the QA tab; no backend restart or data activation.
- Limits: browser checks use the current host and successful local responses,
  not throttled low-memory hardware or real HTTP failure injection. The existing
  water source's two undrawn Belgian links remain a staged-data activation
  issue, not corrected by request cancellation. The full acceptance gates below
  remain open where not separately evidenced.

## Acceptance checks

- Production build and automated frontend/backend checks pass.
- Browser startup, country changes, all electricity resolutions, and combined
  carriers remain responsive on a typical work laptop (target: 8 GB RAM,
  four CPU cores; validate with a constrained browser where available).
- Render only the necessary map work; preserve network connectivity and
  explain any reduction in displayed detail. Filters, boundaries, nodes,
  capacity styling, generation pies, demand, land, and queue layers update.
- Agent actions match manual controls; navigation settles and rapid commands
  are ordered, bounded, and cancellable where relevant.
- Voice start, stop, permission failure, reconnect/fallback, interruption,
  transcript ordering, and speech playback release their resources reliably.
- Controls remain legible and reachable on laptop and narrow viewports;
  keyboard focus, accessible labels, and reduced motion are supported.
- Nohm integration uses configurable same-origin APIs; secrets remain on the
  server. Local startup consistently includes all Atlas extensions.
- Deployment/run instructions, data/service dependencies, and any remaining
  limitations are documented and supported by current evidence.

## Evidence and findings — 2026-09-05

- Paris camera follow-up: reproduced an automatic-fit race in a regression
  test (a pending network response changed the requested city zoom from 10
  to 6). Explicit EMIL navigation, place drill-down and map buttons now consume
  the pending automatic fit for that country selection, before movement events
  fire. A new country selection or explicitly re-enabling auto-fit still works.
  All 132 frontend tests pass; the production build compiles successfully.
  Browser check with France at NUTS3: `zoom into paris` settled at tile level 10;
  node/boundary toggles left the map-pane transforms and tile position unchanged.
  This verifies text-driven camera behaviour, not live microphone transcription.

- Working frontend: `atlas-land/app`; combined backend:
  `scripts/run_atlas_backend_stable.py`. Existing changes were preserved.
- Initial audit: filtered facilities and connections are recomputed repeatedly
  per App render. Voice microphone level updates trigger App renders.
- Initial audit: production API defaults contain historical AWS and localhost
  addresses; Nohm requires a configurable same-origin deployment contract.
- Full workflow browser checks and performance measurements are pending.

## Verified improvements

- Shared configurable API origin; production build no longer defaults to the
  historical remote API. Local development retains the separate Flask port.
- Memoized map inputs, cached route geometry, viewport clipping before overlay
  sampling, and lazy popup construction reduce repeated work.
- Audio meter updates are isolated from the map-owning React component.
- Icon caches are bounded (512 node styles, 2,048 generation pie styles).
- Removed the synthetic moving line packets (up to 40 independent frame loops);
  these were decoration, not calculated power flows. Network lines remain.
- Tailwind surface opacities now resolve; attribution, keyboard focus and CSS
  reduced-motion styling are restored. Land and Access panels are mutually
  exclusive when opened manually without turning their map layers off.
- Removed eager spaCy/English-model initialization from the backend import
  path. Direct geocoding remains unchanged; fallback NLP initializes once on
  demand. Three focused tests verify lazy import, reuse and missing-model fallback.
- Import profiling found `google_drive_service` and its dependencies consumed
  142 seconds of a 185-second cold legacy API import on this machine. Google
  imports are now deferred until GoogleDriveService is explicitly constructed;
  the local launcher selects LocalLogService without attempting Google OAuth.
  A subprocess test verifies importing LocalLogService does not load Google SDKs.
- Camera commands are acknowledged and cleared after application. Live browser
  tests of Paris, manual zoom-out, boundaries, nodes and carrier toggles stayed
  stationary; relative zoom advanced one level.
- Voice lifecycle tests cover cancelled startup, stale sessions, refused
  permission, device restart cancellation, ordered turns, duplicate finals,
  per-turn deadlines, no partial execution, bounded/cancellable queued commands,
  and interrupted TTS blobs. WebRTC is mocked in these tests.
- A real local voice-token request returned HTTP 200 and an ephemeral secret.
  The secret was not logged. This proves token setup, not end-to-end microphone
  transcription, language accuracy, conversational quality or playback latency.
- Full frontend test run: 105 tests passed; backend land/voice/grid-access tests:
  26 passed, plus 4 startup/lazy-dependency tests (30 backend tests total).
  Final build for this pass: 348.23 kB gzip JS and 19.25 kB gzip CSS.
- Browser, France: overlay-to-electricity retained grid data; bidding zone
  1 bus / 0 AC lines; e-Highway 14 / 53; NUTS1 12 / 23; NUTS2 21 / 42;
  NUTS3 93 / 181; Full/Nodal 1,204 / 1,860 (plus 4 DC links).
  Counts were read after loading finished, not inferred from slider labels.
- After the local-log change, the API process started at 02:34:00 and served
  land/grid-access HTTP 200 requests by 02:34:29. This is an observed local
  startup, not a controlled cross-machine benchmark. No Google authentication
  was attempted. The browser recovered the land catalog and France-clipped
  tiles with no remaining service error. API process: 50052 for this pass.
- Browser panel regression: opening Land hides Access controls, and vice versa;
  the camera tile/zoom stayed unchanged. The full France grid remained visible.

## Latest hardening pass — 2026-09-05

- The real browser command `show me all countries at bidding zone level with
  grid` loaded 34 countries, 53 buses, 110 AC lines and 7 DC links. Only Grid
  was selected. The server request span was roughly five minutes, including
  interpretation and verification; this is not an acceptable final cold-load
  result and still requires profiling and caching work.
- Visual inspection caught a failure that counts and the agent judge missed:
  after framing Europe from Paris, culling could retain the Paris bounds and
  hide most nodes/lines. Map event subscriptions now remain attached across
  React renders, publish an initial snapshot and release timers on unmount.
  Four regression tests cover automatic movement during effects, fresh
  callbacks, first-mount movement and Strict Mode cleanup. The live Europe
  view then showed the Italian and Nordic zones and wider connecting network.
- Manual country focus now fits geographic bounds instead of guessing zoom
  from node-centroid span. The browser Italy test shows its full footprint and
  seven bidding-zone nodes, including Sardinia and Sicily, within the view.
- PyPSA startup no longer invokes legacy workbook/CSV facility loading or
  workbook map-filter/property loaders. Those requests were generating missing
  workbook errors despite the PyPSA engine being selected. An actual App mount
  test (map renderer mocked) verifies land status loads while the unused
  workbook and example CSV routes are not requested.
- HTTP policy now uses exact configured origins, rejects unauthorized origins
  before handlers (not just via missing CORS headers), checks allowed Host
  names, preserves permitted credentialed preflights and marks voice responses
  no-store. Tests include simple POSTs, preflights, host rebinding, image
  requests, explicit Nohm origins and invalid configuration. This is not auth.
- The combined launcher now uses Waitress on loopback with eight workers,
  configurable backend root/runtime paths and explicit shared-credential file
  selection. A supplied provider key is never overwritten. The NetCDF lock
  remains. `/api/atlas/ready` checks all eight route groups without claiming
  dataset/provider readiness. Configuration and the remaining host isolation
  requirements are documented in `DEPLOYMENT.md`.
- A separate candidate API passed readiness and all service-status routes,
  permitted voice preflight (200) and rejected origin (403), before replacing
  the local API. The new live API also served a real country-scoped land PNG
  and a cold network load restoring the selection to 34 countries. The
  temporary candidate process was stopped after the live service was ready.
- Latest frontend: 110 tests passed; production build succeeds at 348.26 kB
  gzip JavaScript and 19.29 kB CSS. Tests use mocked microphone/WebRTC, and
  browser checks ran on the current machine, not constrained laptop hardware.
- Latest combined backend suite: 78 tests passed (HTTP policy, startup/runtime,
  land, voice and grid access). Final live API process for this pass: 78360,
  port 5001, logs under `.atlas-runtime/hardened-live-final-20260905`.
  Its readiness and permitted voice preflight return 200; opaque Origin is
  rejected with 403. Final browser view is stationary at Europe overview,
  34 countries / 53 buses / 110 AC lines / 7 DC links, with no offline message.

## Paris camera regression verification — 2026-09-05

- Re-tested `zoom into Paris` in the running Atlas browser with 34 countries
  loaded. It settled at zoom 10; node and boundary toggles retained the same
  tile coordinates and positions. Manual zoom-out remained under user control.
- Added four tests around the production map component (Leaflet rendering
  mocked), rather than testing only its one-shot helper. They cover synchronous
  movement events, Strict Mode, repeated filter/data updates, relative zoom,
  parent acknowledgement/remount and the legacy place-focus path.
- The targeted camera, telemetry and command-parser suites pass: 70 tests.
  This is a typed-command/camera verification, not a microphone transcription test.

## Persistent grid-cache and transfer pass — 2026-09-05

- Added a bounded, source-invalidated cache of exact grid/lines-only responses.
  It bypasses PyPSA import/NetCDF loading on a hit without substituting a
  simplified parser or changing node, line, capacity or provenance fields.
  Network, boundary file-set/content, reference topology, parser code and
  library versions participate in invalidation. Hot-edited workers bypass
  caching until restarted. Compatibility fallbacks are not persisted.
- Two candidate runs compared all **204** catalogued country/resolution
  responses (34 countries × six levels) byte-for-byte against the previous
  live API. Both passed completely. The final run's median repeat response
  was 56 ms; maximum was 310 ms on this workstation.
- Deployed the validated build to a fresh live process and ran all 204 entries
  with `--require-initial-hit`. Every first request and repeat was a cache hit;
  all response hashes still matched the independently verified baseline.
  Median repeat response was 60 ms; maximum 244 ms. The fresh process log
  contained no PyPSA imports during this check. Working set was approximately
  160 MiB before and 164 MiB after the run, not a browser-memory measurement.
- Browser-negotiated gzip reduced the combined response bodies from 13,954,968
  to 2,656,180 bytes (81%). Full France fell from 1,284,926 to 112,266 bytes.
  This is a measured transfer reduction, not reduced network detail.
- Added `scripts/warm_grid_map_cache.py` with all-country preload, persisted-hit
  verification, independent baseline comparison and JSON timing/hash reports.
  Deployment instructions document cache limits, invalidation and refresh use.
- Capacity tooltips now bind even when lines mount during map interaction;
  content is generated only on hover, including in performance mode. Two
  production-map-component regression tests cover this lifecycle.
- Current tests: 116 frontend and 119 backend tests passed. Production build
  succeeds: 348.25 kB gzip JavaScript, 19.29 kB CSS. React Testing Library emits
  an existing deprecated-act warning; no tests failed.
- Live browser switched 34 countries from bidding zones to NUTS3 and displayed
  **957 buses, 1,507 AC lines and 8 DC links**, matching the summed source
  responses. Nodes and lines are visibly updated, with final NUTS3 styling.
  The transition still processes countries sequentially, repaints intermediate
  mixed resolutions, reorders country chips and briefly labels them Full/Nodal.
  This is now the next measured UI bottleneck; do not treat cache latency as
  end-to-end resolution-switch latency or as production UX sign-off.
- Final live API process for this pass: **42228**, port 5001. Temporary
  candidates were stopped after verification. API and frontend return 200.
  Reports/logs: `.atlas-runtime/grid-cache-final-20260905` and
  `.atlas-runtime/grid-cache-live-20260905` in the PyPSA EUr checkout.

## Atomic country and component loading — 2026-09-05

- Country additions, resolution switches and electricity component-layer
  loads now stage read-only responses with three concurrent requests (hard cap
  four) and publish one combined map. The previous nodes, lines, boundaries,
  country order, active country and resolution remain visible until success.
- Failure, explicit cancellation and per-request deadlines release the UI
  without publishing a partial map. Abort-insensitive late responses cannot
  overwrite a later successful update. Conflicting agent country/layer changes
  are rejected while a transaction is running.
- Lazy Supply/Demand/Storage loading uses the same path. It preserves other
  loaded domains and grid capacity, merges against committed membership after
  compound agent geography changes, and deduplicates repeated boundaries.
  Loading/cancellation/error feedback is exposed to assistive technology.
- Ten real-App integration tests (only network transport and map rendering
  mocked) cover out-of-order parallel responses, atomic geometry publication,
  country order/active selection, failure/retry, cancellation/late replies,
  capacity and provisional-demand metadata, visible domains at new resolutions,
  agent replace/add/compound plans, and conflicting manual/agent operations.
  Assembly/deadline tests cover scope isolation and rejection of stale sources.
- Live browser, 34 countries: bidding zones to NUTS3 took **1.195 seconds**
  from click to observed completion, with only two sampled states: the old
  53/110/7 bus/AC/DC counts while busy, then 957/1,507/8 after success.
  Active country XK and the complete country order were unchanged. Visual
  inspection confirmed the NUTS3 nodes and lines across Europe.
- NUTS3 to Full/Nodal took **1.584 seconds**, also without an intermediate
  mixed level: 6,557 buses, 8,576 AC lines and 77 DC links. Nodes and total
  connections match the independently verified 34 full-country source reports.
  These warm-cache observations on this workstation are not laptop benchmarks.
- Live all-country bidding-zone Supply completed with 339 components and
  retained the 53 buses / 110 AC lines / 7 DC links. Completion was observed
  within 44 seconds (not an exact latency measurement); cold component loading
  remains a performance target. Storage cancellation was then verified on the
  unchanged final build: Grid and Supply stayed selected, Storage stayed
  unloaded and country controls unlocked with no error.
- Final frontend: **144 tests passed** across 15 suites. Production build
  succeeds: 350.06 kB gzip JavaScript and 19.31 kB CSS. Frontend and combined
  API readiness return HTTP 200. No backend implementation changed in this pass.

## Component caching, data coverage and compact controls — 2026-09-05

- Extended exact-response caching to Supply, Storage, Demand and combined scopes.
  Plant-inventory content/archive path, bus weights, ETM catalogue, demand
  scenario/year/annual total and loaded parser code participate in invalidation.
  In-memory plant/weight/composition caches detect same-size/same-timestamp
  content changes; weights are bounded to 64 files and shared ETM catalogues to
  four versions. Partial/error responses are not persisted.
- A separate candidate passed **816 byte-for-byte comparisons** against the old
  independently running API: 34 countries × six resolutions × four map layers.
  This proves response preservation, not source-data completeness. Median
  repeat response was 117 ms, maximum 349 ms on this workstation.
- The new live process passed all **816 initial and repeated persistent hits**
  after restart; every response hash still matches the independent baseline.
  Median repeat was 105 ms, maximum 701 ms (browser checks overlapped part of
  the run). The fresh server log contains no PyPSA imports during these hits.
  API working set after the checks was about 164 MiB, not browser RAM usage.
  Combined cache directory: 1,224 entries / 14.49 MiB, including old versions,
  within the 1,536-entry / 256-MiB limits.
- Supply responses total 19,105,013 decoded bytes versus 3,142,679 wire bytes;
  Storage 8,838,294 versus 2,180,925. Existing gzip support requires no browser
  Parquet library. The preloader now accepts scopes and demand settings and
  reports inventory availability/reasons separately from cache success.
- **Data gap at this checkpoint (resolved by the demand pass below):** 203 of 204 catalogue Demand entries had no staged
  weights. Only Spain Full/Nodal currently has them. Spanish numeric cluster
  caches have weights too, but are outside the current geographic-resolution
  catalogue. The existing demand builder predates the geographic caches and
  targets `base_COUNTRY*.nc` only. This must be extended and validated; missing
  demand is not zero demand and no new demand estimates were fabricated here.
- Component availability now travels with the committed country/resolution.
  The layer toolbar distinguishes `No data` and partial coverage. A compact
  disclosure identifies affected countries and source reasons. HTTP-200
  inventory failures preserve the previous map instead of silently publishing
  an incomplete replacement. Real-App integration tests cover both cases.
- Live browser: all-country bidding-zone Demand finished in 1.018 s and
  correctly reported missing weights for 34/34 countries. Storage finished in
  1.900 s with 135 components, retaining 53 buses / 110 AC / 7 DC. Switching
  Grid + Storage to NUTS3 completed in 3.182 s atomically: 957 / 1,507 / 8.
  Adding NUTS3 Supply completed in 2.172 s with 4,015 components, grid unchanged.
  Source inventory has no matching XK plants, so Supply/Storage are correctly
  marked partial. Timings are click-to-observed-completion samples on this
  machine, not constrained-laptop or cold-deployment benchmarks.
- Large country selections now use a six-country preview that always includes
  the active country, with a searchable bounded-height management list. Search
  by name/code never changes map membership. Keyboard Escape clears then
  collapses and restores focus. Component and real-browser checks cover this.
- Camera commands, map buttons and automatic framing honour reduced-motion
  preferences without remounting the map. Tests cover runtime preference
  changes and retain all existing Paris one-shot/manual-camera regressions.
- Visual QA caught red count badges obscuring the Europe overview. Counts are
  now shown only at close zoom or on selection, in a neutral style; all grouped
  component details remain available. Hidden counts share cached icons. A
  production-component test verifies visibility at zoom 4 → 10 → 4 without
  changing the underlying group count. Final live NUTS3 view retains Grid,
  Storage and Supply with a single collapsed coverage notice.
- Final frontend: **154 tests / 16 suites passed**; production build succeeds at
  351.53 kB gzip JS and 19.31 kB CSS. Backend/runtime/land/voice/cache tests:
  **152 passed**. Existing test-library deprecation warnings remain.
- Live API PID **32796**, port 5001; frontend PID 67720, port 3000. Both return
  200, as do all seven service-status endpoints. Voice client-secret preflight
  permits localhost (200) and rejects an untrusted origin (403); this does not
  claim real microphone verification. Temporary candidate PID 61008 was stopped.
  Reports/logs: `.atlas-runtime/component-cache-candidate-20260905` and
  `.atlas-runtime/component-cache-live-20260905` in the PyPSA EUr checkout.

## Geographic demand staging and candidate validation — 2026-09-05

- Extended the existing offline demand builder to all 34 countries and all six
  geographic/nodal resolutions: **204 validated outputs**. Physical raw-to-
  simplified bus mappings and persisted geographic membership are composed;
  geographic caches do not use a nearest-centroid substitute. Source networks
  and polygons are unchanged. Derived files are replaced atomically per file,
  with previous content backed up and source/output hashes in each manifest.
- Demand remains an explicit **100 GWh per country per year placeholder**, split
  spatially and divided over 8,760 hours. It is not measured bus demand or a
  time-varying hourly profile. Independent CSV checks verified every country's
  weights, annual energy, average power and eligible-source-bus conservation.
- JRC raster coverage is EU-only. The builder reuses PyPSA-Eur's existing
  distribution functions: JRC in supported EU countries, DESNZ local-authority
  consumption for Great Britain (10 buses use the existing public-NUTS3
  fallback), and public NUTS3 GDP/population weights elsewhere. It does not
  mistake a few valid border pixels for full non-EU coverage or invoke Nohm's
  proprietary demand tooling. One tiny Norway projection-induced polygon
  defect was repaired with a strict relative-area guard and recorded in the
  manifest; original geometry was not rewritten.
- ETM sector/subsector shares use only the existing DEMAND OUTPUT catalogue.
  AL, BA, ME, MK and XK have no matching composition; totals remain available
  and the UI explicitly identifies the missing breakdown. Another country's
  shares are never substituted. Provisional source/flat-profile information is
  available in the map coverage disclosure.
- Candidate API **port 5002, PID 28428** passed all **204 Demand responses**,
  including compact shared sector templates and country/sector/subsector
  conservation. All were initial and repeated persistent-cache hits in the
  final audit: median 106.5 ms, maximum 681 ms on this machine. Total decoded
  response bytes were 18,230,539 versus 3,108,593 gzip wire bytes.
- The candidate also passed all **612 Grid/Supply/Storage entries**. Every
  response SHA-256 equals the independently captured previous live baseline;
  no grid, supply or storage payload changed. Median repeated response was
  125.1 ms, maximum 1.2587 s during concurrent validation.
- Reports: `.atlas-runtime/demand-build-all.json` and
  `.atlas-runtime/demand-candidate-20260905-default-env/` (final
  `demand-validated-all.json`, `unchanged-scopes.json`). The earlier
  `demand-scopes.json` checker did not understand compact templates and is
  superseded, not a current data-failure result.
- Full frontend: **155 tests / 16 suites passed**, production build 352.15 kB
  gzip JS and 19.31 kB CSS. Combined backend checks: **188 passed / 1 skipped**;
  all 25 builder tests pass in the isolated build environment (including the
  raster test skipped by the API environment). After adding compact-template
  validation, all 14 preloader tests passed separately. These are not a
  clean-machine dependency or constrained-laptop certification.
- **Deployment pending:** the command to replace live API PID 32796 on port
  5001 was rejected by execution policy before running. The original API is
  still up; it has not loaded the candidate's strict weight validation and
  corrected non-EU source-label code. The candidate remains on port 5002.
  Restart through the normal Atlas backend launcher is required before
  claiming the current backend changes are live. No policy workaround was used.

## Paris zoom follow-up — 2026-09-05

- Re-tested the exact `zoom into Paris` command in the live browser with all
  34 NUTS3 networks loaded. From the Europe overview it settled at zoom 10,
  centered on Paris, with no continuing animation. Manual zoom-out to level 9
  stayed at 9 after Supply and node-visibility changes; the completed city
  command did not replay. The test did not change the country selection.
- Existing camera protection claims each command before synchronous Leaflet
  events, stops any previous animation, and acknowledges/clears the matching
  parent request. Explicit navigation also consumes pending automatic fitting
  for the same geography, so delayed layer loads cannot undo it.
- Re-ran camera, viewport-command, telemetry, agent-command and real-App batch
  regressions: **95 tests passed across five suites**. This includes repeated
  renders, Strict Mode, map remounts, relative zoom, late data and manual
  navigation. It is not a real microphone/voice-session test.

## Laptop layout, settings accessibility and demand inspection — 2026-09-05

- Replaced the settings overlay with a native modal dialog. Previously focus
  remained on the obscured More Settings trigger. Opening now focuses Close;
  background map/assistant controls are inert, Escape closes the panel, and
  focus returns to its opener. Ordinary Tab/Shift-Tab navigation was checked
  in the browser. Native browser chrome remains reachable; no custom global
  keyboard trap was introduced. All 40 model switches now expose their names
  and checked states. Tests confirm edits survive closing/reopening without
  submitting a build and cover Strict Mode, re-rendering and cancellation.
- Browser viewport tests at **1366×768** and **1000×600** verified bounded
  dialog dimensions, no horizontal page overflow, independently scrolling
  content and visible Close/Build actions. The original viewport was restored.
  This is layout evidence, not a CPU/memory-constrained hardware benchmark.
- Reserved space for Land/Access beside the map-layer toolbar and carrier
  legend. On narrower screens node/boundary display controls use labelled
  icon buttons; the toolbar wraps and keeps these two controls grouped instead
  of hiding controls behind horizontal overflow. Expanded and collapsed carrier
  legends reserve separate space. Source carrier selections were not changed.
- Live France NUTS3 Demand loaded **93 markers**. Demand-only marker diameters
  varied from 6 to 11 px at the observed zoom. Node inspection showed annual
  GWh, average MW, spatial share and the four ETM sector breakdowns. These are
  still provisional estimates, not measured consumption; the popup now states
  that explicitly as well as the map coverage disclosure.
- Asset and grid-access popups now reserve the header/toolbar band and scroll
  tall content. Browser QA found and fixed an additional lifecycle issue:
  Leaflet's popup auto-pan changed point-culling bounds, rebuilt its owning
  marker and closed the popup. Point-culling bounds alone remain stable while
  inspecting a popup; camera/land telemetry and explicit data changes remain
  live. Closing releases the bounds, while drag, zoom, resize and new AI camera
  commands dismiss the popup. Tests cover release/culling and navigation.
- On the final live build at **1000×600**, a demand popup remained open after
  the pan settled at y=190..540, below the toolbar at y=173. Scrolling reached
  Residential/Tertiary/Industry/Transport details without zooming or closing
  it; manual zoom then dismissed it. Example FRK26: 3.196 GWh/year and 0.365 MW
  average, with the provisional/flat-profile notice. Tests retain all Paris
  one-shot camera regressions.
- Final frontend: **165 tests / 17 suites passed**; production build succeeds,
  **352.99 kB gzip JS / 19.53 kB CSS**. Logs:
  `.atlas-runtime/modal-layout-tests-20260905.log` and
  `.atlas-runtime/modal-layout-build-20260905.log`. No backend code changed in
  this pass; frontend 3000 and live/candidate API readiness (5001/5002) returned
  200. The candidate deployment restriction described above is unchanged.
- The short-screen EMIL/carrier overlap observed in this pass was addressed
  in the subsequent panel-coordination pass below. Asset-popup framing beside
  the left sidebar and expanded side panels still needs broader edge/corner
  and reduced-motion testing before sign-off.

## Right-side control coordination and minimized voice — 2026-09-05

- EMIL, carrier, Land and Grid Access controls now share one expanded panel
  slot. Selecting another control minimizes the previous panel without
  disabling its data, changing filters, clearing the assistant draft or
  stopping the independently owned voice session. Saved Land/Access overlays
  restore enabled data and filter settings but do not reopen overlapping panels.
- Live voice opens EMIL at session start; subsequent partial/final transcripts
  no longer reopen it after the user minimizes it or selects another control.
  The minimized launcher reports the actual state (including processing,
  speaking, fallback and errors) and provides a separate Stop live voice button.
  Hook/component tests cover microphone continuity and explicit stop. No real
  microphone audio was captured; this is not a real-device voice certification.
- Real-App integration regressions verify panel transitions preserve countries,
  nodes, lines, region geometry, domain/carrier selections, overlay filters and
  the assistant draft without extra network parses or new camera commands.
  Initial-country camera commands are explicitly acknowledged by the map mock.
- Live browser checks at **1000×600** verified EMIL → Access → Land → EMIL →
  carrier legend → EMIL, with Land/Access still enabled and the draft retained.
  France NUTS3 electricity contained 93 buses / 181 AC lines; the selected
  methane/water overlay loaded 4,617 assets / 1,834 links. No page-width overflow
  was observed. Expanded carrier, Land and Access controls did not overlap EMIL.
- Browser QA also caught EMIL covering the Access trigger. The assistant now
  leaves the utility-button band above it and the camera strip beside it.
  At 1000×600 the assistant occupies x=560..930, y=180..584. Land/Access triggers
  and camera buttons remain reachable. Settings/messages scroll independently;
  control panels leave a bottom band for minimized voice controls. At 1366×768
  the assistant is 370×500 and all six Land/Access/camera triggers passed DOM
  hit-target checks. The original viewport was restored after testing.
- The exact **"zoom into Paris"** command settled at tile zoom 10. Across panel,
  land and carrier switches it remained at 10. Manual zoom out then stayed at
  9 with Supply loaded (280 components), including subsequent panel switches
  and viewport checks. No repeated camera movement was observed.
- Final frontend: **175 tests / 18 suites passed**; production build succeeded,
  **353.48 kB gzip JS / 19.62 kB CSS**. Evidence:
  `.atlas-runtime/panel-all-tests-20260905.log` and
  `.atlas-runtime/panel-build-20260905.log`. Frontend 3000 and live/candidate
  API readiness (5001/5002) returned 200. This pass made no backend changes;
  the earlier candidate deployment restriction remains unchanged.

## Complete overlay links and cancellable drawing — 2026-09-05

- Found an accuracy/performance trade-off that was not acceptable for network
  inspection: overlay mode sampled whole links (520 at overview zoom), which
  could drop bridges and make an intact grid look disconnected. A production-map
  regression reproduced the missing routes. Link sampling has been removed;
  every drawable viewport-intersecting link is retained. Point-marker overview
  thinning remains explicit and does not remove its connecting lines.
- Leaflet's existing canvas clipping and screen-pixel route simplification now
  handle drawing detail (2 px at overview, decreasing to 0.5 px when close).
  Source coordinates, endpoints, capacities and the stored networks are not
  rewritten. Tests cover all 820 mixed-carrier routes across zooms, viewport
  crossings with off-screen endpoints, source loops, missing endpoints and
  coincident geometry, plus route simplification without source mutation.
- The legend distinguishes **Hidden / cached**, **Loading** and **Loaded**.
  Loaded-record counts no longer claim every record is currently shown.
  The map reports actual rendered links and routes that cannot be drawn.
  Valid routed loops are retained even when endpoint IDs match; zero-length
  source records remain explicitly unmapped instead of gaining invented lines.
- Browser: Spain + Belgium Full/Nodal with Power, Methane and Water loaded
  4,336 assets / 3,195 source links, rendering 3,158 routes at overview zoom.
  The 37 unmapped records were consistent with source-coordinate inspection:
  27 coincident Spanish water routes and 10 degenerate methane routes. Two
  non-degenerate methane loops previously hidden by the self-link filter were
  restored. Removing methane and water retained all 1,353 electricity links,
  with no camera jump or empty map.
- Browser: `show me all countries at full nodal level with grid` loaded all
  34 countries and 8,653 electricity links. With methane and water selected,
  totals were **34,375 assets / 31,041 links**. Before batching, enabling water
  triggered a 9.4-second browser-input timeout; a subsequent snapshot confirmed
  the page recovered and displayed 30,922 viewport routes. This was a real
  responsiveness failure, not a server-offline or lost-network diagnosis.
- Replaced synchronous construction of the network line layer with cancellable
  animation-frame batches (up to 200 routes / 7 ms before yielding; one unusually
  expensive feature can exceed that budget). Two fixed panes bound canvas/DOM
  ownership. A hidden replacement line layer is prepared while the previous
  complete line layer stays visible, then swapped when complete. Superseded
  work and unmounts release pending frames, groups and renderers. Drawing
  failures retain the previous line layer and report failure; the loading
  indicator no longer calls the map ready while links are being constructed.
- After batching, adding power to the already loaded European methane/water
  view returned the browser click in 1,265 ms; opening EMIL and typing took a
  further 1,326 ms while **Drawing network** remained visible. Two subsequent
  zoom inputs completed in 1,026 ms and replaced pending drawing work. The
  typed draft remained intact. These are browser-tool round-trip samples,
  not isolated frontend timings or performance-budget guarantees.
- Once the rapid-zoom view settled, 30,465 links were rendered, with one
  visible network canvas and an empty hidden buffer pane. Counts depend on
  viewport clipping; off-screen source links remain loaded. The original
  browser size was restored and the test draft cleared. No microphone was used.
  Final 1551×920 check: 34 countries, 30,933 rendered viewport links, no drawing
  error or page-width overflow, and one visible canvas / one empty hidden pane.
- Removed an effect-driven copy of facility props that briefly resolved new
  connections against stale endpoints and decoded routes twice. A regression
  verifies new links and endpoint nodes use the same incoming dataset render.
  Source identity also refreshes line hover/click bindings when metadata changes
  without changing geometry. Automated tests cover batches, cancellation,
  completion, errors, fixed-pane bounds, Strict Mode and resource release.
- Final frontend: **190 tests / 20 suites passed**, production build succeeded:
  **354.79 kB gzip JS / 19.62 kB CSS**. Logs:
  `.atlas-runtime/batched-all-tests-20260905.log` and
  `.atlas-runtime/batched-build-20260905.log`. Frontend 3000 and live/candidate
  API readiness 5001/5002 returned 200. No backend or source dataset changed.
- This machine reports **32 logical processors / 127.9 GiB RAM**. These checks
  explicitly do not establish the 8-GB/four-core laptop target. Further work
  includes initial geometry-processing latency, production-bundle constrained
  profiling, multi-layer node/line/boundary presentation during render staging,
  and actual hover/click/agent verification after a large redraw completes.

## Coordinated frames, subpath build and model authority — 2026-09-05

- Nodes, generation-mix features, geographic overlays and country outlines now
  retain the last committed frame while replacement lines are being drawn.
  They publish with the completed line frame rather than showing new nodes
  against old lines. A source identity token prevents an equal-geometry/count
  replacement from inheriting an earlier completion. Direct visibility toggles
  still work; an empty line selection commits immediately. Only one previous
  companion frame is retained. Initial Canvas/GeoJSON/add-to-map errors also
  preserve the prior graph and report the failure.
- Tests deliberately delay, supersede and fail drawing, including replacements
  with identical line geometry but different nodes/metadata. They verify that
  only the latest completion publishes matching node and polygon features.
  Existing cancellation, fixed-pane lifecycle, popup and camera tests pass.
- Real browser, France, Grid selected, carrier overlay off: NUTS2 displayed
  **21 buses / 42 AC lines**, NUTS3 **93 / 181**, Full/Nodal **1,204 / 1,860**
  plus **4 DC links**. Screenshots confirmed changed nodes, zone boundaries and
  lines. Each settled view retained one visible line Canvas and one empty hidden
  pane, no horizontal overflow. This is a focused browser check, not the full
  Europe/domain/voice matrix or a low-spec hardware benchmark.
- Fixed the root-relative `europe.geojson` and `nodal_coordinates.csv` fetches:
  they now honour `PUBLIC_URL`, independently of the API proxy prefix. Added a
  loopback-only compiled-bundle preview and HTTP tests. All **9 preview tests**
  pass, including actual compiled `/atlas/` entrypoints/country data, gzip
  forwarding, encoded API paths, foreign-origin rejection and JSON errors for
  missing assets or an unavailable API. The requested candidate API launch on
  5003 was denied by environment policy; it was not retried through another
  mechanism. No end-to-end preview-browser/API verification is claimed. The
  running 3000/5001/5002 services were not stopped or replaced.
- A real compound prompt exposed an important agent defect:
  `Show me France at NUTS3 with grid only, turn off the carrier overlay.`
  The interpreter returned HTTP 200, `provider: fallback`, no actions and zero
  confidence. The old browser fallback then applied the wrong clause's
  negation to Grid, left overlay mode enabled, and claimed success. Current
  live API logs in `.atlas-runtime/component-cache-live-20260905/err.log`
  identify provider **401 authentication failures**; OpenAI is configured with
  a placeholder in that running process. No credential values were changed.
- Removed the browser's natural-language fast path, local plan overrides and
  485-line legacy fallback chain. All speech/text instructions now require a
  model plan; manual structured controls remain direct. Unavailable or unclear
  planning leaves the map unchanged with an explicit message. Planning has a
  45-second client timeout; low-confidence clarification questions are retained
  without guessing an action. Tests cover mixed-clause plans, unavailable
  providers, timeout/retry, fresh context and the existing multi-country flows.
- Real browser re-test with the failed compound prompt preserved **Full/Nodal,
  1,204 Grid assets, Grid selected and overlay off**, and showed the honest
  reasoning-unavailable reply. Valid model-plan execution is covered with an
  injected planner response, **not** by a successful live model call. This gate
  needs a valid Nohm provider credential and a normal launcher restart.
- Final frontend **207 tests / 22 suites passed**; root and subpath production
  builds passed. Root bundle **345.91 kB gzip JS / 19.64 kB CSS** (about 9 kB JS
  smaller than the previous pass); `/atlas/` build **345.92 kB / 19.64 kB**.
  Evidence: `.atlas-runtime/coordinated-model-final-tests-20260905.log`,
  `coordinated-model-build-20260905.log`,
  `production-subpath-build-final-20260905.log`, and
  `production-subpath-http-tests-20260905.log`. No backend, source dataset or
  AI Architecture/Nohm repository file was changed in this pass.

## Camera and rendering verification — 2026-09-05

- Paris camera regressions pass: commands are claimed before synchronous Leaflet
  events, acknowledged out of parent state, and not replayed by 30 filter/data
  rerenders, Strict Mode, or a map remount. Manual zoom remains in control and
  pending automatic country fits do not override explicit place navigation.
- Browser resize/layer stress testing exposed an actual Leaflet 1.9 Canvas
  orphan-animation-frame crash (`clearRect` after renderer removal). A scoped
  `atlasCanvas.js` subclass cancels queued frames before synchronous redraw and
  safely ignores callbacks delivered after removal; no global Leaflet patch.
  It is used by batched lines, default vectors and four custom vector panes.
  Those panes remain mounted when their filters are off, so re-enabling a layer
  cannot leave its renderer attached to a detached pane. Real installed-Leaflet
  tests reproduce the original failure and verify the fix.
- After the final renderer wiring, three browser cycles each combined overlay
  and boundary off/on changes, zoom in/out and 1000×600/1366×768 resizing.
  No runtime-error overlay or horizontal overflow was observed. The temporary
  viewport override was reset, test-added Belgium/Spain removed, and France
  NUTS3 restored (93 buses / 181 AC lines). Final screenshot showed the network
  ready with nodes, links and boundaries present.
- The live `Zoom into Paris` request reported reasoning-service unavailability,
  left the map unchanged at tile zoom 5 and released the assistant controls.
  This verifies safe failure, not successful live AI or voice navigation.
  The provider-credential/normal-launcher gate above remains unresolved.
- Capacity styling now has separate MVA/MW scales with inverse-log midpoint
  labels. France Full/Nodal displayed MVA 503/948/1787 (1860 rated links) and
  MW 1000/1414/2000 (4 links). Uniform values and zero operating limits have
  regression coverage. Cached immutable geometry/feature fingerprints avoid
  repeatedly serializing routes during camera/style updates, including changed
  generation composition at unchanged totals. The synthetic key benchmark is
  not a constrained-device or end-to-end browser performance qualification.
- Final source verification: **224 tests / 26 suites passed**, production root
  build compiled successfully, **347.07 kB gzip JS / 19.64 kB CSS**
  (`main.75bb54d5.js`). Subpath production builds and live-provider tests were
  not repeated in this final pass. No backend process, credentials or source
  datasets were changed.

## Cold-route preparation and fitting pass — 2026-09-05

- Source geometry validation now accumulates bounds in one pass and reuses valid
  immutable coordinate arrays. Sanitization allocates only for malformed or
  string-valued points. Frozen-source Leaflet construction/edit tests and 150
  mixed-coordinate cases verify no source mutation or geometry loss.
- Display keys no longer serialize long routes on first load: immutable route
  snapshots have weak identities. Replacing a route still invalidates the layer;
  points and two-endpoint lines retain cheap content keys. Node-priority ranking
  is computed once per dataset, not for every viewport. Normalized node IDs no
  longer get their connection degree double-counted.
- Reproducible read-only benchmark:
  `node --expose-gc scripts/benchmark-route-preparation.mjs --local --countries=BE,ES,FR`.
  These complete country-scoped Grid responses contained 1,169 gas routes and
  2,503 water routes. Geometry/endpoint/bounds equality with the old copying
  algorithm passed. Seven-sample median geometry preparation: gas 3.12 → 0.91 ms,
  water 3.65 → 1.56 ms; 12,556 valid vertex pairs reused without copying.
  Cold key time was 1.94 → 1.67 ms for gas, but 3.34 → 4.39 ms for the mostly
  short water routes; do not claim every phase improves on every dataset.
  The all-Europe water API response is explicitly a sampled overview, not the
  full country caches. The script records that distinction.
- The 750,000-vertex synthetic case preserved identical routes and reduced
  median geometry preparation 287.00 → 21.49 ms, cold key generation 265.09 →
  2.15 ms. These are single-process algorithm measurements, excluding HTTP/JSON
  parsing, React and Leaflet drawing—not an end-to-end or low-spec guarantee.
- Browser testing found that French overseas water assets made the Fit button
  frame much of the world. Default country-selected framing now prefers the
  European footprint; Shift-click or Shift+Enter on Fit explicitly includes all
  assets. This is camera-only: overseas assets remain loaded and drawable.
  Real three-country/three-carrier view verified zoom 5 for Europe and zoom 3
  for all assets, 10,136 loaded assets / 6,889 links / 43 unmapped. Hiding gas and
  water retained electricity with all 3,217 links rendered, no runtime overlay.
- Land enabled successfully: 35 loaded 256-pixel tiles all carried country scope
  BE,ES,FR. Grid Access reported the same selection, ES/FR coverage, 248 mapped /
  946 published / 698 unlocated records and no service error. This is a focused
  browser regression check, not independent verification of source accuracy.
- Removed the unused random-duration `runFakeSolve` path and its state, plus a
  redundant map debug-log effect. Browser title/manifest now use Nohm Flow · Atlas.
- Final source suite: **236 tests / 28 suites pass**. Root and `/atlas/` production
  builds compile: **347.07 / 347.08 kB gzip JS**, **19.64 kB CSS**. Root bundle
  `main.6f23c8a3.js`, subpath `main.40e07cac.js`. All **9 preview HTTP tests** pass,
  including actual compiled subpath assets. No production-browser deployment,
  backend restart, credentials or source datasets were changed.
- Provider diagnostic correction: the operator clarified there is no active
  Nohm login/credential system. The reported failures are **model-provider API
  authentication**, not end-user login. Read-only inspection shows Atlas
  `app.py` still creates direct OpenAI/DeepSeek clients, whereas AI Architecture
  `src/ai/config/platform_llm.py` governs text calls through OpenRouter and
  `src/ai/llm_calls/llm_client.py` is its caller-facing shared client. Current
  Atlas logs still contain provider 401/invalid-key failures (checked without
  exposing key values). Next step is aligning Atlas with that existing shared
  model connection; a new standalone OpenAI key should not be the default ask.
  Nohm provider-key validity and live voice modalities have not yet been tested.

## Shared Nohm AI and speech connection — 2026-09-05

- Confirmed the reported authentication failure was not a Nohm login problem.
  Nohm's shared OpenRouter client passed a real text completion. Its separate
  OpenAI speech configuration also passed the configured Realtime model-access
  check. Atlas's implicit legacy `.env` had a different speech key; only the
  presence/equality result was inspected, never the value printed or copied.
- Added the small backend `atlas_text_ai.py` adapter. Planner, place resolver
  and judge now call Nohm's `llm_chat`, retaining its model/runtime governance
  and existing secret resolver. Removed their direct OpenAI/DeepSeek provider
  loops and unused direct OpenAI client. Legacy analyst endpoints are outside
  this migration. The launcher accepts explicit `NOHM_PLATFORM_ROOT`, validates
  the checkout and refuses an already imported unrelated `src` package.
- Standalone speech initialization now uses Nohm's existing secret helper
  before implicit Atlas dotenv defaults. Explicit deployment environment/file
  settings remain authoritative. No credentials, Nohm source files or login
  controls were changed. The live server was left untouched during source tests;
  the operator-authorized activation is recorded below.
- Model responses are bounded JSON objects, with duplicate fields, non-finite
  values, malformed content and overlarge responses rejected. Provider errors
  are redacted. An invalid judge response no longer defaults to `pass`, and
  explicit zero/low confidence is no longer promoted into execution authority.
  Frontend response validation treats the new unavailable/error response as an
  outage rather than an unclear user instruction. There is no keyword fallback.
- Six real shared-model prompt probes returned supported plans: Paris framing,
  Europe at bidding-zone level, NUTS3 refinement, removing Supply, the combined
  Iberia/Baltics/Balkans NUTS1 Grid+Supply request, and Spanish-language Madrid
  framing. Planner latency was 2.98–7.74 s. A real judge call passed a supplied
  Paris before/after fixture. These checks used production functions/routes
  through a non-listening Flask test client, not real rendered map updates.
  A separate full production `app.py` import and actual route call also returned
  the correct NUTS3 plan through Nohm.
- The updated actual voice endpoint returned HTTP 200 and a future-expiring
  Realtime credential in 2.25 s, with `Cache-Control: no-store`; its value was
  neither printed nor saved. This verifies token creation, **not** a browser
  WebRTC connection or microphone capture.
- A synthetic audio round trip passed through the actual endpoints: Nohm's
  Kokoro TTS (2.12 s, 169,244-byte WAV) → OpenAI upload transcription (2.78 s)
  → shared Nohm planner (11.22 s). The transcript was “Show Spain at NUTS3 with
  grid and supply.” The returned plan selected Spain, NUTS3, Grid and Supply.
  Audio stayed in memory; no user microphone or playback was used. This is not
  a substitute for noisy real-time microphone/conversation testing.
- Voice provider-error bodies no longer reach browser responses/log messages;
  malformed successful responses return a controlled error. All voice responses
  are no-store, and status explicitly describes configuration, not provider
  verification. Removed the unused idle-browser voice status request: it was
  not displayed/consumed and Nohm does not expose that same combined endpoint.
  Actual user-started handshakes remain the connection-state authority.
- Validation: **94 focused Python tests passed** across text transport, actual
  map route functions, runtime config and voice; changed Python modules compile.
  **252 frontend tests / 29 suites passed**. Root production build compiled:
  **347.03 kB gzip JS / 19.64 kB CSS**, `main.e2c18819.js`.
  Final `/atlas/` build also compiled, **347.04 kB gzip JS**, `main.0a3f8948.js`;
  all **9 preview HTTP tests** passed against those compiled subpath assets.
  Browser regression retained France/NUTS3, Network ready and no runtime error
  overlay; one Zoom In settled at tile level 7 and Zoom Out restored level 6.
  Manual controls were checked against the existing server, not the new backend.
- The operator then explicitly requested that Codex perform the restart. The
  verified old Atlas process (32796, port 5001, stable launcher) was stopped and
  the same normal launcher started hidden with `NOHM_PLATFORM_ROOT` configured.
  New process **33920** owns port 5001 and all eight service groups report ready.
  Frontend and unrelated Nohm processes were not stopped. Logs are retained at
  `.atlas-runtime/nohm-shared-live-20260905-161044/`.
- Live HTTP Realtime token creation on the new server returned 200, a future
  expiry and `no-store` without exposing the token. A real browser command,
  “Show France at NUTS3 with grid”, loaded 93 buses / 181 AC lines, selected only
  Grid and received a successful Nohm judge response. The development bundle
  refresh had cleared in-memory map selection; this command restored it.
- Live browser follow-up “Zoom into Paris” framed Paris at tile zoom 9 and
  settled. “Add supply to the view” retained Grid, added Supply and kept zoom 9;
  “Remove supply from the view” left only Grid and still kept zoom 9. Each
  request completed with a real judge response. Network ready remained visible,
  and the new server log showed eight successful OpenRouter completions, no
  provider-authentication failures and no traceback. Final browser state:
  France/NUTS3, Grid only, Paris view, EMIL open in Conversation mode, mic off.
- A specific host integration gap remains: Nohm's current shared voice routes
  force English for normal Realtime and upload transcription, whereas standalone
  Atlas leaves language unspecified unless configured. Reconcile/test that host
  contract before claiming integrated multilingual voice readiness. Nohm auth,
  workspace and real microphone/browser integration remain unverified.

## Compact workspace layout — 2026-09-05

- Browser inspection reproduced overlapping map-layer buttons, country controls
  and utility buttons at 365 × 920. Narrow layouts now start with domains
  collapsed. Below 1024 px, opening domains closes other expanded controls;
  opening EMIL, carriers, Land or Access collapses domains. These are panel-only
  changes: loaded data, layer visibility, filters and voice ownership are not
  changed. Widening the window never automatically reopens domains.
- Compact layer controls sit below the Domains launcher, with room reserved for
  the map utility rail. They are hidden while another compact panel is expanded,
  rather than rendered under or over it. Domain controls temporarily hide the
  utility rail so it cannot obscure the country selector or Build button. The
  compact header keeps the carrier selector readable without clipping branding.
- Added breakpoint lifecycle/coordinator tests and an actual App integration
  test: opening/closing panels preserves an unsent assistant draft, graph
  geometry and camera acknowledgement, and issues no additional parse requests.
  **260 frontend tests / 30 suites passed**. Root production build compiled:
  **347.35 kB gzip JS / 19.67 kB CSS**, `main.e37d4303.js`. `/atlas/` build
  compiled: **347.36 kB gzip JS**, `main.fb8f52c7.js`. All **9 preview HTTP tests**
  passed, including the actual compiled subpath bundle check.
- Live browser checks: 365 × 920 domain controls no longer have layer or utility
  buttons on top; opening EMIL collapses domains and hides the competing toolbar.
  At 1000 × 600, EMIL remains within the viewport (top 180, bottom 584) with its
  input reachable (top 528, bottom 570), and no horizontal page overflow.
- At 1280 × 800, France/NUTS3 Demand loaded 93 visible demand assets alongside
  Grid (93 buses / 181 AC lines), without changing tile zoom 6. Its disclosure
  correctly states provisional 100 GWh/country/year, a flat 8,760-hour profile,
  national ETM shares and JRC Energy Atlas 2019 spatial weights. No runtime error
  iframe appeared. This verifies loading/markers/disclosure, not the individual
  tooltip values or the five countries without sector composition.
- Browser viewport override was removed after testing; France/NUTS3 was left
  Grid-only, panels collapsed, mic off. No backend or Nohm configuration changed.
  Real hardware profiling and live microphone checks remain outstanding.

## Europe-wide agent workflows and cancellable progress — 2026-09-05

- Live EMIL command “Show me Europe at bidding zone level with grid only” loaded
  all 34 supported countries, with 53 buses / 110 AC lines / 7 DC links. Browser
  country options, layer state and rendered topology were inspected independently
  of the judge's success message. Cached grid endpoint checks returned Italy 7
  named buses, Sweden 4 and Norway 5. GB has two geographic zone labels but four
  AC/DC/subnetwork buses; bus counts must not be presented as a count of zones.
- Follow-up “Increase to NUTS3. Keep all countries and grid only” retained all 34
  countries and switched visible geometry to 957 buses / 1,507 AC lines / 8 DC
  links. The Europe frame remained at tile zoom 4. Both live commands completed
  with the shared Nohm planner and judge; this is not an offline mocked test.
- Found and fixed misleading loading UX: the footer previously reported ready
  while staging a new network, and cancellation was available only in domains.
  Staging now reports completed/total country-domain datasets in the sidebar and
  EMIL, updates the map footer, and offers cancellation in EMIL and the footer.
  The loader still publishes one complete map; progress never publishes partial
  geometry. Failed, aborted and late responses cannot advance progress.
- A user cancellation now also stops the remaining actions/corrections in that
  EMIL instruction, avoiding a judge repair that could restart the cancelled
  operation. This does not undo previously committed operations or clear the
  independent voice queue. Cancellation is not reported as a successful repair.
- Live cancellation of “Show all countries at NUTS2 with grid and supply” using
  the EMIL button retained France/NUTS3, Grid only, no lingering cancel buttons,
  and displayed an explicit cancellation acknowledgement. Automated App tests
  also cover cancellation midway through a judge correction, later actions,
  late responses, progress cleanup and unlocking the controls.
- A subsequent live compound request for Iberia + Baltics + Balkans at NUTS1
  with Grid/Supply loaded 16 countries (AL, BA, BG, HR, EE, GR, LV, LT, ME, MK,
  PT, RO, RS, SI, ES, XK), 29 grid assets and 160 Supply assets. Supply was
  explicitly marked partial; this does not establish complete source coverage.
  “Remove supply from the view” then preserved all 16 countries, Grid and zoom 4.
- **264 frontend tests / 30 suites passed**. Root build compiled at **347.86 kB
  gzip JS / 19.68 kB CSS**, `main.82775486.js`; subpath build at **347.87 kB JS**,
  `main.53ab0b92.js`. All **9 preview HTTP tests**, including the actual compiled
  subpath bundle, passed. No backend restart or credential/configuration change.
- These are live functional checks on this workstation, not constrained-laptop
  CPU/memory measurements or a real microphone/WebRTC validation.

## Demand popup integrity and keyboard cleanup — 2026-09-05

- Fixed selection replacing the point GeoJSON layer and dismissing its popup.
  Selection styling now updates the existing marker; genuine source/geometry
  changes still replace it. Imported Atlas inspection no longer enters the
  legacy two-node connection editor. Popup auto-pan retains point-culling bounds
  until dismissal; deliberate navigation closes the popup before re-culling.
- Removed meaningless modulo-derived KPI rings. Demand cards display annual
  energy, average power and spatial allocation with their actual units. Earlier
  live checks matched France FRB01 to the API: 0.7160486959 GWh/year and
  0.0817407187 MW; its national NUTS3 total remained 100 GWh/year. All five
  composition-missing countries (AL, BA, ME, MK, XK) retained positive provisional
  demand totaling 100 GWh/year each without substituting another country's ETM
  sector shares. These are placeholder-demand checks, not genuine hourly input.
- Bounded asset popup width to the viewport. Compact layer and utility controls
  step aside while it is open. The previous 365 × 700 check measured popup
  bounds x=12..353, y=190..640 with no horizontal content overflow. Other popup
  corners and wide-sidebar overlaps remain part of the layout matrix.
- Removed the unreferenced React ObjectSelectorPopup, DemandProfileChart and
  DemandCompositionPanel (roughly 540 lines) and their unused map-file chart
  import. The live DOM popup remains authoritative. No working chart feature
  was removed, and no material JavaScript payload reduction is claimed. Replaced
  a live tooltip hint pointing to that unavailable profile selector with an
  explicit description of the available summary.
- Live popup tabs now expose tablist/tab/tabpanel relationships, selected state,
  a single tab stop, and Left/Right/Home/End navigation without passing those
  navigation keys to the map. Co-located component selection has an accessible
  name and resets to Overview with unique relationships for each new panel.
  New tests exercise the actual DOM builder, not a substitute tab component.
- Browser regression used a separate hidden tab, leaving the operator's active
  voice tab untouched by browser actions. Montenegro/NUTS3 Grid + Demand showed
  100 GWh/year, 11.42 MW and an explicit missing-sector disclosure. End selected
  Time-series (11.415525 MW repeated for 8,760 hours); Home and Right selected
  Overview and Costs, with focus and selected state exposed in the accessibility
  tree. The popup remained open across this keyboard sequence. The singular
  missing-composition notice now reads “1 country”.
- The operator reported “it works fine” after being given the live voice test
  sequence. This is a positive operator smoke-test report, not independently
  timed evidence of every step, noise condition, language or reconnect case.
- Validation: the final repeat passed **271 frontend tests / 32 suites**.
  Final root build compiled at **348.37 kB gzip JS / 19.63 kB CSS**,
  `main.740d2ba7.js`. Final `/atlas/` build compiled at **348.38 kB gzip JS**,
  `main.584dd61b.js`; all **9 preview HTTP tests** passed against that compiled
  build. No backend restart, Nohm source edit or credential change was required.

## Combined overlays and queue refresh ownership — 2026-09-05

- Live browser regression loaded Spain + Belgium at NUTS3 with electricity,
  methane and water: 3,248 loaded assets / 1,946 loaded links. The footer reported
  1,470 links rendered in the viewport and 37 unmapped links; these source gaps
  must not be described as a complete mapped network. Distinct yellow power,
  solid green methane and dotted cyan water appeared together without a crash.
- Hiding methane and water retained 63 electricity assets / 104 loaded and
  rendered links. The map-pane style and base-tile URLs/transforms were identical
  before and after both toggles; this is direct camera-stability evidence.
- Land tiles loaded with countries=BE,ES and visible protected/land-cover
  screening. Opening Access left Land enabled while closing its panel. Access
  initially showed 239 mapped / 935 published / 696 unlocated records, with an
  explicit statement that the selected coverage was Spain, not Belgium.
- Rapidly changing available-MW to queued-MW and removing Spain updated Access
  to Belgium-only, first showing loading, then zero published records with the
  explicit no-selected-country-coverage notice. Land tile URLs contained only
  countries=BE. The isolated test tab ended Belgium/NUTS3, Grid only, Land and
  Access off, panels closed, microphone never started.
- Code review found the queue request committed JSON after abort and retained
  old map records on a failed filter refresh. New useGridAccessRecords ties each
  snapshot to its exact URL/filter/retry generation, hides mismatched records
  immediately, aborts obsolete requests and guards late results after decoding.
  A 30-second deadline releases loading with a retryable error; unmount clears
  the timer and request. Record counts show unavailable on errors, not zero.
- Added a visible Retry grid-access data button. Tests cover country/metric
  races with an intentionally abort-ignoring fetch, failure and retry, timeout,
  malformed responses, disable/unmount and timer cleanup. The actual App test
  verifies the request scope, retry wiring and unchanged electricity geometry
  without an extra network parse. A map-component test verifies the error panel
  and retry button do not move the camera or present unavailable counts as zero.
- **277 frontend tests / 33 suites passed**. Root build: **348.83 kB gzip JS /
  19.64 kB CSS**, `main.70d7e56d.js`. `/atlas/` build: **348.84 kB gzip JS**,
  `main.3d9bc45e.js`; all **9 preview HTTP tests passed**.
- A separate loopback preview launch for live outage/retry testing was rejected
  by the execution policy. No alternative launch bypass was attempted and no
  backend was stopped. The failure/recovery path has automated evidence, but its
  live-browser outage/retry check remains open. The working API was not restarted.

## Background polling and queue legend consistency — 2026-09-05

- Replaced the two unconditional Land/Access polling loops with a shared,
  visibility-aware lifecycle. Inactive overlays bootstrap metadata once, then
  stop polling. Active overlays poll each minute only in visible tabs; hiding a
  tab cancels its status request/timer and discards late replies, and returning
  refreshes active services. Voice and model-job lifecycles are unchanged.
- Status requests now have a 10-second timeout. Active-service errors back off
  at 5/10/20/40/60 seconds, bounded at one minute. Repeated identical metadata or
  errors do not update App state again. Unmount and URL changes release timers,
  listeners and in-flight requests. An inactive failed bootstrap is retried when
  the user activates that overlay, whose controls remain enabled.
- Hook tests exercise visible/hidden lifecycle, initial hidden startup,
  activation/deactivation, deduplication, backoff/reset, timeout, callback
  freshness, URL changes and cleanup. The real App startup test advances ten
  minutes with both overlays inactive: exactly one Land status and one Access
  status request, rather than repeated polling. This is request/state evidence,
  not measured laptop energy consumption or an overall performance claim.
- The live France/NUTS3 check retained 93 buses / 181 AC lines, loaded 24 land
  tiles and showed 9 mapped / 11 published / 2 unlocated Access records. The
  independent browser test ended Grid-only, both overlays off, panels closed.
- Found a live legend mismatch: available-MW map markers use red→amber→green,
  but the legend always showed the reverse. The legend now uses the backend's
  actual three discrete colour bands and correct direction. Queued capacity,
  project count and lead-time labels now describe those measures instead of
  “pressure”; unreported metric values explicitly use connection-side colours.
  Five metric tests check labels and band colours. Browser inspection confirmed
  available access labels and red→amber→green, reachable by panel scrolling at
  1280 × 720. No backend change or restart was needed.
- Final automated frontend checks: **288 tests / 35 suites passed**. Root build
  compiled at **349.57 kB gzip JS / 19.59 kB CSS**, `main.94f7aaab.js`.
  `/atlas/` build compiled at **349.58 kB gzip JS**, `main.372f147b.js`;
  all **9 preview HTTP tests passed** against the final compiled subpath build.

## Unused node allocations and full-component endpoint — 2026-09-05

- Found the remaining producer for the removed legacy popup: every non-virtual
  PyPSA marker still allocated an eight-point synthetic carrier profile, although
  no frontend consumer remained. Removed that producer and demandProfile field.
  Actual generation capacity/dispatch, shared ETM demand templates, provisional
  annual demand and average power are unchanged. An actual App test verifies
  those values and that co-located markers no longer retain synthetic profiles.
- Added a reproducible read-only allocation benchmark:
  `node --expose-gc scripts/benchmark-unused-node-profiles.mjs --countries=FR,ES,BE`.
  It reads each of Grid/Supply/Storage/Demand at full nodal resolution, matching
  the normal lazy UI. Across 7,024 non-virtual nodes, the deleted field retained
  7,024 arrays and 56,192 point objects. Seven-sample median avoided retained heap:
  **3,092,664 bytes**; allocation time **5.71 ms**. This measures that field only
  in Node, excluding HTTP, parsing, the rest of the adapter and browser rendering.
  It is not a constrained-laptop or whole-browser memory qualification.
- The initial benchmark also exposed a genuine HTTP 500 on component_scope=full:
  the compatibility scope helper returns a dictionary for full, while demand
  template compaction iterated it as marker objects. The parse-nc route now
  normalizes that dictionary to records before compaction. Other helper callers
  retain their existing compatibility contract. Twelve tests execute the real
  route's scoping/compaction statements for dictionary/list inputs and all six
  scopes, checking templates, capacity and conserved demand.
- Real-data verification of the updated combined application used the importable
  WSGI app through Flask test_client, with no listener or backend restart:
  `python atlas-land/tests/smoke_full_scope.py FR ES BE`. Full-component requests
  returned HTTP 200: FR 3,511 markers / 1,864 links / 1,187 loads; ES 3,234 /
  1,273 / 1,073; BE 280 / 80 / 64. Each retained 100 GWh/year provisional demand
  and one shared composition template. The currently running port 5001 process
  predates this fix; activation and a live full-scope retest remain required.
- Focused Python checks: **109 passed, 1 skipped**. The skipped raster-demand
  builder test requires unavailable rasterio. A NumPy binary-compatibility warning
  was also emitted by the static-bus reader test; the shared Python environment
  was not changed. Resolve/verify these in the deployment environment before
  claiming dependency reproducibility or complete demand-builder coverage.
- **289 frontend tests / 35 suites passed**. Root production build: **349.14 kB
  gzip JS / 19.59 kB CSS**, `main.ee7b7e3f.js`. Subpath build: **349.15 kB gzip JS**,
  `main.f2d3ffa6.js`; all **9 preview HTTP tests passed**. Source datasets were
  not modified and no working server was stopped.
- Browser regression loaded France Full/Nodal through the existing lazy UI:
  Grid 1,204, Supply 1,021, Storage 99, Demand 1,187; 1,860 AC lines / 4 DC links.
  Switching back to NUTS3 staged all four datasets and replaced visible nodes,
  pies and lines together: Grid 93, Supply 280, Storage 54, Demand 93; 181 AC
  lines / 0 DC links. Full-only capacity styling/legend disappeared as expected.
  The isolated test tab ended France/NUTS3, Grid only, panels closed, mic off.

## Isolated demand environment and compact browser checks — 2026-09-05

- Created an isolated CPython 3.13.4 Windows x64 environment under
  `.atlas-runtime/demand-qa-env` with system/user site-packages excluded.
  Installed the existing `requirements-demand.txt` plus pytest, without changing
  the live API, Nohm or `.venv-study`. `pip check` reports no broken requirements.
  The demand tests now run **25 passed, zero skipped**: the previously skipped
  raster window/coverage/nodata test executes against rasterio and rasterstats.
- Added backend `requirements-demand-qa-windows-py313.txt`, recording all 66
  installed package versions (including transitive and test dependencies), and
  repeatable installation/import/test/dry-run instructions in `DEPLOYMENT.md`.
  Its dry-run installation requests no package changes in the tested environment.
  This is a platform-specific version snapshot, not a hash lock or a claim that
  the main API/Nohm environment is reproducible. `.venv-demand/` is now ignored.
- Belgium Full/Nodal and NUTS3 real-data dry runs passed (64 / 17 demand buses;
  100 GWh at each level). GB (495 / 127), CH (177 / 20) and AL (23 / 5) also passed
  using their actual public-data allocation methods. Albania correctly retained
  unavailable sector composition. Reports are under `.atlas-runtime/` as
  `demand-qa-be-validation.json` and `demand-qa-public-validation.json`.
  Dry runs publish reports only, not source networks or demand-weight files.
- Extended the clean-environment dry run to **all 34 countries × six levels =
  204 country/resolution outputs**. Final report
  `.atlas-runtime/demand-qa-all-validation.json` has `complete: true`, zero
  failures and 268.392 seconds elapsed. Each Bidding/e-Highway/NUTS1/NUTS2/NUTS3/
  Full level has 34 outputs; every output retains weight sum 1 and 100 GWh/year
  within 1e-6. AL/BA/ME/MK/XK remain explicitly without ETM composition. This
  verifies the offline demand workflow on real cached inputs, not live API
  performance or real hourly demand. All 15 top-level demand version pins agree
  with the 66-package QA snapshot.
- The NetCDF expected-16/observed-96 warning also occurs in this clean stack.
  Local NumPy initialization explicitly filters this Cython warning, explaining
  why ordinary imports succeeded while pytest reported it. Its exact signature
  is independently documented in
  [NetCDF issue 1354](https://github.com/Unidata/netcdf4-python/issues/1354).
  Tests retain that warning and 13 affine pending-deprecation warnings; none was
  globally suppressed. Passing real-data checks are the evidence here, not an
  assertion that every binary combination is safe. The unrelated shared Python
  `openai-agents` / `openai` requirement conflict remains unmodified.
- Browser control used a separate test tab at **365 × 700**. Belgium NUTS3 loaded
  17 buses / 21 AC lines; Demand loaded 17 nodes. A real BE32B demand popup fit
  within the viewport with internal scrolling and showed 8.552 GWh / 0.976 MW,
  provisional/flat-profile labels and ETM sectors. Keyboard End selected the
  Time-series tab, showing 0.976288 MW for each placeholder hour. The compact
  assistant's controls and input fit; the microphone was not started. Restored
  the normal viewport and closed the popup/assistant. At normal size, toggling
  node markers and geographic boundaries left the rendered map-pane transform
  and tile URLs/styles exactly unchanged. Test tab ended Belgium/NUTS3, Grid-only,
  normal display toggles restored. These checks do not establish target-hardware
  memory/CPU or real-device microphone behaviour.
- During the offline build, the live frontend returned HTTP 200 and the backend
  continued reporting all eight route groups ready. No server was stopped or
  restarted; the pending full-component endpoint activation is unchanged.

## Candidate HTTP activation checks — 2026-09-05

- Started the normal combined launcher as a separate loopback candidate on
  **5003, PID 26596**, using `NOHM_PLATFORM_ROOT` and local logging. No credentials
  were copied or changed. Its logs and cache report are under
  `.atlas-runtime/candidate-full-scope-20260905/`.
- Readiness and gas/water/liquids/logistics/grid-access/land/voice status routes
  returned HTTP 200. Allowed-origin preflight echoed `http://localhost:3000`;
  an untrusted origin received 403 without an allow-origin header. These checks
  establish routing/origin handling, not live provider authentication.
- The real HTTP cache warmer verified **45/45** combinations: FR/ES/BE ×
  Bidding/NUTS3/Full × Grid/Supply/Storage/Demand/Full components. Zero failures;
  every second request was a cache hit with identical decoded content. Includes
  the fixed all-components endpoint (France Full: 3,511 markers / 1,864 links).
  Median repeated-request time **146.7 ms**, maximum **1,053.4 ms**, total run
  88.279 s. These are localhost API measurements, not whole-browser interaction
  or constrained-laptop timings. First parser initialization took 13.202 s;
  deployment prewarming remains relevant.
- Inspected the user's IAB and Chrome Atlas tabs read-only: both showed no loaded
  countries or active map operation, assistant closed. The old backend had no
  model worker child process. The subsequent guarded stop/start request was
  **rejected by execution policy before execution**. No alternate termination
  mechanism was attempted. Rechecked actual port owners: main API 5001 still
  PID 33920, frontend 3000 still PID 67720, candidate 5003 PID 26596. Frontend
  HTTP 200 and main API route readiness remained healthy. Candidate validation
  has completed, but replacing the old main process remains unperformed.

## Country-removal retention and live agent finding — 2026-09-05

- Found that both manual and agent country-removal handlers filtered the main
  facility array without rebuilding `sameLocationFacilities`. At cross-country
  co-locations, the remaining nodes therefore retained removed-country component
  records and stale co-location counts. Both handlers now regroup the surviving
  source-owned records using the existing immutable grouping function. This does
  not remove legitimate foreign boundary ports owned by a retained dataset.
- Two actual-App regressions with co-located BE/FR records failed before the fix
  and passed afterward, for manual and agent removal. They check absence of
  removed-country peers, updated group counts, retained generation/line capacity,
  remaining boundaries and unchanged previous snapshots. This proves removal of
  these references, not whole-browser garbage collection or a measured heap gain.
- **291 tests / 35 suites passed**. Root production build compiled at
  **349.15 kB gzip JS / 19.59 kB CSS**, `main.142345fe.js`; `/atlas/` build at
  **349.16 kB JS**, `main.1664ae59.js`. All **9 preview HTTP tests passed**.
- Independent browser regression with real data: manually assembled FR + BE at
  NUTS3 (110 buses / 202 AC lines), with Grid and Supply. Live EMIL instruction
  “Remove France from the map. Keep Belgium and the current layers.” left only
  Belgium: **17 grid nodes / 21 AC lines / 68 Supply components**, and the judge
  correctly reported those retained layers. Microphone remained off.
- **New production blocker exposed by a different live prompt:** “Show Belgium
  and France at NUTS3 with grid and supply.” The initial action treated
  “Belgium and France” as one place, loaded legacy `build_BE_pypsa_64_20260831_141221`,
  and the judge correction then replaced Belgium with France/NUTS3. The UI said
  “Checked and corrected” while only France was selected. Source inspection
  explains the path: `load_country` reads only `country`/`location`, the backend
  describes `countries` as viewport-only, and an unmatched country string falls
  through to the legacy place/build loader. Judge corrections are executed once
  and labelled corrected without validating their final observed result. This
  issue is **not fixed** by the retention change and must be addressed next with
  a multi-country action contract, whole-plan regressions and post-correction
  verification. Do not add a raw-user-text keyword fallback or certify the agent
  from the passing single-country removal test.

## Multi-country commands, bounded verification and final-state loading — 2026-09-05

- Fixed the compound-country dispatcher: `countries` is now an explicit array
  for load/add/remove, with complete validation before loading. Compatibility
  decoding of older model-generated named lists consumes every token; it does
  not inspect or reinterpret the user's raw prompt. Invalid mixed country lists
  cannot load a recognized subset. Failed place resolution no longer falls
  through to a legacy build that could select an unrelated cached country.
- The independent judge now re-observes the map after its correction. There is
  at most one correction round, followed by a read-only audit. Remaining
  mismatches are not labelled verified. Invalid/low-confidence results and a
  30-second judge timeout cannot trigger corrective mutations or claim success.
  Cancellation is checked before either audit; viewport corrections receive
  the camera-settle interval before the final observation.
- Planner/judge source prompts now describe whole country arrays, replacement
  versus addition, and verification against actual final state. Clear parameter
  contracts follow the official [function-definition guidance](https://developers.openai.com/api/docs/guides/function-calling#best-practices-for-defining-functions).
  These backend source changes have 17 passing actual-route tests with the
  shared transport mocked. They are **not yet activated on the old main backend**.
  The live checks below exercise the new frontend with the existing real Nohm
  provider/backend; frontend compatibility supports its older country output.
- A compound add-country/resolution/layer command now stages the entire final
  selection in one batch. It no longer loads old visible layers merely to hide
  them afterward. A before/after actual-App regression demonstrated four requests
  becoming two for BE+FR/NUTS2/Grid when Supply was previously visible. No
  intermediate BE-only/NUTS2 frame is published, and a failed FR response keeps
  the previous BE/NUTS3 map and Supply visibility. The same requested-layer
  batching applies to all-country and named-region replacements.
- **316 frontend tests / 35 suites passed** (44.288 s). A final lint-only
  closure cleanup was followed by **67 country/command tests passing**. Both
  final production builds compiled successfully with no ESLint warnings:
  root **350.37 kB gzip JS / 19.59 kB CSS**, `main.3a4b4dcb.js`; `/atlas/`
  **350.38 kB JS**, `main.85dc5bc2.js`. All **9 preview HTTP tests passed**.
  The build tool still emits its existing Node `fs.F_OK` deprecation warning;
  earlier unsilenced Jest output includes the testing-library React act warning.
- Separate IAB browser checks, with real provider/data and microphone off:
  - “Show Belgium and France at NUTS3 with grid and supply.” succeeded twice,
    retaining both countries: **110 buses / 202 AC lines / 348 supply records**.
  - “Add Spain, reduce everything to NUTS2 and remove supply. Keep the grid and
    the countries already loaded.” succeeded before and after consolidation:
    **BE+FR+ES / 45 buses / 78 AC lines / 1 DC link**, Grid only.
  - “Show me Europe at bidding zone level with grid only.” selected all
    **34 countries / 53 buses / 110 AC lines / 7 DC links**.
  - “Ajoute la production, sans déplacer la carte.” added Supply, retained Grid
    and all 34 countries. Read-only DOM observations confirmed identical map-pane
    transform and sorted tile URLs/styles before and after. Supply showed
    **339 records, partial coverage**; the expanded data-gap disclosure identified
    **XK: no matching country plants or buses**, explicitly not zero supply.
    This is a source-coverage finding, not proof of complete European generation.
- Rechecked listeners: frontend 3000 still PID 67720; main API 5001 PID 33920;
  candidate 5003 PID 26596. No restart or workaround for the prior denied
  replacement was attempted. User's existing browser tab was not changed.

## Kosovo inventory and region framing — 2026-09-05

- The XK supply gap was an adapter defect, not absent plant data. The backend
  country dictionary omitted `XK: Kosovo`; filename inference could ignore XK
  and, in a border-bus fixture, select the neighbouring country's inventory.
  Added the mapping and the missing frontend display name. Seven regressions
  failed before the fix and passed afterward, covering filename variants,
  generation/storage capacity and refusal to borrow foreign buses/plants.
  **56 backend inventory/cache/agent tests passed**.
- Added opt-in `tests/smoke_inventory_scope.py` under `atlas-land`, exercising
  the real combined Flask parser in process without a listener or restart.
  **48 real-data requests passed**: XK, RS, GB and CZ, each at Bidding zone,
  e-Highway, NUTS1/2/3 and Full, for both Supply and Storage. At every XK level,
  the eight generator source rows conserve **1,812.1 MW**, and one storage row
  conserves **35 MW**. Foreign-country markers are rejected by the check.
  These are totals from the archived inventory, not independently verified
  currently operational capacities or forecasts. The live old backend still
  needs activation before this source-mapping fix will appear there.
- Browser-control inspection verified the country selector and loaded-country
  chip now say **Kosovo**, not XK. It also exposed a separate framing problem:
  `public/europe.geojson` lacks an XK national-outline feature. A one-bus view
  therefore fitted the centroid, clipping the loaded region footprint.
- Explicit country framing now uses source-owned Polygon/MultiPolygon regions
  for countries missing national outlines. National outlines retain priority;
  unselected countries, unowned polygons and Point features do not expand the
  fallback bounds. This is a **camera fallback**, not a national boundary or a
  land-constraint jurisdiction mask. It covers the loaded regions, not any
  assertion of full territorial coverage. New explicit fits reserve header,
  toolbar and status-bar clearance; toggling UI filters does not refit.
- Actual-map component regression verifies the fallback extent and once-only
  execution. In the browser, re-framing Kosovo displayed both loaded NUTS3
  regions below the toolbar; node/boundary toggles left the map transform and
  sorted tile URLs/styles identical. Both toggles were restored afterward.
  Microphone was not activated; the user's existing tab was not changed.
- Final **319 frontend tests / 35 suites passed** (44.064 s). Root build:
  **350.48 kB gzip JS / 19.60 kB CSS**, `main.d90a0621.js`; `/atlas/` build:
  **350.48 kB JS**, `main.3e30e996.js`. Both compiled successfully. Existing
  build-tool Node deprecation warning remains separate from compilation.
  All **9 preview HTTP/deployment tests passed** against the final subpath build.

## Land country scope must not expand silently — 2026-09-05

- Audited the boundary file against all 34 cached network countries. **XK is
  the only missing country outline**. The land API previously discarded unknown
  country codes; an empty result meant unrestricted European coverage. Thus XK
  became global, BE+XK became BE only, and BE+ALL also became global.
- Sixteen regression cases failed before the fix. Country normalization now
  preserves explicit unrestricted requests but rejects incomplete, unsupported
  or ambiguous scopes. Tiles, inspection and viewport statistics return **422
  JSON**, `unsupported_country_scope`, the requested scope and unsupported codes;
  error responses are `no-store`, never immutable raster responses. API version
  is now 1.2. All **24 land API tests passed**, including real raster clipping
  and supported-country sampling. Backend activation remains pending.
- Frontend validation uses the land service's actual country catalogue, not the
  electricity catalogue or inferred cluster regions. Until coverage is known,
  or if any requested country is unsupported, it suppresses land tiles,
  clipping outlines, sampling and inspection and announces an explicit status.
  It does not silently select a supported subset. This guard also protects the
  current UI when connected to the older running backend.
- Country/enable changes and newer clicks cancel obsolete land inspections;
  late replies cannot display the previous country's result. Inspection has a
  20-second timeout. Sampling clears on scope changes and obsolete responses or
  failures cannot replace/clear a newer sample. Actual-map component tests cover
  unsupported mixed scope, supported recovery and both stale-response paths.
- Browser-control check: Kosovo/NUTS3 with Land following map showed the
  coverage warning, disabled inspection and **zero land tile elements**. Switching
  explicitly to custom Albania restored the clipped raster and country sample;
  every observed land tile URL used `countries=AL`. Camera transform was
  unchanged and Kosovo's grid stayed loaded. No microphone was enabled and the
  user's existing tab was untouched.
- **324 frontend tests / 36 suites passed** (44.985 s); the final status-role and
  outline-gating change was followed by all **34 actual-map component tests
  passing**. This resolves the silent-expansion defect, not the missing Kosovo
  boundary dataset or complete siting-data coverage.
- Final root/subpath builds both compiled successfully at **350.88 kB gzip JS /
  19.60 kB CSS** (`main.fff2f143.js` / `main.d0edd95c.js`). All **9 preview
  deployment HTTP tests passed** against the final subpath artifact.

## Land sample evidence and boundary-source audit — 2026-09-05

- Downloaded a checksum-pinned Natural Earth 1:10m country-boundary candidate
  into `data/sources/natural-earth-5.1.2/`; its README records source, published
  public-domain terms, commit and geometry findings. It is **not active data**.
  The existing Serbia outline overlaps 97.191% of the candidate Kosovo polygon;
  the remaining overlap is with AL/MK/ME. Appending it would leave incoherent
  country masks. GISCO's administrative-boundary terms exclude commercial use
  without a separate agreement; the geoBoundaries XKX source/license metadata
  needs reconciliation. Resolve a consistent boundary dataset and its reuse
  requirements rather than turning a coarse candidate into a jurisdiction mask.
- Found that viewport statistics treated undocumented CLC values (including 0)
  as valid observations, and zero valid observations still produced three 0%
  figures. New API 1.3 counts only documented CLC classes, includes in-scope
  sample count and known-cover percentage, and returns null percentages with
  an explicit reason when no land-cover evidence was sampled. Percentages remain
  screening classes that can overlap, not a partition of developable land.
- NaN, infinity and out-of-WGS84 viewport bounds now return 400 before raster
  sampling. Missing inspection/statistics raster readers return no-store 503
  JSON instead of an HTML 500. Eleven new regression cases failed before the
  changes; all **36 land API tests passed** afterward (3.30 s), including real
  raster clipping and country-scoped sample checks.
- The frontend handles both old zero-valued responses and the new no-data
  contract: no misleading 0% summary, explicit unknown-data guidance, clearer
  denominator labels, partial-coverage warning and higher-contrast sample text.
  Malformed percentage values are not displayed as evidence. All **332 frontend
  tests / 37 suites passed** (45.242 s).
- Browser-control check at 1280×720: Spain NUTS3 stayed at 46 buses / 82 AC lines
  / 1 DC link while the custom land scope was Belgium. The panel visibly showed
  the missing-data warning, with no 0% figures. Returning to following-map Spain
  restored its sample and ES-only land tile URLs. Map-pane transform was exactly
  unchanged. Inspection was toggled off after its layout check; no microphone
  was activated and the user's original tab was untouched.
- Root build: **351.35 kB gzip JS / 19.60 kB CSS**, `main.5fd30778.js`.
  `/atlas/` build: **351.36 kB JS**, `main.8790bfe2.js`. Both compiled successfully;
  all **9 preview HTTP/deployment tests passed** against the final subpath build.
  The existing build-tool Node fs.F_OK deprecation remains, not a compile error.
- Rechecked main port 5001: ready, **land API 1.1**. Frontend no-data handling is
  live; backend 1.3 evidence is source/in-process tests, not activated HTTP
  behaviour. No attempt was made to bypass the denied backend replacement.

## Stable navigation styling and renderer lifecycle — 2026-09-05

- Reproduced three actual-map regressions before changes: movement start altered
  the line-render key solely to dim opacity; a point constructed during movement
  used a different marker class that could persist after idle; zoom/focus remounted
  country polygons even though only their style changed. Removed transient
  interaction-dependent construction/styling. Explicit performance mode remains;
  viewport clipping, node LOD and cancellable line batching remain unchanged.
- Country and regional boundary keys now identify geometry, not the zoom/focus
  state. Country style is memoized by active country and overview band. Checked
  the installed React-Leaflet GeoJSON implementation: changed style uses
  `layer.setStyle`, while replacement geometry still requires a new key. Tests
  verify both stable mounts across zoom and remount on changed region geometry.
- Added a 50-completed-replacement renderer stress regression: at most two
  graph buffers while staging; one committed layer/renderer afterward; exactly
  two fixed panes; no pending frames/layers/panes after unmount. This is structural
  cleanup evidence, not a whole-browser heap measurement.
- All **337 frontend tests / 37 suites passed** (46.693 s). Root and subpath
  builds compiled successfully at **351.37 kB gzip JS / 19.60 kB CSS**:
  `main.82437540.js` and `main.20dc8495.js`. All **9 preview HTTP/deployment tests
  passed** against the final subpath build. No backend code changed in this pass.
- Browser QA at 1280×720 with Land enabled: three zoom-in/out cycles and paired
  drags retained **15 Leaflet panes and four canvases**. Canvas width×height×4
  totaled **21,233,664 bytes** at the sampled settled view, unchanged across the
  cycles; this counts nominal RGBA surfaces, not JS heap/GPU/process memory.
- Spain NUTS3 -> Full/Nodal visibly changed 46 buses / 82 AC / 1 DC to
  1,078 / 1,269 / 4. Adding Belgium at Full produced 1,151 / 1,347 / 6.
  The Electricity + Methane + Water overlay then settled at **4,336 assets /
  3,195 loaded links**, 2,719 drawable in-view links; 37 unmapped links remained
  explicitly reported. No captured console error entries in the QA tab.
- Hiding Methane retained Electricity + Water (**3,998 assets / 2,806 links**)
  and settled normally. Restoring it, then switching both countries to NUTS2,
  changed electricity to **24 assets / 37 links**, while methane/water stayed
  loaded (combined 3,209 assets / 1,879 links). The map-pane transform did not
  change across carrier selection or resolution updates. Returning to single
  electricity retained **24 buses / 36 AC / 1 DC**, not an empty map. Pane and
  canvas counts remained bounded throughout. User's original tab was untouched;
  no microphone was activated.
- The browser-control surface does not expose CPU throttling or heap profiling.
  These checks establish tested workflow/DOM stability, not the 8 GB/four-core
  performance gate. Further host-side profiling remains necessary.

## Queue inspection correctness and popup clearance (2026-09-05)

- Queue cards now distinguish missing/null/blank/invalid measurements from
  published zero. Missing capacities and dates say **Not published**, missing
  pressure says **Not comparable**, and missing confidence/lead time no longer
  become 0%/0 years. Numeric zero is retained. Malformed optional project/source
  collections are handled defensively; displayed project samples remain bounded.
- Queue tooltip/popup HTML is constructed on interaction, rather than eagerly
  for every site. Imported queue fields, regional labels and line metric units
  are escaped as text. Regressions verify that markup cannot create elements.
  Generic asset number parsing also no longer converts blank/bool values to zero.
- Pinned queue and generation popups suppress their hover previews until closed;
  a real-Leaflet 20-cycle test checks restoration without accumulating handlers.
  Inspection temporarily hides land/access panels, carrier legend and domain
  controls without changing their saved settings or unloading map data. Desktop
  zoom controls remain available. Compact domain-open buttons are also suppressed
  during inspection, so they cannot change an invisible panel behind the popup.
- Browser testing found and repaired both right-panel obstruction and left-edge
  sidebar obstruction. Live Spain NUTS3 retained **46 buses / 82 AC / 1 DC** and
  the queue scope retained **239 mapped / 935 published / 696 unlocated**.
  VALDECONEJOS 220 showed 326 MW available and an unpublished target date;
  SABON 220 correctly retained its published **0 MW** available capacity.
- At 1280x720 the SABON popup was fully visible at x=180..549, y=190..450;
  at 800x600 it fit at x=12..381, y=191..451. After settling there were no
  duplicate queue tooltip elements. Closing restored the selected queue measure,
  country controls and panel visibility. No captured console errors. QA used a
  separate tab, did not activate the microphone, reset the viewport and closed
  that tab. This checks queue popup geometry, not the remaining active-voice
  panel/real-device matrix.
- Automated production-component tests cover missing-data display, label escaping,
  sidebar/panel restoration and unchanged network geometry/request counts. The
  compiled `/atlas/` preview passes all **9 HTTP/deployment tests**; these are
  local deployment checks, not authenticated Nohm-host sign-off.
- Final frontend suite: **365 tests / 40 suites passed**, 47.854 seconds.
  Both production builds compile successfully: root `main.8ff65083.js` and
  `/atlas/` `main.87a1ecd4.js`, each **351.59 kB gzip**; shared CSS remains
  **19.60 kB** (`main.35bdca0a.css`). No backend runtime replacement was attempted
  in this pass; backend activation and other remaining gates below are unchanged.

## Conversation and map inspection handoff (2026-09-05)

- Expanded EMIL now temporarily yields to an inspected map asset. The conversation
  DOM/draft and independent voice hook remain mounted; a compact launcher exposes
  voice status, microphone stop and speech-only interruption. Speech can be stopped
  without stopping the microphone, including when speech outlives microphone input.
- Returning explicitly to EMIL dismisses the map popup through a consumed request,
  releases frozen marker-culling bounds, and focuses the message input with
  `preventScroll`. Closing inspection normally restores the previous conversation
  presentation; it does not restart voice or send the unsent draft. Focus is requested
  only by explicit conversation opening, not by every incoming partial transcript.
- Enter used to confirm IME composition no longer submits chat or place drill-down.
  Both `isComposing` and legacy composition key code 229 are guarded. Ordinary Enter
  still submits after composition has ended. This is input handling, not evidence
  of provider understanding/translation accuracy.
- Browser QA with Spain NUTS3 and the grid queue layer passed at 1280x720 and
  800x600. Opening VALDECONEJOS/SABON cleared the expanded conversation from the
  popup; returning to EMIL preserved the unsent draft. The desktop map transform
  stayed `translate3d(0px, 128px, 0px)` across the return; the narrow-view transform
  stayed `translate3d(-1px, -188px, 0px)`. The narrow popup settled at x=79..448,
  y=190..450, with zero duplicate queue tooltips. After return, no popup remained
  and `Message EMIL` had keyboard focus. No captured console errors. The separate
  QA tab was closed and viewport reset; no microphone or provider request was used.
- Production-App regressions verify draft retention, dismissal wiring, unchanged
  network geometry/request counts, and independently callable stop controls with
  a mocked active voice hook. Real-map hook tests verify once-only dismissal and
  no camera command. This complements, but does not replace, real-microphone,
  background-noise, multilingual, interruption/reconnection and host tests below.
- Final frontend suite: **372 tests / 40 suites passed**, 54.949 seconds. Root
  and `/atlas/` production builds both compile: `main.69a057b0.js` and
  `main.27210c65.js`, respectively, **351.87 kB gzip** each. Shared CSS is
  **19.61 kB** (`main.1b695a81.css`). All **9 compiled-preview HTTP tests**
  pass against the final subpath build. No backend runtime was replaced.

## Live Europe agent matrix and generation overview (2026-09-05)

- Five real text-agent commands completed in the running browser (not mocked
  planner responses): Europe at bidding zones with Grid + Supply; all loaded
  countries to NUTS1 retaining both; hide Supply without changing geography;
  repeat the Europe bidding-zone view; then Spain only at Full/Nodal with
  Supply only. The judge reported success in each case, and UI/layer/geometry
  evidence was checked separately. This establishes these commands, not the
  entire multilingual/queued-action/voice matrix.
- Europe loaded **34 countries**, **53 buses / 110 AC / 7 DC** at bidding-zone
  level, with 339 supply records and one explicitly flagged supply-country gap.
  NUTS1 changed to **107 buses** and 766 supply records. Hiding Supply removed
  all pie markers while retaining Grid and the NUTS1 country selection; the map
  transform stayed `translate3d(0px, 0px, 0px)`. No backend replacement was needed
  for these scope-specific requests; the older full-component route/inventory
  activation gates below are separate.
- The browser exposed a generation-display issue: 37 of 47 bidding-zone pies
  were only 2px, and the low-zoom co-location-count rule omitted sparse sites.
  Visible generators are now indexed once per data/filter snapshot, grouping
  each site without repeatedly scanning its copied co-location list. Hidden
  carriers are not reintroduced by nested metadata. The capacity scale reference
  is calculated before viewport clipping, so panning does not resize the pies.
- All available aggregated generation sites are retained at overview zooms.
  Their pie diameters follow square-root capacity within readable bounds (5..22px
  at overview, increasing at close zoom); minimum-size floors mean the smallest
  symbols are not exact area comparisons. Full-nodal sites are ranked by installed
  capacity and capped in view at 180/360/700/1,400 for zoom <=4/5/6/7 respectively;
  zoom >=8 retains all visible sites. This affects generation symbols only, not
  source records or grid edges. The UI reports displayed/available in-view counts
  whenever symbols are limited and explains how to restore detail.
- Repeating the Europe request after the change displayed **48 pies** (one
  previously omitted site restored), 5..22px, with the same grid and stable camera.
  Spain Full/Nodal with Supply only loaded **970 generators / 696 generation
  sites**. Live zoom-out changed marker counts **696 -> 360 -> 180**, with matching
  `360 of 696` / `180 of 696` notices. Zooming back restored **360 -> 696** and
  removed the notice. Grid was confirmed unpressed and Supply pressed, independently
  of EMIL's reply. No captured console errors; the isolated QA tab was closed and
  no microphone was activated. This is not a constrained-hardware latency/heap test.
- Regressions cover one-generator regional sites, once-per-generator capacity
  reads, no hidden-carrier leakage, viewport-aware nodal ranking, all regional
  sites retained, invalid coordinates, square-root scaling, stable scale during
  panning, and displayed-detail notice updates. The map test's Pane mock now
  renders its children so generation GeoJSON is actually exercised.
- Final checks: **379 tests / 41 suites passed** (61.504s). Root build
  `main.2ceb66a5.js` is **352.27 kB gzip**; `/atlas/` `main.f4e685be.js` is
  **352.28 kB**. CSS remains **19.61 kB** (`main.1b695a81.css`). Both compile
  successfully; all **9 compiled-preview HTTP tests** pass.

## Lazy boundary payload and layer stability (2026-09-05)

- Grid now owns staged geographic boundaries. Adding Supply, Storage or Demand
  ignores repeated boundary objects from legacy responses, retaining the original
  geometry references instead of replacing unchanged polygons. Actual-App tests
  exercise all three layers with both old and capability-enabled catalogues and
  verify boundary reference identity and unchanged grid capacity data.
- The updated backend advertises a strict boolean `include_geojson_overlays`
  option through the existing catalogue. The browser requests omission only for
  staged component layers after capability negotiation; Grid/default responses
  are unchanged. Compact responses have distinct cache identities and skip only
  unused boundary fingerprints. Network and component source invalidation remains
  content-aware. Invalid values bypass cache and return 400.
- Real-data in-process checks passed for FR, ES and BE at NUTS3 across all four
  scopes (12 comparisons): every non-boundary payload field is exactly equal,
  compact overlays are empty, repeated responses hit the persistent cache, and
  gzip decompresses to the exact corresponding identity response. Seven invalid
  boolean values return 400. The frontend deliberately does not omit Grid shapes,
  even though the smoke check also establishes that API option for Grid.
- Combined lazy Supply/Storage/Demand response sizes, excluding the unchanged
  initial Grid request, were:

  | Country | Normal JSON bytes | Compact JSON bytes | Normal gzip bytes | Compact gzip bytes |
  | --- | ---: | ---: | ---: | ---: |
  | France | 1,071,758 | 379,733 | 229,241 | 39,237 |
  | Spain | 612,542 | 243,062 | 126,606 | 25,535 |
  | Belgium | 178,590 | 89,583 | 32,048 | 11,087 |

  These are response-body sizes, not latency or total HTTP/TLS traffic claims.
  France's lazy component JSON is 64.6% smaller and its gzip bodies 82.9% smaller.
  No component records, capacities or grid edges are removed by this optimization.
- Live browser check with the older main backend loaded France NUTS3 Grid
  (93 buses, 181 AC lines), then Supply (280), Storage (54) and Demand (93).
  All remained visible with region boundaries; 93 generation pies were shown.
  The map transform stayed `translate3d(132px, -150px, 0px)` across layer additions
  and hiding Supply; hiding Supply removed the pies without clearing other
  domains. Grid, Storage, Demand and Boundaries remained pressed; no console
  errors were captured. The isolated QA tab was closed. This verifies the
  frontend legacy path, not live compact downloads.
- Verification: **381 frontend tests / 41 suites passed** (52.549s), **93 targeted
  backend tests passed** (9.07s), and **9 compiled-preview HTTP tests passed**.
  Root build `main.845fa80c.js` is **352.36 kB gzip**; `/atlas/` build
  `main.db365ea1.js` is **352.37 kB**, with **19.61 kB** shared CSS
  (`main.1b695a81.css`). Both compile successfully.
- Backend activation remains pending. No running server was replaced, and the
  compact download reduction must not be represented as active on that older
  process. Real microphone, constrained hardware and Nohm-host gates below remain.

## Conversation reading and display-agent contract (2026-09-05)

- EMIL previously forced the conversation to the bottom for every reply, busy
  state and partial transcript. It now follows only while the reader is at the
  end (32px tolerance), retains an older reading position during incoming output,
  and offers a keyboard-accessible Jump to latest control. New complete messages
  mark that control without treating every partial as a new-message alert.
  Close/reopen and popup inspection preserve the reading offset. Jumping uses
  immediate container scrolling, not animated page scrolling, and transfers focus
  to the keyboard-scrollable log when its button disappears.
- Live browser QA: France NUTS3 Grid loaded through a real text command. After
  keyboard scrolling to the first message, another user command and real response
  grew the log from 372 to 666px while scrollTop stayed zero. Close/reopen retained
  zero. Enter on Jump to latest reached scrollTop 443 with a 223px viewport (the
  end of 666px) and focused the log. No captured console errors; the isolated tab
  was closed and no microphone was activated.
- That second command exposed a separate real failure on the older backend:
  "Hide the geographic boundaries, keep the grid and camera unchanged" collapsed
  domain controls; the boundary toggle stayed on, but the judge reported success.
  This command is explicitly **not a live pass**. The planner lacked a display
  intent and the judge lacked actual boundary/node visibility observations.
- Added `set_map_display` with optional strict boolean `node_markers` and
  `geographic_boundaries` fields. Omitted fields are preserved, invalid/unknown
  fields reject the entire action before mutation, and no network fetch or camera
  operation is issued. The frontend publishes mapDisplay visibility for node dots,
  boundaries and sidebar independently. The planner/judge definitions distinguish
  these from each other, Grid visibility, generation pies and network resolution.
- The actual App regressions verify independent display toggles, original geometry
  and request counts retained, and the observed after-state passed to the judge.
  Backend route tests verify the new intent survives sanitization, display state
  survives judge compaction, and corrections preserve the supported contract.
- Opt-in `tests/smoke_map_display_agent.py` passed with NOHM_PLATFORM_ROOT pointing
  to the shared Nohm checkout. It exercised the updated production routes in
  process using **real model calls**: English boundary hide, Spanish dots+boundary
  hide, French dots+boundary show. All returned only the requested display actions.
  A real judge given labelled fixture observations of the false sidebar result
  returned repair with geographic_boundaries=false, not pass. These are planner
  and judge checks, not evidence of executing those new actions in the live map.
  The running backend has not been replaced; activation and integrated UI retest
  remain required. The first in-process attempt lacked NOHM_PLATFORM_ROOT and
  correctly failed rather than falling back; no user credentials were requested.
- Final frontend suite: **390 tests / 42 suites passed** (62.993s). Targeted agent
  backend suite: **19 passed** (8.19s). Hook tests cover following, reader interruption,
  partial/busy changes, manual return, hidden updates and remounted logs; the
  actual-App test verifies an incoming reply preserves position and jump restores
  keyboard focus without network geometry changes.
- Root and `/atlas/` production builds both compile: `main.83cab9bd.js` and
  `main.cd584b7d.js`, respectively, **353.1 kB gzip** each. Shared CSS is
  **19.62 kB** (`main.0cca2bfa.css`). All **9 compiled-preview HTTP tests** pass
  against the final subpath build.

## Deferred popup data and shared regional groups (2026-09-05)

- Node feature generation used to filter/copy a co-location list and create an
  extra facility wrapper per rendered node, even when no popup was opened. This
  work now runs only when the popup callback is invoked. A production-map test
  verifies zero group reads during initial rendering, zooming and filtering;
  inspection still includes visible components and excludes hidden ones.
- Regional-solve source-directory updates now map each distinct component/group
  once, retaining shared co-location arrays instead of duplicating them per
  component. Transformation caches are local WeakMaps, not long-lived network
  caches. Unaffected objects/groups retain identity; separate calls do not reuse
  stale solved-run data. The original source records remain unchanged.
- A 5,000-component fixture at 100 locations (50 components each) verifies exact
  output-field equality against the previous transformation, including capacities,
  annual demand and nested demand composition. It performs 10,000 record transforms
  (top-level records plus shared group records), rather than the previous loop's
  255,000, and retains 100 transformed arrays instead of 5,000 equivalent ones.
  These are algorithm/allocation counts, not measured laptop memory or latency.
- Browser inspection found the count badge included hidden Demand even though
  the popup correctly excluded it. Counts now use a shared index of visible
  canonical location keys, preserving the original group metadata. No per-marker
  group scans were reintroduced. Legacy records without a location key retain
  their supplied grouping count; this does not invent new groups for them.
- Live France NUTS3 Grid + Demand inspection showed FR107's two components,
  including the provisional 2.534 GWh annual/0.289 MW average demand and four-sector
  composition, with the co-located AC bus selectable. With Demand hidden, the
  FRB03 popup showed one AC bus, no component selector and no count badge after
  the correction. No captured console errors; the temporary QA tab was closed.
  A fresh regional solve was not run; its data-source transformation is covered
  by the exact-field and shared-identity tests above.
- Final frontend suite: **393 tests / 42 suites passed** (64.691s). Root build
  `main.e64d9ac8.js` compiles at **353.19 kB gzip**, with **19.62 kB** CSS
  (`main.0cca2bfa.css`). The `/atlas/` build `main.1f57a8f8.js` compiles at
  **353.2 kB gzip**, and all **9 compiled-preview HTTP tests** pass against it.
  No backend changes or runtime replacement in this pass.

## Popup framing diagnostic (2026-09-05)

- Investigated the large apparent camera displacement observed while opening a
  tall demand popup. In the 1280x720 browser, the pre-inspection map transform was
  `translate3d(132px, -150px, 0px)`. Opening FR107's demand card settled once at
  `translate3d(132px, 183px, 0px)`: a 333px pan, not a zoom or repeated fit.
  The popup occupied x=441..850, y=189.5..639.5; its 420px content viewport scrolled
  577px of content. This matches the configured 190px toolbar clearance and the
  requirement to place the anchored card above the node.
- Switching to the co-located AC bus reduced the card height to 423.02px; its
  top moved to 216.48px while the map transform stayed unchanged. Returning to
  Demand restored the original bounds without another pan. No camera change was
  implemented: the evidence establishes bounded accommodation, not the historical
  filter/zoom-loop failure.
- At 800x600, resizing closed the old popup after layout settled. After explicit
  Fit and opening another demand node, its popup fitted x=228..637, y=190..540
  (350px tall). Keyboard Right Arrow switched Overview -> Costs -> Time-series,
  retained focus on the selected tab and kept the map transform exactly
  `translate3d(-108px, 401px, 0px)`. The time-series tab explicitly described the
  provisional flat 8,760-hour profile rather than implying measured hourly data.
- No captured console errors. Temporary viewport override was reset and QA tab
  closed. This adds live evidence for these tall-card/component/tab cases; it
  does not close every edge/corner, real-device, active-voice or hardware gate.
  No application source/build changed in this diagnostic pass.

## Kosovo boundary reconciliation audit (2026-09-05)

- Added a read-only, source-SHA-verified topology audit at
  `scripts/audit_country_boundaries.py`. It compares the staged Natural Earth
  candidate to the exact current `public/europe.geojson` and performs area checks
  in EPSG:3035. It neither writes nor activates masks.
- The 10,913.075 km² candidate overlaps existing masks by RS 10,605.106 km²,
  AL 151.385 km², MK 108.474 km² and ME 48.116 km². A simple carve produces valid,
  non-overlapping polygons and nearly identical regional union (0.000166 km²
  numerical difference), but would reassign about 308 km² of the existing
  AL/MK/ME selection masks. Topological cleanliness does not establish source
  accuracy, and these are source discrepancies, not real jurisdiction changes.
- Direct replacement of the four neighbouring countries would also change
  boundaries adjoining unchanged countries and coastlines. AL/MK/ME differ from
  the current shapes by 1,099.812 / 855.319 / 988.256 km² respectively. A consistent
  source migration or the platform's approved authoritative boundary layer is
  required before activating XK land clipping. The old NO source geometry is
  invalid too (the land loader already applies make_valid).
- Rechecked Natural Earth's published terms and dataset notes: public-domain
  reuse is permitted, while the source uses generalised 1:10 million cartography
  and a default de facto boundary view. It is not a parcel-precision or legally
  authoritative siting boundary. See the staged source README for direct links,
  hashes, results and the reproducible command.
- Active country masks remain unchanged. The script completed successfully;
  no frontend source/build or running backend changed in this audit. The Kosovo
  country-source decision and activation gate remain open.

## Full-Europe overlay test and lazy carrier entry (2026-09-05)

- The real text agent loaded all 34 supported countries at NUTS3 with Grid only.
  Independently inspected the controls and map: 957 power assets and 1,515 links.
  This is the supported catalogue scope, not every European jurisdiction.
- Browser testing exposed eager first-time overlay entry: all five carriers were
  selected by default. Opening the legend therefore loaded unrelated databases.
  The default now follows the current single-carrier workspace until first entry;
  additional carriers load on explicit selection. Valid saved selections are
  retained/deduplicated, rather than overwritten. Old saved all-carrier choices
  remain all-carrier choices; they cannot safely be distinguished from user intent.
- Also reproduced an empty-overlay reload case: unavailable in-memory power was
  correctly removed from the selection on reload, but reopening the overlay after
  loading a network did not restore any carrier. Explicit entry now selects the
  current carrier when the selection is empty. This does not claim unloaded power
  is present or automatically resurrect a carrier the user hid in an active view.
- Six new actual-App regressions cover missing, malformed and unsupported saved
  selections; switching workspace before first overlay use; retaining saved
  multi-carrier choices; and recovering after a reload. They verify request absence
  for unselected systems, explicit methane loading, power-link retention and no
  viewport command on the tested toggles. All tests exercise real App wiring with
  fixture responses, not a substitute selection implementation.
- Live post-change Europe NUTS3 + methane + water loaded 28,775 assets and 23,903
  links: power 957/1,515; methane 3,532/4,360; water 24,286/18,028 (assets/links).
  Liquids/logistics remained unselected and displayed Not loaded. Removing methane,
  then water retained power's 957 assets/1,515 links; the rendered map visibly
  returned to electricity alone. Hiding geographic boundaries exposed the lines
  without removing the grid. The map transform stayed translate3d(0px, 0px, 0px)
  through these filter operations; settled DOM counts remained 3 canvases and
  14 Leaflet panes, with no captured console errors. During redraw the old frame
  remains visible with Drawing network feedback until its replacement commits.
- The map reported 108 unmapped links in the three-carrier view and one in the
  power-only view. This test does not certify source topology completeness; those
  records still require diagnosis. The 23,770 rendered three-carrier links were
  the viewport subset, not an assertion that every loaded link has geometry.
- Development refresh cleared the QA tab's in-memory network after the source
  change; the second real all-Europe command reloaded it before final verification.
  Boundaries were restored to shown, overlay turned off and the QA tab closed.
  No microphone, main backend replacement or country-mask migration was involved.
- Final frontend suite: **399 tests / 42 suites passed** (74.693s). Root build
  `main.9e6de457.js` compiles at **353.29 kB gzip**; `/atlas/` build
  `main.1fce1c6d.js` at **353.3 kB**, both with **19.62 kB** CSS
  (`main.0cca2bfa.css`). All **9 compiled-preview HTTP tests** pass against the
  final subpath build. The known Node fs.F_OK deprecation warning remains.
- This supplies large-map functional evidence, not a constrained-laptop latency
  or heap measurement. The ordinary-hardware, voice and integration gates below
  remain open.

## Unmapped-link diagnosis and multipart river repair (2026-09-06)

- `app/scripts/audit-unmapped-links.mjs` reproduces the live 34-country NUTS3
  overview's 108 undrawn links using the production geometry resolver: one power,
  71 methane and 36 water. None is an off-screen link miscounted as missing.
  GB's `link-relation/20164710-320-DC` joins co-located `UKM61__AC_sn0` and
  `UKM61__DC_sn1` buses at (-4.406972, 58.081344), with no separate source route.
  The methane routes have coincident source points. Across the source gas DB,
  all 79 coincident routes also have no distinct points in the last raw CSV row
  for that ID (matching the builder's replacement semantics). These records
  remain loaded; no pipe shapes or interpretations were invented.
- All 36 water failures are recoverable ingestion errors. The WFD importer used
  `max(paths, key=len)`, discarded other branches, and sometimes selected a
  coincident fragment. All 36 have drawable paths in the cached raw source.
  Across that cache, 3,665 of 6,643 rivers have multiple paths, so choosing one
  also understated the other rivers' extent.
- The builder now preserves every supplied path/vertex as MultiLineString data.
  The API exposes `coordinate_paths` and a single-path fallback; existing flat
  DB rows retain their API contract. The frontend validates/caches multipart
  geometry, retains separate Leaflet paths, calculates union bounds and anchors
  labels on a real path. Coincident fragments are not drawn, and disconnected
  branches are never joined. The UI now says Undrawn links and explains both
  co-location and missing coordinates rather than implying every record is unlocated.
- Backend `scripts/stage_water_multipart.py` stages a new DB and refuses existing
  targets. Candidate `data/water/candidates/multipart-20260906/atlas_water.db`
  is 100,450,304 bytes, SHA256
  `48fbb6c5cd0165464838be63de6928277272c4300434159018eaf96cb1bd93a5`.
  Its `.audit.json` sidecar records all source/raw hashes. All 54,688 connection
  records and every non-geometry field, facility and source-registry row compare
  equal; integrity_check passes. Source DB remains unchanged at SHA256
  `c73365930e3c6c64926c8bb3f8a4a82a27a1550c98f0b4c80f174c11af6cf99d`.
- `tests/smoke_water_multipart.py` verifies the candidate via in-process Flask
  and production JS geometry. The 34-country Grid response retains 24,286 assets
  and 18,028 links; undrawn water links fall 36 -> 0, with no drawable link lost.
  That scope retains 251,289 drawable paths / 556,076 vertices. The complete
  candidate preserves 273,800 source paths / 603,758 vertices, including coincident
  fragments. All response metadata and facilities compare equal.
- The complete water response grows from 48,329,513 to 57,979,654 identity bytes,
  or 2,317,384 to 4,081,548 gzip bytes. Node preparation of baseline + candidate
  geometry took 232.22ms; ten cached candidate passes took 37.26ms. These are
  host algorithm measurements, not browser rendering or ordinary-laptop evidence.
  Do not suppress valid source branches to meet a performance benchmark.
- Three backend tests pass (1.44s). Combined regression coverage includes real Leaflet
  MultiLineString construction, >48 vertices, coincident paths, source identity,
  no fabricated joins, union bounds and actual map features/statistics. Final
  frontend suite: **402 tests / 42 suites** (73.154s). Root build
  `main.e617fc01.js`: **353.52 kB gzip**; `/atlas/` build `main.c611f902.js`:
  **353.53 kB**; CSS **19.62 kB** (`main.0cca2bfa.css`). All **9** final
  compiled-preview HTTP tests pass.
- Staged only: no main backend, runtime mirror, source DB, user tab or country
  mask was replaced. The prior activation denial was not bypassed. No live browser
  claim is made for repaired rivers; coordinated API/data/frontend activation and
  browser checks remain open. A direct EEA refresh check was unavailable; the
  repair uses hashed cached source geometry, not a new higher-precision download.

## Multipart viewport workload reduction (2026-09-06)

- Complete river records can contain thousands of separate paths (the largest
  staged record has 2,817 paths / 5,642 vertices). Previously a river's union
  extent admitted every branch to Leaflet when any part was near the viewport.
  Multipart selection now retains only paths whose conservative bounds intersect
  the view plus the existing 10% pan buffer. Crossing paths and closed loops are
  retained even with endpoints outside the view; no source record/vertex is edited.
- Per-path bounds use Float64Array storage (8,041,248 bytes for the 34-country
  staged water scope). This is an explicit memory tradeoff for less projection,
  clipping and drawing work. Source-keyed caches remain weak; each geometry keeps
  at most one partial viewport selection, not a pan history. Unchanged selections
  retain coordinate identity, and fully visible extents skip per-branch scans.
- The production-map test pans from one disconnected branch into an empty gap,
  then to the other branch and back: visible paths update, original data remains
  intact and undrawn-link count stays zero. An initial assertion read old mock
  props after the layer unmounted; adding a mounted-layer assertion confirmed
  that the empty frame is cleared correctly. No empty-frame app fix was needed.
- The in-process real-data smoke checker independently recomputes every path's
  geometry/bounds and verifies exact intersection-set equality and cache identity.
  With explicit test bounds (without the UI buffer), paths/vertices sent onward:

  | Test extent | Paths before -> after | Vertices before -> after |
  | --- | ---: | ---: |
  | Europe overview (-25..45, 34..72) | 251,025 -> 251,025 | 555,117 -> 555,117 |
  | Central Spain (-4.5..-3.1, 39.6..40.9) | 1,100 -> 859 | 2,204 -> 1,720 |
  | Western Norway (5..8, 60..62) | 21,885 -> 19,603 | 43,873 -> 39,281 |
  | Local source-derived view (6.998..7.038, 60.223..60.263) | 3,153 -> 59 | 6,316 -> 118 |

  Every intersecting source path remains. Last Node selection timings were
  4.74 / 3.52 / 3.87 / 2.04ms respectively; these are single-run host algorithm
  measurements, not browser frame times or ordinary-laptop speedups. The staged
  API still restores all 36 river shapes, preserves 24,286 assets / 18,028 links
  and matches all baseline non-geometry metadata. Database/payload sizes unchanged.
- Browser regression against the unchanged live single-route API: France + Spain
  at NUTS3 loaded 139 power assets / 264 links, with water adding 6,384 assets /
  2,100 links. Zoom out/back changed rendered links 1,873 -> 2,312 -> 1,873;
  hiding water retained all 264 power links. Map transform remained
  translate3d(179px, -238px, 0px), settled counts 3 canvases / 14 panes, no captured
  console errors. The separate QA tab was closed; no microphone or user-tab
  manipulation. This verifies legacy-route compatibility, not live multipart
  deployment or new-branch browser performance.
- Final frontend suite: **406 tests / 42 suites passed** (70.655s). Root build
  `main.d43c435c.js` compiles at **354.06 kB gzip**; `/atlas/` build
  `main.7be1fee7.js` at **354.07 kB**. CSS unchanged **19.62 kB**
  (`main.0cca2bfa.css`). All **9** final compiled-preview HTTP tests pass.
  No backend/runtime/database activation in this pass. The staged multipart
  release and target-hardware/browser gates remain open.

## Mapped utility route fidelity (2026-09-06)

- Audited every cached OSM water-pipeline record. All 14,610 are LineStrings,
  so the current snapshot has no multipart pipeline branch loss. However, the
  importer permanently simplified bends at 0.002 degrees and capped vertices:
  137,860 source vertices became 33,262 stored vertices; 9,001 pipes lost vertices.
  Projected EPSG:3035 Hausdorff differences from the cached source exceed 100m
  for 1,638 routes and 500m for two (both in Turkey, outside the 34-country power
  catalogue). These are differences from cached OSM, not surveyed accuracy.
- Replaced the lossy ingestion helpers with `osm_pipeline_geometry`. It preserves
  all 2D source vertices at the existing six-decimal precision, supports separate
  MultiLineString parts for future inputs, and rejects missing/non-line WKT.
  Leaflet still applies zoom-dependent screen-space smoothing. No utility pipe,
  capacity, endpoint relationship or route between disconnected parts is inferred.
- Extended the staging workflow to include utility geometry alongside WFD rivers.
  New combined candidate: backend
  `data/water/candidates/all-routes-20260906/atlas_water.db`, 103,866,368 bytes,
  SHA256 `7e0169b58a9ba08ad722d593fdff262dfb4ccf59697508cdc917d8e57fcb420d`.
  Its audit sidecar records raw/source hashes, integrity and exact preservation
  of all 54,688 connection records, non-geometry fields, facilities and source
  registry. The previous river-only candidate and original DB remain untouched.
- `scripts/audit_water_route_fidelity.py --candidate <candidate>` independently
  compares every proposed route to cached WKT and verifies exact vertex equality
  at six decimals. It rejects non-finite distance metrics. The largest computed
  rounding difference is 0.0933m; seven candidate comparisons emitted numerical
  warnings despite finite results, recorded in the diagnostic output. Exact
  coordinate equality is the primary evidence, not that distance estimate.
- In-process Flask + production JS checks retain 24,286 assets / 18,028 links
  in the 34-country Grid response, with undrawn water links 36 -> 0. The scoped
  utility routes restore 26,107 -> 109,138 vertices across 7,329 changed shapes.
  All non-geometry response fields and facilities compare equal, while the
  multipart intersection/identity assertions continue to pass.
- The combined scoped response is 59,771,598 identity bytes / 4,648,492 gzip
  bytes, versus the river-only candidate's 57,979,654 / 4,081,548 bytes. Keeping
  mapped utility bends adds 1,791,944 identity bytes / 566,944 gzip bytes. This
  adds source fidelity, not a claim that network transmission or initial drawing
  became faster. Target-hardware measurements remain required.
- Six backend geometry tests pass (1.27s), including >48 vertices, future
  disconnected parts, unsupported geometry and unchanged legacy API rows. Frontend
  product code/builds did not change; the preceding 406-test/build evidence still
  applies. The extended real-data checker ran successfully against the new candidate.
  No browser, microphone, source DB or runtime activation in this pass.
- Also found `verify=False` and suppressed TLS warnings in the existing water
  downloader. No downloads were performed by this pass; cached-source hashes do
  not retroactively establish transport authenticity. This is now an explicit
  ingestion/deployment gate to fix and test, not an accepted production default.

### Ingestion trust and water-refresh recovery — 2026-09-06

- Audited `scripts/*.py` in the source backend. Found eight request call sites
  bypassing certificate checks across water, liquids, logistics and grid access,
  plus four global TLS-warning suppressions. Removed those overrides and the
  unused water `ssl` import. Requests now uses its verified default trust or
  configured `REQUESTS_CA_BUNDLE` / `CURL_CA_BUNDLE`; SSL failures propagate without
  a retry/downgrade in each HTTP helper. The gas builder reads local inputs and
  had no equivalent request override. Repeated search found no remaining matching
  overrides in this scripts directory; this is not an audit of every dependency.
- Added request-boundary tests for all eight helpers, after Requests merges the
  environment: default verification, either CA-bundle setting, certificate-failure
  propagation, and both strict and explicitly stale queue snapshot recovery.
  These tests intercept transport; they do **not** prove a publisher TLS handshake.
- Added an opt-in real loopback HTTPS suite with generated test certificates.
  This host resets even the direct trusted SSL self-check with Windows error
  10054. It remains a failed/unverified integration gate, not a passing result.
  Enable with `NOHM_RUN_LOCAL_TLS_TESTS=1`; test-only dependency `cryptography`.
  No machine trust, firewall, proxy, service or certificate-validation setting
  was weakened to get the tests to pass.
- Water/liquids/logistics compressed JSON caches now use unique same-directory
  temporary files, finish gzip, flush/fsync and atomically replace. Serialization
  or replacement failures leave the previous cache byte-identical. Water ArcGIS
  HTTP-200 error/malformed responses and invalid QLever TSV headers cannot become
  cached empty datasets. Valid empty country feature lists remain supported.
- Water rebuild previously unlinked the serving DB before fetching sources.
  It now builds a separate candidate, refuses failed-country/empty candidates,
  checks SQLite integrity and finishes exports before publication. A persistent
  OS-held writer lock prevents overlapping water jobs; this is not a PID file
  to remove after a crash. DB publication uses atomic replacement without unlink.
  Ordinary publication failures roll back changed exports. If rollback itself
  fails, the job reports and retains its staging directory/remaining backups.
- Verification: **79 passed, 43 explicitly skipped** in **24.37 s** for ingestion
  recovery/trust, water geometry and existing grid-access regressions. Covered
  partial serialization, TLS/source errors, error payloads, failed export,
  empty/incomplete build, denied sidecar/DB replacement, failed rollback with
  recovery retention, writer-lock release, and a successful real SQLite/Parquet/
  manifest build against fixture data. All four builder `--help` entry points and
  compilation passed. A separate enabled TLS self-check **failed** as above.
- No live source refresh or database activation was performed. Original water
  DB SHA256 remains `c73365930e3c6c64926c8bb3f8a4a82a27a1550c98f0b4c80f174c11af6cf99d`;
  combined staged candidate remains
  `7e0169b58a9ba08ad722d593fdff262dfb4ccf59697508cdc917d8e57fcb420d`.
  No frontend change or browser/microphone interaction in this pass.
- Still required: verified real-publisher HTTPS on the deployment host; full
  publication/failure review for liquids/logistics/queue; crash-consistent
  multi-artifact generations (water's sidecar rollback is not a transaction
  across a process/power loss); full source coverage/schema/freshness validation
  and archive extraction/download recovery. Existing cached hashes cannot
  retroactively establish the authenticity of past unverified downloads.

### Short-window EMIL layout and keyboard recovery — 2026-09-06

- Reproduced a real layout defect in a separate IAB tab at **800×450**: EMIL's
  panel had 252 px client height but 289 px of overflowing content. The composer
  extended to y=469.5 below the panel's y=434 edge and the 450 px viewport;
  the conversation was only 32 px tall (effectively its padding).
- Added collapsible voice/map settings. At heights up to 600 px they start
  collapsed; opening settings temporarily uses the conversation area, with its
  own scrolling body. The composer remains available. Sending a typed instruction
  returns to the conversation. Larger windows initially retain expanded settings;
  growing the window does not override a user's collapsed choice.
- The height-breakpoint listener moves focus to the settings toggle before
  hiding a focused control. Drafts, settings and the mounted conversation are
  retained; conversation scrolling pauses while its area is covered, preserving
  an older reading position. Added an always-accessible active-voice Stop button
  in the header, separate from Stop Speech and the fallback Record button.
- Browser verification with real Belgium NUTS3 data:
  - 800×450: panel client/scroll height both 252 px; message input ends at
    y=425.75 inside the panel. Conversation is about 114 px tall.
  - 800×400: panel client/scroll height both 202 px; input ends at y=375.75,
    inside the y=384 panel edge; conversation 63.5 px.
  - 600×450, 1024×640 and 1280×720: no horizontal document overflow or composer
    clipping. Collapsed-settings conversation heights 113.5, 279.5 and 335.5 px.
  - Keyboard Enter toggles settings; a draft survives. Resizing from an expanded
    1280×720 settings view to 800×450 moves focus from Command Stream to the
    visible settings toggle. The settings body scrolls without overflowing its
    enclosing panel. Final screenshot checked and no captured console errors.
  - Submitted **“Zoom in one step”** from the open settings view. Conversation
    returned immediately; the live planner/judge reported a verified **6→7** zoom.
    Subsequent settings toggles preserved the map-pane transform and reply.
- Added hook and actual-App regressions for defaults, value retention, media
  listener cleanup, focus recovery, retained draft/reading position, no network
  reload or geometry mutation, and accessible stop controls with both realtime
  and upload voice transport fixtures. These do not replace real-microphone tests.
- Final root build: `main.cda304b3.js`, **354.47 kB gzip**. `/atlas/` build:
  `main.9ce8f8de.js`, **354.47 kB gzip**; CSS `main.fc4961ff.css`, **19.75 kB gzip**.
  Both compiled successfully; **9 compiled-preview HTTP tests passed**. Known
  Node `fs.F_OK` deprecation warning remains unrelated to runtime rendering.
- Final full frontend regression run after the last edit: **411 tests / 43
  suites passed**, **74.177 s** (`CI=true npm test -- --watchAll=false --runInBand --silent`).
- Viewport override reset and the test tab closed. No microphone, source-data
  update or backend activation in this pass. This is responsive-layout evidence,
  not an 8 GB/four-core performance or real-voice certification.

### Avoid repainting hidden network construction buffers — 2026-09-06

- Inspected the installed Leaflet Canvas implementation and the production
  `BatchedNetworkLayer`. Construction yielded in small batches, but every batch
  scheduled another repaint of the growing **hidden** replacement graph. CSS
  visibility does not prevent JavaScript Canvas drawing work.
- Added an opt-in deferred-drawing mode to the owned `AtlasCanvas` subclass.
  It suppresses scheduled/synchronous hidden repaints while keeping normal path
  projection and geometry updates. At successful construction completion it
  paints the full current buffer once, before the existing pane/frame handover.
  The final paint is inside the existing failure boundary: failure discards the
  replacement and retains the previous committed graph. Superseded hidden
  buffers can be removed without painting. Other Atlas canvases retain their
  normal redraw behaviour and the previous orphan-RAF lifecycle fix.
- Real installed Leaflet test, substituted 2D context/RAF, with 2,000 overlapping
  route fixtures in 20 batches: the former path performed **20 canvas clears /
  21,000 route paint calls**; deferred drawing performed **one clear / 2,000
  paint calls**. This is a deterministic work-count comparison, **not** an
  end-to-end speedup or frame-time claim for an ordinary work laptop. Final
  painting still scales with visible route complexity.
- Added checks for final-paint failure, no painting during cancellation or
  synchronous reset, idempotent completion, and resumed normal redraws after
  commit. Real Leaflet LineString/MultiLineString objects produce the same
  ordered move/line/dash/stroke commands in both paths, including separate
  multipart paths and methane/water styles. No route vertices or source features
  are discarded by this optimisation. Keep these private-method tests when
  upgrading the installed Leaflet version.
- Browser smoke in a separate IAB tab, using the existing runtime/data:
  France + Spain NUTS3 loaded 139 electricity assets/264 links, 909 methane
  assets/1,045 links, and 6,384 water assets/2,100 links. Combined view was ready
  with 2,904 rendered links; zoom-out/in produced 3,343 then 2,904. Node and
  boundary display toggles retained the graph. Hiding water left 1,295 rendered
  power/methane links; hiding methane then left **all 264 electricity links**.
  Combined and power-only screenshots checked; no captured console errors.
- Full-nodal replacement also completed for both countries: status reported
  **2,282 buses / 3,129 AC lines / 8 DC links**, with capacity styles visibly
  drawn. Switching back restored **139 buses / 263 AC / 1 DC** and ready status.
  Settled views retained **3 canvases / 14 panes**. These loaded model counts
  are not a claim that every off-screen link is drawn. The combined view's 41
  undrawn-source records remain the existing data-quality limitation; the staged
  water geometry repair was not activated in this pass.
- Final frontend tests: **416 / 43 suites passed**, **77.703 s**. Root build
  `main.51313df3.js`: **354.56 kB gzip**; `/atlas/` build `main.67ac8095.js`:
  **354.57 kB gzip**; CSS unchanged at `main.fc4961ff.css`, **19.75 kB**. Both
  builds and **9 compiled-preview HTTP tests** passed. The existing Node
  `fs.F_OK` deprecation warning remains. No backend/source-data update or real
  microphone test; original display toggles restored and the QA tab closed.

### Geographic overview sampling and atomic overlay controls — 2026-09-06

- Replaced capacity-only overview thinning with a shared geographic sampler for
  network nodes and generation sites. It clips to the buffered viewport first,
  retains country/area representatives, spreads the remaining budget across
  Web-Mercator screen cells, preserves selected markers, and only then fills by
  network importance. Aggregate/cache nodes and editable region-solve handles
  are never removed. Below zoom 8 the point budgets step through 180, 360, 700
  and 1,400; full detail remains available when zoomed in. Links are not sampled.
- Multi-network overview allocation balances carriers while reserving enough
  capacity for every represented carrier/country combination when the point
  budget permits. Generation-mix view avoids drawing redundant generator dots
  behind pies and applies the same geographic policy to detailed generation
  sites. Dense-country, multi-country, five-carrier, viewport, selection and
  aggregate/editable-node invariants have deterministic regressions.
- Fixed a rapid carrier-toggle ownership race. Overlay event handlers now
  compose against a synchronously updated effective-selection ref, so clicks
  received before React publishes the preceding render cannot lose an addition
  or restore a hidden carrier. Async downloads populate caches only; their late
  completion or failure cannot re-enable a hidden carrier or publish a stale
  failure notice. A deliberately single-batch hide/add/add regression covers
  the pre-render timing window.
- Browser verification in an isolated IAB tab loaded Belgium NUTS3 with Power,
  Methane and Water together: **516 assets / 553 source links / 551 rendered
  links / 2 undrawn data-quality records**. Logistics remained hidden and
  cached. Country and Europe overview scales remained responsive and the
  carrier legend accurately reported the three visible systems. A separate
  all-Europe logistics check rendered exactly the 180-marker overview budget
  with materially broader geographic coverage than the former concentrated
  capacity sample; marker selection opened and retained its popup. Screenshots
  were checked and no captured console errors were present.
- Final targeted concurrency/render run: **252 tests / 4 suites passed**.
  Final full frontend run after the last edit: **756 tests / 61 suites passed**
  in **183.954 s**. Root build `main.94da0a9b.js`: **225.38 kB gzip**;
  `/atlas/` build `main.ffa2bf21.js`: **225.39 kB gzip**; shared vendor chunk
  **98.9 kB**, CSS **18.94 kB**. Both builds compiled successfully and all
  **9 compiled-preview HTTP tests passed**, including deferred-chunk and actual
  source-map module-graph checks. The existing Node `fs.F_OK` deprecation
  warning remains unrelated to browser runtime.
- Removed six unreferenced prototype dependencies from the deployment manifest:
  Google Maps wrapper, Mapbox GL, OpenLayers, React Map GL, React OpenLayers and
  web-vitals. Source/import search found no consumers; the lockfile was rebuilt
  offline and shrank from 792,351 to 765,782 bytes. `npm audit` reports **0
  vulnerabilities**, an offline `npm ci --dry-run` accepts the cleaned lock,
  and the successful builds plus the repeated full suite verify that the
  supported Leaflet application graph remains intact. A later live registry
  audit in the adaptive-rendering pass below supersedes the earlier zero-total
  audit result: the shipped dependency set remains clean, while the legacy CRA
  build/test tree now has separately documented advisories.
- Catalogue recovery now pauses all automatic retry work while the document is
  hidden, retries immediately when it returns to the foreground, and backs off
  from 2 seconds to a 60-second ceiling while it remains offline. Expected
  connectivity failures are represented by the existing readable status and
  Retry-now control rather than repeatedly logging stack traces. A real-App
  fake-timer regression covers backoff, hidden-tab silence, foreground recovery
  and termination after success. With the backend deliberately unavailable, a
  fresh live browser reload showed the unavailable/retry UI and **0 new console
  errors or warnings over 12 seconds**.
- Removed the dormant prototype assistant/dashboard/results branches from the
  compiled application graph. Their only reachable controls had already been
  removed and the remaining state transitions could only reselect the active
  Atlas map. The production source map now excludes both `Chatbot.js` and
  `LogStreamer.js`; the preview suite asserts that they cannot silently return
  to the startup bundle. This reduced the main bundle from **253.41 kB to
  225.38 kB gzip** (**28.03 kB / about 11%**) and reduced App's mapped generated
  code by **117,737 characters**, with the complete regression/build/preview
  gates above and a separate live-browser visual check of the unchanged Atlas
  shell.
- The temporary QA tab was closed and its no-country, Methane + Logistics
  overlay state restored. No microphone audio, backend activation or source-data
  refresh was performed. This remains functional/render-work evidence on the
  available workstation, not a four-core/8 GB hardware certification.

### Adaptive laptop rendering and deployment dependency boundary — 2026-09-06

- Replaced the hidden boolean performance toggle with a reachable three-way
  **Adaptive / Quality / Speed** control at the top of More Settings. Adaptive is
  the default for new users and switches to the lighter Canvas/marker path for
  Data Saver, reduced-motion preference, devices reporting no more than 4 GB or
  4 logical processors, at least 1,800 visible links, or at least 2,200 visible
  facilities. Quality and Speed explicitly override every automatic decision.
  Existing `0`/`1` local-storage values migrate to the equivalent explicit mode;
  storage failure falls back safely to Adaptive.
- Added deterministic policy tests for legacy/current preference migration,
  blocked storage, constrained hardware, Data Saver, reduced motion, both map
  density thresholds, an ordinary light map, and manual override precedence.
  The effective choice is calculated from already-derived visible counts and
  does not add a map-data traversal.
- Browser-controlled verification used a separate IAB tab. The final UI exposed
  the radiogroup with correct selected state and readable explanation, Speed
  survived a full reload, and the original Quality preference was restored.
  The updated map shell and iconography were visually checked; the QA tab was
  closed. Because the backend remained deliberately unavailable, this verifies
  the control/persistence/offline shell, not real-data frame times.
- Reconciled the deployment manifest with the installed/tested icon runtime by
  pinning `lucide-react` **0.468.0**. Browser runtime dependencies are now only
  React, React DOM, Leaflet, React Leaflet, Lucide and Recharts; React Scripts,
  Tailwind, PostCSS, types and testing libraries are correctly development-only.
  The lock pins the audited Lodash **4.18.1** fix. `npm audit --omit=dev` reports
  **0 production vulnerabilities**, and `npm ci --dry-run --ignore-scripts`
  accepts the lock. The obsolete CRA build/test tree still reports **31
  development-only advisories** after safe non-breaking lock fixes; replacing
  that toolchain is separate integration work and no forced/breaking audit fix
  was applied. An isolated temporary clean-install build was rejected before it
  started because execution policy blocked the verified temporary-directory
  cleanup operation; it was not bypassed, so the dry-run is lock-consistency
  evidence rather than a clean-environment build.
- Retained synthetic hot-path measurements at 1,500 routes / 750,000 vertices:
  cached map-key median **0.892 ms** versus **280.069 ms** for the former key,
  and route preparation **27.419 ms** versus **270.692 ms**, with identical
  geometry and all 750,000 source vertex pairs reused. These exclude fetch,
  parse, React, Leaflet drawing and browser frame time; they are algorithm
  evidence, not target-laptop certification.
- The final post-cleanup frontend run passed **771 tests / 62 suites** in
  **198.537 s**. The preceding focused actual-App, startup and adaptive-policy
  run also passed **187 tests / 3 suites** in **156.982 s**. Root build
  `main.913644b9.js`: **226.10 kB gzip**; `/atlas/` build
  `main.fadf3d8a.js`: **226.11 kB gzip**; shared vendor **98.9 kB**, CSS
  **18.98 kB**. Both builds compiled successfully and all **10 compiled-preview
  and deployment-boundary tests passed**, including the actual `/atlas/`
  artifact, deferred chunks, source-map exclusions and runtime/dev manifest
  separation. The main bundle remains **27.31 kB / about 10.8%** below the
  253.41 kB pre-cleanup baseline while adding adaptive controls.
- A no-unused source audit then removed **24 fully orphaned state hooks** and
  their unused setters from the mounted App component. They belonged to removed
  prototype filters/panels and had no lexical consumers; no active value or
  one-sided setter was removed. This reduced App's warning inventory from 121
  to 73 and avoids their state allocation/bookkeeping on every render. The
  post-cleanup actual-App tests and both final production builds above are the
  verification boundary.

### Keyboard and map accessibility closure — 2026-09-06

- The Leaflet surface is now exposed as a named `region` — **Interactive
  infrastructure map** — and publishes its arrow-key and zoom shortcuts through
  `aria-keyshortcuts`. This makes the primary workspace discoverable in a
  screen-reader landmark list without applying the overly broad `application`
  role or interfering with Leaflet's native keyboard implementation.
- Attribute ownership is reversible: unmount restores pre-existing values and
  only removes values that Atlas still owns. A component-level regression
  verifies the name, role, shortcut contract and non-clobbering cleanup. The
  complete camera/map suite passed **54 tests**, including reduced motion,
  one-shot AI camera commands, overlay stability, point/line sampling and popup
  keyboard behaviour.
- Browser-controlled verification in an isolated IAB tab observed the named
  map region in the live accessibility tree alongside the carrier selector,
  domain controls, layer toggles and camera controls. The earlier keyboard pass
  in this readiness run verified the top-level Tab order, initial modal focus,
  Escape dismissal and focus restoration to **More Settings**. The temporary QA
  tab was closed without changing the user's open Atlas tab.
- Final post-change validation passed **772 tests / 62 suites** in **183.451 s**.
  Root build `main.0d0eecd1.js`: **226.25 kB gzip**; `/atlas/` build
  `main.c0b2b75a.js`: **226.26 kB gzip**; shared vendor **98.9 kB**, CSS
  **18.98 kB**. Both production builds compiled successfully and all **10
  compiled-preview/deployment tests passed** against the actual `/atlas/`
  artifact. The live frontend returned HTTP **200**. Port 5001 remained offline,
  so live country data, provider-backed AI and microphone voice are explicitly
  outside this evidence boundary.

### Constrained-browser startup budget and offline typography — 2026-09-06

- Added `npm run test:browser-budget`, a dependency-free Chrome DevTools budget
  runner for the actual optimized `/atlas/` artifact. It starts the loopback
  preview on an ephemeral port and Chrome in an isolated temporary profile at
  **1366×768**, emulates a **4× slower CPU** plus **10 Mbps / 40 ms** network,
  and measures separate cache-disabled cold and cache-enabled warm navigations.
  The runner cleans up its verified temporary profile and preview server.
- The gate covers elapsed startup, LCP, aggregate long tasks, cumulative layout
  shift, JS heap, genuine network failures and the live map accessibility name.
  Defaults are cold/warm completion ≤ **8,000/5,000 ms**, cold/warm LCP ≤
  **5,000/2,500 ms**, long-task total ≤ **3,000 ms**, CLS ≤ **0.1**, heap ≤
  **160 MB**, zero non-cancelled request failures, and a named Atlas map. A tiny
  same-origin favicon request primes one-time Chrome profile/network startup;
  the browser cache is then cleared, so Atlas assets remain cold.
- Initial instrumentation correctly rejected the development server and then
  exposed a separate duplicated font dependency: HTML loaded Inter while CSS
  loaded Manrope from Google. Both third-party requests were removed. Atlas now
  prefers locally available Manrope and otherwise uses Segoe UI/system UI,
  retaining a close Nohm appearance without external font latency, tracking or
  failure on restricted enterprise networks. The compiled-preview test asserts
  Google Fonts cannot silently return to HTML or CSS.
- Definitive constrained run against `main.c0b2b75a.js` passed: cold/warm elapsed
  **3,775/1,913 ms**, LCP **3,180/812 ms**, FCP **3,020/704 ms**, JS heap
  **6.8/12.2 MB**, CLS **0.005/0.005**, and **0/0 genuine request failures**.
  The 49/47 cancelled requests are expected Leaflet retirement of obsolete
  tiles during automatic framing, now reported separately from failures. This
  run covers the no-country startup shell; it does not substitute for a loaded
  all-Europe network or long-session memory profile.
- Final regression/build evidence after the font and budget work: **772 tests /
  62 suites passed** in **178.858 s**. Root build `main.0d0eecd1.js`: **226.25
  kB gzip**; `/atlas/` build `main.c0b2b75a.js`: **226.26 kB gzip**; shared
  vendor **98.9 kB**, CSS **18.95 kB**. Both builds compiled and the exact final
  `/atlas/` artifact passed all **10 deployment tests** plus the constrained
  browser budget.

### Geography-aware OpenAI Live transcription — 2026-09-06

- Atlas now requests Nohm's dedicated `type: transcription` WebRTC contract,
  served by `gpt-live-transcribe`, instead of using the generic
  `gpt-realtime-2` voice-routing session with `gpt-realtime-whisper` input
  transcription. This is the same dedicated contract already exposed by the
  Nohm platform at `/api/nohm/voice/realtime/client-secret`.
- Atlas supplies country/place names and energy-system vocabulary through the
  model's `prompt` and `keywords` fields. These are transcription hints, not
  deterministic rewrites: the speech model still decides what was spoken and
  the planner/judge still decide what the request means. This directly targets
  valid-word confusions such as “France” becoming “friends” or “fonts” without
  teaching shared platform logic project-specific parsing rules.
- Browser-side pause detection commits speech after 750 ms of silence and caps
  a continuous turn at 20 seconds. It releases the detector, audio context,
  cloned tracks, timers and pending turns on Stop. Browsers without the required
  Web Audio capability fail over to the existing push-to-talk transcription
  path instead of displaying false live readiness.
- The standalone Flask adapter now implements the same dedicated session shape,
  bounded prompt/keyword input and automatic-language default as the Nohm
  endpoint. The voice panel identifies the active route as **OpenAI Live STT**
  or **Push-to-talk STT**, with the exact live model in its tooltip.
- Focused verification passed **29 Python voice-route tests** and **41 frontend
  tests** across the WebRTC transport, voice hook and App startup. A real
  microphone/accent/background-noise evaluation remains required; automated
  tests deliberately do not grant microphone permission or record user audio.
- Final combined verification passed **778 frontend tests / 62 suites** and all
  **11 compiled-preview deployment checks**. The deployable `/atlas/` build is
  `main.4cd5ee15.js` (**227.49 kB gzip**), with the **98.9 kB** shared vendor
  chunk and **18.95 kB** CSS.
- Both constrained Chromium budgets passed at 4x CPU slowdown and 10 Mbps /
  40 ms networking. The loaded Spain matrix passed for Grid, Storage, Supply
  and Demand; the Supply overview now retains country/area and capacity
  coverage at **2,494 live DOM nodes** and progressively reveals the complete
  generation fleet as the user zooms in. Cold/warm shell LCP was **3.048 s /
  0.756 s**, with no failed requests and peak matrix heap **65.2 MB**.

### Land-opacity tile-cache stability — 2026-09-06

- Land opacity is no longer part of the raster URL or React layer key. Atlas
  requests one fully opaque tile set per data version/category/country/XYZ
  selection and updates Leaflet's layer opacity in place. A slider drag therefore
  retains the active tile layer and reuses both browser and server caches; genuine
  category, country and dataset-version changes still select new tiles.
- The real React-Leaflet adapter's `updateGridLayer` path was inspected and calls
  `setOpacity` when only that prop changes. A production-component regression
  changes opacity from 35% to 82%, verifies the URL is identical and the land
  tile layer mounts exactly once. The focused map suite passes **55 tests**.
- An isolated browser-control check opened the actual Land & Constraints panel,
  moved its accessible slider to 100%, observed the immediate label/value update,
  restored the original 35% preference and closed the QA tab. The local land API
  was offline during this visual check, so actual raster request reuse is proven
  by the component/lifecycle test rather than live network capture in this run.
- The final `/atlas/` artifact passes both constrained Chromium budgets. The
  loaded Spain Grid/Storage/Supply/Demand matrix completed in **10.996 s** total,
  peaked at **64.3 MB** heap, and retained the **2,494-node** Supply ceiling with
  zero failed requests. All **778 tests / 62 suites** and **11 deployment checks**
  pass for this same build.

### Demand-loaded Europe boundary geometry — 2026-09-06

- The 1,499,884-byte Europe GeoJSON is no longer fetched by an empty workspace.
  It is requested only when country boundaries, scoped land context, a country-fit
  command or the build animation actually needs it. The request is cancellable,
  rejects HTTP failures and validates the GeoJSON container before publication.
- A production-map regression proves the empty/boundaries-hidden render makes no
  boundary request and that enabling a real France boundary demand makes exactly
  one. Country-fit, active-country, land-scope and loaded-Spain tests remain green.
- Under 4x CPU slowdown and 10 Mbps / 40 ms networking, empty-workspace cold
  transfer fell from **2.3 MB to 0.8 MB** and warm transfer from **1.4 MB to
  effectively zero**. Cold/warm LCP was **3.348 s / 0.804 s**, heap **5.2 / 7.3
  MB**, and failed requests **0 / 0**. The final loaded-Spain matrix also passes:
  Grid completed in **4.288 s** and the three lazy domains in **12.057 s** total;
  peak heap was **51.1 MB**, Supply stayed at **2,494 live DOM nodes**, and no
  requests failed.

### Single-pass initial map camera — 2026-09-06

- Removed the mount effect that created the Leaflet map at `[50, 10] / z4` and
  immediately moved it to `[52, 8] / z5`. The immutable MapContainer now starts
  directly at the intended Europe camera, and its React zoom state starts at the
  same level. Later geography, user and EMIL movements retain their existing
  one-shot ownership rules.
- In the same 4x CPU / 10 Mbps / 40 ms Chromium profile, cancelled startup tile
  requests fell from **55 / 54 (cold / warm) to 0 / 0**. Resource entries fell
  from **73 / 89 to 25 / 39**; live startup DOM from **589 / 1,314 to 528 /
  1,164**. Cold/warm total time was **3.522 s / 1.759 s**, LCP **3.316 s /
  0.672 s**, and heap **5.1 / 6.5 MB**, with no failed requests.
- The final loaded-Spain matrix also passes with zero cancelled or failed
  requests: Grid **4.260 s**, the three lazy domains **12.145 s** total, peak
  heap **52 MB**, and Supply **2,494 live DOM nodes**. The component regression
  verifies the initial camera props and that mount performs no corrective
  `setView`. All **778 tests / 62 suites**, **11 deployment checks**, and both
  constrained browser budgets pass for `main.4cd5ee15.js`.

### Deferred carrier and solve controls — 2026-09-06

- Methane, water, liquids, logistics and regional-solve controls now use the
  existing fault-isolated deferred-panel boundary. The default electricity map
  no longer parses those independent interfaces at startup; each is fetched
  only when the matching carrier or solve panel is actually opened, and a
  rejected optional chunk retains the rest of Atlas plus a local retry action.
- The deployable `/atlas/` entry is `main.9778e372.js`, **222.82 kB gzip** —
  **4.67 kB** below the preceding build. The shared vendor remains **98.9 kB**,
  CSS **18.95 kB**, and the five new optional chunks are **2.02–3.56 kB gzip**.
- On the enforced 4x CPU / 10 Mbps / 40 ms Chromium profile, cold/warm shell
  completion was **3.823 s / 2.231 s**, LCP **3.152 s / 1.116 s**, and heap
  **5.1 / 5.8 MB**, with **0 failed and 0 cancelled requests**. Variance in
  third-party Esri tile latency explains the slower warm wall-clock sample;
  cached Atlas transfer remained effectively zero.
- The loaded-Spain matrix also passed on the same artifact: Grid **4.150 s**;
  Storage/Supply/Demand **12.246 s** combined; peak heap **50.5 MB**; Supply
  **2,494 live DOM nodes**; and **0 failed or cancelled requests**. The final
  verification is **778 frontend tests / 62 suites**, all **11 preview checks**
  (9 executed plus 2 integration checks intentionally skipped without a live
  candidate), and both browser budget commands.

### Direct land-opacity preview — 2026-09-06

- Range movement no longer publishes every intermediate percentage to the
  top-level Atlas state. It previews directly through Leaflet `setOpacity`,
  updates the accessible value/label immediately, and commits one persisted
  setting on pointer completion, keyboard adjustment or blur. The commit is
  deduplicated, so pointer release followed by blur produces one persistence
  action. The 2026-09-07 follow-up below removes the remaining App update from
  this production path. AI/external opacity changes continue to synchronise the
  range, label and layer.
- A production-component regression moves 35% → 82%, proves the parent callback
  is untouched during input, observes Leaflet at 0.82, then proves exactly one
  `{ opacity: 82, enabled: true }` commit. The original full-opacity tile URL and
  single-mount regression remains green.
- The definitive `/atlas/` artifact is `main.d9a4d550.js`, **223.12 kB gzip**,
  with **98.9 kB** shared vendor and **18.96 kB** CSS. All **779 frontend tests /
  62 suites** pass in **193.576 s**; the compiled-preview checks and both enforced
  constrained Chromium budgets pass.
- In the final 4x CPU / 10 Mbps / 40 ms runs, cold/warm shell completion was
  **4.660 s / 2.457 s**, LCP **4.248 s / 1.288 s**, and heap **4.7 / 5.5 MB**.
  The loaded Spain matrix completed Grid in **4.286 s** and its three lazy
  domains in **12.818 s**, peaking at **53.8 MB** heap and **2,498 live DOM nodes**.
  No request failed. The 26 cancelled requests during the initial Grid fit were
  superseded Esri basemap tiles from the intentional Europe-to-Spain camera move,
  not Atlas data or repeated opacity requests.

### Zero-render land-opacity commit — 2026-09-07

- The slider's completed value now goes to a presentation cache and local
  persistence directly. The top-level `landOverlay` React state is not scheduled,
  so releasing the range cannot reconcile the Atlas shell or rebuild its network
  children.
- Structural changes still compose from the cached latest opacity, and the map
  agent reads that latest value, preventing a subsequent category, country or AI
  action from restoring stale opacity.
- Regressions prove the presentation callback owns the commit, the ordinary land
  state callback is untouched, and the mocked full App publishes no additional
  map frame. The focused map/App suites pass **235/235** tests.
- In the live Belgium NUTS3 map, repeated 79% and 43% changes retained the same
  **32** fully opaque tile URLs, **5** canvas layers and **461** rendered links;
  only the existing layer opacity changed. The optimized `/atlas/` production
  build compiled successfully as `main.28f8f3a0.js` (**226.74 kB gzip**).

### Production-preview compression cache — 2026-09-07

- The production preview now negotiates gzip for compressible static assets and
  reuses a bounded **16 MB** compressed representation cache keyed by file size
  and modification time. Rebuilt assets cannot receive stale bytes; identity,
  `gzip;q=0`, HEAD and API-proxy behavior are preserved.
- A new preview regression verifies negotiation, decompression to the exact
  source bytes, repeated cache reuse and explicit gzip refusal. The preview
  contract passes **10 executable checks** with **2** live deployment checks
  intentionally skipped.
- On the standard **1366×768**, **4× CPU**, **10 Mbps / 40 ms** browser budget,
  cold shell transfer fell from approximately **0.8 MB to 0.3 MB**, completion
  from **3.582 s to 3.271 s**, and LCP from **3.216 s to 2.564 s**. Warm median
  completion/LCP was **1.733 s / 0.680 s** with approximately **0.1 MB** transfer.
  There were no failed or cancelled requests, layout shifts, clipped controls or
  accessibility defects.

### Laptop-height controls and compact loaded-network gate — 2026-09-06

- The electricity and multi-network Domain controls now use a fixed header and
  footer around one independently scrolling domain list. `More Settings` remains
  reachable instead of falling below the viewport when the available laptop
  height is constrained.
- The constrained Chromium budget accepts explicit viewport dimensions and now
  rejects horizontal overflow, an undersized map, or any enabled interactive
  control clipped outside the viewport. At compact widths it opens Domain
  controls and checks the actual expanded sidebar and footer geometry instead of
  treating the collapsed panel as coverage.
- The definitive `/atlas/` artifact is `main.b956395b.js`, **223.15 kB gzip**,
  with **98.9 kB** shared vendor and **18.96 kB** CSS. At **1366×768**, cold/warm
  completion was **3.446 s / 1.841 s**, LCP **2.832 s / 0.728 s**, and heap
  **4.5 / 6.1 MB**. At **1023×768**, cold/warm completion was **4.106 s / 2.030
  s**, LCP **3.384 s / 0.892 s**, and heap **4.4 / 6.3 MB**. Both runs had zero
  failed or cancelled requests, no horizontal overflow and no clipped controls.
  The compact expanded sidebar occupied y=76–728 and its `More Settings` action
  remained fully visible at y=669–715.
- The compact loaded-Spain matrix also passes: Grid completed in **4.376 s** and
  Storage/Supply/Demand in **12.739 s** combined, with **51.6 MB** peak heap,
  **2,479** Supply live DOM nodes and zero failed or cancelled requests. Final
  verification is **779 frontend tests / 62 suites**, all **11 preview checks**
  (9 executed plus 2 deliberately skipped without a live integration candidate),
  and both default and compact constrained-browser budgets.

### Persistent catalogue fallback and sampled warm-load gate — 2026-09-06

- A successful PyPSA catalogue response is now stored as a small versioned,
  sanitised record keyed by resolution and requested source. On a later offline
  reload Atlas restores that last verified catalogue immediately, explicitly
  labels it as saved, and keeps the existing visibility-aware reconnect loop
  active. Entries expire after 30 days; the cache stores catalogue metadata only
  and does not pretend that the network API itself is available. The saved-data
  status is a live region, so the offline recovery state is announced rather
  than conveyed visually only.
- Focused regressions cover metadata sanitisation, resolution/source isolation,
  malformed and expired records, and a real App reload where the catalogue API
  returns 503 while Belgium and France remain available in the country selector.
- The package homepage now fixes the production asset mount at `/atlas`, preventing
  a normal build from silently producing a root-only artifact. The compiled
  preview contract confirms subpath assets, extensionless navigation, safe proxy
  routing and failure semantics. The definitive entry is `main.6890bf58.js`,
  **224.22 kB gzip**, with **98.9 kB** shared vendor and **18.96 kB** CSS.
- Warm browser performance is now sampled three times. Latency budgets use the
  coherent median-LCP run, while every sample must still satisfy network, map,
  overflow and control-containment invariants and the peak heap is enforced. At
  **1366×768**, cold LCP was **2.904 s** and the warm median LCP was **0.644 s**,
  with **10.8 MB** peak reload heap. At **1023×768**, the final cold LCP was
  **2.828 s** and warm samples were **1.044 / 0.500 / 0.508 s**, with **10.2 MB**
  peak reload heap. No shell request failed or was cancelled and no control was
  clipped.
- The compact loaded-Spain matrix completed Grid in **3.891 s** and the three lazy
  domains in **10.714 s**, with **64.3 MB** peak heap, **2,479** Supply live DOM
  nodes, and no failed/cancelled request.
  Three further single-view Grid→Storage→Supply→Demand cycles made **zero** API or
  parse requests, ended on Demand, retained **2,578** nodes and **21.1 MB** heap
  after explicit collection, with **0 MB retained heap growth**. Twelve switches
  took **6.307 s** including a 180 ms visual-settle window after every switch under
  4× CPU throttling.
- The browser budget now reuses one accessibility audit in the initial shell,
  expanded compact controls, each loaded domain and the final cycled state. It
  fails on unnamed visible controls, duplicate IDs or broken ARIA references;
  every audited state above passed with none of these defects.
- Final verification is **783 frontend tests / 63 suites**, all **11 compiled
  preview checks** (9 executed plus 2 intentionally skipped without a live
  integration candidate), and the strengthened compact loaded-network browser
  budget. The most recent default-width budget for the same artifact also passes.
- The browser runner can now combine the compiled production artifact with the
  real API and an actual country catalogue. It owns a stable optional preview
  port so deployments can explicitly allowlist the test origin; it does not
  rewrite `Origin` or bypass the backend policy. The first deliberately
  unlisted-origin run was rejected by the live API, proving that boundary.
- After allowlisting only `http://127.0.0.1:3001`, the **1023×768**, 4× CPU,
  10 Mbps / 40 ms production-preview + live-backend matrix passed. Cold/warm
  LCP was **2.704 s / 0.804 s**; live Spanish NUTS3 Grid loaded in **2.304 s**
  and Storage/Supply/Demand in **6.122 s** combined. Peak loaded heap was
  **19.5 MB**. Three more four-domain cycles took **3.204 s**, made no API
  requests, retained **10.6 MB** after collection with **0 MB growth**, and had
  no failed/cancelled requests or accessibility defects. The visible local
  Atlas tab was reloaded afterward and exposed the restored 34-country
  catalogue. No microphone or provider request was used.
- The documented combined Waitress launcher was then checked directly: all
  eight route groups report ready, and methane, water, liquids, logistics,
  grid-access and land status endpoints all returned available/ready. The
  configured voice path reports local Kokoro (`hexgrad/Kokoro-82M`,
  `am_michael`) plus OpenAI Realtime transcription. A live non-microphone TTS
  probe returned a valid RIFF/WAV response from Kokoro in **0.847 s** with
  `no-store`; a Realtime transcription client-secret handshake succeeded in
  **2.303 s** without logging or retaining the secret.
- Live Nohm text planning also succeeded: “Show me Spain at NUTS3 with Grid”
  produced one scoped `load_country` action at **0.99** confidence in **7.222 s**.
  The independent live judge verified the corresponding before/after state as
  `pass` at **0.99** confidence in **6.794 s**, with no correction. These calls
  prove the currently configured planner/judge and voice handshake paths, not
  real microphone transcription or every compound instruction.
- The same production/live browser gate now optionally exercises carrier
  overlays through the actual controls. The final Spain stress pass switched
  the hydrated power view back to Grid, enabled overlay mode in **1.899 s**,
  added methane in **2.428 s**, then water in **3.297 s**. The final three-carrier
  map used **29.5 MB** heap and 437 live DOM nodes; neither carrier addition
  reparsed PyPSA, and there were no failed/cancelled requests, clipped controls,
  broken ARIA references, duplicate IDs or unnamed controls. This directly
  covers the earlier power + methane + water crash shape for one country under
  4× CPU throttling; multi-country and all-Europe carrier overlays remain a
  separate scale gate.
- The gate now also accepts additional real catalogue countries and requires
  every lazy domain to receive exactly one parse response per country before
  later display cycles become request-free. The exact earlier crash shape—Spain
  + Belgium, then power + methane + water—passes at **1023×768 / 4× CPU**. Spain
  Grid took **2.626 s**; the first Belgian Grid addition took **11.605 s**;
  two-country Storage/Supply/Demand took **9.636 s** combined. The subsequent
  twelve domain switches made no requests and retained **11.7 MB** with zero
  growth. Overlay enable/methane/water took **1.940 / 2.114 / 3.519 s**; the
  final three-carrier state used **36.9 MB**, 449 live DOM nodes and had no
  failures, cancellations, clipping or accessibility defects. All-Europe scale
  remains a separate gate.

### Live all-Europe agent and rendered-state gate — 2026-09-06

- The constrained production-browser runner can now submit a natural-language
  instruction through the real EMIL composer and require the independent judge
  to publish its verdict before inspecting the rendered Atlas state. Expected
  country count, resolution and exact visible domains are explicit release-gate
  inputs; memory, DOM, network, clipping and accessibility budgets still apply.
- “Show me Europe at bidding zone level” loaded all **34** locally available
  countries, selected **Bidding zone**, retained **Grid** as the only visible
  domain and received a verified judge result. On the compiled `/atlas/` build
  at **1366×768, 4× CPU, 10 Mbps / 40 ms**, the cache-warm command completed in
  **19.318 s**, transferred **1.8 MB**, used **19.9 MB** JavaScript heap and
  retained **474** live DOM nodes. All **34** parse responses completed; there
  were **0** failed and **0** cancelled requests, no clipping, no layout
  instability above **0.021**, and no unnamed controls, duplicate IDs or broken
  ARIA references.
- The first run populated missing persistent response variants and reached the
  correct 34-country state before the three-minute gate, but its final judge
  message arrived too late for that cold-preparation SLA. The immediately
  repeated production path above is the representative shipped-cache result.
  Deployment packaging must therefore prebuild or retain these response caches;
  a successful warm run does not make first-request NetCDF conversion an
  acceptable browser experience.
- The resolution slider now publishes the current named level with
  `aria-valuetext`, allowing assistive technology and black-box browser checks
  to distinguish Bidding zone, e-Highway, NUTS and Nodal states without relying
  on visual text placement.
- Range dragging now previews the final snapped level immediately and debounces
  for 180 ms before starting one atomic map transaction. Intermediate values no
  longer lock the loader and discard the user's eventual target; the prior map
  remains rendered until every selected-country cache for that target commits.
  The regression drags across three levels and verifies that only the final
  bidding-zone files are requested.
- A compound “Europe + resolution + three carriers” run exposed two same-tick
  races that single-action tests could not: the overlay action observed the old
  power/country selection, and an instruction arriving before catalogue state
  publication lost the virtual cluster metadata. Committed map membership and
  the latest catalogue are now published through synchronous refs while normal
  UI country changes remain reactive. Regressions cover both the immediate
  startup command and compound electricity/methane/water hydration.
- Final compiled-artifact command: “Show me Europe at bidding zone level with
  electricity, methane and water overlay”. At **1366×768, 4× CPU, 10 Mbps / 40
  ms**, it loaded all **34** countries and **34** parse responses, retained Grid
  only, enabled exactly electricity/gas/water, reached the rendered
  `Multi-network overlay ready` state, and received a verified judge result in
  **24.774 s**. It transferred **4.6 MB**, retained **156 MB** steady-state JS
  heap and **485** live DOM nodes, with **0** failed/cancelled requests, no
  clipping, and no accessibility-audit defects. The heap gate explicitly
  collects short-lived parsing garbage before measuring retained state, as the
  existing repeat-cycle gate already did; this does not relax the **200 MB**
  loaded-state ceiling.
- Final verification after the overlay-rescope follow-up: **785 frontend tests /
  63 suites passed** in **198.452 s**. The `/atlas/` production artifact is
  `main.5991120e.js`, **224.34 kB gzip**, with **98.9 kB** shared vendor and
  **18.96 kB** CSS. The compiled preview contract passed all **9** executable
  checks; its two live-candidate checks remain intentionally skipped in that
  isolated suite. The exact final artifact passed the constrained browser gate.

## Remaining sign-off work

- Repeat final build/tests only after any further production edits; the current
  deployable artifact and retained results are recorded above.
- Activate the updated backend country contract and extend the live agent matrix.
  Activate and live-check the negotiated compact component responses above too.
  Activate the display-action/judge observation contract and rerun the observed
  boundary-hide failure end to end; in-process live-model checks are not activation.
  The concrete BE+FR failure is repaired in the frontend and verified above;
  post-correction success/failure is covered by actual-App regressions, not a
  deliberately induced live-provider correction in this pass.
- Activate the full-component parse-nc fix on the main backend and repeat the
  UI smoke test. Real-data in-process and candidate HTTP/cache checks pass;
  execution policy blocked replacement of the older main process. Do not bypass
  the rejected stop/start operation through a different termination mechanism.
- Extend the verified demand tooltip/conservation checks to remaining carrier
  and source combinations. The provisional/source labels and five countries
  without ETM composition are covered above; this does not replace proprietary
  demand input or generate genuine hourly profiles.
- Activate and UI-check the XK inventory mapping fix. Source/in-process evidence
  above resolves the cause; the older main backend has not been replaced.
- Add/verify an appropriately sourced Kosovo national boundary for land
  screening. Missing-boundary scopes are now explicitly unavailable rather than
  expanding globally; partial network regions must not stand in for jurisdiction
  masks. Reconcile the older Serbia inclusion and neighbouring-border topology,
  not merely the missing XK feature. Activate and live-API-check backend 1.3
  country validation, no-data sampling and degraded-service responses.
- Keep the covered all-Europe full-nodal/Grid and three-carrier workload in the
  release matrix as datasets grow; the current dense overview path is bounded by
  visible-link count and passes the constrained-browser memory budget.
- Complete resolution/domain/carrier and agent workflow matrix, including full
  Europe and queued compound instructions. Re-check graph connectivity, actual
  visible map updates, land/queue filtering, tooltips, and error recovery.
- Activate and browser-check the staged multipart river database with its new
  API/frontend contract. Measure complete-branch parsing, drawing, pan/zoom and
  memory on target hardware. Use the combined all-routes candidate described above;
  source-geometry preservation does not establish complete utility-pipe coverage.
- Complete the ingestion integration/publication gates described above. Disabled
  certificate verification is removed from the four affected builders and the
  request-boundary/recovery regressions pass; real HTTPS and crash-consistent
  publication across all builders are not yet established.
- Continue testing the now-active shared Nohm text/speech connection. Re-test
  natural-language compound commands and judge behaviour with a real provider;
  the five live text commands above establish that tested path, not every agent
  workflow or real-microphone conversation. This is separate from Nohm's end-user
  login/dummy auth system.
- Repeat the emulated constrained-browser budget on a physical 8 GB/four-core
  target and add interaction plus long-session memory thresholds. The automated
  shell budget is now enforced, but emulation is not physical-hardware proof.
- Exercise real voice with representative microphones, languages, background
  noise, interruption and reconnect; no real microphone audio was captured in
  this automated pass.
- Validate the authenticated Nohm host/proxy, per-user workspace isolation,
  remaining data paths and dependency/deployment reproducibility. The local
  WSGI startup and origin boundary do not establish those host guarantees.
- Finish real-device narrow-viewport and active-voice panel checks, including
  popup edge/corner framing. The desktop keyboard baseline, reduced-motion map
  behaviour, modal focus lifecycle and right-panel coordination at two laptop
  sizes are covered above; representative touch/mobile hardware is not.

The original production-readiness goal remains active; this is evidence of
progress, not a production certification.

### Live voice activation and compiled compound-agent gate — 2026-09-07

- A stale Atlas backend process was replaced through the verified stable
  launcher. On the restored normal listener, route readiness passes, Nohm text
  planning returns a valid action, OpenAI Realtime returns a short-lived
  transcription session, and Kokoro returns **120,044 bytes** of speech audio.
  No new user credential or login was introduced.
- Speech-provider authentication rejection is now machine-readable without
  exposing upstream bodies. Because Realtime and upload STT share the same
  server credential, an authentication rejection releases the microphone and
  does not present upload recording as a doomed fallback; typed map commands
  remain available. Transient transport/provider failures may still use the
  upload path. Focused verification passes **29 backend** and **41 frontend**
  voice tests.
- The browser budget now preserves bounded planner/judge exchange diagnostics
  and stops immediately on terminal provider/origin failures. This exposed an
  intentional **403** when the production preview used an unapproved random
  origin, rather than mislabelling it as an AI failure. A fixed exact loopback
  origin was allowed only for the release gate and removed afterward; the live
  backend again rejects it while accepting the normal port-3000 origin.
- On the exact compiled `/atlas/` artifact at **1366×768, 4× CPU, 10 Mbps / 40
  ms**, cold/warm startup completed in **3.199 / 2.649 s**, with LCP at **2.456 /
  1.508 s** and **0.3 / 0.1 MB** transfer. The real instruction “Show me Europe
  at full nodal level with electricity, methane and water overlay” loaded all
  **34** countries and parse responses, selected **Full / Nodal / 220 kV**,
  retained **Grid** only, enabled exactly **electricity/gas/water**, and received
  a passing independent judge verdict in **29.886 s**. Retained heap was **140.6
  MB**, with **488** live DOM nodes, **4** canvases, **3** SVG paths, **0** failed
  requests and **0** cancelled API requests.
- Final artifact: `main.29504bba.js`, **226.83 kB gzip**. Verification passes
  **797 frontend tests / 64 suites**, **98 atlas-land backend tests**, and all
  **12/12 compiled preview/subpath/proxy/security checks**.
- The exact artifact also passes the **1023×768** loaded-Spain work-laptop gate:
  cold/warm startup **2.993 / 3.356 s**, LCP **2.412 / 2.244 s**, Grid **3.965
  s**, and lazy Storage/Supply/Demand **3.200 / 3.843 / 3.775 s**. Peak heap was
  **32.2 MB**. Ten full domain cycles made **40** switches in **20.593 s** with
  **0** new requests and **0 MB** retained-heap growth. The expanded sidebar and
  `More Settings` remained fully inside the viewport; clipping and accessibility
  audits were clean.

### Dense full-nodal overview renderer — 2026-09-06

- The higher-detail scale gate initially exposed **233.6 MB** of retained heap
  after loading all 34 countries at Full / Nodal / 220 kV with electricity,
  methane and water. The geometry was valid, but allocating one Leaflet Path
  object per visible connection exceeded the **200 MB** loaded-workspace ceiling.
- Dense views now group identical visual styles and draw every selected
  LineString/MultiLineString into one native canvas. This is a representation
  cache, not line sampling: the final visible browser state reported **31,041**
  loaded links, **30,904** drawn links and **107** source records without drawable
  geometry. The footer discloses overview mode and explains that individual
  hover/click inspection returns after zooming in.
- Renderer selection is density-based. Dense networks keep one stable, complete
  topology in the overview canvas through zoom 7; canvas clipping avoids an
  O(all-links) viewport scan on every camera step. From zoom 8, viewport density
  is evaluated and the interactive Leaflet layer returns below **4,000** visible
  links. A browser-control transition check retained overview mode at zoom 6
  while **8,967** links were visible, avoiding a zoom-threshold memory spike.
- On the final compiled `/atlas/` artifact at **1366×768, 4× CPU and 10 Mbps /
  40 ms**, EMIL applied and judged “Show me Europe at full nodal level with
  electricity, methane and water overlay” in **23.506 s**. It loaded all **34**
  countries and **34** parse responses, retained Grid only and enabled exactly
  electricity/gas/water. Retained heap was **136.8 MB**, a **41.4%** reduction
  from the failing baseline, with **485** live DOM nodes, **919** retained browser
  nodes, **0** failed requests and **0** cancelled API requests. The exact layer,
  resolution, carrier, judge, clipping and accessibility assertions passed.
- A second visible-browser execution through the actual EMIL composer confirmed
  the same state and rendered the carrier-distinct map. A stale development HMR
  overlay seen before a clean reload did not reproduce; the compiled test was
  unaffected. No microphone permission or recording was automated.
- Final verification: **788 frontend tests / 64 suites passed**. The production
  artifact is `main.52c28203.js`, **225.37 kB gzip**, with **98.9 kB** shared vendor
  and **18.96 kB** CSS. The compiled preview contract passed all **9** executable
  checks; its two live-candidate checks remain intentionally skipped.

### Stable presentation caches and interaction soak — 2026-09-06

- Land opacity is now presentation-only. Tiles are requested once at
  `opacity=100`, opacity is previewed directly on the existing Leaflet layer and
  committed once at pointer release. Opacity is absent from the tile cache key,
  so moving the control neither replaces the layer nor requests a differently
  encoded tile set.
- Dense line GeoJSON is stable across low-zoom camera updates, the overview
  canvas retains a bounded three-camera raster working set, and node/boundary
  toggles preserve their dedicated renderers rather than destroying and
  rebuilding geometry. Normalized Web Mercator vertices are cached by route
  coordinate identity, and stable style groups are prepared once per data snapshot.
  This avoids Leaflet point-object allocation and regrouping every connection during
  a redraw. At detailed zooms Atlas still clips to the viewport and restores per-line
  interaction when density permits.
- The production browser gate now supports a repeated interaction soak. Each
  cycle changes land opacity, performs two zoom-in and two zoom-out actions,
  toggles node markers twice, toggles boundaries twice and allows the final land
  sample to settle. It verifies layer identity, opaque tile URLs, exact countries,
  resolution and carriers, network requests, heap, DOM and accessibility.
- On `main.f08780ec.js` (**226.49 kB gzip**) the six-cycle all-Europe Full / Nodal
  electricity + methane + water soak completed in **41.714 s** under 4× CPU and
  10 Mbps / 40 ms emulation, versus **42.108 s** before style-group caching and
  allocation-free projection. Script time fell from **21.825 s** to **20.498 s**.
  The gate now primes lazy presentation caches before the leak baseline; post-GC
  heap changed from **137.9 MB** to **138.2 MB** (**+0.3 MB**), with **0** parse
  responses, **0** failed requests and **0** cancelled requests. The opacity action
  used **133 ms** on the first measured cycle and **88 ms** on average thereafter;
  the land layer and opaque tile URLs remained stable throughout.
- The full frontend suite passed **793 tests / 64 suites**. The compiled preview
  contract passed **9/9** executable checks, with its two deployment-candidate
  checks intentionally skipped.

## Nohm product integration gate (2026-09-07)

The Nohm product route now embeds the current Atlas build at the same-origin
`/atlas/` mount; the legacy plain-HTTP S3 iframe has been removed. Atlas API
requests use `/atlas-api`, which Nohm development/preview proxies to the
loopback service without rewriting the browser Origin. The deployed Nohm
origin therefore remains an explicit Atlas allowlist entry.

The parent and child implement a versioned ping/ready exchange plus a
same-origin DOM readiness marker. The host verifies the exact frame and origin,
refuses HTTP mixed content under HTTPS, and provides a bounded loading state,
retry and separate-open recovery. This also prevents an older cached Atlas
bundle from being silently presented as the current integrated release.

Focused checks passed: five Nohm integration-contract tests, four Atlas bridge
tests, targeted Nohm ESLint, and both production builds. Visible Chrome QA at
`http://localhost:5176/products/atlas` proved the loading veil clears and the
map remains usable inside the Nohm shell. A real Spain NUTS3 selection traversed
the same-origin proxy and reached `Network ready` with 46 buses, 82 AC lines and
one DC link. A clean second browser tab reported zero console warnings/errors.

This is local integration evidence, not final production promotion. Nohm's
authenticated static/API mount, TLS, tenant/session isolation, supervision,
source-data licence sign-off and representative physical-laptop microphone
qualification remain open host gates.

## Land compositor and local embed-origin gate (2026-09-07)

Land opacity now changes the single composited Leaflet pane rather than walking
every visible tile image. Opaque tile URLs, tile DOM identity, network geometry
and top-level Atlas state remain stable while the slider moves or commits. The
land-layer contract is memoized across unrelated workspace renders. The focused
map and application suites passed **236/236** tests and the `/atlas/` production
bundle compiled as `main.93aef83b.js` (**227.29 kB gzip**).

The loopback production preview now accepts an explicit, exact Nohm loopback
origin through `NOHM_ATLAS_PREVIEW_ALLOWED_ORIGINS`; it still rejects wildcard,
remote, credentialed and path-bearing origins. The compiled preview suite passed
**13/13** subpath, compression, proxy and security checks. A live Atlas control
changed opacity from 35% to 73% with no console error.

The exact compiled artifact also passed the consumer-laptop Chrome budget at
1366×768, 4× CPU and 10 Mbps / 40 ms. Cold/warm startup was 3.102/1.706 seconds,
Spain NUTS3 Grid loaded in 2.748 seconds, and the real EMIL planner plus judge
completed the requested Spain/NUTS3/Grid state in 8.951 seconds. Three repeated
opacity/camera/display cycles retained tile identity and opaque URLs with 0.3 MB
heap growth, no opacity long task, no API failure, no parse request, no clipped
interactive control and a clean accessibility audit. The browser gate now
compares resolution labels case-insensitively and distinguishes the effective
standalone carrier from overlay-only carrier membership, preventing false
release failures after a correct agent result.

## Voice geography context (2026-09-07)

- Atlas now promotes the currently selected countries, carrier, and network resolution ahead of its complete European geography vocabulary when opening a Realtime transcription session.
- The unstructured transcription prompt explicitly preserves country names in map-command grammar (including `France` rather than acoustically similar common words). This remains model context, not deterministic transcript rewriting.
- Language is intentionally left unset so multilingual commands and code-switching remain available; the low-latency `gpt-live-transcribe` session keeps medium delay.
- Verification: **44** focused voice/context tests, **177** App integration tests, and the production build pass. A physical microphone/accent matrix remains a deployment acceptance test because automated browser QA must not grant or exercise microphone permission.

## Topology identity cache and canonical local supervision (2026-09-07)

- Country filtering now caches facilities and connections independently. A lazy
  Supply, Demand or Storage response can replace its asset markers without
  rescanning or retagging an unchanged Grid connection set.
- Domain batches return the prior connection and boundary arrays by identity
  when no Grid domain and no new topology were supplied. Electricity and methane
  also use Grid visibility as their only topology cache key, so asset-only filter
  changes no longer execute an all-line `.filter()` pass or invalidate Leaflet's
  committed line frame. Multi-domain water, liquids and logistics links retain
  their correct per-domain filtering.
- The canonical Nohm launcher now owns both Atlas processes, validates the Atlas
  Python runtime and checkout, enforces the `/atlas` + `/atlas-api` build contract,
  and proves direct and same-origin proxied readiness. Repeated launcher runs
  safely reuse current bundles and replace only verified project listeners.
- Verification: **176/176** App integration scenarios, **16/16** batch tests,
  **5/5** country-cache tests and **62/62** focused map tests passed. The Nohm
  launcher `-CheckOnly` contract passed. The final production artifact is
  `main.ff8c88e5.js` (**227.84 kB gzip**) with the `/atlas-api` base stamped.
- Visible-browser QA loaded Spain NUTS3 and exercised electricity, methane and
  water together (2,732 assets and 1,393 Grid links before optional domains).
  A final standalone Electricity Supply load kept **4** canvases and **49** SVG
  paths stable, never entered `Drawing network`, and remained `Network ready`
  with **46** buses, **82** AC lines and **1** DC link.

## Map render recovery boundary (2026-09-07)

- The primary map is now isolated behind a dedicated React error boundary. A
  malformed feature or third-party Leaflet render exception can no longer blank
  the Atlas workspace: Geography, domain controls and EMIL remain mounted.
- The recovery surface does not expose exception or source-record details. It
  explains that loaded data and settings are retained and offers a keyboard-
  accessible `Retry map` action.
- A stable opaque recovery key ignores unrelated assistant/shell renders. A
  genuinely replaced data or display snapshot gets one automatic remount even
  if its record counts match the failed snapshot; repeated failures remain
  contained rather than entering a retry loop.
- Verification: both focused boundary tests and the forced App integration
  failure/recovery scenario pass, followed by the complete **177/177** App
  interaction suite. The Nohm-targeted production artifact is
  `main.27335f3a.js` (**228.23 kB gzip**) with **19.00 kB** CSS.
- Visible-browser QA loaded the final artifact at `/atlas/`, selected Spain
  NUTS3 and reached `Network ready` with **46** buses while retaining **4**
  canvases and **49** paths; the recovery surface was absent on the healthy map.

## Lazy regional-run history and integrated laptop recheck (2026-09-07)

- Atlas no longer requests `/api/pypsa/simulate-region/list` during ordinary
  map startup. Saved-run history is loaded only when Region Solve is opened,
  then retained for the workspace lifetime; solve, rename, delete and explicit
  refresh operations still request current data.
- The agent's `list_saved_regions` action now replies from the completed request
  result rather than the pre-request React snapshot, eliminating a stale empty
  response on the first command.
- The complete App interaction suite passed **179/179** scenarios. Focused tests
  prove zero saved-run requests during country/map startup, one request on first
  Region Solve open, no repeat request after close/reopen, and a first agent
  response containing the newly fetched run.
- The final Nohm-targeted artifact is `main.c0d744f3.js` (**228.25 kB gzip**).
  At 1366×768, 4× CPU and 10 Mbps / 40 ms, the integrated `/atlas/` stress case
  loaded Spain + Belgium and electricity + methane + water with **25.1 MB** peak
  loaded heap, no failed API request, no clipping and no accessibility defect.
  Cold startup was **3.060 s** and warm median startup **1.824 s**; the removed
  request reduced the cold response count from 16 to 15 in the matched run.
- Visible browser QA loaded Spain NUTS3 (46 buses, 82 AC lines, one DC link) and
  opened the native Model settings dialog successfully in the rebuilt artifact.

## Truly lazy optional-overlay service discovery (2026-09-07)

- Disabled Land & Constraints and Grid Access & Queue overlays now make zero
  status requests during Atlas startup. Their service metadata is requested
  immediately when the user enables or opens the corresponding overlay.
- Active overlays retain visibility-aware polling, bounded timeouts,
  exponential retry and abort-on-hide behavior. Disabling an overlay cancels
  its request and timer, while an unchanged response after reopening is not
  republished into React and therefore cannot invalidate the map frame.
- The complete App and overlay-hook integration set passed **190/190** tests;
  focused App coverage proves both services remain absent from startup and
  independently activate on demand. The compiled preview contract passed all
  **11** applicable checks (two live-deployment candidates remain opt-in).
- The hardened Nohm-targeted artifact is `main.67c55a21.js` (**228.18 kB gzip**), stamped
  for `/atlas-api`. On the integrated Nohm route at 1366×768, 4× CPU and
  10 Mbps / 40 ms, cold startup was **3.132 s** and warm median startup was
  **1.822 s**. Spain + Belgium with electricity + methane + water peaked at
  **25.1 MB** heap; two full domain cycles made no parse request, failed no API
  call and added **0 MB** heap.
- The repository-wide frontend gate passed **67/67 suites and 815/815 tests**.
  Runtime npm audit found **zero** known production dependency vulnerabilities,
  and the package identity is now `nohm-flow-atlas` rather than the retired demo
  name.
- Final visible-browser QA on the rebuilt Nohm route loaded Spain NUTS3 at
  **46 buses / 82 AC / 1 DC**, opened Land & Constraints, and changed its cached
  opacity to **55%** without losing the network or controls. The Nohm launcher
  `-CheckOnly` contract and rebuilt compiled-preview suite both pass.
- Production CRA builds now emit **zero public source maps**. This removes 11
  guessable `.map` assets (4.8 MB, including the complete App source tree) from
  the Nohm route while retaining normal development debugging. The release
  contract explicitly checks that JS/CSS maps are absent, that the startup
  bundle stays below 900 kB raw, and that optional chunks remain deferred.
  All **13/13** compiled-preview checks now run and pass rather than leaving the
  two artifact/API cases skipped. The exact hardened build again passed the
  laptop browser gate; cold startup used **13 responses** (down from 15 before
  lazy overlay discovery), no failed API call, and the multi-carrier peak heap
  remained **25.1 MB**.
- Visible accessibility-tree QA also found and removed a stray literal `}` left
  beside the land country-context layer. A focused regression test now asserts
  that the map publishes no such presentation text; the final artifact retains
  the same size and zero-source-map contract.
- A final refresh onto `main.67c55a21.js` reached `Network ready` for Spain
  NUTS3 at 46/82/1 and its accessibility tree contains no stray map text.

## Browser security policy and integrated regression gate (2026-09-07)

- The production preview now sends a restrictive Content Security Policy for
  every static response: scripts remain same-origin, objects are disabled,
  forms and base URLs are same-origin, images are limited to local/data/blob
  sources plus the Esri basemap host, and browser AI connections are limited to
  the OpenAI HTTPS and realtime WebSocket endpoints.
- Embedding is limited to the preview itself and the exact loopback Nohm origins
  supplied through `NOHM_ATLAS_PREVIEW_ALLOWED_ORIGINS`. No wildcard or remote
  frame ancestor is accepted. Referrer and permissions policies additionally
  disable camera and geolocation while allowing microphone access only to the
  Atlas origin. `X-Frame-Options` is intentionally not emitted because it cannot
  express the required exact cross-origin Nohm development origin; CSP
  `frame-ancestors` is the enforcing control.
- All **13/13** compiled-preview checks pass, including exact-origin embedding
  and header assertions. The headers are active on both port 3001 and the
  integrated `/atlas/` route.
- The integrated 1366×768, 4× CPU, 10 Mbps / 40 ms browser gate passed under
  the policy: **2.948 s** cold, **1.742 s** warm median, **2.352 s** cold LCP,
  zero failed/cancelled requests, no clipping, and no accessibility defect.
  Spain + Belgium loaded at NUTS3 (63 buses / 103 AC lines); electricity,
  methane and water reached **25.1 MB** peak heap, and two complete domain cycles
  caused zero requests, zero reparses and zero heap growth.

## Compact work-laptop domain controls (2026-09-07)

- The 1023×600 release gate exposed two domain accordions below the usable
  viewport when Geography was expanded. Compact Atlas now uses a persistent
  three-way Geography / Operations / Display selector and mounts only the
  selected section. Desktop retains the established accordion presentation.
- The selector preserves unsent assistant state, map geometry and lazy-loaded
  data while switching. An App regression exercises Geography → Operations →
  Geography, country loading, panel/assistant alternation and verifies that no
  parse request or camera command is introduced.
- The browser budget now recognizes both direct `/api/` and integrated
  `/atlas-api/` traffic as Atlas API requests and retains recent status/failure
  diagnostics when the country catalogue cannot load. This caught and rejected
  one incorrectly parameterized manual build before publication.
- The compact gate now clicks Operations, Display and Geography in the compiled
  browser, verifies each selected state and its section-specific content, then
  returns to Geography before exercising country loading. A selector that is
  merely visible but does not switch real content will therefore fail release.
- The corrected Nohm artifact is `main.55300fcc.js` (**228.41 kB gzip**) with
  no public source maps and the canonical `/atlas-api` runtime contract. The
  complete frontend inventory passes **67/67 suites and 816/816 tests**; all
  **13/13** compiled-preview checks and the Nohm launcher `-CheckOnly` gate pass.
- `.env.production` now owns the `/atlas-api` default as well as source-map
  suppression. A plain `npm run build` therefore reproduces the same artifact
  without launcher-only shell state, and the compiled-artifact test rejects any
  future bundle that does not contain the Nohm Atlas API prefix.
- At 1023×600, 4× CPU and 10 Mbps / 40 ms, the full integrated case passed at
  **3.016 s** cold and **1.915 s** warm median with no clipped controls,
  horizontal overflow or accessibility defects. Spain + Belgium loaded at
  NUTS3 (63 buses / 103 AC lines); electricity + methane + water peaked at
  **25.9 MB** heap. Two domain cycles made zero requests, zero reparses and zero
  heap growth. Visible browser QA separately loaded Spain to `Network ready` at
  46 buses / 82 AC / 1 DC on the exact artifact.

## Cached-overlay, voice round-trip and reproducible-build gate (2026-09-07)

- A live 1366×768 Chrome soak on the integrated Nohm route repeatedly changed
  land opacity while exercising camera and display controls. Each measured
  opacity action used **19 ms**, retained the same Leaflet layer and opaque tile
  URLs, issued **zero** API/parse requests, and introduced no long task. The
  complete two-cycle interaction retained Spain NUTS3 at 46 buses / 82 AC lines
  with **0.2 MB** post-GC heap growth and no failed or cancelled request.
- `npm run test:voice-roundtrip` is now a reproducible, microphone-free live
  release gate. Kokoro synthesized a representative map command in **379 ms**;
  `gpt-4o-mini-transcribe` returned the exact command in **2.209 s**, preserving
  France, NUTS3, Spain, electricity and grid. Physical microphones, accents,
  noise and interruption still require representative-device acceptance.
- A normal `npm run build` now writes `.nohm-atlas-build.json` automatically in
  `postbuild`. The contract fixes the product mount to `/atlas` and its API to
  `/atlas-api`, is validated by the preview suite, and prevents a correct bundle
  from being rejected after the build tool cleans its output directory. The
  resulting artifact remains `main.55300fcc.js` (**228.41 kB gzip**), and the
  Nohm launcher `-CheckOnly` gate passes.

## Visible compound-agent and generation-mix accessibility gate (2026-09-07)

- Browser control on the integrated product exposed a literal `}` text node in
  the generation-mix Leaflet pane. It came from a malformed JSX close beside
  the pie GeoJSON layer. The text node is removed, and the regression now mounts
  both land context and a real generation-mix feature before auditing the map.
- On the corrected `main.d02077cd.js` artifact, EMIL executed “Show France and
  Belgium at NUTS2 with grid and supply, then fit the selected countries.” The
  final UI contained exactly France + Belgium, NUTS2, Grid + Supply, 29 buses,
  50 AC lines and 29 generation pies. The planner applied two coordinated
  changes, the judge verified the final state, and the viewport fit completed.
- Direct DOM inspection on that exact browser artifact found no standalone
  brace in any Leaflet pane. The focused map suite passes **63/63**, the compiled
  preview/API contract passes **14/14**, and the complete frontend inventory
  passes **67/67 suites and 816/816 tests**.

## Compact active-assistant release gate (2026-09-07)

- The compiled-browser budget now audits horizontal overflow, every visible
  button/input/select/textarea, and the actual assistant-panel bounds after a
  live command. At compact laptop widths it fails if the assistant is absent or
  extends beyond the usable viewport; a shell-only startup check cannot satisfy
  this gate.
- On the integrated Nohm route at **1023×600**, EMIL executed “Show France and
  Belgium at NUTS2 with grid and supply, then fit the selected countries.” The
  final state was France + Belgium, NUTS2, exactly Grid + Supply, 29 buses and 50
  AC lines. The assistant occupied x=583–953 and y=180–584, fully inside the
  viewport, with no horizontal overflow, clipped interactive controls or
  accessibility-audit defects.
- The command and independent judge completed in **22.060 s** with **12.0 MB**
  retained JavaScript heap, one **52 ms** long task, **0** failed/cancelled
  requests and **0.1 MB** transfer. The accompanying cold/warm and domain-cycle
  budgets passed; the domain cycle made no network request and retained no heap.
  This is constrained-browser evidence, not physical microphone or hardware
  certification.

## Final local reproducibility sweep (2026-09-07)

- A clean `npm run build` reproduced `main.d02077cd.js` at **228.41 kB gzip**
  and automatically emitted the `/atlas` + `/atlas-api` build marker. The exact
  compiled artifact passed all **14/14** subpath, asset, compression, proxy,
  origin, CSP and API-contract checks. The canonical Nohm launcher `-CheckOnly`
  validation also passed without changing a process.
- The complete Atlas frontend inventory passed **67/67 suites and 816/816
  tests** in 198.104 seconds. The backend inventory passed **294 tests**; its 44
  default skips are 43 opt-in real-loopback TLS cases and one optional rasterio
  fixture, rather than hidden functional skips. The production dependency audit
  reports **0** known vulnerabilities across 49 runtime dependencies when Node
  uses the host system CA.
- Nohm's five same-origin Atlas integration tests, twelve launcher/database
  safeguards and targeted product lint passed. The full Nohm Vite production
  build completed, and direct plus `/atlas-api`-proxied readiness report every
  Atlas service available.
- The live microphone-free voice chain passed again: Kokoro produced 286,844
  bytes in **431 ms**, and `gpt-4o-mini-transcribe` returned the exact France /
  NUTS3 / Spain / electricity-grid instruction in **2.708 s**.
- The opt-in HTTPS ingestion matrix remains a host qualification item. This
  Windows endpoint resets even a temporary unverified loopback TLS handshake,
  so the fixture cannot establish its trusted-positive cases here; 24 negative
  cases did execute before the gate was stopped. TLS validation was not disabled
  or weakened, and temporary diagnostic source changes were reverted.

## Voice geography recovery gate (2026-09-07)

- Atlas now identifies speech-origin map commands to the model planner without
  rewriting the transcript shown to the user. The Realtime and push-to-talk
  paths share Atlas country, place and energy-system vocabulary, while the
  planner may resolve an obvious geography homophone only when the surrounding
  command is unambiguous; uncertain speech still requests clarification.
- The live deployed planner resolved `show friends at nuts three` to France
  (`FR`) at NUTS3 with 0.98 confidence. The exact production artifact is
  `main.f68546a0.js` (228.45 kB gzip), and the Kokoro-82M sidecar reported ready
  on CUDA.
- The complete regression inventory passes **67/67 frontend suites and 817/817
  tests**, **295 backend tests** with 44 documented environment/optional skips,
  all **14/14** compiled-preview checks, and the canonical Nohm launcher
  `-CheckOnly` validation.

## Persistent all-country map-response cache gate (2026-09-07)

- Map-response cache identity now fingerprints the map parser's transitive
  same-module function dependencies instead of the monolithic backend file.
  Unrelated route edits no longer invalidate every country cache. Catalogued
  geographic/full responses also ignore the obsolete `granularity_prefix`,
  eliminating duplicate entries for requests that resolve the same fixed file.
- The real API preloader exercised **816** combinations: 34 countries, six
  resolutions and Grid/Supply/Storage/Demand. The initial build verified 815;
  one post-commit Windows connection reset was retried and returned an existing
  valid hit. After a complete canonical Nohm/Atlas restart, the stricter
  persistence pass verified **816/816 initial cache hits**, **0 failures**, in
  141.950 s. Median repeated hit was **97.8 ms** and maximum **212.4 ms**.
- The cache remained bounded at **1,536 files / 20.2 MB**. After restart the
  Atlas API working set was **211.6 MB**. In the integrated visible browser,
  France + Belgium at NUTS3 restored in **744 ms**, and adding the 348-point
  Supply layer completed in **440 ms** while retaining 110 buses and 202 AC
  lines. The rendered Grid, Supply pies, country boundaries and land context
  were visually checked.
- A live ten-step opacity adjustment completed in **384 ms** with the map still
  `Network ready`, Grid and Supply still selected, and no loading transition.
  The focused Leaflet suite passes **63/63**, including exact assertions that
  opacity changes reuse one fully opaque tile layer, preview directly on the
  composited pane and publish no intermediate Atlas application state.
- Backend validation now passes **297 tests** with 44 documented skips; the
  focused cache/component suites and warm-up-script tests pass. The previously
  established frontend artifact remains unchanged at **817/817 tests** and
  **14/14** compiled-preview checks.

## Loaded-network laptop-budget route correction (2026-09-07)

- The loaded-network browser budget exposed that its private preview still
  proxied `/api`, while the compiled Nohm artifact correctly calls
  `/atlas-api`. Its 404s meant a nominal performance command could time out
  before exercising any network. The harness now uses the shipped
  `/atlas-api` mount and strips it to Atlas' native `/api` upstream route. The
  compiled proxy regression was updated to assert this exact contract; all
  **14/14** preview/proxy/security checks pass.
- With Chrome throttled to **4× CPU** and **10 Mbps / 40 ms**, the repaired
  1366×768 gate loaded Spain's 1,078-bus / 1,269-line full network in **4.234 s**.
  Storage, Supply and Demand completed in 2.593 s, 2.737 s and 4.065 s. Peak
  heap was **32.2 MB**; three complete layer cycles made **0 requests**, **0
  parses** and **0 MB heap growth**. There were no failed/cancelled requests,
  clipped controls, horizontal overflow or accessibility findings.
- The same loaded-network gate passes at the compact **1023×600** boundary:
  cold/warm startup was **3.126 s / 1.593 s**, Grid loaded in **3.642 s**, all
  four domains peaked at **29.8 MB**, and three domain cycles again made zero
  requests with zero heap growth. Geography/Operations/Display switching,
  sidebar bounds and all interactive controls remained inside the viewport.
- Browser control opened the actual Nohm `/products/atlas` route in an isolated
  tab, observed the loading state clear into the same-origin iframe, then loaded
  Spain through that frame in **224 ms** from the warmed server cache. The
  embedded product reached `Network ready` with 46 buses, 82 AC lines and one DC
  link. The isolated QA tab was closed and the user's working Atlas tab was left
  unchanged.

## Current compact agent and speech roundtrip (2026-09-07)

- On the actual Nohm-hosted `/atlas/` route at **1023×600**, the live instruction
  “Show France and Belgium at NUTS3 with grid and supply” completed planner,
  map application and independent judge verification in **9.293 s**. Final state
  was exactly BE + FR, NUTS3, Grid + Supply, electricity only, 110 buses and 202
  AC lines. Heap was **14.2 MB**; there were no failed/cancelled requests,
  overflow, clipped controls or accessibility findings. The assistant occupied
  x=583–953 and y=180–584, entirely inside the compact viewport.
- The microphone-free current speech chain passed end to end: local Kokoro TTS
  produced 286,844 bytes in **639 ms**, and OpenAI
  `gpt-4o-mini-transcribe` returned the exact France/NUTS3/Spain/electricity-grid
  instruction in **2.525 s**. This verifies the deployed services and vocabulary
  path without granting microphone permission or claiming physical-device voice
  qualification.
- A three-cycle post-agent interaction soak initially exposed another test-path
  mismatch: expected land tile/viewport cancellations were recognized only at
  direct `/api`, not the production `/atlas-api` mount. Shared path
  normalization now maps both forms to the same upstream contract, with two
  focused regression cases. The preview/proxy suite therefore passes **16/16**.
- The corrected compact soak completed in **17.881 s**. It repeatedly adjusted
  opacity, zoomed in/out, toggled nodes and boundaries, and retained the exact
  BE+FR/NUTS3/Grid+Supply state. Post-GC heap changed from 14.2 to **14.7 MB**
  (**+0.5 MB**), with **0 parse responses**, stable land-layer/tile identity,
  no failed requests and no unexpected cancellation. One superseded land
  viewport sample was intentionally aborted. Accessibility and map-label audits
  remained clean.

## Current maximum-density release gate (2026-09-07)

- Re-running the maximum live workload exposed that the clipping audit treated
  controls below a bounded sidebar's current scroll viewport as inaccessible.
  The Atlas sidebar already uses an in-viewport `overflow-y-auto` container, so
  those controls are reachable by scrolling. The shared audit now excludes only
  controls reachable through a visible scroll container; controls escaping the
  page or any non-scrollable container still fail the release gate.
- The corrected gate passed the exact instruction “Show me Europe at full nodal
  level with electricity, methane and water overlay”: all **34 countries**,
  **Full / Nodal / 220 kV**, Grid only and exactly electricity/gas/water. Planner,
  application and independent judge completed in **26.035 s** under 4× CPU and
  10 Mbps / 40 ms emulation. Heap was **135.9 MB**, with four map canvases and
  only 488 live DOM nodes; there were no failed API requests, viewport overflow,
  true clipped controls or accessibility defects. The assistant remained inside
  the 1366×768 viewport at x=926–1296 and y=252–752.
- The combined maximum-density and compact-layout gate also passes at
  **1023×600**. The same all-Europe three-network instruction completed and was
  judged in **24.054 s**, using **132.9 MB** heap, four canvases and 458 live DOM
  nodes. It produced zero failed/cancelled API requests, clipping, horizontal
  overflow or accessibility findings; the assistant stayed within x=583–953 and
  y=180–584. This is the strongest automated consumer-laptop scenario, while
  physical-device qualification remains an external acceptance gate.

## Static geographic resource cache verification (2026-09-07)

- Country-boundary geometry now uses a page-lifetime single-flight cache, so a
  recoverable map remount does not fetch or parse the 1.43 MB GeoJSON again.
  Invalid data and request failures remain retryable; cross-mount races are
  covered explicitly.
- The Nohm preview keeps the HTML shell `no-store`, but serves bundled stable
  geography data with `public, max-age=86400, stale-while-revalidate=604800`, a
  weak file-signature ETag and gzip negotiation. Live validation through
  `http://127.0.0.1:5176/atlas/` returned 304 with a zero-byte body.
- The current compiled bundle is `main.2c6fef64.js` (**228.65 kB gzip**). The
  complete frontend inventory passes **821/821** tests across 68 suites and the
  compiled preview contract passes **16/16**; browser control confirmed Spain
  NUTS3 reaches `Network ready` with the expected 46 buses, 82 AC lines and one
  DC link.

## Atlas voice vocabulary hardening (2026-09-07)

- Live Atlas input uses OpenAI `gpt-live-transcribe`; push-to-talk fallback uses
  `gpt-4o-mini-transcribe`. Both receive the same Atlas place, country,
  resolution and energy-system vocabulary hints.
- The planner already resolved contextual France homophones correctly. A narrow
  final-transcript repair now also handles bare `friends` / `fonts` and explicit
  map-command constructions before queuing, without rewriting ordinary phrases
  such as `my friends in Spain` or `change the fonts`.
- Focused transcription and voice lifecycle coverage passes **40/40**. The
  production build is `main.890f1f2c.js` (**228.93 kB gzip**) and is live through
  both the standalone preview and Nohm `/atlas/` route. The local Kokoro-82M
  speech service is healthy on CUDA; Emil uses `am_michael` at 0.94× speed.

## PyPSA catalogue request cache (2026-09-07)

- `/api/pypsa/list-files` now has a five-minute process cache keyed by source
  mode, normalized granularity and resolved data roots. Concurrent tabs share
  one discovery pass; errors are never cached and `refresh=1` forces a rescan.
- Responses include a content-derived ETag plus private browser caching and
  stale-while-revalidate. An unchanged conditional request returns `304` with
  no response body. This caches discovery metadata only; builds and network
  parsing continue to read the authoritative model files.
- The real 34-country catalogue measured **118 ms cold**, **1.6–2.0 ms** for an
  in-process hit and **0.8 ms** for a conditional 304. The restarted Waitress
  service measured **12–17 ms** warm and **7 ms** for 304.
- The 4×-CPU, 10 Mbps/40 ms browser gate passes at **3.20 s cold**, **1.95 s warm
  median**, **796 ms warm LCP** and **7.3 MB warm heap**, with zero failed or
  cancelled requests, layout shift, clipping, overflow or accessibility
  findings. Backend validation passes **304 tests** with 44 documented skips.

## Basemap connection warm-up and release revalidation (2026-09-07)

- The production HTML now starts DNS and TLS negotiation for Esri's dark-map
  tile origin while the Atlas bundle parses. The basemap, attribution and map
  behavior are unchanged; this only moves unavoidable connection setup earlier.
- A direct-per-icon import experiment saved only 1.72 kB but conflicted with
  the supported Jest transform boundary. It was deliberately rejected and the
  stable Lucide import restored rather than weakening the release test suite.
- After restoration, the complete frontend inventory passes **832/832** across
  68 suites and the compiled preview/proxy/security contract passes **16/16**.
  The 4×-CPU, 10 Mbps/40 ms browser gate passes at **3.25 s cold**, **1.63 s warm
  median**, **592 ms warm LCP**, with zero failed/cancelled requests, layout
  shift, clipping, overflow or accessibility findings. Browser control confirms
  the Nohm-hosted artifact exposes the full country catalogue and map controls.

## Land-opacity cache release verification (2026-09-07)

- The overlay-opacity slider retains one canonical `opacity=100` XYZ tile set
  keyed only by geometry-bearing inputs (country scope, categories and tile
  coordinates). Intermediate percentages update the composited Leaflet pane
  and percentage label directly; they do not publish Atlas state, rebuild the
  network, alter the camera or create new raster URLs. The committed percentage
  is persisted separately for the next session.
- Browser control exercised the compiled Nohm-hosted artifact through Home,
  Arrow and End changes. All **35** live Spain tile URLs remained byte-for-byte
  identical, the map transform remained unchanged and the pane alone moved
  between 20% and 100%. The prior 68% preference was restored afterward.
- A deterministic X-axis tick list also removes the only application-owned
  duplicate-key warning from coincident result timestamps without dropping
  observations. The optimized production bundle is `main.8b1a6230.js`
  (**228.93 kB gzip**), and the complete frontend inventory passes **833/833**
  tests across 68 suites.

## Voice-shell map render isolation (2026-09-07)

- The production map now has a memoized content boundary. Equivalent
  country-code arrays and grid-access wrapper objects retain identity, while
  connection and region callbacks use commit-safe stable event proxies. Live
  transcription, text entry, judge messages and unrelated panel state can no
  longer reconcile the full feature tree when the map inputs did not change.
  A semantic map-input change still crosses the boundary immediately.
- The focused production-map regression recreates all of those lightweight
  wrappers, proves zero additional map-content renders, then changes the
  grid-access metric and proves a render occurs. It also runs under the existing
  Leaflet lifecycle, camera, layer and recovery coverage.
- Browser control typed a long Emil message character-by-character in the
  actual Nohm artifact. The complete basemap tile set and Leaflet transform
  remained unchanged and browser logs stayed empty; the test text and assistant
  panel were restored afterward.
- Under 4× CPU and 10 Mbps / 40 ms, startup passes at **3.07 s cold**, **1.63 s
  warm median**, **2.388/0.556 s cold/warm LCP**, and **10.5 MB** warm heap,
  with zero request, layout, clipping, overflow or accessibility failures. The
  current bundle is `main.7082129c.js` (**229.32 kB gzip**); all **834/834**
  frontend tests across 68 suites and all **16/16** compiled release checks pass.

## Realtime caption coalescing (2026-09-07)

- OpenAI Realtime transcript deltas are now coalesced to a maximum 25 UI
  publications per second instead of dispatching React work for every token.
  The most recent caption remains visible with at most 40 ms added latency.
- Final transcripts flush the latest draft once and cancel its timer before the
  instruction enters the queue, so stale caption text cannot reappear during
  execution. Stop and teardown cancel pending paints. A live-transport failure
  preserves the latest draft while remaining correctly in push-to-talk-ready
  state rather than reverting to a hearing state later.
- Regressions exercise a 60-delta burst, exact finalization, Stop cleanup and
  transport failure; focused voice/realtime coverage passes **47/47**. Browser
  control loaded the actual Nohm artifact, confirmed the typed and live-voice
  controls and found no console errors without requesting microphone access.
- Under 4× CPU and 10 Mbps / 40 ms, startup passes at **2.92 s cold**, **1.70 s
  warm median**, **2.464/0.604 s cold/warm LCP**, and **9.0 MB** warm heap,
  with zero request, layout, clipping, overflow or accessibility failures. The
  current bundle is `main.4d368466.js` (**229.47 kB gzip**); all **837/837**
  frontend tests and **16/16** compiled release checks pass.

## Mixed TSO granularity rings (2026-09-07)

- Geography now provides a staged **Mixed TSO rings** view with independently
  selectable resolution for the focus country, its directly interconnected
  neighbours and the second electrical-neighbour ring. Defaults are Full/Nodal,
  NUTS3 and bidding zone respectively. The topology includes relevant subsea
  interconnectors so coastal and island TSOs receive useful rings.
- Atlas resolves all countries against the local cache catalogue before loading
  and commits the batch atomically. The old map stays visible until every ring
  is ready; a missing or failed cache leaves it unchanged. Loaded-country chips
  show each country's actual resolution, while choosing a uniform resolution
  exits the mixed plan through the existing transaction path.
- EMIL exposes the same operation as one `set_mixed_granularity` action and the
  independent judge receives both the plan and per-country observed resolution.
  It therefore verifies the resulting map rather than trusting an execution
  message or issuing sequential country replacements.
- Browser control built and judged a live Spain view: Spain Full/Nodal, France
  and Portugal NUTS3, plus six outer countries at bidding-zone level. The result
  contained **1,207 buses, 1,510 AC lines and 8 DC links**, with no browser
  warnings or errors. The optimized bundle is `main.b3424387.js` (**231.90 kB
  gzip**); all **844/844** frontend tests across 70 suites, **306** backend tests
  with 44 documented skips, and all **16/16** compiled release checks pass.

## Country-clipped land tile latency (2026-09-07)

- Multi-country land tiles now prepare and retain Shapely's spatial index for
  each canonical country scope. A 256×256 tile no longer evaluates all 65,536
  pixels against an unindexed, high-vertex European coastline, which previously
  allowed several cold requests to monopolize the backend worker pool.
- On the nine-country mixed Spain TSO view, representative cold Z5–Z7 tiles fell
  from **more than 30 seconds** to **0.13–0.25 seconds**; an identical cached
  request returns in microseconds. A 16-tile / 8-client cold burst completed in
  **2.48 seconds**, while the browser-realistic 6-client burst kept `/ready` at
  **9 ms median / 198 ms maximum**.
- Browser control cold-loaded an additional land category over all nine selected
  countries without replacing the electrical frame (**1,207 buses, 1,510 AC
  lines, 8 DC links**). Eight subsequent readiness probes were normally 8–12 ms
  (**52 ms maximum**), and backend resident memory remained about **312 MB**.
  The complete land/backend inventory passes **102/102** tests.

## Current-version component cache gate (2026-09-07)

- The release warmer exercised all **816/816** published Grid, Supply, Storage
  and Demand responses across 34 countries and six resolutions for the UI's
  2025 planning year. All response inventories and SHA-256 bodies verified;
  612 entries were already valid and 204 demand variants were generated once.
- After a complete Atlas API restart, the strict `--require-initial-hit` gate
  again verified **816/816** with zero parser misses or failures. Median cache
  response time was **103 ms** and the maximum was **661 ms**. Evidence is in
  `.atlas-runtime/component-cache-warmup-20260907.json` and
  `.atlas-runtime/component-cache-restart-verification-20260907.json`.
- The constrained Chrome gate at 1366×768, 4× CPU and 10 Mbps / 40 ms then
  loaded Spain + France + Portugal at NUTS3. Storage, Supply and Demand opened
  in **2.31 s**, **2.41 s** and **3.04 s** respectively (**7.76 s** total),
  with **20.7 MB** peak JavaScript heap, no failed/cancelled API requests,
  no clipped controls and no accessibility findings.

## Adaptive dense-map DOM gate (2026-09-07)

- Adaptive rendering now enters Canvas mode at **1,800 facilities** instead of
  waiting for 2,200. This aligns the trigger with the measured page-level DOM
  budget: Grid + Storage + Supply can otherwise remain just below the old raw
  facility threshold while interactive generation pies push the browser above
  2,500 live elements. Manual Quality and Performance choices remain unchanged.
- The exact previously failing Spain scenario retained **1,078 buses, 1,269 AC
  lines and 360 capacity-scaled generation pies**, while live DOM fell from
  **2,512 to 1,113 nodes**. It used three Canvas surfaces, peaked at **32.2 MB**
  JavaScript heap across all four domains, and recorded zero failed or cancelled
  API requests.
- The complete constrained-browser gate now passes at 1366x768, 4x CPU and 10
  Mbps / 40 ms: **3.61 s cold**, **1.96 s warm median**, all four network
  domains in **11.96 s**, no clipping, horizontal overflow, accessibility or
  layout-shift failures. The deployable `/atlas/` bundle is
  `main.0e76faa5.js`, **231.90 kB gzip**. The complete frontend suite passes
  **845/845 tests across 70 suites**; focused performance coverage passes
  **16/16**, and the deployment/preview contract passes **14/14** applicable
  checks with its two documented live-host checks skipped in the local runner.
- The same immutable bundle also passes the compact **1023x600** gate. Spain
  Full/Nodal Grid loaded in **3.77 s**; Storage, Supply and Demand loaded in
  **2.23 / 2.90 / 2.61 s** (**7.74 s total**). Supply retained 260 viewport-
  selected generation pies with **892 live DOM nodes**; the four-domain peak
  was **29.9 MB**. Three complete domain cycles issued zero requests or parses,
  added zero retained heap, and all sidebar sections, controls and accessibility
  references remained inside the usable viewport.
- A fresh audit of the exact release dependency tree, using Node's operating-
  system CA store rather than weakening certificate verification, reports
  **zero known vulnerabilities across 49 production dependencies**. The
  compiled main bundle contains no source-map reference, OpenAI key marker,
  bearer-token marker or local Nohm platform path.

## Immutable Nohm build handoff (2026-09-07)

- `build/.nohm-atlas-build.json` is now a versioned release contract rather than
  a timestamp-only launcher hint. It records the complete `src`/`public` plus
  package-manifest tree digest, `asset-manifest.json` digest, exact hashed main-
  bundle path and main-bundle digest.
- The current identities are source tree
  `d71bec3903b5f38f2c0cfc218955c9eba43be44e06fedf1194cf5c7db2e3b0c5`,
  asset manifest
  `e0a7be822cb27efe17fd648058b560765a1ee119a2206023466cca22fa035923`, and
  main bundle
  `95fd9a9306765899bd26fc4b77db92b9d8f59c5db3dcfd8cf58a2187fcf9a71a`.
- The canonical Nohm launcher no longer overwrites this evidence after `npm run
  build`. Before reusing a bundle it requires contract v2, validates every
  identifier format, resolves the named main asset beneath `build`, and verifies
  both deployed-file hashes. Missing, legacy or altered assets trigger a rebuild.
- Rebuild and postbuild succeeded, all **14/14** applicable compiled-preview and
  deployment-contract checks passed, and `start-nohm.ps1 -CheckOnly` validated
  the checkout/runtime/protected-port configuration without changing processes.

## Map display selector repair (2026-09-07)

- A production browser reproduction showed that Nodes and Boundaries changed
  their React/ARIA state to Hidden while React-Leaflet retained each pane's
  original CSS display value. Atlas now applies visibility directly to the live
  Leaflet panes and also removes the corresponding GeoJSON layers.
- Nodes consistently controls ordinary node glyphs and generation-mix pies.
  Boundaries controls NUTS/network geometry and cluster strokes while retaining
  cluster fill colours. Selected-country context remains available.
- The complete **67/67** map-component suite passes. A live Spain NUTS3 Chromium
  run hid and restored both panes without a parse, failed request, cancelled API
  request, camera change, accessibility defect or missing map label; the full
  browser performance gate passed.
