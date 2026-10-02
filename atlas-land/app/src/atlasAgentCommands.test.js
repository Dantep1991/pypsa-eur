import {
  ATLAS_AGENT_PARAMETER_CATALOG,
  checkAtlasInfrastructureActionState,
  checkAtlasElectricityActionState,
  extractAtlasCountryCodes,
  extractAtlasCountryGroups,
  normalizeAtlasResolution,
  normalizeAtlasAgentSettingValue,
  normalizeAtlasModelPlan,
  reconcileAtlasAnaphoricCarrierPlan,
  readAtlasModelCountries,
  readAtlasCountryResolutionOverrides,
  parseAtlasAgentCommand,
  parseAtlasSettingIssues,
  parseAtlasSettingUpdates,
} from './atlasAgentCommands';

test.each([
  [{ countries: ['BE', 'France', 'BE'] }, ['BE', 'FR']],
  [{ country: 'Belgium and France' }, ['BE', 'FR']],
  [{ country: 'BE, FR' }, ['BE', 'FR']],
  [{ country: 'Bosnia and Herzegovina and France' }, ['BA', 'FR']],
  [{ country: 'Belgium, France and Spain' }, ['BE', 'FR', 'ES']],
])('model country fields preserve the entire selection: %j', (params, countries) => {
  expect(readAtlasModelCountries(params)).toEqual({ countries, place: '' });
});
test.each([{ countries: [] }, { countries: 'BE, FR' }, { countries: ['BE', 'Atlantis'] },
  { country: 'Belgium and Atlantis' }, { country: 'Atlantis and Belgium' }, { country: 'Belgium and' }])(
  'ambiguous model country lists cannot become partial loads: %j', (params) => {
    expect(() => readAtlasModelCountries(params)).toThrow();
  });
test('a city location still uses the existing place resolver', () => {
  expect(readAtlasModelCountries({ location: 'Paris, France' })).toEqual({ countries: [], place: 'Paris, France' });
});

test('reads individual and other-country resolution overrides', () => {
  expect(readAtlasCountryResolutionOverrides({
    resolutions_by_country: { France: 'NUTS2', ES: 'Full / Nodal / 220 kV' },
    other_resolution: 'full',
  })).toEqual({ resolutionsByCountry: { FR: 'nuts2', ES: 'full' }, otherResolution: 'full' });
  expect(() => readAtlasCountryResolutionOverrides({ other_resolution: 'nuts9' })).toThrow(/Unknown resolution/);
});

test('folds an other-country Full instruction into one mixed add action', () => {
  expect(normalizeAtlasModelPlan([
    { intent: 'add_country', params: { countries: ['FR'], resolution: 'nuts2' } },
    { intent: 'set_network_resolution', params: { resolution: 'full' } },
  ])).toEqual([{ intent: 'add_country', params: {
    countries: ['FR'], resolution: 'nuts2', other_resolution: 'full',
  } }]);
});

test.each([true, false])('redundant global resolution cannot flash before country update (%s)', globalFirst => {
  const global = { intent: 'set_network_resolution', params: { resolution: 'full' } };
  const country = { intent: 'add_country', params: { countries: ['FR'], resolution: 'full' } };
  expect(normalizeAtlasModelPlan(globalFirst ? [global, country] : [country, global])).toEqual([country]);
});

test('scoped slider request becomes a country-only atomic update', () => {
  expect(normalizeAtlasModelPlan([{ intent: 'set_network_resolution', params: {
    countries: ['FR'], resolution: 'full',
  } }])).toEqual([{ intent: 'add_country', params: { countries: ['FR'], resolution: 'full' } }]);
  expect(normalizeAtlasModelPlan([{ intent: 'set_network_resolution', params: { resolution: 'full' } }]))
    .toEqual([{ intent: 'set_network_resolution', params: { resolution: 'full' } }]);
});

test('carrier switch and geography are normalized into one atomic country action', () => {
  const plan = normalizeAtlasModelPlan([
    { intent: 'set_network_carrier', params: { network_carrier: 'gas' } },
    { intent: 'load_country', params: { countries: ['BA', 'AL'], layers: ['Grid'] } },
  ]);
  expect(plan).toEqual([{ intent: 'load_country', params: {
    countries: ['BA', 'AL'], layers: ['Grid'], network_carrier: 'gas',
  } }]);
  expect(normalizeAtlasModelPlan([
    { intent: 'set_network_carrier', params: { network_carrier: 'water' } },
    { intent: 'load_country_groups', params: { groups: ['Balkans'] } },
  ])).toEqual([{ intent: 'load_country_groups', params: { groups: ['Balkans'], network_carrier: 'water' } }]);
  expect(normalizeAtlasModelPlan([
    { intent: 'set_network_carrier', params: { network_carrier: 'gas' } },
    { intent: 'load_country', params: { countries: ['BE'], network_carrier: 'water' } },
  ])).toEqual([]);
});

test('local fallback checks a completed infrastructure country and layer change', () => {
  const before = { networkCarrier: 'water', loadedCountryCodes: ['EE', 'LV', 'LT'], visibleMapLayers: ['Grid', 'Demand'] };
  const after = { networkCarrier: 'water', activeNetwork: 'atlas_water.db', loadedCountryCodes: ['EE', 'LT', 'LV', 'PL'], visibleMapLayers: ['Grid', 'Demand'] };
  const action = { intent: 'add_country', params: { countries: ['PL'], network_carrier: 'water' } };
  expect(checkAtlasInfrastructureActionState(action, before, after)).toBe(true);
  expect(checkAtlasInfrastructureActionState(action, before, { ...after, visibleMapLayers: ['Grid'] })).toBe(false);
  expect(checkAtlasInfrastructureActionState(action, before, { ...after, loadedCountryCodes: ['PL'] })).toBe(false);
});

test('local fallback distinguishes all Europe from a Baltic subset', () => {
  const before = { networkCarrier: 'water', visibleMapLayers: ['Grid'] };
  const after = { networkCarrier: 'water', activeNetwork: 'atlas_water.db',
    availableCountryCodes: ['EE', 'LT', 'LV', 'PL'], loadedCountryCodes: ['EE', 'LT', 'LV', 'PL'], visibleMapLayers: ['Grid'] };
  expect(checkAtlasInfrastructureActionState({ intent: 'load_all_countries', params: { network_carrier: 'water' } }, before, after)).toBe(true);
  expect(checkAtlasInfrastructureActionState({ intent: 'load_country_groups', params: { groups: ['Baltics'], network_carrier: 'water' } }, before, after)).toBe(false);
  expect(checkAtlasInfrastructureActionState(
    { intent: 'load_country_groups', params: { groups: ['Balkans'], network_carrier: 'gas' } },
    { networkCarrier: 'gas', visibleMapLayers: ['Grid'] },
    { networkCarrier: 'gas', activeNetwork: 'atlas_gas.db',
      availableCountryCodes: ['AL', 'BG', 'HR', 'GR', 'MK', 'RO', 'RS', 'SI'],
      loadedCountryCodes: ['AL', 'BG', 'HR', 'GR', 'MK', 'RO', 'RS', 'SI'], visibleMapLayers: ['Grid'] },
  )).toBe(true);
  expect(checkAtlasInfrastructureActionState({ intent: 'control_map_view', params: { operation: 'isolate' } }, before, after)).toBeNull();
});

test('same geography on electricity transfers the sole visible methane scope, not the exit workspace', () => {
  const context = { networkCarrier: 'overlay', workspaceCarrier: 'gas', networkOverlayMode: true,
    overlayNetworkCarriers: ['gas'], overlayCarrierScopes: { gas: { countries: ['FR'], domains: ['Grid'] } },
    loadedCountryCodes: ['BE'], networkResolution: 'nuts3', visibleMapLayers: ['Grid'] };
  const plan = [{ intent: 'set_network_carrier', params: { network_carrier: 'electricity' } }];
  expect(reconcileAtlasAnaphoricCarrierPlan('show me this for electricity', plan, context)).toEqual([
    { intent: 'load_country', params: { countries: ['FR'], network_carrier: 'electricity', resolution: 'nuts3', layers: ['Grid'] } },
  ]);
  expect(reconcileAtlasAnaphoricCarrierPlan('show electricity', plan, context)).toBe(plan);
  expect(reconcileAtlasAnaphoricCarrierPlan('show me this for electricity', plan,
    { ...context, overlayNetworkCarriers: ['gas', 'water'] })).toBe(plan);
});

test('local electricity verification rejects methane-only overlay even when power countries loaded', () => {
  const action = { intent: 'load_country', params: { countries: ['FR'], network_carrier: 'electricity', resolution: 'nuts3', layers: ['Grid'] } };
  const after = { networkCarrier: 'overlay', networkOverlayMode: true, overlayNetworkCarriers: ['gas'],
    loadedCountryCodes: ['FR'], networkResolution: 'nuts3', visibleMapLayers: ['Grid'] };
  expect(checkAtlasElectricityActionState(action, {}, after)).toBe(false);
  expect(checkAtlasElectricityActionState(action, {}, { ...after, overlayNetworkCarriers: ['gas', 'electricity'] })).toBe(true);
  expect(checkAtlasElectricityActionState(action, {}, { ...after, networkCarrier: 'electricity', networkOverlayMode: false })).toBe(true);
});

describe('Atlas agent command parser', () => {
  test('loads a mistyped country at an explicit geographic level', () => {
    expect(parseAtlasAgentCommand('show me belgiuim at nuts3 level')).toEqual({
      type: 'country', mode: 'replace', countries: ['BE'], resolution: 'nuts3',
    });
  });

  test('adds rather than replaces when requested', () => {
    expect(parseAtlasAgentCommand('add Sweden at bidding zone level')).toEqual({
      type: 'country', mode: 'add', countries: ['SE'], resolution: 'bidding_zone',
    });
  });

  test('loads the complete country catalogue at one resolution', () => {
    expect(parseAtlasAgentCommand('show me all countries at bidding zone level')).toEqual({
      type: 'all_countries', resolution: 'bidding_zone',
    });
    expect(parseAtlasAgentCommand('show me europe at bidding zone level')).toEqual({
      type: 'all_countries', resolution: 'bidding_zone',
    });
    expect(parseAtlasAgentCommand('load the whole European network at NUTS1')).toEqual({
      type: 'all_countries', resolution: 'nuts1',
    });
  });

  test('turns a mixed TSO request into one atomic multi-focus action', () => {
    expect(parseAtlasAgentCommand('show Germany as a mixed granularity TSO view')).toEqual({
      type: 'mixed_granularity',
      focusCountries: ['DE'],
      levels: { focus: 'full', adjacent: 'nuts3', outer: 'bidding_zone' },
    });
    expect(parseAtlasAgentCommand('show France and Germany as a mixed TSO view across the full model'))
      .toMatchObject({ type: 'mixed_granularity', focusCountries: ['DE', 'FR'], scope: 'full' });
    expect(normalizeAtlasModelPlan([
      { intent: 'set_mixed_granularity', params: { focus_country: 'DE' } },
      { intent: 'set_map_layers', params: { layers: ['Grid', 'Supply'], mode: 'replace' } },
    ])).toEqual([{
      intent: 'set_mixed_granularity',
      params: { focus_country: 'DE', layers: ['Grid', 'Supply'], layer_mode: 'replace' },
    }]);
  });

  test('composes named regions, resolution, and explicitly requested layers', () => {
    expect(extractAtlasCountryGroups('Iberia, the Baltics and the Balkans').map((group) => group.key)).toEqual([
      'iberian_peninsula', 'baltics', 'balkans',
    ]);
    expect(parseAtlasAgentCommand('the iberian peninsula, the baltics and the balkans at NUTS1 level, with grid and Supply')).toEqual({
      type: 'country_groups',
      groups: ['iberian_peninsula', 'baltics', 'balkans'],
      groupLabels: ['Iberian Peninsula', 'Baltics', 'Balkans'],
      countries: ['ES', 'PT', 'EE', 'LV', 'LT', 'AL', 'BA', 'BG', 'HR', 'GR', 'ME', 'MK', 'RO', 'RS', 'SI', 'XK'],
      resolution: 'nuts1',
      domains: ['Grid', 'Supply'],
    });
  });

  test('steps geographic resolution in both directions', () => {
    expect(parseAtlasAgentCommand('increase granularity')).toEqual({ type: 'step_resolution', direction: 1 });
    expect(parseAtlasAgentCommand('reduce granularity')).toEqual({ type: 'step_resolution', direction: -1 });
    expect(parseAtlasAgentCommand('increase to nuts3')).toEqual({ type: 'set_resolution', resolution: 'nuts3' });
    expect(parseAtlasAgentCommand('reduce granularity to NUTS2')).toEqual({ type: 'set_resolution', resolution: 'nuts2' });
  });

  test('recognizes terminal full nodal resolution', () => {
    expect(normalizeAtlasResolution('Full / Nodal / 220 kV')).toBe('full');
    expect(parseAtlasAgentCommand('switch to full resolution')).toEqual({ type: 'set_resolution', resolution: 'full' });
  });

  test('defaults a layer request to single-select supply', () => {
    expect(parseAtlasAgentCommand('show generation')).toEqual({
      type: 'layers', mode: 'replace', domains: ['Supply'], generationMix: true,
    });
  });

  test('supports explicitly requested multi-select and additive layers', () => {
    expect(parseAtlasAgentCommand('show supply and demand')).toEqual({
      type: 'layers', mode: 'replace', domains: ['Supply', 'Demand'],
    });
    expect(parseAtlasAgentCommand('also add storage')).toEqual({
      type: 'layers', mode: 'add', domains: ['Storage'],
    });
    expect(parseAtlasAgentCommand('remove supply from the view')).toEqual({
      type: 'layers', mode: 'hide', domains: ['Supply'],
    });
    expect(parseAtlasAgentCommand('remove the access layer')).toEqual({
      type: 'layers', mode: 'hide', domains: ['Access'],
    });
    expect(parseAtlasAgentCommand('show grid access')).toEqual({
      type: 'layers', mode: 'replace', domains: ['Access'],
    });
    expect(parseAtlasAgentCommand('show grid and access')).toEqual({
      type: 'layers', mode: 'replace', domains: ['Grid', 'Access'],
    });
  });

  test('supports independent generation-mix pie control', () => {
    expect(parseAtlasAgentCommand('hide generation mix pies')).toEqual({
      type: 'generation_mix', visible: false,
    });
  });

  test('recognizes country aliases', () => {
    expect(extractAtlasCountryCodes('add the UK')).toEqual(['GB']);
  });

  test('routes explicit methane country requests to the gas Atlas', () => {
    expect(parseAtlasAgentCommand('show France in the methane network')).toEqual({
      type: 'country', mode: 'replace', countries: ['FR'], resolution: '', networkCarrier: 'gas',
    });
    expect(parseAtlasAgentCommand('show all Europe in the natural gas network')).toEqual({
      type: 'all_countries', resolution: '', networkCarrier: 'gas',
    });
  });

  test('switches network carrier without confusing generation fuel filters', () => {
    expect(parseAtlasAgentCommand('switch to methane gas')).toEqual({
      type: 'network_carrier', carrier: 'gas',
    });
    expect(parseAtlasAgentCommand('show the electricity network')).toEqual({
      type: 'network_carrier', carrier: 'electricity',
    });
    expect(parseAtlasAgentCommand('show gas')).toEqual({
      type: 'carriers', mode: 'show', carriers: ['gas'],
    });
    expect(parseAtlasAgentCommand('show France in the water network')).toEqual({
      type: 'country', mode: 'replace', countries: ['FR'], resolution: '', networkCarrier: 'water',
    });
    expect(parseAtlasAgentCommand('switch to the water Atlas')).toEqual({
      type: 'network_carrier', carrier: 'water',
    });
  });

  test('controls carrier filters and temporal resolution', () => {
    expect(parseAtlasAgentCommand('hide solar')).toEqual({
      type: 'carriers', mode: 'hide', carriers: ['solar'],
    });
    expect(parseAtlasAgentCommand('show only wind and nuclear')).toEqual({
      type: 'carriers', mode: 'only', carriers: ['wind', 'nuclear'],
    });
    expect(parseAtlasAgentCommand('set temporal resolution to hourly')).toEqual({
      type: 'temporal_resolution', value: '1h',
    });
  });

  test('controls water asset classes with natural language', () => {
    expect(parseAtlasAgentCommand('show only desalination plants')).toEqual({
      type: 'carriers', mode: 'only', carriers: ['desalination'],
    });
    expect(parseAtlasAgentCommand('show wastewater treatment plants')).toEqual({
      type: 'carriers', mode: 'show', carriers: ['wastewater_treatment'],
    });
    expect(parseAtlasAgentCommand('hide discharge points')).toEqual({
      type: 'carriers', mode: 'hide', carriers: ['discharge'],
    });
    expect(parseAtlasAgentCommand('show water towers and reservoirs')).toEqual({
      type: 'carriers', mode: 'show', carriers: ['water_tower', 'reservoir'],
    });
    expect(parseAtlasAgentCommand('show agglomerations')).toEqual({
      type: 'carriers', mode: 'show', carriers: ['agglomeration'],
    });
  });

  test('composes water geography and lazy map layers', () => {
    expect(parseAtlasAgentCommand('show Spain in the water network with grid and storage')).toEqual({
      type: 'country', mode: 'replace', countries: ['ES'], resolution: '',
      networkCarrier: 'water', domains: ['Grid', 'Storage'],
    });
    expect(parseAtlasAgentCommand('show Europe in the water network with demand')).toEqual({
      type: 'all_countries', resolution: '', networkCarrier: 'water', domains: ['Demand'],
    });
    expect(parseAtlasAgentCommand('show Malta in the water network with storage')).toEqual({
      type: 'country', mode: 'replace', countries: ['MT'], resolution: '',
      networkCarrier: 'water', domains: ['Storage'],
    });
  });

  test('routes oil-network geography and lazy layers to the liquids Atlas', () => {
    expect(parseAtlasAgentCommand('show France in the oil network with grid and storage')).toEqual({
      type: 'country', mode: 'replace', countries: ['FR'], resolution: '',
      networkCarrier: 'liquids', domains: ['Grid', 'Storage'],
    });
    expect(parseAtlasAgentCommand('show Europe in the liquids Atlas with supply and demand')).toEqual({
      type: 'all_countries', resolution: '', networkCarrier: 'liquids', domains: ['Supply', 'Demand'],
    });
    expect(parseAtlasAgentCommand('switch to petroleum network')).toEqual({
      type: 'network_carrier', carrier: 'liquids',
    });
    // A fuel request without network/Atlas/database wording still applies to
    // the electricity carrier filter.
    expect(parseAtlasAgentCommand('show oil')).toEqual({
      type: 'carriers', mode: 'show', carriers: ['oil'],
    });
  });

  test('routes ports and air freight to the logistics Atlas', () => {
    expect(parseAtlasAgentCommand('show Belgium in the ports Atlas with grid and storage')).toEqual({
      type: 'country', mode: 'replace', countries: ['BE'], resolution: '',
      networkCarrier: 'logistics', domains: ['Grid', 'Storage'],
    });
    expect(parseAtlasAgentCommand('show airports in France')).toEqual({
      type: 'country', mode: 'replace', countries: ['FR'], resolution: '',
      networkCarrier: 'logistics', domains: ['Demand'],
    });
    expect(parseAtlasAgentCommand('switch to port logistics')).toEqual({
      type: 'network_carrier', carrier: 'logistics',
    });
    expect(parseAtlasAgentCommand('show Europe in the air freight Atlas')).toEqual({
      type: 'all_countries', resolution: '', networkCarrier: 'logistics', domains: ['Demand'],
    });
  });

  test('controls the multi-network overlay mode', () => {
    expect(parseAtlasAgentCommand('turn on network overlay mode')).toEqual({
      type: 'network_overlay', visible: true,
    });
    expect(parseAtlasAgentCommand('overlay methane, water and ports')).toEqual({
      type: 'network_overlay', visible: true, carriers: ['gas', 'water', 'logistics'],
    });
    expect(parseAtlasAgentCommand('overlay all networks')).toEqual({
      type: 'network_overlay', visible: true,
      carriers: ['electricity', 'gas', 'water', 'liquids', 'logistics'],
    });
    expect(parseAtlasAgentCommand('return to single network view')).toEqual({
      type: 'network_overlay', visible: false,
    });
    expect(parseAtlasAgentCommand('overlay storage')).toEqual({
      type: 'layers', mode: 'add', domains: ['Storage'],
    });
  });

  test('controls the independent land and constraints overlay', () => {
    expect(parseAtlasAgentCommand('show the land constraints overlay')).toEqual({
      type: 'land_constraints', visible: true, mode: 'replace',
    });
    expect(parseAtlasAgentCommand('show Natura 2000 and agricultural land')).toEqual({
      type: 'land_constraints', visible: true,
      categories: ['protected', 'agriculture'], mode: 'replace',
    });
    expect(parseAtlasAgentCommand('add industrial land and brownfields')).toEqual({
      type: 'land_constraints', visible: true,
      categories: ['industrial'], mode: 'add',
    });
    expect(parseAtlasAgentCommand('hide protected areas')).toEqual({
      type: 'land_constraints', visible: true,
      categories: ['protected'], mode: 'hide',
    });
    expect(parseAtlasAgentCommand('set land overlay opacity to 45 percent')).toEqual({
      type: 'land_constraints', visible: true, mode: 'replace', opacity: 45,
    });
    expect(parseAtlasAgentCommand('show Natura 2000 at 45 percent opacity')).toEqual({
      type: 'land_constraints', visible: true,
      categories: ['protected'], mode: 'replace', opacity: 45,
    });
    expect(parseAtlasAgentCommand('show the natural3000 overlay')).toEqual({
      type: 'land_constraints', visible: true,
      categories: ['protected'], mode: 'replace',
    });
    expect(parseAtlasAgentCommand('show land constraints in Belgium')).toEqual({
      type: 'land_constraints', visible: true, mode: 'replace',
      countries: ['BE'], countryMode: 'replace',
    });
    expect(parseAtlasAgentCommand('add France to the land country filter')).toEqual({
      type: 'land_constraints', visible: true, mode: 'replace',
      countries: ['FR'], countryMode: 'add',
    });
    expect(parseAtlasAgentCommand('show the land overlay for all Europe')).toEqual({
      type: 'land_constraints', visible: true, mode: 'replace',
      countries: [], countryMode: 'replace',
    });
    expect(parseAtlasAgentCommand('turn off the land overlay')).toEqual({
      type: 'land_constraints', visible: false,
    });
  });

  test('keeps the agent catalogue aligned with every exposed More Settings control', () => {
    const expectedKeys = [
      'planning_horizon', 'scenario_name', 'model_scope', 'spatial_resolution', 'snapshot_resolution',
      'clusters', 'cross_border_links', 'transmission_expansion', 'transmission_expansion_limit', 'offshore_network',
      'include_solar', 'include_onwind', 'include_offwind', 'include_gas', 'include_coal', 'include_oil',
      'include_biomass', 'include_hydro', 'include_nuclear', 'include_battery', 'include_pumped_hydro', 'include_hydrogen',
      'sector_heat', 'sector_hydrogen', 'sector_transport', 'sector_industry', 'district_heating', 'ev_demand',
      'electrolysers', 'hydrogen_to_power', 'chp', 'heat_pumps', 'existing_assets_only', 'allow_capacity_expansion',
      'generator_expansion', 'storage_expansion', 'network_expansion', 'solar_p_nom_max', 'wind_p_nom_max',
      'gas_p_nom_max', 'reserve_margin', 'cost_year', 'discount_rate', 'carbon_price', 'gas_price', 'coal_price',
      'oil_price', 'biomass_price', 'voll', 'co2_cap', 'renewable_share_target', 'coal_phaseout_year',
      'nuclear_phaseout', 'gas_allowed_post_year', 'security_constraint', 'unit_commitment', 'ramp_limits',
      'cyclic_storage', 'hydro_inflows', 'allow_curtailment', 'load_shedding', 'solver_name', 'solver_threads',
      'solver_time_limit', 'mip_gap', 'solver_method',
    ];
    const catalogueKeys = ATLAS_AGENT_PARAMETER_CATALOG.map((definition) => definition.key);
    expect(new Set(catalogueKeys).size).toBe(catalogueKeys.length);
    expect(catalogueKeys).toEqual(expect.arrayContaining(expectedKeys));
  });

  test('composes geography, network level, layers, and temporal resolution', () => {
    expect(parseAtlasAgentCommand('show Spain and Portugal at NUTS2 with grid and demand using hourly snapshots')).toEqual({
      type: 'compound',
      actions: [
        {
          type: 'country', mode: 'replace', countries: ['ES', 'PT'], resolution: 'nuts2',
          domains: ['Grid', 'Demand'],
        },
        { type: 'temporal_resolution', value: '1h' },
      ],
    });
  });

  test('applies explicitly named layers to all-country requests', () => {
    expect(parseAtlasAgentCommand('show all countries at bidding zone level with grid and supply')).toEqual({
      type: 'all_countries',
      resolution: 'bidding_zone',
      domains: ['Grid', 'Supply'],
    });
  });

  test('combines a resolution change with a layer selection', () => {
    expect(parseAtlasAgentCommand('switch to NUTS2 and show only demand')).toEqual({
      type: 'set_resolution',
      resolution: 'nuts2',
      domains: ['Demand'],
      layerMode: 'replace',
    });
  });

  test('parses multiple solver controls in one sentence', () => {
    expect(parseAtlasSettingUpdates('use HiPO with 12 solver threads and a 1800 second time limit')).toEqual({
      solver_threads: 12,
      solver_time_limit: 1800,
      solver_method: 'hipo',
    });
    expect(parseAtlasAgentCommand('use HiPO with 12 solver threads and a 1800 second time limit')).toEqual({
      type: 'settings',
      updates: { solver_threads: 12, solver_time_limit: 1800, solver_method: 'hipo' },
    });
  });

  test('distinguishes model settings from similarly named map layers', () => {
    expect(parseAtlasAgentCommand('disable transmission expansion and offshore grid')).toEqual({
      type: 'settings',
      updates: { transmission_expansion: false, offshore_network: false },
    });
  });

  test('handles mixed technology toggles and policy values', () => {
    expect(parseAtlasSettingUpdates('enable solar and nuclear technology but disable coal technology')).toEqual({
      include_solar: true,
      include_coal: false,
      include_nuclear: true,
    });
    expect(parseAtlasSettingUpdates('set renewable share target to 85, discount rate to 5.5 and CO2 cap to 42')).toEqual({
      discount_rate: 5.5,
      co2_cap: 42,
      renewable_share_target: 85,
    });
  });

  test('composes run mode with temporal resolution', () => {
    expect(parseAtlasAgentCommand('build only with hourly snapshots')).toEqual({
      type: 'compound',
      actions: [
        { type: 'temporal_resolution', value: '1h' },
        { type: 'run_mode', mode: 'build_only' },
      ],
    });
  });

  test('reports its control capabilities and rejects invalid setting values', () => {
    expect(parseAtlasAgentCommand('what parameters can you change?')).toEqual({ type: 'capabilities', topic: 'settings' });
    expect(parseAtlasSettingIssues('set solver threads to 0')).toEqual([
      { key: 'solver_threads', label: 'Solver threads', value: 0, constraint: '1–256' },
    ]);
    expect(parseAtlasAgentCommand('set solver threads to 0')).toEqual({
      type: 'invalid_settings',
      issues: [{ key: 'solver_threads', label: 'Solver threads', value: 0, constraint: '1–256' }],
    });
  });

  test('validates model-planned setting values before execution', () => {
    expect(normalizeAtlasAgentSettingValue('solver_threads', 8)).toBe(8);
    expect(normalizeAtlasAgentSettingValue('solver_threads', 0)).toBeUndefined();
    expect(normalizeAtlasAgentSettingValue('offshore_network', 'disabled')).toBe(false);
    expect(normalizeAtlasAgentSettingValue('solver_method', 'interior point')).toBe('hipo');
    expect(normalizeAtlasAgentSettingValue('not_a_control', true)).toBeUndefined();
  });

  test('normalizes flexible model output into an executable multi-action plan', () => {
    expect(normalizeAtlasModelPlan([
      { intent: 'load_all_countries', params: { resolution: 'bidding_zone' } },
      { intent: 'set_map_layers', params: { layers: ['Grid', 'Supply'], mode: 'replace' } },
      { intent: 'set_temporal_resolution', params: { temporal_resolution: '1h' } },
      { intent: 'set_model_settings', params: { solver_threads: 8 } },
    ])).toEqual([
      {
        intent: 'load_all_countries',
        params: {
          resolution: 'bidding_zone',
          layers: ['Grid', 'Supply'],
          layer_mode: 'replace',
        },
      },
      { intent: 'set_temporal_resolution', params: { temporal_resolution: '1h' } },
      { intent: 'set_model_settings', params: { settings: { solver_threads: 8 } } },
    ]);
  });

  test('reduces multiple layer clauses before a geography change', () => {
    expect(normalizeAtlasModelPlan([
      { intent: 'add_country', params: { country: 'Germany' } },
      { intent: 'set_map_layers', params: { layers: ['Supply'], mode: 'hide' } },
      { intent: 'set_map_layers', params: { layers: ['Demand'], mode: 'replace' } },
      { intent: 'set_model_settings', params: { settings: { snapshot_resolution: '1h' } } },
    ], ['Grid', 'Supply'])).toEqual([
      {
        intent: 'add_country',
        params: { country: 'Germany', layers: ['Demand'], layer_mode: 'replace' },
      },
      { intent: 'set_model_settings', params: { settings: { snapshot_resolution: '1h' } } },
    ]);
  });

  test('can parse a valid change for every catalogued build parameter', () => {
    ATLAS_AGENT_PARAMETER_CATALOG.forEach((definition) => {
      const alias = definition.aliases[0];
      if (definition.type === 'boolean') {
        expect(parseAtlasSettingUpdates(`enable ${alias}`)[definition.key]).toBe(true);
        expect(parseAtlasSettingUpdates(`disable ${alias}`)[definition.key]).toBe(false);
        return;
      }
      if (definition.type === 'text') {
        expect(parseAtlasSettingUpdates(`set ${alias} to Stress case`)[definition.key]).toBe('Stress case');
        return;
      }
      if (definition.type === 'enum') {
        const [valueAlias, value] = Object.entries(definition.values)[0];
        expect(parseAtlasSettingUpdates(`set ${alias} to ${valueAlias}`)[definition.key]).toBe(value);
        return;
      }
      if (definition.type === 'number_or_auto') {
        expect(parseAtlasSettingUpdates(`set ${alias} to auto`)[definition.key]).toBe('auto');
        return;
      }
      const sample = definition.options?.[0] ?? definition.min ?? 1;
      expect(parseAtlasSettingUpdates(`set ${alias} to ${sample}`)[definition.key]).toBe(sample);
    });
  });

  test.each([
    ['unload demand', { type: 'layers', mode: 'hide', domains: ['Demand'] }],
    ['overlay storage', { type: 'layers', mode: 'add', domains: ['Storage'] }],
    ['show everything', { type: 'layers', mode: 'replace', domains: ['Grid', 'Storage', 'Supply', 'Demand'] }],
    ['focus on Germany', { type: 'map_view', operation: 'isolate', countries: ['DE'], label: 'DE' }],
    ['remove Germany', { type: 'country', mode: 'remove', countries: ['DE'], resolution: '' }],
    ['make it hourly', { type: 'temporal_resolution', value: '1h' }],
    ['use build and solve', { type: 'run_mode', mode: 'build_solve' }],
    ['hide capacity pies', { type: 'generation_mix', visible: false }],
    ['open the domain controls', { type: 'domain_controls', visible: true }],
    ['open advanced model settings', { type: 'open_settings' }],
  ])('understands natural control variant: %s', (prompt, expected) => {
    expect(parseAtlasAgentCommand(prompt)).toEqual(expected);
  });

  test.each([
    ['zoom in', { type: 'map_view', operation: 'zoom_in', steps: 1 }],
    ['zoom into Paris', { type: 'map_view', operation: 'isolate', countries: [], query: 'paris', label: 'paris' }],
    ['zoom in on Madrid', { type: 'map_view', operation: 'isolate', countries: [], query: 'madrid', label: 'madrid' }],
    ['zoom out two levels', { type: 'map_view', operation: 'zoom_out', steps: 2 }],
    ['rapproche la carte', { type: 'map_view', operation: 'zoom_in', steps: 1 }],
    ['vergrößere die Karte', { type: 'map_view', operation: 'zoom_in', steps: 1 }],
    ['aleja el mapa', { type: 'map_view', operation: 'zoom_out', steps: 1 }],
    ['isolate Belgium', { type: 'map_view', operation: 'isolate', countries: ['BE'], label: 'BE' }],
    ['frame the Iberian peninsula', {
      type: 'map_view', operation: 'isolate', countries: ['ES', 'PT'], label: 'Iberian Peninsula',
    }],
    ['focus the map on SE3', { type: 'map_view', operation: 'isolate', countries: [], query: 'se3', label: 'se3' }],
  ])('parses viewport control without changing map data: %s', (prompt, expected) => {
    expect(parseAtlasAgentCommand(prompt)).toEqual(expected);
  });

  test.each([
    'zoom in and add France',
    'zoom into Paris then show generation',
    'zoom out and switch to NUTS3',
  ])('leaves compound camera/data instructions intact for the planner: %s', (prompt) => {
    expect(parseAtlasAgentCommand(prompt)).toBeNull();
  });
});
