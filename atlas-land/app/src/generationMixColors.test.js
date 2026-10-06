import { generationCategoryColours, generationCategoryKey } from './generationMixColors';
import { createGenerationMixResolver } from './generationMix';
import { indexGenerationSites } from './generationMapLayout';

const generator = (carrier, extra = {}) => ({ type: 'Generator', carrier, p_nom: 100,
  latitude: 52, longitude: 8, ...extra });

test('unrecognised schema categories receive distinct colours, beyond the base palette', () => {
  const items = Array.from({ length: 30 }, (_, i) => generator(`category-${i}`));
  const colours = generationCategoryColours(items);
  expect(new Set(colours.values()).size).toBe(30);
  expect(generationCategoryColours([...items].reverse())).toEqual(colours);
  expect(generationCategoryColours([...items, ...items])).toEqual(colours);
});

test('preserves unique declared colours without allowing the generic colour to collapse all categories', () => {
  const colours = generationCategoryColours([
    generator('A', { carrier_color: '#ff0000' }), generator('B', { carrier_color: '#22c55e' }),
    generator('C', { carrier_color: '#22c55e' }), generator('D', { carrier_color: 'unsafe; background: url(x)' }),
  ]);
  expect(colours.get('A')).toBe('#ff0000');
  expect(new Set(colours.values()).size).toBe(4);
  expect([...colours.values()].every(colour => /^#[\da-f]{6}$/i.test(colour))).toBe(true);
});

test('the same category and tooltip swatch use the same colour at every node', () => {
  const items = [generator('A'), generator('B'), generator('A', { longitude: 9 }), generator('B', { longitude: 9 })];
  const colours = generationCategoryColours(items);
  const resolve = createGenerationMixResolver(item => colours.get(generationCategoryKey(item)));
  const mixes = indexGenerationSites(items).map(resolve);
  expect(mixes[0].segments.map(s => s.color)).toEqual(mixes[1].segments.map(s => s.color));
  for (const segment of mixes[0].segments) expect(mixes[0].tooltipContent()).toContain(`background:${segment.color}`);
  expect(mixes[0].segments.map(s => s.share)).toEqual([0.5, 0.5]);
});

test('a very large category catalog cannot stall colour assignment', () => {
  expect(generationCategoryColours(Array.from({ length: 300 }, (_, i) => generator(String(i)))).size).toBe(300);
});
