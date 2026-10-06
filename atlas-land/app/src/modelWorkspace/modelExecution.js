import { atlasApiUrl } from '../config/api';

export const MODEL_EXECUTION_SCHEMA = 'nohm.atlas.model-execution.v1';
export const executionActive = job => ['queued', 'checking', 'converting', 'running', 'repairing'].includes(job?.state);

export async function modelExecutionRequest(context, endpoint, body, fetchImpl = window.fetch.bind(window)) {
  if (!context?.projectId || !context?.version) throw new Error('Create a saved model first.');
  const response = await fetchImpl(atlasApiUrl(`/api/atlas/projects/${encodeURIComponent(context.projectId)}/execution/${endpoint}`), {
    credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  let result;
  try { result = await response.json(); } catch (_) { throw new Error(`Model run service is unavailable (${response.status}).`); }
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Model run request failed.');
  if (result.schema !== MODEL_EXECUTION_SCHEMA || result.project_id !== context.projectId || result.version !== context.version)
    throw new Error('The run response belongs to a different model version.');
  return result;
}

export function createdModelContext(job, kind) {
  if (kind === 'subset' && job?.state === 'published' && job.offspring_project_id && job.offspring_version)
    return { projectId: job.offspring_project_id, version: job.offspring_version };
  if (kind === 'mixed' && job?.state === 'created' && job.offspring_project_id && job.offspring_version)
    return { projectId: job.offspring_project_id, version: job.offspring_version };
  return null;
}
