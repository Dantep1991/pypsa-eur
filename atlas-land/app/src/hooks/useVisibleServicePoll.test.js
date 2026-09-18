import { act, renderHook } from '@testing-library/react';
import { useVisibleServicePoll } from './useVisibleServicePoll';

let originalFetch;
let originalVisibility;
let requests;
let visibility;
const flush = async () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
const changeVisibility = (next) => act(() => {
  visibility = next; document.dispatchEvent(new Event('visibilitychange'));
});
const advance = async (ms) => { act(() => jest.advanceTimersByTime(ms)); await flush(); };
const finish = async (index, payload = { ready: true }, ok = true) => {
  requests[index].resolve({ ok, json: async () => payload }); await flush();
};
beforeEach(() => {
  jest.useFakeTimers();
  originalFetch = global.fetch;
  originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  visibility = 'visible'; requests = [];
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  global.fetch = jest.fn((url, options) => new Promise((resolve) => requests.push({ url, signal: options.signal, resolve })));
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
  else delete document.visibilityState;
  jest.useRealTimers();
});

test('inactive overlays make no request, poll on activation and become quiet again when disabled', async () => {
  const onData = jest.fn();
  const { rerender, unmount } = renderHook((props) => useVisibleServicePoll({ url: '/status', onData, ...props }),
    { initialProps: { active: false } });
  await advance(600_000);
  expect(requests).toHaveLength(0);
  rerender({ active: true });
  expect(requests).toHaveLength(1);
  await finish(0);
  expect(onData).toHaveBeenCalledTimes(1);
  await advance(60_000);
  expect(requests).toHaveLength(2);
  await finish(1, { ready: true, version: 2 });
  expect(onData).toHaveBeenCalledTimes(2);
  rerender({ active: false });
  await advance(600_000);
  expect(requests).toHaveLength(2);
  rerender({ active: true });
  await finish(2, { ready: true, version: 2 });
  expect(onData).toHaveBeenCalledTimes(2); // Unchanged metadata cannot re-render the map.
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('hidden tabs abort status only, ignore late responses, and refresh once when visible', async () => {
  const onData = jest.fn();
  renderHook(() => useVisibleServicePoll({ url: '/status', active: true, onData }));
  changeVisibility('hidden');
  expect(requests[0].signal.aborted).toBe(true);
  await finish(0);
  await advance(600_000);
  expect(onData).not.toHaveBeenCalled();
  expect(requests).toHaveLength(1);
  changeVisibility('visible');
  expect(requests).toHaveLength(2);
  await finish(1);
  expect(onData).toHaveBeenCalledTimes(1);
});

test('inactive hidden tabs remain idle after foregrounding and fetch on activation', async () => {
  visibility = 'hidden';
  const { rerender } = renderHook((props) => useVisibleServicePoll({ url: '/status', ...props }),
    { initialProps: { active: false } });
  await advance(600_000);
  expect(requests).toHaveLength(0);
  changeVisibility('visible');
  expect(requests).toHaveLength(0);
  changeVisibility('hidden'); changeVisibility('visible');
  expect(requests).toHaveLength(0);
  rerender({ active: true });
  expect(requests).toHaveLength(1);
  await finish(0);
});

test('failures back off, do not repeatedly publish the same error, and reset after recovery', async () => {
  const onUnavailable = jest.fn(); const onData = jest.fn();
  renderHook(() => useVisibleServicePoll({ url: '/status', active: true, onData, onUnavailable }));
  for (const [index, delay] of [5000, 10000, 20000, 40000, 60000].entries()) {
    await finish(index, {}, false);
    await advance(delay - 1);
    expect(requests).toHaveLength(index + 1);
    await advance(1);
    expect(requests).toHaveLength(index + 2);
  }
  expect(onUnavailable).toHaveBeenCalledTimes(1);
  await finish(5);
  expect(onData).toHaveBeenCalledTimes(1);
  await advance(60_000);
  await finish(6, {}, false);
  expect(onUnavailable).toHaveBeenCalledTimes(2);
  await advance(5000);
  expect(requests).toHaveLength(8);
});

test('hung status is bounded, unmount cancels timers, and late results cannot publish', async () => {
  const onUnavailable = jest.fn(); const onData = jest.fn();
  const { unmount } = renderHook(() => useVisibleServicePoll({ url: '/status', active: true, onData, onUnavailable }));
  await advance(10_000);
  expect(requests[0].signal.aborted).toBe(true);
  expect(onUnavailable).toHaveBeenCalledTimes(1);
  await finish(0);
  expect(onData).not.toHaveBeenCalled();
  await advance(5000);
  unmount();
  expect(requests[1].signal.aborted).toBe(true);
  await finish(1);
  expect(onData).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('URL changes reset metadata ownership and use the latest callbacks', async () => {
  const initial = jest.fn(); const latest = jest.fn();
  const { rerender } = renderHook((props) => useVisibleServicePoll({ active: true, ...props }),
    { initialProps: { url: '/status-a', onData: initial } });
  rerender({ url: '/status-a', onData: latest });
  expect(requests).toHaveLength(1);
  await finish(0);
  expect(initial).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledTimes(1);
  rerender({ url: '/status-b', onData: latest });
  await finish(1);
  expect(latest).toHaveBeenCalledTimes(2);
});
