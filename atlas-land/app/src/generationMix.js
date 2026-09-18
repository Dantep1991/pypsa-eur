import { escapeMapText as escapeHtml, publishedNumber } from './mapText';

const positive = value => Math.max(0, publishedNumber(value) || 0);

function tooltipHtml({ facility, segments, total, basis, unit, capacityTotal }) {
  const locationLabel = String(facility?.bus || facility?.name || 'Network node');
  const rows = segments.map(segment => (
    '<div style="display:flex;align-items:center;gap:6px;margin-top:3px;">'
    + `<span style="width:8px;height:8px;border-radius:2px;background:${escapeHtml(segment.color)};display:inline-block;"></span>`
    + `<span>${escapeHtml(segment.label)}: ${(segment.share * 100).toFixed(1)}% (${segment.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit})</span>`
    + '</div>'
  )).join('');
  return '<div style="min-width:190px;font-size:11px;line-height:1.35;">'
    + `<strong>${escapeHtml(locationLabel)}</strong>`
    + `<div style="color:#94a3b8;margin-top:2px;">${basis}: ${total.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}</div>`
    + (unit === 'MWh' ? `<div style="color:#94a3b8;margin-top:2px;">Installed capacity: ${capacityTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })} MW</div>` : '')
    + rows + '</div>';
}

// Sites are immutable objects from the current generation index. Navigation
// reuses composition; replacing source/filter inputs produces new sites. Weak
// keys do not retain a history of removed countries or generator snapshots.
// Unvisited sites are not prepared, and HTML is formatted only on first hover.
export function createGenerationMixResolver(colorForGenerator) {
  const cache = new WeakMap();
  return site => {
    if (cache.has(site)) return cache.get(site);
    const useDispatch = site.dispatchTotal > 0;
    const aggregate = new Map();
    for (const item of site.generators) {
      const value = useDispatch ? positive(item.total_dispatch_MWh)
        : positive(item.p_nom_opt) || positive(item.p_nom);
      if (!value) continue;
      const key = String(item.carrier_key || item.carrier || item.type || 'other');
      const previous = aggregate.get(key) || {
        key, label: String(item.carrier_nice_name || item.carrier || key),
        color: colorForGenerator(item), value: 0,
      };
      previous.value += value;
      aggregate.set(key, previous);
    }
    const values = [...aggregate.values()];
    const total = values.reduce((sum, item) => sum + item.value, 0);
    if (!(total > 0)) { cache.set(site, null); return null; }
    const mix = {
      facility: site.generators[0],
      segments: values.map(item => ({ ...item, share: item.value / total })).sort((a, b) => b.value - a.value),
      total, capacityTotal: site.capacityTotal,
      basis: useDispatch ? 'Generation' : 'Installed capacity', unit: useDispatch ? 'MWh' : 'MW',
    };
    let html;
    mix.tooltipContent = () => {
      if (html === undefined) html = tooltipHtml(mix);
      return html;
    };
    cache.set(site, mix);
    return mix;
  };
}
