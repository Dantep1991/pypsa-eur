import { act, renderHook } from '@testing-library/react';
import { usePopupViewportBounds } from './usePopupViewportBounds';

test('explicit dismissal consumes each request once and releases frozen bounds without camera movement', () => {
  const events = new Map();
  const map = { getBounds: () => 'current', closePopup: jest.fn(),
    on: jest.fn((names, handler) => names.split(' ').forEach(name => events.set(name, handler))), off: jest.fn() };
  const changed = jest.fn();
  const view = renderHook(({ request, bounds }) => usePopupViewportBounds(map, bounds, changed, request), {
    initialProps: { request: 0, bounds: 'before' },
  });
  act(() => events.get('popupopen')());
  view.rerender({ request: 0, bounds: 'after' });
  expect(view.result.current).toBe('before');
  expect(map.closePopup).not.toHaveBeenCalled();
  view.rerender({ request: 1, bounds: 'after' });
  expect(map.closePopup).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(view.result.current).toBe('after');
  view.rerender({ request: 1, bounds: 'later' });
  expect(map.closePopup).toHaveBeenCalledTimes(1);
  expect(view.result.current).toBe('later');
});

test('popup auto-pan retains marker bounds and publishes visibility without resubscribing', () => {
  const events = new Map();
  const map = {
    getBounds: () => 'map bounds',
    closePopup: jest.fn(),
    on: jest.fn((names, handler) => names.split(' ').forEach((name) => events.set(name, handler))),
    off: jest.fn(),
  };
  const first = jest.fn();
  const latest = jest.fn();
  const view = renderHook(({ bounds, change }) => usePopupViewportBounds(map, bounds, change), {
    initialProps: { bounds: 'before pan', change: first },
  });
  act(() => events.get('popupopen')());
  expect(first).toHaveBeenLastCalledWith(true);
  view.rerender({ bounds: 'after pan', change: latest });
  expect(view.result.current).toBe('before pan');
  expect(map.on).toHaveBeenCalledTimes(3);
  act(() => events.get('popupclose')());
  expect(latest).toHaveBeenLastCalledWith(false);
  expect(view.result.current).toBe('after pan');
  act(() => { events.get('popupopen')(); events.get('resize')(); });
  expect(map.closePopup).toHaveBeenCalledTimes(1);
  expect(latest).toHaveBeenLastCalledWith(false);
  view.unmount();
  expect(map.off).toHaveBeenCalledTimes(3);
});
