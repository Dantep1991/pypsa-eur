import { distillationCreationReasons, distillationJobActive, distillationRequest } from './distillationWorkflow';
const context = { projectId:'P', version:'v1' };
const body = { schema:'nohm.atlas.distillation-workflow.v1', project_id:'P', source_version:'v1' };
const response = data => ({ ok:true, status:200, json:async()=>data });
test('calls the authenticated same-origin Atlas boundary with an exact version', async () => {
  const fetch = jest.fn(async () => response(body));
  await distillationRequest(context, 'preview', { version:'v1', countries:['AA'], carriers:['declared'] }, fetch);
  expect(fetch.mock.calls[0][0]).toContain('/api/atlas/projects/P/distillation/preview');
  expect(fetch.mock.calls[0][1].credentials).toBe('same-origin');
  expect(JSON.parse(fetch.mock.calls[0][1].body).version).toBe('v1');
});
test.each([{...body,project_id:'Other'},{...body,source_version:'v2'},{...body,schema:'incorrect'}])('refuses foreign result identity', async data => {
  await expect(distillationRequest(context,'options',undefined,async()=>response(data))).rejects.toThrow();
});
test('backend error details are not swallowed', async () => {
  await expect(distillationRequest(context,'options',undefined,async()=>({ok:false,status:422,json:async()=>({detail:'Source changed'})}))).rejects.toThrow('Source changed');
});

test('a missing options route explains the unavailable service rather than implying an empty model', async () => {
  const fetch = jest.fn(async () => ({ok:false,status:404,json:async()=>({detail:'Not Found'})}));
  await expect(distillationRequest(context,'options?version=v1',undefined,fetch))
    .rejects.toThrow('Distillation is unavailable on this preview.');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('a missing saved schema remains a specific error, not a service warning', async () => {
  await expect(distillationRequest(context,'options?version=v1',undefined,async()=>({
    ok:false,status:404,json:async()=>({detail:'Model schema v1 does not exist in P.'})
  }))).rejects.toThrow('Model schema v1 does not exist in P.');
});
test('polls only state-backed active work, not completed or failed work', () => {
  ['queued','preparing','publishing'].forEach(state=>expect(distillationJobActive({state})).toBe(true));
  ['preview_ready','published','failed'].forEach(state=>expect(distillationJobActive({state})).toBe(false));
});

test('creation guidance uses actual blocking fields, not source-file warnings alone', () => {
  expect(distillationCreationReasons({can_create:true, warnings:['Input files need review']})).toEqual([]);
  expect(distillationCreationReasons({can_create:false,selection:{countries:['AA']},boundary_policy:'',
    summary:{deferred_demand_decisions:2}})).toEqual([
    'Choose a country-boundary policy above, then run Preview subset again.',
    'Select a parent solution with complete demand results, then run Preview subset again.',
  ]);
  expect(distillationCreationReasons({can_create:false,selection:{countries:['AA']},boundary_policy:'closed',
    summary:{deferred_demand_decisions:0}})).toEqual([
    'Review the preview warnings and run Preview subset again before creating the model.',
  ]);
});
