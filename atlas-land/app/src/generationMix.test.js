import { createGenerationMixResolver } from './generationMix';
import { indexGenerationSites } from './generationMapLayout';

const generator = (carrier, p_nom, extra = {}) => ({
  type: 'Generator', carrier, p_nom, latitude: 52, longitude: 8, ...extra,
});
const site = generators => indexGenerationSites(generators)[0];

test('composition and formatted HTML are reused, with no formatting before inspection', () => {
  const color = jest.fn(() => '#00ff00');
  const resolve = createGenerationMixResolver(color);
  const source = site([generator('wind', 300), generator('solar', 100)]);
  const format = jest.spyOn(Number.prototype, 'toLocaleString');
  try {
    const mix = resolve(source);
    expect(mix.segments.map(segment => segment.share)).toEqual([0.75, 0.25]);
    expect(format).not.toHaveBeenCalled();
    expect(resolve(source)).toBe(mix);
    expect(color).toHaveBeenCalledTimes(2);
    const html = mix.tooltipContent();
    const calls = format.mock.calls.length;
    expect(calls).toBe(3);
    expect(html).toContain('75.0%');
    expect(mix.tooltipContent()).toBe(html);
    expect(format).toHaveBeenCalledTimes(calls);
  } finally { format.mockRestore(); }
});

test('new filtered source recomputes shares without altering the previous snapshot', () => {
  const resolve = createGenerationMixResolver(() => '#00ff00');
  const wind = generator('wind', 300);
  const solar = generator('solar', 100);
  const original = resolve(site([wind, solar]));
  const filtered = resolve(site([solar]));
  expect(filtered).not.toBe(original);
  expect(filtered.segments[0].share).toBe(1);
  expect(filtered.capacityTotal).toBe(100);
  expect(original.segments[0].share).toBe(0.75);
});

test('dispatch determines solved shares while installed capacity remains the sizing basis', () => {
  const mix = createGenerationMixResolver(() => '#00ff00')(site([
    generator('wind', 300, { total_dispatch_MWh: 10 }),
    generator('solar', 100, { total_dispatch_MWh: 30 }),
    generator('wind', 50, { total_dispatch_MWh: 10 }),
  ]));
  expect(mix).toMatchObject({ total: 50, capacityTotal: 450, unit: 'MWh', basis: 'Generation' });
  expect(mix.segments.map(segment => [segment.key, segment.share])).toEqual([['solar', 0.6], ['wind', 0.4]]);
  expect(mix.tooltipContent()).toContain('Installed capacity: 450 MW');
});

test('optimized capacity and numeric fallback match the generation index', () => {
  const mix = createGenerationMixResolver(() => '#00ff00')(site([
    generator('wind', 100, { p_nom_opt: '150' }),
    generator('solar', '50', { p_nom_opt: false }),
    generator('invalid', true, { p_nom_opt: null }),
    generator('negative', -5),
  ]));
  expect(mix).toMatchObject({ total: 200, capacityTotal: 200, unit: 'MW' });
  expect(mix.segments.map(segment => segment.value)).toEqual([150, 50]);
});

test('tooltip escapes source names and labels', () => {
  const mix = createGenerationMixResolver(() => '" data-test="unsafe')(site([
    generator('<wind>', 100, { bus: '<Node>', carrier_nice_name: 'Wind & <solar>' }),
  ]));
  const html = mix.tooltipContent();
  expect(html).toContain('&lt;Node&gt;');
  expect(html).toContain('Wind &amp; &lt;solar&gt;');
  expect(html).not.toContain('background:" data-test="unsafe');
  expect(html).not.toContain('<Node>');
});

test('empty composition is cached without repeatedly reading generators', () => {
  const resolve = createGenerationMixResolver(() => '#00ff00');
  let reads = 0;
  const source = { capacityTotal: 0, dispatchTotal: 0, generators: [{ get p_nom() { reads++; return 0; } }] };
  expect(resolve(source)).toBeNull();
  expect(resolve(source)).toBeNull();
  expect(reads).toBe(1);
});

test('mixed-view Supply tooltips show a human-readable geography, values, shares and dated context', () => {
  const mix = createGenerationMixResolver(() => '#00ff00')(site([
    generator('wind', 300, { bus: 'atlas-aggregate:node:country%3AFR', bus_label: 'FR',
      properties: [{ Property: 'Input date', Value: '2030-01-01' }, { Property: 'Input basis', Value: 'Selected model' }] }),
    generator('solar', 100),
  ]));
  expect(mix.tooltipContent()).toContain('<strong>FR</strong>');
  expect(mix.tooltipContent()).toContain('Installed capacity: 400 MW');
  expect(mix.tooltipContent()).toContain('75.0% (300 MW)');
  expect(mix.tooltipContent()).toContain('2030-01-01 · Selected model');
  expect(mix.tooltipContent()).not.toContain('atlas-aggregate');
});
