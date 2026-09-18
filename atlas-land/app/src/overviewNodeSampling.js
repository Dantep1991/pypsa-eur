import { publishedNumber } from './mapText';
const norm = value => String(value ?? '').trim().toUpperCase();

// Source-snapshot index: normalize metadata and project coordinates once, not
// once per comparator/cell on every zoom or pan. Keep original node references.
export function indexOverviewNodes(ranked, getCountries) {
  return ranked.map(node => {
    const lat = publishedNumber(node.latitude), lon = publishedNumber(node.longitude);
    const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const radians = latitude * Math.PI / 180;
    return { node, id: norm(node.id ?? node.key), carrier: String(node.atlas_network_carrier || 'unknown').toLowerCase(),
      countries: getCountries(node),
      x: lon != null && Math.abs(lon) <= 180 ? (lon + 180) / 360 : null,
      y: lat != null && Math.abs(lat) <= 90 ? (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 : null,
    };
  });
}

function geographicSample(entries, limit, selectedIds, zoom) {
  const chosen = new Set(), countries = new Set(), cells = new Set();
  const cellScale = 2 ** Math.max(0, Math.min(18, zoom)) * 4; // 64px cells in world coordinates
  const cell = entry => entry.x == null || entry.y == null ? 'unknown'
    : `${Math.floor(entry.x * cellScale)}:${Math.floor(entry.y * cellScale)}`;
  const add = entry => {
    if (chosen.size >= limit || chosen.has(entry)) return;
    chosen.add(entry);
    for (const country of entry.countries) countries.add(country);
    cells.add(cell(entry));
  };
  // Highest-ranked representative of each tagged country. Multi-country assets
  // satisfy all their supplied tags without inventing a country from coordinates.
  for (const entry of entries) {
    if (chosen.size >= limit) break;
    if (entry.countries.some(country => !countries.has(country))) add(entry);
  }
  for (const entry of entries) {
    if (chosen.size >= limit) break;
    if (!cells.has(cell(entry))) add(entry);
  }
  for (const entry of entries) { if (chosen.size >= limit) break; add(entry); }
  // Do not change membership when a user clicks an already visible marker:
  // doing so would remount its layer and close the popup. Insert only missing
  // selections, preferentially replacing a non-unique country representative.
  const protectedEntries = new Set();
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  for (const id of selectedIds) {
    const entry = byId.get(id);
    if (!entry || protectedEntries.size >= limit) continue;
    if (!chosen.has(entry)) {
      const coverage = new Map();
      for (const item of chosen) for (const country of item.countries) coverage.set(country, (coverage.get(country) || 0) + 1);
      const removable = [...chosen].reverse().filter(item => !protectedEntries.has(item));
      const replace = removable.find(item => item.countries.every(country => coverage.get(country) > 1)) || removable[0];
      if (replace) chosen.delete(replace);
      if (chosen.size < limit) chosen.add(entry);
    }
    if (chosen.has(entry)) protectedEntries.add(entry);
  }
  return chosen;
}

export function selectOverviewNodes(index, visible, limit, { zoom = 4, selectedIds = [], balanceCarriers = false } = {}) {
  const maximum = Math.max(0, Math.floor(Number(limit) || 0));
  if (!maximum) return [];
  const wanted = new Set(visible);
  const entries = index.filter(entry => wanted.has(entry.node));
  if (entries.length <= maximum) return entries.map(entry => entry.node);
  const selected = [...new Set(selectedIds.map(norm).filter(Boolean))];
  if (!balanceCarriers) return [...geographicSample(entries, maximum, selected, zoom)].map(entry => entry.node);

  const groups = [...entries.reduce((map, entry) => {
    if (!map.has(entry.carrier)) map.set(entry.carrier, []);
    map.get(entry.carrier).push(entry); return map;
  }, new Map()).values()];
  // Preserve the overlay's base share for small networks. Allocate only within
  // the remaining hard budget, including when there are more carriers than slots.
  const allocation = groups.map(() => 0);
  let remaining = maximum;
  const base = Math.max(1, Math.floor(maximum * 0.3 / groups.length));
  const minimum = groups.map(group => Math.min(group.length,
    Math.max(base, new Set(group.flatMap(entry => entry.countries)).size)));
  for (let pass = 0; pass < Math.max(...minimum) && remaining; pass++) {
    for (let i = 0; i < groups.length && remaining; i++) {
      if (allocation[i] < minimum[i]) { allocation[i]++; remaining--; }
    }
  }
  while (remaining) {
    let best = -1;
    for (let i = 0; i < groups.length; i++) {
      if (allocation[i] < groups[i].length && (best < 0
        || allocation[i] / groups[i].length < allocation[best] / groups[best].length)) best = i;
    }
    if (best < 0) break;
    allocation[best]++; remaining--;
  }
  const chosen = new Set();
  groups.forEach((group, i) => {
    for (const entry of geographicSample(group, allocation[i], selected, zoom)) chosen.add(entry);
  });
  return entries.filter(entry => chosen.has(entry)).map(entry => entry.node);
}
