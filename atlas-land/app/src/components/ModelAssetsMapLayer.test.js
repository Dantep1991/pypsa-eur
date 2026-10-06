import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelAssetsMapLayer from './ModelAssetsMapLayer';
import { modelAssetFrame } from '../modelWorkspace/modelAssets';
const mockMap = { panInside: jest.fn() };

jest.mock('leaflet', () => ({ __esModule: true, default: { svg: () => ({ type: 'svg' }) } }));
jest.mock('react-leaflet', () => ({
  useMap: () => mockMap, Pane: ({ children, style, name }) => <div data-testid={name === 'model-assets' ? 'asset-pane' : 'asset-tooltip-pane'} data-z={style.zIndex}>{children}</div>,
  CircleMarker: ({ children, eventHandlers, pathOptions, radius, renderer }) => <button data-color={pathOptions.fillColor} data-outline={pathOptions.color}
    data-opacity={pathOptions.fillOpacity} data-dash={pathOptions.dashArray}
    data-radius={radius} data-weight={pathOptions.weight} data-renderer={renderer.type} onClick={eventHandlers.click}>{children}</button>,
  Tooltip: ({ children, permanent, pane, sticky, interactive, atlasTooltipPriority }) => <span data-testid="asset-tooltip" data-permanent={permanent} data-pane={pane}
    data-sticky={sticky} data-interactive={interactive} data-priority={atlasTooltipPriority}>{children}</span>,
}));
const objects = [{ id: 'g', name: 'Generator A', nodes: [{ id: 'n', name: 'Exact node', position: { lat: 50, lon: 4 } }] }];

test('SVG markers select exact assets and zero remains a real reported value', () => {
  const onSelect = jest.fn();
  render(<ModelAssetsMapLayer frame={modelAssetFrame(objects, new Map([['g', { value: 0, unit: 'MW' }]]), '', 'g')} onSelect={onSelect} />);
  const marker = screen.getByRole('button');
  expect(marker).toHaveAttribute('data-renderer', 'svg');
  expect(marker).toHaveAttribute('data-weight', '5');
  expect(marker).toHaveAttribute('data-outline', 'var(--accent-warning)');
  expect(marker).toHaveAttribute('data-radius', '6');
  // Access is a full-map canvas at 675, even outside its visible site paths.
  expect(Number(screen.getByTestId('asset-pane').dataset.z)).toBeGreaterThan(675);
  expect(screen.getByTestId('asset-tooltip-pane')).toHaveAttribute('data-z', '740');
  expect(screen.getByTestId('asset-tooltip')).toHaveAttribute('data-pane', 'model-assets-tooltips');
  expect(marker).toHaveTextContent('Generator A · 0 MW');
  fireEvent.click(marker); expect(onSelect).toHaveBeenCalledWith('');
});

test('input property values determine bubble sizes and selected objects are shown first in the tooltip', () => {
  const many = Array.from({ length: 6 }, (_, index) => ({ ...objects[0], id: `g${index}`, name: `Generator ${index}` }));
  const other = { ...objects[0], id: 'small', nodes: [{ id: 'other', name: 'Other', position: { lat: 51, lon: 3 } }] };
  const values = new Map([...many.map(obj => [obj.id, { value: 100, unit: 'MW' }]), ['small', { value: 25, unit: 'MW' }]]);
  render(<ModelAssetsMapLayer frame={modelAssetFrame([...many, other], values, 'Max Capacity', 'g5')} />);
  const markers = screen.getAllByRole('button');
  expect(markers[0]).toHaveAttribute('data-radius', '32');
  expect(markers[1]).toHaveAttribute('data-radius', '16');
  expect(Number(markers[0].dataset.radius) ** 2 / Number(markers[1].dataset.radius) ** 2).toBe(4);
  expect(markers[0]).toHaveTextContent('Max Capacity');
  expect(markers[0]).toHaveTextContent('Generator 5 · 100 MW');
  expect(mockMap.panInside).toHaveBeenCalledWith([50, 4], expect.any(Object));
});

test('an entirely missing input snapshot is muted and never looks like a reported zero', () => {
  render(<ModelAssetsMapLayer frame={modelAssetFrame(objects, new Map(), '', '', true)} />);
  expect(screen.getByRole('button')).toHaveAttribute('data-color', 'var(--atlas-map-muted)');
  expect(screen.getByRole('button')).toHaveTextContent('Input not resolved');
  expect(screen.getByRole('button')).not.toHaveTextContent('0 MW');
  expect(screen.getByRole('button')).toHaveAttribute('data-dash', '3 3');
  expect(screen.getByRole('button')).toHaveAttribute('data-opacity', '0.3');
});

test('selecting an existing marker rebinds its tooltip as permanent', () => {
  const values = new Map([['g', { value: 100, unit: 'MW' }]]);
  const { rerender } = render(<ModelAssetsMapLayer frame={modelAssetFrame(objects, values, 'Max Capacity')} />);
  const hoverTooltip = screen.getByTestId('asset-tooltip');
  expect(hoverTooltip).toHaveAttribute('data-permanent', 'false');
  rerender(<ModelAssetsMapLayer frame={modelAssetFrame(objects, values, 'Max Capacity', 'g')} />);
  expect(screen.getByTestId('asset-tooltip')).not.toBe(hoverTooltip);
  expect(screen.getByTestId('asset-tooltip')).toHaveAttribute('data-permanent', 'true');
});

test('colocated assets stay individually described instead of being summed', () => {
  render(<ModelAssetsMapLayer frame={modelAssetFrame([...objects, { ...objects[0], id: 'b', name: 'Generator B' }],
    new Map([['g', { value: 20, unit: 'MW' }], ['b', { value: -30, unit: 'MW' }]]))} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button')).toHaveTextContent('Generator A · 20 MW');
  expect(screen.getByRole('button')).toHaveTextContent('Generator B · -30 MW');
  expect(screen.getByRole('button')).toHaveTextContent('not a node total');
});

test('negative values use magnitude, and missing values stay distinct from a reported zero', () => {
  const different = (id, lat) => ({ ...objects[0], id, name: id, nodes: [{ id, name: id, position: { lat, lon: 4 } }] });
  render(<ModelAssetsMapLayer frame={modelAssetFrame([different('negative', 50), different('zero', 51), different('missing', 52)],
    new Map([['negative', { value: -100, unit: 'MW' }], ['zero', { value: 0, unit: 'MW' }],
      ['missing', { value: null, note: 'Missing linked value' }]]), 'Capacity')} />);
  const [negative, zero, missing] = screen.getAllByRole('button');
  expect(negative).toHaveAttribute('data-radius', '32');
  expect(negative).toHaveTextContent('negative · -100 MW');
  expect(zero).toHaveAttribute('data-radius', '6');
  expect(zero).not.toHaveAttribute('data-dash');
  expect(missing).toHaveAttribute('data-radius', '7');
  expect(missing).toHaveAttribute('data-dash', '3 3');
  expect(missing).toHaveTextContent('Missing linked value');
});

test('locations without a chosen metric are equal-sized, independent of object count', () => {
  const second = { ...objects[0], id: 'b' };
  const third = { ...objects[0], id: 'c', nodes: [{ id: 'other', name: 'Other', position: { lat: 51, lon: 4 } }] };
  render(<ModelAssetsMapLayer frame={modelAssetFrame([...objects, second, third])} />);
  expect(screen.getAllByRole('button').map(marker => marker.dataset.radius)).toEqual(['10', '10']);
});

test('incompatible units never imply comparable bubble magnitudes', () => {
  const other = { ...objects[0], id: 'b', nodes: [{ id: 'other', name: 'Other', position: { lat: 51, lon: 4 } }] };
  render(<ModelAssetsMapLayer frame={modelAssetFrame([...objects, other], new Map([
    ['g', { value: 100, unit: 'MW' }], ['b', { value: 1, unit: 'GW' }]]))} />);
  for (const marker of screen.getAllByRole('button')) {
    expect(marker).toHaveAttribute('data-radius', '10');
    expect(marker).toHaveTextContent('incompatible units');
  }
});

test('all colocated values are in one interactive tooltip without a separate inspector', () => {
  const many = Array.from({ length: 8 }, (_, index) => ({ ...objects[0], id: `g${index}`, name: `Generator ${index}` }));
  const values = new Map(many.map((obj, index) => [obj.id, { value: index + 1, unit: 'MW' }]));
  render(<ModelAssetsMapLayer frame={modelAssetFrame(many, values, 'Capacity')} />);
  const tooltip = screen.getByTestId('asset-tooltip');
  expect(tooltip).toHaveAttribute('data-interactive', 'true');
  expect(tooltip).toHaveAttribute('data-sticky', 'true');
  expect(tooltip).toHaveAttribute('data-priority', '40');
  expect(tooltip).toHaveTextContent('Generator 0 · 1 MW');
  expect(tooltip).toHaveTextContent('Generator 7 · 8 MW');
});

test('changing measurements rebinds a hover tooltip and shows the formula operands', () => {
  const { rerender } = render(<ModelAssetsMapLayer frame={modelAssetFrame(objects, new Map([['g', { value: 10, unit: 'MW' }]]), 'Capacity')} />);
  const previous = screen.getByTestId('asset-tooltip');
  rerender(<ModelAssetsMapLayer frame={modelAssetFrame(objects, new Map([['g', { value: 20, unit: 'MW',
    operands: [{ property: 'Capacity', value: 10, unit: 'MW' }, { property: 'Count', value: 2, unit: '-' }] }]]), '[Capacity] * [Count]')} />);
  const tooltip = screen.getByTestId('asset-tooltip');
  expect(tooltip).not.toBe(previous);
  expect(tooltip).toHaveTextContent('[Capacity] * [Count]'); expect(tooltip).toHaveTextContent('Generator A · 20 MW');
  expect(tooltip).toHaveTextContent('Capacity: 10 MW'); expect(tooltip).toHaveTextContent('Count: 2 -');
});
