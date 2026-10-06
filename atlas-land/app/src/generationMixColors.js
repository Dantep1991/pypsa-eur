import { RESULT_SERIES_COLORS } from './modelWorkspace/resultColors';

export const generationCategoryKey = item => String(item.carrier_key || item.carrier || item.type || 'other');

// Category labels are opaque data identities, not a technology classifier.
// Reuse the result chart palette, extending it with shade variants rather than
// falling back to a single generic Generator colour for unrecognised labels.
function seriesColour(index) {
  const base = RESULT_SERIES_COLORS[index % RESULT_SERIES_COLORS.length];
  const cycle = Math.floor(index / RESULT_SERIES_COLORS.length);
  if (!cycle) return base;
  const light = cycle % 2 === 1;
  const amount = Math.min(0.65, 0.15 * Math.ceil(cycle / 2));
  const channels = base.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16);
    return Math.round(value + ((light ? 255 : 0) - value) * amount).toString(16).padStart(2, '0');
  });
  return '#' + channels.join('');
}

export function generationCategoryColours(generators) {
  const categories = new Map();
  for (const item of generators) {
    const key = generationCategoryKey(item);
    if (!categories.has(key)) categories.set(key, new Set());
    if (/^#[\da-f]{6}$/i.test(item.carrier_color || '')) categories.get(key).add(item.carrier_color.toLowerCase());
  }
  const colours = new Map(), used = new Set();
  let next = 0;
  for (const key of [...categories.keys()].sort()) {
    const explicit = categories.get(key);
    let colour = explicit.size === 1 ? [...explicit][0] : null;
    if (!colour || used.has(colour)) {
      // Very large legends eventually repeat shades; never spin indefinitely.
      for (let attempt = 0; attempt < 120; attempt++) {
        colour = seriesColour(next++).toLowerCase();
        if (!used.has(colour)) break;
      }
    }
    colours.set(key, colour); used.add(colour);
  }
  return colours;
}
