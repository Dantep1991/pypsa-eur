import {
  adaptModelResultCatalog,
  adaptModelResultScene,
  adaptVisualisationCatalog,
  adaptVisualisationQuery,
  decorateModelResultRecord,
  defaultModelResultSelection,
  fetchModelResultScene,
  fetchModelResultCatalog,
  modelResultConnections,
  modelResultCatalogRequestUrl,
  modelResultColor,
  modelResultSceneRequestUrl,
  projectModelResultScene,
} from './resultScene';

test('result loading keeps canonical map coordinates and metadata, not schema placeholders', () => {
  const canonical = { id: 'Node:BE00', latitude: 50.85, longitude: 4.35, country: 'BE', carrier: 'electricity', data_source: 'Canonical geography' };
  const scene = { selection: { map_target: 'node' }, values: [{ entity_id: 'Node:BE00', value: 50 }],
    spatial_nodes: [{ id: 'Node:BE00', latitude: 0, longitude: 0, carrier: 'result', is_reference_topology: true }] };
  const result = projectModelResultScene(scene, [canonical]);
  expect(result.spatial_nodes[0]).toMatchObject(canonical);
  expect(result.values[0].value).toBe(50);
  expect(scene.spatial_nodes[0].latitude).toBe(0);
});

test('unreported values are excluded, never converted into modelled zero', () => {
  const scene = adaptVisualisationQuery({ rows: [
    { group_value: 'A', value: null }, { group_value: 'B', value: '' },
    { group_value: 'C', value: false }, { group_value: 'D', value: 0 },
  ] }, {}, { className: 'Node', propertyName: 'Load' });
  expect(scene.values.map(row => [row.entity_id, row.value])).toEqual([['Node:D', 0]]);
});

test('connection result layers show only reported records and preserve source capacity metadata', () => {
  const scene = adaptModelResultScene({ schema: 'nohm.atlas.result-scene.v2', selection: { map_target: 'link' }, legend: {},
    values: [{ entity_id: 'Line:Hydrogen', value: 20 }], spatial_links: [{ id: 'Line:Hydrogen', from: 'Node:H1', to: 'Node:H2' }] });
  const displayed = modelResultConnections([{ id: 'Line:Electric' }, { id: 'Line:Hydrogen', properties: [{ Property: 'Capacity', Value: 5 }] }], scene);
  expect(displayed.map(row => row.id)).toEqual(['Line:Hydrogen']);
  expect(displayed[0].properties).toContainEqual({ Property: 'Capacity', Value: 5 });
});

test('catalogue adds explicitly derived annual net flow only with both same-unit source quantities', () => {
  const metrics = ['Flow', 'Flow Back'].map(property_name => ({ class_name: 'Line', property_name,
    report_family: 'ST', unit_name: 'GWh', available_granularities: ['year'], supports_flow_map: true }));
  const catalog = adaptVisualisationCatalog({ runs: [{ run_id: 'a', schema_version_id: 'v1', target_year: '2050' }] },
    { run_id: 'a', project_id: 'Example', metrics }, 'Example', 'v1');
  expect(catalog.runs[0].quantities.find(q => q.id === 'Line.Annual Net Flow')).toMatchObject({
    derived_net_flow: true, periods: ['2050'], property_name: 'Net Flow', unit: 'GWh' });
});

test('annual net flow derives actual reverse direction and keeps missing reverse data as an error', async () => {
  const topology = { project_id: 'Example', model_version: 'v1', class_name: 'Line', nodes: [],
    lines: [{ id: 'Line:L', name: 'L', node_class: 'Node', from_node: 'A', to_node: 'B', coordinates: [[0, 0], [1, 1]] }] };
  let omitBack = false;
  const fetchImpl = jest.fn(async (url, options) => ({ ok: true, status: 200, json: async () => {
    if (url.includes('flow-topology')) return topology;
    const reverse = JSON.parse(options.body).property_name === 'Flow Back';
    return { rows: reverse && omitBack ? [] : [{ group_value: 'L', value: reverse ? 30 : 20,
      unit: 'GWh', from_node: 'A', to_node: 'B' }] };
  } }));
  const selection = { runId: 'a', modelVersion: 'v1', runModelVersion: 'v1', className: 'Line',
    propertyName: 'Net Flow', derivedNetFlow: true, supportsFlowMap: true, period: '2050', unit: 'GWh', mapMode: 'flow' };
  const scene = await fetchModelResultScene({ mode: 'model', projectId: 'Example' }, selection, {}, fetchImpl);
  expect(scene.values[0]).toMatchObject({ value: -10, actual_from_node: 'B', actual_to_node: 'A' });
  expect(scene.derivation).toBe('Reported Flow − Flow Back');
  expect(scene.legend.minimum).toBe(-10);
  omitBack = true;
  await expect(fetchModelResultScene({ mode: 'model', projectId: 'Example' }, selection, {}, fetchImpl)).rejects.toThrow(/Missing data is not zero/);
});

const context = { mode: 'model', projectId: 'TYNDP 2026' };

test('node scope selects exact linked schema objects without filtering their results by the parent name again', async () => {
  const point = { lat: 50, lon: 4, canonical_reference: 'Node:Parent', method: 'declared_terminal_display_anchor',
    placement_note: 'Displayed at its directly linked node; this object has no registered coordinates.' };
  let body;
  const fetchImpl = jest.fn(async (url, options) => ({ ok: true, status: 200, json: async () => {
    if (url.includes('/assets?')) return { project_id: 'Example', model_version: 'v1', source: 'schema/v1', objects: [
      { name: 'Child', category: 'Native', class_name: 'Node', nodes: [{ name: 'Child', position: point }] },
      { name: 'Parent', category: 'Grid', class_name: 'Node', nodes: [{ name: 'Parent', position: { lat: 50, lon: 4 } }] },
    ] };
    body = JSON.parse(options.body);
    return { rows: [{ group_value: 'Child', value: 42, unit: 'EUR/MWh' }] };
  } }));
  const scene = await fetchModelResultScene({ mode: 'model', projectId: 'Example' }, {
    runId: 'run', modelVersion: 'v1', runModelVersion: 'v1', className: 'Node', propertyName: 'Price',
    period: '2030', category: 'Native', scopeId: 'Node:Parent', unit: 'EUR/MWh', mapMode: 'bubbles',
  }, {}, fetchImpl);
  expect(body.nodes).toEqual([]);
  expect(body.entity_names).toEqual(['Child']);
  expect(scene.spatial_nodes[0].placement_note).toBe(point.placement_note);
  expect(scene.spatial_nodes[0].canonical_reference).toBe('Node:Parent');
  expect(projectModelResultScene(scene, []).values[0].value).toBe(42);
});

test('model result URLs use the existing same-origin Visualisation API', () => {
  expect(modelResultCatalogRequestUrl(context)).toBe('/api/solutions/TYNDP%202026/runs?discovery=registered');
  expect(modelResultSceneRequestUrl(context)).toBe('/api/solutions/TYNDP%202026/query');
  expect(modelResultCatalogRequestUrl({ mode: 'reference', projectId: 'x' })).toBeNull();
});

test('multi-category map queries use their exact schema object union and preserve labels', async () => {
  let body;
  const fetchImpl = jest.fn(async (url, options) => ({ ok: true, status: 200, json: async () => {
    if (url.includes('/assets?')) return { project_id: 'Example', model_version: 'v1', source: 'schema/v1', objects:
      ['Electricity', 'Hydrogen Market', 'Other'].map((category, index) => ({ name: `N${index}`, category,
        class_name: 'Node', nodes: [{ name: `N${index}`, position: { lat: 50 + index, lon: 4 } }] })) };
    body = JSON.parse(options.body);
    return { rows: body.entity_names.map(name => ({ group_value: name, value: 42, unit: '$/MWh' })) };
  } }));
  const scene = await fetchModelResultScene({ mode: 'model', projectId: 'Example' }, {
    runId: 'run', modelVersion: 'v1', runModelVersion: 'v1', className: 'Node', propertyName: 'Price',
    categories: ['Electricity', 'Hydrogen Market'], category: '', period: '2050', unit: '$/MWh', mapMode: 'bubbles',
  }, {}, fetchImpl);
  expect(body.entity_names).toEqual(['N0', 'N1']);
  expect(body.categories).toEqual([]);
  expect(scene.selection.categories).toEqual(['Electricity', 'Hydrogen Market']);
  expect(scene.values).toHaveLength(2);
});

test('period selectors use actual reported dates rather than the scenario target year', () => {
  const catalog = adaptVisualisationCatalog({ runs: [{ run_id: 'a', registry_versions: ['v1'], target_year: '2040' }] },
    { project_id: 'Example', run_id: 'a', run: { reported_periods: ['2037', '2038'] }, metrics: [
      { class_name: 'Node', property_name: 'Price', unit_name: 'EUR/MWh', reported_periods: ['2037'] },
      { class_name: 'Node', property_name: 'Load', unit_name: 'GWh', reported_periods: ['2038'] },
    ] }, 'Example', 'v1');
  expect(catalog.runs[0].periods).toEqual(['2037', '2038']);
  expect(catalog.runs[0].quantities[0].periods).toEqual(['2037']);
  expect(catalog.runs[0].quantities[1].periods).toEqual(['2038']);
  expect(defaultModelResultSelection(catalog).period).toBe('2037');
  expect(catalog.runs[0].result_model_version).toBe('v1');
});

test('hydrates Visualisation metrics with canonical model_schema categories and prefers node price', () => {
  const catalog = adaptVisualisationCatalog({ runs: [{ run_id: 'run', display_name: 'Run 1', target_year: '2030', registry_versions: ['v3.0.0'] }] }, {
    project_id: 'TYNDP 2026',
    metrics: [
      { report_family: 'ST', class_name: 'Line', property_name: 'Flow', unit_name: 'GWh', dimension_set: 0, supports_flow_map: true },
      { report_family: 'ST', class_name: 'Node', property_name: 'Price', unit_name: 'EUR/MWh', dimension_set: 1 },
      { report_family: 'ST', class_name: 'Charging Station', property_name: 'Load', unit_name: 'GWh', dimension_set: 2 },
    ],
    metric_dimension_sets: [
      { categories: ['eMarket Reference'], nodes: ['BE00', 'FR00'] },
      { categories: ['eMarket', 'Offshore'], nodes: ['BE00', 'FR00'] },
      { categories: ['Passenger EV'], nodes: ['BE00'] },
    ],
  }, 'TYNDP 2026', 'v3.0.0', {
    categories: { Node: ['DRES', 'eMarket'], Line: ['eMarket Reference'] },
    categoryObjects: {
      Node: { DRES: ['BE00 dres'], eMarket: ['BE00', 'FR00'] },
      Line: { 'eMarket Reference': ['BE00-FR00'] },
    },
  });

  expect(catalog.runs[0].quantities[1].categories).toEqual(['DRES', 'eMarket']);
  expect(catalog.runs[0].quantities[1].category_objects.eMarket).toEqual(['BE00', 'FR00']);
  expect(catalog.runs[0].quantities[1].solution_categories).toEqual(['eMarket', 'Offshore']);
  expect(catalog.runs[0].quantities.map(quantity => quantity.class_name)).toEqual(['Line', 'Node', 'Charging Station']);
  expect(defaultModelResultSelection(catalog)).toEqual({
    runId: 'run', runLabel: 'Run 1', runModelVersion: 'v3.0.0', category: '', categories: [], categoryObjects: [], quantityId: 'Node.Price', reportFamily: 'ST',
    className: 'Node', propertyName: 'Price', unit: 'EUR/MWh', period: '2030', scopeId: '', supportsFlowMap: false, mapMode: 'bubbles',
  });
});

test('schema category selections query their exact model objects, not solution-file category labels', async () => {
  const fetchImpl = jest.fn(async (_url, options) => ({
    ok: true,
    status: 200,
    json: async () => ({ rows: [], summary: { row_count_before_limit: 0 } }),
    requestBody: options?.body,
  }));
  await fetchModelResultScene(context, {
    runId: 'run', modelVersion: 'v3.0.0', runModelVersion: 'v3.0.0', reportFamily: 'ST', className: 'Generator',
    propertyName: 'Generation', category: 'Gas', categoryObjects: ['BE00 gas', 'FR00 gas'],
    unit: 'GWh', period: '2030', supportsFlowMap: false, mapMode: 'mix',
  }, {}, fetchImpl);
  const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
  expect(body.categories).toEqual([]);
  expect(body.entity_names).toEqual(['BE00 gas', 'FR00 gas']);
  expect(body.group_by).toBe('object');
  expect(body.aggregation_method).toBe('auto');
  expect(body.quantity_aware_aggregation).toBe(true);
  expect(body.date_from).toBe('2030-01-01');
});

test('catalogues never reuse one simulation metrics for a different run or version', () => {
  const runs = { runs: [{ run_id: 'a', schema_version_id: 'v1' }, { run_id: 'b', schema_version_id: 'v2' }] };
  const catalog = adaptVisualisationCatalog(runs, {
    run_id: 'a', project_id: context.projectId,
    metrics: [{ class_name: 'Node', property_name: 'Load', unit_name: 'GWh' }],
  }, context.projectId, 'v1');
  expect(catalog.runs[0].compatible).toBe(true);
  expect(catalog.runs[1].compatible).toBe(false);
  expect(catalog.runs[1].quantities).toEqual([]);
});

test('shared major-version numbers do not establish result compatibility', () => {
  const catalog = adaptVisualisationCatalog({ runs: [{ run_id: 'a', model_version_id: 'v1' }] }, {
    run_id: 'a', metrics: [{ class_name: 'Node', property_name: 'Price' }],
  }, context.projectId, 'v1.0.1_skeletonize');
  expect(catalog.runs[0].compatible).toBe(false);
  expect(defaultModelResultSelection(catalog)).toBeNull();
});

test('fetches each run own catalogue with bounded parallelism and actual progress', async () => {
  const progress = jest.fn();
  const partial = jest.fn();
  const fetchImpl = jest.fn(async url => ({ ok: true, status: 200, json: async () => {
    if (url.includes('discovery=registered')) return { runs: [
      { run_id: 'a', schema_version_id: 'v1' }, { run_id: 'b', schema_version_id: 'v1' },
    ] };
    const id = url.includes('/a/') ? 'a' : 'b';
    return { project_id: context.projectId, run_id: id,
      metrics: [{ class_name: 'Node', property_name: id === 'a' ? 'Price' : 'Load' }] };
  } }));
  const catalog = await fetchModelResultCatalog(context, 'v1', { onProgress: progress, onPartialCatalog: partial }, fetchImpl);
  expect(catalog.runs[0].quantities[0].id).toBe('Node.Price');
  expect(catalog.runs[1].quantities[0].id).toBe('Node.Load');
  expect(progress).toHaveBeenLastCalledWith({ phase: 'catalog', completed: 2, total: 2 });
  const first = partial.mock.calls[0][0];
  expect(first.runs).toHaveLength(1);
  expect(first.pending_runs).toHaveLength(1);
  expect(first.pending_runs[0]).not.toHaveProperty('quantities');
  expect(partial.mock.calls[1][0].runs).toHaveLength(2);
});

test('unbound results cannot make a map query', async () => {
  const fetchImpl = jest.fn();
  await expect(fetchModelResultScene(context, {
    runId: 'a', className: 'Node', propertyName: 'Price', modelVersion: 'v2', runModelVersion: 'v1',
  }, {}, fetchImpl)).rejects.toThrow(/bound to the loaded model version/i);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('query rejects mixed units and duplicate map periods', () => {
  const selection = { className: 'Node', propertyName: 'Load', modelVersion: 'v1', unit: 'GWh' };
  expect(() => adaptVisualisationQuery({ rows: [
    { node: 'BE00', value: 1, unit_name: 'GWh' }, { node: 'FR00', value: 2, unit_name: 'MW' },
  ] }, context, selection)).toThrow(/physical units/);
  expect(() => adaptVisualisationQuery({ rows: [
    { node: 'BE00', value: 1 }, { node: 'BE00', value: 2 },
  ] }, context, selection)).toThrow(/multiple periods/);
});

test('negative flow keeps actual direction and line node scope', async () => {
  const fetchImpl = jest.fn(async url => ({ ok: true, status: 200, json: async () => url.includes('flow-topology')
    ? { project_id: context.projectId, model_version: 'v1', class_name: 'Line', lines: [], nodes: [] } : ({ rows: [
    { entity_name: 'BE-FR', value: -20, from_node: 'BE00', to_node: 'FR00', actual_from_node: 'FR00', actual_to_node: 'BE00' },
  ] }) }));
  const scene = await fetchModelResultScene(context, {
    runId: 'a', modelVersion: 'v1', runModelVersion: 'v1', className: 'Line', propertyName: 'Flow', scopeId: 'Node:BE00',
  }, {}, fetchImpl);
  expect(JSON.parse(fetchImpl.mock.calls.find(call => call[1].method === 'POST')[1].body).nodes).toEqual(['BE00']);
  expect(scene.values[0]).toMatchObject({ entity_id: 'Line:BE-FR', actual_from_node: 'FR00', actual_to_node: 'BE00' });
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
