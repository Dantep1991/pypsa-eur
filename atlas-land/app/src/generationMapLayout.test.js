import { generationPieDiameter, indexGenerationSites, selectGenerationSites } from './generationMapLayout';

const generator = (id, p_nom, extra = {}) => ({ id, type: 'Generator', latitude: 52, longitude: 8, p_nom, ...extra });

test('visible generators are grouped once without bringing hidden co-located assets back', () => {
  const hidden = generator('hidden', 9000);
  let reads = 0;
  const nodes = Array.from({ length: 50 }, (_, i) => ({ ...generator(String(i), 10),
    get p_nom() { reads += 1; return 10; }, sameLocationFacilities: [hidden] }));
  const sites = indexGenerationSites(nodes);
  expect(sites).toHaveLength(1);
  expect(sites[0].capacityTotal).toBe(500);
  expect(sites[0].generators).toHaveLength(50);
  expect(reads).toBe(50);
});

test('regional sites with a single generator remain eligible at overview zoom', () => {
  const sites = indexGenerationSites([generator('one', 100, { sourceNetworkFilename: 'base_AL_bidding_zone.nc' })]);
  expect(selectGenerationSites(sites, 3).sites).toHaveLength(1);
  expect(sites[0].aggregate).toBe(true);
});

test('overview selects largest visible nodal sites and retains all regional zones', () => {
  const nodes = Array.from({ length: 220 }, (_, i) => generator(String(i), i + 1, { longitude: i / 100 }));
  const regions = Array.from({ length: 200 }, (_, i) => generator(`r${i}`, 0.1, { longitude: 10 + i / 100, sourceNetworkFilename: 'base_FR_nuts3.nc' }));
  const indexed = indexGenerationSites([...nodes, ...regions, generator('outside', 99999, { longitude: -100 })]);
  const result = selectGenerationSites(indexed, 3, { south: 50, north: 54, west: 0, east: 20 });
  expect(result.inView).toBe(420);
  expect(result.sites).toHaveLength(380);
  expect(result.sites.filter(s => s.aggregate)).toHaveLength(200);
  expect(result.sites.filter(s => !s.aggregate).map(s => s.capacityTotal)).toEqual(Array.from({ length: 180 }, (_, i) => 220 - i));
  expect(selectGenerationSites(indexed, 8).sites).toHaveLength(421);
  expect(indexed[0].capacityTotal).toBe(99999);
});

test('country-fit zoom caps DOM-backed pies and reveals the full fleet at close zoom', () => {
  const sites = indexGenerationSites(Array.from({ length: 970 }, (_, i) => generator(String(i), i + 1, {
    country: 'ES', longitude: -9 + (i % 97) * 0.1, latitude: 36 + Math.floor(i / 97) * 0.4,
  })));
  expect(selectGenerationSites(sites, 8).sites).toHaveLength(600);
  expect(selectGenerationSites(sites, 9).sites).toHaveLength(900);
  expect(selectGenerationSites(sites, 11).sites).toHaveLength(970);
});

test('invalid coordinates and non-generators cannot contaminate capacity totals', () => {
  const sites = indexGenerationSites([
    generator('bus', 999, { type: 'Bus' }), generator('missing', 999, { longitude: null }),
    generator('blank', 999, { latitude: '' }), generator('outside', 999, { latitude: 91 }),
    generator('zero', 0), generator('optimized', 100, { p_nom_opt: 150 }),
    generator('fallback', 50, { p_nom_opt: null, total_dispatch_MWh: 7 }),
  ]);
  expect(sites).toHaveLength(1);
  expect(sites[0]).toMatchObject({ capacityTotal: 200, dispatchTotal: 7 });
});

test('diameter follows square-root capacity with readable regional floors and compact nodal limits', () => {
  expect(generationPieDiameter(1, 3, true)).toBe(22);
  expect(generationPieDiameter(0.25, 3, true)).toBe(11);
  expect(generationPieDiameter(0.001, 3, true)).toBe(5);
  expect(generationPieDiameter(1, 3, false)).toBe(9);
  expect(generationPieDiameter(1, 11, false)).toBe(48);
  expect(generationPieDiameter(NaN, 3)).toBe(2);
});

test('smaller countries and remote sites remain represented beside a dense high-capacity fleet', () => {
  const nodes = [...Array.from({ length: 300 }, (_, i) => generator(`de${i}`, 5000 - i, { country: 'DE', longitude: 8 + i / 10000 })),
    generator('fr', 1, { country: 'FR', longitude: 2 }), generator('es', 1, { country: 'ES', longitude: -4 }),
    generator('de-remote', 1, { country: 'DE', longitude: 15 })];
  const sites = indexGenerationSites(nodes), selected = selectGenerationSites(sites, 4).sites;
  expect(selected).toHaveLength(180);
  expect(selected.flatMap(site => site.generators.map(node => node.id))).toEqual(expect.arrayContaining(['de0', 'fr', 'es', 'de-remote']));
});

test('a selected small generator is retained without changing membership when it was already visible', () => {
  const nodes = Array.from({ length: 300 }, (_, i) => generator(`site${i}`, 1000 - i, { country: 'DE', longitude: 8 + i / 10000 }));
  const sites = indexGenerationSites(nodes), base = selectGenerationSites(sites, 4).sites;
  expect(selectGenerationSites(sites, 4, undefined, { selectedIds: ['site10'] }).sites).toEqual(base);
  const selected = selectGenerationSites(sites, 4, undefined, { selectedIds: ['site299'] }).sites;
  expect(selected).toHaveLength(180);
  expect(selected.flatMap(site => site.generators.map(node => node.id))).toContain('site299');
});
