import {
  adaptModelResultCatalog,
  adaptModelResultScene,
  decorateModelResultRecord,
  defaultModelResultSelection,
  modelResultCatalogRequestUrl,
  modelResultColor,
  modelResultSceneRequestUrl,
} from './resultScene';

const context = { mode: 'model', projectId: 'TYNDP 2026' };

test('model result URLs are same-origin, encoded, and version bound', () => {
  expect(modelResultCatalogRequestUrl(context, 'v3.0.0')).toBe(
    '/api/atlas/projects/TYNDP%202026/results?version=v3.0.0',
  );
  expect(modelResultSceneRequestUrl(context, {
    runId: 'DISPATCH A/B', className: 'Node', propertyName: 'Price', modelVersion: 'v3.0.0', period: '2030', unit: '$/MWh',
  })).toBe(
    '/api/atlas/projects/TYNDP%202026/results/DISPATCH%20A%2FB/scene?class_name=Node&property_name=Price&carrier=electricity&version=v3.0.0&period=2030&unit=%24%2FMWh',
  );
  expect(modelResultCatalogRequestUrl({ mode: 'reference', projectId: 'x' })).toBeNull();
});

test('catalog selection prefers an available annual node price result', () => {
  const catalog = adaptModelResultCatalog({
    schema: 'nohm.atlas.result-catalog.v1', project_id: 'TYNDP 2026', model_version: 'v3.0.0',
    runs: [{ run_id: 'run', compatible: true, periods: ['2030'], quantities: [
      { id: 'Line.Flow', class_name: 'Line', property_name: 'Flow', unit: 'GWh', periods: ['2030'] },
      { id: 'Node.Price', class_name: 'Node', property_name: 'Price', unit: '$/MWh', periods: ['2030'] },
    ] }],
  }, 'TYNDP 2026', 'v3.0.0');
  expect(defaultModelResultSelection(catalog)).toEqual({
    runId: 'run', quantityId: 'Node.Price', className: 'Node', propertyName: 'Price', unit: '$/MWh', period: '2030',
  });
});

test('result scenes decorate only exact canonical IDs with value provenance', () => {
  const scene = adaptModelResultScene({
    schema: 'nohm.atlas.result-scene.v1', project_id: 'TYNDP 2026', model_version: 'v3.0.0',
    run: { run_id: 'run' }, selection: { id: 'Node.Price', property_name: 'Price', period_label: 'Annual 2030' },
    legend: { scale: 'diverging', minimum: -10, maximum: 30 },
    values: [{ entity_id: 'Node:BE00', value: 10, unit: '$/MWh', period: '2030' }],
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
    schema: 'nohm.atlas.result-catalog.v1', project_id: 'Other', model_version: 'v3.0.0', runs: [],
  }, 'TYNDP 2026', 'v3.0.0')).toThrow(/received results for Other/i);
  expect(() => adaptModelResultScene({
    schema: 'nohm.atlas.result-scene.v1', project_id: 'TYNDP 2026', model_version: 'v2.0.0', values: [],
  }, 'TYNDP 2026', 'v3.0.0')).toThrow(/not loaded model/i);
});
