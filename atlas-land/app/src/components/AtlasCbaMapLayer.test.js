import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AtlasCbaMapLayer, { cbaMapColor } from './AtlasCbaMapLayer';
import { COMPARISON_COLORS } from '../modelWorkspace/resultColors';

jest.mock('leaflet', () => ({ svg: () => ({}) }));
jest.mock('react-leaflet', () => ({
  Pane: ({ children }) => <div>{children}</div>,
  Tooltip: ({ children }) => <div role="tooltip">{children}</div>,
  CircleMarker: ({ children, radius, pathOptions }) => <div data-testid="point" data-radius={radius} data-colour={pathOptions.color}>{children}</div>,
  Polyline: ({ children, positions, pathOptions }) => <div data-testid="line" data-coordinates={JSON.stringify(positions)} data-colour={pathOptions.color}>{children}</div>,
}));

test('favourability follows rent versus system-cost direction and preserves zero', () => {
  expect(cbaMapColor(1, 'consumer')).toBe(COMPARISON_COLORS.favourable);
  expect(cbaMapColor(-1, 'producer')).toBe(COMPARISON_COLORS.unfavourable);
  expect(cbaMapColor(-1, 'total')).toBe(COMPARISON_COLORS.favourable);
  expect(cbaMapColor(0, 'total')).toBe(COMPARISON_COLORS.neutral);
});

test('country circles use area-based magnitude, size control and tooltips with exact values', () => {
  const scene = { points: [{ country: 'AA', value: 25, coordinates: [1, 2] }, { country: 'BB', value: 100, coordinates: [3, 4] }],
    lines: [], component: 'consumer', label: 'Consumer rents', caseId: 'case', band: '2050', unit: 'M EUR', quality: { certified: false } };
  const view = render(<AtlasCbaMapLayer scene={scene} />);
  const radii = screen.getAllByTestId('point').map(el => Number(el.dataset.radius));
  expect(radii[1]).toBeGreaterThan(radii[0]);
  expect(screen.getAllByRole('tooltip')[0]).toHaveTextContent('Consumer rents: 25 M EUR');
  expect(screen.getAllByRole('tooltip')[0]).toHaveTextContent('Saved test · unvalidated');
  view.rerender(<AtlasCbaMapLayer scene={scene} markerScale={2} />);
  expect(Number(screen.getAllByTestId('point')[1].dataset.radius)).toBeGreaterThan(radii[1]);
});

test('rent lines use canonical coordinates and show reported values without invented endpoints', () => {
  render(<AtlasCbaMapLayer scene={{ points: [], component: 'congestion', label: 'Congestion rents', caseId: 'case', band: '2050', unit: 'M EUR',
    lines: [{ id: 'id', assetName: 'Reported line', value: -5, coordinates: [[1, 2], [3, 4]] }] }} />);
  expect(screen.getByTestId('line')).toHaveAttribute('data-coordinates', '[[2,1],[4,3]]');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Reported line');
  expect(screen.getByRole('tooltip')).toHaveTextContent('-5 M EUR');
});
