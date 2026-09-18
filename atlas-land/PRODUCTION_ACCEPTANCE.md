# Nohm Atlas production acceptance

This checklist promotes the current controlled-integration candidate to a hosted
production service. It does not replace `READINESS.md`; it records evidence that
can only be produced in the destination environment. A gate is either **PASS**
with linked evidence or **HOLD**. Blank, inferred or local-development evidence
is a hold.

## Release identity

Record before testing:

| Field | Required value |
| --- | --- |
| Release/commit | Immutable source revision |
| Atlas build | `asset-manifest.json` plus SHA-256 of the deployed main bundle |
| Backend build | Immutable image/package/revision |
| Data release | Source manifest, retrieval dates, licences and checksums |
| Environment | Host/cluster, region and public origin |
| Owners | Product, platform, security, data and operations approvers |

Do not accept evidence from a different revision or data release.

## 1. Authenticated HTTPS host

- `/atlas/` and `/atlas-api/` are served from the authenticated Nohm origin over
  trusted HTTPS; HTTP redirects to HTTPS and no mixed content is requested.
- The browser origin is an exact `NOHM_ATLAS_ALLOWED_ORIGINS` entry. Wildcards,
  credentialed URLs and path-bearing origins are rejected.
- Unauthenticated requests cannot read Atlas pages/data or execute mutations.
  Session expiry and logout revoke subsequent API access.
- CSRF, request-size limits and rate limits are exercised on write/AI routes.
- CSP, frame ancestry, permissions policy and secure cookie attributes are
  captured from the deployed responses.

Evidence: sanitized response headers, browser network export, unauthenticated and
expired-session tests, CSRF/rate-limit results. Never attach credentials.

## 2. Tenant and workspace isolation

The local Atlas backend has process-global workspace/model state. Production must
either provide one isolated process and data directory per workspace or replace
that state with server-enforced tenant scoping.

- Two test users in different tenants concurrently load different countries,
  layers, model settings and jobs.
- Neither user can read, mutate, infer or receive the other's state, cache keys,
  uploaded paths, job output, assistant history or error details.
- Direct-object and guessed-identifier requests fail with the platform's normal
  non-disclosing authorization response.
- Restart/reconnect preserves only the state the product explicitly promises.

Evidence: cross-tenant negative test report and architecture/configuration record.
Browser-only hiding is not evidence.

## 3. Supervision, capacity and recovery

- Atlas API, Nohm proxy, frontend and optional Kokoro sidecar run under the
  destination supervisor with bounded CPU/RAM, restart policy and health probes.
- Kill and restart each service. The UI must show a bounded recovery state,
  recover without a reload where promised, and never publish partial map state.
- Run the maximum 34-country Full/Nodal electricity + methane + water workload
  concurrently at the agreed user count. Record p50/p95 latency, peak memory,
  failures and saturation behavior.
- Logs and traces correlate requests without exposing prompts, API keys, cookies,
  upstream bodies, local paths or tenant data.

Evidence: deployment manifest, probe configuration, restart drill, load report and
redacted log sample.

## 4. Data publication, licences and restore

- Regenerate [`DATA_SOURCE_REGISTER.md`](DATA_SOURCE_REGISTER.md) and retain the
  matching `data-governance/source-register.json` with the immutable release.
  Its engineering decision is deliberately HOLD; a named data/licensing owner
  must resolve every non-open term and approve the required attribution set.
- Every published electricity, methane, water, liquids, logistics, land and grid
  queue source has an approved licence, attribution, geographic/temporal coverage,
  retrieval time, checksum and responsible owner.
- Missing, provisional, estimated and stale data remain labelled in UI/API output.
- Refresh publication is atomic and rollback-safe; failed refreshes retain the
  last approved release and emit an actionable alert.
- Restore source databases, catalogues and configuration into an empty environment
  and verify checksums plus representative map queries. `map-responses` is a
  disposable derived cache and must not be treated as a source backup.
- Record RPO/RTO and complete one timed restore drill.

Evidence: signed source register, refresh/rollback report and restore drill.

## 5. Physical work-laptop acceptance

On the actual supported 8 GB/four-core work laptop and managed corporate browser:

- Cold and warm Nohm launch; Spain Full/Nodal with all four power domains; and all
  Europe Full/Nodal electricity + methane + water.
- Repeated zoom, pan, opacity, node/boundary and domain changes for at least 30
  minutes. Record peak browser memory, long tasks, crashes and visual corruption.
- Verify 1023×600 and 1366×768 layouts, 100/125/150% OS scaling, keyboard-only use,
  reduced motion and screen-reader names.

Acceptance ceilings are the automated release budgets unless product owners
approve stricter values: startup 8 s cold/5 s warm, loaded heap 200 MB, no failed
API requests, no inaccessible controls and no sustained memory growth.

## 6. Physical voice acceptance

Use representative approved microphones; automated tests must not grant permission.

- Push-to-talk and Conversation modes: permission grant/denial, device change,
  mute, interruption, reconnect, provider timeout and text fallback.
- Quiet office, meeting-room noise and normal laptop fan noise.
- Supported accents/languages and Atlas-critical terms including France, Spain,
  NUTS1/2/3, bidding zone, methane, storage and generation.
- Confirm the visible transcript before map action, one action per final utterance,
  no execution of partial speech, and judge correction without repeated zoom.
- Confirm audio/transcripts are retained only under the approved privacy policy.

Evidence: device/browser matrix, transcripts with sensitive content removed,
latency/error measurements and signed privacy retention decision.

## 7. Live ingestion and security boundary

- Execute the opt-in real-HTTPS ingestion matrix from the production network with
  certificate validation enabled. No `verify=False`, local trust bypass or copied
  stale response may be counted as a pass.
- Run dependency/SBOM, secret, SAST and infrastructure scans on the immutable
  release. Triage findings and record accepted risks with owner/expiry.
- Verify egress allowlists for source providers, Esri tiles and configured AI
  providers. Provider failure must degrade to explicit unavailable states.

Evidence: HTTPS matrix, scan reports, risk approvals and egress policy.

## Reproducible local gates

Run these again against the immutable release before deployment:

```powershell
cd 'D:\Energy models\PyPSA\PyPSA EUr\atlas-land\app'
npm run test:preview
npm run test:browser-network-budget
npm run test:voice-roundtrip

cd 'D:\Artificial Intelligence\AI Architecture'
& '.\scripts\nohm\start-nohm.ps1' -CheckOnly

cd 'D:\Energy models\PyPSA\PyPSA EUr'
python atlas-land\scripts\audit_source_governance.py
```

After the production API starts, preload and verify the exact published demand
year. The second command must report every entry as an initial hit after restart:

```powershell
cd 'D:\Energy models\PyPSA\PyPSA EUr'
python atlas-land/scripts/warm_grid_map_cache.py --scopes grid,supply,storage,demand --demand-year 2030 --report .atlas-runtime/component-cache-warmup.json
python atlas-land/scripts/warm_grid_map_cache.py --scopes grid,supply,storage,demand --demand-year 2030 --require-initial-hit --report .atlas-runtime/component-cache-restart-verification.json
```

## Promotion record

| Gate | Status | Evidence | Owner | Date |
| --- | --- | --- | --- | --- |
| Authenticated HTTPS host | HOLD |  |  |  |
| Tenant/workspace isolation | HOLD |  |  |  |
| Supervision/capacity/recovery | HOLD |  |  |  |
| Data licences/publication/restore | HOLD |  |  |  |
| Physical work laptop | HOLD |  |  |  |
| Physical voice | HOLD |  |  |  |
| Live ingestion/security | HOLD |  |  |  |

Production promotion requires every row to be **PASS** and approval by the named
owners. Nohm modelling-result qualification is separate and cannot waive a row.
