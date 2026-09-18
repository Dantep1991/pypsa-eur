import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ResultsTab, { ResultsObservationTooltip } from './ResultsTab';

// jsdom has no layout. Supply only dimensions; use real Recharts axes/scatter/SVG.
jest.mock('recharts', () => ({ ...jest.requireActual('recharts'),
  ResponsiveContainer: ({ children }) => jest.requireActual('react').cloneElement(children, { width: 640, height: 360 }),
}));

test('real scatter rendering retains same-time points with finite SVG geometry', async () => {
  const previousFetch = global.fetch, previousScroll = Element.prototype.scrollIntoView;
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => url.includes('list-parquet')
    ? { success: true, parquet_files: [{ id: 'A', name: 'A' }] }
    : url.includes('filter-options') ? { success: true, filter_options: {} }
      : { success: true, data: [
        { _date: '2026-01-01T00:00:00Z', value: 10, unit_name: 'MW', child_name: 'Plant A' },
        { _date: '2026-01-01T00:00:00Z', value: 20, unit_name: 'MW', child_name: 'Plant B' },
        { _date: '2026-01-02T00:00:00Z', value: 0, unit_name: 'MW', child_name: 'Plant A' },
      ], pagination: { page: 1, total_rows: 3, total_pages: 1 } } }));
  try {
    const view = render(<ResultsTab activeAssistant="emil" activeTab="results" resultsChatMessages={[]} setResultsChatMessages={jest.fn()} />);
    await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Detailed Results' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Select Parquet File:' }), { target: { value: 'A' } });
    await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
    expect(view.container.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(3);
    const paths = view.container.querySelectorAll('.recharts-scatter-symbol path');
    expect(paths).toHaveLength(3);
    for (const path of paths) {
      expect(path.getAttribute('d')).toBeTruthy(); expect(path.getAttribute('d')).not.toMatch(/NaN|Infinity/);
    }
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('Encountered two children with the same key');
    expect(view.container.querySelectorAll('.recharts-line-curve')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'View displayed observations' }));
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('table')).toHaveTextContent('Plant B');
  } finally {
    cleanup(); global.fetch = previousFetch; Element.prototype.scrollIntoView = previousScroll;
    consoleError.mockRestore();
  }
});

test('observation tooltip shows exact source timestamp, value and escaped series metadata', () => {
  const view = render(<ResultsObservationTooltip active unit="MWh" payload={[{ payload: {
    sourceDate: '2026-01-01T00:30:00+01:00', value: -2.5,
    dimensions: [{ field: 'child_name', value: '<img src=x onerror=alert(1)>' }],
  } }]} />);
  expect(screen.getByText('2026-01-01T00:30:00+01:00')).toBeInTheDocument();
  expect(screen.getByText('-2.5 MWh')).toBeInTheDocument();
  expect(view.container.querySelector('img')).toBe(null);
  expect(view.container).toHaveTextContent('<img src=x onerror=alert(1)>');
});
