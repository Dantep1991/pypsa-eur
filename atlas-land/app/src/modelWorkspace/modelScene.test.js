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
  manifest: {
    declared_categories: { Node: ['eMarket'], Line: ['eMarket Reference'], Generator: ['Solar PV'] },
    declared_category_counts: { Node: { eMarket: 3 }, Line: { 'eMarket Reference': 1 }, Generator: { 'Solar PV': 1 } },
    declared_category_objects: { Node: { eMarket: ['BE00', 'FR00', 'XX00'] }, Line: { 'eMarket Reference': ['BE-FR'] }, Generator: { 'Solar PV': ['BE solar'] } },
  },
  nodes: [
    { id: 'Node:BE00', source_id: 'Node:BE00', name: 'BE00', category: 'eMarket', country: 'BE', role: 'declared', position: { lat: 50.8, lon: 4 }, position_lineage: { source: 'catalog', method: 'exact' } },
    { id: 'Node:FR00', source_id: 'Node:FR00', name: 'FR00', category: 'eMarket', country: 'FR', role: 'declared', position: { lat: 46.2, lon: 2.2 }, position_lineage: { source: 'catalog', method: 'exact' } },
    { id: 'Node:XX00', source_id: 'Node:XX00', name: 'XX00', category: 'eMarket', country: null, role: 'declared', position: null },
  ],
  links: [{ id: 'Line:BE-FR', source_id: 'Line:BE-FR', name: 'BE-FR', category: 'eMarket Reference', from_node: 'Node:BE00', to_node: 'Node:FR00', capacity: { value: 4200, unit: 'MW', property: 'Max Flow', year: 2030 } }],
  assets: [{ id: 'Generator:BE solar', source_id: 'Generator:BE solar', name: 'BE solar', class_name: 'Generator', layer: 'supply', category: 'Solar PV', node_ids: ['Node:BE00'], capacity: { value: 250, unit: 'MW', property: 'Max Capacity', year: 2030 } }],
  coverage: { counts: { nodes: 3, mapped_nodes: 2, links: 1, assets: 1 }, warnings: ['1 unmapped'] },
};

test('historical run alias requires an explicit project registry binding, never a latest fallback', () => {
  const alias = { ...scene, version: 'V1.0.0', version_binding: {
    requested_version: 'v1', schema_version: 'V1.0.0', source: 'project_meta/run_history.json',
  } };
  expect(adaptModelScene(alias, scene.project_id, 'v1').meta.version).toBe('V1.0.0');
  expect(() => adaptModelScene({ ...alias, version_binding: undefined }, scene.project_id, 'v1')).toThrow(/version/);
  expect(() => adaptModelScene({ ...alias, version: 'v1.0.1_skeletonize' }, scene.project_id, 'v1')).toThrow(/version/);
});

test('modelSceneRequestUrl is same-origin, encoded, and layer scoped', () => {
  expect(modelSceneRequestUrl(context, { layers: ['grid', 'supply'], year: 2030 })).toBe(
    '/api/atlas/projects/TYNDP%202026/scene?carrier=electricity&layers=grid%2Csupply&year=2030',
  );
  expect(modelSceneRequestUrl({ mode: 'reference', projectId: 'x' })).toBeNull();
});

test('model scene requests retain the exact selected version rather than silently loading latest', () => {
  expect(modelSceneRequestUrl({ ...context, version: ' v3.0.0 ' })).toBe(
    '/api/atlas/projects/TYNDP%202026/scene?carrier=electricity&layers=grid&version=v3.0.0',
  );
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
    category: 'eMarket Reference', membership: { parentClass: 'Line', parentCategory: 'eMarket Reference' },
  });
  expect(result.meta).toMatchObject({
    projectId: 'TYNDP 2026', version: 'v3.0.0', nodeCount: 3, mappedNodeCount: 2, linkCount: 1, assetCount: 1,
    declaredCategories: { Node: ['eMarket'], Line: ['eMarket Reference'], Generator: ['Solar PV'] },
  });
});

test('adaptModelScene rejects stale or unsupported responses', () => {
  expect(() => adaptModelScene(scene, 'Another project')).toThrow(/another project/i);
  expect(() => adaptModelScene({ ...scene, schema: 'other' }, 'TYNDP 2026')).toThrow(/unsupported/i);
});

test('model scenes reject version substitution, while an explicit latest selection resolves normally', () => {
  expect(() => adaptModelScene(scene, context.projectId, 'v2.0.0')).toThrow(/requested model version v2.0.0/);
  expect(adaptModelScene(scene, context.projectId, 'v3.0.0').meta.version).toBe('v3.0.0');
  expect(adaptModelScene(scene, context.projectId, 'latest').meta.version).toBe('v3.0.0');
});

test('fetchModelScene sends and enforces the version binding', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => scene }));
  await expect(fetchModelScene({ ...context, version: 'v2.0.0' }, {}, fetchImpl)).rejects.toThrow(/requested model version v2.0.0/);
  expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('version=v2.0.0'), expect.any(Object));
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
  const fetchImpl = jest.fn(async url => ({ ok: true, status: 200, json: async () => url.includes('aggregation-catalog') ? {
    schema: 'nohm.atlas.aggregation-catalog.v1', project_id: scene.project_id, model_version: scene.version,
    node_mapping: {}, regional_registry: { schemes: [] },
  } : scene }));
  await fetchModelScene(context, { apiBase: '/atlas-api' }, fetchImpl);
  expect(fetchImpl).toHaveBeenCalledWith(
    '/atlas-api/api/atlas/projects/TYNDP%202026/scene?carrier=electricity&layers=grid',
    expect.objectContaining({ credentials: 'same-origin' }),
  );
});

test('a missing Geography crosswalk leaves the native model available without aggregation', async () => {
  const fetchImpl = jest.fn(async url => ({ ok: !url.includes('aggregation-catalog'), status: url.includes('aggregation-catalog') ? 404 : 200, json: async () => scene }));
  const native = await fetchModelScene(context, {}, fetchImpl);
  expect(native.facilities).toHaveLength(3);
  expect(native.meta.aggregationCatalog).toBeUndefined();
  expect(native.meta.warnings.join(' ')).toMatch(/Native topology retained/);
});
