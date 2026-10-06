import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import AtlasAssetInspector from './AtlasAssetInspector';

const bus = { id: 'FR00', type: 'Bus', country: 'FR', latitude: 48, longitude: 2, source: 'Native model' };
const generator = { id: 'FR00 Nuclear', type: 'Generator', bus: 'FR00', country: 'FR', carrier: 'Nuclear', p_nom: 1200,
  properties: [{ Property: 'P Nom', Value: 1200, Units: 'MW' }, { Property: 'Capital Cost', Value: 50, Units: 'EUR/MW' }] };
const edge = { id: 'FR00-BE00', from: 'FR00', to: 'BE00' };
const props = { selection: { kind: 'node', record: bus }, facilities: [bus, generator], connections: [edge], onSelect: jest.fn() };

test('Overview merges source facts, generation portfolio and selectable connected links into one tab panel', () => {
  const view = render(<AtlasAssetInspector {...props} />);
  expect(view.getAllByRole('tabpanel')).toHaveLength(1);
  expect(view.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  expect(view.getByText('Native model')).toBeInTheDocument();
  expect(view.getByText('Nuclear')).toBeInTheDocument();
  fireEvent.click(view.getByRole('button', { name: /FR00-BE00/ }));
  expect(props.onSelect).toHaveBeenCalledWith({ kind: 'link', record: edge });
});
test('keyboard tabs expose costs and actual summary context without inventing hourly records', () => {
  const record = { ...generator, properties: [...generator.properties, { Property: '[Context] Demand Peak', Value: 25, Units: 'MW' }] };
  const view = render(<AtlasAssetInspector {...props} selection={{ kind: 'node', record }} />);
  fireEvent.keyDown(view.getByRole('tab', { name: 'Overview' }), { key: 'ArrowRight' });
  expect(view.getByRole('tab', { name: 'Costs' })).toHaveFocus();
  expect(view.getByRole('tabpanel')).toHaveTextContent('Capital Cost');
  expect(view.getByRole('tabpanel')).not.toHaveTextContent('Displayed connections');
  fireEvent.click(view.getByRole('tab', { name: 'Time-series' }));
  expect(view.getByRole('tabpanel')).toHaveTextContent('25');
  expect(view.getByRole('tabpanel')).toHaveTextContent('not a full hourly profile');
  view.rerender(<AtlasAssetInspector {...props} selection={{ kind: 'link', record: edge }} />);
  expect(view.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  expect(view.getByRole('region', { name: 'Connection endpoints' })).toHaveTextContent('BE00');
  expect(view.getByRole('tabpanel')).not.toHaveTextContent('Avg demand');
  expect(view.getByRole('tabpanel')).not.toHaveTextContent('CARRIER MIX AT LOCATION');
});
test('co-located component switching retains visible siblings and excludes hidden assets', () => {
  const hidden = { id: 'hidden', type: 'Generator' };
  const record = { ...bus, sameLocationFacilities: [bus, generator, hidden] };
  const view = render(<AtlasAssetInspector {...props} selection={{ kind: 'node', record }} />);
  expect(view.getAllByRole('option')).toHaveLength(2);
  fireEvent.change(view.getByLabelText('Component at this location'), { target: { value: generator.id } });
  expect(props.onSelect).toHaveBeenCalledWith({ kind: 'node', record: { ...generator, sameLocationFacilities: [record, generator] } });
});
test('untrusted source strings are rendered as text, not markup', () => {
  const record = { ...bus, carrier: '<img src=x onerror=alert(1)>', properties: [{ Property: 'Capital Cost', Value: '<script>bad()</script>' }] };
  const view = render(<AtlasAssetInspector {...props} selection={{ kind: 'node', record }} />);
  expect(view.container.querySelector('img')).toBeNull();
  fireEvent.click(view.getByRole('tab', { name: 'Costs' }));
  expect(view.container.querySelector('script')).toBeNull();
  expect(view.getByRole('tabpanel')).toHaveTextContent('<script>bad()</script>');
});

test('confirmed outage is visible and modification hands off without writing', () => {
  const modify = jest.fn();
  const record = { ...edge, id: 'Line:A-B', name: 'A-B', component_type: 'Line', source_model_project: 'Fixture', source_model_version: 'v2', source_model_name: 'Branch',
    operational_state: { status: 'disabled', reason: 'Max Flow = 0 and Min Flow = 0' } };
  const view = render(<AtlasAssetInspector {...props} selection={{ kind: 'link', record }} onAskModify={modify} />);
  expect(view.getByRole('status')).toHaveTextContent('Disabled');
  expect(view.getByRole('status')).toHaveTextContent('Branch');
  fireEvent.click(view.getByRole('button', { name: 'Ask Emil to modify this line' }));
  expect(modify).toHaveBeenCalledTimes(1);
});
