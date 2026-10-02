export const SCENE_LIMIT = 4;
export const numeric = value => value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function coordinate(record) {
  const lat = numeric(record?.latitude); const lng = numeric(record?.longitude);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}
export const recordName = record => String(record?.atlas_region_group_name || record?.name || record?.id || 'Unnamed asset');
export function distanceKm(a, b) {
  const rad = v => v * Math.PI / 180;
  const q = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, q)));
}
export function viewMetrics(facilities, connections) {
  return { assets: facilities.length, links: connections.length,
    regions: facilities.filter(item => item.atlas_region_group_name).length };
}
export function metricDifference(before, after) {
  return Object.keys(after).map(key => `${key}: ${before[key]} → ${after[key]}`).join(' · ');
}
export function candidateSites(facilities, center, radius, limit = 6) {
  if (!Array.isArray(center) || !center.every(Number.isFinite) || !(radius > 0)) return [];
  const water = facilities.filter(item => item.atlas_network_carrier === 'water' && coordinate(item));
  const seen = new Set();
  return facilities.filter(item => {
    if ((item.atlas_network_carrier || 'electricity') !== 'electricity' || String(item.component_type || item.type).toLowerCase() !== 'bus'
        || item.atlas_visual_aggregation_only || item.is_virtual || !coordinate(item)) return false;
    const key = String(item.id); if (seen.has(key)) return false; seen.add(key);
    return distanceKm(center, coordinate(item)) <= radius;
  }).map(item => ({ item, point: coordinate(item), distance: distanceKm(center, coordinate(item)) }))
    .sort((a, b) => a.distance - b.distance || recordName(a.item).localeCompare(recordName(b.item)))
    .slice(0, limit).map(candidate => {
      let nearestWater = null;
      for (const item of water) {
        const distance = distanceKm(candidate.point, coordinate(item));
        if (!nearestWater || distance < nearestWater.distance) nearestWater = { name: recordName(item), distance };
      }
      return { ...candidate, nearestWater };
    });
}
export function assetFacts(record, connections = []) {
  const ids = new Set([record?.id, record?.nodeId, record?.name].filter(v => v != null).map(String));
  const links = connections.filter(edge => ids.has(String(edge.from ?? edge.fromNode)) || ids.has(String(edge.to ?? edge.toNode)));
  const region = Boolean(record?.atlas_region_group_name);
  return { name: recordName(record), region, links,
    source: region ? 'Visual aggregation of cached country networks' : record?.source_label || record?.source || record?.sourceNetworkFilename || 'Source not provided',
    countries: record?.country_codes || [record?.sourceCountryCode || record?.country].filter(Boolean),
    capacity: region ? null : numeric(record?.p_nom_opt ?? record?.p_nom),
    underlying: region ? numeric(record?.atlas_source_count) : null,
  };
}

export function nodePortfolio(record, facilities) {
  const ids = new Set([record?.id, record?.nodeId, record?.bus, record?.name].filter(v => v != null).map(String));
  const point = coordinate(record);
  const related = facilities.filter(item => {
    if ((item.atlas_network_carrier || 'electricity') !== (record.atlas_network_carrier || 'electricity')) return false;
    if (item === record || (item.bus != null && ids.has(String(item.bus)))) return true;
    const p = coordinate(item);
    return point && p && Math.abs(point[0] - p[0]) < 0.00001 && Math.abs(point[1] - p[1]) < 0.00001;
  });
  const mix = new Map(); let demand = null; let storage = null; let provisional = false;
  for (const item of related) {
    const type = String(item.component_type || item.type || '').toLowerCase();
    if (type === 'generator') {
      const capacity = numeric(item.p_nom_opt) ?? numeric(item.p_nom);
      if (capacity !== null && capacity >= 0) {
        const carrier = item.carrier_nice_name || item.carrier || 'Unspecified';
        mix.set(carrier, (mix.get(carrier) || 0) + capacity);
      }
    }
    if (type === 'load' && numeric(item.annual_energy_gwh) !== null) {
      demand = (demand ?? 0) + numeric(item.annual_energy_gwh); provisional ||= Boolean(item.provisional_demand);
    }
    if (type === 'store' && numeric(item.e_nom) !== null) storage = (storage ?? 0) + numeric(item.e_nom);
  }
  return { mix: [...mix].map(([carrier, capacity]) => ({ carrier, capacity })), demand, storage, provisional };
}

export function siteEvidence(site, { requireWater = false, maxWaterKm = 20 } = {}) {
  if (site.land?.in_scope === false || (requireWater && (!Number.isFinite(maxWaterKm) || maxWaterKm < 1))) return 'Evidence incomplete';
  if (site.land?.protected === true) return 'Protected-area flag — review exclusion';
  if (requireWater && site.nearestWater && site.nearestWater.distance > maxWaterKm) return 'Outside requested water proximity';
  if (site.loading || site.error || site.land?.in_scope === false || typeof site.land?.protected !== 'boolean' || !site.land?.land_cover?.label
      || (requireWater && !site.nearestWater)) return 'Evidence incomplete';
  return 'Point checks available — capacity and permitting unverified';
}

export function nearbyAccess(point, collection, radius = 50) {
  let nearest = null;
  for (const feature of collection?.features || []) {
    if (feature.geometry?.type !== 'Point') continue;
    const [lng, lat] = feature.geometry.coordinates || [];
    const p = coordinate({ latitude: lat, longitude: lng }); if (!p) continue;
    const distance = distanceKm(point, p);
    if (distance <= radius && (!nearest || distance < nearest.distance)) nearest = { distance, properties: feature.properties || {} };
  }
  return nearest;
}

export function comparisonWithinBudget(scene) {
  if (scene.facilities.length + scene.connections.length > 100000) return false;
  let points = 0;
  for (const edge of scene.connections) {
    points += Array.isArray(edge.coordinate_paths) ? edge.coordinate_paths.reduce((sum, path) => sum + (path?.length || 0), 0) : (edge.coordinates?.length || 2);
    if (points > 250000) return false;
  }
  return true;
}
