import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import ModelAssetsWorkspace from './ModelAssetsWorkspace';
import { readAssetApi, fetchAssetOutputsCatalog } from '../modelWorkspace/modelAssets';

jest.mock('../modelWorkspace/modelAssets', () => ({ ...jest.requireActual('../modelWorkspace/modelAssets'),
  readAssetApi: jest.fn(), fetchAssetOutputsCatalog: jest.fn() }));
const scene = { project_id: 'P', model_version: 'v1', classes: [{ class_name: 'Generator', mapped: 1, total: 2 }],
  objects: [{ id: 'g', class_name: 'Generator', name: 'G', category: 'Native', properties: ['Capacity'], nodes: [
    { id: 'n', name: 'A', class_name: 'Node', path: [], position: { lat: 50, lon: 4, source: 'model' } }] },
    { id: 'missing', name: 'Missing', class_name: 'Generator', category: 'Other', properties: [], nodes: [] }] };
let props;
beforeEach(() => {
  jest.clearAllMocks();
  props = { context: { projectId: 'P' }, modelVersion: 'v1', selectedId: '', onSelect: jest.fn(), onFrame: jest.fn(), onClose: jest.fn() };
  readAssetApi.mockImplementation(path => Promise.resolve(path.includes('/inputs?')
    ? { ...scene, objects: [{ id: 'g', records: [{ Value: '10', Units: 'MW' }] }] } : scene));
  fetchAssetOutputsCatalog.mockResolvedValue([]);
});

test('class inventory and category filtering use the native schema and disclose missing mappings', async () => {
  render(<ModelAssetsWorkspace {...props} />);
  await screen.findByText('1 / 2 objects mapped');
  fireEvent.change(screen.getByLabelText('Model category'), { target: { value: 'Native' } });
  await screen.findByText('1 / 1 objects mapped');
  expect(props.onFrame.mock.calls.at(-1)[0].markers).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Inspect object'), { target: { value: 'g' } });
  expect(props.onSelect).toHaveBeenLastCalledWith('g');
});

test('input property maps records and can switch back to unweighted objects', async () => {
  render(<ModelAssetsWorkspace {...props} />);
  await screen.findByText('1 / 2 objects mapped');
  fireEvent.click(screen.getByRole('button', { name: 'Inputs', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Show inputs on map' }));
  await waitFor(() => expect(props.onFrame.mock.calls.at(-1)[0].maximum).toBe(10));
  fireEvent.click(screen.getByRole('button', { name: /Data selection/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Objects', exact: true }));
  await waitFor(() => expect(props.onFrame.mock.calls.at(-1)[0].hasValues).toBe(false));
});

test('absent outputs are not fabricated and query action stays disabled', async () => {
  render(<ModelAssetsWorkspace {...props} />);
  await screen.findByText('1 / 2 objects mapped');
  fireEvent.click(screen.getByRole('button', { name: 'Outputs', exact: true }));
  await screen.findByText(/No reported outputs/);
  expect(screen.getByRole('button', { name: 'Show outputs on map' })).toBeDisabled();
});

test('changing category cancels an in-flight query and does not publish late results', async () => {
  render(<ModelAssetsWorkspace {...props} />);
  await screen.findByText('1 / 2 objects mapped');
  let resolve, signal;
  readAssetApi.mockImplementation((_path, opts) => { signal = opts.signal; return new Promise(done => { resolve = done; }); });
  fireEvent.click(screen.getByRole('button', { name: 'Inputs', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Show inputs on map' }));
  fireEvent.change(screen.getByLabelText('Model category'), { target: { value: 'Other' } });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ...scene, objects: [{ id: 'g', records: [{ Value: '99' }] }] }));
  expect(props.onFrame.mock.calls.at(-1)[0].maximum).toBe(0);
});

test('leaving a pending output catalogue restores usable input controls', async () => {
  let resolve;
  fetchAssetOutputsCatalog.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<ModelAssetsWorkspace {...props} />);
  await screen.findByText('1 / 2 objects mapped');
  fireEvent.click(screen.getByRole('button', { name: 'Outputs', exact: true }));
  await screen.findByText('Reading available outputs…');
  fireEvent.click(screen.getByRole('button', { name: 'Inputs', exact: true }));
  expect(screen.getByRole('button', { name: 'Show inputs on map' })).toBeEnabled();
  expect(screen.queryByText('Reading available outputs…')).not.toBeInTheDocument();
  await act(async () => resolve([]));
  expect(screen.getByRole('button', { name: 'Show inputs on map' })).toBeEnabled();
});

test('failed object detail does not continue to claim loading', async () => {
  readAssetApi.mockImplementation(path => path.includes('/detail?') ? Promise.reject(new Error('Model records unavailable')) : Promise.resolve(scene));
  render(<ModelAssetsWorkspace {...props} selectedId="g" />);
  await screen.findByText('Model records unavailable');
  expect(screen.queryByText('Loading model records…')).not.toBeInTheDocument();
});

test('linked input snapshots show context, values and exact source evidence', async () => {
  readAssetApi.mockImplementation(path => Promise.resolve(path.includes('/inputs?') ? {
    ...scene, resolution_contract: 'nohm.modelling.input-snapshot.v1',
    input_context: { inferred_year: 2050, available_years: [2050], available_scenarios: [] },
    objects: [{ id: 'g', records: [{ Value: '0', Data_x0020_File: 'Capacity' }], resolution: {
      status: 'resolved', value: 482, unit: 'MW', provenance: { kind: 'datafile', filename: 'capacity.csv',
        reference: 'Capacity', row: 2, column: 'G', calendar: { year: '2050' } } } }],
  } : path.includes('/detail?') ? { ...scene, collections: {} } : scene));
  const view = render(<ModelAssetsWorkspace {...props} />);
  await screen.findByText('1 / 2 objects mapped');
  fireEvent.change(screen.getByLabelText('Model category'), { target: { value: 'Native' } });
  fireEvent.click(screen.getByRole('button', { name: 'Inputs', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Show inputs on map' }));
  await screen.findByText(/1 objects with resolved input values/);
  expect(screen.getByText(/File year 2050/)).toBeInTheDocument();
  expect(props.onFrame.mock.calls.at(-1)[0].maximum).toBe(482);
  view.rerender(<ModelAssetsWorkspace {...props} selectedId="g" />);
  await screen.findByText('482 MW');
  expect(screen.getByText('capacity.csv')).toBeInTheDocument();
  expect(screen.getByText('Linked input source')).toBeInTheDocument();
});

test('ambiguous linked years remain unweighted until a specific year is selected', async () => {
  readAssetApi.mockImplementation(path => Promise.resolve(path.includes('/inputs?') ? {
    ...scene, resolution_contract: 'nohm.modelling.input-snapshot.v1',
    input_context: { available_years: [2030, 2050], available_scenarios: ['Future'] },
    objects: [{ id: 'g', resolution: { status: 'unresolved', value: null, note: 'Choose an input date.' } }],
  } : scene));
  render(<ModelAssetsWorkspace {...props} />);
  await screen.findByText('1 / 2 objects mapped');
  fireEvent.change(screen.getByLabelText('Model category'), { target: { value: 'Native' } });
  fireEvent.click(screen.getByRole('button', { name: 'Inputs', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Show inputs on map' }));
  await screen.findByLabelText('Linked file year');
  expect(props.onFrame.mock.calls.at(-1)[0].hasValues).toBe(false);
  expect(screen.getByRole('button', { name: 'Show inputs on map' })).toBeVisible();
  fireEvent.input(screen.getByLabelText('Input date'), { target: { value: '2030-01-01T00:00' } });
  expect(screen.getByLabelText('Input date')).toHaveValue('2030-01-01T00:00');
  fireEvent.change(screen.getByLabelText('Linked file year'), { target: { value: '2050' } });
  fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: 'Future' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show inputs on map' }));
  await waitFor(() => expect(readAssetApi.mock.calls.at(-1)[0]).toContain('input_date=2050-01-01T00%3A00'));
  expect(readAssetApi.mock.calls.at(-1)[0]).toContain('scenario=Future');
});

test('input batch progress is real, map commits atomically and cancellation rejects late data', async () => {
  const many = { ...scene, objects: Array.from({ length: 60 }, (_, index) => ({ ...scene.objects[0], id: `g${index}`, name: `G${index}` })) };
  let completeSecond;
  readAssetApi.mockImplementation(path => {
    if (!path.includes('/inputs?')) return Promise.resolve(many);
    const ids = JSON.parse(new URLSearchParams(path.split('?')[1]).get('object_ids'));
    const payload = { ...many, resolution_contract: 'nohm.modelling.input-snapshot.v1',
      objects: ids.map(id => ({ id, resolution: { status: 'resolved', value: 482, unit: 'MW' } })) };
    return ids.length === 50 ? Promise.resolve(payload) : new Promise(done => { completeSecond = () => done(payload); });
  });
  render(<ModelAssetsWorkspace {...props} />);
  await screen.findByText('60 / 60 objects mapped');
  fireEvent.click(screen.getByRole('button', { name: 'Inputs', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Show inputs on map' }));
  await screen.findByText('Resolving inputs · 50/60 objects · 0 unresolved');
  expect(props.onFrame.mock.calls.at(-1)[0].maximum).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel input loading' }));
  await act(async () => completeSecond());
  expect(props.onFrame.mock.calls.at(-1)[0].maximum).toBe(0);
  expect(screen.getByRole('button', { name: 'Show inputs on map' })).toBeEnabled();
});
