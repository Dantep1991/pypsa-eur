import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import L from 'leaflet';
import EnhancedLeafletMapWithVoice, {
  applyLandPaneOpacity,
  applyMapDisplayPaneVisibility,
  applyRegionalClusterPaneOpacity,
  buildGeoJsonPopupContent,
} from './EnhancedLeafletMapWithVoice';
import { clearAppliedViewportCommand } from '../viewportCommand';
import { resetEuropeBoundaryCache } from '../europeBoundaryCache';

// Render the production map component and its camera/telemetry effects. Only
// Leaflet's rendering boundary is replaced; movement emits real-style events
// synchronously, including from stop(), which used to replay camera commands.
let mockMap;
let mockLineLayerProps;
let mockOverviewLineProps;
let mockPointLayerProps;
let mockBoundaryLayerProps;
let mockClusterLayerProps;
let mockAutoCompleteLines;
let mockPendingLineProps;
let mockTileUrls;
let mockLandClick;
let mockCountryMounts;
let mockCountryLayerProps;
let mockRegionMounts;
let mockAccessLayerProps;
let mockMixLayerProps;
let mockMapContainerProps;
let mockTileProps;
let mockPointMounts;
let mockMapContainerElement;
let mockLandTileMounts;
let mockLandTileLayer;
let mockLandPane;
let mockMapContentRenders;
jest.mock('./BatchedNetworkLayer', () => {
  const React = require('react');
  return (props) => {
    mockPendingLineProps = props;
    React.useEffect(() => {
      if (mockAutoCompleteLines) props.onProgress?.({ key: props.dataKey, renderedLinks: props.data.features.length, renderingLinks: false, renderError: '' });
    }, [props.dataKey]);
    return React.createElement('span', { 'data-testid': 'network-lines' }, React.createElement(require('react-leaflet').GeoJSON, props));
  };
});
jest.mock('./OverviewNetworkCanvasLayer', () => {
  const React = require('react');
  return (props) => {
    mockOverviewLineProps = props;
    React.useEffect(() => {
      if (mockAutoCompleteLines) props.onProgress?.({ key: props.dataKey, renderedLinks: props.data.features.length, renderingLinks: false, renderError: '', overview: true });
    }, [props.dataKey]);
    return React.createElement('span', { 'data-testid': 'overview-network-lines' });
  };
});
jest.mock('react-leaflet', () => {
  const React = require('react');
  const Container = ({ children }) => <>{children}</>;
  const Layer = () => null;
  return {
    MapContainer: props => { mockMapContentRenders += 1; mockMapContainerProps = props; return <Container>{props.children}</Container>; },
    TileLayer: React.forwardRef((props, ref) => {
      const layer = React.useMemo(() => ({ setOpacity: jest.fn() }), []);
      React.useImperativeHandle(ref, () => layer, [layer]);
      mockTileUrls.push(props.url);
      mockTileProps.push(props);
      React.useEffect(() => {
        if (props.url.includes('/land/tiles/')) {
          mockLandTileMounts += 1;
          mockLandTileLayer = layer;
        }
      }, []);
      return null;
    }), Marker: Layer,
    CircleMarker: Layer, Circle: Layer, Tooltip: Layer, Pane: Container,
    GeoJSON: (props) => {
      if (props.pane === 'grid-access-sites') mockAccessLayerProps = props;
      React.useEffect(() => { if (props.pane === 'loaded-country-context') mockCountryMounts += 1; }, []);
      React.useEffect(() => { if (props.data?.features?.[0]?.id === 'region-qa') mockRegionMounts += 1; }, []);
      React.useEffect(() => {
        if (props.pane !== 'generation-mix-pane' && props.data?.features?.some(feature => feature.properties?.facility)) mockPointMounts++;
      }, []);
      if (props.pane === 'loaded-country-context') mockCountryLayerProps = props;
      if (props.pane === 'regional-clusters') mockClusterLayerProps = props;
      if (props.data?.features?.some((feature) => feature.properties?.connection)) mockLineLayerProps = props;
      if (props.pane === 'generation-mix-pane') mockMixLayerProps = props;
      else if (props.data?.features?.some((feature) => feature.properties?.facility)) mockPointLayerProps = props;
      if (props.data?.features?.some((feature) => feature.geometry?.type === 'Polygon')) mockBoundaryLayerProps = props;
      return <span data-testid={`geojson-${props.pane || 'default'}`} />;
    },
    useMap: () => mockMap,
    useMapEvents: handlers => { if (handlers.click) mockLandClick = handlers.click; return mockMap; },
  };
});

function makeMap() {
  const listeners = new Map();
  const map = {
    zoom: 5, center: L.latLng(52, 8),
    on: jest.fn((names, callback) => names.split(' ').forEach((name) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    })),
    off: jest.fn((names, callback) => names.split(' ').forEach((name) => listeners.get(name)?.delete(callback))),
    emit: (name) => [...(listeners.get(name) || [])].forEach((callback) => callback({ target: map })),
    getCenter: () => map.center,
    getZoom: () => map.zoom,
    getMinZoom: () => 3,
    getMaxZoom: () => 16,
    getContainer: () => mockMapContainerElement,
    addLayer: jest.fn(() => map),
    getPane: jest.fn((name) => name === 'land-constraints' ? mockLandPane : null),
    getBoundsZoom: jest.fn(() => 6),
    getBounds: () => L.latLngBounds([map.center.lat - 1, map.center.lng - 1], [map.center.lat + 1, map.center.lng + 1]),
    stop: jest.fn(() => map.emit('moveend')),
    setView: jest.fn((center, zoom) => {
      map.emit('movestart');
      map.center = L.latLng(center);
      map.zoom = zoom;
      map.emit('zoomend');
      map.emit('moveend');
      return map;
    }),
    setZoom: jest.fn((zoom) => map.setView(map.center, zoom)),
    zoomIn: jest.fn(() => map.setZoom(map.zoom + 1)),
    zoomOut: jest.fn(() => map.setZoom(map.zoom - 1)),
    fitBounds: jest.fn((bounds) => map.setView(bounds.getCenter(), 6)),
  };
  return map;
}

const paris = { id: 'paris', operation: 'center', latitude: 48.8566, longitude: 2.3522, zoom: 10 };
const defaults = {
  facilities: [{ id: 'FR', component_type: 'bus', country_code: 'FR', latitude: 48.85, longitude: 2.35 }],
  connections: [], editableNodes: [], selectedNodes: [], geoJsonOverlays: [],
  activeCountryCodes: ['FR'], networkResolution: 'bidding_zone',
};
let originalFetch;
let originalMatchMedia;
beforeEach(() => {
  resetEuropeBoundaryCache();
  jest.useFakeTimers();
  mockMap = makeMap();
  mockLineLayerProps = null;
  mockOverviewLineProps = null;
  mockPointLayerProps = null;
  mockBoundaryLayerProps = null;
  mockClusterLayerProps = null;
  mockAutoCompleteLines = true;
  mockPendingLineProps = null;
  mockTileUrls = [];
  mockLandClick = null;
  mockCountryMounts = 0;
  mockCountryLayerProps = null;
  mockRegionMounts = 0;
  mockAccessLayerProps = null;
  mockMixLayerProps = null;
  mockMapContainerProps = null;
  mockTileProps = [];
  mockPointMounts = 0;
  mockLandTileMounts = 0;
  mockLandTileLayer = null;
  mockLandPane = document.createElement('div');
  mockMapContentRenders = 0;
  mockMapContainerElement = document.createElement('div');
  originalFetch = global.fetch;
  originalMatchMedia = window.matchMedia;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) }));
});
afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  window.matchMedia = originalMatchMedia;
  jest.useRealTimers();
});
const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  act(() => jest.advanceTimersByTime(200));
};

test('result size changes keep point layers, topology, source queries and camera stable', async () => {
  const facilities = [{ ...defaults.facilities[0], latitude: 52, longitude: 8, atlas_result_map_mode: 'bubbles', atlas_result_value: 25, atlas_result_magnitude_ratio: 0.25 }];
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} resultMarkerScale={1} />);
  await settle();
  const first = mockPointLayerProps.pointToLayer(mockPointLayerProps.data.features[0], L.latLng(52, 8));
  expect(first.getRadius()).toBe(18);
  const mounts = mockPointMounts, calls = global.fetch.mock.calls.length, lineKey = mockPendingLineProps.dataKey;
  mockMap.setView.mockClear(); mockMap.fitBounds.mockClear();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} resultMarkerScale={2} />);
  await settle();
  const larger = mockPointLayerProps.pointToLayer(mockPointLayerProps.data.features[0], L.latLng(52, 8));
  expect(larger.getRadius()).toBe(36);
  expect(mockPointMounts).toBe(mounts);
  expect(mockPendingLineProps.dataKey).toBe(lineKey);
  expect(global.fetch.mock.calls).toHaveLength(calls);
  expect(mockMap.setView).not.toHaveBeenCalled(); expect(mockMap.fitBounds).not.toHaveBeenCalled();
});

test('names the interactive map and exposes its keyboard shortcuts without clobbering later owners', () => {
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} />);
  expect(mockMapContainerElement.getAttribute('role')).toBe('region');
  expect(mockMapContainerElement.getAttribute('aria-label')).toBe('Interactive infrastructure map');
  expect(mockMapContainerElement.getAttribute('aria-keyshortcuts')).toBe(
    'ArrowUp ArrowDown ArrowLeft ArrowRight + -'
  );

  mockMapContainerElement.setAttribute('aria-label', 'Custom map label');
  view.unmount();
  expect(mockMapContainerElement.getAttribute('aria-label')).toBe('Custom map label');
  expect(mockMapContainerElement.hasAttribute('role')).toBe(false);
  expect(mockMapContainerElement.hasAttribute('aria-keyshortcuts')).toBe(false);
});

test('voice and shell rerenders do not reconcile an unchanged map feature tree', async () => {
  const firstClick = jest.fn();
  const firstCenterChange = jest.fn();
  const gridAccess = {
    enabled: false, panelOpen: false, data: { type: 'FeatureCollection', features: [] },
    sides: ['demand'], countryCodes: ['FR'], metric: 'pressure', projectScope: 'future',
  };
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} gridAccess={gridAccess}
    onConnectionClick={firstClick} onRegionCenterChange={firstCenterChange} />);
  await settle();
  const settledRenders = mockMapContentRenders;

  // App recreates these lightweight wrappers while live transcripts and
  // assistant messages change. Equivalent map inputs must retain identity at
  // the expensive content boundary, while event proxies still receive the
  // latest callback on the next real map interaction.
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} activeCountryCodes={['FR']}
    gridAccess={{ ...gridAccess }} onConnectionClick={jest.fn()} onRegionCenterChange={jest.fn()} />);
  await settle();
  expect(mockMapContentRenders).toBe(settledRenders);

  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} activeCountryCodes={['FR']}
    gridAccess={{ ...gridAccess, metric: 'available_mw' }} onConnectionClick={jest.fn()} onRegionCenterChange={jest.fn()} />);
  await settle();
  expect(mockMapContentRenders).toBeGreaterThan(settledRenders);
});

test('basemap transitions use the themed backing and no overlapping tile fades or intermediate zoom requests', () => {
  render(<EnhancedLeafletMapWithVoice {...defaults} />);
  expect(mockMapContainerProps.style.backgroundColor).toBe('var(--atlas-map-canvas)');
  expect(mockMapContainerProps.fadeAnimation).toBe(false);
  expect(mockMapContainerProps.center).toEqual([52, 8]);
  expect(mockMapContainerProps.zoom).toBe(5);
  expect(mockMap.setView).not.toHaveBeenCalled();
  const basemaps = mockTileProps.filter(props => props.url.includes('World_Dark_Gray'));
  expect(basemaps.length).toBeGreaterThanOrEqual(2);
  for (const props of basemaps) {
    expect(props.updateWhenIdle).toBe(true);
    expect(props.updateWhenZooming).toBe(false);
    expect(props.keepBuffer).toBe(2);
    expect(props.detectRetina).toBe(false);
  }
});

test('light and Horizon workspaces use the matching light Esri basemap', () => {
  render(<EnhancedLeafletMapWithVoice {...defaults} atlasTheme="horizon" />);
  const basemaps = mockTileProps.filter(props => props.url.includes('World_Light_Gray'));
  expect(new Set(basemaps.map(props => props.url))).toHaveProperty('size', 2);
  expect(mockTileProps.some(props => props.url.includes('World_Dark_Gray'))).toBe(false);
});

test('Europe boundaries stay off the empty startup path and load on first real geometry demand', async () => {
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} facilities={[]} activeCountryCodes={[]} showGeographicBoundaries={false} />);
  await settle();
  expect(global.fetch.mock.calls.some(([url]) => String(url).includes('europe.geojson'))).toBe(false);

  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={[]} activeCountryCodes={['FR']} showGeographicBoundaries />);
  await settle();
  expect(global.fetch.mock.calls.filter(([url]) => String(url).includes('europe.geojson'))).toHaveLength(1);
});

test('node and boundary selectors remove their rendered map layers and restore them', async () => {
  const regionalOverlay = {
    name: 'regions.geojson',
    feature_collection: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', properties: { name: 'Test region' },
        geometry: { type: 'Polygon', coordinates: [[[7.5, 51.5], [8.5, 51.5], [8.5, 52.5], [7.5, 51.5]]] },
      }],
    },
  };
  const props = {
    ...defaults,
    facilities: [
      { ...defaults.facilities[0], latitude: 52, longitude: 8 },
      { id: 'FR-2', component_type: 'bus', country_code: 'FR', latitude: 52.2, longitude: 8.2 },
      { id: 'FR-solar', component_type: 'generator', type: 'Generator', country_code: 'FR', bus: 'FR', carrier: 'solar', p_nom: 100, latitude: 52, longitude: 8 },
    ],
    connections: [{ id: 'FR-line', from: 'FR', to: 'FR-2', carrier: 'AC' }],
    geoJsonOverlays: [regionalOverlay],
    regionalClusterOverlay: {
      key: 'clusters', opacity: 48,
      data: { ...regionalOverlay.feature_collection, features: regionalOverlay.feature_collection.features.map((feature) => ({
        ...feature, properties: { ...feature.properties, color: '#22c55e' },
      })) },
    },
  };
  const view = render(<EnhancedLeafletMapWithVoice {...props} showGenerationMix showNodeMarkers showGeographicBoundaries />);
  await settle();

  expect(view.queryByTestId('geojson-network-nodes')).not.toBeNull();
  expect(view.queryByTestId('geojson-network-boundaries')).not.toBeNull();
  expect(view.queryByTestId('geojson-generation-mix-pane')).not.toBeNull();
  expect(mockClusterLayerProps.style(mockClusterLayerProps.data.features[0]).weight).toBeGreaterThan(0);

  view.rerender(<EnhancedLeafletMapWithVoice {...props} showGenerationMix showNodeMarkers={false} showGeographicBoundaries={false} />);
  await settle();
  expect(view.queryByTestId('geojson-network-nodes')).toBeNull();
  expect(view.queryByTestId('geojson-network-boundaries')).toBeNull();
  expect(view.queryByTestId('geojson-generation-mix-pane')).toBeNull();
  expect(mockClusterLayerProps.style(mockClusterLayerProps.data.features[0])).toMatchObject({ weight: 0, opacity: 0, fillOpacity: 0.94 });

  view.rerender(<EnhancedLeafletMapWithVoice {...props} showGenerationMix showNodeMarkers showGeographicBoundaries />);
  await settle();
  expect(view.queryByTestId('geojson-network-nodes')).not.toBeNull();
  expect(view.queryByTestId('geojson-network-boundaries')).not.toBeNull();
  expect(view.queryByTestId('geojson-generation-mix-pane')).not.toBeNull();
});

test.each(['full', 'overlay'])('overview retains country representatives and selected nodes without dropping links (%s)', async resolution => {
  const facilities = [...Array.from({ length: 400 }, (_, i) => ({ id: `de${i}`, country: 'DE', type: 'Bus', latitude: 50, longitude: 10,
    atlas_network_carrier: 'electricity' })),
    { id: 'fr', country: 'FR', type: 'Bus', latitude: 50.3, longitude: 10.2, atlas_network_carrier: 'electricity' },
    { id: 'be', country: 'BE', type: 'Bus', latitude: 50.4, longitude: 10.3, atlas_network_carrier: 'gas' }];
  const connections = Array.from({ length: 399 }, (_, i) => ({ id: `line${i}`, from: `de${i}`, to: 'fr' }));
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} connections={connections} networkResolution={resolution} />);
  await settle(); act(() => mockMap.setView([50, 10], 4)); await settle();
  const ids = () => mockPointLayerProps.data.features.map(feature => feature.properties.facility.id);
  expect(ids()).toHaveLength(180); expect(ids()).toEqual(expect.arrayContaining(['fr', 'be']));
  expect(mockLineLayerProps.data.features).toHaveLength(399);
  const initial = ids(), mounts = mockPointMounts;
  expect(mounts).toBeGreaterThan(0);
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} connections={connections} networkResolution={resolution} selectedNode={initial[0]} />);
  await settle(); expect(ids()).toEqual(initial); expect(mockPointMounts).toBe(mounts);
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} connections={connections} networkResolution={resolution} selectedNode="de399" />);
  await settle(); expect(ids()).toHaveLength(180); expect(ids()).toContain('de399');
  expect(mockLineLayerProps.data.features).toHaveLength(399);
  act(() => mockMap.setView([50, 10], 8)); await settle();
  expect(ids()).toHaveLength(402); expect(mockLineLayerProps.data.features).toHaveLength(399);
});

test('aggregate cache nodes and editable handles are never removed by detailed-node sampling', async () => {
  const facilities = Array.from({ length: 240 }, (_, i) => ({ id: `region${i}`, type: 'Bus', country: 'FR',
    latitude: 50, longitude: 10, sourceNetworkFilename: 'base_FR_nuts3.nc' }));
  const editableNodes = [{ id: 'edit', type: 'Generator', editable: true, latitude: 50, longitude: 10 }];
  render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} editableNodes={editableNodes} showGenerationMix networkResolution="nuts3" />);
  await settle(); act(() => mockMap.setView([50, 10], 4)); await settle();
  expect(mockPointLayerProps.data.features).toHaveLength(241);
  expect(mockPointLayerProps.data.features.map(feature => feature.properties.facility.id)).toContain('edit');
});

test('single-generator regional pies survive overview zoom and retain capacity scale across panning', async () => {
  const facilities = [
    { id: 'big', type: 'Generator', carrier: 'wind', p_nom: 400, latitude: 52, longitude: 8, sourceNetworkFilename: 'base_DE_bidding_zone.nc' },
    { id: 'small', type: 'Generator', carrier: 'solar', p_nom: 100, latitude: 52, longitude: 9, sourceNetworkFilename: 'base_FR_bidding_zone.nc' },
  ];
  render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} showGenerationMix />);
  act(() => mockMap.setView([52, 8.5], 3));
  await settle();
  expect(mockMixLayerProps.data.features).toHaveLength(2);
  const features = mockMixLayerProps.data.features;
  const size = feature => mockMixLayerProps.pointToLayer(feature, L.latLng(52, 8)).options.icon.options.iconSize[0];
  expect(features.map(f => f.properties.capacityTotal)).toEqual([400, 100]);
  expect(features.map(size)).toEqual([22, 11]);
  act(() => { mockMap.center = L.latLng(52, 9.9); mockMap.emit('moveend'); });
  await settle();
  expect(mockMixLayerProps.data.features).toHaveLength(1);
  expect(mockMixLayerProps.data.features[0].properties.facility.id).toBe('small');
  expect(size(mockMixLayerProps.data.features[0])).toBe(11);
});

test('generation composition is reused across navigation and its tooltip is prepared on inspection', async () => {
  let capacityReads = 0;
  const facilities = [300, 100].map((capacity, index) => ({
    id: `g${index}`, type: 'Generator', carrier: index ? 'solar' : 'wind', bus: '<Node>',
    latitude: 52, longitude: 8, sourceNetworkFilename: 'base_DE_nuts3.nc',
    get p_nom() { capacityReads += 1; return capacity; },
  }));
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} showGenerationMix />);
  act(() => mockMap.setView([52, 8], 4));
  await settle();
  const first = mockMixLayerProps.data.features[0].properties;
  const reads = capacityReads;
  for (const zoom of [5, 6, 4]) {
    act(() => mockMap.setView([52.1, 8], zoom));
    await settle();
    expect(mockMixLayerProps.data.features[0].properties.segments).toBe(first.segments);
    expect(capacityReads).toBe(reads);
  }
  expect(typeof first.tooltipContent).toBe('function');
  const marker = L.marker([52, 8]);
  mockMixLayerProps.onEachFeature(mockMixLayerProps.data.features[0], marker);
  expect(marker.getTooltip().getContent()).toBe(first.tooltipContent);
  const html = first.tooltipContent();
  expect(html).toContain('&lt;Node&gt;');
  expect(html).toContain('75.0%');
  expect(html).toContain('25.0%');
  // A carrier filter/source refresh must discard the old composition.
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={[facilities[1]]} showGenerationMix />);
  await settle();
  const next = mockMixLayerProps.data.features[0].properties;
  expect(next.capacityTotal).toBe(100);
  expect(next.segments).toHaveLength(1);
  expect(next.tooltipContent()).toContain('100.0%');
  expect(next.segments).not.toBe(first.segments);
});

test('node frames defer co-location filtering until inspection and exclude hidden components', async () => {
  const group = [
    { id: 'bus', type: 'Bus', carrier: 'AC', latitude: 52, longitude: 8 },
    { id: 'visible-load', type: 'Load', carrier: 'visible demand', latitude: 52, longitude: 8 },
    { id: 'hidden-generator', type: 'Generator', carrier: 'hidden wind', latitude: 52, longitude: 8 },
  ];
  let groupReads = 0;
  const facilities = group.slice(0, 2).map((facility) => ({
    ...facility, sameLocationCount: 3, locationKey: '52,8',
    get sameLocationFacilities() { groupReads += 1; return group; },
  }));
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} showGenerationMix={false} />);
  await settle();
  expect(mockPointLayerProps.data.features).toHaveLength(2);
  expect(mockPointLayerProps.data.features[0].properties.objectCount).toBe(2);
  expect(groupReads).toBe(0);
  const popup = mockPointLayerProps.data.features[0].properties.popupContent();
  expect(groupReads).toBeGreaterThan(0);
  const options = [...popup.querySelectorAll('select[aria-label="Component at this location"] option')];
  expect(options).toHaveLength(2);
  expect(options.map(option => option.textContent).join(' ')).not.toContain('hidden wind');
  groupReads = 0;
  act(() => mockMap.setZoom(7));
  await settle();
  expect(groupReads).toBe(0);
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={[facilities[0]]} showGenerationMix={false} />);
  await settle();
  expect(groupReads).toBe(0);
  const filteredPopup = mockPointLayerProps.data.features[0].properties.popupContent();
  expect(mockPointLayerProps.data.features[0].properties.objectCount).toBe(1);
  expect(mockPointLayerProps.data.features[0].properties.hasMultipleObjects).toBe(false);
  expect(filteredPopup.textContent).toContain('1 component at this location');
  expect(filteredPopup.querySelector('select[aria-label="Component at this location"]')).toBeNull();
});

test('queue popups distinguish absent measurements from published zero', async () => {
  const feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [8, 52] }, properties: {
    name: 'Test connection', available_mw: null, granted_mw: '', access_capacity_mw: false,
    queued_mw: 0, project_count: 0, pressure_pct: null, location_confidence: null,
    earliest_target_date: '2030-01-01', lead_time_years: null,
  } };
  render(<EnhancedLeafletMapWithVoice {...defaults} gridAccess={{ enabled: true,
    data: { type: 'FeatureCollection', features: [feature], meta: {} } }} />);
  await settle();
  const layer = { bindTooltip: jest.fn(), bindPopup: jest.fn(), on: jest.fn() };
  mockAccessLayerProps.onEachFeature(feature, layer);
  const root = document.createElement('div');
  expect(typeof layer.bindPopup.mock.calls[0][0]).toBe('function');
  expect(layer.bindTooltip.mock.calls[0][0]).toBe(layer.bindPopup.mock.calls[0][0]);
  root.innerHTML = layer.bindPopup.mock.calls[0][0]();
  const value = label => [...root.querySelectorAll('span')].find(node => node.textContent === label)?.nextElementSibling?.textContent;
  expect(value('Available access')).toBe('Not published');
  expect(value('Allocated / granted')).toBe('Not published');
  expect(value('Total offered / access')).toBe('Not published');
  expect(value('Queued / contracted')).toBe('0 MW');
  expect(value('Future projects')).toBe('0');
  expect(value('Pressure')).toBe('Not comparable');
  expect(value('Earliest target')).toBe('2030-01-01');
  expect(root.textContent).not.toContain('confidence 0%');
});

test('inspection hides side panels but preserves desktop zoom controls and panel preferences', async () => {
  const props = { ...defaults, landConstraints: { panelOpen: true }, gridAccess: { panelOpen: true } };
  const view = render(<EnhancedLeafletMapWithVoice {...props} />);
  await settle();
  expect(view.getByRole('region', { name: 'Grid Access controls' })).toBeDefined();
  expect(view.getByRole('region', { name: 'Land and Constraints controls' })).toBeDefined();
  view.rerender(<EnhancedLeafletMapWithVoice {...props} panelsHidden />);
  expect(view.queryByRole('region', { name: 'Grid Access controls' })).toBeNull();
  expect(view.queryByRole('region', { name: 'Land and Constraints controls' })).toBeNull();
  expect(view.getByRole('button', { name: 'Zoom in', exact: true })).toBeDefined();
  view.rerender(<EnhancedLeafletMapWithVoice {...props} />);
  expect(view.getByRole('region', { name: 'Grid Access controls' })).toBeDefined();
  expect(view.getByRole('region', { name: 'Land and Constraints controls' })).toBeDefined();
});

test('region labels are text, not imported HTML', async () => {
  const title = '<img src=x onerror="alert(1)"> & <b>Region</b>';
  const feature = { id: 'region-text', type: 'Feature', properties: { name: title }, geometry: {
    type: 'Polygon', coordinates: [[[7, 51], [9, 51], [9, 53], [7, 51]]] } };
  render(<EnhancedLeafletMapWithVoice {...defaults} geoJsonOverlays={[{ name: 'regions.geojson',
    feature_collection: { type: 'FeatureCollection', features: [feature] } }]} />);
  await settle();
  const layer = { bindTooltip: jest.fn() };
  mockBoundaryLayerProps.onEachFeature(feature, layer);
  const root = document.createElement('div');
  root.innerHTML = layer.bindTooltip.mock.calls[0][0];
  expect(root.querySelector('img,b')).toBeNull();
  expect(root.textContent).toBe(title);
});

test('line metric unit text cannot create elements in a tooltip', async () => {
  const units = '<img src=x onerror="alert(1)">';
  render(<EnhancedLeafletMapWithVoice {...defaults} lineMetricEnabled
    facilities={[{ id: 'a', latitude: 52, longitude: 8 }, { id: 'b', latitude: 52.2, longitude: 8.2 }]}
    connections={[{ id: 'line', from: 'a', to: 'b', metricValue: 12, metricUnits: units }]} />);
  await settle();
  const layer = { bindTooltip: jest.fn(), on: jest.fn() };
  mockPendingLineProps.onEachFeature(mockPendingLineProps.data.features[0], layer);
  const root = document.createElement('div');
  root.innerHTML = layer.bindTooltip.mock.calls[0][0]();
  expect(root.querySelector('img')).toBeNull();
  expect(root.textContent).toContain(`12 ${units}`);
});

test('drag start and settle do not rebuild unchanged lines', async () => {
  const facilities = [
    { id: 'a', latitude: 52, longitude: 8, component_type: 'Load', p_set: 10 },
    { id: 'b', latitude: 52.2, longitude: 8.2, component_type: 'Load', p_set: 20 },
  ];
  render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities}
    networkResolution="full" connections={[{ id: 'line', from: 'a', to: 'b' }]} />);
  await settle();
  const originalKey = mockPendingLineProps.dataKey;
  const originalData = mockPendingLineProps.data;
  act(() => mockMap.emit('movestart'));
  expect(mockPendingLineProps.dataKey).toBe(originalKey);
  expect(mockPendingLineProps.data).toBe(originalData);
  act(() => mockMap.emit('moveend'));
  await settle();
  expect(mockPendingLineProps.dataKey).toBe(originalKey);
});

test('point construction does not latch a temporary simplified style during a drag', async () => {
  render(<EnhancedLeafletMapWithVoice {...defaults} facilities={[
    { id: 'a', latitude: 52, longitude: 8, component_type: 'Load', p_set: 10 },
  ]} />);
  await settle();
  const props = { ...mockPointLayerProps.data.features[0], properties: {
    ...mockPointLayerProps.data.features[0].properties, nodeEmphasis: 1,
  } };
  const originalPoint = mockPointLayerProps.pointToLayer(props, L.latLng(48.85, 2.35));
  act(() => mockMap.emit('movestart'));
  const movingPoint = mockPointLayerProps.pointToLayer(props, L.latLng(48.85, 2.35));
  expect(movingPoint.constructor).toBe(originalPoint.constructor);
});

test('country outlines update their style without rebuilding geographic paths on zoom or focus', async () => {
  const feature = code => ({ type: 'Feature', properties: { ISO2: code }, geometry: {
    type: 'Polygon', coordinates: [[[9, 49], [11, 49], [11, 51], [9, 49]]] } });
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature('BE'), feature('FR')] }) }));
  const props = { ...defaults, activeCountryCodes: ['BE', 'FR'], activeCountryCode: 'FR' };
  const view = render(<EnhancedLeafletMapWithVoice {...props} />);
  await settle();
  const initial = mockCountryMounts;
  const initialData = mockCountryLayerProps.data;
  expect(initial).toBe(1);
  act(() => mockMap.setZoom(8));
  await settle();
  expect(mockCountryMounts).toBe(initial);
  expect(mockCountryLayerProps.style(feature('FR')).weight).toBe(2.6);
  view.rerender(<EnhancedLeafletMapWithVoice {...props} activeCountryCode="BE" />);
  await settle();
  expect(mockCountryMounts).toBe(initial);
  expect(mockCountryLayerProps.data).toBe(initialData);
  expect(mockCountryLayerProps.style(feature('BE')).opacity).toBe(0.9);
  expect(mockCountryLayerProps.style(feature('FR')).opacity).toBe(0.58);
});

test('regional boundary geometry survives zoom but a replacement region still remounts', async () => {
  const overlay = offset => ({ name: 'regions.geojson', feature_collection: {
    type: 'FeatureCollection', features: [{ id: 'region-qa', type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[[7 + offset, 51], [9, 51], [9, 53], [7 + offset, 51]]] } }],
  } });
  const overlays = [overlay(0)];
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} geoJsonOverlays={overlays} />);
  await settle();
  expect(mockRegionMounts).toBe(1);
  for (const zoom of [8, 4, 7, 5]) {
    act(() => mockMap.setZoom(zoom));
    await settle();
    expect(mockRegionMounts).toBe(1);
  }
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} geoJsonOverlays={[overlay(0.25)]} />);
  await settle();
  expect(mockRegionMounts).toBe(2);
});

test('unsupported land scope suppresses tiles, sampling and inspection; supported custom scope recovers', async () => {
  const land = { enabled: true, panelOpen: true, countries: ['BE', 'XK'], categories: ['forest'],
    status: { ready: true, countries: [{ code: 'BE', name: 'Belgium' }] } };
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={land} />);
  await settle();
  expect(view.getByText(/Country boundaries unavailable for XK/)).toBeDefined();
  expect(view.getByRole('button', { name: 'Inspect a location' }).disabled).toBe(true);
  expect(mockTileUrls.some(url => url.includes('/land/tiles/'))).toBe(false);
  act(() => jest.advanceTimersByTime(1000));
  await settle();
  expect(global.fetch.mock.calls.some(([url]) => url.includes('/land/viewport-stats'))).toBe(false);
  mockTileUrls = [];
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={{ ...land, countries: ['BE'] }} />);
  await settle();
  expect(mockTileUrls.some(url => url.includes('/land/tiles/') && url.includes('countries=BE'))).toBe(true);
  expect(view.getByRole('button', { name: 'Inspect a location' }).disabled).toBe(false);
});

test('land country context and generation mix do not publish stray presentation text into the map', async () => {
  const land = { enabled: true, panelOpen: false, countries: ['BE'], categories: ['forest'],
    status: { ready: true, countries: [{ code: 'BE', name: 'Belgium' }] } };
  const facilities = [{
    id: 'BE generation', type: 'Generator', carrier: 'wind', p_nom: 100,
    latitude: 52, longitude: 8, sourceNetworkFilename: 'base_BE_nuts3.nc',
  }];
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={land}
    facilities={facilities} showGenerationMix />);
  await settle();
  expect(mockMixLayerProps.data.features).toHaveLength(1);
  expect(view.queryByText('}')).toBeNull();
});

test('land opacity reuses the same fully opaque tile cache and updates only layer opacity', async () => {
  const status = { ready: true, api_version: '1.1', countries: [{ code: 'BE', name: 'Belgium' }] };
  const land = { enabled: true, panelOpen: true, countries: ['BE'], categories: ['forest'], opacity: 35, status };
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={land} />);
  await settle();
  const initial = mockTileProps.filter(props => props.url.includes('/land/tiles/')).at(-1);
  expect(initial.url).toContain('opacity=100');
  expect(initial.opacity).toBe(1);
  expect(mockLandPane.style.opacity).toBe('0.35');
  expect(mockLandTileMounts).toBe(1);

  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={{ ...land, opacity: 82 }} />);
  await settle();
  const updated = mockTileProps.filter(props => props.url.includes('/land/tiles/')).at(-1);
  expect(updated.url).toBe(initial.url);
  expect(updated.opacity).toBe(1);
  expect(mockLandPane.style.opacity).toBe('0.82');
  expect(mockLandTileMounts).toBe(1);
});

test('land opacity previews on Leaflet and commits once after a drag', async () => {
  const changed = jest.fn();
  const status = { ready: true, api_version: '1.1', countries: [{ code: 'BE', name: 'Belgium' }] };
  const land = { enabled: true, panelOpen: true, countries: ['BE'], categories: ['forest'], opacity: 35, status };
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={land} onLandConstraintsChange={changed} />);
  await settle();
  const slider = view.getByRole('slider', { name: 'Land overlay opacity' });

  fireEvent.input(slider, { target: { value: '82' } });
  expect(changed).not.toHaveBeenCalled();
  expect(mockLandPane.style.opacity).toBe('0.82');
  expect(mockLandTileLayer.setOpacity).not.toHaveBeenCalled();
  expect(slider.value).toBe('82');
  expect(view.getByText('82%')).toBeDefined();

  fireEvent.pointerUp(slider);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledWith({ opacity: 82, enabled: true });
  fireEvent.blur(slider);
  expect(changed).toHaveBeenCalledTimes(1);
});

test('land opacity can commit through the presentation cache without publishing land state', async () => {
  const changed = jest.fn();
  const opacityCommitted = jest.fn();
  const status = { ready: true, api_version: '1.1', countries: [{ code: 'BE', name: 'Belgium' }] };
  const land = { enabled: true, panelOpen: true, countries: ['BE'], categories: ['forest'], opacity: 35, status };
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={land}
    onLandConstraintsChange={changed} onLandOpacityCommit={opacityCommitted} />);
  await settle();
  const slider = view.getByRole('slider', { name: 'Land overlay opacity' });

  fireEvent.input(slider, { target: { value: '74' } });
  fireEvent.pointerUp(slider);

  expect(opacityCommitted).toHaveBeenCalledTimes(1);
  expect(opacityCommitted).toHaveBeenCalledWith(74);
  expect(changed).not.toHaveBeenCalled();
  expect(mockLandPane.style.opacity).toBe('0.74');
  expect(mockLandTileLayer.setOpacity).not.toHaveBeenCalled();
});

test('land opacity compositor clamps values and reports unavailable panes', () => {
  const pane = document.createElement('div');
  expect(applyLandPaneOpacity({ getPane: () => pane }, 5)).toBe(true);
  expect(pane.style.opacity).toBe('0.2');
  expect(pane.style.willChange).toBe('opacity');
  expect(applyLandPaneOpacity({ getPane: () => pane }, 150)).toBe(true);
  expect(pane.style.opacity).toBe('1');
  expect(applyLandPaneOpacity({ getPane: () => null }, 50)).toBe(false);
});

test('regional cluster opacity updates its compositor pane without rebuilding geometry', () => {
  const pane = document.createElement('div');
  expect(applyRegionalClusterPaneOpacity({ getPane: () => pane }, 5)).toBe(true);
  expect(pane.style.opacity).toBe('0.15');
  expect(pane.style.willChange).toBe('opacity');
  expect(applyRegionalClusterPaneOpacity({ getPane: () => pane }, 65)).toBe(true);
  expect(pane.style.opacity).toBe('0.65');
  expect(applyRegionalClusterPaneOpacity({ getPane: () => null }, 48)).toBe(false);
});

test('map display compositor applies and restores Leaflet pane visibility', () => {
  const panes = {
    'network-nodes': document.createElement('div'),
    'network-boundaries': document.createElement('div'),
  };
  const map = { getPane: (name) => panes[name] || null };
  expect(applyMapDisplayPaneVisibility(map, { nodes: false, boundaries: false })).toBe(true);
  expect(panes['network-nodes'].style.display).toBe('none');
  expect(panes['network-boundaries'].style.display).toBe('none');
  expect(applyMapDisplayPaneVisibility(map, { nodes: true, boundaries: true })).toBe(true);
  expect(panes['network-nodes'].style.display).toBe('');
  expect(panes['network-boundaries'].style.display).toBe('');
  expect(applyMapDisplayPaneVisibility({ getPane: () => null }, { nodes: false, boundaries: false })).toBe(false);
});

test('an inspection from the old country scope cannot overwrite the new scope', async () => {
  const land = { enabled: true, panelOpen: true, countries: ['BE'], categories: ['forest'],
    status: { ready: true, countries: [{ code: 'BE', name: 'Belgium' }, { code: 'FR', name: 'France' }] } };
  let finishInspection;
  let signal;
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => {
    if (!url.includes('/land/inspect?')) return normalFetch(url, options);
    signal = options.signal;
    return new Promise(resolve => { finishInspection = resolve; });
  });
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={land} />);
  await settle();
  fireEvent.click(view.getByRole('button', { name: 'Inspect a location' }));
  act(() => { mockLandClick({ latlng: { lat: 50.85, lng: 4.35 } }); });
  await settle();
  expect(signal.aborted).toBe(false);
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={{ ...land, countries: ['FR'] }} />);
  await settle();
  expect(signal.aborted).toBe(true);
  await act(async () => finishInspection({ ok: true, json: async () => ({ land_cover: { label: 'Stale Belgian forest' }, in_scope: true }) }));
  await settle();
  expect(view.queryByText('Stale Belgian forest')).toBeNull();
  expect(view.queryByText('Reading local rasters…')).toBeNull();
});

test('late viewport-sample failure from a previous scope cannot clear the current sample', async () => {
  const land = { enabled: true, panelOpen: true, countries: ['BE'], categories: ['forest'],
    status: { ready: true, countries: [{ code: 'BE', name: 'Belgium' }, { code: 'FR', name: 'France' }] } };
  const requests = [];
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => !url.includes('/land/viewport-stats?') ? normalFetch(url, options)
    : new Promise((resolve, reject) => requests.push({ url, resolve, reject })));
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={land} />);
  await settle();
  act(() => jest.advanceTimersByTime(1000));
  await settle();
  const old = requests.find(r => r.url.includes('countries=BE'));
  expect(old).toBeDefined();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={{ ...land, countries: ['FR'] }} />);
  await settle();
  act(() => jest.advanceTimersByTime(1000));
  await settle();
  const current = requests.find(r => r.url.includes('countries=FR'));
  expect(current).toBeDefined();
  await act(async () => current.resolve({ ok: true, json: async () => ({ sample_count: 100, roles_percent: {
    hard_constraint: 91, conditional_constraint: 5, opportunity: 4 } }) }));
  expect(view.getByText('91%')).toBeDefined();
  await act(async () => old.reject(new Error('Late old-country response')));
  expect(view.getByText('91%')).toBeDefined();
});

test('rapid zoom steps coalesce into one land viewport sample for the final camera', async () => {
  const land = { enabled: true, panelOpen: true, countries: ['BE'], categories: ['forest'],
    status: { ready: true, countries: [{ code: 'BE', name: 'Belgium' }] } };
  render(<EnhancedLeafletMapWithVoice {...defaults} landConstraints={land} />);
  await settle();
  act(() => mockMap.setZoom(6));
  await settle();
  act(() => mockMap.setZoom(7));
  await settle();

  const samples = () => global.fetch.mock.calls.filter(([url]) => url.includes('/land/viewport-stats?'));
  expect(samples()).toHaveLength(0);
  act(() => jest.advanceTimersByTime(699));
  expect(samples()).toHaveLength(0);
  await act(async () => { jest.advanceTimersByTime(1); await Promise.resolve(); });
  expect(samples()).toHaveLength(1);
  expect(samples()[0][0]).toContain('zoom=7');
});

test('country command frames owned regions when the national outline is missing, and does not replay on filters', async () => {
  const region = { type: 'Feature', properties: { id: 'XK00' }, geometry: { type: 'Polygon',
    coordinates: [[[20.0, 42.0], [21.8, 42.0], [21.8, 43.3], [20.0, 43.3], [20.0, 42.0]]] } };
  const props = { ...defaults, activeCountryCodes: ['XK'], autoZoomScopeKey: 'XK',
    facilities: [{ id: 'XK00', component_type: 'Bus', country_code: 'XK', latitude: 42.8, longitude: 21.1 }],
    geoJsonOverlays: [{ sourceCountryCode: 'XK', feature_collection: { type: 'FeatureCollection', features: [region] } }],
    viewportCommand: { id: 'frame-kosovo', operation: 'fit_targets', countryCodes: ['XK'] },
    onViewportCommandApplied: jest.fn(),
  };
  const view = render(<EnhancedLeafletMapWithVoice {...props} />);
  await settle();
  expect(mockMap.fitBounds).toHaveBeenCalledTimes(1);
  const bounds = mockMap.fitBounds.mock.calls[0][0];
  expect(mockMap.fitBounds.mock.calls[0][1]).toMatchObject({ paddingTopLeft: [42, 148], paddingBottomRight: [42, 60] });
  expect(bounds.getSouthWest()).toEqual(L.latLng(42, 20));
  expect(bounds.getNorthEast()).toEqual(L.latLng(43.3, 21.8));
  act(() => mockMap.setZoom(8));
  for (const showNodeMarkers of [false, true, false]) {
    view.rerender(<EnhancedLeafletMapWithVoice {...props} showNodeMarkers={showNodeMarkers} />);
    await settle();
  }
  expect(mockMap.fitBounds).toHaveBeenCalledTimes(1);
  expect(mockMap.getZoom()).toBe(8);
});

test('overlay overview retains every visible link, including bridges and small carriers', async () => {
  const connections = Array.from({ length: 820 }, (_, index) => ({
    id: `route-${index}`, from: `a-${index}`, to: `b-${index}`, direct_route: true,
    atlas_network_carrier: index < 800 ? 'gas' : 'electricity',
    coordinates: [[9.5, 49.5], [10, 50], [10.5, 50.5]],
    p_nom: index + 1,
  }));
  const stats = jest.fn();
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} connections={connections} networkResolution="overlay" performanceMode onRenderStatsChange={stats} />);
  await settle();
  act(() => mockMap.setView([50, 10], 4));
  await settle();
  const assertComplete = () => {
    const rendered = mockLineLayerProps.data.features.map((feature) => feature.properties.connection);
    expect(rendered).toEqual(connections);
    expect(rendered.at(-1).p_nom).toBe(820);
    expect(stats).toHaveBeenLastCalledWith({ renderedLinks: 820, unmappedLinks: 0, renderingLinks: false, renderError: '', overviewLines: false, generationSitesRendered: 0, generationSitesInView: 0 });
  };
  assertComplete();
  for (const zoom of [5, 6, 9, 4]) {
    act(() => mockMap.setZoom(zoom));
    await settle();
    assertComplete();
    expect(mockLineLayerProps.smoothFactor).toBe(zoom <= 5 ? 2 : zoom <= 7 ? 1.5 : 1);
  }
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} connections={connections} networkResolution="overlay" performanceMode showNodeMarkers={false} onRenderStatsChange={stats} />);
  await settle();
  assertComplete();
});

test('dense networks use one overview canvas until the visible link count is safe for interaction', async () => {
  const connections = Array.from({ length: 4001 }, (_, index) => ({
    id: `dense-route-${index}`, from: `a-${index}`, to: `b-${index}`, direct_route: true,
    atlas_network_carrier: index % 2 ? 'gas' : 'electricity',
    coordinates: [[7.5, 51.5], [8, 52], [8.5, 52.5]], p_nom: index + 1,
  }));
  const stats = jest.fn();
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} connections={connections} networkResolution="overlay" performanceMode onRenderStatsChange={stats} />);
  await settle();
  expect(mockOverviewLineProps.data.features).toHaveLength(4001);
  expect(mockOverviewLineProps.reportedFeatureCount).toBe(4001);
  const stableOverviewData = mockOverviewLineProps.data;
  expect(mockLineLayerProps).toBeNull();
  expect(stats).toHaveBeenLastCalledWith(expect.objectContaining({ renderedLinks: 4001, overviewLines: true, renderingLinks: false }));

  act(() => mockMap.setZoom(6));
  await settle();
  expect(mockOverviewLineProps.data.features).toHaveLength(4001);
  expect(mockOverviewLineProps.data).toBe(stableOverviewData);
  expect(mockOverviewLineProps.reportedFeatureCount).toBe(4001);
  expect(mockLineLayerProps).toBeNull();

  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} connections={connections.slice(0, 3999)} networkResolution="overlay" performanceMode onRenderStatsChange={stats} />);
  await settle();
  expect(mockLineLayerProps.data.features).toHaveLength(3999);
  expect(stats).toHaveBeenLastCalledWith(expect.objectContaining({ renderedLinks: 3999, overviewLines: false, renderingLinks: false }));
});

test('overlay statistics distinguish off-screen links from invalid routes without creating render loops', async () => {
  const direct = (id, coordinates) => ({ id, from: `${id}-a`, to: `${id}-b`, direct_route: true, coordinates, atlas_network_carrier: 'gas' });
  const connections = [
    direct('inside', [[9.5, 49.5], [10.5, 50.5]]),
    direct('crossing', [[5, 50], [15, 50]]),
    direct('outside', [[-20, 30], [-19, 31]]),
    { id: 'missing', from: 'unknown-a', to: 'unknown-b' },
  ];
  const stats = jest.fn();
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} connections={connections} networkResolution="overlay" onRenderStatsChange={stats} />);
  await settle();
  act(() => mockMap.setView([50, 10], 4));
  await settle();
  expect(stats).toHaveBeenLastCalledWith(expect.objectContaining({ renderedLinks: 2, unmappedLinks: 1, renderingLinks: false, renderError: '' }));
  expect(mockLineLayerProps.data.features.map((feature) => feature.properties.connection.id)).toEqual(['inside', 'crossing']);
  stats.mockClear();
  for (let index = 0; index < 10; index += 1) {
    view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={[...defaults.facilities]} connections={connections} networkResolution="overlay" onRenderStatsChange={stats} />);
    await settle();
  }
  expect(stats).not.toHaveBeenCalled();
  act(() => mockMap.setView([30.5, -19.5], 6));
  await settle();
  expect(stats).toHaveBeenLastCalledWith(expect.objectContaining({ renderedLinks: 1, unmappedLinks: 1, renderingLinks: false, renderError: '' }));
});

test('valid source routes survive missing endpoint markers and loop IDs; coincident geometry remains unmapped', async () => {
  const connections = [
    { id: 'loop', from: 'same-node', to: 'same-node', coordinates: [[9.5, 49.5], [10, 50], [9.5, 49.5]] },
    { id: 'source-route', from: 'missing-a', to: 'missing-b', coordinates: [[9.5, 50], [10.5, 50]] },
    { id: 'coincident', from: 'different-a', to: 'different-b', coordinates: [[10, 50], [10, 50]] },
  ];
  const stats = jest.fn();
  render(<EnhancedLeafletMapWithVoice {...defaults} connections={connections} networkResolution="overlay" onRenderStatsChange={stats} />);
  await settle();
  act(() => mockMap.setView([50, 10], 4));
  await settle();
  expect(mockLineLayerProps.data.features.map((feature) => feature.properties.connection.id)).toEqual(['loop', 'source-route']);
  expect(mockLineLayerProps.data.features[0].geometry.coordinates).toEqual(connections[0].coordinates);
  expect(stats).toHaveBeenLastCalledWith(expect.objectContaining({ renderedLinks: 2, unmappedLinks: 1, renderingLinks: false, renderError: '' }));
});

test('new network links resolve against the new endpoint nodes in the same render', async () => {
  const nodes = (prefix) => [
    { id: `${prefix}-a`, latitude: 50, longitude: 10 },
    { id: `${prefix}-b`, latitude: 50.5, longitude: 10.5 },
  ];
  const links = (prefix) => [{ id: `${prefix}-line`, from: `${prefix}-a`, to: `${prefix}-b` }];
  const stats = jest.fn();
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} facilities={nodes('old')} connections={links('old')} onRenderStatsChange={stats} />);
  await settle();
  act(() => mockMap.setView([50, 10], 4));
  await settle();
  stats.mockClear();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={nodes('new')} connections={links('new')} onRenderStatsChange={stats} />);
  await settle();
  expect(stats.mock.calls.every(([state]) => state.unmappedLinks === 0)).toBe(true);
  expect(mockLineLayerProps.data.features[0].properties.connection.id).toBe('new-line');
});

test('multipart water branches render as one source link without artificial joining segments', async () => {
  const connections = [{ id: 'river', from: 'missing-a', to: 'missing-b', atlas_network_carrier: 'water',
    coordinates: [[0, 0], [0, 0]], coordinate_paths: [
      [[0, 0], [0, 0]], [[9.5, 49.5], [10, 50]], [[10.5, 50], [11, 50.5]],
    ] }];
  const stats = jest.fn();
  render(<EnhancedLeafletMapWithVoice {...defaults} connections={connections} networkResolution="overlay" onRenderStatsChange={stats} />);
  await settle();
  act(() => mockMap.setView([50, 10], 4));
  await settle();
  expect(mockLineLayerProps.data.features).toHaveLength(1);
  const feature = mockLineLayerProps.data.features[0];
  expect(feature.geometry).toEqual({ type: 'MultiLineString', coordinates: connections[0].coordinate_paths.slice(1) });
  expect(feature.properties.midLat).toBe(50);
  expect(feature.properties.midLng).toBe(10);
  expect(stats).toHaveBeenLastCalledWith(expect.objectContaining({ renderedLinks: 1, unmappedLinks: 0, renderError: '' }));
});

test('panning clips multipart branches, restores them on return, and does not mark off-screen branches unmapped', async () => {
  const paths = [[[9.5, 49.5], [10, 50]], [[19.5, 49.5], [20, 50]]];
  const connections = [{ id: 'river', coordinate_paths: paths, atlas_network_carrier: 'water' }];
  const stats = jest.fn();
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} connections={connections} networkResolution="overlay" onRenderStatsChange={stats} />);
  await settle();
  for (const [lng, expected] of [[10, [paths[0]]], [15, []], [20, [paths[1]]], [10, [paths[0]]]]) {
    act(() => mockMap.setView([50, lng], 6));
    await settle();
    if (expected.length) {
      expect(view.getByTestId('network-lines')).toBeDefined();
      expect(mockPendingLineProps.data.features.map(feature => feature.geometry.coordinates)).toEqual([expected]);
    } else {
      expect(view.getByTestId('network-lines')).toBeDefined();
      expect(mockPendingLineProps.data.features).toHaveLength(0);
    }
    expect(stats).toHaveBeenLastCalledWith(expect.objectContaining({ renderedLinks: expected.length ? 1 : 0, unmappedLinks: 0, renderError: '' }));
  }
  expect(connections[0].coordinate_paths).toBe(paths);
  expect(paths).toHaveLength(2);
});

test('filtering all links keeps their owner mounted and commits the empty frame before changing nodes', async () => {
  const initial = {
    facilities: [{ id: 'a', component_type: 'bus', latitude: 50, longitude: 10 },
      { id: 'b', component_type: 'bus', latitude: 50.5, longitude: 10.5 }],
    connections: [{ id: 'link', from: 'a', to: 'b' }],
  };
  const stats = jest.fn();
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} {...initial} onRenderStatsChange={stats} />);
  await settle();
  act(() => mockMap.setView([50, 10], 4));
  await settle();
  const owner = view.getByTestId('network-lines');
  expect(mockPendingLineProps.data.features).toHaveLength(1);
  mockAutoCompleteLines = false;
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} facilities={[initial.facilities[0]]} connections={[]} onRenderStatsChange={stats} />);
  await settle();
  expect(view.getByTestId('network-lines')).toBe(owner);
  expect(mockPendingLineProps.data.features).toHaveLength(0);
  expect(mockPointLayerProps.data.features).toHaveLength(2);
  expect(stats.mock.calls.at(-1)[0]).toMatchObject({ renderingLinks: true, renderedLinks: 1 });
  const empty = mockPendingLineProps;
  act(() => empty.onProgress({ key: empty.dataKey, renderedLinks: 0, renderingLinks: false, renderError: '' }));
  expect(mockPointLayerProps.data.features).toHaveLength(1);
  expect(stats.mock.calls.at(-1)[0]).toMatchObject({ renderingLinks: false, renderedLinks: 0 });
  mockAutoCompleteLines = true;
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} {...initial} onRenderStatsChange={stats} />);
  await settle();
  expect(view.getByTestId('network-lines')).toBe(owner);
  expect(mockPendingLineProps.data.features).toHaveLength(1);
  expect(mockPointLayerProps.data.features).toHaveLength(2);
});

test('pending and failed line replacements retain matching nodes and boundaries; only the latest completed source commits', async () => {
  const snapshot = prefix => ({
    facilities: [
      { id: `${prefix}-a`, component_type: 'bus', latitude: 50, longitude: 10 },
      { id: `${prefix}-b`, component_type: 'bus', latitude: 50.5, longitude: 10.5 },
    ],
    connections: [{ id: 'same-line', from: `${prefix}-a`, to: `${prefix}-b` }],
    geoJsonOverlays: [{ name: `${prefix}-regions.geojson`, feature_collection: {
      type: 'FeatureCollection', features: [{ type: 'Feature', id: prefix, properties: { name: prefix },
        geometry: { type: 'Polygon', coordinates: [[[9, 49], [11, 49], [11, 51], [9, 49]]] } }],
    } }],
  });
  const stats = jest.fn();
  const first = snapshot('first');
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} {...first} onRenderStatsChange={stats} />);
  await settle();
  act(() => mockMap.setView([50, 10], 4));
  await settle();
  const expectFrame = prefix => {
    expect(mockPointLayerProps.data.features.map(feature => feature.properties.facility.id)).toEqual([`${prefix}-a`, `${prefix}-b`]);
    expect(mockBoundaryLayerProps.data.features[0].id).toBe(prefix);
  };
  expectFrame('first');
  mockAutoCompleteLines = false;
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} {...snapshot('obsolete')} onRenderStatsChange={stats} />);
  await settle();
  const obsolete = mockPendingLineProps;
  expectFrame('first');
  expect(stats.mock.calls.at(-1)[0].renderingLinks).toBe(true);
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} {...snapshot('latest')} onRenderStatsChange={stats} />);
  await settle();
  const latest = mockPendingLineProps;
  // All three have equal line geometry/count/style. Source identity matters.
  expect(latest.dataKey).not.toBe(obsolete.dataKey);
  act(() => obsolete.onProgress({ key: obsolete.dataKey, renderedLinks: 1, renderingLinks: false, renderError: '' }));
  expectFrame('first');
  act(() => latest.onProgress({ key: latest.dataKey, renderedLinks: 1, renderingLinks: false, renderError: 'Drawing failed' }));
  expectFrame('first');
  act(() => latest.onProgress({ key: latest.dataKey, renderedLinks: 1, renderingLinks: false, renderError: '' }));
  expectFrame('latest');
});

test('reduced-motion preference applies to Paris, relative commands and map controls without remounting', async () => {
  let reduced = true;
  window.matchMedia = jest.fn(() => ({ matches: reduced }));
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} />);
  await settle();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} viewportCommand={paris} />);
  await settle();
  expect(mockMap.setView).toHaveBeenLastCalledWith([paris.latitude, paris.longitude], 10, { animate: false });
  for (const name of ['Zoom in', 'Zoom out']) {
    act(() => view.getByRole('button', { name, exact: true }).click());
    expect(mockMap.setZoom.mock.calls.at(-1)[1]).toEqual({ animate: false });
  }
  for (const name of ['Fit map to loaded network', 'Reset map to Europe']) {
    act(() => view.getByRole('button', { name, exact: true }).click());
    expect(mockMap.setView.mock.calls.at(-1)[2]).toEqual({ animate: false });
  }
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} viewportCommand={{ id: 'closer', operation: 'zoom_in' }} />);
  await settle();
  expect(mockMap.setZoom.mock.calls.at(-1)[1]).toEqual({ animate: false });
  reduced = false;
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} viewportCommand={{ ...paris, id: 'new-paris' }} />);
  await settle();
  expect(mockMap.setView).toHaveBeenLastCalledWith([paris.latitude, paris.longitude], 10, { animate: true });
});

test('performance mode skips expensive intermediate camera animation while normal maps retain it', async () => {
  window.matchMedia = jest.fn(() => ({ matches: false }));
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} performanceMode />);
  await settle();
  for (const name of ['Zoom in', 'Zoom out']) {
    act(() => view.getByRole('button', { name, exact: true }).click());
    expect(mockMap.setZoom.mock.calls.at(-1)[1]).toEqual({ animate: false });
  }
  act(() => view.getByRole('button', { name: 'Reset map to Europe', exact: true }).click());
  expect(mockMap.setView.mock.calls.at(-1)[2]).toEqual({ animate: false });

  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} />);
  await settle();
  act(() => view.getByRole('button', { name: 'Zoom in', exact: true }).click());
  expect(mockMap.setZoom.mock.calls.at(-1)[1]).toEqual({ animate: true });
});

test('automatic country framing respects reduced motion', async () => {
  window.matchMedia = jest.fn(() => ({ matches: true }));
  render(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled />);
  await settle();
  expect(mockMap.setView.mock.calls.at(-1)[2]).toEqual({ animate: false });
});

test('overview hides count badges but preserves grouped data and reveals counts when zoomed in', async () => {
  const facilities = [{ ...defaults.facilities[0], sameLocationCount: 3 }];
  render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} />);
  act(() => mockMap.setView([48.85, 2.35], 4));
  await settle();
  const iconHtml = () => {
    const feature = mockPointLayerProps.data.features[0];
    expect(feature.properties.facility.sameLocationCount).toBe(3);
    return mockPointLayerProps.pointToLayer(feature, L.latLng(48.85, 2.35)).options.icon.options.html;
  };
  expect(iconHtml()).not.toContain('atlas-node-count');
  act(() => mockMap.setZoom(10));
  await settle();
  expect(iconHtml()).toContain('atlas-node-count');
  expect(iconHtml()).not.toContain('#ef4444');
  act(() => mockMap.setZoom(4));
  await settle();
  expect(iconHtml()).not.toContain('atlas-node-count');
});

test('Paris movement is one-shot through telemetry, Strict Mode, and changed filter/data props', async () => {
  const applied = jest.fn();
  const view = render(<StrictMode><EnhancedLeafletMapWithVoice {...defaults} /></StrictMode>);
  await settle();
  mockMap.setView.mockClear();
  mockMap.stop.mockClear();
  for (let index = 0; index < 30; index += 1) {
    view.rerender(<StrictMode><EnhancedLeafletMapWithVoice
      {...defaults}
      facilities={[...defaults.facilities]}
      geoJsonOverlays={[]}
      viewportCommand={{ ...paris }}
      onViewportCommandApplied={(id) => applied(id)}
      showNodeMarkers={index % 2 === 0}
      showGeographicBoundaries={index % 3 === 0}
    /></StrictMode>);
    await settle();
  }
  expect(mockMap.setView).toHaveBeenCalledTimes(1);
  expect(mockMap.setView).toHaveBeenCalledWith([paris.latitude, paris.longitude], 10, { animate: true });
  expect(mockMap.stop).toHaveBeenCalledTimes(1);
  expect(applied).toHaveBeenCalledTimes(1);
  expect(applied).toHaveBeenCalledWith('paris');
});

test('Fit defaults to the European footprint while Shift-click explicitly fits all overseas assets', async () => {
  const facilities = [...defaults.facilities, { id: 'GF', latitude: 4.92, longitude: -52.33, component_type: 'bus' }];
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} />);
  await settle();
  const button = view.getByRole('button', { name: 'Fit map to loaded network', exact: true });
  fireEvent.click(button);
  expect(mockMap.getBoundsZoom.mock.calls.at(-1)[0].getSouth()).toBe(48.85);
  fireEvent.click(button, { shiftKey: true });
  expect(mockMap.getBoundsZoom.mock.calls.at(-1)[0].getSouth()).toBe(4.92);
  expect(mockMap.getBoundsZoom.mock.calls.at(-1)[0].getWest()).toBe(-52.33);
  expect(facilities).toHaveLength(2);
});

test('manual zoom stays in control and each later relative command moves just one step', async () => {
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} />);
  await settle();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} viewportCommand={paris} />);
  await settle();
  act(() => mockMap.setZoom(9));
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} viewportCommand={{ ...paris }} showNodeMarkers={false} />);
  await settle();
  expect(mockMap.getZoom()).toBe(9);
  mockMap.setZoom.mockClear();
  for (const [id, operation, expected] of [['closer', 'zoom_in', 10], ['wider', 'zoom_out', 9]]) {
    for (let index = 0; index < 10; index += 1) {
      view.rerender(<EnhancedLeafletMapWithVoice {...defaults} viewportCommand={{ id, operation }} geoJsonOverlays={[]} />);
      await settle();
    }
    expect(mockMap.getZoom()).toBe(expected);
  }
  expect(mockMap.setZoom).toHaveBeenCalledTimes(2);
});

test('the parent acknowledgement prevents Paris replay when the map is remounted', async () => {
  const acknowledged = jest.fn();
  function Workspace({ mapKey }) {
    const [pending, setPending] = useState(paris);
    return <EnhancedLeafletMapWithVoice {...defaults} key={mapKey}
      viewportCommand={pending}
      onViewportCommandApplied={(id) => {
        acknowledged(id);
        setPending((command) => clearAppliedViewportCommand(command, id));
      }} />;
  }
  const view = render(<Workspace mapKey="first" />);
  await settle();
  mockMap.setView.mockClear();
  view.rerender(<Workspace mapKey="replacement" />);
  await settle();
  expect(acknowledged).toHaveBeenCalledTimes(1);
  expect(mockMap.setView.mock.calls.some(([center]) => Array.isArray(center) && center[0] === paris.latitude)).toBe(false);
});

test('legacy place focus is acknowledged once and does not fight later user zoom', async () => {
  const acknowledged = jest.fn();
  const location = { latitude: paris.latitude, longitude: paris.longitude, zoom: 10 };
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} />);
  await settle();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} focusLocation={location} onFocusLocationApplied={acknowledged} />);
  await settle();
  act(() => mockMap.setZoom(8));
  for (let index = 0; index < 10; index += 1) {
    view.rerender(<EnhancedLeafletMapWithVoice {...defaults} focusLocation={location}
      onFocusLocationApplied={(value) => acknowledged(value)} facilities={[...defaults.facilities]} />);
    await settle();
  }
  expect(mockMap.getZoom()).toBe(8);
  expect(acknowledged).toHaveBeenCalledTimes(1);
});

test('Paris takes priority over a pending automatic fit when network data finishes loading', async () => {
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled pypsaLoading />);
  await settle();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled pypsaLoading viewportCommand={paris} />);
  await settle();
  expect(mockMap.getZoom()).toBe(10);
  mockMap.setView.mockClear();
  // The command has been acknowledged, then a pending grid/layer request finishes.
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled facilities={[...defaults.facilities]} />);
  await settle();
  expect(mockMap.getZoom()).toBe(10);
  expect(mockMap.setView).not.toHaveBeenCalled();

  // A deliberate geography change can still fit the newly selected country.
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled activeCountryCodes={['BE']}
    facilities={[{ id: 'BE', latitude: 50.85, longitude: 4.35, component_type: 'bus' }]} />);
  await settle();
  expect(mockMap.getZoom()).toBe(6);
  expect(mockMap.setView).toHaveBeenCalledTimes(1);
});

test.each(['Zoom in', 'Zoom out', 'Fit map to loaded network', 'Reset map to Europe'])('%s takes priority over a pending automatic fit', async (buttonName) => {
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled pypsaLoading />);
  await settle();
  act(() => view.getByRole('button', { name: buttonName, exact: true }).click());
  const chosenZoom = mockMap.getZoom();
  mockMap.setView.mockClear();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled />);
  await settle();
  expect(mockMap.getZoom()).toBe(chosenZoom);
  expect(mockMap.setView).not.toHaveBeenCalled();
});

test('explicitly re-enabling automatic framing still fits after a Paris command', async () => {
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} viewportCommand={paris} />);
  await settle();
  expect(mockMap.getZoom()).toBe(10);
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled />);
  await settle();
  expect(mockMap.getZoom()).toBe(6);
});

test('place drill-down also consumes the pending automatic country fit', async () => {
  const location = { latitude: paris.latitude, longitude: paris.longitude, zoom: 10 };
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled pypsaLoading />);
  await settle();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled pypsaLoading focusLocation={location} />);
  await settle();
  mockMap.setView.mockClear();
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} autoZoomEnabled />);
  await settle();
  expect(mockMap.getZoom()).toBe(10);
  expect(mockMap.setView).not.toHaveBeenCalled();
});

test.each([false, true])('capacity tooltips survive layers created during movement (performance mode %s)', async (performanceMode) => {
  const facilities = [...defaults.facilities, { id: 'FR2', latitude: 48.9, longitude: 2.4, component_type: 'bus' }];
  const connections = [{ id: 'line', name: 'Paris <East>', from: 'FR', to: 'FR2', s_nom: 1000, s_max_pu: 0.7, type: 'line', carrier: 'AC' }];
  render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} connections={connections} performanceMode={performanceMode} />);
  await settle();
  act(() => mockMap.setView([paris.latitude, paris.longitude], 10));
  act(() => mockMap.emit('zoomstart'));
  expect(mockLineLayerProps).not.toBeNull();
  const feature = mockLineLayerProps.data.features.find((item) => item.properties?.connection);
  const layer = { on: jest.fn(), bindTooltip: jest.fn() };
  mockLineLayerProps.onEachFeature(feature, layer);
  expect(layer.bindTooltip).toHaveBeenCalledTimes(1);
  const [content, options] = layer.bindTooltip.mock.calls[0];
  expect(typeof content).toBe('function');
  expect(options.pane).toBe('line-capacity-tooltip-pane');
  act(() => { mockMap.emit('zoomend'); jest.advanceTimersByTime(200); });
  expect(content()).toContain('Paris &lt;East&gt;');
  expect(content()).toContain('1,000');
  expect(content()).toContain('700');
});

test('ordinary line clicks select the sidebar rather than the second legacy connection card', async () => {
  const facilities = [{ id: 'one', latitude: 52, longitude: 8 }, { id: 'two', latitude: 52.5, longitude: 8.5 }];
  const connection = { id: 'one-two', from: 'one', to: 'two', fromNode: 'one', toNode: 'two' };
  const legacyClick = jest.fn();
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} mapViewMode="our-model" facilities={facilities} connections={[connection]} onConnectionClick={legacyClick} />);
  await settle();
  const layer = { on: jest.fn(), bindTooltip: jest.fn() };
  mockLineLayerProps.onEachFeature(mockLineLayerProps.data.features[0], layer);
  const click = layer.on.mock.calls.find(([name]) => name === 'click')[1];
  act(() => click({ originalEvent: new MouseEvent('click'), containerPoint: { x: 20, y: 20 } }));
  expect(legacyClick).not.toHaveBeenCalled();
  expect(view.getAllByRole('region', { name: 'inspect panel' })).toHaveLength(1);
  expect(view.getByRole('region', { name: 'inspect panel' }).textContent).toContain('one-two');
});

test('node selection uses the tabbed sidebar, never binds a duplicate asset popup, and retains provisional evidence', async () => {
  const facilities = [{ ...defaults.facilities[0], component_type: 'Load', type: 'Load', carrier: 'electricity',
    provisional_demand: true, annual_energy_gwh: 2.274, p_set: 0.26, spatial_weight: 0.02274 }];
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} />);
  act(() => mockMap.setView([48.85, 2.35], 10));
  await settle();
  const feature = mockPointLayerProps.data.features[0];
  const layer = { on: jest.fn(), bindPopup: jest.fn(), bindTooltip: jest.fn() };
  mockPointLayerProps.onEachFeature(feature, layer);
  expect(layer.bindPopup).not.toHaveBeenCalled();
  const click = layer.on.mock.calls.find(([name]) => name === 'click')[1];
  act(() => click({ originalEvent: new MouseEvent('click') }));
  const sidebar = view.getByRole('region', { name: 'inspect panel' });
  expect(sidebar.textContent).toContain('Provisional estimate, not measured consumption');
  expect(sidebar.textContent).toContain('2.274');
  expect(sidebar.textContent).toContain('Sector/subsector breakdown unavailable');
});

test('popup auto-pan does not re-cull its owning marker, but closing resumes clipping', async () => {
  const facilities = [
    { ...defaults.facilities[0], id: 'near', sourceNetworkFilename: 'base_FR_nuts3.nc' },
    { ...defaults.facilities[0], id: 'edge', longitude: 3.3, sourceNetworkFilename: 'base_FR_nuts3.nc' },
  ];
  render(<EnhancedLeafletMapWithVoice {...defaults} facilities={facilities} />);
  act(() => mockMap.setView([48.85, 2.35], 10));
  await settle();
  const ids = () => mockPointLayerProps.data.features.map((f) => f.id);
  expect(ids()).toEqual(['near', 'edge']);
  act(() => mockMap.emit('popupopen'));
  // Leaflet's auto-pan emits a move, not a user drag or zoom.
  act(() => { mockMap.center = L.latLng(48.85, 1.8); mockMap.emit('moveend'); });
  await settle();
  expect(ids()).toEqual(['near', 'edge']);
  act(() => mockMap.emit('popupclose'));
  await settle();
  expect(ids()).toEqual(['near']);
});

test('returning to EMIL dismisses the inspected asset once without navigating', async () => {
  const visibility = jest.fn();
  mockMap.closePopup = jest.fn(() => mockMap.emit('popupclose'));
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} onPopupVisibilityChange={visibility} popupDismissRequest={0} />);
  await settle();
  act(() => mockMap.emit('popupopen'));
  const moves = mockMap.setView.mock.calls.length;
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} onPopupVisibilityChange={visibility} popupDismissRequest={1} />);
  await settle();
  expect(mockMap.closePopup).toHaveBeenCalledTimes(1);
  expect(visibility).toHaveBeenLastCalledWith(false);
  expect(mockMap.setView).toHaveBeenCalledTimes(moves);
  view.rerender(<EnhancedLeafletMapWithVoice {...defaults} onPopupVisibilityChange={visibility} popupDismissRequest={1} showNodeMarkers={false} />);
  await settle();
  expect(mockMap.closePopup).toHaveBeenCalledTimes(1);
});

test.each(['dragstart', 'zoomstart', 'resize'])('%s dismisses inspected popups before updating point detail', async (event) => {
  mockMap.closePopup = jest.fn();
  render(<EnhancedLeafletMapWithVoice {...defaults} />);
  await settle();
  act(() => mockMap.emit('popupopen'));
  act(() => mockMap.emit(event));
  expect(mockMap.closePopup).toHaveBeenCalledTimes(1);
});

test('live asset popup tabs expose selection and support contained keyboard navigation', () => {
  const root = buildGeoJsonPopupContent({ id: 'ME000', type: 'Load', provisional_demand: true, p_set: 11.415525, annual_energy_gwh: 100 });
  document.body.appendChild(root);
  try {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panel = root.querySelector('[role="tabpanel"]');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
    expect(tabs.every((tab) => tab.getAttribute('aria-controls') === panel.id)).toBe(true);
    const bubbled = jest.fn();
    root.addEventListener('keydown', bubbled);
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
    expect(panel.textContent).toContain('11.415525');
    expect(panel.textContent).toContain('8,760');
    expect(bubbled).not.toHaveBeenCalled();
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.click(tabs[1]);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(panel.textContent).toContain('No cost context');
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { root.remove(); }
});

test('co-located component selection is labelled and replaces the popup with unique tab IDs', () => {
  const root = buildGeoJsonPopupContent({ id: 'bus', sameLocationFacilities: [{ id: 'load', type: 'Load' }] });
  const select = root.querySelector('select');
  expect(select.getAttribute('aria-label')).toBe('Component at this location');
  const oldId = root.querySelector('[role="tabpanel"]').id;
  fireEvent.change(select, { target: { value: '1' } });
  const panel = root.querySelector('[role="tabpanel"]');
  expect(panel.id).not.toBe(oldId);
  const selectedTab = root.querySelector('[aria-selected="true"]');
  expect(selectedTab.textContent).toBe('Overview');
  expect(panel.getAttribute('aria-labelledby')).toBe(selectedTab.id);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('grid-access errors offer retry without presenting unavailable record counts as zero', async () => {
  const onRetry = jest.fn();
  const view = render(<EnhancedLeafletMapWithVoice {...defaults} gridAccess={{
    enabled: true, panelOpen: true, error: 'Could not load records.', onRetry,
    data: { type: 'FeatureCollection', features: [], meta: {} },
  }} />);
  await settle();
  expect(view.getByRole('alert').textContent).toContain('Could not load records');
  expect(view.getByText(/Record counts unavailable/)).toBeDefined();
  expect(view.queryByText('mapped')).toBeNull();
  const movesBefore = mockMap.setView.mock.calls.length;
  fireEvent.click(view.getByRole('button', { name: 'Retry grid-access data' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(mockMap.setView).toHaveBeenCalledTimes(movesBefore);
});
