import { renderHook } from '@testing-library/react';
import useGenerationMarkerSize from './useGenerationMarkerSize';

test('updates installed pies in place without resizing unrelated solved-result pies', () => {
  const installed = { feature: { properties: { segments: [{ share: 1 }], sizeRatio: 0.25, aggregate: true } }, setIcon: jest.fn(), remove: jest.fn() };
  const result = { feature: { properties: { facility: { atlas_result_map_mode: 'mix' } } }, setIcon: jest.fn() };
  const ref = { current: { eachLayer: fn => [installed, result].forEach(fn) } };
  const icon = jest.fn(() => 'first');
  const view = renderHook(({ create }) => useGenerationMarkerSize(ref, 'same-map', create), { initialProps: { create: icon } });
  expect(installed.setIcon).toHaveBeenLastCalledWith('first');
  expect(icon).toHaveBeenLastCalledWith([{ share: 1 }], 1, 0.25, true);
  view.rerender({ create: jest.fn(() => 'larger') });
  expect(installed.setIcon).toHaveBeenLastCalledWith('larger');
  expect(result.setIcon).not.toHaveBeenCalled();
  expect(installed.remove).not.toHaveBeenCalled();
});
