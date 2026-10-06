import { createdModelContext, executionActive, modelExecutionRequest } from './modelExecution';

test('run targets are only the published child; map and schema previews cannot execute', () => {
  const job = { state: 'preview_ready', offspring_project_id: 'Child', offspring_version: 'v1' };
  expect(createdModelContext(job, 'subset')).toBeNull();
  expect(createdModelContext({ ...job, state: 'published' }, 'subset')).toEqual({ projectId: 'Child', version: 'v1' });
  expect(createdModelContext({ ...job, state: 'created' }, 'mixed')).toEqual({ projectId: 'Child', version: 'v1' });
  expect(createdModelContext({ state: 'created', model_url: '/parent' }, 'mixed')).toBeNull();
});

test('run transport carries confirmation and rejects cross-model or version responses', async () => {
  const context = { projectId: 'Child', version: 'v1' };
  const result = { schema: 'nohm.atlas.model-execution.v1', project_id: 'Child', version: 'v1', state: 'running' };
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => result }));
  const body = { engine: 'pypsa', confirm: true };
  await modelExecutionRequest(context, 'start', body, fetchImpl);
  expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/Child/execution/start'), expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }));
  result.version = 'v2';
  await expect(modelExecutionRequest(context, 'start', body, fetchImpl)).rejects.toThrow('different model version');
});

test.each(['queued', 'checking', 'converting', 'running', 'repairing'])('%s polls real background state', state => expect(executionActive({ state })).toBe(true));
test.each(['completed', 'failed', 'repaired', 'blocked', 'repair_ready'])('%s does not masquerade as active', state => expect(executionActive({ state })).toBe(false));
