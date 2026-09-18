import { indexOverviewNodes, selectOverviewNodes } from './overviewNodeSampling';

export const ATLAS_NETWORK_CARRIER_ORDER = ['electricity', 'gas', 'water', 'liquids', 'logistics'];

// Colour is reinforced by line pattern for secondary networks. Power and
// methane intentionally use solid strokes, with clearly separated yellow and
// green identities.
export const ATLAS_NETWORK_CARRIER_META = {
  electricity: { label: 'Electricity', shortLabel: 'Power', color: '#fde047', dashArray: null },
  gas: { label: 'Methane gas', shortLabel: 'Methane', color: '#4ade80', dashArray: null },
  water: { label: 'Water & wastewater', shortLabel: 'Water', color: '#22d3ee', dashArray: '2 5' },
  liquids: { label: 'Oil & energy liquids', shortLabel: 'Liquids', color: '#f59e0b', dashArray: '13 4 2 4' },
  logistics: { label: 'Ports & air freight', shortLabel: 'Logistics', color: '#a78bfa', dashArray: '5 4' },
};

export const overlayCarrierStatus = ({ selected, inventory = {}, visibleInventory = {}, carrier, scopeHasRecords }) => {
  if (!selected) return inventory.loading ? 'Hidden · loading' : inventory.loaded ? inventory.hasRecords === false ? 'Hidden · no records' : 'Hidden · cached' : 'Not loaded';
  if (inventory.loading) return 'Loading grid…';
  if (inventory.error) return inventory.loaded ? inventory.hasRecords === false ? 'Update failed · earlier empty result kept' : 'Update failed · previous data kept' : 'Load failed · reselect to retry';
  if (inventory.loaded && inventory.hasRecords === false) return 'No records for loaded layers';
  if (inventory.loaded && !(visibleInventory.assets || visibleInventory.connections)) {
    if (scopeHasRecords === true) return 'Loaded · hidden by filters';
    if (scopeHasRecords === false) return 'No records in selected countries';
  }
  if (inventory.loaded) return `${(visibleInventory.assets || 0).toLocaleString()} assets · ${(visibleInventory.connections || 0).toLocaleString()} links loaded`;
  return carrier === 'electricity' ? 'Build power first' : 'Load on selection';
};

// Called only when the filtered overlay is empty. Use already-prepared counts,
// never scan/clone network features merely to explain the current UI state.
export const overlayEmptyState = ({ countryCount, carriers = [], inventory = {}, records = {}, visibleDomainCount }) => {
  if (carriers.some(carrier => inventory[carrier]?.loading)) return {
    reason: 'loading', message: 'Loading the selected networks. Your country and filter choices are kept.',
  };
  if (!countryCount) return { reason: 'countries', message: 'Choose a country in Geography Domain to start the overlay.' };
  const selectedLoaded = carriers.filter(carrier => inventory[carrier]?.loaded);
  if (!selectedLoaded.length && carriers.some(carrier => inventory[carrier]?.error)) return {
    reason: 'failed', message: 'The selected networks could not be loaded. Reselect a carrier to retry, or open its workspace for the error details.',
  };
  if (!selectedLoaded.length) return {
    reason: 'not-loaded', message: 'No loaded network is selected. Choose a cached carrier in the overlay legend, or open a carrier workspace to check its data status.',
  };
  const hasScopedRecords = selectedLoaded.some(carrier =>
    records[carrier]?.facilities?.length > 0 || records[carrier]?.connections?.length > 0);
  if (!hasScopedRecords) return {
    reason: 'coverage', message: 'Loaded layers contain no records for these countries. Try another domain, country or carrier. Missing coverage is not proof that no infrastructure exists.',
  };
  if (!visibleDomainCount) return {
    reason: 'domains-hidden', message: 'All map domains are hidden. Your networks are still loaded. Show Grid, or select Supply, Demand or Storage above.',
    action: 'show-grid',
  };
  return {
    reason: 'filters', message: 'No loaded assets or links match the current domain and carrier filters. Adjust the map domains above or the carrier filters in Atlas Domains.',
  };
};

export const normalizeOverlayCountryCodes = (values) => [...new Set(
  (Array.isArray(values) ? values : String(values || '').split(','))
    .map((value) => String(value || '').trim().toUpperCase())
    .map((value) => value === 'UK' ? 'GB' : value)
    .filter((value) => /^[A-Z]{2}$/.test(value))
)].sort();

/**
 * PyPSA cache exporters restart component IDs (line-0, link-0, …) for each
 * country. A bare connection ID therefore is not unique once country caches
 * are combined. Scope it to its source dataset so multi-country maps retain
 * every country's topology while repeated domain hydration still deduplicates.
 */
export const scopedAtlasConnectionIdentity = (connection) => {
  const sourceScope = String(
    connection?.sourceCountryCode
    || connection?.sourceNetworkFilename
    || connection?.atlas_network_carrier
    || 'network'
  ).trim().toUpperCase();
  const connectionKey = String(
    connection?.id
    || `${connection?.from || ''}::${connection?.to || ''}::${connection?.type || connection?.carrier || ''}`
  );
  return `${sourceScope}::${connectionKey}`;
};

const addCountryValue = (target, value) => {
  if (Array.isArray(value)) {
    value.forEach((item) => addCountryValue(target, item));
    return;
  }
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const normalized = normalizeOverlayCountryCodes([item]);
      if (normalized.length) target.add(normalized[0]);
    });
};

/** Return every ISO2 country tag exposed by an Atlas asset or connection. */
export const atlasRecordCountryCodes = (record) => {
  const countries = new Set();
  [
    record?.country_codes,
    record?.countries,
    record?.country,
    record?.country_code,
    record?.sourceCountryCode,
    record?.source_country_code,
    record?.from_country_code,
    record?.to_country_code,
  ].forEach((value) => addCountryValue(countries, value));

  // Some open network nodes do not carry a country field, but do carry a
  // NUTS identifier. Its first two characters are the ISO2 country code.
  [record?.nuts3, record?.nuts2, record?.nuts1].forEach((nutsCode) => {
    const match = String(nutsCode || '').trim().toUpperCase().match(/^([A-Z]{2})/);
    if (match) addCountryValue(countries, match[1]);
  });
  return [...countries];
};

/**
 * Clip a carrier's already-loaded records to the shared Geography selection.
 * Untagged network nodes are retained when they are endpoints of an in-scope
 * connection, which is important for SciGRID gas nodes whose country is only
 * represented by NUTS codes or their connected pipelines.
 */
export const filterOverlayConnectionsByCountries = (connections, countryCodes) => {
  const selected = new Set(normalizeOverlayCountryCodes(countryCodes));
  const sourceConnections = Array.isArray(connections) ? connections : [];
  if (!selected.size) return sourceConnections;

  return sourceConnections.filter((record) => (
    atlasRecordCountryCodes(record).some((code) => selected.has(code))
  ));
};

export const filterOverlayFacilitiesByCountries = (facilities, scopedConnections, countryCodes) => {
  const selected = new Set(normalizeOverlayCountryCodes(countryCodes));
  const sourceFacilities = Array.isArray(facilities) ? facilities : [];
  if (!selected.size) return sourceFacilities;

  const matches = (record) => atlasRecordCountryCodes(record).some((code) => selected.has(code));
  const connectedFacilityIds = new Set();
  (Array.isArray(scopedConnections) ? scopedConnections : []).forEach((connection) => {
    [connection?.from, connection?.to].filter(Boolean).forEach((id) => connectedFacilityIds.add(String(id)));
  });
  return sourceFacilities.filter((facility) => (
    matches(facility) || connectedFacilityIds.has(String(facility?.id || ''))
  ));
};

export const filterOverlayRecordsByCountries = (facilities, connections, countryCodes) => {
  const filteredConnections = filterOverlayConnectionsByCountries(connections, countryCodes);
  return {
    facilities: filterOverlayFacilitiesByCountries(facilities, filteredConnections, countryCodes),
    connections: filteredConnections,
  };
};

export const resolveOverlayCarrierToggle = (current, carrier, inventory) => {
  const selected = (current || []).includes(carrier);
  const carrierState = inventory?.[carrier] || {};
  if (!selected && carrier === 'electricity' && !carrierState.loaded) {
    return { carriers: current, error: 'power_not_loaded' };
  }
  const proposed = selected
    ? (current || []).filter((value) => value !== carrier)
    : [...(current || []), carrier];
  // Successful empty responses are loaded, but cannot stand in for the last
  // network with records. Conversely an already-empty/failed selection can be
  // removed; there is no geometry to protect in that case.
  const containsRecords = state => state?.loaded && state.hasRecords !== false;
  if (selected && containsRecords(carrierState) && !proposed.some((value) => containsRecords(inventory?.[value]) || inventory?.[value]?.loading)) {
    return { carriers: current, error: 'last_loaded_carrier' };
  }
  return {
    carriers: ATLAS_NETWORK_CARRIER_ORDER.filter((value) => proposed.includes(value)),
    error: null,
  };
};

// Compatibility entrypoint; all overview marker selection shares one policy.
export const sampleOverlayByCarrier = (items, limit) => {
  const source = Array.isArray(items) ? items : [];
  const maximum = Math.max(1, Math.floor(Number(limit) || 1));
  if (source.length <= maximum) return source;
  return selectOverviewNodes(indexOverviewNodes(source, atlasRecordCountryCodes), source, maximum, { balanceCarriers: true });
};
