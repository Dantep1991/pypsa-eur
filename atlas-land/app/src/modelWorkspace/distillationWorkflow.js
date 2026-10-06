import { atlasApiUrl } from '../config/api';

export const DISTILLATION_WORKFLOW_SCHEMA = 'nohm.atlas.distillation-workflow.v1';
export const distillationJobActive = job => ['queued', 'preparing', 'publishing'].includes(job?.state);

export function distillationCreationReasons(job) {
  if (!job || job.can_create) return [];
  const reasons = [];
  if (job.selection?.countries?.length && !job.boundary_policy) {
    reasons.push('Choose a country-boundary policy above, then run Preview subset again.');
  }
  if (job.summary?.deferred_demand_decisions > 0) {
    reasons.push('Select a parent solution with complete demand results, then run Preview subset again.');
  }
  if (job.summary?.boundary_parent_required) {
    reasons.push('Select a parent solution with complete hourly boundary results, then run Preview subset again.');
  }
  return reasons.length ? reasons : ['Review the preview warnings and run Preview subset again before creating the model.'];
}

export async function distillationRequest(context, action, body, fetchImpl = window.fetch.bind(window)) {
  if (!context?.projectId || !context?.version) throw new Error('Load a saved model version before distilling it.');
  const path = `/api/atlas/projects/${encodeURIComponent(context.projectId)}/distillation/${action}`;
  const response = await fetchImpl(atlasApiUrl(path), {
    credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  let result;
  try { result = await response.json(); } catch (_) { throw new Error(`Distillation service returned an unreadable response (${response.status}).`); }
  if (!response.ok) {
    // An unmounted route is a service/deployment issue, not an empty catalog.
    // Keep project/version-specific 404 details intact and never silently
    // switch to a different API or bypass the creation checks.
    if (response.status === 404 && result?.detail === 'Not Found' && action.startsWith('options')) {
      throw new Error('Distillation is unavailable on this preview. Open the current Atlas preview or update its model API.');
    }
    throw new Error(typeof result?.detail === 'string' ? result.detail : `Distillation request failed (${response.status}).`);
  }
  if (result?.schema !== DISTILLATION_WORKFLOW_SCHEMA || result.project_id !== context.projectId) {
    throw new Error('Distillation response does not belong to the selected model.');
  }
  if (result.source_version !== context.version) throw new Error('Distillation returned a different model version. Reload its options.');
  return result;
}

export const distillationStorageKey = context => `nohm.atlas.distillation:${context.projectId}:${context.version}`;
