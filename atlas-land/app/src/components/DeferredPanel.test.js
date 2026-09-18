import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { deferredPanel } from './DeferredPanel';

test('optional tooling loads on mount, displays status and retains child state on rerender', async () => {
  let resolve;
  const load = jest.fn(() => new Promise(done => { resolve = done; }));
  const Panel = deferredPanel(load, 'results');
  expect(load).not.toHaveBeenCalled();
  const view = render(<Panel label="First" />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading results');
  const Content = ({ label }) => {
    const [count, setCount] = useState(0);
    return <button onClick={() => setCount(count + 1)}>{label} {count}</button>;
  };
  await act(async () => resolve({ default: Content }));
  fireEvent.click(screen.getByRole('button', { name: 'First 0' }));
  view.rerender(<Panel label="Second" />);
  expect(screen.getByRole('button', { name: 'Second 1' })).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(1);
});

test('a failed chunk stays local and Retry creates a new import without reloading the app', async () => {
  const load = jest.fn().mockRejectedValueOnce(new Error('private chunk URL'))
    .mockResolvedValueOnce({ default: () => <p>Chart ready</p> });
  const Panel = deferredPanel(load, 'flow chart');
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await act(async () => render(<><button>Map control</button><Panel /></>));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not open flow chart');
    expect(screen.queryByText('private chunk URL')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Map control' })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry flow chart' })));
    expect(screen.getByText('Chart ready')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  } finally { consoleError.mockRestore(); }
});

test('the deferred real flow panel retains API parameters and period controls', async () => {
  const previousFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: false, status: 404 }));
  const Panel = deferredPanel(() => import('./LineFlowChartPanel'), 'flow chart');
  try {
    expect(global.fetch).not.toHaveBeenCalled();
    await act(async () => render(<Panel dirname="study FR" name="line/1" type="link" granularityPrefix="nuts3" />));
    expect(screen.getByText('No flow data available')).toBeInTheDocument();
    const request = new URL(global.fetch.mock.calls[0][0], 'http://localhost');
    expect(request.pathname).toContain('/api/pypsa/line-flow-profile');
    expect(Object.fromEntries(request.searchParams)).toEqual({
      dirname: 'study FR', name: 'line/1', type: 'link', view: 'weekly', granularity_prefix: 'nuts3',
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'monthly' })));
    expect(new URL(global.fetch.mock.calls[1][0], 'http://localhost').searchParams.get('view')).toBe('monthly');
  } finally { global.fetch = previousFetch; }
});
