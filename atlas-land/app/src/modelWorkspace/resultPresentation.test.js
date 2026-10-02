import { directionalResultLines, generationEnergyValues, normalizeResultMarkerScale, resultBubbleRadius, resultCircleRadius, resultPieDiameter, resultMagnitudeRatio, resultMapModes } from './resultPresentation';
import { adaptVisualisationQuery, decorateModelResultRecord, fetchModelResultScene, projectModelResultScene } from './resultScene';

test('magnitude is absolute and zero stays zero; bubble area scales with value', () => {
  expect(resultMagnitudeRatio(-100, 100)).toBe(1);
  expect(resultMagnitudeRatio(100, 100)).toBe(1);
  expect(resultMagnitudeRatio(0, 0)).toBe(0);
  expect(resultBubbleRadius(0.25)).toBe(resultBubbleRadius(1) / 2);
  expect(resultBubbleRadius(0)).toBe(5);
});

test('default result markers have a legible minimum and size scaling preserves relative magnitude', () => {
  expect(resultBubbleRadius(0.000001)).toBe(6);
  expect(resultBubbleRadius(1)).toBe(36);
  expect(resultCircleRadius('colour', 0)).toBe(7);
  expect(resultCircleRadius('colour', 1, 2)).toBe(14);
  expect(resultBubbleRadius(0.25, 2)).toBe(36);
  expect(resultPieDiameter(0.001)).toBe(16);
  expect(resultPieDiameter(1, 2)).toBe(144);
});

test('invalid sizes and magnitude ratios are bounded and never create infinite circles', () => {
  expect(normalizeResultMarkerScale(undefined)).toBe(1);
  expect(normalizeResultMarkerScale(NaN)).toBe(1);
  expect(normalizeResultMarkerScale(-1)).toBe(0.5);
  expect(normalizeResultMarkerScale(100)).toBe(2);
  [NaN, Infinity, -1, undefined].forEach(value => expect(resultBubbleRadius(value)).toBe(5));
  expect(resultBubbleRadius(10, 100)).toBe(72);
});

const pieRows = [
  { entity_name: 'g1', node: 'N1', category: 'Category A', value: 25, unit_name: 'GWh' },
  { entity_name: 'g2', node: 'N1', category: 'Category B', value: 75, unit_name: 'GWh' },
  { entity_name: 'g3', node: '', category: 'Category B', value: 900, unit_name: 'GWh' },
];

test('energy pies use explicit memberships and categories, not installed MW or guessed nodes', () => {
  expect(generationEnergyValues(pieRows)).toEqual([expect.objectContaining({
    entity_id: 'Node:N1', value: 100, unit: 'GWh',
    segments: [expect.objectContaining({ label: 'Category B', value: 75, share: 0.75 }),
      expect.objectContaining({ label: 'Category A', value: 25, share: 0.25 })],
  })]);
});

test('pie composition refuses negative energy, duplicate periods and mixed units', () => {
  expect(() => generationEnergyValues([...pieRows, pieRows[0]])).toThrow(/duplicate/);
  expect(() => generationEnergyValues([{ ...pieRows[0], value: -1 }])).toThrow(/non-negative/);
  expect(() => generationEnergyValues([pieRows[0], { ...pieRows[1], unit_name: 'MW' }])).toThrow(/physical units/);
});

test('only additive generation energy offers energy pies; unsupported flow metrics remain static', () => {
  expect(resultMapModes({ class_name: 'Generator', property_name: 'Generation', unit: 'GWh' })[0].id).toBe('mix');
  expect(resultMapModes({ class_name: 'Generator', property_name: 'Capacity', unit: 'MW' }).map(x => x.id)).not.toContain('mix');
  expect(resultMapModes({ class_name: 'Line', supports_flow_map: false }).map(x => x.id)).toEqual(['colour']);
  expect(resultMapModes({ class_name: 'Line', property_name: 'Flow Back', supports_flow_map: true }).map(x => x.id)).toEqual(['colour']);
});

test('negative physical flow is reversed exactly once and zero flow has no travelling beam', () => {
  const scene = adaptVisualisationQuery({ rows: [{ entity_name: 'L1', value: -10,
    from_node: 'A', to_node: 'B', actual_from_node: 'B', actual_to_node: 'A' }] },
  { projectId: 'study' }, { className: 'Line', propertyName: 'Flow', supportsFlowMap: true, mapMode: 'flow' });
  const line = decorateModelResultRecord({ id: 'Line:L1', from: 'Node:A', to: 'Node:B' }, scene);
  const collection = { features: [{ geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] }, properties: { connection: line } }] };
  expect(directionalResultLines(collection)[0]).toMatchObject({ coordinates: [[3, 4], [1, 2]], magnitude: 10 });
  expect(line.map_scale_ratio).toBe(1);
  line.atlas_result_value = 0;
  line.atlas_result_direction_value = 0;
  expect(directionalResultLines(collection)).toEqual([]);
});

test('energy mix query uses existing Visualisation object grouping and retains source unit', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ rows: pieRows }) }));
  const scene = await fetchModelResultScene({ mode: 'model', projectId: 'study' }, {
    runId: 'run', modelVersion: 'v1', runModelVersion: 'v1', className: 'Generator',
    propertyName: 'Generation', unit: 'GWh', mapMode: 'mix', period: '2050',
  }, {}, fetchImpl);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).group_by).toBe('object');
  expect(scene.values[0].value).toBe(100);
  expect(scene.values[0].segments[0].share).toBe(0.75);
  expect(scene.legend.unit).toBe('GWh');
  expect(scene.coverage.unresolved_membership_count).toBe(1);
});

test('truncated or foreign-run results cannot silently become map evidence', () => {
  const selection = { className: 'Node', propertyName: 'Load', runId: 'run' };
  expect(() => adaptVisualisationQuery({ rows: [{ node: 'A', value: 1 }], summary: { row_count_before_limit: 2 } }, {}, selection)).toThrow(/truncated/);
  expect(() => adaptVisualisationQuery({ rows: [{ run_id: 'other', node: 'A', value: 1 }] }, {}, selection)).toThrow(/different simulation/);
});

test('visible result scale excludes unmapped nodes; links require both mapped endpoints', () => {
  const facilities = [{ id: 'Node:A', latitude: 1, longitude: 2 }, { id: 'Node:B', latitude: null, longitude: null }];
  const scene = { selection: { map_target: 'node' }, legend: {}, values: [
    { entity_id: 'Node:A', value: 2 }, { entity_id: 'Node:B', value: 1000000 },
  ] };
  const projected = projectModelResultScene(scene, facilities);
  expect(projected.legend.maximum_magnitude).toBe(2);
  expect(projected.coverage).toMatchObject({ mapped_row_count: 1, excluded_row_count: 1 });
  expect(projectModelResultScene({ ...scene, selection: { map_target: 'link' }, values: [{ entity_id: 'Line:AB', value: 5 }] },
    facilities, [{ id: 'Line:AB', from: 'Node:A', to: 'Node:B' }]).values).toEqual([]);
});
