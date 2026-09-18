import React, { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, CircleMarker, Circle, Tooltip, GeoJSON, Pane } from 'react-leaflet';
import L from 'leaflet';
import { Plus, Minus, Maximize2, RotateCcw, Leaf, MousePointer2, X, Zap } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { atlasAssetUrl } from '../config/assets';
import { loadEuropeBoundaries } from '../europeBoundaryCache';
import {
  ATLAS_NETWORK_CARRIER_META,
} from '../atlasNetworkOverlay';
import { shouldExecuteViewportCommand, applyViewportCommandOnce } from '../viewportCommand';
import { createConnectionGeometryResolver, createViewportGeometrySelector, routeSmoothingForZoom } from '../atlasMapGeometry';
import { BoundedMapCache } from '../boundedMapCache';
import { useMapTelemetry } from '../hooks/useMapTelemetry';
import { usePopupViewportBounds } from '../hooks/usePopupViewportBounds';
import { useMapNodeSelection } from '../hooks/useMapNodeSelection';
import { useCommittedMapFrame } from '../hooks/useCommittedMapFrame';
import { animateAtlasMap } from '../mapMotion';
import BatchedNetworkLayer from './BatchedNetworkLayer';
import OverviewNetworkCanvasLayer from './OverviewNetworkCanvasLayer';
import MapRenderDiagnostics, { mapDiagnosticsEnabled } from './MapRenderDiagnostics';
import ConnectionCapacityLegend from './ConnectionCapacityLegend';
import GridAccessLegend from './GridAccessLegend';
import LandSampleSummary from './LandSampleSummary';
import { getConnectionCapacity, connectionCapacityScales, capacityColor, formatCapacity } from '../connectionCapacity';
import { createSpatialFeatureKey } from '../spatialFeatureKey';
import { createAtlasCanvas } from '../atlasCanvas';
import { rankNetworkNodes } from '../networkNodeRanking';
import { indexOverviewNodes, selectOverviewNodes } from '../overviewNodeSampling';
import { atlasRecordCountryCodes } from '../atlasNetworkOverlay';
import { networkFitPoints, countryFitFeatures } from '../networkFitExtent';
import { landCountryScope } from '../landCountryScope';
import { escapeMapText as escapeHtml, publishedNumber } from '../mapText';
import { buildGridAccessPopupContent } from '../gridAccessPopup';
import { bindMapHoverTooltip } from '../mapHoverTooltip';
import { indexGenerationSites, selectGenerationSites, generationPieDiameter } from '../generationMapLayout';
import { createGenerationMixResolver } from '../generationMix';

// Fix for default markers in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const ATLAS_MIN_ZOOM = 3;
const OVERVIEW_CANVAS_MIN_LINKS = 4000;
// Fit explicit country/zone targets below the header and layer toolbar, with
// room for the status bar. Applied only on a new command, never on UI toggles.
const ATLAS_COUNTRY_FIT_OPTIONS = {
  paddingTopLeft: [42, 148], paddingBottomRight: [42, 60], maxZoom: 10,
};
// Reserve the header/layer-toolbar band when Leaflet pans an asset into view.
// CSS further limits content height for short embedded/laptop viewports.
const ATLAS_ASSET_POPUP_OPTIONS = {
  className: 'atlas-asset-popup', maxWidth: 360, maxHeight: 420,
  autoPanPaddingTopLeft: [12, 190], autoPanPaddingBottomRight: [12, 60],
};
const GRID_ACCESS_SIDE_OPTIONS = [
  ['demand', 'Demand / import'],
  ['generation', 'Generation / export'],
  ['storage_import', 'Storage charging'],
  ['storage_export', 'Storage discharge'],
];
const GRID_ACCESS_SIDE_KEYS = GRID_ACCESS_SIDE_OPTIONS.map(([side]) => side);

// Land opacity is presentation-only. Applying it to the containing pane keeps
// the browser on one composited layer; Leaflet's TileLayer#setOpacity walks
// every visible image and can make a slider drag look like a map rebuild.
export const applyLandPaneOpacity = (map, rawOpacity) => {
  const opacity = Math.max(20, Math.min(100, Number(rawOpacity) || 20));
  const pane = map?.getPane?.('land-constraints');
  if (!pane?.style) return false;
  pane.style.opacity = String(opacity / 100);
  pane.style.willChange = 'opacity';
  return true;
};

export const applyRegionalClusterPaneOpacity = (map, rawOpacity) => {
  const opacity = Math.max(15, Math.min(85, Number(rawOpacity) || 48));
  const pane = map?.getPane?.('regional-clusters');
  if (!pane?.style) return false;
  pane.style.opacity = String(opacity / 100);
  pane.style.willChange = 'opacity';
  return true;
};

export const applyMapDisplayPaneVisibility = (map, { nodes = true, boundaries = true } = {}) => {
  const nodePane = map?.getPane?.('network-nodes');
  const boundaryPane = map?.getPane?.('network-boundaries');
  if (nodePane?.style) nodePane.style.display = nodes ? '' : 'none';
  if (boundaryPane?.style) boundaryPane.style.display = boundaries ? '' : 'none';
  return Boolean(nodePane?.style && boundaryPane?.style);
};

const fitAtlasBounds = (map, bounds, { padding = 42, maxZoom = 10, animate = true } = {}) => {
  if (!map || !bounds?.isValid?.()) return false;
  const requestedZoom = map.getBoundsZoom(bounds, false, L.point(padding, padding));
  const targetZoom = Math.max(
    ATLAS_MIN_ZOOM,
    Math.min(maxZoom, Number.isFinite(requestedZoom) ? requestedZoom : maxZoom),
  );
  map.setView(bounds.getCenter(), targetZoom, { animate: animate && animateAtlasMap() });
  return true;
};

const MapController = ({ facilities, focusLocation, onFocusLocationApplied, autoZoomEnabled, autoZoomScopeKey, lastFitSignatureRef, loading }) => {
  const map = useMap();
  const lastFocusLocationRef = useRef(null);
  const previousAutoZoomEnabledRef = useRef(autoZoomEnabled);

  useEffect(() => {
    // Explicitly re-enabling auto-fit is a new user choice, unlike a data refresh.
    if (previousAutoZoomEnabledRef.current !== autoZoomEnabled) {
      lastFitSignatureRef.current = '';
      previousAutoZoomEnabledRef.current = autoZoomEnabled;
    }
  }, [autoZoomEnabled, lastFitSignatureRef]);

  // Auto-zoom follows Geography only. Domain, carrier, land and display filters
  // deliberately keep the current camera so layer comparisons do not jump.
  useEffect(() => {
    if (!autoZoomEnabled || loading || focusLocation) return;
    if (!Array.isArray(facilities) || facilities.length === 0) return;
    const sig = String(autoZoomScopeKey || 'unscoped');
    if (sig === lastFitSignatureRef.current) return;

    const points = networkFitPoints(facilities, { preferEurope: autoZoomScopeKey !== 'no-geography' });
    if (!points.length) return;
    const bounds = L.latLngBounds(points);
    if (!bounds.isValid()) return;
    // Claim before Leaflet emits movement events, just like explicit commands.
    lastFitSignatureRef.current = sig;
    fitAtlasBounds(map, bounds, { padding: 50, maxZoom: 10, animate: true });
  }, [facilities, autoZoomEnabled, autoZoomScopeKey, focusLocation, loading, map, lastFitSignatureRef]);

  useEffect(() => {
    if (!focusLocation || lastFocusLocationRef.current === focusLocation) return;
    const lat = Number(focusLocation.latitude);
    const lng = Number(focusLocation.longitude);
    const zoom = Number(focusLocation.zoom || 8);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    // Dataset switches can span several zoom levels.  A Leaflet fly animation
    // keeps scaled tiles from the previous level alive long enough to create
    // oversized, duplicated basemap labels.  An immediate view change is both
    // faster for carrier/country switching and visually stable.
    lastFocusLocationRef.current = focusLocation;
    lastFitSignatureRef.current = autoZoomScopeKey;
    map.stop();
    map.setView([lat, lng], zoom, { animate: false });
    onFocusLocationApplied?.(focusLocation);
  }, [map, focusLocation, onFocusLocationApplied, autoZoomScopeKey, lastFitSignatureRef]);

  return null;
};


const MapTelemetry = ({ onZoomChange, onBoundsChange, onInteractionChange }) => {
  const map = useMap();
  useMapTelemetry(map, { onZoomChange, onBoundsChange, onInteractionChange });
  return null;
};

// Streams the live map center+zoom up to the parent (lat/lng/zoom) so the
// chatbot's mapContext can resolve "here" / "this area". Fires on first load
// and on every move/zoom; throttled implicitly by Leaflet's *end events.
const MapViewBridge = ({ onViewChange }) => {
  const map = useMap();
  React.useEffect(() => {
    if (!onViewChange) return;
    const emit = () => {
      const c = map.getCenter();
      onViewChange({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    emit();
    map.on('moveend', emit);
    map.on('zoomend', emit);
    return () => {
      map.off('moveend', emit);
      map.off('zoomend', emit);
    };
  }, [map, onViewChange]);
  return null;
};

// Standalone color resolver — used by both the map and the popup
const getFacilityColor = (facility) => {
  if (facility?.carrier_color) return facility.carrier_color;
  const carrierColors = {
    'coal':       '#78716c', // warm stone
    'lignite':    '#92400e', // dark brown
    'nuclear':    '#22c55e', // green – clean energy glow
    'oil':        '#fb923c', // orange
    'CCGT':       '#f97316', // bright orange – gas flame
    'OCGT':       '#fbbf24', // gold
    'biomass':    '#4ade80', // lime green
    'solar':      '#facc15', // warm yellow-gold
    'onwind':     '#38bdf8', // sky blue
    'offwind-ac': '#7dd3fc', // light sky blue
    'offwind-dc': '#818cf8', // indigo
    'hydro':      '#a78bfa', // soft purple
    'ror':        '#67e8f9', // cyan (Run-of-River)
    'geothermal': '#f87171', // coral
    'H2':         '#e879f9', // fuchsia – hydrogen
    'methane_grid': '#38bdf8',
    'methane_border_point': '#60a5fa',
    'methane_compressor': '#fbbf24',
    'methane_demand': '#fb7185',
    'methane_production': '#4ade80',
    'lng_supply': '#22d3ee',
    'methane_storage': '#a78bfa',
  };
  if (carrierColors[facility.type]) return carrierColors[facility.type];
  const typeColors = {
    'Generator':   '#22c55e', // green
    'Load':        '#f87171', // coral
    'Storage':     '#a78bfa', // purple
    'StorageUnit': '#a78bfa', // purple
    'Transmission':'#facc15', // gold
    'Node':        '#38bdf8', // sky blue
    'Bus':         '#67e8f9', // cyan
    'Substation':  '#4ade80', // lime green
    'Transformer': '#fb923c', // orange
    'Onshore':     '#22c55e', // green
    'Offshore':    '#38bdf8', // sky blue
    'VirtualBus':  '#f87171', // coral
  };
  return typeColors[facility.type] || '#94a3b8'; // neutral slate
};

const firstPositiveNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

const MAP_ACCESSIBILITY_ATTRIBUTES = {
  role: 'region',
  'aria-label': 'Interactive infrastructure map',
  'aria-keyshortcuts': 'ArrowUp ArrowDown ArrowLeft ArrowRight + -',
};

const applyMapAccessibility = (map) => {
  const container = map?.getContainer?.();
  if (!container?.setAttribute) return () => {};

  const previous = Object.fromEntries(
    Object.keys(MAP_ACCESSIBILITY_ATTRIBUTES).map(name => [name, container.getAttribute(name)])
  );
  Object.entries(MAP_ACCESSIBILITY_ATTRIBUTES).forEach(([name, value]) => container.setAttribute(name, value));

  return () => {
    Object.entries(MAP_ACCESSIBILITY_ATTRIBUTES).forEach(([name, value]) => {
      // Preserve attributes if another owner updated the container after us.
      if (container.getAttribute(name) !== value) return;
      if (previous[name] === null) container.removeAttribute(name);
      else container.setAttribute(name, previous[name]);
    });
  };
};

const MapInstanceBridge = ({ onReady }) => {
  const map = useMap();
  useEffect(() => {
    const removeAccessibility = applyMapAccessibility(map);
    onReady?.(map);
    return () => {
      removeAccessibility();
      onReady?.(null);
    };
  }, [map, onReady]);
  return null;
};

const RegionalClusterOpacityBridge = ({ opacity }) => {
  const map = useMap();
  useEffect(() => {
    applyRegionalClusterPaneOpacity(map, opacity);
  }, [map, opacity]);
  return null;
};

const MapDisplayPaneBridge = ({ nodes, boundaries }) => {
  const map = useMap();
  useEffect(() => {
    applyMapDisplayPaneVisibility(map, { nodes, boundaries });
  }, [map, nodes, boundaries]);
  return null;
};

const LandInspectBridge = ({ enabled, onInspect, countries = [] }) => {
  const pending = useRef(null);
  const countryKey = countries.join(',');
  useEffect(() => {
    onInspect?.(null);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [enabled, countryKey, onInspect]);
  useMapEvents({
    click: async (event) => {
      if (!enabled || !onInspect) return;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      onInspect({ loading: true, coordinate: event.latlng });
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const query = new URLSearchParams({
          lat: String(event.latlng.lat),
          lng: String(event.latlng.lng),
        });
        if (countries.length) query.set('countries', countries.join(','));
        const response = await fetch(`${API_BASE_URL}/api/atlas/land/inspect?${query}`, { signal: controller.signal });
        const payload = await response.json();
        if (pending.current !== controller) return;
        if (controller.signal.aborted) throw new Error('Land inspection timed out. Please retry.');
        if (!response.ok) throw new Error(payload?.error || 'Could not inspect this location.');
        onInspect({ loading: false, data: payload, coordinate: event.latlng });
      } catch (error) {
        if (pending.current === controller) onInspect({ loading: false,
          error: controller.signal.aborted ? 'Land inspection timed out. Please retry.' : error.message, coordinate: event.latlng });
      } finally { clearTimeout(timeout); }
    },
  });
  return null;
};


let popupCardSequence = 0;
export const buildGeoJsonPopupContent = (facility) => {
  if (!facility) return '<div style="font-size:12px;color:#d1d5db;">No details</div>';
  const toNumber = (v) => {
    return publishedNumber(typeof v === 'string' ? v.replace(/,/g, '') : v);
  };
  const formatNum = (v, digits = 2) => {
    const n = toNumber(v);
    if (n == null) return '—';
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
  };
  const getRows = (item) => Array.isArray(item?.properties) ? item.properties : [];
  const findProp = (rows, keys = []) => {
    for (const row of rows) {
      const k = String(row?.Property || '').trim().toLowerCase();
      if (!k) continue;
      if (keys.some((key) => k === String(key).trim().toLowerCase())) return row;
    }
    return null;
  };
  const contextRows = (rows) => rows
    .filter((r) => String(r?.Property || '').startsWith('[Context]'))
    .map((r) => ({
      key: String(r?.Property || '').replace('[Context] ', ''),
      value: r?.Value,
      units: r?.Units || '',
    }))
    .filter((r) => r.key && r.value !== '' && r.value != null);

  const kpiCard = (label, value, unit, tone = 'blue') => {
    const tones = {
      blue: { ring: '#60a5fa', halo: 'rgba(59,130,246,0.16)', fg: '#dbeafe' },
      amber: { ring: '#fbbf24', halo: 'rgba(245,158,11,0.16)', fg: '#fef3c7' },
      emerald: { ring: '#34d399', halo: 'rgba(16,185,129,0.16)', fg: '#bbf7d0' },
    };
    const t = tones[tone] || tones.blue;
    const txt = String(value == null ? '—' : value).trim();
    return `
      <div style="flex:1;min-width:0;padding:10px 5px;border:1px solid rgba(148,163,184,0.2);border-radius:8px;background:${t.halo};text-align:center;">
        <div style="font-size:16px;font-weight:700;color:${t.fg};line-height:1.2;overflow-wrap:anywhere;">${escapeHtml(txt)}</div>
        ${unit ? `<div style="font-size:10px;color:#cbd5e1;margin-top:3px;">${escapeHtml(unit)}</div>` : ''}
        <div style="font-size:10px;color:#cbd5e1;margin-top:5px;">${escapeHtml(label)}</div>
      </div>
    `;
  };

  const barRow = (label, value, maxValue, color = '#38bdf8', suffix = '', digits = 1) => {
    const safeVal = Number.isFinite(value) ? Math.max(0, value) : 0;
    const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
    const pct = Math.max(3, Math.min(100, (safeVal / safeMax) * 100));
    return `
      <div style="margin-top:4px;">
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#cbd5e1;">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:56%;">${escapeHtml(label)}</span>
          <span>${escapeHtml(formatNum(safeVal, digits))}${suffix ? ` ${escapeHtml(suffix)}` : ''}</span>
        </div>
        <div style="margin-top:3px;height:5px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:999px;"></div>
        </div>
      </div>
    `;
  };

  const formatDemandValue = (value, unit = '') => {
    const numeric = toNumber(value);
    if (numeric == null) return '—';
    const magnitude = Math.abs(numeric);
    const digits = magnitude >= 10 ? 2 : magnitude >= 0.1 ? 3 : magnitude >= 0.001 ? 4 : 6;
    const rendered = numeric.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
    return unit ? `${rendered} ${unit}` : rendered;
  };

  const renderDemandBreakdown = (item) => {
    const sectors = Array.isArray(item?.demand_breakdown) ? item.demand_breakdown : [];
    if (!sectors.length) return item?.provisional_demand
      ? '<p style="margin-top:8px;color:#fde68a;font-size:11px;">Sector/subsector breakdown unavailable for this country. Provisional total demand is still shown.</p>'
      : '';
    const sectorColors = {
      Residential: '#60a5fa',
      Tertiary: '#a78bfa',
      Industry: '#f97316',
      Transport: '#34d399',
    };
    const explicitTotal = sectors.reduce((sum, sector) => sum + Math.max(0, Number(sector?.annual_energy_gwh) || 0), 0);
    const total = Math.max(0, Number(item?.annual_energy_gwh) || explicitTotal) || 1;
    return `
      <div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.08);">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;">Demand composition</div>
          <div style="font-size:10px;color:#64748b;">${escapeHtml(item?.demand_scenario || '')}${item?.demand_year ? ` · ${escapeHtml(item.demand_year)}` : ''}</div>
        </div>
        ${sectors.map((sector) => {
          const name = String(sector?.name || 'Other');
          const sectorShare = Math.max(0, Number(sector?.share) || 0);
          const annual = sector?.annual_energy_gwh != null
            ? Math.max(0, Number(sector.annual_energy_gwh) || 0)
            : total * sectorShare;
          const share = sectorShare > 0 ? sectorShare * 100 : (total > 0 ? (annual / total) * 100 : 0);
          const color = sectorColors[name] || '#94a3b8';
          const subsectors = Array.isArray(sector?.subsectors) ? sector.subsectors : [];
          return `
            <details style="margin-top:6px;">
              <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;font-size:11px;color:#dbeafe;">
                <span style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block;"></span>
                <span style="flex:1;">${escapeHtml(name)}</span>
                <span style="color:#94a3b8;">${share.toFixed(1)}% · ${escapeHtml(formatDemandValue(annual, 'GWh'))}</span>
              </summary>
              ${subsectors.map((subsector) => {
                const subsectionAnnual = subsector?.annual_energy_gwh != null
                  ? Math.max(0, Number(subsector.annual_energy_gwh) || 0)
                  : total * Math.max(0, Number(subsector?.share_of_total) || 0);
                return `
                <div style="display:flex;justify-content:space-between;gap:8px;margin:3px 0 0 14px;font-size:10px;color:#94a3b8;">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%;">${escapeHtml(subsector?.name || 'Other')}</span>
                  <span>${escapeHtml(formatDemandValue(subsectionAnnual, 'GWh'))}</span>
                </div>
              `;}).join('')}
            </details>
          `;
        }).join('')}
      </div>
    `;
  };

  const renderOverview = (item, locationItems) => {
    const rows = getRows(item);
    const isDemand = String(item?.component_type || item?.type || '').toLowerCase() === 'load'
      || Boolean(item?.provisional_demand);
    const pNom = findProp(rows, ['P Nom', 'P Nom Optimal', 'E Nom']);
    const marginal = findProp(rows, ['Marginal Cost', '[Context] Cost Marginal']);
    const demandAvg = findProp(rows, ['[Context] Demand Avg', 'P Set']);
    const annualDemand = findProp(rows, ['Annual allocation']);
    const spatialWeight = findProp(rows, ['Spatial weight']);
    // Prefer the unrounded payload fields. The generic property table stores
    // P Set at two decimals, which turns many valid small allocations into 0.00.
    const demandAvgValue = item?.p_set != null ? item.p_set : demandAvg?.Value;
    const demandAvgUnit = item?.p_set != null ? 'MW' : (demandAvg?.Units || '');
    const annualDemandValue = item?.annual_energy_gwh != null ? item.annual_energy_gwh : annualDemand?.Value;
    const annualDemandUnit = item?.annual_energy_gwh != null ? 'GWh' : (annualDemand?.Units || '');
    const spatialWeightValue = item?.spatial_weight != null
      ? Number(item.spatial_weight) * 100
      : spatialWeight?.Value;
    const corePairs = [
      ['Type', item.component_type || item.type || '—'],
      ['Carrier', item.carrier_nice_name || item.carrier || '—'],
      ['Bus', item.bus || '—'],
      ['Country', item.country || '—'],
    ];
    const carrierCounts = {};
    for (const x of locationItems) {
      const ck = String(x?.carrier_nice_name || x?.carrier || x?.type || 'unknown');
      carrierCounts[ck] = (carrierCounts[ck] || 0) + 1;
    }
    const mixRows = Object.entries(carrierCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const mixMax = Math.max(1, ...mixRows.map(([, c]) => c));

    const cbcCountries = {};
    for (const row of rows) {
      const key = String(row?.Property || '');
      if (/^\[CBC \d+\] Foreign Country$/i.test(key) || /^\[Link \d+\] Foreign Country$/i.test(key)) {
        const cc = String(row?.Value || '').trim();
        if (cc) cbcCountries[cc] = (cbcCountries[cc] || 0) + 1;
      }
    }
    const cbcRows = Object.entries(cbcCountries).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const cbcMax = Math.max(1, ...cbcRows.map(([, c]) => c));

    return `
      ${isDemand && item?.provisional_demand ? '<p style="margin:0 0 10px;padding:7px 9px;border:1px solid rgba(253,230,138,.3);border-radius:6px;color:#fde68a;font-size:11px;line-height:1.4;">Provisional estimate, not measured consumption. Flat 8,760-hour profile.</p>' : ''}
      <div style="display:flex;gap:6px;margin-top:2px;">
        ${isDemand
          ? kpiCard('Annual demand', formatDemandValue(annualDemandValue), annualDemandUnit, 'blue')
          : kpiCard('Capacity', pNom?.Value ?? '—', pNom?.Units || '', 'blue')}
        ${kpiCard('Avg demand', isDemand ? formatDemandValue(demandAvgValue) : (demandAvg?.Value ?? '—'), demandAvgUnit, 'emerald')}
        ${isDemand
          ? kpiCard('Spatial share', formatDemandValue(spatialWeightValue), spatialWeightValue != null ? '%' : '', 'amber')
          : kpiCard('Marginal', marginal?.Value ?? '—', marginal?.Units || '', 'amber')}
      </div>

      <div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.08);">
        ${corePairs.map(([k, v]) => `
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#d1d5db;">
            <span style="color:#9ca3af;">${escapeHtml(k)}</span><span style="text-align:right;">${escapeHtml(v)}</span>
          </div>`).join('')}
      </div>

      ${mixRows.length > 0 ? `
        <div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;">Carrier mix at location</div>
          ${mixRows.map(([label, count]) => barRow(label, count, mixMax, '#60a5fa', 'comp')).join('')}
        </div>
      ` : ''}

      ${isDemand ? renderDemandBreakdown(item) : ''}

      ${cbcRows.length > 0 ? `
        <div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;">Interconnectors</div>
          ${cbcRows.map(([label, count]) => barRow(label, count, cbcMax, '#f59e0b', 'links')).join('')}
        </div>
      ` : ''}
    `;
  };

  const renderCosts = (item) => {
    const rows = getRows(item);
    const contexts = contextRows(rows).filter((r) => /cost|technology|lifetime|efficiency/i.test(r.key));
    const directRows = [
      findProp(rows, ['Capital Cost']),
      findProp(rows, ['Marginal Cost']),
      findProp(rows, ['Efficiency']),
      findProp(rows, ['Lifetime']),
    ].filter(Boolean);
    const csvSources = item?.csv_context_sources?.files || {};
    const csvMatched = Array.isArray(item?.csv_context_sources?.matched) ? item.csv_context_sources.matched : [];
    const merged = [
      ...contexts.map((r) => ({ key: r.key, value: r.value, units: r.units })),
      ...directRows.map((r) => ({ key: r.Property, value: r.Value, units: r.Units || '' })),
    ];
    if (!merged.length && !Object.keys(csvSources).length) {
      return '<div style="font-size:12px;color:#94a3b8;">No cost context available for this component.</div>';
    }
    return `
      <div>
        ${merged.slice(0, 12).map((r) => `
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#d1d5db;">
            <span style="color:#9ca3af;">${escapeHtml(r.key)}</span>
            <span style="text-align:right;">${escapeHtml(r.value)}${r.units ? ` ${escapeHtml(r.units)}` : ''}</span>
          </div>
        `).join('')}
      </div>
      ${Object.keys(csvSources).length > 0 ? `
        <div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Sources</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${Object.entries(csvSources).map(([k, v]) => {
              const matched = csvMatched.includes(k);
              const fg = matched ? '#86efac' : '#94a3b8';
              const bg = matched ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)';
              const br = matched ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.18)';
              return `<span title="${escapeHtml(v || '')}" style="font-size:10px;color:${fg};border:1px solid ${br};background:${bg};padding:2px 6px;border-radius:999px;">${escapeHtml(k)}</span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;
  };

  const renderTimeSeries = (item) => {
    const rows = getRows(item);
    const avg = findProp(rows, ['[Context] Demand Avg']);
    const peak = findProp(rows, ['[Context] Demand Peak']);
    const latest = findProp(rows, ['[Context] Demand Latest']);
    const values = [
      { label: 'Average', row: avg, color: '#34d399' },
      { label: 'Peak', row: peak, color: '#f59e0b' },
      { label: 'Latest', row: latest, color: '#60a5fa' },
    ].filter((x) => x.row);
    if (!values.length) {
      const provisionalAverage = toNumber(item?.p_set);
      if (Boolean(item?.provisional_demand) && provisionalAverage != null) {
        return `
          <div style="font-size:11px;color:#9ca3af;margin-bottom:5px;">Provisional flat profile</div>
          ${barRow('Every hour', provisionalAverage, Math.max(provisionalAverage, 1e-9), '#34d399', 'MW', 6)}
          <div style="margin-top:8px;font-size:10px;color:#9ca3af;">The current placeholder repeats this average value for all 8,760 hours. It will be replaced when the NUTS3 hourly demand input is connected.</div>
        `;
      }
      return '<div style="font-size:12px;color:#94a3b8;">No demand time-series summary available for this component.</div>';
    }
    const maxVal = Math.max(1, ...values.map((x) => toNumber(x.row?.Value) || 0));
    const unit = values[0]?.row?.Units || '';
    return `
      <div style="font-size:11px;color:#9ca3af;margin-bottom:5px;">Demand summary (${escapeHtml(unit || 'MW')})</div>
      ${values.map((x) => barRow(x.label, toNumber(x.row?.Value) || 0, maxVal, x.color, unit)).join('')}
      <div style="margin-top:8px;font-size:10px;color:#9ca3af;">Summary of the available demand context; this is not a full hourly profile.</div>
    `;
  };

  const renderTabbedCard = (item, locationItems, includeTitle = true) => {
    const name = escapeHtml(item.name || item.id || 'Component');
    const tabs = ['overview', 'costs', 'time'];
    const labels = { overview: 'Overview', costs: 'Costs', time: 'Time-series' };
    const card = document.createElement('div');
    card.style.minWidth = '0';
    card.style.maxWidth = '100%';
    card.style.lineHeight = '1.35';
    if (includeTitle) {
      const ttl = document.createElement('div');
      ttl.style.fontWeight = '700';
      ttl.style.fontSize = '13px';
      ttl.style.color = '#f9fafb';
      ttl.style.marginBottom = '6px';
      ttl.textContent = name;
      card.appendChild(ttl);
    }

    const chipWrap = document.createElement('div');
    chipWrap.style.display = 'flex';
    chipWrap.style.gap = '6px';
    chipWrap.style.flexWrap = 'wrap';
    chipWrap.style.marginBottom = '8px';
    const mkChip = (txt, fg, bg, br) => `<span style="font-size:10px;color:${fg};background:${bg};border:1px solid ${br};padding:2px 6px;border-radius:999px;">${escapeHtml(txt)}</span>`;
    chipWrap.innerHTML = [
      mkChip(item.component_type || item.type || '—', '#dbeafe', 'rgba(59,130,246,0.15)', 'rgba(59,130,246,0.35)'),
      mkChip(item.carrier_nice_name || item.carrier || '—', '#fef3c7', 'rgba(245,158,11,0.15)', 'rgba(245,158,11,0.35)'),
      mkChip(item.country || '—', '#cbd5e1', 'rgba(148,163,184,0.15)', 'rgba(148,163,184,0.28)'),
    ].join('');
    card.appendChild(chipWrap);

    const tabsWrap = document.createElement('div');
    tabsWrap.style.display = 'grid';
    tabsWrap.style.gridTemplateColumns = '1fr 1fr 1fr';
    tabsWrap.style.gap = '4px';
    tabsWrap.style.background = 'rgba(255,255,255,0.05)';
    tabsWrap.style.padding = '3px';
    tabsWrap.style.border = '1px solid rgba(255,255,255,0.12)';
    tabsWrap.style.borderRadius = '10px';

    const panel = document.createElement('div');
    const cardId = `atlas-asset-card-${++popupCardSequence}`;
    tabsWrap.setAttribute('role', 'tablist');
    tabsWrap.setAttribute('aria-label', 'Component details');
    panel.id = `${cardId}-panel`;
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    panel.style.marginTop = '8px';
    panel.style.border = '1px solid rgba(255,255,255,0.1)';
    panel.style.borderRadius = '10px';
    panel.style.padding = '8px';
    panel.style.background = 'rgba(8,16,24,0.35)';

    let active = 'overview';
    const renderPanel = () => {
      if (active === 'overview') panel.innerHTML = renderOverview(item, locationItems);
      else if (active === 'costs') panel.innerHTML = renderCosts(item);
      else panel.innerHTML = renderTimeSeries(item);
      Array.from(tabsWrap.children).forEach((node) => {
        const isActive = node.getAttribute('data-tab') === active;
        node.setAttribute('aria-selected', String(isActive));
        node.tabIndex = isActive ? 0 : -1;
        if (isActive) panel.setAttribute('aria-labelledby', node.id);
        node.style.background = isActive ? 'rgba(255,255,255,0.16)' : 'transparent';
        node.style.color = isActive ? '#f9fafb' : '#9ca3af';
        node.style.borderColor = isActive ? 'rgba(255,255,255,0.25)' : 'transparent';
      });
    };

    tabs.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = `${cardId}-${t}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', panel.id);
      btn.setAttribute('data-tab', t);
      btn.style.fontSize = '11px';
      btn.style.padding = '5px 0';
      btn.style.borderRadius = '7px';
      btn.style.border = '1px solid transparent';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all .12s ease';
      btn.textContent = labels[t];
      btn.addEventListener('click', () => {
        active = t;
        renderPanel();
      });
      btn.addEventListener('keydown', (event) => {
        const index = tabs.indexOf(t);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next == null) return;
        event.preventDefault();
        event.stopPropagation(); // Navigation within the popup must not pan the map.
        active = tabs[next];
        renderPanel();
        tabsWrap.children[next].focus();
      });
      tabsWrap.appendChild(btn);
    });
    card.appendChild(tabsWrap);
    card.appendChild(panel);
    renderPanel();
    return card;
  };

  const sameLocation = Array.isArray(facility.sameLocationFacilities) ? facility.sameLocationFacilities : [];
  const facilityId = String(facility?.id || '');
  const locationItems = sameLocation.length > 0
    ? [facility, ...sameLocation.filter((item) => String(item?.id || '') !== facilityId)]
    : [facility];
  if (typeof document === 'undefined') {
    return `<div style="min-width:250px;line-height:1.35;">${escapeHtml(facility.name || facility.id || 'Component')}</div>`;
  }

  const root = document.createElement('div');
  root.style.minWidth = '0';
  root.style.width = 'min(350px, calc(100vw - 72px))';
  root.style.maxWidth = '100%';
  root.style.lineHeight = '1.35';

  const heading = document.createElement('div');
  heading.style.fontWeight = '700';
  heading.style.fontSize = '14px';
  heading.style.color = '#f9fafb';
  heading.textContent = String(facility.bus || facility.name || facility.id || 'Location');
  root.appendChild(heading);

  const sub = document.createElement('div');
  sub.style.fontSize = '11px';
  sub.style.color = '#94a3b8';
  sub.style.marginTop = '2px';
  sub.textContent = `${locationItems.length} component${locationItems.length > 1 ? 's' : ''} at this location`;
  root.appendChild(sub);

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Component at this location');
  select.style.marginTop = '8px';
  select.style.width = '100%';
  select.style.padding = '6px 8px';
  select.style.borderRadius = '8px';
  select.style.border = '1px solid rgba(255,255,255,0.15)';
  select.style.background = 'rgba(8,16,24,0.85)';
  select.style.color = '#e5e7eb';
  select.style.fontSize = '12px';
  locationItems.forEach((item, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${item.carrier_nice_name || item.carrier || item.type || 'Component'} • ${item.component_type || item.type || ''}`;
    select.appendChild(opt);
  });
  if (locationItems.length > 1) root.appendChild(select);

  const panelHolder = document.createElement('div');
  panelHolder.style.marginTop = '8px';
  root.appendChild(panelHolder);

  const renderCurrent = () => {
    panelHolder.innerHTML = '';
    const idx = Math.max(0, Math.min(locationItems.length - 1, Number(select.value || 0)));
    const selected = locationItems[idx];
    panelHolder.appendChild(renderTabbedCard(selected, locationItems, false));
  };
  select.addEventListener('input', renderCurrent);
  select.addEventListener('change', renderCurrent);
  renderCurrent();
  return root;
};


// Forwards right-click (contextmenu) on the map with lat/lon + pixel coords
// (relative to the map container) so the parent can render a positioned menu.
// A left-click anywhere on the map signals dismissal via onContextMenu(null).
const RegionContextBridge = ({ onContextMenu }) => {
  const map = useMap();
  useMapEvents({
    contextmenu: (e) => {
      if (!onContextMenu) return;
      const cp = map.latLngToContainerPoint(e.latlng);
      onContextMenu({ lat: e.latlng.lat, lon: e.latlng.lng, x: cp.x, y: cp.y });
    },
    click: () => {
      if (onContextMenu) onContextMenu(null);
    },
  });
  return null;
};

const EnhancedLeafletMapContent = ({
  facilities = [],
  selectedNode,
  onNodeSelect,
  mapLoaded,
  selectedNodes = [],
  onNodeSelection,
  connections = [],
  lineMetricEnabled = false,
  onConnectionClick,
  linePropertiesByChildName,
  activeDataLayer = 'facilities',
  showGenerationMix = false,
  mapViewMode = 'our-model',
  marketPrices = {},
  generationMix = {},
  transmissionFlows = [],
  onLocationDetected,
  editableNodes = [],
  setEditableNodes = () => { },
  pypsaLoading = false,
  geoJsonOverlays = [],
  regionalClusterOverlay = null,
  activeCountryCode = '',
  activeCountryCodes = [],
  focusLocation = null,
  viewportCommand = null,
  onViewportCommandApplied = null,
  onFocusLocationApplied = null,
  autoZoomEnabled = false,
  performanceMode = false,
  networkResolution = '',
  showNodeMarkers = true,
  showGeographicBoundaries = true,
  onMapViewChange = null,
  onRenderStatsChange = null,
  regionCenter = null,
  regionRadiusKm = 120,
  regionManifest = null,
  regionSolving = false,
  onRegionContextMenu = null,
  onRegionCenterChange = null,
  landConstraints = null,
  controlsHidden = false,
  panelsHidden = false,
  popupDismissRequest = 0,
  onPopupVisibilityChange = null,
  onLandConstraintsChange = null,
  onLandOpacityCommit = null,
  gridAccess = null,
  onGridAccessChange = null,
}) => {
  const [zoomLevel, setZoomLevel] = useState(5); // matches immutable MapContainer initial zoom
  const [mapInstance, setMapInstance] = useState(null);
  // Own every vector renderer, including custom panes, so a queued redraw
  // cannot outlive the map. Keep their panes mounted across filter changes.
  const atlasRenderers = useMemo(() => ({
    base: createAtlasCanvas(),
    countries: createAtlasCanvas({ pane: 'loaded-country-context' }),
    boundaries: createAtlasCanvas({ pane: 'network-boundaries' }),
    clusters: createAtlasCanvas({ pane: 'regional-clusters' }),
    nodes: createAtlasCanvas({ pane: 'network-nodes' }),
    landContext: createAtlasCanvas({ pane: 'land-country-context' }),
    access: createAtlasCanvas({ pane: 'grid-access-sites' }),
    region: createAtlasCanvas({ pane: 'region-overlay-pane' }),
  }), []);
  const [lineRenderProgress, setLineRenderProgress] = useState(null);
  const [lineRetirementProgress, setLineRetirementProgress] = useState(null);
  const [renderDiagnosticsEnabled] = useState(() => mapDiagnosticsEnabled(
    typeof window === 'undefined' ? '' : window.location.search,
  ));
  // Shared by automatic fits, EMIL commands, and map buttons. A deliberate
  // navigation consumes any pending auto-fit for the same country selection.
  const lastFitSignatureRef = useRef('');
  const autoZoomScopeKey = useMemo(() => (
    (Array.isArray(activeCountryCodes) ? activeCountryCodes : [])
      .map((code) => String(code || '').trim().toUpperCase())
      .filter(Boolean)
      .sort()
      .join(',') || 'no-geography'
  ), [activeCountryCodes]);
  const moveMapManually = useCallback((move) => {
    if (!mapInstance) return;
    lastFitSignatureRef.current = autoZoomScopeKey;
    mapInstance.stop();
    move();
  }, [mapInstance, autoZoomScopeKey]);
  const fitToVisibleNetwork = useCallback((event) => {
    if (mapInstance) {
      lastFitSignatureRef.current = autoZoomScopeKey;
      mapInstance.stop();
    }
    if (!mapInstance || !Array.isArray(facilities) || facilities.length === 0) {
      mapInstance?.setView([52, 8], 5, { animate: !performanceMode && animateAtlasMap() });
      return;
    }
    const points = networkFitPoints(facilities, {
      preferEurope: autoZoomScopeKey !== 'no-geography' && !event?.shiftKey,
    });
    if (!points.length) {
      mapInstance?.setView([52, 8], 5, { animate: !performanceMode && animateAtlasMap() });
      return;
    }
    const bounds = L.latLngBounds(points);
    if (!fitAtlasBounds(mapInstance, bounds, { padding: 28, maxZoom: 9, animate: !performanceMode })) {
      mapInstance.setView([52, 8], 5, { animate: !performanceMode && animateAtlasMap() });
    }
  }, [mapInstance, facilities, autoZoomScopeKey, performanceMode]);
  const [mapBounds, setMapBounds] = useState(null); // current viewport bounding box
  const markerViewportBounds = usePopupViewportBounds(mapInstance, mapBounds, onPopupVisibilityChange, popupDismissRequest);
  const [europeGeoJson, setEuropeGeoJson] = useState(null);
  const [landInspectMode, setLandInspectMode] = useState(false);
  const [landInspection, setLandInspection] = useState(null);
  const [landViewportStats, setLandViewportStats] = useState(null);
  const landTileLayerRef = useRef(null);
  const landOpacityRangeRef = useRef(null);
  const landOpacityLabelRef = useRef(null);
  const committedLandOpacityRef = useRef(null);
  const capacityStylingEnabled = String(networkResolution || '').trim().toLowerCase() === 'full';
  const markerIconCacheRef = useRef(new BoundedMapCache(512));
  const generationMixIconCacheRef = useRef(new BoundedMapCache(2048));
  const regionCircleRef = useRef(null);
  const regionCenterPreviewRef = useRef(null);
  const lastExecutedViewportCommandIdRef = useRef(null);
  const regionCenterHandleIcon = useMemo(() => L.divIcon({
    className: 'region-center-handle',
    html: '<div style="width:10px;height:10px;border:2px solid #fbbf24;border-radius:50%;background:#f59e0b;box-shadow:0 0 8px rgba(251,191,36,0.65);"></div>',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  }), []);
  const landConfig = useMemo(() => ({
    enabled: Boolean(landConstraints?.enabled),
    panelOpen: Boolean(landConstraints?.panelOpen),
    categories: Array.isArray(landConstraints?.categories) ? landConstraints.categories : [],
    countries: Array.isArray(landConstraints?.countries)
      ? [...new Set(landConstraints.countries.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean))]
      : [],
    followMapCountries: landConstraints?.followMapCountries !== false,
    opacity: Number.isFinite(Number(landConstraints?.opacity)) ? Number(landConstraints.opacity) : 68,
    status: landConstraints?.status || null,
  }), [landConstraints]);
  const landCategoryMeta = useMemo(() => Object.fromEntries(
    (Array.isArray(landConfig.status?.categories) ? landConfig.status.categories : [])
      .map((category) => [category.id, category])
  ), [landConfig.status]);
  const landCountryOptions = useMemo(() => (
    (Array.isArray(landConfig.status?.countries) ? landConfig.status.countries : [])
      .filter((country) => country?.code && country?.name)
  ), [landConfig.status]);
  const landCountryName = useMemo(() => Object.fromEntries(
    landCountryOptions.map((country) => [String(country.code).toUpperCase(), country.name])
  ), [landCountryOptions]);
  const landCountryKey = landConfig.countries.join(',');
  const landScope = useMemo(() => landCountryScope(landConfig.countries, landConfig.status), [landCountryKey, landConfig.status]);
  const landApiVersion = landConfig.status?.api_version || '1.1';
  // Fetch one fully opaque raster for each actual data selection. Visual
  // opacity belongs to the Leaflet layer, so dragging the slider can reuse the
  // same browser/server tile cache instead of replacing and re-downloading the
  // complete visible tile set for every percentage point.
  const landTileUrl = useMemo(() => (
    `${API_BASE_URL}/api/atlas/land/tiles/{z}/{x}/{y}.png?v=${encodeURIComponent(landApiVersion)}&categories=${encodeURIComponent(landConfig.categories.join(','))}&opacity=100&countries=${encodeURIComponent(landCountryKey)}`
  ), [landApiVersion, landConfig.categories, landCountryKey]);
  const gridAccessConfig = useMemo(() => ({
    enabled: Boolean(gridAccess?.enabled),
    panelOpen: Boolean(gridAccess?.panelOpen),
    sides: Array.isArray(gridAccess?.sides) && gridAccess.sides.length
      ? gridAccess.sides : GRID_ACCESS_SIDE_KEYS,
    metric: gridAccess?.metric || 'pressure',
    projectScope: gridAccess?.projectScope === 'all' ? 'all' : 'future',
    status: gridAccess?.status || null,
    data: gridAccess?.data?.type === 'FeatureCollection'
      ? gridAccess.data : { type: 'FeatureCollection', features: [], meta: {} },
    loading: Boolean(gridAccess?.loading),
    error: String(gridAccess?.error || ''),
    onRetry: gridAccess?.onRetry,
    countryCodes: Array.isArray(gridAccess?.countryCodes) ? gridAccess.countryCodes : [],
  }), [gridAccess]);
  const gridAccessCoverageBySide = useMemo(() => {
    const result = {};
    for (const row of (Array.isArray(gridAccessConfig.status?.coverage) ? gridAccessConfig.status.coverage : [])) {
      if (!row?.side || !row?.country_code) continue;
      if (!result[row.side]) result[row.side] = [];
      if (!result[row.side].includes(row.country_code)) result[row.side].push(row.country_code);
    }
    return result;
  }, [gridAccessConfig.status]);
  const gridAccessScopedCoverage = useMemo(() => {
    const selectedCountries = new Set(gridAccessConfig.countryCodes);
    return [...new Set(gridAccessConfig.sides.flatMap((side) => gridAccessCoverageBySide[side] || []))]
      .filter((code) => !selectedCountries.size || selectedCountries.has(code))
      .sort();
  }, [gridAccessConfig.countryCodes, gridAccessConfig.sides, gridAccessCoverageBySide]);
  const gridAccessAllSidesSelected = GRID_ACCESS_SIDE_KEYS.every(
    (side) => gridAccessConfig.sides.includes(side),
  );
  const updateGridAccessConfig = useCallback((patch) => {
    onGridAccessChange?.(patch);
  }, [onGridAccessChange]);

  useEffect(() => {
    setLandViewportStats(null);
    if (!landConfig.enabled || !landScope.ready || !mapBounds) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams({
          west: String(mapBounds.getWest()),
          south: String(mapBounds.getSouth()),
          east: String(mapBounds.getEast()),
          north: String(mapBounds.getNorth()),
          zoom: String(zoomLevel),
        });
        if (landConfig.countries.length) query.set('countries', landCountryKey);
        const response = await fetch(`${API_BASE_URL}/api/atlas/land/viewport-stats?${query}`, { signal: controller.signal });
        const payload = await response.json();
        if (!controller.signal.aborted) setLandViewportStats(response.ok ? payload : { error: 'Visible-area sample unavailable. Please retry.' });
      } catch (error) {
        if (!controller.signal.aborted) setLandViewportStats({ error: 'Visible-area sample unavailable. Please retry.' });
      }
    // Coalesce wheel/button zoom bursts. Viewport statistics are contextual
    // evidence, not animation-critical, so one request after the camera settles
    // is preferable to starting and aborting a request at every zoom step.
    }, 900);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [landConfig.enabled, landScope.ready, landConfig.countries.length, landCountryKey, mapBounds, zoomLevel]);

  const updateLandConfig = useCallback((patch) => {
    onLandConstraintsChange?.(patch);
  }, [onLandConstraintsChange]);

  // Opacity is a presentation-only property. Preview it directly on Leaflet
  // while the range is moving; publishing every intermediate percentage to
  // App would reconcile the complete Atlas workspace for no data change.
  const previewLandOpacity = useCallback((rawValue) => {
    const opacity = Math.max(20, Math.min(100, Number(rawValue) || 20));
    if (landOpacityRangeRef.current) landOpacityRangeRef.current.value = String(opacity);
    if (landOpacityLabelRef.current) landOpacityLabelRef.current.textContent = `${Math.round(opacity)}%`;
    // Prefer a single GPU-composited pane update. The TileLayer fallback keeps
    // compatibility with older embedders that do not expose named panes.
    if (mapInstance && !applyLandPaneOpacity(mapInstance, opacity)) {
      landTileLayerRef.current?.setOpacity?.(opacity / 100);
    }
    return opacity;
  }, [mapInstance]);
  const commitLandOpacity = useCallback((rawValue) => {
    const opacity = previewLandOpacity(rawValue);
    if (committedLandOpacityRef.current === opacity) return;
    committedLandOpacityRef.current = opacity;
    // The UI path does not alter land data. Let App persist it through its
    // non-rendering cache; retain the state callback as a compatibility path
    // for embedders that have not adopted the presentation callback yet.
    if (onLandOpacityCommit) onLandOpacityCommit(opacity);
    else updateLandConfig({ opacity, enabled: true });
  }, [onLandOpacityCommit, previewLandOpacity, updateLandConfig]);
  useEffect(() => {
    committedLandOpacityRef.current = landConfig.opacity;
    previewLandOpacity(landConfig.opacity);
  }, [landConfig.opacity, previewLandOpacity]);

  const toggleLandCategory = useCallback((category) => {
    const selected = landConfig.categories.includes(category);
    const categories = selected
      ? landConfig.categories.filter((item) => item !== category)
      : [...landConfig.categories, category];
    updateLandConfig({ categories, enabled: true });
  }, [landConfig.categories, updateLandConfig]);

  const overlayFeatureCollections = useMemo(() => (
    (Array.isArray(geoJsonOverlays) ? geoJsonOverlays : [])
      .map((overlay, index) => {
        const data = overlay?.feature_collection;
        if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) return null;
        const overlayName = String(overlay?.name || `geographic-overlay-${index}`);
        // Cluster-point overlays duplicate the actual network facilities. Keep
        // polygon/line context here and let the facility layer own all nodes so
        // zoom-level styling and resolution replacement have one source of truth.
        const features = /clusters\.geojson$/i.test(overlayName)
          ? data.features.filter((feature) => !String(feature?.geometry?.type || '').includes('Point'))
          : data.features;
        if (!features.length) return null;
        return {
          name: overlayName,
          data: features === data.features ? data : { ...data, features },
        };
      })
      .filter(Boolean)
  ), [geoJsonOverlays]);

  const europeGeometryRequired = Boolean(
    pypsaLoading
    || (showGeographicBoundaries && (Array.isArray(activeCountryCodes) ? activeCountryCodes.length : 0))
    || (landConfig.enabled && landConfig.countries.length)
    || (Array.isArray(viewportCommand?.countryCodes) && viewportCommand.countryCodes.length)
  );
  useEffect(() => {
    if (!europeGeometryRequired || europeGeoJson) return undefined;
    let active = true;
    loadEuropeBoundaries()
      .then((data) => { if (active) setEuropeGeoJson(data); })
      .catch((error) => {
        if (active) console.error('Failed to load europe.geojson:', error);
      });
    return () => { active = false; };
  }, [europeGeometryRequired, europeGeoJson]);

  const loadedCountryCodeSet = useMemo(() => new Set(
    (Array.isArray(activeCountryCodes) ? activeCountryCodes : [])
      .map((code) => String(code || '').trim().toUpperCase())
      .filter(Boolean),
  ), [activeCountryCodes]);
  const selectedCountryFeatureCollection = useMemo(() => {
    if (!europeGeoJson?.features?.length || !loadedCountryCodeSet.size) return null;
    const features = europeGeoJson.features.filter((feature) => (
      loadedCountryCodeSet.has(String(feature?.properties?.ISO2 || '').trim().toUpperCase())
    ));
    return features.length ? { type: 'FeatureCollection', features } : null;
  }, [europeGeoJson, loadedCountryCodeSet]);
  const countryOverview = zoomLevel <= 5;
  const countryBoundaryStyle = useCallback((feature) => {
    const code = String(feature?.properties?.ISO2 || '').trim().toUpperCase();
    const active = code === String(activeCountryCode || '').trim().toUpperCase();
    return {
      color: active ? '#facc15' : '#d9b915',
      weight: active ? (countryOverview ? 2.2 : 2.6) : (countryOverview ? 1.25 : 1.55),
      opacity: active ? 0.9 : 0.58,
      fillColor: '#facc15',
      fillOpacity: active ? (countryOverview ? 0.075 : 0.045) : (countryOverview ? 0.035 : 0.02),
    };
  }, [activeCountryCode, countryOverview]);

  // Explicit view commands from EMIL are intentionally separate from dataset
  // loading. This lets the assistant improve framing without changing which
  // countries, carriers, or layers are loaded.
  useEffect(() => {
    if (!mapInstance || !viewportCommand?.id) return;
    if (!shouldExecuteViewportCommand(lastExecutedViewportCommandIdRef.current, viewportCommand.id)) return;
    const moveOnce = (move) => {
      lastFitSignatureRef.current = autoZoomScopeKey;
      return applyViewportCommandOnce(
        lastExecutedViewportCommandIdRef, viewportCommand.id, mapInstance, move, onViewportCommandApplied,
      );
    };
    const operation = String(viewportCommand.operation || '').toLowerCase();
    const steps = Math.max(1, Math.min(4, Math.round(Number(viewportCommand.steps) || 1)));
    if (operation === 'zoom_in' || operation === 'zoom_out') {
      const delta = operation === 'zoom_in' ? steps : -steps;
      const nextZoom = Math.max(mapInstance.getMinZoom(), Math.min(mapInstance.getMaxZoom(), mapInstance.getZoom() + delta));
      moveOnce(() => mapInstance.setZoom(nextZoom, { animate: animateAtlasMap() }));
      return;
    }
    if (operation === 'reset') {
      moveOnce(() => mapInstance.setView([50, 10], 4, { animate: animateAtlasMap() }));
      return;
    }
    if (operation === 'center') {
      const lat = Number(viewportCommand.latitude);
      const lng = Number(viewportCommand.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        moveOnce(() => mapInstance.setView([lat, lng], Number(viewportCommand.zoom) || 9, { animate: animateAtlasMap() }));
      }
      return;
    }

    const requestedCountries = new Set((viewportCommand.countryCodes || [])
      .map((code) => String(code || '').trim().toUpperCase())
      .filter(Boolean));
    const query = String(viewportCommand.query || '').trim().toLowerCase();
    const targetFeatures = countryFitFeatures([...requestedCountries], europeGeoJson, geoJsonOverlays);
    if (query) {
      (Array.isArray(geoJsonOverlays) ? geoJsonOverlays : []).forEach((overlay) => {
        (overlay?.feature_collection?.features || []).forEach((feature) => {
          const searchable = Object.values(feature?.properties || {})
            .filter((value) => ['string', 'number'].includes(typeof value))
            .join(' ')
            .toLowerCase();
          if (searchable.includes(query)) targetFeatures.push(feature);
        });
      });
    }
    if (targetFeatures.length) {
      const bounds = L.geoJSON({ type: 'FeatureCollection', features: targetFeatures }).getBounds();
      if (bounds.isValid()) {
        moveOnce(() => mapInstance.fitBounds(bounds, { ...ATLAS_COUNTRY_FIT_OPTIONS, animate: animateAtlasMap() }));
      }
      return;
    }

    const targetFacilities = facilities.filter((facility) => {
      if (!requestedCountries.size) return true;
      const codes = [facility.country_code, facility.country, ...(facility.country_codes || [])]
        .map((code) => String(code || '').trim().toUpperCase());
      return codes.some((code) => requestedCountries.has(code));
    });
    const points = targetFacilities
      .map((facility) => [Number(facility.latitude), Number(facility.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (points.length) {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        moveOnce(() => mapInstance.fitBounds(bounds, { ...ATLAS_COUNTRY_FIT_OPTIONS, animate: animateAtlasMap() }));
      }
    }
  }, [europeGeoJson, facilities, geoJsonOverlays, mapInstance, viewportCommand, onViewportCommandApplied, autoZoomScopeKey]);
  const selectedLandCountryFeatureCollection = useMemo(() => {
    if (!europeGeoJson?.features?.length || !landConfig.countries.length) return null;
    const countrySet = new Set(landConfig.countries);
    const features = europeGeoJson.features.filter((feature) => (
      countrySet.has(String(feature?.properties?.ISO2 || '').trim().toUpperCase())
    ));
    return features.length ? { type: 'FeatureCollection', features } : null;
  }, [europeGeoJson, landConfig.countries]);
  // Create a simple colored marker
  const createColoredIcon = useCallback((
    color = '#3b82f6',
    isSelected = false,
    isEditable = false,
    hasMultipleObjects = false,
    objectCount = 1,
    shape = 'circle',
    extraOpacity = 1,
    currentZoom = 10,
    magnitudeRatio = null,
    isDemand = false,
    nodeEmphasis = 0,
  ) => {
    const zoomBase =
      currentZoom >= 11 ? 7 :
      currentZoom >= 9 ? 6 :
      currentZoom >= 7 ? 5 :
      4;
    let size = isSelected
      ? Math.max(zoomBase + 2, 7)
      : isEditable
        ? Math.max(zoomBase + 1, 6)
        : hasMultipleObjects
          ? Math.max(zoomBase + 1, 6)
          : zoomBase;
    if (isDemand && Number.isFinite(Number(magnitudeRatio))) {
      const { minSize, maxSize } = currentZoom >= 11
        ? { minSize: 8, maxSize: 30 }
        : currentZoom >= 9
          ? { minSize: 6, maxSize: 23 }
          : currentZoom >= 7
            ? { minSize: 5, maxSize: 17 }
            : { minSize: 4, maxSize: 11 };
      const ratio = Math.max(0, Math.min(1, Number(magnitudeRatio) || 0));
      size = Math.round(minSize + (maxSize - minSize) * Math.sqrt(ratio));
      if (isSelected) size += 2;
    }
    if (nodeEmphasis >= 2) size = Math.max(size, currentZoom <= 5 ? 8 : 9);
    else if (nodeEmphasis === 1) size = Math.max(size, currentZoom <= 5 ? 5 : 6);
    const borderColor = isEditable ? '#f59e0b' : nodeEmphasis >= 2 ? '#e2e8f0' : color;
    const borderWidth = isSelected ? 2 : (isEditable ? 2 : nodeEmphasis >= 2 ? 1.5 : 1);

    const shapeStyles = (() => {
      switch (shape) {
        case 'diamond':
          return `border-radius: 2px; transform: rotate(45deg); width: ${size}px; height: ${size}px;`;
        case 'triangle':
          return `clip-path: polygon(50% 4%, 95% 92%, 5% 92%); width: ${size}px; height: ${size}px; border-radius: 1px;`;
        case 'square':
          return `border-radius: 2px; width: ${size}px; height: ${size}px;`;
        case 'hex':
          return `clip-path: polygon(25% 6%, 75% 6%, 96% 50%, 75% 94%, 25% 94%, 4% 50%); width: ${size}px; height: ${size}px; border-radius: 1px;`;
        default:
          return `border-radius: 50%; width: ${size}px; height: ${size}px;`;
      }
    })();

    const showCountBadge = hasMultipleObjects && (currentZoom >= 9 || isSelected);
    const cacheKey = [
      color, isSelected ? 1 : 0, isEditable ? 1 : 0, hasMultipleObjects ? 1 : 0,
      showCountBadge ? Number(objectCount || 1) : 0, shape, Number(extraOpacity || 1).toFixed(2), currentZoom,
      isDemand ? 1 : 0, Number(magnitudeRatio || 0).toFixed(4), nodeEmphasis,
    ].join('|');
    const cached = markerIconCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border: ${borderWidth}px solid ${borderColor};
        ${shapeStyles}
        box-shadow: ${isSelected ? `0 0 10px ${color}cc` : `0 0 5px ${color}99`}, 0 1px 2px rgba(0,0,0,0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${hasMultipleObjects ? '7px' : '8px'};
        color: white;
        font-weight: bold;
        opacity: ${extraOpacity};
      ">
        ${isEditable ? 'E' : ''}
        ${showCountBadge ? `<div class="atlas-node-count" style="
          position: absolute;
          top: -2px;
          right: -2px;
          min-width: ${size >= 7 ? '8px' : '6px'};
          height: ${size >= 7 ? '8px' : '6px'};
          padding: 0 1px;
          background-color: #0f2230;
          border: 1px solid ${color};
          border-radius: 999px;
          font-size: 7px;
          color: #e2e8f0;
          font-weight: 700;
          line-height: 1;
          display:flex;
          align-items:center;
          justify-content:center;
        ">${Math.min(Number(objectCount || 2), 99)}</div>` : ''}
      </div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
    markerIconCacheRef.current.set(cacheKey, icon);
    return icon;
  }, []);

  const createGenerationMixIcon = useCallback((segments, extraOpacity = 1, sizeRatio = 1, aggregate = false) => {
    const safeSegments = Array.isArray(segments) ? segments.filter((segment) => segment.share > 0) : [];
    let cursor = 0;
    const gradientStops = safeSegments.map((segment) => {
      const start = cursor;
      cursor = Math.min(100, cursor + segment.share * 100);
      return `${segment.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    // Diameter follows sqrt(capacity / largest capacity), so circle area is
    // proportional to installed MW. The bounds shrink sharply when zoomed out.
    const size = generationPieDiameter(sizeRatio, zoomLevel, aggregate);
    const signature = safeSegments
      .map((segment) => `${segment.key}:${segment.share.toFixed(4)}:${segment.color}`)
      .join('|');
    const cacheKey = `generation-mix|${signature}|${size}|${Number(extraOpacity).toFixed(2)}`;
    const cached = generationMixIconCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const icon = L.divIcon({
      className: 'generation-mix-marker',
      html: `<div style="
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        background:${gradientStops.length ? `conic-gradient(${gradientStops.join(',')})` : '#64748b'};
        border:none;
        box-shadow:0 0 0 1px rgba(7,20,33,0.9),0 3px 10px rgba(0,0,0,0.55);
        opacity:${Math.max(0.45, Math.min(1, Number(extraOpacity) || 1))};
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -(size / 2)],
      tooltipAnchor: [0, -(size / 2)],
    });
    generationMixIconCacheRef.current.set(cacheKey, icon);
    return icon;
  }, [zoomLevel]);

  // --- Region-solve halo classification ---------------------------------------
  // Buses / lines inside `regionManifest.solved_buses` get full opacity; buses
  // in `boundary_buses` get mid opacity (one-hop neighbours pulled into the
  // islanded solve); everything else fades. True boundary lines (exactly one
  // endpoint in the core set) are dashed to flag the cut.
  const normId = (s) => String(s || '').toUpperCase().trim();
  const solvedBusSet = useMemo(() => new Set((regionManifest?.solved_buses || []).map(normId)), [regionManifest]);
  const boundaryBusSet = useMemo(() => new Set((regionManifest?.boundary_buses || []).map(normId)), [regionManifest]);
  const boundaryLineSet = useMemo(() => new Set([
    ...(regionManifest?.boundary_lines || []),
    ...(regionManifest?.boundary_links || []),
  ].map(normId)), [regionManifest]);
  const haloActive = !!regionManifest;
  const busHaloOpacity = useCallback((facilityId) => {
    if (!haloActive) return 1;
    const id = normId(facilityId);
    if (solvedBusSet.has(id)) return 1;
    if (boundaryBusSet.has(id)) return 0.9;
    return 0.72;
  }, [haloActive, solvedBusSet, boundaryBusSet]);
  const connectionHaloStyle = useCallback((connection) => {
    if (!haloActive) return { opacityMul: 1, dashOverride: undefined };
    const cid = normId(connection?.id);
    if (boundaryLineSet.has(cid)) {
      return { opacityMul: 1, dashOverride: '5 4' };
    }
    const fromSolved = solvedBusSet.has(normId(connection?.from));
    const toSolved = solvedBusSet.has(normId(connection?.to));
    if (fromSolved && toSolved) return { opacityMul: 1, dashOverride: undefined };
    return { opacityMul: 0.72, dashOverride: undefined };
  }, [haloActive, solvedBusSet, boundaryLineSet]);

  const regionRadiusMeters = Math.max(1000, Number(regionRadiusKm || 0) * 1000);
  const haversineMeters = useCallback((lat1, lon1, lat2, lon2) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);
  const pointInRegion = useCallback((lat, lon) => {
    if (!regionCenter || !Number.isFinite(regionCenter.lat) || !Number.isFinite(regionCenter.lon)) return true;
    return haversineMeters(lat, lon, regionCenter.lat, regionCenter.lon) <= regionRadiusMeters;
  }, [regionCenter, regionRadiusMeters, haversineMeters]);
  const regionFocusOpacityForConnection = useCallback((fromLat, fromLng, toLat, toLng) => {
    // Apply circle-based dimming only after solve is complete.
    if (!regionManifest) return 1;
    if (!regionCenter || !Number.isFinite(regionCenter.lat) || !Number.isFinite(regionCenter.lon)) return 1;
    const fromIn = pointInRegion(fromLat, fromLng);
    const toIn = pointInRegion(toLat, toLng);
    if (fromIn && toIn) return 1;
    if (fromIn || toIn) return 0.88;
    return 0.72;
  }, [regionManifest, regionCenter, pointInRegion]);




  // Combine facilities with editable nodes (these are the filtered/visible nodes)
  // These inputs are already filtered by App. Mirroring them through an effect
  // produced one render of new links with old endpoints and decoded every
  // route a second time when the copied state caught up.
  const allNodes = useMemo(() => [...facilities, ...editableNodes], [facilities, editableNodes]);

  const isAggregateCacheNode = useCallback((node) => (
    /_(?:bidding_zone|ehighway|nuts[123]|c\d+)\.nc$/i.test(String(node?.sourceNetworkFilename || ''))
  ), []);
  const rankedDetailedNodes = useMemo(() => indexOverviewNodes(rankNetworkNodes(
    allNodes.filter(node => !isAggregateCacheNode(node) && !node?.editable), connections,
  ), atlasRecordCountryCodes), [allNodes, connections, isAggregateCacheNode]);

  // Resolution-aware node LOD:
  // - cached aggregate networks (bidding zone/e-Highway/NUTS/cluster caches)
  //   are already the user's chosen abstraction, so every node remains visible;
  // - detailed point markers use country/cell coverage, then graph priority;
  //   overlay carriers retain a base share, and selected nodes have priority;
  // - viewport clipping prevents off-screen work without changing topology.
  const lodNodes = useMemo(() => {
    let candidates = allNodes.filter(node => {
      const lat = publishedNumber(node?.latitude), lng = publishedNumber(node?.longitude);
      const representedByPie = showGenerationMix && !node?.editable
        && String(node?.component_type || node?.type || '').toLowerCase() === 'generator';
      return !representedByPie && lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    });
    if (markerViewportBounds) {
      const sw = markerViewportBounds.getSouthWest();
      const ne = markerViewportBounds.getNorthEast();
      const latPad = (ne.lat - sw.lat) * 0.1;
      const lngPad = (ne.lng - sw.lng) * 0.1;
      candidates = candidates.filter((node) => {
        const lat = Number(node?.latitude);
        const lng = Number(node?.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng)
          && lat >= sw.lat - latPad && lat <= ne.lat + latPad
          && lng >= sw.lng - lngPad && lng <= ne.lng + lngPad;
      });
    }

    if (zoomLevel >= 8) return candidates;
    const detailedNodes = candidates.filter((node) => !isAggregateCacheNode(node) && !node?.editable);
    const nodalLimit = zoomLevel <= 4 ? 180 : zoomLevel === 5 ? 360 : zoomLevel === 6 ? 700 : 1400;
    if (detailedNodes.length <= nodalLimit) return candidates;

    const selectedDetailedNodes = selectOverviewNodes(rankedDetailedNodes, detailedNodes, nodalLimit, {
      zoom: zoomLevel, selectedIds: [selectedNode, ...(Array.isArray(selectedNodes) ? selectedNodes : [])], balanceCarriers: networkResolution === 'overlay',
    });
    const selectedDetailedIds = new Set(selectedDetailedNodes.map((node) => node));
    return candidates.filter((node) => isAggregateCacheNode(node) || node?.editable || selectedDetailedIds.has(node));
  }, [allNodes, zoomLevel, markerViewportBounds, isAggregateCacheNode, rankedDetailedNodes, networkResolution, selectedNode, selectedNodes, showGenerationMix]);

  const capacityScales = useMemo(() => connectionCapacityScales(connections || []), [connections]);
  const capacityScalesByUnit = useMemo(() => new Map(capacityScales.map(scale => [scale.units, scale])), [capacityScales]);

  // Create a Set of visible node IDs for quick lookup
  const visibleNodeIds = useMemo(() => {
    const ids = new Set();
    allNodes.forEach((node) => {
      const id = String(node?.id || '').toUpperCase().trim();
      const clusterId = String(node?.cluster_id || '').toUpperCase().trim();
      if (id) ids.add(id);
      if (clusterId) ids.add(clusterId);
    });
    return ids;
  }, [allNodes]);
  const visibleLocationCounts = useMemo(() => {
    const counts = new Map();
    allNodes.forEach((node) => {
      if (node.locationKey) counts.set(node.locationKey, (counts.get(node.locationKey) || 0) + 1);
    });
    return counts;
  }, [allNodes]);
  const demandScaleReferenceMw = useMemo(() => {
    const values = allNodes
      .filter((node) => String(node?.component_type || node?.type || '').toLowerCase() === 'load')
      .map((node) => Number(node?.map_scale_value ?? node?.p_set))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (!values.length) return 1;
    // Cap the scale at p95 so one exceptional node does not make the rest
    // visually indistinguishable. Values above p95 remain at the maximum size.
    return values[Math.min(values.length - 1, Math.floor((values.length - 1) * 0.95))] || values[values.length - 1] || 1;
  }, [allNodes]);
  const nodeLookup = useMemo(() => {
    const map = new Map();
    for (const n of allNodes) {
      const id = String(n?.id || '').toUpperCase().trim();
      const name = String(n?.name || '').toUpperCase().trim();
      const clusterId = String(n?.cluster_id || '').toUpperCase().trim();
      if (id) {
        map.set(id, n);
        map.set(id.replace(/[-_]/g, ''), n);
      }
      if (name) {
        map.set(name, n);
        map.set(name.replace(/[-_]/g, ''), n);
      }
      if (clusterId && !map.has(clusterId)) {
        map.set(clusterId, n);
        map.set(clusterId.replace(/[-_]/g, ''), n);
      }
    }
    return map;
  }, [allNodes]);

  const resolveNodeForConnection = useCallback((endpointId) => {
    if (!endpointId) return null;
    const idStr = String(endpointId || '').toUpperCase().trim();
    const cleanId = idStr.replace(/[-_]/g, '');

    return nodeLookup.get(idStr) || nodeLookup.get(cleanId) || null;
  }, [nodeLookup]);

  // Routes are decoded once per dataset. Pan/zoom changes only inspect their
  // cached bounds; detailed off-screen geometry never enters Leaflet.
  const resolveConnectionGeometry = useMemo(() => createConnectionGeometryResolver(), []);
  const connectionGeometries = useMemo(() => new Map(
    connections.map((connection) => [connection, resolveConnectionGeometry(connection, resolveNodeForConnection)]),
  ), [connections, resolveNodeForConnection, resolveConnectionGeometry]);
  // Geometry resolution already validates source coordinates or resolves both
  // endpoint nodes. Preserve routed loops and routes without endpoint markers;
  // matching endpoint IDs alone do not imply a zero-length source route.
  const drawableConnections = useMemo(() => connections.filter((connection) => (
    Boolean(connectionGeometries.get(connection))
  )), [connections, connectionGeometries]);
  useEffect(() => {
    const container = mapInstance?.getContainer?.();
    if (!container?.setAttribute) return;
    container.setAttribute(
      'data-atlas-cross-border-count',
      String(drawableConnections.filter((connection) => connection.is_cross_border).length),
    );
  }, [mapInstance, drawableConnections]);
  const allDrawableConnectionEntries = useMemo(() => drawableConnections.map((connection) => ({
    connection,
    geometry: connectionGeometries.get(connection),
  })), [drawableConnections, connectionGeometries]);
  // A dense overview canvas already clips at the screen edge. Walking every
  // route to derive the same low-zoom viewport on each move only burns CPU and
  // creates a fresh array. Detailed zooms still calculate the viewport subset
  // so line inspection returns when its density is safe.
  const denseLowZoomOverview = performanceMode
    && zoomLevel <= 7
    && allDrawableConnectionEntries.length >= OVERVIEW_CANVAS_MIN_LINKS;
  const selectViewportGeometry = useMemo(() => createViewportGeometrySelector(), []);
  const lodConnections = useMemo(() => {
    if (denseLowZoomOverview) return allDrawableConnectionEntries;
    const sw = mapBounds?.getSouthWest();
    const ne = mapBounds?.getNorthEast();
    const latPad = sw && ne ? (ne.lat - sw.lat) * 0.1 : 0;
    const lngPad = sw && ne ? (ne.lng - sw.lng) * 0.1 : 0;
    const viewport = sw && ne ? {
      south: sw.lat - latPad, north: ne.lat + latPad,
      west: sw.lng - lngPad, east: ne.lng + lngPad,
    } : null;
    // Preserve every in-view edge, even if its endpoint dots were thinned.
    // Canvas clipping/screen-space smoothing handles route complexity instead.
    const selected = [];
    for (const connection of drawableConnections) {
      const geometry = selectViewportGeometry(connectionGeometries.get(connection), viewport);
      if (geometry) selected.push({ connection, geometry });
    }
    return selected;
  }, [allDrawableConnectionEntries, denseLowZoomOverview, drawableConnections, connectionGeometries, mapBounds, selectViewportGeometry]);

  const overviewLineCanvasActive = denseLowZoomOverview
    || (performanceMode && lodConnections.length >= OVERVIEW_CANVAS_MIN_LINKS);
  // Dense overview rendering keeps one stable topology and lets canvas clipping
  // handle the viewport. This avoids rebuilding tens of thousands of GeoJSON
  // objects on every camera step; sparse/detail mode still receives only its
  // buffered viewport so interactive paths remain bounded.
  const lineRenderEntries = overviewLineCanvasActive ? allDrawableConnectionEntries : lodConnections;
  const lineStyleZoom = overviewLineCanvasActive ? 5 : zoomLevel;

  const geoJsonConnectionFeatures = useMemo(() => {
    if (!Array.isArray(lineRenderEntries) || lineRenderEntries.length === 0) return [];
    return lineRenderEntries
      .map(({ connection, geometry }, index) => {
        const { coordinates: lineCoordinates, fromLat, fromLng, toLat, toLng } = geometry;
        const labelPath = geometry.type === 'MultiLineString' ? lineCoordinates[0] : lineCoordinates;
        const midpoint = labelPath[Math.floor(labelPath.length / 2)]
          || [(fromLng + toLng) / 2, (fromLat + toLat) / 2];

        const halo = connectionHaloStyle(connection);
        const sourceOpacity = Number.isFinite(Number(connection.opacity)) ? Number(connection.opacity) : 0.78;
        const overviewOpacity = lineStyleZoom <= 4 ? 0.58 : lineStyleZoom === 5 ? 0.66 : lineStyleZoom === 6 ? 0.73 : 0.8;
        const baseOpacity = connection.is_cross_border
          ? Math.max(0.72, overviewOpacity)
          : Math.max(overviewOpacity, Math.min(0.9, sourceOpacity));
        const regionFocusOpacity = regionFocusOpacityForConnection(fromLat, fromLng, toLat, toLng);
        const zoomLineWeight = lineStyleZoom >= 11 ? 2.1
          : lineStyleZoom >= 9 ? 1.65
            : lineStyleZoom >= 7 ? 1.3
              : lineStyleZoom === 6 ? 1.05
                : lineStyleZoom === 5 ? 0.9
                  : 0.75;
        const capacity = getConnectionCapacity(connection);
        const unitScale = capacity && capacityScalesByUnit.get(capacity.units);
        const capacityRatio = capacityStylingEnabled && unitScale
          ? unitScale.normalize(capacity.value)
          : null;
        const overlayCarrier = String(connection.atlas_network_carrier || '').toLowerCase();
        const overlayStyle = networkResolution === 'overlay'
          ? ATLAS_NETWORK_CARRIER_META[overlayCarrier]
          : null;
        const color = overlayStyle?.color || (capacityRatio != null
          ? capacityColor(capacityRatio)
          : (halo.dashOverride ? '#fbbf24' : (connection.color || '#38bdf8')));
        const sourceWeight = Number.isFinite(Number(connection.weight)) ? Number(connection.weight) : 0;
        const topologyWeight = connection.is_reference_topology
          ? Math.max(zoomLineWeight, Math.min(sourceWeight || zoomLineWeight, zoomLineWeight * 1.65))
          : connection.is_cross_border
            ? Math.max(1.3, zoomLineWeight * 1.25)
            : zoomLineWeight;
        const capacityWeight = capacityRatio == null
          ? topologyWeight
          : zoomLineWeight * (0.72 + (2.3 * Math.sqrt(capacityRatio)));
        const weight = Math.max(overlayStyle ? 1.05 : 0.55, Math.min(6.5, capacityWeight));
        // Dragging must not change the render key: dimming at movement start
        // and restoring on idle rebuilt the entire graph twice per gesture.
        const perfOpacityMul = performanceMode ? 0.8 : 1;
        const opacity = baseOpacity * halo.opacityMul * regionFocusOpacity * perfOpacityMul;

        return {
          type: 'Feature',
          id: `connection-${connection.id || `${connection.from}-${connection.to}`}-${index}`,
          properties: {
            connection,
            capacity: capacity ? { ...capacity, ratio: capacityRatio } : null,
            fromLat, fromLng, toLat, toLng,
            midLat: midpoint[1],
            midLng: midpoint[0],
            style: {
              color,
              weight,
              opacity,
              dashArray: overlayStyle
                ? overlayStyle.dashArray || undefined
                : connection.dash_array || halo.dashOverride || (connection.is_cross_border ? '6 5' : undefined),
            },
          },
          geometry: {
            type: geometry.type || 'LineString',
            coordinates: lineCoordinates,
          },
        };
      })
      .filter(Boolean);
  }, [
    lineRenderEntries,
    connectionHaloStyle,
    regionFocusOpacityForConnection,
    capacityScalesByUnit,
    capacityStylingEnabled,
    lineStyleZoom,
    performanceMode,
    networkResolution,
  ]);

  const geoJsonNodeFeatureCollection = useMemo(() => {
    const features = (lodNodes || []).filter((facility) => {
      if (!showGenerationMix || facility.editable) return true;
      const componentType = String(facility?.component_type || facility?.type || '').toLowerCase();
      // The pie layer represents all generators at this bus. Hiding the
      // overlapping generator triangles avoids showing one carrier colour as
      // though it represented the complete bus mix.
      return componentType !== 'generator';
    }).map((facility) => {
      const lat = parseFloat(facility.latitude);
      const lng = parseFloat(facility.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      // Keep point GeoJSON stable across selection changes so a click does not
      // remount the layer and force a second click to reopen popup.
      const isSelected =
        String(selectedNode || '').toUpperCase() === String(facility.id || '').toUpperCase()
        || (Array.isArray(selectedNodes) && selectedNodes.some((id) => String(id || '').toUpperCase() === String(facility.id || '').toUpperCase()));
      const isEditable = facility.editable || editableNodes.some(n => n.id === facility.id);
      const objectCount = visibleLocationCounts.get(facility.locationKey) || facility.sameLocationCount || 1;
      const hasMultipleObjects = objectCount > 1;
      const overlayCarrier = String(facility.atlas_network_carrier || '').toLowerCase();
      const overlayStyle = networkResolution === 'overlay'
        ? ATLAS_NETWORK_CARRIER_META[overlayCarrier]
        : null;
      const color = overlayStyle?.color || getFacilityColor(facility);
      const shape = (() => {
        if (facility.is_virtual) return 'diamond';
        const t = String(facility.component_type || facility.type || '').toLowerCase();
        if (t === 'generator') return 'triangle';
        if (t === 'storageunit' || t === 'storage') return 'square';
        if (t === 'bus' || t === 'load') return 'hex';
        return 'circle';
      })();
      const isDemand = String(facility?.component_type || facility?.type || '').toLowerCase() === 'load';
      // Infrastructure datasets can expose an explicitly normalised map
      // scale without pretending that operational throughput is electric MW.
      const demandValueMw = Number(facility?.map_scale_value ?? facility?.p_set);
      const demandSizeRatio = isDemand && Number.isFinite(demandValueMw) && demandValueMw > 0
        ? Math.min(1, demandValueMw / demandScaleReferenceMw)
        : null;
      const explicitMapScaleRatio = Number(facility?.map_scale_ratio);
      const magnitudeSizeRatio = Number.isFinite(explicitMapScaleRatio) && explicitMapScaleRatio >= 0
        ? Math.min(1, explicitMapScaleRatio)
        : demandSizeRatio;
      const isMagnitudeScaled = Number.isFinite(Number(magnitudeSizeRatio));
      const extraOpacity = busHaloOpacity(facility.id);
      const sourceNetworkFilename = String(facility?.sourceNetworkFilename || '');
      const nodeEmphasis = /_(?:bidding_zone|ehighway|nuts1)\.nc$/i.test(sourceNetworkFilename)
        ? 2
        : /_(?:nuts[23]|c\d+)\.nc$/i.test(sourceNetworkFilename)
          ? 1
          : 0;
      return {
        type: 'Feature',
        id: String(facility.id || facility.name || ''),
        properties: {
          facility,
          isSelected,
          isEditable,
          hasMultipleObjects,
          objectCount,
          color,
          overlayCarrier,
          shape,
          isDemand,
          demandValueMw: Number.isFinite(demandValueMw) ? demandValueMw : null,
          demandSizeRatio: magnitudeSizeRatio,
          isMagnitudeScaled,
          nodeEmphasis,
          extraOpacity,
          popupContent: () => {
            // Prepare only the inspected popup, not a copied co-location list
            // for every rendered node on every viewport/filter change.
            const group = facility.sameLocationFacilities;
            const visibleLocationItems = Array.isArray(group)
              ? group.filter((item) => visibleNodeIds.has(String(item?.id || '').toUpperCase()))
              : [facility];
            return buildGeoJsonPopupContent({
              ...facility,
              sameLocationCount: Math.max(1, visibleLocationItems.length),
              sameLocationFacilities: visibleLocationItems.length ? visibleLocationItems : [facility],
            });
          },
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      };
    }).filter(Boolean);
    return { type: 'FeatureCollection', features };
  }, [lodNodes, editableNodes, busHaloOpacity, selectedNode, selectedNodes, showGenerationMix, visibleNodeIds, visibleLocationCounts, demandScaleReferenceMw, networkResolution]);

  const generationSites = useMemo(() => showGenerationMix ? indexGenerationSites(allNodes) : [], [showGenerationMix, allNodes]);
  const generationOverviewIndex = useMemo(() => indexOverviewNodes(generationSites, site => [...site.countries]), [generationSites]);
  const maximumInstalledCapacity = generationSites[0]?.capacityTotal || 1;
  const generationSiteSelection = useMemo(() => {
    let viewport;
    if (markerViewportBounds) {
      const sw = markerViewportBounds.getSouthWest();
      const ne = markerViewportBounds.getNorthEast();
      const latPad = (ne.lat - sw.lat) * 0.1;
      const lngPad = (ne.lng - sw.lng) * 0.1;
      viewport = { south: sw.lat - latPad, north: ne.lat + latPad, west: sw.lng - lngPad, east: ne.lng + lngPad };
    }
    return selectGenerationSites(generationSites, zoomLevel, viewport, { index: generationOverviewIndex, selectedIds: [selectedNode, ...(Array.isArray(selectedNodes) ? selectedNodes : [])] });
  }, [generationSites, generationOverviewIndex, zoomLevel, markerViewportBounds, selectedNode, selectedNodes]);

  const resolveGenerationMix = useMemo(() => createGenerationMixResolver(getFacilityColor), []);
  const generationMixFeatureCollection = useMemo(() => {
    const features = [];
    for (const site of generationSiteSelection.sites) {
      const { latitude: lat, longitude: lng, key: locationKey, capacityTotal } = site;
      const mix = resolveGenerationMix(site);
      if (!mix) continue;
      const { facility: representative, segments, total, basis, unit, tooltipContent } = mix;

      features.push({
        type: 'Feature',
        id: `generation-mix-${locationKey}`,
        properties: {
          facility: representative,
          segments,
          total,
          basis,
          unit,
          capacityTotal,
          aggregate: site.aggregate,
          sizeRatio: Math.max(0, capacityTotal / maximumInstalledCapacity),
          tooltipContent,
          popupContent: () => buildGeoJsonPopupContent(representative),
          extraOpacity: busHaloOpacity(representative.id),
        },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      });
    }

    return { type: 'FeatureCollection', features, inView: generationSiteSelection.inView };
  }, [generationSiteSelection, maximumInstalledCapacity, busHaloOpacity, resolveGenerationMix]);

  const spatialFeatureKey = useMemo(() => createSpatialFeatureKey(), []);
  const generationMixLayerKey = useMemo(() => (
    spatialFeatureKey(`generation-mix-z${zoomLevel}`, generationMixFeatureCollection)
  ), [generationMixFeatureCollection, spatialFeatureKey, zoomLevel]);

  const geoJsonLineFeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: geoJsonConnectionFeatures,
  }), [geoJsonConnectionFeatures]);

  const unmappedLinks = connections.length - drawableConnections.length;

  // React-Leaflet's GeoJSON layer does not rebuild itself when only the `data`
  // prop changes. A feature-count-only key therefore leaves stale markers on
  // the map whenever two network resolutions happen to contain the same number
  // of visible nodes. Include feature identity and geometry in a compact hash so
  // switching cache levels always replaces both the node and line layers.
  const geoJsonLineLayerKey = useMemo(
    () => spatialFeatureKey(overviewLineCanvasActive ? 'geo-lines-overview' : `geo-lines-z${zoomLevel}`, geoJsonLineFeatureCollection),
    [geoJsonLineFeatureCollection, overviewLineCanvasActive, spatialFeatureKey, zoomLevel],
  );
  const geoJsonNodeLayerKey = useMemo(
    () => spatialFeatureKey(`geo-points-z${zoomLevel}-${performanceMode ? 'perf' : 'full'}`, geoJsonNodeFeatureCollection, { ignoreSelection: true }),
    [geoJsonNodeFeatureCollection, spatialFeatureKey, zoomLevel, performanceMode],
  );

  // An opaque identity also distinguishes source/metadata replacements with
  // identical line geometry. An earlier completed drawing cannot certify them.
  const networkRenderKey = useMemo(() => ({ geometry: geoJsonLineLayerKey, source: connections }), [geoJsonLineLayerKey, connections]);
  // Density, rather than zoom alone, determines the renderer. A dense city can
  // retain more paths than a continent-scale sparse carrier; this hard bound
  // prevents either case from constructing thousands of Leaflet Path objects.
  const useOverviewLineCanvas = overviewLineCanvasActive;

  // Empty is also a committed network frame. Keep the owner mounted when all
  // links are filtered out so it can retire the old graph cooperatively, and
  // keep nodes/boundaries in step with that swap rather than publishing early.
  const managesNetworkLines = mapViewMode === 'our-model';
  const renderedLinks = managesNetworkLines ? lineRenderProgress?.renderedLinks || 0 : 0;
  const renderingLinks = managesNetworkLines && (lineRenderProgress?.key !== networkRenderKey || lineRenderProgress?.renderingLinks === true);
  const renderError = managesNetworkLines && lineRenderProgress?.key === networkRenderKey ? lineRenderProgress?.renderError || '' : '';
  const overviewLines = managesNetworkLines && lineRenderProgress?.key === networkRenderKey && Boolean(lineRenderProgress?.overview);
  const displayedFrame = useCommittedMapFrame({
    nodes: geoJsonNodeFeatureCollection, nodeKey: geoJsonNodeLayerKey,
    mix: generationMixFeatureCollection, mixKey: generationMixLayerKey,
    overlays: overlayFeatureCollections, countries: selectedCountryFeatureCollection,
    countryKey: [...loadedCountryCodeSet].sort().join('-'),
    capacityScales, capacityStylingEnabled,
  }, !renderingLinks && !renderError);
  const nodeLayerRef = useRef(null);
  const makeSelectedNodeIcon = useCallback((p, selected) => createColoredIcon(
    p.color || '#3b82f6', selected, Boolean(p.isEditable), Boolean(p.hasMultipleObjects),
    p.objectCount || 1, p.shape || 'circle', p.extraOpacity ?? 1, zoomLevel,
    p.demandSizeRatio, Boolean(p.isMagnitudeScaled), Number(p.nodeEmphasis || 0),
  ), [createColoredIcon, zoomLevel]);
  useMapNodeSelection(nodeLayerRef, displayedFrame?.nodeKey, selectedNode, selectedNodes, makeSelectedNodeIcon);
  const generationSitesRendered = displayedFrame?.mix.features.length || 0;
  const generationSitesInView = displayedFrame?.mix.inView || 0;
  useEffect(() => {
    onRenderStatsChange?.({ renderedLinks, unmappedLinks, renderingLinks, renderError, overviewLines, generationSitesRendered, generationSitesInView });
  }, [onRenderStatsChange, renderedLinks, unmappedLinks, renderingLinks, renderError, overviewLines, generationSitesRendered, generationSitesInView]);


  return (
    <div className="w-full h-full rounded-xl overflow-hidden relative" style={{ minHeight: '400px' }}>
      {renderDiagnosticsEnabled && <MapRenderDiagnostics
        metrics={lineRenderProgress?.diagnostics} retirement={lineRetirementProgress} busy={renderingLinks} error={renderError} />}
      <MapContainer
        center={[52, 8]}
        zoom={5}
        minZoom={ATLAS_MIN_ZOOM}
        zoomControl={false}
        // Tile cross-fades superimpose labels from two zoom levels. Keep
        // camera motion, but publish loaded tiles without the extra fade.
        fadeAnimation={false}
        preferCanvas={true}
        renderer={atlasRenderers.base}
        worldCopyJump={true}
        style={{ height: '100%', width: '100%', minHeight: '400px', backgroundColor: '#202124' }}
        className="z-0"
      >
        <MapInstanceBridge onReady={setMapInstance} />
        <Pane name="loaded-country-context" style={{ zIndex: 260 }} />
        <Pane name="regional-clusters" style={{ zIndex: 270, opacity: 0.48, willChange: 'opacity' }} />
        <RegionalClusterOpacityBridge opacity={regionalClusterOverlay?.opacity} />
        <Pane name="network-boundaries" style={{ zIndex: 275, display: showGeographicBoundaries ? undefined : 'none' }} />
        <Pane name="land-country-context" style={{ zIndex: 265 }} />
        <Pane name="network-nodes" style={{ zIndex: 600, display: showNodeMarkers ? undefined : 'none' }} />
        <MapDisplayPaneBridge nodes={showNodeMarkers} boundaries={showGeographicBoundaries} />
        <Pane name="grid-access-sites" style={{ zIndex: 675 }} />
        <Pane name="region-overlay-pane" style={{ zIndex: 330 }} />
        <TileLayer
          attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
          updateWhenIdle={true}
          updateWhenZooming={false}
          keepBuffer={2}
          detectRetina={false}
        />
        {landConfig.enabled && landScope.ready && landConfig.categories.length > 0 && (
          <>
            <Pane
              name="land-constraints"
              style={{
                zIndex: 245,
                opacity: Math.max(0.2, Math.min(1, landConfig.opacity / 100)),
                willChange: 'opacity',
              }}
            />
            <TileLayer
              ref={landTileLayerRef}
              key={`land-${landApiVersion}-${landConfig.categories.join('-')}-${landCountryKey || 'all'}`}
              attribution='Land screening: EEA Natura 2000 &amp; Copernicus CORINE'
              url={landTileUrl}
              opacity={1}
              pane="land-constraints"
              maxZoom={16}
              updateWhenIdle={true}
              updateWhenZooming={false}
              keepBuffer={1}
              detectRetina={false}
            />
          </>
        )}
        <TileLayer
          attribution='Labels &copy; Esri, HERE, Garmin, OpenStreetMap contributors'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
          pane="overlayPane"
          updateWhenIdle={true}
          updateWhenZooming={false}
          keepBuffer={2}
          detectRetina={false}
        />

        {displayedFrame?.countries && (
          <>
            <GeoJSON
              key={`loaded-countries-${displayedFrame.countryKey}`}
              data={displayedFrame.countries}
              pane="loaded-country-context"
              renderer={atlasRenderers.countries}
              interactive={false}
              style={countryBoundaryStyle}
            />
          </>
        )}

        {regionalClusterOverlay?.data?.features?.length > 0 && (
          <GeoJSON
            key={`regional-clusters-${regionalClusterOverlay.key}`}
            data={regionalClusterOverlay.data}
            pane="regional-clusters"
            renderer={atlasRenderers.clusters}
            interactive
            style={(feature) => {
              const color = feature?.properties?.color || '#dabd1d';
              return {
                color: showGeographicBoundaries ? '#f8fafc' : color,
                weight: showGeographicBoundaries ? (zoomLevel <= 5 ? 0.45 : 0.75) : 0,
                opacity: showGeographicBoundaries ? 0.72 : 0,
                fillColor: color,
                fillOpacity: 0.94,
              };
            }}
            onEachFeature={(feature, layer) => {
              const title = feature?.properties?.name;
              if (title) {
                layer.bindTooltip(escapeHtml(title), {
                  direction: 'top',
                  opacity: 0.96,
                  sticky: true,
                  className: 'atlas-cluster-tooltip',
                });
              }
            }}
          />
        )}

        {landConfig.enabled && landScope.ready && selectedLandCountryFeatureCollection && (
          <>
            <GeoJSON
              key={`land-countries-${landCountryKey}`}
              data={selectedLandCountryFeatureCollection}
              pane="land-country-context"
              renderer={atlasRenderers.landContext}
              interactive={false}
              style={{
                color: '#6ee7b7',
                weight: zoomLevel <= 5 ? 2 : 2.5,
                opacity: 0.88,
                dashArray: '6 4',
                fillOpacity: 0,
              }}
            />
          </>
        )}

        {gridAccessConfig.enabled && gridAccessConfig.data.features.length > 0 && (
          <>
            <Pane name="grid-access-tooltips" style={{ zIndex: 760 }} />
            <GeoJSON
              key={`grid-access-${gridAccessConfig.metric}-${gridAccessConfig.sides.join('-')}-${gridAccessConfig.countryCodes.join('-')}-${gridAccessConfig.projectScope}-${gridAccessConfig.data.features.length}-${gridAccessConfig.data.meta?.p95_scale || 0}`}
              data={gridAccessConfig.data}
              pane="grid-access-sites"
              renderer={atlasRenderers.access}
              pointToLayer={(feature, latlng) => {
                const properties = feature?.properties || {};
                const zoomScale = zoomLevel <= 4 ? 0.62 : zoomLevel <= 6 ? 0.82 : zoomLevel >= 10 ? 1.15 : 1;
                return L.circleMarker(latlng, {
                  radius: Math.max(3.2, Number(properties.marker_radius || 5) * zoomScale),
                  color: '#e2e8f0',
                  weight: zoomLevel <= 4 ? 0.6 : 0.9,
                  opacity: 0.9,
                  fillColor: properties.color || properties.side_color || '#38bdf8',
                  fillOpacity: 0.84,
                  pane: 'grid-access-sites',
                  renderer: atlasRenderers.access,
                });
              }}
              onEachFeature={(feature, layer) => {
                const content = () => buildGridAccessPopupContent(feature?.properties);
                bindMapHoverTooltip(layer, content, { sticky: true, direction: 'top', opacity: 0.98, pane: 'grid-access-tooltips', className: 'atlas-grid-access-tooltip' });
                layer.bindPopup(content, ATLAS_ASSET_POPUP_OPTIONS);
              }}
            />
          </>
        )}

        <MapController
          lastFitSignatureRef={lastFitSignatureRef}
          facilities={allNodes}
          focusLocation={focusLocation}
          onFocusLocationApplied={onFocusLocationApplied}
          autoZoomEnabled={autoZoomEnabled}
          autoZoomScopeKey={autoZoomScopeKey}
          loading={pypsaLoading}
        />

        {/* Magic Loading Animation for Europe / Selected Country */}
        {pypsaLoading && europeGeoJson && (() => {
          let dataToRender = europeGeoJson;
          if (activeCountryCode) {
            const countryFeatures = europeGeoJson.features.filter(
              f => f.properties && f.properties.ISO2 === activeCountryCode
            );
            if (countryFeatures.length > 0) {
              dataToRender = { ...europeGeoJson, features: countryFeatures };
            }
          }
          const geoKey = `geo-anim-${activeCountryCode || 'all'}`;
          return (
            <GeoJSON
              key={geoKey}
              data={dataToRender}
              className="europe-outline-anim"
              interactive={false}
              style={{ color: '#facc15', weight: 1.5, fillOpacity: 0.01 }} // Fallback styling
            />
          );
        })()}

        {showGeographicBoundaries && (displayedFrame?.overlays || []).map((overlay, idx) => (
          <GeoJSON
            key={spatialFeatureKey(`overlay-${overlay.name}-${idx}`, overlay.data)}
            data={overlay.data}
            pane="network-boundaries"
            renderer={atlasRenderers.boundaries}
            style={(feature) => {
              const gtype = String(feature?.geometry?.type || '');
              const props = feature?.properties || {};
              const isNutsRegion = /regions\.geojson$/i.test(String(overlay.name || ''));
              const color = props.color || props.stroke || (isNutsRegion ? '#facc15' : '#60a5fa');
              if (gtype.includes('Polygon')) {
                const overviewBoundaryWeight = zoomLevel <= 4 ? 0.65 : zoomLevel === 5 ? 0.85 : zoomLevel === 6 ? 1.05 : 1.25;
                const overviewBoundaryOpacity = zoomLevel <= 4 ? 0.42 : zoomLevel === 5 ? 0.56 : zoomLevel === 6 ? 0.68 : 0.8;
                return {
                  color,
                  weight: Number(props.strokeWidth || (isNutsRegion ? overviewBoundaryWeight : 1)),
                  opacity: Number(props.strokeOpacity || (isNutsRegion ? overviewBoundaryOpacity : 0.65)),
                  fillColor: props.fill || color,
                  fillOpacity: Number(props.fillOpacity ?? (isNutsRegion ? (zoomLevel <= 5 ? 0.008 : 0.02) : 0.05)),
                };
              }
              return {
                color,
                weight: Number(props.strokeWidth || props.weight || 1.2),
                opacity: Number(props.strokeOpacity ?? props.opacity ?? 0.75),
                dashArray: props.dashArray,
              };
            }}
            pointToLayer={(feature, latlng) => {
              const props = feature?.properties || {};
              const color = props.color || props.stroke || '#60a5fa';
              return L.circleMarker(latlng, {
                radius: Number(props.radius || 3.5),
                color,
                fillColor: props.fill || color,
                fillOpacity: Number(props.fillOpacity ?? 0.8),
                weight: Number(props.strokeWidth || 1),
                opacity: Number(props.strokeOpacity ?? 0.9),
                pane: 'network-boundaries',
                renderer: atlasRenderers.boundaries,
              });
            }}
            onEachFeature={(feature, layer) => {
              const props = feature?.properties || {};
              const title = props.name || props.label || overlay.name;
              if (title) {
                layer.bindTooltip(escapeHtml(title), { direction: 'top', opacity: 0.85, sticky: true });
              }
            }}
          />
        ))}

        <MapTelemetry onZoomChange={setZoomLevel} onBoundsChange={setMapBounds} />

        <MapViewBridge onViewChange={onMapViewChange} />

        <RegionContextBridge onContextMenu={onRegionContextMenu} />
        <LandInspectBridge
          enabled={landConfig.enabled && landScope.ready && landInspectMode}
          onInspect={setLandInspection}
          countries={landConfig.countries}
        />

        {regionCenter && Number.isFinite(regionCenter.lat) && Number.isFinite(regionCenter.lon) && (
          <>
            <>
              <Circle
                pane="region-overlay-pane"
                renderer={atlasRenderers.region}
                ref={regionCircleRef}
                center={[regionCenter.lat, regionCenter.lon]}
                radius={regionRadiusMeters}
                interactive={false}
                pathOptions={{
                  color: '#fbbf24',
                  fillColor: '#000000',
                  fillOpacity: 0.25,
                  weight: 2,
                  dashArray: '4 4',
                }}
              />
              <CircleMarker
                pane="region-overlay-pane"
                renderer={atlasRenderers.region}
                ref={regionCenterPreviewRef}
                center={[regionCenter.lat, regionCenter.lon]}
                radius={5}
                interactive={false}
                pathOptions={{ color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 1, weight: 2 }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
                  Region centre
                </Tooltip>
              </CircleMarker>
            </>
            <Marker
              position={[regionCenter.lat, regionCenter.lon]}
              icon={regionCenterHandleIcon}
              draggable={!regionManifest && !regionSolving}
              eventHandlers={{
                dragstart: () => {
                  const circle = regionCircleRef.current;
                  if (!circle) return;
                  circle.setStyle({
                    color: '#fde68a',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.12,
                    weight: 3,
                    dashArray: '6 4',
                  });
                  circle.bringToFront?.();
                },
                drag: (e) => {
                  if (regionManifest || regionSolving) return;
                  const next = e?.target?.getLatLng?.();
                  if (!next) return;
                  // Move the preview layers imperatively so the circle tracks
                  // the handle smoothly without re-rendering the full network
                  // on every pointer event. Parent state is committed on drop.
                  regionCircleRef.current?.setLatLng?.(next);
                  regionCenterPreviewRef.current?.setLatLng?.(next);
                },
                dragend: (e) => {
                  if (regionManifest || regionSolving || !onRegionCenterChange) return;
                  const next = e?.target?.getLatLng?.();
                  if (!next) return;
                  regionCircleRef.current?.setStyle?.({
                    color: '#fbbf24',
                    fillColor: '#000000',
                    fillOpacity: 0.25,
                    weight: 2,
                    dashArray: '4 4',
                  });
                  onRegionCenterChange({ lat: next.lat, lon: next.lng });
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>
                {(regionManifest || regionSolving) ? 'Region centre locked' : 'Drag to move region centre'}
              </Tooltip>
            </Marker>
          </>
        )}

        {/* Render connections as GeoJSON */}
        {managesNetworkLines && (
          <>
            <Pane name="line-capacity-tooltip-pane" style={{ zIndex: 735 }} />
            {useOverviewLineCanvas ? <OverviewNetworkCanvasLayer
              diagnostics={renderDiagnosticsEnabled}
              dataKey={networkRenderKey}
              data={geoJsonLineFeatureCollection}
              reportedFeatureCount={lodConnections.length}
              onProgress={setLineRenderProgress}
            /> : <BatchedNetworkLayer
              diagnostics={renderDiagnosticsEnabled}
              onRetirementProgress={renderDiagnosticsEnabled ? setLineRetirementProgress : undefined}
              dataKey={networkRenderKey}
              sourceKey={connections}
              data={geoJsonLineFeatureCollection}
              smoothFactor={routeSmoothingForZoom(zoomLevel)}
              onProgress={setLineRenderProgress}
              style={(feature) => {
                const s = feature?.properties?.style || {};
                return {
                  color: s.color || '#38bdf8',
                  weight: s.weight ?? 1.8,
                  opacity: s.opacity ?? 0.8,
                  dashArray: s.dashArray,
                };
              }}
              onEachFeature={(feature, layer) => {
                const props = feature?.properties || {};
                const connection = props.connection;
                layer.on('click', (e) => {
                  const clickPos = e?.containerPoint
                    ? { lat: props.midLat, lng: props.midLng, x: e.containerPoint.x, y: e.containerPoint.y }
                    : { lat: props.midLat, lng: props.midLng };
                  if (onConnectionClick && connection) onConnectionClick(connection, clickPos);
                });
                const capacity = props.capacity;
                if (capacity?.value) {
                  // A layer may mount during a pan/zoom and survive after it
                  // settles. Bind once regardless of that transient state;
                  // generate content only on hover, including on slow hardware.
                  layer.bindTooltip(
                    () => {
                      const title = connection?.name || `${connection?.fromNode || connection?.from || ''} – ${connection?.toNode || connection?.to || ''}`;
                      const availableRow = capacity.available != null && Math.abs(capacity.available - capacity.value) > 0.01
                        ? `<div style="display:flex;justify-content:space-between;gap:18px;margin-top:4px;color:#cbd5e1;"><span>Available limit</span><strong style="color:#f8fafc;">${formatCapacity(capacity.available)} ${escapeHtml(capacity.availableUnits)}</strong></div>`
                        : '';
                      return `<div style="min-width:176px;font-size:11px;line-height:1.35;color:#e2e8f0;">
                      <div style="font-weight:750;color:#ffffff;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px;">${escapeHtml(title)}</div>
                      <div style="display:flex;justify-content:space-between;gap:18px;"><span>${escapeHtml(capacity.kind)}</span><strong style="color:#facc15;">${formatCapacity(capacity.value)} ${escapeHtml(capacity.units)}</strong></div>
                      ${availableRow}
                    </div>`;
                    },
                    {
                      direction: 'top',
                      opacity: 0.97,
                      sticky: true,
                      pane: 'line-capacity-tooltip-pane',
                      className: 'line-capacity-tooltip',
                    },
                  );
                } else if (!performanceMode && lineMetricEnabled && Number.isFinite(connection?.metricValue)) {
                  layer.bindTooltip(
                    `${connection.metricValue}${connection.metricUnits ? ` ${escapeHtml(connection.metricUnits)}` : ''}`,
                    { permanent: true, direction: 'center', opacity: 0.9, className: 'line-metric-tooltip' },
                  );
                }
              }}
            />}
          </>
        )}

        {/* Render facilities as GeoJSON points */}
        {showNodeMarkers && displayedFrame?.nodes.features.length > 0 && (
          <GeoJSON
            key={displayedFrame.nodeKey}
            ref={nodeLayerRef}
            data={displayedFrame.nodes}
            pane="network-nodes"
            renderer={atlasRenderers.nodes}
            pointToLayer={(feature, latlng) => {
              const p = feature?.properties || {};
              if (p.nodeEmphasis >= 2) {
                return L.circleMarker(latlng, {
                  radius: zoomLevel >= 8 ? 6 : 5.25,
                  color: p.isSelected ? '#facc15' : '#e2e8f0',
                  fillColor: p.color || '#67e8f9',
                  fillOpacity: Math.max(0.82, Math.min(1, p.extraOpacity ?? 0.92)),
                  opacity: 0.96,
                  weight: p.isSelected ? 2.25 : 1.5,
                  pane: 'network-nodes',
                  renderer: atlasRenderers.nodes,
                });
              }
              // Styling is a stable display choice. A layer constructed while
              // moving can survive the gesture; do not latch temporary circles.
              if (performanceMode) {
                const baseRadius = p.nodeEmphasis >= 2
                  ? (zoomLevel >= 8 ? 5 : 4.5)
                  : zoomLevel >= 10 ? 4 : zoomLevel >= 8 ? 3.5 : 3;
                const radius = p.isMagnitudeScaled && Number.isFinite(Number(p.demandSizeRatio))
                  ? baseRadius + (zoomLevel >= 10 ? 8 : 5) * Math.sqrt(Math.max(0, Math.min(1, Number(p.demandSizeRatio) || 0)))
                  : baseRadius;
                return L.circleMarker(latlng, {
                  radius,
                  color: p.color || '#3b82f6',
                  fillColor: p.color || '#3b82f6',
                  fillOpacity: Math.max(0.5, Math.min(1, p.extraOpacity ?? 0.85)),
                  opacity: Math.max(0.6, Math.min(1, p.extraOpacity ?? 0.9)),
                  weight: Boolean(p.isSelected) ? 2 : 1,
                  pane: 'network-nodes',
                  renderer: atlasRenderers.nodes,
                });
              }
              const icon = createColoredIcon(
                p.color || '#3b82f6',
                Boolean(p.isSelected),
                Boolean(p.isEditable),
                Boolean(p.hasMultipleObjects),
                p.objectCount || 1,
                p.shape || 'circle',
                p.extraOpacity ?? 1,
                zoomLevel,
                p.demandSizeRatio,
                Boolean(p.isMagnitudeScaled),
                Number(p.nodeEmphasis || 0),
              );
              return L.marker(latlng, { icon, pane: 'network-nodes', keyboard: false, autoPanOnFocus: false });
            }}
            onEachFeature={(feature, layer) => {
              const p = feature?.properties || {};
              const facility = p.facility || {};
              layer.on('click', (e) => {
                if (e?.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                if (mapViewMode === 'our-model') {
                  if (onNodeSelection) onNodeSelection(facility.id);
                } else {
                  if (onNodeSelect) onNodeSelect(facility.id);
                }
                // bindPopup owns opening/closing. A deferred second open can
                // outlive this layer and resets the popup's local tab state.
              });
              if (p.popupContent) {
                layer.bindPopup(p.popupContent, ATLAS_ASSET_POPUP_OPTIONS);
                layer.on('popupopen', (ev) => {
                  const popupEl = ev?.popup?.getElement?.();
                  if (!popupEl) return;
                  L.DomEvent.disableClickPropagation(popupEl);
                  L.DomEvent.disableScrollPropagation(popupEl);
                });
              }
            }}
          />
        )}

        {showNodeMarkers && showGenerationMix && displayedFrame?.mix.features.length > 0 && (
          <>
          <Pane name="generation-mix-tooltip-pane" style={{ zIndex: 720 }} />
          <Pane name="generation-mix-pane" style={{ zIndex: 650 }}>
            <GeoJSON
              key={displayedFrame.mixKey}
              data={displayedFrame.mix}
              pane="generation-mix-pane"
              pointToLayer={(feature, latlng) => {
                const p = feature?.properties || {};
                const icon = createGenerationMixIcon(
                  p.segments || [],
                  p.extraOpacity ?? 1,
                  p.sizeRatio ?? 1,
                  p.aggregate === true,
                );
                return L.marker(latlng, {
                  icon,
                  pane: 'generation-mix-pane',
                  keyboard: false,
                  autoPanOnFocus: false,
                  riseOnHover: true,
                });
              }}
              onEachFeature={(feature, layer) => {
                const p = feature?.properties || {};
                const facility = p.facility || {};
                if (p.tooltipContent) {
                  bindMapHoverTooltip(layer, p.tooltipContent, {
                    direction: 'top',
                    opacity: 0.96,
                    sticky: true,
                    pane: 'generation-mix-tooltip-pane',
                  });
                }
                if (p.popupContent) {
                  layer.bindPopup(p.popupContent, ATLAS_ASSET_POPUP_OPTIONS);
                  layer.on('popupopen', (event) => {
                    const popupElement = event?.popup?.getElement?.();
                    if (!popupElement) return;
                    L.DomEvent.disableClickPropagation(popupElement);
                    L.DomEvent.disableScrollPropagation(popupElement);
                  });
                }
                layer.on('click', (event) => {
                  if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
                  if (onNodeSelection && facility.id) onNodeSelection(facility.id);
                  if (p.popupContent && layer?.openPopup) layer.openPopup();
                });
              }}
            />
          </Pane>
          </>
        )}
      </MapContainer>
      <div style={controlsHidden || panelsHidden ? { display: 'none' } : undefined} className="absolute top-[148px] sm:top-24 right-[58px] z-[565] flex items-start gap-2">
        {landConfig.panelOpen && (
          <div role="region" aria-label="Land and Constraints controls" className="atlas-land-controls w-[250px] overflow-y-auto rounded-2xl border border-emerald-300/20 bg-[#071421]/96 p-3 text-[10px] text-slate-300 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.16em] text-emerald-300">Siting evidence</p>
                <h3 className="mt-0.5 text-[13px] font-semibold text-white">Land &amp; Constraints</h3>
                <p className="mt-0.5 text-[9px] text-slate-400">Local viewport tiles · strategic screening</p>
              </div>
              <button type="button" onClick={() => updateLandConfig({ panelOpen: false })} className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Close Land and Constraints controls">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {!landScope.ready && (
              <div role="status" className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 p-2 text-rose-200">
                {landScope.message}
              </div>
            )}

            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-wide text-slate-400">Country scope</span>
                <button
                  type="button"
                  onClick={() => updateLandConfig({ followMapCountries: !landConfig.followMapCountries, enabled: true })}
                  aria-pressed={landConfig.followMapCountries}
                  className={`rounded-md border px-1.5 py-1 text-[8px] transition ${landConfig.followMapCountries ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200' : 'border-white/10 text-slate-400 hover:text-white'}`}
                >
                  {landConfig.followMapCountries ? 'Following map' : 'Custom scope'}
                </button>
              </div>
              {!landConfig.followMapCountries && (
                <>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
                    <select
                      value=""
                      onChange={(event) => {
                        const code = String(event.target.value || '').toUpperCase();
                        if (!code) return;
                        updateLandConfig({
                          countries: [...new Set([...landConfig.countries, code])],
                          followMapCountries: false,
                          enabled: true,
                        });
                      }}
                      aria-label="Add a country to the land overlay"
                      className="min-w-0 rounded-lg border border-white/10 bg-[#0a1a29] px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-emerald-300/45"
                    >
                      <option value="">Add a country…</option>
                      {landCountryOptions.map((country) => (
                        <option key={country.code} value={country.code} disabled={landConfig.countries.includes(String(country.code).toUpperCase())}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => updateLandConfig({ countries: [], followMapCountries: false, enabled: true })}
                      className="rounded-md border border-white/10 px-2 text-[8px] text-slate-400 transition hover:text-white"
                    >
                      Europe
                    </button>
                  </div>
                  {loadedCountryCodeSet.size > 0 && (
                    <button
                      type="button"
                      onClick={() => updateLandConfig({ countries: [...loadedCountryCodeSet], followMapCountries: false, enabled: true })}
                      className="mt-1.5 w-full rounded-md border border-white/10 px-2 py-1 text-[8px] text-slate-400 transition hover:border-emerald-300/30 hover:text-white"
                    >
                      Copy current map countries
                    </button>
                  )}
                </>
              )}
              {landConfig.countries.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1" aria-label="Selected land overlay countries">
                  {landConfig.countries.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        if (landConfig.followMapCountries) return;
                        updateLandConfig({ countries: landConfig.countries.filter((item) => item !== code), followMapCountries: false, enabled: true });
                      }}
                      title={`Remove ${landCountryName[code] || code}`}
                      aria-label={landConfig.followMapCountries ? `${landCountryName[code] || code} follows the map selection` : `Remove ${landCountryName[code] || code} from land overlay`}
                      className={`flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-1.5 py-0.5 text-[8px] text-emerald-100 ${landConfig.followMapCountries ? 'cursor-default' : ''}`}
                    >
                      <span>{landCountryName[code] || code}</span>{!landConfig.followMapCountries && <X className="h-2.5 w-2.5" />}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[8px] leading-3 text-slate-500">
                {!landScope.ready ? 'No land tiles or inspection results are shown for this scope.' : landConfig.followMapCountries
                  ? (landConfig.countries.length
                    ? `Automatically clipped to the ${landConfig.countries.length} selected map ${landConfig.countries.length === 1 ? 'country' : 'countries'}.`
                    : 'Waiting for a Geography selection; currently showing all Europe.')
                  : (landConfig.countries.length
                    ? `Custom scope: ${landConfig.countries.length} selected ${landConfig.countries.length === 1 ? 'country' : 'countries'}.`
                    : 'Custom scope covers all available European countries.')}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1">
              {[
                ['Constraints', ['protected', 'water', 'urban']],
                ['Land cover', ['agriculture', 'forest', 'industrial']],
                ['All', ['protected', 'water', 'urban', 'agriculture', 'forest', 'industrial']],
              ].map(([label, categories]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => updateLandConfig({ enabled: true, categories })}
                  className="rounded-lg border border-white/10 bg-white/[0.035] px-1.5 py-1.5 text-[9px] text-slate-300 transition hover:border-emerald-300/35 hover:text-white"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-1">
              {['protected', 'water', 'urban', 'agriculture', 'forest', 'industrial'].map((category) => {
                const meta = landCategoryMeta[category] || { id: category, label: category, color: '#94a3b8', role: 'other' };
                const selected = landConfig.categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleLandCategory(category)}
                    aria-pressed={selected}
                    className={`w-full rounded-lg border px-2 py-1.5 text-left transition ${selected ? 'border-white/15 bg-white/[0.07]' : 'border-transparent bg-black/15 opacity-50 hover:opacity-85'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: selected ? meta.color : '#64748b' }} />
                      <span className={`min-w-0 flex-1 text-[10px] ${selected ? 'text-white' : 'text-slate-400'}`}>{meta.label}</span>
                      <span className="text-[8px] uppercase tracking-wide text-slate-500">{String(meta.role || '').startsWith('hard') ? 'hard' : String(meta.role || '').startsWith('conditional') ? 'check' : meta.role === 'opportunity' ? 'opp.' : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="mt-3 block">
              <span className="flex items-center justify-between text-[9px] text-slate-400"><span>Overlay opacity</span><span ref={landOpacityLabelRef} className="tabular-nums text-white">{Math.round(landConfig.opacity)}%</span></span>
              <input
                ref={landOpacityRangeRef}
                type="range"
                min="20"
                max="100"
                step="1"
                defaultValue={landConfig.opacity}
                onInput={(event) => previewLandOpacity(event.currentTarget.value)}
                onPointerUp={(event) => commitLandOpacity(event.currentTarget.value)}
                onPointerCancel={(event) => commitLandOpacity(event.currentTarget.value)}
                onKeyUp={(event) => {
                  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                    commitLandOpacity(event.currentTarget.value);
                  }
                }}
                onBlur={(event) => commitLandOpacity(event.currentTarget.value)}
                className="mt-1 w-full accent-emerald-300"
                aria-label="Land overlay opacity"
              />
            </label>

            <button
              type="button"
              onClick={() => { setLandInspectMode((value) => !value); setLandInspection(null); }}
              disabled={!landScope.ready}
              aria-pressed={landInspectMode}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-2 py-2 text-[10px] font-semibold transition ${landInspectMode ? 'border-emerald-300/50 bg-emerald-300/15 text-emerald-200' : 'border-white/10 bg-white/[0.035] text-slate-300 hover:text-white'}`}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
              {landInspectMode ? 'Click a location…' : 'Inspect a location'}
            </button>

            {landScope.ready && landInspection && (
              <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 leading-4">
                {landInspection.loading ? (
                  <span className="text-slate-400">Reading local rasters…</span>
                ) : landInspection.error ? (
                  <span className="text-rose-300">{landInspection.error}</span>
                ) : landInspection.data?.in_scope === false ? (
                  <>
                    <p className="font-semibold text-amber-200">Outside selected country scope</p>
                    <p className="text-slate-400">{landInspection.data?.country?.name || 'This location'} is not included in the active land filter.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-white">{landInspection.data?.land_cover?.label || 'Unclassified location'}</p>
                    <p className="text-slate-400">CLC {landInspection.data?.land_cover?.clc_code || '—'} · {landInspection.data?.protected ? 'Natura 2000 protected' : 'not in the local Natura mask'}</p>
                    <p className="mt-1 text-[9px] text-emerald-200">{landInspection.data?.screening?.label}</p>
                  </>
                )}
              </div>
            )}

            {landScope.ready && <LandSampleSummary stats={landViewportStats} countryScoped={landConfig.countries.length > 0} />}

            <p className="mt-3 border-t border-white/8 pt-2 text-[8px] leading-3 text-slate-500">Screening only—not parcel availability, ownership, permitting or legal advice. Verify current national and local records before siting.</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => updateLandConfig(
            !landConfig.enabled
              ? { enabled: true, panelOpen: true }
              : !landConfig.panelOpen
                ? { panelOpen: true }
                : { enabled: false, panelOpen: false }
          )}
          aria-pressed={landConfig.enabled}
          aria-label="Toggle Land and Constraints overlay"
          title="Land & Constraints"
          className={`h-9 rounded-lg border px-2.5 flex items-center gap-1.5 text-[10px] font-semibold shadow-xl backdrop-blur-lg transition ${landConfig.enabled ? 'border-emerald-300/50 bg-emerald-300/15 text-emerald-200' : 'border-white/15 bg-[#071421]/92 text-slate-300 hover:border-emerald-300/35 hover:text-white'}`}
        >
          <Leaf className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Land</span>
        </button>
      </div>
      <div style={controlsHidden || panelsHidden ? { display: 'none' } : undefined} className="absolute top-[194px] sm:top-[138px] right-[58px] z-[566] flex items-start gap-2">
        {gridAccessConfig.panelOpen && (
          <div role="region" aria-label="Grid Access controls" className="atlas-access-controls w-[270px] overflow-y-auto rounded-2xl border border-sky-300/20 bg-[#071421]/96 p-3 text-[10px] text-slate-300 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.16em] text-sky-300">Connection intelligence</p>
                <h3 className="mt-0.5 text-[13px] font-semibold text-white">Grid Access &amp; Queue</h3>
                <p className="mt-0.5 text-[9px] text-slate-400">Published registers · lazy map overlay</p>
              </div>
              <button type="button" onClick={() => updateGridAccessConfig({ panelOpen: false })} className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Close Grid Access controls">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {gridAccessConfig.status?.available === false && (
              <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 p-2 text-rose-200">
                Grid-access service unavailable{gridAccessConfig.status?.error ? `: ${gridAccessConfig.status.error}` : '.'}
              </div>
            )}
            {gridAccessConfig.error && (
              <div role="alert" className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 p-2 text-rose-200">
                <p>{gridAccessConfig.error}</p>
                {typeof gridAccessConfig.onRetry === 'function' && <button type="button" onClick={gridAccessConfig.onRetry} disabled={gridAccessConfig.loading} className="mt-2 rounded border border-rose-200/40 px-2 py-1 text-white hover:bg-white/10">Retry grid-access data</button>}
              </div>
            )}

            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-wide text-slate-400">Country scope</span>
                <span className="rounded-md border border-sky-300/30 bg-sky-300/10 px-1.5 py-1 text-[8px] text-sky-200">Following map</span>
              </div>
              <p className="mt-1.5 text-[9px] leading-3 text-slate-400">
                {gridAccessConfig.countryCodes.length
                  ? gridAccessConfig.countryCodes.join(' + ')
                  : `All available countries${gridAccessConfig.status?.countries?.length
                    ? ` (${gridAccessConfig.status.countries.map((country) => country.country_code).join(' + ')})`
                    : ''}`}
              </p>
              <p className="mt-1.5 text-[9px] leading-3 text-sky-200">
                Selected view has published data for {gridAccessScopedCoverage.length
                  ? gridAccessScopedCoverage.join(' + ')
                  : 'none of the selected countries'}.
              </p>
            </div>

            <div className="mt-3">
              <p className="text-[9px] uppercase tracking-wide text-slate-500">Connection side</p>
              <button
                type="button"
                onClick={() => updateGridAccessConfig({ enabled: true, sides: GRID_ACCESS_SIDE_KEYS })}
                aria-pressed={gridAccessAllSidesSelected}
                className={`mt-1.5 flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[9px] transition ${gridAccessAllSidesSelected ? 'border-sky-300/45 bg-sky-300/15 text-sky-100' : 'border-white/10 bg-black/15 text-slate-400 hover:border-sky-300/25 hover:text-white'}`}
              >
                <span className="font-medium">All connection sides</span>
                <span className="text-[8px] text-sky-300">All published countries</span>
              </button>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {GRID_ACCESS_SIDE_OPTIONS.map(([side, label]) => {
                  const selected = gridAccessConfig.sides.length === 1
                    && gridAccessConfig.sides.includes(side);
                  const coveredCountries = gridAccessCoverageBySide[side] || [];
                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={() => updateGridAccessConfig({ enabled: true, sides: [side] })}
                      aria-pressed={selected}
                      className={`rounded-lg border px-2 py-1.5 text-left text-[9px] transition ${selected ? 'border-sky-300/45 bg-sky-300/12 text-white' : 'border-white/10 bg-white/[0.025] text-slate-400 hover:text-white'}`}
                    >
                      <span className="block">{label}</span>
                      <span className="mt-0.5 block text-[8px] text-slate-500">
                        {coveredCountries.length ? coveredCountries.join(' + ') : 'No current source'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mt-3 block">
              <span className="text-[9px] uppercase tracking-wide text-slate-500">Map measure</span>
              <select
                value={gridAccessConfig.metric}
                onChange={(event) => updateGridAccessConfig({ enabled: true, metric: event.target.value })}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a1a29] px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-sky-300/45"
                aria-label="Grid access map measure"
              >
                <option value="pressure">Connection pressure</option>
                <option value="available_mw">Available access (MW)</option>
                <option value="queued_mw">Queued / contracted MW</option>
                <option value="project_count">Future project count</option>
                <option value="lead_time_years">Earliest connection lead time</option>
              </select>
            </label>

            <div className="mt-3">
              <div className="flex items-center justify-between text-[9px] text-slate-500"><span>Project scope</span><span>{gridAccessConfig.projectScope === 'future' ? 'Future / incomplete' : 'All register rows'}</span></div>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/15 p-1">
                {[
                  ['future', 'Future'],
                  ['all', 'All'],
                ].map(([scope, label]) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => updateGridAccessConfig({ enabled: true, projectScope: scope })}
                    className={`rounded-md px-2 py-1 text-[9px] transition ${gridAccessConfig.projectScope === scope ? 'bg-sky-300/15 text-sky-100' : 'text-slate-500 hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2">
              {gridAccessConfig.loading ? (
                <p className="animate-pulse text-sky-200">Loading connection evidence…</p>
              ) : gridAccessConfig.error ? (
                <p className="text-slate-300">Record counts unavailable for this selection. Retry to load current evidence.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1 text-center tabular-nums">
                  <div><p className="text-[12px] font-semibold text-white">{Number(gridAccessConfig.data.meta?.rendered_sites || 0).toLocaleString()}</p><p className="text-[8px] text-slate-500">mapped</p></div>
                  <div><p className="text-[12px] font-semibold text-white">{Number(gridAccessConfig.data.meta?.relevant_sites || 0).toLocaleString()}</p><p className="text-[8px] text-slate-500">published</p></div>
                  <div><p className="text-[12px] font-semibold text-amber-200">{Number(gridAccessConfig.data.meta?.unlocated_sites || 0).toLocaleString()}</p><p className="text-[8px] text-slate-500">unlocated</p></div>
                </div>
              )}
            </div>

            <GridAccessLegend metric={gridAccessConfig.metric} />

            <p className="mt-3 border-t border-white/8 pt-2 text-[8px] leading-3 text-slate-500">
              Screening evidence, not a connection offer. Register definitions differ by country. Uncertain site-name matches are never plotted; inspect the source and TSO before making a siting decision.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => updateGridAccessConfig(
            !gridAccessConfig.enabled
              ? { enabled: true, panelOpen: true }
              : !gridAccessConfig.panelOpen
                ? { panelOpen: true }
                : { enabled: false, panelOpen: false }
          )}
          aria-pressed={gridAccessConfig.enabled}
          aria-label="Toggle Grid Access and Queue overlay"
          title="Grid Access & Queue"
          className={`h-9 rounded-lg border px-2.5 flex items-center gap-1.5 text-[10px] font-semibold shadow-xl backdrop-blur-lg transition ${gridAccessConfig.enabled ? 'border-sky-300/50 bg-sky-300/15 text-sky-200' : 'border-white/15 bg-[#071421]/92 text-slate-300 hover:border-sky-300/35 hover:text-white'}`}
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Access</span>
        </button>
      </div>
      {mapViewMode === 'our-model' && displayedFrame?.capacityStylingEnabled && (
        <ConnectionCapacityLegend scales={displayedFrame.capacityScales} />
      )}
      <div style={controlsHidden ? { display: 'none' } : undefined} className="absolute top-[148px] sm:top-24 right-3 sm:right-4 z-[560] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => moveMapManually(() => mapInstance.setZoom(Math.min(mapInstance.getMaxZoom(), mapInstance.getZoom() + 1), { animate: !performanceMode && animateAtlasMap() }))}
          aria-label="Zoom in"
          className="h-9 w-9 rounded-lg border border-white/15 bg-[#071421]/92 text-tj-gray shadow-xl backdrop-blur-lg transition hover:border-tj-gold/35 hover:text-white hover:bg-[#132a40] flex items-center justify-center"
          title="Zoom In"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => moveMapManually(() => mapInstance.setZoom(Math.max(mapInstance.getMinZoom(), mapInstance.getZoom() - 1), { animate: !performanceMode && animateAtlasMap() }))}
          aria-label="Zoom out"
          className="h-9 w-9 rounded-lg border border-white/15 bg-[#071421]/92 text-tj-gray shadow-xl backdrop-blur-lg transition hover:border-tj-gold/35 hover:text-white hover:bg-[#132a40] flex items-center justify-center"
          title="Zoom Out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={fitToVisibleNetwork}
          aria-label="Fit map to loaded network"
          className="h-9 w-9 rounded-lg border border-tj-gold/30 bg-tj-gold/10 text-tj-gold shadow-xl backdrop-blur-lg transition hover:border-tj-gold/55 hover:bg-tj-gold/15 flex items-center justify-center"
          title="Fit European network · Shift-click to include all loaded overseas assets"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => moveMapManually(() => mapInstance.setView([52, 8], 5, { animate: !performanceMode && animateAtlasMap() }))}
          aria-label="Reset map to Europe"
          className="h-9 w-9 rounded-lg border border-white/15 bg-[#071421]/92 text-tj-gray shadow-xl backdrop-blur-lg transition hover:border-tj-gold/35 hover:text-white hover:bg-[#132a40] flex items-center justify-center"
          title="Reset View"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

const shallowArrayEqual = (left, right) => {
  if (Object.is(left, right)) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => Object.is(value, right[index]));
};

const shallowObjectEqual = (left, right) => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]));
};

const useStableArray = (value) => {
  const stableRef = useRef(value);
  const stableValue = shallowArrayEqual(stableRef.current, value) ? stableRef.current : value;
  useLayoutEffect(() => { stableRef.current = stableValue; }, [stableValue]);
  return stableValue;
};

const useStableObject = (value) => {
  const stableRef = useRef(value);
  const stableValue = shallowObjectEqual(stableRef.current, value) ? stableRef.current : value;
  useLayoutEffect(() => { stableRef.current = stableValue; }, [stableValue]);
  return stableValue;
};

// App owns voice, judge and panel state, so it can render frequently while the
// map is unchanged. Keep latest event handlers available through stable proxy
// functions and reuse equivalent wrapper values; React.memo can then leave the
// expensive feature tree completely untouched during transcript/UI updates.
const useStableEvent = (handler) => {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => { handlerRef.current = handler; }, [handler]);
  return useCallback((...args) => handlerRef.current?.(...args), []);
};

const MemoizedEnhancedLeafletMapContent = React.memo(EnhancedLeafletMapContent);
MemoizedEnhancedLeafletMapContent.displayName = 'MemoizedEnhancedLeafletMapContent';

const EnhancedLeafletMapWithVoice = (props) => {
  const activeCountryCodes = useStableArray(props.activeCountryCodes);
  const gridAccess = useStableObject(props.gridAccess);
  const onConnectionClick = useStableEvent(props.onConnectionClick);
  const onRegionCenterChange = useStableEvent(props.onRegionCenterChange);

  return (
    <MemoizedEnhancedLeafletMapContent
      {...props}
      activeCountryCodes={activeCountryCodes}
      gridAccess={gridAccess}
      onConnectionClick={onConnectionClick}
      onRegionCenterChange={onRegionCenterChange}
    />
  );
};

EnhancedLeafletMapWithVoice.displayName = 'EnhancedLeafletMapWithVoice';

export default EnhancedLeafletMapWithVoice;
