import { useMemo } from 'react';
import {
  filterOverlayConnectionsByCountries,
  filterOverlayFacilitiesByCountries,
  normalizeOverlayCountryCodes,
} from '../atlasNetworkOverlay';

const EMPTY = Object.freeze([]);
const EMPTY_RECORDS = Object.freeze({ facilities: EMPTY, connections: EMPTY });

function useScopedRecords(source = EMPTY_RECORDS, countries, enabled) {
  const { facilities = EMPTY, connections = EMPTY } = source;
  // Facilities and links arrive through independent lazy domain requests.
  // Cache their country work independently so adding Supply does not recreate
  // an unchanged Grid connection array and force Leaflet to redraw it.
  const scopedConnections = useMemo(() => enabled
    ? filterOverlayConnectionsByCountries(connections, countries)
    : EMPTY, [connections, countries, enabled]);
  const scopedFacilities = useMemo(() => enabled
    ? filterOverlayFacilitiesByCountries(facilities, scopedConnections, countries)
    : EMPTY, [facilities, scopedConnections, countries, enabled]);
  return useMemo(() => enabled
    ? { facilities: scopedFacilities, connections: scopedConnections }
    : EMPTY_RECORDS, [enabled, scopedFacilities, scopedConnections]);
}

function useTaggedConnections(records, carrier, selected) {
  return useMemo(() => selected
    ? records.connections.map((connection) => (
      connection.atlas_network_carrier === carrier
        ? connection
        : { ...connection, atlas_network_carrier: carrier }
    ))
    : EMPTY, [carrier, records.connections, selected]);
}

// Five single-current-value memos, not an accumulating country/history cache.
// Hidden sources still provide legend inventory while overlay is active, but
// changing one source must not rescan all others or invalidate visible arrays.
export function useOverlayCountryRecords({ sources, countries, countriesByCarrier = {}, carriers, enabled }) {
  const countryKey = normalizeOverlayCountryCodes(countries).join(',');
  const scope = useMemo(() => countryKey ? countryKey.split(',') : EMPTY, [countryKey]);
  const gasKey = normalizeOverlayCountryCodes(countriesByCarrier.gas ?? scope).join(',');
  const waterKey = normalizeOverlayCountryCodes(countriesByCarrier.water ?? scope).join(',');
  const liquidsKey = normalizeOverlayCountryCodes(countriesByCarrier.liquids ?? scope).join(',');
  const logisticsKey = normalizeOverlayCountryCodes(countriesByCarrier.logistics ?? scope).join(',');
  const gasScope = useMemo(() => gasKey ? gasKey.split(',') : EMPTY, [gasKey]);
  const waterScope = useMemo(() => waterKey ? waterKey.split(',') : EMPTY, [waterKey]);
  const liquidsScope = useMemo(() => liquidsKey ? liquidsKey.split(',') : EMPTY, [liquidsKey]);
  const logisticsScope = useMemo(() => logisticsKey ? logisticsKey.split(',') : EMPTY, [logisticsKey]);
  const electricity = useScopedRecords(sources.electricity, scope, enabled);
  const gas = useScopedRecords(sources.gas, gasScope, enabled);
  const water = useScopedRecords(sources.water, waterScope, enabled);
  const liquids = useScopedRecords(sources.liquids, liquidsScope, enabled);
  const logistics = useScopedRecords(sources.logistics, logisticsScope, enabled);
  const records = useMemo(() => ({ electricity, gas, water, liquids, logistics }),
    [electricity, gas, water, liquids, logistics]);

  const selectedElectricity = enabled && carriers.includes('electricity') ? electricity : null;
  const selectedGas = enabled && carriers.includes('gas') ? gas : null;
  const selectedWater = enabled && carriers.includes('water') ? water : null;
  const selectedLiquids = enabled && carriers.includes('liquids') ? liquids : null;
  const selectedLogistics = enabled && carriers.includes('logistics') ? logistics : null;
  const electricityConnections = useTaggedConnections(electricity, 'electricity', Boolean(selectedElectricity));
  const gasConnections = useTaggedConnections(gas, 'gas', Boolean(selectedGas));
  const waterConnections = useTaggedConnections(water, 'water', Boolean(selectedWater));
  const liquidsConnections = useTaggedConnections(liquids, 'liquids', Boolean(selectedLiquids));
  const logisticsConnections = useTaggedConnections(logistics, 'logistics', Boolean(selectedLogistics));
  const selected = useMemo(() => {
    if (!enabled) return EMPTY;
    const available = { electricity: selectedElectricity, gas: selectedGas, water: selectedWater,
      liquids: selectedLiquids, logistics: selectedLogistics };
    return carriers.filter(carrier => available[carrier]).map(carrier => ({ carrier, records: available[carrier] }));
  }, [enabled, carriers, selectedElectricity, selectedGas, selectedWater, selectedLiquids, selectedLogistics]);
  const selectedConnections = useMemo(() => [
    ...electricityConnections,
    ...gasConnections,
    ...waterConnections,
    ...liquidsConnections,
    ...logisticsConnections,
  ], [electricityConnections, gasConnections, waterConnections, liquidsConnections, logisticsConnections]);
  return { records, selected, selectedConnections };
}
