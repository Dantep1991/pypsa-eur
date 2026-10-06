import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelExecutionControls from './ModelExecutionControls';

const context = { projectId: 'PublishedChild', version: 'v1_suture' };
const options = { models: ['2030', '2050'], source_digest: 'abc', engines: [
  { id: 'plexos', label: 'PLEXOS', available: true }, { id: 'pypsa', label: 'PyPSA', available: true }], jobs: [] };

test('choose exact child model before launch and offer both engines', async () => {
  const request = jest.fn(async (_, endpoint) => endpoint.startsWith('options') ? options : { job_id: 'run', state: 'completed', phase: 'PyPSA · solved' });
  render(<ModelExecutionControls context={context} request={request} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Run model target' })).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Run PLEXOS' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Run model target' }), { target: { value: '2050' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Solver' }), { target: { value: 'pypsa' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run PyPSA' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(context, 'start', {
    version: 'v1_suture', source_digest: 'abc', model_name: '2050', engine: 'pypsa', confirm: true, repair: false }));
  expect(await screen.findByText('PyPSA · solved')).toBeTruthy();
});

test('repair requires a reviewed plan and changes only to its new saved version', async () => {
  const request = jest.fn(async (_, endpoint) => endpoint.startsWith('options') ? { ...options, models: ['2050'] }
    : endpoint.endsWith('/apply') ? { job_id: 'repair', state: 'repaired', phase: 'Repair saved', repaired_version: 'v2_repair' }
      : { job_id: 'repair', state: 'repair_ready', phase: 'Review repairs', source_digest: 'abc', repair_actions: [
        { owner_class: 'Generator', owner_object: 'G', rationale: 'Restore verified membership' }] });
  render(<ModelExecutionControls context={context} request={request} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Repair model' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Repair model' }));
  expect(await screen.findByText(/Restore verified membership/)).toBeTruthy();
  expect(request).not.toHaveBeenCalledWith(expect.anything(), 'jobs/repair/apply', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'Apply repairs to a new version' }));
  expect(await screen.findByRole('button', { name: 'Use repaired version' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Use repaired version' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith({ projectId: 'PublishedChild', version: 'v2_repair' }, 'options?version=v2_repair'));
});

test('late child response cannot attach to another newly published model', async () => {
  let finish;
  const request = jest.fn(context => context.projectId === 'PublishedChild' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(options));
  const view = render(<ModelExecutionControls context={context} request={request} />);
  view.rerender(<ModelExecutionControls context={{ ...context, projectId: 'OtherChild' }} request={request} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Run model target' })).toBeEnabled());
  await act(async () => finish({ ...options, models: ['Wrong parent model'] }));
  expect(screen.queryByRole('option', { name: 'Wrong parent model' })).toBeNull();
});

test('saved native workflow restores target and shows named stages, not array indices', async () => {
  const request = jest.fn(async () => ({ ...options, jobs: [{ model_name: '2050', state: 'failed', phase: 'PLEXOS · failed',
    native_run: { workflow: { stages: [{ stage: 'validate', status: 'completed' }, { stage: 'run', status: 'failed' }] } } }] }));
  render(<ModelExecutionControls context={context} request={request} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Run model target' })).toHaveValue('2050'));
  expect(screen.getByText('validate: completed')).toBeTruthy();
  expect(screen.getByText('run: failed')).toBeTruthy();
});
