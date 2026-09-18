import { publishedNumber } from './mapText';
import { atlasRecordCountryCodes } from './atlasNetworkOverlay';
import { indexOverviewNodes, selectOverviewNodes } from './overviewNodeSampling';

const positive = value => Math.max(0, publishedNumber(value) || 0);
const aggregateFile = /_(?:bidding_zone|ehighway|nuts[123]|c\d+)\.nc$/i;

// Index visible generators once per dataset/filter change. Do not walk copied
// sameLocationFacilities for every component or reintroduce hidden carriers.
export function indexGenerationSites(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    if (String(node?.component_type || node?.type || '').toLowerCase() !== 'generator') continue;
    const latitude = publishedNumber(node.latitude);
    const longitude = publishedNumber(node.longitude);
    if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const key = node.locationKey || `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, { key, latitude, longitude, generators: [], countries: new Set(), capacityTotal: 0, dispatchTotal: 0, aggregate: false });
    const site = groups.get(key);
    site.generators.push(node);
    for (const country of atlasRecordCountryCodes(node)) site.countries.add(country);
    site.capacityTotal += positive(node.p_nom_opt) || positive(node.p_nom);
    site.dispatchTotal += positive(node.total_dispatch_MWh);
    site.aggregate ||= aggregateFile.test(String(node.sourceNetworkFilename || ''));
  }
  return [...groups.values()].filter(site => site.capacityTotal > 0 || site.dispatchTotal > 0)
    .sort((a, b) => b.capacityTotal - a.capacityTotal || a.key.localeCompare(b.key));
}

export function selectGenerationSites(sites, zoom, viewport, { index, selectedIds = [] } = {}) {
  const visible = viewport ? sites.filter(site => site.latitude >= viewport.south && site.latitude <= viewport.north
    && site.longitude >= viewport.west && site.longitude <= viewport.east) : sites;
  // Pie markers are DOM-backed so their interactive tooltips remain crisp.
  // Keep the ordinary country-fit zooms inside the work-laptop DOM budget;
  // progressively reveal the complete nodal fleet only at street-level zoom.
  const limit = zoom >= 11 ? Infinity : zoom >= 10 ? 1400 : zoom >= 9 ? 900
    : zoom >= 8 ? 600 : zoom >= 7 ? 480 : zoom >= 6 ? 360 : zoom >= 5 ? 260 : 180;
  const detailed = visible.filter(site => !site.aggregate);
  if (detailed.length <= limit) return { sites: visible, inView: visible.length };
  const selected = new Set(selectedIds.map(id => String(id ?? '').toUpperCase()).filter(Boolean));
  const selectedSites = selected.size ? visible.filter(site => site.generators.some(node => selected.has(String(node.id).toUpperCase()))).map(site => site.key) : [];
  const overviewIndex = index || indexOverviewNodes(sites, site => [...site.countries]);
  const keep = new Set(selectOverviewNodes(overviewIndex, detailed, limit, { zoom, selectedIds: selectedSites }));
  return { sites: visible.filter(site => site.aggregate || keep.has(site)), inView: visible.length };
}

export function generationPieDiameter(ratio, zoom, aggregate = false) {
  const sizes = zoom >= 11 ? [9, 48] : zoom >= 10 ? [8, 42] : zoom >= 9 ? [7, 36]
    : zoom >= 8 ? [6, 30] : zoom >= 7 ? [5, 24] : zoom >= 6 ? [4, 18] : zoom >= 5 ? [3, 13] : [2, 9];
  // A regional network has far fewer symbols than the nodal graph. Retain
  // readable mixes there, while full-network overview symbols stay compact.
  const min = aggregate ? Math.max(5, sizes[0]) : sizes[0];
  const max = aggregate ? Math.max(22, sizes[1]) : sizes[1];
  return Math.max(min, Math.round(max * Math.sqrt(Math.max(0, Math.min(1, publishedNumber(ratio) || 0)))));
}
