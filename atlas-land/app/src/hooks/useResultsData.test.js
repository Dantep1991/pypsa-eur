import { act, cleanup, renderHook } from '@testing-library/react';
import { useResultsData, RESULTS_REQUEST_TIMEOUT_MS } from './useResultsData';

let previousFetch;
let requests;
const filters = { category_name: '', child_name: '', collection_name: '', sample_name: '', date_resolution: 'day' };
const initial = { active: true, fileId: 'A', page: 1, filters };
const flush = async () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const find = (kind, file = '', page = '') => requests.filter(request => request.url.includes(kind)
  && (!file || new URL(request.url, 'http://localhost').searchParams.get('file_id') === file)
  && (!page || new URL(request.url, 'http://localhost').searchParams.get('page') === page)).at(-1);
const answer = async (request, data, status = 200) => {
  await act(async () => request.resolve({ ok: status === 200, status, json: async () => data }));
  await flush();
};
const rows = (value, page = 1) => ({ success: true, data: [{ value }], pagination: { page, total_pages: 2, total_rows: 200 } });
const options = value => ({ success: true, filter_options: { category_name: [value] } });
beforeEach(() => {
  jest.useFakeTimers(); previousFetch = global.fetch; requests = [];
  global.fetch = jest.fn((url, options) => new Promise(resolve => requests.push({ url, ...options, resolve })));
});
afterEach(() => { cleanup(); global.fetch = previousFetch; jest.useRealTimers(); });

test('file change masks old rows/options immediately and late headers cannot reintroduce the old file', async () => {
  const view = renderHook(props => useResultsData(props), { initialProps: initial });
  await flush();
  await answer(find('list-parquet'), { success: true, parquet_files: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }] });
  await answer(find('results-file-data', 'A'), rows(10));
  const oldOptions = find('filter-options', 'A');
  view.rerender({ ...initial, fileId: 'B' });
  expect(view.result.current.resultsData).toEqual([]);
  expect(view.result.current.resultsFilterOptions).toEqual({});
  await flush();
  expect(oldOptions.signal.aborted).toBe(true);
  await answer(find('results-file-data', 'B'), rows(20));
  expect(view.result.current.resultsLoading).toBe(true);
  await answer(find('filter-options', 'B'), options('B category'));
  const json = jest.fn(async () => options('A category'));
  await act(async () => oldOptions.resolve({ ok: true, json }));
  await flush();
  expect(json).not.toHaveBeenCalled();
  expect(view.result.current.resultsData).toEqual([{ value: 20 }]);
  expect(view.result.current.resultsFilterOptions.category_name).toEqual(['B category']);
  expect(view.result.current.resultsLoading).toBe(false);
  expect(requests.filter(request => request.url.includes('results-file-data') && request.url.includes('file_id=A'))).toHaveLength(1);
});

test('late row body cannot replace a new page, and date-only presentation changes do not fetch', async () => {
  const view = renderHook(props => useResultsData(props), { initialProps: initial });
  await flush();
  let body;
  await act(async () => find('results-file-data', 'A').resolve({ ok: true, json: () => new Promise(resolve => { body = resolve; }) }));
  view.rerender({ ...initial, page: 2 }); await flush();
  await answer(find('results-file-data', 'A', '2'), rows(20, 2));
  await act(async () => body(rows(10))); await flush();
  expect(view.result.current.resultsData).toEqual([{ value: 20 }]);
  const count = requests.length;
  view.rerender({ ...initial, page: 2, filters: { ...filters, date_resolution: 'year' } }); await flush();
  expect(requests).toHaveLength(count);
  view.rerender({ ...initial, filters: { ...filters, category_name: 'Demand & heat' } }); await flush();
  expect(view.result.current.resultsData).toEqual([]);
  expect(new URL(find('results-file-data', 'A').url, 'http://localhost').searchParams.get('category_name')).toBe('Demand & heat');
});

test.each(['headers', 'body'])('stalled row %s times out and only the failed request is retried', async stage => {
  const view = renderHook(props => useResultsData(props), { initialProps: initial }); await flush();
  await answer(find('list-parquet'), { success: true, parquet_files: [] });
  await answer(find('filter-options'), options('A'));
  const old = find('results-file-data'); let body;
  if (stage === 'body') await act(async () => old.resolve({ ok: true, json: () => new Promise(resolve => { body = resolve; }) }));
  act(() => jest.advanceTimersByTime(RESULTS_REQUEST_TIMEOUT_MS));
  expect(view.result.current.resultsError).toContain('Result rows timed out');
  expect(view.result.current.resultsLoading).toBe(false);
  expect(old.signal.aborted).toBe(true);
  act(() => view.result.current.retryResults()); await flush();
  expect(requests).toHaveLength(4);
  await answer(find('results-file-data'), rows(30));
  if (body) { await act(async () => body(rows(10))); await flush(); }
  else await answer(old, rows(10));
  expect(view.result.current.resultsData).toEqual([{ value: 30 }]);
  expect(view.result.current.resultsError).toBe('');
});

test('service errors do not decode/expose raw text and retry file metadata independently', async () => {
  const view = renderHook(props => useResultsData(props), { initialProps: { ...initial, fileId: null } }); await flush();
  const text = jest.fn(async () => 'private path');
  await act(async () => find('list-parquet').resolve({ ok: false, status: 500, text })); await flush();
  expect(text).not.toHaveBeenCalled();
  expect(view.result.current.resultsError).toBe('Could not load result files. Please retry.');
  act(() => view.result.current.retryResults()); await flush();
  expect(requests).toHaveLength(2);
  await answer(find('list-parquet'), { success: true, parquet_files: [{ id: 'A', name: 'A' }] });
  expect(view.result.current.resultsAnalysis.metadata.parquet_files).toHaveLength(1);
});

test('inactive/unmounted results abort all work and cannot publish late responses', async () => {
  const view = renderHook(props => useResultsData(props), { initialProps: initial }); await flush();
  view.rerender({ ...initial, active: false });
  expect(requests.every(request => request.signal.aborted)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  expect(view.result.current.resultsData).toEqual([]);
  expect(view.result.current.resultsLoading).toBe(false);
  view.unmount(); await answer(find('results-file-data'), rows(10));
});

test.each([null, { success: true, data: {} }, { success: true, data: [null] }])('malformed rows are contained (%j)', async data => {
  const view = renderHook(props => useResultsData(props), { initialProps: initial }); await flush();
  await answer(find('results-file-data'), data);
  expect(view.result.current.resultsData).toEqual([]);
  expect(view.result.current.resultsError).toContain('Could not load result rows');
});

test('a response that exceeds the requested 100-row page is rejected before chart rendering', async () => {
  const view = renderHook(props => useResultsData(props), { initialProps: initial }); await flush();
  await answer(find('results-file-data'), { ...rows(10), data: Array.from({ length: 101 }, () => ({ value: 10 })) });
  expect(view.result.current.resultsData).toEqual([]);
  expect(view.result.current.resultsError).toContain('Could not load result rows');
});
