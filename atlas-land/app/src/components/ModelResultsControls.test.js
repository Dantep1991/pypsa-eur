import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelResultsControls from './ModelResultsControls';
import fs from 'fs';
import path from 'path';
import postcss from 'postcss';

const catalogStatus = {
  state: 'ready',
  catalog: {
    model_version: 'v3.0.0',
    runs: [{
      run_id: 'run-1',
      label: 'Run 1',
      compatible: true,
      periods: ['2030'],
      period_granularity: 'annual',
      quantities: [
        { id: 'Node.Price', report_family: 'ST', class_name: 'Node', property_name: 'Price', unit: 'EUR/MWh', periods: ['2030'], categories: ['eMarket', 'Offshore'], category_objects: { eMarket: ['BE00', 'FR00'], Offshore: ['BE01'] } },
        { id: 'Node.Load', report_family: 'ST', class_name: 'Node', property_name: 'Load', unit: 'GWh', periods: ['2030'], categories: ['eMarket'] },
        { id: 'Line.Flow', report_family: 'ST', class_name: 'Line', property_name: 'Flow', unit: 'GWh', periods: ['2030'], categories: ['eMarket Reference'], supports_flow_map: true },
      ],
    }],
  },
};

test('keeps component classes separate from real Visualisation categories', () => {
  const onSelectionChange = jest.fn();
  render(
    <ModelResultsControls
      catalogStatus={catalogStatus}
      selection={{ runId: 'run-1', category: '', quantityId: 'Node.Price', reportFamily: 'ST', className: 'Node', propertyName: 'Price', unit: 'EUR/MWh', period: '2030', scopeId: '' }}
      resultStatus={{ state: 'idle', scene: null }}
      scopeOptions={[{ id: 'Node:BE00', label: 'BE00 · BE' }]}
      onSelectionChange={onSelectionChange}
      onShow={() => {}}
      onClear={() => {}}
    />,
  );

  expect(screen.getByRole('option', { name: 'Node · Price (EUR/MWh)' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Line · Flow (GWh)' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'All categories' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'eMarket' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Offshore' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'BE00 · BE' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Result component'), { target: { value: 'Line' } });
  expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({
    category: '',
    quantityId: 'Line.Flow',
    className: 'Line',
  }));

  fireEvent.change(screen.getByLabelText('Result category'), { target: { value: 'eMarket' } });
  expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({
    category: 'eMarket',
    categoryObjects: ['BE00', 'FR00'],
  }));
});

const renderControls = (overrides = {}) => render(<ModelResultsControls
  catalogStatus={catalogStatus}
  selection={{ runId: 'run-1', quantityId: 'Node.Price', className: 'Node', period: '2030' }}
  resultStatus={{ state: 'idle', scene: null }}
  onSelectionChange={jest.fn()}
  onShow={jest.fn()}
  onClear={jest.fn()}
  {...overrides}
/>);

test('retains all labelled controls and map actions in the readable layout', () => {
  const onShow = jest.fn();
  const onClear = jest.fn();
  renderControls({ onShow, onClear, resultStatus: { state: 'ready', scene: {
    selection: { id: 'Node.Price', period_label: '2030' }, coverage: { mapped_row_count: 42 },
  } } });
  expect(screen.getAllByRole('combobox')).toHaveLength(7);
  ['Result run', 'Result component', 'Quantity', 'Result map style', 'Result category', 'Result period', 'Result node or region']
    .forEach(name => expect(screen.getByRole('combobox', { name, exact: true })).toBeInTheDocument());
  expect(screen.getByRole('combobox', { name: 'Result run' })).toHaveAttribute('title', 'Run 1');
  expect(screen.getByRole('combobox', { name: 'Quantity' })).toHaveAttribute('title', 'Node · Price (EUR/MWh)');
  fireEvent.click(screen.getByRole('button', { name: 'Show on map' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear result layer' }));
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(onClear).toHaveBeenCalledTimes(1);
});

test('disables selections during loading while retaining real progress', () => {
  renderControls({ resultStatus: { state: 'loading', progress: { phase: 'projection', total: 42 } } });
  screen.getAllByRole('combobox').forEach(control => expect(control).toBeDisabled());
  expect(screen.getByRole('button', { name: 'Mapping 42 result rows…' })).toBeDisabled();
});

test('circle sizing changes display state independently of query selection and Show on map', () => {
  const onMarkerScaleChange = jest.fn(), onSelectionChange = jest.fn(), onShow = jest.fn();
  renderControls({ markerScale: 1, onMarkerScaleChange, onSelectionChange, onShow });
  fireEvent.input(screen.getByRole('slider', { name: 'Circle size' }), { target: { value: '150' } });
  expect(onMarkerScaleChange).toHaveBeenCalledWith(1.5);
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(onShow).not.toHaveBeenCalled();
});

test.each([
  [{ state: 'loading', progress: { completed: 1, total: 2 } }, 'status', 'Reading result catalogues · 1/2'],
  [{ state: 'error', error: 'Result catalogue unavailable' }, 'alert', 'Result catalogue unavailable'],
  [{ state: 'ready', catalog: { runs: [] } }, 'status', 'No result run is bound to the loaded model version.'],
])('uses readable notices for unavailable catalogue states', (status, role, text) => {
  renderControls({ catalogStatus: status });
  expect(screen.getByRole(role)).toHaveClass('atlas-results-notice');
  expect(screen.getByRole(role)).toHaveTextContent(text);
});

test('typography contract keeps controls at least 14 px, labels 12 px and hit targets 44 px', () => {
  const css = postcss.parse(fs.readFileSync(path.join(__dirname, 'ModelResultsControls.css'), 'utf8'));
  const declaration = (selector, property) => {
    const rule = css.nodes.find(node => node.type === 'rule' && node.selector === selector);
    return rule.nodes.find(node => node.prop === property).value;
  };
  const remPixels = value => Number(value.match(/([\d.]+)rem/)[1]) * 16;
  expect(remPixels(declaration('.atlas-results-controls', 'font'))).toBeGreaterThanOrEqual(14);
  expect(remPixels(declaration('.atlas-results-controls__field > span', 'font-size'))).toBeGreaterThanOrEqual(12);
  expect(declaration('.atlas-results-controls__field select', 'font')).toBe('inherit');
  expect(remPixels(declaration('.atlas-results-controls__field select', 'min-height'))).toBeGreaterThanOrEqual(44);
  expect(remPixels(declaration('.atlas-results-controls__actions button', 'font'))).toBeGreaterThanOrEqual(14);
  expect(remPixels(declaration('.atlas-results-controls__actions button', 'min-height'))).toBeGreaterThanOrEqual(44);
});
