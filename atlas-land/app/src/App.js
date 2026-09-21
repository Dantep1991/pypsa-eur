import React, { useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";

import * as LucideIcons from 'lucide-react';
import './index.css';
import EnhancedLeafletMapWithVoice from './components/EnhancedLeafletMapWithVoice';
import MapWorkspaceBoundary from './components/MapWorkspaceBoundary';
import AtlasBatchProgress from './components/AtlasBatchProgress';
import { useGridAccessRecords } from './hooks/useGridAccessRecords';
import { useOverlayCountryRecords } from './hooks/useOverlayCountryRecords';
import { useVisibleServicePoll } from './hooks/useVisibleServicePoll';
import Chatbot from './components/Chatbot';
import { deferredPanel } from './components/DeferredPanel';
import { API_BASE_URL } from './config/api';
import { atlasAssetUrl } from './config/assets';
import useEmilVoice from './hooks/useEmilVoice';
import AudioLevelMeter from './components/AudioLevelMeter';
import LoadedCountryList from './components/LoadedCountryList';
import MixedGranularityControls from './components/MixedGranularityControls';
import ModelResultsControls from './components/ModelResultsControls';
import ModelResultLegend from './components/ModelResultLegend';
import { EMIL_VOICE_MODES } from './voice/emilVoiceState';
import { buildAtlasTranscriptionContext } from './voice/atlasTranscriptionContext';
import {
  ATLAS_AGENT_CAPABILITY_SECTIONS,
  ATLAS_AGENT_PARAMETER_CATALOG,
  ATLAS_RESOLUTION_LABELS,
  atlasAgentParameterDefinition,
  extractAtlasCountryGroups,
  normalizeAtlasAgentSettingValue,
  normalizeAtlasModelPlan,
  readAtlasModelCountries,
  normalizeAtlasResolution,
} from './atlasAgentCommands';
import { clearAppliedViewportCommand } from './viewportCommand';
import { readAtlasPlannerResponse } from './atlasPlannerResponse';
import AtlasModal from './components/AtlasModal';
import EmilVoiceLauncher from './components/EmilVoiceLauncher';
import {
  MAP_PERFORMANCE_PREFERENCES,
  MAP_PERFORMANCE_STORAGE_KEY,
  readMapPerformancePreference,
  resolveMapPerformanceMode,
} from './performanceProfile';
import { useAtlasPanelCoordinator } from './hooks/useAtlasPanelCoordinator';
import { useAtlasWorkspaceLayout } from './hooks/useAtlasWorkspaceLayout';
import { useConversationScroll } from './hooks/useConversationScroll';
import { useAssistantSettings } from './hooks/useAssistantSettings';
import { useContextMessages } from './hooks/useContextMessages';
import AtlasWorkspaceRail from './components/AtlasWorkspaceRail';
import {
  atlasWorkspaceAreaDefinition,
  atlasWorkspaceAreaForDomain,
  atlasWorkspaceAreaIsVisible,
} from './atlasWorkspaceNavigation';
import {
  announceNohmModelScene,
  NOHM_ATLAS_DOMAIN_EVENT,
  NOHM_ATLAS_THEME_EVENT,
  NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT,
} from './nohmEmbed';
import { applyAtlasTheme, nextAtlasTheme, normalizeAtlasTheme } from './atlasTheme';
import { createCarrierNetworkRequests } from './carrierNetworkRequests';
import { stageMapBatch, assembleMapBatch, groupPypsaFacilities, mapSharedFacilityGroups } from './pypsaMapBatch';
import { stitchElectricityCrossBorderConnections } from './crossBorderNetwork';
import electricityCrossBorderTopology from './data/electricity-cross-border.json';
import { clearPypsaCatalogueCache, readPypsaCatalogueCache, writePypsaCatalogueCache } from './pypsaCatalogueCache';
import { fetchModelScene, isModelSceneDomain } from './modelWorkspace/modelScene';
import {
  decorateModelResultRecord,
  defaultModelResultSelection,
  fetchModelResultCatalog,
  fetchModelResultScene,
} from './modelWorkspace/resultScene';
import {
  ATLAS_NETWORK_CARRIER_META,
  ATLAS_NETWORK_CARRIER_ORDER,
  normalizeOverlayCountryCodes,
  overlayCarrierStatus,
  overlayEmptyState,
  resolveOverlayCarrierToggle,
  scopedAtlasConnectionIdentity,
} from './atlasNetworkOverlay';
import {
  buildMixedGranularityPlan,
  mixedGranularityResolutionLabel,
} from './mixedGranularity';

const ResultsTab = deferredPanel(() => import('./assistants/emil/ResultsTab'), 'results');
const LineFlowChartPanel = deferredPanel(() => import('./components/LineFlowChartPanel'), 'flow chart');
const PypsaRegionSolveControls = deferredPanel(
  () => import('./components/PypsaRegionSolveControls'),
  'regional solve controls',
);
const GasAtlasControls = deferredPanel(() => import('./components/GasAtlasControls'), 'methane controls');
const WaterAtlasControls = deferredPanel(() => import('./components/WaterAtlasControls'), 'water controls');
const LiquidsAtlasControls = deferredPanel(() => import('./components/LiquidsAtlasControls'), 'liquids controls');
const LogisticsAtlasControls = deferredPanel(() => import('./components/LogisticsAtlasControls'), 'logistics controls');
const RegionalClusteringControls = deferredPanel(
  () => import('./components/RegionalClusteringControls'),
  'regional clustering',
);

const ATLAS_IS_EMBEDDED = typeof window !== 'undefined' && window.self !== window.top;

const {
  ChevronDown, Database, Rocket, Settings, Sparkles, Upload, Zap,
  CheckCircle2, XCircle, LineChart, Boxes, Network, Braces, RefreshCw,
  ListChecks, Globe, FolderOpen, Folder, FileText, Box, Search,
  Send, Loader2, Trash2, Mic, MicOff, VolumeX, Radio, MessageCircle,
  Sun, Moon, Wind, Waves, Droplets, Flame, Factory, Battery, Atom, Car, Hammer,
  Shield, CircleDot, Cog, Leaf, FlaskConical, MapPin, Layers, Clock3,
  CalendarDays, Info, HelpCircle, Circle, Check, PanelLeftClose, PanelLeftOpen,
  Ship, BarChart3,
} = LucideIcons;
const SlidersHorizontal = Settings;

const IS_LOCAL_FRONTEND = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = API_BASE_URL;
const EMPTY_GEOGRAPHIC_OVERLAYS = Object.freeze([]);
// Standalone Atlas exposes Nohm-compatible voice routes through Flask. When
// embedded in Nohm, set REACT_APP_NOHM_VOICE_API_BASE=/api/nohm/voice and the
// same client uses Nohm's authenticated voice service without code changes.
const NOHM_VOICE_API_BASE = process.env.REACT_APP_NOHM_VOICE_API_BASE
  || (typeof window !== 'undefined' && window.__NOHM_VOICE_API_BASE__)
  || `${API_BASE}/api/voice`;

async function checkServerHealth(timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    return response.ok;
  } catch (_) {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
const PYPSA_GRANULARITY_OPTIONS = [
  { value: 'pypsa_37', label: '37' },
  { value: 'pypsa_128', label: '128' },
  { value: 'pypsa_256', label: '256' },
  { value: 'pypsa_512', label: '512' },
  { value: 'pypsa_1024', label: '1024' },
  { value: 'pypsa', label: 'Full' },
];

// Full-European "Joule Model" variants. Each option maps to one folder under
// s3://nova-market-studio-eu/pypsa/. The last stop is the unsized "Joule"
// default (loads s3://.../pypsa/joule_model/ directly).
const JOULE_MODEL_OPTIONS = [
  { value: 37, label: '37', dirname: 'joule_model_pypsa_37' },
  { value: 128, label: '128', dirname: 'joule_model_pypsa_128' },
  { value: 'joule', label: 'Joule', dirname: 'joule_model' },
  { value: 256, label: '256', dirname: 'joule_model_pypsa_256' },
  { value: 512, label: '512', dirname: 'joule_model_pypsa_512' },
  { value: 1024, label: '1024', dirname: 'joule_model_pypsa_1024' },
];
const DEFAULT_JOULE_MODEL_VALUE = 512;

const ATLAS_LAND_CATEGORY_ORDER = ['protected', 'water', 'urban', 'agriculture', 'forest', 'industrial'];
const DEFAULT_ATLAS_LAND_OVERLAY = {
  enabled: false,
  panelOpen: false,
  categories: ['protected', 'water', 'urban'],
  countries: [],
  followMapCountries: true,
  opacity: 68,
};

const DEFAULT_GRID_ACCESS_OVERLAY = {
  enabled: false,
  panelOpen: false,
  // The queue is sourced from registers with different connection-side
  // definitions. Start with the complete evidence view so countries are not
  // silently hidden just because they do not publish a demand-side register.
  sides: ['demand', 'generation', 'storage_import', 'storage_export'],
  metric: 'pressure',
  projectScope: 'future',
  selectionVersion: 2,
};

const EMIL_LOADING_STATES = [
  'Initiating',
  'Starting',
  'Fusing',
  'Mapping',
  'Distilling',
  'Synchronizing',
  'Finalizing',
];

const PYPSA_COUNTRY_NAME_TO_CODE = {
  albania: 'AL', austria: 'AT', 'bosnia and herzegovina': 'BA', belgium: 'BE',
  armenia: 'AM', belarus: 'BY', moldova: 'MD', malta: 'MT', russia: 'RU',
  bulgaria: 'BG', switzerland: 'CH', czechia: 'CZ', 'czech republic': 'CZ',
  germany: 'DE', denmark: 'DK', estonia: 'EE', spain: 'ES', finland: 'FI',
  france: 'FR', 'great britain': 'GB', 'united kingdom': 'GB', greece: 'GR',
  croatia: 'HR', hungary: 'HU', ireland: 'IE', italy: 'IT', lithuania: 'LT',
  luxembourg: 'LU', latvia: 'LV', montenegro: 'ME', 'north macedonia': 'MK',
  netherlands: 'NL', norway: 'NO', poland: 'PL', portugal: 'PT', romania: 'RO',
  serbia: 'RS', sweden: 'SE', slovenia: 'SI', slovakia: 'SK', kosovo: 'XK',
  turkey: 'TR', ukraine: 'UA',
};

const pypsaCountryCodeFromRegion = (region) => {
  const normalized = String(region || '').trim();
  if (/^[A-Za-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  return PYPSA_COUNTRY_NAME_TO_CODE[normalized.toLowerCase()] || '';
};

const AtlasDomainSection = ({ icon: Icon, title, summary, open, onToggle, compact = false, retain = false, children }) => {
  const [openedOnce, setOpenedOnce] = useState(open);
  useEffect(() => {
    if (open) setOpenedOnce(true);
  }, [open]);
  const mounted = open || (retain && openedOnce);
  return (
  <section className="atlas-domain-section">
    {!compact && (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="atlas-domain-section__trigger"
      >
        <span className={`atlas-domain-section__icon ${open ? 'is-active' : ''}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="atlas-domain-section__eyebrow">Atlas workspace</span>
          <span className="atlas-domain-section__title">{title}</span>
          <span className="atlas-domain-section__summary">{summary}</span>
        </span>
        <ChevronDown className={`atlas-domain-section__chevron h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    )}
    {mounted && <div hidden={!open} className="px-3 pb-3 text-xs">{children}</div>}
  </section>
  );
};

const ATLAS_MAP_DOMAINS = ['Grid', 'Storage', 'Supply', 'Demand'];
const ATLAS_AGENT_MAP_LAYERS = [...ATLAS_MAP_DOMAINS, 'Access'];
const canonicalAtlasAgentLayer = (value) => ({
  grid: 'Grid',
  storage: 'Storage',
  supply: 'Supply',
  generation: 'Supply',
  demand: 'Demand',
  access: 'Access',
  'grid access': 'Access',
  'connection queue': 'Access',
})[String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ')];
const ATLAS_JUDGE_SAFE_CORRECTION_INTENTS = new Set([
  'set_network_carrier',
  'set_land_constraints',
  'navigate_to_location', 'control_map_view', 'load_country', 'load_all_countries', 'load_country_groups',
  'add_country', 'remove_country', 'focus_country', 'set_model_standard',
  'set_granularity', 'step_granularity', 'set_network_resolution',
  'step_network_resolution', 'set_map_layers', 'set_carrier_filters',
  'set_temporal_resolution', 'set_model_settings', 'toggle_generation_mix',
  'set_run_mode', 'open_settings', 'toggle_domain_controls', 'select_region',
  'update_radius',
]);

const classifyAtlasMapDomain = (facility) => {
  if (ATLAS_MAP_DOMAINS.includes(facility?.atlas_domain)) return facility.atlas_domain;
  const componentType = String(facility?.component_type || facility?.type || '').trim().toLowerCase();
  const carrier = String(facility?.carrier || facility?.carrier_key || '').trim().toLowerCase();
  if (
    componentType === 'storageunit' || componentType === 'store' || componentType === 'storage'
    || carrier.includes('battery') || carrier.includes('storage')
  ) return 'Storage';
  if (componentType === 'load' || componentType === 'demand' || carrier === 'load') return 'Demand';
  if (componentType === 'link') {
    const gridLink = !carrier || ['ac', 'dc', 'hvdc', 'line', 'transmission', 'interconnector']
      .some((token) => carrier === token || carrier.includes(token));
    return gridLink ? 'Grid' : 'Supply';
  }
  if (
    componentType === 'bus' || componentType === 'line'
    || componentType === 'transformer' || componentType === 'virtualbus'
  ) return 'Grid';
  return 'Supply';
};

const atlasCarrierFilterKey = (facility) => {
  const carrier = String(facility?.carrier_key || facility?.type || 'unknown');
  return `${classifyAtlasMapDomain(facility)}::${carrier}`;
};

const WATER_ASSET_FILTERS = {
  water_works: {
    domain: 'Supply', terms: ['water works'],
    carrierKeys: ['water_water_works'],
  },
  desalination: {
    domain: 'Supply', terms: ['desalination'],
    carrierKeys: ['water_desalination_plant'],
  },
  wastewater_treatment: {
    domain: 'Supply', terms: ['wastewater treatment', 'treatment plant'],
    carrierKeys: ['water_wastewater_treatment_plant'],
  },
  agglomeration: {
    domain: 'Demand', terms: ['wastewater agglomeration', 'agglomeration'],
    carrierKeys: ['water_wastewater_agglomeration'],
  },
  discharge: {
    domain: 'Grid', terms: ['wastewater discharge', 'discharge point'],
    carrierKeys: ['water_wastewater_discharge_point'],
  },
  water_tower: {
    domain: 'Storage', terms: ['water tower'],
    carrierKeys: ['water_water_tower'],
  },
  reservoir: {
    domain: 'Storage', terms: ['reservoir'],
    carrierKeys: ['water_covered_reservoir', 'water_reported_reservoir'],
  },
};

const atlasResolutionKeyForEntry = (entry) => {
  if (entry?.is_full_nodal_network || entry?.isFullNodal) return 'full';
  return String(entry?.geographic_level || entry?.geographicLevel || '').trim().toLowerCase();
};

const PYPSA_SETTINGS_DEFAULTS = {
  region: 'Belgium',
  planning_horizon: 2025,
  weather_year: 2025,
  scenario_name: 'Baseline Scenario',
  model_scope: 'country',
  spatial_resolution: 'NUTS3',
  snapshot_start: '2025-01-01',
  snapshot_end: '2026-01-01',
  snapshot_resolution: 'monthly',
  clusters: 64,
  cross_border_links: true,
  transmission_expansion: true,
  transmission_expansion_limit: 200,
  offshore_network: true,
  include_solar: true,
  include_onwind: true,
  include_offwind: true,
  include_gas: true,
  include_coal: true,
  include_oil: true,
  include_biomass: true,
  include_hydro: true,
  include_nuclear: true,
  include_battery: true,
  include_pumped_hydro: true,
  include_hydrogen: true,
  sector_heat: true,
  sector_hydrogen: true,
  sector_transport: true,
  sector_industry: true,
  district_heating: true,
  ev_demand: true,
  electrolysers: true,
  hydrogen_to_power: true,
  chp: true,
  heat_pumps: true,
  existing_assets_only: false,
  allow_capacity_expansion: true,
  generator_expansion: true,
  storage_expansion: true,
  network_expansion: true,
  solar_p_nom_max: 200,
  wind_p_nom_max: 200,
  gas_p_nom_max: 120,
  reserve_margin: 15,
  cost_year: 2025,
  discount_rate: 7,
  carbon_price: 'auto',
  gas_price: 50,
  coal_price: 30,
  oil_price: 80,
  biomass_price: 45,
  voll: 100000,
  co2_cap: 'auto',
  renewable_share_target: 75,
  coal_phaseout_year: 2035,
  nuclear_phaseout: false,
  gas_allowed_post_year: true,
  security_constraint: true,
  unit_commitment: false,
  ramp_limits: true,
  cyclic_storage: true,
  hydro_inflows: true,
  allow_curtailment: true,
  load_shedding: true,
  strict_dynamic: true,
  solver_name: 'highs',
  solver_threads: 8,
  solver_time_limit: 3600,
  mip_gap: 0.01,
  solver_method: 'simplex',
  build_only: false,
};

function extractResolutionLabelFromName(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  if (/_pypsa_full$/i.test(raw) || /_pypsa$/i.test(raw)) return 'pypsa';
  const suffixMatch = raw.match(/pypsa_(1024|512|256|128|37)(?![0-9])/i);
  if (suffixMatch) return `pypsa_${suffixMatch[1]}`;
  return null;
}

function extractStoragePrefixFromS3Folder(s3Folder) {
  const raw = String(s3Folder || '').trim();
  if (!raw) return null;
  const prefixMatch = raw.match(/(?:^|\/)(pypsa_1024|pypsa_512|pypsa_256|pypsa_128|pypsa_37|pypsa)(?:\/|$)/i);
  if (prefixMatch) return prefixMatch[1].toLowerCase();
  return null;
}

function extractDirnameFromS3Folder(s3Folder) {
  const raw = String(s3Folder || '').trim();
  if (!raw) return '';
  const withoutProtocol = raw.replace(/^s3:\/\//i, '').replace(/\/+$/, '');
  if (!withoutProtocol) return '';
  const slashIdx = withoutProtocol.indexOf('/');
  const keyPath = slashIdx >= 0 ? withoutProtocol.slice(slashIdx + 1) : '';
  if (!keyPath) return '';
  const parts = keyPath.split('/').filter(Boolean);
  if (!parts.length) return '';
  if (PYPSA_GRANULARITY_OPTIONS.some((opt) => opt.value === parts[0])) {
    return parts.slice(1).join('/');
  }
  return parts[parts.length - 1];
}

function rewriteDistillNameForGranularity(dirname, nextGranularity) {
  const raw = String(dirname || '').trim().replace(/\/+$/, '');
  if (!raw) return [];
  const stripped = raw.replace(/_pypsa(?:_(?:full|1024|512|256|128|37))?$/i, '');
  if (stripped === raw) return [];
  if (nextGranularity === 'pypsa') {
    return [`${stripped}_pypsa_full`, `${stripped}_pypsa`];
  }
  return [`${stripped}_${nextGranularity}`];
}

// Server down screen
function ServerDownScreen() {
  const [checking, setChecking] = React.useState(false);
  const retry = React.useCallback(() => {
    setChecking(true);
    checkServerHealth().then((healthy) => {
      if (healthy) window.location.reload();
      else setChecking(false);
    });
  }, []);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      checkServerHealth(2500).then((healthy) => {
        if (healthy) window.location.reload();
      });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b2e 100%)',
      color: '#e2e8f0', fontFamily: 'sans-serif', textAlign: 'center', padding: '2rem'
    }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚡</div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: '#f59e0b' }}>
        Server Offline
      </h1>
      <p style={{ color: '#94a3b8', maxWidth: 400, marginBottom: '0.5rem' }}>
        The NOVA Energy Analyst server is currently stopped.
      </p>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '2rem' }}>
        Please contact the admin to start the server, then try again.
      </p>
      <button
        onClick={retry}
        disabled={checking}
        style={{
          background: checking ? '#374151' : '#f59e0b', color: '#0a0f1e',
          border: 'none', borderRadius: 8, padding: '0.6rem 1.5rem',
          fontWeight: 700, fontSize: '0.9rem', cursor: checking ? 'not-allowed' : 'pointer'
        }}
      >
        {checking ? 'Checking...' : 'Try Again'}
      </button>
    </div>
  );
}

function AppInner() {
  // Nohm Flow is the Atlas/PyPSA product surface. The prototype's assistant
  // switcher and engine header were removed from the UI, and every reachable
  // workflow already returned here. Constants make that product boundary
  // explicit and let production builds discard the unreachable legacy views.
  const engine = 'PyPSA Engine';
  const activeAssistant = 'emil';
  const activeTab = 'map';
  const setActiveAssistant = () => {};
  const setActiveTab = () => {};
  const [aiOpen, setAiOpen] = useState(true);
  const [activeScenario, setActiveScenario] = useState("Base 2030");
  const [nohmWorkspaceContext, setNohmWorkspaceContext] = useState(
    () => window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ || null
  );
  const [modelSceneStatus, setModelSceneStatus] = useState({ state: 'idle', meta: null, error: '' });
  const [modelResultCatalogStatus, setModelResultCatalogStatus] = useState({ state: 'idle', catalog: null, error: '' });
  const [modelResultSelection, setModelResultSelection] = useState(null);
  const [modelResultStatus, setModelResultStatus] = useState({ state: 'idle', scene: null, error: '' });
  const modelResultRequestRef = useRef(null);
  const [viewMode, setViewMode] = useState('properties');
  const [lolaLiveUrl] = useState('https://joule-model.terajouleenergy.com/');
  const [assistantStatus, setAssistantStatus] = useState({
    copilot: 'idle',
    dashboard: 'idle',
    nova: 'idle',
    emil: 'idle',
    lola: 'idle'
  });
  const [expandedCarriers, setExpandedCarriers] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [facilitiesData, setFacilitiesData] = useState([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  // Node locations fetched from Emil filtered_attributes (Node.Latitude/Longitude)
  const [nodeLocationsMap, setNodeLocationsMap] = useState(new Map());
  const [selectedCountry, setSelectedCountry] = useState('All');
  const [selectedNodes, setSelectedNodes] = useState([]); // Multiple selected nodes for connections
  const [connections, setConnections] = useState([]); // Connections between nodes
  // Map metric overlay for Lines
  const [lineMetricEnabled, setLineMetricEnabled] = useState(false);
  const [lineMetricProperty, setLineMetricProperty] = useState('Max Flow');
  // Selection state when clicking a connection (line)
  const [selectedLineInfo, setSelectedLineInfo] = useState(null); // { childName, pos: {lat,lng} }
  useEffect(() => {
    if (!selectedLineInfo) return undefined;
    const onEsc = (e) => {
      if (e.key === 'Escape') setSelectedLineInfo(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [selectedLineInfo]);
  // UI: collapsible map controls (left side)
  const { compact: compactAtlasLayout, domainsCollapsed: mapControlsCollapsed, setDomainsCollapsed: setMapControlsCollapsed } = useAtlasWorkspaceLayout();
  const [atlasTheme, setAtlasTheme] = useState(() => {
    try {
      if (ATLAS_IS_EMBEDDED) {
        const hostRoot = window.parent.document.documentElement;
        if (hostRoot.dataset.themeVariant === 'horizon') return 'horizon';
        return normalizeAtlasTheme(hostRoot.dataset.theme);
      }
      const stored = window.localStorage?.getItem('atlas_theme');
      return normalizeAtlasTheme(stored);
    } catch (_) { return 'dark'; }
  });
  useEffect(() => {
    applyAtlasTheme(atlasTheme);
    if (!ATLAS_IS_EMBEDDED) {
      try { window.localStorage?.setItem('atlas_theme', atlasTheme); } catch (_) { /* storage unavailable */ }
    }
  }, [atlasTheme]);
  const [atlasAssetPopupOpen, setAtlasAssetPopupOpen] = useState(false);
  const [atlasPopupDismissRequest, setAtlasPopupDismissRequest] = useState(0);
  const mapAgentInputRef = useRef(null);
  const mapAgentFocusRequestedRef = useRef(false);
  // Capacity/generation pies are the clearest default for buses containing
  // multiple generators; users can still turn them off in Map Filters.
  const [showGenerationMix, setShowGenerationMix] = useState(true);
  const [showMapNodes, setShowMapNodes] = useState(() => {
    try { return window.localStorage?.getItem('atlas-map-show-nodes') !== 'false'; }
    catch (_) { return true; }
  });
  const [showGeographicBoundaries, setShowGeographicBoundaries] = useState(() => {
    try { return window.localStorage?.getItem('atlas-map-show-boundaries') !== 'false'; }
    catch (_) { return true; }
  });
  useEffect(() => {
    try {
      window.localStorage?.setItem('atlas-map-show-nodes', String(showMapNodes));
      window.localStorage?.setItem('atlas-map-show-boundaries', String(showGeographicBoundaries));
    } catch (_) { /* localStorage unavailable */ }
  }, [showMapNodes, showGeographicBoundaries]);
  const [activeDataLayer, setActiveDataLayer] = useState('facilities');
  const [mapViewMode, setMapViewMode] = useState('our-model'); // 'our-model' or 'entsoe-transparent'
  const [jouleModelSize, setJouleModelSize] = useState(null); // null | 37 | 128 | 256 | 512
  const [jouleModelLoading, setJouleModelLoading] = useState(false);
  const [fullEuOnly, setFullEuOnly] = useState(false);
  const [marketPrices, setMarketPrices] = useState({});
  const [generationMix, setGenerationMix] = useState({});
  const [transmissionFlows, setTransmissionFlows] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Atlas carrier systems are independent datasets that share the same map,
  // domain controls and agent surface. Electricity remains the default;
  // methane is backed by the local ENTSOG + SciGRID_gas cache.
  const [atlasNetworkCarrier, setAtlasNetworkCarrier] = useState(() => {
    try { return window.localStorage?.getItem('atlas-network-carrier') || 'electricity'; }
    catch (_) { return 'electricity'; }
  });
  const atlasNetworkCarrierRef = useRef(atlasNetworkCarrier);
  const [atlasOverlayMode, setAtlasOverlayMode] = useState(() => {
    try { return window.localStorage?.getItem('atlas-network-overlay-mode') === 'true'; }
    catch (_) { return false; }
  });
  // Until the first overlay session, follow the current single-carrier view.
  // Merely opening the legend must not download every independent network.
  const [atlasOverlayCarrierSelection, setAtlasOverlayCarrierSelection] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage?.getItem('atlas-network-overlay-carriers') || '[]');
      const valid = Array.isArray(stored) ? stored.filter((carrier) => ATLAS_NETWORK_CARRIER_ORDER.includes(carrier)) : [];
      return valid.length ? [...new Set(valid)] : null;
    } catch (_) { return null; }
  });
  const atlasOverlayCarriers = useMemo(() => atlasOverlayCarrierSelection || [
    ATLAS_NETWORK_CARRIER_ORDER.includes(atlasNetworkCarrier) ? atlasNetworkCarrier : 'electricity',
  ], [atlasOverlayCarrierSelection, atlasNetworkCarrier]);
  // Event handlers can run more quickly than React publishes the preceding
  // render. Keep the effective selection synchronously owned here so rapid
  // carrier toggles compose instead of overwriting one another from a stale
  // closure. Network loads may populate caches, but never mutate visibility.
  const atlasOverlayCarriersRef = useRef(atlasOverlayCarriers);
  useLayoutEffect(() => {
    atlasOverlayCarriersRef.current = atlasOverlayCarriers;
  }, [atlasOverlayCarriers]);
  const setAtlasOverlayCarriers = useCallback((update) => {
    const previous = atlasOverlayCarriersRef.current;
    const proposed = typeof update === 'function' ? update(previous) : update;
    const requested = Array.isArray(proposed) ? proposed : [];
    const next = ATLAS_NETWORK_CARRIER_ORDER.filter((carrier) => requested.includes(carrier));
    atlasOverlayCarriersRef.current = next;
    setAtlasOverlayCarrierSelection(next);
  }, []);
  const [atlasOverlayNotice, setAtlasOverlayNotice] = useState(null);
  const atlasOverlayLoadAttemptsRef = useRef(new Map());
  const atlasOverlayScopeAttemptsRef = useRef(new Map());
  const atlasOverlayCountryScopeRef = useRef('');
  const [atlasOverlayPanelOpen, setAtlasOverlayPanelOpen] = useState(true);
  const [mapAgentOpen, setMapAgentOpen] = useState(false);
  const mapAgentSettings = useAssistantSettings();
  const atlasOverlayModeRef = useRef(atlasOverlayMode);
  const atlasWorkspaceTransitionRef = useRef(null);
  const [landStatus, setLandStatus] = useState(null);
  const [landOverlay, setLandOverlay] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage?.getItem('atlas-land-overlay') || 'null');
      const categories = Array.isArray(stored?.categories)
        ? ATLAS_LAND_CATEGORY_ORDER.filter((category) => stored.categories.includes(category))
        : [...DEFAULT_ATLAS_LAND_OVERLAY.categories];
      const countries = Array.isArray(stored?.countries)
        ? [...new Set(stored.countries.map((code) => String(code || '').trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))]
        : [];
      return {
        ...DEFAULT_ATLAS_LAND_OVERLAY,
        ...stored,
        panelOpen: false,
        categories,
        countries,
        followMapCountries: stored?.followMapCountries !== false,
        opacity: Math.max(20, Math.min(100, Number(stored?.opacity || 68))),
      };
    } catch (_) { return { ...DEFAULT_ATLAS_LAND_OVERLAY }; }
  });
  // Opacity is presentation state, so the range control can update Leaflet and
  // persistence without forcing the whole Atlas application through React.
  // Keep the latest value beside React state so later structural land changes
  // (country/category/visibility) still compose with the imperatively committed
  // opacity instead of restoring an older percentage.
  const landOverlayRef = useRef(landOverlay);
  const setLandOverlayCached = useCallback((update) => {
    setLandOverlay((reactState) => {
      const current = landOverlayRef.current || reactState;
      const next = typeof update === 'function' ? update(current) : update;
      const resolved = next == null ? current : next;
      landOverlayRef.current = resolved;
      return resolved;
    });
  }, []);
  useLayoutEffect(() => {
    landOverlayRef.current = landOverlay;
  }, [landOverlay]);
  const commitLandOverlayOpacity = useCallback((rawOpacity) => {
    const opacity = Math.max(20, Math.min(100, Number(rawOpacity) || 20));
    const next = { ...(landOverlayRef.current || DEFAULT_ATLAS_LAND_OVERLAY), opacity };
    landOverlayRef.current = next;
    try { window.localStorage?.setItem('atlas-land-overlay', JSON.stringify(next)); }
    catch (_) { /* localStorage unavailable */ }
  }, []);
  const [gridAccessStatus, setGridAccessStatus] = useState(null);
  const [gridAccessOverlay, setGridAccessOverlay] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage?.getItem('atlas-grid-access-overlay') || 'null');
      const validSides = ['demand', 'generation', 'storage_import', 'storage_export'];
      // Migrate the original implicit demand-only default to the complete
      // queue view. Explicit choices made with the new controls are retained.
      const sides = stored?.selectionVersion === DEFAULT_GRID_ACCESS_OVERLAY.selectionVersion
        && Array.isArray(stored?.sides)
        ? validSides.filter((side) => stored.sides.includes(side))
        : [...DEFAULT_GRID_ACCESS_OVERLAY.sides];
      return {
        ...DEFAULT_GRID_ACCESS_OVERLAY,
        ...(stored || {}),
        panelOpen: false,
        sides: sides.length ? sides : [...DEFAULT_GRID_ACCESS_OVERLAY.sides],
        metric: ['pressure', 'available_mw', 'queued_mw', 'project_count', 'lead_time_years'].includes(stored?.metric)
          ? stored.metric : DEFAULT_GRID_ACCESS_OVERLAY.metric,
        projectScope: stored?.projectScope === 'all' ? 'all' : 'future',
      };
    } catch (_) { return { ...DEFAULT_GRID_ACCESS_OVERLAY }; }
  });
  const [gasStatus, setGasStatus] = useState(null);
  const focusAtlasPanel = useAtlasPanelCoordinator({
    setAssistant: setMapAgentOpen, setCarriers: setAtlasOverlayPanelOpen,
    setLand: setLandOverlayCached, setAccess: setGridAccessOverlay,
    compact: compactAtlasLayout, setDomainsCollapsed: setMapControlsCollapsed,
  });
  const openMapAssistant = useCallback(() => {
    mapAgentFocusRequestedRef.current = true;
    if (atlasAssetPopupOpen) setAtlasPopupDismissRequest((request) => request + 1);
    focusAtlasPanel('assistant');
  }, [atlasAssetPopupOpen, focusAtlasPanel]);
  const [gasFacilitiesData, setGasFacilitiesData] = useState([]);
  const [gasConnections, setGasConnections] = useState([]);
  const [gasLoadedDomains, setGasLoadedDomains] = useState({ Grid: false, Storage: false, Supply: false, Demand: false });
  const [gasDomainLoading, setGasDomainLoading] = useState('');
  const [gasDataError, setGasDataError] = useState('');
  const [gasCountryFilter, setGasCountryFilter] = useState('');
  const [gasDatasetMeta, setGasDatasetMeta] = useState({});
  const gasLoadRequestRef = useRef(0);
  const gasCountryFilterRef = useRef('');
  const gasDatasetCountryScopeRef = useRef('');
  const gasControlledLoadRef = useRef(false);
  const gasInitializingRef = useRef('');
  const [waterStatus, setWaterStatus] = useState(null);
  const [waterFacilitiesData, setWaterFacilitiesData] = useState([]);
  const [waterConnections, setWaterConnections] = useState([]);
  const [waterLoadedDomains, setWaterLoadedDomains] = useState({ Grid: false, Storage: false, Supply: false, Demand: false });
  const [waterDomainLoading, setWaterDomainLoading] = useState('');
  const [waterDataError, setWaterDataError] = useState('');
  const [waterCountryFilter, setWaterCountryFilter] = useState('');
  const [waterDatasetMeta, setWaterDatasetMeta] = useState({});
  const waterLoadRequestRef = useRef(0);
  const waterCountryFilterRef = useRef('');
  const waterDatasetCountryScopeRef = useRef('');
  const waterControlledLoadRef = useRef(false);
  const waterInitializingRef = useRef('');
  const [liquidsStatus, setLiquidsStatus] = useState(null);
  const [liquidsFacilitiesData, setLiquidsFacilitiesData] = useState([]);
  const [liquidsConnections, setLiquidsConnections] = useState([]);
  const [liquidsLoadedDomains, setLiquidsLoadedDomains] = useState({ Grid: false, Storage: false, Supply: false, Demand: false });
  const [liquidsDomainLoading, setLiquidsDomainLoading] = useState('');
  const [liquidsDataError, setLiquidsDataError] = useState('');
  const [liquidsCountryFilter, setLiquidsCountryFilter] = useState('');
  const [liquidsDatasetMeta, setLiquidsDatasetMeta] = useState({});
  const liquidsLoadRequestRef = useRef(0);
  const liquidsCountryFilterRef = useRef('');
  const liquidsDatasetCountryScopeRef = useRef('');
  const liquidsControlledLoadRef = useRef(false);
  const liquidsInitializingRef = useRef('');
  const [logisticsStatus, setLogisticsStatus] = useState(null);
  const [logisticsFacilitiesData, setLogisticsFacilitiesData] = useState([]);
  const [logisticsConnections, setLogisticsConnections] = useState([]);
  const [logisticsLoadedDomains, setLogisticsLoadedDomains] = useState({ Grid: false, Storage: false, Supply: false, Demand: false });
  const [logisticsDomainLoading, setLogisticsDomainLoading] = useState('');
  const [logisticsDataError, setLogisticsDataError] = useState('');
  const [logisticsCountryFilter, setLogisticsCountryFilter] = useState('');
  const [logisticsDatasetMeta, setLogisticsDatasetMeta] = useState({});
  const logisticsLoadRequestRef = useRef(0);
  const logisticsCountryFilterRef = useRef('');
  const logisticsDatasetCountryScopeRef = useRef('');
  const logisticsControlledLoadRef = useRef(false);
  const logisticsInitializingRef = useRef('');
  const logisticsLoadedModeCounts = useMemo(() => logisticsFacilitiesData.reduce((counts, facility) => {
    if (facility.logistics_mode === 'maritime') counts.maritime += 1;
    if (facility.logistics_mode === 'aviation') counts.aviation += 1;
    return counts;
  }, { maritime: 0, aviation: 0 }), [logisticsFacilitiesData]);
  const carrierNetworkRequests = useMemo(() => createCarrierNetworkRequests(), []);
  useEffect(() => () => {
    // Invalidate commits before aborting; an old finally must not affect a
    // later mount or a newer request (including React StrictMode replay).
    gasLoadRequestRef.current += 1;
    waterLoadRequestRef.current += 1;
    liquidsLoadRequestRef.current += 1;
    logisticsLoadRequestRef.current += 1;
    gasInitializingRef.current = '';
    waterInitializingRef.current = '';
    liquidsInitializingRef.current = '';
    logisticsInitializingRef.current = '';
    atlasWorkspaceTransitionRef.current = null;
    atlasOverlayLoadAttemptsRef.current.clear();
    atlasOverlayScopeAttemptsRef.current.clear();
    carrierNetworkRequests.cancelAll();
  }, [carrierNetworkRequests]);
  // PyPSA Engine state
  const initialPypsaCatalogueRef = useRef(undefined);
  if (initialPypsaCatalogueRef.current === undefined) {
    try {
      initialPypsaCatalogueRef.current = readPypsaCatalogueCache(window.localStorage, 'pypsa', 'auto');
    } catch (_) {
      initialPypsaCatalogueRef.current = null;
    }
  }
  const initialPypsaCatalogue = initialPypsaCatalogueRef.current;
  const [pypsaFiles, setPypsaFiles] = useState(() => initialPypsaCatalogue?.files || []);
  // Agent commands can arrive before React publishes the catalogue request.
  // Keep the latest validated entries synchronously readable so a command that
  // awaits that request can continue in the same callback turn.
  const pypsaFilesRef = useRef(initialPypsaCatalogue?.files || []);
  const [pypsaFilesSource, setPypsaFilesSource] = useState(() => (
    initialPypsaCatalogue ? `saved ${initialPypsaCatalogue.source}` : 'auto'
  ));
  const [pypsaCatalogueUsingCache, setPypsaCatalogueUsingCache] = useState(Boolean(initialPypsaCatalogue));
  const pypsaCompactOverlaysRef = useRef(initialPypsaCatalogue?.capabilities?.parse_nc_omit_geojson_overlays === true);
  const [pypsaCatalogueLoading, setPypsaCatalogueLoading] = useState(false);
  const [pypsaCatalogueError, setPypsaCatalogueError] = useState('');
  const [pypsaCatalogueAttempt, setPypsaCatalogueAttempt] = useState(0);
  const [selectedPypsaListFile, setSelectedPypsaListFile] = useState('');
  const [selectedPyPSAFile, setSelectedPyPSAFile] = useState('');
  const [selectedPyPSACountryCode, setSelectedPyPSACountryCode] = useState('');
  const [loadedPypsaNetworks, setLoadedPypsaNetworks] = useState([]);
  const [mixedGranularityPlan, setMixedGranularityPlan] = useState(null);
  const [countryDropdownValue, setCountryDropdownValue] = useState('');
  const [selectingAllCountries, setSelectingAllCountries] = useState(false);
  const [geographyDrilldown, setGeographyDrilldown] = useState('');
  const [geographyLoadError, setGeographyLoadError] = useState('');
  const [pypsaGranularity, setPypsaGranularity] = useState('pypsa');
  const [planningHorizonYear, setPlanningHorizonYear] = useState(() => {
    try {
      return window.localStorage?.getItem('nova-planning-horizon-year') || '2025';
    } catch (_) { return '2025'; }
  });
  const [pypsaFacilitiesData, setPypsaFacilitiesData] = useState([]);
  const [pypsaConnections, setPypsaConnections] = useState([]);
  const [pypsaGeoJsonOverlays, setPypsaGeoJsonOverlays] = useState([]);
  const pypsaFacilitiesDataRef = useRef([]);
  const pypsaConnectionsRef = useRef([]);
  const pypsaGeoJsonOverlaysRef = useRef([]);
  const [pypsaDatasetMeta, setPypsaDatasetMeta] = useState({ filename: '', sourceBusCount: 0 });
  const [pypsaLoading, setPypsaLoading] = useState(false);
  const [pypsaResolutionSwitching, setPypsaResolutionSwitching] = useState(false);
  const pypsaBatchRef = useRef(null);
  const [pypsaBatchProgress, setPypsaBatchProgress] = useState(null);
  const [networkResolutionDraftIndex, setNetworkResolutionDraftIndex] = useState(null);
  const networkResolutionCommitTimerRef = useRef(null);
  const networkCancelRevisionRef = useRef(0);
  const cancelPyPSAMapBatch = useCallback(() => {
    if (!pypsaBatchRef.current) return;
    networkCancelRevisionRef.current += 1;
    pypsaBatchRef.current.abort();
  }, []);
  useEffect(() => () => {
    pypsaBatchRef.current?.abort();
    if (networkResolutionCommitTimerRef.current) window.clearTimeout(networkResolutionCommitTimerRef.current);
  }, []);
  const [pypsaComponentScope, setPypsaComponentScope] = useState('full'); // 'full' | 'lines_only'
  const [pypsaDeferredDetailLoad, setPypsaDeferredDetailLoad] = useState(false);
  const [pypsaDetailHydrating, setPypsaDetailHydrating] = useState(false);
  const [pypsaLoadedDomainsByNetwork, setPypsaLoadedDomainsByNetwork] = useState({});
  const [pypsaDomainLoading, setPypsaDomainLoading] = useState('');
  const pypsaMapMembershipRef = useRef({ networks: [], domains: {}, activeCountry: '' });
  useEffect(() => {
    pypsaMapMembershipRef.current = { networks: loadedPypsaNetworks, domains: pypsaLoadedDomainsByNetwork, activeCountry: selectedPyPSACountryCode };
  }, [loadedPypsaNetworks, pypsaLoadedDomainsByNetwork, selectedPyPSACountryCode]);
  const [emilFocusLocation, setEmilFocusLocation] = useState(null);
  const [emilViewportCommand, setEmilViewportCommand] = useState(null);
  const handleViewportCommandApplied = useCallback((id) => {
    setEmilViewportCommand((pending) => clearAppliedViewportCommand(pending, id));
  }, []);
  const handleFocusLocationApplied = useCallback((location) => {
    setEmilFocusLocation((pending) => pending === location ? null : pending);
  }, []);
  // Region-solve state: islanded LOPF on a circular subset of the built network.
  const [regionPanelVisible, setRegionPanelVisible] = useState(false);
  const [regionCenter, setRegionCenter] = useState(null);
  const [regionRadiusKm, setRegionRadiusKm] = useState(120);
  const [regionSolving, setRegionSolving] = useState(false);
  const [regionManifest, setRegionManifest] = useState(null);
  const [regionError, setRegionError] = useState(null);
  const [regionS3Folder, setRegionS3Folder] = useState('');
  const [regionDirname, setRegionDirname] = useState('');
  const [regionSourceDirname, setRegionSourceDirname] = useState('');
  const [regionSavedRuns, setRegionSavedRuns] = useState([]);
  const [selectedSavedRegionKey, setSelectedSavedRegionKey] = useState('');
  const [regionSavedRunsLoading, setRegionSavedRunsLoading] = useState(false);
  // Saved region history is not needed to render or browse Atlas. Remember a
  // successful lookup for the lifetime of this workspace and fetch it only
  // when the region workflow is actually opened (or explicitly refreshed).
  const regionSavedRunsLoadedRef = useRef(false);
  const [regionSaveBusy, setRegionSaveBusy] = useState(false);
  const [regionOpsMessage, setRegionOpsMessage] = useState('');
  // Map-agent context: lightweight memory the chatbot uses to resolve pronouns
  // ("here", "this region") and follow-ups ("make it 50 km", "try Paris").
  // The live camera always lives in a ref for EMIL/judge reads. Reactive state
  // is needed only while a lightweight network is waiting for zoom-triggered
  // detail hydration; keeping ordinary navigation out of App state avoids a
  // full application render after every pan or zoom.
  const [lastSearchedLocation, setLastSearchedLocation] = useState(null);
  const mapViewRef = useRef({ lat: null, lng: null, zoom: null });
  const [mapViewState, setMapViewState] = useState({ lat: null, lng: null, zoom: null });
  const [mapRenderStats, setMapRenderStats] = useState({ renderedLinks: 0, unmappedLinks: 0, renderingLinks: false, renderError: '' });
  const handleMapRenderStatsChange = useCallback((next) => {
    setMapRenderStats((previous) => previous.renderedLinks === next.renderedLinks && previous.unmappedLinks === next.unmappedLinks
      && previous.renderingLinks === next.renderingLinks && previous.renderError === next.renderError
      && previous.overviewLines === next.overviewLines
      && previous.generationSitesRendered === next.generationSitesRendered && previous.generationSitesInView === next.generationSitesInView
      ? previous : next);
  }, []);
  const [hiddenCarriers, setHiddenCarriers] = useState(new Set()); // carriers toggled off on the map
  const [atlasDomainVisibility, setAtlasDomainVisibility] = useState({
    Grid: true,
    Storage: false,
    Supply: false,
    Demand: false,
  });
  useEffect(() => { pypsaFacilitiesDataRef.current = pypsaFacilitiesData; }, [pypsaFacilitiesData]);
  useEffect(() => { pypsaConnectionsRef.current = pypsaConnections; }, [pypsaConnections]);
  useEffect(() => { pypsaGeoJsonOverlaysRef.current = pypsaGeoJsonOverlays; }, [pypsaGeoJsonOverlays]);

  const loadGasDomains = useCallback(async (domains, options = {}) => {
    const requested = [...new Set((domains || ['Grid']).map((domain) => String(domain || '').trim()).filter(Boolean))];
    const loadingLabel = requested.length === 1 ? requested[0] : 'Gas data';
    const replace = Boolean(options.replace);
    const requestId = gasLoadRequestRef.current + 1;
    gasLoadRequestRef.current = requestId;
    setGasDomainLoading(loadingLabel);
    setGasDataError('');
    if (replace) {
      // Release the previous carrier geometry before fetching a replacement.
      // Keeping thousands of stale vector paths mounted made a small country
      // switch wait for the old Europe-wide map to reconcile first.
      setGasFacilitiesData([]);
      setGasConnections([]);
      setGasLoadedDomains({ Grid: false, Storage: false, Supply: false, Demand: false });
    }
    try {
      const params = new URLSearchParams({ domains: requested.join(',') });
      const country = options.country !== undefined ? options.country : gasCountryFilterRef.current;
      if (replace) gasDatasetCountryScopeRef.current = normalizeOverlayCountryCodes(country).join(',');
      if (country) params.set('countries', country);
      const payload = await carrierNetworkRequests.read(
        'gas', `${API_BASE}/api/atlas/gas/network?${params.toString()}`,
        'Could not load the local gas network.',
      );
      if (requestId !== gasLoadRequestRef.current) return payload;

      const mergeById = (previous, incoming) => {
        const merged = new Map((previous || []).map((item) => [item.id, item]));
        (incoming || []).forEach((item) => merged.set(item.id, item));
        return [...merged.values()];
      };
      setGasFacilitiesData((previous) => replace ? (payload.facilities || []) : mergeById(previous, payload.facilities));
      setGasConnections((previous) => replace ? (payload.connections || []) : mergeById(previous, payload.connections));
      setGasLoadedDomains((previous) => {
        const next = replace
          ? { Grid: false, Storage: false, Supply: false, Demand: false }
          : { ...previous };
        requested.forEach((domain) => { next[domain] = true; });
        return next;
      });
      setGasDatasetMeta(payload.meta || {});

      if (replace && !options.skipFocus && Array.isArray(payload.facilities) && payload.facilities.length) {
        const coordinates = payload.facilities
          .map((facility) => ({ lat: Number(facility.latitude), lon: Number(facility.longitude) }))
          .filter((coordinate) => Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lon));
        if (coordinates.length) {
          const latitudes = coordinates.map((coordinate) => coordinate.lat).sort((a, b) => a - b);
          const longitudes = coordinates.map((coordinate) => coordinate.lon).sort((a, b) => a - b);
          // Country tags in open topology data occasionally contain a remote
          // border or legacy-coordinate outlier. Robust bounds keep the map
          // focused on the selected country's actual network while preserving
          // those records in the dataset and on the map.
          const percentile = (values, fraction) => values[
            Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * fraction)))
          ];
          const useRobustCountryBounds = Boolean(country) && coordinates.length >= 20;
          const minLat = useRobustCountryBounds ? percentile(latitudes, 0.03) : latitudes[0];
          const maxLat = useRobustCountryBounds ? percentile(latitudes, 0.97) : latitudes[latitudes.length - 1];
          const minLon = useRobustCountryBounds ? percentile(longitudes, 0.03) : longitudes[0];
          const maxLon = useRobustCountryBounds ? percentile(longitudes, 0.97) : longitudes[longitudes.length - 1];
          const span = Math.max(maxLat - minLat, maxLon - minLon);
          setEmilFocusLocation({
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2,
            zoom: span > 45 ? 3 : span > 24 ? 4 : span > 12 ? 5 : span > 6 ? 6 : 7,
            label: country ? `Gas network · ${country}` : 'European methane network',
          });
        }
      }
      return payload;
    } catch (error) {
      if (error.name !== 'AbortError' && requestId === gasLoadRequestRef.current) {
        setGasDataError(error.message || 'Could not load the gas network.');
      }
      throw error;
    } finally {
      if (requestId === gasLoadRequestRef.current) setGasDomainLoading('');
    }
  }, []);

  const initializeGasAtlas = useCallback(async (countryOverride, options = {}) => {
    const country = typeof countryOverride === 'string'
      ? countryOverride
      : gasCountryFilterRef.current;
    const initializationKey = { country: country || '__ALL__' };
    if (gasInitializingRef.current?.country === initializationKey.country) return;
    gasInitializingRef.current = initializationKey;
    gasLoadRequestRef.current += 1;
    setGasDomainLoading('Status');
    setGasDataError('');
    try {
      const statusPayload = await carrierNetworkRequests.read(
        'gas', `${API_BASE}/api/atlas/gas/status`,
        'The local gas cache is unavailable.', { kind: 'status' },
      );
      if (gasInitializingRef.current !== initializationKey) return;
      setGasStatus(statusPayload);
      if (!options.preserveMapFilters) {
        setAtlasDomainVisibility({ Grid: true, Storage: false, Supply: false, Demand: false });
        setHiddenCarriers(new Set());
      }
      const initialDomains = [...new Set(['Grid', ...(options.domains || [])])];
      await loadGasDomains(initialDomains, { replace: true, country, skipFocus: options.skipFocus });
    } catch (error) {
      if (error.name === 'AbortError' || gasInitializingRef.current !== initializationKey) return;
      setGasDataError(error.message || 'Could not initialise the gas workspace.');
    } finally {
      if (gasInitializingRef.current === initializationKey) {
        gasInitializingRef.current = '';
        setGasDomainLoading((previous) => previous === 'Status' ? '' : previous);
      }
    }
  }, [loadGasDomains]);

  useEffect(() => {
    atlasNetworkCarrierRef.current = atlasNetworkCarrier;
    try { window.localStorage?.setItem('atlas-network-carrier', atlasNetworkCarrier); }
    catch (_) { /* localStorage unavailable */ }
  }, [atlasNetworkCarrier]);

  const handleGasDomainSelection = useCallback(async (domain) => {
    const domainName = String(domain || 'Grid');
    if (gasDomainLoading) return;
    if (gasLoadedDomains[domainName]) {
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: previous[domainName] === false }));
      return;
    }
    try {
      await loadGasDomains([domainName], { replace: false });
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: true }));
    } catch (_) {
      // loadGasDomains already exposes a user-facing error in the gas panel.
    }
  }, [gasDomainLoading, gasLoadedDomains, loadGasDomains]);

  const setGasDomainsFromAgent = useCallback(async (domains, mode = 'replace') => {
    const requested = [...new Set((domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain)))];
    if (!requested.length) throw new Error('No valid Atlas layer was provided.');
    const normalizedMode = ['add', 'hide'].includes(mode) ? mode : 'replace';

    if (normalizedMode !== 'hide') {
      const unloaded = requested.filter((domain) => !gasLoadedDomains[domain]);
      if (unloaded.length) await loadGasDomains(unloaded, { replace: false });
    }
    setAtlasDomainVisibility((previous) => {
      if (normalizedMode === 'hide') {
        return requested.reduce((next, domain) => ({ ...next, [domain]: false }), { ...previous });
      }
      if (normalizedMode === 'add') {
        return requested.reduce((next, domain) => ({ ...next, [domain]: true }), { ...previous });
      }
      return ATLAS_MAP_DOMAINS.reduce(
        (next, domain) => ({ ...next, [domain]: requested.includes(domain) }),
        {},
      );
    });
    return requested;
  }, [gasLoadedDomains, loadGasDomains]);

  const loadGasCountryFromAgent = useCallback(async (countryCode, options = {}) => {
    const requestedCode = String(countryCode || '').trim().toUpperCase();
    let statusPayload = gasStatus;
    if (!statusPayload?.available) {
      statusPayload = await carrierNetworkRequests.read(
        'gas', `${API_BASE}/api/atlas/gas/status`,
        'The local gas cache is unavailable.', { kind: 'status' },
      );
      setGasStatus(statusPayload);
    }
    const availableCountries = new Set(statusPayload?.countries || []);
    const normalizedCode = requestedCode === 'UK' && availableCountries.has('GB') ? 'GB' : requestedCode;
    if (normalizedCode && !availableCountries.has(normalizedCode)) {
      throw new Error(`The methane database has no country filter for ${normalizedCode}.`);
    }

    const requestedDomains = [...new Set((options.domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain)))];
    const mode = ['add', 'hide'].includes(options.layerMode) ? options.layerMode : 'replace';
    const currentVisible = ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false);
    let visibleDomains;
    if (!requestedDomains.length) visibleDomains = ['Grid'];
    else if (mode === 'add') visibleDomains = [...new Set([...currentVisible, ...requestedDomains])];
    else if (mode === 'hide') visibleDomains = currentVisible.filter((domain) => !requestedDomains.includes(domain));
    else visibleDomains = requestedDomains;
    const loadDomains = [...new Set(['Grid', ...visibleDomains])];

    gasControlledLoadRef.current = true;
    atlasNetworkCarrierRef.current = 'gas';
    gasCountryFilterRef.current = normalizedCode;
    setAtlasNetworkCarrier('gas');
    setGasCountryFilter(normalizedCode);
    setSelectedNode(null);
    setSelectedLineInfo(null);
    setHiddenCarriers(new Set());
    setAtlasDomainVisibility(ATLAS_MAP_DOMAINS.reduce(
      (next, domain) => ({ ...next, [domain]: visibleDomains.includes(domain) }),
      {},
    ));
    try {
      return await loadGasDomains(loadDomains, { replace: true, country: normalizedCode });
    } finally {
      gasControlledLoadRef.current = false;
    }
  }, [atlasDomainVisibility, gasStatus, loadGasDomains]);

  const handleGasCountryChange = useCallback(async (countryCode) => {
    try {
      await loadGasCountryFromAgent(countryCode, {
        domains: ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false),
        layerMode: 'replace',
      });
    } catch (error) {
      setGasDataError(error.message || 'Could not filter the gas network.');
    }
  }, [atlasDomainVisibility, loadGasCountryFromAgent]);

  const loadWaterDomains = useCallback(async (domains, options = {}) => {
    const requested = [...new Set((domains || ['Grid']).map((domain) => String(domain || '').trim()).filter(Boolean))];
    const replace = Boolean(options.replace);
    const requestId = waterLoadRequestRef.current + 1;
    waterLoadRequestRef.current = requestId;
    setWaterDomainLoading(requested.length === 1 ? requested[0] : 'Water data');
    setWaterDataError('');
    if (replace) {
      setWaterFacilitiesData([]);
      setWaterConnections([]);
      setWaterLoadedDomains({ Grid: false, Storage: false, Supply: false, Demand: false });
    }
    try {
      const params = new URLSearchParams({ domains: requested.join(',') });
      const country = options.country !== undefined ? options.country : waterCountryFilterRef.current;
      if (replace) waterDatasetCountryScopeRef.current = normalizeOverlayCountryCodes(country).join(',');
      if (country) params.set('countries', country);
      const payload = await carrierNetworkRequests.read(
        'water', `${API_BASE}/api/atlas/water/network?${params.toString()}`,
        'Could not load the local water database.',
      );
      if (requestId !== waterLoadRequestRef.current) return payload;
      const mergeById = (previous, incoming) => {
        const merged = new Map((previous || []).map((item) => [item.id, item]));
        (incoming || []).forEach((item) => merged.set(item.id, item));
        return [...merged.values()];
      };
      setWaterFacilitiesData((previous) => replace ? (payload.facilities || []) : mergeById(previous, payload.facilities));
      setWaterConnections((previous) => replace ? (payload.connections || []) : mergeById(previous, payload.connections));
      setWaterLoadedDomains((previous) => {
        const next = replace
          ? { Grid: false, Storage: false, Supply: false, Demand: false }
          : { ...previous };
        requested.forEach((domain) => { next[domain] = true; });
        return next;
      });
      setWaterDatasetMeta(payload.meta || {});

      if (replace && !options.skipFocus && Array.isArray(payload.facilities) && payload.facilities.length) {
        if (!country) {
          setEmilFocusLocation({
            latitude: 53.5,
            longitude: 14.0,
            zoom: 4,
            label: 'European water network overview',
          });
          return payload;
        }
        const coordinates = payload.facilities
          .map((facility) => ({ lat: Number(facility.latitude), lon: Number(facility.longitude) }))
          .filter((coordinate) => Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lon));
        if (coordinates.length) {
          const latitudes = coordinates.map((coordinate) => coordinate.lat).sort((a, b) => a - b);
          const longitudes = coordinates.map((coordinate) => coordinate.lon).sort((a, b) => a - b);
          const percentile = (values, fraction) => values[
            Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * fraction)))
          ];
          const robust = Boolean(country) && coordinates.length >= 20;
          const minLat = robust ? percentile(latitudes, 0.02) : latitudes[0];
          const maxLat = robust ? percentile(latitudes, 0.98) : latitudes[latitudes.length - 1];
          const minLon = robust ? percentile(longitudes, 0.02) : longitudes[0];
          const maxLon = robust ? percentile(longitudes, 0.98) : longitudes[longitudes.length - 1];
          const span = Math.max(maxLat - minLat, maxLon - minLon);
          setEmilFocusLocation({
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2,
            zoom: span > 45 ? 3 : span > 24 ? 4 : span > 12 ? 5 : span > 6 ? 6 : 7,
            label: country ? `Water network · ${country}` : 'European water network',
          });
        }
      }
      return payload;
    } catch (error) {
      if (error.name !== 'AbortError' && requestId === waterLoadRequestRef.current) {
        setWaterDataError(error.message || 'Could not load the water database.');
      }
      throw error;
    } finally {
      if (requestId === waterLoadRequestRef.current) setWaterDomainLoading('');
    }
  }, []);

  const initializeWaterAtlas = useCallback(async (countryOverride, options = {}) => {
    const country = typeof countryOverride === 'string' ? countryOverride : waterCountryFilterRef.current;
    const initializationKey = { country: country || '__ALL__' };
    if (waterInitializingRef.current?.country === initializationKey.country) return;
    waterInitializingRef.current = initializationKey;
    waterLoadRequestRef.current += 1;
    setWaterDomainLoading('Status');
    setWaterDataError('');
    try {
      const statusPayload = await carrierNetworkRequests.read(
        'water', `${API_BASE}/api/atlas/water/status`,
        'The local water cache is unavailable.', { kind: 'status' },
      );
      if (waterInitializingRef.current !== initializationKey) return;
      setWaterStatus(statusPayload);
      if (!options.preserveMapFilters) {
        setAtlasDomainVisibility({ Grid: true, Storage: false, Supply: false, Demand: false });
        setHiddenCarriers(new Set());
      }
      const initialDomains = [...new Set(['Grid', ...(options.domains || [])])];
      await loadWaterDomains(initialDomains, { replace: true, country, skipFocus: options.skipFocus });
    } catch (error) {
      if (error.name === 'AbortError' || waterInitializingRef.current !== initializationKey) return;
      setWaterDataError(error.message || 'Could not initialise the water workspace.');
    } finally {
      if (waterInitializingRef.current === initializationKey) {
        waterInitializingRef.current = '';
        setWaterDomainLoading((previous) => previous === 'Status' ? '' : previous);
      }
    }
  }, [loadWaterDomains]);

  const handleWaterDomainSelection = useCallback(async (domain) => {
    const domainName = String(domain || 'Grid');
    if (waterDomainLoading) return;
    if (waterLoadedDomains[domainName]) {
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: previous[domainName] === false }));
      return;
    }
    try {
      await loadWaterDomains([domainName], { replace: false });
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: true }));
    } catch (_) {
      // loadWaterDomains exposes a user-facing error in the water panel.
    }
  }, [loadWaterDomains, waterDomainLoading, waterLoadedDomains]);

  const setWaterDomainsFromAgent = useCallback(async (domains, mode = 'replace') => {
    const requested = [...new Set((domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain)))];
    if (!requested.length) throw new Error('No valid Atlas layer was provided.');
    const normalizedMode = ['add', 'hide'].includes(mode) ? mode : 'replace';
    if (normalizedMode !== 'hide') {
      const unloaded = requested.filter((domain) => !waterLoadedDomains[domain]);
      if (unloaded.length) await loadWaterDomains(unloaded, { replace: false });
    }
    setAtlasDomainVisibility((previous) => {
      if (normalizedMode === 'hide') {
        return requested.reduce((next, domain) => ({ ...next, [domain]: false }), { ...previous });
      }
      if (normalizedMode === 'add') {
        return requested.reduce((next, domain) => ({ ...next, [domain]: true }), { ...previous });
      }
      return ATLAS_MAP_DOMAINS.reduce(
        (next, domain) => ({ ...next, [domain]: requested.includes(domain) }),
        {},
      );
    });
    return requested;
  }, [loadWaterDomains, waterLoadedDomains]);

  const loadWaterCountryFromAgent = useCallback(async (countryCode, options = {}) => {
    const requestedCode = String(countryCode || '').trim().toUpperCase();
    let statusPayload = waterStatus;
    if (!statusPayload?.available) {
      statusPayload = await carrierNetworkRequests.read(
        'water', `${API_BASE}/api/atlas/water/status`,
        'The local water cache is unavailable.', { kind: 'status' },
      );
      setWaterStatus(statusPayload);
    }
    const availableCountries = new Set(statusPayload?.countries || []);
    const normalizedCode = requestedCode === 'UK' && availableCountries.has('GB') ? 'GB' : requestedCode;
    if (normalizedCode && !availableCountries.has(normalizedCode)) {
      throw new Error(`The water database has no country filter for ${normalizedCode}.`);
    }
    const requestedDomains = [...new Set((options.domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain)))];
    const mode = ['add', 'hide'].includes(options.layerMode) ? options.layerMode : 'replace';
    const currentVisible = ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false);
    let visibleDomains;
    if (!requestedDomains.length) visibleDomains = ['Grid'];
    else if (mode === 'add') visibleDomains = [...new Set([...currentVisible, ...requestedDomains])];
    else if (mode === 'hide') visibleDomains = currentVisible.filter((domain) => !requestedDomains.includes(domain));
    else visibleDomains = requestedDomains;
    const loadDomains = [...new Set(['Grid', ...visibleDomains])];

    waterControlledLoadRef.current = true;
    atlasNetworkCarrierRef.current = 'water';
    waterCountryFilterRef.current = normalizedCode;
    setAtlasNetworkCarrier('water');
    setWaterCountryFilter(normalizedCode);
    setSelectedNode(null);
    setSelectedLineInfo(null);
    setHiddenCarriers(new Set());
    setAtlasDomainVisibility(ATLAS_MAP_DOMAINS.reduce(
      (next, domain) => ({ ...next, [domain]: visibleDomains.includes(domain) }),
      {},
    ));
    try {
      return await loadWaterDomains(loadDomains, { replace: true, country: normalizedCode });
    } finally {
      waterControlledLoadRef.current = false;
    }
  }, [atlasDomainVisibility, loadWaterDomains, waterStatus]);

  const handleWaterCountryChange = useCallback(async (countryCode) => {
    try {
      await loadWaterCountryFromAgent(countryCode, {
        domains: ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false),
        layerMode: 'replace',
      });
    } catch (error) {
      setWaterDataError(error.message || 'Could not filter the water database.');
    }
  }, [atlasDomainVisibility, loadWaterCountryFromAgent]);

  const loadLiquidsDomains = useCallback(async (domains, options = {}) => {
    const requested = [...new Set((domains || ['Grid']).map((domain) => String(domain || '').trim()).filter(Boolean))];
    const replace = Boolean(options.replace);
    const requestId = liquidsLoadRequestRef.current + 1;
    liquidsLoadRequestRef.current = requestId;
    setLiquidsDomainLoading(requested.length === 1 ? requested[0] : 'Liquids data');
    setLiquidsDataError('');
    if (replace) {
      setLiquidsFacilitiesData([]);
      setLiquidsConnections([]);
      setLiquidsLoadedDomains({ Grid: false, Storage: false, Supply: false, Demand: false });
    }
    try {
      const params = new URLSearchParams({ domains: requested.join(',') });
      const country = options.country !== undefined ? options.country : liquidsCountryFilterRef.current;
      if (replace) liquidsDatasetCountryScopeRef.current = normalizeOverlayCountryCodes(country).join(',');
      if (country) params.set('countries', country);
      const payload = await carrierNetworkRequests.read(
        'liquids', `${API_BASE}/api/atlas/liquids/network?${params.toString()}`,
        'Could not load the local liquids database.',
      );
      if (requestId !== liquidsLoadRequestRef.current) return payload;
      const mergeById = (previous, incoming) => {
        const merged = new Map((previous || []).map((item) => [item.id, item]));
        (incoming || []).forEach((item) => merged.set(item.id, item));
        return [...merged.values()];
      };
      setLiquidsFacilitiesData((previous) => replace ? (payload.facilities || []) : mergeById(previous, payload.facilities));
      setLiquidsConnections((previous) => replace ? (payload.connections || []) : mergeById(previous, payload.connections));
      setLiquidsLoadedDomains((previous) => {
        const next = replace ? { Grid: false, Storage: false, Supply: false, Demand: false } : { ...previous };
        requested.forEach((domain) => { next[domain] = true; });
        return next;
      });
      setLiquidsDatasetMeta(payload.meta || {});

      if (replace && !options.skipFocus) {
        if (!country) {
          setEmilFocusLocation({ latitude: 53.0, longitude: 14.0, zoom: 4, label: 'European oil and liquids network overview' });
          return payload;
        }
        const connectionCoordinates = (payload.connections || []).flatMap((connection) => (
          Array.isArray(connection.coordinates) && connection.coordinates.length
            ? [connection.coordinates[0], connection.coordinates[connection.coordinates.length - 1]]
            : []
        ));
        const coordinates = [
          ...(payload.facilities || []).map((facility) => [Number(facility.longitude), Number(facility.latitude)]),
          ...connectionCoordinates,
        ].map(([lon, lat]) => ({ lat: Number(lat), lon: Number(lon) }))
          .filter((coordinate) => Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lon));
        if (coordinates.length) {
          const latitudes = coordinates.map((coordinate) => coordinate.lat).sort((a, b) => a - b);
          const longitudes = coordinates.map((coordinate) => coordinate.lon).sort((a, b) => a - b);
          const percentile = (values, fraction) => values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * fraction)))];
          const robust = coordinates.length >= 20;
          // Oil data includes overseas territories and occasional long route
          // geometries. Focus the selected country's geographic core without
          // dropping any record from the rendered source layer.
          const minLat = robust ? percentile(latitudes, 0.25) : latitudes[0];
          const maxLat = robust ? percentile(latitudes, 0.75) : latitudes[latitudes.length - 1];
          const minLon = robust ? percentile(longitudes, 0.25) : longitudes[0];
          const maxLon = robust ? percentile(longitudes, 0.75) : longitudes[longitudes.length - 1];
          const span = Math.max(maxLat - minLat, maxLon - minLon);
          setEmilFocusLocation({
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2,
            zoom: span > 45 ? 3 : span > 24 ? 4 : span > 12 ? 5 : span > 6 ? 6 : 7,
            label: `Oil and liquids network · ${country}`,
          });
        }
      }
      return payload;
    } catch (error) {
      if (error.name !== 'AbortError' && requestId === liquidsLoadRequestRef.current) setLiquidsDataError(error.message || 'Could not load the liquids database.');
      throw error;
    } finally {
      if (requestId === liquidsLoadRequestRef.current) setLiquidsDomainLoading('');
    }
  }, []);

  const initializeLiquidsAtlas = useCallback(async (countryOverride, options = {}) => {
    const country = typeof countryOverride === 'string' ? countryOverride : liquidsCountryFilterRef.current;
    const initializationKey = { country: country || '__ALL__' };
    if (liquidsInitializingRef.current?.country === initializationKey.country) return;
    liquidsInitializingRef.current = initializationKey;
    liquidsLoadRequestRef.current += 1;
    setLiquidsDomainLoading('Status');
    setLiquidsDataError('');
    try {
      const statusPayload = await carrierNetworkRequests.read(
        'liquids', `${API_BASE}/api/atlas/liquids/status`,
        'The local liquids cache is unavailable.', { kind: 'status' },
      );
      if (liquidsInitializingRef.current !== initializationKey) return;
      setLiquidsStatus(statusPayload);
      if (!options.preserveMapFilters) {
        setAtlasDomainVisibility({ Grid: true, Storage: false, Supply: false, Demand: false });
        setHiddenCarriers(new Set());
      }
      const initialDomains = [...new Set(['Grid', ...(options.domains || [])])];
      await loadLiquidsDomains(initialDomains, { replace: true, country, skipFocus: options.skipFocus });
    } catch (error) {
      if (error.name === 'AbortError' || liquidsInitializingRef.current !== initializationKey) return;
      setLiquidsDataError(error.message || 'Could not initialise the liquids workspace.');
    } finally {
      if (liquidsInitializingRef.current === initializationKey) {
        liquidsInitializingRef.current = '';
        setLiquidsDomainLoading((previous) => previous === 'Status' ? '' : previous);
      }
    }
  }, [loadLiquidsDomains]);

  const handleLiquidsDomainSelection = useCallback(async (domain) => {
    const domainName = String(domain || 'Grid');
    if (liquidsDomainLoading) return;
    if (liquidsLoadedDomains[domainName]) {
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: previous[domainName] === false }));
      return;
    }
    try {
      await loadLiquidsDomains([domainName], { replace: false });
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: true }));
    } catch (_) { /* loadLiquidsDomains reports the error in the workspace. */ }
  }, [liquidsDomainLoading, liquidsLoadedDomains, loadLiquidsDomains]);

  const setLiquidsDomainsFromAgent = useCallback(async (domains, mode = 'replace') => {
    const requested = [...new Set((domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain)))];
    if (!requested.length) throw new Error('No valid Atlas layer was provided.');
    const normalizedMode = ['add', 'hide'].includes(mode) ? mode : 'replace';
    if (normalizedMode !== 'hide') {
      const unloaded = requested.filter((domain) => !liquidsLoadedDomains[domain]);
      if (unloaded.length) await loadLiquidsDomains(unloaded, { replace: false });
    }
    setAtlasDomainVisibility((previous) => {
      if (normalizedMode === 'hide') return requested.reduce((next, domain) => ({ ...next, [domain]: false }), { ...previous });
      if (normalizedMode === 'add') return requested.reduce((next, domain) => ({ ...next, [domain]: true }), { ...previous });
      return ATLAS_MAP_DOMAINS.reduce((next, domain) => ({ ...next, [domain]: requested.includes(domain) }), {});
    });
    return requested;
  }, [liquidsLoadedDomains, loadLiquidsDomains]);

  const loadLiquidsCountryFromAgent = useCallback(async (countryCode, options = {}) => {
    const requestedCode = String(countryCode || '').trim().toUpperCase();
    let statusPayload = liquidsStatus;
    if (!statusPayload?.available) {
      statusPayload = await carrierNetworkRequests.read(
        'liquids', `${API_BASE}/api/atlas/liquids/status`,
        'The local liquids cache is unavailable.', { kind: 'status' },
      );
      setLiquidsStatus(statusPayload);
    }
    const availableCountries = new Set(statusPayload?.countries || []);
    const normalizedCode = requestedCode === 'UK' && availableCountries.has('GB') ? 'GB' : requestedCode;
    if (normalizedCode && !availableCountries.has(normalizedCode)) throw new Error(`The liquids database has no country filter for ${normalizedCode}.`);
    const requestedDomains = [...new Set((options.domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain)))];
    const mode = ['add', 'hide'].includes(options.layerMode) ? options.layerMode : 'replace';
    const currentVisible = ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false);
    let visibleDomains;
    if (!requestedDomains.length) visibleDomains = ['Grid'];
    else if (mode === 'add') visibleDomains = [...new Set([...currentVisible, ...requestedDomains])];
    else if (mode === 'hide') visibleDomains = currentVisible.filter((domain) => !requestedDomains.includes(domain));
    else visibleDomains = requestedDomains;
    const loadDomains = [...new Set(['Grid', ...visibleDomains])];
    liquidsControlledLoadRef.current = true;
    atlasNetworkCarrierRef.current = 'liquids';
    liquidsCountryFilterRef.current = normalizedCode;
    setAtlasNetworkCarrier('liquids');
    setLiquidsCountryFilter(normalizedCode);
    setSelectedNode(null);
    setSelectedLineInfo(null);
    setHiddenCarriers(new Set());
    setAtlasDomainVisibility(ATLAS_MAP_DOMAINS.reduce((next, domain) => ({ ...next, [domain]: visibleDomains.includes(domain) }), {}));
    try {
      return await loadLiquidsDomains(loadDomains, { replace: true, country: normalizedCode });
    } finally {
      liquidsControlledLoadRef.current = false;
    }
  }, [atlasDomainVisibility, liquidsStatus, loadLiquidsDomains]);

  const handleLiquidsCountryChange = useCallback(async (countryCode) => {
    try {
      await loadLiquidsCountryFromAgent(countryCode, {
        domains: ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false),
        layerMode: 'replace',
      });
    } catch (error) {
      setLiquidsDataError(error.message || 'Could not filter the liquids database.');
    }
  }, [atlasDomainVisibility, loadLiquidsCountryFromAgent]);

  const loadLogisticsDomains = useCallback(async (domains, options = {}) => {
    const requested = [...new Set((domains || ['Grid']).map((domain) => String(domain || '').trim()).filter(Boolean))];
    const replace = Boolean(options.replace);
    const requestId = logisticsLoadRequestRef.current + 1;
    logisticsLoadRequestRef.current = requestId;
    setLogisticsDomainLoading(requested.length === 1 ? requested[0] : 'Logistics data');
    setLogisticsDataError('');
    if (replace) {
      setLogisticsFacilitiesData([]);
      setLogisticsConnections([]);
      setLogisticsLoadedDomains({ Grid: false, Storage: false, Supply: false, Demand: false });
    }
    try {
      const params = new URLSearchParams({ domains: requested.join(',') });
      const country = options.country !== undefined ? options.country : logisticsCountryFilterRef.current;
      if (replace) logisticsDatasetCountryScopeRef.current = normalizeOverlayCountryCodes(country).join(',');
      if (country) params.set('countries', country);
      const payload = await carrierNetworkRequests.read(
        'logistics', `${API_BASE}/api/atlas/logistics/network?${params.toString()}`,
        'Could not load the local logistics database.',
      );
      if (requestId !== logisticsLoadRequestRef.current) return payload;
      const mergeById = (previous, incoming) => {
        const merged = new Map((previous || []).map((item) => [item.id, item]));
        (incoming || []).forEach((item) => merged.set(item.id, item));
        return [...merged.values()];
      };
      setLogisticsFacilitiesData((previous) => replace ? (payload.facilities || []) : mergeById(previous, payload.facilities));
      setLogisticsConnections((previous) => replace ? (payload.connections || []) : mergeById(previous, payload.connections));
      setLogisticsLoadedDomains((previous) => {
        const next = replace ? { Grid: false, Storage: false, Supply: false, Demand: false } : { ...previous };
        requested.forEach((domain) => { next[domain] = true; });
        return next;
      });
      setLogisticsDatasetMeta(payload.meta || {});

      if (replace && !options.skipFocus) {
        if (!country) {
          setEmilFocusLocation({ latitude: 53.0, longitude: 14.0, zoom: 4, label: 'European ports and air-freight overview' });
          return payload;
        }
        const coordinates = (payload.facilities || [])
          .map((facility) => ({ lat: Number(facility.latitude), lon: Number(facility.longitude) }))
          .filter((coordinate) => Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lon));
        if (coordinates.length) {
          const latitudes = coordinates.map((coordinate) => coordinate.lat).sort((a, b) => a - b);
          const longitudes = coordinates.map((coordinate) => coordinate.lon).sort((a, b) => a - b);
          const percentile = (values, fraction) => values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * fraction)))];
          const robust = coordinates.length >= 20;
          const minLat = robust ? percentile(latitudes, 0.08) : latitudes[0];
          const maxLat = robust ? percentile(latitudes, 0.92) : latitudes[latitudes.length - 1];
          const minLon = robust ? percentile(longitudes, 0.08) : longitudes[0];
          const maxLon = robust ? percentile(longitudes, 0.92) : longitudes[longitudes.length - 1];
          const span = Math.max(maxLat - minLat, maxLon - minLon);
          setEmilFocusLocation({
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2,
            zoom: span > 45 ? 3 : span > 24 ? 4 : span > 12 ? 5 : span > 6 ? 6 : 7,
            label: `Ports and air freight · ${country}`,
          });
        }
      }
      return payload;
    } catch (error) {
      if (error.name !== 'AbortError' && requestId === logisticsLoadRequestRef.current) setLogisticsDataError(error.message || 'Could not load the logistics database.');
      throw error;
    } finally {
      if (requestId === logisticsLoadRequestRef.current) setLogisticsDomainLoading('');
    }
  }, []);

  const initializeLogisticsAtlas = useCallback(async (countryOverride, options = {}) => {
    const country = typeof countryOverride === 'string' ? countryOverride : logisticsCountryFilterRef.current;
    const initializationKey = { country: country || '__ALL__' };
    if (logisticsInitializingRef.current?.country === initializationKey.country) return;
    logisticsInitializingRef.current = initializationKey;
    logisticsLoadRequestRef.current += 1;
    setLogisticsDomainLoading('Status');
    setLogisticsDataError('');
    try {
      const statusPayload = await carrierNetworkRequests.read(
        'logistics', `${API_BASE}/api/atlas/logistics/status`,
        'The local logistics cache is unavailable.', { kind: 'status' },
      );
      if (logisticsInitializingRef.current !== initializationKey) return;
      setLogisticsStatus(statusPayload);
      if (!options.preserveMapFilters) {
        setAtlasDomainVisibility({ Grid: true, Storage: false, Supply: false, Demand: false });
        setHiddenCarriers(new Set());
      }
      const initialDomains = [...new Set(['Grid', ...(options.domains || [])])];
      await loadLogisticsDomains(initialDomains, { replace: true, country, skipFocus: options.skipFocus });
    } catch (error) {
      if (error.name === 'AbortError' || logisticsInitializingRef.current !== initializationKey) return;
      setLogisticsDataError(error.message || 'Could not initialise the logistics workspace.');
    } finally {
      if (logisticsInitializingRef.current === initializationKey) {
        logisticsInitializingRef.current = '';
        setLogisticsDomainLoading((previous) => previous === 'Status' ? '' : previous);
      }
    }
  }, [loadLogisticsDomains]);

  const handleLogisticsDomainSelection = useCallback(async (domain) => {
    const domainName = String(domain || 'Grid');
    if (logisticsDomainLoading) return;
    if (logisticsLoadedDomains[domainName]) {
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: previous[domainName] === false }));
      return;
    }
    try {
      await loadLogisticsDomains([domainName], { replace: false });
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: true }));
    } catch (_) { /* loadLogisticsDomains reports the error in the workspace. */ }
  }, [logisticsDomainLoading, logisticsLoadedDomains, loadLogisticsDomains]);

  const setLogisticsDomainsFromAgent = useCallback(async (domains, mode = 'replace') => {
    const requested = [...new Set((domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain)))];
    if (!requested.length) throw new Error('No valid Atlas layer was provided.');
    const normalizedMode = ['add', 'hide'].includes(mode) ? mode : 'replace';
    if (normalizedMode !== 'hide') {
      const unloaded = requested.filter((domain) => !logisticsLoadedDomains[domain]);
      if (unloaded.length) await loadLogisticsDomains(unloaded, { replace: false });
    }
    setAtlasDomainVisibility((previous) => {
      if (normalizedMode === 'hide') return requested.reduce((next, domain) => ({ ...next, [domain]: false }), { ...previous });
      if (normalizedMode === 'add') return requested.reduce((next, domain) => ({ ...next, [domain]: true }), { ...previous });
      return ATLAS_MAP_DOMAINS.reduce((next, domain) => ({ ...next, [domain]: requested.includes(domain) }), {});
    });
    return requested;
  }, [logisticsLoadedDomains, loadLogisticsDomains]);

  const loadLogisticsCountryFromAgent = useCallback(async (countryCode, options = {}) => {
    const requestedCode = String(countryCode || '').trim().toUpperCase();
    let statusPayload = logisticsStatus;
    if (!statusPayload?.available) {
      statusPayload = await carrierNetworkRequests.read(
        'logistics', `${API_BASE}/api/atlas/logistics/status`,
        'The local logistics cache is unavailable.', { kind: 'status' },
      );
      setLogisticsStatus(statusPayload);
    }
    const availableCountries = new Set(statusPayload?.countries || []);
    const normalizedCode = requestedCode === 'UK' && availableCountries.has('GB') ? 'GB' : requestedCode;
    if (normalizedCode && !availableCountries.has(normalizedCode)) throw new Error(`The logistics database has no country filter for ${normalizedCode}.`);
    const requestedDomains = [...new Set((options.domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain)))];
    const mode = ['add', 'hide'].includes(options.layerMode) ? options.layerMode : 'replace';
    const currentVisible = ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false);
    let visibleDomains;
    if (!requestedDomains.length) visibleDomains = ['Grid'];
    else if (mode === 'add') visibleDomains = [...new Set([...currentVisible, ...requestedDomains])];
    else if (mode === 'hide') visibleDomains = currentVisible.filter((domain) => !requestedDomains.includes(domain));
    else visibleDomains = requestedDomains;
    const loadDomains = [...new Set(['Grid', ...visibleDomains])];
    logisticsControlledLoadRef.current = true;
    atlasNetworkCarrierRef.current = 'logistics';
    logisticsCountryFilterRef.current = normalizedCode;
    setAtlasNetworkCarrier('logistics');
    setLogisticsCountryFilter(normalizedCode);
    setSelectedNode(null);
    setSelectedLineInfo(null);
    setHiddenCarriers(new Set());
    setAtlasDomainVisibility(ATLAS_MAP_DOMAINS.reduce((next, domain) => ({ ...next, [domain]: visibleDomains.includes(domain) }), {}));
    try {
      return await loadLogisticsDomains(loadDomains, { replace: true, country: normalizedCode });
    } finally {
      logisticsControlledLoadRef.current = false;
    }
  }, [atlasDomainVisibility, logisticsStatus, loadLogisticsDomains]);

  const handleLogisticsCountryChange = useCallback(async (countryCode) => {
    try {
      await loadLogisticsCountryFromAgent(countryCode, {
        domains: ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false),
        layerMode: 'replace',
      });
    } catch (error) {
      setLogisticsDataError(error.message || 'Could not filter the logistics database.');
    }
  }, [atlasDomainVisibility, loadLogisticsCountryFromAgent]);

  useEffect(() => {
    // Remember a real overlay selection, not an unused startup default. Freeze
    // it on first entry so switching workspaces later preserves that choice.
    if (atlasOverlayMode && atlasOverlayCarrierSelection === null) {
      setAtlasOverlayCarriers(atlasOverlayCarriers);
    }
    try {
      window.localStorage?.setItem('atlas-network-overlay-mode', String(atlasOverlayMode));
      if (atlasOverlayMode || atlasOverlayCarrierSelection !== null) {
        window.localStorage?.setItem('atlas-network-overlay-carriers', JSON.stringify(atlasOverlayCarriers));
      }
    } catch (_) { /* localStorage unavailable */ }
  }, [atlasOverlayMode, atlasOverlayCarriers, atlasOverlayCarrierSelection, setAtlasOverlayCarriers]);

  // Workspace selection is independent of the carriers visible in overlay.
  // Only a standalone workspace transition may reset filters or initialize
  // its own country scope. Overlay loaders own shared-scope requests instead.
  useEffect(() => {
    const previous = atlasWorkspaceTransitionRef.current;
    const carrierChanged = !previous || previous.carrier !== atlasNetworkCarrier;
    const exitingOverlay = Boolean(previous?.overlay && !atlasOverlayMode);
    atlasWorkspaceTransitionRef.current = { carrier: atlasNetworkCarrier, overlay: atlasOverlayMode };
    atlasOverlayModeRef.current = atlasOverlayMode;
    const cancelled = new Set();
    // A mode transition changes request ownership even when the country key
    // happens to match. Invalidate commits before aborting, so late status,
    // headers, decoded bodies and finally callbacks cannot affect the new view.
    const modeChanged = previous && previous.overlay !== atlasOverlayMode;
    const obsolete = modeChanged ? ['gas', 'water', 'liquids', 'logistics']
      : previous && carrierChanged && !atlasOverlayMode ? [previous.carrier] : [];
    const requestOwners = {
      gas: [gasLoadRequestRef, gasInitializingRef, setGasDomainLoading, setGasLoadedDomains],
      water: [waterLoadRequestRef, waterInitializingRef, setWaterDomainLoading, setWaterLoadedDomains],
      liquids: [liquidsLoadRequestRef, liquidsInitializingRef, setLiquidsDomainLoading, setLiquidsLoadedDomains],
      logistics: [logisticsLoadRequestRef, logisticsInitializingRef, setLogisticsDomainLoading, setLogisticsLoadedDomains],
    };
    obsolete.forEach((carrier) => {
      if (!carrierNetworkRequests.hasPending(carrier)) return;
      const [request, initializing, setLoading, setLoaded] = requestOwners[carrier];
      request.current += 1;
      initializing.current = '';
      carrierNetworkRequests.cancel(carrier);
      setLoading('');
      // An interrupted hydration may have a valid Grid but incomplete visible
      // domains. Re-enter through the normal scoped initializer, not a false
      // loaded flag that prevents those domains from ever being requested.
      setLoaded({ Grid: false, Storage: false, Supply: false, Demand: false });
      cancelled.add(carrier);
    });
    if (!previous?.overlay && atlasOverlayMode) {
      atlasOverlayLoadAttemptsRef.current.clear();
      atlasOverlayScopeAttemptsRef.current.clear();
    }
    if (atlasOverlayMode || (!carrierChanged && !exitingOverlay)) return;
    if (carrierChanged) {
      setSelectedNode(null);
      setSelectedLineInfo(null);
      setHiddenCarriers(new Set());
      setAtlasDomainVisibility({ Grid: true, Storage: false, Supply: false, Demand: false });
    }
    const workspace = {
      gas: [initializeGasAtlas, gasControlledLoadRef, gasCountryFilterRef, gasDatasetCountryScopeRef, gasLoadedDomains.Grid],
      water: [initializeWaterAtlas, waterControlledLoadRef, waterCountryFilterRef, waterDatasetCountryScopeRef, waterLoadedDomains.Grid],
      liquids: [initializeLiquidsAtlas, liquidsControlledLoadRef, liquidsCountryFilterRef, liquidsDatasetCountryScopeRef, liquidsLoadedDomains.Grid],
      logistics: [initializeLogisticsAtlas, logisticsControlledLoadRef, logisticsCountryFilterRef, logisticsDatasetCountryScopeRef, logisticsLoadedDomains.Grid],
    }[atlasNetworkCarrier];
    if (!workspace) return;
    const [initialize, controlled, country, datasetScope, gridLoaded] = workspace;
    if (!controlled.current && (carrierChanged || !gridLoaded || cancelled.has(atlasNetworkCarrier)
      || datasetScope.current !== normalizeOverlayCountryCodes(country.current).join(','))) {
      initialize(country.current);
    }
  }, [
    atlasNetworkCarrier,
    atlasOverlayMode,
    carrierNetworkRequests,
    initializeGasAtlas,
    initializeWaterAtlas,
    initializeLiquidsAtlas,
    initializeLogisticsAtlas,
    gasLoadedDomains.Grid, waterLoadedDomains.Grid, liquidsLoadedDomains.Grid, logisticsLoadedDomains.Grid,
  ]);

  useVisibleServicePoll({
    url: `${API_BASE}/api/atlas/land/status`,
    active: landOverlay.enabled || landOverlay.panelOpen,
    onData: setLandStatus,
    onUnavailable: () => setLandStatus({ ready: false, error: 'Land constraints service unavailable.' }),
  });
  useVisibleServicePoll({
    url: `${API_BASE}/api/atlas/grid-access/status`,
    active: gridAccessOverlay.enabled || gridAccessOverlay.panelOpen,
    onData: setGridAccessStatus,
    onUnavailable: () => setGridAccessStatus({ available: false, error: 'Grid-access service unavailable.' }),
  });

  useEffect(() => {
    try { window.localStorage?.setItem('atlas-land-overlay', JSON.stringify(landOverlay)); }
    catch (_) { /* localStorage unavailable */ }
  }, [landOverlay]);

  useEffect(() => {
    try { window.localStorage?.setItem('atlas-grid-access-overlay', JSON.stringify(gridAccessOverlay)); }
    catch (_) { /* localStorage unavailable */ }
  }, [gridAccessOverlay]);

  const updateLandOverlay = useCallback((update) => {
    if (typeof update !== 'function' && update?.panelOpen === true) {
      focusAtlasPanel('land');
    }
    setLandOverlayCached((previous) => {
      const patch = typeof update === 'function' ? update(previous) : update;
      const nextCategories = Array.isArray(patch?.categories)
        ? ATLAS_LAND_CATEGORY_ORDER.filter((category) => patch.categories.includes(category))
        : previous.categories;
      const nextCountries = Array.isArray(patch?.countries)
        ? [...new Set(patch.countries.map((code) => String(code || '').trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))]
        : previous.countries;
      return {
        ...previous,
        ...(patch || {}),
        categories: nextCategories,
        countries: nextCountries,
        opacity: Math.max(20, Math.min(100, Number(patch?.opacity ?? previous.opacity))),
      };
    });
  }, [focusAtlasPanel, setLandOverlayCached]);

  const updateGridAccessOverlay = useCallback((update) => {
    setGridAccessOverlay((previous) => {
      const patch = typeof update === 'function' ? update(previous) : update;
      const validSides = ['demand', 'generation', 'storage_import', 'storage_export'];
      const sides = Array.isArray(patch?.sides)
        ? validSides.filter((side) => patch.sides.includes(side))
        : previous.sides;
      return {
        ...previous,
        ...(patch || {}),
        sides: sides.length ? sides : previous.sides,
      };
    });
    if (typeof update !== 'function' && update?.panelOpen === true) {
      focusAtlasPanel('access');
    }
  }, [focusAtlasPanel]);

  const atlasOverlayCarrierInventory = useMemo(() => ({
    electricity: {
      assets: pypsaFacilitiesData.length,
      connections: pypsaConnections.length,
      loaded: loadedPypsaNetworks.length > 0,
      hasRecords: pypsaFacilitiesData.length > 0 || pypsaConnections.length > 0,
      loading: Boolean(pypsaLoading || pypsaDomainLoading),
    },
    gas: {
      assets: gasFacilitiesData.length,
      connections: gasConnections.length,
      loaded: Boolean(gasLoadedDomains.Grid),
      hasRecords: gasFacilitiesData.length > 0 || gasConnections.length > 0,
      loading: Boolean(gasDomainLoading),
      error: gasDataError,
    },
    water: {
      assets: waterFacilitiesData.length,
      connections: waterConnections.length,
      loaded: Boolean(waterLoadedDomains.Grid),
      hasRecords: waterFacilitiesData.length > 0 || waterConnections.length > 0,
      loading: Boolean(waterDomainLoading),
      error: waterDataError,
    },
    liquids: {
      assets: liquidsFacilitiesData.length,
      connections: liquidsConnections.length,
      loaded: Boolean(liquidsLoadedDomains.Grid),
      hasRecords: liquidsFacilitiesData.length > 0 || liquidsConnections.length > 0,
      loading: Boolean(liquidsDomainLoading),
      error: liquidsDataError,
    },
    logistics: {
      assets: logisticsFacilitiesData.length,
      connections: logisticsConnections.length,
      loaded: Boolean(logisticsLoadedDomains.Grid),
      hasRecords: logisticsFacilitiesData.length > 0 || logisticsConnections.length > 0,
      loading: Boolean(logisticsDomainLoading),
      error: logisticsDataError,
    },
  }), [
    pypsaFacilitiesData.length, pypsaConnections.length, loadedPypsaNetworks.length, pypsaLoading, pypsaDomainLoading,
    gasFacilitiesData.length, gasConnections.length, gasLoadedDomains.Grid, gasDomainLoading,
    waterFacilitiesData.length, waterConnections.length, waterLoadedDomains.Grid, waterDomainLoading,
    liquidsFacilitiesData.length, liquidsConnections.length, liquidsLoadedDomains.Grid, liquidsDomainLoading,
    logisticsFacilitiesData.length, logisticsConnections.length, logisticsLoadedDomains.Grid, logisticsDomainLoading,
    gasDataError, waterDataError, liquidsDataError, logisticsDataError,
  ]);

  const ensureAtlasOverlayCarrierLoaded = useCallback(async (carrier) => {
    if (carrier === 'electricity') return;
    const sharedCountryScope = normalizeOverlayCountryCodes(
      pypsaMapMembershipRef.current.networks.map((network) => network.countryCode)
    ).join(',');
    // Overlay mode is Geography-led. Do not eagerly deserialize a whole-Europe
    // infrastructure database while the user has not selected any countries.
    if (!sharedCountryScope) return;
    const overlayLoadOptions = {
      preserveMapFilters: true,
      skipFocus: true,
      domains: ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false),
    };
    const initialize = carrier === 'gas' && !gasLoadedDomains.Grid && !gasDomainLoading ? initializeGasAtlas
      : carrier === 'water' && !waterLoadedDomains.Grid && !waterDomainLoading ? initializeWaterAtlas
        : carrier === 'liquids' && !liquidsLoadedDomains.Grid && !liquidsDomainLoading ? initializeLiquidsAtlas
          : carrier === 'logistics' && !logisticsLoadedDomains.Grid && !logisticsDomainLoading ? initializeLogisticsAtlas : null;
    if (!initialize || atlasOverlayLoadAttemptsRef.current.get(carrier) === sharedCountryScope) return;
    // Initialisers report errors through workspace state rather than rejecting.
    // Their loading-state changes must not automatically retry a failed source.
    // A new country scope or explicit carrier reselection permits another try.
    atlasOverlayLoadAttemptsRef.current.set(carrier, sharedCountryScope);
    await initialize(sharedCountryScope, overlayLoadOptions);
  }, [
    // Keep the lazy overlay effect reactive to ordinary UI country changes.
    // The ref supplies same-tick membership for compound agent plans, while
    // this dependency ensures a later add/remove also schedules hydration.
    loadedPypsaNetworks,
    gasLoadedDomains.Grid, gasDomainLoading, initializeGasAtlas,
    waterLoadedDomains.Grid, waterDomainLoading, initializeWaterAtlas,
    liquidsLoadedDomains.Grid, liquidsDomainLoading, initializeLiquidsAtlas,
    logisticsLoadedDomains.Grid, logisticsDomainLoading, initializeLogisticsAtlas,
    atlasDomainVisibility,
  ]);

  // Batch the initializer workflow. The shared carrier request manager also
  // caps network transfers/body reads across overlapping effect invocations,
  // retries and country/domain changes; this loop alone cannot enforce that.
  const loadAtlasOverlayCarriers = useCallback(async (carriers) => {
    const pending = [...new Set((carriers || []).filter((carrier) => carrier !== 'electricity'))];
    const results = [];
    for (let index = 0; index < pending.length; index += 2) {
      const batch = pending.slice(index, index + 2);
      // eslint-disable-next-line no-await-in-loop
      const batchResults = await Promise.allSettled(batch.map(ensureAtlasOverlayCarrierLoaded));
      results.push(...batchResults);
    }
    return results;
  }, [ensureAtlasOverlayCarrierLoaded]);

  const handleAtlasOverlayCarrierToggle = useCallback(async (carrier) => {
    if (!ATLAS_NETWORK_CARRIER_ORDER.includes(carrier)) return;
    const currentCarriers = atlasOverlayCarriersRef.current;
    const selected = currentCarriers.includes(carrier);
    const toggle = resolveOverlayCarrierToggle(currentCarriers, carrier, atlasOverlayCarrierInventory);
    if (toggle.error === 'power_not_loaded') {
      setAtlasOverlayNotice({ kind: 'guard', message: 'Power is not loaded. Return to the Electricity workspace and build or load a network before adding it to the overlay.' });
      return;
    }
    if (toggle.error === 'last_loaded_carrier') {
      setAtlasOverlayNotice({ kind: 'guard', message: 'At least one loaded network must remain selected. Add another loaded carrier before hiding this one.' });
      return;
    }
    const next = toggle.carriers;
    setAtlasOverlayNotice(null);
    if (!selected) {
      atlasOverlayLoadAttemptsRef.current.delete(carrier);
      atlasOverlayScopeAttemptsRef.current.delete(carrier);
    }
    setAtlasOverlayCarriers(next);
    if (!selected) {
      try { await ensureAtlasOverlayCarrierLoaded(carrier); }
      catch (_) {
        if (atlasOverlayCarriersRef.current.includes(carrier)) {
          setAtlasOverlayNotice({ kind: 'load', message: `${ATLAS_NETWORK_CARRIER_META[carrier]?.label || 'The carrier'} could not be loaded. Check its workspace data status.` });
        }
      }
    }
  }, [atlasOverlayCarrierInventory, ensureAtlasOverlayCarrierLoaded, setAtlasOverlayCarriers]);

  // Old persisted overlay selections could claim that electricity was visible
  // even though no PyPSA network existed in memory. Remove that impossible
  // state and fall back to an already-loaded carrier, preventing an apparently
  // empty map after the user hides methane.
  useEffect(() => {
    if (!atlasOverlayMode || atlasOverlayCarrierInventory.electricity.loaded || atlasOverlayCarrierInventory.electricity.loading) return;
    setAtlasOverlayCarriers((previous) => {
      const selected = previous;
      if (!selected.includes('electricity')) return previous;
      const withoutPower = selected.filter((carrier) => carrier !== 'electricity');
      if (withoutPower.length) return withoutPower;
      const fallback = ATLAS_NETWORK_CARRIER_ORDER.find((carrier) => atlasOverlayCarrierInventory[carrier]?.loaded && atlasOverlayCarrierInventory[carrier]?.hasRecords)
        || ATLAS_NETWORK_CARRIER_ORDER.find((carrier) => atlasOverlayCarrierInventory[carrier]?.loaded);
      return fallback ? [fallback] : withoutPower;
    });
  }, [atlasOverlayMode, atlasOverlayCarrierInventory, setAtlasOverlayCarriers]);

  useEffect(() => {
    if (!atlasOverlayMode) return;
    loadAtlasOverlayCarriers(atlasOverlayCarriers).catch(() => {});
  }, [atlasOverlayMode, atlasOverlayCarriers, loadAtlasOverlayCarriers]);

  const handleMapViewChange = useCallback((view) => {
    if (!view) return;
    const nextView = {
      lat: Number.isFinite(view.lat) ? view.lat : null,
      lng: Number.isFinite(view.lng) ? view.lng : null,
      zoom: Number.isFinite(view.zoom) ? view.zoom : null,
    };
    mapViewRef.current = nextView;
    if (!pypsaDeferredDetailLoad) return;
    setMapViewState((prev) => (
      prev.lat === nextView.lat && prev.lng === nextView.lng && prev.zoom === nextView.zoom
        ? prev
        : nextView
    ));
  }, []);

  // Auto-zoom toggle: when on, the map fits its bounds to the visible facilities
  // every time the dataset changes. Default off — user opts in via Map Controls.
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(() => {
    try {
      return window.localStorage?.getItem('nova-auto-zoom') === '1';
    } catch (_) { return false; }
  });
  useEffect(() => {
    try { window.localStorage?.setItem('nova-auto-zoom', autoZoomEnabled ? '1' : '0'); }
    catch (_) { /* localStorage unavailable */ }
  }, [autoZoomEnabled]);
  const [aiMapControlEnabled, setAiMapControlEnabled] = useState(() => {
    try {
      return window.localStorage?.getItem('nova-ai-map-control') !== '0';
    } catch (_) { return true; }
  });
  useEffect(() => {
    try { window.localStorage?.setItem('nova-ai-map-control', aiMapControlEnabled ? '1' : '0'); }
    catch (_) { /* localStorage unavailable */ }
  }, [aiMapControlEnabled]);
  const [performancePreference, setPerformancePreference] = useState(() => (
    readMapPerformancePreference(window.localStorage)
  ));
  useEffect(() => {
    try { window.localStorage?.setItem(MAP_PERFORMANCE_STORAGE_KEY, performancePreference); }
    catch (_) { /* localStorage unavailable */ }
  }, [performancePreference]);
  useEffect(() => {
    try { window.localStorage?.setItem('nova-planning-horizon-year', String(planningHorizonYear || '2025')); }
    catch (_) { /* localStorage unavailable */ }
  }, [planningHorizonYear]);
  // Right-click context menu for region-solve trigger: {x, y, lat, lon} | null.
  const [regionContextMenu, setRegionContextMenu] = useState(null);
  const [solveNetworkSearch, setSolveNetworkSearch] = useState('');
  const [solveNetworkStaging, setSolveNetworkStaging] = useState(false);
  const [solveNetworkStageMessage, setSolveNetworkStageMessage] = useState('');
  const [solveNetworkLoadingStateIndex, setSolveNetworkLoadingStateIndex] = useState(0);
  const [solveNetworkLogsCollapsed, setSolveNetworkLogsCollapsed] = useState(false);
  const [showPypsaSettingsDialog, setShowPypsaSettingsDialog] = useState(false);
  const [regionalClusterOverlay, setRegionalClusterOverlay] = useState(null);
  const [pypsaSettings, setPypsaSettings] = useState(PYPSA_SETTINGS_DEFAULTS);
  const [lastEMILPrompt, setLastEMILPrompt] = useState('');
  const [selectedCapacityType, setSelectedCapacityType] = useState('All'); // 'All', 'Offshore', 'Onshore'
  const [carrierLegendQuery, setCarrierLegendQuery] = useState('');
  const [collapsedCarrierLegendGroups, setCollapsedCarrierLegendGroups] = useState({});
  const [useClusterDynamicArgs, setUseClusterDynamicArgs] = useState(false);
  const [granularityMode, setGranularityMode] = useState('custom');
  const [runMode, setRunMode] = useState(() => (PYPSA_SETTINGS_DEFAULTS.build_only ? 'build_only' : 'build_solve'));
  const [saveBuiltNetworkNc, setSaveBuiltNetworkNc] = useState(true);
  useEffect(() => {
    if (pypsaSettings.build_only && runMode !== 'build_only') setRunMode('build_only');
    if (!pypsaSettings.build_only && runMode === 'build_only') setRunMode('build_solve');
  }, [pypsaSettings.build_only, runMode]);
  const [pypsaSectionOpen, setPypsaSectionOpen] = useState({
    geography: true,
    operations: false,
    filters: false,
    clusters: false,
  });
  const [activeWorkspaceArea, setActiveWorkspaceArea] = useState('geography');
  const activeWorkspaceDefinition = atlasWorkspaceAreaDefinition(activeWorkspaceArea);
  const togglePypsaDomainSection = useCallback((section) => {
    setActiveWorkspaceArea(section);
    setPypsaSectionOpen((previous) => {
      if (!compactAtlasLayout) return { ...previous, [section]: !previous[section] };
      return {
        ...previous,
        geography: section === 'geography',
        operations: section === 'operations',
        filters: section === 'filters',
        clusters: section === 'clusters',
      };
    });
  }, [compactAtlasLayout]);
  const openAtlasWorkspaceArea = useCallback((section) => {
    setActiveWorkspaceArea(section);
    setPypsaSectionOpen((previous) => (
      compactAtlasLayout
        ? { ...previous, geography: section === 'geography', operations: section === 'operations', filters: section === 'filters', clusters: section === 'clusters' }
        : { ...previous, [section]: true }
    ));
  }, [compactAtlasLayout]);
  useEffect(() => {
    const handleNohmAtlasDomain = (event) => {
      const section = atlasWorkspaceAreaForDomain(event?.detail?.domain);
      if (!section) return;
      setMapControlsCollapsed(false);
      openAtlasWorkspaceArea(section);
    };
    window.addEventListener(NOHM_ATLAS_DOMAIN_EVENT, handleNohmAtlasDomain);
    return () => window.removeEventListener(NOHM_ATLAS_DOMAIN_EVENT, handleNohmAtlasDomain);
  }, [openAtlasWorkspaceArea, setMapControlsCollapsed]);
  useEffect(() => {
    const handleNohmAtlasTheme = (event) => {
      setAtlasTheme(normalizeAtlasTheme(event?.detail?.theme));
    };
    window.addEventListener(NOHM_ATLAS_THEME_EVENT, handleNohmAtlasTheme);
    return () => window.removeEventListener(NOHM_ATLAS_THEME_EVENT, handleNohmAtlasTheme);
  }, []);
  useEffect(() => {
    const handleNohmAtlasWorkspaceContext = (event) => {
      if (event?.detail?.context) setNohmWorkspaceContext(event.detail.context);
    };
    window.addEventListener(NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT, handleNohmAtlasWorkspaceContext);
    return () => window.removeEventListener(NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT, handleNohmAtlasWorkspaceContext);
  }, []);
  useEffect(() => {
    if (nohmWorkspaceContext?.mode !== 'model' || !nohmWorkspaceContext?.projectId) {
      setModelSceneStatus({ state: 'idle', meta: null, error: '' });
      return undefined;
    }
    const controller = new AbortController();
    const layers = [
      'grid',
      ...(atlasDomainVisibility.Supply ? ['supply'] : []),
      ...(atlasDomainVisibility.Storage ? ['storage'] : []),
    ];
    const contextYear = [nohmWorkspaceContext.scenario, activeScenario, planningHorizonYear]
      .map((value) => String(value || '').match(/\b(20\d{2})\b/)?.[1])
      .find(Boolean);
    setModelSceneStatus((previous) => ({ ...previous, state: 'loading', error: '' }));
    setPypsaLoading(true);
    fetchModelScene(nohmWorkspaceContext, {
      layers,
      year: Number(contextYear || 2030),
      signal: controller.signal,
    }).then((modelScene) => {
      if (controller.signal.aborted) return;
      const facilities = groupPypsaFacilities(modelScene.facilities);
      pypsaFacilitiesDataRef.current = facilities;
      pypsaConnectionsRef.current = modelScene.connections;
      pypsaGeoJsonOverlaysRef.current = [];
      setPypsaFacilitiesData(facilities);
      setPypsaConnections(modelScene.connections);
      setPypsaGeoJsonOverlays([]);
      setPypsaDatasetMeta({
        filename: `${modelScene.meta.projectId}@${modelScene.meta.version}`,
        sourceBusCount: modelScene.meta.nodeCount,
        source: 'canonical_model_schema',
      });
      setLoadedPypsaNetworks([{
        countryCode: '',
        countryName: `${modelScene.meta.projectId} model`,
        filename: `model:${modelScene.meta.projectId}@${modelScene.meta.version}`,
      }]);
      setPypsaLoadedDomainsByNetwork({
        [`model:${modelScene.meta.projectId}@${modelScene.meta.version}`]: {
          Grid: true,
          Supply: layers.includes('supply'),
          Storage: layers.includes('storage'),
          Demand: false,
        },
      });
      setSelectedPyPSACountryCode('');
      setSelectedPyPSAFile('');
      setPypsaComponentScope(layers.length > 1 ? 'full' : 'grid');
      setPypsaDeferredDetailLoad(false);
      setAtlasNetworkCarrier('electricity');
      setAtlasOverlayMode(false);
      setHiddenCarriers(new Set());
      setGeographyLoadError('');
      if (modelScene.focus) setEmilFocusLocation(modelScene.focus);
      setNohmWorkspaceContext((previous) => (
        previous?.projectId === modelScene.meta.projectId
          ? { ...previous, version: modelScene.meta.version }
          : previous
      ));
      announceNohmModelScene(modelScene.meta);
      setModelSceneStatus({ state: 'ready', meta: modelScene.meta, error: '' });
    }).catch((error) => {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setModelSceneStatus({ state: 'error', meta: null, error: error?.message || 'The bound model could not be loaded.' });
    }).finally(() => {
      if (!controller.signal.aborted) setPypsaLoading(false);
    });
    return () => controller.abort();
  }, [
    nohmWorkspaceContext?.mode,
    nohmWorkspaceContext?.projectId,
    nohmWorkspaceContext?.scenario,
    activeScenario,
    planningHorizonYear,
    atlasDomainVisibility.Supply,
    atlasDomainVisibility.Storage,
  ]);
  useEffect(() => {
    const projectId = nohmWorkspaceContext?.mode === 'model' ? nohmWorkspaceContext?.projectId : '';
    const modelVersion = modelSceneStatus.meta?.version;
    if (!projectId || !modelVersion) {
      setModelResultCatalogStatus({ state: 'idle', catalog: null, error: '' });
      setModelResultSelection(null);
      setModelResultStatus({ state: 'idle', scene: null, error: '' });
      modelResultRequestRef.current?.abort();
      return undefined;
    }
    const controller = new AbortController();
    setModelResultCatalogStatus({ state: 'loading', catalog: null, error: '' });
    setModelResultStatus({ state: 'idle', scene: null, error: '' });
    fetchModelResultCatalog(nohmWorkspaceContext, modelVersion, { signal: controller.signal })
      .then((catalog) => {
        if (controller.signal.aborted) return;
        setModelResultCatalogStatus({ state: 'ready', catalog, error: '' });
        setModelResultSelection(defaultModelResultSelection(catalog));
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return;
        setModelResultCatalogStatus({ state: 'error', catalog: null, error: error?.message || 'Model results could not be discovered.' });
      });
    return () => controller.abort();
  }, [nohmWorkspaceContext?.mode, nohmWorkspaceContext?.projectId, modelSceneStatus.meta?.version]);

  const showSelectedModelResult = useCallback(async () => {
    if (!modelResultSelection || !modelSceneStatus.meta?.version || nohmWorkspaceContext?.mode !== 'model') return;
    modelResultRequestRef.current?.abort();
    const controller = new AbortController();
    modelResultRequestRef.current = controller;
    setModelResultStatus((previous) => ({ ...previous, state: 'loading', error: '' }));
    try {
      const scene = await fetchModelResultScene(nohmWorkspaceContext, {
        ...modelResultSelection,
        modelVersion: modelSceneStatus.meta.version,
        carrier: 'electricity',
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setModelResultStatus({ state: 'ready', scene, error: '' });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setModelResultStatus((previous) => ({ ...previous, state: 'error', error: error?.message || 'The selected model result could not be shown.' }));
    }
  }, [modelResultSelection, modelSceneStatus.meta?.version, nohmWorkspaceContext]);

  const clearModelResult = useCallback(() => {
    modelResultRequestRef.current?.abort();
    setModelResultStatus({ state: 'idle', scene: null, error: '' });
  }, []);

  useEffect(() => () => modelResultRequestRef.current?.abort(), []);
  const [mapAgentInput, setMapAgentInput] = useState('');
  const [mapAgentBusy, setMapAgentBusy] = useState(false);
  const [mapAgentMessages, setMapAgentMessages] = useState([
    {
      id: 'map-agent-welcome',
      role: 'assistant',
      text: 'Hello! I can control Atlas for you. Try “show Belgium at NUTS3”, “add France”, “increase granularity”, or “show generation”.',
    },
  ]);
  const mapAgentObservedContextRef = useRef(null);
  const [editableNodes, setEditableNodes] = useState(() => {
    // Load persisted nodes from localStorage on component mount
    try {
      const saved = localStorage.getItem('nova-voice-nodes');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Error loading saved voice nodes:', error);
      return [];
    }
  });
  // Lola CSV Editor state
  const [lolaDocuments, setLolaDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentSections, setDocumentSections] = useState([]);
  const [filteredSections, setFilteredSections] = useState([]);
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(null);
  const [currentSection, setCurrentSection] = useState(null);
  const [originalText, setOriginalText] = useState('');
  const [newText, setNewText] = useState('');

  useEffect(() => {
    if (!solveNetworkStaging) {
      setSolveNetworkLoadingStateIndex(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setSolveNetworkLoadingStateIndex((prev) => (prev + 1) % EMIL_LOADING_STATES.length);
    }, 3200);

    return () => clearInterval(interval);
  }, [solveNetworkStaging]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [lolaStatus, setLolaStatus] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  // Lola Live Q&A state
  const [liveQuestion, setLiveQuestion] = useState('');
  const [liveAnswer, setLiveAnswer] = useState('');
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');

  // Emil Properties state
  const [emilProperties, setEmilProperties] = useState([]);
  const [emilPropertiesLoading, setEmilPropertiesLoading] = useState(false);
  const [emilTotalCount, setEmilTotalCount] = useState(0);
  const [emilOffset, setEmilOffset] = useState(0);
  const [emilLimit] = useState(50);

  // Results chat state
  // Store chat messages per tab/assistant combination to preserve across tab switches
  const [chatMessagesByContext, setChatMessagesByContext] = useState(() => {
    // Initialize with default messages
    const defaultResultsMessage = {
      id: 1,
      text: "Hello! I'm your intelligent energy modeller assistant. Ask me anything about this simulation results file. For example:\n• What is the total generation?\n• Which generators have the highest capacity factor?\n• What are the fuel costs?\n• Compare different categories",
      sender: 'bot',
      timestamp: new Date()
    };
    const defaultCopilotMessage = {
      id: 1,
      text: "Hello! I'm your energy analysis copilot. Type your request and I'll route it to the right agent (Emil, Nova, or Lola) to handle it in the background. You can then visit their tabs to see the work and do more specific tasks.",
      sender: 'bot',
      timestamp: new Date()
    };
    return {
      'emil-results': [defaultResultsMessage],
      'copilot': [defaultCopilotMessage]
    };
  });

  const [resultsChatMessages, setResultsChatMessages] = useContextMessages(chatMessagesByContext, setChatMessagesByContext, 'emil-results');
  const [copilotChatMessages, setCopilotChatMessages] = useContextMessages(chatMessagesByContext, setChatMessagesByContext, 'copilot');
  // Available Line properties from currently loaded data (e.g., Max Flow, Min Flow)
  const availableLineProperties = useMemo(() => {
    const set = new Set();
    (emilProperties || []).forEach(r => {
      if ((r.Collection || '') === 'Lines' && r.Property) set.add(r.Property);
    });
    return Array.from(set);
  }, [emilProperties]);

  // Helper for case-insensitive, space-insensitive keys
  const normalizeLineKeys = (name) => {
    const replaceAllDashes = (s) => String(s || '').replace(/[\u2012-\u2015\u2212]/g, '-');
    const strict = replaceAllDashes(String(name || '').toUpperCase().trim());
    const compact = strict.replace(/\s+/g, '');
    return { strict, compact };
  };

  // Build a set of candidate keys for a connection based on parentIdentifier and endpoints
  const buildConnectionKeyCandidates = useCallback((connection) => {
    const cands = new Set();
    const push = (s) => { if (s) { const { strict, compact } = normalizeLineKeys(s); cands.add(strict); cands.add(compact); cands.add(compact.replace(/[-_]/g, '')); } };
    push(connection?.parentIdentifier);
    const cleanEndpoint = (s) => {
      if (!s) return '';
      let t = String(s).toUpperCase().trim();
      // remove after ' - ' (keep either side later), or extra descriptors like ' LT'
      t = t.replace(/\s+LT\b/g, '').replace(/\s+HV\b/g, '').replace(/\s+MV\b/g, '');
      // take first token before multiple spaces
      const first = t.split('  ')[0];
      return first.trim();
    };
    const fromRaw = cleanEndpoint(connection?.fromNode);
    const toRaw = cleanEndpoint(connection?.toNode);
    if (fromRaw && toRaw) {
      const variants = [
        `${fromRaw} - ${toRaw}`,
        `${toRaw} - ${fromRaw}`,
        `${fromRaw}-${toRaw}`,
        `${toRaw}-${fromRaw}`
      ];
      variants.forEach(v => push(v));
      // also try just the first token before a space for each
      const fromTok = fromRaw.split(' ')[0];
      const toTok = toRaw.split(' ')[0];
      [
        `${fromTok} - ${toTok}`,
        `${toTok} - ${fromTok}`,
        `${fromTok}-${toTok}`,
        `${toTok}-${fromTok}`
      ].forEach(v => push(v));
    }
    return Array.from(cands);
  }, []);

  // Map of Child_Name -> array of properties rows for quick lookup on click
  const linePropertiesByChildName = useMemo(() => {
    const map = new Map();
    (emilProperties || []).forEach(r => {
      // Include both Lines and Gas Pipelines collections
      const collection = (r.Collection || '').toString().trim();
      if (collection !== 'Lines' && collection !== 'Gas Pipelines') return;
      const { strict, compact } = normalizeLineKeys(r.Child_Name);
      if (!strict) return;
      if (!map.has(strict)) map.set(strict, []);
      map.get(strict).push(r);
      if (!map.has(compact)) map.set(compact, []);
      map.get(compact).push(r);
    });
    return map;
  }, [emilProperties]);

  // Robust lookup for a connection's properties with multiple fallbacks
  const getPropertiesForConnection = useCallback((connection) => {
    if (!connection) return [];
    const candidates = buildConnectionKeyCandidates(connection);
    // Fast lookups through candidates
    for (const key of candidates) {
      const propsFast = linePropertiesByChildName.get(key);
      if (propsFast && propsFast.length) return propsFast;
    }
    // Fallback: fuzzy contains search
    const target = candidates[0] || '';
    for (const [k, v] of linePropertiesByChildName.entries()) {
      const kk = String(k || '').toUpperCase().replace(/\s+/g, '').replace(/[-_]/g, '');
      if (kk.includes(target) || target.includes(kk)) {
        if (v && v.length) return v;
      }
    }
    // Deep fallback: derive tokens from endpoints and scan raw properties
    const sanitize = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[-_]/g, '');
    const toTokens = (s) => {
      const up = String(s || '').toUpperCase().trim();
      const tokens = new Set();
      up.split(/[^A-Z0-9_]+/).forEach(t => { if (t) { tokens.add(t); tokens.add(t.replace(/_.*/, '')); } });
      return Array.from(tokens);
    };
    const fromTokens = toTokens(connection.fromNode);
    const toTokensArr = toTokens(connection.toNode);
    if ((emilProperties || []).length) {
      const matches = [];
      (emilProperties || []).forEach(r => {
        // Include both Lines and Gas Pipelines collections
        const collection = (r.Collection || '').toString().trim();
        if (collection !== 'Lines' && collection !== 'Gas Pipelines') return;
        const cn = sanitize(r.Child_Name);
        const hasFrom = fromTokens.some(t => cn.includes(sanitize(t)));
        const hasTo = toTokensArr.some(t => cn.includes(sanitize(t)));
        if (hasFrom && hasTo) matches.push(r);
      });
      if (matches.length) return matches;
    }
    return [];
  }, [linePropertiesByChildName, buildConnectionKeyCandidates, emilProperties]);

  // Lookup of Child_Name -> numeric value for the selected property
  const lineMetricLookup = useMemo(() => {
    const map = new Map();
    if (!lineMetricEnabled) return map;
    (emilProperties || []).forEach(r => {
      if ((r.Collection || '') !== 'Lines') return;
      if ((r.Property || '') !== lineMetricProperty) return;
      const { strict, compact } = normalizeLineKeys(r.Child_Name);
      if (!strict) return;
      const num = parseFloat(String(r.Value || '').replace(/[^0-9+\-.]/g, ''));
      if (!Number.isNaN(num)) map.set(strict, num);
      if (!Number.isNaN(num)) map.set(compact, num);
    });
    return map;
  }, [emilProperties, lineMetricEnabled, lineMetricProperty]);

  // Lookup of Child_Name -> units for selected property
  const lineMetricUnitsLookup = useMemo(() => {
    const map = new Map();
    if (!lineMetricEnabled) return map;
    (emilProperties || []).forEach(r => {
      if ((r.Collection || '') !== 'Lines') return;
      if ((r.Property || '') !== lineMetricProperty) return;
      const { strict, compact } = normalizeLineKeys(r.Child_Name);
      const u = (r.Units || '').toString();
      if (strict) map.set(strict, u);
      if (compact) map.set(compact, u);
    });
    return map;
  }, [emilProperties, lineMetricEnabled, lineMetricProperty]);

  // Enrich connections with metric (color/weight) based on selected property
  const enrichConnectionsForMetrics = useCallback((conns) => {
    if (!lineMetricEnabled || lineMetricLookup.size === 0) return conns;
    // Attach metricValue only; do not change color or width
    return conns.map(c => {
      const { strict, compact } = normalizeLineKeys(c.parentIdentifier);
      const v = lineMetricLookup.get(strict) ?? lineMetricLookup.get(compact);
      const units = lineMetricUnitsLookup.get(strict) ?? lineMetricUnitsLookup.get(compact);
      if (typeof v === 'number') return { ...c, metricValue: v, metricUnits: units };
      return c;
    });
  }, [lineMetricEnabled, lineMetricLookup, lineMetricUnitsLookup]);

  // SHARED hierarchical filters (used by both Properties and Memberships)
  const [emilClassGroupFilter, setEmilClassGroupFilter] = useState('');
  const [emilClassFilter, setEmilClassFilter] = useState('');
  const [emilCategoryFilter, setEmilCategoryFilter] = useState(''); // Filtered Object

  // Properties-specific filters
  const [emilObjectFilter, setEmilObjectFilter] = useState('');
  const [emilPropertyFilter, setEmilPropertyFilter] = useState('');
  const [emilChildNameFilter, setEmilChildNameFilter] = useState('');
  const [emilAvailableClassGroups, setEmilAvailableClassGroups] = useState([]);
  const [emilAvailableClasses, setEmilAvailableClasses] = useState([]);
  const [emilAvailableCategories, setEmilAvailableCategories] = useState([]);
  const [emilAvailableChildNames, setEmilAvailableChildNames] = useState([]);
  const [emilAvailableObjects, setEmilAvailableObjects] = useState([]);
  const [emilAvailableProperties, setEmilAvailableProperties] = useState([]);

  // Emil Memberships state
  const [emilMemberships, setEmilMemberships] = useState([]);
  const [emilMembershipsLoading, setEmilMembershipsLoading] = useState(false);
  const [emilMembershipsTotalCount, setEmilMembershipsTotalCount] = useState(0);
  const [emilMembershipsOffset, setEmilMembershipsOffset] = useState(0);
  const [emilMembershipsLimit] = useState(50);

  // Memberships-specific filters (Object and Membership only - Class Group, Class, Category are shared)
  const [emilMemObjectFilter, setEmilMemObjectFilter] = useState('');
  const [emilMemMembershipFilter, setEmilMemMembershipFilter] = useState('');
  const [emilMemChildNameFilter, setEmilMemChildNameFilter] = useState('');
  const [emilMemAvailableObjects, setEmilMemAvailableObjects] = useState([]);
  const [emilMemAvailableMemberships, setEmilMemAvailableMemberships] = useState([]);
  const [emilMemAvailableChildNames, setEmilMemAvailableChildNames] = useState([]);

  // Emil Attributes state
  const [emilAttributes, setEmilAttributes] = useState([]);
  const [emilAttributesLoading, setEmilAttributesLoading] = useState(false);
  const [emilAttributesTotalCount, setEmilAttributesTotalCount] = useState(0);
  const [emilAttributesOffset, setEmilAttributesOffset] = useState(0);
  const [emilAttributesLimit] = useState(50);

  // Attributes-specific filters (Object and Attribute only - Class Group, Class, Category are shared)
  const [emilAttrObjectFilter, setEmilAttrObjectFilter] = useState('');
  const [emilAttrAttributeFilter, setEmilAttrAttributeFilter] = useState('');
  const [emilAttrAvailableObjects, setEmilAttrAvailableObjects] = useState([]);
  const [emilAttrAvailableAttributes, setEmilAttrAvailableAttributes] = useState([]);

  // Connection filters for Map (same structure as properties filters)
  const [connectionClassGroupFilter, setConnectionClassGroupFilter] = useState('');
  const [connectionClassFilter, setConnectionClassFilter] = useState('');
  const [connectionCategoryFilter, setConnectionCategoryFilter] = useState('');
  const [connectionObjectFilter, setConnectionObjectFilter] = useState('');
  const [connectionPropertyFilter, setConnectionPropertyFilter] = useState('');
  const [connectionAvailableClassGroups, setConnectionAvailableClassGroups] = useState([]);
  const [connectionAvailableClasses, setConnectionAvailableClasses] = useState([]);
  const [connectionAvailableCategories, setConnectionAvailableCategories] = useState([]);
  const [connectionAvailableObjects, setConnectionAvailableObjects] = useState([]);
  const [connectionAvailableProperties, setConnectionAvailableProperties] = useState([]);

  // Feature flag: show/hide extra filters at the bottom (Object and Property/Membership)
  const SHOW_EXTRA_FILTERS = false;

  // Emil Hierarchy Navigation state (PLEXOS-style)
  const [emilHierarchy, setEmilHierarchy] = useState([]);
  const [hierarchySelectedClassGroup, setHierarchySelectedClassGroup] = useState(null);
  const [hierarchySelectedClass, setHierarchySelectedClass] = useState(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);

  // Run tab – Engine settings and sensitivity selections
  const [engineThreads, setEngineThreads] = useState(12);
  const [engineTimeSlice, setEngineTimeSlice] = useState('hourly'); // 'hourly' | '15min' | 'daily'
  const [sensFuelPrice, setSensFuelPrice] = useState(['Low', 'Mid', 'High']);
  const [sensDemand, setSensDemand] = useState(['-5%', 'Base', '+5%']);
  const [sensResCf, setSensResCf] = useState(['P10', 'P50', 'P90']);

  // Model selection for Engine Settings - hardcoded list
  const [selectedModels, setSelectedModels] = useState([]);
  const availableModelChildNames = [
    "Expansion Phase 1_Full_Linear_1dpd",
    "Expansion Phase 1_Full_Linear_1dpd_MILP",
    "Expansion Phase 1_Full_Linear_2bpd_no_SMR",
    "Expansion Phase 1_Full_Linear_2bpd_week",
    "Expansion Phase 1_Full_Linear_2dpd",
    "Expansion Phase 1_Full_Linear_3dpd",
    "Expansion Phase 2_Full_Linear_1dpd",
    "Expansion Phase 2_Pipelines_Integer",
    "Expansion Phase 2_retrofit_Integer",
    "Expansion Phase 3_Storage_Linear",
    "TJ Dispatch",
    "TJ Dispatch_Future",
    "TJ Dispatch_Future_1_day",
    "TJ Dispatch_Future_Nuclear_Linear_Pipelines",
    "TJ Dispatch_Future_Nuclear+",
    "TJ Dispatch_Future_Nuclear+ day",
    "TJ Dispatch_Future_Nuclear+ Month",
    "TJ Dispatch_Future_P2X Rebuild",
    "TJ Dispatch_Future_v13_no_adequacy",
    "TJ Transport"
  ];
  const [modelChildNamesLoading, setModelChildNamesLoading] = useState(false);
  const [modelSearchTerm, setModelSearchTerm] = useState('');

  const getRunEstimate = () => {
    // Very rough ETA: base 30s per scenario, times combinations, scaled by threads and granularity
    const combos = Math.max(1, sensFuelPrice.length) * Math.max(1, sensDemand.length) * Math.max(1, sensResCf.length);
    let perScenarioSec = 30;
    if (engineTimeSlice === '15min') perScenarioSec *= 2.5;
    if (engineTimeSlice === 'daily') perScenarioSec *= 0.6;
    const totalSec = (perScenarioSec * combos) / Math.max(1, parseInt(engineThreads || 1, 10));
    const mins = Math.ceil(totalSec / 60);
    return `${mins} min est.`;
  };

  // Function to highlight differences between original and new text
  const getHighlightedText = (original, modified) => {
    if (!original || !modified) return modified;

    const originalWords = original.split(/(\s+)/);
    const modifiedWords = modified.split(/(\s+)/);

    const result = [];
    const maxLength = Math.max(originalWords.length, modifiedWords.length);

    for (let i = 0; i < maxLength; i++) {
      const origWord = originalWords[i] || '';
      const modWord = modifiedWords[i] || '';

      if (origWord !== modWord && modWord.trim()) {
        // Word is different or new
        result.push({
          text: modWord,
          isChanged: true
        });
      } else {
        result.push({
          text: modWord,
          isChanged: false
        });
      }
    }

    return result;
  };

  // Filter states
  const [filterSection, setFilterSection] = useState('All');
  const [filterChapter, setFilterChapter] = useState('All');
  const [filterSubChapter, setFilterSubChapter] = useState('All');
  const [filterCountry, setFilterCountry] = useState('All');

  // Available filter options (extracted from data)
  const [availableSections, setAvailableSections] = useState([]);
  const [availableChapters, setAvailableChapters] = useState([]);
  const [availableSubChapters, setAvailableSubChapters] = useState([]);
  const [availableCountries, setAvailableCountries] = useState([]);

  // Load Lola documents on mount
  useEffect(() => {
    if (activeAssistant === 'lola') {
      loadLolaDocuments();
    }
  }, [activeAssistant]);

  // Load facilities data when Map tab is opened or filters change
  useEffect(() => {
    if (engine !== 'PyPSA Engine' && activeAssistant === 'emil' && activeTab === 'map') {
      loadFacilitiesData(true).then(data => {
        // Auto-generate connections when facilities are loaded
        if (data && data.length > 0) {
          generateConnectionsFromProperties(data);
        }
      });
    }
  }, [engine, activeAssistant, activeTab, emilClassGroupFilter, emilClassFilter, emilCategoryFilter, emilObjectFilter]);

  // Also generate connections when facilitiesData changes (if not already generated)
  useEffect(() => {
    if (engine !== 'PyPSA Engine' && activeAssistant === 'emil' && activeTab === 'map' && facilitiesData.length > 0 && connections.length === 0) {
      // Only generate property-based connections (from memberships), not random mesh
      generateConnectionsFromProperties(facilitiesData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, facilitiesData, activeAssistant, activeTab]);

  // Regenerate connections when connection filters change
  useEffect(() => {
    if (engine !== 'PyPSA Engine' && activeAssistant === 'emil' && activeTab === 'map' && facilitiesData.length > 0) {
      const hasConnectionFilters = connectionClassGroupFilter || connectionClassFilter ||
        connectionCategoryFilter || connectionObjectFilter ||
        connectionPropertyFilter;
      if (hasConnectionFilters || connections.length > 0) {
        // Regenerate connections with current filters (from memberships only)
        generateConnectionsFromProperties(facilitiesData);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, connectionClassGroupFilter, connectionClassFilter, connectionCategoryFilter,
    connectionObjectFilter, connectionPropertyFilter, activeAssistant, activeTab]);

  // Extract unique filter options when sections load (initial options from all data)
  useEffect(() => {
    if (documentSections.length > 0) {
      const sections = [...new Set(documentSections.map(s => s.objective_title || s.task_title).filter(Boolean))];
      setAvailableSections(sections);
    }
  }, [documentSections]);

  // Update cascading filter options based on current selections
  useEffect(() => {
    if (documentSections.length > 0) {
      // Start with all sections
      let dataForChapters = [...documentSections];
      let dataForSubChapters = [...documentSections];
      let dataForCountries = [...documentSections];

      // Filter data for Chapter dropdown based on Section selection
      if (filterSection !== 'All') {
        dataForChapters = dataForChapters.filter(s =>
          (s.objective_title === filterSection || s.task_title === filterSection)
        );
        dataForSubChapters = dataForSubChapters.filter(s =>
          (s.objective_title === filterSection || s.task_title === filterSection)
        );
        dataForCountries = dataForCountries.filter(s =>
          (s.objective_title === filterSection || s.task_title === filterSection)
        );
      }

      // Filter data for Sub Chapter dropdown based on Section + Chapter selections
      if (filterChapter !== 'All') {
        dataForSubChapters = dataForSubChapters.filter(s => s.task_title === filterChapter);
        dataForCountries = dataForCountries.filter(s => s.task_title === filterChapter);
      }

      // Filter data for Country dropdown based on Section + Chapter + Sub Chapter selections
      if (filterSubChapter !== 'All') {
        dataForCountries = dataForCountries.filter(s => s.sub_task_title === filterSubChapter);
      }

      // Extract unique values for each dropdown
      const chapters = [...new Set(dataForChapters.map(s => s.task_title).filter(Boolean))];
      const subChapters = [...new Set(dataForSubChapters.map(s => s.sub_task_title).filter(Boolean))];
      const countries = [...new Set(dataForCountries.map(s => s.country).filter(Boolean))];

      setAvailableChapters(chapters);
      setAvailableSubChapters(subChapters);
      setAvailableCountries(countries);
    }
  }, [documentSections, filterSection, filterChapter, filterSubChapter]);

  // Apply filters to get final filtered sections
  useEffect(() => {
    let filtered = [...documentSections];

    if (filterSection !== 'All') {
      filtered = filtered.filter(s =>
        (s.objective_title === filterSection || s.task_title === filterSection)
      );
    }

    if (filterChapter !== 'All') {
      filtered = filtered.filter(s => s.task_title === filterChapter);
    }

    if (filterSubChapter !== 'All') {
      filtered = filtered.filter(s => s.sub_task_title === filterSubChapter);
    }

    if (filterCountry !== 'All') {
      filtered = filtered.filter(s => s.country === filterCountry);
    }

    setFilteredSections(filtered);
  }, [documentSections, filterSection, filterChapter, filterSubChapter, filterCountry]);

  // When user switches to PyPSA Engine, fetch available progress files
  useEffect(() => {
    if (engine === 'PyPSA Engine') {
      loadPyPSAFiles(pypsaGranularity);
    }
  }, [engine, pypsaGranularity]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (engine !== 'PyPSA Engine' || !pypsaCatalogueError || pypsaCatalogueLoading) return undefined;
    const delayMs = Math.min(60000, 2000 * (2 ** Math.min(5, Math.max(0, pypsaCatalogueAttempt - 1))));
    let timer;
    const visible = () => document.visibilityState !== 'hidden';
    const retry = () => {
      timer = undefined;
      if (visible()) loadPyPSAFiles(pypsaGranularity);
    };
    const schedule = () => {
      if (visible()) timer = window.setTimeout(retry, delayMs);
    };
    const handleVisibility = () => {
      window.clearTimeout(timer);
      timer = undefined;
      // A foreground return is an explicit recovery opportunity. Retry now;
      // hidden tabs otherwise consume no catalogue polling work.
      if (visible()) loadPyPSAFiles(pypsaGranularity);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    schedule();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [engine, pypsaCatalogueAttempt, pypsaCatalogueError, pypsaCatalogueLoading, pypsaGranularity]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLolaDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/lola/documents`);
      const data = await response.json();
      setLolaDocuments(data.documents || []);

      // Automatically load all sections from all documents
      if (data.documents && data.documents.length > 0) {
        loadAllDocumentSections(data.documents);
      }
    } catch (error) {
      console.error('Error loading Lola documents:', error);
      setLolaStatus('Error loading documents');
    }
  };

  const loadAllDocumentSections = async (documents) => {
    try {
      const allSections = [];
      for (const doc of documents) {
        const response = await fetch(`${API_BASE}/api/lola/sections/${doc.filename}`);
        const data = await response.json();
        const sectionsWithDoc = (data.sections || []).map((section, idx) => ({
          ...section,
          _source_document: doc.filename,
          _row_index: idx  // Store the actual CSV row index
        }));
        allSections.push(...sectionsWithDoc);
      }
      setDocumentSections(allSections);
    } catch (error) {
      console.error('Error loading all document sections:', error);
      setLolaStatus('Error loading sections');
    }
  };

  const loadDocumentSections = async (filename) => {
    try {
      const response = await fetch(`${API_BASE}/api/lola/sections/${filename}`);
      const data = await response.json();
      setDocumentSections(data.sections || []);
      // Reset filters
      setFilterSection('All');
      setFilterChapter('All');
      setFilterSubChapter('All');
      setFilterCountry('All');
    } catch (error) {
      console.error('Error loading document sections:', error);
      setLolaStatus('Error loading sections');
    }
  };

  const loadSection = async (section, index) => {
    try {
      const filename = section._source_document;
      const response = await fetch(`${API_BASE}/api/lola/section/${filename}/${index}`);
      const data = await response.json();
      setCurrentSection(data.section);
      setOriginalText(data.section?.final_copy || data.section?.summary || '');
      setNewText(data.section?.final_copy || data.section?.summary || '');
      setSelectedSectionIndex(index);
      setSelectedDocument(filename);
    } catch (error) {
      console.error('Error loading section:', error);
      setLolaStatus('Error loading section');
    }
  };

  const saveSection = async () => {
    if (!selectedDocument || selectedSectionIndex === null) return;

    try {
      const response = await fetch(
        `${API_BASE}/api/lola/section/${selectedDocument}/${selectedSectionIndex}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updated_fields: {
              final_copy: newText
            }
          })
        }
      );
      const data = await response.json();
      if (data.success) {
        setLolaStatus('Section saved successfully!');
        setOriginalText(newText);
        setTimeout(() => setLolaStatus(''), 3000);
      }
    } catch (error) {
      console.error('Error saving section:', error);
      setLolaStatus('Error saving section');
    }
  };

  // Lola Live: Ask AI handler
  const handleLiveAsk = async () => {
    if (!liveQuestion.trim() || liveLoading) return;
    setLiveLoading(true);
    setLiveError('');
    try {
      const resp = await fetch(`${API_BASE}/api/lola/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: liveQuestion })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setLiveAnswer(data.answer || '');
    } catch (err) {
      console.error('Live Ask error:', err);
      setLiveError(err?.message || 'Request failed');
    } finally {
      setLiveLoading(false);
    }
  };

  // ── PyPSA helpers ──────────────────────────────────────────────────────────


  const extractPypsaCountryCode = useCallback((filename) => {
    const normalized = filename || '';
    const buildPrefixMatch = normalized.match(/(?:^|\/)build_([A-Z]{2})(?:_|$)/i);
    if (buildPrefixMatch) return buildPrefixMatch[1].toUpperCase();

    const legacyMatch = normalized.match(/(?:^|\/)([A-Z]{2})_build/i);
    if (legacyMatch) return legacyMatch[1].toUpperCase();

    const localCacheMatch = normalized.match(/(?:^|\/)base_([A-Z]{2})(?:_c\d+|_(?:nuts[123]|bidding_zone|ehighway|full))?\.nc$/i);
    if (localCacheMatch) return localCacheMatch[1].toUpperCase();

    return '';
  }, []);

  const pickPreferredPypsaNetworkFile = useCallback((files, folderHint = '') => {
    const allFiles = Array.isArray(files) ? files : [];
    const folder = String(folderHint || '').trim().replace(/\/+$/, '');

    const pool = allFiles.filter((f) => {
      const name = String(f?.filename || '');
      if (!/\.nc$/i.test(name)) return false;
      if (folder && !(name.startsWith(`${folder}/`))) return false;
      return true;
    });

    if (!pool.length) return '';

    const score = (entry) => {
      const name = String(entry?.filename || '');
      const lower = name.toLowerCase();
      let value = 0;

      if (lower.includes('/networks/')) value += 120;
      if (/network_built\.nc$/i.test(name)) value += 300;
      if (/base_s_all_elec_?\.nc$/i.test(name)) value += 280;
      if (/base_s_all\.nc$/i.test(name)) value += 220;
      if (/base_s\.nc$/i.test(name)) value += 200;
      if (/base_extended\.nc$/i.test(name)) value += 160;
      if (/base\.nc$/i.test(name)) value += 120;
      if (/availability_matrix|profile_|electricity_demand/i.test(name)) value -= 250;

      // Prefer deterministic filename order as tie-breaker.
      return value;
    };

    const sorted = [...pool].sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return String(a?.filename || '').localeCompare(String(b?.filename || ''));
    });
    return String(sorted[0]?.filename || '');
  }, []);

  const loadPyPSAFiles = async (granularityPrefix = pypsaGranularity, options = {}) => {
    const sourceMode = options.sourceMode || 'auto';
    let savedCatalogue = null;
    try {
      savedCatalogue = readPypsaCatalogueCache(window.localStorage, granularityPrefix, sourceMode);
    } catch (_) { /* localStorage unavailable */ }
    if (savedCatalogue?.files?.length) {
      pypsaFilesRef.current = savedCatalogue.files;
      setPypsaFiles(savedCatalogue.files);
      setPypsaFilesSource(`saved ${savedCatalogue.source}`);
      setPypsaCatalogueUsingCache(true);
      pypsaCompactOverlaysRef.current = savedCatalogue.capabilities?.parse_nc_omit_geojson_overlays === true;
    }
    setPypsaCatalogueLoading(true);
    try {
      const params = new URLSearchParams({ granularity_prefix: granularityPrefix, source: sourceMode });
      const resp = await fetch(`${API_BASE}/api/pypsa/list-files?${params}`);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const files = data.files || [];
      pypsaFilesRef.current = files;
      pypsaCompactOverlaysRef.current = data.capabilities?.parse_nc_omit_geojson_overlays === true;
      setPypsaFiles(files);
      setPypsaFilesSource(data.source || sourceMode);
      setPypsaCatalogueUsingCache(false);
      try {
        if (files.length) {
          writePypsaCatalogueCache(window.localStorage, granularityPrefix, sourceMode, {
            files,
            source: data.source || sourceMode,
            capabilities: data.capabilities || {},
          });
        } else {
          clearPypsaCatalogueCache(window.localStorage, granularityPrefix, sourceMode);
        }
      } catch (_) { /* localStorage unavailable */ }
      setPypsaCatalogueError('');
      setPypsaCatalogueAttempt(0);
      setSelectedPypsaListFile((prev) => {
        const primaryEntries = files.filter((entry) => {
          const filename = String(entry?.filename || '').trim();
          if (!filename) return false;
          if (entry?.is_distill) return true;
          return !filename.includes('/');
        });
        if (prev && primaryEntries.some((f) => String(f?.filename || '') === prev)) return prev;
        const nc = pickPreferredPypsaNetworkFile(primaryEntries);
        if (nc) return nc;
        const fallbackNc = primaryEntries.find((f) => /\.nc$/i.test(String(f?.filename || '')));
        if (fallbackNc?.filename) return fallbackNc.filename;
        const regular = primaryEntries.find((f) => !f?.is_distill);
        if (regular?.filename) return regular.filename;
        return primaryEntries[0]?.filename || '';
      });
      return files;
    } catch (err) {
      pypsaCompactOverlaysRef.current = false;
      setPypsaCatalogueError(err?.message || 'The local ATLAS backend is unavailable.');
      setPypsaCatalogueAttempt((attempt) => attempt + 1);
      // Preserve a previously loaded catalogue during a brief backend restart.
      // An empty first load remains empty until the automatic retry succeeds.
      return [];
    } finally {
      setPypsaCatalogueLoading(false);
    }
  };

  async function loadSelectedPypsaOutput() {
    const target = String(selectedPypsaListFile || '').trim();
    if (!target || pypsaLoading) return;

    const selectedEntry = (pypsaFiles || []).find(
      (f) => String(f?.filename || '').trim() === target
    ) || null;

    const candidates = [
      String(selectedEntry?.granularity_prefix || '').trim(),
      extractResolutionLabelFromName(target),
      pypsaGranularity,
      'pypsa',
    ].filter(Boolean);
    const tried = new Set();
    let lastErr = null;

    for (const prefix of candidates) {
      if (tried.has(prefix)) continue;
      tried.add(prefix);
      try {
        await loadPyPSANetworkFromFile(target, prefix, { forceDistill: Boolean(selectedEntry?.is_distill) });
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Could not load selected output');
  }

  async function loadLatestPypsaOutputFromS3() {
    if (pypsaLoading) return;
    const fallbackPrefixes = [
      pypsaGranularity,
      'pypsa_1024',
      'pypsa_512',
      'pypsa_256',
      'pypsa_128',
      'pypsa_37',
      'pypsa',
    ].filter(Boolean);

    const seen = new Set();
    let lastErr = null;
    for (const prefix of fallbackPrefixes) {
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      try {
        const files = await loadPyPSAFiles(prefix, { sourceMode: 's3' });
        const entries = Array.isArray(files) ? files : [];
        const pick = entries.find((f) => f?.is_distill)
          || entries.find((f) => String(f?.filename || '').trim());
        if (!pick?.filename) continue;

        const target = String(pick.filename).trim();
        const resolvedPrefix = String(pick.granularity_prefix || '').trim()
          || extractResolutionLabelFromName(target)
          || prefix;
        await loadPyPSANetworkFromFile(target, resolvedPrefix, { forceDistill: Boolean(pick?.is_distill) });
        setSolveNetworkStageMessage(`Loaded S3 output: ${target} (${resolvedPrefix})`);
        return true;
      } catch (err) {
        lastErr = err;
      }
    }
    const msg = lastErr?.message || 'No saved outputs found in S3';
    setSolveNetworkStageMessage(`Direct S3 load failed: ${msg}`);
    return false;
  }

  const loadPyPSANetworkFromFile = async (filename, granularityPrefix = pypsaGranularity, options = {}) => {
    if (!filename) return;
    const requestedFilename = String(filename || '').trim();
    const lowerRequested = requestedFilename.toLowerCase();
    const catalogueFiles = pypsaFiles.length ? pypsaFiles : pypsaFilesRef.current;
    const caseInsensitiveMatch = catalogueFiles.find(
      (f) => String(f?.filename || '').trim().toLowerCase() === lowerRequested
    );
    const effectiveFilename = caseInsensitiveMatch?.filename || requestedFilename;

    const stageOnly = Boolean(options.stageOnly);
    if (!stageOnly && pypsaBatchRef.current) throw new Error('A network update is already in progress. Wait for it or cancel it first.');
    if (!stageOnly) setPypsaLoading(true);
    try {
      const forceDistill = Boolean(options.forceDistill);
      const appendToMap = Boolean(options.append);
      const mergeDomain = Boolean(options.mergeDomain);
      const skipFocus = Boolean(options.skipFocus);
      const inferredCountryCode = extractPypsaCountryCode(effectiveFilename);
      const inferredFullEurope = !inferredCountryCode;
      const requestedScopeRaw = String(
        options.componentScope || (((fullEuOnly || inferredFullEurope) && pypsaFilesSource !== 'local') ? 'lines_only' : 'grid')
      ).trim().toLowerCase();
      const requestedScope = ['full', 'grid', 'lines_only', 'supply', 'storage', 'demand'].includes(requestedScopeRaw)
        ? requestedScopeRaw
        : 'grid';
      // Detect whether this entry is a distill directory or a JSON file.
      // Reuse the case-insensitive match above rather than re-looking up strictly,
      // which would miss entries whose filename casing differs from what was typed.
      const fileEntry = caseInsensitiveMatch;
      const inferredDistillFromName = (
        /(?:^|\/)build_[A-Z]{2}(?:_|$)/i.test(effectiveFilename) ||
        /(?:^|\/)build_/i.test(effectiveFilename) ||
        /(?:^|\/)build_subnet_/i.test(effectiveFilename) ||
        /(?:^|\/)[A-Z]{2}_build/i.test(effectiveFilename) ||
        effectiveFilename.startsWith('distill_') ||
        effectiveFilename.includes('/distill_')
      );
      const isDistill = forceDistill || (fileEntry ? fileEntry.is_distill : inferredDistillFromName);
      let resolvedFilename = effectiveFilename;
      if (isDistill && !/\.nc$/i.test(resolvedFilename)) {
        const nestedNc = pickPreferredPypsaNetworkFile(catalogueFiles, resolvedFilename);
        if (nestedNc) {
          resolvedFilename = nestedNc;
          if (!stageOnly) setSelectedPypsaListFile(nestedNc);
        }
      }
      const isNcFile = /\.nc$/i.test(resolvedFilename);
      if (!stageOnly) {
        setSelectedPyPSAFile(isNcFile ? resolvedFilename : effectiveFilename);
        if (isNcFile) setSelectedPypsaListFile(resolvedFilename);
      }
      const endpoint  = isNcFile
        ? `${API_BASE}/api/pypsa/parse-nc`
        : (isDistill ? `${API_BASE}/api/pypsa/parse-distill` : `${API_BASE}/api/pypsa/parse-progress`);
      const bodyKey   = isDistill && !isNcFile ? 'dirname' : 'filename';

      const resp = await fetch(endpoint, {
        method: 'POST',
        signal: options.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [bodyKey]: isNcFile ? resolvedFilename : effectiveFilename,
          granularity_prefix: granularityPrefix,
          geographic_country: String(fileEntry?.geographic_country || ''),
          geographic_level: String(fileEntry?.geographic_level || ''),
          full_country: String(fileEntry?.full_country || ''),
          component_scope: requestedScope,
          // The batch owns a Grid stage (or an existing grid in domain mode).
          // Negotiate this option so older servers retain their cache contract.
          ...(stageOnly && ['supply', 'storage', 'demand'].includes(requestedScope)
            && pypsaCompactOverlaysRef.current ? { include_geojson_overlays: false } : {}),
          demand_scenario: 'NT',
          demand_year: Number(planningHorizonYear) || 2030,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || `Could not load ${resolvedFilename} (HTTP ${resp.status}).`);
      if (data.source_inventory?.error || data.demand_inventory?.error) {
        throw new Error(`${data.demand_inventory?.error ? 'Demand' : 'Source component'} data could not be loaded for ${resolvedFilename}. Please retry.`);
      }
      const effectiveScopeRaw = String(data.component_scope || requestedScope || 'grid').trim().toLowerCase();
      const effectiveScope = ['full', 'grid', 'lines_only', 'supply', 'storage', 'demand'].includes(effectiveScopeRaw)
        ? effectiveScopeRaw
        : 'grid';
      if (!stageOnly) {
        setPypsaComponentScope(effectiveScope);
        setPypsaDeferredDetailLoad(Boolean((fullEuOnly || inferredFullEurope) && effectiveScope === 'lines_only'));
      }

      const resolvedCountryCode = extractPypsaCountryCode(resolvedFilename || effectiveFilename);
      if (resolvedCountryCode && !stageOnly) {
        setSelectedPyPSACountryCode(resolvedCountryCode);
      }

      // Convert PyPSA markers into the facility shape the map already understands.
      // Backend may return markers as an array OR as an object keyed by id.
      const markerRows = Array.isArray(data?.markers)
        ? data.markers
        : Object.values(data?.markers || {});
      const facilities = markerRows.map(m => {
        const componentType = m.type || 'Generator';
        const carrierKey = (m.is_virtual
          ? 'cross_border'
          : (m.carrier || (componentType === 'Bus' ? 'bus' : componentType) || 'unknown'));
        return ({
        id: m.id,
        name: m.name,
        nodeId: m.id,
        parentName: m.name,
        region: m.country || '',
        latitude: m.latitude,
        longitude: m.longitude,
        country: m.country || '',
        // Carrier-driven map typing for filtering/legend; keep component_type separately.
        type: m.is_virtual ? 'VirtualBus' : carrierKey,
        component_type: componentType,
        carrier_key: carrierKey,
        carrier: m.carrier || '',
        carrier_color: m.carrier_color || '',
        carrier_nice_name: m.carrier_nice_name || m.carrier || '',
        cluster_id: m.cluster_id || '',
        sourceCountryCode: resolvedCountryCode || '',
        sourceNetworkFilename: resolvedFilename,
        p_nom: m.p_nom,
        p_nom_opt: m.p_nom_opt,
        p_set: m.p_set,
        annual_energy_gwh: m.annual_energy_gwh,
        spatial_weight: m.spatial_weight,
        demand_breakdown: Array.isArray(m.demand_breakdown)
          ? m.demand_breakdown
          : (data?.demand_templates?.[m.demand_template_key] || []),
        demand_template_key: m.demand_template_key || '',
        demand_scenario: m.demand_scenario || '',
        demand_year: m.demand_year || null,
        demand_source_file: m.demand_source_file || '',
        demand_source_sheet: m.demand_source_sheet || '',
        provisional_demand: Boolean(m.provisional_demand),
        total_dispatch_MWh: m.total_dispatch_MWh,
        bus: m.bus || '',
        dirname: isDistill ? effectiveFilename : null,
        granularityPrefix,
        csv_context_sources: m.csv_context_sources || null,
        editable: false,
        is_virtual: m.is_virtual || false,
        membership: {
          collection: m.is_virtual ? 'CrossBorder' : 'PyPSA',
          parentClass: m.is_virtual ? 'VirtualBus' : componentType,
          childClass: 'Bus',
          parentCategory: m.carrier || '',
          childCategory: '',
        },
        properties: m.is_virtual
          ? [
            { Property: 'Type', Value: 'Cross-Border Bus', Units: '' },
            { Property: 'Bus ID', Value: m.bus || '', Units: '' },
            { Property: 'Country', Value: m.country || '', Units: '' },
            // All interconnector links that connect to this foreign bus
            ...((m.cross_border_connections || []).flatMap((cb, idx) => [
              { Property: `[Link ${idx + 1}] Name`, Value: cb.name || '', Units: '' },
              { Property: `[Link ${idx + 1}] Type`, Value: cb.type || 'Link', Units: '' },
              ...(cb.carrier ? [{ Property: `[Link ${idx + 1}] Carrier`, Value: cb.carrier, Units: '' }] : []),
              ...(cb.p_nom != null ? [{ Property: `[Link ${idx + 1}] P Nom`, Value: Number(cb.p_nom).toFixed(2), Units: 'MW' }] : []),
              ...(cb.s_nom != null ? [{ Property: `[Link ${idx + 1}] S Nom`, Value: Number(cb.s_nom).toFixed(2), Units: 'MVA' }] : []),
              ...(cb.x != null ? [{ Property: `[Link ${idx + 1}] Reactance x`, Value: cb.x, Units: 'Ω' }] : []),
              ...(cb.r != null ? [{ Property: `[Link ${idx + 1}] Resistance r`, Value: cb.r, Units: 'Ω' }] : []),
              ...(cb.length != null ? [{ Property: `[Link ${idx + 1}] Length`, Value: Number(cb.length).toFixed(1), Units: 'km' }] : []),
              ...(cb.efficiency != null ? [{ Property: `[Link ${idx + 1}] Efficiency`, Value: cb.efficiency, Units: '' }] : []),
              ...(cb.line_type ? [{ Property: `[Link ${idx + 1}] Conductor Type`, Value: cb.line_type, Units: '' }] : []),
              { Property: `[Link ${idx + 1}] Via Port`, Value: cb.via_port || '', Units: '' },
              { Property: `[Link ${idx + 1}] Foreign Port`, Value: cb.foreign_port || '', Units: '' },
              { Property: `[Link ${idx + 1}] Home Bus`, Value: cb.via_bus || '', Units: '' },
              ...(cb.foreign_generators && cb.foreign_generators.length > 0
                ? [{ Property: `[Link ${idx + 1}] Generators`, Value: cb.foreign_generators.join(', '), Units: '' }] : []),
            ])),
          ]
          : [
            { Property: 'Carrier', Value: m.carrier_nice_name || m.carrier || '', Units: '' },
            { Property: 'Type', Value: m.type || 'Generator', Units: '' },
            { Property: 'Bus', Value: m.bus || '', Units: '' },
            { Property: 'Country', Value: m.country || '', Units: '' },
            ...(m.control ? [{ Property: 'Bus Control', Value: m.control, Units: '' }] : []),
            ...(m.sub_network ? [{ Property: 'Sub-Network', Value: m.sub_network, Units: '' }] : []),
            ...(m.v_nom != null ? [{ Property: 'Nominal Voltage', Value: Number(m.v_nom).toFixed(2), Units: 'kV' }] : []),
            ...(m.v_mag_pu_set != null ? [{ Property: 'Voltage Setpoint', Value: Number(m.v_mag_pu_set).toFixed(3), Units: 'p.u.' }] : []),
            ...(m.v_mag_pu_min != null ? [{ Property: 'Voltage Min', Value: Number(m.v_mag_pu_min).toFixed(3), Units: 'p.u.' }] : []),
            ...(m.v_mag_pu_max != null ? [{ Property: 'Voltage Max', Value: Number(m.v_mag_pu_max).toFixed(3), Units: 'p.u.' }] : []),
            ...(m.p_nom != null ? [{ Property: 'P Nom', Value: Number(m.p_nom).toFixed(2), Units: 'MW' }] : []),
            ...(m.p_nom_opt != null ? [{ Property: 'P Nom Optimal', Value: Number(m.p_nom_opt).toFixed(2), Units: 'MW' }] : []),
            ...(m.p_min_pu != null ? [{ Property: 'P Min (p.u.)', Value: Number(m.p_min_pu).toFixed(3), Units: '' }] : []),
            ...(m.p_max_pu != null ? [{ Property: 'P Max (p.u.)', Value: Number(m.p_max_pu).toFixed(3), Units: '' }] : []),
            ...(m.p_set != null ? [{ Property: 'P Set', Value: Number(m.p_set).toFixed(2), Units: 'MW' }] : []),
            ...(m.q_set != null ? [{ Property: 'Q Set', Value: Number(m.q_set).toFixed(2), Units: 'MVar' }] : []),
            ...(m.sign != null ? [{ Property: 'Sign', Value: Number(m.sign).toFixed(2), Units: '' }] : []),
            ...(m.e_nom != null ? [{ Property: 'E Nom', Value: Number(m.e_nom).toFixed(2), Units: 'MWh' }] : []),
            ...(m.e_nom_opt != null ? [{ Property: 'E Nom Optimal', Value: Number(m.e_nom_opt).toFixed(2), Units: 'MWh' }] : []),
            ...(m.e_min_pu != null ? [{ Property: 'E Min (p.u.)', Value: Number(m.e_min_pu).toFixed(3), Units: '' }] : []),
            ...(m.e_max_pu != null ? [{ Property: 'E Max (p.u.)', Value: Number(m.e_max_pu).toFixed(3), Units: '' }] : []),
            ...(m.standing_loss != null ? [{ Property: 'Standing Loss', Value: Number(m.standing_loss).toFixed(4), Units: '' }] : []),
            ...(m.total_dispatch_MWh != null ? [{ Property: 'Total Dispatch', Value: Number(m.total_dispatch_MWh).toLocaleString(undefined, { maximumFractionDigits: 0 }), Units: 'MWh' }] : []),
            ...(m.efficiency != null ? [{ Property: 'Efficiency', Value: m.efficiency, Units: '' }] : []),
            ...(m.efficiency_store != null ? [{ Property: 'Efficiency (Store)', Value: Number(m.efficiency_store).toFixed(3), Units: '' }] : []),
            ...(m.efficiency_dispatch != null ? [{ Property: 'Efficiency (Dispatch)', Value: Number(m.efficiency_dispatch).toFixed(3), Units: '' }] : []),
            ...(m.max_hours != null ? [{ Property: 'Max Hours', Value: Number(m.max_hours).toFixed(1), Units: 'h' }] : []),
            ...(m.length != null ? [{ Property: 'Length', Value: Number(m.length).toFixed(2), Units: 'km' }] : []),
            ...(m.marginal_cost != null ? [{ Property: 'Marginal Cost', Value: Number(m.marginal_cost).toFixed(3), Units: '€/MWh' }] : []),
            ...(m.capital_cost != null ? [{ Property: 'Capital Cost', Value: Number(m.capital_cost).toFixed(3), Units: '€/MW' }] : []),
            ...(m.build_year != null ? [{ Property: 'Build Year', Value: m.build_year, Units: '' }] : []),
            ...(m.lifetime != null ? [{ Property: 'Lifetime', Value: m.lifetime, Units: 'years' }] : []),
            ...(m.csv_powerplant_count != null ? [{ Property: '[Context] Powerplants', Value: Number(m.csv_powerplant_count).toLocaleString(), Units: '' }] : []),
            ...(m.csv_powerplant_capacity_mw != null ? [{ Property: '[Context] Plant Capacity', Value: Number(m.csv_powerplant_capacity_mw).toLocaleString(undefined, { maximumFractionDigits: 2 }), Units: 'MW' }] : []),
            ...(m.csv_powerplant_top_fuel ? [{ Property: '[Context] Top Fuel', Value: m.csv_powerplant_top_fuel, Units: '' }] : []),
            ...(m.csv_powerplant_top_technology ? [{ Property: '[Context] Top Technology', Value: m.csv_powerplant_top_technology, Units: '' }] : []),
            ...(m.csv_cost_technology ? [{ Property: '[Context] Cost Technology', Value: m.csv_cost_technology, Units: '' }] : []),
            ...(m.csv_cost_capital_cost != null ? [{ Property: '[Context] Cost Capex', Value: Number(m.csv_cost_capital_cost).toFixed(3), Units: '€/MW' }] : []),
            ...(m.csv_cost_marginal_cost != null ? [{ Property: '[Context] Cost Marginal', Value: Number(m.csv_cost_marginal_cost).toFixed(3), Units: '€/MWh' }] : []),
            ...(m.csv_cost_efficiency != null ? [{ Property: '[Context] Cost Efficiency', Value: Number(m.csv_cost_efficiency).toFixed(3), Units: '' }] : []),
            ...(m.csv_cost_lifetime != null ? [{ Property: '[Context] Cost Lifetime', Value: Number(m.csv_cost_lifetime).toFixed(1), Units: 'years' }] : []),
            ...(m.csv_demand_avg_mw != null ? [{ Property: '[Context] Demand Avg', Value: Number(m.csv_demand_avg_mw).toLocaleString(undefined, { maximumFractionDigits: 2 }), Units: 'MW' }] : []),
            ...(m.csv_demand_peak_mw != null ? [{ Property: '[Context] Demand Peak', Value: Number(m.csv_demand_peak_mw).toLocaleString(undefined, { maximumFractionDigits: 2 }), Units: 'MW' }] : []),
            ...(m.csv_demand_latest_mw != null ? [{ Property: '[Context] Demand Latest', Value: Number(m.csv_demand_latest_mw).toLocaleString(undefined, { maximumFractionDigits: 2 }), Units: 'MW' }] : []),
            ...(m.csv_busmap_target ? [{ Property: '[Context] Busmap Target', Value: m.csv_busmap_target, Units: '' }] : []),
            // Cross-border connections attached to this generator's bus
            ...((m.cross_border_connections || []).flatMap((cb, idx) => [
              { Property: `[CBC ${idx + 1}] Link`, Value: cb.name || '', Units: '' },
              { Property: `[CBC ${idx + 1}] Carrier`, Value: cb.carrier || '', Units: '' },
              { Property: `[CBC ${idx + 1}] Foreign Bus`, Value: cb.foreign_bus || '', Units: '' },
              { Property: `[CBC ${idx + 1}] Foreign Country`, Value: cb.foreign_country || '', Units: '' },
              { Property: `[CBC ${idx + 1}] Via Port`, Value: cb.via_port || '', Units: '' },
              { Property: `[CBC ${idx + 1}] Foreign Port`, Value: cb.foreign_port || '', Units: '' },
              ...(cb.p_nom != null ? [{ Property: `[CBC ${idx + 1}] P Nom`, Value: Number(cb.p_nom).toFixed(2), Units: 'MW' }] : []),
            ...(cb.foreign_generators && cb.foreign_generators.length > 0
              ? [{ Property: `[CBC ${idx + 1}] Foreign Generators`, Value: (cb.foreign_generators || []).join(', '), Units: '' }] : []),
          ])),
            ...(Array.isArray(m.properties) ? m.properties : []),
          ],
      })});

      const scopeDomain = ({ grid: 'Grid', lines_only: 'Grid', supply: 'Supply', storage: 'Storage', demand: 'Demand' })[effectiveScope] || null;
      const normalizedFacilities = facilities.map((facility) => ({
        ...facility,
        atlas_domain: classifyAtlasMapDomain(facility),
      }));
      const domainAvailability = Object.fromEntries(
        (effectiveScope === 'full' ? ATLAS_MAP_DOMAINS : [scopeDomain || 'Grid']).map((domain) => {
          const inventory = domain === 'Demand' ? data.demand_inventory
            : ['Supply', 'Storage'].includes(domain) ? data.source_inventory : null;
          const count = normalizedFacilities.filter((facility) => facility.atlas_domain === domain && !facility.is_virtual).length;
          const unavailable = count === 0 && inventory?.loaded === false && Boolean(inventory.reason);
          return [domain, {
            count, unavailable, reason: unavailable ? String(inventory.reason) : '',
            ...(domain === 'Demand' && inventory?.loaded ? {
              provisional: inventory.provisional === true,
              annualDemandGwh: inventory.annual_demand_gwh_per_country,
              spatialProxy: inventory.proxy,
              compositionUnavailable: inventory.countries?.[resolvedCountryCode]?.composition_loaded === false,
            } : {}),
          }];
        }),
      );
      if (stageOnly) {
        if (!resolvedCountryCode || data.filename !== resolvedFilename || effectiveScope !== requestedScope
            || (requestedScope === 'grid' && !normalizedFacilities.length)) {
          throw new Error(`The response for ${resolvedFilename} does not match the requested network.`);
        }
        const tag = (record) => ({ ...record, sourceCountryCode: resolvedCountryCode, sourceNetworkFilename: resolvedFilename });
        return {
          countryCode: resolvedCountryCode,
          countryName: countryCodeToName(resolvedCountryCode),
          filename: resolvedFilename,
          facilities: normalizedFacilities,
          connections: (data.connections || []).map(tag),
          // Grid owns boundaries. Legacy component responses may still repeat
          // them; do not replace/remount unchanged polygons when adding a layer.
          overlays: ['supply', 'storage', 'demand'].includes(effectiveScope) ? [] : (data.geojson_overlays || []).map(tag),
          domains: Object.fromEntries((effectiveScope === 'full' ? ATLAS_MAP_DOMAINS : [scopeDomain || 'Grid']).map((domain) => [domain, true])),
          availability: domainAvailability,
        };
      }
      const previousFacilities = mergeDomain && resolvedCountryCode && scopeDomain
        ? pypsaFacilitiesDataRef.current.filter((facility) => !(
            facility.sourceCountryCode === resolvedCountryCode
            && (facility.atlas_domain || classifyAtlasMapDomain(facility)) === scopeDomain
          ))
        : (appendToMap && resolvedCountryCode
            ? pypsaFacilitiesDataRef.current.filter((facility) => facility.sourceCountryCode !== resolvedCountryCode)
            : (appendToMap ? pypsaFacilitiesDataRef.current : []));
      const combinedFacilities = groupPypsaFacilities([...previousFacilities, ...normalizedFacilities]);

      const taggedConnections = (data.connections || []).map((connection) => ({
        ...connection,
        sourceCountryCode: resolvedCountryCode || '',
        sourceNetworkFilename: resolvedFilename,
      }));
      const previousConnections = mergeDomain
        ? pypsaConnectionsRef.current
        : appendToMap && resolvedCountryCode
        ? pypsaConnectionsRef.current.filter((connection) => connection.sourceCountryCode !== resolvedCountryCode)
        : (appendToMap ? pypsaConnectionsRef.current : []);
      const uniqueConnections = new Map();
      [...previousConnections, ...taggedConnections].forEach((connection) => {
        const identity = scopedAtlasConnectionIdentity(connection);
        uniqueConnections.set(identity, connection);
      });
      const combinedConnections = [...uniqueConnections.values()];
      const taggedOverlays = (Array.isArray(data.geojson_overlays) ? data.geojson_overlays : []).map((overlay) => ({
        ...overlay,
        sourceCountryCode: resolvedCountryCode || '',
        sourceNetworkFilename: resolvedFilename,
      }));
      const previousOverlays = mergeDomain
        ? pypsaGeoJsonOverlaysRef.current
        : appendToMap && resolvedCountryCode
        ? pypsaGeoJsonOverlaysRef.current.filter((overlay) => overlay.sourceCountryCode !== resolvedCountryCode)
        : (appendToMap ? pypsaGeoJsonOverlaysRef.current : []);
      const combinedOverlays = [...previousOverlays, ...taggedOverlays];

      // Always refocus once after loading a new PyPSA dataset so the map
      // cannot appear empty due to a stale pan/zoom position.
      if (!skipFocus && combinedFacilities.length > 0) {
        const coords = combinedFacilities
          .map((f) => ({ lat: Number(f.latitude), lon: Number(f.longitude) }))
          .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
        if (coords.length > 0) {
          const lats = coords.map((c) => c.lat);
          const lons = coords.map((c) => c.lon);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLon = Math.min(...lons);
          const maxLon = Math.max(...lons);
          const centerLat = (minLat + maxLat) / 2;
          const centerLon = (minLon + maxLon) / 2;
          const span = Math.max(maxLat - minLat, maxLon - minLon);
          const zoom = span > 28 ? 4 : span > 16 ? 5 : span > 9 ? 6 : span > 4.5 ? 7 : 8;
          setEmilFocusLocation({
            latitude: centerLat,
            longitude: centerLon,
            zoom,
            label: effectiveFilename,
          });
        }
      }

      pypsaFacilitiesDataRef.current = combinedFacilities;
      pypsaConnectionsRef.current = combinedConnections;
      pypsaGeoJsonOverlaysRef.current = combinedOverlays;
      setPypsaFacilitiesData(combinedFacilities);
      const sourceBusCount = combinedFacilities.filter((facility) => (
        !facility?.is_virtual && String(facility?.component_type || '').toLowerCase() === 'bus'
      )).length;
      setPypsaDatasetMeta({
        filename: appendToMap
          ? [
              ...loadedPypsaNetworks
                .filter((network) => network.countryCode !== resolvedCountryCode)
                .map((network) => network.filename),
              resolvedFilename,
            ].filter(Boolean).join(', ')
          : resolvedFilename,
        sourceBusCount: sourceBusCount || combinedFacilities.length,
      });
      setHiddenCarriers(new Set()); // reset carrier filters on new file load

      // Store connections as-is; the backend already sets color/weight/opacity
      setPypsaConnections(combinedConnections);
      setPypsaGeoJsonOverlays(combinedOverlays);
      const hydratedDomains = effectiveScope === 'full'
        ? ATLAS_MAP_DOMAINS
        : [scopeDomain || 'Grid'];
      setPypsaLoadedDomainsByNetwork((previous) => {
        const next = (appendToMap || mergeDomain) ? { ...previous } : {};
        const current = next[resolvedFilename] || {};
        next[resolvedFilename] = hydratedDomains.reduce(
          (accumulator, domain) => ({ ...accumulator, [domain]: true }),
          { ...current }
        );
        return next;
      });
      if (!appendToMap && !mergeDomain) {
        setAtlasDomainVisibility({ Grid: true, Storage: false, Supply: false, Demand: false });
      }
      if (resolvedCountryCode) {
        const networkRecord = {
          countryCode: resolvedCountryCode,
          countryName: countryCodeToName(resolvedCountryCode),
          filename: resolvedFilename,
          domainAvailability,
        };
        setLoadedPypsaNetworks((previous) => appendToMap
          ? [...previous.filter((network) => network.countryCode !== resolvedCountryCode), networkRecord]
          : [networkRecord]);
      } else if (!appendToMap) {
        setLoadedPypsaNetworks([]);
      }
      return {
        groupedFacilities: combinedFacilities,
        connections: combinedConnections,
      };
    } catch (err) {
      console.error('Error loading PyPSA network:', err);
      if (!stageOnly) {
        setPypsaDeferredDetailLoad(false);
        setPypsaComponentScope('full');
      }
      throw err;
    } finally {
      if (!stageOnly) setPypsaLoading(false);
    }
  };

  const loadPyPSAMapBatch = async (entries, {
    mode = 'replace', activeCountry = '', focus = false, domains = ['Grid'], resolutionPlan = null,
  } = {}) => {
    if (pypsaBatchRef.current || pypsaLoading || pypsaDetailHydrating) throw new Error('A network update is already in progress. Wait for it or cancel it first.');
    const controller = new AbortController();
    pypsaBatchRef.current = controller;
    setPypsaResolutionSwitching(true);
    setGeographyLoadError('');
    try {
      const membership = pypsaMapMembershipRef.current;
      const requestedDomains = [...new Set([...(mode === 'domains' ? [] : ['Grid']), ...domains.filter((domain) => ATLAS_MAP_DOMAINS.includes(domain))])];
      const tasks = entries.flatMap((entry) => requestedDomains
        .filter((domain) => mode !== 'domains' || !membership.domains[entry.filename]?.[domain])
        .map((domain) => ({ entry, domain })));
      if (!tasks.length) return { ...membership, facilities: pypsaFacilitiesDataRef.current, connections: pypsaConnectionsRef.current, overlays: pypsaGeoJsonOverlaysRef.current };
      const stages = await stageMapBatch(tasks, ({ entry, domain }, signal) => loadPyPSANetworkFromFile(entry.filename, pypsaGranularity, {
        stageOnly: true, skipFocus: true, componentScope: domain.toLowerCase(), signal,
      }), { signal: controller.signal, onProgress: (progress) => {
        if (pypsaBatchRef.current === controller && !controller.signal.aborted) setPypsaBatchProgress(progress);
      } });
      if (controller.signal.aborted) throw new DOMException('Network loading cancelled', 'AbortError');
      const next = assembleMapBatch(stages, {
        facilities: pypsaFacilitiesDataRef.current,
        connections: pypsaConnectionsRef.current,
        overlays: pypsaGeoJsonOverlaysRef.current,
        networks: membership.networks,
        domains: membership.domains,
      }, mode);
      const entryByFilename = new Map(entries.map((entry) => [entry.filename, entry]));
      next.networks = next.networks.map((network) => {
        const sourceEntry = entryByFilename.get(network.filename);
        const resolutionKey = atlasResolutionKeyForEntry(sourceEntry) || atlasResolutionKeyForEntry(network);
        return {
          ...network,
          ...(resolutionKey ? {
            resolutionKey,
            resolutionLabel: mixedGranularityResolutionLabel(resolutionKey),
          } : {}),
        };
      });
      // Country caches are intentionally clipped at national borders. Rebuild
      // the bridge layer only after the full atomic batch is assembled, snapping
      // each OSM/PyPSA-Eur endpoint to that country's active resolution. This
      // also supports mixed-resolution maps without serial country loading.
      next.connections = stitchElectricityCrossBorderConnections(
        next.connections,
        next.facilities,
        electricityCrossBorderTopology.records,
        next.networks,
      );
      const nextActiveCountry = activeCountry || (mode === 'domains' ? membership.activeCountry : '');
      const active = next.networks.find((network) => network.countryCode === nextActiveCountry) || next.networks[next.networks.length - 1];
      // One synchronous publication: no mixed-resolution geometry, no changing
      // active country per response, and no reset of the user's carrier filters.
      pypsaFacilitiesDataRef.current = next.facilities;
      pypsaConnectionsRef.current = next.connections;
      pypsaGeoJsonOverlaysRef.current = next.overlays;
      pypsaMapMembershipRef.current = { networks: next.networks, domains: next.domains, activeCountry: active.countryCode };
      setPypsaFacilitiesData(next.facilities);
      setPypsaConnections(next.connections);
      setPypsaGeoJsonOverlays(next.overlays);
      setLoadedPypsaNetworks(next.networks);
      if (mode !== 'domains') setMixedGranularityPlan(resolutionPlan);
      setPypsaLoadedDomainsByNetwork(next.domains);
      setPypsaDatasetMeta({
        filename: next.networks.map((network) => network.filename).join(', '),
        sourceBusCount: next.facilities.filter((facility) => !facility.is_virtual && String(facility.component_type).toLowerCase() === 'bus').length,
      });
      setSelectedPyPSACountryCode(active.countryCode);
      setSelectedPyPSAFile(active.filename);
      setSelectedPypsaListFile(active.filename);
      setPypsaComponentScope('grid');
      setPypsaDeferredDetailLoad(false);
      if (focus) {
        setEmilFocusLocation(null);
        setEmilViewportCommand({ id: Date.now() + Math.random(), operation: 'fit_targets', countryCodes: next.networks.map((network) => network.countryCode) });
      }
      return next;
    } catch (error) {
      if (!controller.signal.aborted || error.name !== 'AbortError') {
        setGeographyLoadError(`${error.message} The previous map has been kept.`);
      }
      throw error;
    } finally {
      if (pypsaBatchRef.current === controller) {
        pypsaBatchRef.current = null;
        setPypsaBatchProgress(null);
        setPypsaResolutionSwitching(false);
      }
    }
  };

  const overlayDomainRequestRef = useRef(0);
  const overlayDomainStateRef = useRef(null);
  overlayDomainStateRef.current = {
    carriers: atlasOverlayCarriers,
    visibility: atlasDomainVisibility,
    sources: {
      gas: { loaded: gasLoadedDomains, scope: gasDatasetCountryScopeRef, initializing: gasInitializingRef, load: loadGasDomains },
      water: { loaded: waterLoadedDomains, scope: waterDatasetCountryScopeRef, initializing: waterInitializingRef, load: loadWaterDomains },
      liquids: { loaded: liquidsLoadedDomains, scope: liquidsDatasetCountryScopeRef, initializing: liquidsInitializingRef, load: loadLiquidsDomains },
      logistics: { loaded: logisticsLoadedDomains, scope: logisticsDatasetCountryScopeRef, initializing: logisticsInitializingRef, load: loadLogisticsDomains },
    },
  };

  const setAtlasOverlayDomains = useCallback(async (domains, mode = 'add') => {
    const requested = [...new Set(domains.filter(domain => ATLAS_MAP_DOMAINS.includes(domain)))];
    const requestId = ++overlayDomainRequestRef.current;
    // A preceding agent country action can commit before this callback's
    // closure is replaced. Always hydrate the complete committed membership.
    const networks = pypsaMapMembershipRef.current.networks;
    const country = normalizeOverlayCountryCodes(networks.map(network => network.countryCode)).join(',');
    const carriers = [...overlayDomainStateRef.current.carriers];
    const assertCurrent = () => {
      const currentCountry = normalizeOverlayCountryCodes(pypsaMapMembershipRef.current.networks.map(network => network.countryCode)).join(',');
      if (requestId !== overlayDomainRequestRef.current || !atlasOverlayModeRef.current
        || currentCountry !== country || overlayDomainStateRef.current.carriers.join(',') !== carriers.join(',')) {
        const error = new Error('The overlay selection changed while its layers were loading.');
        error.name = 'AbortError';
        throw error;
      }
    };
    if (mode !== 'hide') {
      if (!country) throw new Error('Choose countries in Geography Domain before loading overlay data.');
      if (!carriers.length) throw new Error('Select an overlay carrier first.');
      const loadCarrier = async carrier => {
        assertCurrent();
        if (carrier === 'electricity') {
          await loadPyPSAMapBatch(networks, { mode: 'domains', domains: requested });
          return;
        }
        const { sources, visibility } = overlayDomainStateRef.current;
        const source = sources[carrier];
        if (!source) throw new Error(`Unknown overlay carrier: ${carrier}.`);
        const replace = source.scope.current !== country || !source.loaded.Grid || Boolean(source.initializing.current);
        const missing = replace
          ? [...new Set(['Grid', ...requested, ...ATLAS_MAP_DOMAINS.filter(domain => visibility[domain] !== false)])]
          : requested.filter(domain => !source.loaded[domain]);
        if (!missing.length) return;
        // A country rescope/status request may still be finishing. This user
        // request supersedes it with the right scope and required domains;
        // the shared request owner cancels obsolete reads and caps downloads.
        source.initializing.current = '';
        atlasOverlayLoadAttemptsRef.current.set(carrier, country);
        atlasOverlayScopeAttemptsRef.current.set(carrier, country);
        await source.load(missing, { replace, country, skipFocus: true });
      };
      for (let index = 0; index < carriers.length; index += 2) {
        // Wait for both outcomes before reporting a failure or releasing UI
        // control. A rejected source must not be reported as a complete layer.
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.allSettled(carriers.slice(index, index + 2).map(loadCarrier));
        assertCurrent();
        const failures = results.flatMap((result, offset) => result.status === 'rejected'
          ? [`${ATLAS_NETWORK_CARRIER_META[carriers[index + offset]]?.label}: ${result.reason?.message || 'Could not load data.'}`] : []);
        if (failures.length) throw new Error(failures.join(' '));
      }
    }
    assertCurrent();
    setAtlasDomainVisibility(previous => {
      if (mode === 'hide' || mode === 'add') {
        return requested.reduce((next, domain) => ({ ...next, [domain]: mode === 'add' }), { ...previous });
      }
      return Object.fromEntries(ATLAS_MAP_DOMAINS.map(domain => [domain, requested.includes(domain)]));
    });
    return requested;
  }, [loadPyPSAMapBatch]);

  const handleAtlasOverlayDomainSelection = async (domain) => {
    const domainName = String(domain || 'Grid');
    const electricityNetworks = loadedPypsaNetworks.length
      ? loadedPypsaNetworks
      : (selectedPyPSAFile ? [{ filename: selectedPyPSAFile }] : []);
    const carrierIsAvailable = (carrier) => {
      if (carrier === 'electricity') return electricityNetworks.length > 0;
      if (carrier === 'gas') return Boolean(gasStatus?.available || gasLoadedDomains.Grid);
      if (carrier === 'water') return Boolean(waterStatus?.available || waterLoadedDomains.Grid);
      if (carrier === 'liquids') return Boolean(liquidsStatus?.available || liquidsLoadedDomains.Grid);
      if (carrier === 'logistics') return Boolean(logisticsStatus?.available || logisticsLoadedDomains.Grid);
      return false;
    };
    const carrierHasDomain = (carrier) => {
      if (carrier === 'electricity') {
        return electricityNetworks.length > 0 && electricityNetworks.every(
          (network) => pypsaLoadedDomainsByNetwork[network.filename]?.[domainName]
        );
      }
      if (carrier === 'gas') return Boolean(gasLoadedDomains[domainName]);
      if (carrier === 'water') return Boolean(waterLoadedDomains[domainName]);
      if (carrier === 'liquids') return Boolean(liquidsLoadedDomains[domainName]);
      if (carrier === 'logistics') return Boolean(logisticsLoadedDomains[domainName]);
      return false;
    };
    const activeCarriers = atlasOverlayCarriers.filter(carrierIsAvailable);
    if (!activeCarriers.length) return;
    const allLoaded = activeCarriers.every(carrierHasDomain);
    if (allLoaded && atlasDomainVisibility[domainName] !== false) {
      await setAtlasOverlayDomains([domainName], 'hide');
      return;
    }
    await setAtlasOverlayDomains([domainName], 'add');
  };

  const handleAtlasDomainSelection = async (domain) => {
    if (pypsaBatchRef.current) return;
    const domainName = String(domain || 'Grid');
    if (nohmWorkspaceContext?.mode === 'model' && nohmWorkspaceContext?.projectId) {
      if (!isModelSceneDomain(domainName)) {
        setGeographyLoadError('Demand is not yet projected from the canonical model scene.');
        return;
      }
      setGeographyLoadError('');
      setAtlasDomainVisibility((previous) => ({
        ...previous,
        [domainName]: previous[domainName] === false,
      }));
      return;
    }
    if (atlasOverlayMode) {
      try {
        await handleAtlasOverlayDomainSelection(domain);
      } catch (error) {
        if (error.name !== 'AbortError') setGeographyLoadError(error.message || 'Could not load the requested overlay layer.');
      }
      return;
    }
    if (atlasNetworkCarrier === 'gas') {
      await handleGasDomainSelection(domain);
      return;
    }
    if (atlasNetworkCarrier === 'water') {
      await handleWaterDomainSelection(domain);
      return;
    }
    if (atlasNetworkCarrier === 'liquids') {
      await handleLiquidsDomainSelection(domain);
      return;
    }
    if (atlasNetworkCarrier === 'logistics') {
      await handleLogisticsDomainSelection(domain);
      return;
    }
    const networks = loadedPypsaNetworks.length
      ? loadedPypsaNetworks
      : (selectedPyPSAFile ? [{ filename: selectedPyPSAFile }] : []);
    if (!networks.length || pypsaDomainLoading) return;

    const unloadedNetworks = networks.filter((network) => !pypsaLoadedDomainsByNetwork[network.filename]?.[domainName]);
    if (!unloadedNetworks.length) {
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: previous[domainName] === false }));
      return;
    }

    setPypsaDomainLoading(domainName);
    setGeographyLoadError('');
    try {
      await loadPyPSAMapBatch(unloadedNetworks, { mode: 'domains', domains: [domainName] });
      setAtlasDomainVisibility((previous) => ({ ...previous, [domainName]: true }));
    } catch (error) {
      if (error.name !== 'AbortError') setGeographyLoadError(`${error.message} The previous map has been kept.`);
    } finally {
      setPypsaDomainLoading('');
    }
  };

  useEffect(() => {
    if (fullEuOnly) return;
    setPypsaDeferredDetailLoad(false);
    setPypsaDetailHydrating(false);
    setPypsaComponentScope('full');
  }, [fullEuOnly]);

  useEffect(() => {
    if (!selectedPyPSAFile) return;
    if (!pypsaDeferredDetailLoad) return;
    if (pypsaLoading || pypsaDetailHydrating) return;

    const zoom = Number(mapViewState.zoom);
    const hasCountryFocus = Boolean((selectedPyPSACountryCode || '').trim());
    const hasUserFocus = Boolean(selectedNode);
    const hasRegionFocus = Boolean(
      regionCenter &&
      Number.isFinite(Number(regionCenter.lat)) &&
      Number.isFinite(Number(regionCenter.lon))
    );
    const zoomReady = Number.isFinite(zoom) && zoom >= 6;
    if (!hasUserFocus && !(hasCountryFocus && zoomReady) && !(hasRegionFocus && zoomReady)) return;

    let cancelled = false;
    const hydrate = async () => {
      setPypsaDetailHydrating(true);
      try {
        const activeGranularity = extractResolutionLabelFromName(selectedPyPSAFile) || pypsaGranularity;
        await loadPyPSANetworkFromFile(selectedPyPSAFile, activeGranularity, {
          forceDistill: true,
          componentScope: 'full',
        });
      } catch (err) {
        console.warn('Deferred full-detail hydration failed:', err);
      } finally {
        if (!cancelled) setPypsaDetailHydrating(false);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [
    selectedPyPSAFile,
    pypsaDeferredDetailLoad,
    pypsaLoading,
    pypsaDetailHydrating,
    mapViewState.zoom,
    selectedPyPSACountryCode,
    selectedNode,
    regionCenter,
    pypsaGranularity,
  ]);

  const countryCodeToName = useCallback((code) => {
    const countryNames = {
      AL: 'Albania',
      XK: 'Kosovo',
      AM: 'Armenia',
      AT: 'Austria',
      BA: 'Bosnia and Herzegovina',
      BE: 'Belgium',
      BG: 'Bulgaria',
      BY: 'Belarus',
      CH: 'Switzerland',
      CZ: 'Czechia',
      DE: 'Germany',
      DK: 'Denmark',
      EE: 'Estonia',
      ES: 'Spain',
      FI: 'Finland',
      FR: 'France',
      GB: 'Great Britain',
      GR: 'Greece',
      HR: 'Croatia',
      HU: 'Hungary',
      IE: 'Ireland',
      IT: 'Italy',
      LT: 'Lithuania',
      LU: 'Luxembourg',
      LV: 'Latvia',
      MD: 'Moldova',
      ME: 'Montenegro',
      MK: 'North Macedonia',
      MT: 'Malta',
      NL: 'Netherlands',
      NO: 'Norway',
      PL: 'Poland',
      PT: 'Portugal',
      RO: 'Romania',
      RS: 'Serbia',
      RU: 'Russia',
      SE: 'Sweden',
      SI: 'Slovenia',
      SK: 'Slovakia',
      TR: 'Turkey',
      UA: 'Ukraine',
      UK: 'United Kingdom',
    };

    return countryNames[(code || '').toUpperCase()] || code;
  }, []);

  const availableSolveNetworks = useMemo(() => {
    const excludedPrefixes = ['full', 'pypsa_generated', 'roundtrip'];
    const seenCountryCodes = new Set();

    return pypsaFiles
      .filter((file) => file.is_distill)
      .filter((file) => {
        const filename = file.filename || '';
        const lower = filename.toLowerCase();
        return !excludedPrefixes.some(prefix => lower === prefix || lower.startsWith(`${prefix}_`) || lower.includes(`/${prefix}`));
      })
      .map((file) => {
        const filename = file.filename || '';
        const countryCode = extractPypsaCountryCode(filename);
        if (!countryCode) return null;

        if (seenCountryCodes.has(countryCode)) return null;
        seenCountryCodes.add(countryCode);

        return {
          countryCode,
          countryName: countryCodeToName(countryCode),
          filename,
          isDistill: Boolean(file.is_distill),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  }, [pypsaFiles, countryCodeToName, extractPypsaCountryCode]);

  const primaryPypsaSourceEntries = useMemo(() => {
    const allEntries = Array.isArray(pypsaFiles) ? pypsaFiles : [];
    return allEntries.filter((entry) => {
      const filename = String(entry?.filename || '').trim();
      if (!filename) return false;
      if (entry?.is_distill) return true;
      return !filename.includes('/') && /\.nc$/i.test(filename);
    });
  }, [pypsaFiles]);

  const activePypsaCountryCode = useMemo(
    () => selectedPyPSACountryCode || '',
    [selectedPyPSACountryCode]
  );

  const availablePypsaCountryOptions = useMemo(() => {
    const countryCodes = new Set();
    primaryPypsaSourceEntries.forEach((entry) => {
      const declaredCode = String(entry?.geographic_country || entry?.full_country || '').trim().toUpperCase();
      const match = String(entry?.filename || '').trim().match(/^base_([A-Z]{2})(?:_c\d+|_(?:nuts[123]|bidding_zone|ehighway|full))?\.nc$/i);
      if (declaredCode) countryCodes.add(declaredCode);
      else if (match) countryCodes.add(match[1].toUpperCase());
    });
    return [...countryCodes]
      .map((countryCode) => ({ countryCode, countryName: countryCodeToName(countryCode) }))
      .sort((a, b) => a.countryName.localeCompare(b.countryName));
  }, [countryCodeToName, primaryPypsaSourceEntries]);

  const loadedPypsaCountryCodes = useMemo(
    () => loadedPypsaNetworks.map((network) => network.countryCode).filter(Boolean),
    [loadedPypsaNetworks]
  );
  const allPypsaCountriesSelected = availablePypsaCountryOptions.length > 0
    && loadedPypsaCountryCodes.length === availablePypsaCountryOptions.length;

  // In overlay mode the electricity Geography selection is the single source
  // of truth for every carrier. Keep the source datasets country-scoped as
  // well as filtering the final map records; this reduces transfer/rendering
  // cost and prevents a previously loaded all-Europe carrier leaking through.
  const atlasOverlayCountryCodes = useMemo(
    () => normalizeOverlayCountryCodes(loadedPypsaCountryCodes),
    [loadedPypsaCountryCodes]
  );
  const atlasOverlayCountryFilter = atlasOverlayCountryCodes.join(',');
  useEffect(() => { atlasOverlayCountryScopeRef.current = atlasOverlayCountryFilter; }, [atlasOverlayCountryFilter]);
  // Guard feedback belongs to the selection that caused it, not later filter
  // states. Do not auto-clear real load failures when unrelated filters change.
  useEffect(() => {
    setAtlasOverlayNotice(previous => previous?.kind === 'guard' || (previous?.scope && previous.scope !== atlasOverlayCountryFilter) ? null : previous);
  }, [atlasOverlayMode, atlasOverlayCarriers, atlasOverlayCountryFilter, atlasDomainVisibility, hiddenCarriers]);
  const atlasOverlayCountrySummary = useMemo(
    () => atlasOverlayCountryCodes.length
      ? atlasOverlayCountryCodes.map(countryCodeToName).join(' + ')
      : 'Choose countries',
    [atlasOverlayCountryCodes, countryCodeToName]
  );

  const activeLandCountryCodes = useMemo(() => {
    if (atlasOverlayMode || atlasNetworkCarrier === 'electricity') {
      return normalizeOverlayCountryCodes(loadedPypsaCountryCodes);
    }
    const selectedInfrastructureCountries = {
      gas: gasCountryFilter,
      water: waterCountryFilter,
      liquids: liquidsCountryFilter,
      logistics: logisticsCountryFilter,
    }[atlasNetworkCarrier];
    return normalizeOverlayCountryCodes(selectedInfrastructureCountries || []);
  }, [
    atlasNetworkCarrier,
    atlasOverlayMode,
    gasCountryFilter,
    liquidsCountryFilter,
    loadedPypsaCountryCodes,
    logisticsCountryFilter,
    waterCountryFilter,
  ]);
  const activeLandCountryKey = activeLandCountryCodes.join(',');

  // Land constraints follow the same Geography selection by default. Apart
  // from making the UI predictable, country-clipped tiles avoid rasterising
  // all of Europe while several infrastructure datasets are loading.
  useEffect(() => {
    if (!landOverlay.followMapCountries) return;
    setLandOverlayCached((previous) => {
      if ((previous.countries || []).join(',') === activeLandCountryKey) return previous;
      return { ...previous, countries: activeLandCountryCodes };
    });
  }, [activeLandCountryCodes, activeLandCountryKey, landOverlay.followMapCountries, setLandOverlayCached]);

  const gridAccessQuery = new URLSearchParams({
    sides: gridAccessOverlay.sides.join(','),
    metric: gridAccessOverlay.metric,
    project_scope: gridAccessOverlay.projectScope,
  });
  if (activeLandCountryKey) gridAccessQuery.set('countries', activeLandCountryKey);
  const { data: gridAccessData, loading: gridAccessLoading, error: gridAccessError, retry: retryGridAccess } = useGridAccessRecords({
    url: `${API_BASE}/api/atlas/grid-access/map?${gridAccessQuery}`,
    enabled: gridAccessOverlay.enabled,
    recoveryKey: gridAccessStatus?.available,
    onRecovered: () => setGridAccessStatus((previous) => previous?.available === false
      ? { ...previous, available: true, error: '' } : previous),
  });

  useEffect(() => {
    if (!atlasOverlayMode || !atlasOverlayCountryFilter) return;
    const jobs = [];
    const enqueue = (carrier, loadedDomains, loading, currentScope, loader) => {
      if (!atlasOverlayCarriers.includes(carrier) || loading || currentScope === atlasOverlayCountryFilter) return;
      const domains = ATLAS_MAP_DOMAINS.filter((domain) => loadedDomains?.[domain]);
      if (!domains.length) return; // The lazy carrier loader handles this case.
      if (atlasOverlayScopeAttemptsRef.current.get(carrier) === atlasOverlayCountryFilter) return;
      atlasOverlayScopeAttemptsRef.current.set(carrier, atlasOverlayCountryFilter);
      // Replacement releases Grid before fetching. If it fails, the lazy
      // initializer must not immediately retry the same scope as a new load.
      atlasOverlayLoadAttemptsRef.current.set(carrier, atlasOverlayCountryFilter);
      jobs.push(loader(domains, { replace: true, country: atlasOverlayCountryFilter, skipFocus: true }));
    };
    enqueue('gas', gasLoadedDomains, gasDomainLoading, gasDatasetCountryScopeRef.current, loadGasDomains);
    enqueue('water', waterLoadedDomains, waterDomainLoading, waterDatasetCountryScopeRef.current, loadWaterDomains);
    enqueue('liquids', liquidsLoadedDomains, liquidsDomainLoading, liquidsDatasetCountryScopeRef.current, loadLiquidsDomains);
    enqueue('logistics', logisticsLoadedDomains, logisticsDomainLoading, logisticsDatasetCountryScopeRef.current, loadLogisticsDomains);
    if (jobs.length) {
      Promise.allSettled(jobs).then((results) => {
        if (atlasOverlayModeRef.current && atlasOverlayCountryScopeRef.current === atlasOverlayCountryFilter && results.some((result) => result.status === 'rejected')) {
          setAtlasOverlayNotice({ kind: 'load', scope: atlasOverlayCountryFilter, message: `Some carrier data could not be filtered to ${atlasOverlayCountrySummary}.` });
        }
      });
    }
  }, [
    atlasOverlayMode,
    atlasOverlayCarriers,
    atlasOverlayCountryFilter,
    atlasOverlayCountrySummary,
    gasLoadedDomains,
    gasDomainLoading,
    loadGasDomains,
    waterLoadedDomains,
    waterDomainLoading,
    loadWaterDomains,
    liquidsLoadedDomains,
    liquidsDomainLoading,
    loadLiquidsDomains,
    logisticsLoadedDomains,
    logisticsDomainLoading,
    loadLogisticsDomains,
  ]);

  const loadedCountrySummary = useMemo(() => {
    const names = loadedPypsaNetworks.map((network) => network.countryName || network.countryCode);
    return names.length ? names.join(' + ') : 'No countries loaded';
  }, [loadedPypsaNetworks]);

  const cachedNetworkLevels = useMemo(() => {
    if (!activePypsaCountryCode) return [];
    const clusteredPattern = new RegExp(`^base_${activePypsaCountryCode}_c(\\d+)\\.nc$`, 'i');
    const fullPattern = new RegExp(`^base_${activePypsaCountryCode}\\.nc$`, 'i');
    const levels = [];

    primaryPypsaSourceEntries.forEach((entry) => {
      const filename = String(entry?.filename || '').trim();
      const geographicCountry = String(entry?.geographic_country || '').trim().toUpperCase();
      const geographicLevel = String(entry?.geographic_level || '').trim().toLowerCase();
      const fullCountry = String(entry?.full_country || '').trim().toUpperCase();
      if (entry?.is_full_nodal_network && fullCountry === activePypsaCountryCode) {
        levels.push({
          filename,
          accessNodes: Number.POSITIVE_INFINITY,
          label: 'Full / Nodal / 220 kV',
          sortOrder: Number.MAX_SAFE_INTEGER,
          isGeographic: false,
          isFull: true,
          isFullNodal: true,
        });
        return;
      }
      if (entry?.is_geographic_cluster && geographicCountry === activePypsaCountryCode && geographicLevel) {
        const labels = {
          bidding_zone: 'Bidding zone',
          ehighway: 'e-Highway',
          nuts1: 'NUTS1',
          nuts2: 'NUTS2',
          nuts3: 'NUTS3',
        };
        const order = { bidding_zone: 10, ehighway: 20, nuts1: 30, nuts2: 40, nuts3: 50 };
        levels.push({
          filename,
          accessNodes: Number(entry?.physical_cluster_buses || entry?.geographic_clusters || 0),
          geographicClusters: Number(entry?.geographic_clusters || 0),
          geographicLevel,
          label: labels[geographicLevel] || geographicLevel,
          sortOrder: order[geographicLevel] || 60,
          isGeographic: true,
          isFull: false,
        });
        return;
      }
      const clusteredMatch = filename.match(clusteredPattern);
      if (clusteredMatch) {
        const accessNodes = Number(clusteredMatch[1]);
        levels.push({
          filename,
          accessNodes,
          label: `${accessNodes}`,
          sortOrder: 100 + accessNodes,
          isGeographic: false,
          isFull: false,
        });
      } else if (fullPattern.test(filename)) {
        levels.push({
          filename,
          accessNodes: Number.POSITIVE_INFINITY,
          label: 'Full / Nodal / 220 kV',
          sortOrder: Number.MAX_SAFE_INTEGER,
          isGeographic: false,
          isFull: true,
          isFullNodal: true,
        });
      }
    });

    return levels.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [activePypsaCountryCode, primaryPypsaSourceEntries]);

  const selectedCachedNetworkIndex = useMemo(() => {
    if (!cachedNetworkLevels.length) return 0;
    const selectedIndex = cachedNetworkLevels.findIndex(
      (level) => level.filename === selectedPypsaListFile
    );
    return selectedIndex >= 0 ? selectedIndex : cachedNetworkLevels.length - 1;
  }, [cachedNetworkLevels, selectedPypsaListFile]);

  const selectedCachedNetworkLevel = cachedNetworkLevels[selectedCachedNetworkIndex] || null;
  const displayedCachedNetworkIndex = Number.isInteger(networkResolutionDraftIndex)
    && networkResolutionDraftIndex >= 0
    && networkResolutionDraftIndex < cachedNetworkLevels.length
    ? networkResolutionDraftIndex
    : selectedCachedNetworkIndex;
  const displayedCachedNetworkLevel = cachedNetworkLevels[displayedCachedNetworkIndex] || selectedCachedNetworkLevel;
  const networkResolutionSelectionPending = Boolean(
    cachedNetworkLevels.length
    && displayedCachedNetworkIndex !== selectedCachedNetworkIndex
  );

  useEffect(() => {
    if (!pypsaResolutionSwitching) setNetworkResolutionDraftIndex(selectedCachedNetworkIndex);
  }, [cachedNetworkLevels.length, pypsaResolutionSwitching, selectedCachedNetworkIndex]);

  const loadCachedNetworkLevel = useCallback(async (index) => {
    const level = cachedNetworkLevels[index];
    if (!level || pypsaLoading || pypsaResolutionSwitching) return;

    const countries = loadedPypsaNetworks.length
      ? loadedPypsaNetworks.map((network) => network.countryCode).filter(Boolean)
      : [activePypsaCountryCode].filter(Boolean);
    const targetEntries = countries.map((countryCode) => {
      const normalizedCode = String(countryCode || '').trim().toUpperCase();
      if (level.isFullNodal) {
        return primaryPypsaSourceEntries.find((entry) => (
          entry?.is_full_nodal_network
          && String(entry?.full_country || '').trim().toUpperCase() === normalizedCode
        ));
      }
      if (level.isGeographic) {
        return primaryPypsaSourceEntries.find((entry) => (
          entry?.is_geographic_cluster
          && String(entry?.geographic_country || '').trim().toUpperCase() === normalizedCode
          && String(entry?.geographic_level || '').trim().toLowerCase() === level.geographicLevel
        ));
      }
      if (!level.isFull && Number.isFinite(Number(level.accessNodes))) {
        const candidate = `base_${normalizedCode}_c${String(Number(level.accessNodes)).padStart(3, '0')}.nc`.toLowerCase();
        return primaryPypsaSourceEntries.find(
          (entry) => String(entry?.filename || '').trim().toLowerCase() === candidate
        );
      }
      return primaryPypsaSourceEntries.find((entry) => (
        String(entry?.filename || '').trim().toLowerCase() === `base_${normalizedCode}.nc`.toLowerCase()
      ));
    });
    const missingCountries = countries.filter((_, countryIndex) => !targetEntries[countryIndex]);
    if (missingCountries.length) {
      const message = `The ${level.label} cache is unavailable for ${missingCountries.map(countryCodeToName).join(', ')}.`;
      setGeographyLoadError(message);
      throw new Error(message);
    }

    const activeCountryBeforeSwitch = activePypsaCountryCode || countries[0] || '';
    try {
      await loadPyPSAMapBatch(targetEntries, {
        activeCountry: activeCountryBeforeSwitch,
        domains: ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false),
      });
      if (!level.isFull && !level.isGeographic) {
        setPypsaSettings((previous) => ({ ...previous, clusters: level.accessNodes }));
      }
      return targetEntries;
    } catch (error) {
      if (error.name === 'AbortError') return null;
      console.error('Could not switch cached PyPSA network level:', error);
      return null;
    }
  }, [
    activePypsaCountryCode,
    cachedNetworkLevels,
    countryCodeToName,
    loadPyPSAMapBatch,
    atlasDomainVisibility,
    loadedPypsaNetworks,
    primaryPypsaSourceEntries,
    pypsaGranularity,
    pypsaLoading,
    pypsaResolutionSwitching,
  ]);

  const commitCachedNetworkLevel = useCallback(async (index) => {
    const normalizedIndex = Math.max(0, Math.min(cachedNetworkLevels.length - 1, Number(index)));
    if (!Number.isInteger(normalizedIndex) || !cachedNetworkLevels[normalizedIndex]) return null;
    if (networkResolutionCommitTimerRef.current) {
      window.clearTimeout(networkResolutionCommitTimerRef.current);
      networkResolutionCommitTimerRef.current = null;
    }
    setNetworkResolutionDraftIndex(normalizedIndex);
    const result = await loadCachedNetworkLevel(normalizedIndex);
    if (!result && !pypsaBatchRef.current) setNetworkResolutionDraftIndex(selectedCachedNetworkIndex);
    return result;
  }, [cachedNetworkLevels, loadCachedNetworkLevel, selectedCachedNetworkIndex]);

  const previewCachedNetworkLevel = useCallback((index) => {
    const normalizedIndex = Math.max(0, Math.min(cachedNetworkLevels.length - 1, Number(index)));
    if (!Number.isInteger(normalizedIndex) || !cachedNetworkLevels[normalizedIndex]) return;
    setNetworkResolutionDraftIndex(normalizedIndex);
    if (networkResolutionCommitTimerRef.current) window.clearTimeout(networkResolutionCommitTimerRef.current);
    if (normalizedIndex === selectedCachedNetworkIndex) {
      networkResolutionCommitTimerRef.current = null;
      return;
    }
    networkResolutionCommitTimerRef.current = window.setTimeout(() => {
      networkResolutionCommitTimerRef.current = null;
      commitCachedNetworkLevel(normalizedIndex);
    }, 180);
  }, [cachedNetworkLevels, commitCachedNetworkLevel, selectedCachedNetworkIndex]);

  const addCountryNetwork = useCallback(async (countryCode) => {
    const normalizedCode = String(countryCode || '').trim().toUpperCase();
    if (!normalizedCode || pypsaLoading || pypsaBatchRef.current) return;
    setGeographyLoadError('');
    setCountryDropdownValue(normalizedCode);

    if (loadedPypsaCountryCodes.includes(normalizedCode)) {
      setSelectedPyPSACountryCode(normalizedCode);
      setCountryDropdownValue('');
      return;
    }

    const preferredNodes = selectedCachedNetworkLevel && !selectedCachedNetworkLevel.isFull && !selectedCachedNetworkLevel.isGeographic
      ? Number(selectedCachedNetworkLevel.accessNodes)
      : null;
    const preferredGeographicLevel = selectedCachedNetworkLevel?.isGeographic
      ? selectedCachedNetworkLevel.geographicLevel
      : '';
    const preferredFullNodal = Boolean(selectedCachedNetworkLevel?.isFullNodal);
    const candidateNames = [
      preferredFullNodal ? `base_${normalizedCode}_full.nc` : null,
      preferredGeographicLevel ? `base_${normalizedCode}_${preferredGeographicLevel}.nc` : null,
      Number.isFinite(preferredNodes)
        ? `base_${normalizedCode}_c${String(preferredNodes).padStart(3, '0')}.nc`
        : null,
      `base_${normalizedCode}_nuts3.nc`,
      `base_${normalizedCode}_full.nc`,
      `base_${normalizedCode}.nc`,
    ].filter(Boolean);
    const entry = candidateNames
      .map((candidate) => primaryPypsaSourceEntries.find(
        (item) => String(item?.filename || '').trim().toLowerCase() === candidate.toLowerCase()
      ))
      .find(Boolean);

    if (!entry) {
      setGeographyLoadError(`No local PyPSA cache is available for ${countryCodeToName(normalizedCode)}.`);
      setCountryDropdownValue('');
      return;
    }

    try {
      const shouldAppend = loadedPypsaNetworks.length > 0;
      await loadPyPSAMapBatch([entry], {
        mode: shouldAppend ? 'add' : 'replace', activeCountry: normalizedCode, focus: true,
        domains: shouldAppend ? ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false) : ['Grid'],
      });
      const nextNetworks = [
        ...loadedPypsaNetworks.filter((network) => network.countryCode !== normalizedCode),
        { countryCode: normalizedCode, countryName: countryCodeToName(normalizedCode), filename: entry.filename },
      ];
      setSelectedPyPSACountryCode(normalizedCode);
      setPypsaSettings((previous) => ({
        ...previous,
        region: nextNetworks.map((network) => network.countryName).join(' + '),
      }));
    } catch (error) {
      if (error.name === 'AbortError') return;
      setGeographyLoadError(error.message || `Could not load ${countryCodeToName(normalizedCode)}.`);
    } finally {
      setCountryDropdownValue('');
    }
  }, [
    countryCodeToName,
    loadPyPSAMapBatch,
    atlasDomainVisibility,
    loadedPypsaCountryCodes,
    loadedPypsaNetworks,
    primaryPypsaSourceEntries,
    pypsaGranularity,
    pypsaLoading,
    selectedCachedNetworkLevel,
  ]);

  const removeCountryNetwork = useCallback((countryCode) => {
    if (pypsaBatchRef.current) return;
    setMixedGranularityPlan(null);
    const normalizedCode = String(countryCode || '').trim().toUpperCase();
    const nextNetworks = loadedPypsaNetworks.filter((network) => network.countryCode !== normalizedCode);
    // Co-located groups can span source-country datasets at border buses.
    // Rebuild them so retained nodes cannot keep removed records alive.
    const nextFacilities = groupPypsaFacilities(pypsaFacilitiesDataRef.current.filter(
      (facility) => facility.sourceCountryCode !== normalizedCode
    ));
    const nextConnections = stitchElectricityCrossBorderConnections(
      pypsaConnectionsRef.current.filter(
        (connection) => connection.sourceCountryCode !== normalizedCode
      ),
      nextFacilities,
      electricityCrossBorderTopology.records,
      nextNetworks,
    );
    const nextOverlays = pypsaGeoJsonOverlaysRef.current.filter(
      (overlay) => overlay.sourceCountryCode !== normalizedCode
    );

    pypsaFacilitiesDataRef.current = nextFacilities;
    pypsaConnectionsRef.current = nextConnections;
    pypsaGeoJsonOverlaysRef.current = nextOverlays;
    setPypsaFacilitiesData(nextFacilities);
    setPypsaConnections(nextConnections);
    setPypsaGeoJsonOverlays(nextOverlays);
    setLoadedPypsaNetworks(nextNetworks);
    setPypsaLoadedDomainsByNetwork((previous) => {
      const next = { ...previous };
      loadedPypsaNetworks
        .filter((network) => network.countryCode === normalizedCode)
        .forEach((network) => { delete next[network.filename]; });
      return next;
    });
    setPypsaDatasetMeta({
      filename: nextNetworks.map((network) => network.filename).join(', '),
      sourceBusCount: nextFacilities.filter((facility) => (
        !facility?.is_virtual && String(facility?.component_type || '').toLowerCase() === 'bus'
      )).length,
    });
    const nextActive = nextNetworks[nextNetworks.length - 1] || null;
    setSelectedPyPSACountryCode(nextActive?.countryCode || '');
    setSelectedPyPSAFile(nextActive?.filename || '');
    setSelectedPypsaListFile(nextActive?.filename || '');
    setPypsaSettings((previous) => ({
      ...previous,
      region: nextNetworks.length
        ? nextNetworks.map((network) => network.countryName).join(' + ')
        : '',
    }));
  }, [loadedPypsaNetworks]);

  const activateCountryNetwork = useCallback((network) => {
    if (pypsaBatchRef.current) return;
    const countryCode = String(network?.countryCode || '').trim().toUpperCase();
    if (!countryCode) return;
    setSelectedPyPSACountryCode(countryCode);
    setSelectedPyPSAFile(network?.filename || '');
    setSelectedPypsaListFile(network?.filename || '');

    // Fit the geographic footprint, not a guessed zoom from node centroids.
    // A one-bus bidding zone still represents a whole country; long countries
    // such as Italy must fit vertically as well as horizontally on a laptop.
    setEmilFocusLocation(null);
    setEmilViewportCommand({
      id: Date.now() + Math.random(),
      operation: 'fit_targets',
      countryCodes: [countryCode],
    });
  }, [pypsaDeferredDetailLoad]);

  const findAtlasCountryNetworkEntry = useCallback((countryCode, resolutionKey = '') => {
    const normalizedCode = String(countryCode || '').trim().toUpperCase();
    const requestedResolution = String(resolutionKey || '').trim().toLowerCase();
    const synchronousEntries = primaryPypsaSourceEntries.length
      ? primaryPypsaSourceEntries
      : (Array.isArray(pypsaFilesRef.current) ? pypsaFilesRef.current : []).filter((entry) => {
          const filename = String(entry?.filename || '').trim();
          return filename && (entry?.is_distill || (!filename.includes('/') && /\.nc$/i.test(filename)));
        });
    return synchronousEntries.find((entry) => {
      const entryCountry = String(entry?.geographic_country || entry?.full_country || '').trim().toUpperCase();
      if (entryCountry !== normalizedCode) return false;
      if (!requestedResolution) return false;
      return atlasResolutionKeyForEntry(entry) === requestedResolution;
    }) || null;
  }, [primaryPypsaSourceEntries]);

  const currentAtlasResolutionKey = useMemo(() => (
    mixedGranularityPlan ? 'mixed' : selectedCachedNetworkLevel ? atlasResolutionKeyForEntry(selectedCachedNetworkLevel) : ''
  ), [mixedGranularityPlan, selectedCachedNetworkLevel]);

  const applyMixedGranularityView = useCallback(async (focusCountryCode, levels = {}) => {
    if (pypsaLoading || pypsaBatchRef.current) return null;
    const availableCodes = availablePypsaCountryOptions.map((option) => option.countryCode);
    const plan = buildMixedGranularityPlan(focusCountryCode, availableCodes, levels);
    const entries = plan.countries.map(({ countryCode, resolution }) => {
      const entry = findAtlasCountryNetworkEntry(countryCode, resolution);
      if (!entry) {
        throw new Error(`${ATLAS_RESOLUTION_LABELS[resolution] || resolution} is not cached for ${countryCodeToName(countryCode)}.`);
      }
      return entry;
    });
    const domains = ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false);
    try {
      await loadPyPSAMapBatch(entries, {
        mode: 'replace',
        activeCountry: plan.focusCode,
        focus: true,
        domains: domains.length ? domains : ['Grid'],
        resolutionPlan: plan,
      });
      setFullEuOnly(false);
      setHiddenCarriers(new Set());
      setPypsaSettings((previous) => ({
        ...previous,
        region: plan.countries.map(({ countryCode }) => countryCodeToName(countryCode)).join(' + '),
      }));
      return { ...plan, entries };
    } catch (error) {
      if (error.name !== 'AbortError') setGeographyLoadError(error.message || 'Could not build the mixed-granularity view.');
      throw error;
    }
  }, [
    atlasDomainVisibility,
    availablePypsaCountryOptions,
    countryCodeToName,
    findAtlasCountryNetworkEntry,
    loadPyPSAMapBatch,
    pypsaLoading,
  ]);

  const setAtlasResolutionFromAgent = useCallback(async (resolutionKey) => {
    const normalized = String(resolutionKey || '').trim().toLowerCase();
    const targetIndex = cachedNetworkLevels.findIndex((level) => (
      level.isFullNodal ? normalized === 'full' : level.geographicLevel === normalized
    ));
    if (targetIndex < 0) {
      throw new Error(`${ATLAS_RESOLUTION_LABELS[normalized] || normalized} is not cached for the selected country.`);
    }
    const entries = targetIndex !== selectedCachedNetworkIndex
      ? await loadCachedNetworkLevel(targetIndex)
      : loadedPypsaNetworks.map((network) => ({ filename: network.filename }));
    if (!entries) throw new Error(`Could not switch to ${ATLAS_RESOLUTION_LABELS[normalized] || normalized}.`);
    return { ...cachedNetworkLevels[targetIndex], entries };
  }, [cachedNetworkLevels, loadCachedNetworkLevel, loadedPypsaNetworks, selectedCachedNetworkIndex]);

  const stepAtlasResolutionFromAgent = useCallback(async (direction) => {
    if (!cachedNetworkLevels.length) throw new Error('Load a country network first.');
    const delta = Number(direction) < 0 ? -1 : 1;
    const targetIndex = Math.max(
      0,
      Math.min(cachedNetworkLevels.length - 1, selectedCachedNetworkIndex + delta),
    );
    if (targetIndex === selectedCachedNetworkIndex) {
      return {
        changed: false,
        level: {
          ...cachedNetworkLevels[targetIndex],
          entries: loadedPypsaNetworks.map((network) => ({ filename: network.filename })),
        },
      };
    }
    const entries = await loadCachedNetworkLevel(targetIndex);
    if (!entries) throw new Error(`Could not switch to ${cachedNetworkLevels[targetIndex].label}.`);
    return { changed: true, level: { ...cachedNetworkLevels[targetIndex], entries } };
  }, [cachedNetworkLevels, loadCachedNetworkLevel, loadedPypsaNetworks, selectedCachedNetworkIndex]);

  const loadAtlasCountriesFromAgent = useCallback(async (countryCodes, options = {}) => {
    const codes = [...new Set((countryCodes || []).map((code) => String(code || '').trim().toUpperCase()).filter(Boolean))];
    if (!codes.length) throw new Error('No country was provided.');
    const mode = options.mode === 'add' ? 'add' : 'replace';
    const resolutionKey = String(
      options.resolution
      || (currentAtlasResolutionKey === 'mixed' ? mixedGranularityPlan?.levels?.adjacent : currentAtlasResolutionKey)
      || 'nuts3'
    ).trim().toLowerCase();
    const membership = pypsaMapMembershipRef.current;
    // Adding countries at a new resolution is one transaction across the final
    // selection, not a resolution update followed by a second country load.
    const replaceSelection = mode === 'replace' || Boolean(options.resolution);
    const targetCodes = mode === 'add' && replaceSelection
      ? [...new Set([...membership.networks.map((network) => network.countryCode), ...codes])]
      : codes;
    const entries = targetCodes.map((countryCode) => {
      const entry = findAtlasCountryNetworkEntry(countryCode, resolutionKey);
      if (!entry) {
        throw new Error(`${ATLAS_RESOLUTION_LABELS[resolutionKey] || resolutionKey} is not cached for ${countryCodeToName(countryCode)}.`);
      }
      return entry;
    });

    const currentDomains = ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false);
    const explicitLayers = Array.isArray(options.domains) && options.domains.length > 0;
    const requestedDomains = (options.domains || []).filter((domain) => ATLAS_MAP_DOMAINS.includes(domain));
    const domains = !explicitLayers ? (mode === 'add' ? currentDomains : ['Grid'])
      : options.layerMode === 'hide' ? currentDomains.filter((domain) => !requestedDomains.includes(domain))
      : options.layerMode === 'add' ? [...new Set([...currentDomains, ...requestedDomains])]
      : requestedDomains;
    const finalCode = codes[codes.length - 1];
    await loadPyPSAMapBatch(entries, {
      mode: replaceSelection ? 'replace' : 'add', activeCountry: finalCode, focus: aiMapControlEnabled,
      domains,
    });
    setFullEuOnly(false);
    setAtlasDomainVisibility(Object.fromEntries(ATLAS_MAP_DOMAINS.map((domain) => [domain, domains.includes(domain)])));
    if (mode === 'replace') {
      setHiddenCarriers(new Set());
    }
    setPypsaSettings((previous) => ({
      ...previous,
      region: pypsaMapMembershipRef.current.networks.map((network) => network.countryName || countryCodeToName(network.countryCode)).join(' + '),
    }));
    return { entries, resolutionKey };
  }, [
    countryCodeToName,
    currentAtlasResolutionKey,
    mixedGranularityPlan,
    findAtlasCountryNetworkEntry,
    loadPyPSAMapBatch,
    atlasDomainVisibility,
    aiMapControlEnabled,
    loadedPypsaNetworks,
    pypsaGranularity,
  ]);

  const selectAllCountryNetworks = useCallback(async () => {
    if (pypsaLoading || pypsaBatchRef.current || !availablePypsaCountryOptions.length
        || allPypsaCountriesSelected) return;
    const countryCodes = availablePypsaCountryOptions.map((option) => option.countryCode);
    const resolution = currentAtlasResolutionKey === 'mixed'
      ? mixedGranularityPlan?.levels?.adjacent || 'bidding_zone'
      : currentAtlasResolutionKey || 'bidding_zone';
    setGeographyLoadError('');
    setSelectingAllCountries(true);
    try {
      await loadAtlasCountriesFromAgent(countryCodes, {
        mode: 'replace',
        resolution,
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        setGeographyLoadError(error.message || 'Could not load all country networks.');
      }
    } finally {
      setSelectingAllCountries(false);
    }
  }, [
    allPypsaCountriesSelected,
    availablePypsaCountryOptions,
    currentAtlasResolutionKey,
    loadAtlasCountriesFromAgent,
    mixedGranularityPlan,
    pypsaLoading,
  ]);

  const setAtlasDomainsFromAgent = useCallback(async (domains, mode = 'replace', networkOverride = null) => {
    if (pypsaBatchRef.current && !(atlasOverlayModeRef.current && mode === 'hide')) throw new Error('A network update is already in progress. Wait for it or cancel it first.');
    const requestedLayers = [...new Set((domains || []).filter((layer) => ATLAS_AGENT_MAP_LAYERS.includes(layer)))];
    const requested = requestedLayers.filter((domain) => ATLAS_MAP_DOMAINS.includes(domain));
    const accessRequested = requestedLayers.includes('Access');
    if (!requestedLayers.length) throw new Error('No valid Atlas layer was provided.');
    const isOverlay = atlasOverlayModeRef.current;
    // Preserve the independent Access overlay if a requested source fails.
    // Commit its replace/add/hide state only after shared domain hydration.
    if (isOverlay && requested.length) await setAtlasOverlayDomains(requested, mode);
    if (accessRequested && mode !== 'hide') focusAtlasPanel('access');

    // Grid Access is an independent evidence overlay, but it participates in
    // the same agent single-select/add/hide contract as the component layers.
    if (mode === 'replace') {
      setGridAccessOverlay((previous) => ({
        ...previous,
        enabled: accessRequested,
        panelOpen: accessRequested,
      }));
    } else if (accessRequested) {
      setGridAccessOverlay((previous) => ({
        ...previous,
        enabled: mode !== 'hide',
        panelOpen: mode !== 'hide',
      }));
    }

    if (!requested.length) {
      if (mode === 'replace') {
        if (atlasOverlayModeRef.current) await setAtlasOverlayDomains(ATLAS_MAP_DOMAINS, 'hide');
        else setAtlasDomainVisibility(ATLAS_MAP_DOMAINS.reduce(
          (next, domain) => ({ ...next, [domain]: false }), {},
        ));
      }
      return requestedLayers;
    }
    if (isOverlay) return requestedLayers;
    if (atlasNetworkCarrierRef.current === 'gas') {
      const selected = await setGasDomainsFromAgent(requested, mode);
      return [...selected, ...(accessRequested ? ['Access'] : [])];
    }
    if (atlasNetworkCarrierRef.current === 'water') {
      const selected = await setWaterDomainsFromAgent(requested, mode);
      return [...selected, ...(accessRequested ? ['Access'] : [])];
    }
    if (atlasNetworkCarrierRef.current === 'liquids') {
      const selected = await setLiquidsDomainsFromAgent(requested, mode);
      return [...selected, ...(accessRequested ? ['Access'] : [])];
    }
    if (atlasNetworkCarrierRef.current === 'logistics') {
      const selected = await setLogisticsDomainsFromAgent(requested, mode);
      return [...selected, ...(accessRequested ? ['Access'] : [])];
    }
    const hasNetworkOverride = Array.isArray(networkOverride) && networkOverride.length > 0;
    const networks = hasNetworkOverride
      ? networkOverride
      : (loadedPypsaNetworks.length
        ? loadedPypsaNetworks
        : (selectedPyPSAFile ? [{ filename: selectedPyPSAFile }] : []));
    if (!networks.length) throw new Error('Load a country network first.');

    if (mode !== 'hide') {
      setPypsaDomainLoading(requested[0]);
      try {
        // Use the committed membership/loaded-domain flags, including when an
        // agent's preceding action just replaced geography in the same turn.
        await loadPyPSAMapBatch(networks, { mode: 'domains', domains: requested });
      } finally {
        setPypsaDomainLoading('');
      }
    }

    setAtlasDomainVisibility((previous) => {
      if (mode === 'hide') {
        return requested.reduce((next, domain) => ({ ...next, [domain]: false }), { ...previous });
      }
      if (mode === 'add') {
        return requested.reduce((next, domain) => ({ ...next, [domain]: true }), { ...previous });
      }
      return ATLAS_MAP_DOMAINS.reduce(
        (next, domain) => ({ ...next, [domain]: requested.includes(domain) }),
        {},
      );
    });
    return [...requested, ...(accessRequested ? ['Access'] : [])];
  }, [
    atlasNetworkCarrier,
    loadedPypsaNetworks,
    loadPyPSAMapBatch,
    pypsaGranularity,
    pypsaLoadedDomainsByNetwork,
    selectedPyPSAFile,
    setGasDomainsFromAgent,
    setWaterDomainsFromAgent,
    setLiquidsDomainsFromAgent,
    setLogisticsDomainsFromAgent,
    setAtlasOverlayDomains,
    focusAtlasPanel,
  ]);

  const removeAtlasCountriesFromAgent = useCallback((countryCodes) => {
    if (pypsaBatchRef.current) throw new Error('A network update is already in progress. Wait for it or cancel it first.');
    const removals = new Set((countryCodes || []).map((code) => String(code || '').trim().toUpperCase()));
    const nextNetworks = loadedPypsaNetworks.filter((network) => !removals.has(network.countryCode));
    const nextFacilities = groupPypsaFacilities(pypsaFacilitiesDataRef.current.filter(
      (facility) => !removals.has(String(facility.sourceCountryCode || '').toUpperCase())
    ));
    const nextConnections = stitchElectricityCrossBorderConnections(
      pypsaConnectionsRef.current.filter(
        (connection) => !removals.has(String(connection.sourceCountryCode || '').toUpperCase())
      ),
      nextFacilities,
      electricityCrossBorderTopology.records,
      nextNetworks,
    );
    const nextOverlays = pypsaGeoJsonOverlaysRef.current.filter(
      (overlay) => !removals.has(String(overlay.sourceCountryCode || '').toUpperCase())
    );
    pypsaFacilitiesDataRef.current = nextFacilities;
    pypsaConnectionsRef.current = nextConnections;
    pypsaGeoJsonOverlaysRef.current = nextOverlays;
    setPypsaFacilitiesData(nextFacilities);
    setPypsaConnections(nextConnections);
    setPypsaGeoJsonOverlays(nextOverlays);
    setLoadedPypsaNetworks(nextNetworks);
    setPypsaLoadedDomainsByNetwork((previous) => {
      const next = { ...previous };
      loadedPypsaNetworks.filter((network) => removals.has(network.countryCode)).forEach(
        (network) => { delete next[network.filename]; }
      );
      return next;
    });
    const nextActive = nextNetworks[nextNetworks.length - 1] || null;
    setSelectedPyPSACountryCode(nextActive?.countryCode || '');
    setSelectedPyPSAFile(nextActive?.filename || '');
    setSelectedPypsaListFile(nextActive?.filename || '');
    setPypsaDatasetMeta({
      filename: nextNetworks.map((network) => network.filename).join(', '),
      sourceBusCount: nextFacilities.filter((facility) => (
        !facility?.is_virtual && String(facility?.component_type || '').toLowerCase() === 'bus'
      )).length,
    });
    setPypsaSettings((previous) => ({
      ...previous,
      region: nextNetworks.map((network) => network.countryName || network.countryCode).join(' + '),
    }));
  }, [loadedPypsaNetworks]);

  const executeAtlasDirectAction = useCallback(async (action, pushReply) => {
    if (!action) return false;
    // The exit workspace is not the overlay's active control scope. Shared
    // Geography and power resolution must follow the visible overlay controls.
    const requestedNetworkCarrier = String(action.networkCarrier || (atlasOverlayModeRef.current
      ? 'overlay' : atlasNetworkCarrierRef.current) || 'electricity').toLowerCase();
    const isGasAction = requestedNetworkCarrier === 'gas';
    const isWaterAction = requestedNetworkCarrier === 'water';
    const isLiquidsAction = requestedNetworkCarrier === 'liquids';
    const isLogisticsAction = requestedNetworkCarrier === 'logistics';
    const isInfrastructureAction = isGasAction || isWaterAction || isLiquidsAction || isLogisticsAction;
    const infrastructureLabel = isGasAction ? 'methane' : isWaterAction ? 'water' : isLiquidsAction ? 'oil and liquids' : 'ports and air freight';
    const layerAvailabilityNote = (domains, mode = 'replace') => {
      // Overlay coverage is reported per carrier by the map legend. A single
      // power-cache inventory cannot establish absence across other sources.
      if (mode === 'hide' || atlasOverlayModeRef.current) return '';
      const activeFacilities = isGasAction
        ? gasFacilitiesData
        : isWaterAction
          ? waterFacilitiesData
          : isLiquidsAction
            ? liquidsFacilitiesData
            : isLogisticsAction
              ? logisticsFacilitiesData
          : pypsaFacilitiesDataRef.current;
      const emptyDomains = (domains || []).filter((domain) => (
        domain !== 'Grid'
        && !activeFacilities.some((facility) => (
          (facility.atlas_domain || classifyAtlasMapDomain(facility)) === domain
        ))
      ));
      return emptyDomains.length
        ? ` ${emptyDomains.join(' and ')} ${emptyDomains.length === 1 ? 'is' : 'are'} enabled, but the selected caches contain no ${emptyDomains.join(' or ')} components.`
        : '';
    };
    switch (action.type) {
      case 'compound': {
        const replies = [];
        for (const childAction of action.actions || []) {
          await executeAtlasDirectAction(childAction, (reply) => replies.push(reply));
        }
        if (replies.length) pushReply(replies.join(' '));
        return true;
      }
      case 'capabilities': {
        if (action.topic === 'settings') {
          if (isInfrastructureAction) {
            pushReply(`More Settings configures electricity builds and solves, so it is not available in the ${infrastructureLabel} Atlas. I can still change its country, navigate to places, and control Grid, Supply, Demand, and Storage.`);
          } else {
            pushReply([
              'I can change every exposed build setting under More Settings:',
              '• Network detail — clusters, cross-border links, grid expansion, and offshore grid',
              '• Technologies and sectors — include/exclude technologies, heat, hydrogen, transport, and industry',
              '• Expansion, policy, and costs — capacity limits, reserve margin, prices, CO₂ cap, and renewable target',
              '• Solver — solver, algorithm, threads, time limit, MIP gap, commitment, ramps, curtailment, and shedding',
              'You can combine changes, e.g. “use HiPO, 12 threads, a 1800 second time limit, and disable unit commitment”.',
            ].join('\n'));
          }
        } else {
          pushReply(`I can control electricity, methane, water, oil/liquids, and ports/air-freight Atlas workspaces, including infrastructure country filtering, Grid/Supply/Demand/Storage, and the independent Land & Constraints siting overlay.\n${ATLAS_AGENT_CAPABILITY_SECTIONS.map((section) => `• ${section.label} — ${section.controls}`).join('\n')}`);
        }
        return true;
      }
      case 'map_view': {
        if (!aiMapControlEnabled) {
          pushReply('AI map control is off. Turn on “AI controls map” in EMIL to let me change the viewport.');
          return true;
        }
        const operation = String(action.operation || '').toLowerCase();
        const steps = Math.max(1, Math.min(4, Math.round(Number(action.steps) || 1)));
        const targetQuery = String(action.query || '').trim();
        if (operation === 'isolate' && targetQuery && !(action.countries || []).length) {
          try {
            const response = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(targetQuery)}`);
            const payload = await response.json().catch(() => ({}));
            const latitude = Number(payload.lat ?? payload.latitude);
            const longitude = Number(payload.lon ?? payload.longitude);
            if (response.ok && Number.isFinite(latitude) && Number.isFinite(longitude)) {
              const label = payload.display_name || action.label || targetQuery;
              setEmilViewportCommand({
                id: Date.now() + Math.random(),
                operation: 'center',
                latitude,
                longitude,
                zoom: Number(action.zoom) || 10,
              });
              setLastSearchedLocation({ name: targetQuery, lat: latitude, lon: longitude, label });
              pushReply(`Centered the map on ${label} without changing the loaded data.`);
              return true;
            }
          } catch (_) {
            // Named network zones are resolved against the loaded overlays below.
          }
        }
        setEmilViewportCommand({
          id: Date.now() + Math.random(),
          operation: operation === 'isolate' ? 'fit_targets' : operation,
          steps,
          countryCodes: action.countries || [],
          query: targetQuery,
        });
        if (operation === 'zoom_in') pushReply(`Zoomed in${steps > 1 ? ` ${steps} levels` : ''}.`);
        else if (operation === 'zoom_out') pushReply(`Zoomed out${steps > 1 ? ` ${steps} levels` : ''}.`);
        else pushReply(`Fit the view to ${action.label || 'the requested area'} without changing the loaded data.`);
        return true;
      }
      case 'land_constraints': {
        if (action.visible === false) {
          updateLandOverlay({ enabled: false, panelOpen: false });
          pushReply('Land & Constraints is hidden. Verified against the map control state.');
          return true;
        }
        const requested = Array.isArray(action.categories)
          ? ATLAS_LAND_CATEGORY_ORDER.filter((category) => action.categories.includes(category))
          : [];
        const current = new Set(landOverlay.categories);
        if (action.mode === 'hide') requested.forEach((category) => current.delete(category));
        else if (action.mode === 'add') requested.forEach((category) => current.add(category));
        else if (requested.length) {
          current.clear();
          requested.forEach((category) => current.add(category));
        }
        const categories = ATLAS_LAND_CATEGORY_ORDER.filter((category) => current.has(category));
        const requestedCountries = Array.isArray(action.countries)
          ? [...new Set(action.countries.map((code) => String(code || '').trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))]
          : null;
        const countrySet = new Set(landOverlay.countries || []);
        if (requestedCountries) {
          if (action.countryMode === 'remove') requestedCountries.forEach((code) => countrySet.delete(code));
          else if (action.countryMode === 'add') requestedCountries.forEach((code) => countrySet.add(code));
          else {
            countrySet.clear();
            requestedCountries.forEach((code) => countrySet.add(code));
          }
        }
        const countries = [...countrySet];
        updateLandOverlay({
          enabled: true,
          panelOpen: action.panelOpen !== false,
          categories,
          countries,
          ...(Number.isFinite(Number(action.opacity)) ? { opacity: Number(action.opacity) } : {}),
        });
        const labels = categories.map((category) => (
          landStatus?.categories?.find((item) => item.id === category)?.label || category
        ));
        const scopeLabel = countries.length
          ? countries.map(countryCodeToName).join(', ')
          : 'all Europe';
        pushReply(`Land & Constraints enabled${labels.length ? ` for ${labels.join(', ')}` : ' with no active classes'}, clipped to ${scopeLabel}. ${Number.isFinite(Number(action.opacity)) ? `Opacity set to ${Math.round(Number(action.opacity))}%. ` : ''}Verified against the requested overlay state.`);
        return true;
      }
      case 'network_overlay': {
        if (!action.visible) {
          setAtlasOverlayMode(false);
          pushReply(`Returned to the ${ATLAS_NETWORK_CARRIER_META[atlasNetworkCarrierRef.current]?.label || 'single-network'} view.`);
          return true;
        }
        const requestedCarriers = [...new Set((action.carriers || [])
          .map((carrier) => String(carrier || '').trim().toLowerCase())
          .filter((carrier) => ATLAS_NETWORK_CARRIER_ORDER.includes(carrier)))];
        const nextCarriers = requestedCarriers.length ? requestedCarriers : atlasOverlayCarriers;
        // A preceding action in the same agent plan can publish power before
        // React replaces this callback's render closure. Map membership is
        // synchronously committed with the geometry, so it is authoritative
        // for compound country/resolution + overlay instructions.
        const powerLoaded = pypsaMapMembershipRef.current.networks.length > 0;
        const skippedPower = nextCarriers.includes('electricity') && !powerLoaded;
        const effectiveCarriers = nextCarriers.filter((carrier) => carrier !== 'electricity' || !skippedPower);
        if (!effectiveCarriers.length) {
          pushReply('Power is not loaded yet. Open the Electricity workspace and build or load a network before adding it to the overlay.');
          return true;
        }
        const orderedCarriers = ATLAS_NETWORK_CARRIER_ORDER.filter((carrier) => effectiveCarriers.includes(carrier));
        setAtlasOverlayCarriers(previous => previous?.length === orderedCarriers.length
          && previous.every((carrier, index) => carrier === orderedCarriers[index]) ? previous : orderedCarriers);
        setAtlasOverlayMode(true);
        // Applying an agent plan must not close its conversation panel.
        // Manual legend controls still explicitly transfer panel focus.
        await loadAtlasOverlayCarriers(effectiveCarriers);
        pushReply(`Overlay mode enabled for ${effectiveCarriers.map((carrier) => ATLAS_NETWORK_CARRIER_META[carrier].label).join(', ')}.${skippedPower ? ' Power was skipped because no electricity network is loaded.' : ''} Each network keeps its own units and provenance.`);
        return true;
      }
      case 'network_carrier': {
        const carrier = String(action.carrier || action.networkCarrier || '').trim().toLowerCase();
        if (!['electricity', 'gas', 'water', 'liquids', 'logistics'].includes(carrier)) {
          pushReply('Choose Electricity, Methane gas, Water, Oil & energy liquids, or Ports & air freight.');
          return true;
        }
        setAtlasOverlayMode(false);
        atlasNetworkCarrierRef.current = carrier;
        if (carrier === 'gas') {
          await loadGasCountryFromAgent(gasCountryFilterRef.current);
          pushReply(`Switched to the methane gas network${gasCountryFilterRef.current ? ` for ${countryCodeToName(gasCountryFilterRef.current)}` : ' for all Europe'}.`);
        } else if (carrier === 'water') {
          await loadWaterCountryFromAgent(waterCountryFilterRef.current);
          pushReply(`Switched to the water network${waterCountryFilterRef.current ? ` for ${countryCodeToName(waterCountryFilterRef.current)}` : ' for all Europe'}.`);
        } else if (carrier === 'liquids') {
          await loadLiquidsCountryFromAgent(liquidsCountryFilterRef.current);
          pushReply(`Switched to the oil and energy-liquids network${liquidsCountryFilterRef.current ? ` for ${countryCodeToName(liquidsCountryFilterRef.current)}` : ' for all Europe'}.`);
        } else if (carrier === 'logistics') {
          await loadLogisticsCountryFromAgent(logisticsCountryFilterRef.current);
          pushReply(`Switched to the ports and air-freight Atlas${logisticsCountryFilterRef.current ? ` for ${countryCodeToName(logisticsCountryFilterRef.current)}` : ' for all Europe'}.`);
        } else {
          setAtlasNetworkCarrier('electricity');
          pushReply('Switched to the electricity network.');
        }
        return true;
      }
      case 'country': {
        const countryCodes = (action.countries || []).map((code) => String(code || '').trim().toUpperCase()).filter(Boolean);
        if (!countryCodes.length) throw new Error('No country was provided.');
        if (isInfrastructureAction && countryCodes.length > 1) throw new Error('This carrier country action currently accepts one country or all Europe; no partial selection was loaded.');
        const names = countryCodes.map(countryCodeToName);
        if (isGasAction) {
          if (action.mode === 'remove') {
            const activeCountries = String(gasCountryFilterRef.current || '').split(',').filter(Boolean);
            if (!activeCountries.some((code) => countryCodes.includes(code))) {
              pushReply(`${names.join(' and ')} is not the active methane country filter.`);
              return true;
            }
            await loadGasCountryFromAgent('', { domains: action.domains, layerMode: action.layerMode });
            pushReply(`Removed the country filter. Showing the methane network for all Europe.`);
            return true;
          }
          const targetCode = countryCodes[0];
          await loadGasCountryFromAgent(targetCode, {
            domains: action.domains,
            layerMode: action.layerMode || 'replace',
          });
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Showing ${countryCodeToName(targetCode)} in the methane Atlas${layerLabel}.`);
          return true;
        }
        if (isWaterAction) {
          if (action.mode === 'remove') {
            const activeCountries = String(waterCountryFilterRef.current || '').split(',').filter(Boolean);
            if (!activeCountries.some((code) => countryCodes.includes(code))) {
              pushReply(`${names.join(' and ')} is not the active water country filter.`);
              return true;
            }
            await loadWaterCountryFromAgent('', { domains: action.domains, layerMode: action.layerMode });
            pushReply('Removed the country filter. Showing the water network for all Europe.');
            return true;
          }
          const targetCode = countryCodes[0];
          await loadWaterCountryFromAgent(targetCode, {
            domains: action.domains,
            layerMode: action.layerMode || 'replace',
          });
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Showing ${countryCodeToName(targetCode)} in the water Atlas${layerLabel}.`);
          return true;
        }
        if (isLiquidsAction) {
          if (action.mode === 'remove') {
            const activeCountries = String(liquidsCountryFilterRef.current || '').split(',').filter(Boolean);
            if (!activeCountries.some((code) => countryCodes.includes(code))) {
              pushReply(`${names.join(' and ')} is not the active liquids country filter.`);
              return true;
            }
            await loadLiquidsCountryFromAgent('', { domains: action.domains, layerMode: action.layerMode });
            pushReply('Removed the country filter. Showing the oil and liquids network for all Europe.');
            return true;
          }
          const targetCode = countryCodes[0];
          await loadLiquidsCountryFromAgent(targetCode, { domains: action.domains, layerMode: action.layerMode || 'replace' });
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Showing ${countryCodeToName(targetCode)} in the oil and liquids Atlas${layerLabel}.`);
          return true;
        }
        if (isLogisticsAction) {
          if (action.mode === 'remove') {
            const activeCountries = String(logisticsCountryFilterRef.current || '').split(',').filter(Boolean);
            if (!activeCountries.some((code) => countryCodes.includes(code))) {
              pushReply(`${names.join(' and ')} is not the active logistics country filter.`);
              return true;
            }
            await loadLogisticsCountryFromAgent('', { domains: action.domains, layerMode: action.layerMode });
            pushReply('Removed the country filter. Showing European ports and air-freight assets.');
            return true;
          }
          const targetCode = countryCodes[0];
          await loadLogisticsCountryFromAgent(targetCode, { domains: action.domains, layerMode: action.layerMode || 'replace' });
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Showing ${countryCodeToName(targetCode)} in the ports and air-freight Atlas${layerLabel}.`);
          return true;
        }
        if (!atlasOverlayModeRef.current && atlasNetworkCarrierRef.current !== 'electricity') {
          atlasNetworkCarrierRef.current = 'electricity';
          setAtlasNetworkCarrier('electricity');
        }
        if (action.mode === 'remove') {
          removeAtlasCountriesFromAgent(countryCodes);
          pushReply(`Removed ${names.join(' and ')} from the map.`);
          return true;
        }
        if (action.mode === 'focus') {
          const target = loadedPypsaNetworks.find((network) => network.countryCode === countryCodes[0]);
          if (target) {
            activateCountryNetwork(target);
            pushReply(`Focused on ${target.countryName || countryCodeToName(target.countryCode)}.`);
            return true;
          }
        }
        const mode = action.mode === 'add' ? 'add' : 'replace';
        const result = await loadAtlasCountriesFromAgent(countryCodes, {
          mode,
          resolution: action.resolution,
          domains: action.domains,
          layerMode: action.layerMode,
        });
        const label = ATLAS_RESOLUTION_LABELS[result.resolutionKey] || result.resolutionKey;
        if (action.domains?.length) {
          const networkEntries = mode === 'add'
            ? [
                ...pypsaMapMembershipRef.current.networks.map((network) => ({ filename: network.filename })),
                ...result.entries,
              ]
            : result.entries;
          await setAtlasDomainsFromAgent(action.domains, action.layerMode || 'replace', networkEntries);
          if (action.generationMix) setShowGenerationMix(true);
        }
        const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
        pushReply(`${mode === 'add' ? 'Added' : 'Showing'} ${names.join(' and ')} at ${label}${layerLabel}.${layerAvailabilityNote(action.domains, action.layerMode)}`);
        return true;
      }
      case 'all_countries': {
        if (isGasAction) {
          await loadGasCountryFromAgent('', {
            domains: action.domains,
            layerMode: action.layerMode || 'replace',
          });
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Showing the methane network for all Europe${layerLabel}.`);
          return true;
        }
        if (isWaterAction) {
          await loadWaterCountryFromAgent('', {
            domains: action.domains,
            layerMode: action.layerMode || 'replace',
          });
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Showing the water network for all Europe${layerLabel}.`);
          return true;
        }
        if (isLiquidsAction) {
          await loadLiquidsCountryFromAgent('', { domains: action.domains, layerMode: action.layerMode || 'replace' });
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Showing the oil and liquids network for all Europe${layerLabel}.`);
          return true;
        }
        if (isLogisticsAction) {
          await loadLogisticsCountryFromAgent('', { domains: action.domains, layerMode: action.layerMode || 'replace' });
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Showing European ports and air-freight assets${layerLabel}.`);
          return true;
        }
        let countryCodes = availablePypsaCountryOptions.map((option) => option.countryCode);
        if (!countryCodes.length) {
          const files = await loadPyPSAFiles(pypsaGranularity);
          countryCodes = [...new Set((files || [])
            .map((entry) => extractPypsaCountryCode(entry?.filename))
            .filter(Boolean))];
        }
        if (!countryCodes.length) throw new Error('No local country caches are available.');
        const result = await loadAtlasCountriesFromAgent(countryCodes, {
          mode: 'replace',
          resolution: action.resolution || currentAtlasResolutionKey || 'bidding_zone',
          domains: action.domains,
          layerMode: action.layerMode,
        });
        if (action.domains?.length) {
          await setAtlasDomainsFromAgent(action.domains, action.layerMode || 'replace', result.entries);
          if (action.generationMix) setShowGenerationMix(true);
        }
        const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
        pushReply(`Showing all ${countryCodes.length} countries at ${ATLAS_RESOLUTION_LABELS[result.resolutionKey] || result.resolutionKey}${layerLabel}.${layerAvailabilityNote(action.domains, action.layerMode)}`);
        return true;
      }
      case 'country_groups': {
        if (isInfrastructureAction) {
          pushReply(`The ${infrastructureLabel} geography control currently supports one country or all Europe. Choose a country, or ask to show Europe in that network.`);
          return true;
        }
        const availableCodes = new Set(availablePypsaCountryOptions.map((option) => option.countryCode));
        const countryCodes = (action.countries || []).filter((code) => availableCodes.has(code));
        if (!countryCodes.length) throw new Error('No local country caches are available for those regions.');
        const result = await loadAtlasCountriesFromAgent(countryCodes, {
          mode: 'replace',
          resolution: action.resolution || currentAtlasResolutionKey || 'nuts1',
          domains: action.domains,
          layerMode: action.layerMode,
        });
        if (action.domains?.length) {
          await setAtlasDomainsFromAgent(
            action.domains,
            action.layerMode || 'replace',
            result.entries.map((entry) => ({ filename: entry.filename })),
          );
          if (action.generationMix) setShowGenerationMix(true);
        }
        const labels = action.groupLabels || action.groups || [];
        const regionLabel = labels.length > 1
          ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
          : labels[0] || 'the requested regions';
        const resolutionLabel = ATLAS_RESOLUTION_LABELS[result.resolutionKey] || result.resolutionKey;
        const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
        pushReply(`Showing ${regionLabel} (${countryCodes.length} countries) at ${resolutionLabel}${layerLabel}.${layerAvailabilityNote(action.domains, action.layerMode)}`);
        return true;
      }
      case 'mixed_granularity': {
        if (isInfrastructureAction) {
          pushReply('Mixed TSO resolution rings apply to the electricity network. Other infrastructure layers retain their source topology.');
          return true;
        }
        const focusCode = String(action.focusCountry || activePypsaCountryCode || '').trim().toUpperCase();
        if (!focusCode) throw new Error('Choose a focus country for the mixed TSO view.');
        const result = await applyMixedGranularityView(focusCode, action.levels || {});
        if (!result) return true;
        if (action.domains?.length) {
          await setAtlasDomainsFromAgent(action.domains, action.layerMode || 'replace', result.entries);
        }
        pushReply(
          `Built a mixed TSO view around ${countryCodeToName(result.focusCode)}: `
          + `${ATLAS_RESOLUTION_LABELS[result.levels.focus]} for the focus country, `
          + `${ATLAS_RESOLUTION_LABELS[result.levels.adjacent]} for ${result.adjacent.length} direct grid neighbours, and `
          + `${ATLAS_RESOLUTION_LABELS[result.levels.outer]} for ${result.outer.length} outer-ring countries.`
        );
        return true;
      }
      case 'set_resolution': {
        if (isInfrastructureAction) {
          pushReply(`The ${infrastructureLabel} Atlas currently has one source-topology resolution; NUTS and bidding-zone levels apply to the electricity network.`);
          return true;
        }
        const level = await setAtlasResolutionFromAgent(action.resolution);
        if (action.domains?.length) {
          await setAtlasDomainsFromAgent(action.domains, action.layerMode || 'replace', level.entries);
        }
        const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
        pushReply(`Network resolution set to ${level.label}${layerLabel}.${layerAvailabilityNote(action.domains, action.layerMode)}`);
        return true;
      }
      case 'step_resolution': {
        if (isInfrastructureAction) {
          pushReply(`The ${infrastructureLabel} Atlas currently has one source-topology resolution, so its granularity cannot be stepped yet.`);
          return true;
        }
        const result = await stepAtlasResolutionFromAgent(action.direction);
        if (action.domains?.length) {
          await setAtlasDomainsFromAgent(action.domains, action.layerMode || 'replace', result.level.entries);
        }
        if (!result.changed) {
          pushReply(action.direction > 0
            ? 'Already at Full / Nodal / 220 kV, the highest available resolution.'
            : 'Already at the lowest available network resolution.');
        } else {
          const layerLabel = action.domains?.length ? ` with ${action.domains.join(' and ')}` : '';
          pushReply(`Network resolution set to ${result.level.label}${layerLabel}.${layerAvailabilityNote(action.domains, action.layerMode)}`);
        }
        return true;
      }
      case 'layers': {
        const selected = await setAtlasDomainsFromAgent(action.domains, action.mode);
        if (action.generationMix) setShowGenerationMix(true);
        const verb = action.mode === 'hide' ? 'Hidden' : action.mode === 'add' ? 'Added' : 'Showing only';
        pushReply(`${verb} ${selected.join(' and ')}${action.mode === 'hide' ? '' : ' on the map'}.${layerAvailabilityNote(selected, action.mode)}`);
        return true;
      }
      case 'generation_mix': {
        if (isInfrastructureAction) {
          pushReply(`Generation-mix pies apply to electricity. Use Supply to show ${isGasAction ? 'methane production and import facilities' : isWaterAction ? 'water works and treatment facilities' : 'wells and refinery product-output roles'}.`);
          return true;
        }
        if (action.visible && action.showSupply) await setAtlasDomainsFromAgent(['Supply'], 'replace');
        setShowGenerationMix(Boolean(action.visible));
        pushReply(`${action.visible ? 'Showing' : 'Hiding'} generation mix pies.`);
        return true;
      }
      case 'carriers': {
        const requested = new Set(action.carriers || []);
        const waterDomains = [...new Set([...requested]
          .map((token) => WATER_ASSET_FILTERS[token]?.domain)
          .filter(Boolean))];
        if (action.mode !== 'hide') {
          await setAtlasDomainsFromAgent(isWaterAction && waterDomains.length ? waterDomains : ['Supply'], 'replace');
        }
        const facilities = (isGasAction
          ? gasFacilitiesData
          : isWaterAction
            ? waterFacilitiesData
            : isLiquidsAction
              ? liquidsFacilitiesData
              : isLogisticsAction
                ? logisticsFacilitiesData
                : pypsaFacilitiesDataRef.current)
          .filter((facility) => !facility?.is_virtual);
        const allKeys = new Set();
        const matchedKeys = new Set();
        if (isWaterAction) {
          Object.values(WATER_ASSET_FILTERS).forEach((definition) => {
            definition.carrierKeys.forEach((key) => {
              allKeys.add(key);
              allKeys.add(`${definition.domain}::${key}`);
            });
          });
          requested.forEach((token) => {
            const definition = WATER_ASSET_FILTERS[token];
            definition?.carrierKeys.forEach((key) => {
              matchedKeys.add(key);
              matchedKeys.add(`${definition.domain}::${key}`);
            });
          });
        }
        facilities.forEach((facility) => {
          const keys = [atlasCarrierFilterKey(facility), facility.carrier_key || facility.type].filter(Boolean);
          keys.forEach((key) => allKeys.add(key));
          const searchable = [
            facility.carrier,
            facility.carrier_key,
            facility.carrier_nice_name,
            facility.type,
          ].map((value) => String(value || '').toLowerCase()).join(' ');
          const matches = requested.has('all') || [...requested].some((token) => {
            if (token === 'wind') return searchable.includes('wind');
            if (token === 'gas') return /\b(?:gas|ccgt|ocgt)\b/.test(searchable);
            if (token === 'hydro') return searchable.includes('hydro') || searchable.includes('phs');
            if (token === 'battery') return searchable.includes('battery');
            if (isWaterAction && WATER_ASSET_FILTERS[token]) {
              return WATER_ASSET_FILTERS[token].terms.some((term) => searchable.includes(term));
            }
            return searchable.includes(token);
          });
          if (matches) keys.forEach((key) => matchedKeys.add(key));
        });
        if (requested.has('all')) allKeys.forEach((key) => matchedKeys.add(key));
        setHiddenCarriers((previous) => {
          const next = action.mode === 'only' ? new Set(allKeys) : new Set(previous);
          matchedKeys.forEach((key) => {
            if (action.mode === 'hide') next.add(key);
            else next.delete(key);
          });
          return next;
        });
        const noun = isWaterAction ? 'water asset types' : isLiquidsAction ? 'liquid asset types' : isLogisticsAction ? 'logistics asset types' : 'carriers';
        const names = action.carriers.map((value) => String(value).replaceAll('_', ' '));
        pushReply(`${action.mode === 'hide' ? 'Hidden' : action.mode === 'only' ? 'Showing only' : 'Showing'} ${noun}: ${names.join(' and ')}.`);
        return true;
      }
      case 'temporal_resolution':
        if (isInfrastructureAction) {
          pushReply(`Temporal resolution applies to electricity model snapshots; the ${infrastructureLabel} Atlas is currently a source-data map without time-series simulation controls.`);
          return true;
        }
        setPypsaSettings((previous) => ({ ...previous, snapshot_resolution: action.value }));
        pushReply(`Temporal resolution set to ${action.value === 'monthly' ? 'Monthly' : action.value}.`);
        return true;
      case 'settings': {
        if (isInfrastructureAction) {
          pushReply(`Model settings apply to electricity builds and solves; they cannot change the ${infrastructureLabel} source-data Atlas.`);
          return true;
        }
        const updates = Object.entries(action.updates || {}).reduce((next, [key, value]) => {
          const definition = atlasAgentParameterDefinition(key);
          if (!definition) return next;
          const normalizedValue = normalizeAtlasAgentSettingValue(key, value);
          if (normalizedValue === undefined) {
            throw new Error(`${definition.label} has an invalid value: ${value}.`);
          }
          next[key] = normalizedValue;
          return next;
        }, {});
        const entries = Object.entries(updates);
        if (!entries.length) throw new Error('No recognized model setting was provided.');
        setPypsaSettings((previous) => ({ ...previous, ...updates }));
        if (updates.planning_horizon != null) setPlanningHorizonYear(Number(updates.planning_horizon));
        if (updates.build_only != null) setRunMode(updates.build_only ? 'build_only' : 'build_solve');
        const descriptions = entries.map(([key, value]) => {
          const definition = atlasAgentParameterDefinition(key);
          const displayValue = typeof value === 'boolean' ? (value ? 'enabled' : 'disabled') : value;
          return `${definition?.label || key}: ${displayValue}`;
        });
        pushReply(`Updated ${descriptions.join('; ')}.`);
        return true;
      }
      case 'invalid_settings': {
        const descriptions = (action.issues || []).map((issue) => (
          `${issue.label} cannot be ${issue.value}; use ${issue.constraint}`
        ));
        pushReply(`${descriptions.join('. ')}.`);
        return true;
      }
      case 'run_mode': {
        if (isInfrastructureAction) {
          pushReply(`Build and solve modes apply to electricity. The ${infrastructureLabel} Atlas currently visualizes its local source database.`);
          return true;
        }
        setRunMode(action.mode);
        setPypsaSettings((previous) => ({ ...previous, build_only: action.mode === 'build_only' }));
        const labels = { build_only: 'Build only', build_solve: 'Build + solve', solve_existing: 'Solve existing' };
        pushReply(`Run mode set to ${labels[action.mode]}.`);
        return true;
      }
      case 'open_settings':
        if (isInfrastructureAction) {
          pushReply(`More Settings configures electricity builds and is not used by the ${infrastructureLabel} Atlas.`);
          return true;
        }
        setShowPypsaSettingsDialog(true);
        pushReply('Opened More Settings.');
        return true;
      case 'domain_controls':
        setMapControlsCollapsed(!action.visible);
        pushReply(`${action.visible ? 'Opened' : 'Collapsed'} domain controls.`);
        return true;
      case 'build_network':
        if (isInfrastructureAction) {
          pushReply(`The ${infrastructureLabel} Atlas is loaded from a local source database and cannot run the electricity Build Network workflow.`);
          return true;
        }
        pushReply('Building the configured network…');
        await runPypsaBuildFromSettings();
        return true;
      default:
        return false;
    }
  }, [
    activateCountryNetwork,
    activePypsaCountryCode,
    applyMixedGranularityView,
    atlasNetworkCarrier,
    atlasOverlayCarriers,
    atlasOverlayCarrierInventory,
    landOverlay.categories,
    aiMapControlEnabled,
    landStatus,
    availablePypsaCountryOptions,
    extractPypsaCountryCode,
    loadPyPSAFiles,
    pypsaGranularity,
    countryCodeToName,
    currentAtlasResolutionKey,
    gasFacilitiesData,
    liquidsFacilitiesData,
    logisticsFacilitiesData,
    ensureAtlasOverlayCarrierLoaded,
    loadAtlasOverlayCarriers,
    loadGasCountryFromAgent,
    loadLiquidsCountryFromAgent,
    loadLogisticsCountryFromAgent,
    loadWaterCountryFromAgent,
    loadAtlasCountriesFromAgent,
    loadedPypsaNetworks,
    removeAtlasCountriesFromAgent,
    setAtlasDomainsFromAgent,
    setAtlasResolutionFromAgent,
    stepAtlasResolutionFromAgent,
    updateLandOverlay,
    waterFacilitiesData,
    liquidsCountryFilter,
  ]);

  const handleSolveNetworkCommand = useCallback(async (
    query,
    onStatusChange = () => { },
    granularityOverride = null,
    options = {}
  ) => {
    const skipMapFocus = Boolean(options?.skipMapFocus);
    const normalizedQuery = (query || '').trim();
    if (!normalizedQuery) {
      throw new Error('Please enter a valid prompt.');
    }

    // Granularity is driven by the slider, never parsed from the prompt text.
    // The prompt bar is a pure location query; the user's selected granularity
    // (or an explicit override from the slider) is the single source of truth.
    const targetGranularity = granularityOverride || pypsaGranularity;

    onStatusChange('Checking existing S3 outputs for this location and granularity...');

    const parseLocationPromise = fetch(`${API_BASE}/parse_location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normalizedQuery }),
    })
      .then(async (resp) => (resp.ok ? resp.json() : null))
      .catch(() => null);

    const precheckResp = await fetch(`${API_BASE}/api/pypsa/find-existing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: normalizedQuery,
        granularity_prefix: targetGranularity,
      }),
    });
    const precheckData = await precheckResp.json();
    if (!precheckResp.ok || precheckData.error) {
      throw new Error(precheckData.error || `HTTP ${precheckResp.status}`);
    }

    const preferredGranularity = granularityOverride || targetGranularity || pypsaGranularity;
    let dirname = '';
    let resolvedGranularity = preferredGranularity;
    let storageGranularity = null;
    let runData = null;
    let fromExisting = false;
    let existingMatch = null;

    if (precheckData.exists && precheckData.dirname) {
      fromExisting = true;
      dirname = String(precheckData.dirname || '').trim();
      resolvedGranularity = precheckData.granularity_prefix || preferredGranularity;
      existingMatch = precheckData.match || null;
      onStatusChange(`Found existing output in ${resolvedGranularity}. Loading ${dirname}...`);
    } else {
      onStatusChange('No direct S3 match found. Submitting prompt to EMIL run API...');
      const runResp = await fetch(`${API_BASE}/api/pypsa/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: normalizedQuery,
          granularity_prefix: targetGranularity,
          model_type: 'pypsa_ssh',
          planning_horizon: Number(planningHorizonYear) || 2025,
          run_mode: runMode === 'build_only' ? 'build_only' : (runMode === 'solve_existing' ? 'solve_existing' : 'build_solve'),
        }),
      });
      runData = await runResp.json();
      if (!runResp.ok || runData.error) {
        throw new Error(runData.error || `HTTP ${runResp.status}`);
      }

      dirname = (runData.dirname || '').trim();
      if (!dirname) {
        throw new Error('Run API completed but did not return a parseable distill/build folder.');
      }

      storageGranularity = extractStoragePrefixFromS3Folder(runData.s3_folder);
      // Load from the prefix the builder actually wrote to; requested slider value
      // is only a preference and can be ignored by the remote decide_mode step.
      resolvedGranularity = storageGranularity || runData.granularity_prefix || preferredGranularity || pypsaGranularity;
      onStatusChange(`Run completed. Loading ${dirname} from ${resolvedGranularity}...`);
    }

    setSelectedPyPSAFile(dirname);
    setSelectedPyPSACountryCode(extractPypsaCountryCode(dirname).toUpperCase());

    if (resolvedGranularity !== pypsaGranularity) {
      setPypsaGranularity(resolvedGranularity);
    }

    const parsedLocation = await parseLocationPromise;
    if (!skipMapFocus && parsedLocation?.latitude != null && parsedLocation?.longitude != null) {
      const lat = Number(parsedLocation.latitude);
      const lng = Number(parsedLocation.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setEmilFocusLocation({
          latitude: lat,
          longitude: lng,
          label: parsedLocation.description || parsedLocation.location || parsedLocation.name || '',
          zoom: 8,
          token: Date.now(),
        });
      }
    }

    // If the remote builder wrote to a different granularity than requested,
    // continue loading from storage and surface a warning in the staging logs.
    if (storageGranularity && storageGranularity !== preferredGranularity) {
      setSolveNetworkLogsCollapsed(false);
      onStatusChange(
        `Builder wrote ${dirname} under ${storageGranularity} instead of requested ${preferredGranularity}. ` +
        `Continuing with ${storageGranularity} so the network can be loaded.`
      );
    }
    let result = await loadPyPSANetworkFromFile(dirname, resolvedGranularity, { forceDistill: true });
    let groupedNodeCount = new Set((result?.groupedFacilities || []).map(f => f.locationKey).filter(Boolean)).size;

    // Defensive retry: sometimes immediately after upload/index update, parse returns empty once.
    if (groupedNodeCount === 0) {
      setSolveNetworkLogsCollapsed(false);
      onStatusChange(`Loaded ${dirname} but no nodes were parsed. Refreshing index and retrying...`);
      await loadPyPSAFiles(resolvedGranularity);
      result = await loadPyPSANetworkFromFile(dirname, resolvedGranularity, { forceDistill: true });
      groupedNodeCount = new Set((result?.groupedFacilities || []).map(f => f.locationKey).filter(Boolean)).size;

      if (groupedNodeCount === 0 && storageGranularity && storageGranularity !== resolvedGranularity) {
        setSolveNetworkLogsCollapsed(false);
        onStatusChange(`Still empty. Retrying with storage prefix ${storageGranularity}...`);
        setPypsaGranularity(storageGranularity);
        await loadPyPSAFiles(storageGranularity);
        result = await loadPyPSANetworkFromFile(dirname, storageGranularity, { forceDistill: true });
        resolvedGranularity = storageGranularity;
        groupedNodeCount = new Set((result?.groupedFacilities || []).map(f => f.locationKey).filter(Boolean)).size;
      }
    }

    if (groupedNodeCount === 0) {
      throw new Error(`Loaded "${dirname}" but no map nodes were parsed. Please retry the prompt once.`);
    }

    return {
      query: normalizedQuery,
      filename: dirname,
      granularityPrefix: resolvedGranularity,
      groupedNodeCount,
      componentCount: (result?.groupedFacilities || []).filter(f => !f.is_virtual).length,
      improvedPrompt: runData?.improved_prompt || normalizedQuery,
      s3Folder: runData?.s3_folder || precheckData?.s3_folder || '',
      jobId: runData?.run_response?.job_id || '',
      runStatus: runData?.run_response?.status || (fromExisting ? 'existing_loaded' : ''),
      logTail: (runData?.run_response?.log_tail || '').slice(-2000),
      focusLabel: parsedLocation?.description || parsedLocation?.location || parsedLocation?.name || '',
      fromExisting,
      existingMatch,
    };
  }, [extractPypsaCountryCode, loadPyPSAFiles, loadPyPSANetworkFromFile, pypsaGranularity, planningHorizonYear, runMode]);

  const submitSolveNetworkPrompt = useCallback(async () => {
    if (!solveNetworkSearch.trim() || solveNetworkStaging) return;
    const submittedPrompt = solveNetworkSearch.trim();

    setSolveNetworkStaging(true);
    setSolveNetworkStageMessage('');
    // Pre-classify with the LLM so a single place name like "rome" or "milan"
    // navigates the map instead of triggering a full country build — but ONLY
    // when a network is already loaded. If the user has nothing on screen yet,
    // navigate-only would just leave them with a blank map, so we fall through
    // to the original load path (which both loads the country AND focuses on
    // the typed place, the original UX).
    try {
      const interpResp = await fetch(`${API_BASE}/api/map-agent/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: submittedPrompt,
          mapContext: {},
          conversationHistory: [],
        }),
      });
      const interpData = interpResp.ok ? await interpResp.json() : null;
      const looksLikeNavigate =
        interpData
        && interpData.intent === 'navigate_to_location'
        && Number(interpData.confidence || 0) >= 0.45;
      const aNetworkIsLoaded = !!selectedPyPSAFile;
      // CASE A: navigate intent + a network already on screen → just pan/zoom.
      if (looksLikeNavigate && aNetworkIsLoaded) {
        const locName = String(interpData.params?.location || submittedPrompt).trim();
        const geoResp = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(locName)}`);
        const geoData = await geoResp.json();
        const lat = Number(geoData?.lat);
        const lon = Number(geoData?.lon);
        if (geoResp.ok && Number.isFinite(lat) && Number.isFinite(lon)) {
          setEmilFocusLocation({ latitude: lat, longitude: lon, zoom: 9, label: geoData.display_name || locName });
          setLastSearchedLocation({ name: locName, lat, lon, label: geoData.display_name || locName });
          setSolveNetworkStageMessage(`Moved to ${geoData.display_name || locName}.`);
          setSolveNetworkStaging(false);
          // Important: do NOT setLastEMILPrompt — that would make the next
          // manual granularity change re-load this place as a country.
          return;
        }
      }
      // CASE B: navigate intent + nothing loaded → BYPASS find-existing and
      // call the runner directly. The runner's decide_mode picks build_subnet
      // for cities, so "rome" produces a Rome-scoped subnet rather than
      // serving the cached `build_IT_*` country (which is what "rome → loads
      // Italy" complaints have been about). For places it can't subnet,
      // it falls back to a country build, which is still better than blindly
      // reusing a stale cached country build.
      if (looksLikeNavigate && !aNetworkIsLoaded) {
        setSolveNetworkLogsCollapsed(false);
        setSolveNetworkLoadingStateIndex(0);
        setSolveNetworkStageMessage(`Building "${submittedPrompt}" from scratch (no cached match)…`);
        try {
          const runResp = await fetch(`${API_BASE}/api/pypsa/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: submittedPrompt,
              granularity_prefix: pypsaGranularity,
              model_type: 'pypsa_ssh',
              planning_horizon: Number(planningHorizonYear) || 2025,
              run_mode: runMode === 'build_only' ? 'build_only' : (runMode === 'solve_existing' ? 'solve_existing' : 'build_solve'),
            }),
          });
          const runData = await runResp.json();
          if (!runResp.ok || runData.error) throw new Error(runData.error || `HTTP ${runResp.status}`);
          const dirname = String(runData.dirname || '').trim();
          if (!dirname) throw new Error('runner did not return a dirname');
          const resolvedGranularity = runData.granularity_prefix || pypsaGranularity;
          const result = await loadPyPSANetworkFromFile(dirname, resolvedGranularity, { forceDistill: true });
          setSelectedPyPSAFile(dirname);
          const inferredCC = extractPypsaCountryCode(dirname).toUpperCase();
          if (inferredCC) setSelectedPyPSACountryCode(inferredCC);
          if (resolvedGranularity !== pypsaGranularity) setPypsaGranularity(resolvedGranularity);
          setLastEMILPrompt(submittedPrompt);
          setSolveNetworkStageMessage([
            `Built "${submittedPrompt}" from scratch.`,
            `Loaded folder: ${dirname}`,
            runData.improved_prompt ? `Improved prompt: ${runData.improved_prompt}` : null,
            (result?.groupedFacilities || []).length
              ? `${new Set((result.groupedFacilities || []).map(f => f.locationKey).filter(Boolean)).size} grouped node locations ready on map`
              : null,
          ].filter(Boolean).join('\n'));
        } catch (err) {
          setSolveNetworkStageMessage(`Build failed: ${err.message}`);
        } finally {
          setSolveNetworkStaging(false);
        }
        return;
      }
    } catch (_) {
      // LLM unavailable / geocode failed — fall through to the load path.
    }

    setLastEMILPrompt(submittedPrompt);
    try {
      const result = await handleSolveNetworkCommand(
        submittedPrompt,
        (statusText) => setSolveNetworkStageMessage(statusText),
        null,
        { skipMapFocus: true }
      );
      setSolveNetworkStageMessage([
        result.fromExisting
          ? `Loaded existing S3 output${result.existingMatch?.score ? ` (match score ${result.existingMatch.score})` : ''}`
          : `EMIL run completed: ${result.runStatus || 'completed'}${result.jobId ? ` (job ${result.jobId})` : ''}`,
          `Loaded folder: ${result.filename}`,
          result.granularityPrefix ? `Granularity: ${result.granularityPrefix}` : null,
          planningHorizonYear ? `Planning Horizon: ${planningHorizonYear}` : null,
          result.focusLabel ? `Map focus: ${result.focusLabel}` : null,
          result.improvedPrompt ? `Improved prompt: ${result.improvedPrompt}` : null,
        result.s3Folder ? `S3 folder: ${result.s3Folder}` : null,
        result.groupedNodeCount != null ? `${result.groupedNodeCount} grouped node locations ready on map` : null,
        result.componentCount != null ? `${result.componentCount} underlying PyPSA components staged` : null,
        result.logTail ? `Latest logs:\n${result.logTail}` : null,
      ].filter(Boolean).join('\n'));
    } catch (error) {
      setSolveNetworkStageMessage(`Unable to stage solve network: ${error.message}`);
    } finally {
      setSolveNetworkStaging(false);
    }
  }, [
    solveNetworkSearch, solveNetworkStaging, handleSolveNetworkCommand,
    selectedPyPSAFile, pypsaGranularity, extractPypsaCountryCode, planningHorizonYear,
  ]);

  const updatePypsaSetting = useCallback((key, value) => {
    setPypsaSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetPypsaSettingsDefaults = useCallback(() => {
    setPypsaSettings(PYPSA_SETTINGS_DEFAULTS);
  }, []);

  const exportPypsaSettingsJson = useCallback(() => {
    try {
      const blob = new Blob([JSON.stringify(pypsaSettings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pypsa-settings-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('Could not export settings JSON:', err);
    }
  }, [pypsaSettings]);

  const buildPypsaPromptFromSettings = useCallback((settings) => {
    const s = settings || {};
    // Keep controls visible, but gate whether they are included in run prompts.
    const promptSettings = Object.fromEntries(
      Object.entries(s).filter(([k]) => useClusterDynamicArgs || (k !== 'clusters' && k !== 'strict_dynamic'))
    );
    const baseLines = [
      `Build a PyPSA network for region ${s.region}.`,
      `Planning horizon: ${s.planning_horizon}.`,
      `Scenario: ${s.scenario_name}.`,
      `Model scope: ${s.model_scope}.`,
      `Spatial resolution: ${s.spatial_resolution}.`,
      `Snapshot resolution: ${s.snapshot_resolution}.`,
      ...(useClusterDynamicArgs
        ? [`Clusters: ${s.clusters}.`, `Strict dynamic: ${s.strict_dynamic}.`]
        : ['Clusters: UI-only (ignored for run).', 'Strict dynamic: UI-only (ignored for run).']),
      '',
      'Use the following structured configuration:',
      '```yaml',
      ...Object.entries(promptSettings).map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`),
      '```',
    ];
    return baseLines.join('\n');
  }, [useClusterDynamicArgs]);

  const runPypsaBuildFromSettings = useCallback(async () => {
    if (solveNetworkStaging || pypsaLoading) return;
    const prompt = buildPypsaPromptFromSettings(pypsaSettings);
    setSolveNetworkSearch(String(pypsaSettings.region || '').trim());
    setLastEMILPrompt(String(pypsaSettings.region || '').trim());
    setSolveNetworkLogsCollapsed(false);
    setSolveNetworkLoadingStateIndex(0);
    setSolveNetworkStaging(true);
    setSolveNetworkStageMessage('Launching PyPSA build with settings dialog parameters...');
    try {
      const preferredGranularity = pypsaGranularity;
      const planningYear = Number(pypsaSettings.planning_horizon) || Number(planningHorizonYear) || 2025;
      const runResp = await fetch(`${API_BASE}/api/pypsa/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          granularity_prefix: preferredGranularity,
          model_type: 'pypsa_ssh',
          planning_horizon: planningYear,
          run_mode: runMode === 'build_only' ? 'build_only' : (runMode === 'solve_existing' ? 'solve_existing' : 'build_solve'),
          settings: pypsaSettings,
        }),
      });
      const runData = await runResp.json();
      if (!runResp.ok || runData.error) throw new Error(runData.error || `HTTP ${runResp.status}`);
      const dirname = String(runData.dirname || '').trim();
      if (!dirname) throw new Error('Run API completed but did not return a distill/build folder.');

      const resolvedGranularity =
        extractStoragePrefixFromS3Folder(runData.s3_folder)
        || runData.granularity_prefix
        || preferredGranularity;

      setSelectedPyPSAFile(dirname);
      const cc = extractPypsaCountryCode(dirname).toUpperCase();
      if (cc) setSelectedPyPSACountryCode(cc);
      if (resolvedGranularity !== pypsaGranularity) setPypsaGranularity(resolvedGranularity);
      await loadPyPSANetworkFromFile(dirname, resolvedGranularity, { forceDistill: true });
      setSelectedPypsaListFile(dirname);
      setShowPypsaSettingsDialog(false);
      setSolveNetworkStageMessage([
        'PyPSA build from settings completed.',
        `Region: ${pypsaSettings.region}`,
        `Scenario: ${pypsaSettings.scenario_name}`,
        `Loaded folder: ${dirname}`,
        `Granularity: ${resolvedGranularity}`,
        runData.improved_prompt ? `Improved prompt: ${runData.improved_prompt}` : null,
      ].filter(Boolean).join('\n'));
    } catch (err) {
      setSolveNetworkStageMessage(`Settings build failed: ${err.message}`);
    } finally {
      setSolveNetworkStaging(false);
    }
  }, [
    solveNetworkStaging,
    pypsaLoading,
    buildPypsaPromptFromSettings,
    pypsaSettings,
    pypsaGranularity,
    planningHorizonYear,
    runMode,
    extractPypsaCountryCode,
    loadPyPSANetworkFromFile,
  ]);

  const openRegionPanelAt = useCallback((lat, lon) => {
    setRegionCenter({ lat, lon });
    setRegionManifest(null);
    setRegionError(null);
    setRegionS3Folder('');
    setRegionDirname('');
    setRegionSourceDirname('');
    setRegionOpsMessage('');
    setRegionPanelVisible(true);
    setRegionContextMenu(null);
  }, []);
  const openRegionPanelFromCurrentView = useCallback(() => {
    const lat = Number(mapViewRef.current?.lat);
    const lon = Number(mapViewRef.current?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      openRegionPanelAt(lat, lon);
      return;
    }
    setRegionPanelVisible(true);
  }, [openRegionPanelAt]);

  // Derived region identifiers — must live above the useCallbacks below that
  // list them in their dependency arrays, otherwise React renders into a
  // temporal-dead-zone error on first mount (`Cannot access X before
  // initialization`). Safe to sit here — only depend on top-level state.
  const resolvedRegionDirname = useMemo(() => {
    const direct = String(regionDirname || '').trim();
    if (direct) return direct;
    return extractDirnameFromS3Folder(regionS3Folder);
  }, [regionDirname, regionS3Folder]);
  // The dirname used to fetch CSV time-series (loads_demand, marginal_price,
  // generators_dispatch, lines_flow_p0, …). Those CSVs only exist in the
  // SOLVE output, not in the source build, so prefer the solve dirname and
  // only fall back to the source if no solve has been done yet.
  const resolvedRegionChartDirname = useMemo(
    () => resolvedRegionDirname || String(regionSourceDirname || '').trim(),
    [regionSourceDirname, resolvedRegionDirname]
  );
  const activeRegionGranularity = useMemo(
    () => extractResolutionLabelFromName(selectedPyPSAFile) || pypsaGranularity,
    [selectedPyPSAFile, pypsaGranularity]
  );
  const regionRunKey = useCallback(
    (run) => `${String(run?.granularity_prefix || '').trim()}::${String(run?.dirname || '').trim()}`,
    []
  );
  const isRegionSolveDirname = useCallback(
    (dirname) => /(^|\/)(simulate_region_|region_saved_)/i.test(String(dirname || '').trim()),
    []
  );
  const extractRegionGeometryFromManifest = useCallback((manifest) => {
    const m = manifest && typeof manifest === 'object' ? manifest : {};
    const centerCandidate = m.center || m.region_center || m.centre || null;
    const latRaw = centerCandidate?.lat ?? centerCandidate?.latitude ?? m.center_lat ?? m.lat ?? null;
    const lonRaw = centerCandidate?.lon ?? centerCandidate?.lng ?? centerCandidate?.longitude ?? m.center_lon ?? m.lon ?? m.lng ?? null;
    const radiusRaw = m.radius_km ?? m.radiusKm ?? m.radius ?? null;
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    const radiusKm = Number(radiusRaw);
    return {
      center: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
      radiusKm: Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : null,
    };
  }, []);
  const extractRegionSourceDirname = useCallback((manifest) => {
    // The manifest's `source_network` is a full S3 URL ending in
    // `<dirname>/network_built.nc`. We need the parent dirname only — passing
    // the full URL (with the file tail) into loadPyPSANetworkFromFile makes
    // the parse-distill call hit a non-existent path and the map renders
    // empty. Strip the trailing *.nc filename if present.
    const stripNcTail = (raw) => {
      const trimmed = String(raw || '').trim().replace(/\/+$/, '');
      if (!trimmed) return '';
      const idx = trimmed.lastIndexOf('/');
      const last = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
      if (/\.(nc|netcdf)$/i.test(last)) {
        return idx >= 0 ? trimmed.slice(0, idx) : '';
      }
      return trimmed;
    };
    const m = manifest && typeof manifest === 'object' ? manifest : {};
    const direct = String(m.source_dirname || m.source_network_dirname || '').trim();
    if (direct) return stripNcTail(direct);
    const rawSource = String(m.source_network || '').trim();
    if (!rawSource) return '';
    if (rawSource.startsWith('s3://')) return stripNcTail(extractDirnameFromS3Folder(rawSource));
    return stripNcTail(rawSource.split('/').filter(Boolean).pop() || '');
  }, []);
  const selectedSavedRegionRun = useMemo(
    () => regionSavedRuns.find((r) => regionRunKey(r) === selectedSavedRegionKey) || null,
    [regionSavedRuns, selectedSavedRegionKey, regionRunKey]
  );

  const loadRegionSavedRuns = useCallback(async () => {
    setRegionSavedRunsLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/pypsa/simulate-region/list`);
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const runs = (data.runs || [])
        .filter((f) => isRegionSolveDirname(f.dirname))
        .sort((a, b) => String(b.modified || '').localeCompare(String(a.modified || '')))
        .map((f) => ({
          dirname: String(f.dirname || '').trim(),
          granularity_prefix: String(f.granularity_prefix || '').trim() || 'pypsa',
          modified: f.modified || '',
          size_kb: f.size_kb,
          s3_folder: String(f.s3_folder || '').trim(),
        }));
      setRegionSavedRuns(runs);
      regionSavedRunsLoadedRef.current = true;
      return runs;
    } catch (err) {
      setRegionSavedRuns([]);
      regionSavedRunsLoadedRef.current = false;
      setRegionError(err.message || 'Failed loading saved region outputs');
      return [];
    } finally {
      setRegionSavedRunsLoading(false);
    }
  }, [isRegionSolveDirname]);

  useEffect(() => {
    if (!regionSavedRuns.length) {
      setSelectedSavedRegionKey('');
      return;
    }
    if (regionSavedRuns.some((run) => regionRunKey(run) === selectedSavedRegionKey)) return;
    setSelectedSavedRegionKey(regionRunKey(regionSavedRuns[0]));
  }, [regionSavedRuns, selectedSavedRegionKey, regionRunKey]);

  const loadSavedRegionRun = useCallback(async (run) => {
    const clean = String(run?.dirname || run || '').trim();
    const runGranularity = String(run?.granularity_prefix || '').trim() || pypsaGranularity;
    if (!clean) return;
    setRegionError(null);
    setRegionOpsMessage('');
    try {
      setPypsaGranularity(runGranularity);
      const params = new URLSearchParams({
        dirname: clean,
        granularity_prefix: runGranularity,
      });
      const manifestResp = await fetch(`${API_BASE}/api/pypsa/simulate-region/manifest?${params}`);
      const manifestData = await manifestResp.json();
      if (manifestResp.ok && manifestData?.manifest) {
        const sourceDir = extractRegionSourceDirname(manifestData.manifest);
        if (sourceDir) {
          await loadPyPSANetworkFromFile(sourceDir, runGranularity, { forceDistill: true });
          setSelectedPyPSAFile(sourceDir);
        }
        setRegionManifest(manifestData.manifest);
        setRegionSourceDirname(sourceDir);
        setRegionDirname(clean);
        setRegionS3Folder(String(manifestData.s3_folder || '').trim());
        const geometry = extractRegionGeometryFromManifest(manifestData.manifest);
        if (geometry.center) setRegionCenter(geometry.center);
        if (geometry.radiusKm) setRegionRadiusKm(geometry.radiusKm);
      } else {
        setRegionManifest(null);
        setRegionSourceDirname('');
      }
      setRegionPanelVisible(true);
      setRegionOpsMessage(`Loaded saved region output: ${clean}`);
    } catch (err) {
      setRegionError(err.message || 'Failed to load saved region output');
    }
  }, [loadPyPSANetworkFromFile, pypsaGranularity, extractRegionGeometryFromManifest, extractRegionSourceDirname]);

  const deleteSavedRegionRun = useCallback(async (run) => {
    const clean = String(run?.dirname || run || '').trim();
    const runGranularity = String(run?.granularity_prefix || '').trim() || pypsaGranularity;
    if (!clean) return;
    setRegionError(null);
    setRegionOpsMessage('');
    try {
      const resp = await fetch(`${API_BASE}/api/pypsa/simulate-region/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dirname: clean,
          granularity_prefix: runGranularity,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      if (clean === resolvedRegionDirname) {
        setRegionManifest(null);
        setRegionS3Folder('');
        setRegionDirname('');
        setRegionSourceDirname('');
      }
      setRegionOpsMessage(`Deleted saved region output: ${clean}`);
      await loadRegionSavedRuns();
    } catch (err) {
      setRegionError(err.message || 'Failed to delete saved region output');
    }
  }, [pypsaGranularity, resolvedRegionDirname, loadRegionSavedRuns]);

  const saveCurrentRegionRun = useCallback(async (name = '') => {
    const sourceDirname = String(resolvedRegionDirname || '').trim();
    if (!sourceDirname) {
      setRegionError('No solved region output is selected to save.');
      return;
    }
    setRegionError(null);
    setRegionOpsMessage('');
    setRegionSaveBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/api/pypsa/simulate-region/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_dirname: sourceDirname,
          granularity_prefix: activeRegionGranularity,
          name: String(name || '').trim(),
          rename: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setSelectedPyPSAFile(String(data.dirname || '').trim());
      setRegionDirname(String(data.dirname || '').trim());
      setRegionS3Folder(String(data.s3_folder || '').trim());
      setRegionOpsMessage(`Renamed region output to: ${data.dirname}`);
      await loadRegionSavedRuns();
    } catch (err) {
      setRegionError(err.message || 'Failed to save current region output');
    } finally {
      setRegionSaveBusy(false);
    }
  }, [resolvedRegionDirname, activeRegionGranularity, loadRegionSavedRuns]);

  const closeRegionPanel = useCallback(() => {
    setRegionPanelVisible(false);
    setRegionCenter(null);
    setRegionRadiusKm(120);
    setRegionManifest(null);
    setRegionError(null);
    setRegionS3Folder('');
    setRegionDirname('');
    setRegionSourceDirname('');
    setRegionOpsMessage('');
    setRegionContextMenu(null);
  }, []);

  const solveRegion = useCallback(async (override = null) => {
    // Allow callers (e.g. the chatbot's combined select+solve intent) to pass
    // explicit lat/lon/radius so we don't depend on state having flushed yet.
    const effectiveLat = override?.lat ?? regionCenter?.lat;
    const effectiveLon = override?.lon ?? regionCenter?.lon;
    const effectiveRadius = override?.radiusKm ?? regionRadiusKm;
    if (!selectedPyPSAFile || effectiveLat == null || effectiveLon == null || regionSolving) return;
    setRegionSolving(true);
    setRegionError(null);
    setRegionManifest(null);
    setRegionS3Folder('');
    setRegionDirname('');
    setRegionSourceDirname(String(selectedPyPSAFile || '').trim());
    try {
      const granularityPrefix = extractResolutionLabelFromName(selectedPyPSAFile) || pypsaGranularity;
      const networkSizeMatch = String(granularityPrefix || '').match(/(\d+)$/);
      const networkSize = networkSizeMatch ? Number(networkSizeMatch[1]) : 0;
      const countryCode = (selectedPyPSACountryCode || '').toUpperCase();
      const labelBase = countryCode ? `${countryCode}_region` : 'Region';
      const resp = await fetch(`${API_BASE}/api/pypsa/simulate-region`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_dirname: selectedPyPSAFile,
          granularity_prefix: granularityPrefix,
          center: { lat: effectiveLat, lon: effectiveLon },
          radius_km: effectiveRadius,
          solver: 'highs',
          label: labelBase,
          country: countryCode || undefined,
          network_size: networkSize || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setRegionManifest(data.region_manifest || null);
      setRegionSourceDirname(
        extractRegionSourceDirname(data.region_manifest) || String(selectedPyPSAFile || '').trim()
      );
      setRegionS3Folder(String(data.s3_folder || '').trim());
      const solvedDirname = String(data.dirname || '').trim();
      setRegionDirname(solvedDirname);
      setRegionOpsMessage(`Region solve output saved at ${solvedDirname || 'S3 folder'}`);
      await loadRegionSavedRuns();
      if (!data.region_manifest) {
        setRegionError('Region solve completed but manifest was not returned — topology halo unavailable.');
      }
    } catch (err) {
      setRegionError(err.message || 'Region solve failed');
    } finally {
      setRegionSolving(false);
    }
  }, [
    selectedPyPSAFile,
    selectedPyPSACountryCode,
    regionCenter,
    regionRadiusKm,
    regionSolving,
    pypsaGranularity,
    extractRegionSourceDirname,
    loadRegionSavedRuns,
  ]);

  useEffect(() => {
    if (engine !== 'PyPSA Engine' || !regionPanelVisible || regionSavedRunsLoadedRef.current) return;
    loadRegionSavedRuns();
  }, [engine, regionPanelVisible, loadRegionSavedRuns]);

  const loadJouleModelAtSize = useCallback(async (value) => {
    if (jouleModelLoading || value === jouleModelSize) return;
    const option = JOULE_MODEL_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    setJouleModelLoading(true);
    setJouleModelSize(value);
    try {
      // The folder lives under the 'pypsa/' S3 prefix regardless of size.
      await loadPyPSANetworkFromFile(option.dirname, 'pypsa', { forceDistill: true });
    } catch (err) {
      console.error('Failed to load Joule Model:', err);
      setJouleModelSize(null);
    } finally {
      setJouleModelLoading(false);
    }
  }, [jouleModelLoading, jouleModelSize]);

  const switchPypsaGranularity = useCallback(async (nextGranularity) => {
    if (!nextGranularity || pypsaLoading) return;
    const activeGranularity = extractResolutionLabelFromName(selectedPyPSAFile) || pypsaGranularity;
    if (nextGranularity === activeGranularity) return;

    // Capture context BEFORE we wipe state.
    // - For COUNTRY builds we want the country name as the re-run prompt so a
    //   stale lastEMILPrompt (e.g. a city someone navigated to) can't drift
    //   us to a different country.
    // - For SUBNET builds (build_subnet_<place>_pypsa_*) we want the ORIGINAL
    //   city prompt so changing granularity stays inside the same subnet
    //   instead of expanding to the parent country.
    const previousCountryCode = String(selectedPyPSACountryCode || '').trim().toUpperCase();
    const previousCountryName = previousCountryCode ? countryCodeToName(previousCountryCode) : '';
    const previousIsSubnet = /^build_subnet_/i.test(String(selectedPyPSAFile || ''));

    setPypsaGranularity(nextGranularity);
    setSelectedPyPSAFile('');
    setPypsaFacilitiesData([]);
    setPypsaConnections([]);
    setPypsaGeoJsonOverlays([]);
    setSelectedLineInfo(null);
    setSelectedNode(null);
    setConnections([]);

    // Fast path for switches like Full -> 1024:
    // reuse current distill naming pattern and try loading directly before rebuilding.
    const directCandidates = rewriteDistillNameForGranularity(selectedPyPSAFile, nextGranularity);
    if (directCandidates.length > 0) {
      setSolveNetworkStaging(true);
      setSolveNetworkLogsCollapsed(false);
      try {
        await loadPyPSAFiles(nextGranularity);
        for (const directCandidate of directCandidates) {
          try {
            setSolveNetworkStageMessage(`Trying existing output: ${directCandidate}`);
            // eslint-disable-next-line no-await-in-loop
            const directResult = await loadPyPSANetworkFromFile(directCandidate, nextGranularity, { forceDistill: true });
            const directCount = new Set((directResult?.groupedFacilities || []).map(f => f.locationKey).filter(Boolean)).size;
            if (directCount > 0) {
              setSelectedPyPSAFile(directCandidate);
              setSolveNetworkStageMessage([
                `Loaded existing output directly for ${nextGranularity}.`,
                `Loaded folder: ${directCandidate}`,
                `${directCount} grouped node locations ready on map`,
              ].join('\n'));
              setSolveNetworkStaging(false);
              return;
            }
          } catch (_) {
            // try next naming candidate
          }
        }
      } finally {
        setSolveNetworkStaging(false);
      }
    }

    // Re-run prompt resolution — order is important:
    //   1. Whatever is CURRENTLY in the Ask EMIL input field. The user's
    //      explicit instruction is "always consider the placeholder", so a
    //      live edit takes priority over any prior submitted prompt.
    //   2. The last submitted prompt (lastEMILPrompt) — survives across
    //      sessions where the bar got cleared.
    //   3. For full-country builds only, the country name derived from the
    //      loaded country code — defensive against stale lastEMILPrompt
    //      drifting to a different country.
    const inputPrompt = String(solveNetworkSearch || '').trim();
    const reRunPrompt = inputPrompt
      || lastEMILPrompt
      || (previousIsSubnet ? '' : previousCountryName);
    if (reRunPrompt) {
      // Always bypass find-existing here. The cache match (e.g. "rome" → IT
      // country build) is exactly what made granularity changes drift to the
      // wrong scope. The runner's decide_mode will pick the right build
      // (subnet for cities, country for country names) at the new granularity.
      setSolveNetworkStageMessage(`Re-building "${reRunPrompt}" at ${nextGranularity}…`);
      setSolveNetworkLogsCollapsed(false);
      setSolveNetworkLoadingStateIndex(0);
      setSolveNetworkStaging(true);
      try {
        const runResp = await fetch(`${API_BASE}/api/pypsa/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: reRunPrompt,
            granularity_prefix: nextGranularity,
            model_type: 'pypsa_ssh',
            planning_horizon: Number(planningHorizonYear) || 2025,
            run_mode: runMode === 'build_only' ? 'build_only' : (runMode === 'solve_existing' ? 'solve_existing' : 'build_solve'),
          }),
        });
        const runData = await runResp.json();
        if (!runResp.ok || runData.error) throw new Error(runData.error || `HTTP ${runResp.status}`);
        const dirname = String(runData.dirname || '').trim();
        if (!dirname) throw new Error('runner did not return a dirname');
        const resolvedGranularity = runData.granularity_prefix || nextGranularity;
        const result = await loadPyPSANetworkFromFile(dirname, resolvedGranularity, { forceDistill: true });
        setSelectedPyPSAFile(dirname);
        const inferredCC = extractPypsaCountryCode(dirname).toUpperCase();
        if (inferredCC) setSelectedPyPSACountryCode(inferredCC);
        if (resolvedGranularity !== nextGranularity) setPypsaGranularity(resolvedGranularity);
        setLastEMILPrompt(reRunPrompt);
        setSolveNetworkStageMessage([
          `Granularity switched to ${resolvedGranularity}.`,
          `Loaded folder: ${dirname}`,
          runData.improved_prompt ? `Improved prompt: ${runData.improved_prompt}` : null,
          (result?.groupedFacilities || []).length
            ? `${new Set((result.groupedFacilities || []).map(f => f.locationKey).filter(Boolean)).size} grouped node locations ready on map`
            : null,
        ].filter(Boolean).join('\n'));
      } catch (error) {
        setSolveNetworkStageMessage(`Granularity switch failed: ${error.message}`);
      } finally {
        setSolveNetworkStaging(false);
      }
      return;
    }

    setSolveNetworkStageMessage(`Granularity set to ${nextGranularity}. Ask EMIL to load a network at this resolution.`);
    await loadPyPSAFiles(nextGranularity);
  }, [pypsaGranularity, pypsaLoading, selectedPyPSAFile, selectedPyPSACountryCode, countryCodeToName, lastEMILPrompt, solveNetworkSearch, extractPypsaCountryCode, handleSolveNetworkCommand, loadPyPSAFiles, planningHorizonYear, runMode]);

  // ── Map-agent context builders ──────────────────────────────────────────────
  // Snapshot the current map state for the LLM so it can resolve pronouns
  // ("here", "this region", "selected marker") and follow-ups ("make it 50 km").
  // Kept as a callback so each chatbot turn picks up fresh state at call time.
  const buildMapContext = useCallback(() => {
    const view = mapViewRef.current || {};
    const currentLandOverlay = landOverlayRef.current;
    // In overlay, Geography is shared and the dropdown is only the workspace
    // to return to. Its standalone country filter must not scope navigation.
    const isGasNetwork = !atlasOverlayMode && atlasNetworkCarrier === 'gas';
    const isWaterNetwork = !atlasOverlayMode && atlasNetworkCarrier === 'water';
    const isLiquidsNetwork = !atlasOverlayMode && atlasNetworkCarrier === 'liquids';
    const isLogisticsNetwork = !atlasOverlayMode && atlasNetworkCarrier === 'logistics';
    const isInfrastructureNetwork = isGasNetwork || isWaterNetwork || isLiquidsNetwork || isLogisticsNetwork;
    const activeFacilities = isGasNetwork
      ? gasFacilitiesData
      : isWaterNetwork
        ? waterFacilitiesData
        : isLiquidsNetwork
          ? liquidsFacilitiesData
          : isLogisticsNetwork
            ? logisticsFacilitiesData
            : pypsaFacilitiesData;
    const infrastructureCountryFilter = isGasNetwork
      ? gasCountryFilter
      : isWaterNetwork
        ? waterCountryFilter
        : isLiquidsNetwork
          ? liquidsCountryFilter
          : logisticsCountryFilter;
    const infrastructureCountryCodes = infrastructureCountryFilter
      ? infrastructureCountryFilter.split(',').map((code) => code.trim()).filter(Boolean)
      : [];
    const selectedMarker = selectedNode
      ? (() => {
          const sources = { electricity: pypsaFacilitiesData, gas: gasFacilitiesData,
            water: waterFacilitiesData, liquids: liquidsFacilitiesData, logistics: logisticsFacilitiesData };
          const matches = atlasOverlayMode ? atlasOverlayCarriers.flatMap(networkCarrier =>
            (sources[networkCarrier] || []).filter(f => String(f.id || '') === String(selectedNode || ''))
              .map(facility => ({ facility, networkCarrier }))) : [];
          // IDs can collide across independent source databases. Do not give
          // the model another carrier's coordinates when ownership is unclear.
          if (atlasOverlayMode && matches.length !== 1) return { id: selectedNode, ambiguous: matches.length > 1 };
          const facility = atlasOverlayMode ? matches[0].facility : (activeFacilities || []).find(
            (f) => String(f.id || '') === String(selectedNode || ''),
          );
          if (!facility) return { id: selectedNode };
          return {
            id: facility.id,
            networkCarrier: atlasOverlayMode ? matches[0].networkCarrier : atlasNetworkCarrier,
            name: facility.name,
            bus: facility.bus,
            carrier: facility.carrier || facility.type,
            lat: Number(facility.latitude),
            lon: Number(facility.longitude),
          };
        })()
      : null;
    return {
      center: {
        lat: Number.isFinite(view.lat) ? view.lat : null,
        lng: Number.isFinite(view.lng) ? view.lng : null,
      },
      zoom: Number.isFinite(view.zoom) ? view.zoom : null,
      aiMapControlEnabled,
      mapDisplay: {
        nodeMarkers: showMapNodes,
        geographicBoundaries: showGeographicBoundaries,
        domainControls: !mapControlsCollapsed,
      },
      // The currently SELECTED region (a circle on the map) — may or may not
      // be solved yet. Whichever is set, the LLM treats it as "here" / "this region".
      selectedLocation: regionCenter
        ? { lat: regionCenter.lat, lon: regionCenter.lon, radiusKm: regionRadiusKm }
        : null,
      lastSearchedLocation: lastSearchedLocation || null,
      // Last solved region: combines the manifest's center+radius with the
      // dirname so refine_existing_region knows what to re-run.
      lastSolvedRegion: regionManifest
        ? {
            location: regionManifest.label || null,
            radiusKm: Number(regionManifest.radius_km) || regionRadiusKm,
            center: regionManifest.center || (regionCenter ? { lat: regionCenter.lat, lon: regionCenter.lon } : null),
            dirname: regionDirname || null,
          }
        : null,
      selectedMarker,
      // Useful runtime hints so the LLM can pick sensible defaults.
      networkCarrier: atlasOverlayMode ? 'overlay' : atlasNetworkCarrier,
      workspaceCarrier: atlasNetworkCarrier,
      networkOverlayMode: atlasOverlayMode,
      overlayNetworkCarriers: atlasOverlayMode ? atlasOverlayCarriers : [atlasNetworkCarrier],
      landConstraints: {
        enabled: Boolean(currentLandOverlay.enabled),
        categories: currentLandOverlay.categories,
        countries: currentLandOverlay.countries,
        opacity: currentLandOverlay.opacity,
      },
      activeNetwork: atlasOverlayMode ? null : isGasNetwork ? 'atlas_gas.db' : isWaterNetwork ? 'atlas_water.db' : isLiquidsNetwork ? 'atlas_liquids.db' : isLogisticsNetwork ? 'atlas_logistics.db' : (selectedPyPSAFile || null),
      activeCountryCode: isInfrastructureNetwork ? (infrastructureCountryCodes[0] || null) : (selectedPyPSACountryCode || null),
      loadedCountryCodes: isInfrastructureNetwork ? infrastructureCountryCodes : loadedPypsaCountryCodes,
      loadedCountries: isInfrastructureNetwork
        ? (infrastructureCountryCodes.length ? infrastructureCountryCodes.map(countryCodeToName) : ['All Europe'])
        : loadedPypsaNetworks.map((network) => network.countryName || network.countryCode),
      granularity: isInfrastructureNetwork ? null : (pypsaGranularity || null),
      networkResolution: isGasNetwork ? 'transmission_topology' : isWaterNetwork || isLiquidsNetwork || isLogisticsNetwork ? 'source_topology' : (currentAtlasResolutionKey || null),
      networkResolutionByCountry: isInfrastructureNetwork ? null : Object.fromEntries(
        loadedPypsaNetworks.map((network) => [network.countryCode, network.resolutionKey || atlasResolutionKeyForEntry(network)])
      ),
      mixedGranularity: mixedGranularityPlan,
      networkResolutionScope: atlasOverlayMode ? 'electricity' : atlasNetworkCarrier,
      visibleMapLayers: [
        ...ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false),
        ...(gridAccessOverlay.enabled ? ['Access'] : []),
      ],
      hiddenCarrierKeys: [...hiddenCarriers],
      generationMixPies: isInfrastructureNetwork || atlasOverlayMode ? false : Boolean(showGenerationMix),
      regionPanelOpen: !!regionPanelVisible,
      runMode,
      currentModelSettings: ATLAS_AGENT_PARAMETER_CATALOG.reduce((settings, definition) => ({
        ...settings,
        [definition.key]: pypsaSettings[definition.key],
      }), {}),
      controlSchema: {
        overlayScope: 'When networkOverlayMode is true, loadedCountryCodes are shared Geography for all overlayNetworkCarriers. networkCarrier="overlay" describes the combined view; workspaceCarrier only chooses the standalone workspace on exit. networkResolution describes the electricity cache; other carriers keep their source topology. There is no single activeNetwork in an overlay.',
        mapDisplay: {
          intent: 'set_map_display',
          params: { node_markers: 'optional boolean', geographic_boundaries: 'optional boolean' },
          description: 'Show/hide node dots or geographic region outlines without changing data, layers, countries, resolution, camera, or the sidebar. Omitted fields stay unchanged. toggle_domain_controls only opens/closes the sidebar; it never hides geographic boundaries.',
        },
        countrySelection: {
          intents: ['load_country', 'add_country', 'remove_country', 'focus_country'],
          countries: 'Non-empty array of country names or ISO2 codes. Include every requested country in one action, never a combined place string.',
          modes: 'load_country replaces the complete selection; add_country preserves existing countries; remove_country removes only the listed countries; focus_country accepts one country.',
          example: { intent: 'load_country', params: { countries: ['BE', 'FR'], resolution: 'nuts3', layers: ['Grid', 'Supply'] } },
        },
        mapViewOperations: ['zoom_in', 'zoom_out', 'fit_selection', 'isolate', 'reset'],
        networkCarriers: ['electricity', 'gas', 'water', 'liquids', 'logistics'],
        landConstraintCategories: ATLAS_LAND_CATEGORY_ORDER,
        landConstraintCountries: landStatus?.countries?.map((country) => country.code) || [],
        networkResolutions: ['bidding_zone', 'ehighway', 'nuts1', 'nuts2', 'nuts3', 'full'],
        mapLayers: ATLAS_AGENT_MAP_LAYERS,
        waterAssetFilters: Object.keys(WATER_ASSET_FILTERS),
        availableCountryCodes: isGasNetwork
          ? (gasStatus?.countries || [])
          : isWaterNetwork
            ? (waterStatus?.countries || [])
            : isLiquidsNetwork
              ? (liquidsStatus?.countries || [])
              : isLogisticsNetwork
                ? (logisticsStatus?.countries || [])
          : availablePypsaCountryOptions.map((option) => option.countryCode),
        modelSettings: ATLAS_AGENT_PARAMETER_CATALOG.map((definition) => ({
          key: definition.key,
          type: definition.type,
          ...(definition.options ? { options: definition.options } : {}),
          ...(definition.values ? { values: [...new Set(Object.values(definition.values))] } : {}),
          ...(Number.isFinite(definition.min) ? { min: definition.min } : {}),
          ...(Number.isFinite(definition.max) ? { max: definition.max } : {}),
          ...(definition.integer ? { integer: true } : {}),
        })),
      },
    };
  }, [
    selectedNode, pypsaFacilitiesData, gasFacilitiesData, waterFacilitiesData, liquidsFacilitiesData, logisticsFacilitiesData,
    regionCenter, regionRadiusKm, regionManifest, regionDirname, regionPanelVisible,
    selectedPyPSAFile, selectedPyPSACountryCode, pypsaGranularity,
    loadedPypsaCountryCodes, loadedPypsaNetworks,
    currentAtlasResolutionKey, mixedGranularityPlan, atlasDomainVisibility, hiddenCarriers, showGenerationMix,
    showMapNodes, showGeographicBoundaries, mapControlsCollapsed,
    lastSearchedLocation, runMode, pypsaSettings, availablePypsaCountryOptions, aiMapControlEnabled,
    atlasNetworkCarrier, atlasOverlayMode, atlasOverlayCarriers, landOverlay.enabled, landOverlay.categories, landOverlay.countries, gridAccessOverlay.enabled, gasCountryFilter, gasStatus, waterCountryFilter, waterStatus,
    liquidsCountryFilter, liquidsStatus, logisticsCountryFilter, logisticsStatus, countryCodeToName,
  ]);

  useEffect(() => {
    mapAgentObservedContextRef.current = buildMapContext();
  }, [buildMapContext]);

  // Conversation memory: last 10 turns of the chatbot, mapped into the simple
  // {role, content} shape the LLM expects. We snapshot from mapAgentMessages
  // (already in state) — no separate store needed.
  const buildConversationHistory = useCallback(() => {
    const recent = (mapAgentMessages || []).slice(-10);
    return recent
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: String(m.text || '').slice(0, 400) }));
  }, [mapAgentMessages]);

  // City-aware network navigation for local mode. This deliberately reuses
  // the existing country caches and map focus state; it does not introduce a
  // second region-distillation path alongside the one owned by Nohm.
  const loadCountryAndFocusCity = useCallback(async (rawPlace, pushReply) => {
    const place = String(rawPlace || '')
      .trim()
      .replace(/^(?:the\s+)/i, '')
      .replace(/[.!?]+$/g, '')
      .trim();
    if (!place) return { handled: false };

    // Country requests already worked and must not become dependent on the
    // geocoder. Keep them on the established country-loading path.
    if (pypsaCountryCodeFromRegion(place)) return { handled: false };

    const selectedCountryQuery = loadedPypsaCountryCodes.length
      ? `&countries=${encodeURIComponent(loadedPypsaCountryCodes.join(','))}`
      : '';
    const geocodeResp = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(place)}${selectedCountryQuery}`);
    const geocode = await geocodeResp.json();
    if (!geocodeResp.ok || geocode?.error) {
      throw new Error(geocode?.error || `Could not find "${place}"`);
    }

    const latitude = Number(geocode?.lat);
    const longitude = Number(geocode?.lon);
    const countryCode = String(geocode?.country_code || '').trim().toUpperCase();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !countryCode) {
      throw new Error(`Could not determine the city and parent country for "${place}".`);
    }

    const countryName = countryCodeToName(countryCode) || geocode.country_name || countryCode;
    const alreadyLoaded = loadedPypsaCountryCodes.includes(countryCode);
    let loadedFilename = null;

    if (!alreadyLoaded) {
      const preferredNodes = selectedCachedNetworkLevel && !selectedCachedNetworkLevel.isFull
        ? Number(selectedCachedNetworkLevel.accessNodes)
        : null;
      const preferredFilename = Number.isFinite(preferredNodes)
        ? `base_${countryCode}_c${String(preferredNodes).padStart(3, '0')}.nc`
        : null;
      const candidateNames = [preferredFilename, `base_${countryCode}.nc`].filter(Boolean);
      const networkEntry = candidateNames
        .map((candidate) => primaryPypsaSourceEntries.find(
          (entry) => String(entry?.filename || '').trim().toLowerCase() === candidate.toLowerCase()
        ))
        .find(Boolean);

      // No local country cache: return control to the existing Nohm/remote
      // loader, which may have a suitable pre-built or distill output.
      if (!networkEntry) return { handled: false, geocode };

      loadedFilename = networkEntry.filename;
      pushReply(`Loading the ${countryName} network, then focusing on ${place}…`);
      setFullEuOnly(false);
      const nextCountryNames = [
        ...loadedPypsaNetworks.map((network) => network.countryName || network.countryCode),
        countryName,
      ];
      setPypsaSettings((previous) => ({ ...previous, region: [...new Set(nextCountryNames)].join(' + ') }));
      setSelectedPyPSACountryCode(countryCode);
      setSelectedPypsaListFile(loadedFilename);
      await loadPyPSANetworkFromFile(loadedFilename, pypsaGranularity, {
        forceDistill: false,
        append: loadedPypsaNetworks.length > 0,
      });
    }

    const focusLabel = geocode.display_name || place;
    setEmilFocusLocation({ latitude, longitude, zoom: 10, label: focusLabel });
    setLastSearchedLocation({ name: place, lat: latitude, lon: longitude, label: focusLabel });
    setLastEMILPrompt(place);
    pushReply(loadedFilename
      ? `Loaded ${countryName} and focused on ${place}. This is a map view of the existing network; no new regional distillation was created.`
      : `Focused on ${place} within the loaded ${countryName} network.`);
    return { handled: true, geocode, loadedFilename };
  }, [
    API_BASE,
    countryCodeToName,
    loadPyPSANetworkFromFile,
    loadedPypsaCountryCodes,
    loadedPypsaNetworks,
    primaryPypsaSourceEntries,
    pypsaGranularity,
    selectedCachedNetworkLevel,
  ]);

  // ── Structured-intent dispatcher ───────────────────────────────────────────
  // Returns true if it handled the intent (the caller should NOT fall back to
  // the regex chain). Returns false for `unknown` so the regex chain still
  // catches direct command formats like "granularity 512".
  const dispatchMapAgentIntent = useCallback(async (intent, params, ctx, pushReply) => {
    const p = params && typeof params === 'object' ? params : {};
    // Coordinate resolution helper. Order of preference:
    //   1. Explicit lat/lon in params (LLM was confident).
    //   2. Geocode params.location.
    //   3. use_map_context flag → currently selected region center.
    //   4. Falls back through last searched / last solved / live map center.
    const resolveCoords = async () => {
      if (Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))) {
        return { lat: Number(p.lat), lon: Number(p.lon), label: p.location || null };
      }
      const loc = String(p.location || '').trim();
      if (loc) {
        try {
          const selectedCountries = Array.isArray(ctx.loadedCountryCodes)
            ? ctx.loadedCountryCodes.filter(Boolean)
            : [];
          const countryQuery = selectedCountries.length
            ? `&countries=${encodeURIComponent(selectedCountries.join(','))}`
            : '';
          const resp = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(loc)}${countryQuery}`);
          const data = await resp.json();
          if (resp.ok && Number.isFinite(Number(data?.lat)) && Number.isFinite(Number(data?.lon))) {
            return { lat: Number(data.lat), lon: Number(data.lon), label: data.display_name || loc };
          }
        } catch (_) { /* fall through */ }
        return null;
      }
      // Implicit ("here", "there", "selected region", "make it bigger") —
      // walk the context in order of specificity.
      if (ctx.selectedLocation) {
        return { lat: ctx.selectedLocation.lat, lon: ctx.selectedLocation.lon, label: 'selected region' };
      }
      if (ctx.lastSearchedLocation) {
        return { lat: ctx.lastSearchedLocation.lat, lon: ctx.lastSearchedLocation.lon, label: ctx.lastSearchedLocation.label || ctx.lastSearchedLocation.name };
      }
      if (ctx.lastSolvedRegion?.center) {
        return { lat: ctx.lastSolvedRegion.center.lat, lon: ctx.lastSolvedRegion.center.lon, label: ctx.lastSolvedRegion.location || 'last solved region' };
      }
      if (ctx.selectedMarker && Number.isFinite(ctx.selectedMarker.lat) && Number.isFinite(ctx.selectedMarker.lon)) {
        return { lat: ctx.selectedMarker.lat, lon: ctx.selectedMarker.lon, label: ctx.selectedMarker.name || 'selected marker' };
      }
      if (Number.isFinite(ctx.center?.lat) && Number.isFinite(ctx.center?.lng)) {
        return { lat: ctx.center.lat, lon: ctx.center.lng, label: 'current map view' };
      }
      return null;
    };

    const clampRadius = (r) => Math.max(5, Math.min(500, Math.round(Number(r))));
    const normalizeGranularityToken = (raw) => {
      const tok = String(raw || '').toLowerCase().trim();
      if (!tok) return null;
      if (tok === 'full' || tok === 'pypsa') return 'pypsa';
      if (['37', '128', '256', '512', '1024'].includes(tok)) return `pypsa_${tok}`;
      return null;
    };
    const normalizeNetworkCarrier = (raw) => {
      const token = String(raw || '').trim().toLowerCase();
      if (['gas', 'methane', 'methane gas', 'natural gas'].includes(token)) return 'gas';
      if (['water', 'wastewater', 'water and wastewater'].includes(token)) return 'water';
      if (['liquids', 'liquid fuels', 'oil', 'oil network', 'petroleum'].includes(token)) return 'liquids';
      if (['logistics', 'port', 'ports', 'port network', 'ports atlas', 'port atlas', 'air freight', 'air-freight', 'airfield', 'airfields'].includes(token)) return 'logistics';
      if (['electricity', 'electric', 'power'].includes(token)) return 'electricity';
      return atlasOverlayModeRef.current ? 'overlay' : (atlasNetworkCarrierRef.current || 'electricity');
    };
    const infrastructureCarrier = normalizeNetworkCarrier(
      p.network_carrier || p.carrier || ctx.networkCarrier,
    );
    const isSourceInfrastructure = ['gas', 'water', 'liquids', 'logistics'].includes(infrastructureCarrier);
    const electricityOnlyIntents = new Set([
      'select_region', 'update_radius', 'solve_region', 'solve_around_location', 'refine_existing_region',
      'set_temporal_resolution', 'set_model_settings', 'set_run_mode', 'open_settings', 'build_network',
      'set_granularity', 'step_granularity', 'load_full_eu', 'set_model_standard',
      'save_region', 'list_saved_regions', 'load_saved_region', 'delete_saved_region',
    ]);
    if (isSourceInfrastructure && electricityOnlyIntents.has(intent)) {
      const label = infrastructureCarrier === 'gas' ? 'methane' : infrastructureCarrier === 'water' ? 'water' : infrastructureCarrier === 'liquids' ? 'oil and liquids' : 'ports and air freight';
      const feature = intent.includes('region') ? 'Regional selection and solving apply'
        : intent.includes('temporal') ? 'Temporal resolution applies'
          : intent.includes('setting') || intent === 'open_settings' ? 'Model settings apply'
            : intent.includes('granularity') || intent.includes('full_eu') || intent === 'set_model_standard' ? 'PyPSA granularity applies'
              : intent.includes('run_mode') || intent === 'build_network' ? 'Build and solve controls apply'
                : 'That operation applies';
      pushReply(`${feature} to electricity models. The ${label} Atlas is a local source-data map; I can change its country, navigate to places, control Grid, Supply, Demand, and Storage, and filter its asset classes.`);
      return true;
    }

    switch (intent) {
      case 'set_land_constraints':
        return executeAtlasDirectAction({
          type: 'land_constraints',
          visible: p.visible !== false,
          categories: Array.isArray(p.categories) ? p.categories : [],
          mode: p.mode || 'replace',
          countries: Array.isArray(p.countries) ? p.countries : Array.isArray(p.country_codes) ? p.country_codes : undefined,
          countryMode: p.country_mode || 'replace',
          opacity: p.opacity,
          panelOpen: p.panel_open,
        }, pushReply);

      case 'set_network_overlay':
        return executeAtlasDirectAction({
          type: 'network_overlay',
          visible: p.visible !== false,
          carriers: Array.isArray(p.network_carriers) ? p.network_carriers.map(normalizeNetworkCarrier) : Array.isArray(p.carriers) ? p.carriers.map(normalizeNetworkCarrier) : [],
        }, pushReply);

      case 'set_network_carrier':
        return executeAtlasDirectAction({
          type: 'network_carrier',
          carrier: normalizeNetworkCarrier(p.network_carrier || p.carrier),
        }, pushReply);

      case 'navigate_to_location': {
        if (!aiMapControlEnabled) {
          pushReply('AI map control is off. Turn on “AI controls map” in EMIL to let me change the viewport.');
          return true;
        }
        const coords = await resolveCoords();
        if (!coords) {
          pushReply('Where do you want to go? Try "Milan" or "near Dublin".');
          return true;
        }
        setEmilFocusLocation({ latitude: coords.lat, longitude: coords.lon, zoom: 9, label: coords.label });
        setLastSearchedLocation({ name: p.location || coords.label, lat: coords.lat, lon: coords.lon, label: coords.label });
        pushReply(`Moved to ${coords.label || `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`}.`);
        return true;
      }

      case 'select_region': {
        if (!selectedPyPSAFile) {
          pushReply('Load a network first (e.g. "country italy") before selecting a region.');
          return true;
        }
        const coords = await resolveCoords();
        if (!coords) {
          pushReply('No location to anchor the region. Try "select milan at 30 km" or pan the map there first.');
          return true;
        }
        const radius = clampRadius(Number(p.radius_km) || regionRadiusKm || 120);
        setRegionCenter({ lat: coords.lat, lon: coords.lon });
        setRegionRadiusKm(radius);
        setRegionManifest(null);
        setRegionError(null);
        setRegionS3Folder('');
        setRegionDirname('');
        setRegionSourceDirname('');
        setRegionOpsMessage('');
        setRegionPanelVisible(true);
        setRegionContextMenu(null);
        if (p.location) setLastSearchedLocation({ name: p.location, lat: coords.lat, lon: coords.lon, label: coords.label });
        pushReply(`Region set: ${coords.label || `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`} at ${radius} km. Click "Solve region" or say "solve region".`);
        return true;
      }

      case 'update_radius': {
        if (!regionCenter) {
          pushReply('No region is selected yet. First run: "select sardinia at 5 km radius".');
          return true;
        }
        let next = Number(p.radius_km);
        if (!Number.isFinite(next)) {
          const delta = Number(p.radius_delta_km);
          if (Number.isFinite(delta)) next = Number(regionRadiusKm || 0) + delta;
        }
        if (!Number.isFinite(next) || next <= 0) {
          pushReply('Please give a valid radius, e.g. "make it 30 km".');
          return true;
        }
        const clamped = clampRadius(next);
        setRegionRadiusKm(clamped);
        setRegionPanelVisible(true);
        pushReply(`Radius updated to ${clamped} km.`);
        return true;
      }

      case 'solve_region': {
        if (!selectedPyPSAFile) {
          pushReply('Load a network first (e.g. "country italy") before running a region solve.');
          return true;
        }
        if (!regionCenter) {
          pushReply('No region is selected. First run: "select sardinia at 5 km radius".');
          return true;
        }
        if (regionManifest) {
          pushReply('That region is already solved. Run "close region" first to start a new solve.');
          return true;
        }
        if (regionSolving) { pushReply('Already solving — please wait.'); return true; }
        pushReply('Solving the selected region…');
        setRegionPanelVisible(true);
        try { await solveRegion(); pushReply('Region solve fired.'); }
        catch (err) { pushReply(`Region solve failed: ${err.message}`); }
        return true;
      }

      case 'solve_around_location':
      case 'refine_existing_region': {
        if (!selectedPyPSAFile) {
          pushReply('Load a network first (e.g. "country italy") before running a region solve.');
          return true;
        }
        const coords = await resolveCoords();
        if (!coords) {
          pushReply('Where should I solve? Try "solve region around milan at 30 km".');
          return true;
        }
        // For refine we honour the previous radius if no new one was given.
        const requested = Number(p.radius_km);
        const fallbackRadius = intent === 'refine_existing_region'
          ? (Number(ctx.lastSolvedRegion?.radiusKm) || regionRadiusKm || 120)
          : (regionRadiusKm || 120);
        const radius = clampRadius(Number.isFinite(requested) ? requested : fallbackRadius);
        setRegionCenter({ lat: coords.lat, lon: coords.lon });
        setRegionRadiusKm(radius);
        setRegionManifest(null);
        setRegionError(null);
        setRegionS3Folder('');
        setRegionDirname('');
        setRegionSourceDirname('');
        setRegionOpsMessage('');
        setRegionPanelVisible(true);
        setRegionContextMenu(null);
        if (p.location) setLastSearchedLocation({ name: p.location, lat: coords.lat, lon: coords.lon, label: coords.label });
        pushReply(`Solving around ${coords.label || 'selected point'} at ${radius} km…`);
        try {
          await solveRegion({ lat: coords.lat, lon: coords.lon, radiusKm: radius });
          pushReply('Region solve fired.');
        } catch (err) {
          pushReply(`Region solve failed: ${err.message}`);
        }
        return true;
      }

      case 'control_map_view': {
        if (!aiMapControlEnabled) {
          pushReply('AI map control is off. Turn on “AI controls map” in EMIL to let me zoom or isolate an area.');
          return true;
        }
        const operationAliases = {
          in: 'zoom_in', closer: 'zoom_in', zoom_in: 'zoom_in',
          out: 'zoom_out', wider: 'zoom_out', zoom_out: 'zoom_out',
          fit: 'fit_selection', fit_selection: 'fit_selection',
          isolate: 'isolate', reset: 'reset', overview: 'reset',
        };
        const operation = operationAliases[String(p.operation || p.direction || '').trim().toLowerCase()] || 'fit_selection';
        const steps = Math.max(1, Math.min(4, Math.round(Number(p.steps || p.amount) || 1)));
        if (['zoom_in', 'zoom_out', 'reset'].includes(operation)) {
          setEmilViewportCommand({ id: Date.now() + Math.random(), operation, steps });
          pushReply(operation === 'zoom_in'
            ? `Zoomed in${steps > 1 ? ` ${steps} levels` : ''}.`
            : operation === 'zoom_out'
              ? `Zoomed out${steps > 1 ? ` ${steps} levels` : ''}.`
              : 'Reset the map to the European overview.');
          return true;
        }

        const rawCountries = [
          ...(Array.isArray(p.countries) ? p.countries : []),
          p.country,
        ].filter(Boolean);
        const countryCodes = [...new Set(rawCountries.flatMap((value) => {
          const token = String(value || '').trim();
          const directCode = pypsaCountryCodeFromRegion(token);
          return directCode ? [directCode] : extractAtlasCountryGroups(token).flatMap((group) => group.countries);
        }))];
        if (!countryCodes.length && /^(?:selection|selected|loaded|current)$/i.test(String(p.location || '').trim())) {
          countryCodes.push(...(ctx.loadedCountryCodes || []));
        }
        if (countryCodes.length || (!p.location && (ctx.loadedCountryCodes || []).length)) {
          const targets = countryCodes.length ? countryCodes : ctx.loadedCountryCodes;
          setEmilViewportCommand({
            id: Date.now() + Math.random(),
            operation: 'fit_targets',
            countryCodes: targets,
          });
          pushReply(`Fit the view to ${targets.map(countryCodeToName).join(' and ')} without changing the loaded data.`);
          return true;
        }

        const location = String(p.location || p.zone || '').trim();
        const coords = location ? await resolveCoords() : null;
        if (coords) {
          setEmilViewportCommand({
            id: Date.now() + Math.random(),
            operation: 'center',
            latitude: coords.lat,
            longitude: coords.lon,
            zoom: Number(p.zoom) || 9,
          });
          setLastSearchedLocation({ name: location || coords.label, lat: coords.lat, lon: coords.lon, label: coords.label });
          pushReply(`Isolated ${coords.label || location} in the current map view.`);
          return true;
        }
        if (location) {
          // Named NUTS and bidding zones live in the loaded GeoJSON overlays;
          // the map component resolves those names directly against feature properties.
          setEmilViewportCommand({ id: Date.now() + Math.random(), operation: 'fit_targets', query: location });
          pushReply(`Fit the view to the loaded zone matching “${location}” without changing the network.`);
          return true;
        }
        setEmilViewportCommand({ id: Date.now() + Math.random(), operation: 'fit_targets' });
        pushReply('Fit the map to the currently visible network.');
        return true;
      }

      case 'set_mixed_granularity': {
        const { countries } = readAtlasModelCountries({
          ...p,
          country: p.focus_country || p.focusCountry || p.country,
        });
        const focusCountry = countries[0] || ctx.activeCountryCode || '';
        const level = (value, fallback) => normalizeAtlasResolution(value) || fallback;
        try {
          return executeAtlasDirectAction({
            type: 'mixed_granularity',
            focusCountry,
            networkCarrier: normalizeNetworkCarrier(p.network_carrier || p.carrier || ctx.networkCarrier),
            levels: {
              focus: level(p.focus_resolution, 'full'),
              adjacent: level(p.neighbour_resolution || p.neighbor_resolution, 'nuts3'),
              outer: level(p.outer_resolution, 'bidding_zone'),
            },
            domains: (Array.isArray(p.layers) ? p.layers : String(p.layers || '').split(','))
              .map(canonicalAtlasAgentLayer)
              .filter(Boolean),
            layerMode: String(p.layer_mode || 'replace').toLowerCase(),
          }, pushReply);
        } catch (error) {
          pushReply(`Could not build the mixed TSO view: ${error.message}`);
          return true;
        }
      }

      case 'set_network_resolution': {
        const resolution = normalizeAtlasResolution(p.resolution || p.granularity);
        if (!resolution) {
          pushReply('Choose Bidding zone, e-Highway, NUTS1, NUTS2, NUTS3, or Full / Nodal.');
          return true;
        }
        try {
          const domains = (Array.isArray(p.layers) ? p.layers : String(p.layers || '').split(','))
            .map(canonicalAtlasAgentLayer)
            .filter(Boolean);
          await executeAtlasDirectAction({
            type: 'set_resolution',
            networkCarrier: normalizeNetworkCarrier(p.network_carrier || p.carrier || ctx.networkCarrier),
            resolution,
            domains,
            layerMode: String(p.layer_mode || 'replace').toLowerCase(),
          }, pushReply);
        } catch (error) {
          pushReply(`Could not switch network resolution: ${error.message}`);
        }
        return true;
      }

      case 'step_network_resolution': {
        const direction = String(p.step || '').toLowerCase() === 'down' ? -1 : 1;
        try {
          const domains = (Array.isArray(p.layers) ? p.layers : String(p.layers || '').split(','))
            .map(canonicalAtlasAgentLayer)
            .filter(Boolean);
          await executeAtlasDirectAction({
            type: 'step_resolution',
            networkCarrier: normalizeNetworkCarrier(p.network_carrier || p.carrier || ctx.networkCarrier),
            direction,
            domains,
            layerMode: String(p.layer_mode || 'replace').toLowerCase(),
          }, pushReply);
        } catch (error) {
          pushReply(`Could not step network resolution: ${error.message}`);
        }
        return true;
      }

      case 'add_country':
      case 'focus_country':
      case 'remove_country': {
        const { countries: countryCodes, place } = readAtlasModelCountries(p);
        if (!countryCodes.length) {
          pushReply(`I could not identify the country “${place || 'requested'}”.`);
          return true;
        }
        if (intent === 'focus_country' && countryCodes.length !== 1) throw new Error('Focus one country, or use fit_selection to frame multiple countries.');
        const resolution = normalizeAtlasResolution(p.resolution || p.granularity);
        try {
          const domains = (Array.isArray(p.layers) ? p.layers : String(p.layers || '').split(','))
            .map(canonicalAtlasAgentLayer)
            .filter(Boolean);
          await executeAtlasDirectAction({
            type: 'country',
            mode: intent === 'add_country' ? 'add' : intent === 'remove_country' ? 'remove' : intent === 'focus_country' ? 'focus' : 'replace',
            countries: countryCodes,
            networkCarrier: normalizeNetworkCarrier(p.network_carrier || p.carrier || ctx.networkCarrier),
            resolution,
            domains,
            layerMode: String(p.layer_mode || 'replace').toLowerCase(),
            generationMix: Boolean(p.generation_mix),
          }, pushReply);
        } catch (error) {
          pushReply(`Could not update ${countryCodes.map(countryCodeToName).join(' and ')}: ${error.message}`);
        }
        return true;
      }

      case 'load_all_countries':
        return executeAtlasDirectAction({
          type: 'all_countries',
          networkCarrier: normalizeNetworkCarrier(p.network_carrier || p.carrier || ctx.networkCarrier),
          resolution: normalizeAtlasResolution(p.resolution || p.granularity) || 'bidding_zone',
          domains: (Array.isArray(p.layers) ? p.layers : String(p.layers || '').split(','))
            .map(canonicalAtlasAgentLayer)
            .filter(Boolean),
          layerMode: String(p.layer_mode || 'replace').toLowerCase(),
          generationMix: Boolean(p.generation_mix),
        }, pushReply);

      case 'load_country_groups': {
        const groupText = Array.isArray(p.groups) ? p.groups.join(' ') : String(p.groups || p.region_groups || '');
        const groups = extractAtlasCountryGroups(groupText);
        if (!groups.length) {
          pushReply(`I could not identify the regional group${Array.isArray(p.groups) && p.groups.length > 1 ? 's' : ''} requested.`);
          return true;
        }
        const domains = (Array.isArray(p.layers) ? p.layers : String(p.layers || '').split(','))
          .map(canonicalAtlasAgentLayer)
          .filter(Boolean);
        return executeAtlasDirectAction({
          type: 'country_groups',
          networkCarrier: normalizeNetworkCarrier(p.network_carrier || p.carrier || ctx.networkCarrier),
          groups: groups.map((group) => group.key),
          groupLabels: groups.map((group) => group.label),
          countries: [...new Set(groups.flatMap((group) => group.countries))],
          resolution: normalizeAtlasResolution(p.resolution || p.granularity) || 'nuts1',
          domains,
          layerMode: String(p.layer_mode || 'replace').toLowerCase(),
          generationMix: Boolean(p.generation_mix),
        }, pushReply);
      }

      case 'set_map_layers': {
        const requested = (Array.isArray(p.layers) ? p.layers : String(p.layers || '').split(','))
          .map(canonicalAtlasAgentLayer)
          .filter(Boolean);
        const mode = ['add', 'hide'].includes(String(p.mode || '').toLowerCase())
          ? String(p.mode).toLowerCase()
          : 'replace';
        try {
          const selected = await setAtlasDomainsFromAgent(requested, mode);
          if (p.generation_mix) setShowGenerationMix(true);
          pushReply(`${mode === 'hide' ? 'Hidden' : mode === 'add' ? 'Added' : 'Showing only'} ${selected.join(' and ')}${mode === 'hide' ? '' : ' on the map'}.`);
        } catch (error) {
          pushReply(`Could not change map layers: ${error.message}`);
        }
        return true;
      }

      case 'set_carrier_filters':
        return executeAtlasDirectAction({
          type: 'carriers',
          mode: String(p.mode || '').toLowerCase() === 'replace'
            ? 'only'
            : (['show', 'hide', 'only'].includes(String(p.mode || '').toLowerCase())
              ? String(p.mode).toLowerCase()
              : 'show'),
          carriers: Array.isArray(p.carriers) ? p.carriers.map((value) => String(value).toLowerCase()) : [],
        }, pushReply);

      case 'set_temporal_resolution': {
        const temporalValue = ({
          monthly: 'monthly', hourly: '1h', '1h': '1h', '3h': '3h', '6h': '6h',
          '12h': '12h', '24h': '24h', daily: '24h',
        })[String(p.temporal_resolution || p.value || '').trim().toLowerCase()];
        if (!temporalValue) {
          pushReply('Choose Monthly, Hourly, 3h, 6h, 12h, or Daily temporal resolution.');
          return true;
        }
        return executeAtlasDirectAction({
          type: 'temporal_resolution',
          value: temporalValue,
        }, pushReply);
      }

      case 'set_model_settings':
        return executeAtlasDirectAction({
          type: 'settings',
          updates: Object.entries(p.settings || {}).reduce((next, [key, value]) => {
            const normalizedValue = normalizeAtlasAgentSettingValue(key, value);
            if (normalizedValue !== undefined) next[key] = normalizedValue;
            return next;
          }, {}),
        }, pushReply);

      case 'describe_capabilities':
        return executeAtlasDirectAction({
          type: 'capabilities',
          topic: String(p.topic || '').toLowerCase().includes('setting') ? 'settings' : 'all',
        }, pushReply);

      case 'toggle_generation_mix':
        return executeAtlasDirectAction({
          type: 'generation_mix',
          visible: p.visible !== false,
          networkCarrier: normalizeNetworkCarrier(p.network_carrier || p.carrier || ctx.networkCarrier),
        }, pushReply);

      case 'set_run_mode': {
        const mode = String(p.mode || '').trim().toLowerCase();
        if (!['build_only', 'build_solve', 'solve_existing'].includes(mode)) {
          pushReply('Choose Build only, Build + solve, or Solve existing.');
          return true;
        }
        setRunMode(mode);
        setPypsaSettings((previous) => ({ ...previous, build_only: mode === 'build_only' }));
        pushReply(`Run mode set to ${{ build_only: 'Build only', build_solve: 'Build + solve', solve_existing: 'Solve existing' }[mode]}.`);
        return true;
      }

      case 'open_settings':
        setShowPypsaSettingsDialog(true);
        pushReply('Opened More Settings.');
        return true;

      case 'set_map_display': {
        const keys = Object.keys(p);
        if (!keys.length || keys.some((key) => !['node_markers', 'geographic_boundaries'].includes(key) || typeof p[key] !== 'boolean')) {
          throw new Error('Map display requires node_markers and/or geographic_boundaries as booleans. No display settings changed.');
        }
        if ('node_markers' in p) setShowMapNodes(p.node_markers);
        if ('geographic_boundaries' in p) setShowGeographicBoundaries(p.geographic_boundaries);
        pushReply(keys.map((key) => `${p[key] ? 'Showing' : 'Hiding'} ${key === 'node_markers' ? 'node markers' : 'geographic boundaries'}`).join('; ') + '.');
        return true;
      }

      case 'toggle_domain_controls':
        setMapControlsCollapsed(p.visible === false);
        pushReply(`${p.visible === false ? 'Collapsed' : 'Opened'} domain controls.`);
        return true;

      case 'build_network':
        pushReply('Building the configured network…');
        await runPypsaBuildFromSettings();
        return true;

      case 'set_granularity': {
        const next = normalizeGranularityToken(p.granularity);
        if (!next) { pushReply('Pick a granularity: 37, 128, 256, 512, 1024, or full.'); return true; }
        try { await switchPypsaGranularity(next); pushReply(`Granularity set to ${next}.`); }
        catch (err) { pushReply(`Could not switch granularity: ${err.message}`); }
        return true;
      }

      case 'step_granularity': {
        const direction = String(p.step || '').toLowerCase() === 'down' ? -1 : 1;
        const order = ['pypsa_37', 'pypsa_128', 'pypsa_256', 'pypsa_512', 'pypsa_1024', 'pypsa'];
        const idx = order.indexOf(pypsaGranularity);
        const target = order[Math.max(0, Math.min(order.length - 1, idx + direction))];
        if (!target || target === pypsaGranularity) {
          pushReply(direction > 0 ? 'Already at the maximum granularity.' : 'Already at the minimum granularity.');
          return true;
        }
        try { await switchPypsaGranularity(target); pushReply(`Granularity stepped to ${target}.`); }
        catch (err) { pushReply(`Could not step granularity: ${err.message}`); }
        return true;
      }

      case 'load_country': {
        const { countries: countryCodes, place } = readAtlasModelCountries(p);
        if (!place && !countryCodes.length) { pushReply('Which country / place? e.g. "country italy".'); return true; }
        if (countryCodes.length) {
          const resolution = normalizeAtlasResolution(p.resolution || p.granularity);
          try {
            const domains = (Array.isArray(p.layers) ? p.layers : String(p.layers || '').split(','))
              .map(canonicalAtlasAgentLayer)
              .filter(Boolean);
            await executeAtlasDirectAction({
              type: 'country',
              mode: p.mode === 'add' ? 'add' : 'replace',
              countries: countryCodes,
              networkCarrier: normalizeNetworkCarrier(p.network_carrier || p.carrier || ctx.networkCarrier),
              resolution,
              domains,
              layerMode: String(p.layer_mode || 'replace').toLowerCase(),
              generationMix: Boolean(p.generation_mix),
            }, pushReply);
            return true;
          } catch (error) {
            pushReply(`Could not load ${countryCodes.map(countryCodeToName).join(' and ')}: ${error.message}`);
          }
          return true;
        }
        if (isSourceInfrastructure) {
          const coords = await resolveCoords();
          if (!coords) {
            pushReply(`Could not locate "${place}" within the active ${infrastructureCarrier === 'gas' ? 'methane' : infrastructureCarrier === 'water' ? 'water' : 'oil and liquids'} map.`);
            return true;
          }
          setEmilFocusLocation({ latitude: coords.lat, longitude: coords.lon, zoom: 9, label: coords.label });
          setLastSearchedLocation({ name: place, lat: coords.lat, lon: coords.lon, label: coords.label });
          pushReply(`Focused on ${coords.label || place} in the ${infrastructureCarrier === 'gas' ? 'methane' : infrastructureCarrier === 'water' ? 'water' : 'oil and liquids'} Atlas. No new topology was distilled.`);
          return true;
        }
        try {
          const cityResult = await loadCountryAndFocusCity(place, pushReply);
          if (cityResult.handled) return true;
        } catch (err) {
          pushReply(`Could not locate "${place}": ${err.message}`);
          return true;
        }
        // A failed place lookup must not start a legacy build/search that can
        // select an unrelated cached country. Building is a separate action.
        pushReply(`Could not resolve "${place}" to a country or place. No fallback network was loaded or built.`);
        return true;
      }

      case 'load_full_eu': {
        const sizeRaw = String(p.full_eu_size || '').toLowerCase();
        const target = ['37','128','256','512','1024'].includes(sizeRaw) ? Number(sizeRaw)
          : sizeRaw === 'joule' ? 'joule' : DEFAULT_JOULE_MODEL_VALUE;
        setFullEuOnly(true);
        pushReply(`Loading Full EU model ${target}…`);
        try { await loadJouleModelAtSize(target); pushReply(`Loaded Full EU model ${target}.`); }
        catch (err) { pushReply(`Could not load Full EU model: ${err.message}`); }
        return true;
      }

      case 'set_model_standard': {
        setFullEuOnly(false);
        pushReply('Switched to standard model mode.');
        return true;
      }

      case 'save_region': {
        if (!regionManifest) { pushReply('Nothing to save yet — solve a region first.'); return true; }
        const name = String(p.name || '').trim();
        pushReply(name ? `Saving region as "${name}"…` : 'Saving current region…');
        try { await saveCurrentRegionRun(name); pushReply(name ? `Saved as "${name}".` : 'Saved.'); }
        catch (err) { pushReply(`Save failed: ${err.message}`); }
        return true;
      }

      case 'list_saved_regions': {
        const runs = await loadRegionSavedRuns();
        if (!runs.length) pushReply('No saved region runs yet.');
        else pushReply(`Saved region runs:\n${runs.map((r, i) => `${i + 1}. ${r.dirname}`).join('\n')}`);
        return true;
      }

      case 'load_saved_region': {
        const target = String(p.name || '').trim().toLowerCase();
        if (!target) { pushReply('Which saved region? Run "list region runs".'); return true; }
        const matches = regionSavedRuns.filter((r) => String(r.dirname || '').toLowerCase().includes(target));
        if (matches.length === 0) { pushReply(`No saved region matches "${target}".`); return true; }
        if (matches.length > 1) {
          pushReply(`"${target}" is ambiguous:\n${matches.map((r, i) => `${i + 1}. ${r.dirname}`).join('\n')}`);
          return true;
        }
        pushReply(`Loading "${matches[0].dirname}"…`);
        try { await loadSavedRegionRun(matches[0]); pushReply('Loaded.'); }
        catch (err) { pushReply(`Load failed: ${err.message}`); }
        return true;
      }

      case 'delete_saved_region': {
        const target = String(p.name || '').trim().toLowerCase();
        if (!target) { pushReply('Which saved region? Run "list region runs".'); return true; }
        const matches = regionSavedRuns.filter((r) => String(r.dirname || '').toLowerCase().includes(target));
        if (matches.length === 0) { pushReply(`No saved region matches "${target}".`); return true; }
        if (matches.length > 1) {
          pushReply(`"${target}" is ambiguous:\n${matches.map((r, i) => `${i + 1}. ${r.dirname}`).join('\n')}`);
          return true;
        }
        pushReply(`Deleting "${matches[0].dirname}"…`);
        try { await deleteSavedRegionRun(matches[0]); pushReply('Deleted.'); }
        catch (err) { pushReply(`Delete failed: ${err.message}`); }
        return true;
      }

      case 'close_panel': {
        closeRegionPanel();
        pushReply('Region panel closed.');
        return true;
      }

      case 'ask_clarification': {
        pushReply(p.clarification || "I'm not sure what you mean. Could you give me a place or a radius?");
        return true;
      }

      // unknown / null / anything else → fall through to regex chain.
      default:
        return false;
    }
  }, [
    selectedPyPSAFile, regionCenter, regionRadiusKm, regionManifest, regionSolving,
    pypsaGranularity, regionSavedRuns,
    solveRegion, switchPypsaGranularity, handleSolveNetworkCommand, loadJouleModelAtSize,
    loadCountryAndFocusCity,
    applyMixedGranularityView,
    activateCountryNetwork, countryCodeToName, loadAtlasCountriesFromAgent,
    loadedPypsaNetworks, removeAtlasCountriesFromAgent, runPypsaBuildFromSettings,
    setAtlasDomainsFromAgent, setAtlasResolutionFromAgent, stepAtlasResolutionFromAgent,
    executeAtlasDirectAction,
    saveCurrentRegionRun, loadRegionSavedRuns, loadSavedRegionRun, deleteSavedRegionRun,
    closeRegionPanel, aiMapControlEnabled,
  ]);

  const handleMapAgentCommand = useCallback(async (rawInput = null, commandOptions = {}) => {
    const raw = String((rawInput ?? mapAgentInput) || '').trim();
    if (!raw || mapAgentBusy) return;

    setMapAgentMessages((prev) => [...prev, { id: `usr-${Date.now()}`, role: 'user', text: raw }]);
    setMapAgentInput('');
    setMapAgentBusy(true);
    const cancelRevision = networkCancelRevisionRef.current;

    const pushReply = (text) => {
      setMapAgentMessages((prev) => [...prev, { id: `asst-${Date.now()}-${Math.random()}`, role: 'assistant', text }]);
      if (typeof commandOptions?.onReply === 'function') commandOptions.onReply(text);
    };
    const finishIfCancelled = () => {
      if (networkCancelRevisionRef.current === cancelRevision) return false;
      pushReply('Network update cancelled. No further actions or automatic corrections were applied.');
      setMapAgentBusy(false);
      return true;
    };

    // Every natural-language instruction uses the model planner. Manual
    // buttons still dispatch their explicit structured operations directly.
    let llmPlan = [];
    let planningStatus = 'unavailable';
    // Snapshot map context + recent turns BEFORE we touch state, so the LLM
    // sees the same world the user does. We send these on every interpret call
    // so the model can resolve "here", "this region", "make it 50 km", etc.
    const mapContext = {
      ...buildMapContext(),
      ...(commandOptions.forceLocation ? { requestSurface: 'place_drilldown', countryScopedDrilldown: true } : {}),
      ...(commandOptions.source === 'voice' ? {
        requestSurface: 'voice',
        inputSource: 'voice_transcription',
        voiceMode: String(commandOptions.voiceMode || ''),
      } : {}),
    };
    const conversationHistory = buildConversationHistory();
    const planningController = new AbortController();
    const planningTimeout = setTimeout(() => planningController.abort(), 45000);
    try {
      const interpResp = await fetch(`${API_BASE}/api/map-agent/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: planningController.signal,
        body: JSON.stringify({ message: raw, mapContext, conversationHistory }),
      });
      const interpData = await interpResp.json();
      if (planningController.signal.aborted) throw new Error('Planning timed out');
      if (interpResp.ok && interpData) {
        const decoded = readAtlasPlannerResponse(interpData, mapContext.visibleMapLayers);
        planningStatus = decoded.status;
        llmPlan = decoded.plan;
      }
    } catch (_) {
      planningStatus = 'unavailable';
    } finally {
      clearTimeout(planningTimeout);
    }

    if (llmPlan.length) {
      const planReplies = [];
      const correctionReplies = [];
      let planError = '';
      let judgeResult = null;
      pushReply(`Plan ready — applying ${llmPlan.length} coordinated ${llmPlan.length === 1 ? 'change' : 'changes'} and checking the result.`);
      try {
        for (const action of llmPlan) {
          const handled = await dispatchMapAgentIntent(
            action.intent,
            action.params || {},
            mapContext,
            (reply) => planReplies.push(reply),
          );
          if (finishIfCancelled()) return;
          if (!handled) throw new Error(`Unsupported planned action: ${action.intent}`);
        }
      } catch (err) {
        if (finishIfCancelled()) return;
        console.error('Map-agent plan execution failed:', err);
        planError = err.message;
        planReplies.push(`Initial execution issue: ${err.message}`);
      }

      if (finishIfCancelled()) return;
      try {
        // Allow React to publish state changes from the completed async actions
        // before the independent judge reads the observed map state.
        // At most one correction round; the second audit is read-only.
        let auditedActions = llmPlan;
        for (let auditPass = 0; auditPass < 2; auditPass += 1) {
          const includesViewportAnimation = auditedActions.some((action) => (
            action.intent === 'control_map_view' || action.intent === 'navigate_to_location'
          ));
          await new Promise((resolve) => setTimeout(resolve, includesViewportAnimation ? 700 : 200));
          if (finishIfCancelled()) return;
          const observedBase = mapAgentObservedContextRef.current || buildMapContext();
          const liveView = mapViewRef.current || {};
          const observedContext = {
            ...observedBase,
            center: {
              lat: Number.isFinite(liveView.lat) ? liveView.lat : observedBase.center?.lat ?? null,
              lng: Number.isFinite(liveView.lng) ? liveView.lng : observedBase.center?.lng ?? null,
            },
            zoom: Number.isFinite(liveView.zoom) ? liveView.zoom : observedBase.zoom ?? null,
            aiMapControlEnabled,
          };
          const judgeController = new AbortController();
          const judgeTimeout = setTimeout(() => judgeController.abort(), 30000);
          let judgeResp;
          let judgeData;
          try {
            judgeResp = await fetch(`${API_BASE}/api/map-agent/judge`, {
              method: 'POST',
              signal: judgeController.signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: raw,
                plannedActions: llmPlan,
                beforeContext: mapContext,
                afterContext: observedContext,
                executionNotes: [...planReplies, ...correctionReplies],
              }),
            });
            judgeData = await judgeResp.json();
            if (judgeController.signal.aborted) throw new Error('Verification timed out.');
          } finally { clearTimeout(judgeTimeout); }
          if (finishIfCancelled()) return;
          if (!judgeResp.ok || !judgeData || !['pass', 'repair'].includes(judgeData.verdict)
              || typeof judgeData.confidence !== 'number' || !Number.isFinite(judgeData.confidence)
              || judgeData.confidence < 0.45 || judgeData.confidence > 1) {
            throw new Error('The judge did not return a confident verification result.');
          }
          if (judgeResp.ok && judgeData) {
            judgeResult = judgeData;
            if (judgeData.verdict === 'pass' || auditPass === 1) break;
            const corrections = normalizeAtlasModelPlan(
              (Array.isArray(judgeData.corrections) ? judgeData.corrections : [])
                .filter((action) => ATLAS_JUDGE_SAFE_CORRECTION_INTENTS.has(action?.intent))
                .slice(0, 6),
              observedContext.visibleMapLayers,
            );
            if (!corrections.length) break;
            auditedActions = corrections;
            for (const correction of corrections) {
              const handled = await dispatchMapAgentIntent(
                correction.intent,
                correction.params || {},
                observedContext,
                (reply) => correctionReplies.push(reply),
              );
              if (finishIfCancelled()) return;
              if (!handled) throw new Error(`Unsupported judge correction: ${correction.intent}`);
            }
          }
        }
      } catch (judgeError) {
        if (finishIfCancelled()) return;
        console.error('Map-agent judge failed:', judgeError);
        judgeResult = {
          verdict: 'unverified',
          summary: `Verification could not complete: ${judgeError.message}`,
        };
      }

      if (finishIfCancelled()) return;
      const resultText = [...planReplies, ...correctionReplies].join(' ');
      let verificationText = '';
      if (judgeResult?.verdict === 'pass') {
        verificationText = `Verified — ${judgeResult.summary || 'the observed Atlas state matches your request.'}`;
      } else if (judgeResult?.verdict === 'repair') {
        verificationText = `Not verified — ${judgeResult.summary || 'a mismatch remains after checking the map.'}`;
      } else {
        verificationText = judgeResult?.summary || 'The changes were applied, but the verification pass was unavailable.';
      }
      if (planError && !resultText) {
        pushReply(`I could not complete the requested plan. ${verificationText}`);
      } else {
        pushReply([resultText, verificationText].filter(Boolean).join(' '));
      }
      setMapAgentBusy(false);
      return;
    }

    // Never reinterpret an unavailable or uncertain model plan with phrasing
    // rules. That silently executes a subset (or opposite) of compound requests.
    pushReply(planningStatus === 'unavailable'
      ? 'EMIL’s reasoning service is unavailable. No map changes were made. You can use the map controls or retry your request when the service is available.'
      : 'I could not produce a clear action plan for that request. No map changes were made. Could you clarify what you want to change?');
    setMapAgentBusy(false);
  }, [
    API_BASE,
    mapAgentInput,
    mapAgentBusy,
    buildMapContext,
    buildConversationHistory,
    dispatchMapAgentIntent,
    aiMapControlEnabled,
  ]);

  const runGeographyDrilldown = useCallback(async () => {
    const query = String(geographyDrilldown || '').trim();
    if (!query || mapAgentBusy) return;
    if (!loadedPypsaCountryCodes.length) {
      setGeographyLoadError('Select at least one country before using place drill-down.');
      return;
    }
    setGeographyLoadError('');
    focusAtlasPanel('assistant');
    await handleMapAgentCommand(query, { forceLocation: true });
    setGeographyDrilldown('');
  }, [geographyDrilldown, handleMapAgentCommand, loadedPypsaCountryCodes, mapAgentBusy, focusAtlasPanel]);

  const atlasTranscriptionContext = useMemo(() => buildAtlasTranscriptionContext({
    countries: loadedPypsaCountryCodes.map(countryCodeToName),
    carrier: atlasNetworkCarrier,
    resolution: pypsaGranularity,
  }), [atlasNetworkCarrier, countryCodeToName, loadedPypsaCountryCodes, pypsaGranularity]);

  const emilVoice = useEmilVoice({
    apiBase: NOHM_VOICE_API_BASE,
    busy: mapAgentBusy,
    onCommand: handleMapAgentCommand,
    onPartial: setMapAgentInput,
    onOpen: openMapAssistant,
    transcriptionContext: atlasTranscriptionContext,
  });

  useEffect(() => {
    if (!mapAgentOpen || atlasAssetPopupOpen || !mapAgentFocusRequestedRef.current) return;
    mapAgentFocusRequestedRef.current = false;
    mapAgentInputRef.current?.focus({ preventScroll: true });
  }, [mapAgentOpen, atlasAssetPopupOpen]);

  const mapConversationScroll = useConversationScroll({
    messages: mapAgentMessages,
    active: mapAgentOpen && !atlasAssetPopupOpen && !mapAgentSettings.coverConversation,
    busy: mapAgentBusy,
    partial: emilVoice.partial,
  });

  // ── End PyPSA helpers ──────────────────────────────────────────────────────

  // Load facilities data using memberships API with same filters as build tab
  const loadFacilitiesData = async (forceRefresh = false) => {
    if (engine === 'PyPSA Engine') return [];
    if (forceRefresh) {
      setIsRefreshing(true);
      // Clear existing data to prevent showing stale nodes while loading
      setFacilitiesData([]);
      setNodeLocationsMap(new Map());
    }
    try {
      // Load nodal_coordinates.csv to build lookup map
      const response = await fetch(atlasAssetUrl('nodal_coordinates.csv'));
      if (!response.ok) {
        console.error(`❌ Failed to load nodal_coordinates.csv: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to load CSV: ${response.status}`);
      }
      const text = await response.text();
      console.log(`📄 CSV loaded, first 500 chars:`, text.substring(0, 500));

      const rows = text.split('\n').slice(1); // Skip header
      console.log(`📄 CSV has ${rows.length} data rows (excluding header)`);

      // Build a map of Node -> coordinates from CSV
      // CSV format: Type,Node,Region,Latitude,Longitude[,Editable]
      // Note: Editable column is optional
      const nodeCoordinatesMap = new Map();
      let hpclNodesFound = [];
      let parseErrors = [];

      rows
        .filter(row => row.trim())
        .forEach((row, rowIndex) => {
          const cols = row.split(',');
          const node = cols[1]?.trim() || '';
          const type = cols[0]?.trim() || '';
          const region = cols[2]?.trim() || '';
          const latitude = cols[3]?.trim() || '';
          const longitude = cols[4]?.trim() || '';
          const editable = (cols[5]?.trim() || '').toLowerCase() === 'true';

          if (!node) {
            parseErrors.push(`Row ${rowIndex + 2}: Empty node name`);
            return;
          }

          if (!latitude || !longitude) {
            parseErrors.push(`Row ${rowIndex + 2}: Missing coordinates for node "${node}"`);
            return;
          }

          // Store both exact match and uppercase match for lookup
          nodeCoordinatesMap.set(node, {
            node,
            type,
            region,
            latitude,
            longitude,
            editable
          });
          nodeCoordinatesMap.set(node.toUpperCase(), {
            node,
            type,
            region,
            latitude,
            longitude,
            editable
          });

          // Track HPCL nodes for debugging
          if (node.toUpperCase().includes('HPCL')) {
            hpclNodesFound.push({ node, row: rowIndex + 2, rawRow: row });
          }
        });

      if (parseErrors.length > 0) {
        console.warn(`⚠️ CSV parsing errors (${parseErrors.length}):`, parseErrors.slice(0, 5));
      }

      console.log(`📊 Loaded ${nodeCoordinatesMap.size / 2} unique nodes from nodal_coordinates.csv`);
      if (hpclNodesFound.length > 0) {
        console.log(`✅ Found ${hpclNodesFound.length} HPCL nodes in CSV:`, hpclNodesFound.map(h => h.node));
        hpclNodesFound.forEach(({ node, row, rawRow }) => {
          const coords = nodeCoordinatesMap.get(node);
          console.log(`   - Row ${row}: "${node}" -> (${coords?.latitude}, ${coords?.longitude})`);
          console.log(`     Raw row: "${rawRow}"`);
        });
      } else {
        console.log(`⚠️ No HPCL nodes found in CSV! Checking all nodes...`);
        const allNodes = Array.from(nodeCoordinatesMap.keys()).filter(k => !k.includes(',') && k.length < 20);
        console.log(`   Total nodes loaded: ${allNodes.length}`);
        console.log(`   Sample nodes:`, allNodes.slice(0, 20));
        // Check if HPCL might be in a different format
        const hpclVariants = allNodes.filter(n => n.toUpperCase().includes('H') && n.toUpperCase().includes('P') && n.toUpperCase().includes('C') && n.toUpperCase().includes('L'));
        if (hpclVariants.length > 0) {
          console.log(`   Found potential HPCL variants:`, hpclVariants);
        }
      }

      // Load node coordinates from filtered_attributes sheet as fallback
      let apiCoordinatesMap = new Map();
      try {
        const apiResponse = await fetch(`${API_BASE}/api/emil/node-coordinates-map`);
        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          if (apiData.success && apiData.coordinates) {
            // Build a map similar to nodeCoordinatesMap structure
            for (const [nodeName, coords] of Object.entries(apiData.coordinates)) {
              if (coords.latitude && coords.longitude) {
                // Store in same format as CSV map for consistency
                apiCoordinatesMap.set(nodeName, {
                  node: nodeName,
                  type: 'Node',
                  region: '',
                  latitude: String(coords.latitude),
                  longitude: String(coords.longitude),
                  editable: false
                });
                apiCoordinatesMap.set(nodeName.toUpperCase(), {
                  node: nodeName,
                  type: 'Node',
                  region: '',
                  latitude: String(coords.latitude),
                  longitude: String(coords.longitude),
                  editable: false
                });
              }
            }
            console.log(`📊 Loaded ${apiCoordinatesMap.size / 2} unique nodes from filtered_attributes sheet`);
          }
        } else {
          console.warn(`⚠️ Failed to load node coordinates from API: ${apiResponse.status}`);
        }
      } catch (error) {
        console.warn(`⚠️ Error loading node coordinates from API:`, error);
      }

      // Build the same params as properties API for consistency (always build params for comparison)
      const norm = (s) => (s || '').toString().replace(/\s+/g, '').toLowerCase();
      const groupsNormalized = new Map((emilAvailableClassGroups || []).map(g => [norm(g), g]));
      const classesNormalized = new Map((emilAvailableClasses || []).map(c => [norm(c), c]));

      const selectedGroupNorm = norm(emilClassGroupFilter);
      const selectedClassNorm = norm(emilClassFilter);

      // Power2X should always be sent as class_name, not class_group
      const isPower2X = selectedClassNorm === norm('Power2X');

      // Use same normalization logic as properties API
      const membershipsParams = new URLSearchParams({
        limit: '10000',
        offset: '0'
      });

      // If class filter actually equals a known group (ignoring spaces/case), promote to group
      // BUT exclude Power2X which should always be class_name
      if (selectedClassNorm && groupsNormalized.has(selectedClassNorm) && !isPower2X) {
        const promotedGroup = groupsNormalized.get(selectedClassNorm);
        membershipsParams.append('class_group', promotedGroup);
        // do NOT send class_name in this case
      } else {
        // Add class_group if selected (but not if Power2X is the class)
        if (selectedGroupNorm && groupsNormalized.has(selectedGroupNorm)) {
          membershipsParams.append('class_group', groupsNormalized.get(selectedGroupNorm));
        }
        // Add class_name - Power2X should always go here
        if (selectedClassNorm && classesNormalized.has(selectedClassNorm)) {
          membershipsParams.append('class_name', classesNormalized.get(selectedClassNorm));
        }
      }
      // Only add category filter if a specific category is selected
      if (emilCategoryFilter) membershipsParams.append('category', emilCategoryFilter);
      // Note: We don't use object filter here because we need to find memberships where
      // Parent Name = selected object, not Child Name = selected object
      // The object filter in memberships API filters by Child Name, but we need Parent Name
      // So we'll filter client-side after fetching
      membershipsParams.append('types', 'System');

      const membershipsUrl = `${API_BASE}/api/emil/memberships?${membershipsParams}`;
      console.log('🔍 Querying MEMBERSHIPS API with filters (same as properties):', {
        url: membershipsUrl,
        class_group: membershipsParams.get('class_group') || '',
        class_name: membershipsParams.get('class_name') || '',
        category: membershipsParams.get('category') || '',
        object: membershipsParams.get('object') || '',
        types: 'System'
      });

      // Always call memberships API to see the data (even if no object selected)
      const membershipsResp = await fetch(membershipsUrl);
      console.log('📡 Memberships API fetch completed, status:', membershipsResp.status);
      const membershipsData = await membershipsResp.json();

      console.log('📊 MEMBERSHIPS API Response:', {
        success: membershipsData?.success,
        total_count: membershipsData?.total_count,
        returned_count: membershipsData?.returned_count || membershipsData?.data?.length || 0,
        sample_memberships: membershipsData?.data?.slice(0, 5).map(r => ({
          Collection: r.Collection,
          Parent_Name: r['Parent Name'] || r.Parent_Name,
          Child_Name: r['Child Name'] || r.Child_Name,
          Child_Class_Name: r['Child_Class_Name'] || r.Child_Class_Name,
          Parent_Category: r['Parent Category'] || r.Parent_Category,
          Child_Category: r['Child Category'] || r.Child_Category
        })) || []
      });

      if (!membershipsData || !membershipsData.success) {
        console.warn('⚠️ Memberships API returned unsuccessful response:', membershipsData);
        setFacilitiesData([]);
        setMapLoaded(true);
        return [];
      }

      const memberships = membershipsData.data || [];
      console.log(`🔍 Loaded ${memberships.length} membership records`);

      // Debug: Log unique Child_Class_Name values to understand the data structure
      const uniqueChildClasses = [...new Set(memberships.map(r => (r['Child_Class_Name'] || r.Child_Class_Name || '').toString().trim()))];
      console.log(`📊 Unique Child_Class_Name values in memberships:`, uniqueChildClasses);

      // Filter: Find memberships where Child_Class_Name === "Nodes", "NodeFrom", "NodeTo", "GasNode", "GasNodes", "GasNodeFrom", or "GasNodeTo"
      // This handles both direct node memberships, line endpoint memberships, and gas pipeline/gas node memberships
      // Filtering hierarchy:
      // 1. If object filter is selected → only show nodes from that specific object
      // 2. If category filter is selected but no object → show all nodes from all objects in that category
      // 3. If no category filter → show all nodes from all categories and all objects
      // 4. Exclude objects with "-" in their name (they are not nodes)
      const nodeMemberships = memberships.filter(r => {
        const childClass = (r['Child_Class_Name'] || r.Child_Class_Name || '').toString().trim();
        const childClassLower = childClass.toLowerCase();
        // Accept Nodes, NodeFrom, NodeTo (for lines), GasNode, GasNodes, GasNodeFrom, and GasNodeTo (for gas pipelines)
        const isNode = childClassLower === 'nodes' ||
          childClassLower === 'nodefrom' ||
          childClassLower === 'nodeto' ||
          childClassLower === 'gasnode' ||
          childClassLower === 'gasnodes' ||
          childClassLower === 'gasnodefrom' ||
          childClassLower === 'gasnodeto';

        if (!isNode) return false;

        // Exclude objects with "-" in their Child Name (the actual node name)
        // Note: Parent Name may contain "-" for pipelines/lines (e.g., "IE00Z2MK - IE00_OFF"),
        // but the Child Name is the actual node and should not have "-"
        const parentName = (r['Parent Name'] || r.Parent_Name || '').toString().trim();
        const childName = (r['Child Name'] || r.Child_Name || '').toString().trim();

        if (childName.includes('-')) {
          console.log(`⚠️ Skipping membership with "-" in Child Name: Parent="${parentName}", Child="${childName}"`);
          return false;
        }

        // If object filter is selected, only include nodes from that specific object
        if (emilObjectFilter) {
          return parentName.toLowerCase() === emilObjectFilter.toLowerCase();
        }

        // If category filter is selected but no object, include all nodes from all objects in that category
        // (The API already filtered by category, so we just need to include all nodes)
        if (emilCategoryFilter) {
          return true; // All nodes from the selected category
        }

        // If no category filter, include all nodes from all categories and all objects
        return true;
      });

      if (emilObjectFilter) {
        console.log(`🔍 After filtering by Parent Name = "${emilObjectFilter}" and Child_Class_Name in ["Nodes", "NodeFrom", "NodeTo", "GasNode", "GasNodes", "GasNodeFrom", "GasNodeTo"]: ${nodeMemberships.length} memberships`);
      } else if (emilCategoryFilter) {
        console.log(`🔍 No object filter selected - showing all nodes from all objects in category "${emilCategoryFilter}". Found ${nodeMemberships.length} memberships with Child_Class_Name in ["Nodes", "NodeFrom", "NodeTo", "GasNode", "GasNodes", "GasNodeFrom", "GasNodeTo"]`);
      } else {
        console.log(`🔍 No category filter selected - showing all nodes from all categories and all objects. Found ${nodeMemberships.length} memberships with Child_Class_Name in ["Nodes", "NodeFrom", "NodeTo", "GasNode", "GasNodes", "GasNodeFrom", "GasNodeTo"]`);
      }

      console.log(`🔍 Found ${nodeMemberships.length} memberships with Child_Class_Name in ["Nodes", "NodeFrom", "NodeTo", "GasNode", "GasNodes", "GasNodeFrom", "GasNodeTo"]`);
      if (nodeMemberships.length > 0) {
        console.log('📋 Sample Node memberships:', nodeMemberships.slice(0, 3).map(r => ({
          Parent_Name: r['Parent Name'] || r.Parent_Name,
          Child_Name: r['Child Name'] || r.Child_Name,
          Child_Class_Name: r['Child_Class_Name'] || r.Child_Class_Name
        })));
      }

      // Extract Child Name from those rows and look up coordinates in nodal_coordinates.csv
      const facilities = [];
      // Use a composite key (nodeId + parentName) to allow same node from different objects/categories
      const seenFacilities = new Set(); // To avoid exact duplicates (same node + same parent)
      let foundCount = 0;
      let notFoundCount = 0;

      for (const membership of nodeMemberships) {
        const childName = (membership['Child Name'] || membership.Child_Name || '').toString().trim();
        // Get the Parent Name (actual object name) from the membership - extract early
        const parentName = (membership['Parent Name'] || membership.Parent_Name || '').toString().trim();

        if (!childName) {
          console.log('⚠️ Skipping membership - empty Child Name');
          continue;
        }

        // Debug: Log HPCL-related memberships
        if (childName.toUpperCase().includes('HPCL')) {
          console.log(`🔍 Processing HPCL membership: Child Name="${childName}", Parent Name="${parentName}"`);
        }

        // Debug: Log gas node memberships
        const childClass = (membership['Child_Class_Name'] || membership.Child_Class_Name || '').toString().trim().toLowerCase();
        if (childClass.includes('gasnode')) {
          console.log(`🔍 Processing gas node membership: Child Name="${childName}", Parent Name="${parentName}", Child_Class="${membership['Child_Class_Name'] || membership.Child_Class_Name}"`);
        }

        // Helper function to find coordinates using multiple strategies
        const findCoordinates = (searchName, sourceMap, sourceName) => {
          let coords = null;
          let strategy = '';

          // Strategy 1: Exact match (case-insensitive)
          coords = sourceMap.get(searchName) || sourceMap.get(searchName.toUpperCase());
          if (coords) strategy = `exact-${sourceName}`;

          // Strategy 2: If child name contains " - ", extract the second part (e.g., "IE00Z2MK - IE00_OFF" -> "IE00_OFF")
          if (!coords && searchName.includes(' - ')) {
            const parts = searchName.split(' - ');
            if (parts.length > 1) {
              const potentialNode = parts[1].trim();
              // Try the full second part
              coords = sourceMap.get(potentialNode) || sourceMap.get(potentialNode.toUpperCase());
              if (coords) strategy = `split-second-full-${sourceName}`;
              // If not found, try first word of second part (remove any trailing description)
              if (!coords) {
                const firstWord = potentialNode.split(' ')[0].trim();
                coords = sourceMap.get(firstWord) || sourceMap.get(firstWord.toUpperCase());
                if (coords) strategy = `split-second-first-word-${sourceName}`;
              }
            }
          }

          // Strategy 3: Extract first word/part (for cases like "NodeName Description")
          if (!coords) {
            const firstPart = searchName.trim().split(' ')[0].split('_')[0];
            coords = sourceMap.get(firstPart) || sourceMap.get(firstPart.toUpperCase());
            if (coords) strategy = `first-part-${sourceName}`;
          }

          // Strategy 4: Try without any suffix (e.g., "IE00_OFF" -> "IE00")
          if (!coords && searchName.includes('_')) {
            const baseName = searchName.split('_')[0];
            coords = sourceMap.get(baseName) || sourceMap.get(baseName.toUpperCase());
            if (coords) strategy = `base-name-${sourceName}`;
          }

          // Strategy 5: Try matching by prefix for gas node names (e.g., "IE00Z2MK" -> try "IE00")
          // Only use this for names that look like gas node identifiers (contain Z2 or similar patterns)
          if (!coords && searchName.length > 4 && /[A-Z]{2}\d+Z\d+/.test(searchName.toUpperCase())) {
            const prefix = searchName.substring(0, 4).toUpperCase();
            // Try to find nodes that start with this prefix and are reasonably similar in length
            for (const [key, value] of sourceMap.entries()) {
              if (typeof key === 'string') {
                const keyUpper = key.toUpperCase();
                // Match if it starts with the prefix and is not too different in length
                if (keyUpper.startsWith(prefix) && Math.abs(key.length - searchName.length) <= 3) {
                  coords = value;
                  strategy = `prefix-match-${sourceName}`;
                  break;
                }
              }
            }
          }

          return { coords, strategy };
        };

        // Try multiple strategies to find the node in nodal_coordinates.csv first
        let coords = null;
        let matchedStrategy = '';

        // First, try CSV map
        const csvResult = findCoordinates(childName, nodeCoordinatesMap, 'csv');
        if (csvResult.coords) {
          coords = csvResult.coords;
          matchedStrategy = csvResult.strategy;
        }

        // If not found in CSV, try API map (filtered_attributes)
        if (!coords && apiCoordinatesMap.size > 0) {
          const apiResult = findCoordinates(childName, apiCoordinatesMap, 'api');
          if (apiResult.coords) {
            coords = apiResult.coords;
            matchedStrategy = apiResult.strategy;
          }
        }

        // Debug: Log HPCL matching results
        if (childName.toUpperCase().includes('HPCL')) {
          if (coords) {
            console.log(`✅ HPCL matched via ${matchedStrategy}: "${childName}" -> Node "${coords.node}" at (${coords.latitude}, ${coords.longitude})`);
          } else {
            console.log(`❌ HPCL NOT matched: "${childName}" - tried all strategies in both CSV and API`);
            const csvNodes = Array.from(nodeCoordinatesMap.keys()).filter(k => k.toUpperCase().includes('HPCL'));
            const apiNodes = Array.from(apiCoordinatesMap.keys()).filter(k => k.toUpperCase().includes('HPCL'));
            console.log(`   Available nodes in CSV: ${csvNodes.join(', ') || 'NONE'}`);
            console.log(`   Available nodes in API: ${apiNodes.join(', ') || 'NONE'}`);
          }
        }

        // Debug: Log gas node matching results
        if (childClass.includes('gasnode')) {
          if (coords) {
            console.log(`✅ Gas node matched via ${matchedStrategy}: "${childName}" -> Node "${coords.node}" at (${coords.latitude}, ${coords.longitude})`);
          } else {
            console.log(`❌ Gas node NOT matched: "${childName}" - tried all strategies in both CSV and API`);
            // Check if similar node names exist
            const similarCsv = Array.from(nodeCoordinatesMap.keys()).filter(k =>
              k.toUpperCase().includes(childName.substring(0, 4).toUpperCase()) ||
              childName.toUpperCase().includes(k.substring(0, 4).toUpperCase())
            ).slice(0, 5);
            const similarApi = Array.from(apiCoordinatesMap.keys()).filter(k =>
              k.toUpperCase().includes(childName.substring(0, 4).toUpperCase()) ||
              childName.toUpperCase().includes(k.substring(0, 4).toUpperCase())
            ).slice(0, 5);
            console.log(`   Similar nodes in CSV: ${similarCsv.join(', ') || 'NONE'}`);
            console.log(`   Similar nodes in API: ${similarApi.join(', ') || 'NONE'}`);
          }
        }

        if (coords) {
          const nodeId = coords.node.toUpperCase();

          // Use composite key to allow same node from different objects/categories
          // This allows multiple facilities at the same location from different categories
          const facilityKey = `${nodeId}|${parentName}`;
          if (seenFacilities.has(facilityKey)) {
            console.log(`⚠️ Skipping duplicate facility: ${nodeId} from ${parentName}`);
            continue;
          }
          seenFacilities.add(facilityKey);

          console.log(`✅ Creating facility: ${nodeId} from ${parentName} at (${coords.latitude}, ${coords.longitude})`);

          const latitude = parseFloat(coords.latitude);
          const longitude = parseFloat(coords.longitude);

          // Validate coordinates
          if (isNaN(latitude) || isNaN(longitude) || (latitude === 0 && longitude === 0)) {
            console.log(`⚠️ Skipping ${childName} - invalid coordinates: ${latitude}, ${longitude}`);
            continue;
          }

          const countryCode = coords.region ? coords.region.substring(0, 2) : nodeId.substring(0, 2);

          // For gas nodes and line nodes, use Child Name (the actual node) as display name
          // For other nodes, use Parent Name if available
          const isGasOrLineNode = childClass.includes('gasnode') || childClass.includes('nodefrom') || childClass.includes('nodeto');
          const displayName = isGasOrLineNode ? childName : (parentName || coords.node);

          // Create unique ID by combining nodeId and parentName to handle same node from different objects
          const uniqueId = parentName ? `${nodeId}_${parentName.replace(/\s+/g, '_')}` : nodeId;

          facilities.push({
            id: uniqueId,
            name: displayName, // Use Child Name for gas/line nodes, Parent Name for others
            nodeId: coords.node, // Store the node ID separately
            parentName: parentName, // Store parent name
            region: coords.region || '',
            latitude: String(latitude),
            longitude: String(longitude),
            country: countryCode,
            type: coords.type || 'Node',
            editable: coords.editable || false,
            // Store membership info for reference
            membership: {
              collection: membership.Collection || membership.collection || '',
              parentClass: membership['Parent_Class_Name'] || membership.Parent_Class_Name || '',
              childClass: membership['Child_Class_Name'] || membership.Child_Class_Name || '',
              parentCategory: membership['Parent Category'] || membership.Parent_Category || '',
              childCategory: membership['Child Category'] || membership.Child_Category || ''
            }
          });
          foundCount++;
        } else {
          const sourceInfo = apiCoordinatesMap.size > 0 ? 'nodal_coordinates.csv or filtered_attributes sheet' : 'nodal_coordinates.csv';
          console.log(`⚠️ Could not find coordinates in ${sourceInfo} for Child Name: "${childName}"`);
          notFoundCount++;
        }
      }

      console.log(`✅ Loaded ${facilities.length} facilities from memberships:`);
      console.log(`   - Found coordinates for ${foundCount} Child Names`);
      console.log(`   - Could not find coordinates for ${notFoundCount} Child Names`);
      console.log(`   - Total unique nodes: ${facilities.length}`);
      console.log('🔍 Sample facilities:', facilities.slice(0, 3).map(f => ({
        id: f.id,
        name: f.name,
        parentName: f.parentName,
        lat: f.latitude,
        lng: f.longitude
      })));

      // Group facilities by location (coordinates) to handle multiple categories/objects at same location
      // Use rounded coordinates with lenient precision (4 decimal places ≈ 11m precision)
      // This groups facilities that are very close together, not just exactly the same
      const locationGroups = new Map();
      const roundCoord = (coord, precision = 4) => {
        return parseFloat(parseFloat(coord).toFixed(precision));
      };

      facilities.forEach(facility => {
        const lat = roundCoord(facility.latitude);
        const lng = roundCoord(facility.longitude);
        const locationKey = `${lat},${lng}`;

        if (!locationGroups.has(locationKey)) {
          locationGroups.set(locationKey, {
            latitude: facility.latitude,
            longitude: facility.longitude,
            facilities: []
          });
        }

        locationGroups.get(locationKey).facilities.push(facility);
      });

      // Log locations with multiple facilities
      const multiFacilityLocations = Array.from(locationGroups.entries())
        .filter(([_, group]) => group.facilities.length > 1);

      if (multiFacilityLocations.length > 0) {
        console.log(`📍 Found ${multiFacilityLocations.length} locations with multiple facilities:`);
        multiFacilityLocations.forEach(([key, group]) => {
          console.log(`   Location ${key}: ${group.facilities.length} facilities - ${group.facilities.map(f => f.name).join(', ')}`);
        });
      }

      // Create enhanced facilities with location grouping info
      const enhancedFacilities = [];
      locationGroups.forEach((group, locationKey) => {
        if (group.facilities.length === 1) {
          // Single facility at this location
          enhancedFacilities.push({
            ...group.facilities[0],
            locationKey,
            sameLocationCount: 1,
            sameLocationFacilities: [group.facilities[0]]
          });
        } else {
          // Multiple facilities at same location - create one facility per object but link them
          group.facilities.forEach(facility => {
            enhancedFacilities.push({
              ...facility,
              locationKey,
              sameLocationCount: group.facilities.length,
              sameLocationFacilities: group.facilities,
              // Store unique categories/objects at this location
              categoriesAtLocation: [...new Set(group.facilities.map(f => {
                const cat = f.membership?.parentCategory || f.membership?.childCategory || '';
                return cat;
              }).filter(Boolean))],
              objectsAtLocation: group.facilities.map(f => ({
                name: f.name,
                parentName: f.parentName,
                category: f.membership?.parentCategory || f.membership?.childCategory || ''
              }))
            });
          });
        }
      });

      console.log(`✅ Enhanced facilities: ${enhancedFacilities.length} (${locationGroups.size} unique locations)`);
      if (enhancedFacilities.length === 0 && facilities.length > 0) {
        console.warn('⚠️ Location grouping resulted in 0 facilities! This might be a grouping issue.');
        console.log('   Original facilities count:', facilities.length);
        console.log('   Location groups count:', locationGroups.size);
      }

      // Fetch properties for objects to include in facilities
      // Filtering hierarchy:
      // 1. If object filter is selected → fetch only that object's properties
      // 2. If category filter is selected but no object → fetch properties for all objects in that category
      // 3. If no category filter → fetch properties for all objects under the class/class group filters
      if (facilities.length > 0 && (emilClassFilter || emilClassGroupFilter)) {
        try {
          const propertiesParams = new URLSearchParams({
            limit: '1000',
            offset: '0'
          });

          const norm = (s) => (s || '').toString().replace(/\s+/g, '').toLowerCase();
          const groupsNormalized = new Map((emilAvailableClassGroups || []).map(g => [norm(g), g]));
          const classesNormalized = new Map((emilAvailableClasses || []).map(c => [norm(c), c]));

          const selectedGroupNorm = norm(emilClassGroupFilter);
          const selectedClassNorm = norm(emilClassFilter);
          const isPower2X = selectedClassNorm === norm('Power2X');

          if (selectedClassNorm && groupsNormalized.has(selectedClassNorm) && !isPower2X) {
            propertiesParams.append('class_group', groupsNormalized.get(selectedClassNorm));
          } else {
            if (selectedGroupNorm && groupsNormalized.has(selectedGroupNorm)) {
              propertiesParams.append('class_group', groupsNormalized.get(selectedGroupNorm));
            }
            if (selectedClassNorm && classesNormalized.has(selectedClassNorm)) {
              propertiesParams.append('class_name', classesNormalized.get(selectedClassNorm));
            }
          }
          // Only add category filter if a specific category is selected
          if (emilCategoryFilter) propertiesParams.append('category', emilCategoryFilter);
          // Only add object filter if a specific object is selected
          if (emilObjectFilter) propertiesParams.append('object', emilObjectFilter);
          propertiesParams.append('types', 'System');

          const propertiesResp = await fetch(`${API_BASE}/api/emil/properties?${propertiesParams}`);
          const propertiesData = await propertiesResp.json();

          if (propertiesData && propertiesData.success) {
            const properties = propertiesData.data || [];
            if (emilObjectFilter) {
              console.log(`📊 Loaded ${properties.length} properties for object "${emilObjectFilter}"`);
            } else if (emilCategoryFilter) {
              console.log(`📊 Loaded ${properties.length} properties for all objects in category "${emilCategoryFilter}"`);
            } else {
              console.log(`📊 Loaded ${properties.length} properties for all objects under selected class/class group filters`);
            }

            // Group properties by object and attach to facilities
            const propertiesByObject = {};
            properties.forEach(prop => {
              const objName = (prop.Child_Name || '').toString().trim();
              if (objName) {
                if (!propertiesByObject[objName]) {
                  propertiesByObject[objName] = [];
                }
                propertiesByObject[objName].push({
                  Property: prop.Property || '',
                  Value: prop.Value || '',
                  Units: prop.Units || '',
                  Category: prop.Category || '',
                  Collection: prop.Collection || ''
                });
              }
            });

            // Attach properties to facilities based on parentName and/or childName (for gas nodes)
            // Keep properties separate for each object (no merging)
            enhancedFacilities.forEach(facility => {
              let facilityProperties = [];

              // Try to match by parentName first (for pipelines/lines)
              if (facility.parentName && propertiesByObject[facility.parentName]) {
                facilityProperties = propertiesByObject[facility.parentName];
                console.log(`✅ Attached ${facilityProperties.length} properties to facility ${facility.name} via parentName: ${facility.parentName}`);
              }

              // For gas nodes and line nodes, also try to match by childName (the actual node name)
              // This handles cases where properties are keyed by the node name rather than the pipeline/line name
              const isGasOrLineNode = facility.membership?.childClass && (
                facility.membership.childClass.toLowerCase().includes('gasnode') ||
                facility.membership.childClass.toLowerCase().includes('nodefrom') ||
                facility.membership.childClass.toLowerCase().includes('nodeto')
              );

              if (isGasOrLineNode && facility.nodeId && propertiesByObject[facility.nodeId]) {
                const nodeProperties = propertiesByObject[facility.nodeId];
                // Merge with parentName properties if both exist
                if (facilityProperties.length > 0) {
                  facilityProperties = [...facilityProperties, ...nodeProperties];
                  console.log(`✅ Added ${nodeProperties.length} additional properties to facility ${facility.name} via nodeId: ${facility.nodeId}`);
                } else {
                  facilityProperties = nodeProperties;
                  console.log(`✅ Attached ${facilityProperties.length} properties to facility ${facility.name} via nodeId: ${facility.nodeId}`);
                }
              }

              if (facilityProperties.length > 0) {
                facility.properties = facilityProperties;
              } else {
                // Debug: Log when properties aren't found
                const searchKeys = [facility.parentName, facility.nodeId].filter(Boolean);
                const availableKeys = Object.keys(propertiesByObject).slice(0, 10);
                console.log(`⚠️ No properties found for facility ${facility.name} (parentName: ${facility.parentName}, nodeId: ${facility.nodeId})`);
                console.log(`   Searched keys: ${searchKeys.join(', ')}`);
                console.log(`   Available property keys (sample): ${availableKeys.join(', ')}`);
              }

              // For facilities at same location, attach properties to all related facilities
              if (facility.sameLocationCount > 1 && facility.sameLocationFacilities) {
                facility.sameLocationFacilities.forEach(sameLocFacility => {
                  let sameLocProperties = [];

                  if (sameLocFacility.parentName && propertiesByObject[sameLocFacility.parentName]) {
                    sameLocProperties = propertiesByObject[sameLocFacility.parentName];
                  }

                  // Also check by nodeId for gas/line nodes
                  const isSameLocGasOrLine = sameLocFacility.membership?.childClass && (
                    sameLocFacility.membership.childClass.toLowerCase().includes('gasnode') ||
                    sameLocFacility.membership.childClass.toLowerCase().includes('nodefrom') ||
                    sameLocFacility.membership.childClass.toLowerCase().includes('nodeto')
                  );

                  if (isSameLocGasOrLine && sameLocFacility.nodeId && propertiesByObject[sameLocFacility.nodeId]) {
                    if (sameLocProperties.length > 0) {
                      sameLocProperties = [...sameLocProperties, ...propertiesByObject[sameLocFacility.nodeId]];
                    } else {
                      sameLocProperties = propertiesByObject[sameLocFacility.nodeId];
                    }
                  }

                  if (sameLocProperties.length > 0 && !sameLocFacility.properties) {
                    sameLocFacility.properties = sameLocProperties;
                  }
                });
              }
            });
          }
        } catch (error) {
          console.warn('Could not load properties for facilities:', error);
        }
      }

      console.log(`🎯 Final enhanced facilities count: ${enhancedFacilities.length}`);
      if (enhancedFacilities.length > 0) {
        console.log('📍 Sample enhanced facilities:', enhancedFacilities.slice(0, 3).map(f => ({
          id: f.id,
          name: f.name,
          nodeId: f.nodeId,
          lat: f.latitude,
          lng: f.longitude,
          sameLocationCount: f.sameLocationCount,
          hasMultiple: f.sameLocationCount > 1
        })));
      }

      setFacilitiesData(enhancedFacilities);
      setMapLoaded(true);

      // Don't generate random mesh connections - only use actual connections from memberships
      // generateAllNodeConnections(enhancedFacilities); // Disabled - no random connections

      return enhancedFacilities;
    } catch (error) {
      console.error('Error loading facilities:', error);
      setFacilitiesData([]);
      setMapLoaded(true);
      return [];
    } finally {
      if (forceRefresh) {
        setIsRefreshing(false);
      }
    }
  };

  // Generate connections between all visible nodes (full mesh network)
  const generateAllNodeConnections = (facilities) => {
    if (!facilities || facilities.length === 0) {
      console.log('⚠️ No facilities to connect');
      // Only clear if we don't have mesh connections
      setConnections(prev => {
        const hasMesh = prev.some(c => c.type === 'mesh');
        return hasMesh ? prev : [];
      });
      return;
    }

    console.log(`🔗 Generating connections between all ${facilities.length} nodes...`);
    const allConnections = [];

    // Create connections between every pair of facilities (full mesh)
    for (let i = 0; i < facilities.length; i++) {
      for (let j = i + 1; j < facilities.length; j++) {
        const fromFacility = facilities[i];
        const toFacility = facilities[j];

        // Skip if same facility
        if (fromFacility.id === toFacility.id) continue;

        // Skip if same coordinates (zero-length connection)
        const fromLat = parseFloat(fromFacility.latitude);
        const fromLng = parseFloat(fromFacility.longitude);
        const toLat = parseFloat(toFacility.latitude);
        const toLng = parseFloat(toFacility.longitude);

        if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
          continue;
        }

        if (fromLat === toLat && fromLng === toLng) {
          continue;
        }

        const connection = {
          id: `mesh-${fromFacility.id}-${toFacility.id}`,
          from: fromFacility.id,
          to: toFacility.id,
          color: '#808080', // Light gray color
          weight: 2,
          opacity: 0.6,
          type: 'mesh',
          collection: 'AllNodes'
        };

        allConnections.push(connection);
      }
    }

    console.log(`✅ Generated ${allConnections.length} connections between all nodes`);
    setConnections(allConnections);
    return allConnections;
  };

  // Auto-generate connections using 4-letter codes from Emil Memberships Child_Name
  const generateConnectionsFromProperties = async (facilities) => {
    if (engine === 'PyPSA Engine') return;
    try {
      const facs = facilities && facilities.length ? facilities : facilitiesData;
      if (!facs || facs.length === 0) return;

      // Process all facilities - filtering is now done at the API level using build tab filters

      // Always fetch a sufficiently large page for map connections to avoid using paginated Build-tab state
      // Apply connection filters if they are active
      let memberships = [];
      try {
        console.log('🔍 Fetching memberships from API...');
        const params = new URLSearchParams({ limit: '2000' });

        // Apply connection filters to memberships API call
        if (connectionClassGroupFilter) {
          params.append('class_group', connectionClassGroupFilter);
        }
        if (connectionClassFilter) {
          params.append('class_name', connectionClassFilter);
        }
        if (connectionCategoryFilter) {
          params.append('category', connectionCategoryFilter);
        }
        if (connectionObjectFilter) {
          params.append('object', connectionObjectFilter);
        }
        if (connectionPropertyFilter) {
          // Note: Property filter maps to membership filter in the API
          params.append('membership', connectionPropertyFilter);
        }

        const resp = await fetch(`${API_BASE}/api/emil/memberships?${params}`);
        const mdata = await resp.json();
        console.log('🔍 Membership API response:', {
          success: mdata?.success,
          dataLength: mdata?.data?.length || 0,
          totalCount: mdata?.total_count || 0
        });

        if (mdata && mdata.success) {
          memberships = mdata.data || [];
          console.log(`✅ Loaded ${memberships.length} membership records`);

          // Show sample record structure
          if (memberships.length > 0) {
            console.log('📋 Sample membership record:', memberships[0]);
          }
        } else {
          console.error('❌ Membership API returned unsuccessful response:', mdata);
        }
      } catch (e) {
        console.error('❌ Failed to fetch memberships:', e);
        console.warn('Could not fetch memberships for connections, falling back to facility regions');
      }

      // Filter for NodeFrom/NodeTo (Lines) and GasPipelineGasNodeFrom/To (Gas Pipelines)
      const facIndex = new Map(facs.map(f => [String(f.id || '').toUpperCase(), f]));

      // Collect line connections using Child_Class_Name = "NodeFrom" and "NodeTo"
      const nodeFromRecords = [];
      const nodeToRecords = [];

      // Collect gas pipeline connections using Collection = "GasPipelineGasNodeFrom" and "GasPipelineGasNodeTo"
      const gasPipelineFromRecords = [];
      const gasPipelineToRecords = [];

      (memberships || []).forEach(r => {
        const childClass = (r['Child_Class_Name'] || r.Child_Class_Name || '').toString().trim();
        const collection = (r.Collection || r.collection || '').toString().trim();
        const parentName = (r['Parent Name'] || r.Parent_Name || '').toString().trim();
        const childName = (r['Child Name'] || r.Child_Name || '').toString().trim();

        // Filter for Lines: Child_Class_Name = "NodeFrom" and "NodeTo"
        if (childClass.toLowerCase() === 'nodefrom') {
          nodeFromRecords.push({
            parentName: parentName, // This is the line identifier (e.g., "IE00HPCL-IE00")
            childName: childName,  // This is the node name
            collection: collection
          });
        } else if (childClass.toLowerCase() === 'nodeto') {
          nodeToRecords.push({
            parentName: parentName, // This is the line identifier (e.g., "IE00HPCL-IE00")
            childName: childName,  // This is the node name
            collection: collection
          });
        }

        // Filter for Gas Pipelines: Collection = "GasPipelineGasNodeFrom" and "GasPipelineGasNodeTo"
        if (collection === 'GasPipelineGasNodeFrom') {
          gasPipelineFromRecords.push({
            parentName: parentName, // This is the pipeline identifier
            childName: childName,  // This is the node name
            collection: collection
          });
        } else if (collection === 'GasPipelineGasNodeTo') {
          gasPipelineToRecords.push({
            parentName: parentName, // This is the pipeline identifier
            childName: childName,  // This is the node name
            collection: collection
          });
        }
      });

      console.log('NodeFrom records (Lines):', nodeFromRecords.length);
      console.log('NodeTo records (Lines):', nodeToRecords.length);
      console.log('GasPipelineGasNodeFrom records:', gasPipelineFromRecords.length);
      console.log('GasPipelineGasNodeTo records:', gasPipelineToRecords.length);

      // Debug: Log all unique collection names found
      const allCollections = new Set((memberships || []).map(r => r.Collection || r.collection || '').filter(Boolean));
      console.log('All unique collections found:', Array.from(allCollections));
      console.log('Total memberships:', memberships.length);

      // Extract actual node IDs from complex names (STRICT - exact match only)
      const extractNodeId = (complexName) => {
        if (!complexName || typeof complexName !== 'string') {
          console.log(`    ⚠️ extractNodeId: Invalid input:`, complexName);
          return '';
        }

        // Handle patterns like "IE00Z2MK - IE00_OFF" -> extract "IE00_OFF"
        // Handle patterns like "UK04Z2MK - IE00Z2MK 26 inch" -> extract "IE00Z2MK"
        const parts = complexName.split(' - ');
        if (parts.length > 1) {
          // Take the second part and clean it up
          let nodeId = parts[1].trim();
          // Remove extra descriptions like "26 inch", "_rp", etc.
          nodeId = nodeId.split(' ')[0].split('_')[0];
          return nodeId || complexName.trim(); // Fallback to original if extraction fails
        }

        // If no " - " separator, try to extract just the node ID part
        // Handle patterns like "NodeName" or "NodeName Description"
        const trimmed = complexName.trim();
        const firstPart = trimmed.split(' ')[0]; // Take first word/part
        return firstPart || trimmed;
      };

      // Find existing facility or auto-create from attributes map when missing
      const newFacilities = [];
      const isValidCoord = (lat, lon) => {
        const la = parseFloat(lat);
        const lo = parseFloat(lon);
        if (Number.isNaN(la) || Number.isNaN(lo)) return false;
        if (la === 0 && lo === 0) return false;
        return true;
      };
      const findOrCreateFacility = (nodeName) => {
        const upperNode = String(nodeName || '').toUpperCase().trim();
        if (!upperNode) return null;
        // try existing
        let facility = facIndex.get(upperNode) ||
          facs.find(f => String(f.id || '').toUpperCase().trim() === upperNode) ||
          facs.find(f => String(f.name || '').toUpperCase().trim() === upperNode);
        if (facility) return facility;
        // try attributes-derived location to create a minimal facility
        // IMPORTANT: Only create facilities from nodeLocationsMap if they exist in it
        // When a category filter is active, nodeLocationsMap only contains filtered nodes
        const attr = nodeLocationsMap.get(upperNode);
        if (attr && isValidCoord(attr.latitude, attr.longitude)) {
          // Facilities are now filtered at API level using build tab filters
          // nodeLocationsMap contains only valid facilities
          // Create facility from nodeLocationsMap
          facility = {
            id: upperNode,
            name: upperNode,
            region: '',
            latitude: String(attr.latitude),
            longitude: String(attr.longitude),
            country: upperNode.substring(0, 2),
            type: 'Node',
            category: attr.category || null, // Preserve category from API
            editable: false
          };
          facs.push(facility);
          facIndex.set(upperNode, facility);
          newFacilities.push(facility);
          console.log('➕ Created facility from attributes for missing node:', upperNode, facility);
          return facility;
        }
        return null;
      };

      // Helper function to create connections from from/to records
      const createConnectionsFromRecords = (fromRecords, toRecords, connectionType, propertyCollection) => {
        const connections = [];

        console.log(`\n🔍 Processing ${connectionType} connections:`);
        console.log(`  From records: ${fromRecords.length}`);
        console.log(`  To records: ${toRecords.length}`);

        fromRecords.forEach((fromRecord, idx) => {
          // Find matching To record by Parent Name (the line/pipeline identifier)
          const matchingToRecord = toRecords.find(toRecord =>
            toRecord.parentName === fromRecord.parentName // Same line/pipeline identifier
          );

          if (matchingToRecord) {
            const fromNode = fromRecord.childName; // From record's child name is the "from" node
            const toNode = matchingToRecord.childName; // To record's child name is the "to" node
            const identifier = fromRecord.parentName; // The line/pipeline identifier

            console.log(`\n  Record ${idx}:`);
            console.log(`    Identifier: "${identifier}"`);
            console.log(`    From node: "${fromNode}"`);
            console.log(`    To node: "${toNode}"`);

            // Extract node IDs (handle any formatting)
            const actualFromNode = extractNodeId(fromNode);
            const actualToNode = extractNodeId(toNode);

            // Skip if either is empty
            if (!actualFromNode || !actualToNode) {
              console.log(`    ⚠️ Skipping: empty node (from: "${actualFromNode}", to: "${actualToNode}")`);
              return;
            }

            // Skip if both are the same
            if (actualFromNode === actualToNode) {
              console.log(`    ⚠️ Skipping: nodes are identical ("${actualFromNode}")`);
              return;
            }

            const fromFacility = findOrCreateFacility(actualFromNode);
            const toFacility = findOrCreateFacility(actualToNode);

            if (fromFacility && toFacility) {
              // Skip self-connections (same facility)
              if (fromFacility.id === toFacility.id) {
                console.log(`    ⚠️ Skipping self-connection: ${fromFacility.id} -> ${toFacility.id}`);
                return;
              }

              // Skip if both nodes are at the same location (same coordinates)
              const fromLat = parseFloat(fromFacility.latitude);
              const fromLng = parseFloat(fromFacility.longitude);
              const toLat = parseFloat(toFacility.latitude);
              const toLng = parseFloat(toFacility.longitude);

              if (!isNaN(fromLat) && !isNaN(fromLng) && !isNaN(toLat) && !isNaN(toLng)) {
                // Check if coordinates are the same (within small tolerance)
                const latDiff = Math.abs(fromLat - toLat);
                const lngDiff = Math.abs(fromLng - toLng);
                if (latDiff < 0.0001 && lngDiff < 0.0001) {
                  console.log(`    ⚠️ Skipping: nodes at same location (${fromLat}, ${fromLng})`);
                  return;
                }
              }

              const connection = {
                from: fromFacility.id,
                to: toFacility.id,
                id: `${connectionType.toLowerCase()}-${fromFacility.id}-${toFacility.id}`,
                collection: propertyCollection,
                fromNode: fromNode,
                toNode: toNode,
                // Keep the identifier to match with properties (used by linePropertiesByChildName lookup)
                identifier: identifier,
                parentIdentifier: identifier, // Also set parentIdentifier for compatibility with getPropertiesForConnection
                type: connectionType.toLowerCase()
              };
              connections.push(connection);
              console.log(`    ✅ Created connection: ${fromFacility.id} -> ${toFacility.id}`);
            } else {
              console.log(`    ❌ Failed to create connection - missing facilities:`);
              console.log(`      From: "${actualFromNode}" -> ${fromFacility ? 'FOUND' : 'NOT FOUND'}`);
              console.log(`      To: "${actualToNode}" -> ${toFacility ? 'FOUND' : 'NOT FOUND'}`);
            }
          } else {
            console.log(`  Record ${idx}: No matching To record found for: "${fromRecord.parentName}"`);
          }
        });

        return connections;
      };

      // Create line connections from NodeFrom and NodeTo records
      const lineConnections = createConnectionsFromRecords(nodeFromRecords, nodeToRecords, 'Line', 'Lines');
      console.log(`✅ Created ${lineConnections.length} line connections from NodeFrom/NodeTo`);

      // Create gas pipeline connections from GasPipelineGasNodeFrom and GasPipelineGasNodeTo records
      const gasPipelineConnections = createConnectionsFromRecords(
        gasPipelineFromRecords,
        gasPipelineToRecords,
        'GasPipeline',
        'Gas Pipelines'
      );
      console.log(`✅ Created ${gasPipelineConnections.length} gas pipeline connections`);

      // Fetch properties from properties API for both Lines and Gas Pipelines
      let allProperties = [];
      try {
        console.log('🔍 Fetching properties from properties API...');
        const propertiesParams = new URLSearchParams({
          limit: '10000',
          offset: '0'
        });

        // Apply same filters as connections
        if (connectionClassGroupFilter) propertiesParams.append('class_group', connectionClassGroupFilter);
        if (connectionClassFilter) propertiesParams.append('class_name', connectionClassFilter);
        if (connectionCategoryFilter) propertiesParams.append('category', connectionCategoryFilter);
        propertiesParams.append('types', 'System');

        const propertiesResp = await fetch(`${API_BASE}/api/emil/properties?${propertiesParams}`);
        const propertiesData = await propertiesResp.json();

        if (propertiesData && propertiesData.success) {
          allProperties = propertiesData.data || [];
          console.log(`✅ Loaded ${allProperties.length} total properties`);

          // Merge fetched properties into emilProperties state so they're available in linePropertiesByChildName lookup
          const lineAndGasProperties = allProperties.filter(prop => {
            const collection = (prop.Collection || '').toString().trim();
            return collection === 'Lines' || collection === 'Gas Pipelines';
          });

          if (lineAndGasProperties.length > 0) {
            // Merge with existing emilProperties, avoiding duplicates
            const existingKeys = new Set((emilProperties || []).map(p =>
              `${p.Collection || ''}_${p.Child_Name || ''}_${p.Property || ''}`
            ));
            const newProperties = lineAndGasProperties.filter(p => {
              const key = `${p.Collection || ''}_${p.Child_Name || ''}_${p.Property || ''}`;
              return !existingKeys.has(key);
            });

            if (newProperties.length > 0) {
              setEmilProperties(prev => [...(prev || []), ...newProperties]);
              console.log(`  ✅ Merged ${newProperties.length} new line/gas pipeline properties into emilProperties`);
            }
          }

          // Filter for Collection = "Lines"
          const lineProperties = allProperties.filter(prop => {
            const collection = (prop.Collection || '').toString().trim();
            return collection === 'Lines';
          });
          console.log(`  - Line properties: ${lineProperties.length}`);

          // Filter for Collection = "Gas Pipelines"
          const gasPipelineProperties = allProperties.filter(prop => {
            const collection = (prop.Collection || '').toString().trim();
            return collection === 'Gas Pipelines';
          });
          console.log(`  - Gas Pipeline properties: ${gasPipelineProperties.length}`);

          // Match line properties to line connections by Child_Name format "NodeFrom-NodeTo"
          lineConnections.forEach(conn => {
            const matchingProps = lineProperties.filter(prop => {
              const childName = (prop.Child_Name || '').toString().trim();
              // Match by line identifier (e.g., "IE00HPCL-IE00")
              return childName === conn.identifier;
            });

            if (matchingProps.length > 0) {
              // Attach properties to connection
              conn.properties = matchingProps;
              console.log(`  ✅ Attached ${matchingProps.length} properties to line connection ${conn.id}`);
            }
          });

          // Match gas pipeline properties to gas pipeline connections by identifier
          gasPipelineConnections.forEach(conn => {
            const matchingProps = gasPipelineProperties.filter(prop => {
              const childName = (prop.Child_Name || '').toString().trim();
              // Match by pipeline identifier
              return childName === conn.identifier;
            });

            if (matchingProps.length > 0) {
              // Attach properties to connection
              conn.properties = matchingProps;
              console.log(`  ✅ Attached ${matchingProps.length} properties to gas pipeline connection ${conn.id}`);
            }
          });
        }
      } catch (e) {
        console.warn('⚠️ Could not fetch properties:', e);
      }

      // Combine all connections
      const allStrictConnections = [...lineConnections, ...gasPipelineConnections];

      console.log('Total connections:', allStrictConnections.length);
      console.log('  - Line connections:', lineConnections.length);
      console.log('  - Gas Pipeline connections:', gasPipelineConnections.length);

      // If we created new facilities on the fly, persist them to the global state once
      // BUT: If a category filter is active, don't add facilities that don't match the filter
      if (newFacilities.length > 0) {
        try {
          // Deduplicate by id against existing facilitiesData
          const existingIds = new Set((facilitiesData || []).map(f => String(f.id || '').toUpperCase()));
          let toAdd = newFacilities.filter(f => !existingIds.has(String(f.id || '').toUpperCase()));

          // Facilities are now filtered at API level using build tab filters
          // All facilities in the array are already valid

          if (toAdd.length > 0) {
            setFacilitiesData([...(facilitiesData || []), ...toAdd]);
            console.log('✅ Added', toAdd.length, 'auto-created facilities from attributes');
          } else if (newFacilities.length > 0) {
            console.log('⚠️ Skipped', newFacilities.length, 'auto-created facilities - filtered out by category');
          }
        } catch (e) {
          console.warn('Failed to persist auto-created facilities:', e);
        }
      }

      // Set connections - ONLY strict gas pipeline and line/node connections
      // BUT: Don't overwrite mesh connections (user wants all nodes connected)
      setConnections(prev => {
        const hasMesh = prev.some(c => c.type === 'mesh');
        if (hasMesh) {
          console.log('⚠️ Skipping property-based connections - mesh connections are active');
          return prev; // Don't overwrite mesh connections
        }

        if (allStrictConnections.length > 0) {
          console.log('🎯 Setting strict connections (GasPipeline + LineNode):', allStrictConnections);
          return allStrictConnections;
        } else {
          console.log('⚠️ No strict connections found.');
          return [];
        }
      });
    } catch (e) {
      console.error('Failed generating strict connections', e);
      // Don't clear connections if we have mesh connections
      setConnections(prev => {
        const hasMesh = prev.some(c => c.type === 'mesh');
        return hasMesh ? prev : [];
      });
    }
  };

  // Get mock market prices for ENTSO-E style display
  const getMarketPrices = () => {
    return {
      'FR': 65.32,
      'DE': 58.47,
      'ES': 52.18,
      'UK': 71.25,
      'IT': 68.90,
      'BE': 62.15,
      'NL': 59.80
    };
  };

  // Get mock generation mix for ENTSO-E style display
  const getGenerationMix = () => {
    return {
      'Nuclear': 22,
      'Wind': 18,
      'Solar': 15,
      'Hydro': 12,
      'Gas': 20,
      'Coal': 8,
      'Other': 5
    };
  };

  // Legacy display examples are not PyPSA data. Workbook facilities load lazily
  // from the map effect above; do not issue a duplicate workbook/CSV load here.
  useEffect(() => {
    if (engine === 'PyPSA Engine') return;
    setMarketPrices(getMarketPrices());
    setGenerationMix(getGenerationMix());
  }, [engine]);

  // getFacilityData helper: Test data for debugging
  const getFacilityData = (facilityId) => {
    // Test data for debugging
    const testData = {
      'TEST_1': {
        id: 'TEST_1',
        name: 'Test Facility 1',
        country: 'Test Country',
        type: 'Test Node',
        voltage: '400',
        capacity: 1000,
        load: 75,
        peakFlow: 750,
        congestionHours: 120,
        connections: [],
        tags: 'test, debug',
        created: '2024-01-01',
        modified: '2024-01-01',
        latitude: 50.0,
        longitude: 10.0,
        city: 'Test City',
        status: 'Active'
      },
      'TEST_2': {
        id: 'TEST_2',
        name: 'Test Facility 2',
        country: 'Test Country',
        type: 'Test Node',
        voltage: '400',
        capacity: 1500,
        load: 60,
        peakFlow: 900,
        congestionHours: 80,
        connections: [],
        tags: 'test, debug',
        created: '2024-01-01',
        modified: '2024-01-01',
        latitude: 50.0,
        longitude: 10.0,
        city: 'Test City',
        status: 'Active'
      },
      'TEST_3': {
        id: 'TEST_3',
        name: 'Test Facility 3',
        country: 'Test Country',
        type: 'Test Node',
        voltage: '400',
        capacity: 2000,
        load: 85,
        peakFlow: 1700,
        congestionHours: 150,
        connections: [],
        tags: 'test, debug',
        created: '2024-01-01',
        modified: '2024-01-01',
        latitude: 50.0,
        longitude: 10.0,
        city: 'Test City',
        status: 'Active'
      }
    };

    // Fallback to hardcoded data
    const fallbackData = {
      'FR_PAR_400': {
        id: 'FR_PAR_400',
        name: 'Paris',
        country: 'France',
        type: 'Transmission Hub',
        voltage: '400',
        capacity: 3200,
        load: 78,
        peakFlow: 2496,
        congestionHours: 234,
        connections: [
          { id: 'FR_LYO_400', name: 'Lyon', voltage: '400', capacity: 1600 },
          { id: 'FR_LIL_400', name: 'Lille', voltage: '400', capacity: 1200 },
          { id: 'ES_BAR_400', name: 'Barcelona', voltage: '400', capacity: 2200 },
          { id: 'UK_LON_400', name: 'London', voltage: '400', capacity: 2500 }
        ],
        tags: 'transmission, hub, cross-border, HV',
        created: '2024-01-15',
        modified: '2024-03-22',
        latitude: 48.8566,
        longitude: 2.3522,
        city: 'Paris',
        status: 'Active'
      }
    };

    return testData[facilityId] || fallbackData[facilityId] || fallbackData['FR_PAR_400'];
  };

  const getConnectionsForFacility = (facilityId) => {
    // Simple connection logic based on proximity and country
    const facility = facilitiesData.find(f => f.id === facilityId);
    if (!facility) return [];

    const connections = [];
    const facilityLat = parseFloat(facility.latitude);
    const facilityLng = parseFloat(facility.longitude);

    facilitiesData.forEach(other => {
      if (other.id !== facilityId) {
        const otherLat = parseFloat(other.latitude);
        const otherLng = parseFloat(other.longitude);

        // Calculate distance (simple approximation)
        const distance = Math.sqrt(
          Math.pow(facilityLat - otherLat, 2) + Math.pow(facilityLng - otherLng, 2)
        );

        // Connect if within reasonable distance or same country
        if (distance < 0.5 || other.country === facility.country) {
          connections.push({
            id: other.id,
            name: other.name,
            voltage: other.voltage_kv,
            capacity: parseInt(other.capacity_mw)
          });
        }
      }
    });

    return connections.slice(0, 4); // Limit to 4 connections
  };

  // Legacy function for backward compatibility
  const getNodeData = (nodeId) => getFacilityData(nodeId);

  const [aiCalls, setAiCalls] = useState([
    { id: "AI-001", title: "Add 2 GW Offshore Wind (ES, 2035)", status: "pending" },
    { id: "AI-002", title: "Retire Coal units in 2030 (FR, DE borders)", status: "pending" },
    { id: "AI-003", title: "Cap Gas price 60 €/MWh (2030–2035)", status: "approved" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState([]);

  // Copilot API (fast) state
  const [copilotQuery, setCopilotQuery] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState(null);

  // N8n workflow stages state
  const [stagesAccomplished, setStagesAccomplished] = useState([]);
  const [totalStages, setTotalStages] = useState(9); // Default to 9, will be updated from backend
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowStartedAt, setWorkflowStartedAt] = useState(null);
  const pollingIntervalRef = React.useRef(null);
  const runPollingIntervalRef = React.useRef(null); // For polling run completion status
  const [planQuery, setPlanQuery] = useState("");
  const [buildOutputFilename, setBuildOutputFilename] = useState(null); // Store filename from build completion
  const [runWorkflowRunning, setRunWorkflowRunning] = useState(false); // Track run workflow separately
  const [buildCompletedPromptShown, setBuildCompletedPromptShown] = useState(false); // Track if we've shown the run prompt
  const lastRunTriggeredFilenameRef = useRef(null); // Ensure run API fires only once per build
  const [xlsxFileLoading, setXlsxFileLoading] = useState(false); // Track XLSX file loading from Google Drive
  const [xlsxFileLoaded, setXlsxFileLoaded] = useState(false); // Track if XLSX file has been loaded

  // Log streaming state - default to 2025-10-29
  const [showLogStreamer, setShowLogStreamer] = useState(false);
  const [logUniqueId, setLogUniqueId] = useState("2025-10-29");
  const [availableLogs, setAvailableLogs] = useState([]);
  const [logEntries, setLogEntries] = useState([]); // Array of log entries as status updates
  const [logPreviewLoading, setLogPreviewLoading] = useState(false);
  const [logPreviewError, setLogPreviewError] = useState(null);
  const [logPreviewPosition, setLogPreviewPosition] = useState(0);
  const logPreviewEventSourceRef = useRef(null);

  const statusTone = (s) => ({
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  }[s]);

  const scenarios = [
    { name: "Base 2030", tag: "approved" },
    { name: "Hydrogen Push 2035", tag: "draft" },
    { name: "No Nuke 2040", tag: "draft" },
  ];

  // Carriers now dynamically populated from Emil properties collections
  const carriers = useMemo(() => {
    if (emilAvailableClasses.length === 0) {
      // Fallback to default structure
      return [
        { name: 'Emissions & Fuels', classes: ['Fuel', 'Emissions'] },
        { name: 'Electricity', classes: ['Regions', 'Zones', 'Nodes', 'Generators', 'Power2X', 'Batteries', 'Storages'] },
        { name: 'Methane', classes: ['Methane Nodes', 'Methane Fields', 'Methane Plants', 'Methane Demand', 'Methane Transport'] },
        { name: 'Hydrogen', classes: ['Hydrogen Nodes', 'Hydrogen Fields', 'Hydrogen Plants', 'Hydrogen Demand', 'Hydrogen Transport'] },
        { name: 'Liquids', classes: ['Liquids Nodes', 'Liquids Fields', 'Liquids Plants', 'Liquids Demand', 'Liquids Transport'] },
        { name: 'CO2', classes: [] },
      ];
    }

    // Group collections for sidebar (you can customize this grouping)
    return [
      {
        name: 'Components',
        classes: emilAvailableClasses.filter(c =>
          c.includes('Generator') || c.includes('Battery') || c.includes('Storage') || c.includes('Line')
        )
      },
      {
        name: 'Resources',
        classes: emilAvailableClasses.filter(c =>
          c.includes('Fuel') || c.includes('Emission')
        )
      },
      {
        name: 'System',
        classes: emilAvailableClasses.filter(c =>
          c.includes('Data Files') || c.includes('Variable') || c.includes('Constraint')
        )
      },
      {
        name: 'All Collections',
        classes: emilAvailableClasses
      },
    ];
  }, [emilAvailableClasses]);

  const availableEngines = [
    {
      name: 'PLEXOS Engine',
      description: 'Comprehensive electricity market simulation and optimization',
      icon: Zap,
      color: 'from-blue-500 to-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700',
      features: ['Market Clearing', 'Unit Commitment', 'Economic Dispatch', 'Transmission Planning']
    },
    {
      name: 'PyPSA Engine',
      description: 'Open-source power system analysis with Python flexibility',
      icon: Network,
      color: 'from-green-500 to-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-700',
      features: ['Linear Programming', 'Network Analysis', 'Renewable Integration', 'Sector Coupling']
    },
    {
      name: 'PSSE Engine',
      description: 'Industry-standard power system stability and dynamics',
      icon: Settings,
      color: 'from-purple-500 to-purple-700',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-700',
      features: ['Dynamic Simulation', 'Stability Analysis', 'Fault Analysis', 'Protection Studies']
    },
    {
      name: 'SAint Engine',
      description: 'Advanced grid analytics and situational awareness',
      icon: Sparkles,
      color: 'from-orange-500 to-orange-700',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-700',
      features: ['Real-time Monitoring', 'Contingency Analysis', 'State Estimation', 'Grid Visualization']
    },
    {
      name: 'Climate Engine',
      description: 'Climate impact modeling and renewable resource assessment',
      icon: Sparkles,
      color: 'from-teal-500 to-teal-700',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-200',
      textColor: 'text-teal-700',
      features: ['Weather Modeling', 'Climate Scenarios', 'Resource Assessment', 'Impact Analysis']
    },
    {
      name: 'Demand Engine',
      description: 'Load forecasting and demand response optimization',
      icon: LineChart,
      color: 'from-red-500 to-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-700',
      features: ['Load Forecasting', 'Demand Response', 'Peak Shaving', 'Consumer Analytics']
    },
    {
      name: 'Supply Engine',
      description: 'Generation planning and resource adequacy analysis',
      icon: Database,
      color: 'from-indigo-500 to-indigo-700',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      textColor: 'text-indigo-700',
      features: ['Resource Planning', 'Capacity Expansion', 'Generation Dispatch', 'Reliability Analysis']
    },
    {
      name: 'Infrastructure Engine',
      description: 'Grid infrastructure modeling and investment planning',
      icon: Boxes,
      color: 'from-gray-500 to-gray-700',
      bgColor: 'bg-tj-navy-dark/60 backdrop-blur-md',
      borderColor: 'border-white/5',
      textColor: 'text-tj-gray',
      features: ['Asset Management', 'Investment Planning', 'Infrastructure Modeling', 'Lifecycle Analysis']
    }
  ];

  // Function to update assistant status - will be used by Otis script in the future
  const updateAssistantStatus = (assistantId, status) => {
    setAssistantStatus(prev => ({
      ...prev,
      [assistantId]: status
    }));
  };

  // Demo function to show status changes (can be removed later)
  const demoStatusUpdates = () => {
    // Simulate Otis calling multiple assistants
    updateAssistantStatus('nova', 'queued');
    updateAssistantStatus('lola', 'queued');

    setTimeout(() => {
      updateAssistantStatus('nova', 'active');
      updateAssistantStatus('emil', 'idle');
    }, 2000);

    setTimeout(() => {
      updateAssistantStatus('nova', 'idle');
      updateAssistantStatus('lola', 'active');
    }, 4000);

    setTimeout(() => {
      updateAssistantStatus('lola', 'idle');
      updateAssistantStatus('emil', 'active');
    }, 6000);
  };

  // Load Emil properties data
  const loadEmilProperties = async () => {
    setEmilPropertiesLoading(true);
    try {
      const params = new URLSearchParams({
        limit: emilLimit.toString(),
        offset: emilOffset.toString()
      });

      // Helper: compare ignoring spaces and case
      const norm = (s) => (s || '').toString().replace(/\s+/g, '').toLowerCase();
      const groupsNormalized = new Map((emilAvailableClassGroups || []).map(g => [norm(g), g]));
      const classesNormalized = new Map((emilAvailableClasses || []).map(c => [norm(c), c]));

      const selectedGroupNorm = norm(emilClassGroupFilter);
      const selectedClassNorm = norm(emilClassFilter);

      // Power2X should always be sent as class_name, not class_group
      const isPower2X = selectedClassNorm === norm('Power2X');

      // If class filter actually equals a known group (ignoring spaces/case), promote to group
      // BUT exclude Power2X which should always be class_name
      if (selectedClassNorm && groupsNormalized.has(selectedClassNorm) && !isPower2X) {
        const promotedGroup = groupsNormalized.get(selectedClassNorm);
        params.append('class_group', promotedGroup);
        // do NOT send class_name in this case
      } else {
        // Add class_group if selected (but not if Power2X is the class)
        if (selectedGroupNorm && groupsNormalized.has(selectedGroupNorm)) {
          params.append('class_group', groupsNormalized.get(selectedGroupNorm));
        }
        // Add class_name - Power2X should always go here
        if (selectedClassNorm && classesNormalized.has(selectedClassNorm)) {
          params.append('class_name', classesNormalized.get(selectedClassNorm));
        }
      }
      if (emilCategoryFilter) params.append('category', emilCategoryFilter);
      if (emilChildNameFilter) params.append('child_name', emilChildNameFilter);
      if (emilObjectFilter) params.append('object', emilObjectFilter);
      if (emilPropertyFilter) params.append('property', emilPropertyFilter);
      // For Build tab and Map tab, include System only (drop "Both");
      // For Run tab, include Simulation types only
      // Always send types parameter - backend will handle filtering appropriately
      if (activeAssistant === 'emil' && (activeTab === 'build' || activeTab === 'map')) {
        params.append('types', 'System');
      } else if (activeAssistant === 'emil' && activeTab === 'run') {
        params.append('types', 'Simulation');
      }

      const response = await fetch(`${API_BASE}/api/emil/properties?${params}`);
      const data = await response.json();

      if (data.success) {
        setEmilProperties(data.data || []);
        setEmilTotalCount(data.total_count || 0);
        if (data.filters) {
          setEmilAvailableClassGroups(data.filters.class_groups || []);
          setEmilAvailableClasses(data.filters.classes || []);
          setEmilAvailableCategories(data.filters.categories || []);
          setEmilAvailableChildNames(data.filters.child_names || []);
          // Extract unique objects (Child_Name) from the properties data itself
          // since properties API doesn't return objects in filters
          // Filter out objects with "-" in their name (they are not nodes)
          const uniqueObjectsFromData = [...new Set((data.data || []).map(r => r.Child_Name || '').filter(Boolean))]
            .filter(objName => !objName.includes('-')); // Exclude objects with "-"
          const filteredApiObjects = (data.filters.objects || []).filter(objName => !objName.includes('-'));
          setEmilAvailableObjects(uniqueObjectsFromData.length > 0 ? uniqueObjectsFromData : filteredApiObjects);
          setEmilAvailableProperties(data.filters.properties || []);
        }
      }
    } catch (error) {
      console.error('Error loading Emil properties:', error);
    } finally {
      setEmilPropertiesLoading(false);
    }
  };

  // Lightweight loader to ensure Line properties are available on the Map tab
  const ensureLinePropertiesForMap = useCallback(async () => {
    try {
      // If we already have some Lines properties, skip
      const hasLines = (emilProperties || []).some(r => (r.Collection || '') === 'Lines');
      if (hasLines) return;
      // First try: broad fetch without object/type filter so backend doesn't over-filter
      const params = new URLSearchParams({ limit: '2000' });
      const response = await fetch(`${API_BASE}/api/emil/properties?${params}`);
      const data = await response.json();
      if (data && data.success && Array.isArray(data.data)) {
        const onlyLines = data.data.filter(r => (r.Collection || '') === 'Lines');
        if (onlyLines.length > 0) {
          const merged = [...(emilProperties || []), ...onlyLines];
          setEmilProperties(merged);
          console.log(`[Map] Loaded ${onlyLines.length} Lines properties (broad fetch)`);
          return;
        }
      }
      // Fallback: try object=Lines
      try {
        const p2 = new URLSearchParams({ limit: '2000', object: 'Lines' });
        const r2 = await fetch(`${API_BASE}/api/emil/properties?${p2}`);
        const d2 = await r2.json();
        if (d2 && d2.success && Array.isArray(d2.data)) {
          const merged = [...(emilProperties || []), ...d2.data];
          setEmilProperties(merged);
          console.log(`[Map] Loaded ${d2.data.length} Lines properties (object=Lines)`);
        }
      } catch { }
    } catch (e) {
      console.warn('ensureLinePropertiesForMap failed:', e);
    }
  }, [emilProperties]);

  // Load Emil properties when filters or pagination changes
  useEffect(() => {
    if (activeAssistant === 'emil' && (activeTab === 'build' || activeTab === 'run') && viewMode === 'properties') {
      loadEmilProperties();
    }
  }, [activeAssistant, activeTab, viewMode, emilClassGroupFilter, emilClassFilter, emilCategoryFilter, emilChildNameFilter, emilObjectFilter, emilPropertyFilter, emilOffset]);

  // Load filter options when map tab is opened or filters change (same as build tab)
  // This ensures filter options are updated based on current selections
  useEffect(() => {
    if (engine !== 'PyPSA Engine' && activeAssistant === 'emil' && activeTab === 'map') {
      // Use the same API call as build tab to ensure consistency
      loadEmilProperties();
    }
  }, [engine, activeAssistant, activeTab, emilClassGroupFilter, emilClassFilter, emilCategoryFilter]);


  // When in Map tab, ensure Lines properties are loaded for click-inspect
  useEffect(() => {
    if (engine !== 'PyPSA Engine' && activeAssistant === 'emil' && activeTab === 'map') {
      ensureLinePropertiesForMap();
    }
  }, [engine, activeAssistant, activeTab, ensureLinePropertiesForMap]);

  // Load Emil memberships data
  const loadEmilMemberships = async () => {
    setEmilMembershipsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: emilMembershipsLimit.toString(),
        offset: emilMembershipsOffset.toString()
      });

      // Use SHARED filters for Class Group, Class, and Category
      if (emilClassGroupFilter) params.append('class_group', emilClassGroupFilter);
      if (emilClassFilter) params.append('class_name', emilClassFilter);
      if (emilCategoryFilter) params.append('category', emilCategoryFilter);

      // Use membership-specific filters for Child Name, Object and Membership
      if (emilMemChildNameFilter) params.append('child_name', emilMemChildNameFilter);
      if (emilMemObjectFilter) params.append('object', emilMemObjectFilter);
      if (emilMemMembershipFilter) params.append('membership', emilMemMembershipFilter);
      // For Build tab, include System and Both types only
      // For Run tab, include Simulation types only
      // Always send types parameter - backend will handle filtering appropriately
      if (activeAssistant === 'emil' && activeTab === 'build') {
        params.append('types', 'System');
      } else if (activeAssistant === 'emil' && activeTab === 'run') {
        params.append('types', 'Simulation');
      }

      const response = await fetch(`${API_BASE}/api/emil/memberships?${params}`);
      const data = await response.json();

      if (data.success) {
        setEmilMemberships(data.data || []);
        setEmilMembershipsTotalCount(data.total_count || 0);
        if (data.filters) {
          // Update available options for memberships-specific filters
          setEmilMemAvailableObjects(data.filters.objects || []);
          setEmilMemAvailableMemberships(data.filters.memberships || []);
          setEmilMemAvailableChildNames(data.filters.child_names || []);

          // Also update shared filter options (same structure as properties endpoint)
          setEmilAvailableClassGroups(data.filters.class_groups || []);
          setEmilAvailableClasses(data.filters.classes || []);
          setEmilAvailableCategories(data.filters.categories || []);
        }
      }
    } catch (error) {
      console.error('Error loading Emil memberships:', error);
    } finally {
      setEmilMembershipsLoading(false);
    }
  };

  // Load Emil memberships when filters or pagination changes
  useEffect(() => {
    if (activeAssistant === 'emil' && (activeTab === 'build' || activeTab === 'run') && viewMode === 'memberships') {
      loadEmilMemberships();
    }
  }, [activeAssistant, activeTab, viewMode, emilClassGroupFilter, emilClassFilter, emilCategoryFilter, emilMemChildNameFilter, emilMemObjectFilter, emilMemMembershipFilter, emilMembershipsOffset]);

  // Load Emil attributes data
  const loadEmilAttributes = async () => {
    setEmilAttributesLoading(true);
    try {
      const params = new URLSearchParams({
        limit: emilAttributesLimit.toString(),
        offset: emilAttributesOffset.toString()
      });

      // Use SHARED filters for Class Group, Class, and Category
      if (emilClassGroupFilter) params.append('class_group', emilClassGroupFilter);
      if (emilClassFilter) params.append('class_name', emilClassFilter);
      if (emilCategoryFilter) params.append('category', emilCategoryFilter);

      // Use attributes-specific filters for Object and Attribute
      if (emilAttrObjectFilter) params.append('object', emilAttrObjectFilter);
      if (emilAttrAttributeFilter) params.append('attribute', emilAttrAttributeFilter);

      // For Build tab, include System types only
      // For Run tab, include Simulation types only
      // Always send types parameter - backend will handle filtering appropriately
      if (activeAssistant === 'emil' && activeTab === 'build') {
        params.append('types', 'System');
      } else if (activeAssistant === 'emil' && activeTab === 'run') {
        params.append('types', 'Simulation');
      }

      const response = await fetch(`${API_BASE}/api/emil/attributes?${params}`);
      const data = await response.json();

      if (data.success) {
        setEmilAttributes(data.data || []);
        setEmilAttributesTotalCount(data.total_count || 0);
        if (data.filters) {
          // Update available options for attributes-specific filters
          setEmilAttrAvailableObjects(data.filters.objects || []);
          setEmilAttrAvailableAttributes(data.filters.attributes || []);

          // Also update shared filter options (same structure as properties endpoint)
          setEmilAvailableClassGroups(data.filters.class_groups || []);
          setEmilAvailableClasses(data.filters.classes || []);
          setEmilAvailableCategories(data.filters.categories || []);
        }
      }
    } catch (error) {
      console.error('Error loading Emil attributes:', error);
    } finally {
      setEmilAttributesLoading(false);
    }
  };

  // Load Emil attributes when filters or pagination changes
  useEffect(() => {
    if (activeAssistant === 'emil' && (activeTab === 'build' || activeTab === 'run') && viewMode === 'attributes') {
      loadEmilAttributes();
    }
  }, [activeAssistant, activeTab, viewMode, emilClassGroupFilter, emilClassFilter, emilCategoryFilter, emilAttrObjectFilter, emilAttrAttributeFilter, emilAttributesOffset]);

  // Ensure shared filter options are loaded (from Properties endpoint) when switching views
  useEffect(() => {
    if (activeAssistant === 'emil' && (activeTab === 'build' || activeTab === 'run')) {
      // If shared filter options are empty and we haven't loaded them yet, load from Properties endpoint
      if (emilAvailableClassGroups.length === 0) {
        loadEmilProperties();
      }
    }
  }, [activeAssistant, activeTab, viewMode]);

  // Load connection filter options when map tab is opened
  useEffect(() => {
    if (engine !== 'PyPSA Engine' && activeAssistant === 'emil' && activeTab === 'map') {
      // Load filter options from properties endpoint (same structure)
      if (connectionAvailableClassGroups.length === 0) {
        const loadConnectionFilters = async () => {
          try {
            const params = new URLSearchParams({ limit: '1' }); // Just need filters, not data
            const response = await fetch(`${API_BASE}/api/emil/properties?${params}`);
            const data = await response.json();
            if (data.success && data.filters) {
              setConnectionAvailableClassGroups(data.filters.class_groups || []);
              setConnectionAvailableClasses(data.filters.classes || []);
              setConnectionAvailableCategories(data.filters.categories || []);
              setConnectionAvailableObjects(data.filters.objects || []);
              setConnectionAvailableProperties(data.filters.properties || []);
            }
          } catch (error) {
            console.error('Error loading connection filters:', error);
          }
        };
        loadConnectionFilters();
      }
    }
  }, [engine, activeAssistant, activeTab]);

  // Load Emil hierarchy structure
  const loadEmilHierarchy = async () => {
    setHierarchyLoading(true);
    try {
      // For Build tab, include System and Both types only
      // For Run tab, include Simulation types only
      let url = `${API_BASE}/api/emil/hierarchy`;
      if (activeAssistant === 'emil' && activeTab === 'build') {
        url = `${API_BASE}/api/emil/hierarchy?types=System,Both`;
      } else if (activeAssistant === 'emil' && activeTab === 'run') {
        url = `${API_BASE}/api/emil/hierarchy?types=Simulation`;
      }
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setEmilHierarchy(data.hierarchy || []);
        // Auto-select first class group if none selected
        if (data.hierarchy.length > 0 && !hierarchySelectedClassGroup) {
          setHierarchySelectedClassGroup(data.hierarchy[0]);
        }
      }
    } catch (error) {
      console.error('Error loading Emil hierarchy:', error);
    } finally {
      setHierarchyLoading(false);
    }
  };

  // Load hierarchy when Emil Build tab is first opened
  useEffect(() => {
    if (activeAssistant === 'emil' && (activeTab === 'build' || activeTab === 'run') && emilHierarchy.length === 0) {
      loadEmilHierarchy();
    }
  }, [activeAssistant, activeTab]);

  // Load model child names from execute -> model -> parent category = "All Models"
  // Model list is now hardcoded - removed loadModelChildNames() function
  // Models are defined in availableModelChildNames constant above

  // Objects are no longer displayed, but we keep the state for potential future use
  // Category selection still works to filter properties/memberships

  // Legacy mock data (kept for backwards compatibility)
  const tableRows = useMemo(() => (
    new Array(8).fill(0).map((_, i) => ({
      id: `GEN_${1000 + i}`,
      zone: i % 2 ? "ES" : "FR",
      tech: i % 3 ? "CCGT" : "Wind Onshore",
      cap_mw: 500 + i * 25,
      heat_rate: i % 3 ? 6.8 : 0,
      var_om: 2.1 + i * 0.05,
      fuel: i % 3 ? "Methane" : "—",
    }))
  ), []);

  // Call external Copilot API (fast)
  const handleCopilotAsk = async () => {
    if (!copilotQuery || copilotLoading) return;
    // append user message
    setChatLog((prev) => [...prev, { role: 'user', content: copilotQuery }]);
    setCopilotLoading(true);
    setCopilotError(null);
    setCopilotAnswer(null);
    try {
      const response = await fetch(`${API_BASE}/analyze/fast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: copilotQuery })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      let data;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = { raw: text };
      }
      const answer = data?.answer || data?.result || data?.output || data?.message || data?.raw || data;
      setCopilotAnswer(answer);
      // append assistant message with full JSON so we can render nicely
      setChatLog((prev) => [...prev, { role: 'assistant', content: data }]);
      setCopilotQuery("");
    } catch (err) {
      setCopilotError(err?.message || "Request failed");
      setChatLog((prev) => [...prev, { role: 'assistant', error: err?.message || 'Request failed' }]);
    } finally {
      setCopilotLoading(false);
    }
  };

  // Fetch stages from backend
  const fetchStages = async () => {
    try {
      const response = await fetch(`${API_BASE}/stages`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      console.log(`📊 Fetched stages: ${data.stages?.length || 0}/${data.total_stages || 9}, is_complete: ${data.is_complete}`);

      setStagesAccomplished(data.stages || []);
      if (data.total_stages) {
        setTotalStages(data.total_stages);
      }

      // Determine final stage and whether it is finished
      const finalStage = data.stages?.find(s => s.stage_number === 9) || data.stages?.[data.stages.length - 1];
      const finalStageStatus = (finalStage?.status || finalStage?.state || finalStage?.stage_status || '').toString().toLowerCase();
      const finalStageDone = finalStageStatus === 'done' || finalStageStatus === 'completed' || finalStageStatus === 'complete';

      // Stop polling only when backend signals complete OR stage 9 is explicitly done
      const shouldStopPolling = data.is_complete || (finalStageDone && (data.stages?.length || 0) >= (data.total_stages || 9));

      if (shouldStopPolling) {
        console.log("🛑 Stopping condition met (build complete and final stage done)!");

        // Extract filename from final stage if available and only when final stage is done
        if (finalStage && finalStageDone) {
          console.log("📋 Final stage data:", finalStage);

          // Try to extract filename from stage data
          // The filename could be in: finalStage.data.filename, finalStage.data.body.filename, or finalStage.filename
          let filename = null;

          if (finalStage.data) {
            if (typeof finalStage.data === 'object') {
              // Check if filename is directly in data
              if (finalStage.data.filename) {
                filename = finalStage.data.filename;
              }
              // Check if filename is in data.body (from webhook body)
              else if (finalStage.data.body?.filename) {
                filename = finalStage.data.body.filename;
              }
              // Check if the entire data object is the response
              else if (finalStage.data.title === "Final Model Output" && finalStage.data.filename) {
                filename = finalStage.data.filename;
              }
            }
          }

          // Also check if filename is directly on the stage (backend now stores it here)
          if (!filename && finalStage.filename) {
            filename = finalStage.filename;
          }

          // Also check if the entire request body was stored (for backward compatibility)
          if (!filename && finalStage.data && typeof finalStage.data === 'object') {
            // Check if data itself contains filename (when entire body is stored)
            if (finalStage.data.filename && !finalStage.data.body) {
              filename = finalStage.data.filename;
            }
          }

          if (filename) {
            console.log("📄 Extracted filename from build:", filename);
            setBuildOutputFilename(filename);
            // Trigger XLSX file search and load
            searchAndLoadXlsxFile(filename);

            // Add completion message to copilot chat
            setCopilotChatMessages(prev => [...prev, {
              id: prev.length + 1,
              text: `✅ Build completed successfully! Model file "${filename}" is ready.\n\nYou can now run the simulation from the Build tab.`,
              sender: 'bot',
              timestamp: new Date()
            }]);
          } else {
            console.log("⚠️ No filename found in final stage. Stage data:", finalStage);
          }
        } else if (!finalStageDone) {
          console.log("⚠️ Final stage not marked done; skipping filename extraction.");
        }

        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          setWorkflowRunning(false);
          // Reset Emil status to idle when build workflow completes
          setAssistantStatus(prev => ({
            ...prev,
            emil: 'idle'
          }));
          console.log("✅ All stages complete. Polling stopped. Interval cleared. Emil status set to idle.");
        } else {
          console.log("⚠️ Interval ref is null, already stopped?");
        }
      }
    } catch (err) {
      console.error("Failed to fetch stages:", err);
    }
  };

  // Stop polling manually
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setWorkflowRunning(false);
      console.log("⏹️ Polling stopped manually.");
    }
  };

  // Search for XLSX file in Google Drive and load it (with retry logic)
  const searchAndLoadXlsxFile = async (xmlFilename, retryCount = 0, maxRetries = 5) => {
    if (!xmlFilename) return;

    // Convert .xml to .xlsx
    const xlsxFilename = xmlFilename.replace('.xml', '.xlsx');

    if (retryCount === 0) {
      console.log(`🔍 Starting XLSX file download and search: ${xlsxFilename}`);
      setXlsxFileLoading(true);
      setXlsxFileLoaded(false);

      // Wait 3 seconds on first attempt to let backend download the file
      console.log('⏳ Waiting for backend to download file from Google Drive...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.log(`🔄 Retry attempt ${retryCount}/${maxRetries} for ${xlsxFilename}`);
      // Wait 2 seconds between retries
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    try {
      const response = await fetch(`${API_BASE}/api/emil/search-xlsx-in-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: xmlFilename,
          folder_id: '1i9KZ65eL-tQ194tYrt8kgnfzaDc_TKyx'
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log(`✅ Found and downloaded XLSX file: ${data.filename}`);
        console.log(`📁 Local path: ${data.local_path}`);

        // Clear the cache so the backend will use the new file
        // Force reload of properties, map, and memberships
        setXlsxFileLoaded(true);
        setXlsxFileLoading(false);

        // Clear existing data to force reload
        setEmilProperties([]);
        setEmilTotalCount(0);

        // Trigger reload of properties
        if (activeAssistant === 'emil' && (activeTab === 'build' || activeTab === 'run')) {
          // Reload properties with the new file
          setTimeout(() => {
            loadEmilProperties();
          }, 500);
        }
      } else {
        // File not found - retry if we haven't exceeded max retries
        if (retryCount < maxRetries) {
          console.log(`⏳ File not ready yet, retrying in 2 seconds...`);
          return searchAndLoadXlsxFile(xmlFilename, retryCount + 1, maxRetries);
        } else {
          // Max retries exceeded
          console.error(`❌ XLSX file not found after ${maxRetries} retries: ${data.error || 'Unknown error'}`);
          setXlsxFileLoading(false);
          console.warn(`Warning: Could not find XLSX file "${xlsxFilename}" in Google Drive after ${maxRetries} attempts.`);
        }
      }
    } catch (error) {
      console.error('Error searching for XLSX file:', error);

      // Retry on network errors too
      if (retryCount < maxRetries) {
        console.log(`⏳ Network error, retrying in 2 seconds...`);
        return searchAndLoadXlsxFile(xmlFilename, retryCount + 1, maxRetries);
      } else {
        setXlsxFileLoading(false);
        console.error(`Error searching for XLSX file after ${maxRetries} attempts: ${error.message}`);
      }
    }
  };

  // Handle Generate Plan button click
  const handleGeneratePlan = async () => {
    if (!planQuery.trim()) {
      alert("Please enter a query before generating a plan");
      return;
    }

    try {
      setWorkflowRunning(true);
      setStagesAccomplished([]);
      setWorkflowStartedAt(new Date().toISOString());

      // Light up Emil status indicator (green light)
      setAssistantStatus(prev => ({
        ...prev,
        emil: 'active'
      }));

      // Trigger N8n workflow - this returns immediately
      const response = await fetch(`${API_BASE}/trigger-n8n`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: planQuery,
          n8n_webhook_url: "https://n8n.terajouleenergy.com/webhook/96f1eaeb-7f3c-49a6-bf69-954f56ff602e",
          webhook_base_url: `${API_BASE}/webhook/stage`
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log("Workflow initiated:", result.message);

      // DISABLED: Stage polling to prevent memory corruption issues
      // pollingIntervalRef.current = setInterval(fetchStages, 2000);

      // Auto-stop polling after 5 minutes (safety timeout)
      // setTimeout(() => {
      //   if (pollingIntervalRef.current) {
      //     clearInterval(pollingIntervalRef.current);
      //     pollingIntervalRef.current = null;
      //     setWorkflowRunning(false);
      //     // Reset Emil status when workflow completes
      //     setAssistantStatus(prev => ({
      //       ...prev,
      //       emil: 'idle'
      //     }));
      //     console.log("⏱️ Polling timeout reached (5 minutes). Stopped automatically.");
      //   }
      // }, 5 * 60 * 1000); // 5 minutes

      // DISABLED: Also fetch immediately
      // fetchStages();

    } catch (err) {
      console.error("Failed to generate plan:", err);
      alert("Failed to initiate workflow: " + err.message);
      setWorkflowRunning(false);
      // Reset Emil status on error
      setAssistantStatus(prev => ({
        ...prev,
        emil: 'idle'
      }));
    }
  };

  // Poll for run completion status
  const pollRunStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/run-status`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      if (data.completed) {
        console.log("✅ Run completed:", data);

        // Stop polling
        if (runPollingIntervalRef.current) {
          clearInterval(runPollingIntervalRef.current);
          runPollingIntervalRef.current = null;
        }

        // Add completion message to copilot chat
        let messageText = `✅ Simulation run completed successfully!`;
        if (data.modelname) {
          messageText += `\n\nModel: "${data.modelname}"`;
        }
        if (data.filename) {
          messageText += `\nFile: "${data.filename}"`;
        }
        messageText += `\n\nResults are now available in the Results tab.`;

        if (data.error) {
          messageText += `\n\n⚠️ Note: ${data.error}`;
        }

        setCopilotChatMessages(prev => [...prev, {
          id: prev.length + 1,
          text: messageText,
          sender: 'bot',
          timestamp: new Date()
        }]);

        // Reset status
        setAssistantStatus(prev => ({
          ...prev,
          emil: 'idle'
        }));
        setRunWorkflowRunning(false);

        // Reset run status on backend for next run
        await fetch(`${API_BASE}/run-status/reset`, { method: 'POST' });
      }
    } catch (err) {
      console.error("Failed to poll run status:", err);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (runPollingIntervalRef.current) {
        clearInterval(runPollingIntervalRef.current);
        runPollingIntervalRef.current = null;
      }
    };
  }, []);

  // Fetch available logs
  const fetchAvailableLogs = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/logs/list`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAvailableLogs(data.logs || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  };

  // Parse log content into individual entries
  const parseLogEntries = useCallback((content) => {
    if (!content || typeof content !== 'string') return [];
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map((line, index) => ({
      id: `log-${Date.now()}-${index}`,
      text: line.trim(),
      timestamp: new Date().toISOString(),
      status: 'completed'
    }));
  }, []);

  // Initial load of log preview (only once)
  const loadInitialLogPreview = useCallback(async () => {
    if (!logUniqueId) return false;

    setLogPreviewLoading(true);
    setLogPreviewError(null);

    try {
      // Find the log file
      const findResponse = await fetch(`${API_BASE}/api/logs/find/${encodeURIComponent(logUniqueId)}`);
      if (!findResponse.ok) {
        throw new Error(`Find request failed: ${findResponse.status}`);
      }

      const findData = await findResponse.json();
      if (!findData.success || !findData.log) {
        throw new Error('Log file not found');
      }

      // Get last 10 lines as initial preview
      const tailResponse = await fetch(`${API_BASE}/api/logs/${findData.log.id}/tail?lines=10`);
      if (!tailResponse.ok) {
        throw new Error(`Tail request failed: ${tailResponse.status}`);
      }

      const tailData = await tailResponse.json();
      if (!tailData.success) {
        throw new Error('Failed to get log content');
      }

      const content = tailData.content || "";
      if (!content.trim()) {
        // No content but successful - not an error
        setLogEntries([]);
        setLogPreviewPosition(0);
        setLogPreviewLoading(false);
        return true;
      }

      const entries = parseLogEntries(content);
      setLogEntries(entries);
      setLogPreviewPosition(content.length);
      setLogPreviewLoading(false);
      setLogPreviewError(null); // Clear any previous errors
      return true; // Success

    } catch (err) {
      console.error("Failed to fetch log preview:", err);
      const errorMessage = err.message || "Failed to load log preview";
      setLogPreviewError(errorMessage);
      setLogPreviewLoading(false);
      return false;
    }
  }, [logUniqueId, parseLogEntries]);

  // Stream log preview updates using SSE (smooth, no loading state)
  useEffect(() => {
    if (!aiOpen || activeAssistant !== 'emil' || activeTab !== 'build' || !logUniqueId) {
      // Clean up event source when drawer closes
      if (logPreviewEventSourceRef.current) {
        logPreviewEventSourceRef.current.close();
        logPreviewEventSourceRef.current = null;
      }
      return;
    }

    let eventSource = null;
    let currentPosition = 0;

    const startStreaming = async () => {
      // First, load initial content
      const success = await loadInitialLogPreview();
      if (!success) return;

      // Get the position after initial load
      currentPosition = logPreviewPosition;

      // DISABLED: Log streaming to prevent memory corruption issues
      // Log streaming is disabled to prevent memory corruption and semaphore leaks
      return;
      // Then start streaming for updates (no loading state)
      // try {
      //   const streamUrl = `${API_BASE}/api/logs/${encodeURIComponent(logUniqueId)}/stream-by-id?last_position=${currentPosition}`;
      //   eventSource = new EventSource(streamUrl);
      //   logPreviewEventSourceRef.current = eventSource;

      //   eventSource.onmessage = (event) => {
      //     try {
      //       const data = JSON.parse(event.data);

      //       if (data.type === 'content' && data.content) {
      //         // Parse new content into log entries
      //         const newEntries = parseLogEntries(data.content);
      //         if (newEntries.length > 0) {
      //           // Add new entries with processing status
      //           setLogEntries((prev) => {
      //             // Remove any "processing" entries and add new ones
      //             const completed = prev.filter(e => e.status !== 'processing');
      //             const newWithProcessing = newEntries.map(entry => ({
      //               ...entry,
      //               id: `log-${Date.now()}-${Math.random()}`,
      //               status: 'processing'
      //             }));
      //             // Combine and keep only last 10 entries (always show latest)
      //             const combined = [...completed, ...newWithProcessing];
      //             return combined.slice(-10);
      //           });

      //           // After a short delay, mark new entries as completed
      //           setTimeout(() => {
      //             setLogEntries((prev) =>
      //               prev.map(entry =>
      //                 entry.status === 'processing'
      //                   ? { ...entry, status: 'completed' }
      //                   : entry
      //               )
      //             );
      //           }, 800);
      //         }
      //         currentPosition = data.position;
      //         setLogPreviewPosition(data.position);
      //       } else if (data.type === 'heartbeat') {
      //         // Just a heartbeat, no UI change needed
      //       } else if (data.type === 'error') {
      //         console.error('Stream error:', data.error);
      //       }
      //     } catch (err) {
      //       console.error('Error parsing SSE data:', err);
      //     }
      //   };

      //   eventSource.onerror = (err) => {
      //     if (eventSource.readyState === EventSource.CLOSED) {
      //       console.log('Log preview stream closed');
      //     }
      //   };
      // } catch (err) {
      //   console.error('Error starting log preview stream:', err);
      // }
    };

    startStreaming();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (logPreviewEventSourceRef.current) {
        logPreviewEventSourceRef.current.close();
        logPreviewEventSourceRef.current = null;
      }
    };
  }, [aiOpen, activeAssistant, activeTab, logUniqueId, loadInitialLogPreview, parseLogEntries]);

  // Open log streamer with unique ID
  const openLogStreamer = (uniqueId) => {
    setLogUniqueId(uniqueId);
    setShowLogStreamer(true);
  };

  // Use fixed log file 2025-10-29
  // No need to change logUniqueId based on workflow

  // Log file is fixed to 2025-10-29, no need to fetch or auto-select

  // Basic markdown to HTML (headings, bold, bullets, line breaks)
  const escapeHtml = (str) => (
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  );
  const markdownToBasicHtml = (md) => {
    if (!md) return "";
    let html = escapeHtml(md);
    // headings
    html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-sm font-semibold text-tj-gray mt-2 mb-1">$1<\/h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2 class="text-base font-semibold text-tj-gray mt-3 mb-1">$1<\/h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1 class="text-lg font-bold text-tj-gray mt-3 mb-1">$1<\/h1>');
    // bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-tj-gray">$1<\/strong>');
    // italic
    html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1<\/em>');
    // code inline
    html = html.replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1.5 py-0.5 rounded text-xs font-mono text-tj-gray">$1<\/code>');
    // code blocks
    html = html.replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```[\w]*\n?/g, '').trim();
      return `<pre class="bg-black/30 p-3 rounded-xl overflow-x-auto my-2"><code class="text-xs font-mono text-tj-gray">${code}<\/code><\/pre>`;
    });
    // numbered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<div class="pl-4 my-1"><span class="text-tj-slate">$1<\/span><\/div>');
    // bullets: lines starting with - or *
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<div class="pl-4 my-1 flex items-start"><span class="mr-2 text-tj-slate">•<\/span><span>$1<\/span><\/div>');
    // horizontal rules
    html = html.replace(/^---$/gm, '<hr class="my-3 border-white/5"/>');
    // line breaks (but preserve double line breaks for paragraphs)
    html = html.replace(/\n\n/g, '</p><p class="my-2">');
    html = html.replace(/\n/g, '<br/>');
    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) {
      html = '<p>' + html + '</p>';
    }
    return html;
  };

  // Render markdown as React elements
  const renderMarkdown = (text) => {
    if (!text) return null;
    const html = markdownToBasicHtml(text);
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const normalizeBusId = useCallback((value) => String(value || '').trim().toUpperCase(), []);
  const solvedRegionBusSet = useMemo(
    () => new Set((regionManifest?.solved_buses || []).map(normalizeBusId).filter(Boolean)),
    [regionManifest, normalizeBusId]
  );
  const boundaryRegionBusSet = useMemo(
    () => new Set((regionManifest?.boundary_buses || []).map(normalizeBusId).filter(Boolean)),
    [regionManifest, normalizeBusId]
  );
  // Boundary lines/links the runner explicitly listed (one endpoint in core,
  // one outside) — they DO have flow data in the region's CSV.
  const regionBoundaryEdgeSet = useMemo(() => {
    const ids = [
      ...(regionManifest?.boundary_lines || []),
      ...(regionManifest?.boundary_links || []),
    ];
    return new Set(ids.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean));
  }, [regionManifest]);
  const baseDatasetDirname = useMemo(
    () => String(pypsaFacilitiesData.find((f) => f.dirname)?.dirname || '').trim(),
    [pypsaFacilitiesData]
  );
  const pypsaFacilitiesWithRegionDataSource = useMemo(() => {
    if (!pypsaFacilitiesData.length || !resolvedRegionChartDirname || solvedRegionBusSet.size === 0) {
      return pypsaFacilitiesData;
    }

    const applyDirname = (obj) => {
      const busId = normalizeBusId(obj.bus || obj.id || obj.nodeId);
      // Generators / loads / storage on either core OR boundary buses are
      // included in the region LOPF and have dispatch series in the solve CSV.
      const shouldUseRegion = busId && (solvedRegionBusSet.has(busId) || boundaryRegionBusSet.has(busId));
      const fallbackDirname = String(obj.dirname || baseDatasetDirname || '').trim();
      const nextDirname = shouldUseRegion ? resolvedRegionChartDirname : fallbackDirname;
      if ((String(obj.dirname || '').trim() || '') === (nextDirname || '')) return obj;
      return { ...obj, dirname: nextDirname || null };
    };

    return mapSharedFacilityGroups(pypsaFacilitiesData, applyDirname);
  }, [
    pypsaFacilitiesData,
    resolvedRegionChartDirname,
    solvedRegionBusSet,
    boundaryRegionBusSet,
    normalizeBusId,
    baseDatasetDirname,
  ]);

  const resolveConnectionDirname = useCallback((connection) => {
    const fallback = baseDatasetDirname || null;
    if (!connection || !resolvedRegionChartDirname || solvedRegionBusSet.size === 0) return fallback;
    // A line participates in the region solve when:
    //  (a) both endpoints are in the solved (core) bus set; OR
    //  (b) one endpoint is in core and the other is in the boundary set
    //      (the runner pulled boundary buses in for cross-cut continuity); OR
    //  (c) the runner listed it explicitly in boundary_lines / boundary_links.
    // In all three cases, lines_flow_p0.csv / links_dispatch_p*.csv in the
    // region's S3 folder contain the flow series.
    const fromBus = normalizeBusId(connection.fromNode || connection.from);
    const toBus = normalizeBusId(connection.toNode || connection.to);
    const connId = String(connection.id || connection.name || '').trim().toUpperCase();
    const fromInCore = fromBus && solvedRegionBusSet.has(fromBus);
    const toInCore = toBus && solvedRegionBusSet.has(toBus);
    const fromInBoundary = fromBus && boundaryRegionBusSet.has(fromBus);
    const toInBoundary = toBus && boundaryRegionBusSet.has(toBus);
    const bothInRegion = (fromInCore && toInCore)
      || (fromInCore && toInBoundary)
      || (fromInBoundary && toInCore);
    if (bothInRegion || (connId && regionBoundaryEdgeSet.has(connId))) {
      return resolvedRegionChartDirname;
    }
    return fallback;
  }, [baseDatasetDirname, resolvedRegionChartDirname, solvedRegionBusSet, boundaryRegionBusSet, regionBoundaryEdgeSet, normalizeBusId]);

  // Helper functions for filtering and data manipulation
  const getUniqueCountries = () => {
    const countries = new Set(facilitiesData.map(f => f.country).filter(Boolean));
    return ['All', ...Array.from(countries).sort()];
  };

  const getCountryFromRegion = (code) => {
    if (!code) return '';
    const nameMap = {
      AL: 'Albania',
      AT: 'Austria',
      BA: 'Bosnia and Herzegovina',
      BE: 'Belgium',
      BG: 'Bulgaria',
      CH: 'Switzerland',
      CY: 'Cyprus',
      CZ: 'Czechia',
      DE: 'Germany',
      DK: 'Denmark',
      EE: 'Estonia',
      ES: 'Spain',
      FI: 'Finland',
      FR: 'France',
      IT: 'Italy',
      NL: 'Netherlands',
      NO: 'Norway',
      PL: 'Poland',
      PT: 'Portugal',
      RO: 'Romania',
      SE: 'Sweden',
      SI: 'Slovenia',
      SK: 'Slovakia',
      UK: 'United Kingdom',
      IE: 'Ireland',
      GR: 'Greece'
    };
    const two = code.substring(0, 2);
    return nameMap[two] || two;
  };

  const getUniqueCapacityTypes = () => {
    const types = new Set(facilitiesData.map(f => f.type).filter(Boolean));
    return ['All', ...Array.from(types).sort()];
  };

  const {
    records: atlasOverlayRecordsByCarrier,
    selected: atlasOverlaySelectedRecords,
    selectedConnections: atlasOverlaySelectedConnections,
  } = useOverlayCountryRecords({
    enabled: atlasOverlayMode,
    countries: atlasOverlayCountryCodes,
    carriers: atlasOverlayCarriers,
    sources: {
      electricity: { facilities: pypsaFacilitiesWithRegionDataSource, connections: pypsaConnections },
      gas: { facilities: gasFacilitiesData, connections: gasConnections },
      water: { facilities: waterFacilitiesData, connections: waterConnections },
      liquids: { facilities: liquidsFacilitiesData, connections: liquidsConnections },
      logistics: { facilities: logisticsFacilitiesData, connections: logisticsConnections },
    },
  });

  const atlasOverlayFacilitiesData = useMemo(() => {
    if (!atlasOverlayMode) return [];
    return atlasOverlaySelectedRecords.flatMap(({ carrier, records }) => (
      records.facilities
        .filter((facility) => {
          const domain = classifyAtlasMapDomain(facility);
          if (atlasDomainVisibility[domain] === false) return false;
          const legacyKey = facility.carrier_key || facility.type;
          return !hiddenCarriers.has(atlasCarrierFilterKey(facility)) && !hiddenCarriers.has(legacyKey);
        })
        .map((facility) => ({ ...facility, atlas_network_carrier: carrier }))
    ));
  }, [
    atlasOverlayMode,
    atlasOverlaySelectedRecords,
    atlasDomainVisibility,
    hiddenCarriers,
  ]);

  const atlasOverlayConnectionsByDomain = useMemo(() => {
    if (!atlasOverlayMode) return {};
    return atlasOverlaySelectedConnections.reduce((groups, connection) => {
      const domain = connection.atlas_domain || 'Grid';
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(connection);
      return groups;
    }, {});
  }, [atlasOverlayMode, atlasOverlaySelectedConnections]);
  const atlasOverlayVisibleConnectionDomainKey = Object.keys(atlasOverlayConnectionsByDomain)
    .filter((domain) => atlasDomainVisibility[domain] !== false)
    .sort()
    .join('\u0000');
  const atlasOverlayConnectionsData = useMemo(() => (
    atlasOverlayVisibleConnectionDomainKey
      ? atlasOverlayVisibleConnectionDomainKey.split('\u0000')
        .flatMap((domain) => atlasOverlayConnectionsByDomain[domain] || [])
      : []
  ), [atlasOverlayConnectionsByDomain, atlasOverlayVisibleConnectionDomainKey]);

  const atlasOverlayVisibleInventory = useMemo(() => ATLAS_NETWORK_CARRIER_ORDER.reduce(
    (inventory, carrier) => {
      const records = atlasOverlayRecordsByCarrier[carrier] || { facilities: [], connections: [] };
      return {
        ...inventory,
        [carrier]: {
          assets: records.facilities.filter((facility) => {
            const domain = classifyAtlasMapDomain(facility);
            const legacyKey = facility.carrier_key || facility.type;
            return atlasDomainVisibility[domain] !== false
              && !hiddenCarriers.has(atlasCarrierFilterKey(facility))
              && !hiddenCarriers.has(legacyKey);
          }).length,
          connections: records.connections.filter((connection) => (
            atlasDomainVisibility[connection.atlas_domain || 'Grid'] !== false
          )).length,
        },
      };
    },
    {},
  ), [atlasOverlayRecordsByCarrier, atlasDomainVisibility, hiddenCarriers]);

  const visibleMapFacilities = useMemo(() => {
    // PyPSA engine: facilities come from PyPSA progress JSON, not PLEXOS
    if (engine === 'PyPSA Engine') {
      if (atlasOverlayMode) return atlasOverlayFacilitiesData;
      const facilitiesByCarrier = {
        electricity: pypsaFacilitiesWithRegionDataSource,
        gas: gasFacilitiesData,
        water: waterFacilitiesData,
        liquids: liquidsFacilitiesData,
        logistics: logisticsFacilitiesData,
      };
      const carrierFacilities = facilitiesByCarrier[atlasNetworkCarrier] || [];
      return carrierFacilities.filter((f) => {
        const domain = classifyAtlasMapDomain(f);
        if (atlasDomainVisibility[domain] === false) return false;
        const legacyKey = f.carrier_key || f.type;
        return !hiddenCarriers.has(atlasCarrierFilterKey(f)) && !hiddenCarriers.has(legacyKey);
      });
    }
    return facilitiesData.filter(facility => {
      const matchesCountry = selectedCountry === 'All' || facility.country === selectedCountry;
      const matchesType = selectedCapacityType === 'All' || facility.type === selectedCapacityType;

      // Apply connection filters - if filters are active, only show nodes that are part of filtered connections
      const hasConnectionFilters = connectionClassGroupFilter || connectionClassFilter ||
        connectionCategoryFilter || connectionObjectFilter ||
        connectionPropertyFilter;

      let matchesConnectionFilters = true;
      if (hasConnectionFilters) {
        // If connection filters are active, only show nodes that are part of connections
        // Connections are already filtered by the API based on connection filters
        const facilityId = String(facility.id || '').toUpperCase();
        const isInFilteredConnection = connections.some(conn => {
          const fromId = String(conn.from || '').toUpperCase();
          const toId = String(conn.to || '').toUpperCase();
          return fromId === facilityId || toId === facilityId;
        });
        matchesConnectionFilters = isInFilteredConnection;
      }

      return matchesCountry && matchesType && matchesConnectionFilters;
    });
  }, [engine, atlasOverlayMode, atlasOverlayFacilitiesData, atlasNetworkCarrier,
    pypsaFacilitiesWithRegionDataSource, gasFacilitiesData, waterFacilitiesData,
    liquidsFacilitiesData, logisticsFacilitiesData, atlasDomainVisibility,
    hiddenCarriers, facilitiesData, selectedCountry, selectedCapacityType,
    connectionClassGroupFilter, connectionClassFilter, connectionCategoryFilter,
    connectionObjectFilter, connectionPropertyFilter, connections]);
  const resultDecoratedMapFacilities = useMemo(() => {
    const scene = modelResultStatus.scene;
    if (!scene || nohmWorkspaceContext?.mode !== 'model') return visibleMapFacilities;
    return mapSharedFacilityGroups(
      visibleMapFacilities,
      facility => decorateModelResultRecord(facility, scene),
    );
  }, [modelResultStatus.scene, nohmWorkspaceContext?.mode, visibleMapFacilities]);
  const getFilteredFacilities = useCallback(() => visibleMapFacilities, [visibleMapFacilities]);

  // Human-readable connection title
  const getConnectionLabel = (conn) => {
    const type = (conn.collection || conn.type || '').toString();
    const fromLabel = conn.fromNode || conn.from || '';
    const toLabel = conn.toNode || conn.to || '';
    return `${type}: ${fromLabel} ⇄ ${toLabel}`;
  };

  // Electricity and gas topology is owned by Grid. Asset-only domain changes
  // must therefore keep the exact connection-array identity. Infrastructure
  // sources may classify links more broadly, so retain their full visibility
  // signature without making it a dependency of the common power/gas path.
  const activeConnectionDomainVisibilityKey = ['electricity', 'gas'].includes(atlasNetworkCarrier)
    ? (atlasDomainVisibility.Grid === false ? '' : 'Grid')
    : ATLAS_MAP_DOMAINS
      .filter((domain) => atlasDomainVisibility[domain] !== false)
      .join('\u0000');
  const activeVisibleConnectionDomains = useMemo(
    () => new Set(activeConnectionDomainVisibilityKey ? activeConnectionDomainVisibilityKey.split('\u0000') : []),
    [activeConnectionDomainVisibilityKey],
  );

  // Get visible connections (only between filtered nodes and by connection type)
  const visibleMapConnections = useMemo(() => {
    // PyPSA engine: use pre-built pypsa connections (already validated at load time)
    if (engine === 'PyPSA Engine') {
      if (atlasOverlayMode) return atlasOverlayConnectionsData;
      const hasMultiDomainTopology = ['water', 'liquids', 'logistics'].includes(atlasNetworkCarrier);
      if (!hasMultiDomainTopology && !activeVisibleConnectionDomains.has('Grid')) return [];
      const carrierConnections = atlasNetworkCarrier === 'gas'
        ? gasConnections
        : atlasNetworkCarrier === 'water'
          ? waterConnections
          : atlasNetworkCarrier === 'liquids'
            ? liquidsConnections
            : atlasNetworkCarrier === 'logistics'
              ? logisticsConnections
          : pypsaConnections;
      if (!hasMultiDomainTopology) return carrierConnections;
      return carrierConnections.filter((conn) => (
        activeVisibleConnectionDomains.has(conn.atlas_domain || 'Grid')
      ));
    }

    const filteredFacs = visibleMapFacilities;
    const visibleNodeIds = new Set([
      ...filteredFacs.map(f => String(f.id || '').toUpperCase()),
      ...editableNodes.map(n => String(n.id || '').toUpperCase())
    ]);

    return connections.filter(conn => {
      // Skip self-connections
      if (conn.from === conn.to) return false;

      // Connection type filtering removed per user request

      // Only include if both endpoints are visible
      const fromVisible = visibleNodeIds.has(String(conn.from || '').toUpperCase());
      const toVisible = visibleNodeIds.has(String(conn.to || '').toUpperCase());
      return fromVisible && toVisible;
    });
  }, [engine, atlasOverlayMode, atlasOverlayConnectionsData, atlasNetworkCarrier,
    activeVisibleConnectionDomains, gasConnections, waterConnections, liquidsConnections,
    logisticsConnections, pypsaConnections, visibleMapFacilities, editableNodes, connections]);
  const getVisibleConnections = useCallback(() => visibleMapConnections, [visibleMapConnections]);
  const mapPerformanceDecision = useMemo(() => resolveMapPerformanceMode({
    preference: performancePreference,
    facilityCount: visibleMapFacilities.length,
    connectionCount: visibleMapConnections.length,
    navigatorLike: typeof navigator !== 'undefined' ? navigator : undefined,
    matchMedia: typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined,
  }), [performancePreference, visibleMapFacilities.length, visibleMapConnections.length]);
  const performanceMode = mapPerformanceDecision.enabled;
  const renderedMapConnections = useMemo(
    () => enrichConnectionsForMetrics(visibleMapConnections),
    [enrichConnectionsForMetrics, visibleMapConnections],
  );
  const resultDecoratedMapConnections = useMemo(() => {
    const scene = modelResultStatus.scene;
    if (!scene || nohmWorkspaceContext?.mode !== 'model') return renderedMapConnections;
    return renderedMapConnections.map(connection => decorateModelResultRecord(connection, scene));
  }, [modelResultStatus.scene, nohmWorkspaceContext?.mode, renderedMapConnections]);
  // Opaque and stable across unrelated shell/assistant renders. If a new data
  // or display snapshot replaces the map inputs after an exception, the map
  // boundary gets one automatic recovery attempt even when record counts match.
  const mapRecoveryKey = useMemo(() => ({}), [
    atlasOverlayMode,
    atlasNetworkCarrier,
    currentAtlasResolutionKey,
    resultDecoratedMapFacilities,
    resultDecoratedMapConnections,
    showMapNodes,
    showGeographicBoundaries,
  ]);

  const getFacilityLocationKey = useCallback((facility) => {
    if (!facility) return '';
    if (facility.locationKey) return facility.locationKey;

    const lat = parseFloat(facility.latitude);
    const lng = parseFloat(facility.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return '';

    return `${parseFloat(lat.toFixed(4))},${parseFloat(lng.toFixed(4))}`;
  }, []);

  const countUniqueFacilityLocations = useCallback((facilities) => {
    const uniqueKeys = new Set();

    (facilities || []).forEach((facility) => {
      const key = getFacilityLocationKey(facility);
      if (key) uniqueKeys.add(key);
    });

    return uniqueKeys.size;
  }, [getFacilityLocationKey]);

  const visibleFacilityCount = useMemo(() => {
    if (engine === 'PyPSA Engine') {
      return countUniqueFacilityLocations(visibleMapFacilities);
    }
    return visibleMapFacilities.length;
  }, [engine, visibleMapFacilities, countUniqueFacilityLocations]);

  const totalFacilityCount = useMemo(() => {
    if (engine === 'PyPSA Engine') {
      return countUniqueFacilityLocations(pypsaFacilitiesData);
    }
    return facilitiesData.length;
  }, [engine, pypsaFacilitiesData, facilitiesData, countUniqueFacilityLocations]);

  const pypsaRealComponentCount = useMemo(
    () => pypsaFacilitiesData.filter((facility) => !facility.is_virtual).length,
    [pypsaFacilitiesData]
  );

  const pypsaCrossBorderBusCount = useMemo(
    () => countUniqueFacilityLocations(pypsaFacilitiesData.filter((facility) => facility.is_virtual)),
    [pypsaFacilitiesData, countUniqueFacilityLocations]
  );
  const pypsaHasGenerationMixData = useMemo(() => pypsaFacilitiesData.some((facility) => {
    if (facility?.is_virtual) return false;
    const componentType = String(facility?.component_type || facility?.type || '').toLowerCase();
    if (componentType !== 'generator') return false;
    return [facility?.total_dispatch_MWh, facility?.p_nom_opt, facility?.p_nom]
      .some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  }), [pypsaFacilitiesData]);
  const pypsaRenderableConnections = useMemo(() => {
    const endpointIds = new Set();
    pypsaFacilitiesData.forEach((facility) => {
      const id = String(facility?.id || '').toUpperCase().trim();
      const clusterId = String(facility?.cluster_id || '').toUpperCase().trim();
      if (id) endpointIds.add(id);
      if (clusterId) endpointIds.add(clusterId);
    });
    return pypsaConnections.filter((connection) => (
      endpointIds.has(String(connection?.from || '').toUpperCase().trim())
      && endpointIds.has(String(connection?.to || '').toUpperCase().trim())
    ));
  }, [pypsaConnections, pypsaFacilitiesData]);
  const pypsaOverviewMetrics = useMemo(() => {
    const acLines = pypsaRenderableConnections.filter((c) => c.type === 'line').length;
    const dcLinks = pypsaRenderableConnections.filter((c) => c.type === 'link' && !c.is_cross_border).length;
    const groupedVisible = visibleFacilityCount;
    const groupedTotal = totalFacilityCount;
    const real = pypsaFacilitiesData.filter((f) => !f.is_virtual);
    const generatorRows = real.filter((f) => {
      const t = String(f.component_type || f.type || '').toLowerCase();
      const c = String(f.carrier_key || f.carrier || '').toLowerCase();
      return t.includes('generator') || ['solar', 'onwind', 'offwind-ac', 'offwind-dc', 'biomass', 'hydro', 'ror', 'nuclear', 'coal', 'gas', 'oil'].includes(c);
    });
    const generators = generatorRows.length;
    const conversion = real.filter((f) => String(f.component_type || f.type || '').toLowerCase().includes('link')).length;
    const loads = real.filter((f) => String(f.component_type || f.type || '').toLowerCase().includes('load')).length;
    const buses = pypsaDatasetMeta.sourceBusCount || real.filter((f) => String(f.component_type || f.type || '').toLowerCase().includes('bus')).length;
    const totalCapacityMW = generatorRows.reduce((sum, f) => {
      const value = Number.isFinite(Number(f.p_nom_opt)) ? Number(f.p_nom_opt) : Number(f.p_nom);
      return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
    }, 0);
    const dispatchRows = generatorRows.map((f) => Number(f.total_dispatch_MWh)).filter(Number.isFinite);
    const totalDispatchMWh = dispatchRows.reduce((sum, value) => sum + value, 0);
    return {
      groupedVisible,
      groupedTotal,
      components: pypsaRealComponentCount,
      acLines,
      dcLinks,
      generators,
      conversion,
      loads,
      buses,
      totalCapacityMW,
      totalDispatchMWh,
      hasDispatch: dispatchRows.length > 0,
      connectionVisible: pypsaRenderableConnections.length,
      connectionTotal: pypsaConnections.length,
    };
  }, [
    pypsaConnections,
    pypsaRenderableConnections,
    visibleFacilityCount,
    totalFacilityCount,
    pypsaRealComponentCount,
    pypsaFacilitiesData,
    pypsaDatasetMeta,
    getVisibleConnections,
  ]);
  const pypsaCapacityMix = useMemo(() => {
    const totals = { solar: 0, wind: 0, hydro: 0, gas: 0, other: 0 };
    const real = pypsaFacilitiesData.filter((f) => !f.is_virtual);
    real.forEach((f) => {
      const componentType = String(f.component_type || '').toLowerCase();
      if (!componentType.includes('generator')) return;
      const capacity = Number.isFinite(Number(f.p_nom_opt)) ? Number(f.p_nom_opt) : Number(f.p_nom);
      if (!Number.isFinite(capacity) || capacity <= 0) return;
      const k = String(f.carrier_key || f.carrier || f.type || '').toLowerCase();
      if (k.includes('solar')) totals.solar += capacity;
      else if (k.includes('wind')) totals.wind += capacity;
      else if (k.includes('hydro') || k === 'ror') totals.hydro += capacity;
      else if (k.includes('gas') || k.includes('ccgt') || k.includes('ocgt')) totals.gas += capacity;
      else totals.other += capacity;
    });
    const all = Object.values(totals).reduce((sum, value) => sum + value, 0);
    if (all <= 0) return totals;
    return {
      solar: Math.round((totals.solar / all) * 100),
      wind: Math.round((totals.wind / all) * 100),
      hydro: Math.round((totals.hydro / all) * 100),
      gas: Math.round((totals.gas / all) * 100),
      other: Math.round((totals.other / all) * 100),
    };
  }, [pypsaFacilitiesData]);

  // Show head + tail for long strings (include last few words)
  const tailTruncate = (text, max = 40, tail = 18) => {
    if (!text) return '';
    if (text.length <= max) return text;
    const headLen = Math.max(1, max - tail - 1);
    return `${text.slice(0, headLen)}…${text.slice(-tail)}`;
  };

  // ===== Resizable Filters Panel (Emil > Build) =====
  const [filterWidth, setFilterWidth] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('emilFilterWidth') : null;
      return saved ? Math.max(240, Math.min(520, parseInt(saved, 10) || 260)) : 260;
    } catch {
      return 260;
    }
  });
  const [objectsWidth, setObjectsWidth] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('emilObjectsWidth') : null;
      return saved ? Math.max(240, Math.min(560, parseInt(saved, 10) || 260)) : 260;
    } catch {
      return 260;
    }
  });
  const [isLg, setIsLg] = useState(false);
  const gridRef = useRef(null);
  const isDraggingRef = useRef(false);
  const isDraggingObjectsRef = useRef(false);

  useEffect(() => {
    const onResize = () => setIsLg(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stopDrag = useCallback(() => {
    isDraggingRef.current = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  }, []);

  const onDrag = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const left = gridRef.current?.getBoundingClientRect().left || 0;
    let w = e.clientX - left;
    const min = 260, max = 560;
    if (w < min) w = min;
    if (w > max) w = max;
    setFilterWidth(w);
    try { localStorage.setItem('emilFilterWidth', String(w)); } catch { }
  }, []);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  }, [onDrag, stopDrag]);

  const onDragObjects = useCallback((e) => {
    if (!isDraggingObjectsRef.current) return;
    const left = gridRef.current?.getBoundingClientRect().left || 0;
    let w = e.clientX - left - filterWidth;
    const min = 260, max = 560;
    if (w < min) w = min;
    if (w > max) w = max;
    setObjectsWidth(w);
    try { localStorage.setItem('emilObjectsWidth', String(w)); } catch { }
  }, [filterWidth]);

  const stopDragObjects = useCallback(() => {
    isDraggingObjectsRef.current = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onDragObjects);
    document.removeEventListener('mouseup', stopDragObjects);
  }, [onDragObjects]);

  const startDragObjects = useCallback((e) => {
    e.preventDefault();
    isDraggingObjectsRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onDragObjects);
    document.addEventListener('mouseup', stopDragObjects);
  }, [onDragObjects, stopDragObjects]);

  const handleNodeSelection = (nodeId) => {
    setSelectedNode(nodeId);
    // Inspecting imported Atlas assets must not enter the legacy two-click
    // connection editor. Network construction remains an explicit workflow.
    if (engine === 'PyPSA Engine' || atlasOverlayMode || atlasNetworkCarrier !== 'electricity') {
      setSelectedNodes([]);
      return;
    }

    // If there are already 2+ nodes selected, clear them and start fresh
    if (selectedNodes.length >= 2) {
      console.log('Clearing existing selection and starting fresh');
      setSelectedNodes([nodeId]);
      return;
    }

    // Toggle selection for multi-select
    if (selectedNodes.includes(nodeId)) {
      console.log('Removing node from selection');
      setSelectedNodes(selectedNodes.filter(id => id !== nodeId));
    } else {
      const newSelection = [...selectedNodes, nodeId];
      console.log('Adding node to selection, new selection:', newSelection);
      setSelectedNodes(newSelection);

      // Auto-create connection when exactly 2 nodes are selected
      if (newSelection.length === 2) {
        const [node1, node2] = newSelection;
        const newConnection = {
          from: node1,
          to: node2,
          id: `${node1}-${node2}`
        };

        // Check if connection already exists
        const connectionExists = connections.some(conn =>
          (conn.from === node1 && conn.to === node2) ||
          (conn.from === node2 && conn.to === node1)
        );

        if (!connectionExists) {
          setConnections([...connections, newConnection]);
          console.log(`Connection created between ${node1} and ${node2}`);
        } else {
          console.log('Connection already exists, skipping');
        }

        // Clear selection after creating connection
        setSelectedNodes([]);
        console.log('Selection cleared after creating connection');
      }
    }
  };

  useEffect(() => {
    if (engine === 'PyPSA Engine') {
      if (pypsaFacilitiesData.length === 0 && selectedNode) {
        setSelectedNode(null);
      }
      return;
    }
    if (facilitiesData.length === 0 && selectedNode) {
      setSelectedNode(null);
    }
  }, [engine, pypsaFacilitiesData.length, facilitiesData.length, selectedNode]);

  const handleVoiceLocation = async (locationData) => {
    try {
      // VoiceRecorder component already calls backend and returns processed data
      // locationData is an object with {latitude, longitude, description}
      console.log('Received location data from VoiceRecorder:', locationData);

      if (locationData && locationData.latitude && locationData.longitude) {
        const newNode = {
          id: `voice-${Date.now()}`,
          name: locationData.description || 'Voice Location',
          latitude: locationData.latitude.toString(),
          longitude: locationData.longitude.toString(),
          type: 'Generator', // Default type
          region: 'Voice',
          country: 'Voice',
          editable: true,
          createdAt: new Date().toISOString() // Add timestamp for reference
        };

        const updatedNodes = [...editableNodes, newNode];
        setEditableNodes(updatedNodes);

        // Persist to localStorage
        try {
          localStorage.setItem('nova-voice-nodes', JSON.stringify(updatedNodes));
          console.log(`Voice node added and persisted: ${newNode.name} at (${locationData.latitude.toFixed(4)}, ${locationData.longitude.toFixed(4)})`);
        } catch (storageError) {
          console.error('Error saving voice nodes to localStorage:', storageError);
        }
      }
    } catch (error) {
      console.error('Error processing voice location:', error);
    }
  };


  // Delete editable node
  const deleteEditableNode = (nodeId) => {
    const updatedNodes = editableNodes.filter(node => node.id !== nodeId);
    setEditableNodes(updatedNodes);

    // Persist to localStorage
    try {
      localStorage.setItem('nova-voice-nodes', JSON.stringify(updatedNodes));
      console.log(`Voice node deleted and persisted: ${nodeId}`);
    } catch (storageError) {
      console.error('Error saving voice nodes to localStorage:', storageError);
    }
  };


  const createConnection = () => {
    if (selectedNodes.length === 2) {
      const [node1, node2] = selectedNodes;
      const newConnection = {
        from: node1,
        to: node2,
        id: `${node1}-${node2}`
      };
      setConnections([...connections, newConnection]);
      setSelectedNodes([]);
    }
  };

  const clearConnections = () => {
    setConnections([]);
    setSelectedNodes([]);
  };

  const pypsaSettingsSections = useMemo(() => ([
    {
      title: '1. Region & Year',
      fields: [
        { label: 'Region', key: 'region', type: 'text' },
        { label: 'Horizon Year', key: 'planning_horizon', type: 'select', options: ['2025', '2030', '2035', '2040', '2045', '2050'] },
        { label: 'Scenario Name', key: 'scenario_name', type: 'text' },
        { label: 'Model Scope', key: 'model_scope', type: 'select', options: ['electricity', 'sector-coupled'] },
        { label: 'Spatial Resolution', key: 'spatial_resolution', type: 'select', options: ['NUTS0', 'NUTS1', 'NUTS2', 'NUTS3'] },
        { label: 'Temporal Resolution', key: 'snapshot_resolution', type: 'select', options: ['monthly', '1h', '3h', '6h', '12h', '24h'] },
      ],
    },
    {
      title: '2. Network Detail',
      fields: [
        { label: 'Clusters / Nodes', key: 'clusters', type: 'range', min: 16, max: 1024, step: 1 },
        { label: 'Include Cross-Border Links', key: 'cross_border_links', type: 'toggle' },
        { label: 'Transmission Expansion', key: 'transmission_expansion', type: 'toggle' },
        { label: 'Max Grid Expansion', key: 'transmission_expansion_limit', type: 'number' },
        { label: 'Include Offshore Grid', key: 'offshore_network', type: 'toggle' },
      ],
    },
    {
      title: '3. Technologies',
      fields: [
        { label: 'Solar', key: 'include_solar', type: 'toggle' },
        { label: 'Onshore Wind', key: 'include_onwind', type: 'toggle' },
        { label: 'Offshore Wind', key: 'include_offwind', type: 'toggle' },
        { label: 'Gas', key: 'include_gas', type: 'toggle' },
        { label: 'Coal', key: 'include_coal', type: 'toggle' },
        { label: 'Oil', key: 'include_oil', type: 'toggle' },
        { label: 'Biomass', key: 'include_biomass', type: 'toggle' },
        { label: 'Hydro', key: 'include_hydro', type: 'toggle' },
        { label: 'Nuclear', key: 'include_nuclear', type: 'toggle' },
        { label: 'Battery Storage', key: 'include_battery', type: 'toggle' },
        { label: 'Pumped Hydro', key: 'include_pumped_hydro', type: 'toggle' },
        { label: 'Hydrogen', key: 'include_hydrogen', type: 'toggle' },
      ],
    },
    {
      title: '4. Sectors',
      fields: [
        { label: 'Heat Sector', key: 'sector_heat', type: 'toggle' },
        { label: 'Hydrogen Sector', key: 'sector_hydrogen', type: 'toggle' },
        { label: 'Transport Sector', key: 'sector_transport', type: 'toggle' },
        { label: 'Industry Sector', key: 'sector_industry', type: 'toggle' },
        { label: 'District Heating', key: 'district_heating', type: 'toggle' },
        { label: 'EV Demand', key: 'ev_demand', type: 'toggle' },
        { label: 'Electrolysers', key: 'electrolysers', type: 'toggle' },
        { label: 'Fuel Cells / H2 Turbines', key: 'hydrogen_to_power', type: 'toggle' },
        { label: 'CHP', key: 'chp', type: 'toggle' },
        { label: 'Heat Pumps', key: 'heat_pumps', type: 'toggle' },
      ],
    },
    {
      title: '5. Capacity Expansion',
      fields: [
        { label: 'Existing Assets Only', key: 'existing_assets_only', type: 'toggle' },
        { label: 'Allow New Build', key: 'allow_capacity_expansion', type: 'toggle' },
        { label: 'Generator Expansion', key: 'generator_expansion', type: 'toggle' },
        { label: 'Storage Expansion', key: 'storage_expansion', type: 'toggle' },
        { label: 'Network Expansion', key: 'network_expansion', type: 'toggle' },
        { label: 'Max Solar Capacity', key: 'solar_p_nom_max', type: 'number' },
        { label: 'Max Wind Capacity', key: 'wind_p_nom_max', type: 'number' },
        { label: 'Max Gas Capacity', key: 'gas_p_nom_max', type: 'number' },
        { label: 'Minimum Reserve Margin', key: 'reserve_margin', type: 'range', min: 0, max: 30, step: 1 },
      ],
    },
    {
      title: '6. Policy & Costs',
      fields: [
        { label: 'Cost Year', key: 'cost_year', type: 'select', options: ['2020', '2022', '2025', '2030'] },
        { label: 'Discount Rate (%)', key: 'discount_rate', type: 'range', min: 0, max: 15, step: 0.5 },
        { label: 'Carbon Price', key: 'carbon_price', type: 'text' },
        { label: 'Gas Price', key: 'gas_price', type: 'number' },
        { label: 'Coal Price', key: 'coal_price', type: 'number' },
        { label: 'Oil Price', key: 'oil_price', type: 'number' },
        { label: 'Biomass Price', key: 'biomass_price', type: 'number' },
        { label: 'Value of Lost Load', key: 'voll', type: 'number' },
        { label: 'CO2 Cap', key: 'co2_cap', type: 'text' },
        { label: 'Renewable Share Target (%)', key: 'renewable_share_target', type: 'range', min: 0, max: 100, step: 1 },
        { label: 'Coal Phaseout Year', key: 'coal_phaseout_year', type: 'select', options: ['2030', '2035', '2040', '2045', '2050'] },
        { label: 'Nuclear Phaseout', key: 'nuclear_phaseout', type: 'toggle' },
        { label: 'Gas Allowed After Target Year', key: 'gas_allowed_post_year', type: 'toggle' },
        { label: 'Energy Security Constraint', key: 'security_constraint', type: 'toggle' },
      ],
    },
    {
      title: '7. Solver Settings',
      fields: [
        { label: 'Unit Commitment', key: 'unit_commitment', type: 'toggle' },
        { label: 'Ramp Limits', key: 'ramp_limits', type: 'toggle' },
        { label: 'Storage Cyclic State of Charge', key: 'cyclic_storage', type: 'toggle' },
        { label: 'Hydro Inflow Profiles', key: 'hydro_inflows', type: 'toggle' },
        { label: 'Renewable Curtailment Allowed', key: 'allow_curtailment', type: 'toggle' },
        { label: 'Load Shedding Allowed', key: 'load_shedding', type: 'toggle' },
        { label: 'Solver', key: 'solver_name', type: 'select', options: ['highs', 'gurobi'] },
        { label: 'Threads', key: 'solver_threads', type: 'number' },
        { label: 'Time Limit (s)', key: 'solver_time_limit', type: 'number' },
        { label: 'MIP Gap', key: 'mip_gap', type: 'number', step: 0.001 },
        { label: 'HiGHS Algorithm', key: 'solver_method', type: 'select', options: ['simplex', 'hipo', 'pdlp'] },
        { label: 'Skip Solve / Build Only', key: 'build_only', type: 'toggle' },
      ],
    },
  ]), []);

  // Keep the map's land-layer contract referentially stable across unrelated
  // Atlas renders. Opacity previews live in the map pane; this object changes
  // only when the persisted land selection or its service status changes.
  const mapLandConstraints = useMemo(() => ({
    ...landOverlay,
    opacity: landOverlayRef.current?.opacity ?? landOverlay.opacity,
    status: landStatus,
  }), [landOverlay, landStatus]);

  // In the Nohm product shell the outer Atlas Domain is authoritative. Keep
  // the compact map status aligned with that selection instead of continuing
  // to advertise Geography and Network Resolution in every workspace.
  const workspaceStatusCards = useMemo(() => {
    const modelSceneReady = nohmWorkspaceContext?.mode === 'model' && modelSceneStatus.state === 'ready';
    const geographyValue = modelSceneReady
      ? `${modelSceneStatus.meta.countries.length} countries · ${modelSceneStatus.meta.selectedYear || 'model year'}`
      : nohmWorkspaceContext?.mode === 'model' && modelSceneStatus.state === 'loading'
        ? 'Loading bound model…'
        : nohmWorkspaceContext?.mode === 'model' && modelSceneStatus.state === 'error'
          ? 'Bound model unavailable'
          : atlasOverlayMode
            ? atlasOverlayCountrySummary
            : atlasNetworkCarrier === 'gas'
              ? (gasCountryFilter || 'All Europe')
              : atlasNetworkCarrier === 'water'
                ? (waterCountryFilter || 'All Europe')
                : atlasNetworkCarrier === 'liquids'
                  ? (liquidsCountryFilter || 'All Europe')
                  : atlasNetworkCarrier === 'logistics'
                    ? (logisticsCountryFilter || 'All Europe')
                    : loadedCountrySummary;
    const resolutionValue = modelSceneReady
      ? `${modelSceneStatus.meta.nodeCount} nodes · ${modelSceneStatus.meta.linkCount} links`
      : nohmWorkspaceContext?.mode === 'model' && modelSceneStatus.state === 'error'
        ? modelSceneStatus.error
        : atlasOverlayMode
          ? 'Multi-network overlay'
          : atlasNetworkCarrier === 'gas'
            ? 'Transmission topology'
            : atlasNetworkCarrier === 'water'
              ? 'Mapped + reported topology'
              : atlasNetworkCarrier === 'liquids'
                ? 'Mapped source topology'
                : atlasNetworkCarrier === 'logistics'
                  ? 'Ports + air-freight assets'
                  : selectedCachedNetworkLevel?.isFull || selectedCachedNetworkLevel?.isGeographic
                    ? selectedCachedNetworkLevel.label
                    : selectedCachedNetworkLevel
                      ? `${selectedCachedNetworkLevel.accessNodes} access nodes`
                      : 'No cache';

    if (!ATLAS_IS_EMBEDDED || activeWorkspaceArea === 'geography') {
      return [
        { label: 'Geography', value: geographyValue },
        { label: 'Network resolution', value: resolutionValue },
      ];
    }

    if (activeWorkspaceArea === 'operations') {
      return [
        {
          label: 'Run mode',
          value: runMode === 'build_only'
            ? 'Build only'
            : runMode === 'solve_existing'
              ? 'Solve existing'
              : 'Build + solve',
        },
        { label: 'Solver', value: `HiGHS ${pypsaSettings.solver_method}` },
      ];
    }

    if (activeWorkspaceArea === 'filters') {
      const visibleLayers = Object.entries(atlasDomainVisibility)
        .filter(([, visible]) => visible)
        .map(([domain]) => domain);
      return [
        { label: 'Visible layers', value: visibleLayers.length ? visibleLayers.join(' · ') : 'No layers selected' },
        {
          label: 'Map display',
          value: showGenerationMix && pypsaHasGenerationMixData
            ? 'Generation mix on'
            : hiddenCarriers.size
              ? `${hiddenCarriers.size} carrier filters hidden`
              : 'All carriers visible',
        },
      ];
    }

    return [
      {
        label: 'Regional typology',
        value: regionalClusterOverlay
          ? `NUTS ${regionalClusterOverlay.meta?.level || 2}`
          : 'Ready to configure',
      },
      {
        label: 'Eurostat evidence',
        value: regionalClusterOverlay
          ? `${Number(regionalClusterOverlay.meta?.mapped_regions || 0).toLocaleString()} mapped regions`
          : geographyValue,
      },
    ];
  }, [
    activeWorkspaceArea, atlasDomainVisibility, atlasNetworkCarrier, atlasOverlayCountrySummary,
    atlasOverlayMode, gasCountryFilter, hiddenCarriers, liquidsCountryFilter, loadedCountrySummary,
    logisticsCountryFilter, modelSceneStatus, nohmWorkspaceContext?.mode,
    pypsaHasGenerationMixData, pypsaSettings.solver_method,
    regionalClusterOverlay, runMode, selectedCachedNetworkLevel, showGenerationMix, waterCountryFilter,
  ]);

  return (
    <div className="atlas-shell h-screen w-full text-tj-gray bg-transparent flex flex-col overflow-x-hidden overflow-y-auto">
      {/* Header and Tabs Temporarily Hidden for Map Only View */}
      <div className={`mx-auto max-w-none w-full flex-1 flex flex-col ${activeAssistant === 'emil' && activeTab === 'map' ? 'overflow-visible' : 'overflow-hidden'} min-h-0 ${
        activeAssistant === 'emil' && activeTab === 'map' ? 'px-0 py-0' : 'px-4 py-4'
      }`}>
        {/* Assistant Content Rendering */}
        {activeAssistant === 'copilot' && (
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ height: 'calc(72vh - 120px)' }}>
            {/* Run Workflow Loading Overlay for Copilot */}
            {runWorkflowRunning && (
              <div className="absolute inset-0 bg-tj-navy-light/50 backdrop-blur-md/95 backdrop-blur-sm rounded-xl flex items-center justify-center z-50">
                <div className="text-center">
                  <div className="inline-block">
                    <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                  <div className="mt-6 space-y-2">
                    <p className="text-xl font-semibold text-tj-gray">Running Simulation...</p>
                    <p className="text-sm text-tj-slate">Please wait while the simulation executes</p>
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <div className="w-2 h-2 bg-tj-gold text-tj-navy-dark border-none rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-tj-gold text-tj-navy-dark border-none rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-tj-gold text-tj-navy-dark border-none rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Left Side - Chatbot */}
            <div className="h-full min-h-0">
              <Chatbot
                messages={copilotChatMessages}
                setMessages={setCopilotChatMessages}
                buildOutputFilename={buildOutputFilename}
                availableModels={availableModelChildNames}
                onRunSimulation={async (modelname) => {
                  // Prevent duplicate run calls for the same build output
                  if (lastRunTriggeredFilenameRef.current && lastRunTriggeredFilenameRef.current === buildOutputFilename) {
                    console.log('Run already triggered for this build output; skipping duplicate call.');
                    return;
                  }
                  if (runWorkflowRunning) {
                    console.log('Run workflow already in progress; skipping duplicate call.');
                    return;
                  }

                  if (!buildOutputFilename) {
                    alert('No build output file available. Please wait for build to complete.');
                    return;
                  }

                  try {
                    lastRunTriggeredFilenameRef.current = buildOutputFilename;

                    // Add loading spinner message
                    const loadingMessageId = Date.now();
                    setCopilotChatMessages(prev => [...prev, {
                      id: loadingMessageId,
                      text: 'Initiating simulation run...',
                      sender: 'bot',
                      timestamp: new Date(),
                      isLoading: true
                    }]);

                    // Light up Emil status indicator (green light)
                    setAssistantStatus(prev => ({
                      ...prev,
                      emil: 'active'
                    }));
                    setRunWorkflowRunning(true);

                    console.log('Running simulation with:', {
                      filename: buildOutputFilename,
                      modelname: modelname
                    });

                    // Call the run webhook
                    const response = await fetch('https://n8n.terajouleenergy.com/webhook/81a50164-6f0e-4664-b4d8-f4f4945d6f03', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        filename: buildOutputFilename,
                        modelname: modelname || 'Default Model'
                      })
                    });

                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }

                    const result = await response.json();
                    console.log("Run workflow response:", result);

                    // Remove loading message
                    setCopilotChatMessages(prev => prev.filter(msg => msg.id !== loadingMessageId));

                    // Parse the response - it's an array with status and result
                    const responseData = Array.isArray(result) ? result[0] : result;
                    const status = responseData?.status || 'unknown';
                    const hasError = responseData?.result?.error;

                    // Reset run status before starting
                    await fetch(`${API_BASE}/run-status/reset`, { method: 'POST' });

                    // Check if status is complete
                    if (status === 'complete') {
                      // Add completion message to chat
                      let messageText = `✅ Simulation run completed successfully!\n\nModel: "${modelname || 'Default Model'}"\nFile: "${buildOutputFilename}"\n\nResults are now available in the Results tab.`;
                      if (hasError) {
                        messageText += `\n\n⚠️ Note: ${responseData.result.error}`;
                      }

                      setCopilotChatMessages(prev => [...prev, {
                        id: prev.length + 1,
                        text: messageText,
                        sender: 'bot',
                        timestamp: new Date()
                      }]);

                      // Reset Emil status to idle when run completes
                      setAssistantStatus(prev => ({
                        ...prev,
                        emil: 'idle'
                      }));
                      setRunWorkflowRunning(false);
                    } else {
                      // Processing - show initiated message
                      setCopilotChatMessages(prev => [...prev, {
                        id: prev.length + 1,
                        text: `🚀 Simulation run started successfully!\n\nModel: "${modelname || 'Default Model'}"\nFile: "${buildOutputFilename}"\n\nThe simulation is running in the background. You'll be notified when it completes.`,
                        sender: 'bot',
                        timestamp: new Date()
                      }]);

                      // Start polling for run completion
                      runPollingIntervalRef.current = setInterval(pollRunStatus, 3000); // Poll every 3 seconds
                      pollRunStatus(); // Check immediately
                    }

                  } catch (err) {
                    console.error("Failed to run simulation:", err);
                    // Remove loading message
                    setCopilotChatMessages(prev => prev.filter(msg => !msg.isLoading));
                    // Add error message to chat
                    setCopilotChatMessages(prev => [...prev, {
                      id: prev.length + 1,
                      text: `❌ Failed to initiate simulation run: ${err.message}`,
                      sender: 'bot',
                      timestamp: new Date(),
                      isError: true
                    }]);
                    // Reset Emil status on error
                    setAssistantStatus(prev => ({
                      ...prev,
                      emil: 'idle'
                    }));
                    setRunWorkflowRunning(false);
                  }
                }}
                onNavigateToAgent={(agent) => {
                  setActiveAssistant(agent);
                  // Set appropriate default tab for each agent
                  if (agent === 'emil') {
                    setActiveTab('build');
                  } else if (agent === 'lola') {
                    setActiveTab('navigate');
                  }
                }}
                onWorkflowStart={() => {
                  setWorkflowRunning(true);
                  setStagesAccomplished([]);
                  setBuildOutputFilename(null); // Reset filename when new workflow starts
                  lastRunTriggeredFilenameRef.current = null; // Allow run trigger for the new build
                  setRunWorkflowRunning(false); // Clear any previous run state
                  setAssistantStatus(prev => ({
                    ...prev,
                    emil: 'active'
                  }));
                  // Start polling for stage updates
                  pollingIntervalRef.current = setInterval(fetchStages, 2000);
                  fetchStages();

                  // Safety timeout: stop polling after 10 minutes
                  setTimeout(() => {
                    if (pollingIntervalRef.current) {
                      clearInterval(pollingIntervalRef.current);
                      pollingIntervalRef.current = null;
                      setWorkflowRunning(false);
                      setAssistantStatus(prev => ({
                        ...prev,
                        emil: 'idle'
                      }));
                      console.log("⏱️ Polling timeout reached (10 minutes). Stopped automatically.");

                      // Add timeout message to chat
                      setCopilotChatMessages(prev => [...prev, {
                        id: prev.length + 1,
                        text: `⚠️ Build workflow timeout reached (10 minutes). Polling stopped automatically. If the build is still running, please check the Build tab.`,
                        sender: 'bot',
                        timestamp: new Date()
                      }]);
                    }
                  }, 10 * 60 * 1000); // 10 minutes
                }}
                onWorkflowComplete={() => {
                  setWorkflowRunning(false);
                  setAssistantStatus(prev => ({
                    ...prev,
                    emil: 'idle'
                  }));
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                }}
              />
            </div>

            {/* Right Side - Agent Activity Panel */}
            <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 overflow-y-auto">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white font-semibold mb-2 tracking-wide flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-tj-gold" />
                  Agent Activity
                </h3>
                <p className="text-sm text-tj-slate">See what agents are working on in the background.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-tj-navy-dark/60 backdrop-blur-md rounded-xl border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${assistantStatus.emil === 'active' ? 'bg-green-500 animate-pulse' :
                        assistantStatus.emil === 'queued' ? 'bg-yellow-500' : 'bg-gray-300'
                        }`}></div>
                      <span className="font-medium text-sm text-tj-gray">Emil</span>
                    </div>
                    <button
                      onClick={() => {
                        setActiveAssistant('emil');
                        setActiveTab('build');
                      }}
                      className="text-xs text-tj-gold hover:text-blue-700 font-medium"
                    >
                      View →
                    </button>
                  </div>
                  <p className="text-xs text-tj-slate">
                    Model building, properties, and network management
                  </p>
                </div>

                <div className="p-4 bg-tj-navy-dark/60 backdrop-blur-md rounded-xl border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${assistantStatus.nova === 'active' ? 'bg-green-500 animate-pulse' :
                        assistantStatus.nova === 'queued' ? 'bg-yellow-500' : 'bg-gray-300'
                        }`}></div>
                      <span className="font-medium text-sm text-tj-gray">Nova</span>
                    </div>
                    <button
                      onClick={() => setActiveAssistant('nova')}
                      className="text-xs text-tj-gold hover:text-blue-700 font-medium"
                    >
                      View →
                    </button>
                  </div>
                  <p className="text-xs text-tj-slate">
                    Analysis, insights, and dashboard generation
                  </p>
                </div>

                <div className="p-4 bg-tj-navy-dark/60 backdrop-blur-md rounded-xl border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${assistantStatus.lola === 'active' ? 'bg-green-500 animate-pulse' :
                        assistantStatus.lola === 'queued' ? 'bg-yellow-500' : 'bg-gray-300'
                        }`}></div>
                      <span className="font-medium text-sm text-tj-gray">Lola</span>
                    </div>
                    <button
                      onClick={() => {
                        setActiveAssistant('lola');
                        setActiveTab('navigate');
                      }}
                      className="text-xs text-tj-gold hover:text-blue-700 font-medium"
                    >
                      View →
                    </button>
                  </div>
                  <p className="text-xs text-tj-slate">
                    Document editing, reports, and text processing
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5">
                <p className="text-xs text-tj-slate text-center">
                  Agents work in the background. Click "View →" to see details and do more specific tasks.
                </p>
                <button
                  onClick={async () => {
                    if (!window.confirm('Delete all files from EmilFiles?')) return;
                    try {
                      const response = await fetch(`${API_BASE}/api/emil/reset-files`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });
                      const result = await response.json();
                      if (result.success) {
                        setCopilotChatMessages(prev => [...prev, {
                          id: prev.length + 1,
                          text: `🗑️ Deleted ${result.deleted_count} files from EmilFiles.`,
                          sender: 'bot',
                          timestamp: new Date()
                        }]);
                      } else {
                        throw new Error(result.message || 'Failed');
                      }
                    } catch (err) {
                      setCopilotChatMessages(prev => [...prev, {
                        id: prev.length + 1,
                        text: `❌ Failed to reset: ${err.message}`,
                        sender: 'bot',
                        timestamp: new Date()
                      }]);
                    }
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Reset Files
                </button>
              </div>
            </div>
          </div>
        )}

        {activeAssistant === 'dashboard' && (
          <div className="flex-1 overflow-y-auto min-h-0 pr-2 pb-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Models & Scenarios */}
              <div className="lg:col-span-2 bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white font-semibold mb-2 tracking-wide">Models & Scenarios</h3>
                  <p className="text-sm text-tj-slate">Your recent models, drafts, and approvals.</p>
                </div>

                <div className="flex flex-wrap gap-2 mb-6">
                  {scenarios.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setActiveScenario(s.name)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium ${activeScenario === s.name
                        ? 'bg-tj-gold text-tj-navy-dark'
                        : 'bg-tj-navy-light/50 backdrop-blur-md border border-white/10 text-tj-gray hover:bg-tj-navy-dark/70/60 backdrop-blur-md'
                        }`}
                    >
                      {s.name}
                      <span className={`px-2 py-1 rounded-full text-xs ${s.tag === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-black/30 text-tj-gray'
                        }`}>
                        {s.tag}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-white/5 my-4"></div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mb-6">
                  {[
                    { k: "Runs (30d)", v: 128 },
                    { k: "Avg Runtime", v: "18m" },
                    { k: "Errors", v: 3 },
                  ].map(({ k, v }) => (
                    <div key={k} className="bg-tj-navy-dark/60 backdrop-blur-md rounded-xl p-4">
                      <p className="text-sm text-tj-slate mb-1">{k}</p>
                      <p className="text-2xl font-semibold text-tj-gray">{v}</p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <button className="flex items-center gap-2 px-4 py-2 border border-white/10 rounded-lg hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] rounded-lg hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                    <Upload className="h-4 w-4" /> New from Template
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white font-semibold mb-2 tracking-wide">Quick Actions</h3>
                  <p className="text-sm text-tj-slate">One-click helpers.</p>
                </div>
                <div className="grid gap-2">
                  <button className="flex items-center gap-2 px-4 py-2 bg-black/30 rounded-lg hover:bg-gray-200 text-left">
                    <Sparkles className="h-4 w-4" /> Generate sensitivity set
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-black/30 rounded-lg hover:bg-gray-200 text-left">
                    <ListChecks className="h-4 w-4" /> Validate network
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-black/30 rounded-lg hover:bg-gray-200 text-left">
                    <Database className="h-4 w-4" /> Sync data dictionaries
                  </button>
                </div>
              </div>

              {/* Status & Approvals */}
              <div className="lg:col-span-1 bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white font-semibold mb-2 tracking-wide">Status & Approvals</h3>
                  <p className="text-sm text-tj-slate">Approve/Reject AI plans; chat or propose DAGs.</p>
                </div>

                <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                  {aiCalls.map((c) => (
                    <div key={c.id} className="p-3 border border-white/5 rounded-xl">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium text-sm">{c.title}</div>
                          <div className="text-xs text-tj-slate">{c.id}</div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold tracking-wider uppercase text-tj-slate ${statusTone(c.status)}`}>
                          {c.status}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button className="px-3 py-1 text-xs border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                          Approve
                        </button>
                        <button className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-tj-gray">AI Chat / DAG</label>
                  <textarea
                    rows={3}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask a question or describe a DAG to create…"
                    className="w-full px-3 py-2 border border-white/10 rounded-lg focus:ring-2 focus:ring-tj-gold focus:border-transparent"
                  />
                  <div className="flex gap-2">
                    <button className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                      Chat
                    </button>
                    <button className="flex items-center gap-2 px-3 py-1 text-sm bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                      <Sparkles className="h-4 w-4" /> Propose DAG
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeAssistant === 'nova' && (
          <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white font-semibold mb-2 tracking-wide flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-600" />
                Nova Assistant
              </h3>
              <p className="text-sm text-tj-slate">Advanced energy modeling and optimization.</p>
            </div>
            <div className="text-center py-12 text-tj-slate">
              <Zap className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Nova assistant features coming soon...</p>
              <p className="text-sm mt-2">This assistant will handle advanced energy modeling tasks.</p>
            </div>
          </div>
        )}

        {activeAssistant === 'lola' && activeTab === 'navigate' && (
          <div className="h-[calc(100vh-12rem)]">
            {/* Four Panel Layout - Left 1/3, Right 2/3 */}
            <div className="grid grid-cols-3 grid-rows-2 gap-4 h-full">

              {/* Top Left: Filter Section */}
              <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 overflow-auto">

                {/* Filters */}
                {documentSections.length > 0 && (
                  <div className="mb-4 space-y-3 pb-4 border-b border-white/5">
                    <div className="text-xs font-semibold text-tj-slate uppercase tracking-wide">
                      Filters
                    </div>

                    {/* Section Filter */}
                    <div>
                      <label className="block text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-gray mb-1">
                        Section
                      </label>
                      <select
                        value={filterSection}
                        onChange={(e) => {
                          setFilterSection(e.target.value);
                          // Reset subsequent filters when Section changes
                          setFilterChapter('All');
                          setFilterSubChapter('All');
                          setFilterCountry('All');
                        }}
                        className="w-full px-2 py-1.5 border border-white/10 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="All">All Sections</option>
                        {availableSections.map((section, idx) => (
                          <option key={idx} value={section}>{section}</option>
                        ))}
                      </select>
                    </div>

                    {/* Chapter Filter */}
                    <div>
                      <label className="block text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-gray mb-1">
                        Chapter
                      </label>
                      <select
                        value={filterChapter}
                        onChange={(e) => {
                          setFilterChapter(e.target.value);
                          // Reset subsequent filters when Chapter changes
                          setFilterSubChapter('All');
                          setFilterCountry('All');
                        }}
                        className="w-full px-2 py-1.5 border border-white/10 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        disabled={availableChapters.length === 0}
                      >
                        <option value="All">All Chapters</option>
                        {availableChapters.map((chapter, idx) => (
                          <option key={idx} value={chapter}>{chapter}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sub Chapter Filter */}
                    <div>
                      <label className="block text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-gray mb-1">
                        Sub Chapter
                      </label>
                      <select
                        value={filterSubChapter}
                        onChange={(e) => {
                          setFilterSubChapter(e.target.value);
                          // Reset subsequent filters when Sub Chapter changes
                          setFilterCountry('All');
                        }}
                        className="w-full px-2 py-1.5 border border-white/10 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        disabled={availableSubChapters.length === 0}
                      >
                        <option value="All">All Sub Chapters</option>
                        {availableSubChapters.map((subChapter, idx) => (
                          <option key={idx} value={subChapter}>{subChapter}</option>
                        ))}
                      </select>
                    </div>

                    {/* Country Filter */}
                    <div>
                      <label className="block text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-gray mb-1">
                        Country
                      </label>
                      <select
                        value={filterCountry}
                        onChange={(e) => setFilterCountry(e.target.value)}
                        className="w-full px-2 py-1.5 border border-white/10 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        disabled={availableCountries.length === 0}
                      >
                        <option value="All">All Countries</option>
                        {availableCountries.map((country, idx) => (
                          <option key={idx} value={country}>{country}</option>
                        ))}
                      </select>
                    </div>

                    {/* Clear Filters Button */}
                    <button
                      onClick={() => {
                        setFilterSection('All');
                        setFilterChapter('All');
                        setFilterSubChapter('All');
                        setFilterCountry('All');
                      }}
                      className="w-full px-3 py-1.5 bg-black/30 hover:bg-gray-200 text-tj-gray text-xs rounded transition-colors"
                    >
                      Clear All Filters
                    </button>
                  </div>
                )}

                {/* Section Navigator */}
                {filteredSections.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-white font-semibold mb-2 tracking-wide">
                      Sections ({filteredSections.length})
                    </label>
                    <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                      {filteredSections.map((section, displayIndex) => {
                        // Use the stored row index instead of finding it
                        const rowIndex = section._row_index;
                        return (
                          <button
                            key={displayIndex}
                            onClick={() => loadSection(section, rowIndex)}
                            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${selectedSectionIndex === rowIndex && selectedDocument === section._source_document
                              ? 'bg-green-50 border-green-500 text-green-900'
                              : 'bg-tj-navy-dark/60 backdrop-blur-md border-white/5 hover:bg-black/30'
                              }`}
                          >
                            <div className="font-medium text-sm">
                              {section.task_title || section.objective_title || `Section ${rowIndex + 1}`}
                            </div>
                            {section.sub_task_title && (
                              <div className="text-xs text-tj-slate mt-1">
                                {section.sub_task_title}
                              </div>
                            )}
                            {section.country && (
                              <div className="text-xs text-green-600 mt-1 font-medium">
                                {section.country}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {documentSections.length === 0 && (
                  <div className="text-center text-tj-slate mt-8">
                    <Braces className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <p>Loading documents...</p>
                  </div>
                )}

                {documentSections.length > 0 && filteredSections.length === 0 && (
                  <div className="text-center text-tj-slate mt-8">
                    <p className="text-sm">No sections match the selected filters</p>
                  </div>
                )}
              </div>

              {/* Top Right: Original Text - Spans 2 columns */}
              <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 overflow-auto col-span-2">
                <h3 className="text-lg font-semibold text-tj-gray mb-4">Original Text</h3>
                <div className="prose prose-sm max-w-none">
                  {originalText ? (
                    <div className="text-tj-gray whitespace-pre-wrap leading-relaxed">
                      {originalText}
                    </div>
                  ) : (
                    <div className="text-center text-gray-400 mt-12">
                      <p>Select a section to view original text</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Left: AI Prompts */}
              <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 overflow-auto">
                <h3 className="text-lg font-semibold text-tj-gray mb-4">AI Prompts</h3>
                <div className="space-y-4">
                  <div>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Enter AI instructions to modify the text..."
                      className="w-full h-14 px-4 py-3 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-base"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        if (!originalText || !aiPrompt) return;

                        setIsAiProcessing(true);
                        setLolaStatus('AI processing...');
                        try {
                          const response = await fetch(`${API_BASE}/api/lola/ai-process`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              prompt: aiPrompt,
                              original_text: originalText
                            })
                          });
                          const data = await response.json();
                          if (data.success && data.processed_text) {
                            setNewText(data.processed_text);
                            setLolaStatus('✓ AI processing complete!');
                          } else {
                            setLolaStatus('❌ AI processing failed: ' + (data.error || 'Unknown error'));
                          }
                        } catch (error) {
                          console.error('AI processing error:', error);
                          setLolaStatus('❌ Error: ' + error.message);
                        } finally {
                          setIsAiProcessing(false);
                          setTimeout(() => setLolaStatus(''), 5000);
                        }
                      }}
                      disabled={!originalText || !aiPrompt || isAiProcessing}
                      className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-tj-navy-dark/70/60 backdrop-blur-md transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                    >
                      <Sparkles className="h-5 w-5" />
                      {isAiProcessing ? 'Processing...' : 'Apply AI'}
                    </button>
                    <button
                      onClick={() => setNewText(originalText)}
                      disabled={!originalText}
                      className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                    >
                      Reset
                    </button>
                  </div>

                  {/* Quick Actions */}
                  <div className="pt-4 border-t border-white/5">
                    <p className="text-sm font-semibold text-tj-gray mb-3">Quick Actions:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setAiPrompt('Make this text more concise and professional')}
                        className="px-4 py-3 text-sm bg-black/30 hover:bg-gray-200 rounded-xl text-tj-gray transition-colors font-medium"
                      >
                        Make Concise
                      </button>
                      <button
                        onClick={() => setAiPrompt('Add more technical details and data')}
                        className="px-4 py-3 text-sm bg-black/30 hover:bg-gray-200 rounded-xl text-tj-gray transition-colors font-medium"
                      >
                        Add Details
                      </button>
                      <button
                        onClick={() => setAiPrompt('Simplify the language for general audience')}
                        className="px-4 py-3 text-sm bg-black/30 hover:bg-gray-200 rounded-xl text-tj-gray transition-colors font-medium"
                      >
                        Simplify
                      </button>
                      <button
                        onClick={() => setAiPrompt('Improve the structure and flow')}
                        className="px-4 py-3 text-sm bg-black/30 hover:bg-gray-200 rounded-xl text-tj-gray transition-colors font-medium"
                      >
                        Improve Flow
                      </button>
                    </div>
                  </div>

                  {lolaStatus && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <p className="text-sm text-blue-800">{lolaStatus}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Right: New Text - Spans 2 columns */}
              <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 flex flex-col col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-tj-gray">New Text</h3>
                  <button
                    onClick={saveSection}
                    disabled={!newText || newText === originalText}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-xl hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Save Changes
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {newText ? (
                    <textarea
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      className="w-full h-full px-4 py-3 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-tj-gray text-base leading-relaxed bg-tj-navy-light/50 backdrop-blur-md"
                    />
                  ) : (
                    <div className="text-center text-gray-400 mt-12">
                      <p>AI-generated or manually edited text will appear here</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Lola Live Website Tab */}
        {activeAssistant === 'lola' && activeTab === 'live' && (
          <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-4">
            <div className="grid grid-cols-3 gap-4 h-[75vh]">
              {/* Left: Streamlit iframe (2/3 width) */}
              <div className="col-span-2 border border-white/5 rounded-xl overflow-hidden">
                <iframe
                  src={lolaLiveUrl}
                  title="Lola Live Website"
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>

              {/* Right: AI Q&A panel (1/3 width) */}
              <div className="border border-white/5 rounded-xl p-4 flex flex-col">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-tj-gray">Ask AI</h3>
                  <p className="text-xs text-tj-slate">Ask questions related to what you see on the Live site.</p>
                </div>
                <div className="space-y-3">
                  <textarea
                    value={liveQuestion}
                    onChange={(e) => setLiveQuestion(e.target.value)}
                    placeholder="Type your question..."
                    className="w-full h-24 px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleLiveAsk}
                      disabled={!liveQuestion.trim() || liveLoading}
                      className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-tj-navy-dark/70/60 backdrop-blur-md transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Sparkles className="h-4 w-4" /> {liveLoading ? 'Asking…' : 'Ask'}
                    </button>
                    <button
                      onClick={() => { setLiveQuestion(''); setLiveAnswer(''); setLiveError(''); }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      Clear
                    </button>
                  </div>
                  {/* Quick suggestions */}
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      'Summarize key insights visible now',
                      'Explain this chart in simple terms',
                      'What actions would you suggest based on this view?',
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setLiveQuestion(q)}
                        className="text-left px-3 py-2 text-sm bg-black/30 hover:bg-gray-200 rounded-lg"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Answer area */}
                <div className="mt-4 flex-1 min-h-0">
                  {liveError && (
                    <div className="mb-3 p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">{liveError}</div>
                  )}
                  <div className="h-full overflow-auto rounded-lg border border-white/5 p-3 bg-tj-navy-dark/60 backdrop-blur-md">
                    {liveAnswer ? (
                      <div className="prose prose-sm max-w-none text-tj-gray whitespace-pre-wrap">{liveAnswer}</div>
                    ) : (
                      <div className="text-sm text-tj-slate">The answer will appear here.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Emil Content (existing content when Emil is active) */}

        {/* Build/Run Tab (shared UI) */}
        {activeAssistant === 'emil' && (activeTab === 'build' || activeTab === 'run') && (
          <>
            {/* Show loader while XLSX file is being loaded */}
            {xlsxFileLoading && (
              <div className="col-span-full bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-12 flex flex-col items-center justify-center h-[72vh]">
                <RefreshCw className="h-12 w-12 text-tj-gold animate-spin mb-4" />
                <h3 className="text-lg font-semibold text-white font-semibold mb-2 tracking-wide">Loading Model Data</h3>
                <p className="text-sm text-tj-slate text-center max-w-md">
                  Searching for XLSX file in Google Drive and loading properties, map, and memberships...
                </p>
              </div>
            )}
            {!xlsxFileLoading && (
              <div
                ref={gridRef}
                className={"grid grid-cols-1 gap-4 flex-1 min-h-0 " + ((activeTab === 'build' || activeTab === 'run' || (aiOpen && !(activeAssistant === 'emil' && activeTab === 'build'))) ? 'lg:grid-cols-[260px_260px_1fr_260px]' : 'lg:grid-cols-[260px_260px_1fr]')}
                style={isLg ? { gridTemplateColumns: (activeTab === 'build' || activeTab === 'run' || (aiOpen && !(activeAssistant === 'emil' && activeTab === 'build'))) ? `${filterWidth}px ${objectsWidth}px 1fr 360px` : `${filterWidth}px ${objectsWidth}px 1fr` } : undefined}
              >
                {/* PLEXOS-Style Hierarchy Navigation - Expandable Tree */}
                {viewMode === 'hierarchy' && (
                  <div className="col-span-full bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 h-[72vh] overflow-hidden flex flex-col">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-tj-gray">PLEXOS Hierarchy</h3>
                      <button
                        onClick={loadEmilHierarchy}
                        disabled={hierarchyLoading}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md"
                      >
                        <RefreshCw className={`h-4 w-4 ${hierarchyLoading ? 'animate-spin' : ''}`} />
                        Sync
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {hierarchyLoading ? (
                        <div className="text-center py-12 text-tj-slate">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          Loading hierarchy...
                        </div>
                      ) : emilHierarchy.length === 0 ? (
                        <div className="text-center py-12 text-tj-slate">
                          No class groups found
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {emilHierarchy.map((group) => {
                            const isGroupExpanded = hierarchySelectedClassGroup?.name === group.name;

                            return (
                              <div key={group.name} className="border border-white/5 rounded-xl overflow-hidden">
                                {/* Class Group Header */}
                                <button
                                  onClick={() => {
                                    if (isGroupExpanded) {
                                      setHierarchySelectedClassGroup(null);
                                      setHierarchySelectedClass(null);
                                    } else {
                                      setHierarchySelectedClassGroup(group);
                                      setHierarchySelectedClass(null);
                                    }
                                  }}
                                  className={`w-full flex items-center justify-between p-4 text-left transition-colors ${isGroupExpanded ? 'bg-blue-50' : 'bg-tj-navy-light/50 backdrop-blur-md hover:bg-tj-navy-dark/70/60 backdrop-blur-md'
                                    }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <FolderOpen className={`h-5 w-5 ${isGroupExpanded ? 'text-tj-gold' : 'text-tj-slate'}`} />
                                    <div>
                                      <div className={`font-semibold ${isGroupExpanded ? 'text-blue-900' : 'text-tj-gray'}`}>
                                        {group.name}
                                      </div>
                                      <div className="text-xs text-tj-slate mt-0.5">
                                        {group.classes.length} {group.classes.length === 1 ? 'class' : 'classes'}
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronDown
                                    className={`h-5 w-5 text-gray-400 transition-transform ${isGroupExpanded ? 'rotate-180' : ''
                                      }`}
                                  />
                                </button>

                                {/* Expanded Classes */}
                                {isGroupExpanded && (
                                  <div className="border-t border-white/5 bg-tj-navy-dark/60 backdrop-blur-md">
                                    {group.classes.map((cls) => {
                                      const isClassExpanded = hierarchySelectedClass?.name === cls.name;

                                      return (
                                        <div key={cls.name} className="border-b border-white/5 last:border-b-0">
                                          {/* Class Header */}
                                          <button
                                            onClick={() => {
                                              if (isClassExpanded) {
                                                setHierarchySelectedClass(null);
                                              } else {
                                                setHierarchySelectedClass(cls);
                                              }
                                            }}
                                            className={`w-full flex items-center justify-between p-3 pl-12 text-left transition-colors ${isClassExpanded ? 'bg-blue-100' : 'bg-tj-navy-dark/60 backdrop-blur-md hover:bg-black/30'
                                              }`}
                                          >
                                            <div className="flex items-center gap-3">
                                              <Folder className={`h-4 w-4 ${isClassExpanded ? 'text-tj-gold' : 'text-tj-slate'}`} />
                                              <div>
                                                <div className={`font-medium text-sm ${isClassExpanded ? 'text-blue-900' : 'text-tj-gray'}`}>
                                                  {cls.name}
                                                </div>
                                                <div className="text-xs text-tj-slate mt-0.5">
                                                  {cls.objects.length} {cls.objects.length === 1 ? 'object' : 'objects'}
                                                  {cls.collections.length > 0 && ` • ${cls.collections.length} ${cls.collections.length === 1 ? 'collection' : 'collections'}`}
                                                </div>
                                              </div>
                                            </div>
                                            <ChevronDown
                                              className={`h-4 w-4 text-gray-400 transition-transform ${isClassExpanded ? 'rotate-180' : ''
                                                }`}
                                            />
                                          </button>

                                          {/* Expanded Objects and Collections */}
                                          {isClassExpanded && (
                                            <div className="bg-tj-navy-light/50 backdrop-blur-md p-4 pl-16">
                                              {/* Collections */}
                                              {cls.collections.length > 0 && (
                                                <div className="mb-4">
                                                  <div className="text-xs font-semibold text-tj-slate uppercase mb-2">
                                                    Collections ({cls.collections.length})
                                                  </div>
                                                  <div className="space-y-1">
                                                    {cls.collections.map((collection) => (
                                                      <div
                                                        key={collection}
                                                        className="flex items-center gap-2 p-2 rounded bg-green-50 border border-green-200"
                                                      >
                                                        <FileText className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                                        <span className="text-sm text-green-900">{collection}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}

                                              {/* Objects */}
                                              <div>
                                                <div className="text-xs font-semibold text-tj-slate uppercase mb-2">
                                                  Objects ({cls.objects.length})
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                                                  {cls.objects.length === 0 ? (
                                                    <div className="col-span-full text-center py-4 text-gray-400 text-xs">
                                                      No objects found
                                                    </div>
                                                  ) : (
                                                    cls.objects.map((obj, idx) => (
                                                      <div
                                                        key={idx}
                                                        className="p-2 border border-white/5 rounded text-xs bg-tj-navy-light/50 backdrop-blur-md hover:bg-tj-navy-dark/70/60 backdrop-blur-md hover:border-white/10 transition-colors"
                                                      >
                                                        <div className="flex items-start gap-2">
                                                          <Box className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
                                                          <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-tj-gray break-words leading-tight">
                                                              {obj.name}
                                                            </div>
                                                            {obj.category && (
                                                              <div className="text-tj-slate mt-1">
                                                                Cat: {obj.category}
                                                              </div>
                                                            )}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    ))
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Original Table View with Filters */}
                {viewMode !== 'hierarchy' && (
                  <>
                    {/* Left: Hierarchical Filters - PLEXOS Style */}
                    <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 h-full min-h-0 flex flex-col relative">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-tj-gray">Filters</h3>
                        {(emilClassGroupFilter || emilClassFilter || emilCategoryFilter || emilChildNameFilter || emilObjectFilter || emilPropertyFilter || emilMemChildNameFilter || emilMemObjectFilter || emilMemMembershipFilter) && (
                          <button
                            onClick={() => {
                              setEmilClassGroupFilter('');
                              setEmilClassFilter('');
                              setEmilCategoryFilter('');
                              setEmilChildNameFilter('');
                              setEmilObjectFilter('');
                              setEmilPropertyFilter('');
                              setEmilMemChildNameFilter('');
                              setEmilMemObjectFilter('');
                              setEmilMemMembershipFilter('');
                              setEmilOffset(0);
                              setEmilMembershipsOffset(0);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold tracking-wider uppercase text-tj-slate text-red-600 hover:text-red-700 hover:bg-red-50 rounded border border-red-200 transition-colors"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Reset Filters
                          </button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto pr-2">
                        <div className="space-y-2">
                          {/* Class Groups - Hierarchical Display */}
                          {emilAvailableClassGroups.map((group) => {
                            const isGroupSelected = emilClassGroupFilter === group;

                            return (
                              <div key={group} className="border border-white/5 rounded-xl overflow-hidden">
                                {/* Class Group Header */}
                                <button
                                  onClick={() => {
                                    if (isGroupSelected) {
                                      setEmilClassGroupFilter('');
                                      setEmilClassFilter('');
                                    } else {
                                      setEmilClassGroupFilter(group);
                                      setEmilClassFilter('');
                                    }
                                    setEmilCategoryFilter('');
                                    setEmilObjectFilter('');
                                    setEmilPropertyFilter('');
                                    setEmilMemObjectFilter('');
                                    setEmilMemMembershipFilter('');
                                    setEmilOffset(0);
                                    setEmilMembershipsOffset(0);
                                  }}
                                  className={`w-full flex items-center justify-between p-3 text-left transition-colors ${isGroupSelected ? 'bg-blue-50' : 'bg-tj-navy-light/50 backdrop-blur-md hover:bg-tj-navy-dark/70/60 backdrop-blur-md'
                                    }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <FolderOpen className={`h-5 w-5 ${isGroupSelected ? 'text-tj-gold' : 'text-tj-slate'}`} />
                                    <span className={`font-semibold text-sm ${isGroupSelected ? 'text-blue-900' : 'text-tj-gray'}`}>
                                      {group}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    className={`h-5 w-5 text-gray-400 transition-transform ${isGroupSelected ? 'rotate-180' : ''
                                      }`}
                                  />
                                </button>

                                {/* Expanded Classes */}
                                {isGroupSelected && (
                                  <div className="border-t border-white/5 bg-tj-navy-dark/60 backdrop-blur-md p-2 space-y-1">
                                    <button
                                      onClick={() => {
                                        setEmilClassFilter('');
                                        setEmilCategoryFilter('');
                                        setEmilObjectFilter('');
                                        setEmilPropertyFilter('');
                                        setEmilMemObjectFilter('');
                                        setEmilMemMembershipFilter('');
                                        setEmilAttrObjectFilter('');
                                        setEmilAttrAttributeFilter('');
                                        setEmilOffset(0);
                                        setEmilMembershipsOffset(0);
                                        setEmilAttributesOffset(0);
                                      }}
                                      className={`w-full text-left flex items-center gap-2 p-2 text-sm rounded hover:bg-tj-navy-light/50 backdrop-blur-md ${emilClassFilter === '' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-tj-gray'
                                        }`}
                                    >
                                      <Folder className="h-4 w-4" />
                                      All Classes
                                    </button>
                                    {emilAvailableClasses.map((cls) => {
                                      const isClassSelected = emilClassFilter === cls;

                                      return (
                                        <div key={cls}>
                                          <button
                                            onClick={() => {
                                              if (isClassSelected) {
                                                setEmilClassFilter('');
                                              } else {
                                                setEmilClassFilter(cls);
                                              }
                                              setEmilCategoryFilter('');
                                              setEmilObjectFilter('');
                                              setEmilPropertyFilter('');
                                              setEmilMemObjectFilter('');
                                              setEmilMemMembershipFilter('');
                                              setEmilOffset(0);
                                              setEmilMembershipsOffset(0);
                                            }}
                                            className={`w-full text-left flex items-center gap-2 p-2 text-sm rounded hover:bg-tj-navy-light/50 backdrop-blur-md ${isClassSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'text-tj-gray'
                                              }`}
                                          >
                                            <Folder className="h-4 w-4" />
                                            {cls}
                                          </button>

                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Additional Filters Below - Object, Property/Membership (Category moved to hierarchical structure above) */}
                        {SHOW_EXTRA_FILTERS && (
                          <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                            {/* Object */}
                            <div className="border border-white/5 rounded-xl">
                              <button
                                onClick={() => setExpandedCarriers(prev => ({
                                  ...prev,
                                  object: !prev.object
                                }))}
                                className="w-full flex items-center justify-between p-3 text-sm hover:bg-tj-navy-dark/70/60 backdrop-blur-md text-left"
                              >
                                <span className="font-medium flex-1 text-left">Object</span>
                                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expandedCarriers.object ? 'rotate-180' : ''}`} />
                              </button>
                              {expandedCarriers.object && (
                                <div className="px-3 pb-2">
                                  <div className="space-y-1 max-h-[calc(60vh-7rem)] overflow-y-auto">
                                    <button
                                      onClick={() => {
                                        if (viewMode === 'properties') {
                                          setEmilObjectFilter('');
                                          setEmilPropertyFilter('');
                                          setEmilOffset(0);
                                        } else if (viewMode === 'memberships') {
                                          setEmilMemObjectFilter('');
                                          setEmilMemMembershipFilter('');
                                          setEmilMembershipsOffset(0);
                                        } else {
                                          setEmilAttrObjectFilter('');
                                          setEmilAttrAttributeFilter('');
                                          setEmilAttributesOffset(0);
                                        }
                                      }}
                                      className={`w-full text-left flex items-center gap-2 p-2 text-sm rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md ${(viewMode === 'properties' ? emilObjectFilter : viewMode === 'memberships' ? emilMemObjectFilter : emilAttrObjectFilter) === '' ? 'bg-blue-50 text-blue-700' : 'text-tj-gray'
                                        }`}
                                    >
                                      <Boxes className="h-4 w-4" />
                                      All Objects
                                    </button>
                                    {(viewMode === 'properties' ? emilAvailableObjects : viewMode === 'memberships' ? emilMemAvailableObjects : emilAttrAvailableObjects).map((obj) => (
                                      <button
                                        key={obj}
                                        onClick={() => {
                                          if (viewMode === 'properties') {
                                            setEmilObjectFilter(obj);
                                            setEmilPropertyFilter('');
                                            setEmilOffset(0);
                                          } else if (viewMode === 'memberships') {
                                            setEmilMemObjectFilter(obj);
                                            setEmilMemMembershipFilter('');
                                            setEmilMembershipsOffset(0);
                                          } else {
                                            setEmilAttrObjectFilter(obj);
                                            setEmilAttrAttributeFilter('');
                                            setEmilAttributesOffset(0);
                                          }
                                        }}
                                        className={`w-full text-left flex items-center gap-2 p-2 text-sm rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md min-w-0 ${(viewMode === 'properties' ? emilObjectFilter : viewMode === 'memberships' ? emilMemObjectFilter : emilAttrObjectFilter) === obj ? 'bg-blue-50 text-blue-700' : 'text-tj-gray'
                                          }`}
                                      >
                                        <Boxes className="h-4 w-4 flex-shrink-0" />
                                        <span className="truncate" title={obj}>{tailTruncate(obj, 40, 18)}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Property/Membership */}
                            <div className="border border-white/5 rounded-xl">
                              <button
                                onClick={() => setExpandedCarriers(prev => ({
                                  ...prev,
                                  property: !prev.property
                                }))}
                                className="w-full flex items-center justify-between p-3 text-sm hover:bg-tj-navy-dark/70/60 backdrop-blur-md text-left"
                              >
                                <span className="font-medium flex-1 text-left">{viewMode === 'properties' ? 'Property' : 'Membership'}</span>
                                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expandedCarriers.property ? 'rotate-180' : ''}`} />
                              </button>
                              {expandedCarriers.property && (
                                <div className="px-3 pb-2">
                                  <div className="space-y-1 max-h-[calc(60vh-7rem)] overflow-y-auto">
                                    <button
                                      onClick={() => {
                                        if (viewMode === 'properties') {
                                          setEmilPropertyFilter('');
                                          setEmilOffset(0);
                                        } else {
                                          setEmilMemMembershipFilter('');
                                          setEmilMembershipsOffset(0);
                                        }
                                      }}
                                      className={`w-full text-left flex items-center gap-2 p-2 text-sm rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md ${(viewMode === 'properties' ? emilPropertyFilter : emilMemMembershipFilter) === '' ? 'bg-blue-50 text-blue-700' : 'text-tj-gray'
                                        }`}
                                    >
                                      <Boxes className="h-4 w-4" />
                                      {viewMode === 'properties' ? 'All Properties' : 'All Memberships'}
                                    </button>
                                    {(viewMode === 'properties' ? emilAvailableProperties : emilMemAvailableMemberships).map((item) => (
                                      <button
                                        key={item}
                                        onClick={() => {
                                          if (viewMode === 'properties') {
                                            setEmilPropertyFilter(item);
                                            setEmilOffset(0);
                                          } else {
                                            setEmilMemMembershipFilter(item);
                                            setEmilMembershipsOffset(0);
                                          }
                                        }}
                                        className={`w-full text-left flex items-center gap-2 p-2 text-sm rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md min-w-0 ${(viewMode === 'properties' ? emilPropertyFilter : emilMemMembershipFilter) === item ? 'bg-blue-50 text-blue-700' : 'text-tj-gray'
                                          }`}
                                      >
                                        <Boxes className="h-4 w-4 flex-shrink-0" />
                                        <span className="truncate" title={item}>{tailTruncate(item, 40, 18)}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Resize Handle */}
                      <div
                        onMouseDown={startDrag}
                        className="absolute top-0 -right-1 w-2 h-full cursor-col-resize group select-none"
                        title="Drag to resize"
                      >
                        <div className="absolute inset-y-0 right-0 w-[3px] bg-gray-200 group-hover:bg-gray-300 rounded"></div>
                      </div>
                    </div>

                    {/* Objects Canvas */}
                    <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 h-[72vh] relative">
                      <div className="mb-4">
                        <h3 className="text-base font-semibold text-tj-gray">Categories</h3>
                      </div>
                      <div className="h-[60vh] overflow-y-auto">
                        {/* Show empty state when attributes class is selected, otherwise show categories */}
                        {viewMode === 'attributes' && emilClassFilter ? (
                          <div className="h-full flex items-center justify-center">
                            <p className="text-sm text-gray-400">Categories not available for attributes</p>
                          </div>
                        ) : emilClassGroupFilter && emilClassFilter && emilAvailableCategories.length > 0 ? (
                          <div className="space-y-2">
                            {/* All Categories button */}
                            <button
                              onClick={() => {
                                setEmilCategoryFilter('');
                                setEmilChildNameFilter('');
                                setEmilObjectFilter('');
                                setEmilPropertyFilter('');
                                setEmilMemChildNameFilter('');
                                setEmilMemObjectFilter('');
                                setEmilMemMembershipFilter('');
                                setEmilOffset(0);
                                setEmilMembershipsOffset(0);
                                setExpandedCategories({});
                              }}
                              className={`w-full text-left flex items-center gap-2 p-3 text-sm rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md border ${emilCategoryFilter === ''
                                ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium'
                                : 'bg-tj-navy-light/50 backdrop-blur-md text-tj-gray border-white/5'
                                }`}
                            >
                              <Folder className="h-4 w-4" />
                              All Categories
                            </button>

                            {/* Expandable Categories */}
                            {emilAvailableCategories.map((cat) => {
                              const isCategorySelected = emilCategoryFilter === cat;
                              // Auto-expand if category is selected, otherwise use expandedCategories state
                              const isExpanded = isCategorySelected ? true : (expandedCategories[cat] || false);

                              return (
                                <div key={cat} className="border border-white/5 rounded-xl overflow-hidden">
                                  {/* Category Header */}
                                  <button
                                    onClick={() => {
                                      if (isCategorySelected) {
                                        setEmilCategoryFilter('');
                                        setEmilChildNameFilter('');
                                        setEmilObjectFilter('');
                                        setEmilPropertyFilter('');
                                        setEmilMemChildNameFilter('');
                                        setEmilMemObjectFilter('');
                                        setEmilMemMembershipFilter('');
                                        setEmilOffset(0);
                                        setEmilMembershipsOffset(0);
                                        setExpandedCategories(prev => ({ ...prev, [cat]: false }));
                                      } else {
                                        setEmilCategoryFilter(cat);
                                        setEmilChildNameFilter('');
                                        setEmilObjectFilter('');
                                        setEmilPropertyFilter('');
                                        setEmilMemChildNameFilter('');
                                        setEmilMemObjectFilter('');
                                        setEmilMemMembershipFilter('');
                                        setEmilOffset(0);
                                        setEmilMembershipsOffset(0);
                                        // Automatically expand when category is selected
                                        setExpandedCategories(prev => ({ ...prev, [cat]: true }));
                                      }
                                    }}
                                    className={`w-full flex items-center justify-between p-3 text-left transition-colors ${isCategorySelected ? 'bg-blue-50' : 'bg-tj-navy-light/50 backdrop-blur-md hover:bg-tj-navy-dark/70/60 backdrop-blur-md'
                                      }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <FolderOpen className={`h-5 w-5 ${isCategorySelected ? 'text-tj-gold' : 'text-tj-slate'}`} />
                                      <span className={`font-semibold text-sm ${isCategorySelected ? 'text-blue-900' : 'text-tj-gray'}`}>
                                        {cat}
                                      </span>
                                    </div>
                                    <ChevronDown
                                      className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''
                                        }`}
                                    />
                                  </button>

                                  {/* Expanded Child Names */}
                                  {isExpanded && (
                                    <div className="border-t border-white/5 bg-tj-navy-dark/60 backdrop-blur-md p-2 space-y-1">
                                      <button
                                        onClick={() => {
                                          if (viewMode === 'properties') {
                                            setEmilChildNameFilter('');
                                            setEmilObjectFilter('');
                                            setEmilPropertyFilter('');
                                            setEmilOffset(0);
                                          } else {
                                            setEmilMemChildNameFilter('');
                                            setEmilMemObjectFilter('');
                                            setEmilMemMembershipFilter('');
                                            setEmilMembershipsOffset(0);
                                          }
                                        }}
                                        className={`w-full text-left flex items-center gap-2 p-2 text-sm rounded hover:bg-tj-navy-light/50 backdrop-blur-md ${(viewMode === 'properties' ? emilChildNameFilter : emilMemChildNameFilter) === ''
                                          ? 'bg-blue-100 text-blue-700 font-medium'
                                          : 'text-tj-gray'
                                          }`}
                                      >
                                        <Boxes className="h-4 w-4" />
                                        All Child Names
                                      </button>
                                      {(viewMode === 'properties' ? emilAvailableChildNames : emilMemAvailableChildNames).length > 0 ? (
                                        (viewMode === 'properties' ? emilAvailableChildNames : emilMemAvailableChildNames).map((childName) => (
                                          <button
                                            key={childName}
                                            onClick={() => {
                                              if (viewMode === 'properties') {
                                                setEmilChildNameFilter(childName);
                                                setEmilObjectFilter('');
                                                setEmilPropertyFilter('');
                                                setEmilOffset(0);
                                              } else {
                                                setEmilMemChildNameFilter(childName);
                                                setEmilMemObjectFilter('');
                                                setEmilMemMembershipFilter('');
                                                setEmilMembershipsOffset(0);
                                              }
                                            }}
                                            className={`w-full text-left flex items-center gap-2 p-2 text-sm rounded hover:bg-tj-navy-light/50 backdrop-blur-md min-w-0 ${(viewMode === 'properties' ? emilChildNameFilter : emilMemChildNameFilter) === childName
                                              ? 'bg-blue-100 text-blue-700 font-medium'
                                              : 'text-tj-gray'
                                              }`}
                                          >
                                            <Boxes className="h-4 w-4 flex-shrink-0" />
                                            <span className="truncate flex-1" title={childName}>{childName}</span>
                                          </button>
                                        ))
                                      ) : (
                                        <div className="px-2 py-2 text-sm text-tj-slate text-center">
                                          No child names available
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="h-full"></div>
                        )}
                      </div>
                      {/* Resize Handle */}
                      <div
                        onMouseDown={startDragObjects}
                        className="absolute top-0 -right-1 w-2 h-full cursor-col-resize group select-none"
                        title="Drag to resize"
                      >
                        <div className="absolute inset-y-0 right-0 w-[3px] bg-gray-200 group-hover:bg-gray-300 rounded"></div>
                      </div>
                    </div>

                    {/* Middle: Table Editor */}
                    <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6 h-[72vh]">
                      <div className="mb-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-4">
                              <h3 className="text-base font-semibold text-tj-gray">
                                {emilClassGroupFilter || 'All Class Groups'}
                              </h3>
                              {/* Stages Display - Show beside All Class Groups */}
                              {activeTab === 'build' && (workflowRunning || stagesAccomplished.length > 0) && (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl">
                                    {workflowRunning && (
                                      <RefreshCw className="h-4 w-4 text-tj-gold animate-spin" />
                                    )}
                                    <span className="text-sm font-medium text-blue-900">
                                      Stages: {stagesAccomplished.length} / {totalStages}
                                    </span>
                                  </div>
                                  {stagesAccomplished.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      {stagesAccomplished.map((stage) => (
                                        <div
                                          key={stage.stage_number}
                                          className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"
                                          title={`Stage ${stage.stage_number}: ${stage.title}`}
                                        >
                                          <CheckCircle2 className="h-4 w-4 text-white" />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-tj-slate flex flex-wrap gap-1">
                              {[
                                { label: 'Class Group', value: emilClassGroupFilter },
                                { label: 'Class', value: emilClassFilter },
                                { label: 'Category', value: emilCategoryFilter },
                                { label: 'Child Name', value: viewMode === 'properties' ? emilChildNameFilter : viewMode === 'memberships' ? emilMemChildNameFilter : '' },
                                { label: 'Object', value: viewMode === 'properties' ? emilObjectFilter : viewMode === 'memberships' ? emilMemObjectFilter : emilAttrObjectFilter },
                                { label: viewMode === 'properties' ? 'Property' : viewMode === 'memberships' ? 'Membership' : 'Attribute', value: viewMode === 'properties' ? emilPropertyFilter : viewMode === 'memberships' ? emilMemMembershipFilter : emilAttrAttributeFilter },
                              ]
                                .filter(f => f.value)
                                .map(f => (
                                  <span key={`${f.label}-${f.value}`} className="px-2 py-0.5 rounded-full bg-black/30 text-tj-gray">
                                    {f.value}
                                  </span>
                                ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                              Export CSV
                            </button>
                            <button className="flex items-center gap-2 px-3 py-1 text-sm bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                              <Sparkles className="h-4 w-4" /> AI Fill Fields
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-hidden mb-4">
                        <div className="rounded-xl border overflow-x-auto max-h-[48vh]">
                          {viewMode === 'properties' ? (
                            <table className="w-full">
                              <thead className="bg-tj-navy-dark/60 backdrop-blur-md sticky top-0">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Collection</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Parent</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Child Name</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Property</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Value</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Units</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Category</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {emilPropertiesLoading ? (
                                  <tr>
                                    <td colSpan="7" className="px-4 py-8 text-center text-tj-slate">
                                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                                      Loading properties...
                                    </td>
                                  </tr>
                                ) : emilProperties.length === 0 ? (
                                  <tr>
                                    <td colSpan="7" className="px-4 py-8 text-center text-tj-slate">
                                      No properties found. Try adjusting filters.
                                    </td>
                                  </tr>
                                ) : (
                                  emilProperties.map((r, idx) => (
                                    <tr key={idx} className="hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                      <td className="px-4 py-3 text-xs">{r.Collection || ''}</td>
                                      <td className="px-4 py-3 text-xs">{r.Parent_Name || ''}</td>
                                      <td className="px-4 py-3 text-sm font-medium max-w-[16rem] whitespace-nowrap overflow-hidden text-ellipsis" title={r.Child_Name || ''}>{tailTruncate(r.Child_Name || '', 36, 14)}</td>
                                      <td className="px-4 py-3 text-sm max-w-[14rem] whitespace-nowrap overflow-hidden text-ellipsis" title={r.Property || ''}>{tailTruncate(r.Property || '', 34, 14)}</td>
                                      <td className="px-4 py-3 text-sm font-mono">{r.Value || ''}</td>
                                      <td className="px-4 py-3 text-xs text-tj-slate">{r.Units || '-'}</td>
                                      <td className="px-4 py-3 text-xs">{r.Category || ''}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          ) : viewMode === 'memberships' ? (
                            <table className="w-full">
                              <thead className="bg-tj-navy-dark/60 backdrop-blur-md sticky top-0">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Collection</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Parent Name</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Parent Category</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Child Name</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Child Category</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Parent Class</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Child Class</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {emilMembershipsLoading ? (
                                  <tr>
                                    <td colSpan="7" className="px-4 py-8 text-center text-tj-slate">
                                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                                      Loading memberships...
                                    </td>
                                  </tr>
                                ) : emilMemberships.length === 0 ? (
                                  <tr>
                                    <td colSpan="7" className="px-4 py-8 text-center text-tj-slate">
                                      No memberships found. Try adjusting filters.
                                    </td>
                                  </tr>
                                ) : (
                                  emilMemberships.map((r, idx) => (
                                    <tr key={idx} className="hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                      <td className="px-4 py-3 text-xs">{r.Collection || ''}</td>
                                      <td className="px-4 py-3 text-sm font-medium">{r['Parent Name'] || ''}</td>
                                      <td className="px-4 py-3 text-xs">{r['Parent Category'] || ''}</td>
                                      <td className="px-4 py-3 text-sm font-medium max-w-[16rem] whitespace-nowrap overflow-hidden text-ellipsis" title={r['Child Name'] || ''}>{tailTruncate(r['Child Name'] || '', 36, 14)}</td>
                                      <td className="px-4 py-3 text-xs">{r['Child Category'] || ''}</td>
                                      <td className="px-4 py-3 text-xs text-tj-slate">{r.Parent_Class_Name || ''}</td>
                                      <td className="px-4 py-3 text-xs text-tj-slate">{r.Child_Class_Name || ''}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          ) : (
                            <table className="w-full">
                              <thead className="bg-tj-navy-dark/60 backdrop-blur-md sticky top-0">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Class</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Object Name</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Attribute</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Value</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate uppercase">Category</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {emilAttributesLoading ? (
                                  <tr>
                                    <td colSpan="5" className="px-4 py-8 text-center text-tj-slate">
                                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                                      Loading attributes...
                                    </td>
                                  </tr>
                                ) : emilAttributes.length === 0 ? (
                                  <tr>
                                    <td colSpan="5" className="px-4 py-8 text-center text-tj-slate">
                                      No attributes found. Try adjusting filters.
                                    </td>
                                  </tr>
                                ) : (
                                  emilAttributes.map((r, idx) => {
                                    // Extract the part after the dot in Attribute (e.g., "Node.Latitude" -> "Latitude")
                                    const attributeName = r.Attribute || '';
                                    const attributeDisplay = attributeName.includes('.')
                                      ? attributeName.split('.').slice(1).join('.')
                                      : attributeName;
                                    return (
                                      <tr key={idx} className="hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                        <td className="px-4 py-3 text-xs">{r.Class || ''}</td>
                                        <td className="px-4 py-3 text-sm font-medium max-w-[16rem] whitespace-nowrap overflow-hidden text-ellipsis" title={r.Object_Name || ''}>{tailTruncate(r.Object_Name || '', 36, 14)}</td>
                                        <td className="px-4 py-3 text-sm max-w-[14rem] whitespace-nowrap overflow-hidden text-ellipsis" title={r.Attribute || ''}>{tailTruncate(attributeDisplay, 34, 14)}</td>
                                        <td className="px-4 py-3 text-sm font-mono">{r.Value || ''}</td>
                                        <td className="px-4 py-3 text-xs">{r.Category || ''}</td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        {viewMode === 'properties' ? (
                          <>
                            <div className="text-xs text-tj-slate">
                              Showing {emilProperties.length} of {emilTotalCount} rows
                              {(emilClassGroupFilter || emilClassFilter || emilCategoryFilter || emilChildNameFilter || emilObjectFilter || emilPropertyFilter) && ' • Filters active'}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEmilOffset(Math.max(0, emilOffset - emilLimit))}
                                disabled={emilOffset === 0}
                                className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Previous
                              </button>
                              <span className="text-xs text-tj-slate">
                                Page {Math.floor(emilOffset / emilLimit) + 1} of {Math.ceil(emilTotalCount / emilLimit) || 1}
                              </span>
                              <button
                                onClick={() => setEmilOffset(emilOffset + emilLimit)}
                                disabled={emilOffset + emilLimit >= emilTotalCount}
                                className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Next
                              </button>
                              <button className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                Export CSV
                              </button>
                              <button className="flex items-center gap-2 px-3 py-1 text-sm bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                <Sparkles className="h-4 w-4" /> AI Fill Fields
                              </button>
                            </div>
                          </>
                        ) : viewMode === 'memberships' ? (
                          <>
                            <div className="text-xs text-tj-slate">
                              Showing {emilMemberships.length} of {emilMembershipsTotalCount} rows
                              {(emilClassGroupFilter || emilClassFilter || emilCategoryFilter || emilMemChildNameFilter || emilMemObjectFilter || emilMemMembershipFilter) && ' • Filters active'}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEmilMembershipsOffset(Math.max(0, emilMembershipsOffset - emilMembershipsLimit))}
                                disabled={emilMembershipsOffset === 0}
                                className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Previous
                              </button>
                              <span className="text-xs text-tj-slate">
                                Page {Math.floor(emilMembershipsOffset / emilMembershipsLimit) + 1} of {Math.ceil(emilMembershipsTotalCount / emilMembershipsLimit) || 1}
                              </span>
                              <button
                                onClick={() => setEmilMembershipsOffset(emilMembershipsOffset + emilMembershipsLimit)}
                                disabled={emilMembershipsOffset + emilMembershipsLimit >= emilMembershipsTotalCount}
                                className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Next
                              </button>
                              <button className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                Export CSV
                              </button>
                              <button className="flex items-center gap-2 px-3 py-1 text-sm bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                <Sparkles className="h-4 w-4" /> AI Fill Fields
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs text-tj-slate">
                              Showing {emilAttributes.length} of {emilAttributesTotalCount} rows
                              {(emilClassGroupFilter || emilClassFilter || emilCategoryFilter || emilAttrObjectFilter || emilAttrAttributeFilter) && ' • Filters active'}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEmilAttributesOffset(Math.max(0, emilAttributesOffset - emilAttributesLimit))}
                                disabled={emilAttributesOffset === 0}
                                className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Previous
                              </button>
                              <span className="text-xs text-tj-slate">
                                Page {Math.floor(emilAttributesOffset / emilAttributesLimit) + 1} of {Math.ceil(emilAttributesTotalCount / emilAttributesLimit) || 1}
                              </span>
                              <button
                                onClick={() => setEmilAttributesOffset(emilAttributesOffset + emilAttributesLimit)}
                                disabled={emilAttributesOffset + emilAttributesLimit >= emilAttributesTotalCount}
                                className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Next
                              </button>
                              <button className="px-3 py-1 text-sm border border-white/10 rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                Export CSV
                              </button>
                              <button className="flex items-center gap-2 px-3 py-1 text-sm bg-tj-gold/10 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.2)] rounded hover:bg-tj-navy-dark/70/60 backdrop-blur-md">
                                <Sparkles className="h-4 w-4" /> AI Fill Fields
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Right: Stages Display for Build Tab - 4th column */}
                {activeAssistant === 'emil' && activeTab === 'build' && (
                  <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 h-[72vh] p-6 overflow-y-auto">
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-white font-semibold mb-2 tracking-wide">Workflow Progress</h3>
                      <p className="text-sm text-tj-slate">Stages: {stagesAccomplished.length} / {totalStages}</p>
                    </div>

                    {stagesAccomplished.length === 0 && !workflowRunning && (
                      <div className="rounded-xl border border-dashed border-white/10 bg-tj-navy-dark/60 backdrop-blur-md p-6 text-center text-sm text-tj-slate">
                        No stages accomplished yet. Generate a plan from Copilot to start.
                      </div>
                    )}

                    {stagesAccomplished.length === 0 && workflowRunning && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center text-sm">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <RefreshCw className="h-5 w-5 animate-spin text-tj-gold" />
                          <span className="font-medium text-blue-900">Workflow Initiated</span>
                        </div>
                        <div className="text-blue-700">
                          Request sent to N8n. Waiting for stages to begin...
                        </div>
                      </div>
                    )}

                    {stagesAccomplished.length > 0 && (
                      <div className="space-y-3">
                        {stagesAccomplished.map((stage, idx) => (
                          <div key={stage.stage_number} className="rounded-xl border border-white/5 bg-tj-navy-light/60 backdrop-blur-xl shadow-lg shadow-black/40 p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-tj-gray mb-1 text-sm">
                                  Stage {stage.stage_number}: {stage.title}
                                </div>
                                <div className="text-xs text-tj-slate mb-2">
                                  {stage.description}
                                </div>
                                {stage.timestamp && (
                                  <div className="text-[10px] text-gray-400">
                                    {new Date(stage.timestamp).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {workflowRunning && stagesAccomplished.length < totalStages && (
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
                            <div className="flex items-center justify-center gap-2 text-sm text-tj-gold">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>Waiting for more stages...</span>
                            </div>
                          </div>
                        )}

                        {stagesAccomplished.length >= totalStages && (
                          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                            <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>All stages completed!</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Right: Engine Settings for Run Tab - 4th column */}
                {activeAssistant === 'emil' && activeTab === 'run' && (
                  <div className="relative bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 h-[72vh] p-6 overflow-y-auto">
                    {/* Engine Settings */}
                    <div className="mb-6">
                      <h3 className="text-base font-semibold text-tj-gray mb-4">Engine Settings</h3>

                      <div className="space-y-4">
                        {/* Model Selection - Search Bar and Checkbox List */}
                        <div>
                          <label className="block text-sm font-medium text-white font-semibold mb-2 tracking-wide">Model Selection</label>
                          <div className="space-y-3">
                            {/* Search Bar */}
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                              <input
                                type="text"
                                value={modelSearchTerm}
                                onChange={(e) => setModelSearchTerm(e.target.value)}
                                placeholder="Search models..."
                                className="w-full pl-10 pr-3 py-2 border border-white/10 rounded-lg focus:ring-2 focus:ring-tj-gold focus:border-transparent"
                              />
                            </div>

                            {/* Filtered Model List with Checkboxes */}
                            <div className="border border-white/10 rounded-lg max-h-[300px] overflow-y-auto">
                              {availableModelChildNames.length === 0 ? (
                                <div className="p-4 text-center text-sm text-tj-slate">
                                  No models found
                                </div>
                              ) : (() => {
                                const filteredModels = availableModelChildNames.filter(name =>
                                  name.toLowerCase().includes(modelSearchTerm.toLowerCase())
                                );

                                if (filteredModels.length === 0) {
                                  return (
                                    <div className="p-4 text-center text-sm text-tj-slate">
                                      No models match your search
                                    </div>
                                  );
                                }

                                return (
                                  <div className="p-2">
                                    {filteredModels.map((childName) => (
                                      <label
                                        key={childName}
                                        className="flex items-center gap-2 p-2 hover:bg-tj-navy-dark/70/60 backdrop-blur-md rounded cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selectedModels.includes(childName)}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSelectedModels([...selectedModels, childName]);
                                            } else {
                                              setSelectedModels(selectedModels.filter(m => m !== childName));
                                            }
                                          }}
                                          className="w-4 h-4 text-tj-gold border-white/10 rounded focus:ring-tj-gold"
                                        />
                                        <span className="text-sm text-tj-gray flex-1">{childName}</span>
                                      </label>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Selected Models Summary */}
                            {selectedModels.length > 0 && (
                              <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="text-xs font-semibold tracking-wider uppercase text-tj-slate text-blue-900 mb-2">
                                  {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {selectedModels.map((model) => (
                                    <span
                                      key={model}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded border border-blue-300"
                                    >
                                      {model}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedModels(selectedModels.filter(m => m !== model));
                                        }}
                                        className="hover:text-blue-900 focus:outline-none"
                                        aria-label={`Remove ${model}`}
                                      >
                                        <XCircle className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Run Estimate */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-tj-gray">Estimated Runtime:</span>
                        <span className="text-sm text-tj-gray">{getRunEstimate()}</span>
                      </div>

                      <button
                        onClick={async () => {
                          if (selectedModels.length === 0) {
                            alert('Please select at least one model to run the simulation.');
                            return;
                          }

                          if (!buildOutputFilename) {
                            alert('Please wait for the build to complete first. The model file will be available after all build stages are finished.');
                            return;
                          }

                          if (lastRunTriggeredFilenameRef.current && lastRunTriggeredFilenameRef.current === buildOutputFilename) {
                            alert('A simulation run has already been started for this build output. Please start a new build to run again.');
                            return;
                          }

                          if (runWorkflowRunning) {
                            alert('A simulation run is already in progress. Please wait for it to finish.');
                            return;
                          }

                          try {
                            lastRunTriggeredFilenameRef.current = buildOutputFilename;

                            // Use the first selected model as modelname
                            const modelname = selectedModels[0];

                            // Add loading spinner message
                            const loadingMessageId = Date.now();
                            setCopilotChatMessages(prev => [...prev, {
                              id: loadingMessageId,
                              text: `Initiating simulation run for model "${modelname}"...`,
                              sender: 'bot',
                              timestamp: new Date(),
                              isLoading: true
                            }]);

                            // Light up Emil status indicator (green light)
                            setAssistantStatus(prev => ({
                              ...prev,
                              emil: 'active'
                            }));
                            setRunWorkflowRunning(true);

                            console.log('Running simulation with:', {
                              filename: buildOutputFilename,
                              modelname: modelname,
                              selectedModels: selectedModels
                            });

                            // Call the run webhook
                            const response = await fetch('https://n8n.terajouleenergy.com/webhook/81a50164-6f0e-4664-b4d8-f4f4945d6f03', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                filename: buildOutputFilename,
                                modelname: modelname
                              })
                            });

                            if (!response.ok) {
                              throw new Error(`HTTP ${response.status}`);
                            }

                            const result = await response.json();
                            console.log("Run workflow response:", result);

                            // Remove loading message
                            setCopilotChatMessages(prev => prev.filter(msg => msg.id !== loadingMessageId));

                            // Parse the response - it's an array with status and result
                            const responseData = Array.isArray(result) ? result[0] : result;
                            const status = responseData?.status || 'unknown';
                            const hasError = responseData?.result?.error;

                            // Reset run status before starting
                            await fetch(`${API_BASE}/run-status/reset`, { method: 'POST' });

                            // Check if status is complete
                            if (status === 'complete') {
                              // Show completion message
                              let messageText = `✅ Simulation run completed successfully!\n\nModel: "${modelname}"\nFile: "${buildOutputFilename}"\n\nResults are now available in the Results tab.`;
                              if (hasError) {
                                messageText += `\n\n⚠️ Note: ${responseData.result.error}`;
                              }

                              setCopilotChatMessages(prev => [...prev, {
                                id: prev.length + 1,
                                text: messageText,
                                sender: 'bot',
                                timestamp: new Date()
                              }]);

                              // Reset Emil status to idle when run completes
                              setAssistantStatus(prev => ({
                                ...prev,
                                emil: 'idle'
                              }));
                              setRunWorkflowRunning(false);
                            } else {
                              // Processing - show initiated message
                              setCopilotChatMessages(prev => [...prev, {
                                id: prev.length + 1,
                                text: `🚀 Simulation run started from Build tab!\n\nModel: "${modelname}"\nFile: "${buildOutputFilename}"\n\nThe simulation is running in the background. You'll be notified when it completes.`,
                                sender: 'bot',
                                timestamp: new Date()
                              }]);

                              // Start polling for run completion
                              runPollingIntervalRef.current = setInterval(pollRunStatus, 3000); // Poll every 3 seconds
                              pollRunStatus(); // Check immediately
                            }

                          } catch (err) {
                            console.error("Failed to run simulation:", err);
                            // Remove loading message
                            setCopilotChatMessages(prev => prev.filter(msg => !msg.isLoading));
                            // Add error message to chat
                            setCopilotChatMessages(prev => [...prev, {
                              id: prev.length + 1,
                              text: `❌ Failed to initiate simulation run: ${err.message}`,
                              sender: 'bot',
                              timestamp: new Date(),
                              isError: true
                            }]);
                            // Reset Emil status on error
                            setAssistantStatus(prev => ({
                              ...prev,
                              emil: 'idle'
                            }));
                            setRunWorkflowRunning(false);
                          }
                        }}
                        disabled={selectedModels.length === 0 || !buildOutputFilename || runWorkflowRunning}
                        className={`w-full mt-4 px-4 py-2 rounded-lg transition-colors ${selectedModels.length === 0 || !buildOutputFilename || runWorkflowRunning
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          : 'bg-tj-gold text-tj-navy-dark hover:bg-tj-navy-dark/70/60 backdrop-blur-md'
                          }`}
                      >
                        <Rocket className="h-4 w-4 inline mr-2" />
                        {runWorkflowRunning ? 'Running...' : 'Run Simulation'}
                      </button>

                      {!buildOutputFilename && (
                        <p className="text-xs text-tj-slate mt-2 text-center">
                          Waiting for build to complete...
                        </p>
                      )}

                      {buildOutputFilename && (
                        <p className="text-xs text-green-600 mt-2 text-center">
                          Ready: {buildOutputFilename}
                        </p>
                      )}

                      {/* Run Workflow Loading Overlay */}
                      {runWorkflowRunning && (
                        <div className="absolute inset-0 bg-tj-navy-light/50 backdrop-blur-md/95 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
                          <div className="text-center">
                            <div className="inline-block">
                              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                            </div>
                            <div className="mt-4 space-y-2">
                              <p className="text-lg font-semibold text-tj-gray">Running Simulation...</p>
                              <p className="text-sm text-tj-slate">Please wait while the simulation executes</p>
                              <div className="flex items-center justify-center gap-2 mt-3">
                                <div className="w-2 h-2 bg-tj-gold text-tj-navy-dark border-none rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-tj-gold text-tj-navy-dark border-none rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-tj-gold text-tj-navy-dark border-none rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {/* Map Tab - Full Screen */}
        {activeAssistant === 'emil' && activeTab === 'map' && (
          <div className="relative h-full overflow-hidden mb-0">
            {/* Map Canvas - Full Screen */}
            <div className="absolute inset-0 bg-tj-navy-light/50 backdrop-blur-md overflow-hidden">
              {/* Legacy map controls (non-PyPSA only) */}
              {engine !== 'PyPSA Engine' && (
              <div className="absolute top-4 left-0 z-10">
                {mapControlsCollapsed ? (
                  <button
                    onClick={() => setMapControlsCollapsed(false)}
                    className="ml-3 h-8 w-8 rounded-full bg-tj-gold border border-tj-gold shadow flex items-center justify-center hover:brightness-105"
                    title="Expand"
                  >
                    <span className="text-xs text-black">›</span>
                  </button>
                ) : (
                <div className="relative ml-4 bg-tj-navy-dark/60 backdrop-blur-md rounded-xl border border-white/5 p-4 shadow-lg max-w-xs max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden scrollbar-hidden">
                  <button
                    onClick={() => setMapControlsCollapsed(!mapControlsCollapsed)}
                    className="absolute right-2 top-3 z-20 h-8 w-8 rounded-full bg-tj-navy-light/50 backdrop-blur-md border border-white/10 shadow flex items-center justify-center hover:bg-tj-navy-dark/70/60 backdrop-blur-md"
                    title={mapControlsCollapsed ? 'Expand' : 'Collapse'}
                  >
                    <span className="text-xs text-tj-gray">{mapControlsCollapsed ? '›' : '‹'}</span>
                  </button>
                  <div>
                  <h3 className="text-lg font-semibold text-tj-gray mb-3 text-left">Map Controls</h3>

                  {engine === 'PyPSA Engine' && selectedPyPSAFile && regionPanelVisible && (
                    <div className="mb-3">
                      <div className="mb-2 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={closeRegionPanel}
                          className="text-xs px-2.5 py-1 rounded-md border border-white/15 bg-white/5 text-tj-gray hover:border-white/30"
                        >
                          Back
                        </button>
                      </div>
                      <PypsaRegionSolveControls
                        sourceDirname={selectedPyPSAFile}
                        center={regionCenter}
                        onClearCenter={() => { setRegionCenter(null); setRegionManifest(null); setRegionError(null); setRegionS3Folder(''); setRegionDirname(''); setRegionSourceDirname(''); setRegionOpsMessage(''); }}
                        radiusKm={regionRadiusKm}
                        onRadiusChange={setRegionRadiusKm}
                        radiusLocked={!!regionManifest}
                        canSolve={!!regionCenter && !!selectedPyPSAFile && !regionManifest}
                        solving={regionSolving}
                        onSolve={solveRegion}
                        manifest={regionManifest}
                        error={regionError}
                        currentRegionDirname={resolvedRegionDirname}
                        onSaveCurrentRun={saveCurrentRegionRun}
                        savingCurrentRun={regionSaveBusy}
                        opsMessage={regionOpsMessage}
                        onClose={null}
                      />
                    </div>
                  )}

                  {!regionPanelVisible && (
                  <div className="space-y-3.5">
                    <div>
                      <h4 className="text-sm font-semibold text-white mb-1.5 tracking-wide text-left">Selected Node</h4>
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] leading-5 text-tj-slate text-left">{selectedNode || 'None selected'}</p>
                        {selectedNodes.length > 0 && (
                          <button
                            onClick={() => {
                              setSelectedNodes([]);
                              setSelectedNode(null);
                              console.log('Selection manually cleared');
                            }}
                            className="text-xs px-2.5 py-1 bg-tj-gold/20 text-tj-gold rounded-md border border-tj-gold/50 hover:bg-tj-gold/40 transition-colors ml-2"
                          >
                            Clear Selection ({selectedNodes.length})
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-white mb-1.5 tracking-wide text-left">Connections</h4>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[13px] leading-5 text-tj-slate text-left">
                          {getVisibleConnections().length} visible / {engine === 'PyPSA Engine' ? pypsaConnections.length : connections.length} total connections
                        </p>
                        {(engine === 'PyPSA Engine' ? pypsaConnections.length > 0 : connections.length > 0) && (
                          <button
                            onClick={() => engine === 'PyPSA Engine' ? setPypsaConnections([]) : setConnections([])}
                            className="text-xs px-2.5 py-1 bg-red-900/40 text-red-400 rounded-md border border-red-500/50 hover:bg-red-900/60 transition-colors ml-2"
                          >
                            Clear All
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-white mb-1.5 tracking-wide text-left">Facilities</h4>
                      <p className="text-[13px] leading-5 text-tj-slate text-left">
                        {visibleFacilityCount} visible / {totalFacilityCount} total {engine === 'PyPSA Engine' ? 'grouped node locations' : 'facilities loaded'}
                      </p>
                      {editableNodes.length > 0 && (
                        <p className="text-xs text-orange-600 text-left">{editableNodes.length} editable nodes</p>
                      )}

                      {/* Build Tab Filters - Same as Build Tab */}
                      <div className="mt-2.5 space-y-2">
                        {/* Reset Filters Button */}
                        {(emilClassGroupFilter || emilClassFilter || emilCategoryFilter || emilObjectFilter) && (
                          <button
                            onClick={() => {
                              setEmilClassGroupFilter('');
                              setEmilClassFilter('');
                              setEmilCategoryFilter('');
                              setEmilObjectFilter('');
                              setConnections([]);
                            }}
                            className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold tracking-wider uppercase text-tj-slate text-red-600 hover:text-red-700 hover:bg-red-50 rounded border border-red-200 transition-colors"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Reset Filters
                          </button>
                        )}

                        {/* Class Group Filter */}
                        {emilAvailableClassGroups.length > 0 && (
                          <div>
                            <label className="text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate text-left block mb-1">Class Group:</label>
                            <select
                              value={emilClassGroupFilter}
                              onChange={(e) => {
                                setEmilClassGroupFilter(e.target.value);
                                setEmilClassFilter('');
                                setEmilCategoryFilter('');
                                setEmilObjectFilter('');
                                setConnections([]);
                              }}
                              className="w-full px-2 py-1 text-xs border border-white/10 rounded-lg focus:ring-1 focus:ring-tj-gold focus:border-transparent bg-tj-navy-light/50 backdrop-blur-md"
                            >
                              <option value="">All Class Groups</option>
                              {emilAvailableClassGroups.map((group) => (
                                <option key={group} value={group}>{group}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Class Filter */}
                        {emilClassGroupFilter && emilAvailableClasses.length > 0 && (
                          <div>
                            <label className="text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate text-left block mb-1">Class:</label>
                            <select
                              value={emilClassFilter}
                              onChange={(e) => {
                                setEmilClassFilter(e.target.value);
                                setEmilCategoryFilter('');
                                setEmilObjectFilter('');
                                setConnections([]);
                              }}
                              className="w-full px-2 py-1 text-xs border border-white/10 rounded-lg focus:ring-1 focus:ring-tj-gold focus:border-transparent bg-tj-navy-light/50 backdrop-blur-md"
                            >
                              <option value="">All Classes</option>
                              {emilAvailableClasses.map((cls) => (
                                <option key={cls} value={cls}>{cls}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Category Filter */}
                        {emilClassGroupFilter && emilClassFilter && emilAvailableCategories.length > 0 && (
                          <div>
                            <label className="text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate text-left block mb-1">Category:</label>
                            <select
                              value={emilCategoryFilter}
                              onChange={(e) => {
                                setEmilCategoryFilter(e.target.value);
                                setEmilObjectFilter('');
                                setConnections([]);
                              }}
                              className="w-full px-2 py-1 text-xs border border-white/10 rounded-lg focus:ring-1 focus:ring-tj-gold focus:border-transparent bg-tj-navy-light/50 backdrop-blur-md"
                            >
                              <option value="">All Categories</option>
                              {emilAvailableCategories.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Object Filter */}
                        {emilClassGroupFilter && emilClassFilter && emilCategoryFilter && emilAvailableObjects.length > 0 && (
                          <div>
                            <label className="text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-slate text-left block mb-1">Object:</label>
                            <select
                              value={emilObjectFilter}
                              onChange={(e) => {
                                setEmilObjectFilter(e.target.value);
                                setConnections([]);
                              }}
                              className="w-full px-2 py-1 text-xs border border-white/10 rounded-lg focus:ring-1 focus:ring-tj-gold focus:border-transparent bg-tj-navy-light/50 backdrop-blur-md"
                            >
                              <option value="">Select an Object...</option>
                              {emilAvailableObjects.map((obj) => (
                                <option key={obj} value={obj}>{tailTruncate(obj, 40, 15)}</option>
                              ))}
                            </select>
                            <p className="text-xs text-tj-slate mt-1 text-left">
                              Select an object to load facilities on the map
                            </p>
                          </div>
                        )}

                        {/* Info message */}
                        {emilClassGroupFilter && emilClassFilter && (
                          <div className="text-xs text-tj-slate bg-blue-50 border border-blue-200 rounded p-2 text-left">
                            {emilObjectFilter
                              ? `Showing nodes for "${emilObjectFilter}". Facilities are loaded from memberships where Child Class = "Nodes".`
                              : emilCategoryFilter
                                ? `Showing all nodes from all objects under the selected category. Select a specific Object to filter further.`
                                : `Showing all nodes from all categories and all objects. Select a Category to filter further, or an Object to see specific nodes.`}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Auto-zoom toggle — pans/zooms the map to fit visible
                        facilities whenever the dataset changes. Off by default. */}
                    <div className="border-t border-white/5 pt-3">
                      <label className="flex items-center justify-between cursor-pointer select-none">
                        <span className="text-[11px] text-tj-gray uppercase tracking-wider font-semibold">
                          Auto Zoom
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={autoZoomEnabled}
                          onClick={() => setAutoZoomEnabled((v) => !v)}
                          className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                            autoZoomEnabled ? 'bg-tj-gold' : 'bg-white/10'
                          }`}
                          title={autoZoomEnabled
                            ? 'Auto-zoom ON — map fits to visible facilities on dataset change'
                            : 'Auto-zoom OFF — map keeps your current view'}
                        >
                          <span
                            className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                              autoZoomEnabled ? 'translate-x-4' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </label>
                      <p className="text-[10px] text-tj-slate mt-1 leading-snug">
                        {autoZoomEnabled
                          ? 'On: map fits to visible facilities when the dataset changes.'
                          : 'Off: map stays where you left it.'}
                      </p>
                    </div>

                    <div className="border-t border-white/5 pt-3">
                      <span className="text-[11px] text-tj-gray uppercase tracking-wider font-semibold">
                        Map performance
                      </span>
                      <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-black/10 p-1" role="radiogroup" aria-label="Map performance">
                        {[
                          [MAP_PERFORMANCE_PREFERENCES.AUTO, 'Adaptive'],
                          [MAP_PERFORMANCE_PREFERENCES.QUALITY, 'Quality'],
                          [MAP_PERFORMANCE_PREFERENCES.PERFORMANCE, 'Speed'],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={performancePreference === value}
                            onClick={() => setPerformancePreference(value)}
                            className={`rounded-md px-1 py-1.5 text-[10px] font-semibold transition ${
                              performancePreference === value
                                ? 'bg-tj-gold/15 text-tj-gold ring-1 ring-tj-gold/35'
                                : 'text-tj-slate hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-tj-slate mt-1 leading-snug">
                        {performancePreference === MAP_PERFORMANCE_PREFERENCES.AUTO
                          ? `Adaptive: ${performanceMode ? `lighter rendering for ${mapPerformanceDecision.reason}` : 'full quality for this map'}.`
                          : performanceMode
                            ? 'Speed: lighter markers and no packet animation.'
                            : 'Quality: keeps all visual effects, even on dense maps.'}
                      </p>
                    </div>

                    {engine === 'PyPSA Engine' && (
                      <div className="border-t border-white/5 pt-3">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-tj-gray text-left flex items-center gap-1">
                            <Rocket className="h-3.5 w-3.5 text-tj-gold" />
                            Ask EMIL
                          </h4>
                          <button
                            type="button"
                            onClick={() => setShowPypsaSettingsDialog(true)}
                            className="text-[11px] px-2 py-1 rounded-md border border-tj-gold/30 text-tj-gold hover:bg-tj-gold/10 inline-flex items-center gap-1"
                          >
                            <Settings className="h-3 w-3" />
                            Build Settings
                          </button>
                        </div>

                        <div className="space-y-2">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (fullEuOnly) return;
                              submitSolveNetworkPrompt();
                            }}
                          >
                            <input
                              type="text"
                              value={solveNetworkSearch}
                              onChange={(e) => {
                                setSolveNetworkSearch(e.target.value);
                                setSolveNetworkStageMessage('');
                                setSolveNetworkLogsCollapsed(false);
                              }}
                              disabled={fullEuOnly}
                              placeholder={
                                fullEuOnly
                                  ? 'EMIL disabled — Full EU Models only'
                                  : 'Ask EMIL about a place or network...'
                              }
                              className="w-full px-2.5 py-1.5 text-xs border border-white/10 rounded-md focus:ring-1 focus:ring-tj-gold bg-tj-navy-light/50 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </form>

                          {solveNetworkStaging && (
                            <div className="text-xs text-left bg-tj-gold/10 border border-tj-gold/35 rounded p-2">
                              <div className="flex items-center gap-2 text-tj-gold">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span className="uppercase tracking-wider font-semibold">
                                  {EMIL_LOADING_STATES[solveNetworkLoadingStateIndex]}...
                                </span>
                              </div>
                              <div className="mt-1 text-tj-gold/80">
                                EMIL is processing your request and preparing the map output.
                              </div>
                            </div>
                          )}

                          {solveNetworkStageMessage && (
                            <div className="bg-tj-gold/10 border border-tj-gold/25 rounded">
                              <button
                                type="button"
                                onClick={() => setSolveNetworkLogsCollapsed((prev) => !prev)}
                                className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] text-tj-gold hover:bg-tj-gold/15 transition-colors"
                              >
                                <span className="font-semibold tracking-wide uppercase">EMIL Logs</span>
                                <span>{solveNetworkLogsCollapsed ? 'Show' : 'Hide'}</span>
                              </button>
                              {!solveNetworkLogsCollapsed && (
                                <div className="px-2 pb-2 text-xs text-tj-gold text-left whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                                  {solveNetworkStageMessage}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* PyPSA Data Source - visible only when PyPSA Engine is active */}
                    {engine === 'PyPSA Engine' && (
                      <div className="border-t border-white/5 pt-3">
                        <h4 className="text-sm font-semibold text-white mb-2 tracking-wide text-left flex items-center gap-1">
                          <Network className="h-3.5 w-3.5 text-tj-gold" />
                          PyPSA Data Source
                        </h4>
                        <div className="mb-3 p-2 rounded-md border border-white/10 bg-tj-navy-dark/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-tj-gray uppercase tracking-wider font-semibold">
                              Saved Outputs
                            </span>
                            <button
                              type="button"
                              onClick={() => loadPyPSAFiles(pypsaGranularity)}
                              className="text-[11px] text-tj-slate hover:text-white underline inline-flex items-center gap-1"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Refresh
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedPypsaListFile}
                              onChange={(e) => setSelectedPypsaListFile(e.target.value)}
                              disabled={primaryPypsaSourceEntries.length === 0 || pypsaLoading}
                              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-white/10 rounded-md bg-tj-navy-light/50 backdrop-blur-md text-white appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {primaryPypsaSourceEntries.length === 0 && (
                                <option value="">No files available</option>
                              )}
                              {primaryPypsaSourceEntries.map((f) => (
                                <option key={f.filename} value={f.filename}>
                                  {f.filename}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => { loadSelectedPypsaOutput().catch(() => {}); }}
                              disabled={!selectedPypsaListFile || pypsaLoading}
                              className="px-2.5 py-1.5 text-xs rounded-md border border-tj-gold/40 text-tj-gold hover:bg-tj-gold/15 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Load
                            </button>
                          </div>
                          <p className="text-[11px] text-tj-slate text-left">
                            Source: <span className="text-white/80">{pypsaFilesSource}</span>
                          </p>
                        </div>

                        {(primaryPypsaSourceEntries.length === 0 && !selectedPyPSAFile) ? (
                          <p className="text-xs text-tj-slate text-left break-words">
                            No PyPSA files or distill directories found in {pypsaGranularity}/
                          </p>
                        ) : (
                          <div className="space-y-2.5">
                            <div>
                              {(() => {
                                const activeGranularity =
                                  extractResolutionLabelFromName(selectedPyPSAFile) || pypsaGranularity;
                                const activeIndex = Math.max(
                                  0,
                                  PYPSA_GRANULARITY_OPTIONS.findIndex(o => o.value === activeGranularity)
                                );
                                const activeLabel =
                                  PYPSA_GRANULARITY_OPTIONS[activeIndex]?.label || activeGranularity;
                                const jouleActiveValue = jouleModelSize ?? DEFAULT_JOULE_MODEL_VALUE;
                                const jouleIndex = Math.max(
                                  0,
                                  JOULE_MODEL_OPTIONS.findIndex((o) => o.value === jouleActiveValue)
                                );
                                const jouleActiveLabel = JOULE_MODEL_OPTIONS[jouleIndex]?.label ?? '—';
                                return (
                                  <>
                                    {/* Main granularity slider — hidden when Full EU toggle is on.
                                        Stays disabled until the user types a location into the
                                        EMIL search bar; pressing Enter without touching it submits
                                        at the default granularity. */}
                                    {!fullEuOnly && (() => {
                                      const granularityArmed = solveNetworkSearch.trim().length > 0;
                                      return (
                                      <>
                                        <div className="flex items-center justify-between mb-1.5">
                                          <label className={`text-[11px] uppercase tracking-wider ${granularityArmed ? 'text-tj-slate' : 'text-tj-slate/60'}`}>
                                            Granularity
                                          </label>
                                          <span className={`text-xs font-semibold ${granularityArmed ? 'text-tj-gold' : 'text-tj-slate/60'}`}>
                                            {granularityArmed ? activeLabel : 'Type a location to enable'}
                                          </span>
                                        </div>
                                        <input
                                          type="range"
                                          min={0}
                                          max={PYPSA_GRANULARITY_OPTIONS.length - 1}
                                          step={1}
                                          value={activeIndex}
                                          disabled={pypsaLoading || jouleModelLoading || !granularityArmed}
                                          onChange={(e) => {
                                            const next = PYPSA_GRANULARITY_OPTIONS[Number(e.target.value)];
                                            if (next) switchPypsaGranularity(next.value);
                                          }}
                                          className="w-full accent-tj-gold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                        />
                                        <div className={`grid grid-cols-6 mt-1.5 text-[10px] ${granularityArmed ? 'text-tj-slate' : 'text-tj-slate/50'}`}>
                                          {PYPSA_GRANULARITY_OPTIONS.map((option, idx) => (
                                            <span
                                              key={option.value}
                                              className={`${
                                                idx === 0
                                                  ? 'text-left'
                                                  : idx === PYPSA_GRANULARITY_OPTIONS.length - 1
                                                    ? 'text-right'
                                                    : 'text-center'
                                              } ${activeIndex === idx ? 'text-tj-gold font-semibold' : ''}`}
                                            >
                                              {option.label}
                                            </span>
                                          ))}
                                        </div>

                                        <div className="mt-3">
                                          <div className="flex items-center justify-between mb-1.5">
                                            <label className={`text-[11px] uppercase tracking-wider ${granularityArmed ? 'text-tj-slate' : 'text-tj-slate/60'}`}>
                                              Planning Horizon
                                            </label>
                                            <span className={`text-xs font-semibold ${granularityArmed ? 'text-tj-gold' : 'text-tj-slate/60'}`}>
                                              {planningHorizonYear}
                                            </span>
                                          </div>
                                          <select
                                            value={planningHorizonYear}
                                            onChange={(e) => setPlanningHorizonYear(e.target.value)}
                                            disabled={pypsaLoading || jouleModelLoading || !granularityArmed}
                                            className="w-full px-2.5 py-1.5 text-xs border border-white/10 rounded-md bg-tj-navy-light/50 backdrop-blur-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            {['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'].map((yr) => (
                                              <option key={yr} value={yr}>{yr}</option>
                                            ))}
                                          </select>
                                          <p className={`mt-1 text-[10px] ${granularityArmed ? 'text-tj-slate/80' : 'text-tj-slate/50'}`}>
                                            Single-year run (range support can be added later).
                                          </p>
                                        </div>
                                      </>
                                      );
                                    })()}

                                    {/* Full EU Model — separate section. Slider is inactive until
                                        the toggle is flipped; toggling on disables EMIL and hides
                                        the main granularity slider above. */}
                                    <div className={`${!fullEuOnly ? 'mt-3 pt-3 border-t border-white/5' : ''}`}>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-[11px] text-tj-gray uppercase tracking-wider font-semibold flex items-center gap-2">
                                          Full EU Model
                                          <button
                                            type="button"
                                            onClick={() => setFullEuOnly((prev) => !prev)}
                                            className={`inline-flex h-3.5 w-7 items-center rounded-full transition-colors ${
                                              fullEuOnly ? 'bg-tj-gold' : 'bg-white/15'
                                            }`}
                                            title={
                                              fullEuOnly
                                                ? 'Full EU only — EMIL is disabled. Click to re-enable EMIL.'
                                                : 'Activate Full EU Model (disables EMIL and the granularity slider)'
                                            }
                                          >
                                            <span
                                              className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                                                fullEuOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                                              }`}
                                            />
                                          </button>
                                        </label>
                                        <span className={`text-xs font-semibold ${fullEuOnly ? 'text-tj-gold' : 'text-tj-slate/60'}`}>
                                          {fullEuOnly
                                            ? (jouleModelLoading ? 'Loading…' : jouleActiveLabel)
                                            : 'Inactive'}
                                        </span>
                                      </div>
                                      <input
                                        type="range"
                                        min={0}
                                        max={JOULE_MODEL_OPTIONS.length - 1}
                                        step={1}
                                        value={jouleIndex}
                                        disabled={!fullEuOnly || jouleModelLoading || pypsaLoading}
                                        onChange={(e) => {
                                          const next = JOULE_MODEL_OPTIONS[Number(e.target.value)];
                                          if (next) loadJouleModelAtSize(next.value);
                                        }}
                                        className="w-full accent-tj-gold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                      />
                                      <div className={`grid grid-cols-6 mt-1.5 text-[10px] ${fullEuOnly ? 'text-tj-slate' : 'text-tj-slate/50'}`}>
                                        {JOULE_MODEL_OPTIONS.map((option, idx) => (
                                          <span
                                            key={option.value}
                                            className={`${
                                              idx === 0
                                                ? 'text-left'
                                                : idx === JOULE_MODEL_OPTIONS.length - 1
                                                  ? 'text-right'
                                                  : 'text-center'
                                            } ${fullEuOnly && jouleIndex === idx ? 'text-tj-gold font-semibold' : ''}`}
                                          >
                                            {option.label}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            {selectedPyPSAFile && (
                              <p className="text-[12px] text-tj-slate text-left truncate">
                                Active: <span className="text-white/80">{selectedPyPSAFile}</span>
                              </p>
                            )}
                            <p className="text-xs text-tj-gold text-left">
                              Viewing dataset: <span className="font-medium text-white/80">{extractResolutionLabelFromName(selectedPyPSAFile) || pypsaGranularity}</span>
                            </p>
                            <div className="pt-2.5 border-t border-white/5 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] uppercase tracking-wider text-tj-slate text-left">Saved Region Outputs</p>
                                <button
                                  type="button"
                                  onClick={loadRegionSavedRuns}
                                  className="text-[11px] text-tj-slate hover:text-white underline"
                                >
                                  Refresh
                                </button>
                              </div>
                              <div className="relative">
                                <select
                                  value={selectedSavedRegionKey}
                                  onChange={(e) => setSelectedSavedRegionKey(e.target.value)}
                                  disabled={regionSavedRunsLoading || regionSavedRuns.length === 0}
                                  className="w-full pl-2.5 pr-7 py-1.5 text-xs border border-white/10 rounded-md bg-tj-navy-light/50 backdrop-blur-md text-white appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {regionSavedRuns.length === 0 && (
                                    <option value="">No saved region outputs</option>
                                  )}
                                  {regionSavedRuns.map((run) => (
                                    <option key={regionRunKey(run)} value={regionRunKey(run)}>
                                      {run.dirname} ({run.granularity_prefix})
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tj-slate pointer-events-none" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => selectedSavedRegionRun && loadSavedRegionRun(selectedSavedRegionRun)}
                                  disabled={!selectedSavedRegionRun || regionSavedRunsLoading}
                                  className="text-xs px-2.5 py-1.5 rounded-md border bg-white/5 text-tj-gray border-white/10 hover:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Load
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectedSavedRegionRun && deleteSavedRegionRun(selectedSavedRegionRun)}
                                  disabled={!selectedSavedRegionRun || regionSavedRunsLoading}
                                  className="text-xs px-2.5 py-1.5 rounded-md border bg-red-900/30 text-red-300 border-red-500/30 hover:bg-red-900/45 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            {pypsaFacilitiesData.length > 0 && (
                              <div className="text-xs text-tj-gold text-left space-y-0.5 leading-5">
                                {pypsaComponentScope === 'lines_only' && (
                                  <p>Topology-only mode: showing transmission structure first. Zoom in or select a node to load full assets.</p>
                                )}
                                <p>{totalFacilityCount} grouped node locations plotted on map
                                  {pypsaCrossBorderBusCount > 0 &&
                                    `, including ${pypsaCrossBorderBusCount} cross-border bus location${pypsaCrossBorderBusCount > 1 ? 's' : ''}`}
                                </p>
                                <p>{pypsaRealComponentCount} underlying components loaded from PyPSA</p>
                                {pypsaConnections.length > 0 && (
                                  <p>
                                    {pypsaConnections.filter(c => c.type === 'line').length > 0 && `${pypsaConnections.filter(c => c.type === 'line').length} AC lines`}
                                    {pypsaConnections.filter(c => c.type === 'link' && !c.is_cross_border).length > 0 && `, ${pypsaConnections.filter(c => c.type === 'link' && !c.is_cross_border).length} DC links`}
                                    {pypsaConnections.filter(c => c.is_cross_border).length > 0 && `, ${pypsaConnections.filter(c => c.is_cross_border).length} cross-border`}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                  )}
                  </div>
                </div>
                )}
              </div>
              )}

              {/* Map View Controls Overlay removed as per request */}

              {/* Map Component - Full Screen */}
              <div className="w-full h-full relative">
                {false && engine === 'PyPSA Engine' && (
                  <>
                    <div className="absolute top-2 left-2 right-2 z-[520] bg-tj-navy-dark/88 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-8 w-8 rounded-lg border border-tj-gold/50 bg-tj-gold/10 flex items-center justify-center">
                            <Zap className="h-4 w-4 text-tj-gold" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white leading-4">Network Builder</p>
                            <p className="text-[11px] text-tj-slate truncate">PyPSA Configuration</p>
                          </div>
                        </div>
                        <div className="hidden lg:grid grid-cols-4 gap-2 flex-1 max-w-3xl">
                          <input
                            value={pypsaSettings.scenario_name}
                            onChange={(e) => updatePypsaSetting('scenario_name', e.target.value)}
                            className="px-2 py-1.5 text-xs rounded-md bg-black/25 border border-white/10 text-white"
                            placeholder="Scenario"
                          />
                          <select
                            value={String(pypsaSettings.planning_horizon)}
                            onChange={(e) => updatePypsaSetting('planning_horizon', Number(e.target.value))}
                            className="px-2 py-1.5 text-xs rounded-md bg-black/25 border border-white/10 text-white"
                          >
                            {['2025', '2030', '2035', '2040', '2045', '2050'].map((yr) => <option key={yr} value={yr}>{yr}</option>)}
                          </select>
                          <input
                            value={pypsaSettings.region}
                            onChange={(e) => updatePypsaSetting('region', e.target.value)}
                            className="px-2 py-1.5 text-xs rounded-md bg-black/25 border border-white/10 text-white"
                            placeholder="Region"
                          />
                          <select
                            value={String(pypsaSettings.model_scope)}
                            onChange={(e) => updatePypsaSetting('model_scope', e.target.value)}
                            className="px-2 py-1.5 text-xs rounded-md bg-black/25 border border-white/10 text-white"
                          >
                            <option value="electricity">Electricity</option>
                            <option value="sector-coupled">Sector-Coupled</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="hidden xl:flex items-center gap-1.5">
                            <select
                              value={selectedPypsaListFile}
                              onChange={(e) => setSelectedPypsaListFile(e.target.value)}
                              disabled={primaryPypsaSourceEntries.length === 0 || pypsaLoading}
                              className="w-[260px] px-2 py-1.5 text-xs rounded-md bg-black/25 border border-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Select local PyPSA-Eur output"
                            >
                              {primaryPypsaSourceEntries.length === 0 && (
                                <option value="">No local outputs</option>
                              )}
                              {primaryPypsaSourceEntries.map((f) => (
                                <option key={f.filename} value={f.filename}>
                                  {f.filename}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => loadPyPSAFiles(pypsaGranularity, { sourceMode: 'local' })}
                              className="text-xs px-2 py-1.5 rounded-md border border-white/15 text-tj-slate hover:text-white hover:bg-white/10"
                            >
                              Refresh
                            </button>
                            <button
                              type="button"
                              onClick={() => { loadSelectedPypsaOutput().catch(() => {}); }}
                              disabled={!selectedPypsaListFile || pypsaLoading}
                              className="text-xs px-2.5 py-1.5 rounded-md border border-tj-gold/40 text-tj-gold hover:bg-tj-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Load
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowPypsaSettingsDialog(true)}
                            className="text-xs px-2.5 py-1.5 rounded-md border border-white/15 text-tj-slate hover:text-white hover:bg-white/10"
                          >
                            Load Scenario
                          </button>
                          <button
                            type="button"
                            onClick={runPypsaBuildFromSettings}
                            disabled={solveNetworkStaging || pypsaLoading}
                            className="text-xs px-3 py-1.5 rounded-md border border-tj-gold/40 bg-tj-gold text-tj-navy-dark hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Build Network
                          </button>
                          <button
                            type="button"
                            onClick={exportPypsaSettingsJson}
                            className="text-xs px-2.5 py-1.5 rounded-md border border-white/15 text-tj-slate hover:text-white hover:bg-white/10"
                          >
                            Save Config
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2.5 py-1.5 rounded-md border border-white/15 text-tj-slate hover:text-white hover:bg-white/10"
                          >
                            ⋮
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-20 left-3 z-[510] w-[275px] grid grid-cols-1 gap-1 items-start">
                      <div className="bg-[#0b1a29]/96 backdrop-blur-md border border-white/10 rounded-xl overflow-y-auto overflow-x-hidden max-h-[calc(100vh-6rem)] scrollbar-hidden">
                        <button type="button" onClick={() => setPypsaSectionOpen((prev) => ({ ...prev, region: !prev.region }))} className="w-full px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-white text-sm font-semibold text-left">
                            <CircleDot className="h-3.5 w-3.5 text-tj-gold" />
                            <span>1. Region & Time</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                            <ChevronDown className={`h-3.5 w-3.5 text-tj-slate transition-transform ${pypsaSectionOpen.region ? 'rotate-180' : ''}`} />
                          </div>
                        </button>
                        {pypsaSectionOpen.region && (
                        <div className="px-3 py-3 space-y-3 text-xs border-b border-white/10">
                          <div>
                            <p className="text-tj-slate mb-1 flex items-center gap-1.5">Region <Info className="h-3 w-3" /></p>
                            <div className="relative">
                              <MapPin className="h-4 w-4 text-tj-slate absolute left-3 top-1/2 -translate-y-1/2" />
                              <input value={pypsaSettings.region} onChange={(e) => updatePypsaSetting('region', e.target.value)} className="w-full pl-9 pr-9 py-2 rounded-xl bg-[#081523] border border-white/10 text-white" />
                              <ChevronDown className="h-4 w-4 text-tj-slate absolute right-3 top-1/2 -translate-y-1/2" />
                            </div>
                          </div>
                          <div>
                            <p className="text-tj-slate mb-1 flex items-center gap-1.5">Spatial Resolution <Info className="h-3 w-3" /></p>
                            <div className="relative">
                              <Layers className="h-4 w-4 text-tj-slate absolute left-3 top-1/2 -translate-y-1/2" />
                              <select value={String(pypsaSettings.spatial_resolution)} onChange={(e) => updatePypsaSetting('spatial_resolution', e.target.value)} className="w-full pl-9 pr-9 py-2 rounded-xl bg-[#081523] border border-white/10 text-white appearance-none"><option value="NUTS2">NUTS 2 (Administrative Regions)</option><option value="NUTS1">NUTS 1</option><option value="NUTS3">NUTS 3</option></select>
                              <ChevronDown className="h-4 w-4 text-tj-slate absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                          <div className="pt-2 border-t border-white/10">
                            <div className="flex items-center justify-between mb-2 rounded-lg border border-white/10 bg-[#081523] px-2.5 py-2">
                              <div>
                                <p className="text-tj-gray text-[11px] uppercase tracking-wider">Use clusters + strict dynamic</p>
                                <p className="text-[10px] text-tj-slate">When off, both are ignored at run time.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setUseClusterDynamicArgs((prev) => !prev)}
                                className={`relative inline-flex h-4 w-8 items-center rounded-full ${useClusterDynamicArgs ? 'bg-tj-gold' : 'bg-white/20'}`}
                                title={useClusterDynamicArgs ? 'Enabled for runs' : 'Disabled for runs'}
                              >
                                <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${useClusterDynamicArgs ? 'translate-x-4' : 'translate-x-1'}`} />
                              </button>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-tj-slate uppercase tracking-wider flex items-center gap-1.5">Granularity Mode <Info className="h-3 w-3" /></p>
                              <button type="button" className="text-[#9ab3dd] text-[11px] flex items-center gap-1"><HelpCircle className="h-3.5 w-3.5" />What's this?</button>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              {[
                                ['auto', 'Auto', 'Model chooses optimal clusters'],
                                ['custom', 'Custom', 'Set custom number of clusters/nodes'],
                                ['full', 'Full Resolution', 'Use all available nodes (no clustering)'],
                              ].map(([k, title, desc]) => (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() => {
                                    setGranularityMode(k);
                                    if (k === 'full') updatePypsaSetting('clusters', 1024);
                                  }}
                                  className={`text-left rounded-xl border p-2 min-w-0 ${granularityMode === k ? 'border-tj-gold bg-[#0d1f34]' : 'border-white/15 bg-white/[0.02]'}`}
                                >
                                  <div className="flex items-center justify-between text-white font-semibold gap-2">
                                    <span className="break-words">{title}</span>
                                    {granularityMode === k && <span className="h-4 w-4 rounded-full bg-tj-gold inline-block" />}
                                  </div>
                                  <p className="text-tj-slate text-[11px] mt-1 leading-4 break-words">{desc}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1"><p className="text-tj-slate flex items-center gap-1.5">Clusters / Nodes <Info className="h-3 w-3" /></p><span className="text-white text-xl px-2 py-1 rounded-lg border border-white/10 bg-[#081523]">{pypsaSettings.clusters}</span></div>
                            <div className="flex items-center gap-2 text-tj-slate"><span>37</span><input type="range" min={37} max={1024} step={1} disabled={granularityMode === 'full'} value={Number(pypsaSettings.clusters)} onChange={(e) => updatePypsaSetting('clusters', Number(e.target.value))} className="flex-1 accent-tj-gold disabled:opacity-50" /><span>1024</span></div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-[#0d1f34]/60 px-3 py-2 text-[11px] text-[#b7c7dc] space-y-1">
                            <p className="text-green-400">Good balance of accuracy and performance</p>
                            <p>Estimated solve time: ~15 - 30 min</p>
                            <p>Memory usage: ~8 - 12 GB</p>
                          </div>
                          <div className="rounded-xl border border-blue-500/40 bg-blue-900/20 px-3 py-2 text-[11px] text-[#9ab3dd]">
                            Full Resolution may be slow and memory-heavy. Recommended only for small regions or build-only runs.
                          </div>
                          <div className="pt-2 border-t border-white/10">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-white text-lg font-semibold">Run Mode <span className="text-sm text-tj-slate font-normal">(Build & Solve)</span></p>
                              <CheckCircle2 className="h-5 w-5 text-green-400" />
                            </div>
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => { setRunMode('build_only'); updatePypsaSetting('build_only', true); }}
                                className={`w-full rounded-xl border px-3 py-2 text-left ${runMode === 'build_only' ? 'border-tj-gold bg-[#0d1f34]' : 'border-white/15 bg-white/[0.02]'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-start gap-2">
                                    <span className="pt-0.5">{runMode === 'build_only' ? <Check className="h-4 w-4 text-tj-gold" /> : <Circle className="h-4 w-4 text-tj-slate" />}</span>
                                    <div>
                                      <p className="text-white font-semibold">Build Only</p>
                                      <p className="text-tj-slate text-[11px]">Create the PyPSA network and export .nc file.</p>
                                      <p className="text-green-400 text-[11px]">Recommended for full-resolution networks.</p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] px-2 py-1 rounded-lg border border-green-500/30 bg-green-900/20 text-green-300">LOW<br />Resource Usage</span>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRunMode('build_solve'); updatePypsaSetting('build_only', false); }}
                                className={`w-full rounded-xl border px-3 py-2 text-left ${runMode === 'build_solve' ? 'border-blue-400/50 bg-[#0d1f34]' : 'border-white/15 bg-white/[0.02]'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-start gap-2">
                                    <span className="pt-0.5">{runMode === 'build_solve' ? <Check className="h-4 w-4 text-blue-300" /> : <Circle className="h-4 w-4 text-tj-slate" />}</span>
                                    <div>
                                      <p className="text-white font-semibold">Build + Solve</p>
                                      <p className="text-tj-slate text-[11px]">Build the network, then run optimization.</p>
                                      <p className="text-yellow-300 text-[11px]">Requires more RAM/CPU.</p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 bg-red-900/20 text-red-300">HIGH<br />Resource Usage</span>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRunMode('solve_existing'); updatePypsaSetting('build_only', false); }}
                                className={`w-full rounded-xl border px-3 py-2 text-left ${runMode === 'solve_existing' ? 'border-purple-400/50 bg-[#0d1f34]' : 'border-white/15 bg-white/[0.02]'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-start gap-2">
                                    <span className="pt-0.5">{runMode === 'solve_existing' ? <Check className="h-4 w-4 text-purple-300" /> : <Circle className="h-4 w-4 text-tj-slate" />}</span>
                                    <div>
                                      <p className="text-white font-semibold">Solve Existing Build</p>
                                      <p className="text-tj-slate text-[11px]">Load a saved .nc network and solve it.</p>
                                      <p className="text-tj-slate text-[11px]">Useful after testing build output.</p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-900/20 text-amber-300">MEDIUM<br />Resource Usage</span>
                                </div>
                              </button>
                            </div>
                            <div className="mt-2 rounded-xl border border-orange-500/40 bg-orange-900/20 px-3 py-2 text-[11px] text-orange-200 flex items-start gap-2">
                              <Info className="h-4 w-4 mt-0.5 text-orange-300" />
                              <span>Full Resolution + Build & Solve may exceed memory. Use Build Only first, then solve a reduced/custom clustered network.</span>
                            </div>
                            <div className="mt-3">
                              <p className="text-tj-slate mb-2 flex items-center gap-1.5">Output Settings <Info className="h-3 w-3" /></p>
                              <div className="flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-white">
                                  <button type="button" onClick={() => setSaveBuiltNetworkNc((v) => !v)} className={`h-5 w-5 rounded-md border flex items-center justify-center ${saveBuiltNetworkNc ? 'bg-tj-gold border-tj-gold text-black' : 'border-white/30 text-transparent'}`}>
                                    {saveBuiltNetworkNc && <Check className="h-3.5 w-3.5" />}
                                  </button>
                                  <span>Save built network (.nc)</span>
                                </label>
                                <div className="relative min-w-[170px]">
                                  <select className="w-full pl-3 pr-8 py-2 rounded-xl bg-[#081523] border border-white/10 text-white appearance-none">
                                    <option>NetCDF (.nc)</option>
                                  </select>
                                  <ChevronDown className="h-4 w-4 text-tj-slate absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div><p className="text-tj-slate mb-1 flex items-center gap-1.5">Temporal Resolution <Info className="h-3 w-3" /></p><div className="relative"><Clock3 className="h-4 w-4 text-tj-slate absolute left-3 top-1/2 -translate-y-1/2" /><select value={String(pypsaSettings.snapshot_resolution)} onChange={(e) => updatePypsaSetting('snapshot_resolution', e.target.value)} className="w-full pl-9 pr-9 py-2 rounded-xl bg-[#081523] border border-white/10 text-white appearance-none"><option value="monthly">Monthly</option><option value="1h">1 hourly</option><option value="3h">3 hourly</option><option value="6h">6 hourly</option><option value="24h">24 hourly</option></select><ChevronDown className="h-4 w-4 text-tj-slate absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" /></div></div>
                          <div><p className="text-tj-slate mb-1 flex items-center gap-1.5">Weather Year <Info className="h-3 w-3" /></p><div className="relative"><CalendarDays className="h-4 w-4 text-tj-slate absolute left-3 top-1/2 -translate-y-1/2" /><select value={String(pypsaSettings.weather_year || pypsaSettings.planning_horizon)} onChange={(e) => updatePypsaSetting('weather_year', Number(e.target.value))} className="w-full pl-9 pr-9 py-2 rounded-xl bg-[#081523] border border-white/10 text-white appearance-none"><option value="2020">2020</option><option value="2022">2022</option><option value="2024">2024</option><option value="2025">2025</option></select><ChevronDown className="h-4 w-4 text-tj-slate absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" /></div></div>
                          <div><p className="text-tj-slate mb-1 flex items-center gap-1.5">Planning Horizon <Info className="h-3 w-3" /></p><div className="relative"><CalendarDays className="h-4 w-4 text-tj-slate absolute left-3 top-1/2 -translate-y-1/2" /><select value={String(pypsaSettings.planning_horizon)} onChange={(e) => updatePypsaSetting('planning_horizon', Number(e.target.value))} className="w-full pl-9 pr-9 py-2 rounded-xl bg-[#081523] border border-white/10 text-white appearance-none">{['2025', '2030', '2035', '2040', '2045', '2050'].map((yr) => <option key={yr} value={yr}>{yr}</option>)}</select><ChevronDown className="h-4 w-4 text-tj-slate absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" /></div></div>
                          <div>
                            <p className="text-tj-slate mb-1 flex items-center gap-1.5">Snapshots <Info className="h-3 w-3" /></p>
                            <div className="rounded-xl border border-white/10 bg-[#081523] px-3 py-2">
                              <div className="flex items-center justify-between text-white/90">
                                <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-tj-slate" />01 Jan, {pypsaSettings.planning_horizon} 00:00</span>
                                <span className="text-tj-slate">to</span>
                                <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-tj-slate" />31 Dec, {pypsaSettings.planning_horizon} 21:00</span>
                              </div>
                              <p className="mt-2 text-center text-[#7da3d6] text-base">Total: 2,920 snapshots</p>
                            </div>
                          </div>
                        </div>
                        )}

                        <div className="px-3 py-2 border-b border-white/10">
                          <button type="button" onClick={() => setPypsaSectionOpen((prev) => ({ ...prev, technologies: !prev.technologies }))} className="w-full flex items-center justify-between text-sm text-white font-semibold">
                            <span className="flex items-center gap-1.5"><Sun className="h-3.5 w-3.5 text-tj-gold" />2. Technologies</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /><ChevronDown className={`h-3.5 w-3.5 text-tj-slate transition-transform ${pypsaSectionOpen.technologies ? 'rotate-180' : ''}`} /></span>
                          </button>
                          {pypsaSectionOpen.technologies && (
                          <>
                          <div className="mt-2 space-y-1.5 text-xs">
                            {[
                              ['Solar', 'include_solar', Sun], ['Onshore Wind', 'include_onwind', Wind], ['Offshore Wind', 'include_offwind', Waves], ['Hydro', 'include_hydro', Droplets], ['Gas', 'include_gas', Flame], ['Coal', 'include_coal', Factory], ['Oil', 'include_oil', Droplets], ['Biomass', 'include_biomass', Leaf], ['Nuclear', 'include_nuclear', Atom], ['Battery Storage', 'include_battery', Battery], ['Pumped Hydro', 'include_pumped_hydro', Waves], ['Hydrogen', 'include_hydrogen', FlaskConical],
                            ].map(([label, key, Icon]) => (
                              <div key={key} className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-tj-gray"><Icon className="h-3 w-3 text-tj-gold" />{label}</span>
                                <button type="button" onClick={() => updatePypsaSetting(key, !pypsaSettings[key])} className={`relative inline-flex h-4 w-8 items-center rounded-full ${pypsaSettings[key] ? 'bg-tj-gold' : 'bg-white/20'}`}><span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${pypsaSettings[key] ? 'translate-x-4' : 'translate-x-1'}`} /></button>
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => setShowPypsaSettingsDialog(true)} className="mt-2 w-full text-[11px] py-1.5 rounded-md border border-white/15 text-white/90 hover:bg-white/10">Advanced Technology Options</button>
                          </>
                          )}
                        </div>

                        <div className="px-3 py-2 border-b border-white/10">
                          <button type="button" onClick={() => setPypsaSectionOpen((prev) => ({ ...prev, sectors: !prev.sectors }))} className="w-full flex items-center justify-between text-sm text-white font-semibold">
                            <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-tj-gold" />3. Sectors</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /><ChevronDown className={`h-3.5 w-3.5 text-tj-slate transition-transform ${pypsaSectionOpen.sectors ? 'rotate-180' : ''}`} /></span>
                          </button>
                          {pypsaSectionOpen.sectors && (
                          <>
                          <div className="mt-2 space-y-1.5 text-xs">
                            {[['Electricity', 'sector_heat', Zap], ['Heat', 'district_heating', Flame], ['Hydrogen', 'sector_hydrogen', FlaskConical], ['Transport', 'sector_transport', Car], ['Industry', 'sector_industry', Factory]].map(([label, key, Icon]) => (
                              <div key={key} className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-tj-gray"><Icon className="h-3 w-3 text-tj-gold" />{label}</span>
                                <button type="button" onClick={() => updatePypsaSetting(key, !pypsaSettings[key])} className={`relative inline-flex h-4 w-8 items-center rounded-full ${pypsaSettings[key] ? 'bg-tj-gold' : 'bg-white/20'}`}><span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${pypsaSettings[key] ? 'translate-x-4' : 'translate-x-1'}`} /></button>
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => setShowPypsaSettingsDialog(true)} className="mt-2 w-full text-[11px] py-1.5 rounded-md border border-white/15 text-white/90 hover:bg-white/10">Sector Details</button>
                          </>
                          )}
                        </div>

                        <div className="px-3 py-2 border-b border-white/10">
                          <button type="button" onClick={() => setPypsaSectionOpen((prev) => ({ ...prev, capacity: !prev.capacity }))} className="w-full flex items-center justify-between text-sm text-white font-semibold">
                            <span className="flex items-center gap-1.5"><Hammer className="h-3.5 w-3.5 text-tj-gold" />4. Capacity Expansion</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /><ChevronDown className={`h-3.5 w-3.5 text-tj-slate transition-transform ${pypsaSectionOpen.capacity ? 'rotate-180' : ''}`} /></span>
                          </button>
                          {pypsaSectionOpen.capacity && (
                          <>
                          <div className="mt-2 space-y-1.5 text-[11px] text-tj-gray">
                            {[
                              ['Allow Capacity Expansion', 'allow_capacity_expansion'],
                              ['Generator Expansion', 'generator_expansion'],
                              ['Storage Expansion', 'storage_expansion'],
                              ['Network Expansion', 'network_expansion'],
                            ].map(([label, key]) => (
                              <div key={key} className="flex items-center justify-between"><span>{label}</span><button type="button" onClick={() => updatePypsaSetting(key, !pypsaSettings[key])} className={`relative inline-flex h-4 w-8 items-center rounded-full ${pypsaSettings[key] ? 'bg-tj-gold' : 'bg-white/20'}`}><span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${pypsaSettings[key] ? 'translate-x-4' : 'translate-x-1'}`} /></button></div>
                            ))}
                            <div className="grid grid-cols-3 gap-1 pt-1">
                              <div className="rounded border border-white/10 bg-black/20 px-1.5 py-1 text-center">100</div>
                              <div className="rounded border border-white/10 bg-black/20 px-1.5 py-1 text-center">15</div>
                              <div className="rounded border border-white/10 bg-black/20 px-1.5 py-1 text-center">%</div>
                            </div>
                          </div>
                          <button type="button" onClick={() => setShowPypsaSettingsDialog(true)} className="mt-2 w-full text-[11px] py-1.5 rounded-md border border-white/15 text-white/90 hover:bg-white/10">Technology Limits</button>
                          </>
                          )}
                        </div>

                        <div className="px-3 py-2 border-b border-white/10">
                          <button type="button" onClick={() => setPypsaSectionOpen((prev) => ({ ...prev, policy: !prev.policy }))} className="w-full flex items-center justify-between text-sm text-white font-semibold">
                            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-tj-gold" />5. Policy & Costs</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /><ChevronDown className={`h-3.5 w-3.5 text-tj-slate transition-transform ${pypsaSectionOpen.policy ? 'rotate-180' : ''}`} /></span>
                          </button>
                          {pypsaSectionOpen.policy && (
                          <>
                          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-tj-gray">
                            <div className="rounded border border-white/10 bg-black/20 px-2 py-1">CO₂ Cap: {String(pypsaSettings.co2_cap)}</div>
                            <div className="rounded border border-white/10 bg-black/20 px-2 py-1">Carbon: {String(pypsaSettings.carbon_price)}</div>
                            <div className="rounded border border-white/10 bg-black/20 px-2 py-1">RES Target: {pypsaSettings.renewable_share_target}%</div>
                            <div className="rounded border border-white/10 bg-black/20 px-2 py-1">Coal Phaseout: {pypsaSettings.coal_phaseout_year}</div>
                          </div>
                          <button type="button" onClick={() => setShowPypsaSettingsDialog(true)} className="mt-2 w-full text-[11px] py-1.5 rounded-md border border-white/15 text-white/90 hover:bg-white/10">More Policy Options</button>
                          </>
                          )}
                        </div>

                        <div className="px-3 py-2 border-b border-white/10">
                          <button type="button" onClick={() => setPypsaSectionOpen((prev) => ({ ...prev, operations: !prev.operations }))} className="w-full flex items-center justify-between text-sm text-white font-semibold">
                            <span className="flex items-center gap-1.5"><Cog className="h-3.5 w-3.5 text-tj-gold" />6. Operations</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /><ChevronDown className={`h-3.5 w-3.5 text-tj-slate transition-transform ${pypsaSectionOpen.operations ? 'rotate-180' : ''}`} /></span>
                          </button>
                          {pypsaSectionOpen.operations && (
                          <>
                          <div className="mt-2 space-y-1.5 text-xs">
                            {[['Unit Commitment', 'unit_commitment'], ['Ramp Limits', 'ramp_limits'], ['Storage Cyclic State of Charge', 'cyclic_storage'], ['Hydro Inflow Profiles', 'hydro_inflows'], ['Renewable Curtailment Allowed', 'allow_curtailment'], ['Load Shedding Allowed', 'load_shedding']].map(([label, key]) => (
                              <div key={key} className="flex items-center justify-between"><span className="text-tj-gray">{label}</span><button type="button" onClick={() => updatePypsaSetting(key, !pypsaSettings[key])} className={`relative inline-flex h-4 w-8 items-center rounded-full ${pypsaSettings[key] ? 'bg-tj-gold' : 'bg-white/20'}`}><span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${pypsaSettings[key] ? 'translate-x-4' : 'translate-x-1'}`} /></button></div>
                            ))}
                          </div>
                          <button type="button" onClick={() => setShowPypsaSettingsDialog(true)} className="mt-2 w-full text-[11px] py-1.5 rounded-md border border-white/15 text-white/90 hover:bg-white/10">Operational Details</button>
                          </>
                          )}
                        </div>

                        <div className="px-3 py-2 border-b border-white/10">
                          <button type="button" onClick={() => setPypsaSectionOpen((prev) => ({ ...prev, solver: !prev.solver }))} className="w-full flex items-center justify-between text-sm text-white font-semibold">
                            <span className="flex items-center gap-1.5"><Cog className="h-3.5 w-3.5 text-tj-gold" />7. Solver Settings</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-400" /><ChevronDown className={`h-3.5 w-3.5 text-tj-slate transition-transform ${pypsaSectionOpen.solver ? 'rotate-180' : ''}`} /></span>
                          </button>
                          {pypsaSectionOpen.solver && (
                          <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-tj-gray">
                            <div className="rounded border border-white/10 bg-black/20 p-1">Solver<br /><span className="text-white">HiGHS</span></div>
                            <div className="rounded border border-white/10 bg-black/20 p-1">Threads<br /><span className="text-white">{pypsaSettings.solver_threads}</span></div>
                            <div className="rounded border border-white/10 bg-black/20 p-1">Time<br /><span className="text-white">{pypsaSettings.solver_time_limit}</span></div>
                            <div className="rounded border border-white/10 bg-black/20 p-1">MIP<br /><span className="text-white">{pypsaSettings.mip_gap}</span></div>
                          </div>
                          )}
                        </div>

                        <div className="p-2.5 grid grid-cols-2 gap-2">
                          <button onClick={resetPypsaSettingsDefaults} className="text-xs py-2 rounded-md border border-white/15 text-tj-gray hover:text-white">Reset All</button>
                          <button onClick={exportPypsaSettingsJson} className="text-xs py-2 rounded-md border border-white/15 text-tj-gray hover:text-white">Export Config</button>
                        </div>
                      </div>

                    </div>
                    <div className="absolute bottom-0 left-[293px] right-3 z-[510] h-[24vh] overflow-y-auto overflow-x-hidden scrollbar-hidden grid grid-cols-3 gap-2 pb-1 pr-1">
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-white">Network Overview</p>
                          <span className="text-[10px] text-green-400">Loaded locally</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                          <div className="rounded-md border border-white/10 p-2"><p className="text-tj-slate">Buses</p><p className="text-white font-semibold">{pypsaOverviewMetrics.buses.toLocaleString()}</p></div>
                          <div className="rounded-md border border-white/10 p-2"><p className="text-tj-slate">Lines (AC)</p><p className="text-white font-semibold">{pypsaOverviewMetrics.acLines.toLocaleString()}</p></div>
                          <div className="rounded-md border border-white/10 p-2"><p className="text-tj-slate">Links (DC)</p><p className="text-white font-semibold">{pypsaOverviewMetrics.dcLinks.toLocaleString()}</p></div>
                          <div className="rounded-md border border-white/10 p-2"><p className="text-tj-slate">Generators</p><p className="text-white font-semibold">{pypsaOverviewMetrics.generators.toLocaleString()} / {pypsaOverviewMetrics.generators.toLocaleString()}</p></div>
                          <div className="rounded-md border border-white/10 p-2"><p className="text-tj-slate">Conversion</p><p className="text-white font-semibold">{pypsaOverviewMetrics.conversion.toLocaleString()} / {pypsaOverviewMetrics.conversion.toLocaleString()}</p></div>
                          <div className="rounded-md border border-white/10 p-2"><p className="text-tj-slate">Loads / Locations</p><p className="text-white font-semibold">{pypsaOverviewMetrics.loads.toLocaleString()} / {pypsaOverviewMetrics.groupedTotal.toLocaleString()}</p></div>
                        </div>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white font-semibold">Capacity Mix (GW)</p>
                          <p className="text-right text-tj-slate">Total Installed<br /><span className="text-white font-semibold">{(pypsaOverviewMetrics.totalCapacityMW / 1000).toFixed(1)} GW</span></p>
                        </div>
                        <div className="grid grid-cols-5 rounded overflow-hidden border border-white/10">
                          <div className="bg-yellow-500/85 text-black text-center py-1 font-semibold">{pypsaCapacityMix.solar}%</div>
                          <div className="bg-green-500/85 text-black text-center py-1 font-semibold">{pypsaCapacityMix.wind}%</div>
                          <div className="bg-blue-500/85 text-white text-center py-1 font-semibold">{pypsaCapacityMix.hydro}%</div>
                          <div className="bg-red-500/85 text-white text-center py-1 font-semibold">{pypsaCapacityMix.gas}%</div>
                          <div className="bg-purple-500/85 text-white text-center py-1 font-semibold">{pypsaCapacityMix.other}%</div>
                        </div>
                        <div className="grid grid-cols-5 mt-2 text-[10px] text-tj-slate">
                          <span>Solar</span><span>Wind</span><span>Hydro</span><span>Gas</span><span>Other</span>
                        </div>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <p className="text-white font-semibold mb-1">Connections</p>
                        <div className="flex items-center justify-between">
                          <p className="text-tj-slate">{pypsaOverviewMetrics.connectionVisible.toLocaleString()} visible / {pypsaOverviewMetrics.connectionTotal.toLocaleString()} total connections</p>
                          <p className="text-white">100%</p>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-tj-slate">Connection Density</span>
                          <span className="text-green-400">Medium</span>
                        </div>
                        <div className="mt-1 h-2 rounded bg-white/10 overflow-hidden"><div className="h-full w-[68%] bg-gradient-to-r from-green-500 to-lime-400" /></div>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <p className="text-white font-semibold mb-1">Facilities</p>
                        <div className="flex items-center justify-between">
                          <p className="text-tj-slate">{pypsaOverviewMetrics.groupedVisible.toLocaleString()} visible / {pypsaOverviewMetrics.groupedTotal.toLocaleString()} total grouped node locations</p>
                          <p className="text-white">100%</p>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-tj-slate">Group Density</span>
                          <span className="text-green-400">Medium</span>
                        </div>
                        <div className="mt-1 h-2 rounded bg-white/10 overflow-hidden"><div className="h-full w-[64%] bg-gradient-to-r from-green-500 to-lime-400" /></div>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <p className="text-white font-semibold mb-2">Technology Breakdown (GW)</p>
                        <div className="grid grid-cols-[92px_1fr] gap-3 items-center">
                          <div className="relative h-[92px] w-[92px] rounded-full border border-white/10 bg-black/25 flex items-center justify-center">
                            <div className="absolute inset-[10px] rounded-full border border-white/15 bg-black/30" />
                            <div className="relative text-center">
                              <p className="text-lg font-semibold text-tj-gold">{(pypsaOverviewMetrics.totalCapacityMW / 1000).toFixed(1)}</p>
                              <p className="text-[10px] text-tj-slate">GW Total</p>
                            </div>
                          </div>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-center justify-between"><span className="text-yellow-400">Solar</span><span className="text-white">{pypsaCapacityMix.solar}%</span></div>
                            <div className="flex items-center justify-between"><span className="text-green-400">Wind</span><span className="text-white">{pypsaCapacityMix.wind}%</span></div>
                            <div className="flex items-center justify-between"><span className="text-blue-400">Hydro</span><span className="text-white">{pypsaCapacityMix.hydro}%</span></div>
                            <div className="flex items-center justify-between"><span className="text-red-400">Gas</span><span className="text-white">{pypsaCapacityMix.gas}%</span></div>
                            <div className="flex items-center justify-between"><span className="text-purple-400">Other</span><span className="text-white">{pypsaCapacityMix.other}%</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <p className="text-white font-semibold mb-2">Generation Mix (TWh/yr)</p>
                        <div className="grid grid-cols-[92px_1fr] gap-3 items-center">
                          <div className="relative h-[92px] w-[92px] rounded-full border border-white/10 bg-black/25 flex items-center justify-center">
                            <div className="absolute inset-[10px] rounded-full border border-white/15 bg-black/30" />
                            <div className="relative text-center">
                              <p className="text-lg font-semibold text-tj-gold">{pypsaOverviewMetrics.hasDispatch ? (pypsaOverviewMetrics.totalDispatchMWh / 1e6).toFixed(1) : 'N/A'}</p>
                              <p className="text-[10px] text-tj-slate">TWh/yr</p>
                            </div>
                          </div>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-center justify-between"><span className="text-green-400">Wind</span><span className="text-white">{pypsaOverviewMetrics.hasDispatch ? `${pypsaCapacityMix.wind}%` : 'N/A'}</span></div>
                            <div className="flex items-center justify-between"><span className="text-yellow-400">Solar</span><span className="text-white">{pypsaOverviewMetrics.hasDispatch ? `${pypsaCapacityMix.solar}%` : 'N/A'}</span></div>
                            <div className="flex items-center justify-between"><span className="text-blue-400">Hydro</span><span className="text-white">{pypsaOverviewMetrics.hasDispatch ? `${pypsaCapacityMix.hydro}%` : 'N/A'}</span></div>
                            <div className="flex items-center justify-between"><span className="text-red-400">Gas</span><span className="text-white">{pypsaOverviewMetrics.hasDispatch ? `${pypsaCapacityMix.gas}%` : 'N/A'}</span></div>
                            <div className="flex items-center justify-between"><span className="text-purple-400">Other</span><span className="text-white">{pypsaOverviewMetrics.hasDispatch ? `${pypsaCapacityMix.other}%` : 'N/A'}</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <p className="text-white font-semibold mb-2">Annual Demand (TWh/yr)</p>
                        <p className="text-tj-slate">Not available in this topology-only base network.</p>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <p className="text-white font-semibold mb-2">Emissions</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-md border border-white/10 p-2">
                            <p className="text-tj-slate">Total Emissions</p>
                            <p className="text-white text-lg font-semibold">N/A</p>
                            <p className="text-[10px] text-tj-slate">MtCO₂/yr</p>
                          </div>
                          <div className="rounded-md border border-white/10 p-2">
                            <p className="text-tj-slate">CO₂ Intensity</p>
                            <p className="text-white text-lg font-semibold">N/A</p>
                            <p className="text-[10px] text-tj-slate">gCO₂/kWh</p>
                          </div>
                        </div>
                        <p className="mt-2 text-tj-slate">Requires a solved PyPSA network.</p>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <p className="text-white font-semibold">Saved Outputs</p>
                          <button onClick={() => loadPyPSAFiles(pypsaGranularity)} className="text-[10px] text-tj-slate hover:text-white">Refresh</button>
                        </div>
                          <div className="mt-2 rounded-lg border border-white/10 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-white truncate">{selectedPypsaListFile || 'No output selected'}</p>
                              <button
                                type="button"
                                onClick={() => { loadSelectedPypsaOutput().catch(() => {}); }}
                                disabled={!selectedPypsaListFile || pypsaLoading}
                                className="text-[11px] px-2.5 py-1 rounded-md border border-tj-gold/40 text-tj-gold hover:bg-tj-gold/10 disabled:opacity-40"
                              >
                                Load
                              </button>
                            </div>
                          <p className="text-tj-slate mt-1">Source: local PyPSA-Eur NetCDF ({pypsaDatasetMeta.filename || 'not loaded'})</p>
                        </div>
                      </div>
                      <div className="bg-tj-navy-light/92 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs">
                        <p className="text-white font-semibold mb-2">Ask EMIL</p>
                        <input
                          value={solveNetworkSearch}
                          onChange={(e) => setSolveNetworkSearch(e.target.value)}
                          placeholder="Ask EMIL about a place or network..."
                          className="w-full px-2 py-1.5 rounded-md bg-black/20 border border-white/10 text-white"
                        />
                      </div>
                    </div>
                  </>
                )}

                {engine === 'PyPSA Engine' && (
                  <>
                    <header className="atlas-topbar absolute top-2 left-2 right-2 z-[520] h-14 rounded-xl px-3">
                      <div className="h-full flex items-center justify-between gap-2 sm:gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="hidden sm:flex shrink-0 h-9 w-9 rounded-lg border border-tj-gold/45 bg-tj-gold/10 items-center justify-center">
                            {atlasOverlayMode
                              ? <Layers className="h-4 w-4 text-tj-gold" />
                              : atlasNetworkCarrier === 'gas'
                              ? <Flame className="h-4 w-4 text-tj-gold" />
                              : atlasNetworkCarrier === 'water'
                                ? <Droplets className="h-4 w-4 text-cyan-300" />
                                : atlasNetworkCarrier === 'liquids'
                                  ? <Factory className="h-4 w-4 text-amber-300" />
                                  : atlasNetworkCarrier === 'logistics'
                                    ? <Ship className="h-4 w-4 text-sky-300" />
                                : <Globe className="h-4 w-4 text-tj-gold" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p className="text-sm font-semibold tracking-[0.16em] text-tj-gold">ATLAS</p>
                              <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-tj-slate">Network intelligence</span>
                            </div>
                            <p className="text-[11px] text-white/75 truncate">
                              {nohmWorkspaceContext
                                ? `${nohmWorkspaceContext.projectName}${nohmWorkspaceContext.version ? ` · ${nohmWorkspaceContext.version}` : ''}`
                                : <><span className="sm:hidden">Nohm Flow</span><span className="hidden sm:inline">Nohm Flow · Reference Atlas</span></>}
                            </p>
                          </div>
                        </div>

                        <div className="hidden md:flex items-center gap-2 min-w-0">
                          {nohmWorkspaceContext && (
                            <div className="atlas-status-card rounded-lg border border-tj-gold/25 bg-tj-gold/[0.06] px-2.5 py-1.5">
                              <p className="text-[9px] uppercase tracking-wider text-tj-gold">
                                {nohmWorkspaceContext.mode === 'model' ? 'Model context' : 'Reference context'}
                              </p>
                              <p className="text-[11px] text-white max-w-[190px] truncate">
                                {[nohmWorkspaceContext.modelId, nohmWorkspaceContext.scenario].filter(Boolean).join(' · ') || nohmWorkspaceContext.projectId || 'Reference Atlas'}
                              </p>
                            </div>
                          )}
                          {nohmWorkspaceContext && (
                            <div className="atlas-status-card rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-1.5">
                              <p className="text-[9px] uppercase tracking-wider text-tj-slate">Native geography</p>
                              <p className="text-[11px] text-white max-w-[190px] truncate">
                                {nohmWorkspaceContext.nativeGeography?.label || 'Model-native geography'}
                              </p>
                            </div>
                          )}
                          {workspaceStatusCards.map((card) => (
                            <div key={card.label} className="atlas-status-card rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-1.5">
                              <p className="text-[9px] uppercase tracking-wider text-tj-slate">{card.label}</p>
                              <p className="text-[11px] text-white max-w-[190px] truncate">{card.value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                        {!ATLAS_IS_EMBEDDED && (
                          <button
                            type="button"
                            onClick={() => setAtlasTheme((previous) => nextAtlasTheme(previous))}
                            className="atlas-theme-toggle h-9 w-9 rounded-lg flex items-center justify-center"
                            aria-label={`Change Atlas theme. Current theme: ${atlasTheme}`}
                            title={`Theme: ${atlasTheme}. Switch to ${nextAtlasTheme(atlasTheme)}`}
                          >
                            {atlasTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : atlasTheme === 'light' ? <Sparkles className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <label>
                          <span className="sr-only">Network carrier</span>
                          {atlasOverlayMode && <span className="block text-[9px] text-tj-slate">Workspace on exit</span>}
                          <select
                            value={atlasNetworkCarrier}
                            onChange={(event) => setAtlasNetworkCarrier(event.target.value)}
                            className="atlas-select max-w-[150px] rounded-lg border border-tj-gold/30 bg-[#081523] px-2.5 py-2 text-[11px] font-semibold text-white focus:outline-none focus:border-tj-gold/60"
                            aria-label="Network carrier"
                            title={atlasOverlayMode ? 'Workspace to open when overlay is turned off. Choose visible carriers in the overlay legend.' : 'Choose network workspace'}
                          >
                            <option value="electricity">Electricity</option>
                            <option value="gas">Methane gas</option>
                            <option value="water">Water &amp; wastewater</option>
                            <option value="liquids">Oil &amp; energy liquids</option>
                            <option value="logistics">Ports &amp; air freight</option>
                            <option value="hydrogen" disabled>Hydrogen · planned</option>
                          </select>
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            const nextMode = !atlasOverlayMode;
                            setAtlasOverlayMode(nextMode);
                            if (nextMode) {
                              if (!atlasOverlayCarriers.length) {
                                setAtlasOverlayCarriers([
                                  ATLAS_NETWORK_CARRIER_ORDER.includes(atlasNetworkCarrier) ? atlasNetworkCarrier : 'electricity',
                                ]);
                              }
                              focusAtlasPanel('carriers');
                            }
                          }}
                          aria-pressed={atlasOverlayMode}
                          aria-label="Toggle multi-network overlay"
                          data-atlas-overlay-carriers={atlasOverlayMode ? atlasOverlayCarriers.join(',') : ''}
                          title={atlasOverlayMode ? 'Return to single-network view' : 'Overlay multiple network carriers'}
                          className={`h-9 rounded-lg border px-2.5 flex items-center gap-1.5 text-[11px] font-semibold transition ${atlasOverlayMode ? 'border-tj-gold/55 bg-tj-gold/15 text-tj-gold' : 'border-white/10 bg-white/[0.035] text-tj-slate hover:border-tj-gold/35 hover:text-white'}`}
                        >
                          <Layers className="h-3.5 w-3.5" />
                          <span className="hidden lg:inline">{atlasOverlayMode ? 'Overlay on' : 'Overlay'}</span>
                        </button>
                        </div>

                      </div>
                    </header>

                    {atlasOverlayMode && atlasOverlayPanelOpen && !atlasAssetPopupOpen && (
                      <div className="atlas-floating-panel absolute top-[76px] right-[140px] z-[526] w-[252px] rounded-xl border border-white/10 bg-[#071421]/94 p-2 shadow-2xl backdrop-blur-xl">
                        <div className="flex items-center justify-between px-1 pb-1.5">
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.14em] text-tj-gold">Network overlay</p>
                            <p className="text-[9px] text-tj-slate">Colour + line pattern by carrier</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full border border-tj-gold/25 bg-tj-gold/10 px-1.5 py-0.5 text-[9px] text-tj-gold">
                              {atlasOverlayCarriers.filter((carrier) => atlasOverlayCarrierInventory[carrier]?.loaded).length} loaded
                            </span>
                            <button type="button" onClick={() => setAtlasOverlayPanelOpen(false)} aria-label="Collapse carrier overlay legend" className="rounded-md p-1 text-tj-slate transition hover:bg-white/10 hover:text-white">
                              <PanelLeftClose className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {ATLAS_NETWORK_CARRIER_ORDER.map((carrier) => {
                            const selected = atlasOverlayCarriers.includes(carrier);
                            const meta = ATLAS_NETWORK_CARRIER_META[carrier];
                            const inventory = atlasOverlayCarrierInventory[carrier];
                            const visibleInventory = atlasOverlayVisibleInventory[carrier] || { assets: 0, connections: 0 };
                            const scoped = atlasOverlayRecordsByCarrier[carrier];
                            const scopeHasRecords = Boolean(scoped?.facilities.length || scoped?.connections.length);
                            const status = overlayCarrierStatus({ selected, inventory, visibleInventory, carrier, scopeHasRecords });
                            return (
                              <button
                                key={carrier}
                                type="button"
                                onClick={() => handleAtlasOverlayCarrierToggle(carrier)}
                                aria-pressed={selected}
                                aria-label={`${selected ? 'Hide' : 'Show'} ${meta.label} in overlay`}
                                title={status}
                                className={`w-full rounded-lg border px-2 py-1.5 text-left transition ${selected ? 'border-white/20 bg-white/[0.08]' : 'border-transparent bg-black/15 opacity-65 hover:opacity-95'}`}
                              >
                                <span className="flex items-center gap-2">
                                  <svg width="30" height="10" viewBox="0 0 30 10" className="shrink-0" aria-hidden="true">
                                    <line x1="1" y1="5" x2="29" y2="5" stroke={selected ? meta.color : '#64748b'} strokeWidth="2.4" strokeDasharray={meta.dashArray || undefined} strokeLinecap="round" />
                                    <circle cx="15" cy="5" r="3" fill={selected ? meta.color : '#64748b'} stroke="#071421" strokeWidth="1" />
                                  </svg>
                                  <span className={`min-w-0 flex-1 truncate text-[10px] ${selected ? 'text-white' : 'text-tj-slate'}`}>{meta.shortLabel}</span>
                                  <span className={`h-1.5 w-1.5 rounded-full ${inventory.loading ? 'animate-pulse bg-sky-300' : inventory.loaded ? inventory.hasRecords ? 'bg-emerald-400' : 'bg-slate-400' : 'bg-slate-600'}`} />
                                </span>
                                <span className="mt-0.5 block pl-[38px] text-[8px] leading-3 text-tj-slate">{status}</span>
                              </button>
                            );
                          })}
                        </div>
                        {atlasOverlayNotice && (
                          <div className="mt-1.5 flex items-start gap-1 rounded-md border border-amber-300/20 bg-amber-300/10 pl-2 py-1.5 text-[10px] leading-4 text-amber-100">
                            <p role="status" className="min-w-0 flex-1">{atlasOverlayNotice.message}</p>
                            <button type="button" aria-label="Dismiss overlay notice" onClick={() => setAtlasOverlayNotice(null)} className="min-h-[32px] min-w-[32px] rounded text-amber-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200">×</button>
                          </div>
                        )}
                        <p className="px-1 pt-1.5 text-[8px] leading-3 text-tj-slate">Country scope: <span className="text-white">{atlasOverlayCountrySummary}</span>. All drawable links in view are retained. Overview node markers may be thinned; zoom in for detail.</p>
                      </div>
                    )}

                    {atlasOverlayMode && !atlasOverlayPanelOpen && !landOverlay.panelOpen && !gridAccessOverlay.panelOpen && !atlasAssetPopupOpen && (
                      <button
                        type="button"
                        onClick={() => {
                          focusAtlasPanel('carriers');
                        }}
                        aria-label="Open carrier overlay legend"
                        className="absolute top-[76px] right-[140px] z-[526] flex items-center gap-2 rounded-xl border border-tj-gold/30 bg-[#071421]/94 px-3 py-2 text-[10px] font-semibold text-white shadow-2xl backdrop-blur-xl"
                      >
                        <Layers className="h-3.5 w-3.5 text-tj-gold" />
                        Carriers
                        <span className="rounded-full bg-tj-gold/15 px-1.5 py-0.5 text-[9px] text-tj-gold">{atlasOverlayCarriers.filter((carrier) => atlasOverlayCarrierInventory[carrier]?.loaded).length}</span>
                      </button>
                    )}

                    {mapControlsCollapsed && !atlasAssetPopupOpen && (
                      <button
                        type="button"
                        onClick={() => focusAtlasPanel('domains')}
                        className="absolute top-[76px] left-3 z-[530] flex items-center gap-2 rounded-xl border border-tj-gold/30 bg-[#071421]/94 px-3 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl transition hover:border-tj-gold/55 hover:bg-[#0b1d2d]"
                        aria-label="Show domain controls"
                        title="Show domain controls"
                      >
                        <PanelLeftOpen className="h-4 w-4 text-tj-gold" />
                        Domains
                      </button>
                    )}

                    {!atlasOverlayMode && atlasNetworkCarrier === 'gas' && (
                      <GasAtlasControls
                        hidden={mapControlsCollapsed || atlasAssetPopupOpen}
                        onCollapse={() => setMapControlsCollapsed(true)}
                        status={gasStatus}
                        loading={Boolean(gasDomainLoading) && gasDomainLoading !== 'Status'}
                        checking={gasDomainLoading === 'Status'}
                        loaded={Object.values(gasLoadedDomains).some(Boolean)}
                        empty={!gasFacilitiesData.length && !gasConnections.length}
                        error={gasDataError}
                        countryFilter={gasCountryFilter}
                        onCountryChange={handleGasCountryChange}
                        onReload={() => { gasInitializingRef.current = ''; initializeGasAtlas(); }}
                      />
                    )}

                    {!atlasOverlayMode && atlasNetworkCarrier === 'water' && (
                      <WaterAtlasControls
                        hidden={mapControlsCollapsed || atlasAssetPopupOpen}
                        onCollapse={() => setMapControlsCollapsed(true)}
                        status={waterStatus}
                        loading={Boolean(waterDomainLoading) && waterDomainLoading !== 'Status'}
                        checking={waterDomainLoading === 'Status'}
                        loaded={Object.values(waterLoadedDomains).some(Boolean)}
                        empty={!waterFacilitiesData.length && !waterConnections.length}
                        error={waterDataError}
                        countryFilter={waterCountryFilter}
                        onCountryChange={handleWaterCountryChange}
                        onReload={() => { waterInitializingRef.current = ''; initializeWaterAtlas(); }}
                      />
                    )}

                    {!atlasOverlayMode && atlasNetworkCarrier === 'liquids' && (
                      <LiquidsAtlasControls
                        hidden={mapControlsCollapsed || atlasAssetPopupOpen}
                        onCollapse={() => setMapControlsCollapsed(true)}
                        status={liquidsStatus}
                        loading={Boolean(liquidsDomainLoading) && liquidsDomainLoading !== 'Status'}
                        checking={liquidsDomainLoading === 'Status'}
                        loaded={Object.values(liquidsLoadedDomains).some(Boolean)}
                        empty={!liquidsFacilitiesData.length && !liquidsConnections.length}
                        error={liquidsDataError}
                        countryFilter={liquidsCountryFilter}
                        onCountryChange={handleLiquidsCountryChange}
                        onReload={() => { liquidsInitializingRef.current = ''; initializeLiquidsAtlas(); }}
                      />
                    )}

                    {!atlasOverlayMode && atlasNetworkCarrier === 'logistics' && (
                      <LogisticsAtlasControls
                        hidden={mapControlsCollapsed || atlasAssetPopupOpen}
                        onCollapse={() => setMapControlsCollapsed(true)}
                        status={logisticsStatus}
                        loading={Boolean(logisticsDomainLoading) && logisticsDomainLoading !== 'Status'}
                        checking={logisticsDomainLoading === 'Status'}
                        loaded={Object.values(logisticsLoadedDomains).some(Boolean)}
                        empty={!logisticsFacilitiesData.length && !logisticsConnections.length}
                        error={logisticsDataError}
                        countryFilter={logisticsCountryFilter}
                        onCountryChange={handleLogisticsCountryChange}
                        onReload={() => { logisticsInitializingRef.current = ''; initializeLogisticsAtlas(); }}
                      />
                    )}

                    {(atlasOverlayMode || atlasNetworkCarrier === 'electricity') && (
                    <aside
                      style={atlasAssetPopupOpen ? { display: 'none' } : undefined}
                      aria-hidden={mapControlsCollapsed}
                      inert={mapControlsCollapsed ? '' : undefined}
                      className={`absolute top-[76px] left-3 z-[510] w-[320px] max-w-[calc(100vw-1.5rem)] transition-all duration-200 ${mapControlsCollapsed ? '-translate-x-[110%] opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}
                    >
                      <div className="atlas-domain-panel rounded-xl overflow-hidden max-h-[calc(100vh-7.25rem)] flex flex-col">
                        <div className="atlas-domain-panel__header shrink-0 px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.16em] text-tj-slate">Workspace</p>
                            <p className="text-sm font-semibold text-white">
                              {ATLAS_IS_EMBEDDED
                                ? `${activeWorkspaceDefinition.label} controls`
                                : atlasOverlayMode ? 'Shared overlay controls' : 'Domain controls'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] px-2 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">Local</span>
                            <button
                              type="button"
                              onClick={() => setMapControlsCollapsed(true)}
                              className="h-7 w-7 rounded-lg border border-white/10 text-tj-slate transition hover:border-white/20 hover:bg-white/5 hover:text-white flex items-center justify-center"
                              aria-label="Hide domain controls"
                              title="Hide domain controls"
                            >
                              <PanelLeftClose className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden">
                        {(!ATLAS_IS_EMBEDDED || ['geography', 'operations'].includes(activeWorkspaceArea)) && (
                        <div className="px-3 py-3 border-b border-white/10">
                          {loadedPypsaNetworks.length > 1 && !solveNetworkStaging && !pypsaLoading && !pypsaResolutionSwitching ? (
                            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2.5">
                              <span className="h-7 w-7 shrink-0 rounded-lg bg-emerald-400/10 text-emerald-300 flex items-center justify-center">
                                <CheckCircle2 className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-xs font-semibold text-white">{loadedPypsaNetworks.length} networks ready</span>
                                <span className="block text-[9px] leading-3.5 text-tj-slate">Choose a country below to focus or change resolution.</span>
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={runPypsaBuildFromSettings}
                              disabled={solveNetworkStaging || pypsaLoading || pypsaResolutionSwitching}
                              title="Build the selected country network"
                              className="atlas-primary-action w-full text-xs font-semibold px-4 py-2.5 rounded-lg border border-tj-gold/40 bg-tj-gold text-tj-navy-dark transition hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {solveNetworkStaging || pypsaLoading || pypsaResolutionSwitching
                                ? 'Working…'
                                : ATLAS_IS_EMBEDDED && activeWorkspaceArea === 'operations'
                                  ? runMode === 'solve_existing' ? 'Solve Existing Network' : runMode === 'build_solve' ? 'Build + Solve Network' : 'Build Network'
                                  : atlasOverlayMode ? 'Build Power Network' : 'Build Network'}
                            </button>
                          )}
                        </div>
                        )}

                        {!ATLAS_IS_EMBEDDED && (
                          <AtlasWorkspaceRail
                            activeArea={activeWorkspaceArea}
                            onSelect={openAtlasWorkspaceArea}
                          />
                        )}

                        {atlasWorkspaceAreaIsVisible('geography', activeWorkspaceArea, ATLAS_IS_EMBEDDED) && (
                        <AtlasDomainSection
                          icon={MapPin}
                          title="Geography Domain"
                          summary={`${loadedCountrySummary} · ${selectedCachedNetworkLevel?.isFull || selectedCachedNetworkLevel?.isGeographic ? selectedCachedNetworkLevel.label : selectedCachedNetworkLevel ? `${selectedCachedNetworkLevel.label} nodes` : 'No cache'}`}
                          open={pypsaSectionOpen.geography}
                          onToggle={() => togglePypsaDomainSection('geography')}
                          compact={compactAtlasLayout || ATLAS_IS_EMBEDDED}
                        >
                          <div className="space-y-2.5">
                            <div className="block">
                              <span className="block mb-1 text-[10px] uppercase tracking-wider text-tj-slate">{atlasOverlayMode ? 'Countries · all overlay carriers' : 'Countries'}</span>
                              <div className="flex items-stretch gap-2">
                                <div className="relative min-w-0 flex-1">
                                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-tj-slate" />
                                  <select
                                    value={countryDropdownValue}
                                    onChange={(event) => addCountryNetwork(event.target.value)}
                                    disabled={pypsaLoading || pypsaResolutionSwitching || availablePypsaCountryOptions.length === 0}
                                    className="w-full pl-8 pr-2.5 py-2 rounded-lg bg-[#081523] border border-white/10 text-white focus:outline-none focus:border-tj-gold/50 disabled:opacity-50"
                                    aria-label="Add country network"
                                  >
                                  <option value="">{
                                    pypsaLoading || pypsaResolutionSwitching
                                      ? pypsaDomainLoading
                                        ? `Loading ${pypsaDomainLoading.toLowerCase()} layer…`
                                        : selectingAllCountries
                                          ? 'Loading all countries…'
                                        : countryDropdownValue
                                        ? `Loading ${countryCodeToName(countryDropdownValue)}…`
                                        : 'Switching network level…'
                                      : pypsaCatalogueLoading && availablePypsaCountryOptions.length === 0
                                        ? 'Loading countries…'
                                        : pypsaCatalogueError && availablePypsaCountryOptions.length === 0
                                          ? 'Countries unavailable — retrying…'
                                          : 'Add a country…'
                                  }</option>
                                  {availablePypsaCountryOptions.map((option) => (
                                    <option
                                      key={option.countryCode}
                                      value={option.countryCode}
                                      disabled={loadedPypsaCountryCodes.includes(option.countryCode)}
                                    >
                                      {option.countryName} ({option.countryCode})
                                    </option>
                                  ))}
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  onClick={selectAllCountryNetworks}
                                  disabled={pypsaLoading || pypsaResolutionSwitching || availablePypsaCountryOptions.length === 0 || allPypsaCountriesSelected}
                                  aria-label="Select all country networks"
                                  className="shrink-0 rounded-lg border border-tj-gold/30 bg-tj-gold/10 px-2.5 text-[10px] font-semibold text-tj-gold transition hover:bg-tj-gold/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-tj-slate disabled:opacity-70"
                                >
                                  {selectingAllCountries ? 'Loading…' : allPypsaCountriesSelected ? 'All selected' : 'Select all'}
                                </button>
                              </div>
                            </div>
                            {(pypsaLoading || pypsaResolutionSwitching) && (
                              <div role="status" aria-live="polite" className="rounded-lg border border-sky-300/15 bg-sky-300/[0.05] px-2.5 py-2 text-[9px] leading-relaxed text-sky-100/80">
                                {pypsaDomainLoading
                                  ? `Loading ${pypsaDomainLoading.toLowerCase()} for the selected countries. The current map stays visible until all layers are ready.`
                                  : selectingAllCountries
                                  ? `Loading all ${availablePypsaCountryOptions.length} country networks in parallel. The current map stays visible until the complete selection is ready.`
                                  : countryDropdownValue
                                  ? `Loading ${countryCodeToName(countryDropdownValue)} from its local cache. Controls unlock automatically when parsing finishes.`
                                  : 'Loading the selected resolution. The current map stays visible until every country is ready.'}
                                <AtlasBatchProgress progress={pypsaBatchProgress} onCancel={cancelPyPSAMapBatch} />
                              </div>
                            )}
                            {pypsaCatalogueError && (
                              <div role="status" aria-live="polite" aria-label="Country catalogue status" className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-2 text-[9px] text-amber-100">
                                <span className="min-w-0">{pypsaCatalogueUsingCache && availablePypsaCountryOptions.length
                                  ? 'Showing the saved country catalogue. Live network loading will resume after reconnecting.'
                                  : 'Local country catalogue unavailable. Retrying while this tab is active…'}</span>
                                <button
                                  type="button"
                                  onClick={() => loadPyPSAFiles(pypsaGranularity)}
                                  disabled={pypsaCatalogueLoading}
                                  className="shrink-0 rounded-md border border-amber-200/25 px-2 py-1 font-semibold transition hover:bg-amber-200/10 disabled:opacity-50"
                                >
                                  {pypsaCatalogueLoading ? 'Retrying…' : 'Retry now'}
                                </button>
                              </div>
                            )}
                            <LoadedCountryList networks={loadedPypsaNetworks} activeCountryCode={activePypsaCountryCode}
                              showResolution={Boolean(mixedGranularityPlan)}
                              disabled={pypsaLoading || pypsaResolutionSwitching}
                              onActivate={activateCountryNetwork} onRemove={removeCountryNetwork}
                            />
                            <label className="block">
                              <span className="block mb-1 text-[10px] uppercase tracking-wider text-tj-slate">Place drill-down</span>
                              <div className="flex gap-1.5">
                                <input
                                  value={geographyDrilldown}
                                  onChange={(event) => setGeographyDrilldown(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                                      event.preventDefault();
                                      runGeographyDrilldown();
                                    }
                                  }}
                                  disabled={!loadedPypsaCountryCodes.length || mapAgentBusy || pypsaResolutionSwitching}
                                  className="min-w-0 flex-1 px-2.5 py-2 rounded-lg bg-black/20 border border-white/10 text-white focus:outline-none focus:border-tj-gold/50 disabled:opacity-50"
                                  placeholder={loadedPypsaCountryCodes.length ? 'City, town, zone…' : 'Select a country first'}
                                  aria-label="Place drill-down"
                                />
                                <button
                                  type="button"
                                  onClick={runGeographyDrilldown}
                                  disabled={!geographyDrilldown.trim() || !loadedPypsaCountryCodes.length || mapAgentBusy || pypsaResolutionSwitching}
                                  className="h-9 w-9 shrink-0 rounded-lg border border-tj-gold/35 bg-tj-gold/10 text-tj-gold flex items-center justify-center disabled:opacity-40"
                                  aria-label="Find place in selected countries"
                                  title="Ask EMIL to find this place"
                                >
                                  <Search className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <span className="mt-1 block text-[10px] leading-4 text-tj-slate">EMIL resolves ambiguous places only within the selected countries.</span>
                            </label>
                            {geographyLoadError && (
                              <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-2 text-[10px] leading-4 text-red-200">
                                {geographyLoadError}
                              </div>
                            )}
                            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <span className="block text-[10px] uppercase tracking-wider text-tj-slate">{atlasOverlayMode ? 'Power network resolution' : 'Network resolution'}</span>
                                  <span className="block mt-0.5 text-[10px] text-tj-slate">{atlasOverlayMode ? 'Other carriers retain their source topology.' : 'Geographic and access-node caches'}</span>
                                </div>
                                <span className="shrink-0 rounded-lg border border-tj-gold/30 bg-tj-gold/10 px-2 py-1 text-sm font-semibold text-tj-gold">
                                  {(pypsaResolutionSwitching || networkResolutionSelectionPending) && !pypsaDomainLoading
                                    ? `Switching to ${displayedCachedNetworkLevel?.label || 'network'}…`
                                    : mixedGranularityPlan ? 'Mixed TSO' : selectedCachedNetworkLevel?.label || 'N/A'}
                                </span>
                              </div>
                              {cachedNetworkLevels.length > 1 ? (
                                <>
                                  <input
                                    type="range"
                                    min={0}
                                    max={cachedNetworkLevels.length - 1}
                                    step={1}
                                    value={displayedCachedNetworkIndex}
                                    disabled={pypsaLoading || pypsaResolutionSwitching}
                                    onChange={(event) => previewCachedNetworkLevel(Number(event.target.value))}
                                    className="mt-3 w-full accent-tj-gold disabled:opacity-50"
                                    aria-label="Network resolution"
                                    aria-valuetext={mixedGranularityPlan ? 'Mixed TSO resolution' : displayedCachedNetworkLevel?.label || 'No network resolution selected'}
                                  />
                                  <div className="mt-1 flex gap-2 overflow-x-auto pb-1 scrollbar-hidden">
                                    {cachedNetworkLevels.map((level, index) => (
                                      <button
                                        type="button"
                                        key={level.filename}
                                        onClick={() => commitCachedNetworkLevel(index)}
                                        disabled={pypsaLoading || pypsaResolutionSwitching}
                                        title={level.label}
                                        className={`shrink-0 text-[9px] text-center ${!mixedGranularityPlan && index === displayedCachedNetworkIndex ? 'text-tj-gold font-semibold' : 'text-tj-slate hover:text-white'}`}
                                      >
                                        {level.isFullNodal ? 'Nodal' : level.label === 'Bidding zone' ? 'Bidding' : level.label}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <p className="mt-3 text-[11px] text-tj-slate">
                                  {cachedNetworkLevels.length === 1 ? 'Only one network resolution is cached for this country.' : 'Select a country to see its cached network resolutions.'}
                                </p>
                              )}
                              <MixedGranularityControls
                                countryOptions={availablePypsaCountryOptions}
                                activeCountryCode={activePypsaCountryCode}
                                activePlan={mixedGranularityPlan}
                                busy={pypsaLoading || pypsaResolutionSwitching}
                                onApply={applyMixedGranularityView}
                              />
                            </div>
                          </div>
                        </AtlasDomainSection>
                        )}

                        {nohmWorkspaceContext?.mode === 'model'
                          && atlasWorkspaceAreaIsVisible('geography', activeWorkspaceArea, ATLAS_IS_EMBEDDED) && (
                          <section className="border-t border-white/10 px-3 py-3" aria-label="Model Results">
                            <div className="mb-2.5 flex items-start gap-2">
                              <span className="atlas-domain-section__icon is-active"><BarChart3 className="h-4 w-4" /></span>
                              <span className="min-w-0 flex-1">
                                <span className="atlas-domain-section__eyebrow">Model workspace</span>
                                <span className="atlas-domain-section__title">Results</span>
                                <span className="atlas-domain-section__summary">Existing solved outputs on the loaded topology</span>
                              </span>
                            </div>
                            <ModelResultsControls
                              catalogStatus={modelResultCatalogStatus}
                              selection={modelResultSelection}
                              resultStatus={modelResultStatus}
                              onSelectionChange={setModelResultSelection}
                              onShow={showSelectedModelResult}
                              onClear={clearModelResult}
                            />
                          </section>
                        )}

                        {atlasWorkspaceAreaIsVisible('operations', activeWorkspaceArea, ATLAS_IS_EMBEDDED) && (
                        <AtlasDomainSection
                          icon={Cog}
                          title={atlasOverlayMode ? 'Power Operations' : 'Operations Domain'}
                          summary={`${runMode === 'build_only' ? 'Build only' : runMode === 'solve_existing' ? 'Solve existing' : 'Build + solve'} · HiGHS ${pypsaSettings.solver_method}`}
                          open={pypsaSectionOpen.operations}
                          onToggle={() => togglePypsaDomainSection('operations')}
                          compact={compactAtlasLayout || ATLAS_IS_EMBEDDED}
                        >
                          <div className="space-y-3">
                            <div>
                              <span className="block mb-1 text-[10px] uppercase tracking-wider text-tj-slate">Run mode</span>
                              <div className="space-y-1">
                                {[['build_only', 'Build only'], ['build_solve', 'Build + solve'], ['solve_existing', 'Solve existing']].map(([value, label]) => (
                                  <button key={value} type="button" onClick={() => { setRunMode(value); updatePypsaSetting('build_only', value === 'build_only'); }} className={`w-full flex items-center justify-between rounded-lg border px-2.5 py-2 ${runMode === value ? 'border-tj-gold/45 bg-tj-gold/10 text-white' : 'border-white/10 text-tj-slate hover:text-white'}`}><span>{label}</span>{runMode === value && <Check className="h-3.5 w-3.5 text-tj-gold" />}</button>
                                ))}
                              </div>
                            </div>
                            <label className="block">
                              <span className="block mb-1 text-[10px] uppercase tracking-wider text-tj-slate">Temporal resolution</span>
                              <select value={String(pypsaSettings.snapshot_resolution)} onChange={(e) => updatePypsaSetting('snapshot_resolution', e.target.value)} className="w-full px-2 py-2 rounded-lg bg-[#081523] border border-white/10 text-white">
                                <option value="monthly">Monthly</option><option value="1h">Hourly</option><option value="3h">3 hourly</option><option value="6h">6 hourly</option><option value="24h">Daily</option>
                              </select>
                            </label>
                            <label className="block">
                              <span className="block mb-1 text-[10px] uppercase tracking-wider text-tj-slate">HiGHS algorithm</span>
                              <select value={String(pypsaSettings.solver_method)} onChange={(e) => updatePypsaSetting('solver_method', e.target.value)} className="w-full px-2 py-2 rounded-lg bg-[#081523] border border-white/10 text-white">
                                <option value="simplex">Dual simplex — recommended</option>
                                <option value="hipo">HiPO interior point + crossover</option>
                                <option value="pdlp">cuPDLP-C — experimental</option>
                              </select>
                            </label>
                            <div className="grid grid-cols-3 gap-1 text-[10px]">
                              <div className="rounded-lg border border-white/10 bg-black/20 p-2"><span className="block text-tj-slate">Algorithm</span><span className="text-white">{pypsaSettings.solver_method}</span></div>
                              <div className="rounded-lg border border-white/10 bg-black/20 p-2"><span className="block text-tj-slate">Threads</span><span className="text-white">{pypsaSettings.solver_threads}</span></div>
                              <div className="rounded-lg border border-white/10 bg-black/20 p-2"><span className="block text-tj-slate">Limit</span><span className="text-white">{pypsaSettings.solver_time_limit}s</span></div>
                            </div>
                            {(pypsaFacilitiesData.length > 0 || pypsaConnections.length > 0) && !regionPanelVisible && loadedPypsaNetworks.length <= 1 && (
                              <button type="button" onClick={openRegionPanelFromCurrentView} className="w-full py-2 rounded-lg border border-tj-gold/40 text-tj-gold hover:bg-tj-gold/10">Solve current map region</button>
                            )}
                            {loadedPypsaNetworks.length > 1 && (
                              <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[10px] leading-4 text-tj-slate">
                                Multi-country viewing is active. Regional solves remain single-source and can be connected to Nohm's existing workflow later.
                              </div>
                            )}
                            {regionPanelVisible && (
                              <PypsaRegionSolveControls
                                sourceDirname={selectedPyPSAFile}
                                center={regionCenter}
                                onClearCenter={() => { setRegionCenter(null); setRegionManifest(null); setRegionError(null); setRegionS3Folder(''); setRegionDirname(''); setRegionSourceDirname(''); setRegionOpsMessage(''); }}
                                radiusKm={regionRadiusKm}
                                onRadiusChange={setRegionRadiusKm}
                                radiusLocked={!!regionManifest}
                                canSolve={!!regionCenter && !!selectedPyPSAFile && !regionManifest}
                                solving={regionSolving}
                                onSolve={solveRegion}
                                manifest={regionManifest}
                                error={regionError}
                                currentRegionDirname={resolvedRegionDirname}
                                onSaveCurrentRun={saveCurrentRegionRun}
                                savingCurrentRun={regionSaveBusy}
                                opsMessage={regionOpsMessage}
                                onClose={closeRegionPanel}
                              />
                            )}
                          </div>
                        </AtlasDomainSection>
                        )}

                        {atlasWorkspaceAreaIsVisible('filters', activeWorkspaceArea, ATLAS_IS_EMBEDDED) && (
                        <AtlasDomainSection
                          icon={SlidersHorizontal}
                          title={atlasOverlayMode ? 'Power carrier filters' : 'Atlas Domains'}
                          summary={pypsaFacilitiesData.length ? `${hiddenCarriers.size} carrier filters${showGenerationMix && pypsaHasGenerationMixData ? ' · Mix on' : ''}` : 'Carrier filters and map display'}
                          open={pypsaSectionOpen.filters}
                          onToggle={() => togglePypsaDomainSection('filters')}
                          compact={compactAtlasLayout || ATLAS_IS_EMBEDDED}
                        >
                          {pypsaFacilitiesData.length === 0 ? (
                            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-tj-slate">Load a local network to enable domain filters.</div>
                          ) : (() => {
                            const realFacilities = pypsaFacilitiesData.filter((facility) => !facility.is_virtual);
                            const query = carrierLegendQuery.trim().toLowerCase();
                            const entryMap = new Map();
                            realFacilities.forEach((facility) => {
                              const domain = classifyAtlasMapDomain(facility);
                              const carrier = String(facility.carrier_key || facility.type || 'unknown');
                              const token = atlasCarrierFilterKey(facility);
                              const previous = entryMap.get(token);
                              if (previous) {
                                previous.count += 1;
                              } else {
                                entryMap.set(token, {
                                  token,
                                  domain,
                                  carrier,
                                  label: String(facility.carrier_nice_name || facility.carrier || carrier),
                                  color: facility.carrier_color || '#6b7280',
                                  count: 1,
                                });
                              }
                            });
                            const entries = [...entryMap.values()]
                              .filter((entry) => !query || entry.label.toLowerCase().includes(query) || entry.domain.toLowerCase().includes(query))
                              .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
                            return (
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => pypsaHasGenerationMixData && setShowGenerationMix((previous) => !previous)}
                                  aria-pressed={showGenerationMix && pypsaHasGenerationMixData}
                                  disabled={!pypsaHasGenerationMixData}
                                  className={`w-full flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left ${!pypsaHasGenerationMixData ? 'cursor-not-allowed border-white/5 bg-black/10 opacity-55' : showGenerationMix ? 'border-tj-gold/45 bg-tj-gold/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
                                >
                                  <span>
                                    <span className="block text-[11px] font-medium text-white">Generation mix pies</span>
                                    <span className="block mt-0.5 text-[9px] leading-3 text-tj-slate">
                                      {pypsaHasGenerationMixData
                                        ? 'Dispatch when solved; otherwise installed MW'
                                        : 'Unavailable: this network contains topology only'}
                                    </span>
                                  </span>
                                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${showGenerationMix && pypsaHasGenerationMixData ? 'bg-tj-gold' : 'bg-white/15'}`}>
                                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showGenerationMix && pypsaHasGenerationMixData ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                                  </span>
                                </button>
                                <input value={carrierLegendQuery} onChange={(e) => setCarrierLegendQuery(e.target.value)} placeholder="Search domains or carriers" className="w-full px-2.5 py-2 rounded-lg bg-black/20 border border-white/10 text-white focus:outline-none focus:border-tj-gold/50" />
                                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                                  {ATLAS_MAP_DOMAINS.map((domain) => {
                                    const items = entries.filter((entry) => entry.domain === domain);
                                    const collapsed = collapsedCarrierLegendGroups[domain] ?? (domain !== 'Supply');
                                    if (!items.length && query) return null;
                                    return (
                                      <div key={domain} className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
                                        <button type="button" onClick={() => setCollapsedCarrierLegendGroups((previous) => ({ ...previous, [domain]: !collapsed }))} className="w-full flex items-center justify-between px-2.5 py-2 text-left">
                                          <span className="text-[10px] uppercase tracking-wider text-tj-slate">{domain} carriers</span>
                                          <span className="text-[10px] text-tj-slate">{items.length} {collapsed ? '▸' : '▾'}</span>
                                        </button>
                                        {!collapsed && (
                                          <div className="px-1.5 pb-1.5 space-y-0.5">
                                            {items.map((entry) => {
                                              const hidden = hiddenCarriers.has(entry.token);
                                              return (
                                                <button key={entry.token} type="button" onClick={() => setHiddenCarriers((previous) => { const next = new Set(previous); if (next.has(entry.token)) next.delete(entry.token); else next.add(entry.token); return next; })} className={`w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-white/5 ${hidden ? 'opacity-45' : ''}`}>
                                                  <span className="h-3 w-3 rounded-[3px] border border-white/20" style={{ backgroundColor: hidden ? 'transparent' : entry.color }} />
                                                  <span className={`truncate ${hidden ? 'line-through text-tj-slate' : 'text-tj-gray'}`}>{entry.label}</span>
                                                  <span className="ml-auto text-[10px] text-tj-slate">{hidden ? 0 : entry.count}/{entry.count}</span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </AtlasDomainSection>
                        )}

                        {atlasWorkspaceAreaIsVisible('clusters', activeWorkspaceArea, ATLAS_IS_EMBEDDED) && (
                        <AtlasDomainSection
                          icon={Layers}
                          title="Regional clustering"
                          summary={regionalClusterOverlay
                            ? `NUTS ${regionalClusterOverlay.meta?.level || 2} · ${Number(regionalClusterOverlay.meta?.mapped_regions || 0).toLocaleString()} regions`
                            : 'Eurostat regional typology'}
                          open={pypsaSectionOpen.clusters}
                          onToggle={() => togglePypsaDomainSection('clusters')}
                          compact={compactAtlasLayout || ATLAS_IS_EMBEDDED}
                          retain
                        >
                          <RegionalClusteringControls
                            countryCodes={activeLandCountryCodes}
                            onOverlayChange={setRegionalClusterOverlay}
                          />
                        </AtlasDomainSection>
                        )}
                        </div>

                        {(!ATLAS_IS_EMBEDDED || ['geography', 'operations'].includes(activeWorkspaceArea)) && (
                        <div className="atlas-domain-panel__footer shrink-0 px-3 py-3 border-t border-white/10 bg-[#071421]/98">
                          <button
                            type="button"
                            onClick={() => setShowPypsaSettingsDialog(true)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/15 text-tj-gray hover:text-white hover:bg-white/5"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            {atlasOverlayMode ? 'More Settings · Power' : 'More Settings'}
                          </button>
                        </div>
                        )}

                      </div>
                    </aside>
                    )}

                    {(() => {
                      const isGas = atlasNetworkCarrier === 'gas';
                      const isWater = atlasNetworkCarrier === 'water';
                      const isLiquids = atlasNetworkCarrier === 'liquids';
                      const isLogistics = atlasNetworkCarrier === 'logistics';
                      const overlayAvailableCarriers = atlasOverlayCarriers.filter(
                        (carrier) => atlasOverlayCarrierInventory[carrier]?.loaded,
                      );
                      const overlayFacilitiesByCarrier = Object.fromEntries(
                        ATLAS_NETWORK_CARRIER_ORDER.map((carrier) => [
                          carrier,
                          atlasOverlayRecordsByCarrier[carrier]?.facilities || [],
                        ])
                      );
                      const overlayDomainLoaded = (carrier, domain) => {
                        if (carrier === 'electricity') return loadedPypsaNetworks.length > 0 && loadedPypsaNetworks.every((network) => pypsaLoadedDomainsByNetwork[network.filename]?.[domain]);
                        if (carrier === 'gas') return Boolean(gasLoadedDomains[domain]);
                        if (carrier === 'water') return Boolean(waterLoadedDomains[domain]);
                        if (carrier === 'liquids') return Boolean(liquidsLoadedDomains[domain]);
                        return Boolean(logisticsLoadedDomains[domain]);
                      };
                      const overlayDomainLoading = (domain) => atlasOverlayCarriers.some((carrier) => (
                        carrier === 'electricity'
                          ? pypsaDomainLoading === domain
                          : carrier === 'gas'
                            ? gasDomainLoading === domain
                            : carrier === 'water'
                              ? waterDomainLoading === domain
                              : carrier === 'liquids'
                                ? liquidsDomainLoading === domain
                                : logisticsDomainLoading === domain
                      ));
                      const overlayAnyLoading = Boolean(pypsaDomainLoading || gasDomainLoading || waterDomainLoading || liquidsDomainLoading || logisticsDomainLoading);
                      const isInfrastructure = atlasOverlayMode || isGas || isWater || isLiquids || isLogistics;
                      const isModelScene = nohmWorkspaceContext?.mode === 'model' && Boolean(nohmWorkspaceContext?.projectId);
                      const carrierFacilities = atlasOverlayMode
                        ? overlayAvailableCarriers.flatMap((carrier) => overlayFacilitiesByCarrier[carrier] || [])
                        : isGas ? gasFacilitiesData : isWater ? waterFacilitiesData : isLiquids ? liquidsFacilitiesData : isLogistics ? logisticsFacilitiesData : pypsaFacilitiesData;
                      const infrastructureStatus = atlasOverlayMode ? { available: overlayAvailableCarriers.length > 0 } : isGas ? gasStatus : isWater ? waterStatus : isLiquids ? liquidsStatus : logisticsStatus;
                      const infrastructureLoadedDomains = atlasOverlayMode
                        ? ATLAS_MAP_DOMAINS.reduce((next, domain) => ({ ...next, [domain]: overlayAvailableCarriers.length > 0 && overlayAvailableCarriers.every((carrier) => overlayDomainLoaded(carrier, domain)) }), {})
                        : isGas ? gasLoadedDomains : isWater ? waterLoadedDomains : isLiquids ? liquidsLoadedDomains : logisticsLoadedDomains;
                      const infrastructureLoading = atlasOverlayMode ? '' : isGas ? gasDomainLoading : isWater ? waterDomainLoading : isLiquids ? liquidsDomainLoading : logisticsDomainLoading;
                      const realFacilities = carrierFacilities.filter((facility) => !facility.is_virtual);
                      const domainCounts = ATLAS_MAP_DOMAINS.reduce((accumulator, domain) => {
                        accumulator[domain] = realFacilities.filter((facility) => classifyAtlasMapDomain(facility) === domain).length;
                        return accumulator;
                      }, {});
                      const showElectricityAvailability = !isInfrastructure || (atlasOverlayMode && overlayAvailableCarriers.includes('electricity'));
                      const unavailableByDomain = Object.fromEntries(ATLAS_MAP_DOMAINS.map((domain) => [domain,
                        !showElectricityAvailability ? [] : loadedPypsaNetworks.filter((network) => network.domainAvailability?.[domain]?.unavailable),
                      ]));
                      const coverageWarnings = ATLAS_MAP_DOMAINS.filter((domain) => atlasDomainVisibility[domain] !== false && unavailableByDomain[domain].length > 0);
                      const demandVisible = showElectricityAvailability && atlasDomainVisibility.Demand !== false;
                      const provisionalDemand = demandVisible ? loadedPypsaNetworks.filter((network) => network.domainAvailability?.Demand?.provisional) : [];
                      const missingDemandComposition = demandVisible ? loadedPypsaNetworks.filter((network) => network.domainAvailability?.Demand?.compositionUnavailable) : [];
                      const demandAnnualTotals = [...new Set(provisionalDemand.map((network) => network.domainAvailability.Demand.annualDemandGwh).filter((value) => typeof value === 'number' && Number.isFinite(value)))];
                      const demandProxies = [...new Set(provisionalDemand.map((network) => network.domainAvailability.Demand.spatialProxy).filter(Boolean))];
                      return (
                        <div
                          style={compactAtlasLayout && (!mapControlsCollapsed || mapAgentOpen || atlasAssetPopupOpen || landOverlay.panelOpen || gridAccessOverlay.panelOpen || (atlasOverlayMode && atlasOverlayPanelOpen)) ? { display: 'none' } : undefined}
                          className={`pointer-events-none absolute z-[515] flex justify-center transition-[left,right] duration-200 ${compactAtlasLayout ? 'top-[124px] left-3 right-[104px]' : `top-[76px] left-3 right-[140px] ${mapControlsCollapsed ? 'sm:left-3' : 'sm:left-[344px]'} ${landOverlay.panelOpen || gridAccessOverlay.panelOpen ? 'sm:right-[428px]' : atlasOverlayMode ? atlasOverlayPanelOpen ? 'sm:right-[408px]' : 'sm:right-[260px]' : 'sm:right-[140px]'}`}`}
                        >
                          <div className="pointer-events-auto max-w-full rounded-xl border border-white/10 bg-[#071421]/92 p-1.5 backdrop-blur-xl shadow-2xl">
                            <div role="group" aria-label="Map layers and display" className="flex flex-wrap items-stretch justify-center gap-1">
                              {ATLAS_MAP_DOMAINS.map((domain) => {
                                const modelDomainSupported = !isModelScene || isModelSceneDomain(domain);
                                const hasNetworks = isInfrastructure ? Boolean(infrastructureStatus?.available) : loadedPypsaNetworks.length > 0;
                                const loaded = isInfrastructure
                                  ? Boolean(infrastructureLoadedDomains[domain])
                                  : hasNetworks && loadedPypsaNetworks.every(
                                    (network) => pypsaLoadedDomainsByNetwork[network.filename]?.[domain]
                                  );
                                const visible = loaded && atlasDomainVisibility[domain] !== false;
                                const loading = isModelScene
                                  ? modelSceneStatus.state === 'loading' && atlasDomainVisibility[domain] !== false
                                  : atlasOverlayMode
                                    ? overlayDomainLoading(domain)
                                    : (isInfrastructure ? infrastructureLoading : pypsaDomainLoading) === domain;
                                const status = loading
                                  ? 'Loading…'
                                  : !modelDomainSupported
                                    ? 'Not available'
                                  : loaded
                                    ? unavailableByDomain[domain].length === loadedPypsaNetworks.length && !isInfrastructure
                                      ? 'No data'
                                      : `${domainCounts[domain] || 0}${unavailableByDomain[domain].length ? ' · partial' : ''}`
                                    : domain === 'Grid' && !hasNetworks
                                      ? 'No network'
                                      : 'Load';
                                return (
                                  <button
                                    key={domain}
                                    type="button"
                                    onClick={() => handleAtlasDomainSelection(domain)}
                                    disabled={!hasNetworks || !modelDomainSupported || Boolean(
                                      isModelScene
                                        ? modelSceneStatus.state === 'loading'
                                        : atlasOverlayMode
                                          ? overlayAnyLoading
                                          : isInfrastructure ? infrastructureLoading : pypsaDomainLoading
                                    ) || (!isInfrastructure && pypsaResolutionSwitching)}
                                    aria-pressed={visible}
                                    aria-label={`${domain} map layer`}
                                    title={loaded ? `${visible ? 'Hide' : 'Show'} ${domain.toLowerCase()} layer` : `Load ${domain.toLowerCase()} data`}
                                    className={`group min-w-[76px] rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${visible ? 'border-tj-gold/50 bg-tj-gold/12 shadow-[0_0_14px_rgba(250,204,21,0.08)]' : loaded ? 'border-white/10 bg-black/25 opacity-60 hover:opacity-90' : 'border-transparent bg-white/[0.035] hover:border-tj-gold/30'} disabled:opacity-40`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse bg-sky-400' : visible ? 'bg-tj-gold' : loaded ? 'bg-slate-500' : 'bg-white/25'}`} />
                                      <span className={`text-[9px] uppercase tracking-[0.12em] ${visible ? 'text-white' : 'text-tj-slate'}`}>{domain}</span>
                                    </span>
                                    <span className={`mt-0.5 block text-[9px] ${visible ? 'text-tj-gold' : 'text-tj-slate'}`}>{status}</span>
                                  </button>
                                );
                              })}
                              <div className="flex min-h-[36px] items-stretch gap-1">
                              <span className="mx-0.5 hidden w-px shrink-0 bg-white/10 xl:block" aria-hidden="true" />
                              <button
                                type="button"
                                onClick={() => setShowMapNodes((visible) => !visible)}
                                aria-pressed={showMapNodes}
                                aria-label="Node markers"
                                title={showMapNodes ? 'Hide node markers' : 'Show node markers'}
                                className={`group min-w-[36px] xl:min-w-[76px] rounded-lg border px-2.5 py-1.5 text-left transition-colors ${showMapNodes ? 'border-sky-300/35 bg-sky-300/10' : 'border-white/10 bg-black/25 opacity-65 hover:opacity-95'}`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <CircleDot className={`h-3 w-3 ${showMapNodes ? 'text-sky-300' : 'text-slate-500'}`} />
                                  <span className={`hidden xl:inline text-[9px] uppercase tracking-[0.12em] ${showMapNodes ? 'text-white' : 'text-tj-slate'}`}>Nodes</span>
                                </span>
                                <span className={`mt-0.5 hidden xl:block text-[9px] ${showMapNodes ? 'text-sky-200' : 'text-tj-slate'}`}>{showMapNodes ? 'Shown' : 'Hidden'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowGeographicBoundaries((visible) => !visible)}
                                aria-pressed={showGeographicBoundaries}
                                aria-label="Geographic boundaries"
                                title={showGeographicBoundaries ? 'Hide geographic boundaries' : 'Show geographic boundaries'}
                                className={`group min-w-[36px] xl:min-w-[88px] rounded-lg border px-2.5 py-1.5 text-left transition-colors ${showGeographicBoundaries ? 'border-sky-300/35 bg-sky-300/10' : 'border-white/10 bg-black/25 opacity-65 hover:opacity-95'}`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <Globe className={`h-3 w-3 ${showGeographicBoundaries ? 'text-sky-300' : 'text-slate-500'}`} />
                                  <span className={`hidden xl:inline text-[9px] uppercase tracking-[0.12em] ${showGeographicBoundaries ? 'text-white' : 'text-tj-slate'}`}>Boundaries</span>
                                </span>
                                <span className={`mt-0.5 hidden xl:block text-[9px] ${showGeographicBoundaries ? 'text-sky-200' : 'text-tj-slate'}`}>{showGeographicBoundaries ? 'Shown' : 'Hidden'}</span>
                              </button>
                              </div>
                            </div>
                            {mapRenderStats.generationSitesInView > mapRenderStats.generationSitesRendered && (
                              <p role="status" className="mt-1.5 max-w-lg rounded-lg border border-sky-300/20 bg-[#071421] px-2.5 py-1.5 text-xs text-sky-100">
                                Generation overview: {mapRenderStats.generationSitesRendered} of {mapRenderStats.generationSitesInView} sites in view. Country and area coverage first, then capacity; all available regional generation sites retained. Zoom in for more sites.
                              </p>
                            )}
                            {(coverageWarnings.length > 0 || provisionalDemand.length > 0 || missingDemandComposition.length > 0) && (
                              <details className="mt-1.5 max-w-lg rounded-lg border border-amber-300/20 bg-amber-300/5 px-2.5 py-1.5 text-xs leading-relaxed text-amber-100">
                                <summary className="cursor-pointer" aria-live="polite">
                                  {[
                                    provisionalDemand.length ? 'Demand: provisional estimates' : '',
                                    coverageWarnings.length ? `Data gaps: ${coverageWarnings.map((domain) => `${domain} (${unavailableByDomain[domain].length}/${loadedPypsaNetworks.length} countries)`).join(', ')}` : '',
                                    missingDemandComposition.length ? `Sector breakdown missing (${missingDemandComposition.length} ${missingDemandComposition.length === 1 ? 'country' : 'countries'})` : '',
                                  ].filter(Boolean).join(' · ')}
                                </summary>
                                <div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
                                  {provisionalDemand.length > 0 && (
                                    <p>
                                      Provisional electricity demand, not measured consumption.
                                      {demandAnnualTotals.length === 1 ? ` ${demandAnnualTotals[0].toLocaleString()} GWh per country per year.` : ' Spatial allocation uses country control totals.'}
                                      {' '}Flat 8,760-hour profile. Sector shares use national ETM data where available, not observed bus-level end use.
                                      {demandProxies.length > 0 && <span className="mt-1 block">Spatial sources: {demandProxies.join('; ')}.</span>}
                                    </p>
                                  )}
                                  {missingDemandComposition.length > 0 && (
                                    <p>
                                      Sector/subsector breakdown unavailable for {missingDemandComposition.map((network) => network.countryName).join(', ')}.
                                      {' '}Their provisional total demand remains visible; no other country's sector shares were substituted.
                                    </p>
                                  )}
                                  {coverageWarnings.map((domain) => (
                                    <p key={domain}>
                                      {domain} data unavailable for {unavailableByDomain[domain].length} of {loadedPypsaNetworks.length} selected countries.
                                      {' '}{unavailableByDomain[domain][0].domainAvailability[domain].reason}. Missing data is not zero {domain.toLowerCase()}.
                                      <span className="mt-1 block text-amber-100/80">{unavailableByDomain[domain].map((network) => network.countryName).join(', ')}</span>
                                    </p>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {atlasOverlayMode && (getFilteredFacilities().length > 0 || getVisibleConnections().length > 0) && (
                      <div className={`absolute bottom-3 left-3 right-[58px] sm:right-auto z-[510] min-w-0 sm:min-w-[430px] sm:max-w-[calc(100vw-740px)] rounded-xl border border-tj-gold/25 bg-[#071421]/92 backdrop-blur-xl shadow-2xl px-3 py-2 transition-[left] duration-200 ${mapControlsCollapsed ? 'sm:left-3' : 'sm:left-[344px]'}`}>
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1.5 text-[11px]">
                          <div className="flex items-center gap-2 pr-3 border-r border-white/10">
                            <span className="h-2 w-2 rounded-full bg-tj-gold shadow-[0_0_10px_rgba(250,204,21,0.65)]" />
                            <span role="status" className="font-semibold text-white">{pypsaBatchProgress ? `Updating network ${pypsaBatchProgress.completed}/${pypsaBatchProgress.total}` : mapRenderStats.renderError ? 'Map drawing failed' : mapRenderStats.renderingLinks ? 'Drawing network…' : 'Multi-network overlay ready'}</span>
                            {pypsaBatchProgress && <button type="button" aria-label="Cancel pending network load" onClick={cancelPyPSAMapBatch} className="min-h-[32px] rounded border border-sky-200/30 px-2 text-sky-100 hover:bg-white/10">Cancel</button>}
                          </div>
                          <span className="text-tj-slate">Loaded systems <strong className="ml-1 text-white font-semibold">{atlasOverlayCarriers.filter((carrier) => atlasOverlayCarrierInventory[carrier]?.loaded).length}</strong></span>
                          <span className="text-tj-slate">Loaded assets <strong className="ml-1 text-white font-semibold">{getFilteredFacilities().length.toLocaleString()}</strong></span>
                          <span className="text-tj-slate">Loaded links <strong className="ml-1 text-white font-semibold">{getVisibleConnections().length.toLocaleString()}</strong></span>
                          <span className="text-tj-slate" title="All drawable selected links in the viewport plus a 10% pan buffer. Off-screen links remain loaded.">Rendered links <strong aria-label="Rendered network links" className="ml-1 text-white font-semibold">{mapRenderStats.renderedLinks.toLocaleString()}</strong></span>
                          {mapRenderStats.overviewLines && <span className="text-sky-200" title="Every selected link is drawn in one lightweight overview canvas. Zoom in to restore individual line hover and click inspection.">Overview canvas · zoom in to inspect</span>}
                          {mapRenderStats.unmappedLinks > 0 && <span className="text-amber-200" title="These loaded links have no drawable line: coordinates may coincide, or route/endpoints may be missing. Their records remain loaded.">Undrawn links <strong>{mapRenderStats.unmappedLinks.toLocaleString()}</strong></span>}
                          {mapRenderStats.renderError && <span role="alert" className="text-amber-200">{mapRenderStats.renderError}</span>}
                        </div>
                      </div>
                    )}

                    {atlasOverlayMode && getFilteredFacilities().length === 0 && getVisibleConnections().length === 0 && (() => {
                      const empty = overlayEmptyState({ countryCount: atlasOverlayCountryCodes.length,
                        carriers: atlasOverlayCarriers, inventory: atlasOverlayCarrierInventory,
                        records: atlasOverlayRecordsByCarrier,
                        visibleDomainCount: ATLAS_MAP_DOMAINS.filter(domain => atlasDomainVisibility[domain] !== false).length });
                      return <div role="status" aria-label="Empty network overlay" className={`absolute bottom-3 left-3 right-[58px] sm:max-w-[420px] z-[510] rounded-xl border border-amber-300/25 bg-[#071421]/94 px-3 py-2 text-[11px] leading-5 text-amber-100 shadow-2xl backdrop-blur-xl transition-[left] duration-200 ${mapControlsCollapsed ? 'sm:left-3' : 'sm:left-[344px]'}`}>
                        <p>{empty.message}</p>
                        {empty.action === 'show-grid' && <button type="button" onClick={() => handleAtlasDomainSelection('Grid')} className="mt-2 min-h-[36px] rounded-lg border border-amber-200/40 px-3 font-semibold text-amber-100 hover:bg-amber-200/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200">Show Grid</button>}
                      </div>;
                    })()}

                    {(!atlasOverlayMode && (atlasNetworkCarrier === 'gas'
                      ? gasFacilitiesData.length > 0 || gasConnections.length > 0
                      : atlasNetworkCarrier === 'water'
                        ? waterFacilitiesData.length > 0 || waterConnections.length > 0
                        : atlasNetworkCarrier === 'liquids'
                          ? liquidsFacilitiesData.length > 0 || liquidsConnections.length > 0
                          : atlasNetworkCarrier === 'logistics'
                            ? logisticsFacilitiesData.length > 0 || logisticsConnections.length > 0
                        : pypsaFacilitiesData.length > 0 || pypsaConnections.length > 0)) && (
                      <div className={`absolute bottom-3 left-3 right-[58px] sm:right-auto z-[510] min-w-0 sm:min-w-[430px] sm:max-w-[calc(100vw-740px)] rounded-xl border border-white/10 bg-[#071421]/90 backdrop-blur-xl shadow-2xl px-3 py-2 transition-[left] duration-200 ${mapControlsCollapsed ? 'sm:left-3' : 'sm:left-[344px]'}`}>
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1.5 text-[11px]">
                          <div className="flex items-center gap-2 pr-3 border-r border-white/10">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                            <span role="status" className="font-semibold text-white">{pypsaBatchProgress ? `Updating network ${pypsaBatchProgress.completed}/${pypsaBatchProgress.total}` : mapRenderStats.renderError ? 'Map drawing failed' : mapRenderStats.renderingLinks ? 'Drawing network…' : atlasNetworkCarrier === 'gas' ? 'Gas network ready' : atlasNetworkCarrier === 'water' ? 'Water data ready' : atlasNetworkCarrier === 'liquids' ? 'Liquids data ready' : atlasNetworkCarrier === 'logistics' ? 'Logistics data ready' : 'Network ready'}</span>
                            {pypsaBatchProgress && <button type="button" aria-label="Cancel pending network load" onClick={cancelPyPSAMapBatch} className="min-h-[32px] rounded border border-sky-200/30 px-2 text-sky-100 hover:bg-white/10">Cancel</button>}
                          </div>
                          {atlasNetworkCarrier === 'gas' ? (
                            <>
                              <span className="text-tj-slate">Nodes <strong className="ml-1 text-white font-semibold">{gasFacilitiesData.filter((facility) => facility.component_type === 'Bus').length.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">Pipelines <strong className="ml-1 text-white font-semibold">{gasConnections.length.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">Assets <strong className="ml-1 text-white font-semibold">{gasFacilitiesData.filter((facility) => facility.component_type !== 'Bus').length.toLocaleString()}</strong></span>
                            </>
                          ) : atlasNetworkCarrier === 'water' ? (
                            <>
                              <span className="text-tj-slate">Assets <strong className="ml-1 text-white font-semibold">{waterFacilitiesData.length.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">Links <strong className="ml-1 text-white font-semibold">{waterConnections.length.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">Sources <strong className="ml-1 text-white font-semibold">{Number(waterStatus?.sources?.length || 0).toLocaleString()}</strong></span>
                            </>
                          ) : atlasNetworkCarrier === 'liquids' ? (
                            <>
                              <span className="text-tj-slate">Assets <strong className="ml-1 text-white font-semibold">{liquidsFacilitiesData.length.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">Pipelines <strong className="ml-1 text-white font-semibold">{liquidsConnections.length.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">Sources <strong className="ml-1 text-white font-semibold">{Number(liquidsStatus?.sources?.length || 0).toLocaleString()}</strong></span>
                            </>
                          ) : atlasNetworkCarrier === 'logistics' ? (
                            <>
                              <span className="text-tj-slate">Loaded <strong aria-label="Loaded logistics assets" className="ml-1 text-white font-semibold">{logisticsFacilitiesData.length.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">Maritime <strong aria-label="Loaded maritime assets" className="ml-1 text-white font-semibold">{logisticsLoadedModeCounts.maritime.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">Aviation <strong aria-label="Loaded aviation assets" className="ml-1 text-white font-semibold">{logisticsLoadedModeCounts.aviation.toLocaleString()}</strong></span>
                            </>
                          ) : (
                            <>
                              <span className="text-tj-slate">Buses <strong className="ml-1 text-white font-semibold">{pypsaOverviewMetrics.buses.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">AC lines <strong className="ml-1 text-white font-semibold">{pypsaOverviewMetrics.acLines.toLocaleString()}</strong></span>
                              <span className="text-tj-slate">DC links <strong className="ml-1 text-white font-semibold">{pypsaOverviewMetrics.dcLinks.toLocaleString()}</strong></span>
                            </>
                          )}
                          {mapRenderStats.overviewLines && <span className="text-sky-200" title="Every selected link is drawn in one lightweight overview canvas. Zoom in to restore individual line hover and click inspection.">Overview canvas · zoom in to inspect</span>}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <MapWorkspaceBoundary resetKey={mapRecoveryKey}>
                <EnhancedLeafletMapWithVoice
                  atlasTheme={atlasTheme}
                  controlsHidden={compactAtlasLayout && (!mapControlsCollapsed || atlasAssetPopupOpen)}
                  panelsHidden={atlasAssetPopupOpen}
                  popupDismissRequest={atlasPopupDismissRequest}
                  onPopupVisibilityChange={setAtlasAssetPopupOpen}
                  pypsaLoading={atlasOverlayMode ? Boolean(pypsaLoading || gasDomainLoading || waterDomainLoading || liquidsDomainLoading || logisticsDomainLoading) : atlasNetworkCarrier === 'gas' ? Boolean(gasDomainLoading) : atlasNetworkCarrier === 'water' ? Boolean(waterDomainLoading) : atlasNetworkCarrier === 'liquids' ? Boolean(liquidsDomainLoading) : atlasNetworkCarrier === 'logistics' ? Boolean(logisticsDomainLoading) : pypsaLoading}
                  geoJsonOverlays={(atlasOverlayMode ? atlasOverlayCarriers.includes('electricity') : atlasNetworkCarrier === 'electricity') ? pypsaGeoJsonOverlays : EMPTY_GEOGRAPHIC_OVERLAYS}
                  regionalClusterOverlay={regionalClusterOverlay}
                  activeCountryCode={atlasOverlayMode ? (atlasOverlayCountryCodes[0] || null) : atlasNetworkCarrier === 'gas' ? gasCountryFilter : atlasNetworkCarrier === 'water' ? waterCountryFilter : atlasNetworkCarrier === 'liquids' ? liquidsCountryFilter : atlasNetworkCarrier === 'logistics' ? logisticsCountryFilter : selectedPyPSACountryCode}
                  activeCountryCodes={atlasOverlayMode
                    ? (atlasOverlayCountryCodes.length
                      ? atlasOverlayCountryCodes
                      : normalizeOverlayCountryCodes([gasCountryFilter, waterCountryFilter, liquidsCountryFilter, logisticsCountryFilter]))
                    : atlasNetworkCarrier === 'gas' ? (gasCountryFilter ? [gasCountryFilter] : (gasStatus?.countries || [])) : atlasNetworkCarrier === 'water' ? (waterCountryFilter ? [waterCountryFilter] : (waterStatus?.countries || [])) : atlasNetworkCarrier === 'liquids' ? (liquidsCountryFilter ? [liquidsCountryFilter] : (liquidsStatus?.countries || [])) : atlasNetworkCarrier === 'logistics' ? (logisticsCountryFilter ? [logisticsCountryFilter] : (logisticsStatus?.countries || [])) : loadedPypsaCountryCodes}
                  focusLocation={emilFocusLocation}
                  viewportCommand={emilViewportCommand}
                  onViewportCommandApplied={handleViewportCommandApplied}
                  onFocusLocationApplied={handleFocusLocationApplied}
                  autoZoomEnabled={autoZoomEnabled}
                  performanceMode={performanceMode || atlasOverlayMode}
                  networkResolution={atlasOverlayMode ? 'overlay' : atlasNetworkCarrier === 'electricity' ? currentAtlasResolutionKey : 'full'}
                  showNodeMarkers={showMapNodes}
                  showGeographicBoundaries={showGeographicBoundaries}
                  onMapViewChange={handleMapViewChange}
                  onRenderStatsChange={handleMapRenderStatsChange}
                  landConstraints={mapLandConstraints}
                  onLandConstraintsChange={updateLandOverlay}
                  onLandOpacityCommit={commitLandOverlayOpacity}
                  gridAccess={{
                    ...gridAccessOverlay,
                    status: gridAccessStatus,
                    data: gridAccessData,
                    loading: gridAccessLoading,
                    error: gridAccessError,
                    onRetry: retryGridAccess,
                    countryCodes: activeLandCountryCodes,
                  }}
                  onGridAccessChange={updateGridAccessOverlay}
                  facilities={resultDecoratedMapFacilities}
                  selectedNode={selectedNode}
                  onNodeSelect={setSelectedNode}
                  mapLoaded={mapLoaded}
                  selectedNodes={selectedNodes}
                  onNodeSelection={handleNodeSelection}
                  connections={resultDecoratedMapConnections}
                  lineMetricEnabled={lineMetricEnabled}
                  onConnectionClick={(connection, position) => {
                    const connectionNetworkCarrier = atlasOverlayMode
                      ? (connection.atlas_network_carrier || atlasNetworkCarrier)
                      : atlasNetworkCarrier;
                    if (connectionNetworkCarrier === 'gas') {
                      const props = [
                        { Property: 'Name', Value: connection.name || connection.id || '', Units: '' },
                        { Property: 'Type', Value: 'Methane pipeline', Units: '' },
                        { Property: 'From node', Value: connection.fromNode || connection.from || '', Units: '' },
                        { Property: 'To node', Value: connection.toNode || connection.to || '', Units: '' },
                        ...(connection.capacity_gwh_d != null ? [{ Property: 'Displayed capacity', Value: Number(connection.capacity_gwh_d).toFixed(2), Units: 'GWh/d' }] : []),
                        ...(connection.entsog_capacity_gwh_d != null ? [{ Property: 'ENTSOG border capacity', Value: Number(connection.entsog_capacity_gwh_d).toFixed(2), Units: 'GWh/d' }] : []),
                        ...(connection.scigrid_capacity_gwh_d != null ? [{ Property: 'SciGRID estimate', Value: Number(connection.scigrid_capacity_gwh_d).toFixed(2), Units: 'GWh/d' }] : []),
                        ...(connection.capacity_match_method ? [{ Property: 'Capacity match', Value: connection.capacity_match_method, Units: '' }] : []),
                        ...(connection.diameter_mm != null ? [{ Property: 'Diameter', Value: Number(connection.diameter_mm).toFixed(0), Units: 'mm' }] : []),
                        ...(connection.max_pressure_bar != null ? [{ Property: 'Maximum pressure', Value: Number(connection.max_pressure_bar).toFixed(1), Units: 'bar' }] : []),
                        ...(connection.length != null ? [{ Property: 'Length', Value: Number(connection.length).toFixed(2), Units: 'km' }] : []),
                        { Property: 'Direction', Value: connection.bidirectional ? 'Bidirectional' : 'Directed', Units: '' },
                        ...(Array.isArray(connection.country_codes) && connection.country_codes.length ? [{ Property: 'Countries', Value: connection.country_codes.join(', '), Units: '' }] : []),
                        { Property: 'Source', Value: connection.source_label || 'SciGRID_gas', Units: '' },
                      ];
                      setSelectedLineInfo({
                        childName: connection.name || connection.id,
                        pos: position,
                        props,
                        lineType: 'Methane pipeline',
                      });
                    } else if (connectionNetworkCarrier === 'water') {
                      const props = [
                        { Property: 'Name', Value: connection.name || connection.id || '', Units: '' },
                        { Property: 'Type', Value: connection.connection_type || 'Water connection', Units: '' },
                        { Property: 'Classification', Value: connection.reference_kind || '', Units: '' },
                        ...(connection.length != null ? [{ Property: 'Reported length', Value: Number(connection.length).toFixed(2), Units: 'km' }] : []),
                        ...(Array.isArray(connection.country_codes) && connection.country_codes.length ? [{ Property: 'Countries', Value: connection.country_codes.join(', '), Units: '' }] : []),
                        { Property: 'Source', Value: connection.source_label || connection.source || '', Units: '' },
                        ...(connection.is_reported_relationship ? [{ Property: 'Route note', Value: 'Reported relationship; straight line is not a surveyed pipe route', Units: '' }] : []),
                        ...(connection.reference_kind === 'hydrology_reference' ? [{ Property: 'Layer note', Value: 'Hydrology reference; not a utility pipe', Units: '' }] : []),
                      ];
                      Object.entries(connection.properties || {}).forEach(([key, value]) => {
                        if (value !== null && value !== '') props.push({ Property: String(key).replace(/_/g, ' '), Value: value, Units: '' });
                      });
                      setSelectedLineInfo({
                        childName: connection.name || connection.id,
                        pos: position,
                        props,
                        lineType: connection.connection_type || 'Water connection',
                      });
                    } else if (connectionNetworkCarrier === 'liquids') {
                      const props = [
                        { Property: 'Name', Value: connection.name || connection.id || '', Units: '' },
                        { Property: 'Type', Value: connection.connection_type || 'Liquid pipeline', Units: '' },
                        { Property: 'Liquid family', Value: String(connection.liquid_family || '').replaceAll('_', ' '), Units: '' },
                        { Property: 'Geometry confidence', Value: connection.geometry_confidence || '', Units: '' },
                        ...(connection.diameter_mm != null ? [{ Property: 'Reported diameter', Value: Number(connection.diameter_mm).toFixed(0), Units: 'mm' }] : []),
                        ...(connection.s_nom != null ? [{ Property: 'Reported capacity', Value: Number(connection.s_nom).toFixed(2), Units: connection.capacity_units || '' }] : []),
                        ...(connection.length != null ? [{ Property: 'Mapped length', Value: Number(connection.length).toFixed(2), Units: 'km' }] : []),
                        ...(Array.isArray(connection.country_codes) && connection.country_codes.length ? [{ Property: 'Countries', Value: connection.country_codes.join(', '), Units: '' }] : []),
                        { Property: 'Source', Value: connection.source_label || connection.source || '', Units: '' },
                        { Property: 'Route note', Value: 'Observed mapped route; no missing section is inferred', Units: '' },
                      ];
                      Object.entries(connection.properties || {}).forEach(([key, value]) => {
                        if (value !== null && value !== '') props.push({ Property: String(key).replace(/_/g, ' '), Value: value, Units: '' });
                      });
                      setSelectedLineInfo({
                        childName: connection.name || connection.id,
                        pos: position,
                        props,
                        lineType: connection.connection_type || 'Liquid pipeline',
                      });
                    } else if (engine === 'PyPSA Engine') {
                      // Build props dynamically from all available connection fields
                      const isCrossBorder = connection.is_cross_border;
                      const lineLabel = isCrossBorder
                        ? (connection.type === 'line' ? 'Cross-Border AC Line' : 'Cross-Border DC Link')
                        : connection.type === 'link' ? 'DC Link' : 'AC Line';
                      const props = [
                        { Property: 'Name', Value: connection.name || connection.id || '', Units: '' },
                        { Property: 'Type', Value: lineLabel, Units: '' },
                        { Property: 'From Bus', Value: connection.fromNode || connection.from || '', Units: '' },
                        { Property: 'To Bus', Value: connection.toNode || connection.to || '', Units: '' },
                        ...(connection.s_nom != null ? [{ Property: 'S Nom', Value: Number(connection.s_nom).toFixed(2), Units: 'MVA' }] : []),
                        ...(connection.p_nom != null ? [{ Property: 'P Nom', Value: Number(connection.p_nom).toFixed(2), Units: 'MW' }] : []),
                        ...(connection.carrier ? [{ Property: 'Carrier', Value: connection.carrier, Units: '' }] : []),
                        ...(connection.x != null ? [{ Property: 'Reactance (x)', Value: connection.x, Units: 'Ω' }] : []),
                        ...(connection.r != null ? [{ Property: 'Resistance (r)', Value: connection.r, Units: 'Ω' }] : []),
                        ...(connection.length != null ? [{ Property: 'Length', Value: Number(connection.length).toFixed(2), Units: 'km' }] : []),
                        ...(connection.efficiency != null ? [{ Property: 'Efficiency', Value: connection.efficiency, Units: '' }] : []),
                        // Cross-border specific fields
                        ...(isCrossBorder && connection.foreign_country ? [{ Property: 'Foreign Country', Value: connection.foreign_country, Units: '' }] : []),
                        ...(isCrossBorder && connection.via_port ? [{ Property: 'Via Port', Value: connection.via_port, Units: '' }] : []),
                        ...(isCrossBorder && connection.foreign_port ? [{ Property: 'Foreign Port', Value: connection.foreign_port, Units: '' }] : []),
                        ...(isCrossBorder && (connection.foreign_generators || []).length > 0
                          ? [{ Property: 'Foreign Generators', Value: (connection.foreign_generators || []).join(', '), Units: '' }] : []),
                      ];
                      // Pass distill context so we can fetch flow profiles
                      const activeDirname = resolveConnectionDirname(connection);
                      setSelectedLineInfo({
                        childName: connection.name,
                        pos: position,
                        props,
                        lineType: lineLabel,
                        // flow profile context
                        flowName: connection.name,
                        flowType: connection.type,   // 'line' or 'link'
                        dirname: activeDirname,
                        granularityPrefix: pypsaGranularity,
                      });
                    } else {
                      const { strict } = normalizeLineKeys(connection.parentIdentifier);
                      const props = getPropertiesForConnection(connection);
                      setSelectedLineInfo({ childName: strict, pos: position, props });
                    }
                  }}
                  linePropertiesByChildName={linePropertiesByChildName}
                  activeDataLayer={activeDataLayer}
                  showGenerationMix={!modelResultStatus.scene && !atlasOverlayMode && atlasNetworkCarrier === 'electricity' && showGenerationMix && pypsaHasGenerationMixData}
                  mapViewMode={mapViewMode}
                  marketPrices={marketPrices}
                  generationMix={generationMix}
                  transmissionFlows={transmissionFlows}
                  onLocationDetected={handleVoiceLocation}
                  editableNodes={editableNodes}
                  setEditableNodes={setEditableNodes}
                  regionCenter={regionCenter}
                  regionRadiusKm={regionRadiusKm}
                  regionManifest={regionManifest}
                  regionSolving={regionSolving}
                  onRegionContextMenu={setRegionContextMenu}
                  onRegionCenterChange={({ lat, lon }) => {
                    if (regionManifest || regionSolving) return;
                    setRegionCenter({ lat, lon });
                  }}
                />
                </MapWorkspaceBoundary>
                <ModelResultLegend scene={modelResultStatus.scene} onClear={clearModelResult} />
                {/* Right-click context menu: single-action popover positioned at cursor. */}
                {engine === 'PyPSA Engine' && !atlasOverlayMode && atlasNetworkCarrier === 'electricity' && selectedPyPSAFile && regionContextMenu && !regionPanelVisible && (
                  <div
                    className="absolute z-[600]"
                    style={{ left: regionContextMenu.x, top: regionContextMenu.y }}
                  >
                    <button
                      onClick={() => openRegionPanelAt(regionContextMenu.lat, regionContextMenu.lon)}
                      className="text-xs px-3 py-1.5 rounded bg-tj-navy-dark/95 border border-white/10 text-tj-gray hover:text-white hover:border-white/30 shadow-lg whitespace-nowrap"
                    >
                      Solve region here
                    </button>
                  </div>
                )}

                {false && engine === 'PyPSA Engine' && (pypsaFacilitiesData.length > 0 || pypsaConnections.length > 0) && (
                  <div className="absolute top-16 left-3 z-[590] flex flex-col gap-2 w-[320px] max-w-[86vw]">
                    {!regionPanelVisible && (
                      <div className="bg-tj-navy-dark/90 backdrop-blur-md border border-white/10 rounded-lg p-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={openRegionPanelFromCurrentView}
                            className="text-xs px-2.5 py-1.5 rounded-md border border-tj-gold/40 text-tj-gold hover:bg-tj-gold/10"
                          >
                            Solve Network
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const lat = Number(mapViewRef.current?.lat);
                              const lon = Number(mapViewRef.current?.lng);
                              if (Number.isFinite(lat) && Number.isFinite(lon)) {
                                openRegionPanelAt(lat, lon);
                              }
                            }}
                            className="text-xs px-2.5 py-1.5 rounded-md border border-white/15 text-tj-gray hover:text-white hover:border-white/30"
                          >
                            Use View Center
                          </button>
                        </div>
                      </div>
                    )}
                    {regionPanelVisible && (
                      <PypsaRegionSolveControls
                        sourceDirname={selectedPyPSAFile}
                        center={regionCenter}
                        onClearCenter={() => {
                          setRegionCenter(null);
                          setRegionManifest(null);
                          setRegionError(null);
                          setRegionS3Folder('');
                          setRegionDirname('');
                          setRegionSourceDirname('');
                          setRegionOpsMessage('');
                        }}
                        radiusKm={regionRadiusKm}
                        onRadiusChange={setRegionRadiusKm}
                        radiusLocked={!!regionManifest}
                        canSolve={!!regionCenter && !!selectedPyPSAFile && !regionManifest}
                        solving={regionSolving}
                        onSolve={solveRegion}
                        manifest={regionManifest}
                        error={regionError}
                        currentRegionDirname={resolvedRegionDirname}
                        onSaveCurrentRun={saveCurrentRegionRun}
                        savingCurrentRun={regionSaveBusy}
                        opsMessage={regionOpsMessage}
                        onClose={closeRegionPanel}
                      />
                    )}
                  </div>
                )}
                {/* PyPSA Carrier Legend - top-right overlay */}
                {false && engine === 'PyPSA Engine' && pypsaFacilitiesData.length > 0 && (() => {
                  const realFacilities = pypsaFacilitiesData.filter(f => !f.is_virtual);
                  const virtualFacilities = pypsaFacilitiesData.filter(f => f.is_virtual);
                  const allCarriers = [...new Set(realFacilities.map(f => f.carrier_key || f.type).filter(Boolean))];
                  const toggleCarrier = (c) => {
                    setHiddenCarriers(prev => {
                      const next = new Set(prev);
                      if (next.has(c)) next.delete(c); else next.add(c);
                      return next;
                    });
                  };
                  return (
                    <div className="absolute top-3 right-3 z-10 w-[300px] bg-tj-navy-light/92 backdrop-blur-md rounded-xl border border-white/10 shadow-xl p-2.5 text-xs max-h-[78vh] overflow-y-auto">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-semibold text-tj-gray flex items-center gap-1">
                          <Network className="h-3.5 w-3.5 text-tj-gold" /> Carriers
                        </span>
                        <span className="text-[10px] text-tj-slate">{realFacilities.length} nodes</span>
                      </div>

                      <div className="mb-2">
                        <input
                          value={carrierLegendQuery}
                          onChange={(e) => setCarrierLegendQuery(e.target.value)}
                          placeholder="Filter carriers..."
                          className="w-full px-2 py-1.5 text-[11px] rounded-md bg-black/25 border border-white/10 text-tj-gray focus:outline-none focus:border-white/30"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1 mb-2">
                        <button
                          onClick={() => setHiddenCarriers(new Set())}
                          className="text-[10px] py-1 rounded border border-white/15 text-tj-gold hover:bg-white/5"
                        >
                          Show all
                        </button>
                        <button
                          onClick={() => setHiddenCarriers(new Set(allCarriers))}
                          className="text-[10px] py-1 rounded border border-white/15 text-tj-slate hover:bg-white/5"
                        >
                          Hide all
                        </button>
                        <button
                          onClick={() => {
                            setCarrierLegendQuery('');
                            setCollapsedCarrierLegendGroups({});
                          }}
                          className="text-[10px] py-1 rounded border border-white/15 text-tj-slate hover:bg-white/5"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(() => {
                          const q = carrierLegendQuery.trim().toLowerCase();
                          const classifyGroup = (sample) => {
                            const ct = String(sample?.component_type || sample?.type || '').toLowerCase();
                            if (ct === 'storageunit' || ct === 'store') return 'Storage';
                            if (ct === 'load' || ct === 'bus') return 'Demand & Buses';
                            if (ct === 'link') return 'Conversion';
                            return 'Generators';
                          };

                          const entries = allCarriers.map((c) => {
                            const sample = realFacilities.find((f) => (f.carrier_key || f.type) === c);
                            const label = String(sample?.carrier_nice_name || sample?.carrier || c);
                            const color = sample?.carrier_color || '#6b7280';
                            const total = realFacilities.filter((f) => (f.carrier_key || f.type) === c).length;
                            const visible = hiddenCarriers.has(c) ? 0 : total;
                            return { key: c, label, color, total, visible, group: classifyGroup(sample) };
                          })
                          .filter((entry) => !q || entry.label.toLowerCase().includes(q) || String(entry.key).toLowerCase().includes(q))
                          .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

                          const grouped = entries.reduce((acc, e) => {
                            if (!acc[e.group]) acc[e.group] = [];
                            acc[e.group].push(e);
                            return acc;
                          }, {});

                          const groupOrder = ['Generators', 'Storage', 'Conversion', 'Demand & Buses'];
                          const orderedGroups = groupOrder.filter((g) => Array.isArray(grouped[g]) && grouped[g].length > 0);

                          return (
                            <>
                              {orderedGroups.map((groupName) => {
                                const items = grouped[groupName];
                                const collapsed = collapsedCarrierLegendGroups[groupName] ?? true;
                                const visibleTotal = items.reduce((s, item) => s + item.visible, 0);
                                const allTotal = items.reduce((s, item) => s + item.total, 0);
                                return (
                                  <div key={groupName} className="border border-white/10 rounded-lg bg-black/20">
                                    <button
                                      onClick={() => setCollapsedCarrierLegendGroups((prev) => {
                                        const current = prev[groupName] ?? true;
                                        return { ...prev, [groupName]: !current };
                                      })}
                                      className="w-full flex items-center justify-between px-2 py-1.5 text-left"
                                    >
                                      <span className="text-[10px] uppercase tracking-wider text-tj-slate">{groupName}</span>
                                      <span className="text-[10px] text-tj-gray">{visibleTotal}/{allTotal} {collapsed ? '▸' : '▾'}</span>
                                    </button>
                                    {!collapsed && (
                                      <div className="px-1.5 pb-1.5 space-y-0.5">
                                        {items.map((entry) => {
                                          const hidden = hiddenCarriers.has(entry.key);
                                          return (
                                            <button
                                              key={entry.key}
                                              onClick={() => toggleCarrier(entry.key)}
                                              className={`w-full flex items-center gap-1.5 px-1 py-1 rounded text-left transition-colors ${hidden ? 'opacity-45 hover:opacity-70' : 'hover:bg-white/10'}`}
                                              title={hidden ? `Show ${entry.label}` : `Hide ${entry.label}`}
                                            >
                                              <span className="inline-flex w-3.5 h-3.5 rounded-[3px] border border-white/25 items-center justify-center shrink-0" style={{ backgroundColor: hidden ? 'transparent' : entry.color }}>
                                                {!hidden && <span className="text-[8px] text-white leading-none">✓</span>}
                                              </span>
                                              <span className={`text-[11px] ${hidden ? 'line-through text-gray-500' : 'text-tj-gray'}`}>{entry.label}</span>
                                              <span className="ml-auto text-[10px] text-gray-400">{entry.visible}/{entry.total}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {orderedGroups.length === 0 && (
                                <div className="text-[11px] text-tj-slate italic px-1 py-1">No carriers match this filter.</div>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {virtualFacilities.length > 0 && (
                        <div className="mt-2 border border-white/10 rounded-lg px-2 py-1.5 bg-black/20 flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-sm border border-red-400/80 bg-amber-100/90" />
                          <span className="text-[11px] text-tj-slate italic">Cross-Border</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{virtualFacilities.length}</span>
                        </div>
                      )}

                      {pypsaConnections.length > 0 && (
                        <div className="border-t border-white/10 mt-2 pt-2 space-y-1">
                          <div className="text-[10px] uppercase tracking-wider text-tj-slate">Connections</div>
                          {pypsaConnections.filter(c => c.type === 'line').length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: '#3B82F6' }} />
                              <span className="text-tj-gray text-[11px]">AC Lines</span>
                              <span className="text-gray-400 ml-auto text-[10px]">{pypsaConnections.filter(c => c.type === 'line').length}</span>
                            </div>
                          )}
                          {pypsaConnections.filter(c => c.type === 'link' && !c.is_cross_border).length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: '#F59E0B' }} />
                              <span className="text-tj-gray text-[11px]">DC Links</span>
                              <span className="text-gray-400 ml-auto text-[10px]">{pypsaConnections.filter(c => c.type === 'link' && !c.is_cross_border).length}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Keep camera controls beside EMIL and Land/Access above it. */}
                <div className={`absolute bottom-4 right-4 z-[700] ${mapAgentOpen && !atlasAssetPopupOpen ? 'sm:right-[70px]' : ''}`}>
                  {mapAgentOpen ? (
                    <section style={atlasAssetPopupOpen ? { display: 'none' } : undefined} aria-label="Map assistant" className="atlas-assistant-panel w-[370px] max-w-[88vw] h-[500px] bg-tj-navy-dark/92 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl flex flex-col overflow-hidden">
                      <div className="atlas-assistant-header shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-tj-gold">EMIL</div>
                            {emilVoice.active && (
                              <span className="relative flex h-2 w-2" aria-hidden="true">
                                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-tj-gold opacity-60" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-tj-gold" />
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-[11px] truncate ${emilVoice.error ? 'text-red-300' : emilVoice.active ? 'text-tj-gold' : 'text-tj-slate'}`}
                            role={emilVoice.error ? 'alert' : 'status'}
                            aria-live="polite"
                          >
                            {emilVoice.statusLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {emilVoice.active && (
                            <button type="button" onClick={emilVoice.stop}
                              aria-label="Stop live voice" title="Stop microphone and EMIL speech"
                              className="h-9 w-9 shrink-0 rounded-lg border border-white/25 bg-white/5 text-white flex items-center justify-center">
                              <MicOff className="h-4 w-4" />
                            </button>
                          )}
                          {emilVoice.speaking && (
                            <button
                              type="button"
                              onClick={emilVoice.cancelSpeech}
                              className="h-9 w-9 rounded-lg border border-red-300/30 bg-red-400/10 text-red-200 flex items-center justify-center"
                              aria-label="Stop EMIL speaking"
                              title="Stop EMIL speaking"
                            >
                              <VolumeX className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setMapAgentOpen(false)}
                            className="h-9 px-2 text-xs text-tj-slate hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                      </div>

                      <div className="atlas-assistant-settings" data-cover-conversation={mapAgentSettings.coverConversation}>
                        <button type="button" ref={mapAgentSettings.toggleRef}
                          onClick={mapAgentSettings.toggle}
                          aria-label="Voice and map settings"
                          aria-expanded={mapAgentSettings.expanded}
                          aria-controls={mapAgentSettings.panelId}
                          className="shrink-0 min-h-[32px] flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-tj-slate hover:text-white border-b border-white/10">
                          <span>{mapAgentSettings.coverConversation ? 'Back to conversation' : 'Voice and map settings'}</span>
                          <ChevronDown className={`h-3.5 w-3.5 ${mapAgentSettings.expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                      <div id={mapAgentSettings.panelId} ref={mapAgentSettings.panelRef} hidden={!mapAgentSettings.expanded}
                        className="atlas-assistant-settings-body min-h-0 overflow-y-auto px-3 py-2.5 border-b border-white/10 bg-black/10 space-y-2">
                        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 cursor-pointer select-none">
                          <span className="min-w-0">
                            <span className="block text-[11px] font-medium text-white">AI controls map</span>
                            <span className="block text-[9px] leading-4 text-tj-slate">Zoom, frame, and isolate areas from speech or text</span>
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-label="Allow AI to control the map viewport"
                            aria-checked={aiMapControlEnabled}
                            onClick={() => setAiMapControlEnabled((enabled) => !enabled)}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${aiMapControlEnabled ? 'bg-tj-gold' : 'bg-white/10'}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${aiMapControlEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                          </button>
                        </label>
                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1" aria-label="EMIL voice mode">
                          <button
                            type="button"
                            onClick={() => emilVoice.setMode(EMIL_VOICE_MODES.COMMANDS)}
                            aria-pressed={emilVoice.mode === EMIL_VOICE_MODES.COMMANDS}
                            className={`min-h-[36px] rounded-lg px-2 text-[11px] font-medium flex items-center justify-center gap-1.5 border ${
                              emilVoice.mode === EMIL_VOICE_MODES.COMMANDS
                                ? 'bg-tj-gold/16 border-tj-gold/45 text-tj-gold'
                                : 'border-transparent text-tj-slate hover:text-white'
                            }`}
                            title="Continuous map commands with visual replies"
                          >
                            <Radio className="h-3.5 w-3.5" />
                            Command stream
                          </button>
                          <button
                            type="button"
                            onClick={() => emilVoice.setMode(EMIL_VOICE_MODES.CONVERSATION)}
                            aria-pressed={emilVoice.mode === EMIL_VOICE_MODES.CONVERSATION}
                            className={`min-h-[36px] rounded-lg px-2 text-[11px] font-medium flex items-center justify-center gap-1.5 border ${
                              emilVoice.mode === EMIL_VOICE_MODES.CONVERSATION
                                ? 'bg-tj-gold/16 border-tj-gold/45 text-tj-gold'
                                : 'border-transparent text-tj-slate hover:text-white'
                            }`}
                            title="Back-and-forth conversation with spoken EMIL replies"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Conversation
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <AudioLevelMeter store={emilVoice.micLevelStore} active={emilVoice.active} />
                          <span className="text-[9px] uppercase tracking-wider text-tj-slate">
                            <span title={emilVoice.transport === 'upload'
                              ? 'Recorded command transcription using the Nohm speech service'
                              : 'OpenAI gpt-live-transcribe with Atlas place and energy-system hints'}>
                              {emilVoice.transport === 'upload' ? 'Push-to-talk STT' : emilVoice.active ? 'OpenAI Live STT' : 'Mic off'}
                            </span>
                          </span>
                        </div>
                        {emilVoice.micDevices.length > 1 && (
                          <select
                            value={emilVoice.selectedMicDeviceId}
                            onChange={(event) => emilVoice.selectMicDevice(event.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg bg-tj-navy-light/70 border border-white/10 text-[11px] text-tj-gray focus:outline-none focus:border-tj-gold/50"
                            aria-label="Voice input microphone"
                          >
                            <option value="">Default microphone</option>
                            {emilVoice.micDevices.map((device) => (
                              <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                            ))}
                          </select>
                        )}
                        {emilVoice.warning && (
                          <div className="text-[10px] leading-4 text-amber-200" role="status">{emilVoice.warning}</div>
                        )}
                        {emilVoice.active && (
                          <div className="flex flex-wrap gap-2 text-[10px]">
                            <button type="button" onClick={emilVoice.stop} className="min-h-[32px] rounded-md border border-white/20 px-2 text-white hover:bg-white/10">
                              Stop voice
                            </button>
                            {emilVoice.queueDepth > 0 && (
                              <button type="button" onClick={emilVoice.clearQueue} className="min-h-[32px] rounded-md border border-white/20 px-2 text-white hover:bg-white/10" title="Cancel waiting instructions; a map operation already running will finish">
                                Clear waiting instructions
                              </button>
                            )}
                            {emilVoice.transport === 'upload' && (
                              <button type="button" onClick={emilVoice.retry} className="min-h-[32px] rounded-md border border-tj-gold/35 px-2 text-tj-gold hover:bg-white/10">
                                Retry live connection
                              </button>
                            )}
                          </div>
                        )}
                        {emilVoice.error && (
                          <div className="flex items-start justify-between gap-2 text-[10px] leading-4 text-red-200" role="alert">
                            <span>{emilVoice.error}</span>
                            <button type="button" onClick={emilVoice.retry} className="shrink-0 underline text-tj-gold">Retry</button>
                          </div>
                        )}
                      </div>

                      </div>

                      <div
                        style={mapAgentSettings.coverConversation ? { display: 'none' } : undefined}
                        ref={mapConversationScroll.containerRef}
                        onScroll={mapConversationScroll.onScroll}
                        tabIndex={0}
                        className="min-h-0 flex-1 overflow-y-auto scrollbar-hidden px-3 py-4 space-y-3 bg-gradient-to-b from-white/[0.02] to-transparent"
                        role="log"
                        aria-live="polite"
                        aria-label="Conversation with EMIL"
                      >
                        {mapAgentMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-6 shadow-sm ${
                              msg.role === 'user'
                                ? 'ml-auto bg-tj-gold/14 border border-tj-gold/45 text-tj-gold'
                                : 'mr-auto bg-white/8 border border-white/12 text-tj-gray'
                            }`}
                          >
                            {msg.text}
                          </div>
                        ))}
                        {mapAgentBusy && (
                          <div className="mr-auto bg-white/8 border border-white/12 text-tj-slate rounded-2xl px-3.5 py-2.5 text-[12px]">
                            {pypsaBatchProgress
                              ? <AtlasBatchProgress progress={pypsaBatchProgress} onCancel={cancelPyPSAMapBatch} cancelLabel="Cancel EMIL network update" />
                              : 'Working on it...'}
                          </div>
                        )}
                        {emilVoice.partial && (
                          <div className="ml-auto max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-6 italic bg-tj-gold/7 border border-dashed border-tj-gold/35 text-tj-gold/75" aria-live="off">
                            {emilVoice.partial}
                          </div>
                        )}
                      </div>

                      <div className="atlas-assistant-composer shrink-0 p-3 border-t border-white/10">
                        {!mapAgentSettings.coverConversation && !mapConversationScroll.following && (
                          <button
                            type="button"
                            onClick={mapConversationScroll.jumpToLatest}
                            className="mb-2 min-h-[32px] w-full rounded-lg border border-tj-gold/35 bg-tj-gold/10 px-3 py-1.5 text-[12px] text-tj-gold hover:bg-tj-gold/20"
                            aria-label="Jump to latest EMIL message"
                          >
                            {mapConversationScroll.unread ? 'New messages · Jump to latest' : 'Jump to latest'}
                          </button>
                        )}
                        <div className="flex items-center gap-2.5">
                          <input
                            type="text"
                            value={mapAgentInput}
                            onChange={(e) => setMapAgentInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                                e.preventDefault();
                                mapAgentSettings.showConversation();
                                handleMapAgentCommand();
                              }
                            }}
                            placeholder='Ask EMIL, e.g. “show Spain at NUTS3”'
                            aria-label="Message EMIL"
                            ref={mapAgentInputRef}
                            className="min-w-0 flex-1 px-3.5 py-2.5 text-[13px] border border-white/10 rounded-xl bg-tj-navy-light/45 focus:outline-none focus:ring-1 focus:ring-tj-gold"
                          />
                          <button
                            type="button"
                            onClick={emilVoice.toggle}
                            aria-pressed={emilVoice.active}
                            aria-busy={emilVoice.phase === 'connecting' || emilVoice.phase === 'transcribing'}
                            className={`h-11 w-11 shrink-0 rounded-full border flex items-center justify-center ${
                              emilVoice.active
                                ? 'bg-tj-gold text-black border-tj-gold shadow-[0_0_0_4px_rgba(229,194,14,0.10)]'
                                : 'bg-tj-gold/20 text-tj-gold border-tj-gold/40'
                            }`}
                            aria-label={
                              emilVoice.fallbackRecording ? 'Stop recording and send to EMIL'
                                : emilVoice.transport === 'upload' && emilVoice.active ? 'Record a command for EMIL'
                                  : emilVoice.active ? 'Turn live voice off' : 'Turn live voice on'
                            }
                            title={
                              emilVoice.fallbackRecording ? 'Stop and transcribe'
                                : emilVoice.transport === 'upload' && emilVoice.active ? 'Push to talk'
                                  : emilVoice.active ? 'Stop live voice' : 'Start live voice'
                            }
                          >
                            {emilVoice.active ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => { mapAgentSettings.showConversation(); handleMapAgentCommand(); }}
                            disabled={mapAgentBusy || !mapAgentInput.trim()}
                            className="h-10 w-10 rounded-full bg-tj-gold/25 text-tj-gold border border-tj-gold/40 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Send assistant message"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </section>
                  ) : null}
                  {(!mapAgentOpen || atlasAssetPopupOpen) && (
                    <EmilVoiceLauncher voice={emilVoice} onOpen={openMapAssistant} />
                  )}
                </div>

                {/* Clicked line details panel */}
                {selectedLineInfo && (() => {
                  const isDistillLine = !!(selectedLineInfo.dirname && selectedLineInfo.flowName);
                  const linePanelStyle =
                    Number.isFinite(selectedLineInfo?.pos?.x) && Number.isFinite(selectedLineInfo?.pos?.y)
                      ? { left: Math.max(12, selectedLineInfo.pos.x + 12), top: Math.max(12, selectedLineInfo.pos.y - 12) }
                      : { right: 16, bottom: 16 };
                  return (
                    <div className="absolute z-[780] bg-tj-navy-light/55 backdrop-blur-md rounded-xl border border-white/10 shadow-lg w-[340px] max-w-[88vw] max-h-[54vh] overflow-hidden" style={linePanelStyle}>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                        <div className="text-[13px] font-semibold text-tj-gray truncate" title={selectedLineInfo.childName}>
                          {selectedLineInfo.lineType || 'Line'}: {selectedLineInfo.childName}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedLineInfo(null)}
                          className="inline-flex items-center justify-center h-7 px-2 rounded-md text-[11px] text-tj-slate hover:text-tj-gray hover:bg-white/10 border border-white/10"
                          aria-label="Close line properties"
                        >
                          Close
                        </button>
                      </div>

                      <div className="flex flex-col divide-y divide-white/10">
                        {/* Properties table */}
                        {selectedLineInfo.props && selectedLineInfo.props.length > 0 && (
                          <div className="max-h-[240px] overflow-y-auto">
                            <table className="w-full text-xs table-fixed">
                              <thead className="bg-tj-navy-dark/60 sticky top-0">
                                <tr>
                                  <th className="w-[34%] px-2 py-1.5 text-left text-[9px] font-semibold uppercase text-tj-slate tracking-wider">Property</th>
                                  <th className="w-[42%] px-2 py-1.5 text-left text-[9px] font-semibold uppercase text-tj-slate tracking-wider">Value</th>
                                  <th className="w-[24%] px-2 py-1.5 text-left text-[9px] font-semibold uppercase text-tj-slate tracking-wider">Units</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {selectedLineInfo.props.map((r, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1 text-tj-gray truncate">{r.Property || ''}</td>
                                    <td className="px-2 py-1 font-mono break-all">{r.Value || ''}</td>
                                    <td className="px-2 py-1 text-tj-slate">{r.Units || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Flow profile chart — distill only */}
                        {isDistillLine && (
                          <div className="max-h-[170px] overflow-y-auto">
                            <LineFlowChartPanel
                              dirname={selectedLineInfo.dirname}
                              name={selectedLineInfo.flowName}
                              type={selectedLineInfo.flowType}
                              granularityPrefix={selectedLineInfo.granularityPrefix}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {showPypsaSettingsDialog && (
          <AtlasModal title="Model settings"
            description="Configure map rendering and the next PyPSA network build. Changes are retained when you close this panel."
            onClose={() => setShowPypsaSettingsDialog(false)}
            footer={(
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={resetPypsaSettingsDefaults}
                  className="atlas-modal__secondary-action min-h-[36px] rounded-lg border px-3 text-xs">
                  Reset Defaults
                </button>
                <button type="button" onClick={exportPypsaSettingsJson}
                  className="atlas-modal__secondary-action min-h-[36px] rounded-lg border px-3 text-xs">
                  Export JSON
                </button>
                <button type="button" onClick={runPypsaBuildFromSettings} disabled={solveNetworkStaging || pypsaLoading}
                  className="atlas-modal__primary-action min-h-[36px] rounded-lg border px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                  {solveNetworkStaging ? 'Building...' : 'Build Network'}
                </button>
              </div>
            )}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="atlas-settings-card rounded-xl border p-3 lg:col-span-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-tj-gold">Map performance</div>
                        <p className="mt-1 text-[11px] leading-4 text-tj-slate">
                          Adaptive protects interaction speed on dense maps and constrained devices. Quality and Speed are explicit overrides.
                        </p>
                      </div>
                      <div className="atlas-settings-segments grid min-w-[248px] grid-cols-3 gap-1 rounded-lg border p-1" role="radiogroup" aria-label="Map performance">
                        {[
                          [MAP_PERFORMANCE_PREFERENCES.AUTO, 'Adaptive'],
                          [MAP_PERFORMANCE_PREFERENCES.QUALITY, 'Quality'],
                          [MAP_PERFORMANCE_PREFERENCES.PERFORMANCE, 'Speed'],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={performancePreference === value}
                            onClick={() => setPerformancePreference(value)}
                            className={`min-h-[34px] rounded-md px-2 text-[11px] font-semibold transition ${
                              performancePreference === value
                                ? 'bg-tj-gold/15 text-tj-gold ring-1 ring-tj-gold/35'
                                : 'text-tj-slate hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-tj-slate" aria-live="polite">
                      {performancePreference === MAP_PERFORMANCE_PREFERENCES.AUTO
                        ? `Currently using ${performanceMode ? 'lighter rendering' : 'full visual quality'}${performanceMode ? ` because of ${mapPerformanceDecision.reason}` : ''}.`
                        : performanceMode
                          ? 'Speed uses lighter markers and disables packet animation.'
                          : 'Quality keeps every visual effect, including on dense maps.'}
                    </p>
                  </div>
                  {pypsaSettingsSections.map((section) => (
                    <div key={section.title} className="atlas-settings-card rounded-xl border p-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-tj-gold mb-2">{section.title}</div>
                      <div className="space-y-2">
                        {section.fields.map((field) => {
                          const value = pypsaSettings[field.key];
                          if (field.type === 'toggle') {
                            return (
                              <label key={field.key} className="flex min-h-[36px] items-center justify-between gap-3">
                                <span className="text-xs text-tj-gray">{field.label}</span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-label={field.label}
                                  aria-checked={Boolean(value)}
                                  onClick={() => updatePypsaSetting(field.key, !Boolean(value))}
                                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${value ? 'bg-tj-gold' : 'bg-white/15'}`}
                                >
                                  <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
                                </button>
                              </label>
                            );
                          }
                          if (field.type === 'select') {
                            return (
                              <label key={field.key} className="block">
                                <div className="text-[11px] text-tj-slate mb-1">{field.label}</div>
                                <select
                                  value={String(value)}
                                  onChange={(e) => updatePypsaSetting(field.key, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs border border-white/10 rounded-md bg-tj-navy-light/45 text-white"
                                >
                                  {(field.options || []).map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              </label>
                            );
                          }
                          if (field.type === 'range') {
                            return (
                              <label key={field.key} className="block">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[11px] text-tj-slate">{field.label}</span>
                                  <span className="text-[11px] text-tj-gold">{value}</span>
                                </div>
                                <input
                                  type="range"
                                  min={field.min}
                                  max={field.max}
                                  step={field.step || 1}
                                  value={Number(value)}
                                  onChange={(e) => updatePypsaSetting(field.key, Number(e.target.value))}
                                  className="w-full accent-tj-gold"
                                />
                              </label>
                            );
                          }
                          return (
                            <label key={field.key} className="block">
                              <div className="text-[11px] text-tj-slate mb-1">{field.label}</div>
                              <input
                                type={field.type === 'number' ? 'number' : 'text'}
                                value={String(value ?? '')}
                                step={field.step || 'any'}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  updatePypsaSetting(field.key, field.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw);
                                }}
                                className="w-full px-2 py-1.5 text-xs border border-white/10 rounded-md bg-tj-navy-light/45 text-white"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
          </AtlasModal>
        )}

        {/* Results Tab */}
        {activeAssistant === 'emil' && activeTab === 'results' && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <ResultsTab
              resultsChatMessages={resultsChatMessages}
              setResultsChatMessages={setResultsChatMessages}
              activeAssistant={activeAssistant}
              activeTab={activeTab}
            />
          </div>
        )}

        {/* OLD RESULTS TAB CODE REMOVED - Now using ResultsTab component */}
        {/* Old code removed - see assistants/emil/ResultsTab.js */}
      </div>
    </div>
  );
}

export default function App() {
  const [serverDown, setServerDown] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Local Atlas is resilient to backend restarts and development refreshes.
    // Each workspace exposes its own loading/error state, so a transient health
    // probe must not replace the whole local map with a false offline screen.
    if (IS_LOCAL_FRONTEND) {
      setServerDown(false);
      setChecking(false);
      return undefined;
    }
    let cancelled = false;
    checkServerHealth(8000)
      .then((healthy) => {
        if (cancelled) return;
        if (!healthy) setServerDown(true);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-tj-navy-dark text-tj-gray flex items-center justify-center text-sm">
        Connecting to server...
      </div>
    );
  }
  if (serverDown) return <ServerDownScreen />;
  return <AppInner />;
}
