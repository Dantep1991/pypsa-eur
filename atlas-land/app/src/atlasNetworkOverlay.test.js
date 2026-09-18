import {
  ATLAS_NETWORK_CARRIER_META,
  atlasRecordCountryCodes,
  filterOverlayRecordsByCountries,
  normalizeOverlayCountryCodes,
  overlayCarrierStatus,
  overlayEmptyState,
  resolveOverlayCarrierToggle,
  sampleOverlayByCarrier,
  scopedAtlasConnectionIdentity,
} from './atlasNetworkOverlay';

describe('Atlas multi-network overlay helpers', () => {
  const emptyFacts = { countryCount: 1, carriers: ['electricity'],
    inventory: { electricity: { loaded: true } },
    records: { electricity: { facilities: [{ id: 'a' }], connections: [] } }, visibleDomainCount: 1 };
  test('empty overlay explains hidden domains without claiming a reload is needed', () => {
    expect(overlayEmptyState({ ...emptyFacts, visibleDomainCount: 0 })).toMatchObject({ reason: 'domains-hidden', action: 'show-grid' });
    expect(overlayEmptyState(emptyFacts)).toMatchObject({ reason: 'filters' });
    expect(overlayEmptyState(emptyFacts).action).toBeUndefined();
  });
  test('empty overlay distinguishes country scope, loading, unselected data and missing coverage', () => {
    expect(overlayEmptyState({ ...emptyFacts, countryCount: 0 }).reason).toBe('countries');
    expect(overlayEmptyState({ ...emptyFacts, carriers: [] }).reason).toBe('not-loaded');
    expect(overlayEmptyState({ ...emptyFacts, inventory: {} }).reason).toBe('not-loaded');
    expect(overlayEmptyState({ ...emptyFacts, inventory: { electricity: { loading: true } }, visibleDomainCount: 0 }).reason).toBe('loading');
    expect(overlayEmptyState({ ...emptyFacts, records: {}, visibleDomainCount: 0 }).reason).toBe('coverage');
    expect(overlayEmptyState({ ...emptyFacts, countryCount: 0, inventory: { electricity: { loading: true } } }).reason).toBe('loading');
    expect(overlayEmptyState({ ...emptyFacts, inventory: { electricity: { error: 'Failed' } } }).reason).toBe('failed');
  });
  test('empty overlay counts only selected carriers, and connections alone are loaded data', () => {
    expect(overlayEmptyState({ ...emptyFacts, carriers: ['water'], inventory: { ...emptyFacts.inventory, water: { loaded: true } } }).reason).toBe('coverage');
    expect(overlayEmptyState({ ...emptyFacts, records: { electricity: { connections: [{}] } }, visibleDomainCount: 0 }).action).toBe('show-grid');
    expect(overlayEmptyState({ ...emptyFacts, inventory: { ...emptyFacts.inventory, water: { loading: true } } }).reason).toBe('filters');
  });
  test('uses distinct colours and the requested solid methane identity', () => {
    const values = Object.values(ATLAS_NETWORK_CARRIER_META);
    expect(new Set(values.map((item) => item.color)).size).toBe(values.length);
    expect(ATLAS_NETWORK_CARRIER_META.gas).toMatchObject({ color: '#4ade80', dashArray: null });
    const patternedNetworks = ['water', 'liquids', 'logistics'].map((key) => ATLAS_NETWORK_CARRIER_META[key].dashArray);
    expect(new Set(patternedNetworks).size).toBe(patternedNetworks.length);
  });

  test('distinguishes hidden cached carriers from selected loaded records', () => {
    const inventory = { loaded: true, loading: false };
    const visibleInventory = { assets: 93, connections: 181 };
    expect(overlayCarrierStatus({ selected: false, inventory, visibleInventory })).toBe('Hidden · cached');
    expect(overlayCarrierStatus({ selected: true, inventory, visibleInventory })).toBe('93 assets · 181 links loaded');
    expect(overlayCarrierStatus({ selected: false, inventory: { loading: true } })).toBe('Hidden · loading');
    expect(overlayCarrierStatus({ selected: true, inventory: { loading: true } })).toBe('Loading grid…');
    expect(overlayCarrierStatus({ selected: false })).toBe('Not loaded');
    expect(overlayCarrierStatus({ selected: true, carrier: 'electricity' })).toBe('Build power first');
    expect(overlayCarrierStatus({ selected: true, carrier: 'water' })).toBe('Load on selection');
    expect(overlayCarrierStatus({ selected: true, inventory: { error: 'Failed' } })).toBe('Load failed · reselect to retry');
    expect(overlayCarrierStatus({ selected: true, inventory: { loaded: true, error: 'Failed' } })).toBe('Update failed · previous data kept');
    expect(overlayCarrierStatus({ selected: true, inventory: { loading: true, error: 'Earlier failure' } })).toBe('Loading grid…');
    expect(overlayCarrierStatus({ selected: true, inventory, scopeHasRecords: true })).toBe('Loaded · hidden by filters');
    expect(overlayCarrierStatus({ selected: true, inventory, scopeHasRecords: false })).toBe('No records in selected countries');
  });

  test('retains a visible sample from a small carrier beside a large carrier', () => {
    const power = Array.from({ length: 40 }, (_, id) => ({ id: `p${id}`, atlas_network_carrier: 'electricity' }));
    const methane = Array.from({ length: 2000 }, (_, id) => ({ id: `g${id}`, atlas_network_carrier: 'gas' }));
    const sampled = sampleOverlayByCarrier([...power, ...methane], 200);
    const powerCount = sampled.filter((item) => item.atlas_network_carrier === 'electricity').length;
    const gasCount = sampled.filter((item) => item.atlas_network_carrier === 'gas').length;
    expect(sampled).toHaveLength(200);
    expect(powerCount).toBeGreaterThanOrEqual(30);
    expect(gasCount).toBeGreaterThan(0);
  });

  test('is deterministic and leaves collections below the budget untouched', () => {
    const items = Array.from({ length: 20 }, (_, id) => ({ id, atlas_network_carrier: id % 2 ? 'gas' : 'water' }));
    expect(sampleOverlayByCarrier(items, 50)).toBe(items);
    expect(sampleOverlayByCarrier(items, 8).map((item) => item.id))
      .toEqual(sampleOverlayByCarrier(items, 8).map((item) => item.id));
  });

  test('does not claim unloaded power is visible', () => {
    const result = resolveOverlayCarrierToggle(['gas'], 'electricity', {
      electricity: { loaded: false, loading: false },
      gas: { loaded: true, loading: false },
    });
    expect(result).toEqual({ carriers: ['gas'], error: 'power_not_loaded' });
  });

  test('never removes the final loaded network but permits gas removal when power exists', () => {
    const inventory = {
      electricity: { loaded: true, loading: false },
      gas: { loaded: true, loading: false },
    };
    expect(resolveOverlayCarrierToggle(['gas'], 'gas', inventory).error).toBe('last_loaded_carrier');
    expect(resolveOverlayCarrierToggle(['electricity', 'gas'], 'gas', inventory)).toEqual({
      carriers: ['electricity'], error: null,
    });
  });

  test('valid empty caches are loaded without claiming there are visible records', () => {
    const inventory = { loaded: true, hasRecords: false };
    expect(overlayCarrierStatus({ selected: true, inventory, scopeHasRecords: false })).toBe('No records for loaded layers');
    expect(overlayCarrierStatus({ selected: false, inventory })).toBe('Hidden · no records');
    expect(overlayCarrierStatus({ selected: true, inventory: { ...inventory, loading: true } })).toBe('Loading grid…');
    expect(overlayCarrierStatus({ selected: true, inventory: { ...inventory, error: 'Supply failed' } })).toBe('Update failed · earlier empty result kept');
    expect(overlayEmptyState({ countryCount: 1, carriers: ['gas'], inventory: { gas: inventory }, records: {}, visibleDomainCount: 1 }).reason).toBe('coverage');
  });

  test('empty or failed selections can be removed, but cannot replace the last known non-empty network', () => {
    const inventory = { electricity: { loaded: true, hasRecords: true }, gas: { loaded: true, hasRecords: false } };
    expect(resolveOverlayCarrierToggle(['electricity', 'gas'], 'electricity', inventory).error).toBe('last_loaded_carrier');
    expect(resolveOverlayCarrierToggle(['electricity', 'gas'], 'gas', inventory)).toEqual({ carriers: ['electricity'], error: null });
    expect(resolveOverlayCarrierToggle(['gas'], 'gas', inventory)).toEqual({ carriers: [], error: null });
    expect(resolveOverlayCarrierToggle(['water'], 'water', { water: { loaded: false, error: 'Failed' } })).toEqual({ carriers: [], error: null });
    expect(resolveOverlayCarrierToggle(['gas'], 'electricity', { ...inventory, electricity: { loaded: true, hasRecords: false } }).error).toBeNull();
  });

  test('normalizes the shared overlay country scope', () => {
    expect(normalizeOverlayCountryCodes(['fr', 'BE', 'UK', 'FR', ''])).toEqual(['BE', 'FR', 'GB']);
    expect(normalizeOverlayCountryCodes('ES, pt,ES')).toEqual(['ES', 'PT']);
  });

  test('keeps repeated PyPSA line IDs distinct across country caches', () => {
    const france = scopedAtlasConnectionIdentity({ id: 'line-0', sourceCountryCode: 'FR' });
    const spain = scopedAtlasConnectionIdentity({ id: 'line-0', sourceCountryCode: 'ES' });
    const franceHydratedAgain = scopedAtlasConnectionIdentity({ id: 'line-0', sourceCountryCode: 'FR' });
    expect(france).not.toBe(spain);
    expect(france).toBe(franceHydratedAgain);
  });

  test('extracts country identity from direct fields, connection arrays and NUTS tags', () => {
    expect(atlasRecordCountryCodes({ sourceCountryCode: 'be' })).toEqual(['BE']);
    expect(atlasRecordCountryCodes({ country_codes: ['FR', 'DE'] })).toEqual(['FR', 'DE']);
    expect(atlasRecordCountryCodes({ country: '', nuts3: 'BE231' })).toEqual(['BE']);
  });

  test('filters carrier records to Geography countries and retains connected untagged nodes', () => {
    const facilities = [
      { id: 'be-node', nuts3: 'BE100' },
      { id: 'border-node' },
      { id: 'fr-node', country: 'FR' },
      { id: 'unknown-node' },
    ];
    const connections = [
      { id: 'be-link', from: 'be-node', to: 'border-node', country_codes: ['BE'] },
      { id: 'fr-link', from: 'fr-node', to: 'unknown-node', country_codes: ['FR'] },
    ];
    const filtered = filterOverlayRecordsByCountries(facilities, connections, ['BE']);
    expect(filtered.connections.map((item) => item.id)).toEqual(['be-link']);
    expect(filtered.facilities.map((item) => item.id)).toEqual(['be-node', 'border-node']);
  });
});
