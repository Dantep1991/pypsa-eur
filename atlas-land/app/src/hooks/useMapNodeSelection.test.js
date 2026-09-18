import { renderHook } from '@testing-library/react';
import { useMapNodeSelection } from './useMapNodeSelection';

const node = (id, props = {}, icon = false) => ({
  feature: { id, properties: props },
  ...(icon ? { setIcon: jest.fn() } : { setStyle: jest.fn() }),
  closePopup: jest.fn(), remove: jest.fn(),
});

test('updates only changed circle selections without removing layers or closing popups', () => {
  const a = node('a', { nodeEmphasis: 2 });
  const b = node('b', { color: '#60a5fa' });
  const ref = { current: { eachLayer: (fn) => [a, b].forEach(fn) } };
  const makeIcon = jest.fn();
  const view = renderHook(({ selected }) => useMapNodeSelection(ref, 'network', selected, [], makeIcon), { initialProps: { selected: 'A' } });
  expect(a.setStyle).toHaveBeenLastCalledWith({ color: '#facc15', weight: 2.25 });
  expect(b.setStyle).not.toHaveBeenCalled();
  view.rerender({ selected: 'b' });
  expect(a.setStyle).toHaveBeenLastCalledWith({ color: '#e2e8f0', weight: 1.5 });
  expect(b.setStyle).toHaveBeenLastCalledWith({ color: '#60a5fa', weight: 2 });
  view.rerender({ selected: 'b' });
  expect(b.setStyle).toHaveBeenCalledTimes(1);
  expect(a.closePopup).not.toHaveBeenCalled();
  expect(a.remove).not.toHaveBeenCalled();
  expect(makeIcon).not.toHaveBeenCalled();
});

test('updates icons and newly mounted network layers using the current selection', () => {
  const first = node('a', {}, true);
  let layers = [first];
  const ref = { current: { eachLayer: (fn) => layers.forEach(fn) } };
  const icon = {};
  const makeIcon = jest.fn(() => icon);
  const view = renderHook(({ key }) => useMapNodeSelection(ref, key, null, ['A'], makeIcon), { initialProps: { key: 'old' } });
  expect(first.setIcon).toHaveBeenCalledWith(icon);
  const replacement = node('a', { isSelected: false }, true);
  layers = [replacement];
  view.rerender({ key: 'new' });
  expect(replacement.setIcon).toHaveBeenCalledWith(icon);
  expect(first.closePopup).not.toHaveBeenCalled();
});
