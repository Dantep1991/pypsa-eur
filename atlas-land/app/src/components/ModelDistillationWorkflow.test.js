import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import ModelDistillationWorkflow from './ModelDistillationWorkflow';

afterEach(() => { cleanup(); localStorage.clear(); });

test('successful job polling clears a transient transport failure, retaining the actual preview error', async () => {
  jest.useFakeTimers();
  const context = { projectId: 'P', version: 'v1' };
  localStorage.setItem('nohm.atlas.distillation:P:v1', 'saved');
  const saved = { job_id: 'saved', state: 'preparing', phase: 'Checking inputs', completed_steps: 1,
    total_steps: 6, name: 'Country subset', selection: { countries: ['DE'], carriers: [] }, boundary_policy: 'parent_exchanges' };
  let polls = 0;
  const request = jest.fn(async (_, action) => {
    if (action.startsWith('options')) return { countries: [{ id: 'DE', label: 'Germany' }], carriers: [], parent_runs: [] };
    polls += 1;
    if (polls === 2) throw new Error('Distillation service returned an unreadable response (500).');
    return polls === 1 ? saved : { ...saved, state: 'failed', phase: 'Preview failed', error: 'Exact boundary data is missing.' };
  });
  try {
    await act(async () => { render(<ModelDistillationWorkflow context={context} request={request} />); });
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(screen.getByText(/unreadable response/)).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(screen.queryByText(/unreadable response/)).toBeNull();
    expect(screen.getByText('Exact boundary data is missing.')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

test('switching an open country subset to carrier-only never submits its hidden boundary policy', async () => {
  const request = jest.fn(async (context, action) => action.startsWith('options') ? {
    countries: [{ id: 'DE', label: 'Germany' }], carriers: [{ id: 'electricity', label: 'Electricity' }],
    parent_runs: [{ selection_id: 'run-1', label: 'Native solution', can_preserve_exchanges: true }],
  } : { job_id: 'test', state: 'preview_ready', can_create: true });
  render(<ModelDistillationWorkflow context={{ projectId: 'P', version: 'v1' }} request={request} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Countries' }).disabled).toBe(false));
  fireEvent.change(screen.getByRole('combobox', { name: 'Countries' }), { target: { value: 'DE' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Country boundary' }), { target: { value: 'parent_exchanges' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Parent solution' }), { target: { value: 'run-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove Countries DE' }));
  expect(screen.queryByRole('combobox', { name: 'Country boundary' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Carriers' }), { target: { value: 'electricity' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview subset' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.anything(), 'preview', {
    version: 'v1', countries: [], carriers: ['electricity'], name: '', parent_run_id: 'run-1', boundary_policy: '', gap_policy: 'strict',
  }));
});

test('AI missing-hour repair is explicit and submitted with a preserved country subset', async () => {
  const request = jest.fn(async (_, action) => action.startsWith('options') ? {
    countries: [{ id: 'ES', label: 'Spain' }], carriers: [],
    parent_runs: [{ selection_id: 'run-1', label: 'Native solution', can_preserve_exchanges: true }],
  } : { job_id: 'test', state: 'preview_ready', can_create: true, phase: 'Preview ready',
    summary: { objects_before: 100, objects_after: 20, restored_input_objects: 5, restored_dependencies: 3,
      boundary_exchanges_preserved: 2, estimated_boundary_hours: 24 }, boundary_repair: { hours: 8760 } });
  render(<ModelDistillationWorkflow context={{ projectId: 'P', version: 'v1' }} request={request} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Countries' }).disabled).toBe(false));
  fireEvent.change(screen.getByRole('combobox', { name: 'Countries' }), { target: { value: 'ES' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Country boundary' }), { target: { value: 'parent_exchanges' } });
  expect(screen.getByRole('combobox', { name: 'Missing hours' }).value).toBe('ai_estimate');
  expect(document.querySelectorAll('.distillation-workflow label small')).toHaveLength(0);
  expect(screen.queryByText(/Save a smaller model|Leave one filter empty|AI may repeat|Missing hours are handled|Keep the selected solution/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Parent solution' }), { target: { value: 'run-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview subset' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.anything(), 'preview', expect.objectContaining({
    countries: ['ES'], boundary_policy: 'parent_exchanges', gap_policy: 'ai_estimate',
  })));
  expect(await screen.findByText('AI-estimated hours')).toBeTruthy();
  expect(screen.getByText('24 · previous day')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create subset model' }).disabled).toBe(false);
  expect(screen.queryByText(/No model has been created yet/)).not.toBeInTheDocument();
});

test.each(['transport', 'model checks'])('map and model validation remain independent when %s fails', async failure => {
  const onPreviewMap = jest.fn(() => failure === 'transport' ? Promise.reject(new Error('Map unavailable')) : Promise.resolve());
  const request = jest.fn(async (_, action) => {
    if (action.startsWith('options')) return { countries: [{ id: 'ES', label: 'Spain' }], carriers: [], parent_runs: [] };
    if (failure === 'model checks') throw new Error('Parent boundary could not be verified');
    return { job_id: 'job', state: 'preview_ready', can_create: true, phase: 'Preview ready' };
  });
  render(<ModelDistillationWorkflow context={{ projectId: 'P', version: 'v1' }} request={request} onPreviewMap={onPreviewMap} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Countries' }).disabled).toBe(false));
  fireEvent.change(screen.getByRole('combobox', { name: 'Countries' }), { target: { value: 'ES' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Country boundary' }), { target: { value: 'closed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview subset' }));
  await waitFor(() => expect(onPreviewMap).toHaveBeenCalledWith({ countries: ['ES'], carriers: [], boundaryPolicy: 'closed' }));
  if (failure === 'transport') expect(await screen.findByRole('button', { name: 'Create subset model' })).toBeTruthy();
  else expect(await screen.findByRole('alert')).toHaveTextContent('Parent boundary could not be verified');
  expect(request).toHaveBeenCalledWith(expect.anything(), 'preview', expect.objectContaining({ countries: ['ES'] }));
});
