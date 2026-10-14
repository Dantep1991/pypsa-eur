# Scoped overlay planner and repair update

The served frontend is `atlas-land/app`, not the legacy `ai-market-studio`
copy. The combined API launcher imports the legacy repository's backend.

## Changes

- Clarify standalone carrier switching versus additive, country-scoped overlays
  in the planner's action descriptions and prompts.
- Reject contradictory Jev decisions (overlay on/off paired with a different
  action) and delegate to the existing full planner instead of executing them.
- Permit the verifier to execute overlay, mixed-resolution and map-display
  repairs. Report unsupported repairs instead of silently dropping them.
- Re-audit the actual map after the existing bounded correction round.

## Verification

- Backend Jev unit tests: 15 passed.
- App regression: four targeted tests passed, including the complete Spain
  Full / France bidding-zone / Portugal NUTS3 sequence, Portugal-only methane,
  recovery from a deliberately wrong standalone switch, and re-audit failure.
  These use mocked planner/data responses and the real App execution path;
  Leaflet rendering is mocked.
- Live interpret request returned `set_network_overlay`, gas, PT, visible true.
- Live judge presented with a standalone result returned the same scoped
  overlay repair. These live responses identified their provider as `nohm`;
  they do not demonstrate a Jev-only success or a speed improvement.
- Production build passed. Served main bundle: `main.1044b64b.js`.
- Broader three-suite run: 176 passed, 45 failed. Failures include outdated UI
  selectors and geometry expectations; full-suite success is NOT claimed.

## Runtime

Updated the live `app/build` assets, retaining older hashed assets for existing
tabs. Previous index is saved in
`app/build-overlay-repair-20260925/previous-live-index.html`.
Restarted only Atlas API on port 5001, with explicit loopback origins for Nohm
5176 and Atlas 3000/3001. Nohm itself was not restarted. Reload the Atlas page
to acquire the new bundle. Candidate backend on port 5003 was stopped.
