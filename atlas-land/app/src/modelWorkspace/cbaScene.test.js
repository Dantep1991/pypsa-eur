import { cbaBands, cbaComponents, defaultCbaSelection, fetchCbaStudies, fetchCbaScene, positionCbaAssets, positionCbaCountries } from './cbaScene';

const study = { projectId: 'study', modelProjectId: 'model', name: 'Study', cases: ['case'],
  summary: { projects: ['case'], tscDelta: { '2050': { case: { total: 0 } }, '2040': {} }, sewDelta: { '2050': { case: { cs_elec: 0 } } } } };
const context = { mode: 'model', projectId: 'model', version: 'v1' };
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

test('actual zero-cost assessments and zero rents remain available; missing variants do not', () => {
  expect(cbaBands(study, 'case')).toEqual(['2050']);
  expect(cbaComponents(study, 'case', '2050').map(item => item.available)).toEqual([true, true, false, false, false]);
  expect(defaultCbaSelection(study)).toMatchObject({ studyId: 'study', caseId: 'case', band: '2050', component: 'total' });
});

test('links only active-model studies and requires saved assessments, not readiness flags', async () => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(response({ projects: [
    { projectId: 'study', modelProjectId: 'model', cbaReady: false },
    { projectId: 'empty', modelProjectId: 'model', cbaReady: true },
    { projectId: 'other', modelProjectId: 'other', cbaReady: true },
  ] })).mockResolvedValueOnce(response(study.summary)).mockResolvedValueOnce(response({}, 404)).mockResolvedValueOnce(response({}, 404));
  const result = await fetchCbaStudies(context, {}, fetchImpl);
  expect(result.map(item => item.projectId)).toEqual(['study']);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

test('service failure is an error, never a false empty catalogue', async () => {
  await expect(fetchCbaStudies(context, {}, async () => response({}, 500))).rejects.toThrow('500');
});

test.each([200, 404, 500])('saved active-model CBA is visible without registration even when catalogue returns %s', async status => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(response({ projects: [] }, status)).mockResolvedValueOnce(response(study.summary));
  const result = await fetchCbaStudies(context, { apiBase: '/atlas-api' }, fetchImpl);
  expect(result[0]).toMatchObject({ projectId: 'model', cases: ['case'] });
  expect(fetchImpl.mock.calls.map(call => call[0])).toEqual(['/atlas-api/api/theo/projects', '/atlas-api/api/theo/projects/model/cba-summary']);
});

test('a failed assessment stays failed, not a registration instruction', async () => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(response({ projects: [] })).mockResolvedValueOnce(response({ status: 'failed', error: 'Solver failed' }));
  await expect(fetchCbaStudies(context, {}, fetchImpl)).rejects.toThrow('Assessment failed: Solver failed');
});

test('one failed assessment does not hide another saved assessment', async () => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(response({ projects: [{ projectId: 'study', modelProjectId: 'model' }] }))
    .mockResolvedValueOnce(response(study.summary)).mockResolvedValueOnce(response({ detail: 'Assessment failed' }, 500));
  const result = await fetchCbaStudies(context, {}, fetchImpl);
  expect(result.map(item => item.projectId)).toEqual(['study']);
  expect(result[0].discoveryWarnings[0]).toContain('Assessment failed');
});

test('country positions come from database IDs, including zero coordinates, never name prefixes', () => {
  expect(positionCbaCountries([{ country: 'AA', value: 0 }, { country: 'BB', value: 8 }, { country: 'CC', value: 1 }],
    { AA: { lat: 0, lon: 0 }, CC: { lat: 100, lon: 0 } })).toEqual([
    { country: 'AA', value: 0, coordinates: [0, 0], coordinateSource: 'Emil geography database' },
  ]);
});

test('connections use actual topology; ambiguous cross-class identities stay unmapped', () => {
  const line = { id: 'line', name: 'A - B', from_node: 'A', to_node: 'B', coordinates: [[1, 2], [3, 4]] };
  const topologies = [{ class_name: 'Line', lines: [line] }, { class_name: 'Gas Pipeline', lines: [line] }];
  expect(positionCbaAssets([{ assetName: 'A-B', value: 0 }], topologies)).toEqual([]);
  expect(positionCbaAssets([{ assetName: 'A-B', value: 0, collectionName: 'Line' }], topologies)).toMatchObject([
    { id: 'line', from: 'A', to: 'B', value: 0, coordinates: [[1, 2], [3, 4]] },
  ]);
});

test('country query validates assessment provenance and publishes real progress phases', async () => {
  const data = { schema: 'nohm.atlas.cba-map.v1', studyId: 'study', caseId: 'case', band: '2050', component: 'consumer',
    countries: [{ country: 'AA', value: 0 }], assets: [] };
  const fetchImpl = jest.fn().mockResolvedValueOnce(response(data)).mockResolvedValueOnce(response({ coordinates: { AA: { lat: 1, lon: 2, source: 'database' } } }));
  const onProgress = jest.fn();
  const scene = await fetchCbaScene(context, study, { ...defaultCbaSelection(study), component: 'consumer' }, { onProgress }, fetchImpl);
  expect(scene.points[0]).toMatchObject({ value: 0, coordinateSource: 'database' });
  expect(scene.coverage).toEqual({ mapped: 1, reported: 1, unmapped: 0 });
  expect(onProgress.mock.calls.map(([state]) => state.completed)).toEqual([0, 1, 2]);
  expect(fetchImpl.mock.calls[1][0]).toContain('/api/emil/database/coordinates?');
  const wrong = async () => response({ ...data, caseId: 'other' });
  await expect(fetchCbaScene(context, study, defaultCbaSelection(study), {}, wrong)).rejects.toThrow('different assessment');
});

test('a summary without geography does not start a model read or invent a point', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ schema: 'nohm.atlas.cba-map.v1', studyId: 'study', caseId: 'case', band: '2050',
    component: 'total', countries: [], assets: [], totalSystemCostDelta: -100 }));
  const scene = await fetchCbaScene(context, study, defaultCbaSelection(study), {}, fetchImpl);
  expect(scene.points).toEqual([]);
  expect(scene.totalSystemCostDelta).toBe(-100);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
