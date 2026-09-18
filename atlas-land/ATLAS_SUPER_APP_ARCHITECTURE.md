# Atlas super-app shell and delivery roadmap

## Purpose

Atlas is the map-first workspace for Nohm Flow.  Step 1 makes the existing
network-map experience feel like a Nohm product without changing its data,
viewport, country/network/build workflows, or backend contracts.

## Step 1 shell

The map remains the canvas.  The left control surface has four stable workspace
areas, each revealing the existing controls rather than creating parallel
workflows:

1. **Model** — country scope, network source, resolution and mixed granularity.
2. **Operate** — build/solve mode and the existing regional-solve controls.
3. **Visualise** — carrier visibility, generation mix and map display layers.
4. **Explore** — regional clustering and map patterns.

The rail is keyboard-operable (arrow keys plus Home/End), has a clear active
state, and becomes the single disclosure mechanism on compact screens.  The
control drawer still owns its own scrolling and never changes map geometry,
so opening or closing it cannot move the map viewport.

Step 1 adopts Nohm's token contracts rather than a new Atlas palette:
`--bg-*`, `--panel-*`, `--text-*`, `--border-*`, `--accent-primary*`, radius,
elevation and `data-theme` light/dark behaviour.  The values are adapted from
the Nohm implementation at `src/user_interfaces/Nohm/src/index.css`; Atlas
uses the same persisted-theme pattern and token names.  Existing map-specific
colours remain untouched where they encode carrier data.

## Roadmap (not implemented in Step 1)

1. Load an energy model onto Atlas.
2. Enable Atlas operations.
3. Enable model runs from Atlas.
4. Enable analysis in Atlas.
5. Enable visualisation in Atlas.
6. Embed Lola's Flow visualisation in Atlas.
7. Add portals for demand, climate and commodity domains.
8. Add an in-app Explore Model portal.
9. Add Emil's CBA and economic-assessment capabilities.

Future portals should attach to one of the four areas or appear in a contextual
second level only after their service is available.  Do not add inactive portal
buttons to the primary rail: this preserves progressive disclosure and keeps
the current map workflow fast to scan.

## Integration boundaries and risks

- Atlas is presently an independently served React application.  Embed it in
  Nohm only through an authenticated route/proxy and a shared `data-theme`
  contract; do not depend on Nohm's source tree at runtime.
- Lola Flow and the future model/run/analysis portals need explicit route,
  authentication, loading and error contracts before they are introduced.
- Maintain the current Leaflet data semantics and carrier colours: they are
  visual data encodings, not application chrome.
