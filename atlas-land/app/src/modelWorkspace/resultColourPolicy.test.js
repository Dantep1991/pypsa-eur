import { interpretResultColours } from './resultColourPolicy';
import { decorateModelResultRecord, modelResultColor, projectModelResultScene } from './resultScene';
import { resultPalette } from './resultColors';

const scene = {
  project_id: 'Study', model_version: 'v1', run: { run_id: 'exact-run' },
  selection: { class_name: 'Node', property_name: 'Price', category: 'Market', map_mode: 'bubbles', map_target: 'node' },
  legend: { minimum: -2, maximum: 100, maximum_magnitude: 100, unit: '$/MWh', scale: 'diverging' },
  values: [{ entity_id: 'Node:A', value: -2, unit: '$/MWh' }, { entity_id: 'Node:B', value: 100, unit: '$/MWh' }],
};
const reply = policy => jest.fn(async () => ({ ok: true, json: async () => policy }));

test('Results sends exact quantity context to the existing Jev cache and preserves all values', async () => {
  const before = JSON.stringify(scene), progress = jest.fn();
  const fetchImpl = reply({ preference: 'decrease', model: 'jev', cached: true });
  const result = await interpretResultColours(scene, { apiBase: '/atlas-api', onProgress: progress }, fetchImpl);
  expect(fetchImpl.mock.calls[0][0]).toBe('/atlas-api/api/atlas/projects/Study/comparison-policy');
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ model_version: 'v1', class_name: 'Node',
    property_name: 'Price', category: 'Market', unit: '$/MWh', objective: '' });
  expect(progress.mock.calls.map(([value]) => value.completed)).toEqual([0, 1]);
  expect(result.color_policy).toMatchObject({ preference: 'decrease', cached: true });
  expect(result.values).toBe(scene.values);
  expect(JSON.stringify(scene)).toBe(before);
  expect(modelResultColor(-2, result.legend)).toBe('rgb(34, 197, 94)');
  expect(modelResultColor(100, result.legend)).toBe('rgb(239, 68, 68)');
  const byId = new Map(result.values.map(row => [row.entity_id, row]));
  const decorated = decorateModelResultRecord({ id: 'Node:A' }, { ...result, valueByEntityId: byId });
  expect(decorated.atlas_result_magnitude_ratio).toBe(.02);
  expect(decorated.atlas_result_value).toBe(-2); // Colour direction never changes signed magnitude.
});

test('unknown property names are interpreted by the model, not matched against a price list', async () => {
  const result = await interpretResultColours({ ...scene, selection: { ...scene.selection, property_name: 'Declared quantity' } },
    { objective: 'A user analysis objective' }, reply({ preference: 'increase' }));
  expect(result.legend.favourable_direction).toBe('increase');
  expect(modelResultColor(100, result.legend)).toBe('rgb(34, 197, 94)');
});

test.each([reply({ preference: 'invalid' }), jest.fn(async () => ({ ok: false })),
  jest.fn(async () => { throw new Error('Provider secret error'); })])('unavailable advice leaves values neutral and usable', async fetchImpl => {
  const result = await interpretResultColours(scene, {}, fetchImpl);
  expect(result.color_policy).toMatchObject({ preference: 'context_dependent', manual_required: true });
  expect(result.color_policy.reason).not.toContain('secret');
  expect(result.values).toBe(scene.values);
  expect(modelResultColor(-2, result.legend)).toBe(modelResultColor(100, result.legend));
});

test('cancelled recommendations cannot be published as an ordinary neutral result', async () => {
  const controller = new AbortController();
  const fetchImpl = jest.fn(async () => { controller.abort(); throw new DOMException('Cancelled', 'AbortError'); });
  await expect(interpretResultColours(scene, { signal: controller.signal }, fetchImpl)).rejects.toMatchObject({ name: 'AbortError' });
});

test.each([{ comparison: {} }, { selection: { ...scene.selection, map_mode: 'mix' } }])('does not overwrite comparison conventions or categorical pie colours', async override => {
  const data = { ...scene, ...override }, fetchImpl = jest.fn();
  expect(await interpretResultColours(data, {}, fetchImpl)).toBe(data);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('mapped cohort bounds and constant quantities do not create a false good/bad distinction', async () => {
  const mapped = projectModelResultScene(scene, [{ id: 'Node:A', latitude: 1, longitude: 2 }]);
  const result = await interpretResultColours(mapped, {}, reply({ preference: 'decrease' }));
  expect(result.values).toEqual([scene.values[0]]);
  expect(result.legend).toMatchObject({ minimum: -2, maximum: -2 });
  expect(new Set(resultPalette(result.legend)).size).toBe(1);
});
