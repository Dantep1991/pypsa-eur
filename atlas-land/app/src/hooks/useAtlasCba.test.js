import { renderHook, act, waitFor } from '@testing-library/react';
import useAtlasCba from './useAtlasCba';
import { fetchCbaScene, fetchCbaStudies } from '../modelWorkspace/cbaScene';

jest.mock('../modelWorkspace/cbaScene', () => ({
  ...jest.requireActual('../modelWorkspace/cbaScene'), fetchCbaScene: jest.fn(), fetchCbaStudies: jest.fn(),
}));

const context = { mode: 'model', projectId: 'model', version: 'v1' };
const study = { projectId: 'study', cases: ['case'], summary: { tscDelta: { '2050': { case: { total: -5 } } } } };

beforeEach(() => { jest.clearAllMocks(); fetchCbaStudies.mockResolvedValue([study]); });

test('unreconciled empty map is unavailable, returns no success and becomes retryable after selection change', async () => {
  fetchCbaScene.mockResolvedValue({ component: 'total', coverage: { mapped: 0, reported: 0 }, reconciliation: { matched: false } });
  const { result } = renderHook(() => useAtlasCba(context));
  await waitFor(() => expect(result.current.catalog.state).toBe('ready'));
  let returned;
  await act(async () => { returned = await result.current.show(); });
  expect(returned).toBeNull();
  expect(result.current.status.state).toBe('unavailable');
  expect(result.current.status.error).toContain('do not reconcile');
  expect(result.current.scene).toBeNull();
  act(() => { result.current.clear(); result.current.setSelection({ ...result.current.selection, component: 'consumer' }); });
  expect(result.current.status.state).toBe('idle');
});

test('mapped zero changes still create a ready scene bound to the active model version', async () => {
  const data = { component: 'consumer', coverage: { mapped: 1, reported: 1 }, points: [{ value: 0 }],
    sourceProjectId: 'model', sourceModelVersion: 'v1' };
  fetchCbaScene.mockResolvedValue(data);
  const { result } = renderHook(() => useAtlasCba(context));
  await waitFor(() => expect(result.current.catalog.state).toBe('ready'));
  await act(async () => { await result.current.show(); });
  expect(result.current.status.state).toBe('ready');
  expect(result.current.scene).toBe(data);
});
