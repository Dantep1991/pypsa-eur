# Atlas results promotion into Nohm

The paired Nohm backend provides the production model/result services. Build this renderer with the existing `/atlas` homepage and same-origin `/atlas-api` default, and deploy the backend first. Do not ship the loopback-only sandbox host as the Nohm integration.

This source promotion includes the reviewed Flow Explorer, history/capacity evidence, model assets and linked inputs, canonical geography aggregation, result comparison, adjustable result markers, single sidebar inspector, and existing presentation/mixed-granularity improvements. Raw models/results, generated bundles, credentials and dependency folders are excluded.

Fresh validation batches: 70 tests in 12 comparison/inspector suites; 143 in 16 flow/assets/marker suites; 82 in 10 binding/startup/navigation suites. These batches overlap and are not a unique-test total. Preview mounting tests: 15 passed, 2 optional live-build checks skipped. The production build and same-origin build contract pass. A stale binding fixture was corrected and unknown native resolution now blocks bidding-zone projection. The first unrestricted renderer sweep did not finish and was stopped; no all-suite pass is claimed.

The backend has 179 focused Python tests passing and 3 external-schema integration skips. See its `docs/ATLAS_RESULTS_PROMOTION.md` for scope, deployment and rollback. These checks do not constitute a production deployment or a newly verified solver run. Keep the original preview worktrees until deployment acceptance, and revert both promotion commits together for rollback.
