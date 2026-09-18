import { act, renderHook } from '@testing-library/react';
import { GRID_ACCESS_TIMEOUT_MS, useGridAccessRecords } from './useGridAccessRecords';

const data = (country) => ({ type: 'FeatureCollection', features: [{ id: country }], meta: {} });
const reply = (payload, ok = true) => ({ ok, json: async () => payload });
let originalFetch;
let requests;
beforeEach(() => {
  jest.useFakeTimers(); originalFetch = global.fetch; requests = [];
  global.fetch = jest.fn((url, options) => new Promise((resolve, reject) => {
    // Deliberately ignore AbortSignal to reproduce late JSON/provider responses.
    requests.push({ url, signal: options.signal, resolve, reject });
  }));
});
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
const finish = async (index, payload, ok = true) => act(async () => {
  requests[index].resolve(reply(payload, ok));
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
});

test('query changes immediately hide old records and ignore out-of-order responses', async () => {
  const recovered = jest.fn();
  const { result, rerender } = renderHook((props) => useGridAccessRecords({ ...props, onRecovered: recovered }),
    { initialProps: { enabled: true, url: '/map?countries=ES' } });
  await finish(0, data('ES'));
  expect(result.current.data).toEqual(data('ES'));
  rerender({ enabled: true, url: '/map?countries=FR' });
  expect(result.current.data.features).toEqual([]);
  rerender({ enabled: true, url: '/map?countries=BE' });
  await finish(2, data('BE'));
  await finish(1, data('FR'));
  expect(result.current.data).toEqual(data('BE'));
  expect(requests[1].signal.aborted).toBe(true);
  expect(recovered).toHaveBeenCalledTimes(2);
});

test('failed refresh cannot display stale data; explicit retry recovers without changing filters', async () => {
  const { result } = renderHook(() => useGridAccessRecords({ enabled: true, url: '/map?metric=available_mw' }));
  await finish(0, data('ES'));
  act(() => result.current.retry());
  expect(result.current.data.features).toEqual([]);
  await finish(1, { error: 'upstream detail must not be exposed' }, false);
  expect(result.current.error).toContain('Please retry');
  expect(result.current.error).not.toContain('upstream detail');
  expect(result.current.data.features).toEqual([]);
  act(() => result.current.retry());
  await finish(2, data('ES-new'));
  expect(result.current.data).toEqual(data('ES-new'));
  expect(result.current.error).toBe('');
  expect(requests.every((request) => request.url === requests[0].url)).toBe(true);
});

test('timeout releases loading and late response cannot overwrite retry', async () => {
  const { result } = renderHook(() => useGridAccessRecords({ enabled: true, url: '/map' }));
  act(() => jest.advanceTimersByTime(GRID_ACCESS_TIMEOUT_MS));
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toContain('timed out');
  expect(requests[0].signal.aborted).toBe(true);
  act(() => result.current.retry());
  await finish(1, data('fresh'));
  await finish(0, data('stale'));
  expect(result.current.data).toEqual(data('fresh'));
  expect(jest.getTimerCount()).toBe(0);
});

test('disabling, malformed payloads and unmount cannot publish old map records', async () => {
  const onRecovered = jest.fn();
  const { result, rerender, unmount } = renderHook((props) => useGridAccessRecords({ url: '/map', onRecovered, ...props }),
    { initialProps: { enabled: true } });
  await finish(0, { success: true });
  expect(result.current.error).toContain('Please retry');
  expect(result.current.loading).toBe(false);
  act(() => result.current.retry());
  rerender({ enabled: false });
  await finish(1, data('late'));
  expect(result.current.data.features).toEqual([]);
  expect(result.current.loading).toBe(false);
  expect(onRecovered).not.toHaveBeenCalled();
  rerender({ enabled: true });
  unmount();
  await finish(2, data('unmounted'));
  expect(onRecovered).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
