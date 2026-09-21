import {
  adaptModelScene,
  fetchModelScene,
  isModelSceneDomain,
  modelSceneRequestUrl,
  resolveModelSceneDomains,
} from './modelScene';

const context = { mode: 'model', projectId: 'TYNDP 2026' };
const scene = {
  schema: 'nohm.atlas.model-scene.v1',
  project_id: 'TYNDP 2026',
  version: 'v3.0.0',
  carrier: 'electricity',
  selected_year: 2030,
  nodes: [
    { id: 'Node:BE00', source_id: 'Node:BE00', name: 'BE00', category: 'eMarket', country: 'BE', role: 'declared', position: { lat: 50.8, lon: 4 }, position_lineage: { source: 'catalog', method: 'exact' } },
    { id: 'Node:FR00', source_id: 'Node:FR00', name: 'FR00', category: 'eMarket', country: 'FR', role: 'declared', position: { lat: 46.2, lon: 2.2 }, position_lineage: { source: 'catalog', method: 'exact' } },
    { id: 'Node:XX00', source_id: 'Node:XX00', name: 'XX00', category: 'eMarket', country: null, role: 'declared', position: null },
  ],
  links: [{ id: 'Line:BE-FR', source_id: 'Line:BE-FR', name: 'BE-FR', category: 'eMarket Reference', from_node: 'Node:BE00', to_node: 'Node:FR00', capacity: { value: 4200, unit: 'MW', property: 'Max Flow', year: 2030 } }],
  assets: [{ id: 'Generator:BE solar', source_id: 'Generator:BE solar', name: 'BE solar', class_name: 'Generator', layer: 'supply', category: 'Solar PV', node_ids: ['Node:BE00'], capacity: { value: 250, unit: 'MW', property: 'Max Capacity', year: 2030 } }],
  coverage: { counts: { nodes: 3, mapped_nodes: 2, links: 1, assets: 1 }, warnings: ['1 unmapped'] },
};

test('modelSceneRequestUrl is same-origin, encoded, and layer scoped', () => {
  expect(modelSceneRequestUrl(context, { layers: ['grid', 'supply'], year: 2030 })).toBe(
    '/api/atlas/projects/TYNDP%202026/scene?carrier=electricity&layers=grid%2Csupply&year=2030',
  );
  expect(modelSceneRequestUrl({ mode: 'reference', projectId: 'x' })).toBeNull();
});

test('model scenes expose only the implemented lazy map domains', () => {
  expect(isModelSceneDomain('Grid')).toBe(true);
  expect(isModelSceneDomain('Supply')).toBe(true);
  expect(isModelSceneDomain('Storage')).toBe(true);
  expect(isModelSceneDomain('Demand')).toBe(false);
});

test('bound model layer selection keeps grid data available while changing visible domains', () => {
  expect(resolveModelSceneDomains(
    { Grid: true, Supply: false, Storage: false },
    ['Supply'],
    'replace',
  )).toEqual({
    enabledDomains: ['Supply'],
    layers: ['grid', 'supply'],
    visibility: { Grid: false, Supply: true, Storage: false },
  });
  expect(resolveModelSceneDomains(
    { Grid: false, Supply: true, Storage: false },
    ['Storage'],
    'add',
  )).toEqual({
    enabledDomains: ['Supply', 'Storage'],
    layers: ['grid', 'supply', 'storage'],
    visibility: { Grid: false, Supply: true, Storage: true },
  });
  expect(() => resolveModelSceneDomains({}, ['Demand'], 'replace')).toThrow(
    'Demand is not available in the current canonical model scene.',
  );
});

test('adaptModelScene retains canonical IDs and excludes only unmapped markers', () => {
  const result = adaptModelScene(scene, 'TYNDP 2026');

  expect(result.facilities.map((item) => item.id)).toEqual([
    'Node:BE00', 'Node:FR00', 'Generator:BE solar',
  ]);
  expect(result.connections[0]).toMatchObject({
    id: 'Line:BE-FR', from: 'Node:BE00', to: 'Node:FR00', p_nom: 4200, capacity_units: 'MW',
  });
  expect(result.meta).toMatchObject({
    projectId: 'TYNDP 2026', version: 'v3.0.0', nodeCount: 3, mappedNodeCount: 2, linkCount: 1, assetCount: 1,
  });
});

test('adaptModelScene rejects stale or unsupported responses', () => {
  expect(() => adaptModelScene(scene, 'Another project')).toThrow(/another project/i);
  expect(() => adaptModelScene({ ...scene, schema: 'other' }, 'TYNDP 2026')).toThrow(/unsupported/i);
});

test('fetchModelScene reports backend errors without JSON parse noise', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: false,
    status: 422,
    json: async () => ({ detail: 'carrier metadata is missing' }),
  }));
  await expect(fetchModelScene(context, {}, fetchImpl)).rejects.toThrow(/carrier metadata is missing/i);
});

test('fetchModelScene uses the configured Atlas API boundary', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => scene }));
  await fetchModelScene(context, { apiBase: '/atlas-api' }, fetchImpl);
  expect(fetchImpl).toHaveBeenCalledWith(
    '/atlas-api/api/atlas/projects/TYNDP%202026/scene?carrier=electricity&layers=grid',
    expect.objectContaining({ credentials: 'same-origin' }),
  );
});
