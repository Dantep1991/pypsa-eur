import { adaptLolaFlowRows, fetchLolaFlowScene, lolaFlowFrame, selectedFlowSamples, flowMetricContract, flowUtilisation } from './lolaFlowData';

const context = { mode: 'model', projectId: 'Example' };
const selection = { runId: 'run', runModelVersion: 'v1', modelVersion: 'v1', className: 'Line', propertyName: 'Flow', unit: 'GWh', granularity: 'year', availableGranularities: ['year'], period: '2050' };
const line = { id: 'Line:Exact', name: 'Exact', from_node: 'A', to_node: 'B', coordinates: [[1, 2], [3, 4]], category: 'Native' };
const topology = { schema: 'nohm.atlas.flow-topology.v1', project_id: 'Example', model_version: 'v1', class_name: 'Line', lines: [line] };
const row = { entity_name: 'Exact', time_bucket: '2050-01-01', value: -10, unit_name: 'GWh', from_node: 'A', to_node: 'B' };
const payload = rows => ({ project_id: 'Example', runs: [{ run_id: 'run', schema_version_id: 'v1' }], rows });

test('empty history windows retain warnings without weakening normal or foreign-run validation',async()=>{
  const empty={...payload([]),query:{run_ids:['run'],class_name:'Line',property_name:'Flow'},summary:{row_count:0},missing_runs:[{reason:'Not reported'}]};
  const fetchImpl=jest.fn(async()=>({ok:true,json:async()=>empty}));
  await expect(fetchLolaFlowScene(context,selection,{topology},fetchImpl)).rejects.toThrow('Not reported');
  const result=await fetchLolaFlowScene(context,selection,{topology,allowEmptyHistoryWindow:true},fetchImpl);
  expect(result.lines).toEqual([]);expect(result.warnings[0]).toContain('Not reported');
  empty.runs[0].schema_version_id='v2';
  await expect(fetchLolaFlowScene(context,selection,{topology,allowEmptyHistoryWindow:true},fetchImpl)).rejects.toThrow('loaded model version');
});

test('signed Line flow preserves canonical endpoints and reverses geometry exactly once', () => {
  const scene = adaptLolaFlowRows(payload([row]), topology, context, selection);
  const frame = lolaFlowFrame(scene, '2050-01-01');
  expect(frame.lines[0].coordinates).toEqual([[3, 4], [1, 2]]);
  expect(frame.lines[0].actualFrom).toBe('B');
  expect(scene.lines[0].from_node).toBe('A');
  const back = adaptLolaFlowRows(payload([row]), topology, context, { ...selection, propertyName: 'Flow Back' });
  expect(lolaFlowFrame(back, '2050-01-01').lines[0].actualFrom).toBe('A');
});

test('Gas Pipeline uses its native endpoints with zero and missing periods distinguished', () => {
  const gas = { ...selection, className: 'Gas Pipeline', propertyName: 'Flow In' };
  const scene = adaptLolaFlowRows(payload([{ ...row, value: 0 }, { ...row, entity_name: 'Unmatched', time_bucket: '2050-02-01', value: 2 }]),
    { ...topology, class_name: 'Gas Pipeline' }, context, gas);
  expect(lolaFlowFrame(scene, '2050-01-01').lines[0].magnitude).toBe(0);
  expect(lolaFlowFrame(scene, '2050-02-01').lines).toHaveLength(0);
  expect(selectedFlowSamples(scene, line.id)[1].value).toBeNull();
  expect(scene.coverage.unmatched).toBe(1);
  expect(flowMetricContract({ class_name: 'GasPipeline', property_name: 'Production' })).toBeNull();
});

test.each([
  [{ ...row, from_node: 'Other' }, 'endpoint'],
  [{ ...row, value: null }, 'finite value'],
  [{ ...row, unit_name: 'MW' }, 'unit'],
  [{ ...row, time_bucket: 'not a date' }, 'timestamp'],
  [{ ...row, class_name: 'Generator' }, 'class'],
])('invalid reported observations are rejected: %s', (bad, message) => {
  expect(() => adaptLolaFlowRows(payload([bad]), topology, context, selection)).toThrow(message);
});

test('duplicate periods, foreign topology, truncated queries and foreign runs cannot be mapped', () => {
  expect(() => adaptLolaFlowRows(payload([row, row]), topology, context, selection)).toThrow('duplicate');
  expect(() => adaptLolaFlowRows(payload([row]), { ...topology, model_version: 'v2' }, context, selection)).toThrow('exact project');
  expect(() => adaptLolaFlowRows({ ...payload([row]), summary: { row_count_before_limit: 2 } }, topology, context, selection)).toThrow('truncated');
  expect(() => adaptLolaFlowRows(payload([{ ...row, run_id: 'other' }]), topology, context, selection)).toThrow('different simulation');
});

test('parallel links are never substituted by endpoint matching and unmapped history is retained', () => {
  const other = { ...line, name: 'Parallel', id: 'Line:Parallel', coordinates: [] };
  const scene = adaptLolaFlowRows(payload([{ ...row, entity_name: 'Parallel' }]), { ...topology, lines: [line, other] }, context, selection);
  expect(scene.lines[0].id).toBe('Line:Parallel');
  expect(scene.coverage.unmapped).toBe(1);
  expect(lolaFlowFrame(scene, row.time_bucket).lines).toHaveLength(0);
  expect(selectedFlowSamples(scene, other.id)[0].value).toBe(-10);
});

test('only compatible, unambiguous model limits support utilisation; observed peaks never do', () => {
  expect(flowUtilisation(line, 10, 'GWh', 'year')).toBeNull();
  const limited = { ...line, limits: [{ property: 'Max Flow', value: 100, unit: 'MW' }, { property: 'Min Flow', value: -50, unit: 'MW' }] };
  expect(flowUtilisation(limited, -25, 'MW', 'hour')).toBe(0.5);
  expect(flowUtilisation(limited, 50, 'GWh', 'year')).toBeNull();
  expect(flowUtilisation({ ...line, limits: [{ property: 'Max Flow Day', value: 20, unit: 'GWh' }] }, 10, 'GWh', 'year')).toBeNull();
  expect(flowUtilisation({ ...limited, limits: [...limited.limits, limited.limits[0]] }, 50, 'MW', 'hour')).toBeNull();
});

test('reported time-specific directional limits drive near-limit colouring, never observed maxima', () => {
  const limited = { ...line, reportedLimits: new Map([
    ['2050-01-01', { unit: 'MW', forward: 100, reverse: 50 }],
    ['2050-01-02', { unit: 'MW', forward: 200, reverse: 0 }],
  ]) };
  expect(flowUtilisation(limited, 99, 'MW', 'hour', 1, '2050-01-01')).toBe(.99);
  expect(flowUtilisation(limited, -25, 'MW', 'hour', 1, '2050-01-01')).toBe(.5);
  expect(flowUtilisation(limited, 99, 'MW', 'hour', 1, '2050-01-02')).toBe(.495);
  expect(flowUtilisation(limited, -25, 'MW', 'hour', 1, '2050-01-02')).toBeNull();
  expect(flowUtilisation(limited, 2.4, 'GWh', 'day', 1, '2050-01-01')).toBeCloseTo(1);
  expect(flowUtilisation(limited, 2.4, 'GWh', 'year', 1, '2050-01-01')).toBeCloseTo(24 / 8760);
  expect(flowUtilisation({ ...limited, limits: [{ property: 'Max Flow', value: 100, unit: 'MW' }] },
    99, 'MW', 'hour', 1, 'unreported-period')).toBeNull();
});

test('native flow loads matching-run limit series at the selected dates', async () => {
  const hourly = { ...selection, granularity: 'hour', availableGranularities: ['hour','day'], unit: 'MW',
    dateFrom: '2050-01-01', dateTo: '2050-01-01', limitProperties: ['Export Limit', 'Import Limit'] };
  const fetchImpl = jest.fn(async (_url, init) => {
    const request = JSON.parse(init.body);
    return { ok: true, json: async () => payload([{ ...row, class_name: 'Line', property_name: request.property_name,
      value: request.property_name === 'Flow' ? 99 : 100, unit_name: 'MW' }]) };
  });
  const scene = await fetchLolaFlowScene(context, hourly, { topology }, fetchImpl);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(scene.lines[0].reportedLimits.get(row.time_bucket)).toEqual({ unit: 'MW', forward: 100, reverse: 100 });
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toMatchObject({run_ids:['run'],granularity:'hour',
    date_from:'2050-01-01',date_to:'2050-01-01T23:59:59',entity_names:['Exact']});
});

test('a foreign capacity quantity cannot be used as a declared limit', async () => {
  const hourly = { ...selection, granularity: 'hour', availableGranularities: ['hour'], unit: 'MW',
    dateFrom: '2050-01-01', dateTo: '2050-01-01', limitProperties: ['Export Limit'] };
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => payload([
    { ...row, value: 99, unit_name: 'MW', class_name: 'Line', property_name: 'Flow' }]) }));
  await expect(fetchLolaFlowScene(context, hourly, { topology }, fetchImpl)).rejects.toThrow('capacity limits do not match');
});

test('queries reuse the solution API with exact class, date range, units and real phase progress', async () => {
  const fetchImpl = jest.fn(async url => ({ ok: true, json: async () => url.includes('flow-topology') ? topology : payload([row]) }));
  const onProgress = jest.fn();
  await fetchLolaFlowScene(context, selection, { onProgress }, fetchImpl);
  expect(fetchImpl.mock.calls[0][0]).toContain('flow-topology?version=v1&class_name=Line&year=2050');
  const request = JSON.parse(fetchImpl.mock.calls[1][1].body);
  expect(request).toMatchObject({ class_name: 'Line', property_name: 'Flow', granularity: 'year', group_by: 'line', quantity_aware_aggregation: true, date_from: '2050-01-01' });
  expect(onProgress.mock.calls.map(([value]) => value.completed)).toEqual([0, 1, 2, 3]);
  await expect(fetchLolaFlowScene(context, { ...selection, granularity: 'hour' }, {}, fetchImpl)).rejects.toThrow('not reported');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('reported leap-day and sparse periods are preserved without fabricated daily samples', () => {
  const scene = adaptLolaFlowRows(payload([{ ...row, time_bucket: '2052-02-29' }, { ...row, time_bucket: '2052-03-02' }]), topology, context, selection);
  expect(scene.periods).toEqual(['2052-02-29', '2052-03-02']);
});

const quality = { schema: 'nohm.results.quality.v1', policy: 'reject', conflicted_entity_count: 1, excluded_entity_count: 0,
  source_data_changed: false, conflicts: [{ run_id: 'run', entity_name: 'Disputed', periods: [] }] };

test('structured conflicts surface review details without an automatic retry', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 409, json: async () => ({ detail: {
    code: 'result_observation_conflict', message: 'Disputed values', quality,
  } }) }));
  await expect(fetchLolaFlowScene(context, selection, { topology }, fetchImpl)).rejects.toMatchObject({ code: 'result_observation_conflict', quality });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).observation_conflict_policy).toBe('reject');
});

test('explicit exclusion policy is forwarded and accepted quality stays with the committed scene', async () => {
  const excluded = { ...quality, policy: 'exclude_entities', excluded_entity_count: 1 };
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ ...payload([row]), quality: excluded }) }));
  const result = await fetchLolaFlowScene(context, selection, { topology, conflictPolicy: 'exclude_entities' }, fetchImpl);
  expect(result.quality).toEqual(excluded);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).observation_conflict_policy).toBe('exclude_entities');
  expect(() => adaptLolaFlowRows({ ...payload([]), quality: excluded }, topology, context, selection)).toThrow('No valid observations');
  expect(() => adaptLolaFlowRows({ ...payload([row]), quality: { ...excluded, conflicts: [{ run_id: 'other', entity_name: 'Disputed', periods: [] }] } }, topology, context, selection)).toThrow('foreign flow quality');
  expect(() => adaptLolaFlowRows({ ...payload([row]), quality: { ...excluded, conflicts: [{ run_id: 'run', entity_name: 'Exact', periods: [] }] } }, topology, context, selection)).toThrow('disputed flow object remains');
  fetchImpl.mockImplementation(async () => ({ ok: true, json: async () => payload([row]) }));
  await expect(fetchLolaFlowScene(context, selection, { topology, conflictPolicy: 'exclude_entities' }, fetchImpl)).rejects.toThrow('did not confirm');
});
