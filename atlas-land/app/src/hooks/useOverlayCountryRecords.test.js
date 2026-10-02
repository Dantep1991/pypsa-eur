import { renderHook } from '@testing-library/react';
import { useOverlayCountryRecords } from './useOverlayCountryRecords';
import * as overlay from '../atlasNetworkOverlay';

const carriers = ['electricity'];
const sourcesFor = () => Object.fromEntries(overlay.ATLAS_NETWORK_CARRIER_ORDER.map(carrier => [carrier, {
  facilities: [{ id: `${carrier}-FR`, country_code: 'FR' }, { id: `${carrier}-BE`, country_code: 'BE' }],
  connections: [],
}]));
let filterConnections;
let filterFacilities;
beforeEach(() => {
  filterConnections = jest.spyOn(overlay, 'filterOverlayConnectionsByCountries');
  filterFacilities = jest.spyOn(overlay, 'filterOverlayFacilitiesByCountries');
});
afterEach(() => {
  filterConnections.mockRestore();
  filterFacilities.mockRestore();
});

test('new wrappers and equivalent country selections do not rescan source records', () => {
  const sources = sourcesFor();
  const { result, rerender } = renderHook(props => useOverlayCountryRecords(props), {
    initialProps: { sources, countries: ['BE', 'FR'], carriers, enabled: true },
  });
  const previous = result.current;
  expect(filterConnections).toHaveBeenCalledTimes(5);
  expect(filterFacilities).toHaveBeenCalledTimes(5);
  rerender({ sources: { ...sources }, countries: ['FR', 'BE', 'FR'], carriers, enabled: true });
  expect(filterConnections).toHaveBeenCalledTimes(5);
  expect(filterFacilities).toHaveBeenCalledTimes(5);
  expect(result.current.records).toBe(previous.records);
  expect(result.current.selected).toBe(previous.selected);
});

test('a hidden source update scans only that source and preserves the selected inputs', () => {
  const sources = sourcesFor();
  const { result, rerender } = renderHook(props => useOverlayCountryRecords(props), {
    initialProps: { sources, countries: ['FR'], carriers, enabled: true },
  });
  const before = result.current;
  const nextSources = { ...sources, gas: { ...sources.gas,
    facilities: [...sources.gas.facilities, { id: 'gas-new', country_code: 'FR' }] } };
  rerender({ sources: nextSources, countries: ['FR'], carriers, enabled: true });
  expect(filterConnections).toHaveBeenCalledTimes(5);
  expect(filterFacilities).toHaveBeenCalledTimes(6);
  expect(result.current.records.gas.connections).toBe(before.records.gas.connections);
  expect(result.current.records.electricity).toBe(before.records.electricity);
  expect(result.current.records.gas.facilities).toHaveLength(2);
  expect(result.current.selected).toBe(before.selected);
  rerender({ sources: nextSources, countries: ['FR'], carriers: ['gas', 'electricity'], enabled: true });
  expect(filterConnections).toHaveBeenCalledTimes(5);
  expect(filterFacilities).toHaveBeenCalledTimes(6);
  expect(result.current.selected.map(item => item.carrier)).toEqual(['gas', 'electricity']);
  expect(result.current.selected[0].records.facilities).toHaveLength(2);
});

test('changing countries or a selected source publishes the new scoped inputs', () => {
  const sources = sourcesFor();
  const { result, rerender } = renderHook(props => useOverlayCountryRecords(props), {
    initialProps: { sources, countries: ['FR'], carriers, enabled: true },
  });
  const before = result.current.selected;
  rerender({ sources, countries: ['BE'], carriers, enabled: true });
  expect(filterConnections).toHaveBeenCalledTimes(10);
  expect(filterFacilities).toHaveBeenCalledTimes(10);
  expect(result.current.selected).not.toBe(before);
  expect(result.current.selected[0].records.facilities.map(item => item.id)).toEqual(['electricity-BE']);
  const countryView = result.current.selected;
  rerender({ sources: { ...sources, electricity: { facilities: [], connections: [] } }, countries: ['BE'], carriers, enabled: true });
  expect(filterConnections).toHaveBeenCalledTimes(11);
  expect(filterFacilities).toHaveBeenCalledTimes(11);
  expect(result.current.selected).not.toBe(countryView);
  expect(result.current.selected[0].records.facilities).toEqual([]);
});

test('standalone mode skips overlay scans and releases the prepared overlay outputs', () => {
  const sources = sourcesFor();
  const { result, rerender } = renderHook(props => useOverlayCountryRecords(props), {
    initialProps: { sources, countries: ['FR'], carriers, enabled: false },
  });
  expect(filterConnections).not.toHaveBeenCalled();
  expect(filterFacilities).not.toHaveBeenCalled();
  expect(result.current.selected).toEqual([]);
  rerender({ sources, countries: ['FR'], carriers, enabled: true });
  expect(filterConnections).toHaveBeenCalledTimes(5);
  expect(filterFacilities).toHaveBeenCalledTimes(5);
  rerender({ sources, countries: ['FR'], carriers, enabled: false });
  expect(filterConnections).toHaveBeenCalledTimes(5);
  expect(filterFacilities).toHaveBeenCalledTimes(5);
  expect(Object.values(result.current.records).every(record => !record.facilities.length && !record.connections.length)).toBe(true);
  rerender({ sources: sourcesFor(), countries: ['BE'], carriers, enabled: false });
  expect(filterConnections).toHaveBeenCalledTimes(5);
  expect(filterFacilities).toHaveBeenCalledTimes(5);
});

test('asset-only source changes retain the selected tagged connection cache', () => {
  const sources = sourcesFor();
  sources.electricity.connections = [{ id: 'grid-link', country_code: 'FR' }];
  const { result, rerender } = renderHook(props => useOverlayCountryRecords(props), {
    initialProps: { sources, countries: ['FR'], carriers, enabled: true },
  });
  const before = result.current.selectedConnections;
  const scopedConnections = result.current.records.electricity.connections;
  rerender({
    sources: {
      ...sources,
      electricity: {
        ...sources.electricity,
        facilities: [...sources.electricity.facilities, { id: 'solar', country_code: 'FR' }],
      },
    },
    countries: ['FR'], carriers, enabled: true,
  });
  expect(result.current.selectedConnections).toBe(before);
  expect(result.current.records.electricity.connections).toBe(scopedConnections);
});

test('methane may be scoped to France without changing electricity or other carriers', () => {
  const sources = sourcesFor();
  const { result, rerender } = renderHook(props => useOverlayCountryRecords(props), {
    initialProps: {
      sources, countries: ['FR', 'BE'], countriesByCarrier: { gas: ['FR'] },
      carriers: ['electricity', 'gas', 'water'], enabled: true,
    },
  });
  expect(result.current.records.electricity.facilities.map(item => item.id)).toEqual(['electricity-FR', 'electricity-BE']);
  expect(result.current.records.gas.facilities.map(item => item.id)).toEqual(['gas-FR']);
  expect(result.current.records.water.facilities.map(item => item.id)).toEqual(['water-FR', 'water-BE']);
  const beforePower = result.current.records.electricity;
  const beforeWater = result.current.records.water;
  rerender({ sources, countries: ['FR', 'BE'], countriesByCarrier: { gas: ['BE'] },
    carriers: ['electricity', 'gas', 'water'], enabled: true });
  expect(result.current.records.gas.facilities.map(item => item.id)).toEqual(['gas-BE']);
  expect(result.current.records.electricity).toBe(beforePower);
  expect(result.current.records.water).toBe(beforeWater);
});
