import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import ModelMixedModelCreation, { mixedModelRequest } from './ModelMixedModelCreation';

const context = { projectId: 'Joule_Model', version: 'V1.0.0' };
const profile = { focusCountry: 'ES', resolutions: ['native', 'country', 'country'] };
beforeEach(() => window.localStorage.clear());

test('shows immediate progress while the initial preview request is pending', async () => {
  let resolve;
  const request = jest.fn(() => new Promise(value => { resolve = value; }));
  const view = render(<ModelMixedModelCreation context={context} profile={profile} current request={request} />);
  fireEvent.click(view.getByRole('button', { name: 'Preview model schema' }));
  expect(view.getByRole('status')).toHaveTextContent('Starting schema preview');
  expect(view.getByRole('button', { name: 'Preview model schema' })).toBeDisabled();
  await act(async () => resolve({ job_id: 'new', state: 'preview_ready', phase: 'Ready', can_create: true }));
  expect(view.getByRole('status')).toHaveTextContent('Ready');
});

test('creation requires an applied mixed view and a reviewed preview', async () => {
  const request = jest.fn(async (_, endpoint) => endpoint === 'preview'
    ? { job_id: 'job', state: 'preview_ready', phase: 'Validated', can_create: true, source_digest: 'digest' }
    : { job_id: 'job', state: 'created', phase: 'Created', model_url: '/model' });
  const view = render(<ModelMixedModelCreation context={context} profile={profile} current={false} request={request} />);
  expect(view.getByRole('button', { name: 'Preview model schema' })).toBeDisabled();
  view.rerender(<ModelMixedModelCreation context={context} profile={profile} current request={request} />);
  fireEvent.click(view.getByRole('button', { name: 'Preview model schema' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Create mixed-resolution model' })).toBeEnabled());
  expect(request).toHaveBeenCalledWith(context, 'preview', { version: 'V1.0.0', focus: 'ES', resolutions: profile.resolutions, name: '' });
  fireEvent.click(view.getByRole('button', { name: 'Create mixed-resolution model' }));
  await waitFor(() => expect(view.getByRole('link', { name: 'Open new model' })).toHaveAttribute('href', '/model'));
  expect(request).toHaveBeenLastCalledWith(context, 'jobs/job/create', { confirm: true, source_digest: 'digest' });
});

test('changed profile invalidates a completed preview', async () => {
  const request = jest.fn(async () => ({ job_id: 'old', state: 'preview_ready', phase: 'Ready', can_create: true }));
  const view = render(<ModelMixedModelCreation context={context} profile={profile} current request={request} />);
  fireEvent.click(view.getByRole('button', { name: 'Preview model schema' }));
  await waitFor(() => expect(view.queryByRole('button', { name: 'Create mixed-resolution model' })).not.toBeNull());
  view.rerender(<ModelMixedModelCreation context={context} profile={{ ...profile, focusCountry: 'FR' }} current={false} request={request} />);
  expect(view.queryByRole('button', { name: 'Create mixed-resolution model' })).toBeNull();
});

test('renaming invalidates the reviewed preview and its stored job', async () => {
  const request = jest.fn(async () => ({ job_id: 'old', state: 'preview_ready', phase: 'Ready', can_create: true }));
  const view = render(<ModelMixedModelCreation context={context} profile={profile} current request={request} />);
  fireEvent.click(view.getByRole('button', { name: 'Preview model schema' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Create mixed-resolution model' })).toBeEnabled());
  fireEvent.change(view.getByRole('textbox', { name: 'Mixed model name' }), { target: { value: 'Another model' } });
  expect(view.queryByRole('button', { name: 'Create mixed-resolution model' })).toBeNull();
  expect(window.localStorage.length).toBe(0);
});

test('late response cannot attach a different source profile', async () => {
  let resolve;
  const request = jest.fn(() => new Promise(value => { resolve = value; }));
  const view = render(<ModelMixedModelCreation context={context} profile={profile} current request={request} />);
  fireEvent.click(view.getByRole('button', { name: 'Preview model schema' }));
  view.rerender(<ModelMixedModelCreation context={{ ...context, version: 'V2' }} profile={profile} current request={request} />);
  await act(async () => resolve({ job_id: 'old', state: 'preview_ready', phase: 'Ready', can_create: true }));
  expect(view.queryByText('Ready')).toBeNull();
});

test('transport rejects mismatched project provenance', async () => {
  const original = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ schema: 'nohm.atlas.mixed-model.v1', project_id: 'Other', source_version: 'V1.0.0' }) }));
  try { await expect(mixedModelRequest(context, 'preview', {})).rejects.toThrow('different model version'); }
  finally { global.fetch = original; }
});

test('published regions are passed to model creation and changing them invalidates the staged model', async () => {
  const request = jest.fn(async () => ({ job_id: 'regional', state: 'preview_ready', phase: 'Ready', can_create: true }));
  const regionalProfile = { ...profile, resolutions: ['native', 'country', 'regional'], schemeId: 'published', regionIds: ['west'] };
  const view = render(<ModelMixedModelCreation context={context} profile={regionalProfile} current request={request} />);
  fireEvent.click(view.getByRole('button', { name: 'Preview model schema' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Create mixed-resolution model' })).toBeEnabled());
  expect(request).toHaveBeenCalledWith(context, 'preview', { version: 'V1.0.0', focus: 'ES', resolutions: regionalProfile.resolutions,
    name: '', scheme_id: 'published', region_ids: ['west'] });
  view.rerender(<ModelMixedModelCreation context={context} profile={{ ...regionalProfile, regionIds: ['east'] }} current request={request} />);
  expect(view.queryByRole('button', { name: 'Create mixed-resolution model' })).toBeNull();
});
