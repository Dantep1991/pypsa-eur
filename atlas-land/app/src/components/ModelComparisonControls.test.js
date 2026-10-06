import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelComparisonControls from './ModelComparisonControls';
import { fetchModelResultScene, fetchModelResultCatalog, MODEL_RESULT_SCENE_SCHEMA } from '../modelWorkspace/resultScene';
import { fetchModelScene } from '../modelWorkspace/modelScene';
jest.mock('../modelWorkspace/modelScene', () => ({ fetchModelScene: jest.fn() }));
jest.mock('../modelWorkspace/resultScene', () => ({ ...jest.requireActual('../modelWorkspace/resultScene'),
  fetchModelResultScene: jest.fn(), fetchModelResultCatalog: jest.fn() }));

const q = { id: 'Node.Price', class_name: 'Node', property_name: 'Price', unit: 'EUR/MWh', periods: ['2050'] };
const catalogStatus = { state: 'ready', catalog: { runs: ['base', 'candidate'].map(id => ({
  run_id: id, label: id, compatible: true, result_model_version: 'v1', quantities: [q] })) } };
const props = { catalogStatus, context: { mode: 'model', projectId: 'Example' }, modelVersion: 'v1' };
beforeEach(() => {
  jest.resetAllMocks();
  fetchModelResultScene.mockImplementation(async (context, selection) => ({ schema: MODEL_RESULT_SCENE_SCHEMA,
    project_id: context.projectId, model_version: 'v1', run: { run_id: selection.runId, label: selection.runId },
    selection: { class_name: selection.className, property_name: selection.propertyName, map_target: 'node', map_mode: selection.mapMode, period: selection.period, category: selection.category },
    legend: { unit: selection.unit }, values: [{ entity_id: 'Node:A', value: selection.runId === 'base' ? 40 : 30, unit: selection.unit }] }));
  fetchModelScene.mockResolvedValue({ facilities: [{ id: 'Node:A', latitude: 50, longitude: 8 }], connections: [] });
  window.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ preference: 'decrease', reason: 'Lower is favourable', cached: true }) }));
});
test('automatically compares two solutions and recolours with user override without querying again', async () => {
  const onScene = jest.fn(); render(<ModelComparisonControls {...props} onScene={onScene} onClear={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'Compare on map' })).toBeNull();
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  expect(onScene.mock.calls[0][0].values[0]).toMatchObject({ value: -10, comparison_color: '#22c55e' });
  expect(window.fetch.mock.calls[0][0]).toContain('/api/atlas/projects/Example/comparison-policy');
  fireEvent.change(screen.getByRole('combobox', { name: 'Favourable change' }), { target: { value: 'increase' } });
  expect(onScene.mock.calls[1][0].values[0].comparison_color).toBe('#ef4444');
  expect(fetchModelResultScene).toHaveBeenCalledTimes(2);
});
test('unavailable decision service keeps a valid delta neutral and allows override', async () => {
  window.fetch.mockRejectedValue(new Error('Unavailable'));
  const onScene = jest.fn(); render(<ModelComparisonControls {...props} onScene={onScene} onClear={jest.fn()} />);
  await waitFor(() => expect(onScene).toHaveBeenCalled());
  expect(onScene.mock.calls[0][0].values[0].comparison_color).toBe('#a3a3a3');
  expect(screen.getByText(/Decision service unavailable/)).toBeVisible();
});

test('a previously cached advisory uses the new AI display label', async () => {
  window.fetch.mockResolvedValue({ ok: true, json: async () => ({ preference: 'decrease', reason: 'Jev suggests lower prices.', cached: true }) });
  render(<ModelComparisonControls {...props} onScene={jest.fn()} />);
  await screen.findByText('AI suggests lower prices. Cached.');
  expect(screen.queryByText(/Jev suggests/)).toBeNull();
});
test('identical solution selection is not automatically compared', async () => {
  render(<ModelComparisonControls {...props} onScene={jest.fn()} onClear={jest.fn()} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Candidate solution' }), { target: { value: 'base' } });
  expect(screen.getByText('Choose two different solutions to compare.')).toBeVisible();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(fetchModelResultScene).not.toHaveBeenCalled();
});

test('switching from a manual choice to AI requests a new advisory without requerying result data', async () => {
  const onScene = jest.fn(); render(<ModelComparisonControls {...props} onScene={onScene} onClear={jest.fn()} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Favourable change' }), { target: { value: 'increase' } });
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  expect(window.fetch).not.toHaveBeenCalled();
  await screen.findByText('Your convention: increases are favourable.');
  fireEvent.change(screen.getByRole('combobox', { name: 'Favourable change' }), { target: { value: 'auto' } });
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(2));
  expect(window.fetch).toHaveBeenCalledTimes(1); expect(fetchModelResultScene).toHaveBeenCalledTimes(2);
  expect(onScene.mock.calls[1][0].values[0].comparison_color).toBe('#22c55e');
});

test('all common physical quantities are available and non-line classes use circles', () => {
  const extra = [{ id: 'Line.Flow', class_name: 'Line', property_name: 'Flow', supports_flow_map: true, unit: 'GWh', periods: ['2050'] },
    { id: 'Emission.Production', class_name: 'Emission', property_name: 'Production', unit: 't', periods: ['2050'] },
    { id: 'Generator.Generation', class_name: 'Generator', property_name: 'Generation', unit: 'GWh', periods: ['2050'] }];
  render(<ModelComparisonControls {...props} catalogStatus={{ ...catalogStatus, catalog: { runs: catalogStatus.catalog.runs.map(run => ({ ...run, quantities: [q, ...extra] })) } }} onScene={jest.fn()} />);
  const component = screen.getByRole('combobox', { name: 'Comparison component' });
  expect([...component.options].map(option => option.value)).toEqual(['', 'Emission', 'Generator', 'Line', 'Node']);
  fireEvent.change(component, { target: { value: 'Generator' } });
  expect(screen.getByRole('combobox', { name: 'Comparison map style' }).value).toBe('bubbles');
  fireEvent.change(component, { target: { value: 'Line' } });
  expect(screen.getByRole('combobox', { name: 'Comparison map style' }).value).toBe('flow');
});

test('AI label and shared circle size control appear beside bubble style, not line style', () => {
  const onMarkerScaleChange = jest.fn();
  const line = { id: 'Line.Flow', class_name: 'Line', property_name: 'Flow', supports_flow_map: true, unit: 'GWh', periods: ['2050'] };
  render(<ModelComparisonControls {...props} markerScale={1.4} onMarkerScaleChange={onMarkerScaleChange}
    catalogStatus={{ ...catalogStatus, catalog: { runs: catalogStatus.catalog.runs.map(run => ({ ...run, quantities: [q, line] })) } }} />);
  expect(screen.getByRole('option', { name: 'AI recommendation' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Jev recommendation' })).toBeNull();
  expect(screen.getByLabelText('Circle size')).toHaveValue('140');
  fireEvent.change(screen.getByLabelText('Circle size'), { target: { value: '170' } });
  expect(onMarkerScaleChange).toHaveBeenCalledWith(1.7);
  fireEvent.change(screen.getByRole('combobox', { name: 'Comparison component' }), { target: { value: 'Line' } });
  expect(screen.queryByLabelText('Circle size')).toBeNull();
});

test('waits for the catalog to be ready, then compares without a click', async () => {
  const onScene = jest.fn();
  const { rerender } = render(<ModelComparisonControls {...props} catalogStatus={{ ...catalogStatus, state: 'loading' }} onScene={onScene} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(fetchModelResultScene).not.toHaveBeenCalled();
  rerender(<ModelComparisonControls {...props} onScene={onScene} />);
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
});

test('quantity, period, category, map style and objective changes automatically update the map', async () => {
  const onScene = jest.fn();
  const quantities = [q, { ...q, id: 'Node.Demand', property_name: 'Demand', periods: ['2050', '2040'], categories: ['Market'] }];
  const status = { ...catalogStatus, catalog: { runs: catalogStatus.catalog.runs.map(run => ({ ...run, quantities })) } };
  render(<ModelComparisonControls {...props} catalogStatus={status} onScene={onScene} />);
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  for (const [label, value] of [['Comparison quantity', 'Node.Demand'], ['Comparison period', '2040'],
    ['Comparison category', 'Market'], ['Comparison map style', 'colour'], ['Comparison objective', 'Lower demand']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const count = label === 'Comparison quantity' ? 2 : label === 'Comparison period' ? 3 : label === 'Comparison category' ? 4 : label === 'Comparison map style' ? 5 : 6;
    await waitFor(() => expect(onScene).toHaveBeenCalledTimes(count));
  }
  expect(onScene.mock.calls[5][0].selection).toMatchObject({ property_name: 'Demand', period: '2040', category: 'Market', map_mode: 'colour' });
  expect(JSON.parse(window.fetch.mock.calls[5][1].body).objective).toBe('Lower demand');
});

test('quick selection changes are coalesced and ordinary rerenders do not requery', async () => {
  const onScene = jest.fn();
  const many = { ...catalogStatus, catalog: { runs: [...catalogStatus.catalog.runs,
    { ...catalogStatus.catalog.runs[1], run_id: 'third', label: 'third' }] } };
  const { rerender } = render(<ModelComparisonControls {...props} catalogStatus={many} onScene={onScene} markerScale={1} />);
  fireEvent.change(screen.getByLabelText('Candidate solution'), { target: { value: 'third' } });
  fireEvent.change(screen.getByLabelText('Candidate solution'), { target: { value: 'candidate' } });
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  rerender(<ModelComparisonControls {...props} catalogStatus={many} onScene={scene => onScene(scene)} markerScale={1.8} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(fetchModelResultScene).toHaveBeenCalledTimes(2);
});

test('changing the solution cancels stale queries even if a reader ignores abort', async () => {
  const onScene = jest.fn();
  const reader = fetchModelResultScene.getMockImplementation();
  let resolveOld;
  fetchModelResultScene.mockImplementationOnce((...args) => new Promise(resolve => { resolveOld = () => resolve(reader(...args)); }));
  const many = { ...catalogStatus, catalog: { runs: [...catalogStatus.catalog.runs,
    { ...catalogStatus.catalog.runs[1], run_id: 'third', label: 'third' }] } };
  render(<ModelComparisonControls {...props} catalogStatus={many} onScene={onScene} />);
  await waitFor(() => expect(fetchModelResultScene).toHaveBeenCalledTimes(1));
  const oldSignal = fetchModelResultScene.mock.calls[0][2].signal;
  expect(screen.getByLabelText('Candidate solution')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Candidate solution'), { target: { value: 'third' } });
  expect(oldSignal.aborted).toBe(true);
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  await act(async () => resolveOld());
  expect(onScene).toHaveBeenCalledTimes(1);
  expect(onScene.mock.calls[0][0].comparison.candidate.run_id).toBe('third');
  expect(fetchModelResultScene).toHaveBeenCalledTimes(3);
});

test('clear pauses the current selection until a setting changes', async () => {
  const onScene = jest.fn(), onClear = jest.fn();
  render(<ModelComparisonControls {...props} onScene={onScene} onClear={onClear} />);
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Clear comparison' }));
  expect(onClear).toHaveBeenCalledTimes(1);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(onScene).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Comparison map style'), { target: { value: 'colour' } });
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(2));
});

test('clear can stop a query without allowing its late result to repopulate the map', async () => {
  const onScene = jest.fn(), onClear = jest.fn(), reader = fetchModelResultScene.getMockImplementation();
  let resolveOld;
  fetchModelResultScene.mockImplementationOnce((...args) => new Promise(resolve => { resolveOld = () => resolve(reader(...args)); }));
  render(<ModelComparisonControls {...props} onScene={onScene} onClear={onClear} />);
  await waitFor(() => expect(fetchModelResultScene).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Clear comparison' }));
  await act(async () => resolveOld());
  expect(onScene).not.toHaveBeenCalled();
  expect(onClear).toHaveBeenCalledTimes(1);
});

test('cancel pauses automatic work and retry starts one fresh comparison', async () => {
  const onScene = jest.fn();
  fetchModelResultScene.mockImplementationOnce(() => new Promise(() => {}));
  render(<ModelComparisonControls {...props} onScene={onScene} />);
  await waitFor(() => expect(fetchModelResultScene).toHaveBeenCalledTimes(1));
  const signal = fetchModelResultScene.mock.calls[0][2].signal;
  fireEvent.click(screen.getByRole('button', { name: 'Cancel comparison' }));
  expect(signal.aborted).toBe(true);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(fetchModelResultScene).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }));
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  expect(fetchModelResultScene).toHaveBeenCalledTimes(3);
});

test('errors retain the previous map and do not enter an automatic retry loop', async () => {
  fetchModelResultScene.mockRejectedValueOnce(new Error('Result reader unavailable'));
  const onScene = jest.fn();
  render(<ModelComparisonControls {...props} onScene={onScene} />);
  await screen.findByText('Result reader unavailable');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(fetchModelResultScene).toHaveBeenCalledTimes(1);
  expect(onScene).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry comparison' }));
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
});

test.each(['period', 'unit'])('no automatic query is made when common %s is missing', async mismatch => {
  const candidateQuantity = { ...q, ...(mismatch === 'period' ? { periods: ['2040'] } : { unit: 'USD/MWh' }) };
  const status = { ...catalogStatus, catalog: { runs: [catalogStatus.catalog.runs[0],
    { ...catalogStatus.catalog.runs[1], quantities: [candidateQuantity] }] } };
  render(<ModelComparisonControls {...props} catalogStatus={status} onScene={jest.fn()} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(fetchModelResultScene).not.toHaveBeenCalled();
});

test('unmount and project changes cancel pending reads without publishing stale results', async () => {
  fetchModelResultScene.mockImplementation(() => new Promise(() => {}));
  const onScene = jest.fn();
  const { rerender, unmount } = render(<ModelComparisonControls {...props} onScene={onScene} />);
  await waitFor(() => expect(fetchModelResultScene).toHaveBeenCalledTimes(1));
  const firstSignal = fetchModelResultScene.mock.calls[0][2].signal;
  rerender(<ModelComparisonControls {...props} context={{ mode: 'model', projectId: 'Other' }}
    catalogStatus={{ ...catalogStatus, catalog: { ...catalogStatus.catalog, project_id: 'Example' } }} onScene={onScene} />);
  expect(firstSignal.aborted).toBe(true);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(fetchModelResultScene).toHaveBeenCalledTimes(1);
  rerender(<ModelComparisonControls {...props} onScene={onScene} />);
  await waitFor(() => expect(fetchModelResultScene).toHaveBeenCalledTimes(2));
  const secondSignal = fetchModelResultScene.mock.calls[1][2].signal;
  unmount();
  expect(secondSignal.aborted).toBe(true);
  expect(onScene).not.toHaveBeenCalled();
});

test('loading another project automatically compares its solution after topology validation', async () => {
  const onScene = jest.fn();
  fetchModelResultCatalog.mockResolvedValue({ project_id: 'Other', runs: [{ ...catalogStatus.catalog.runs[1], run_id: 'external', label: 'external' }] });
  render(<ModelComparisonControls {...props} onScene={onScene} />);
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Project ID'), { target: { value: 'Other' } });
  fireEvent.change(screen.getByLabelText('Model version'), { target: { value: 'v1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Load comparison solutions' }));
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(2));
  expect(fetchModelScene).toHaveBeenCalledTimes(2);
  expect(onScene.mock.calls[1][0].comparison.candidate_project).toBe('Other');
});

test('cancelling an external catalogue restores usable controls without automatically requerying the old pair', async () => {
  const onScene = jest.fn();
  fetchModelResultCatalog.mockImplementation(() => new Promise(() => {}));
  render(<ModelComparisonControls {...props} onScene={onScene} />);
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Load comparison solutions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel comparison' }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(screen.getByLabelText('Candidate solution')).toBeEnabled();
  expect(fetchModelResultScene).toHaveBeenCalledTimes(2);
});
