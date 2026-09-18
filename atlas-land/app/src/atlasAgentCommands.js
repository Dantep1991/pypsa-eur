export const ATLAS_RESOLUTION_ORDER = [
  'bidding_zone',
  'ehighway',
  'nuts1',
  'nuts2',
  'nuts3',
  'full',
];

export const ATLAS_RESOLUTION_LABELS = {
  bidding_zone: 'Bidding zone',
  ehighway: 'e-Highway',
  nuts1: 'NUTS1',
  nuts2: 'NUTS2',
  nuts3: 'NUTS3',
  full: 'Full / Nodal / 220 kV',
};

const COUNTRY_ALIASES = {
  AL: ['albania'], AM: ['armenia'], AT: ['austria'], BA: ['bosnia and herzegovina', 'bosnia'],
  BE: ['belgium'], BG: ['bulgaria'], CH: ['switzerland'], CZ: ['czechia', 'czech republic'],
  BY: ['belarus'],
  DE: ['germany'], DK: ['denmark'], EE: ['estonia'], ES: ['spain'], FI: ['finland'],
  FR: ['france'], GB: ['great britain', 'united kingdom', 'uk', 'britain'], GR: ['greece'],
  HR: ['croatia'], HU: ['hungary'], IE: ['ireland'], IT: ['italy'], LT: ['lithuania'],
  LU: ['luxembourg'], LV: ['latvia'], ME: ['montenegro'], MK: ['north macedonia', 'macedonia'],
  MD: ['moldova'], MT: ['malta'],
  NL: ['netherlands', 'holland'], NO: ['norway'], PL: ['poland'], PT: ['portugal'],
  RO: ['romania'], RS: ['serbia'], RU: ['russia'], SE: ['sweden'], SI: ['slovenia'], SK: ['slovakia'],
  TR: ['turkey'], UA: ['ukraine'],
  XK: ['kosovo'],
};

export const ATLAS_COUNTRY_GROUPS = [
  {
    key: 'iberian_peninsula',
    label: 'Iberian Peninsula',
    aliases: ['iberian peninsula', 'iberia'],
    countries: ['ES', 'PT'],
  },
  {
    key: 'baltics',
    label: 'Baltics',
    aliases: ['baltics', 'baltic states', 'baltic countries'],
    countries: ['EE', 'LV', 'LT'],
  },
  {
    key: 'balkans',
    label: 'Balkans',
    aliases: ['balkans', 'balkan peninsula', 'balkan states', 'balkan countries'],
    countries: ['AL', 'BA', 'BG', 'HR', 'GR', 'ME', 'MK', 'RO', 'RS', 'SI', 'XK'],
  },
];

export const ATLAS_AGENT_CAPABILITY_SECTIONS = [
  {
    label: 'Geography',
    controls: 'electricity, methane, water, oil/liquids, or ports/air-freight network; multi-network overlay mode; country filters; named country groups; place drill-down; AI viewport zoom/framing/isolation; electricity Bidding/e-Highway/NUTS1/NUTS2/NUTS3/Full resolution; and mixed TSO rings with a detailed focus country and coarser neighbour rings',
  },
  {
    label: 'Map view',
    controls: 'Grid, Storage, Supply, Demand, node dots, geographic boundary outlines, the Grid Access & Queue overlay, generation-mix pies, carrier filters, and the independent Land & Constraints siting overlay',
  },
  {
    label: 'Operations',
    controls: 'Build only, Build + solve, Solve existing, temporal resolution, HiGHS algorithm, threads, time limit, and MIP gap',
  },
  {
    label: 'Model settings',
    controls: 'network detail, technologies, sectors, expansion, policy, costs, and solver toggles available under More Settings',
  },
  {
    label: 'Region tools',
    controls: 'select, resize, solve, save, load, and delete circular regional studies',
  },
];

// This catalogue is the contract between the natural-language planner and the
// controls in More Settings. Keeping it declarative makes coverage auditable:
// every setting has a canonical key, type, aliases, and (where applicable)
// validation bounds/options.
export const ATLAS_AGENT_PARAMETER_CATALOG = [
  { key: 'planning_horizon', label: 'Planning horizon', type: 'number', aliases: ['planning horizon', 'horizon year', 'horizon'], options: [2025, 2030, 2035, 2040, 2045, 2050] },
  { key: 'weather_year', label: 'Weather year', type: 'number', aliases: ['weather year'], options: [2020, 2022, 2024, 2025] },
  { key: 'scenario_name', label: 'Scenario name', type: 'text', aliases: ['scenario name'] },
  { key: 'model_scope', label: 'Model scope', type: 'enum', aliases: ['model scope'], values: { electricity: 'electricity', 'sector coupled': 'sector-coupled', sectorcoupled: 'sector-coupled' } },
  { key: 'spatial_resolution', label: 'Model spatial resolution', type: 'enum', aliases: ['model spatial resolution', 'advanced spatial resolution'], values: { nuts0: 'NUTS0', nuts1: 'NUTS1', nuts2: 'NUTS2', nuts3: 'NUTS3' } },
  { key: 'snapshot_resolution', label: 'Temporal resolution', type: 'enum', aliases: ['temporal resolution', 'snapshot resolution'], values: { monthly: 'monthly', hourly: '1h', '1h': '1h', '3h': '3h', '6h': '6h', '12h': '12h', '24h': '24h', daily: '24h' } },
  { key: 'clusters', label: 'Clusters / nodes', type: 'number', aliases: ['clusters', 'cluster count', 'access nodes'], min: 16, max: 1024, integer: true },
  { key: 'cross_border_links', label: 'Cross-border links', type: 'boolean', aliases: ['cross border links', 'cross border interconnectors'] },
  { key: 'transmission_expansion', label: 'Transmission expansion', type: 'boolean', aliases: ['transmission expansion', 'grid expansion'] },
  { key: 'transmission_expansion_limit', label: 'Maximum grid expansion', type: 'number', aliases: ['maximum grid expansion', 'max grid expansion', 'transmission expansion limit'], min: 0 },
  { key: 'offshore_network', label: 'Offshore grid', type: 'boolean', aliases: ['offshore grid', 'offshore network'] },
  { key: 'include_solar', label: 'Solar technology', type: 'boolean', aliases: ['solar technology', 'solar generation', 'solar'] },
  { key: 'include_onwind', label: 'Onshore wind technology', type: 'boolean', aliases: ['onshore wind technology', 'onshore wind'] },
  { key: 'include_offwind', label: 'Offshore wind technology', type: 'boolean', aliases: ['offshore wind technology', 'offshore wind'] },
  { key: 'include_gas', label: 'Gas technology', type: 'boolean', aliases: ['gas technology', 'natural gas technology'] },
  { key: 'include_coal', label: 'Coal technology', type: 'boolean', aliases: ['coal technology', 'coal'] },
  { key: 'include_oil', label: 'Oil technology', type: 'boolean', aliases: ['oil technology', 'oil'] },
  { key: 'include_biomass', label: 'Biomass technology', type: 'boolean', aliases: ['biomass technology', 'biomass'] },
  { key: 'include_hydro', label: 'Hydro technology', type: 'boolean', aliases: ['hydro technology', 'hydro'] },
  { key: 'include_nuclear', label: 'Nuclear technology', type: 'boolean', aliases: ['nuclear technology', 'nuclear'] },
  { key: 'include_battery', label: 'Battery storage technology', type: 'boolean', aliases: ['battery storage technology', 'battery technology'] },
  { key: 'include_pumped_hydro', label: 'Pumped hydro technology', type: 'boolean', aliases: ['pumped hydro technology', 'pumped hydro'] },
  { key: 'include_hydrogen', label: 'Hydrogen technology', type: 'boolean', aliases: ['hydrogen technology'] },
  { key: 'sector_heat', label: 'Heat sector', type: 'boolean', aliases: ['heat sector'] },
  { key: 'sector_hydrogen', label: 'Hydrogen sector', type: 'boolean', aliases: ['hydrogen sector'] },
  { key: 'sector_transport', label: 'Transport sector', type: 'boolean', aliases: ['transport sector'] },
  { key: 'sector_industry', label: 'Industry sector', type: 'boolean', aliases: ['industry sector'] },
  { key: 'district_heating', label: 'District heating', type: 'boolean', aliases: ['district heating'] },
  { key: 'ev_demand', label: 'EV demand', type: 'boolean', aliases: ['ev demand', 'electric vehicle demand'] },
  { key: 'electrolysers', label: 'Electrolysers', type: 'boolean', aliases: ['electrolysers', 'electrolyzers'] },
  { key: 'hydrogen_to_power', label: 'Hydrogen-to-power', type: 'boolean', aliases: ['hydrogen to power', 'fuel cells', 'h2 turbines'] },
  { key: 'chp', label: 'CHP', type: 'boolean', aliases: ['combined heat and power', 'chp'] },
  { key: 'heat_pumps', label: 'Heat pumps', type: 'boolean', aliases: ['heat pumps'] },
  { key: 'existing_assets_only', label: 'Existing assets only', type: 'boolean', aliases: ['existing assets only'] },
  { key: 'allow_capacity_expansion', label: 'Allow new build', type: 'boolean', aliases: ['new build', 'capacity expansion'] },
  { key: 'generator_expansion', label: 'Generator expansion', type: 'boolean', aliases: ['generator expansion'] },
  { key: 'storage_expansion', label: 'Storage expansion', type: 'boolean', aliases: ['storage expansion'] },
  { key: 'network_expansion', label: 'Network expansion', type: 'boolean', aliases: ['network expansion'] },
  { key: 'solar_p_nom_max', label: 'Maximum solar capacity', type: 'number', aliases: ['maximum solar capacity', 'max solar capacity'], min: 0 },
  { key: 'wind_p_nom_max', label: 'Maximum wind capacity', type: 'number', aliases: ['maximum wind capacity', 'max wind capacity'], min: 0 },
  { key: 'gas_p_nom_max', label: 'Maximum gas capacity', type: 'number', aliases: ['maximum gas capacity', 'max gas capacity'], min: 0 },
  { key: 'reserve_margin', label: 'Minimum reserve margin', type: 'number', aliases: ['minimum reserve margin', 'reserve margin'], min: 0, max: 30 },
  { key: 'cost_year', label: 'Cost year', type: 'number', aliases: ['cost year'], options: [2020, 2022, 2025, 2030] },
  { key: 'discount_rate', label: 'Discount rate', type: 'number', aliases: ['discount rate'], min: 0, max: 15 },
  { key: 'carbon_price', label: 'Carbon price', type: 'number_or_auto', aliases: ['carbon price'], min: 0 },
  { key: 'gas_price', label: 'Gas price', type: 'number', aliases: ['gas price'], min: 0 },
  { key: 'coal_price', label: 'Coal price', type: 'number', aliases: ['coal price'], min: 0 },
  { key: 'oil_price', label: 'Oil price', type: 'number', aliases: ['oil price'], min: 0 },
  { key: 'biomass_price', label: 'Biomass price', type: 'number', aliases: ['biomass price'], min: 0 },
  { key: 'voll', label: 'Value of lost load', type: 'number', aliases: ['value of lost load', 'voll'], min: 0 },
  { key: 'co2_cap', label: 'CO2 cap', type: 'number_or_auto', aliases: ['co2 cap', 'carbon cap'], min: 0 },
  { key: 'renewable_share_target', label: 'Renewable share target', type: 'number', aliases: ['renewable share target', 'renewables target'], min: 0, max: 100 },
  { key: 'coal_phaseout_year', label: 'Coal phaseout year', type: 'number', aliases: ['coal phaseout year'], options: [2030, 2035, 2040, 2045, 2050] },
  { key: 'nuclear_phaseout', label: 'Nuclear phaseout', type: 'boolean', aliases: ['nuclear phaseout'] },
  { key: 'gas_allowed_post_year', label: 'Gas after target year', type: 'boolean', aliases: ['gas after target year', 'gas post target year'] },
  { key: 'security_constraint', label: 'Energy security constraint', type: 'boolean', aliases: ['energy security constraint', 'security constraint'] },
  { key: 'unit_commitment', label: 'Unit commitment', type: 'boolean', aliases: ['unit commitment'] },
  { key: 'ramp_limits', label: 'Ramp limits', type: 'boolean', aliases: ['ramp limits'] },
  { key: 'cyclic_storage', label: 'Cyclic storage state of charge', type: 'boolean', aliases: ['cyclic storage', 'cyclic state of charge'] },
  { key: 'hydro_inflows', label: 'Hydro inflow profiles', type: 'boolean', aliases: ['hydro inflows', 'hydro inflow profiles'] },
  { key: 'allow_curtailment', label: 'Renewable curtailment', type: 'boolean', aliases: ['renewable curtailment', 'curtailment'] },
  { key: 'load_shedding', label: 'Load shedding', type: 'boolean', aliases: ['load shedding'] },
  { key: 'solver_name', label: 'Solver', type: 'enum', aliases: ['solver'], values: { highs: 'highs', gurobi: 'gurobi' } },
  { key: 'solver_threads', label: 'Solver threads', type: 'number', aliases: ['solver threads', 'threads'], min: 1, max: 256, integer: true },
  { key: 'solver_time_limit', label: 'Solver time limit', type: 'number', aliases: ['solver time limit', 'time limit'], min: 1, integer: true },
  { key: 'mip_gap', label: 'MIP gap', type: 'number', aliases: ['mip gap'], min: 0, max: 1 },
  { key: 'solver_method', label: 'HiGHS algorithm', type: 'enum', aliases: ['highs algorithm', 'solver algorithm', 'algorithm', 'dual simplex', 'hipo', 'interior point', 'pdlp', 'cupdlp'], values: { simplex: 'simplex', 'dual simplex': 'simplex', hipo: 'hipo', 'interior point': 'hipo', pdlp: 'pdlp', 'cupdlp c': 'pdlp', cupdlp: 'pdlp' } },
];

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/ß/g, 'ss')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const editDistance = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[b.length];
};

export const extractAtlasCountryGroups = (input) => {
  const text = normalizeText(input);
  if (!text) return [];
  const padded = ` ${text} `;
  return ATLAS_COUNTRY_GROUPS.filter((group) => (
    group.aliases.some((alias) => padded.includes(` ${alias} `))
  ));
};

export const extractAtlasCountryCodes = (input) => {
  const text = normalizeText(input);
  if (!text) return [];
  const padded = ` ${text} `;
  const matches = [];
  Object.entries(COUNTRY_ALIASES).forEach(([code, aliases]) => {
    if (aliases.some((alias) => padded.includes(` ${alias} `))) matches.push(code);
  });
  if (matches.length) return [...new Set(matches)];

  // The agent should tolerate normal typing mistakes such as "belgiuim".
  const tokens = text.split(' ').filter((token) => token.length >= 5);
  let best = null;
  Object.entries(COUNTRY_ALIASES).forEach(([code, aliases]) => {
    aliases.filter((alias) => !alias.includes(' ')).forEach((alias) => {
      tokens.forEach((token) => {
        const distance = editDistance(token, alias);
        const allowed = alias.length >= 8 ? 2 : 1;
        if (distance <= allowed && (!best || distance < best.distance)) best = { code, distance };
      });
    });
  });
  return best ? [best.code] : [];
};

export const normalizeAtlasResolution = (input) => {
  const text = normalizeText(input);
  if (!text) return '';
  if (/\b(?:full|nodal|node level|220\s*kv)\b/.test(text)) return 'full';
  if (/\bnuts\s*3\b/.test(text)) return 'nuts3';
  if (/\bnuts\s*2\b/.test(text)) return 'nuts2';
  if (/\bnuts\s*1\b/.test(text)) return 'nuts1';
  if (/\b(?:e\s*highway|ehighway)\b/.test(text)) return 'ehighway';
  if (/\bbidding(?:\s+zone)?\b/.test(text)) return 'bidding_zone';
  return '';
};

const mentionedDomains = (text) => {
  const domains = [];
  if (/\b(?:grid(?!\s+access)|transmission|network\s+lines?|interconnectors?)\b/.test(text)) domains.push('Grid');
  if (/\b(?:storage|batter(?:y|ies)|stores?)\b/.test(text)) domains.push('Storage');
  if (/\b(?:supply|generation|generators?|power\s+plants?)\b/.test(text)) domains.push('Supply');
  if (/\b(?:demand|loads?)\b/.test(text)) domains.push('Demand');
  if (
    /\b(?:grid\s+access|connection\s+(?:queue|access)|access\s+(?:layer|overlay)|queue\s+(?:layer|overlay))\b/.test(text)
    || /\b(?:show|display|hide|remove|disable|enable|add|include|overlay)\s+(?:the\s+)?access\b/.test(text)
    || (
      /\baccess\b/.test(text)
      && /\b(?:show|display|hide|remove|disable|enable|add|include|overlay)\b/.test(text)
      && !/\bnetwork\s+access\s+nodes?\b/.test(text)
    )
  ) domains.push('Access');
  return [...new Set(domains)];
};

const CARRIER_ALIASES = {
  solar: ['solar', 'pv'],
  wind: ['wind'],
  onwind: ['onshore wind', 'onwind'],
  offwind: ['offshore wind', 'offwind'],
  gas: ['natural gas', 'gas', 'ccgt', 'ocgt'],
  nuclear: ['nuclear'],
  hydro: ['hydro', 'hydroelectric'],
  biomass: ['biomass', 'bioenergy'],
  coal: ['coal', 'lignite'],
  oil: ['oil', 'diesel'],
  hydrogen: ['hydrogen', 'h2'],
  battery: ['battery', 'batteries'],
  water_works: ['water works'],
  desalination: ['desalination plants', 'desalination plant', 'desalination'],
  wastewater_treatment: [
    'wastewater treatment plants', 'wastewater treatment plant', 'wastewater treatment',
    'treatment plants', 'treatment plant',
  ],
  agglomeration: ['wastewater agglomerations', 'wastewater agglomeration', 'agglomerations', 'agglomeration'],
  discharge: ['wastewater discharge points', 'wastewater discharge point', 'discharge points', 'discharge point'],
  water_tower: ['water towers', 'water tower'],
  reservoir: ['covered reservoirs', 'covered reservoir', 'reported reservoirs', 'reported reservoir', 'reservoirs', 'reservoir'],
};

const mentionedCarriers = (text) => Object.entries(CARRIER_ALIASES)
  .filter(([, aliases]) => aliases.some((alias) => ` ${text} `.includes(` ${alias} `)))
  .map(([carrier]) => carrier);

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const aliasRegex = (alias) => escapeRegex(normalizeText(alias)).replace(/\s+/g, '\\s+');

const normalizedSettingValue = (definition, rawValue) => {
  if (definition.type === 'number' || definition.type === 'number_or_auto') {
    if (definition.type === 'number_or_auto' && String(rawValue).toLowerCase() === 'auto') return 'auto';
    let value = Number(rawValue);
    if (!Number.isFinite(value)) return undefined;
    if (definition.integer) value = Math.round(value);
    if (Array.isArray(definition.options) && !definition.options.includes(value)) return undefined;
    if (Number.isFinite(definition.min) && value < definition.min) return undefined;
    if (Number.isFinite(definition.max) && value > definition.max) return undefined;
    return value;
  }
  return rawValue;
};

export const atlasAgentParameterDefinition = (key) => (
  ATLAS_AGENT_PARAMETER_CATALOG.find((definition) => definition.key === key) || null
);

export const normalizeAtlasAgentSettingValue = (key, rawValue) => {
  const definition = atlasAgentParameterDefinition(key);
  if (!definition) return undefined;
  if (definition.type === 'boolean') {
    if (typeof rawValue === 'boolean') return rawValue;
    const value = normalizeText(rawValue);
    if (['true', 'on', 'yes', 'enable', 'enabled', 'include', 'included', 'allow', 'allowed'].includes(value)) return true;
    if (['false', 'off', 'no', 'disable', 'disabled', 'exclude', 'excluded', 'disallow', 'disallowed'].includes(value)) return false;
    return undefined;
  }
  if (definition.type === 'enum') {
    const value = normalizeText(rawValue);
    const match = Object.entries(definition.values || {}).find(([alias, canonical]) => (
      normalizeText(alias) === value || normalizeText(canonical) === value
    ));
    return match ? match[1] : undefined;
  }
  if (definition.type === 'text') {
    const value = String(rawValue ?? '').trim();
    return value || undefined;
  }
  return normalizedSettingValue(definition, rawValue);
};

export const normalizeAtlasModelPlan = (rawActions, currentVisibleLayers = []) => {
  const settingKeys = new Set(ATLAS_AGENT_PARAMETER_CATALOG.map((definition) => definition.key));
  let actions = (Array.isArray(rawActions) ? rawActions : [])
    .filter((action) => action && typeof action.intent === 'string')
    .map((action) => ({
      intent: action.intent,
      params: action.params && typeof action.params === 'object' ? { ...action.params } : {},
    }));

  actions = actions.map((action) => {
    if (action.intent !== 'set_model_settings') return action;
    const nested = action.params.settings && typeof action.params.settings === 'object'
      ? action.params.settings
      : {};
    const flattened = Object.entries(action.params).reduce((settings, [key, value]) => {
      if (settingKeys.has(key)) settings[key] = value;
      return settings;
    }, {});
    return { ...action, params: { settings: { ...nested, ...flattened } } };
  });

  const geographyIntents = new Set(['load_country', 'load_all_countries', 'load_country_groups', 'add_country', 'set_mixed_granularity']);
  const geographyIndex = actions.findIndex((action) => geographyIntents.has(action.intent));
  const standaloneResolutionIndex = actions.findIndex((action) => (
    action.intent === 'set_network_resolution' || action.intent === 'step_network_resolution'
  ));

  if (geographyIndex >= 0 && standaloneResolutionIndex >= 0) {
    const geography = actions[geographyIndex];
    const resolutionAction = actions[standaloneResolutionIndex];
    if (!geography.params.resolution && resolutionAction.intent === 'set_network_resolution') {
      geography.params.resolution = resolutionAction.params.resolution || resolutionAction.params.granularity;
      actions.splice(standaloneResolutionIndex, 1);
    }
  }

  const layerTargetIndex = actions.findIndex((action) => (
    geographyIntents.has(action.intent)
    || action.intent === 'set_network_resolution'
    || action.intent === 'step_network_resolution'
  ));
  const layerActions = actions.filter((action) => action.intent === 'set_map_layers');
  if (layerActions.length && layerTargetIndex >= 0) {
    const targetAction = actions[layerTargetIndex];
    const initialLayers = Array.isArray(targetAction.params.layers)
      ? targetAction.params.layers
      : currentVisibleLayers;
    let finalLayers = new Set(initialLayers || []);
    layerActions.forEach((layerAction) => {
      const requestedLayers = Array.isArray(layerAction.params.layers) ? layerAction.params.layers : [];
      const mode = String(layerAction.params.mode || 'replace').toLowerCase();
      if (mode === 'replace') finalLayers = new Set(requestedLayers);
      else if (mode === 'add') requestedLayers.forEach((layer) => finalLayers.add(layer));
      else if (mode === 'hide') requestedLayers.forEach((layer) => finalLayers.delete(layer));
      if (layerAction.params.generation_mix != null) {
        targetAction.params.generation_mix = layerAction.params.generation_mix;
      }
    });
    targetAction.params.layers = [...finalLayers];
    targetAction.params.layer_mode = 'replace';
    actions = actions.filter((action) => action.intent !== 'set_map_layers');
  }

  return actions;
};

// Read model-produced country fields, never the user's natural-language prompt.
// ISO2 arrays are canonical. Accept older named lists only if EVERY token is
// accounted for; never silently load the recognized subset of a mixed list.
export const readAtlasModelCountries = (params = {}) => {
  const canonical = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return Object.entries(COUNTRY_ALIASES).find(([code, aliases]) => code.toLowerCase() === text || aliases.includes(text))?.[0];
  };
  if (params.countries != null) {
    if (!Array.isArray(params.countries) || !params.countries.length) throw new Error('countries must be a non-empty array of country names or ISO2 codes.');
    const codes = params.countries.map(canonical);
    if (codes.some((code) => !code)) throw new Error('A requested country is not recognized; no partial country selection was loaded.');
    return { countries: [...new Set(codes)], place: '' };
  }
  const place = String(params.country || params.location || '').trim();
  const direct = canonical(place);
  if (direct) return { countries: [direct], place: '' };
  const names = Object.entries(COUNTRY_ALIASES).flatMap(([code, aliases]) => [code.toLowerCase(), ...aliases].map((name) => ({ code, name })))
    .sort((a, b) => b.name.length - a.name.length);
  const countries = [];
  let remaining = place.toLowerCase();
  while (remaining) {
    const candidate = remaining;
    const match = names.find(({ name }) => candidate === name || (candidate.startsWith(name) && /^[\s,;&+]/.test(candidate.slice(name.length))));
    if (!match) {
      if (countries.length || (params.country && /[,;&+]|\s(?:and|et|und|y|en|og|och|e)\s/i.test(place))) throw new Error('Use a complete list of recognized countries; no partial country selection was loaded.');
      return { countries: [], place }; // A single city/place uses the existing place resolver.
    }
    countries.push(match.code);
    remaining = remaining.slice(match.name.length).trim();
    if (!remaining) break;
    const separator = remaining.match(/^(?:[,;&+]\s*(?:(?:and|et|und|y|en|og|och|e)\s+)?|(?:and|et|und|y|en|og|och|e)\s+)/);
    if (!separator) throw new Error('Country list is ambiguous; no partial country selection was loaded.');
    remaining = remaining.slice(separator[0].length).trim();
    if (!remaining) throw new Error('Country list is incomplete.');
  }
  return { countries: [...new Set(countries)], place: '' };
};

export const parseAtlasSettingUpdates = (input) => {
  const raw = String(input || '').trim();
  const text = normalizeText(raw.replace(/(\d)\.(?=\d)/g, '$1decimalpoint')).replace(/decimalpoint/g, '.');
  const updates = {};
  if (!text) return updates;

  ATLAS_AGENT_PARAMETER_CATALOG.forEach((definition) => {
    const aliases = [...definition.aliases].sort((a, b) => b.length - a.length);
    const matchedAlias = aliases.find((alias) => new RegExp(`\\b${aliasRegex(alias)}\\b`).test(text));
    if (!matchedAlias) return;
    const aliasPattern = aliasRegex(matchedAlias);

    if (definition.type === 'boolean') {
      const aliasMatch = new RegExp(`\\b${aliasPattern}\\b`).exec(text);
      if (!aliasMatch) return;
      const before = text.slice(Math.max(0, aliasMatch.index - 100), aliasMatch.index);
      const after = text.slice(aliasMatch.index + aliasMatch[0].length, aliasMatch.index + aliasMatch[0].length + 24);
      const verbs = [...before.matchAll(/\b(enable|include|allow|use|turn on|disable|exclude|disallow|forbid|turn off|without|no)\b/g)];
      const lastVerb = verbs.length ? verbs[verbs.length - 1][1] : '';
      let value;
      if (/^(?:\s+)?(?:on|enabled|included|allowed)\b/.test(after)) value = true;
      else if (/^(?:\s+)?(?:off|disabled|excluded|disallowed)\b/.test(after)) value = false;
      else if (['enable', 'include', 'allow', 'use', 'turn on'].includes(lastVerb)) value = true;
      else if (['disable', 'exclude', 'disallow', 'forbid', 'turn off', 'without', 'no'].includes(lastVerb)) value = false;
      else if (definition.key === 'existing_assets_only' && /\bexisting assets only\b/.test(text)) value = true;
      if (typeof value === 'boolean') updates[definition.key] = value;
      return;
    }

    if (definition.type === 'enum') {
      const candidates = Object.entries(definition.values || {}).sort((a, b) => b[0].length - a[0].length);
      const matched = candidates.find(([alias]) => new RegExp(`\\b${aliasRegex(alias)}\\b`).test(text));
      if (matched) updates[definition.key] = matched[1];
      return;
    }

    if (definition.type === 'text') {
      const match = raw.match(new RegExp(`${aliasPattern}\\s*(?:to|as|=|:)\\s*["']?(.+?)["']?(?=\\s*(?:,|;|\\band\\b|$))`, 'i'));
      if (match?.[1]?.trim()) updates[definition.key] = match[1].trim();
      return;
    }

    if (definition.type === 'number_or_auto') {
      const autoMatch = new RegExp(`\\b${aliasPattern}\\b\\s*(?:to|at|as|of|=|:)?\\s*auto\\b`).test(text);
      if (autoMatch) {
        updates[definition.key] = 'auto';
        return;
      }
    }

    const normal = text.match(new RegExp(`\\b${aliasPattern}\\b\\s*(?:to|at|as|of|=|:)?\\s*(-?\\d+(?:\\.\\d+)?)\\b`));
    const reverse = text.match(new RegExp(`\\b(-?\\d+(?:\\.\\d+)?)\\s*(?:percent|%|mw|gw|seconds?|secs?|s)?\\s+${aliasPattern}\\b`));
    const rawValue = normal?.[1] ?? reverse?.[1];
    if (rawValue == null) return;
    const value = normalizedSettingValue(definition, rawValue);
    if (value !== undefined) updates[definition.key] = value;
  });

  return updates;
};

export const parseAtlasSettingIssues = (input) => {
  const raw = String(input || '').trim();
  const text = normalizeText(raw.replace(/(\d)\.(?=\d)/g, '$1decimalpoint')).replace(/decimalpoint/g, '.');
  const issues = [];
  ATLAS_AGENT_PARAMETER_CATALOG
    .filter((definition) => ['number', 'number_or_auto'].includes(definition.type))
    .forEach((definition) => {
      const aliases = [...definition.aliases].sort((a, b) => b.length - a.length);
      const matchedAlias = aliases.find((alias) => new RegExp(`\\b${aliasRegex(alias)}\\b`).test(text));
      if (!matchedAlias) return;
      const aliasPattern = aliasRegex(matchedAlias);
      if (definition.type === 'number_or_auto'
        && new RegExp(`\\b${aliasPattern}\\b\\s*(?:to|at|as|of|=|:)?\\s*auto\\b`).test(text)) return;
      const normal = text.match(new RegExp(`\\b${aliasPattern}\\b\\s*(?:to|at|as|of|=|:)?\\s*(-?\\d+(?:\\.\\d+)?)\\b`));
      const reverse = text.match(new RegExp(`\\b(-?\\d+(?:\\.\\d+)?)\\s*(?:percent|%|mw|gw|seconds?|secs?|s)?\\s+${aliasPattern}\\b`));
      const rawValue = normal?.[1] ?? reverse?.[1];
      if (rawValue == null || normalizedSettingValue(definition, rawValue) !== undefined) return;
      let constraint = 'a valid number';
      if (definition.options?.length) constraint = `one of ${definition.options.join(', ')}`;
      else if (Number.isFinite(definition.min) && Number.isFinite(definition.max)) constraint = `${definition.min}–${definition.max}`;
      else if (Number.isFinite(definition.min)) constraint = `at least ${definition.min}`;
      else if (Number.isFinite(definition.max)) constraint = `at most ${definition.max}`;
      issues.push({ key: definition.key, label: definition.label, value: Number(rawValue), constraint });
    });
  return issues;
};

const combineAtlasActions = (actions) => {
  const filtered = actions.filter(Boolean);
  if (!filtered.length) return null;
  return filtered.length === 1 ? filtered[0] : { type: 'compound', actions: filtered };
};

export const parseAtlasAgentCommand = (input) => {
  const raw = String(input || '').trim();
  const text = normalizeText(raw);
  if (!text) return null;

  if (/\b(?:full\s+eu|joule)\b/.test(text)) return null;

  if (/^(?:please\s+)?(?:help|commands?|capabilities|what can you (?:do|change)|what (?:parameters|settings) can you change)\b/.test(text)) {
    return { type: 'capabilities', topic: /\b(?:parameters|settings|advanced)\b/.test(text) ? 'settings' : 'all' };
  }

  // Viewport commands stay independent of network/data changes. The model
  // planner handles arbitrary languages; these common phrases keep the same
  // controls responsive when the AI service is unavailable.
  // Do not let a fast viewport match discard the rest of a multi-action request.
  // The authoritative planner must see all clauses, including voice streams.
  if (/\bzoom\b/.test(text) && /\b(?:add|remove|load|build|run|solve|generation|supply|demand|storage|granularity|nuts[123])\b/.test(text)) {
    return null;
  }
  const targetedZoom = text.match(/\b(?:zoom\s+into|zoom\s+in\s+(?:on|to)|zoom\s+to)\s+(.+)$/);
  if (targetedZoom) {
    const target = targetedZoom[1]
      .replace(/\b(?:please|the|map|view|area|country|zone)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (target) {
      const countryGroups = extractAtlasCountryGroups(target);
      const countries = extractAtlasCountryCodes(target);
      return {
        type: 'map_view',
        operation: 'isolate',
        countries: [...new Set([...countries, ...countryGroups.flatMap((group) => group.countries)])],
        ...(!countries.length && !countryGroups.length ? { query: target } : {}),
        label: countryGroups.length
          ? countryGroups.map((group) => group.label).join(' and ')
          : countries.length ? countries.join(' and ') : target,
      };
    }
  }
  const zoomInPhrase = /\b(?:zoom\s+in|move\s+closer|get\s+closer|closer\s+view|magnify|zoome?r?|rapproche|acerca(?:r|me|te)?|amplia(?:r)?|hineinzoomen|naher|vergrosser(?:e|n)?|vergroesser(?:e|n)?|ingrand(?:ire|isci)|avvicina(?:re)?|inzoomen|aproximar|przybliz|zooma\s+in|zoom\s+inn)\b/;
  const zoomOutPhrase = /\b(?:zoom\s+out|move\s+(?:back|away)|go\s+wider|wider\s+view|show\s+more\s+area|dezoome?r?|eloigne|aleja(?:r|me|te)?|herauszoomen|weiter\s+weg|verkleiner(?:e|n)?|riduci|allontana(?:re)?|uitzoomen|afastar|oddal|zooma\s+ut|zoom\s+ut)\b/;
  const zoomSteps = (() => {
    const number = text.match(/\b([1-4])\s*(?:levels?|steps?|times?)?\b/);
    if (number) return Number(number[1]);
    if (/\b(?:twice|two\s+(?:levels?|steps?))\b/.test(text)) return 2;
    if (/\b(?:three\s+(?:levels?|steps?))\b/.test(text)) return 3;
    return 1;
  })();
  if (zoomInPhrase.test(text) && !zoomOutPhrase.test(text)) return { type: 'map_view', operation: 'zoom_in', steps: zoomSteps };
  if (zoomOutPhrase.test(text)) return { type: 'map_view', operation: 'zoom_out', steps: zoomSteps };
  if (/\b(?:reset\s+(?:the\s+)?map|europe(?:an)?\s+overview|vue\s+d ensemble|vista\s+general)\b/.test(text)) {
    return { type: 'map_view', operation: 'reset' };
  }

  const isolatePhrase = /\b(?:isolate|frame|fit\s+(?:the\s+view\s+to|to)|focus\s+(?:the\s+map\s+)?on|only\s+show\s+the\s+area|isoler|cadrer|centrer\s+sur|aislar|encuadrar|enfocar\s+en|isolieren|einrahmen|fokussieren\s+auf|isola(?:re)?|inquadra(?:re)?|concentrati\s+su)\b/;
  if (isolatePhrase.test(text)) {
    const countryGroups = extractAtlasCountryGroups(text);
    const countries = extractAtlasCountryCodes(text);
    const query = text
      .replace(isolatePhrase, ' ')
      .replace(/\b(?:please|the|map|view|area|country|countries|zone|zones|selected|loaded|current|to|on|of)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      type: 'map_view',
      operation: 'isolate',
      countries: [...new Set([...countries, ...countryGroups.flatMap((group) => group.countries)])],
      ...(query && !countries.length && !countryGroups.length ? { query } : {}),
      label: countryGroups.length
        ? countryGroups.map((group) => group.label).join(' and ')
        : countries.length ? countries.join(' and ') : query || 'the loaded selection',
    };
  }

  const landTerms = /\b(?:land\s+(?:and\s+)?constraints?|land\s+overlay|land\s+(?:country\s+)?(?:filter|scope)|siting\s+constraints?|site\s+constraints?|protected\s+(?:areas?|sites?)|natura\s*2000|natura?l\s*3000|agricultur(?:e|al)\s+land|forest(?:ed)?\s+land|natural\s+land|built[ -]?up\s+land|urban\s+land|wetlands?|water\s+constraints?|industrial\s+land|brownfields?)\b/;
  if (landTerms.test(text)) {
    const disable = /\b(?:hide|disable|remove|close|turn\s+off)\s+(?:the\s+)?(?:land\s+(?:and\s+)?constraints?|siting\s+constraints?|land\s+overlay)\b/.test(text);
    if (disable) return { type: 'land_constraints', visible: false };
    const categories = [];
    if (/\b(?:protected|natura\s*2000|natura?l\s*3000|conservation)\b/.test(text)) categories.push('protected');
    if (/\b(?:water|wetland|marsh|peat|bog)\b/.test(text)) categories.push('water');
    if (/\b(?:urban|built[ -]?up)\b/.test(text)) categories.push('urban');
    if (/\b(?:agricultur|arable|pasture|cropland)\w*\b/.test(text)) categories.push('agriculture');
    if (/\b(?:forest|natural\s+land|scrub|heath)\w*\b/.test(text)) categories.push('forest');
    if (/\b(?:industrial|brownfield|port\s+land|airport\s+land|construction\s+land)\w*\b/.test(text)) categories.push('industrial');
    const opacityMatch = text.match(/\b(?:opacity|transparency)\s+(?:to\s+|at\s+)?(\d{1,3})\s*(?:percent|%)?/)
      || text.match(/\b(\d{1,3})\s*(?:percent|%)\s+(?:opacity|transparency)\b/);
    const hideClasses = /\b(?:hide|remove|exclude|disable)\b/.test(text) && categories.length > 0;
    const addClasses = (/\b(?:add|include|also)\b/.test(text) || /^(?:please\s+)?overlay\b/.test(text))
      && categories.length > 0;
    const countryCodes = extractAtlasCountryCodes(text);
    const allCountryScope = /\b(?:all\s+(?:of\s+)?europe|all\s+countries|clear\s+(?:the\s+)?land\s+(?:country\s+)?filter|no\s+country\s+filter)\b/.test(text);
    const countryMode = /\b(?:remove|exclude)\b/.test(text)
      ? 'remove'
      : /\b(?:add|include|also)\b/.test(text)
        ? 'add'
        : 'replace';
    return {
      type: 'land_constraints',
      visible: true,
      ...(categories.length ? { categories: [...new Set(categories)] } : {}),
      ...(hideClasses ? { mode: 'hide' } : addClasses ? { mode: 'add' } : { mode: 'replace' }),
      ...(opacityMatch ? { opacity: Math.max(20, Math.min(100, Number(opacityMatch[1]))) } : {}),
      ...(countryCodes.length || allCountryScope
        ? { countries: countryCodes, countryMode: allCountryScope ? 'replace' : countryMode }
        : {}),
    };
  }

  const disableNetworkOverlay = /\b(?:disable|stop|close|exit|turn\s+off)\s+(?:the\s+)?(?:multi\s+network\s+)?overlay(?:\s+mode)?\b/.test(text)
    || /\b(?:single|one)\s+network\s+(?:mode|view)\b/.test(text);
  if (disableNetworkOverlay) return { type: 'network_overlay', visible: false };
  const enableNetworkOverlay = /\b(?:enable|start|open|turn\s+on|use)\s+(?:the\s+)?(?:multi\s+network\s+)?overlay(?:\s+mode)?\b/.test(text)
    || /\b(?:multi\s+network|network)\s+overlay(?:\s+mode)?\b/.test(text)
    || /\boverlay\s+all\s+(?:networks?|carriers?|systems?)\b/.test(text)
    || /\boverlay\s+(?:the\s+)?(?:electricity|power|methane|gas|water|wastewater|oil|petroleum|liquids|ports?|logistics|air\s*freight)\b/.test(text);
  if (enableNetworkOverlay) {
    const overlayCarriers = [];
    if (/\b(?:electricity|electric|power)\b/.test(text)) overlayCarriers.push('electricity');
    if (/\b(?:methane|natural\s+gas|gas)\b/.test(text)) overlayCarriers.push('gas');
    if (/\b(?:water|wastewater)\b/.test(text)) overlayCarriers.push('water');
    if (/\b(?:oil|petroleum|liquids?|liquid\s+fuels?)\b/.test(text)) overlayCarriers.push('liquids');
    if (/\b(?:ports?|logistics|air\s*freight|airports?|airfields?)\b/.test(text)) overlayCarriers.push('logistics');
    return {
      type: 'network_overlay',
      visible: true,
      ...(/\ball\s+(?:networks?|carriers?|systems?)\b/.test(text)
        ? { carriers: ['electricity', 'gas', 'water', 'liquids', 'logistics'] }
        : overlayCarriers.length ? { carriers: [...new Set(overlayCarriers)] } : {}),
    };
  }

  const actions = [];
  const explicitNetworkCarrier = (
    /\b(?:ports?|port\s+logistics|maritime\s+logistics|logistics|air\s*freight|airports?|airfields?)\s+(?:network|atlas|database|system)\b/.test(text)
    || /\b(?:ports?\s+atlas|port\s+database|air\s*freight\s+atlas)\b/.test(text)
    || /\b(?:switch|change|move|go)\s+(?:over\s+)?(?:to|into)\s+(?:the\s+)?(?:ports?|port\s+logistics|logistics|air\s*freight|airports?|airfields?)(?:\s+(?:network|atlas|database))?\b/.test(text)
    || /\b(?:show|display|load|open)\s+(?:me\s+)?(?:the\s+)?(?:ports?|airports?|airfields?)\b/.test(text)
  ) ? 'logistics' : (
    /\b(?:oil|petroleum|liquid\s+fuels?|energy\s+liquids?|liquids)\s+(?:network|atlas|database|system)\b/.test(text)
    || /\b(?:switch|change|move|go)\s+(?:over\s+)?(?:to|into)\s+(?:the\s+)?(?:oil|petroleum|liquid\s+fuels?|energy\s+liquids?|liquids)(?:\s+(?:network|atlas|database))?\b/.test(text)
  ) ? 'liquids' : (
    /\b(?:water|wastewater|water\s+and\s+wastewater)\s+(?:network|atlas|database|system)\b/.test(text)
    || /\b(?:switch|change|move|go)\s+(?:over\s+)?(?:to|into)\s+(?:the\s+)?(?:water|wastewater)(?:\s+(?:network|atlas|database))?\b/.test(text)
  ) ? 'water' : (
    /\b(?:methane(?:\s+gas)?|natural\s+gas|gas)\s+(?:network|atlas|database|system)\b/.test(text)
    || /\b(?:switch|change|move|go)\s+(?:over\s+)?(?:to|into)\s+(?:the\s+)?(?:methane(?:\s+gas)?|natural\s+gas)\b/.test(text)
  ) ? 'gas' : (
    /\b(?:electricity|electric|power)\s+(?:network|atlas|grid|system)\b/.test(text)
    || /\b(?:switch|change|move|go)\s+(?:back\s+)?(?:to|into)\s+(?:the\s+)?electricity\b/.test(text)
  ) ? 'electricity' : '';
  const resolution = normalizeAtlasResolution(text);
  const generationMixPhrase = /\b(?:generation|capacity)\s+(?:mix|pies?|pie\s+charts?)\b/.test(text);
  const settingUpdates = parseAtlasSettingUpdates(raw);
  const settingIssues = parseAtlasSettingIssues(raw);
  const domains = mentionedDomains(text);
  const allDomains = /\b(?:all\s+(?:layers?|domains?)|everything)\b/.test(text);
  const logisticsDefaultDomains = explicitNetworkCarrier === 'logistics' && /\b(?:airports?|airfields?|air\s*freight)\b/.test(text)
    ? ['Demand']
    : [];
  const selectedDomains = allDomains
    ? ['Grid', 'Storage', 'Supply', 'Demand']
    : [...new Set([...domains, ...logisticsDefaultDomains])];
  const layerVerb = /\b(?:show|display|view|enable|turn\s+on|hide|disable|remove|unload|turn\s+off|add|include|overlay|only)\b/.test(text);
  const explicitMapLayerContext = /\b(?:map|view|layer)\b/.test(text)
    || /\b(?:show|hide|remove|unload|add|overlay|enable|disable)\s+(?:the\s+)?(?:grid|storage|supply|generation|demand|access)\b/.test(text)
    || /\bwith\s+(?:the\s+)?(?:grid|storage|supply|generation|demand|access)\b/.test(text);
  const hasLayerIntent = !generationMixPhrase
    && selectedDomains.length > 0
    && (layerVerb || /\bwith\b/.test(text))
    && (!Object.keys(settingUpdates).length || explicitMapLayerContext);
  const hideLayers = /\b(?:hide|disable|remove|unload|turn\s+off)\b/.test(text);
  const addLayers = /\b(?:add|overlay|also(?:\s+show)?|include)\s+(?:the\s+)?(?:grid|storage|supply|generation|demand|access|all\s+(?:layers?|domains?))\b/.test(text);
  const layerAction = hasLayerIntent ? {
    type: 'layers',
    mode: hideLayers ? 'hide' : (addLayers ? 'add' : 'replace'),
    domains: selectedDomains,
    ...(selectedDomains.includes('Supply') && /\bgeneration\b/.test(text) ? { generationMix: true } : {}),
  } : null;

  const countryGroups = extractAtlasCountryGroups(text);
  const allCountries = /\ball\s+(?:available\s+)?countries\b/.test(text)
    || /\b(?:(?:all|whole|entire)\s+)?europe(?:an\s+(?:network|system)|\s+wide)?\b/.test(text);
  const countries = extractAtlasCountryCodes(text);
  const mixedGranularity = /\b(?:(?:mixed|adaptive|tiered|multi[ -]?resolution)\s+(?:granularity|resolution|detail)|tso\s+(?:rings?|view)|concentric\s+(?:network|resolution)\s+rings?)\b/.test(text);
  let geographyAction = null;

  if (mixedGranularity) {
    geographyAction = {
      type: 'mixed_granularity',
      ...(countries.length ? { focusCountry: countries[0] } : {}),
      levels: { focus: 'full', adjacent: 'nuts3', outer: 'bidding_zone' },
      ...(layerAction ? {
        domains: layerAction.domains,
        ...(layerAction.mode !== 'replace' ? { layerMode: layerAction.mode } : {}),
      } : {}),
    };
  } else if (countryGroups.length) {
    geographyAction = {
      type: 'country_groups',
      groups: countryGroups.map((group) => group.key),
      groupLabels: countryGroups.map((group) => group.label),
      countries: [...new Set(countryGroups.flatMap((group) => group.countries))],
      resolution,
      ...(layerAction ? {
        domains: layerAction.domains,
        ...(layerAction.mode !== 'replace' ? { layerMode: layerAction.mode } : {}),
        ...(layerAction.generationMix ? { generationMix: true } : {}),
      } : {}),
    };
  } else if (allCountries && (resolution || /\b(?:show|load|open|add|include|select)\b/.test(text))) {
    geographyAction = {
      type: 'all_countries',
      resolution,
      ...(layerAction ? {
        domains: layerAction.domains,
        ...(layerAction.mode !== 'replace' ? { layerMode: layerAction.mode } : {}),
        ...(layerAction.generationMix ? { generationMix: true } : {}),
      } : {}),
    };
  } else if (countries.length) {
    let mode = '';
    if (/\b(?:remove|unload|delete)\b/.test(text)) mode = 'remove';
    else if (/\b(?:add|include|alongside|also)\b/.test(text)) mode = 'add';
    else if (/\b(?:focus|zoom)\b/.test(text) && !/\b(?:show|load|open)\b/.test(text)) mode = 'focus';
    else if (resolution || /\b(?:show|load|open|select|country|network)\b/.test(text)) mode = 'replace';
    if (mode) {
      geographyAction = {
        type: 'country', mode, countries, resolution,
        ...(!['remove', 'focus'].includes(mode) && layerAction ? {
          domains: layerAction.domains,
          ...(layerAction.mode !== 'replace' ? { layerMode: layerAction.mode } : {}),
          ...(layerAction.generationMix ? { generationMix: true } : {}),
        } : {}),
      };
    }
  }

  if (geographyAction) {
    if (explicitNetworkCarrier) geographyAction.networkCarrier = explicitNetworkCarrier;
    actions.push(geographyAction);
  } else if (explicitNetworkCarrier) {
    actions.push({ type: 'network_carrier', carrier: explicitNetworkCarrier });
  }

  const hasResolutionWord = /\b(?:granularity|resolution|detail|network\s+level|nuts\s*[123]\s+level|bidding\s+zone\s+level)\b/.test(text);
  const stepUp = /\b(?:increase|raise|higher|up|more\s+detailed?|finer)\b/.test(text);
  const stepDown = /\b(?:reduce|decrease|lower|down|less\s+detailed?|coarser)\b/.test(text);
  if (!geographyAction && resolution && (hasResolutionWord || layerAction || /\b(?:show|switch|set|change|go|use|increase|raise|reduce|decrease|lower)\b/.test(text))) {
    actions.push({
      type: 'set_resolution',
      resolution,
      ...(layerAction ? { domains: layerAction.domains, layerMode: layerAction.mode } : {}),
    });
  } else if (!geographyAction && hasResolutionWord && (stepUp || stepDown)) {
    actions.push({
      type: 'step_resolution',
      direction: stepDown ? -1 : 1,
      ...(layerAction ? { domains: layerAction.domains, layerMode: layerAction.mode } : {}),
    });
  } else if (!geographyAction && layerAction) {
    actions.push(layerAction);
  }

  if (generationMixPhrase && /\b(?:hide|disable|off|remove)\b/.test(text)) {
    actions.push({ type: 'generation_mix', visible: false });
  } else if (generationMixPhrase && /\b(?:show|enable|on|display)\b/.test(text) && !layerAction) {
    actions.push({ type: 'generation_mix', visible: true, showSupply: true });
  }

  const temporalMatch = text.match(/\b(?:temporal|snapshot|time)\s+resolution(?:\s+(?:to|at|as))?\s+(monthly|hourly|1\s*hourly|3\s*hourly|6\s*hourly|12\s*hourly|24\s*hourly|daily)\b/)
    || text.match(/\b(monthly|hourly|1\s*hourly|3\s*hourly|6\s*hourly|12\s*hourly|24\s*hourly|daily)\s+(?:snapshots?|time\s*steps?)\b/)
    || text.match(/^\s*(?:make\s+(?:it|the\s+model)\s+|use\s+)?(monthly|hourly|1\s*hourly|3\s*hourly|6\s*hourly|12\s*hourly|24\s*hourly|daily)\s*$/);
  if (temporalMatch) {
    const value = normalizeText(temporalMatch[1]).replace(/\s+/g, '');
    const normalizedValue = ({ hourly: '1h', '1hourly': '1h', '3hourly': '3h', '6hourly': '6h', '12hourly': '12h', '24hourly': '24h', daily: '24h', monthly: 'monthly' })[value];
    actions.push({ type: 'temporal_resolution', value: normalizedValue });
  }

  if (/\bbuild\s+only\b/.test(text)) actions.push({ type: 'run_mode', mode: 'build_only' });
  else if (/\bsolve\s+existing\b/.test(text)) actions.push({ type: 'run_mode', mode: 'solve_existing' });
  else if (/\bbuild\s*(?:and|\+)\s*solve\b/.test(text)) actions.push({ type: 'run_mode', mode: 'build_solve' });

  const carriers = mentionedCarriers(text);
  const allCarriers = /\ball\s+carriers?\b/.test(text);
  const carrierVerb = /\b(?:show|enable|hide|disable|only|turn\s+(?:on|off))\b/.test(text);
  const modelSettingContext = /\b(?:model|technology|technologies|build settings)\b/.test(text);
  let carrierActionAdded = false;
  if ((carriers.length || allCarriers) && carrierVerb && !modelSettingContext && !layerAction && !explicitNetworkCarrier) {
    const visible = !/\b(?:hide|disable|turn\s+off)\b/.test(text);
    actions.push({
      type: 'carriers',
      mode: /\bonly\b/.test(text) ? 'only' : (visible ? 'show' : 'hide'),
      carriers: allCarriers ? ['all'] : carriers,
    });
    carrierActionAdded = true;
  }

  if (temporalMatch) delete settingUpdates.snapshot_resolution;
  if (carrierActionAdded) {
    const carrierSettingKeys = {
      solar: 'include_solar', onwind: 'include_onwind', offwind: 'include_offwind', gas: 'include_gas',
      nuclear: 'include_nuclear', hydro: 'include_hydro', biomass: 'include_biomass', coal: 'include_coal',
      oil: 'include_oil', hydrogen: 'include_hydrogen', battery: 'include_battery',
    };
    (allCarriers ? Object.keys(carrierSettingKeys) : carriers).forEach((carrier) => {
      delete settingUpdates[carrierSettingKeys[carrier]];
    });
  }
  if (Object.keys(settingUpdates).length) actions.push({ type: 'settings', updates: settingUpdates });
  if (settingIssues.length) actions.push({ type: 'invalid_settings', issues: settingIssues });

  if (/\b(?:more|advanced)(?:\s+model)?\s+settings\b|\bopen\s+settings\b/.test(text)) {
    actions.push({ type: 'open_settings' });
  }
  if (/\b(?:show|open)\s+(?:the\s+)?(?:domain\s+controls|domains?|sidebar)\b/.test(text)) {
    actions.push({ type: 'domain_controls', visible: true });
  } else if (/\b(?:hide|close|collapse)\s+(?:the\s+)?(?:domain\s+controls|domains?|sidebar)\b/.test(text)) {
    actions.push({ type: 'domain_controls', visible: false });
  }

  if (/\bbuild\s+(?:the\s+)?network\b/.test(text) && actions.length === 0) {
    actions.push({ type: 'build_network' });
  }

  return combineAtlasActions(actions);
};
