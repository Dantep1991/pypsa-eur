import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelComparisonControls from './ModelComparisonControls';
import { fetchModelResultScene, MODEL_RESULT_SCENE_SCHEMA } from '../modelWorkspace/resultScene';
jest.mock('../modelWorkspace/resultScene', () => ({ ...jest.requireActual('../modelWorkspace/resultScene'),
  fetchModelResultScene: jest.fn(), fetchModelResultCatalog: jest.fn() }));

const q = { id: 'Node.Price', class_name: 'Node', property_name: 'Price', unit: 'EUR/MWh', periods: ['2050'] };
const catalogStatus = { state: 'ready', catalog: { runs: ['base', 'candidate'].map(id => ({
  run_id: id, label: id, compatible: true, result_model_version: 'v1', quantities: [q] })) } };
const props = { catalogStatus, context: { mode: 'model', projectId: 'Example' }, modelVersion: 'v1' };
beforeEach(() => {
  jest.clearAllMocks();
  fetchModelResultScene.mockImplementation(async (context, selection) => ({ schema: MODEL_RESULT_SCENE_SCHEMA,
    project_id: context.projectId, model_version: 'v1', run: { run_id: selection.runId, label: selection.runId },
    selection: { class_name: 'Node', property_name: 'Price', map_target: 'node', map_mode: 'bubbles', period: '2050' },
    legend: { unit: 'EUR/MWh' }, values: [{ entity_id: 'Node:A', value: selection.runId === 'base' ? 40 : 30, unit: 'EUR/MWh' }] }));
  window.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ preference: 'decrease', reason: 'Lower is favourable', cached: true }) }));
});
test('compares two solutions and recolours with user override without querying again', async () => {
  const onScene = jest.fn(); render(<ModelComparisonControls {...props} onScene={onScene} onClear={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Compare on map' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Compare on map' }));
  await waitFor(() => expect(onScene).toHaveBeenCalled());
  expect(onScene.mock.calls[0][0].values[0].comparison_color).toBe('#a3a3a3');
  expect(screen.getByText(/Decision service unavailable/)).toBeVisible();
});
test('identical solution selection is disabled', () => {
  render(<ModelComparisonControls {...props} onScene={jest.fn()} onClear={jest.fn()} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Candidate solution' }), { target: { value: 'base' } });
  expect(screen.getByRole('button', { name: 'Compare on map' })).toBeDisabled();
});

test('switching from a manual choice to Jev requests a new advisory without requerying result data', async () => {
  const onScene = jest.fn(); render(<ModelComparisonControls {...props} onScene={onScene} onClear={jest.fn()} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Favourable change' }), { target: { value: 'increase' } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare on map' }));
  await waitFor(() => expect(onScene).toHaveBeenCalledTimes(1));
  expect(window.fetch).not.toHaveBeenCalled();
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
