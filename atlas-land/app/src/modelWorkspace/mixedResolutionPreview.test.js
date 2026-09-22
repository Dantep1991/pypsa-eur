import {
  buildModelMixedResolutionPreview,
  buildModelResolutionProfile,
  buildModelUniformResolutionPreview,
  buildModelUniformResolutionProfile,
  deriveModelCountryAdjacency,
} from './mixedResolutionPreview';

const node = (id, country, latitude, longitude) => ({
  id,
  name: id,
  nodeId: id,
  latitude,
  longitude,
  country,
  region: country,
  component_type: 'Bus',
  type: 'Bus',
  atlas_domain: 'Grid',
  properties: [],
});
const link = (id, from, to, pNom) => ({
  id,
  name: id,
  from,
  to,
  fromNode: from,
  toNode: to,
  component_type: 'Line',
  type: 'line',
  atlas_domain: 'Grid',
  p_nom: pNom,
  capacity_units: 'MW',
  properties: [],
});

const scene = {
  facilities: [
    node('ES1', 'ES', 40, -4),
    node('PT1', 'PT', 39.5, -8),
    node('FR1', 'FR', 46, 2),
    node('FR2', 'FR', 48, 3),
    node('BE1', 'BE', 50.8, 4.2),
    node('BE2', 'BE', 51.1, 5.1),
    node('DE1', 'DE', 51, 10),
    {
      id: 'GEN:BE:solar', name: 'BE solar', component_type: 'Generator', type: 'Solar PV',
      carrier_key: 'solar', carrier_nice_name: 'Solar PV', atlas_domain: 'Supply', country: 'BE',
      bus: 'BE1', latitude: 50.8, longitude: 4.2, p_nom: 100, properties: [],
    },
    {
      id: 'GEN:DE:solar', name: 'DE solar', component_type: 'Generator', type: 'Solar PV',
      carrier_key: 'solar', carrier_nice_name: 'Solar PV', atlas_domain: 'Supply', country: 'DE',
      bus: 'DE1', latitude: 51, longitude: 10, p_nom: 200, properties: [],
    },
  ],
  connections: [
    link('L:ES-PT', 'ES1', 'PT1', 1000),
    link('L:ES-FR', 'ES1', 'FR1', 2000),
    link('L:FR-FR', 'FR1', 'FR2', 3000),
    link('L:FR-BE', 'FR2', 'BE1', 4000),
    link('L:BE-BE', 'BE1', 'BE2', 2500),
    link('L:BE-DE', 'BE2', 'DE1', 5000),
  ],
  meta: {
    projectId: 'TYNDP_2026_Scenarios',
    version: 'v3.0.0',
    selectedYear: 2030,
    layers: ['grid', 'supply'],
    countries: ['BE', 'DE', 'ES', 'FR', 'PT'],
  },
};

test('country adjacency is derived exclusively from the loaded model links', () => {
  expect(Object.fromEntries(deriveModelCountryAdjacency(scene))).toEqual({
    BE: ['DE', 'FR'],
    DE: ['BE'],
    ES: ['FR', 'PT'],
    FR: ['BE', 'ES'],
    PT: ['ES'],
  });
});

test('resolution profile uses deterministic graph rings and never offers a finer tier', () => {
  const profile = buildModelResolutionProfile(scene, { focusCountry: 'ES' });
  expect(profile.rings).toEqual({
    focus: ['ES'],
    adjacent: ['FR', 'PT'],
    outer: ['BE'],
    other: ['DE'],
  });
  expect(profile.tierByCountry).toEqual({ BE: 'country', DE: 'country', ES: 'native', FR: 'native', PT: 'native' });
  expect(profile.capabilities.canDisaggregate).toBe(false);
  expect(() => buildModelResolutionProfile(scene, { focusCountry: 'ES', adjacentTier: 'nuts3' })).toThrow(/only supports/i);
});

test('mixed preview preserves interface connectivity and capacity accounting without mutating the source', () => {
  const sourceSnapshot = JSON.stringify(scene);
  const preview = buildModelMixedResolutionPreview(scene, { focusCountry: 'ES' });
  const projectedNodeIds = new Set(preview.facilities.filter(item => item.component_type === 'Bus').map(item => item.id));

  expect(preview.meta.preview.label).toMatch(/non-executable/i);
  expect(preview.meta.preview.capabilities).toMatchObject({ mutatesSource: false, executable: false, canDisaggregate: false });
  expect(preview.meta.preview.counts).toMatchObject({ sourceNodes: 7, projectedNodes: 6, sourceLinks: 6, projectedLinks: 5, internalizedLinks: 1 });
  expect(preview.connections.every(connection => projectedNodeIds.has(connection.from) && projectedNodeIds.has(connection.to))).toBe(true);
  expect(preview.meta.preview.reconciliation.linkMWDelta).toBe(0);
  expect(preview.meta.preview.reconciliation.assetMWDelta).toBe(0);
  expect(JSON.stringify(scene)).toBe(sourceSnapshot);
});

test('country-level assets retain source lineage and additive capacities', () => {
  const preview = buildModelMixedResolutionPreview(scene, { focusCountry: 'ES', adjacentTier: 'country' });
  const beAsset = preview.facilities.find(item => item.atlas_source_ids?.includes('GEN:BE:solar'));
  expect(beAsset).toMatchObject({ p_nom: 100, atlas_resolution_tier: 'country', atlas_source_count: 1 });
  expect(beAsset.bus).toBe('atlas-preview:country:BE');
});

test('uniform country resolution aggregates every model zone without inventing finer topology', () => {
  const profile = buildModelUniformResolutionProfile(scene, 'country');
  const preview = buildModelUniformResolutionPreview(scene, 'country');
  const nodes = preview.facilities.filter(item => item.component_type === 'Bus');

  expect(profile.tierByCountry).toEqual({ BE: 'country', DE: 'country', ES: 'country', FR: 'country', PT: 'country' });
  expect(nodes).toHaveLength(5);
  expect(nodes.map(item => item.country).sort()).toEqual(['BE', 'DE', 'ES', 'FR', 'PT']);
  expect(preview.meta.preview.reconciliation.linkMWDelta).toBe(0);
  expect(preview.meta.preview.capabilities.canDisaggregate).toBe(false);
});

test('preview refuses countries absent from the canonical model', () => {
  expect(() => buildModelMixedResolutionPreview(scene, { focusCountry: 'GB' })).toThrow(/exists in the loaded model/i);
});
