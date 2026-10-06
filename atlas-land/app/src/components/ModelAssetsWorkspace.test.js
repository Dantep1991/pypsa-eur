import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import ModelAssetsWorkspace from './ModelAssetsWorkspace';
import { readAssetApi, fetchAssetOutputsCatalog } from '../modelWorkspace/modelAssets';
import {createWorkspaceRegistry} from '../agentWorkspace/registry';
import {WorkspaceAgentProvider} from '../agentWorkspace/react';

jest.mock('../modelWorkspace/modelAssets', () => ({ ...jest.requireActual('../modelWorkspace/modelAssets'),
  readAssetApi: jest.fn(), fetchAssetOutputsCatalog: jest.fn() }));
const node = { id: 'n', name: 'A', class_name: 'Node', path: [], position: { lat: 50, lon: 4, source: 'model' } };
const scene = { project_id: 'P', model_version: 'v1', classes: [{ class_name: 'Generator', mapped: 1, total: 2 }],
  objects: [{ id: 'g', class_name: 'Generator', name: 'G', category: 'Native', properties: ['Capacity', 'Count'], nodes: [node] },
    { id: 'missing', name: 'Missing', class_name: 'Generator', category: 'Other', properties: [], nodes: [] }] };
let props;
const frame = () => props.onFrame.mock.calls.at(-1)[0];
const inputRequests = () => readAssetApi.mock.calls.filter(([path]) => path.includes('/inputs?'));
const settleEquation = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
const control=async(registry,action,values)=>{
  let done=false,failure,reply;
  act(()=>{registry.controllers.get('inputs').execute(action,values).then(value=>{reply=value;done=true;},error=>{failure=error;done=true;});});
  for(let i=0;!done&&i<100;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
  if(failure)throw failure;if(!done)throw new Error('Input control did not settle.');return reply;
};
beforeEach(() => {
  jest.clearAllMocks();
  props = { context: { projectId: 'P' }, modelVersion: 'v1', selectedId: '', onSelect: jest.fn(), onFrame: jest.fn(), onClose: jest.fn() };
  readAssetApi.mockImplementation(path => Promise.resolve(path.includes('/inputs?')
    ? { ...scene, objects: [{ id: 'g', records: [{ Value: path.includes('property_name=Count') ? '2' : '10', Units: path.includes('property_name=Count') ? '-' : 'MW' }] }] } : scene));
});
async function openInputs(native = false) {
  await screen.findByText(/1 \/ 2 objects mapped/);
  if (native) fireEvent.change(screen.getByLabelText('Model category'), { target: { value: 'Native' } });
  await waitFor(() => expect(frame().maximum).toBe(10));
}

test('Inputs is the only database view and values load on opening', async () => {
  render(<ModelAssetsWorkspace {...props} />);
  await openInputs();
  expect(screen.getByRole('heading', { name: 'Inputs', exact: true })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Objects', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Inputs', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Size by')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Outputs', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show selected data' })).not.toBeInTheDocument();
  expect(screen.queryByText('Mapping & source details')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Inspect object')).not.toBeInTheDocument();
  expect(fetchAssetOutputsCatalog).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Model category'), { target: { value: 'Native' } });
  await waitFor(() => expect(frame().markers).toHaveLength(1));
});

test('agent equation and date clearing update the actual map measurement',async()=>{
  const registry=createWorkspaceRegistry();registry.bind('P:v1',{});
  render(<WorkspaceAgentProvider value={registry}><ModelAssetsWorkspace {...props}/></WorkspaceAgentProvider>);
  await openInputs();
  await control(registry,'show',{category:'Native',expression:'[Capacity] / [Count]'});
  expect(frame().markers[0].objects[0].measurement.value).toBe(5);
  expect(registry.controllers.get('inputs').state).toMatchObject({equationMode:true,expression:'[Capacity] / [Count]',resolved:1});
  await control(registry,'show',{inputDate:'',property:'Count'});
  expect(screen.getByLabelText('Input date')).toHaveValue('');
  expect(frame().markers[0].objects[0].measurement.value).toBe(2);
});
test('agent rejects a category/property mismatch before mutating the selection',async()=>{
  const registry=createWorkspaceRegistry();registry.bind('P:v1',{});
  render(<WorkspaceAgentProvider value={registry}><ModelAssetsWorkspace {...props}/></WorkspaceAgentProvider>);
  await openInputs();const reads=inputRequests().length;
  await expect(control(registry,'show',{category:'Other',property:'Capacity'})).rejects.toThrow('not available');
  expect(screen.getByLabelText('Model category')).toHaveValue('');expect(inputRequests()).toHaveLength(reads);
});

test('inputs load automatically; changing properties refreshes the map and leaves selection open', async () => {
  render(<ModelAssetsWorkspace {...props} />); await openInputs();
  expect(screen.queryByRole('button', { name: 'Show inputs on map' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Data selection' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('Input property'), { target: { value: 'Count' } });
  await waitFor(() => expect(frame()).toMatchObject({ maximum: 2, label: 'Count' }));
  expect(screen.getByLabelText('Input property')).toBeVisible();
  expect(frame()).toMatchObject({ hasValues: true, measurementMode: true });
});

test('date and category selections retain the active input year', async () => {
  const onShow = jest.fn();
  render(<ModelAssetsWorkspace {...props} onShow={onShow} modelMeta={{ requestedYear: 2030 }} />); await openInputs(true);
  expect(screen.getByLabelText('Input date')).toHaveValue('2030-01-01T00:00');
  expect(inputRequests().at(-1)[0]).toContain('input_date=2030-01-01T00%3A00');
  expect(inputRequests().at(-1)[0]).toContain('category=Native');
  expect(onShow).toHaveBeenCalled();
  expect(frame().markers[0].objects[0].measurement).toMatchObject({ value: 10, unit: 'MW' });
});

test('attached scenario overrides, including zero, use the same input resolver as Map display', async () => {
  readAssetApi.mockImplementation(path => Promise.resolve(path.includes('/scenario-preview?') ? {
    schema: 'nohm.atlas.scenario-preview.v1', project_id: 'P', model_version: 'v1', model_name: 'Selected',
    input_date: '2030-01-01T00:00:00', changes: [{ object_id: 'Generator:G', property: 'Capacity',
      after: { status: 'resolved', value: 0, unit: 'MW' } }],
  } : path.includes('/inputs?') ? { ...scene, objects: [{ id: 'g', records: [{ Value: '10', Units: 'MW' }] }] } : scene));
  render(<ModelAssetsWorkspace {...props} modelMeta={{ requestedYear: 2030, modelName: 'Selected' }} />);
  await screen.findByText(/1 \/ 2 objects mapped/);
  await waitFor(() => expect(frame().hasValues).toBe(true));
  expect(frame().markers[0].objects[0].measurement.value).toBe(0);
  expect(screen.getByLabelText('Scenario')).toHaveValue('@model');
});

test('hiding and returning to the sidebar preserves values without re-reading files', async () => {
  const view = render(<ModelAssetsWorkspace {...props} modelMeta={{ selectedYear: 2030 }} />); await openInputs();
  const requests = readAssetApi.mock.calls.length;
  view.rerender(<ModelAssetsWorkspace {...props} modelMeta={{ selectedYear: 2030 }} visible={false} />);
  view.rerender(<ModelAssetsWorkspace {...props} modelMeta={{ selectedYear: 2030 }} visible />);
  expect(screen.getByLabelText('Input property')).toHaveValue('Capacity');
  expect(screen.getByLabelText('Input date')).toHaveValue('2030-01-01T00:00');
  expect(readAssetApi.mock.calls).toHaveLength(requests);
  expect(frame().maximum).toBe(10);
});

test('date, scenario and year precede object and property selectors, including the active year before file years load', async () => {
  render(<ModelAssetsWorkspace {...props} modelMeta={{ selectedYear: 2030 }} />); await openInputs();
  const card = screen.getByRole('region', { name: 'Data selection' });
  expect([...card.querySelectorAll('label')].map(label => label.firstChild.textContent)).toEqual([
    'Input date', 'Scenario', 'Input year', 'Object class', 'Model category', 'Input property',
  ]);
  expect(screen.getByLabelText('Input year')).toHaveValue('2030');
});

test('equation help is hidden until the question mark is clicked and closes with Escape', async () => {
  render(<ModelAssetsWorkspace {...props} />); await openInputs();
  const help = screen.getByRole('button', { name: 'About input equations' });
  const text = /Use \[properties\], numbers/;
  expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(help).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Equation', exact: true }));
  expect(screen.queryByText(text)).not.toBeInTheDocument();
  fireEvent.click(help);
  expect(screen.getByRole('note', { name: 'About input equations' })).toHaveTextContent('Incomplete totals stay unknown.');
  expect(help).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(help).toHaveFocus();
});

test('switching back from an equation restores the property measurement', async () => {
  render(<ModelAssetsWorkspace {...props} />); await openInputs();
  fireEvent.click(screen.getByRole('button', { name: 'Equation', exact: true }));
  fireEvent.change(screen.getByLabelText('Equation'), { target: { value: '[Capacity] * 2' } });
  await waitFor(() => expect(frame().maximum).toBe(20));
  fireEvent.click(screen.getByRole('button', { name: 'Property', exact: true }));
  await waitFor(() => expect(frame()).toMatchObject({ maximum: 10, hasValues: true, label: 'Capacity' }));
  expect(screen.getByLabelText('Input property')).toBeVisible();
});

test.each(['property', 'category', 'date', 'unmount', 'hide'])('changing %s aborts an old read; late values never paint', async change => {
  let complete, signal;
  readAssetApi.mockImplementation((path, options) => path.includes('/inputs?')
    ? new Promise(resolve => { if (!complete) { complete = resolve; signal = options.signal; } }) : Promise.resolve(scene));
  const view = render(<ModelAssetsWorkspace {...props} />); await screen.findByText(/1 \/ 2 objects mapped/);
  await waitFor(() => expect(complete).toBeDefined());
  if (change === 'property') fireEvent.change(screen.getByLabelText('Input property'), { target: { value: 'Count' } });
  if (change === 'category') fireEvent.change(screen.getByLabelText('Model category'), { target: { value: 'Other' } });
  if (change === 'date') fireEvent.change(screen.getByLabelText('Input date'), { target: { value: '2050-01-01T00:00' } });
  if (change === 'unmount') view.unmount();
  if (change === 'hide') view.rerender(<ModelAssetsWorkspace {...props} visible={false} />);
  expect(signal.aborted).toBe(true);
  await act(async () => complete({ ...scene, objects: [{ id: 'g', records: [{ Value: '900', Units: 'MW' }] }] }));
  expect(frame()?.maximum || 0).toBe(0);
});

test('real batch progress and cancellation do not publish a partial snapshot', async () => {
  const many = { ...scene, objects: Array.from({ length: 60 }, (_, index) => ({ ...scene.objects[0], id: `g${index}`, name: `G${index}` })) };
  let completeSecond;
  readAssetApi.mockImplementation(path => {
    if (!path.includes('/inputs?')) return Promise.resolve(many);
    const ids = JSON.parse(new URLSearchParams(path.split('?')[1]).get('object_ids'));
    const payload = { ...many, resolution_contract: 'nohm.modelling.input-snapshot.v1',
      objects: ids.map(id => ({ id, resolution: { status: 'resolved', value: 482, unit: 'MW' } })) };
    return ids.length === 50 ? Promise.resolve(payload) : new Promise(resolve => { completeSecond = () => resolve(payload); });
  });
  render(<ModelAssetsWorkspace {...props} />); await screen.findByText(/60 \/ 60 objects mapped/);
  await screen.findByText('Resolving Capacity · 50/60 values · 0 unresolved');
  expect(frame().maximum).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel input loading' }));
  await act(async () => completeSecond());
  expect(frame().maximum).toBe(0);
  expect(screen.getByRole('button', { name: 'Retry input loading' })).toBeVisible();
});

test('available linked-file years allow a direct retry and tooltip measurements retain provenance', async () => {
  readAssetApi.mockImplementation(path => Promise.resolve(path.includes('/inputs?') ? {
    ...scene, resolution_contract: 'nohm.modelling.input-snapshot.v1', input_context: { available_years: [2050] },
    objects: [{ id: 'g', resolution: path.includes('2050-') ? { status: 'resolved', value: 482, unit: 'MW', provenance: { kind: 'datafile', filename: 'capacity.csv' } }
      : { status: 'unresolved', value: null, note: 'No observation matches the input date.' } }],
  } : scene));
  render(<ModelAssetsWorkspace {...props} modelMeta={{ selectedYear: 2030 }} />);
  await screen.findByText(/1 \/ 2 objects mapped/);
  fireEvent.change(screen.getByLabelText('Model category'), { target: { value: 'Native' } });
  await screen.findByText(/No input values at 2030/);
  fireEvent.click(screen.getByRole('button', { name: 'Use 2050 inputs' }));
  await waitFor(() => expect(frame().maximum).toBe(482));
  expect(frame().markers[0].objects[0].measurement.provenance.filename).toBe('capacity.csv');
  expect(screen.getByLabelText('Input year')).toHaveValue('2050');
});

test('date and scenario changes update inputs automatically and keep scenario/year choices visible', async () => {
  readAssetApi.mockImplementation(path => Promise.resolve(path.includes('/inputs?') ? {
    ...scene, resolution_contract: 'nohm.modelling.input-snapshot.v1', input_context: { available_years: [2030, 2050], available_scenarios: ['Future'] },
    objects: [{ id: 'g', resolution: { status: 'resolved', value: path.includes('scenario=Future') ? 200 : 10, unit: 'MW' } }],
  } : scene));
  render(<ModelAssetsWorkspace {...props} />); await openInputs(true);
  fireEvent.change(screen.getByLabelText('Input year'), { target: { value: '2050' } });
  fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: 'Future' } });
  await waitFor(() => expect(frame().maximum).toBe(200));
  expect(inputRequests().at(-1)[0]).toContain('input_date=2050-01-01T00%3A00');
  expect(screen.getByLabelText('Scenario')).toHaveValue('Future');
});

test('equations combine resolved properties; edits reuse cached operands without additional reads', async () => {
  render(<ModelAssetsWorkspace {...props} />); await openInputs(true);
  fireEvent.click(screen.getByRole('button', { name: 'Equation', exact: true }));
  fireEvent.change(screen.getByLabelText('Equation'), { target: { value: '([Capacity] + 10) * [Count] / 2' } });
  await waitFor(() => expect(frame()).toMatchObject({ maximum: 20, label: '([Capacity] + 10) * [Count] / 2' }));
  expect(frame().markers[0].objects[0].measurement).toMatchObject({ value: 20, unit: 'MW', operands: [{ property: 'Capacity', value: 10 }, { property: 'Count', value: 2 }] });
  const requests = inputRequests().length;
  fireEvent.change(screen.getByLabelText('Equation'), { target: { value: '[Capacity] * [Count] * 3' } });
  await waitFor(() => expect(frame().maximum).toBe(60));
  expect(inputRequests()).toHaveLength(requests);
  expect(screen.getByLabelText('Input property')).toBeVisible();
});

test('percent-of-total operator maps percentages over the selected object scope', async () => {
  render(<ModelAssetsWorkspace {...props} />); await openInputs(true);
  fireEvent.click(screen.getByRole('button', { name: 'Equation', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Percent of total' }));
  await waitFor(() => expect(frame().maximum).toBe(100));
  expect(screen.getByLabelText('Equation')).toHaveValue('percent([Capacity])');
  expect(frame().markers[0].objects[0].measurement.unit).toBe('%');
});

test('invalid syntax clears the map measurements and does not fetch or execute code', async () => {
  render(<ModelAssetsWorkspace {...props} />); await openInputs(true);
  fireEvent.click(screen.getByRole('button', { name: 'Equation', exact: true }));
  fireEvent.change(screen.getByLabelText('Equation'), { target: { value: 'window.alert(1)' } });
  const requests = inputRequests().length; await settleEquation();
  expect(screen.getByRole('alert')).toBeVisible();
  expect(frame()).toMatchObject({ maximum: 0, hasValues: false, measurementMode: true });
  expect(inputRequests()).toHaveLength(requests);
});

test('model/project provenance mismatches remain visible and never paint values', async () => {
  readAssetApi.mockImplementation(path => Promise.resolve(path.includes('/inputs?') ? { ...scene, model_version: 'v2', objects: [] } : scene));
  render(<ModelAssetsWorkspace {...props} />); await screen.findByText(/1 \/ 2 objects mapped/);
  expect(await screen.findByRole('alert')).toHaveTextContent('another project or version');
  expect(frame().maximum).toBe(0);
});
