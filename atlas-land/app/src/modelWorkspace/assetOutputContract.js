// Registered solutions and native/retained results expose different query
// envelopes. Both must identify the project, bound run/version and every row.
export function validateAssetOutputProvenance(payload, context, selection) {
  const fail = () => { throw new Error('Outputs require matching project, model-version and result-run provenance.'); };
  if (!selection.runId || !selection.modelVersion || payload.project_id !== context.projectId || !Array.isArray(payload.rows)) fail();
  const hasRunMetadata = Object.prototype.hasOwnProperty.call(payload, 'runs');
  const metadata = hasRunMetadata ? payload.runs : [selection.runBinding];
  if (!Array.isArray(metadata) || metadata.length !== 1 || !metadata[0]) fail();
  const run = metadata[0];
  const versions = [run.schema_version_id || run.model_version_id, run.version_hint, ...(run.registry_versions || [])].filter(Boolean);
  if (run.run_id !== selection.runId || run.binding_status === 'unresolved' || !versions.length ||
      versions.some(version => version !== selection.modelVersion) ||
      (run.result_model_version && run.result_model_version !== selection.modelVersion)) fail();
  const ids = payload.query?.run_ids;
  // The legacy envelope has no `runs`: validate its explicit query identity
  // against independently discovered catalogue metadata, not the request alone.
  if ((!hasRunMetadata || ids !== undefined) && (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== selection.runId)) fail();
  if (payload.rows.some(row => row.run_id !== selection.runId)) fail();
}

export function assetOutputUnit(quantity, granularity) {
  // Legacy catalogues declare the annual unit only. Hourly/daily rows can use
  // another source unit; never label or validate those as annual GWh.
  return quantity?.units_by_granularity?.[granularity] || (granularity === 'year' ? quantity?.unit : '') || '';
}

export function assetOutputWindow(year, granularity) {
  return { from: `${year}-01-01`, to: granularity === 'year' ? `${year}-12-31` : `${year}-01-01` };
}
