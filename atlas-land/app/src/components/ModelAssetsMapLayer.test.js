import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelAssetsMapLayer from './ModelAssetsMapLayer';
import { modelAssetFrame } from '../modelWorkspace/modelAssets';

jest.mock('leaflet', () => ({ __esModule: true, default: { svg: () => ({ type: 'svg' }) } }));
jest.mock('react-leaflet', () => ({
  CircleMarker: ({ children, eventHandlers, pathOptions, radius, renderer }) => <button data-color={pathOptions.fillColor}
    data-radius={radius} data-weight={pathOptions.weight} data-renderer={renderer.type} onClick={eventHandlers.click}>{children}</button>,
  Tooltip: ({ children }) => <span>{children}</span>,
}));
const objects = [{ id: 'g', name: 'Generator A', nodes: [{ id: 'n', name: 'Exact node', position: { lat: 50, lon: 4 } }] }];

test('SVG markers select exact assets and zero remains a real reported value', () => {
  const onSelect = jest.fn();
  render(<ModelAssetsMapLayer frame={modelAssetFrame(objects, new Map([['g', { value: 0, unit: 'MW' }]]), '', 'g')} onSelect={onSelect} />);
  const marker = screen.getByRole('button');
  expect(marker).toHaveAttribute('data-renderer', 'svg');
  expect(marker).toHaveAttribute('data-weight', '4');
  expect(marker).toHaveAttribute('data-radius', '7');
  expect(marker).toHaveTextContent('Generator A · 0 MW');
  fireEvent.click(marker); expect(onSelect).toHaveBeenCalledWith('g');
});

test('an entirely missing output period is muted and never looks like a reported zero', () => {
  render(<ModelAssetsMapLayer frame={modelAssetFrame(objects, new Map(), '', '', true)} />);
  expect(screen.getByRole('button')).toHaveAttribute('data-color', 'var(--atlas-map-muted)');
  expect(screen.getByRole('button')).toHaveTextContent('Not reported at this period');
  expect(screen.getByRole('button')).not.toHaveTextContent('0 MW');
});

test('colocated assets stay individually described instead of being summed', () => {
  render(<ModelAssetsMapLayer frame={modelAssetFrame([...objects, { ...objects[0], id: 'b', name: 'Generator B' }],
    new Map([['g', { value: 20, unit: 'MW' }], ['b', { value: -30, unit: 'MW' }]]))} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button')).toHaveTextContent('Generator A · 20 MW');
  expect(screen.getByRole('button')).toHaveTextContent('Generator B · -30 MW');
  expect(screen.getByRole('button')).toHaveTextContent('not a node total');
});
