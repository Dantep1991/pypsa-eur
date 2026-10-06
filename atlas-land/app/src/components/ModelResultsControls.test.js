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
      result_model_version: 'v3.0.0',
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

test('multiple category chips add, remove and restore all with automatic map updates', () => {
  const onShow = jest.fn();
  function StatefulControls() {
    const [selection, setSelection] = React.useState({ runId: 'run-1', quantityId: 'Node.Price', className: 'Node', period: '2030', categories: [] });
    return <ModelResultsControls catalogStatus={catalogStatus} selection={selection} onSelectionChange={setSelection}
      onShow={onShow} onClear={jest.fn()} resultStatus={{ state: 'ready', scene: {} }} />;
  }
  render(<StatefulControls />);
  const select = screen.getByRole('combobox', { name: 'Result category' });
  fireEvent.change(select, { target: { value: 'eMarket' } });
  fireEvent.change(select, { target: { value: 'Offshore' } });
  expect(onShow).toHaveBeenLastCalledWith(expect.objectContaining({ category: '', categories: ['eMarket', 'Offshore'], categoryObjects: ['BE00', 'FR00', 'BE01'] }));
  expect(screen.getByRole('button', { name: 'Remove result category eMarket' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove result category Offshore' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Remove result category eMarket' }));
  expect(onShow).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'Offshore', categories: ['Offshore'], categoryObjects: ['BE01'] }));
  fireEvent.change(select, { target: { value: '__all__' } });
  expect(onShow).toHaveBeenLastCalledWith(expect.objectContaining({ categories: [], categoryObjects: [] }));
  expect(screen.queryByRole('button', { name: /Remove result category/ })).not.toBeInTheDocument();
  expect(onShow).toHaveBeenCalledTimes(4);
});

test('changing quantity retains only compatible selected categories', () => {
  const onShow = jest.fn();
  renderControls({ onShow, selection: { runId: 'run-1', quantityId: 'Node.Price', className: 'Node', period: '2030', categories: ['eMarket', 'Offshore'] } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Quantity' }), { target: { value: 'Node.Load' } });
  expect(onShow).toHaveBeenLastCalledWith(expect.objectContaining({ categories: ['eMarket'], category: 'eMarket' }));
});

test('shows recommendation progress and a concise interpretation of the displayed result', () => {
  const view = renderControls({ resultStatus: { state: 'loading', progress: { phase: 'interpretation' } } });
  expect(screen.getByRole('button', { name: 'AI colour recommendation · 0/1' })).toBeDisabled();
  view.unmount();
  renderControls({ resultStatus: { state: 'ready', scene: { color_policy: { preference: 'decrease' } } } });
  expect(screen.getByText('AI colours: lower is green, higher is red.')).toBeVisible();
});

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
  fireEvent.click(screen.getByRole('button', { name: 'Refresh map' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear result layer' }));
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(onClear).toHaveBeenCalledTimes(1);
});

test('allows changing selections during loading while retaining real progress', () => {
  const onShow = jest.fn();
  renderControls({ onShow, resultStatus: { state: 'loading', progress: { phase: 'projection', total: 42 } } });
  screen.getAllByRole('combobox').forEach(control => expect(control).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Mapping 42 result rows…' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Quantity' }), { target: { value: 'Node.Load' } });
  expect(onShow).toHaveBeenCalledWith(expect.objectContaining({ quantityId: 'Node.Load', propertyName: 'Load' }));
});

test('circle sizing changes display state without another query', () => {
  const onMarkerScaleChange = jest.fn(), onSelectionChange = jest.fn(), onShow = jest.fn();
  renderControls({ markerScale: 1, onMarkerScaleChange, onSelectionChange, onShow });
  expect(onShow).toHaveBeenCalledTimes(1);
  onShow.mockClear();
  fireEvent.input(screen.getByRole('slider', { name: 'Circle size' }), { target: { value: '150' } });
  expect(onMarkerScaleChange).toHaveBeenCalledWith(1.5);
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(onShow).not.toHaveBeenCalled();
});

test.each([
  [{ state: 'loading', progress: { completed: 1, total: 2 } }, 'status', 'Reading result catalogues · 1/2'],
  [{ state: 'error', error: 'Result catalogue unavailable' }, 'alert', 'Result catalogue unavailable'],
  [{ state: 'ready', catalog: { runs: [] } }, 'status', 'No saved results found for this model version.'],
])('uses readable notices for unavailable catalogue states', (status, role, text) => {
  const onShow = jest.fn();
  renderControls({ catalogStatus: status, onShow });
  expect(screen.getByRole(role)).toHaveClass('atlas-results-notice');
  expect(screen.getByRole(role)).toHaveTextContent(text);
  expect(onShow).not.toHaveBeenCalled();
});

test('automatically shows the initial selection once when its catalogue is ready', () => {
  const onShow = jest.fn();
  const selection = { runId: 'run-1', quantityId: 'Node.Price', className: 'Node', period: '2030' };
  const props = { selection, onShow, onSelectionChange: jest.fn(), onClear: jest.fn(), resultStatus: { state: 'idle' } };
  const view = renderControls({ ...props, catalogStatus: { state: 'loading' } });
  expect(onShow).not.toHaveBeenCalled();
  view.rerender(<ModelResultsControls {...props} catalogStatus={catalogStatus} />);
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(onShow).toHaveBeenCalledWith(selection);
  view.rerender(<ModelResultsControls {...props} catalogStatus={catalogStatus} resultStatus={{ state: 'loading' }} />);
  view.rerender(<ModelResultsControls {...props} catalogStatus={catalogStatus} />);
  expect(onShow).toHaveBeenCalledTimes(1);
});

test.each([
  { runId: 'missing', quantityId: 'Node.Price', className: 'Node', period: '2030' },
  { runId: 'run-1', quantityId: 'missing', className: 'Node', period: '2030' },
  { runId: 'run-1', quantityId: 'Node.Price', className: 'Node', period: '2040' },
  null,
])('does not automatically query an incomplete or unbound selection: %j', selection => {
  const onShow = jest.fn();
  renderControls({ selection, onShow });
  expect(onShow).not.toHaveBeenCalled();
});

test.each(['loading', 'ready'])('does not duplicate a result already %s when opened', state => {
  const onShow = jest.fn();
  renderControls({ onShow, resultStatus: { state, scene: state === 'ready' ? { selection: { id: 'Node.Price' } } : null } });
  expect(onShow).not.toHaveBeenCalled();
});

test.each([
  ['Result run', 'run-2', { runId: 'run-2', runLabel: 'Run 2', runModelVersion: 'v3.0.0', quantityId: 'Node.Price', period: '2040' }],
  ['Result component', 'Line', { quantityId: 'Line.Flow', className: 'Line', propertyName: 'Flow', supportsFlowMap: true }],
  ['Quantity', 'Node.Load', { quantityId: 'Node.Load', className: 'Node', propertyName: 'Load', unit: 'GWh' }],
  ['Result map style', 'colour', { mapMode: 'colour' }],
  ['Result category', 'eMarket', { category: 'eMarket', categoryObjects: ['BE00', 'FR00'] }],
  ['Result period', '2040', { period: '2040' }],
  ['Result node or region', 'Node:BE00', { scopeId: 'Node:BE00' }],
])('%s changes immediately show the new selection without a map button click', (name, value, expected) => {
  const onSelectionChange = jest.fn(), onShow = jest.fn();
  const firstRun = catalogStatus.catalog.runs[0];
  const catalogue = { ...catalogStatus, catalog: { ...catalogStatus.catalog, runs: [
    { ...firstRun, quantities: firstRun.quantities.map(item => ({ ...item, periods: ['2030', '2040'] })) },
    { ...firstRun, run_id: 'run-2', label: 'Run 2', periods: ['2040'],
      quantities: firstRun.quantities.map(item => ({ ...item, periods: ['2040'] })) },
  ] } };
  renderControls({ catalogStatus: catalogue, onSelectionChange, onShow,
    scopeOptions: [{ id: 'Node:BE00', label: 'BE00' }] });
  onShow.mockClear();
  fireEvent.change(screen.getByRole('combobox', { name, exact: true }), { target: { value } });
  expect(onSelectionChange).toHaveBeenCalledTimes(1);
  expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining(expected));
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(onShow.mock.calls[0][0]).toBe(onSelectionChange.mock.calls[0][0]);
});

test('clearing the layer keeps it cleared until the next user selection', () => {
  const onShow = jest.fn(), onClear = jest.fn(), onSelectionChange = jest.fn();
  const props = { catalogStatus, selection: { runId: 'run-1', quantityId: 'Node.Price', className: 'Node', period: '2030' },
    onShow, onClear, onSelectionChange };
  const view = render(<ModelResultsControls {...props} resultStatus={{ state: 'ready', scene: { selection: { id: 'Node.Price' } } }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Clear result layer' }));
  expect(onClear).toHaveBeenCalledTimes(1);
  view.rerender(<ModelResultsControls {...props} resultStatus={{ state: 'idle', scene: null }} />);
  expect(onShow).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Quantity' }), { target: { value: 'Node.Load' } });
  expect(onShow).toHaveBeenCalledWith(expect.objectContaining({ quantityId: 'Node.Load' }));
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
