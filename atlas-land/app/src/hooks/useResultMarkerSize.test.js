import { renderHook } from '@testing-library/react';
import { useResultMarkerSize } from './useResultMarkerSize';

const circle = (mode, ratio) => ({ feature: { properties: {
  isResultPoint: Boolean(mode), facility: { atlas_result_map_mode: mode }, resultMagnitudeRatio: ratio,
} }, setRadius: jest.fn(), remove: jest.fn(), closePopup: jest.fn() });
const ref = layers => ({ current: { eachLayer: fn => layers.forEach(fn) } });

test('restyles existing bubbles and colour circles without rebuilding layers or closing popups', () => {
  const bubble = circle('bubbles', 0.25), colour = circle('colour', 1), zero = circle('bubbles', 0), native = circle('', 1);
  const nodes = ref([bubble, colour, zero, native]), mix = ref([]), icon = jest.fn();
  const view = renderHook(({ scale }) => useResultMarkerSize(nodes, 'nodes', mix, 'mix', scale, icon), { initialProps: { scale: 1 } });
  expect(bubble.setRadius).toHaveBeenLastCalledWith(18);
  expect(colour.setRadius).toHaveBeenLastCalledWith(7);
  expect(zero.setRadius).toHaveBeenLastCalledWith(5);
  view.rerender({ scale: 2 });
  expect(bubble.setRadius).toHaveBeenLastCalledWith(36);
  expect(colour.setRadius).toHaveBeenLastCalledWith(14);
  expect(zero.setRadius).toHaveBeenLastCalledWith(10);
  expect(native.setRadius).not.toHaveBeenCalled();
  [bubble, colour, zero, native].forEach(layer => {
    expect(layer.remove).not.toHaveBeenCalled(); expect(layer.closePopup).not.toHaveBeenCalled();
  });
});

test('updates result pies but not installed-capacity pies and handles replacement layers', () => {
  const segments = [{ key: 'technology', share: 1 }];
  const result = { feature: { properties: { facility: { atlas_result_map_mode: 'mix' }, segments, sizeRatio: 0.25 } }, setIcon: jest.fn() };
  const installed = { feature: { properties: { segments, sizeRatio: 0.25 } }, setIcon: jest.fn() };
  let layers = [result, installed];
  const mix = { current: { eachLayer: fn => layers.forEach(fn) } }, nodes = ref([]);
  const icon = jest.fn(() => 'result-icon');
  const view = renderHook(({ key, scale }) => useResultMarkerSize(nodes, 'nodes', mix, key, scale, icon), { initialProps: { key: 'old', scale: 2 } });
  expect(icon).toHaveBeenLastCalledWith(segments, 1, 0.25, true, 72);
  expect(result.setIcon).toHaveBeenCalledWith('result-icon');
  expect(installed.setIcon).not.toHaveBeenCalled();
  const replacement = { ...result, setIcon: jest.fn() }; layers = [replacement];
  view.rerender({ key: 'new', scale: 2 });
  expect(replacement.setIcon).toHaveBeenCalledWith('result-icon');
});
