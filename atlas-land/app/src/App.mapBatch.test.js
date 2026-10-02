import React from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import App from './App';
import * as voiceHook from './hooks/useEmilVoice';

// Exercise the real App/catalogue/parser/agent wiring, not a substitute app.
// Only map rendering is mocked so every published geometry can be inspected.
let mockMapFrames;
let mockMapShouldFail;
jest.mock('./components/EnhancedLeafletMapWithVoice', () => (props) => {
  if (mockMapShouldFail) throw new Error('Map fixture failed');
  mockMapFrames.push(props);
  return <div data-testid="atlas-map" />;
});

const levels = ['bidding_zone', 'ehighway', 'nuts1', 'nuts2', 'nuts3', 'full'];
const catalogue = ['BE', 'FR'].flatMap((country) => levels.map((level) => ({
  filename: `base_${country}_${level}.nc`,
  ...(level === 'full'
    ? { is_full_nodal_network: true, full_country: country }
    : { is_geographic_cluster: true, geographic_country: country, geographic_level: level, geographic_clusters: 2 }),
})));

function parsedNetwork(body) {
  const country = body.filename.split('_')[1];
  const latitude = country === 'BE' || sharedCountryLocation ? 50.85 : 48.85;
  const longitude = country === 'BE' || sharedCountryLocation ? 4.35 : 2.35;
  const scope = body.component_scope;
  const marker = (id, type, carrier, extra = {}) => ({
    id, name: `${country} ${id}`, country, latitude, longitude, type, carrier, ...extra,
  });
  const markers = scope === 'grid'
    ? [marker('bus-a', 'Bus', 'AC'), marker('bus-b', 'Bus', 'AC', { longitude: longitude + 1 })]
    : scope === 'supply'
      ? [marker('solar', 'Generator', 'solar', { bus: 'bus-a', p_nom: 400 })]
      : scope === 'demand'
        ? [marker('load', 'Load', 'electricity', {
          bus: 'bus-a', p_set: 11.4155, annual_energy_gwh: 100,
          demand_template_key: 'residential', provisional_demand: true,
        })] : [];
  return {
    filename: body.filename, component_scope: scope, markers,
    connections: scope === 'grid' ? [{
      id: 'line-a', name: 'line-a', from: 'bus-a', to: 'bus-b', type: 'line', carrier: 'AC', s_nom: 1234,
    }, ...extraGridConnections] : [],
    geojson_overlays: [{ name: 'regions.geojson', feature_collection: {
      type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: country },
        geometry: { type: 'Polygon', coordinates: [[[longitude, latitude], [longitude + 1, latitude], [longitude, latitude + 1], [longitude, latitude]]] },
      }],
    } }],
    demand_templates: { residential: [{ sector: 'residential', subsector: 'heating', annual_energy_gwh: 100 }] },
  };
}

const response = (data, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data, text: async () => JSON.stringify(data) });
const flush = async () => act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
const frame = () => mockMapFrames[mockMapFrames.length - 1];
const geometry = (props = frame()) => ({
  countries: props.activeCountryCodes,
  active: props.activeCountryCode,
  resolution: props.networkResolution,
  nodes: props.facilities.map((f) => [f.sourceCountryCode, f.sourceNetworkFilename, f.id]),
  lines: props.connections.map((c) => [c.sourceCountryCode, c.sourceNetworkFilename, c.id]),
  overlays: props.geoJsonOverlays.map((o) => [o.sourceCountryCode, o.sourceNetworkFilename, o.name]),
});
let originalFetch;
let parseRequests;
let pending;
let holdRequests;
let interpreterPlan;
let interpreterReply;
let holdInterpreter;
let componentInventory;
let extraGridConnections;
let judgeReply;
let judgeReplies;
let sharedCountryLocation;
let compactOverlayCapability;
let holdInitialCatalogue;
let catalogueRequestCount;
let resolveInitialCatalogue;
beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  mockMapFrames = [];
  mockMapShouldFail = false;
  parseRequests = [];
  pending = [];
  holdRequests = false;
  interpreterPlan = null;
  interpreterReply = null;
  holdInterpreter = false;
  componentInventory = null;
  extraGridConnections = [];
  sharedCountryLocation = false;
  compactOverlayCapability = false;
  holdInitialCatalogue = false;
  catalogueRequestCount = 0;
  resolveInitialCatalogue = null;
  judgeReply = { verdict: 'pass', corrections: [], summary: 'Test observation.' };
  judgeReplies = [];
  originalFetch = global.fetch;
  global.fetch = jest.fn(async (url, options = {}) => {
    if (String(url).includes('/api/pypsa/list-files')) {
      catalogueRequestCount += 1;
      if (holdInitialCatalogue && catalogueRequestCount === 1) {
        return new Promise((resolve) => { resolveInitialCatalogue = resolve; });
      }
      return response({ source: 'local', files: catalogue,
        capabilities: { parse_nc_omit_geojson_overlays: compactOverlayCapability } });
    }
    if (String(url).endsWith('/api/pypsa/parse-nc')) {
      const body = JSON.parse(options.body);
      parseRequests.push(body);
      if (holdRequests) {
        // Intentionally ignores abort: late responses must still never commit.
        return new Promise((resolve) => pending.push({ body, signal: options.signal, resolve }));
      }
      const parsed = parsedNetwork(body);
      if (body.include_geojson_overlays === false) parsed.geojson_overlays = [];
      if (componentInventory && body.component_scope === 'demand') {
        if (!componentInventory.loaded) parsed.markers = [];
        parsed.demand_inventory = componentInventory;
      }
      return response(parsed);
    }
    if (String(url).endsWith('/api/map-agent/interpret')) {
      if (holdInterpreter) return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      });
      return response(interpreterReply || (interpreterPlan ? { provider: 'test', confidence: 0.99, actions: interpreterPlan } : {}));
    }
    if (String(url).endsWith('/api/map-agent/judge')) return response({ confidence: 0.99, ...(judgeReplies.shift() || judgeReply) });
    if (/\/api\/atlas\/(gas|water|liquids|logistics)\/status$/.test(String(url))) return response({ available: true, countries: ['BE', 'FR'] });
    if (/\/api\/atlas\/(gas|water|liquids|logistics)\/network\?/.test(String(url))) return response({ facilities: [], connections: [] });
    return response({ ready: true, success: true, status: 'healthy', countries: [], files: [], networks: [], data: [] });
  });
});
afterEach(() => {
  cleanup();
  catalogue.length = 12;
  global.fetch = originalFetch;
  jest.useRealTimers();
});

async function loadCountries(countries = ['BE', 'FR']) {
  const view = render(<App />);
  await flush();
  const geography = view.getByRole('button', { name: /Geography Domain/ });
  if (geography.getAttribute('aria-expanded') === 'false') fireEvent.click(geography);
  for (const country of countries) {
    fireEvent.change(view.getByRole('combobox', { name: 'Add country network' }), { target: { value: country } });
    await flush();
  }
  expect(frame().activeCountryCodes).toEqual(countries);
  expect(frame().networkResolution).toBe('nuts3');
  return view;
}

test('Select all loads every cached country as one parallel batch', async () => {
  const view = render(<App />);
  await flush();
  const geography = view.getByRole('button', { name: /Geography Domain/ });
  if (geography.getAttribute('aria-expanded') === 'false') fireEvent.click(geography);
  fireEvent.click(view.getByRole('button', { name: 'Select all country networks' }));
  await flush();

  expect(parseRequests.map(({ filename, component_scope }) => [filename, component_scope])).toEqual([
    ['base_BE_bidding_zone.nc', 'grid'],
    ['base_FR_bidding_zone.nc', 'grid'],
  ]);
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().networkResolution).toBe('bidding_zone');
  expect(view.getByRole('button', { name: 'Select all country networks' }).disabled).toBe(true);
  expect(view.getByRole('button', { name: 'Select all country networks' }).textContent).toContain('All selected');
});
async function resolveCountry(country, ok = true, scope = 'grid') {
  const request = pending.find((p) => p.body.filename.startsWith(`base_${country}_`) && p.body.component_scope === scope && !p.resolved);
  expect(request).toBeDefined();
  request.resolved = true;
  request.resolve(response(ok ? parsedNetwork(request.body) : { error: 'Test source unavailable' }, ok));
  await flush();
}

test('mixed TSO rings publish per-country resolutions as one complete map', async () => {
  const view = await loadCountries(['BE']);
  parseRequests = [];
  fireEvent.click(view.getByRole('button', { name: /mixed tso rings/i }));
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Build mixed view' })); });
  await flush();

  expect(parseRequests.map(({ filename, component_scope }) => [filename, component_scope])).toEqual([
    ['base_BE_full.nc', 'grid'],
    ['base_FR_nuts3.nc', 'grid'],
  ]);
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().activeCountryCode).toBe('BE');
  expect(frame().networkResolution).toBe('mixed');
  expect(view.getAllByText('Mixed TSO').length).toBeGreaterThan(0);
  expect(view.getByRole('button', { name: 'Belgium' }).getAttribute('title')).toContain('Nodal');
  expect(view.getByRole('button', { name: 'France' }).getAttribute('title')).toContain('NUTS3');
});

test('mixed TSO controls can place two countries in the focus tier', async () => {
  const view = await loadCountries(['BE']);
  parseRequests = [];
  fireEvent.click(view.getByRole('button', { name: /mixed tso rings/i }));
  fireEvent.click(view.getByRole('checkbox', { name: 'Focus France' }));
  fireEvent.change(view.getByRole('combobox', { name: 'Mixed TSO extent' }), { target: { value: 'full' } });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Build mixed view' })); });
  await flush();
  expect(parseRequests.map(({ filename }) => filename)).toEqual(['base_BE_full.nc', 'base_FR_full.nc']);
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().networkResolution).toBe('mixed');
});

test('mixed TSO regions replace member-country markers only in the map projection', async () => {
  catalogue.push(...['DE', 'NL'].flatMap((country) => levels.map((level) => ({
    filename: `base_${country}_${level}.nc`,
    ...(level === 'full'
      ? { is_full_nodal_network: true, full_country: country }
      : { is_geographic_cluster: true, geographic_country: country, geographic_level: level, geographic_clusters: 2 }),
  }))));
  const view = await loadCountries(['DE']);
  fireEvent.click(view.getByRole('button', { name: /mixed tso rings/i }));
  fireEvent.click(view.getByText('Aggregate countries into regions (0)'));
  fireEvent.change(view.getByRole('textbox', { name: 'Region name' }), { target: { value: 'Lowlands' } });
  fireEvent.click(view.getByRole('checkbox', { name: 'Add Belgium to region' }));
  fireEvent.click(view.getByRole('checkbox', { name: 'Add Netherlands to region' }));
  fireEvent.click(view.getByRole('button', { name: 'Add region' }));
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Build mixed view' })); });
  await flush();
  expect(frame().activeCountryCodes).toEqual(['DE', 'BE', 'FR', 'NL']);
  expect(frame().facilities.some(({ id }) => id === 'atlas-region:region-1')).toBe(true);
  expect(frame().facilities.some(({ id, sourceCountryCode, component_type }) => (
    ['BE', 'NL'].includes(sourceCountryCode) && component_type === 'Bus'
    && !String(id).startsWith('atlas-region:')
  ))).toBe(false);
});
async function send(view, text) {
  if (!view.queryByRole('textbox', { name: 'Message EMIL' })) fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  fireEvent.change(view.getByRole('textbox', { name: 'Message EMIL' }), { target: { value: text } });
  fireEvent.click(view.getByRole('button', { name: 'Send assistant message' }));
  await flush();
}

test.each([
  { network_carrier: 'gas' },
  { network_carriers: ['electricity', 'gas'] },
])('methane overlay inherits Belgium instead of remembered France: %j', async params => {
  window.localStorage.setItem('atlas-network-overlay-carrier-filters', JSON.stringify({ gas: { countries: ['FR'], domains: ['Grid'] } }));
  const requests = [];
  mockOverlayDomainSource('gas', requests);
  const view = await loadCountries(['BE']);
  const power = geometry();
  interpreterPlan = [{ intent: 'set_network_overlay', params: { visible: true, ...params } }];
  await send(view, 'overlay the methane network');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(frame().facilities.filter(asset => asset.atlas_network_carrier === 'gas').map(asset => asset.country_code)).toEqual(['BE']);
  expect(frame().facilities.filter(asset => asset.atlas_network_carrier === 'electricity').map(asset => [asset.sourceCountryCode, asset.sourceNetworkFilename, asset.id])).toEqual(power.nodes);
  const audits = global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/map-agent/judge')).map(([, options]) => JSON.parse(options.body));
  expect(audits[audits.length - 1].afterContext.overlayCarrierScopes.gas.countries).toEqual(['BE']);
});

test.each([false, true])('Portugal methane overlay preserves the mixed electricity sequence (judge repair=%s)', async repair => {
  catalogue.push(...['ES', 'PT'].flatMap(country => levels.map(level => ({
    filename: `base_${country}_${level}.nc`,
    ...(level === 'full' ? { is_full_nodal_network: true, full_country: country }
      : { is_geographic_cluster: true, geographic_country: country, geographic_level: level, geographic_clusters: 2 }),
  }))));
  const requests = [];
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => String(url).endsWith('/api/atlas/gas/status')
    ? Promise.resolve(response({ available: true, countries: ['ES', 'FR', 'PT'] })) : normalFetch(url, options));
  mockOverlayDomainSource('gas', requests);
  const view = render(<App />);
  await flush();
  for (const [text, intent, params] of [
    ['load spain', 'load_country', { countries: ['ES'], resolution: 'nuts3', network_carrier: 'electricity' }],
    ['increase the full granularity', 'set_network_resolution', { resolution: 'full' }],
    ['add france at Nut1 level', 'add_country', { countries: ['FR'], resolution: 'nuts1' }],
    ['add portugal add nuts3 level', 'add_country', { countries: ['PT'], resolution: 'nuts3' }],
    ['change france to bz level', 'add_country', { countries: ['FR'], resolution: 'bidding_zone' }],
  ]) {
    interpreterPlan = [{ intent, params }];
    await send(view, text);
    act(() => jest.advanceTimersByTime(250));
    await flush();
  }
  const powerNodes = frame().facilities.map(asset => [asset.id, asset.sourceNetworkFilename]);
  const powerLines = frame().connections.map(line => [line.id, line.sourceNetworkFilename]);
  const parsesBeforeOverlay = parseRequests.length;
  const overlay = { intent: 'set_network_overlay', params: {
    visible: true, network_carrier: 'gas', countries: ['PT'], layers: ['Grid'],
  } };
  interpreterPlan = [repair ? { intent: 'set_network_carrier', params: { network_carrier: 'gas' } } : overlay];
  judgeReplies = repair ? [
    { verdict: 'repair', summary: 'Methane is standalone; add it over Portugal.', corrections: [overlay] },
    { verdict: 'pass', summary: 'Portugal methane overlays the unchanged electricity networks.', corrections: [] },
  ] : [{ verdict: 'pass', summary: 'Portugal methane overlays the unchanged electricity networks.', corrections: [] }];
  await send(view, 'show me the methane overlay in portugal');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(frame().facilities.filter(asset => asset.atlas_network_carrier === 'electricity')
    .map(asset => [asset.id, asset.sourceNetworkFilename])).toEqual(powerNodes);
  expect(frame().connections.filter(line => line.atlas_network_carrier === 'electricity')
    .map(line => [line.id, line.sourceNetworkFilename])).toEqual(powerLines);
  expect(frame().facilities.filter(asset => asset.atlas_network_carrier === 'gas')
    .map(asset => asset.country_code)).toEqual(['PT']);
  expect(parseRequests).toHaveLength(parsesBeforeOverlay);
  const audits = global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/map-agent/judge'))
    .map(([, options]) => JSON.parse(options.body)).filter(body => body.message === 'show me the methane overlay in portugal');
  expect(audits).toHaveLength(repair ? 2 : 1);
  expect(audits[audits.length - 1].afterContext).toMatchObject({
    networkOverlayMode: true, overlayNetworkCarriers: ['electricity', 'gas'],
    networkResolutionByCountry: { ES: 'full', FR: 'bidding_zone', PT: 'nuts3' },
    overlayCarrierScopes: { gas: { countries: ['PT'], domains: ['Grid'] } },
  });
  expect(view.getByRole('log').textContent).toContain('Verified — Portugal methane overlays');
});

test('explicit France land scope stays independent from the network geography', async () => {
  const view = await loadCountries(['BE', 'FR']);
  const before = geometry();
  interpreterPlan = [{ intent: 'set_land_constraints', params: {
    visible: true, countries: ['FR'], country_mode: 'replace',
  } }];
  await send(view, 'add the land overlay in france');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(frame().landConstraints.countries).toEqual(['FR']);
  expect(frame().landConstraints.followMapCountries).toBe(false);
  expect(geometry()).toEqual(before);
  interpreterPlan = [{ intent: 'load_country', params: { countries: ['BE'] } }];
  await send(view, 'show Belgium');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(frame().activeCountryCodes).toEqual(['BE']);
  expect(frame().landConstraints.countries).toEqual(['FR']);
  act(() => frame().onLandConstraintsChange({ followMapCountries: true }));
  await flush();
  expect(frame().landConstraints.countries).toEqual(['BE']);
});

test('ordinary camera telemetry updates live context without rerendering the application shell', async () => {
  await loadCountries(['BE']);
  const framesBeforeCameraMove = mockMapFrames.length;
  act(() => frame().onMapViewChange({ lat: 48.8566, lng: 2.3522, zoom: 8 }));
  await flush();
  expect(mockMapFrames).toHaveLength(framesBeforeCameraMove);
});

test('saved region history stays off the startup path and is cached after opening the workflow', async () => {
  const regionListRequests = () => global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/pypsa/simulate-region/list'));
  const view = await loadCountries(['BE']);
  expect(regionListRequests()).toHaveLength(0);

  fireEvent.click(view.getByRole('button', { name: /ATLAS DOMAIN Operations Domain/i }));
  fireEvent.click(view.getByRole('button', { name: 'Solve current map region' }));
  await flush();
  expect(regionListRequests()).toHaveLength(1);

  fireEvent.click(view.getByRole('button', { name: 'Close region solve panel' }));
  fireEvent.click(view.getByRole('button', { name: 'Solve current map region' }));
  await flush();
  expect(regionListRequests()).toHaveLength(1);
});

test('optional land and grid-access services stay off the startup path until enabled', async () => {
  render(<App />);
  await flush();
  const statusRequests = (service) => global.fetch.mock.calls.filter(([url]) => (
    String(url).endsWith(`/api/atlas/${service}/status`)
  ));

  expect(statusRequests('land')).toHaveLength(0);
  expect(statusRequests('grid-access')).toHaveLength(0);

  act(() => frame().onLandConstraintsChange({ enabled: true, panelOpen: true }));
  await flush();
  expect(statusRequests('land')).toHaveLength(1);
  expect(statusRequests('grid-access')).toHaveLength(0);

  act(() => frame().onGridAccessChange({ enabled: true, panelOpen: true }));
  await flush();
  expect(statusRequests('land')).toHaveLength(1);
  expect(statusRequests('grid-access')).toHaveLength(1);
});

test('the agent reports the freshly fetched saved region history', async () => {
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => {
    if (String(url).endsWith('/api/pypsa/simulate-region/list')) {
      return Promise.resolve(response({ runs: [{
        dirname: 'region_saved_france-paris-100km', granularity_prefix: 'pypsa', modified: '2026-09-07T00:00:00Z',
      }] }));
    }
    return normalFetch(url, options);
  });
  const view = await loadCountries(['BE']);
  interpreterPlan = [{ intent: 'list_saved_regions', params: {} }];

  await send(view, 'List saved region runs');
  act(() => jest.advanceTimersByTime(250));
  await flush();

  expect(view.getByRole('log').textContent).toContain('1. region_saved_france-paris-100km');
});

test.each([{ countries: ['BE', 'FR'] }, { country: 'Belgium and France' }])('model multi-country fields load one complete map: %j', async (countries) => {
  const view = await loadCountries(['BE']);
  parseRequests = [];
  interpreterPlan = [{ intent: 'load_country', params: { ...countries, resolution: 'nuts2', layers: ['Grid', 'Supply'] } }];
  await send(view, 'Show Belgium and France at NUTS2 with grid and supply');
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().networkResolution).toBe('nuts2');
  expect(frame().facilities.filter((node) => node.atlas_domain === 'Supply')).toHaveLength(2);
  expect(parseRequests).toHaveLength(4);
  expect(parseRequests.every((request) => request.filename.endsWith('_nuts2.nc'))).toBe(true);
});

test('compound add and resolution stages only final layers and publishes all target countries together', async () => {
  const view = await loadCountries(['BE']);
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer' }));
  await flush();
  parseRequests = [];
  mockMapFrames = [];
  interpreterPlan = [{ intent: 'add_country', params: { countries: ['FR'], resolution: 'nuts2', layers: ['Grid'] } }];
  await send(view, 'Add France at NUTS2, keep Belgium and show only grid');
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().networkResolution).toBe('nuts2');
  expect(view.getByRole('button', { name: 'Supply map layer' }).getAttribute('aria-pressed')).toBe('false');
  expect(parseRequests).toHaveLength(2);
  expect(parseRequests.every((request) => request.component_scope === 'grid')).toBe(true);
  expect(mockMapFrames.filter((props) => props.networkResolution === 'nuts2')
    .every((props) => props.activeCountryCodes.join(',') === 'BE,FR')).toBe(true);
});

test('France-only upgrade never publishes a global intermediate resolution or moves the camera', async () => {
  const view = render(<App />);
  await flush();
  fireEvent.click(view.getByRole('button', { name: /Geography Domain/ }));
  fireEvent.click(view.getByRole('button', { name: 'Select all country networks' }));
  await flush();
  const before = geometry();
  const camera = frame().viewportCommand;
  parseRequests = [];
  mockMapFrames = [];
  holdRequests = true;
  interpreterPlan = [
    { intent: 'set_network_resolution', params: { resolution: 'full' } },
    { intent: 'add_country', params: { countries: ['FR'], resolution: 'full' } },
  ];
  await send(view, 'Update only France to full granularity');
  expect(parseRequests.map(request => request.filename)).toEqual(['base_FR_full.nc']);
  expect(geometry()).toEqual(before);
  await resolveCountry('FR');
  expect(frame().viewportCommand).toBe(camera);
  expect(mockMapFrames.every(props => props.facilities.filter(node => node.sourceCountryCode === 'BE')
    .every(node => node.sourceNetworkFilename === 'base_BE_bidding_zone.nc'))).toBe(true);
  expect(frame().facilities.some(node => node.sourceCountryCode === 'FR' && node.sourceNetworkFilename === 'base_FR_full.nc')).toBe(true);
});

test('failed compound geography keeps the old resolution, countries and visible layers', async () => {
  const view = await loadCountries(['BE']);
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer' }));
  await flush();
  const before = geometry();
  mockMapFrames = [];
  holdRequests = true;
  interpreterPlan = [{ intent: 'add_country', params: { countries: ['FR'], resolution: 'nuts2', layers: ['Grid'] } }];
  await send(view, 'Add France at NUTS2 and show only grid');
  expect(pending).toHaveLength(2);
  await resolveCountry('BE');
  expect(geometry()).toEqual(before);
  await resolveCountry('FR', false);
  expect(geometry()).toEqual(before);
  expect(mockMapFrames.every((props) => JSON.stringify(geometry(props)) === JSON.stringify(before))).toBe(true);
  expect(view.getByRole('button', { name: 'Supply map layer' }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('combobox', { name: 'Add country network' }).disabled).toBe(false);
});

test.each(['pass', 'repair'])('judge checks corrected geography again; final %s controls the success claim', async (verdict) => {
  const view = await loadCountries(['BE']);
  interpreterPlan = [{ intent: 'load_country', params: { country: 'BE', resolution: 'nuts3', layers: ['Grid'] } }];
  judgeReplies = [
    { verdict: 'repair', summary: 'France is missing.', corrections: [{ intent: 'add_country', params: { countries: ['FR'], resolution: 'nuts3', layers: ['Grid', 'Supply'] } }] },
    { verdict, summary: verdict === 'pass' ? 'Both countries and layers match.' : 'Mismatch remains.', corrections: verdict === 'repair' ? [{ intent: 'remove_country', params: { country: 'BE' } }] : [] },
  ];
  await send(view, 'Show Belgium and France with grid and supply');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  act(() => jest.advanceTimersByTime(250));
  await flush();
  const audits = global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/map-agent/judge')).map(([, options]) => JSON.parse(options.body));
  expect(audits).toHaveLength(2);
  expect(audits[0].afterContext.loadedCountryCodes).toEqual(['BE']);
  expect(audits[1].afterContext.loadedCountryCodes).toEqual(['BE', 'FR']);
  expect(audits[1].afterContext.visibleMapLayers).toEqual(['Grid', 'Supply']);
  expect(frame().facilities.filter((node) => node.atlas_domain === 'Supply')).toHaveLength(2);
  expect(view.getByRole('log').textContent).toContain(verdict === 'pass' ? 'Verified — Both countries' : 'Not verified — Mismatch remains.');
  expect(view.getByRole('log').textContent).not.toContain('Checked and corrected');
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']); // No second repair loop.
});

test.each([0.1, true, '0.99', null, 2])('judge confidence %j cannot certify or trigger corrections', async (confidence) => {
  const view = await loadCountries(['BE']);
  interpreterPlan = [{ intent: 'set_map_layers', params: { layers: ['Grid'], mode: 'replace' } }];
  judgeReply = { verdict: 'repair', confidence, summary: 'Untrusted success claim.', corrections: [
    { intent: 'remove_country', params: { countries: ['BE'] } },
  ] };
  await send(view, 'Show grid');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(frame().activeCountryCodes).toEqual(['BE']);
  expect(view.getByRole('log').textContent).toContain('Verification could not complete');
  expect(view.getByRole('log').textContent).not.toContain('Verified —');
});

test('invalid country list cannot partially replace the map or start a legacy build', async () => {
  const view = await loadCountries(['BE']);
  const before = geometry();
  parseRequests = [];
  global.fetch.mockClear();
  interpreterPlan = [{ intent: 'load_country', params: { countries: ['FR', 'Atlantis'], resolution: 'nuts2' } }];
  await send(view, 'Show France and Atlantis');
  expect(frame().activeCountryCodes).toEqual(['BE']);
  expect(geometry()).toEqual(before);
  expect(parseRequests).toHaveLength(0);
  expect(global.fetch.mock.calls.some(([url]) => /build-network|solve-network/.test(String(url)))).toBe(false);
});

test('judge network timeout releases the assistant without claiming verification', async () => {
  const view = await loadCountries(['BE']);
  const normalFetch = global.fetch;
  let judgeSignal;
  global.fetch = jest.fn((url, options) => {
    if (!String(url).endsWith('/api/map-agent/judge')) return normalFetch(url, options);
    judgeSignal = options.signal;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Test timeout'))));
  });
  interpreterPlan = [{ intent: 'set_map_layers', params: { layers: ['Grid'], mode: 'replace' } }];
  await send(view, 'Show grid');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(judgeSignal.aborted).toBe(false);
  act(() => jest.advanceTimersByTime(30000));
  await flush();
  expect(judgeSignal.aborted).toBe(true);
  expect(view.getByRole('log').textContent).toContain('Verification could not complete');
  expect(view.getByRole('textbox', { name: 'Message EMIL' }).disabled).toBe(false);
  expect(frame().activeCountryCodes).toEqual(['BE']);
});

test('missing demand weights are shown as unavailable, not as zero demand', async () => {
  const view = await loadCountries();
  componentInventory = { loaded: false, reason: 'Demand weights have not been built for this network' };
  fireEvent.click(view.getByRole('button', { name: 'Demand map layer' }));
  await flush();
  expect(view.getByRole('button', { name: 'Demand map layer' }).textContent).toContain('No data');
  expect(view.getByText(/Demand data unavailable for 2 of 2 selected countries/).textContent).toContain('Missing data is not zero demand');
  fireEvent.click(view.getByRole('button', { name: 'Demand map layer' }));
  await flush();
  expect(view.queryByText(/Demand data unavailable/)).toBeNull();
});

test('grid-access filter changes reject stale replies, expose retry and preserve the electricity map', async () => {
  const baseFetch = global.fetch;
  const queueRequests = [];
  global.fetch = jest.fn((url, options) => String(url).includes('/grid-access/map?')
    ? new Promise((resolve) => queueRequests.push({ url, signal: options.signal, resolve }))
    : baseFetch(url, options));
  await loadCountries(['FR']);
  const before = geometry();
  act(() => frame().onGridAccessChange({ enabled: true }));
  await flush();
  expect(queueRequests[0].url).toContain('countries=FR');
  const queueData = (id) => ({ type: 'FeatureCollection', features: [{ id }], meta: {} });
  queueRequests[0].resolve(response(queueData('old')));
  await flush();
  expect(frame().gridAccess.data.features[0].id).toBe('old');
  act(() => frame().onGridAccessChange({ metric: 'available_mw' }));
  await flush();
  expect(frame().gridAccess.data.features).toEqual([]);
  act(() => frame().onGridAccessChange({ metric: 'queued_mw' }));
  await flush();
  queueRequests[2].resolve(response({ error: 'unavailable' }, false));
  await flush();
  queueRequests[1].resolve(response(queueData('late')));
  await flush();
  expect(frame().gridAccess.data.features).toEqual([]);
  expect(frame().gridAccess.error).toContain('retry');
  act(() => frame().gridAccess.onRetry());
  await flush();
  expect(queueRequests[3].url).toContain('metric=queued_mw');
  queueRequests[3].resolve(response(queueData('current')));
  await flush();
  expect(frame().gridAccess.data.features[0].id).toBe('current');
  expect(frame().gridAccess.error).toBe('');
  expect(geometry()).toEqual(before);
  expect(parseRequests).toHaveLength(1);
});

test('provisional demand and missing sector shares are distinct from absent total demand', async () => {
  const view = await loadCountries();
  componentInventory = { loaded: true, provisional: true, annual_demand_gwh_per_country: 100,
    countries: { BE: { composition_loaded: false }, FR: { composition_loaded: true } } };
  fireEvent.click(view.getByRole('button', { name: 'Demand map layer' }));
  await flush();
  expect(view.getByRole('button', { name: 'Demand map layer' }).textContent).not.toContain('No data');
  expect(view.getByText(/Provisional electricity demand, not measured consumption/).textContent).toContain('100 GWh per country per year');
  expect(view.getByText(/Sector\/subsector breakdown unavailable for Belgium/).textContent).not.toContain('France');
  expect(view.queryByText(/Demand data unavailable/)).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Demand map layer' }));
  await flush();
  expect(view.queryByText(/Provisional electricity demand, not measured consumption/)).toBeNull();
  expect(view.queryByText(/Sector\/subsector breakdown unavailable for Belgium/)).toBeNull();
});

test('an HTTP 200 partial component failure does not replace the committed map', async () => {
  const view = await loadCountries();
  const before = geometry();
  componentInventory = { loaded: false, error: 'Failed to read weights' };
  fireEvent.click(view.getByRole('button', { name: 'Demand map layer' }));
  await flush();
  expect(geometry()).toEqual(before);
  expect(view.getByRole('button', { name: 'Demand map layer' }).getAttribute('aria-pressed')).toBe('false');
  expect(view.getByRole('combobox', { name: 'Add country network' }).disabled).toBe(false);
});

test('manual resolution changes stage in parallel and publish one consistent map in original country order', async () => {
  const view = await loadCountries();
  fireEvent.click(view.getByRole('button', { name: 'Belgium', exact: true }));
  await flush();
  const before = geometry();
  mockMapFrames = [];
  holdRequests = true;
  fireEvent.click(view.getByRole('button', { name: 'NUTS2', exact: true }));
  await flush();
  expect(pending).toHaveLength(2);
  expect(view.getByRole('combobox', { name: 'Add country network' }).disabled).toBe(true);
  expect(view.getByRole('slider', { name: 'Network resolution' }).value).toBe('3');
  expect(view.getByRole('slider', { name: 'Network resolution' }).getAttribute('aria-valuetext')).toBe('NUTS2');
  expect(view.getByText('Switching to NUTS2…')).toBeDefined();
  await resolveCountry('FR');
  expect(mockMapFrames.every((props) => JSON.stringify(geometry(props)) === JSON.stringify(before))).toBe(true);
  await resolveCountry('BE');
  const after = geometry();
  expect(after.countries).toEqual(['BE', 'FR']);
  expect(after.active).toBe('BE');
  expect(after.resolution).toBe('nuts2');
  expect(view.getByRole('slider', { name: 'Network resolution' }).getAttribute('aria-valuetext')).toBe('NUTS2');
  expect(after.nodes.every(([, filename]) => filename.endsWith('_nuts2.nc'))).toBe(true);
  expect(after.lines).toHaveLength(2);
  expect(after.overlays).toHaveLength(2);
  expect(frame().connections.every((line) => line.s_nom === 1234)).toBe(true);
  expect(new Set(mockMapFrames.map((props) => JSON.stringify(geometry(props))))).toEqual(new Set([JSON.stringify(before), JSON.stringify(after)]));
  const chips = within(view.getByLabelText('Loaded countries')).getAllByRole('button').map((b) => b.textContent).filter(Boolean);
  expect(chips).toEqual(['Belgium', 'France']);
  expect(view.getByRole('combobox', { name: 'Add country network' }).disabled).toBe(false);
});

test('a rapid resolution slider drag loads only its final snapped level', async () => {
  const view = await loadCountries();
  parseRequests = [];
  const slider = view.getByRole('slider', { name: 'Network resolution' });

  fireEvent.change(slider, { target: { value: '3' } });
  fireEvent.change(slider, { target: { value: '2' } });
  fireEvent.change(slider, { target: { value: '0' } });

  expect(slider.value).toBe('0');
  expect(slider.getAttribute('aria-valuetext')).toBe('Bidding zone');
  expect(view.getByText('Switching to Bidding zone…')).toBeDefined();
  expect(parseRequests).toHaveLength(0);

  await act(async () => { jest.advanceTimersByTime(179); });
  expect(parseRequests).toHaveLength(0);
  await act(async () => { jest.advanceTimersByTime(1); });
  await flush();

  expect(parseRequests.map(({ filename, component_scope }) => [filename, component_scope])).toEqual([
    ['base_BE_bidding_zone.nc', 'grid'],
    ['base_FR_bidding_zone.nc', 'grid'],
  ]);
  expect(frame().networkResolution).toBe('bidding_zone');
  expect(slider.value).toBe('0');
  expect(slider.getAttribute('aria-valuetext')).toBe('Bidding zone');
});

test('one failed country keeps all old geometry and labels, aborts peers and allows retry', async () => {
  const view = await loadCountries();
  const before = geometry();
  holdRequests = true;
  fireEvent.click(view.getByRole('button', { name: 'NUTS2', exact: true }));
  await flush();
  await resolveCountry('FR', false);
  expect(pending.every((request) => request.signal.aborted)).toBe(true);
  expect(geometry()).toEqual(before);
  expect(view.getByText(/Test source unavailable/).textContent).toContain('previous map has been kept');
  expect(view.getByRole('combobox', { name: 'Add country network' }).disabled).toBe(false);
  await resolveCountry('BE');
  expect(geometry()).toEqual(before);
  holdRequests = false;
  fireEvent.click(view.getByRole('button', { name: 'NUTS2', exact: true }));
  await flush();
  expect(frame().networkResolution).toBe('nuts2');
  expect(view.queryByText(/Test source unavailable/)).toBeNull();
});

test('cancellation releases controls and late replies cannot overwrite a subsequent successful switch', async () => {
  const view = await loadCountries();
  const before = geometry();
  holdRequests = true;
  fireEvent.click(view.getByRole('button', { name: 'NUTS2', exact: true }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Cancel network update' }));
  await flush();
  expect(geometry()).toEqual(before);
  expect(pending.every((request) => request.signal.aborted)).toBe(true);
  holdRequests = false;
  fireEvent.click(view.getByRole('button', { name: 'Bidding', exact: true }));
  await flush();
  const after = geometry();
  expect(after.resolution).toBe('bidding_zone');
  await resolveCountry('BE');
  await resolveCountry('FR');
  expect(geometry()).toEqual(after);
  expect(view.queryByRole('button', { name: 'Cancel network update' })).toBeNull();
});

test('EMIL reports dataset progress and cancellation stops subsequent actions and judge retries', async () => {
  const view = await loadCountries();
  const before = geometry();
  holdRequests = true;
  interpreterPlan = [
    { intent: 'load_all_countries', params: { resolution: 'nuts2', layers: ['Grid'] } },
    { intent: 'set_map_layers', params: { mode: 'show', layers: ['Supply'] } },
  ];
  await send(view, 'Change all countries to NUTS2 then add Supply');
  const assistant = within(view.getByRole('region', { name: 'Map assistant' }));
  expect(assistant.getByRole('progressbar', { name: 'Network datasets loaded' }).getAttribute('value')).toBe('0');
  expect(assistant.getByRole('progressbar').getAttribute('max')).toBe('2');
  await resolveCountry('BE');
  expect(assistant.getByRole('progressbar').getAttribute('value')).toBe('1');
  expect(geometry()).toEqual(before);
  fireEvent.click(assistant.getByRole('button', { name: 'Cancel EMIL network update' }));
  await flush();
  expect(assistant.queryByRole('progressbar')).toBeNull();
  expect(assistant.getByText(/Network update cancelled. No further actions/)).toBeDefined();
  expect(global.fetch.mock.calls.some(([url]) => String(url).endsWith('/api/map-agent/judge'))).toBe(false);
  expect(parseRequests.some((request) => request.component_scope === 'supply')).toBe(false);
  await resolveCountry('FR');
  expect(geometry()).toEqual(before);
  expect(view.queryByRole('button', { name: 'Cancel pending network load' })).toBeNull();
  expect(view.getByRole('button', { name: 'NUTS2', exact: true }).disabled).toBe(false);
});

test('a cancelled judge correction cannot continue to later corrections or announce success', async () => {
  const view = await loadCountries();
  const before = geometry();
  interpreterPlan = [{ intent: 'set_map_layers', params: { mode: 'show', layers: ['Grid'] } }];
  judgeReply = { verdict: 'repair', summary: 'Test repair.', corrections: [
    { intent: 'load_all_countries', params: { resolution: 'nuts2', layers: ['Grid'] } },
    { intent: 'set_map_layers', params: { mode: 'show', layers: ['Supply'] } },
  ] };
  holdRequests = true;
  await send(view, 'Show grid');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Cancel EMIL network update' }));
  await flush();
  expect(view.getByText(/Network update cancelled. No further actions/)).toBeDefined();
  expect(view.queryByText(/Checked and corrected/)).toBeNull();
  expect(parseRequests.some((request) => request.component_scope === 'supply')).toBe(false);
  await resolveCountry('BE');
  await resolveCountry('FR');
  expect(geometry()).toEqual(before);
});

test('visible supply and demand reload at the new resolution, retain source metadata and do not publish early', async () => {
  const view = await loadCountries();
  for (const domain of ['Supply', 'Demand']) {
    fireEvent.click(view.getByRole('button', { name: `${domain} map layer` }));
    await flush();
  }
  expect(frame().facilities.filter((f) => f.atlas_domain === 'Supply')).toHaveLength(2);
  expect(frame().facilities.filter((f) => f.atlas_domain === 'Demand')).toHaveLength(2);
  const before = geometry();
  holdRequests = true;
  fireEvent.click(view.getByRole('button', { name: 'NUTS2', exact: true }));
  await flush();
  expect(pending).toHaveLength(3);
  for (const country of ['BE', 'FR']) {
    for (const scope of ['grid', 'supply', 'demand']) {
      expect(geometry()).toEqual(before);
      await resolveCountry(country, true, scope);
    }
  }
  expect(frame().networkResolution).toBe('nuts2');
  const supply = frame().facilities.filter((f) => f.atlas_domain === 'Supply');
  const demand = frame().facilities.filter((f) => f.atlas_domain === 'Demand');
  expect(supply.map((f) => f.p_nom)).toEqual([400, 400]);
  expect(demand.map((f) => f.annual_energy_gwh)).toEqual([100, 100]);
  expect(demand.every((f) => f.provisional_demand && f.demand_breakdown[0].subsector === 'heating')).toBe(true);
  expect(frame().geoJsonOverlays).toHaveLength(2);
  expect(frame().facilities.every((f) => f.sourceNetworkFilename.endsWith('_nuts2.nc'))).toBe(true);
});

test('model-planned all-country replacement uses the same atomic map batch', async () => {
  const view = await loadCountries(['FR']);
  const before = geometry();
  interpreterPlan = [{ intent: 'load_all_countries', params: { resolution: 'bidding_zone', layers: ['Grid'] } }];
  holdRequests = true;
  await send(view, 'show all countries at bidding zone level');
  expect(pending).toHaveLength(2);
  await resolveCountry('FR');
  expect(geometry()).toEqual(before);
  await resolveCountry('BE');
  expect(frame().networkResolution).toBe('bidding_zone');
  expect(new Set(frame().activeCountryCodes)).toEqual(new Set(['BE', 'FR']));
  expect(frame().facilities.every((f) => f.sourceNetworkFilename.endsWith('_bidding_zone.nc'))).toBe(true);
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(view.getByRole('log').textContent).toContain('Verified');
});

test('compound all-Europe overlay plan sees newly committed power and country scope', async () => {
  const view = render(<App />);
  await flush();
  interpreterPlan = [
    { intent: 'load_all_countries', params: { resolution: 'bidding_zone', layers: ['Grid'] } },
    { intent: 'set_network_overlay', params: { visible: true, network_carriers: ['electricity', 'gas', 'water'] } },
  ];
  await send(view, 'show Europe at bidding zone level with electricity, methane and water overlay');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(new Set(frame().activeCountryCodes)).toEqual(new Set(['BE', 'FR']));
  expect(view.getByRole('slider', { name: 'Network resolution' }).getAttribute('aria-valuetext')).toBe('Bidding zone');
  expect(frame().facilities.filter((asset) => asset.atlas_network_carrier === 'electricity')
    .every((asset) => asset.sourceNetworkFilename.endsWith('_bidding_zone.nc'))).toBe(true);
  const overlayControl = view.getByRole('button', { name: 'Toggle multi-network overlay' });
  expect(overlayControl.getAttribute('aria-pressed')).toBe('true');
  expect(overlayControl.getAttribute('data-atlas-overlay-carriers')).toBe('electricity,gas,water');
  expect(view.getByRole('log').textContent).not.toContain('Power was skipped');
  const infrastructureRequests = global.fetch.mock.calls
    .filter(([url]) => /\/api\/atlas\/(gas|water)\/network\?/.test(String(url)))
    .map(([url]) => new URL(String(url), 'http://atlas.test'));
  expect(infrastructureRequests).toHaveLength(2);
  expect(infrastructureRequests.every((url) => url.searchParams.get('countries') === 'BE,FR')).toBe(true);
});

test('an immediate all-Europe command awaits a fresh catalogue instead of failing startup', async () => {
  holdInitialCatalogue = true;
  const view = render(<App />);
  await flush();
  expect(resolveInitialCatalogue).not.toBeNull();
  expect(view.queryByRole('option', { name: 'Belgium (BE)' })).toBeNull();
  interpreterPlan = [{ intent: 'load_all_countries', params: { resolution: 'bidding_zone', layers: ['Grid'] } }];
  await send(view, 'show Europe at bidding zone level');
  expect(catalogueRequestCount).toBe(2);
  expect(new Set(frame().activeCountryCodes)).toEqual(new Set(['BE', 'FR']));
  expect(frame().facilities.every((asset) => asset.sourceNetworkFilename.endsWith('_bidding_zone.nc'))).toBe(true);
  expect(parseRequests).toHaveLength(2);
  expect(parseRequests.every((request) => request.geographic_country && request.geographic_level === 'bidding_zone')).toBe(true);
  resolveInitialCatalogue(response({ source: 'local', files: catalogue,
    capabilities: { parse_nc_omit_geojson_overlays: compactOverlayCapability } }));
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(view.getByRole('log').textContent).toContain('Showing all 2 countries at Bidding zone');
});

test.each([
  'Show me France at NUTS3 with grid only, turn off the carrier overlay.',
  'zoom into Paris',
  'remove supply and add France',
])('unavailable reasoning never guesses or partially changes the map: %s', async (prompt) => {
  const view = await loadCountries(['BE']);
  const before = geometry();
  parseRequests = [];
  interpreterReply = { provider: 'fallback', confidence: 0, actions: [], intent: 'unknown' };
  await send(view, prompt);
  expect(geometry()).toEqual(before);
  expect(parseRequests).toHaveLength(0);
  expect(view.getByRole('button', { name: 'Grid map layer' }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('log').textContent).toContain('reasoning service is unavailable. No map changes were made');
  expect(global.fetch.mock.calls.some(([url]) => String(url).endsWith('/api/map-agent/interpret'))).toBe(true);
  expect(global.fetch.mock.calls.some(([url]) => String(url).endsWith('/api/map-agent/judge'))).toBe(false);
  expect(view.getByRole('textbox', { name: 'Message EMIL' }).disabled).toBe(false);
});

test('compound model plan is not rewritten by a negation in a different clause', async () => {
  const view = await loadCountries();
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  interpreterPlan = [
    { intent: 'set_network_overlay', params: { visible: false } },
    { intent: 'load_country', params: { country: 'France', resolution: 'nuts3', layers: ['Grid'], layer_mode: 'replace' } },
  ];
  await send(view, 'Show me France at NUTS3 with grid only, turn off the carrier overlay.');
  expect(view.getByRole('button', { name: 'Toggle multi-network overlay' }).getAttribute('aria-pressed')).toBe('false');
  expect(view.getByRole('button', { name: 'Grid map layer' }).getAttribute('aria-pressed')).toBe('true');
  expect(frame().activeCountryCodes).toEqual(['FR']);
  expect(frame().facilities).toHaveLength(2);
  expect(frame().connections).toHaveLength(1);
  act(() => jest.advanceTimersByTime(250));
  await flush();
  const [, judgeOptions] = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/api/map-agent/judge'));
  const judged = JSON.parse(judgeOptions.body);
  expect(judged.plannedActions[1].params.layer_mode).toBe('replace');
  expect(judged.afterContext.visibleMapLayers).toEqual(['Grid']);
});

test('a stalled interpreter times out, preserves the map and permits a successful retry', async () => {
  const view = await loadCountries(['BE']);
  const before = geometry();
  holdInterpreter = true;
  await send(view, 'show France');
  act(() => jest.advanceTimersByTime(45000));
  await flush();
  expect(geometry()).toEqual(before);
  expect(view.getByRole('log').textContent).toContain('reasoning service is unavailable');
  expect(view.getByRole('textbox', { name: 'Message EMIL' }).disabled).toBe(false);
  holdInterpreter = false;
  interpreterPlan = [{ intent: 'add_country', params: { country: 'France' } }];
  await send(view, 'add France');
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  act(() => jest.advanceTimersByTime(250));
  await flush();
});

test('EMIL preserves older reading position while replying and offers a focused return to latest', async () => {
  const view = await loadCountries(['FR']);
  const before = geometry();
  fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  const log = view.getByRole('log', { name: 'Conversation with EMIL' });
  Object.defineProperties(log, {
    scrollHeight: { configurable: true, value: 1200 },
    clientHeight: { configurable: true, value: 200 },
  });
  log.scrollTop = 100;
  fireEvent.scroll(log);
  expect(view.getByRole('button', { name: 'Jump to latest EMIL message' }).textContent).toBe('Jump to latest');
  interpreterReply = { provider: 'test', confidence: 0, actions: [{ intent: 'ask_clarification', params: { clarification: 'Which zone do you mean?' } }] };
  await send(view, 'show that zone');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(log.scrollTop).toBe(100);
  expect(log.textContent).toContain('Which zone do you mean?');
  expect(view.getByRole('button', { name: 'Jump to latest EMIL message' }).textContent).toContain('New messages');
  fireEvent.click(view.getByRole('button', { name: 'Jump to latest EMIL message' }));
  expect(log.scrollTop).toBe(1200);
  expect(document.activeElement).toBe(log);
  expect(view.queryByRole('button', { name: 'Jump to latest EMIL message' })).toBeNull();
  expect(geometry()).toEqual(before);
});

test('model display actions change only node dots and boundaries and expose actual state to the judge', async () => {
  const view = await loadCountries(['FR']);
  const before = geometry();
  const requestCount = parseRequests.length;
  interpreterPlan = [{ intent: 'set_map_display', params: { geographic_boundaries: false } }];
  await send(view, 'Hide geographic boundaries without changing the grid or camera');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(view.getByRole('button', { name: 'Geographic boundaries', exact: true }).getAttribute('aria-pressed')).toBe('false');
  expect(view.getByRole('button', { name: 'Node markers', exact: true }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('button', { name: 'Hide domain controls' })).toBeDefined();
  const auditRequest = global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/map-agent/judge')).at(-1);
  expect(JSON.parse(auditRequest[1].body).afterContext.mapDisplay).toEqual({ nodeMarkers: true, geographicBoundaries: false, domainControls: true });
  interpreterPlan = [{ intent: 'set_map_display', params: { node_markers: false, geographic_boundaries: true } }];
  await send(view, 'Hide dots and restore the boundaries');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(view.getByRole('button', { name: 'Geographic boundaries', exact: true }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('button', { name: 'Node markers', exact: true }).getAttribute('aria-pressed')).toBe('false');
  expect(geometry()).toEqual(before);
  expect(parseRequests).toHaveLength(requestCount);
});

test.each([{}, { node_markers: false, geographic_boundaries: 'false' }, { geographic_boundaries: false, invented: true }])('invalid display params are atomic: %j', async (params) => {
  const view = await loadCountries(['FR']);
  interpreterPlan = [{ intent: 'set_map_display', params }];
  await send(view, 'Change map display');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(view.getByRole('button', { name: 'Geographic boundaries', exact: true }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('button', { name: 'Node markers', exact: true }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('log').textContent).toContain('No display settings changed');
});

test('a low-confidence clarification is shown without falling through to local actions', async () => {
  const view = await loadCountries(['BE']);
  const before = geometry();
  interpreterReply = { provider: 'test', confidence: 0, actions: [{ intent: 'ask_clarification', params: { clarification: 'Which Paris do you mean?' } }] };
  await send(view, 'zoom into Paris');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(geometry()).toEqual(before);
  expect(view.getByRole('log').textContent).toContain('Which Paris do you mean?');
});

test('agent add-country preserves the previous country and only fetches the added country', async () => {
  const view = await loadCountries(['BE']);
  const before = geometry();
  parseRequests = [];
  holdRequests = true;
  interpreterPlan = [{ intent: 'add_country', params: { country: 'France' } }];
  await send(view, 'add France');
  expect(pending).toHaveLength(1);
  expect(geometry()).toEqual(before);
  await resolveCountry('FR');
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().facilities.filter((f) => f.sourceCountryCode === 'BE').map((f) => f.sourceNetworkFilename)).toEqual(['base_BE_nuts3.nc', 'base_BE_nuts3.nc']);
  expect(parseRequests.every((body) => body.filename.startsWith('base_FR_'))).toBe(true);
  act(() => jest.advanceTimersByTime(250));
  await flush();
});

test('lazy domain loading is parallel, preserves active country/order and can be cancelled without caching partial results', async () => {
  const view = await loadCountries();
  fireEvent.click(view.getByRole('button', { name: 'Belgium', exact: true }));
  await flush();
  const before = geometry();
  holdRequests = true;
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer' }));
  await flush();
  expect(pending).toHaveLength(2);
  await resolveCountry('FR', true, 'supply');
  expect(geometry()).toEqual(before);
  fireEvent.click(view.getByRole('button', { name: 'Cancel network update' }));
  await flush();
  await resolveCountry('BE', true, 'supply');
  expect(geometry()).toEqual(before);
  parseRequests = [];
  holdRequests = false;
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer' }));
  await flush();
  expect(parseRequests.map((body) => body.filename)).toEqual(['base_BE_nuts3.nc', 'base_FR_nuts3.nc']);
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().activeCountryCode).toBe('BE');
  expect(frame().facilities.filter((f) => f.atlas_domain === 'Grid')).toHaveLength(4);
  expect(frame().facilities.filter((f) => f.atlas_domain === 'Supply')).toHaveLength(2);
  expect(frame().connections).toHaveLength(2);
  expect(frame().geoJsonOverlays).toHaveLength(2);
});

test('an agent geography-plus-supply plan merges into the newly committed countries, not its stale pre-plan snapshot', async () => {
  const view = await loadCountries(['FR']);
  interpreterPlan = [{ intent: 'load_all_countries', params: { resolution: 'bidding_zone', layers: ['Grid', 'Supply'] } }];
  await send(view, 'show all countries at bidding zone level with grid and supply');
  expect(frame().networkResolution).toBe('bidding_zone');
  expect(new Set(frame().activeCountryCodes)).toEqual(new Set(['BE', 'FR']));
  expect(frame().facilities.filter((f) => f.atlas_domain === 'Supply')).toHaveLength(2);
  expect(frame().facilities.filter((f) => f.atlas_domain === 'Grid')).toHaveLength(4);
  expect(frame().connections).toHaveLength(2);
  expect(frame().geoJsonOverlays).toHaveLength(2);
  expect(frame().facilities.every((f) => f.sourceNetworkFilename.endsWith('_bidding_zone.nc'))).toBe(true);
  act(() => jest.advanceTimersByTime(250));
  await flush();
});

test('agent country removal cannot mutate a manual resolution transaction in flight', async () => {
  const view = await loadCountries();
  const before = geometry();
  holdRequests = true;
  fireEvent.click(view.getByRole('button', { name: 'NUTS2', exact: true }));
  await flush();
  interpreterPlan = [{ intent: 'remove_country', params: { country: 'France' } }];
  await send(view, 'remove France');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(view.getByRole('log').textContent).toContain('network update is already in progress');
  expect(geometry()).toEqual(before);
  await resolveCountry('FR');
  await resolveCountry('BE');
  expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().networkResolution).toBe('nuts2');
});

test.each(['manual', 'agent'])('%s country removal releases co-located records owned by the removed country', async (mode) => {
  sharedCountryLocation = true;
  const view = await loadCountries();
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer' }));
  await flush();
  const before = frame().facilities;
  expect(before.some((node) => new Set(node.sameLocationFacilities.map((peer) => peer.sourceCountryCode)).size === 2)).toBe(true);
  if (mode === 'manual') {
    fireEvent.click(view.getByRole('button', { name: 'Remove France' }));
    await flush();
  } else {
    interpreterPlan = [{ intent: 'remove_country', params: { country: 'France' } }];
    await send(view, 'remove France');
  }
  expect(frame().activeCountryCodes).toEqual(['BE']);
  expect(frame().facilities).toHaveLength(3);
  for (const node of frame().facilities) {
    expect(node.sourceCountryCode).toBe('BE');
    expect(node.sameLocationFacilities.every((peer) => peer.sourceCountryCode === 'BE')).toBe(true);
    expect(node.sameLocationCount).toBe(node.id === 'bus-b' ? 1 : 2);
  }
  expect(frame().facilities.find((node) => node.component_type === 'Generator').p_nom).toBe(400);
  expect(frame().connections).toHaveLength(1);
  expect(frame().connections[0].s_nom).toBe(1234);
  expect(frame().geoJsonOverlays).toHaveLength(1);
  // Do not mutate the previous committed snapshot while releasing references.
  expect(before.some((node) => node.sameLocationFacilities.some((peer) => peer.sourceCountryCode === 'FR'))).toBe(true);
});

test('cancelling Storage leaves already visible Grid and Supply selected, including after late replies', async () => {
  const view = await loadCountries();
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer' }));
  await flush();
  const before = geometry();
  holdRequests = true;
  fireEvent.click(view.getByRole('button', { name: 'Storage map layer' }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Cancel network update' }));
  await flush();
  for (const country of ['BE', 'FR']) await resolveCountry(country, true, 'storage');
  expect(geometry()).toEqual(before);
  for (const domain of ['Grid', 'Supply']) {
    expect(view.getByRole('button', { name: `${domain} map layer` }).getAttribute('aria-pressed')).toBe('true');
  }
  expect(view.getByRole('button', { name: 'Storage map layer' }).getAttribute('aria-pressed')).toBe('false');
});

test('right-side controls share space without disabling layers, losing the assistant draft or rebuilding geometry', async () => {
  const view = await loadCountries(['FR']);
  // The map mock must acknowledge the initial country fit as Leaflet does.
  act(() => frame().onViewportCommandApplied(frame().viewportCommand.id));
  await flush();
  const before = geometry();
  const requestsBefore = parseRequests.length;
  fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  fireEvent.change(view.getByRole('textbox', { name: 'Message EMIL' }), { target: { value: 'zoom into Paris' } });

  act(() => frame().onLandConstraintsChange({ enabled: true, panelOpen: true, categories: ['forest'], opacity: 45 }));
  await flush();
  expect(view.queryByRole('textbox', { name: 'Message EMIL' })).toBeNull();
  expect(frame().landConstraints).toMatchObject({ enabled: true, panelOpen: true, categories: ['forest'], opacity: 45 });
  expect(frame().gridAccess.panelOpen).toBe(false);

  fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  await flush();
  expect(view.getByRole('textbox', { name: 'Message EMIL' }).value).toBe('zoom into Paris');
  expect(frame().landConstraints).toMatchObject({ enabled: true, panelOpen: false, categories: ['forest'], opacity: 45 });

  act(() => frame().onGridAccessChange({ enabled: true, panelOpen: true, sides: ['generation'], metric: 'queued_mw' }));
  await flush();
  expect(view.queryByRole('textbox', { name: 'Message EMIL' })).toBeNull();
  expect(frame().gridAccess).toMatchObject({ enabled: true, panelOpen: true, sides: ['generation'], metric: 'queued_mw' });
  expect(frame().landConstraints).toMatchObject({ enabled: true, panelOpen: false, categories: ['forest'], opacity: 45 });

  act(() => frame().onLandConstraintsChange({ panelOpen: true }));
  await flush();
  expect(frame().gridAccess).toMatchObject({ enabled: true, panelOpen: false, sides: ['generation'], metric: 'queued_mw' });
  expect(frame().landConstraints.panelOpen).toBe(true);
  expect(geometry()).toEqual(before);
  expect(parseRequests).toHaveLength(requestsBefore);
  expect(frame().viewportCommand).toBeNull();
});

test('a map render exception preserves Atlas controls and can recover in place', async () => {
  const view = await loadCountries(['FR']);
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockMapShouldFail = true;
  fireEvent.click(view.getByRole('button', { name: 'Node markers' }));
  expect(view.getByRole('alert', { name: 'Map recovery' })).toBeDefined();
  expect(view.getByRole('combobox', { name: 'Add country network' })).toBeDefined();
  expect(view.getByRole('button', { name: 'Open map assistant' })).toBeDefined();

  mockMapShouldFail = false;
  fireEvent.click(view.getByRole('button', { name: 'Retry map' }));
  expect(view.getByTestId('atlas-map')).toBeDefined();
  expect(view.queryByRole('alert', { name: 'Map recovery' })).toBeNull();
  consoleError.mockRestore();
});

test('land opacity commits to the presentation cache without rerendering Atlas', async () => {
  await loadCountries(['FR']);
  act(() => frame().onLandConstraintsChange({ enabled: true, panelOpen: true, categories: ['forest'], opacity: 45 }));
  await flush();
  const frameCount = mockMapFrames.length;
  const before = geometry();

  act(() => frame().onLandOpacityCommit(79));

  expect(mockMapFrames).toHaveLength(frameCount);
  expect(geometry()).toEqual(before);
  expect(JSON.parse(window.localStorage.getItem('atlas-land-overlay'))).toMatchObject({
    enabled: true, categories: ['forest'], opacity: 79,
  });

  act(() => frame().onLandConstraintsChange({ panelOpen: false }));
  await flush();
  expect(frame().landConstraints.opacity).toBe(79);
});

test.each([null, '{broken', '["unknown"]'])('first overlay entry loads only the active carrier with saved selection %s', async (saved) => {
  if (saved !== null) window.localStorage.setItem('atlas-network-overlay-carriers', saved);
  const view = await loadCountries(['FR']);
  act(() => frame().onViewportCommandApplied(frame().viewportCommand.id));
  await flush();
  const requestsBefore = parseRequests.length;
  const otherNetworkRequests = () => global.fetch.mock.calls.filter(([url]) => /\/api\/atlas\/(gas|water|liquids|logistics)\/network/.test(String(url)));
  expect(otherNetworkRequests()).toHaveLength(0);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(view.getByRole('button', { name: 'Hide Electricity in overlay' }).getAttribute('aria-pressed')).toBe('true');
  for (const label of ['Methane gas', 'Water & wastewater', 'Oil & energy liquids', 'Ports & air freight']) {
    expect(view.getByRole('button', { name: `Show ${label} in overlay` }).getAttribute('aria-pressed')).toBe('false');
  }
  expect(otherNetworkRequests()).toHaveLength(0);
  expect(parseRequests).toHaveLength(requestsBefore);
  expect(frame().viewportCommand).toBeNull();
  expect(frame().connections).toHaveLength(1);
  expect(JSON.parse(window.localStorage.getItem('atlas-network-overlay-carriers'))).toEqual(['electricity']);

  fireEvent.click(view.getByRole('button', { name: 'Show Methane gas in overlay' }));
  await flush();
  expect(otherNetworkRequests().length).toBeGreaterThan(0);
  expect(otherNetworkRequests().every(([url]) => String(url).includes('/gas/network'))).toBe(true);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(view.getByRole('button', { name: 'Hide Methane gas in overlay' })).toBeDefined();
  expect(frame().connections).toHaveLength(1);
  expect(frame().viewportCommand).toBeNull();
});

test.each(['gas', 'water', 'liquids', 'logistics'])('%s network download is aborted when the workspace unmounts', async (carrier) => {
  const fallback = global.fetch;
  let request;
  global.fetch = jest.fn((url, options) => {
    if (String(url).endsWith(`/api/atlas/${carrier}/status`)) return Promise.resolve(response({ available: true, countries: ['BE', 'FR'] }));
    if (String(url).includes(`/api/atlas/${carrier}/network?`)) {
      return new Promise((resolve) => { request = { resolve, signal: options.signal }; });
    }
    return fallback(url, options);
  });
  const view = render(<App />);
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  expect(request?.signal.aborted).toBe(false);
  view.unmount();
  await flush();
  expect(request.signal.aborted).toBe(true);
  const late = { ok: true, json: jest.fn(async () => ({ facilities: [], connections: [] })) };
  request.resolve(late);
  await flush();
  expect(late.json).not.toHaveBeenCalled();
});

test('a superseded status check cannot start an obsolete network load or clear its replacement', async () => {
  const fallback = global.fetch;
  const statuses = [];
  const networks = [];
  global.fetch = jest.fn((url, options) => {
    if (String(url).endsWith('/api/atlas/gas/status')) {
      return new Promise((resolve) => statuses.push({ resolve, signal: options.signal }));
    }
    if (String(url).includes('/api/atlas/gas/network?')) {
      networks.push(url);
      return Promise.resolve(response({ facilities: [], connections: [] }));
    }
    return fallback(url, options);
  });
  const view = render(<App />);
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: 'gas' } });
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Reload gas data' }));
  await flush();
  expect(statuses).toHaveLength(2);
  expect(statuses[0].signal.aborted).toBe(true);
  const late = { ok: true, json: jest.fn(async () => ({ available: true, countries: ['FR'] })) };
  statuses[0].resolve(late);
  await flush();
  expect(late.json).not.toHaveBeenCalled();
  expect(networks).toHaveLength(0);
  statuses[1].resolve(response({ available: true, countries: ['BE'] }));
  await flush();
  expect(networks).toHaveLength(1);
  expect(view.getByRole('combobox', { name: 'Gas network country' }).disabled).toBe(false);
  expect(view.queryByText(/request cancelled/)).toBeNull();
});

test('stalled methane body times out, unlocks reload and can recover', async () => {
  const fallback = global.fetch;
  let stalled = true;
  let downloadSignal;
  global.fetch = jest.fn((url, options) => {
    if (String(url).endsWith('/api/atlas/gas/status')) return Promise.resolve(response({ available: true, countries: ['BE'] }));
    if (String(url).includes('/api/atlas/gas/network?')) {
      downloadSignal = options.signal;
      return Promise.resolve(stalled ? { ok: true, json: () => new Promise(() => {}) }
        : response({ facilities: [], connections: [] }));
    }
    return fallback(url, options);
  });
  const view = render(<App />);
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: 'gas' } });
  await flush();
  expect(view.getByRole('button', { name: 'Reload gas data' }).disabled).toBe(true);
  await act(async () => jest.advanceTimersByTime(90_000));
  await flush();
  expect(downloadSignal.aborted).toBe(true);
  expect(view.getByText(/The download timed out/)).toBeDefined();
  expect(view.getByRole('button', { name: 'Reload gas data' }).disabled).toBe(false);
  stalled = false;
  fireEvent.click(view.getByRole('button', { name: 'Reload gas data' }));
  await flush();
  expect(view.queryByText(/The download timed out/)).toBeNull();
  expect(view.getByRole('combobox', { name: 'Gas network country' }).disabled).toBe(false);
});

test.each([['gas', 'Methane'], ['water', 'Water'], ['liquids', 'Liquids'], ['logistics', 'Logistics']])('%s unavailable status stays unavailable until the dataset actually loads', async (carrier, label) => {
  const fallback = global.fetch;
  let available = false;
  let completeStatus;
  let completeNetwork;
  let networkRequests = 0;
  global.fetch = jest.fn((url, options) => {
    if (String(url).endsWith(`/api/atlas/${carrier}/status`)) {
      return new Promise((resolve) => { completeStatus = () => resolve(response(available
        ? { available: true, countries: ['BE'] } : { available: false, error: 'Source database missing' })); });
    }
    if (String(url).includes(`/api/atlas/${carrier}/network?`)) {
      networkRequests += 1;
      return new Promise((resolve) => { completeNetwork = resolve; });
    }
    return fallback(url, options);
  });
  const view = render(<App />);
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  const statusText = () => view.getByRole('status', { name: `${label} data status` }).textContent;
  expect(statusText()).toContain('Checking');
  completeStatus();
  await flush();
  expect(statusText()).toContain('data unavailable');
  expect(statusText()).toContain('Source database missing');
  expect(networkRequests).toBe(0);
  available = true;
  fireEvent.click(view.getByRole('button', { name: `Reload ${label.toLowerCase()} grid` }));
  await flush();
  completeStatus();
  await flush();
  expect(statusText()).toContain('Loading');
  expect(statusText()).not.toContain('data ready');
  expect(networkRequests).toBe(1);
  completeNetwork(response({ facilities: [], connections: [] }));
  await flush();
  expect(statusText()).toContain('No records for this selection');
  expect(view.queryByText('Source database missing')).toBeNull();
});

test('logistics footer counts loaded records rather than source-wide ports and airports', async () => {
  const fallback = global.fetch;
  global.fetch = jest.fn((url, options) => {
    if (String(url).endsWith('/api/atlas/logistics/status')) return Promise.resolve(response({
      available: true, countries: ['BE'], summary: { physical_ports: 999, airfields: 888 },
    }));
    if (String(url).includes('/api/atlas/logistics/network?')) return Promise.resolve(response({
      facilities: ['maritime', 'maritime', 'aviation', 'unknown'].map((logistics_mode, index) => ({
        id: `logistics-${index}`, name: `Asset ${index}`, latitude: 50.8, longitude: 4.3,
        component_type: 'Bus', type: 'Bus', atlas_domain: 'Grid', carrier: 'logistics', logistics_mode,
      })), connections: [],
    }));
    return fallback(url, options);
  });
  const view = render(<App />);
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: 'logistics' } });
  await flush();
  expect(view.getByLabelText('Loaded logistics assets').textContent).toBe('4');
  expect(view.getByLabelText('Loaded maritime assets').textContent).toBe('2');
  expect(view.getByLabelText('Loaded aviation assets').textContent).toBe('1');
  expect(view.queryByText('999')).toBeNull();
  expect(view.queryByText('888')).toBeNull();
});

test('an unused overlay default follows a workspace switch before first activation', async () => {
  const view = await loadCountries(['FR']);
  expect(window.localStorage.getItem('atlas-network-overlay-carriers')).toBeNull();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: 'gas' } });
  await flush();
  expect(window.localStorage.getItem('atlas-network-overlay-carriers')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(JSON.parse(window.localStorage.getItem('atlas-network-overlay-carriers'))).toEqual(['gas']);
  expect(view.getByRole('button', { name: 'Hide Methane gas in overlay' })).toBeDefined();
  expect(view.getByRole('button', { name: 'Show Electricity in overlay' })).toBeDefined();
  expect(global.fetch.mock.calls.some(([url]) => /\/api\/atlas\/(water|liquids|logistics)\/network/.test(String(url)))).toBe(false);
});

test('saved multi-carrier choices are retained instead of replaced by the lightweight default', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity', 'gas', 'water', 'gas', 'invalid']));
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(JSON.parse(window.localStorage.getItem('atlas-network-overlay-carriers'))).toEqual(['electricity', 'gas', 'water']);
  for (const label of ['Electricity', 'Methane gas', 'Water & wastewater']) {
    expect(view.getByRole('button', { name: `Hide ${label} in overlay` }).getAttribute('aria-pressed')).toBe('true');
  }
  expect(global.fetch.mock.calls.some(([url]) => /\/api\/atlas\/(liquids|logistics)\/network/.test(String(url)))).toBe(false);
});

test('reopening an empty restored overlay recovers the current network after it has been loaded', async () => {
  window.localStorage.setItem('atlas-network-overlay-mode', 'true');
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = render(<App />);
  await flush();
  // No in-memory power dataset survives a page reload; it cannot be claimed
  // visible until a country has really loaded.
  expect(view.getByRole('button', { name: 'Show Electricity in overlay' })).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  fireEvent.change(view.getByRole('combobox', { name: 'Add country network' }), { target: { value: 'FR' } });
  await flush();
  expect(frame().connections).toHaveLength(1);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(view.getByRole('button', { name: 'Hide Electricity in overlay' }).getAttribute('aria-pressed')).toBe('true');
  expect(frame().connections).toHaveLength(1);
  expect(JSON.parse(window.localStorage.getItem('atlas-network-overlay-carriers'))).toEqual(['electricity']);
  expect(global.fetch.mock.calls.some(([url]) => /\/api\/atlas\/(gas|water|liquids|logistics)\/network/.test(String(url)))).toBe(false);
});

test('carrier legend and assistant exchange focus without changing selected carriers or country geometry', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity']));
  const view = await loadCountries(['FR']);
  act(() => frame().onViewportCommandApplied(frame().viewportCommand.id));
  await flush();
  const before = geometry();
  fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(view.queryByRole('textbox', { name: 'Message EMIL' })).toBeNull();
  expect(view.getByRole('button', { name: 'Collapse carrier overlay legend' })).toBeDefined();
  const overlayGeometry = geometry();

  fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  await flush();
  expect(view.queryByRole('button', { name: 'Collapse carrier overlay legend' })).toBeNull();
  expect(view.getByRole('button', { name: 'Open carrier overlay legend' })).toBeDefined();
  expect(geometry()).toEqual(overlayGeometry);
  expect(view.getByRole('button', { name: 'Toggle multi-network overlay' }).getAttribute('aria-pressed')).toBe('true');
  expect(JSON.parse(window.localStorage.getItem('atlas-network-overlay-carriers'))).toEqual(['electricity']);

  fireEvent.click(view.getByRole('button', { name: 'Open carrier overlay legend' }));
  await flush();
  expect(view.queryByRole('textbox', { name: 'Message EMIL' })).toBeNull();
  act(() => frame().onLandConstraintsChange({ panelOpen: true }));
  await flush();
  expect(view.queryByRole('button', { name: 'Open carrier overlay legend' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Collapse carrier overlay legend' })).toBeNull();
  expect(geometry()).toEqual(overlayGeometry);

  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(geometry()).toEqual(before);
  expect(frame().viewportCommand).toBeNull();
});

test.each([
  ['gas', 'Methane gas'], ['water', 'Water & wastewater'],
  ['liquids', 'Oil & energy liquids'], ['logistics', 'Ports & air freight'],
])('%s valid-empty Grid stays loaded and allows lazy Supply without reloading Grid', async (carrier, label) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify([carrier]));
  const normalFetch = global.fetch;
  const domains = [];
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes(`/api/atlas/${carrier}/network?`)) {
      const query = new URL(String(url), 'http://localhost').searchParams;
      domains.push(query.get('domains'));
      expect(query.get('countries')).toBe('FR');
      return Promise.resolve(response({ facilities: query.get('domains') === 'Supply'
        ? [{ id: 'supply-a', component_type: 'Generator', atlas_domain: 'Supply', country_code: 'FR', latitude: 49, longitude: 2 }] : [], connections: [] }));
    }
    return normalFetch(url, options);
  });
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(domains).toEqual(['Grid']);
  expect(view.getByRole('button', { name: `Hide ${label} in overlay` }).textContent).toContain('No records for loaded layers');
  expect(view.getByRole('status', { name: 'Empty network overlay' }).textContent).toContain('Loaded layers contain no records');
  expect(view.getByRole('button', { name: 'Grid map layer', exact: true }).disabled).toBe(false);
  expect(view.getByRole('button', { name: 'Supply map layer', exact: true }).disabled).toBe(false);
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();
  expect(domains).toEqual(['Grid', 'Supply']);
  expect(frame().facilities.some(f => f.atlas_network_carrier === carrier && f.id === 'supply-a')).toBe(true);
  expect(view.queryByRole('status', { name: 'Empty network overlay' })).toBeNull();
});

test.each([
  ['gas', 'Gas network country'], ['water', 'Water network country'],
  ['liquids', 'Liquids network country'], ['logistics', 'Logistics country'],
])('%s overlay exposes shared Geography and restores standalone country on exit', async (carrier, countryLabel) => {
  window.localStorage.setItem('atlas-network-carrier', carrier);
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify([carrier]));
  const requests = [];
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes(`/api/atlas/${carrier}/network?`)) {
      requests.push(new URL(String(url), 'http://localhost').searchParams.get('countries') || '');
    }
    return normalFetch(url, options);
  });
  const view = render(<App />);
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: countryLabel }), { target: { value: 'BE' } });
  await flush();
  expect(view.getByRole('combobox', { name: countryLabel }).value).toBe('BE');
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(view.queryByRole('combobox', { name: countryLabel })).toBeNull();
  fireEvent.change(view.getByRole('combobox', { name: 'Add country network' }), { target: { value: 'FR' } });
  await flush();
  expect(frame().activeCountryCodes).toEqual(['FR']);
  expect(requests[requests.length - 1]).toBe('FR');
  expect(view.getByRole('combobox', { name: 'Network carrier' }).value).toBe(carrier);
  fireEvent.change(view.getByRole('combobox', { name: 'Add country network' }), { target: { value: 'BE' } });
  await flush();
  expect(new Set(frame().activeCountryCodes)).toEqual(new Set(['BE', 'FR']));
  expect(requests[requests.length - 1]).toBe('BE,FR');
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(view.queryByRole('combobox', { name: 'Add country network' })).toBeNull();
  expect(view.getByRole('combobox', { name: countryLabel }).value).toBe('BE');
  expect(requests[requests.length - 1]).toBe('BE');
});

test.each([
  ['gas', 'Methane gas'], ['water', 'Water & wastewater'],
  ['liquids', 'Oil & energy liquids'], ['logistics', 'Ports & air freight'],
])('%s workspace changes during overlay do not load or reset the visible map', async (carrier, label) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();
  act(() => frame().onViewportCommandApplied(frame().viewportCommand.id));
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  const before = geometry();
  const supplyPressed = view.getByRole('button', { name: 'Supply map layer', exact: true }).getAttribute('aria-pressed');
  const requests = [];
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes(`/api/atlas/${carrier}/network?`)) {
      requests.push(new URL(String(url), 'http://localhost').searchParams.get('countries') || '');
    }
    return normalFetch(url, options);
  });
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  expect(requests).toEqual([]);
  expect(geometry()).toEqual(before);
  expect(frame().viewportCommand).toBeNull();
  expect(view.getByRole('button', { name: 'Supply map layer', exact: true }).getAttribute('aria-pressed')).toBe(supplyPressed);
  expect(JSON.parse(window.localStorage.getItem('atlas-network-overlay-carriers'))).toEqual(['electricity']);
  fireEvent.click(view.getByRole('button', { name: `Show ${label} in overlay` }));
  await flush();
  expect(requests).toEqual(['FR']);
  expect(frame().viewportCommand).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(requests).toEqual(['FR', '']);
});

test.each(['gas', 'water', 'liquids', 'logistics'])('%s restored overlay waits for shared countries instead of downloading all Europe', async (carrier) => {
  window.localStorage.setItem('atlas-network-carrier', carrier);
  window.localStorage.setItem('atlas-network-overlay-mode', 'true');
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify([carrier]));
  const view = render(<App />);
  await flush();
  const requests = () => global.fetch.mock.calls.filter(([url]) => String(url).includes(`/api/atlas/${carrier}/network?`));
  expect(requests()).toHaveLength(0);
  fireEvent.change(view.getByRole('combobox', { name: 'Add country network' }), { target: { value: 'FR' } });
  await flush();
  expect(requests()).toHaveLength(1);
  expect(new URL(String(requests()[0][0]), 'http://localhost').searchParams.get('countries')).toBe('FR');
});

test.each([
  ['gas', 'Gas network country'], ['water', 'Water network country'],
  ['liquids', 'Liquids network country'], ['logistics', 'Logistics country'],
])('%s standalone initialization survives StrictMode effect replay', async (carrier, countryLabel) => {
  window.localStorage.setItem('atlas-network-carrier', carrier);
  const view = render(<React.StrictMode><App /></React.StrictMode>);
  await flush();
  expect(view.getByRole('combobox', { name: countryLabel }).disabled).toBe(false);
  expect(global.fetch.mock.calls.some(([url]) => String(url).includes(`/api/atlas/${carrier}/network?`))).toBe(true);
});

test.each(['gas', 'water', 'liquids', 'logistics'].flatMap(carrier =>
  ['status', 'headers', 'body'].map(phase => [carrier, phase])))('%s late standalone %s cannot overwrite an entered overlay', async (carrier, phase) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  act(() => frame().onViewportCommandApplied(frame().viewportCommand.id));
  const normalFetch = global.fetch;
  let late;
  const networks = [];
  global.fetch = jest.fn((url, options) => {
    const isNetwork = String(url).includes(`/api/atlas/${carrier}/network?`);
    if (isNetwork) networks.push(String(url));
    if (!late && (phase === 'status' ? String(url).endsWith(`/api/atlas/${carrier}/status`) : isNetwork)) {
      const promise = new Promise(resolve => { late = { resolve, signal: options.signal }; });
      return phase === 'body' ? Promise.resolve({ ok: true, json: () => promise }) : promise;
    }
    return normalFetch(url, options);
  });
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  expect(late).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();
  const before = geometry();
  expect(late.signal.aborted).toBe(true);
  const payload = phase === 'status' ? { available: true, countries: ['FR'] } : {
    facilities: [{ id: 'obsolete', country_code: 'FR', atlas_domain: 'Grid', latitude: 0, longitude: 120 }], connections: [],
  };
  const lateResponse = { ok: true, json: jest.fn(async () => payload) };
  late.resolve(phase === 'body' ? payload : lateResponse);
  await flush();
  expect(geometry()).toEqual(before);
  expect(view.getByRole('button', { name: 'Supply map layer', exact: true }).getAttribute('aria-pressed')).toBe('true');
  expect(frame().viewportCommand).toBeNull();
  expect(networks).toHaveLength(phase === 'status' ? 0 : 1);
  if (phase !== 'body') expect(lateResponse.json).not.toHaveBeenCalled();
  // Closing overlay must still be able to start a fresh standalone request.
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(networks).toHaveLength(phase === 'status' ? 1 : 2);
});

test.each([
  ['gas', 'Methane gas'], ['water', 'Water & wastewater'],
  ['liquids', 'Oil & energy liquids'], ['logistics', 'Ports & air freight'],
].flatMap(([carrier, label]) => ['status', 'body'].map(phase => [carrier, label, phase])))('%s late overlay %s cannot overwrite the restored standalone workspace', async (carrier, label, phase) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  const normalFetch = global.fetch;
  let late;
  const scopes = [];
  global.fetch = jest.fn((url, options) => {
    const isNetwork = String(url).includes(`/api/atlas/${carrier}/network?`);
    if (isNetwork) scopes.push(new URL(String(url), 'http://localhost').searchParams.get('countries') || '');
    if (!late && (phase === 'status' ? String(url).endsWith(`/api/atlas/${carrier}/status`) : isNetwork)) {
      const promise = new Promise(resolve => { late = { resolve, signal: options.signal }; });
      return phase === 'body' ? Promise.resolve({ ok: true, json: () => promise }) : promise;
    }
    if (isNetwork) return Promise.resolve(response({ facilities: [
      { id: 'fresh', country_code: 'BE', atlas_domain: 'Grid', latitude: 50, longitude: 4 },
    ], connections: [] }));
    return normalFetch(url, options);
  });
  fireEvent.click(view.getByRole('button', { name: `Show ${label} in overlay` }));
  await flush();
  expect(late).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(late.signal.aborted).toBe(true);
  expect(frame().facilities.map(item => item.id)).toEqual(['fresh']);
  const before = geometry();
  const camera = frame().viewportCommand;
  late.resolve(phase === 'status' ? response({ available: true, countries: ['FR'] }) : {
    facilities: [{ id: 'obsolete', country_code: 'FR', atlas_domain: 'Grid', latitude: 0, longitude: 120 }], connections: [],
  });
  await flush();
  expect(geometry()).toEqual(before);
  expect(frame().viewportCommand).toEqual(camera);
  expect(scopes).toEqual(phase === 'status' ? [''] : ['FR', '']);
});

test('closing a multi-carrier overlay cancels queued work without starting later batches', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity","gas","water","liquids","logistics"]');
  const view = await loadCountries(['FR']);
  const normalFetch = global.fetch;
  const bodies = [];
  const calls = [];
  global.fetch = jest.fn((url, options) => {
    if (/\/api\/atlas\/(gas|water|liquids|logistics)\//.test(String(url))) calls.push(String(url));
    if (/\/api\/atlas\/(gas|water|liquids|logistics)\/network\?/.test(String(url))) {
      return Promise.resolve({ ok: true, json: () => new Promise(resolve => bodies.push({ resolve, signal: options.signal })) });
    }
    return normalFetch(url, options);
  });
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(bodies).toHaveLength(2);
  const callsBeforeExit = [...calls];
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(bodies.every(body => body.signal.aborted)).toBe(true);
  expect(calls).toEqual(callsBeforeExit);
  bodies.forEach(body => body.resolve({ facilities: [], connections: [] }));
  await flush();
  expect(calls).toEqual(callsBeforeExit);
  expect(frame().activeCountryCodes).toEqual(['FR']);
});

test('loading an asset-only overlay domain retains the unchanged grid connection frame', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  const gridConnections = frame().connections;

  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();

  expect(parseRequests.some((request) => request.component_scope === 'supply')).toBe(true);
  expect(frame().connections).toBe(gridConnections);
});

test('loading standalone electricity assets retains the unchanged grid connection frame', async () => {
  const view = await loadCountries(['FR']);
  const gridConnections = frame().connections;

  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();

  expect(parseRequests.some((request) => request.component_scope === 'supply')).toBe(true);
  expect(frame().connections).toBe(gridConnections);
});

test.each([
  ['gas', 'Methane gas'], ['water', 'Water & wastewater'],
  ['liquids', 'Oil & energy liquids'], ['logistics', 'Ports & air freight'],
])('%s finishing a hidden carrier load does not replace visible overlay arrays', async (carrier, label) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  const normalFetch = global.fetch;
  let finish;
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes(`/api/atlas/${carrier}/network?`)) {
      return Promise.resolve({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) });
    }
    return normalFetch(url, options);
  });
  fireEvent.click(view.getByRole('button', { name: `Show ${label} in overlay` }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: `Hide ${label} in overlay` }));
  await flush();
  const before = frame();
  finish({ facilities: [{ id: 'hidden', country_code: 'FR', atlas_domain: 'Grid', latitude: 48, longitude: 2 }], connections: [] });
  await flush();
  expect(frame().connections).toBe(before.connections);
  expect(frame().facilities).toBe(before.facilities);
  expect(view.getByRole('button', { name: `Show ${label} in overlay` }).textContent).toContain('Hidden · cached');
  fireEvent.click(view.getByRole('button', { name: `Show ${label} in overlay` }));
  await flush();
  expect(frame().facilities.some(item => item.id === 'hidden')).toBe(true);
});

test('rapid overlay toggles compose against the latest visible selection', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity","logistics"]');
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();

  // One React batch reproduces clicks that arrive before the preceding render
  // is published. Each action must still observe the prior action immediately.
  act(() => {
    fireEvent.click(view.getByRole('button', { name: 'Hide Ports & air freight in overlay' }));
    fireEvent.click(view.getByRole('button', { name: 'Show Methane gas in overlay' }));
    fireEvent.click(view.getByRole('button', { name: 'Show Water & wastewater in overlay' }));
  });
  await flush();

  expect(view.getByRole('button', { name: 'Hide Electricity in overlay' })).toBeDefined();
  expect(view.getByRole('button', { name: 'Hide Methane gas in overlay' })).toBeDefined();
  expect(view.getByRole('button', { name: 'Hide Water & wastewater in overlay' })).toBeDefined();
  expect(view.getByRole('button', { name: 'Show Ports & air freight in overlay' })).toBeDefined();
  expect(JSON.parse(window.localStorage.getItem('atlas-network-overlay-carriers'))).toEqual([
    'electricity', 'gas', 'water',
  ]);
});

test.each([
  ['gas', 'Methane gas'], ['water', 'Water & wastewater'],
  ['liquids', 'Oil & energy liquids'], ['logistics', 'Ports & air freight'],
])('%s overlay boundaries follow visible power, not the return workspace', async (carrier) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify([carrier]));
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => String(url).includes(`/api/atlas/${carrier}/network?`)
    ? Promise.resolve(response({ facilities: [{ id: 'infrastructure', country_code: 'FR', atlas_domain: 'Grid', latitude: 48, longitude: 2 }], connections: [] }))
    : normalFetch(url, options));
  const view = await loadCountries(['FR']);
  const boundaries = frame().geoJsonOverlays;
  expect(boundaries).toHaveLength(1);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(frame().geoJsonOverlays).toEqual([]);
  const empty = frame().geoJsonOverlays;
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  expect(frame().geoJsonOverlays).toBe(empty);
  expect(frame().activeCountryCodes).toEqual(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Show Electricity in overlay' }));
  await flush();
  expect(frame().geoJsonOverlays).toBe(boundaries);
  fireEvent.click(view.getByRole('button', { name: 'Hide Electricity in overlay' }));
  await flush();
  expect(frame().geoJsonOverlays).toBe(empty);
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: 'electricity' } });
  await flush();
  expect(frame().geoJsonOverlays).toBe(empty);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(frame().geoJsonOverlays).toBe(boundaries);
});

test.each([
  ['gas', 'Gas network country'], ['water', 'Water network country'],
  ['liquids', 'Liquids network country'], ['logistics', 'Logistics country'],
])('%s overlay assistant fits shared Geography instead of the standalone country', async (carrier, countryLabel) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: countryLabel }), { target: { value: 'BE' } });
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  interpreterPlan = [{ intent: 'control_map_view', params: { operation: 'fit_selection' } }];
  await send(view, 'fit the current selection');
  const call = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/api/map-agent/interpret'));
  const context = JSON.parse(call[1].body).mapContext;
  expect(context.networkCarrier).toBe('overlay');
  expect(context.workspaceCarrier).toBe(carrier);
  expect(context.loadedCountryCodes).toEqual(['FR']);
  expect(context.loadedCountries).toEqual(['France']);
  expect(context.activeCountryCode).toBe('FR');
  expect(context.activeNetwork).toBeNull();
  expect(context.networkResolution).toBe('nuts3');
  expect(context.networkResolutionScope).toBe('electricity');
  expect(context.controlSchema.availableCountryCodes).toEqual(['BE', 'FR']);
  expect(frame().viewportCommand).toMatchObject({ operation: 'fit_targets', countryCodes: ['FR'] });
});

test.each(['gas', 'water', 'liquids', 'logistics'])('%s overlay agent edits shared countries without changing the exit workspace', async carrier => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  for (const [intent, params, countries] of [
    ['add_country', { country: 'Belgium' }, ['BE', 'FR']],
    ['remove_country', { country: 'France' }, ['BE']],
    ['load_country', { country: 'France' }, ['FR']],
    ['load_all_countries', { resolution: 'bidding_zone' }, ['BE', 'FR']],
  ]) {
    interpreterPlan = [{ intent, params }];
    await send(view, `${intent} ${JSON.stringify(params)}`);
    expect(new Set(frame().activeCountryCodes)).toEqual(new Set(countries));
    expect(view.getByRole('combobox', { name: 'Network carrier' }).value).toBe(carrier);
    expect(view.getByRole('button', { name: 'Toggle multi-network overlay' }).getAttribute('aria-pressed')).toBe('true');
    expect(frame().connections).toHaveLength(countries.length);
    act(() => jest.advanceTimersByTime(250));
    await flush();
  }
  expect(frame().facilities.every(asset => asset.sourceNetworkFilename.endsWith('_bidding_zone.nc'))).toBe(true);
});

test.each(['gas', 'water', 'liquids', 'logistics'])('%s overlay agent changes power resolution without changing source topology or workspace', async carrier => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['BE', 'FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  const sourceCalls = () => global.fetch.mock.calls.filter(([url]) => String(url).includes(`/api/atlas/${carrier}/network?`)).length;
  const beforeSourceCalls = sourceCalls();
  for (const [intent, params, resolution] of [
    ['set_network_resolution', { resolution: 'nuts2' }, 'nuts2'],
    ['step_network_resolution', { step: 'up' }, 'nuts3'],
    ['step_network_resolution', { step: 'up' }, 'full'],
    ['step_network_resolution', { step: 'down' }, 'nuts3'],
  ]) {
    interpreterPlan = [{ intent, params }];
    await send(view, `${intent} ${JSON.stringify(params)}`);
    expect(frame().activeCountryCodes).toEqual(['BE', 'FR']);
    expect(frame().connections).toHaveLength(2);
    expect(frame().facilities.every(asset => asset.sourceNetworkFilename.endsWith(`_${resolution}.nc`))).toBe(true);
    expect(view.getByRole('combobox', { name: 'Network carrier' }).value).toBe(carrier);
    expect(sourceCalls()).toBe(beforeSourceCalls);
    act(() => jest.advanceTimersByTime(250));
    await flush();
  }
});

test.each(['gas', 'water', 'liquids', 'logistics'])('%s visible overlay source follows agent country membership and retains source resolution', async carrier => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity', carrier]));
  const sourceRequests = [];
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => {
    if (!String(url).includes(`/api/atlas/${carrier}/network?`)) return normalFetch(url, options);
    const countries = new URL(url, 'http://localhost').searchParams.get('countries');
    sourceRequests.push(countries);
    return Promise.resolve(response({ facilities: (countries || '').split(',').filter(Boolean).map(country => ({
      id: `${carrier}-${country}`, name: `${carrier} ${country}`, country_code: country,
      atlas_domain: 'Grid', latitude: country === 'BE' ? 50 : 47, longitude: 3,
    })), connections: [] }));
  });
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  for (const [intent, params, countries] of [
    ['add_country', { country: 'Belgium', resolution: 'nuts2' }, ['BE', 'FR']],
    ['remove_country', { country: 'France' }, ['BE']],
  ]) {
    interpreterPlan = [{ intent, params }];
    await send(view, `${intent} ${JSON.stringify(params)}`);
    await flush();
    expect(sourceRequests[sourceRequests.length - 1]).toBe(countries.join(','));
    expect(frame().facilities.filter(asset => asset.atlas_network_carrier === carrier).map(asset => asset.id).sort())
      .toEqual(countries.map(country => `${carrier}-${country}`));
    expect(frame().facilities.filter(asset => asset.atlas_network_carrier === 'electricity')
      .every(asset => asset.sourceNetworkFilename.endsWith('_nuts2.nc'))).toBe(true);
    expect(view.getByRole('combobox', { name: 'Network carrier' }).value).toBe(carrier);
    act(() => jest.advanceTimersByTime(250));
    await flush();
  }
  const before = geometry();
  const calls = sourceRequests.length;
  interpreterPlan = [{ intent: 'set_network_resolution', params: { network_carrier: carrier, resolution: 'nuts1' } }];
  await send(view, `change ${carrier} to NUTS1`);
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(geometry()).toEqual(before);
  expect(sourceRequests).toHaveLength(calls);
  expect(view.getByRole('log').textContent).toContain('source');
});

function mockOverlayDomainSource(carrier, requests, fail = () => false) {
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => {
    if (!String(url).includes(`/api/atlas/${carrier}/network?`)) return normalFetch(url, options);
    const query = new URL(url, 'http://localhost').searchParams;
    const countries = (query.get('countries') || '').split(',').filter(Boolean);
    const domains = query.get('domains').split(',');
    requests.push({ countries, domains });
    if (fail(domains)) return Promise.resolve(response({ error: 'Source temporarily unavailable' }, false));
    return Promise.resolve(response({ facilities: countries.flatMap(country => domains.map(domain => ({
      id: `${carrier}-${country}-${domain}`, name: `${carrier} ${country} ${domain}`, country_code: country,
      atlas_domain: domain, latitude: country === 'BE' ? 50 : 47, longitude: 3,
    }))), connections: [] }));
  });
}

test.each(['gas', 'water', 'liquids', 'logistics'])('%s overlay agent hydrates shared domains and hides them without requests', async carrier => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity', carrier]));
  const requests = [];
  mockOverlayDomainSource(carrier, requests);
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  act(() => frame().onViewportCommandApplied(frame().viewportCommand.id));
  await flush();
  for (const domain of ['Supply', 'Demand', 'Storage']) {
    interpreterPlan = [{ intent: 'set_map_layers', params: { layers: [domain], mode: 'replace' } }];
    await send(view, `show only ${domain}`);
    act(() => jest.advanceTimersByTime(250));
    await flush();
    expect(requests[requests.length - 1]).toEqual({ countries: ['FR'], domains: [domain] });
    expect(frame().facilities.some(asset => asset.id === `${carrier}-FR-${domain}`)).toBe(true);
    if (domain !== 'Storage') expect(frame().facilities.some(asset => asset.atlas_network_carrier === 'electricity' && asset.atlas_domain === domain)).toBe(true);
    expect(frame().facilities.every(asset => asset.atlas_domain === domain)).toBe(true);
    expect(frame().connections).toHaveLength(0);
    expect(frame().viewportCommand).toBeNull();
    expect(view.getByRole('combobox', { name: 'Network carrier' }).value).toBe(carrier);
  }
  interpreterPlan = [{ intent: 'set_map_layers', params: { layers: ['Grid', 'Supply'], mode: 'add' } }];
  await send(view, 'add grid and supply');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(frame().connections).toHaveLength(1);
  const beforeRequests = global.fetch.mock.calls.filter(([url]) => /network\?|parse-nc/.test(String(url))).length;
  interpreterPlan = [{ intent: 'set_map_layers', params: { layers: ['Supply'], mode: 'hide' } }];
  await send(view, 'hide supply');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(frame().facilities.some(asset => asset.atlas_domain === 'Supply')).toBe(false);
  expect(frame().connections).toHaveLength(1);
  // The manual toggle and agent share the same hydrated cache.
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();
  expect(frame().facilities.some(asset => asset.id === `${carrier}-FR-Supply`)).toBe(true);
  expect(global.fetch.mock.calls.filter(([url]) => /network\?|parse-nc/.test(String(url)))).toHaveLength(beforeRequests);
});

test.each(['gas', 'water', 'liquids', 'logistics'])('%s overlay compound geography and supply uses newly committed membership', async carrier => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity', carrier]));
  const requests = [];
  mockOverlayDomainSource(carrier, requests);
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  fireEvent.change(view.getByRole('combobox', { name: 'Network carrier' }), { target: { value: carrier } });
  await flush();
  interpreterPlan = [{ intent: 'add_country', params: { country: 'Belgium', resolution: 'nuts2', layers: ['Grid', 'Supply'] } }];
  await send(view, 'add Belgium at NUTS2 with grid and supply');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(new Set(frame().activeCountryCodes)).toEqual(new Set(['BE', 'FR']));
  expect(frame().facilities.filter(asset => asset.atlas_network_carrier === carrier && asset.atlas_domain === 'Supply')
    .map(asset => asset.country_code).sort()).toEqual(['BE', 'FR']);
  expect(frame().facilities.filter(asset => asset.atlas_network_carrier === 'electricity' && asset.atlas_domain === 'Supply')).toHaveLength(2);
  expect(requests.every(request => request.countries.length > 0)).toBe(true);
  expect(requests[requests.length - 1].countries).toEqual(['BE', 'FR']);
  expect(view.getByRole('combobox', { name: 'Network carrier' }).value).toBe(carrier);
});

test.each([false, true])('agent overlay commands retain the conversation panel (already enabled=%s)', async enabled => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  if (enabled) {
    fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
    await flush();
  }
  interpreterPlan = [{ intent: 'set_network_overlay', params: { visible: true, network_carriers: ['electricity'] } }];
  await send(view, 'keep the power overlay enabled');
  expect(view.queryByRole('textbox', { name: 'Message EMIL' })).not.toBeNull();
  expect(view.getByRole('button', { name: 'Toggle multi-network overlay' }).getAttribute('aria-pressed')).toBe('true');
  expect(view.queryByRole('button', { name: 'Collapse carrier overlay legend' })).toBeNull();
});

test('failed overlay layer preserves visibility and manual retry reuses successful carrier caches', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity","gas","water"]');
  const gasRequests = [];
  const waterRequests = [];
  let failWater = true;
  mockOverlayDomainSource('gas', gasRequests);
  mockOverlayDomainSource('water', waterRequests, domains => failWater && domains.includes('Supply'));
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  act(() => frame().onGridAccessChange({ enabled: true }));
  await flush();
  interpreterPlan = [{ intent: 'set_map_layers', params: { layers: ['Supply'], mode: 'replace' } }];
  await send(view, 'show supply');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(view.getByRole('log').textContent).toContain('Water');
  expect(view.getByRole('log').textContent).toContain('Source temporarily unavailable');
  expect(frame().gridAccess.enabled).toBe(true);
  expect(view.getByRole('button', { name: 'Grid map layer', exact: true }).getAttribute('aria-pressed')).toBe('true');
  expect(view.getByRole('button', { name: 'Supply map layer', exact: true }).getAttribute('aria-pressed')).toBe('false');
  expect(frame().facilities.every(asset => asset.atlas_domain === 'Grid')).toBe(true);
  const parsed = parseRequests.length;
  const gasCalls = gasRequests.length;
  failWater = false;
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();
  expect(frame().facilities.filter(asset => asset.atlas_domain === 'Supply')).toHaveLength(3);
  expect(gasRequests).toHaveLength(gasCalls);
  expect(parseRequests).toHaveLength(parsed);
  expect(waterRequests.filter(request => request.domains.includes('Supply'))).toHaveLength(2);
});

test.each(['hide', 'access', 'country'])('late overlay domain completion cannot override a newer %s selection', async change => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["gas"]');
  const requests = [];
  mockOverlayDomainSource('gas', requests);
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  const normalFetch = global.fetch;
  let finish;
  global.fetch = jest.fn((url, options) => {
    const result = normalFetch(url, options);
    if (!String(url).includes('/api/atlas/gas/network?domains=Supply')) return result;
    return Promise.resolve({ ok: true, status: 200, json: () => new Promise(resolve => {
      finish = async () => resolve(await (await result).json());
    }) });
  });
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();
  expect(finish).toBeDefined();
  if (change === 'country') {
    fireEvent.change(view.getByRole('combobox', { name: 'Add country network' }), { target: { value: 'BE' } });
    await flush();
  } else {
    interpreterPlan = [{ intent: 'set_map_layers', params: change === 'hide'
      ? { layers: ['Supply'], mode: 'hide' } : { layers: ['Access'], mode: 'replace' } }];
    await send(view, change === 'hide' ? 'hide supply' : 'show only grid access');
    act(() => jest.advanceTimersByTime(250));
    await flush();
  }
  await act(async () => finish());
  await flush();
  expect(frame().facilities.some(asset => asset.atlas_domain === 'Supply')).toBe(false);
  expect(view.getByRole('button', { name: 'Supply map layer', exact: true }).getAttribute('aria-pressed')).toBe('false');
  if (change === 'country') {
    expect(requests[requests.length - 1].countries).toEqual(['BE', 'FR']);
    expect(new Set(frame().activeCountryCodes)).toEqual(new Set(['BE', 'FR']));
  }
  if (change === 'access') expect(frame().gridAccess.enabled).toBe(true);
});

test('agent can hide an overlay domain while its power batch is still loading', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity"]');
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  holdRequests = true;
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();
  const count = parseRequests.length;
  interpreterPlan = [{ intent: 'set_map_layers', params: { layers: ['Supply'], mode: 'hide' } }];
  await send(view, 'hide supply');
  act(() => jest.advanceTimersByTime(250));
  await flush();
  expect(view.getByRole('log').textContent).toContain('Hidden Supply');
  expect(parseRequests).toHaveLength(count);
  await resolveCountry('FR', true, 'supply');
  await flush();
  expect(frame().facilities.every(asset => asset.atlas_domain === 'Grid')).toBe(true);
  expect(frame().connections).toHaveLength(1);
  expect(view.getByRole('button', { name: 'Supply map layer', exact: true }).getAttribute('aria-pressed')).toBe('false');
});

test.each([false, true])('overlay selected-marker context resolves visible source ownership (collision=%s)', async collision => {
  window.localStorage.setItem('atlas-network-overlay-carriers', '["electricity","gas"]');
  const normalFetch = global.fetch;
  const id = collision ? 'bus-a' : 'gas-asset';
  global.fetch = jest.fn((url, options) => String(url).includes('/api/atlas/gas/network?')
    ? Promise.resolve(response({ facilities: [{ id, name: 'Gas asset', country_code: 'FR', atlas_domain: 'Grid', latitude: 47, longitude: 3 }], connections: [] }))
    : normalFetch(url, options));
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  act(() => frame().onNodeSelect(id));
  await flush();
  interpreterPlan = [{ intent: 'control_map_view', params: { operation: 'fit_selection' } }];
  await send(view, 'fit the current selection');
  const call = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/api/map-agent/interpret'));
  const marker = JSON.parse(call[1].body).mapContext.selectedMarker;
  if (collision) expect(marker).toEqual({ id, ambiguous: true });
  else expect(marker).toMatchObject({ id, networkCarrier: 'gas', name: 'Gas asset', lat: 47, lon: 3 });
});

test('a known-empty overlay cannot accidentally replace power, and empty selections remain removable', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['gas']));
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(view.getByRole('button', { name: 'Hide Methane gas in overlay' }).textContent).toContain('No records for loaded layers');
  fireEvent.click(view.getByRole('button', { name: 'Hide Methane gas in overlay' }));
  await flush();
  expect(view.queryByRole('button', { name: 'Hide Methane gas in overlay' })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Show Electricity in overlay' }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Show Methane gas in overlay' }));
  await flush();
  const before = geometry();
  fireEvent.click(view.getByRole('button', { name: 'Hide Electricity in overlay' }));
  await flush();
  expect(view.getByText(/At least one loaded network must remain selected/)).toBeDefined();
  expect(geometry()).toEqual(before);
});

test('overlapping overlay effects share a two-download limit through JSON body completion', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity', 'gas', 'water', 'liquids', 'logistics']));
  const normalFetch = global.fetch;
  const bodies = [];
  let active = 0;
  let peak = 0;
  global.fetch = jest.fn((url, options) => {
    const match = String(url).match(/\/api\/atlas\/(gas|water|liquids|logistics)\/network\?/);
    if (!match) return normalFetch(url, options);
    return Promise.resolve({ ok: true, json: () => new Promise(resolve => {
      active += 1; peak = Math.max(peak, active);
      bodies.push(() => { active -= 1; resolve({ facilities: [{ id: `${match[1]}-a`, component_type: 'Bus', country_code: 'FR', latitude: 49, longitude: 2 }], connections: [] }); });
    }) });
  });
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(bodies).toHaveLength(2);
  expect(peak).toBe(2);
  for (let index = 0; index < 4; index += 1) {
    await act(async () => bodies[index]());
    await flush();
    expect(active).toBeLessThanOrEqual(2);
  }
  expect(bodies).toHaveLength(4);
  expect(peak).toBe(2);
  expect(new Set(frame().facilities.map(f => f.atlas_network_carrier))).toEqual(new Set(['electricity', 'gas', 'water', 'liquids', 'logistics']));
});

test.each([
  ['gas', 'Methane gas'], ['water', 'Water & wastewater'],
  ['liquids', 'Oil & energy liquids'], ['logistics', 'Ports & air freight'],
])('%s overlay initialisation failure stops retrying automatically and explicit reselection can recover', async (carrier, label) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity']));
  const normalFetch = global.fetch;
  let statusCalls = 0;
  let recovered = false;
  global.fetch = jest.fn((url, options) => {
    if (String(url).endsWith(`/api/atlas/${carrier}/status`)) {
      statusCalls += 1;
      // Bound the pre-fix retry loop so this regression can fail rather than
      // leaving the test process in an unending microtask/update cycle.
      if (!recovered && statusCalls > 2) return new Promise(() => {});
      return Promise.resolve(response(recovered ? { available: true, countries: ['FR'] } : { error: 'Source temporarily unavailable' }, recovered));
    }
    if (recovered && String(url).includes(`/api/atlas/${carrier}/network?`)) return Promise.resolve(response({
      facilities: [{ id: 'gas-a', component_type: 'Bus', country_code: 'FR', latitude: 49, longitude: 2 }], connections: [],
    }));
    return normalFetch(url, options);
  });
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: `Show ${label} in overlay` }));
  await flush();
  expect(statusCalls).toBe(1);
  fireEvent.click(view.getByRole('button', { name: 'Node markers', exact: true }));
  fireEvent.click(view.getByRole('button', { name: 'Grid map layer', exact: true }));
  await flush();
  expect(statusCalls).toBe(1);
  expect(view.getByRole('button', { name: `Hide ${label} in overlay` }).textContent).toContain('Load failed');
  recovered = true;
  fireEvent.click(view.getByRole('button', { name: `Hide ${label} in overlay` }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: `Show ${label} in overlay` }));
  await flush();
  expect(statusCalls).toBe(2);
  expect(view.getByRole('button', { name: `Hide ${label} in overlay` }).textContent).not.toContain('Load failed');
  fireEvent.click(view.getByRole('button', { name: 'Show Grid', exact: true }));
  await flush();
  expect(frame().facilities.some(facility => facility.atlas_network_carrier === carrier)).toBe(true);
});

test.each([
  ['gas', 'Methane gas'], ['water', 'Water & wastewater'],
  ['liquids', 'Oil & energy liquids'], ['logistics', 'Ports & air freight'],
])('%s failed country rescope stops automatically; domain retry stays country-scoped', async (carrier, label) => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity']));
  const normalFetch = global.fetch;
  const scopes = [];
  const requestedDomains = [];
  let fail = false;
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes(`/api/atlas/${carrier}/network?`)) {
      const scope = new URL(String(url), 'http://localhost').searchParams.get('countries');
      const domain = new URL(String(url), 'http://localhost').searchParams.get('domains');
      scopes.push(scope);
      requestedDomains.push(domain);
      if (scopes.length > 5) return new Promise(() => {}); // Bound any regression loop.
      return Promise.resolve(response(fail ? { error: 'Source temporarily unavailable' } : {
        facilities: [{ id: `asset-${domain}`, component_type: domain === 'Supply' ? 'Generator' : 'Bus', atlas_domain: domain === 'Supply' ? 'Supply' : 'Grid', country_code: 'FR', latitude: 49, longitude: 2 }], connections: [],
      }, !fail));
    }
    return normalFetch(url, options);
  });
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: `Show ${label} in overlay` }));
  await flush();
  expect(scopes).toEqual(['FR']);
  fail = true;
  fireEvent.change(view.getByRole('combobox', { name: 'Add country network' }), { target: { value: 'BE' } });
  await flush();
  expect(scopes).toEqual(['FR', 'BE,FR']);
  expect(view.getByText(/Some carrier data could not be filtered/)).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: 'Grid map layer', exact: true }));
  await flush();
  // Explicitly retrying Grid is allowed, but must not download all Europe or
  // restart an automatic loading loop when that retry also fails.
  expect(scopes).toEqual(['FR', 'BE,FR', 'BE,FR']);
  expect(view.getByText(/Some carrier data could not be filtered/)).toBeDefined();
  fail = false;
  fireEvent.click(view.getByRole('button', { name: 'Remove Belgium' }));
  await flush();
  expect(scopes).toEqual(['FR', 'BE,FR', 'BE,FR', 'FR']);
  expect(view.getByRole('button', { name: `Hide ${label} in overlay` }).textContent).not.toContain('Load failed');
  expect(view.queryByText(/Some carrier data could not be filtered/)).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer', exact: true }));
  await flush();
  expect(scopes).toEqual(['FR', 'BE,FR', 'BE,FR', 'FR', 'FR']);
  expect(requestedDomains.at(-1)).toBe('Supply');
  expect(frame().facilities.some(facility => facility.atlas_network_carrier === carrier && facility.component_type === 'Generator')).toBe(true);
});

test('empty overlay recovers hidden Grid from cache without stale guard warnings or camera movement', async () => {
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity']));
  const view = await loadCountries(['FR']);
  act(() => frame().onViewportCommandApplied(frame().viewportCommand.id));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  const before = geometry();
  const requests = parseRequests.length;
  fireEvent.click(view.getByRole('button', { name: 'Hide Electricity in overlay' }));
  await flush();
  expect(view.getByText(/At least one loaded network must remain selected/)).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: 'Grid map layer', exact: true }));
  await flush();
  expect(view.queryByText(/At least one loaded network must remain selected/)).toBeNull();
  expect(view.getByRole('status', { name: 'Empty network overlay' }).textContent).toContain('Your networks are still loaded');
  expect(view.getByRole('button', { name: 'Hide Electricity in overlay' }).textContent).toContain('Loaded · hidden by filters');
  expect(frame().facilities).toHaveLength(0);
  expect(frame().connections).toHaveLength(0);
  expect(frame().viewportCommand).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Show Grid', exact: true }));
  await flush();
  expect(view.queryByRole('status', { name: 'Empty network overlay' })).toBeNull();
  expect(geometry()).toEqual(before);
  expect(parseRequests).toHaveLength(requests);
  expect(frame().viewportCommand).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Hide Electricity in overlay' }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Dismiss overlay notice' }));
  await flush();
  expect(view.queryByText(/At least one loaded network must remain selected/)).toBeNull();
  expect(geometry()).toEqual(before);
});

test('desktop asset inspection hides panels temporarily without changing layers, camera or saved choices', async () => {
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  const before = geometry();
  const requestsBefore = parseRequests.length;
  expect(view.getByRole('button', { name: 'Collapse carrier overlay legend' })).toBeDefined();
  act(() => frame().onPopupVisibilityChange(true));
  expect(frame().panelsHidden).toBe(true);
  expect(frame().controlsHidden).toBe(false);
  expect(view.queryByRole('combobox', { name: 'Add country network' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Collapse carrier overlay legend' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Open carrier overlay legend' })).toBeNull();
  act(() => frame().onPopupVisibilityChange(false));
  expect(frame().panelsHidden).toBe(false);
  expect(view.getByRole('combobox', { name: 'Add country network' })).toBeDefined();
  expect(view.getByRole('button', { name: 'Collapse carrier overlay legend' })).toBeDefined();
  act(() => frame().onGridAccessChange({ panelOpen: true }));
  await flush();
  const settings = frame().gridAccess;
  act(() => frame().onPopupVisibilityChange(true));
  expect(frame().gridAccess).toEqual(settings);
  act(() => frame().onPopupVisibilityChange(false));
  expect(frame().gridAccess.panelOpen).toBe(true);
  expect(geometry()).toEqual(before);
  expect(parseRequests).toHaveLength(requestsBefore);
});

test('asset inspection preserves conversation drafts and live voice controls without restarting voice', async () => {
  const voice = { active: true, speaking: true, statusLabel: 'EMIL speaking', mode: 'conversation', micDevices: [],
    stop: jest.fn(), cancelSpeech: jest.fn(), toggle: jest.fn(), setMode: jest.fn(),
    micLevelStore: { subscribe: () => () => {}, getSnapshot: () => 0 } };
  const mockVoice = jest.spyOn(voiceHook, 'default').mockReturnValue(voice);
  try {
    const view = await loadCountries(['FR']);
    fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
    fireEvent.change(view.getByRole('textbox', { name: 'Message EMIL' }), { target: { value: 'My next instruction' } });
    const before = geometry();
    const requests = parseRequests.length;
    act(() => frame().onPopupVisibilityChange(true));
    expect(view.queryByRole('region', { name: 'Map assistant' })).toBeNull();
    expect(view.queryByRole('textbox', { name: 'Message EMIL' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Stop EMIL speaking' }));
    expect(voice.cancelSpeech).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Stop live voice' })).toBeDefined();
    const dismissal = frame().popupDismissRequest;
    fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
    expect(frame().popupDismissRequest).toBe(dismissal + 1);
    act(() => frame().onPopupVisibilityChange(false));
    expect(view.getByRole('textbox', { name: 'Message EMIL' }).value).toBe('My next instruction');
    expect(document.activeElement).toBe(view.getByRole('textbox', { name: 'Message EMIL' }));
    expect(voice.toggle).not.toHaveBeenCalled();
    expect(voice.stop).not.toHaveBeenCalled();
    expect(geometry()).toEqual(before);
    expect(parseRequests).toHaveLength(requests);
  } finally { cleanup(); mockVoice.mockRestore(); }
});

test('voice commands identify themselves to the model planner without rewriting the transcript', async () => {
  let voiceOptions;
  const voice = {
    active: false, speaking: false, phase: 'idle', transport: '', statusLabel: 'Voice off',
    mode: 'commands', micDevices: [], selectedMicDeviceId: '', queueDepth: 0, partial: '',
    warning: '', error: '', fallbackRecording: false,
    stop: jest.fn(), cancelSpeech: jest.fn(), toggle: jest.fn(), setMode: jest.fn(),
    selectMicDevice: jest.fn(), clearQueue: jest.fn(), retry: jest.fn(),
    micLevelStore: { subscribe: () => () => {}, getSnapshot: () => 0 },
  };
  const mockVoice = jest.spyOn(voiceHook, 'default').mockImplementation((options) => {
    voiceOptions = options;
    return voice;
  });
  try {
    render(<App />);
    await flush();
    interpreterPlan = [{ intent: 'describe_capabilities', params: {} }];
    act(() => { void voiceOptions.onCommand('show friends at nuts three', {
      source: 'voice', voiceMode: 'conversation',
    }); });
    await flush();
    const call = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/api/map-agent/interpret'));
    expect(call).toBeDefined();
    const body = JSON.parse(call[1].body);
    expect(body.message).toBe('show friends at nuts three');
    expect(body.mapContext).toMatchObject({
      requestSurface: 'voice', inputSource: 'voice_transcription', voiceMode: 'conversation',
    });
    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await flush();
  } finally { cleanup(); mockVoice.mockRestore(); }
});

test.each(['realtime', 'upload'])('short-height assistant retains draft, reading position and voice stop controls with %s transport', async (transport) => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = jest.fn(query => ({ matches: query.includes('max-height'), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  const voice = { active: true, speaking: true, transport, statusLabel: 'EMIL speaking', mode: 'conversation', micDevices: [],
    stop: jest.fn(), cancelSpeech: jest.fn(), toggle: jest.fn(), setMode: jest.fn(),
    micLevelStore: { subscribe: () => () => {}, getSnapshot: () => 0 } };
  const mockVoice = jest.spyOn(voiceHook, 'default').mockReturnValue(voice);
  try {
    const view = await loadCountries(['FR']);
    fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
    const input = view.getByRole('textbox', { name: 'Message EMIL' });
    fireEvent.change(input, { target: { value: 'Keep this unsent instruction' } });
    const before = geometry();
    const requests = parseRequests.length;
    const log = view.getByRole('log', { name: 'Conversation with EMIL' });
    Object.defineProperties(log, { scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 100 } });
    log.scrollTop = 150;
    fireEvent.scroll(log);
    const settings = view.getByRole('button', { name: 'Voice and map settings' });
    expect(settings.getAttribute('aria-expanded')).toBe('false');
    expect(view.queryByRole('switch', { name: 'Allow AI to control the map viewport' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Stop EMIL speaking' }));
    expect(voice.cancelSpeech).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: transport === 'upload' ? 'Record a command for EMIL' : 'Turn live voice off' })).toBeDefined();
    fireEvent.click(view.getByRole('button', { name: 'Stop live voice' }));
    expect(voice.stop).toHaveBeenCalledTimes(1);
    fireEvent.click(settings);
    expect(view.queryByRole('log')).toBeNull();
    expect(view.queryByRole('button', { name: 'Jump to latest EMIL message' })).toBeNull();
    fireEvent.click(view.getByRole('switch', { name: 'Allow AI to control the map viewport' }));
    fireEvent.click(settings);
    expect(view.getByRole('log').scrollTop).toBe(150);
    expect(input.value).toBe('Keep this unsent instruction');
    fireEvent.click(settings);
    expect(view.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(voice.toggle).not.toHaveBeenCalled();
    expect(voice.stop).toHaveBeenCalledTimes(1);
    expect(geometry()).toEqual(before);
    expect(parseRequests).toHaveLength(requests);
  } finally { cleanup(); mockVoice.mockRestore(); window.matchMedia = originalMatchMedia; }
});

test.each(['Message EMIL', 'Place drill-down'])('IME confirmation in %s does not send an unfinished instruction', async (label) => {
  const view = await loadCountries(['FR']);
  if (label === 'Message EMIL') fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  const input = view.getByRole('textbox', { name: label });
  fireEvent.change(input, { target: { value: 'フランスを表示' } });
  const plannerCalls = () => global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/map-agent/interpret')).length;
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  await flush();
  expect(plannerCalls()).toBe(0);
  expect(input.value).toBe('フランスを表示');
  fireEvent.keyDown(input, { key: 'Enter', isComposing: false, keyCode: 13 });
  await flush();
  expect(plannerCalls()).toBe(1);
});

test('bounded generation overview reports omitted sites and clears the notice when full detail returns', async () => {
  const view = await loadCountries(['FR']);
  act(() => frame().onRenderStatsChange({ renderedLinks: 1, unmappedLinks: 0, renderingLinks: false, renderError: '', generationSitesRendered: 180, generationSitesInView: 240 }));
  expect(view.getByText(/Generation overview: 180 of 240 sites in view/)).toBeDefined();
  act(() => frame().onRenderStatsChange({ renderedLinks: 1, unmappedLinks: 0, renderingLinks: false, renderError: '', generationSitesRendered: 240, generationSitesInView: 240 }));
  expect(view.queryByText(/Generation overview:/)).toBeNull();
});

test.each([false, true])('lazy layer loading retains Grid-owned boundaries with compact capability=%s', async (capable) => {
  compactOverlayCapability = capable;
  const view = await loadCountries(['FR']);
  const boundaries = frame().geoJsonOverlays;
  const shapes = boundaries.map(overlay => overlay.feature_collection);
  const gridRequest = parseRequests.find(request => request.component_scope === 'grid');
  expect(gridRequest).not.toHaveProperty('include_geojson_overlays');
  for (const layer of ['Supply', 'Storage', 'Demand']) {
    fireEvent.click(view.getByRole('button', { name: `${layer} map layer` }));
    await flush();
    const request = parseRequests.find(request => request.component_scope === layer.toLowerCase());
    if (capable) expect(request.include_geojson_overlays).toBe(false);
    else expect(request).not.toHaveProperty('include_geojson_overlays');
    expect(frame().geoJsonOverlays).toHaveLength(shapes.length);
    frame().geoJsonOverlays.forEach((overlay, index) => expect(overlay.feature_collection).toBe(shapes[index]));
  }
  expect(frame().connections[0].s_nom).toBe(1234);
});

test('saved overlays restore enabled data and filters, but do not reopen overlapping controls', async () => {
  window.localStorage.setItem('atlas-land-overlay', JSON.stringify({ enabled: true, panelOpen: true, categories: ['forest'], countries: ['FR'], followMapCountries: false, opacity: 45 }));
  window.localStorage.setItem('atlas-grid-access-overlay', JSON.stringify({ enabled: true, panelOpen: true, metric: 'queued_mw', projectScope: 'all' }));
  const view = await loadCountries(['FR']);
  expect(frame().landConstraints).toMatchObject({ enabled: true, panelOpen: false, categories: ['forest'], countries: ['FR'], followMapCountries: false, opacity: 45 });
  expect(frame().gridAccess).toMatchObject({ enabled: true, panelOpen: false, metric: 'queued_mw', projectScope: 'all' });
  expect(view.getByRole('button', { name: 'Open map assistant' })).toBeDefined();
  expect(view.queryByRole('textbox', { name: 'Message EMIL' })).toBeNull();
});

test('compact workspace alternates domains, map layers and EMIL without reloading or moving the network', async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = jest.fn(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  try {
    const view = render(<App />);
    await flush();
    expect(view.getByRole('button', { name: 'Show domain controls' })).toBeDefined();
    expect(frame().controlsHidden).toBe(false);
    fireEvent.click(view.getByRole('button', { name: 'Show domain controls' }));
    expect(frame().controlsHidden).toBe(true);
    expect(view.queryByRole('group', { name: 'Map layers and display' })).toBeNull();
    const domainSections = view.getByRole('group', { name: 'Domain sections' });
    expect(within(domainSections).getByRole('button', { name: 'Geography' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(domainSections).getByRole('button', { name: 'Operations' }));
    expect(within(domainSections).getByRole('button', { name: 'Operations' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.queryByRole('combobox', { name: 'Add country network' })).toBeNull();
    fireEvent.click(within(domainSections).getByRole('button', { name: 'Geography' }));
    fireEvent.change(view.getByRole('combobox', { name: 'Add country network' }), { target: { value: 'FR' } });
    await flush();
    act(() => frame().onViewportCommandApplied(frame().viewportCommand.id));
    await flush();
    const before = geometry();
    const requestsBefore = parseRequests.length;
    fireEvent.click(view.getByRole('button', { name: 'Hide domain controls' }));
    expect(frame().controlsHidden).toBe(false);
    act(() => frame().onPopupVisibilityChange(true));
    expect(frame().controlsHidden).toBe(true);
    expect(view.queryByRole('button', { name: 'Show domain controls' })).toBeNull();
    expect(view.queryByRole('group', { name: 'Map layers and display' })).toBeNull();
    act(() => frame().onPopupVisibilityChange(false));
    expect(frame().controlsHidden).toBe(false);
    expect(view.getByRole('button', { name: 'Grid map layer' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
    fireEvent.change(view.getByRole('textbox', { name: 'Message EMIL' }), { target: { value: 'My unsent instruction' } });
    expect(view.queryByRole('group', { name: 'Map layers and display' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Show domain controls' }));
    expect(view.queryByRole('textbox', { name: 'Message EMIL' })).toBeNull();
    expect(view.getByRole('combobox', { name: 'Add country network' })).toBeDefined();
    fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
    expect(view.getByRole('textbox', { name: 'Message EMIL' }).value).toBe('My unsent instruction');
    expect(view.getByRole('button', { name: 'Show domain controls' })).toBeDefined();
    expect(geometry()).toEqual(before);
    expect(parseRequests).toHaveLength(requestsBefore);
    expect(frame().viewportCommand).toBeNull();
  } finally {
    window.matchMedia = originalMatchMedia;
  }
});

test('single-carrier and overlay views both retain source routes with matching endpoint IDs', async () => {
  extraGridConnections = [{ id: 'routed-loop', from: 'bus-a', to: 'bus-a', type: 'line', carrier: 'AC', coordinates: [[2.35, 48.85], [2.5, 48.95], [2.35, 48.85]] }];
  window.localStorage.setItem('atlas-network-overlay-carriers', JSON.stringify(['electricity']));
  const view = await loadCountries(['FR']);
  expect(frame().connections).toHaveLength(2);
  const before = frame().connections.map(({ from, to, coordinates }) => ({ from, to, coordinates }));
  fireEvent.click(view.getByRole('button', { name: 'Toggle multi-network overlay' }));
  await flush();
  expect(frame().connections).toHaveLength(2);
  expect(frame().connections.map(({ from, to, coordinates }) => ({ from, to, coordinates }))).toEqual(before);
  expect(view.getByRole('button', { name: 'Hide Electricity in overlay' }).textContent).toContain('2 links loaded');
  act(() => frame().onRenderStatsChange({ renderedLinks: 2, unmappedLinks: 0 }));
  await flush();
  expect(view.getByLabelText('Rendered network links').textContent).toBe('2');
});

test('inspecting imported nodes does not activate the legacy two-click connection editor', async () => {
  await loadCountries(['FR']);
  const before = geometry();
  act(() => frame().onNodeSelection(frame().facilities[0].id));
  expect(frame().selectedNodes).toEqual([]);
  act(() => frame().onNodeSelection(frame().facilities[1].id));
  expect(frame().selectedNodes).toEqual([]);
  expect(geometry()).toEqual(before);
});

test('loaded nodes retain source capacity and provisional demand without unused synthetic profiles', async () => {
  const view = await loadCountries(['FR']);
  fireEvent.click(view.getByRole('button', { name: 'Supply map layer' }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Demand map layer' }));
  await flush();
  const facilities = frame().facilities;
  expect(facilities.find((facility) => facility.component_type === 'Generator').p_nom).toBe(400);
  expect(facilities.find((facility) => facility.component_type === 'Load')).toMatchObject({
    p_set: 11.4155, annual_energy_gwh: 100, provisional_demand: true,
    demand_breakdown: [{ sector: 'residential', subsector: 'heating', annual_energy_gwh: 100 }],
  });
  for (const facility of facilities) {
    expect(facility).not.toHaveProperty('demandProfile');
    for (const colocated of facility.sameLocationFacilities || []) {
      expect(colocated).not.toHaveProperty('demandProfile');
    }
  }
  expect(frame().connections).toHaveLength(1);
});

test('Kosovo catalogue and loaded-country controls display the country name', async () => {
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => String(url).includes('/api/pypsa/list-files')
    ? Promise.resolve(response({ source: 'local', files: [{ filename: 'base_XK_nuts3.nc',
      is_geographic_cluster: true, geographic_country: 'XK', geographic_level: 'nuts3', geographic_clusters: 1 }] }))
    : normalFetch(url, options));
  const view = await loadCountries(['XK']);
  expect(view.getByRole('button', { name: 'Remove Kosovo', exact: true })).toBeDefined();
  expect(view.getByRole('button', { name: 'Kosovo', exact: true })).toBeDefined();
});
