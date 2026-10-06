import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Pane, useMap } from 'react-leaflet';
import { cleanup, fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import ModelAssetsMapLayer from './ModelAssetsMapLayer';
import { modelAssetFrame } from '../modelWorkspace/modelAssets';
import { installMapTooltipGuard } from '../mapTooltipGuard';

const objects = [{ id: 'g', name: 'Nuclear generator', nodes: [
  { id: 'n', name: 'Exact model node', position: { lat: 50, lon: 4 } },
] }];
let previousSvg, panInside, mapClick;

beforeEach(() => {
  // jsdom does not implement SVG feature detection, but can dispatch real
  // Leaflet DOM events on its paths. Do not mock either map or tooltip binding.
  previousSvg = L.Browser.svg;
  L.Browser.svg = true;
  panInside = jest.spyOn(L.Map.prototype, 'panInside').mockReturnThis();
  mapClick = jest.fn();
});
afterEach(() => { cleanup(); panInside.mockRestore(); L.Browser.svg = previousSvg; });

function Guard() {
  const map = useMap();
  useEffect(() => {
    const dispose = installMapTooltipGuard(map);
    map.on('click', mapClick);
    return () => { dispose(); map.off('click', mapClick); };
  }, [map]);
  return null;
}

function Inputs({ values, label = 'Max Capacity', assets = objects }) {
  const [selectedId, setSelectedId] = useState('');
  return <ModelAssetsMapLayer frame={modelAssetFrame(assets, values, label, selectedId, true)} onSelect={setSelectedId} />;
}

function TestMap(props) {
  return <MapContainer center={[50, 4]} zoom={5} zoomControl={false} attributionControl={false}
    zoomAnimation={false} fadeAnimation={false} style={{ width: 600, height: 400 }}>
    <Guard />
    <Pane name="grid-access-sites" style={{ zIndex: 675 }}><canvas /></Pane>
    <Inputs {...props} />
  </MapContainer>;
}

const tooltip = () => document.querySelector('.model-assets-tooltip');
const bubble = () => document.querySelector('.leaflet-model-assets-pane path');

test('real SVG input is above the Access canvas and hover/click/unpin use the value tooltip', () => {
  render(<TestMap values={new Map([['g', { value: 482.75, unit: 'MW' }]])} />);
  const assetPane = document.querySelector('.leaflet-model-assets-pane');
  const accessPane = document.querySelector('.leaflet-grid-access-sites-pane');
  expect(Number(assetPane.style.zIndex)).toBeGreaterThan(Number(accessPane.style.zIndex));
  expect(accessPane.querySelector('canvas')).not.toBeNull();
  expect(tooltip()).toBeNull();
  fireEvent.mouseOver(bubble());
  expect(tooltip()).toHaveTextContent('Max Capacity');
  expect(tooltip()).toHaveTextContent('Nuclear generator · 482.75 MW');
  fireEvent.mouseOut(bubble());
  expect(tooltip()).toBeNull();
  fireEvent.click(bubble());
  fireEvent.mouseOut(bubble());
  expect(tooltip()).toHaveTextContent('Nuclear generator · 482.75 MW');
  expect(mapClick).not.toHaveBeenCalled();
  expect(document.querySelectorAll('.leaflet-tooltip')).toHaveLength(1);
  fireEvent.click(bubble());
  fireEvent.mouseOut(bubble());
  expect(tooltip()).toBeNull();
});

test('a pinned real tooltip refreshes with an equation and its operands', () => {
  const { rerender } = render(<TestMap values={new Map([['g', { value: 100, unit: 'MW' }]])} />);
  fireEvent.click(bubble());
  expect(tooltip()).toHaveTextContent('Nuclear generator · 100 MW');
  rerender(<TestMap label="[Max Capacity] * 1.1" values={new Map([['g', {
    value: 110, unit: 'MW', operands: [{ property: 'Max Capacity', value: 100, unit: 'MW' }],
  }]])} />);
  expect(tooltip()).toHaveTextContent('[Max Capacity] * 1.1');
  expect(tooltip()).toHaveTextContent('Nuclear generator · 110 MW');
  expect(tooltip()).toHaveTextContent('Max Capacity: 100 MW');
  expect(document.querySelectorAll('.leaflet-tooltip')).toHaveLength(1);
});

test('one real tooltip preserves zero and explains missing colocated inputs', () => {
  render(<TestMap assets={[...objects, { ...objects[0], id: 'missing', name: 'Unresolved generator' }]}
    values={new Map([['g', { value: 0, unit: 'MW' }], ['missing', { value: null, note: 'Linked file has no value' }]])} />);
  fireEvent.mouseOver(bubble());
  expect(tooltip()).toHaveTextContent('Nuclear generator · 0 MW');
  expect(tooltip()).toHaveTextContent('Unresolved generator · Linked file has no value');
  expect(document.querySelectorAll('.leaflet-tooltip')).toHaveLength(1);
});
