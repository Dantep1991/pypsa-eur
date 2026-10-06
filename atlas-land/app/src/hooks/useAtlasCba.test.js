import { act, renderHook, waitFor } from '@testing-library/react';
import useAtlasCba from './useAtlasCba';
import { fetchCbaStudies, fetchCbaScene } from '../modelWorkspace/cbaScene';

jest.mock('../modelWorkspace/cbaScene', () => ({
  ...jest.requireActual('../modelWorkspace/cbaScene'), fetchCbaStudies: jest.fn(), fetchCbaScene: jest.fn(),
}));

const context = { mode: 'model', projectId: 'model', version: 'v1' };
const study = { projectId: 'study', cases: ['case'], summary: { tscDelta: { '2050': { case: { total: 1 } } } } };
const scene = { sourceProjectId: 'model', sourceModelVersion: 'v1', coverage: { mapped: 1 } };
beforeEach(() => { jest.clearAllMocks(); fetchCbaStudies.mockResolvedValue([study]); });

test('shows genuine loading progress then a source-bound map; clear aborts the request', async () => {
  let complete, signal;
  fetchCbaScene.mockImplementation((source, study, selection, options) => {
    signal = options.signal;
    options.onProgress({ phase: 'Resolving map positions', completed: 1, total: 2 });
    return new Promise(resolve => { complete = resolve; });
  });
  const { result } = renderHook(() => useAtlasCba(context));
  await waitFor(() => expect(result.current.catalog.state).toBe('ready'));
  let pending;
  act(() => { pending = result.current.show(); });
  expect(result.current.status).toMatchObject({ state: 'loading', progress: { completed: 1 } });
  await act(async () => { complete(scene); await pending; });
  expect(result.current.scene).toBe(scene);
  act(() => result.current.clear());
  expect(signal.aborted).toBe(true);
  expect(result.current.scene).toBeNull();
});

test('changing model version aborts a pending map and excludes its late response', async () => {
  let complete, signal;
  fetchCbaScene.mockImplementation((source, study, selection, options) => {
    signal = options.signal;
    return new Promise(resolve => { complete = resolve; });
  });
  const { result, rerender } = renderHook(source => useAtlasCba(source), { initialProps: context });
  await waitFor(() => expect(result.current.catalog.state).toBe('ready'));
  let pending;
  act(() => { pending = result.current.show(); });
  rerender({ ...context, version: 'v2' });
  expect(signal.aborted).toBe(true);
  await act(async () => { complete(scene); await pending; });
  expect(result.current.scene).toBeNull();
});

test('no assessment and failed discovery never expose a usable study', async () => {
  fetchCbaStudies.mockResolvedValueOnce([]);
  const { result, rerender } = renderHook(source => useAtlasCba(source), { initialProps: context });
  await waitFor(() => expect(result.current.catalog.state).toBe('ready'));
  expect(result.current.catalog.studies).toEqual([]);
  fetchCbaStudies.mockRejectedValueOnce(new Error('Service unavailable'));
  rerender({ ...context, projectId: 'other' });
  await waitFor(() => expect(result.current.catalog.state).toBe('error'));
  expect(result.current.catalog).toMatchObject({ studies: [], error: 'Service unavailable' });
});

test('display reset restores CBA defaults and prevents a late assessment repaint', async () => {
  let complete, signal;
  fetchCbaScene.mockImplementation((source, study, selection, options) => {
    signal = options.signal;
    return new Promise(resolve => { complete = resolve; });
  });
  const { result } = renderHook(() => useAtlasCba(context));
  await waitFor(() => expect(result.current.catalog.state).toBe('ready'));
  const original = result.current.selection;
  act(() => { result.current.setSelection({ ...original, component: 'producer' }); result.current.setMarkerScale(2); });
  let pending;
  act(() => { pending = result.current.show(); });
  act(() => result.current.reset());
  expect(signal.aborted).toBe(true);
  expect(result.current.selection).toEqual(original);
  expect(result.current.markerScale).toBe(1);
  await act(async () => { complete(scene); await pending; });
  expect(result.current.scene).toBeNull();
  expect(result.current.status.state).toBe('idle');
});
