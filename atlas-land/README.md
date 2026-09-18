# Nohm Atlas — local extension services

Local-first siting overlays for Nohm Flow and Nohm Atlas.

The extension bundle also provides Atlas regional clustering and Nohm voice
compatibility beside the land and constraint service.

The layer is deliberately independent of infrastructure carriers. It combines
authoritative European conservation data with harmonised land-cover screening,
loads only the visible map extent, and exposes the same controls to the map
agent as to the user interface.

Data provenance and screening limitations are exposed in the API and UI. The
overlay is suitable for strategic site screening; it is not a substitute for
parcel ownership, permitting, environmental assessment, or local planning
records.

## Local data

- Natura 2000: the workspace's 2025-08-15 EEA-derived 100 m binary mask.
- CORINE Land Cover: the workspace's CLC 2006 v18.5 250 m categorical raster.
- Interactive pyramids: 400 m or coarser for Natura and 500 m or coarser for
  CORINE, selected automatically by map zoom.

The source-resolution rasters remain the provenance records; the interactive
overviews keep panning and zooming responsive. Tiles and point inspection are
served locally, so the browser does not disclose a proposed site to a mapping
vendor.

## API

- `GET /api/atlas/land/status` — classes, source metadata and limitations.
- `GET /api/atlas/land/tiles/{z}/{x}/{y}.png` — transparent XYZ tiles.
- `GET /api/atlas/land/inspect?lat={lat}&lng={lng}` — point classification.
- `GET /api/atlas/land/viewport-stats?...` — approximate visible-area mix.
- `GET /api/atlas/clusters/status` — clustering capability and provenance.
- `GET /api/atlas/clusters?...` — country-scoped Eurostat/GISCO NUTS typology.

Regional clustering is lazy: neither its UI chunk nor official data is loaded
until the user opens the Regional clustering domain and runs an analysis. The
same country selection used by Geography scopes the request. Atlas supports
NUTS 2 and 3, single-stat or weighted multi-indicator analysis, deterministic
K-means, cluster profiles, map opacity, visibility and CSV export. The map uses
its own canvas pane; opacity changes update that pane without rebuilding the
polygon geometry. Once built, changing the Eurostat evidence, year, weights,
scaling or cluster count triggers a debounced background refresh: Atlas keeps
the previous colours visible and atomically swaps in the completed result. A
failed refresh also leaves the last valid typology on the map.

The overlay is independent of Grid, Storage, Supply and Demand and can remain
visible over electricity, gas, water, liquids and logistics networks. The map
agent can show, hide, add and remove classes and set opacity. It also accepts
the earlier shorthand “natural3000”, while the interface uses the correct
programme name, Natura 2000.

Opacity is applied to the Leaflet layer in the browser. The underlying fully
opaque tiles are keyed only by data version, categories, countries and XYZ
coordinate, so dragging the opacity slider reuses the existing browser/server
tile cache instead of downloading and repainting the land overlay each step.
Intermediate slider values are previewed directly on that Leaflet layer; Atlas
persists the final value through a presentation-only cache when the interaction
finishes. It does not publish a React application-state update, so neither the
network frame nor the surrounding workspace is reconciled for an opacity change.

The initial electricity workspace also keeps carrier-specific control panels
out of the startup bundle. Methane, water, liquids, logistics and regional-solve
controls are downloaded only when their panel is first needed; a failed optional
chunk is isolated from the map and can be retried from the panel.

The PyPSA country catalogue is versioned and cached per resolution/source in
browser storage after a successful response. A reload during a short backend or
Nohm-proxy interruption therefore retains the last verified country selector,
labels it as saved data, and continues the visibility-aware reconnect loop. The
cache contains catalogue metadata only, expires after 30 days, and never replaces
the authoritative network response. The app's production homepage is fixed at
`/atlas`, so an ordinary `npm run build` emits a Nohm-mountable artifact. The
bundled production preview negotiates and caches gzip representations of static
HTML, JavaScript, CSS and data assets. Its cache is capped at 16 MB and keyed by
file size and modification time, so changed builds cannot reuse stale compressed
content and API proxy responses remain untouched.

## EMIL live voice

The standalone Atlas UI reuses Nohm's voice contracts:

- OpenAI Realtime WebRTC provides streaming transcription through Nohm's
  dedicated `gpt-live-transcribe` session. Atlas supplies place names and
  energy-system terms as model hints, and commits a turn after a local pause.
  The browser receives a short-lived client secret; the server API key is never
  exposed.
- Every final transcript enters the existing Atlas planner → action dispatcher
  → judge path. The Realtime model does not modify the map directly.
- Command stream mode queues rapid instructions and keeps replies visual.
- Conversation mode speaks the final verified reply through Nohm's resident
  Kokoro service using EMIL's `am_michael` voice. Speech can be interrupted by
  talking, and unavailable TTS degrades to captions.
- MediaRecorder upload transcription is available as a push-to-talk fallback
  if WebRTC cannot connect.
- Provider authentication rejection is treated differently from a transport
  failure: Atlas releases the microphone, does not offer an upload fallback
  that uses the same rejected server credential, and keeps typed commands
  available. No provider body or credential is exposed to the browser.

The local compatibility routes are `GET /api/voice/status`,
`POST /api/voice/realtime/client-secret`, `POST /api/voice/transcribe`, and
`POST /api/voice/speak`. In the integrated Nohm build, set
`REACT_APP_NOHM_VOICE_API_BASE=/api/nohm/voice` to use the authenticated Nohm
routes without changing the client.

### Voice lifecycle and safety

- Only completed transcripts enter the Atlas planner. Partial captions are
  editable drafts; provider failure or a missing final never runs a partial command.
- Live turns are ordered by commit events and item identifiers, not
  the arrival order of transcription completions. Each turn has its own deadline.
- The live data channel must open before the UI declares the connection ready.
  Setup is bounded to 25 seconds; an unavailable connection offers push-to-talk.
- Stop voice releases microphone tracks, peer connections, audio contexts,
  playback, recording timers, and pending upload requests. It clears waiting
  instructions; an Atlas operation already submitted is allowed to finish.
- The command queue has a limit of eight waiting entries and a clear control.
  Excess speech remains a caption instead of silently dropping an instruction.
- Push-to-talk recordings stop after 60 seconds. Upload reads are capped at 4 MB.
- Transcription uses automatic language detection by default. Set
  `NOHM_VOICE_LANGUAGE` on the server only when a fixed language is desired.

The ordering policy follows the [official Realtime transcription contract](https://developers.openai.com/api/docs/guides/realtime-transcription).
The local adapter retains Nohm's configured STT models and EMIL TTS profile.

### Local startup

Run the combined API with `python scripts/run_atlas_backend_stable.py` from
the PyPSA EUr workspace, and `npm start` from `atlas-land/app` for development.
The combined runner includes the land and voice extensions and runtime data
mirrors; running the legacy `app.py` directly omits those extensions.

The local runner defaults `NOHM_ATLAS_LOCAL_LOGS=1`. It does not attempt Google
Drive OAuth at startup, regardless of whether old credentials exist beside the
legacy application. Google dependencies are loaded only by GoogleDriveService.
NLP loads only when a geocoding request needs its fallback. Startup milestones
are written to stdout so an importing API is distinguishable from a dead process.

The runner now uses Waitress on loopback with bounded worker concurrency.
Browser origins and startup paths are configurable; an explicit shared-key
file can be selected without copying credentials into the codebase.
See `DEPLOYMENT.md` for configuration, API readiness and the authenticated
Nohm proxy contract, and `READINESS.md` for remaining sign-off checks.
Do not expose the standalone workspace API publicly as-is.
