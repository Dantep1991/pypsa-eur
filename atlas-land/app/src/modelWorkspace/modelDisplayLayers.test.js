import { loadModelDisplayLayers, clearDisplayLayerCache } from './modelDisplayLayers';
import { adaptModelScene, fetchModelScene } from './modelScene';

const binding = { project_id: 'P', model_version: 'v1' };
const node = { id: 'Node:BE', name: 'BE', class_name: 'Node', category: 'Electricity', country: 'BE',
  position: { lat: 50, lon: 4, source: 'Geography' } };
const source = { schema: 'nohm.atlas.model-scene.v1', project_id: 'P', version: 'v1', selected_year: 2030,
  nodes: [node], assets: [], links: [{ id: 'Line:L', from_node: node.id, to_node: node.id }],
  manifest: { declared_categories: { Node: ['Electricity'], Generator: ['Solar'], Battery: ['Batteries'], Storage: ['Hydro'] } } };
const object = (cls = 'Generator', name = 'G', category = 'Solar', nodes = [node]) => ({
  id: JSON.stringify([cls, category, name]), name, category, class_name: cls, nodes, properties: ['Max Capacity', 'Load'],
});
const inventory = (cls, objects) => ({ ...binding, schema: 'nohm.atlas.model-assets.v1', class_name: cls, objects });
const inputs = (cls, prop, objects, value = 250, unit = 'MW', status = 'resolved') => ({
  ...binding, class_name: cls, property_name: prop, resolution_contract: 'nohm.modelling.input-snapshot.v1',
  objects: objects.map(obj => ({ id: obj.id, resolution: { value, unit, status, note: 'Linked input',
    provenance: { filename: 'capacity.csv', row: 2 } } })),
});
const response = payload => ({ ok: true, status: 200, json: async () => payload });
function api(objects, { value = 250, unit = 'MW', status = 'resolved', override } = {}) {
  return jest.fn(async url => {
    const path = new URL(url, 'http://atlas');
    const cls = path.searchParams.get('class_name');
    const prop = path.searchParams.get('property_name');
    const ids = path.searchParams.has('object_ids') ? JSON.parse(path.searchParams.get('object_ids')) : null;
    const rows = objects.filter(obj => obj.class_name === cls && (!ids || ids.includes(obj.id)));
    const payload = path.pathname.endsWith('/inputs') ? inputs(cls, prop, rows,
      prop === 'Units' ? 1 : value, prop === 'Units' ? '-' : unit, prop === 'Units' ? 'resolved' : status)
      : inventory(cls, rows);
    return response(override ? override(payload, path) : payload);
  });
}
beforeEach(clearDisplayLayerCache);

test('a schema without dated inputs does not impose the unrelated map planning year on linked files', async () => {
  const scene = adaptModelScene({ ...source, requested_year: 2030, available_years: [] });
  expect(scene.meta.inputYear).toBeNull();
  const fetch = api([object()]);
  await loadModelDisplayLayers(scene, ['supply'], {}, fetch);
  expect(new URL(fetch.mock.calls[1][0], 'http://atlas').searchParams.get('input_date')).toBe('');
});

test('Supply reuses linked-file values and canonical model memberships without changing grid geometry', async () => {
  const scene = adaptModelScene(source, 'P', 'v1');
  const fetch = api([object()]);
  const loaded = await loadModelDisplayLayers(scene, ['grid', 'supply'], { apiBase: '/atlas-api' }, fetch);
  expect(loaded.connections).toBe(scene.connections);
  expect(loaded.scene.nodes).toBe(source.nodes);
  expect(loaded.facilities[1]).toMatchObject({ id: 'Generator:G', p_nom: 250, bus: 'Node:BE',
    atlas_domain: 'Supply', input_resolution: { provenance: { filename: 'capacity.csv' } } });
  expect(loaded.meta.layerEvidence.supply).toEqual({ total: 1, mapped: 1, resolved: 1, anchored: 0 });
  expect(fetch.mock.calls.every(([url]) => url.startsWith('/atlas-api/api/'))).toBe(true);
  expect(fetch.mock.calls[1][0]).toContain('input_date=2030-01-01T00%3A00%3A00');
});

test('Storage reuses indirect memberships, including hydro Store and Battery', async () => {
  const linked = { ...node, position: { ...node.position, is_display_anchor: true,
    canonical_reference: 'Node:BE', placement_note: 'Linked node' }, path: ['Storage', 'Generator', 'Node'] };
  const fetch = api([object('Storage', 'S', 'Hydro', [linked]), object('Battery', 'B', 'Batteries')], { unit: 'MWh' });
  const loaded = await loadModelDisplayLayers(adaptModelScene(source), ['grid', 'storage'], {}, fetch);
  expect(loaded.facilities.slice(1).map(row => row.component_type)).toEqual(['StorageUnit', 'Store']);
  expect(loaded.facilities[2]).toMatchObject({ id: 'Storage:S', e_nom: 250, position_lineage: { is_display_anchor: true } });
  expect(loaded.meta.layerEvidence.storage).toEqual({ total: 2, mapped: 2, resolved: 2, anchored: 1 });
});

test('Demand includes only canonical Node objects with Load, not every bus', async () => {
  const fetch = api([object('Node', 'BE', 'Electricity'), { ...object('Node', 'Unused', 'Electricity'), properties: [] }]);
  const loaded = await loadModelDisplayLayers(adaptModelScene(source), ['grid', 'demand'], {}, fetch);
  expect(loaded.facilities[1]).toMatchObject({ id: 'Node:BE:demand', component_type: 'Load', p_set: 250,
    map_scale_value: 250, source_id: 'Node:BE', atlas_domain: 'Demand' });
  expect(loaded.facilities[1].annual_energy_gwh).toBeUndefined();
  expect(loaded.meta.layerEvidence.demand.total).toBe(1);
});

test.each([null, '', ' ', 'NaN', true])('unresolved or invalid input %p remains unknown, never zero', async value => {
  const loaded = await loadModelDisplayLayers(adaptModelScene(source), ['supply'], {}, api([object()], { value }));
  expect(loaded.facilities[1].p_nom).toBeNull();
  expect(loaded.meta.layerEvidence.supply.resolved).toBe(0);
});

test('genuine zero capacity is retained; absent units are never assumed to be MW', async () => {
  const scene = adaptModelScene(source);
  const zero = await loadModelDisplayLayers(scene, ['supply'], {}, api([object()], { value: 0 }));
  expect(zero.facilities[1].p_nom).toBe(0);
  clearDisplayLayerCache(); // The second transport represents changed source inputs.
  const noUnit = await loadModelDisplayLayers(scene, ['supply'], {}, api([object()], { value: 5, unit: '' }));
  expect(noUnit.facilities[1].p_nom).toBeNull();
  expect(noUnit.facilities[1].input_resolution.capacity_per_unit.value).toBe(5);
  expect(noUnit.facilities[1].input_resolution.value).toBeNull();
});

test('other carriers and nodes outside the native model cannot become locations', async () => {
  const missing = { ...node, name: 'NotInModel' };
  const rows = [object(), object('Generator', 'GasCarrier', 'Hydrogen'), object('Generator', 'Unmapped', 'Solar', [missing])];
  const loaded = await loadModelDisplayLayers(adaptModelScene(source), ['supply'], {}, api(rows));
  expect(loaded.facilities.map(row => row.id)).toEqual(['Node:BE', 'Generator:G']);
  expect(loaded.meta.layerEvidence.supply).toMatchObject({ total: 2, mapped: 1 });
});

test('invalid coordinates are not replaced with guessed locations', async () => {
  const rows = [object('Generator', 'Bad', 'Solar', [{ ...node, position: { lat: 91, lon: 4 } }])];
  const loaded = await loadModelDisplayLayers(adaptModelScene(source), ['supply'], {}, api(rows));
  expect(loaded.facilities).toHaveLength(1);
});

test.each(['project', 'version', 'property', 'identity'])('rejects mismatched %s evidence before publishing layers', async mismatch => {
  const fetch = api([object()], { override: (payload, url) => {
    if (!url.pathname.endsWith('/inputs')) return payload;
    if (mismatch === 'project') return { ...payload, project_id: 'Other' };
    if (mismatch === 'version') return { ...payload, model_version: 'v2' };
    if (mismatch === 'property') return { ...payload, property_name: 'Wrong' };
    return { ...payload, objects: [{ ...payload.objects[0], id: 'unknown' }] };
  } });
  await expect(loadModelDisplayLayers(adaptModelScene(source), ['supply'], {}, fetch)).rejects.toThrow();
});

test('fulfilled input snapshots are reused briefly; clearing cache forces a new read', async () => {
  const fetch = api([object()]);
  await loadModelDisplayLayers(adaptModelScene(source), ['supply'], {}, fetch);
  await loadModelDisplayLayers(adaptModelScene(source), ['supply'], {}, fetch);
  expect(fetch.mock.calls.filter(([url]) => !url.includes('/inputs'))).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => url.includes('/inputs'))).toHaveLength(2);
  clearDisplayLayerCache();
  await loadModelDisplayLayers(adaptModelScene(source), ['supply'], {}, fetch);
  expect(fetch.mock.calls.filter(([url]) => url.includes('/inputs'))).toHaveLength(4);
});

test('large Supply inventories use bounded inputs and publish only a complete layer', async () => {
  const objects = Array.from({ length: 121 }, (_, id) => object('Generator', `G${id}`));
  const progress = jest.fn(), scene = adaptModelScene(source), fetch = api(objects);
  const loaded = await loadModelDisplayLayers(scene, ['supply'], { onProgress: progress }, fetch);
  expect(fetch.mock.calls.filter(([url]) => url.includes('/inputs'))).toHaveLength(6);
  expect(progress.mock.calls.filter(([step]) => step.objectsCompleted > 0).map(([step]) => step.objectsCompleted))
    .toEqual([50, 100, 121, 50, 100, 121]);
  expect(loaded.meta.layerEvidence.supply).toMatchObject({ total: 121, mapped: 121, resolved: 121 });
  expect(scene.facilities).toHaveLength(1);
});

test('a failed later batch does not mutate the existing map or fabricate a partial layer', async () => {
  const objects = Array.from({ length: 51 }, (_, id) => object('Generator', `G${id}`));
  const scene = adaptModelScene(source);
  const fetch = api(objects, { override: (payload, url) => {
    if (url.pathname.endsWith('/inputs') && JSON.parse(url.searchParams.get('object_ids')).includes(objects[50].id))
      throw new Error('Service unavailable');
    return payload;
  } });
  await expect(loadModelDisplayLayers(scene, ['supply'], {}, fetch)).rejects.toThrow('Service unavailable');
  expect(scene.facilities).toHaveLength(1);
  expect(scene.meta.layerEvidence).toBeUndefined();
});

test('aborted work never publishes or caches an incomplete inventory', async () => {
  const controller = new AbortController();
  const fetch = api([object()], { override: payload => { controller.abort(); return payload; } });
  await expect(loadModelDisplayLayers(adaptModelScene(source), ['supply'], { signal: controller.signal }, fetch))
    .rejects.toMatchObject({ name: 'AbortError' });
  const retry = api([object()]);
  await loadModelDisplayLayers(adaptModelScene(source), ['supply'], {}, retry);
  expect(retry).toHaveBeenCalledTimes(3);
});

test('missing canonical classes do not require unsupported inventory or scenario queries', async () => {
  const scene = adaptModelScene({ ...source, manifest: { declared_categories: {} }, model_scope: { model_name: 'Run' } });
  const fetch = jest.fn();
  const loaded = await loadModelDisplayLayers(scene, ['storage', 'demand'], {}, fetch);
  expect(fetch).not.toHaveBeenCalled();
  expect(loaded.meta.displayLayers).toEqual(['storage', 'demand']);
});

test.each(['resolved', 'unresolved'])('selected Model scenario input replaces base input, including %s values', async status => {
  const scene = adaptModelScene({ ...source, model_scope: { model_name: 'Run' } });
  const base = api([object()]);
  const fetch = jest.fn(async url => url.includes('scenario-preview') ? response({ ...binding,
    schema: 'nohm.atlas.scenario-preview.v1', model_name: 'Run', input_date: '2030-01-01T00:00:00',
    changes: [{ object_id: 'Generator:G', property: 'Max Capacity', after: { status, value: status === 'resolved' ? 0 : null, unit: 'MW' } }],
  }) : base(url));
  const loaded = await loadModelDisplayLayers(scene, ['supply'], {}, fetch);
  expect(loaded.facilities[1].p_nom).toBe(status === 'resolved' ? 0 : null);
});

test.each(['demand', 'supply', 'storage'])('%s uses the database reader without duplicating asset hydration in the topology request', async layer => {
  const base = api([object('Node', 'BE', 'Electricity')]);
  const fetch = jest.fn(async url => url.includes('/scene?') ? response(source)
    : url.includes('aggregation-catalog') ? { ok: false, status: 404 }
      : base(url));
  const loaded = await fetchModelScene({ mode: 'model', projectId: 'P', version: 'v1' }, { layers: ['grid', layer] }, fetch);
  expect(fetch.mock.calls[0][0]).toContain('layers=grid&version=v1');
  expect(loaded.meta.displayLayers).toEqual(['grid', layer]);
  if (layer === 'demand') expect(loaded.facilities[1].atlas_domain).toBe('Demand');
});
