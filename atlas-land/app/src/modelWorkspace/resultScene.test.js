import {
  adaptModelResultCatalog,
  adaptModelResultScene,
  adaptVisualisationCatalog,
  adaptVisualisationQuery,
  decorateModelResultRecord,
  defaultModelResultSelection,
  modelResultCatalogRequestUrl,
  modelResultColor,
  modelResultSceneRequestUrl,
} from './resultScene';

const context = { mode: 'model', projectId: 'TYNDP 2026' };

test('model result URLs use the existing same-origin Visualisation API', () => {
  expect(modelResultCatalogRequestUrl(context)).toBe('/api/solutions/TYNDP%202026/runs');
  expect(modelResultSceneRequestUrl(context)).toBe('/api/solutions/TYNDP%202026/query');
  expect(modelResultCatalogRequestUrl({ mode: 'reference', projectId: 'x' })).toBeNull();
});

test('hydrates Visualisation metrics with their real categories and prefers node price', () => {
  const catalog = adaptVisualisationCatalog({ runs: [{ run_id: 'run', display_name: 'Run 1', target_year: '2030' }] }, {
    project_id: 'TYNDP 2026',
    metrics: [
      { report_family: 'ST', class_name: 'Line', property_name: 'Flow', unit_name: 'GWh', dimension_set: 0, supports_flow_map: true },
      { report_family: 'ST', class_name: 'Node', property_name: 'Price', unit_name: 'EUR/MWh', dimension_set: 1 },
    ],
    metric_dimension_sets: [
      { categories: ['eMarket Reference'], nodes: ['BE00', 'FR00'] },
      { categories: ['eMarket', 'Offshore'], nodes: ['BE00', 'FR00'] },
    ],
  }, 'TYNDP 2026', 'v3.0.0');

  expect(catalog.runs[0].quantities[1].categories).toEqual(['eMarket', 'Offshore']);
  expect(defaultModelResultSelection(catalog)).toEqual({
    runId: 'run', runLabel: 'Run 1', category: '', quantityId: 'Node.Price', reportFamily: 'ST',
    className: 'Node', propertyName: 'Price', unit: 'EUR/MWh', period: '2030', scopeId: '', supportsFlowMap: false,
  });
});

test('Visualisation query rows project onto exact canonical Atlas IDs', () => {
  const scene = adaptVisualisationQuery({
    summary: { row_count_before_limit: 2 },
    rows: [
      { group_value: '', value: 999, unit_name: 'EUR/MWh' },
      { group_value: 'BE00', node: 'BE00', country: 'BE', value: 10, unit_name: 'EUR/MWh', run_label: 'Run 1' },
    ],
  }, context, {
    runId: 'run', modelVersion: 'v3.0.0', reportFamily: 'ST', className: 'Node', propertyName: 'Price',
    category: '', unit: 'EUR/MWh', period: '2030', supportsFlowMap: false,
  });
  expect(scene.values).toEqual([expect.objectContaining({ entity_id: 'Node:BE00', value: 10 })]);
  expect(scene.selection.map_target).toBe('node');
  expect(scene.source).toBe('emil_visualisation_domain');
});

test('result scenes decorate only exact canonical IDs with value provenance', () => {
  const scene = adaptModelResultScene({
    schema: 'nohm.atlas.result-scene.v2', project_id: 'TYNDP 2026', model_version: 'v3.0.0',
    run: { run_id: 'run' }, selection: { id: 'Node.Price', property_name: 'Price', period_label: 'Annual 2030' },
    legend: { scale: 'diverging', minimum: -10, maximum: 30 },
    values: [{ entity_id: 'Node:BE00', value: 10, unit: 'EUR/MWh', period: '2030' }],
  }, 'TYNDP 2026', 'v3.0.0');
  const base = { id: 'Node:BE00', properties: [{ Property: 'Country', Value: 'BE', Units: '' }] };
  const decorated = decorateModelResultRecord(base, scene);
  expect(decorated.atlas_result_value).toBe(10);
  expect(decorated.map_scale_ratio).toBe(0.5);
  expect(decorated.properties.at(-1).Value).toBe('run');
  expect(decorateModelResultRecord({ id: 'Node:FR00' }, scene)).toEqual({ id: 'Node:FR00' });
  expect(modelResultColor(-10, scene.legend)).not.toBe(modelResultColor(30, scene.legend));
});

test('catalog and scenes reject stale project or model bindings', () => {
  expect(() => adaptModelResultCatalog({
    schema: 'nohm.atlas.result-catalog.v2', project_id: 'Other', model_version: 'v3.0.0', runs: [],
  }, 'TYNDP 2026', 'v3.0.0')).toThrow(/received results for Other/i);
  expect(() => adaptModelResultScene({
    schema: 'nohm.atlas.result-scene.v2', project_id: 'TYNDP 2026', model_version: 'v2.0.0', values: [],
  }, 'TYNDP 2026', 'v3.0.0')).toThrow(/not loaded model/i);
});
