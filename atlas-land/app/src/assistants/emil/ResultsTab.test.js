import React, { useState } from 'react';
import { TextDecoder, TextEncoder } from 'util';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ResultsTab from './ResultsTab';

// Keep actual controls, state and HTTP adapter; only the SVG chart boundary is mocked.
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => children,
  ScatterChart: ({ children }) => children,
  Scatter: ({ data }) => <output aria-label="Chart data">{JSON.stringify(data)}</output>,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
  Tooltip: () => null, Legend: () => null,
}));
let previousFetch, previousScroll, previousDecoder, requests;
const flush = async () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const find = (kind, file = '') => requests.filter(r => r.url.includes(kind)
  && (!file || new URL(r.url, 'http://localhost').searchParams.get('file_id') === file)).at(-1);
const answer = async (request, data, status = 200) => {
  await act(async () => request.resolve({ ok: status === 200, status, json: async () => data }));
  await flush();
};
const rows = (value, page = 1) => ({ success: true,
  data: [{ _date: '2026-01-15T12:00:00Z', value, unit_name: 'MWh', category_name: 'Demand' }],
  pagination: { page, total_pages: 2, total_rows: 200 } });
const options = category => ({ success: true, filter_options: { category_name: [category] } });
async function start() {
  const Harness = () => {
    const [messages, setMessages] = useState([]);
    return <ResultsTab activeAssistant="emil" activeTab="results"
      resultsChatMessages={messages} setResultsChatMessages={setMessages} />;
  };
  const view = render(<Harness />);
  await flush();
  await answer(find('list-parquet'), { success: true, parquet_files: [
    { id: 'A', name: 'File A' }, { id: 'B', name: 'File B' },
  ] });
  fireEvent.click(screen.getByRole('button', { name: 'Detailed Results' }));
  return view;
}
async function select(file) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Select Parquet File:' }), { target: { value: file } });
  await flush();
}
beforeEach(() => {
  previousFetch = global.fetch; previousScroll = Element.prototype.scrollIntoView; requests = [];
  previousDecoder = global.TextDecoder; global.TextDecoder = TextDecoder;
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn((url, options) => new Promise(resolve => requests.push({ url, ...options, resolve })));
});
afterEach(() => { cleanup(); global.fetch = previousFetch; Element.prototype.scrollIntoView = previousScroll; global.TextDecoder = previousDecoder; });

test('file controls clear old rows/options and slow old responses cannot change the new selection', async () => {
  await start(); await select('A');
  await answer(find('results-file-data', 'A'), rows(10));
  await answer(find('filter-options', 'A'), options('Demand'));
  expect(screen.getByLabelText('Chart data')).toHaveTextContent('10');
  fireEvent.click(screen.getByRole('button', { name: 'Next' })); await flush();
  const stale = find('results-file-data', 'A');
  await select('B');
  expect(stale.signal.aborted).toBe(true);
  expect(screen.queryByLabelText('Chart data')).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Demand' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Select Parquet File:' })).toBeEnabled();
  await answer(find('results-file-data', 'B'), rows(20));
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  await answer(find('filter-options', 'B'), options('Generation'));
  await answer(stale, rows(999, 2));
  expect(screen.getByLabelText('Chart data')).toHaveTextContent('20');
  expect(screen.getByLabelText('Chart data')).not.toHaveTextContent('999');
  expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(requests.filter(r => r.url.includes('results-file-data') && r.url.includes('file_id=B'))).toHaveLength(1);
});

test('filters reset pagination once, presentation changes do not fetch, and clearing the file cancels rows', async () => {
  await start(); await select('A');
  await answer(find('filter-options'), options('Demand'));
  await answer(find('results-file-data'), rows(10));
  fireEvent.click(screen.getByRole('button', { name: 'Next' })); await flush();
  await answer(find('results-file-data'), rows(20, 2));
  const count = requests.length;
  fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Demand' } }); await flush();
  expect(requests).toHaveLength(count + 1);
  const filtered = find('results-file-data');
  const params = new URL(filtered.url, 'http://localhost').searchParams;
  expect(params.get('page')).toBe('1'); expect(params.get('category_name')).toBe('Demand');
  await answer(filtered, rows(30));
  fireEvent.change(screen.getByRole('combobox', { name: 'Date labels' }), { target: { value: 'year' } }); await flush();
  expect(requests).toHaveLength(count + 1);
  expect(screen.getByText('Source observations — current page')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })); await flush();
  const cleared = find('results-file-data');
  expect(new URL(cleared.url, 'http://localhost').searchParams.has('category_name')).toBe(false);
  await select('');
  expect(cleared.signal.aborted).toBe(true);
  await answer(cleared, rows(999));
  expect(screen.queryByLabelText('Chart data')).not.toBeInTheDocument();
  expect(screen.getByText('Please select a parquet file to view the time series chart.')).toBeInTheDocument();
});

test('invalid pagination is contained and retry restores rows without repeating successful metadata', async () => {
  await start(); await select('A');
  await answer(find('filter-options'), options('Demand'));
  await answer(find('results-file-data'), { ...rows(10), pagination: { page: 1, total_rows: {} } });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load result rows. Please retry.');
  expect(screen.queryByLabelText('Chart data')).not.toBeInTheDocument();
  const count = requests.length;
  fireEvent.click(screen.getByRole('button', { name: 'Retry results' })); await flush();
  expect(requests).toHaveLength(count + 1);
  await answer(find('results-file-data'), rows(20));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Chart data')).toHaveTextContent('20');
});

test.each([null, { id: 'A', name: {} }])('invalid catalogue entry is recoverable without crashing (%j)', async file => {
  render(<ResultsTab activeAssistant="emil" activeTab="results" resultsChatMessages={[]} setResultsChatMessages={jest.fn()} />);
  await flush(); await answer(find('list-parquet'), { success: true, parquet_files: [file] });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load result files');
});

test('invalid filter values cannot render objects into select options', async () => {
  await start(); await select('A');
  await answer(find('filter-options'), { success: true, filter_options: { category_name: [{}] } });
  await answer(find('results-file-data'), rows(10));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load filter options');
  expect(screen.getByLabelText('Chart data')).toHaveTextContent('10');
});

async function ask(question) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Results question' }), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask', exact: true })); await flush();
  const request = find('ask-about-results'); const reads = [];
  const reader = { read: jest.fn(() => new Promise(resolve => reads.push(resolve))),
    cancel: jest.fn(async () => {}), releaseLock: jest.fn() };
  await act(async () => request.resolve({ ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => reader } }));
  await flush();
  return { request, reader, emit: async event => {
    await act(async () => reads.shift()({ done: false, value: new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`) }));
    await flush();
  } };
}

test('manual file selection stops the real stream and late answer cannot overwrite it', async () => {
  await start(); await select('A');
  await answer(find('filter-options'), options('Demand')); await answer(find('results-file-data'), rows(10));
  const stream = await ask('Analyze generation');
  expect(screen.getByRole('textbox', { name: 'Results question' })).toBeDisabled();
  await stream.emit({ type: 'files_selected', selected_files: ['B'], step: 'Select', message: 'Selected B' });
  expect(screen.getByRole('combobox', { name: 'Select Parquet File:' })).toHaveValue('B');
  await select('A');
  expect(stream.request.signal.aborted).toBe(true);
  expect(screen.getByRole('textbox', { name: 'Results question' })).toBeEnabled();
  await stream.emit({ type: 'answer', answer: 'Stale answer' });
  expect(screen.queryByText('Stale answer')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Select Parquet File:' })).toHaveValue('A');
  expect(screen.getByRole('log', { name: 'Results conversation' })).toHaveTextContent('after you changed the selection');
  expect(stream.reader.cancel).toHaveBeenCalled();
});

test('Stop and stream errors restore the input and retain the full question/answer conversation', async () => {
  await start();
  const stopped = await ask('First question');
  fireEvent.click(screen.getByRole('button', { name: 'Stop analysis' }));
  expect(stopped.request.signal.aborted).toBe(true);
  expect(screen.getByRole('textbox', { name: 'Results question' })).toBeEnabled();
  const failed = await ask('Second question');
  await failed.emit({ type: 'error', error: 'private server path' });
  expect(screen.getByRole('log')).toHaveTextContent('Could not complete the analysis');
  expect(screen.getByRole('log')).not.toHaveTextContent('private server path');
  expect(screen.getByRole('textbox', { name: 'Results question' })).toBeEnabled();
  const success = await ask('Third question');
  await success.emit({ type: 'answer', answer: 'Analysis complete', filtered_rows: 10, total_rows: 20 });
  expect(screen.getByRole('log')).toHaveTextContent('First question');
  expect(screen.getByRole('log')).toHaveTextContent('Second question');
  expect(screen.getByRole('log')).toHaveTextContent('Third question');
  expect(screen.getByRole('log')).toHaveTextContent('Analysis complete');
  expect(screen.getByRole('log')).toHaveTextContent('Analyzed 10 of 20 rows');
  expect(screen.queryByRole('button', { name: 'Stop analysis' })).not.toBeInTheDocument();
});

test('mixed-unit previews switch locally and the source table preserves coincident observations', async () => {
  await start(); await select('A'); await answer(find('filter-options'), options('Demand'));
  await answer(find('results-file-data'), { ...rows(10), data: [
    { ...rows(10).data[0], unit_name: 'MW', child_name: 'Plant A' },
    { ...rows(10).data[0], unit_name: 'MWh', child_name: 'Plant B' },
    { ...rows(10).data[0], unit_name: 'MWh', child_name: 'Plant C' },
    { ...rows(10).data[0], unit_name: 'MWh', value: null },
  ] });
  expect(screen.getByText(/1 loaded rows could not be plotted/)).toBeInTheDocument();
  const count = requests.length;
  const unit = screen.getByRole('combobox', { name: 'Chart unit / time basis' });
  fireEvent.change(unit, { target: { value: JSON.stringify(['MWh', 'utc']) } }); await flush();
  expect(requests).toHaveLength(count);
  const points = JSON.parse(screen.getByLabelText('Chart data').textContent);
  expect(points.map(point => point.value)).toEqual([10, 10]);
  expect(screen.getByText(/Showing 2 of 3 valid observations/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View displayed observations' }));
  expect(screen.getByRole('table')).toHaveTextContent('Plant B');
  expect(screen.getByRole('table')).toHaveTextContent('Plant C');
  expect(screen.getByRole('table')).not.toHaveTextContent('Plant A');
  fireEvent.change(screen.getByRole('combobox', { name: 'Date labels' }), { target: { value: 'year' } }); await flush();
  expect(JSON.parse(screen.getByLabelText('Chart data').textContent)).toEqual(points);
  expect(requests).toHaveLength(count);
});

test('all-invalid loaded rows are distinguished from a legitimately empty result', async () => {
  await start(); await select('A'); await answer(find('filter-options'), options('Demand'));
  await answer(find('results-file-data'), { ...rows(10), data: [
    { ...rows(10).data[0], value: false }, { ...rows(10).data[0], _date: '2026-02-30' },
  ] });
  expect(screen.queryByLabelText('Chart data')).not.toBeInTheDocument();
  expect(screen.getByText(/2 loaded rows could not be plotted/)).toBeInTheDocument();
  expect(screen.getByText('No valid observations can be plotted for this selection.')).toBeInTheDocument();
});
