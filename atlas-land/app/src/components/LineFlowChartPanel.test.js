import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import LineFlowChartPanel from './LineFlowChartPanel';
import { FLOW_PROFILE_TIMEOUT_MS } from '../hooks/useLineFlowProfile';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  AreaChart: ({ data }) => <div data-testid="flow-values">{JSON.stringify(data)}</div>,
  Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
}));
let originalFetch;
let requests;
const props = { dirname: 'study', name: 'line A', type: 'line' };
const payload = (value, extra = {}) => ({ p0: { label: 'Flow', unit: 'MW', data: [{ x: 'one', value }, { x: 'two', value }] }, ...extra });
const respond = async (index, data, status = 200) => act(async () => {
  requests[index].resolve({ ok: status === 200, status, json: async () => data });
});
beforeEach(() => {
  jest.useFakeTimers(); originalFetch = global.fetch; requests = [];
  global.fetch = jest.fn((url, options) => new Promise(resolve => requests.push({ url, ...options, resolve })));
});
afterEach(() => { cleanup(); global.fetch = originalFetch; jest.useRealTimers(); });

test('late headers for a replaced asset are not decoded or displayed', async () => {
  const view = render(<LineFlowChartPanel {...props} />);
  view.rerender(<LineFlowChartPanel {...props} name="line B" />);
  expect(requests[0].signal.aborted).toBe(true);
  await respond(1, payload(200));
  const json = jest.fn(async () => payload(100));
  await act(async () => requests[0].resolve({ ok: true, status: 200, json }));
  expect(json).not.toHaveBeenCalled();
  expect(screen.getByTestId('flow-values')).toHaveTextContent('200');
});

test('a late body cannot overwrite a newer period and old values disappear while loading', async () => {
  render(<LineFlowChartPanel {...props} />);
  let body;
  await act(async () => requests[0].resolve({ ok: true, status: 200, json: () => new Promise(resolve => { body = resolve; }) }));
  fireEvent.click(screen.getByRole('button', { name: 'daily' }));
  expect(screen.queryByTestId('flow-values')).toBeNull();
  await respond(1, payload(20));
  await act(async () => body(payload(10)));
  expect(screen.getByTestId('flow-values')).toHaveTextContent('20');
  fireEvent.click(screen.getByRole('button', { name: 'hourly' }));
  expect(screen.queryByTestId('flow-values')).toBeNull();
  expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading flow profile');
});

test.each(['headers', 'body'])('timeout releases stalled %s and retry works even if the old transport ignores abort', async stage => {
  render(<LineFlowChartPanel {...props} />);
  let oldBody;
  if (stage === 'body') {
    await act(async () => requests[0].resolve({ ok: true, status: 200,
      json: () => new Promise(resolve => { oldBody = resolve; }) }));
  }
  act(() => jest.advanceTimersByTime(FLOW_PROFILE_TIMEOUT_MS));
  expect(requests[0].signal.aborted).toBe(true);
  expect(screen.getByRole('alert')).toHaveTextContent('timed out');
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry flow profile' }));
  await respond(1, payload(30));
  if (oldBody) await act(async () => oldBody(payload(10)));
  else await respond(0, payload(10));
  expect(screen.getByTestId('flow-values')).toHaveTextContent('30');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('missing selection is not an indefinitely loading request', () => {
  render(<LineFlowChartPanel dirname="" name="" />);
  expect(requests).toHaveLength(0);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByText('No flow data available')).toBeInTheDocument();
});

test('automatic period recommendation runs once and never overrides a manual choice', async () => {
  render(<LineFlowChartPanel {...props} />);
  await respond(0, { p0: null, recommended_view: 'monthly' });
  expect(requests).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'monthly' })).toHaveAttribute('aria-pressed', 'true');
  await respond(1, { p0: null, recommended_view: 'weekly' });
  expect(requests).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'hourly' }));
  await respond(2, { p0: null, recommended_view: 'daily' });
  expect(requests).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'hourly' })).toHaveAttribute('aria-pressed', 'true');
});

test('an unsupported recommended period is ignored', async () => {
  render(<LineFlowChartPanel {...props} />);
  await respond(0, { p0: null, recommended_view: 'arbitrary' });
  expect(requests).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'weekly' })).toHaveAttribute('aria-pressed', 'true');
});

test.each([null, [], { p0: { data: {} } }, { p0: { data: [{ value: Infinity }] } }])('invalid response is contained (%j)', async data => {
  render(<LineFlowChartPanel {...props} />);
  await respond(0, data);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
  expect(screen.queryByTestId('flow-values')).toBeNull();
});

test('missing series and service failure have distinct states without exposing server errors', async () => {
  const view = render(<LineFlowChartPanel {...props} />);
  await respond(0, { error: 'internal path' }, 404);
  expect(screen.getByText('No flow data available')).toBeInTheDocument();
  view.rerender(<LineFlowChartPanel {...props} name="line B" />);
  await respond(1, { error: 'internal path' }, 500);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
  expect(screen.queryByText('internal path')).toBeNull();
});

test('unmount aborts the request and clears its deadline', async () => {
  const view = render(<LineFlowChartPanel {...props} />);
  view.unmount();
  expect(requests[0].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  const json = jest.fn();
  await act(async () => requests[0].resolve({ ok: true, json }));
  expect(json).not.toHaveBeenCalled();
});
