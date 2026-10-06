import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, waitFor } from '@testing-library/react';
import ModelCreationWorkspace from './ModelCreationWorkspace';

afterEach(() => localStorage.clear());

test('creation tabs retain subset selection and use distinct ids from geography', async () => {
  const request = jest.fn(async () => ({ countries: [{ id: 'DE', label: 'Germany' }], carriers: [] }));
  const view = render(<ModelCreationWorkspace context={{ projectId: 'P', version: 'v1' }} request={request}
    mixed={<input aria-label="Mixed settings" defaultValue="3" />} />);
  await waitFor(() => expect(view.getByLabelText('Countries')).toBeEnabled());
  fireEvent.change(view.getByLabelText('Countries'), { target: { value: 'DE' } });
  fireEvent.click(view.getByRole('tab', { name: 'Mixed resolution' }));
  expect(view.getByLabelText('Mixed settings')).toBeVisible();
  fireEvent.change(view.getByLabelText('Mixed settings'), { target: { value: '4' } });
  fireEvent.click(view.getByRole('tab', { name: 'Country & carrier subset' }));
  expect(view.getByRole('button', { name: 'Remove Countries DE' })).toBeVisible();
  expect(view.getByLabelText('Mixed settings')).toHaveValue('4');
  expect(view.getByRole('tab', { name: 'Mixed resolution' })).toHaveAttribute('id', 'model-creation-tab-mixed');
});

test('an already applied mixed view opens its creation tab directly', async () => {
  const view = render(<ModelCreationWorkspace context={{ projectId: 'P', version: 'v1' }}
    initialMixed mixed={<p>Applied mixed model</p>} request={async () => ({ countries: [], carriers: [] })} />);
  await waitFor(() => expect(view.getByText('Applied mixed model')).toBeVisible());
  expect(view.getByRole('tab', { name: 'Mixed resolution' })).toHaveAttribute('aria-selected', 'true');
});

test('one subset preview uses the same selection for map display and model validation', async () => {
  const onPreviewMap = jest.fn(async () => null), onInvalidatePreview = jest.fn();
  const request = jest.fn(async (_, action) => action.startsWith('options') ? {
    countries: [{ id: 'ES', label: 'Spain' }, { id: 'FR', label: 'France' }],
    carriers: [{ id: 'electricity', label: 'Electricity' }], parent_runs: [],
  } : { job_id: 'job', state: 'preview_ready', phase: 'Preview ready', can_create: true });
  const view = render(<ModelCreationWorkspace context={{ projectId: 'P', version: 'v1' }} request={request}
    onPreviewMap={onPreviewMap} onInvalidatePreview={onInvalidatePreview} subsetPreview={<p>Map preview status</p>} />);
  await waitFor(() => expect(view.getByLabelText('Countries')).toBeEnabled());
  fireEvent.change(view.getByLabelText('Countries'), { target: { value: 'ES' } });
  fireEvent.change(view.getByLabelText('Carriers'), { target: { value: 'electricity' } });
  fireEvent.change(view.getByLabelText('Country boundary'), { target: { value: 'closed' } });
  expect(onInvalidatePreview).toHaveBeenCalledTimes(3);
  expect(view.getAllByRole('button', { name: 'Preview subset' })).toHaveLength(1);
  fireEvent.click(view.getByRole('button', { name: 'Preview subset' }));
  await waitFor(() => expect(onPreviewMap).toHaveBeenCalledWith({ countries: ['ES'], carriers: ['electricity'], boundaryPolicy: 'closed' }));
  expect(request).toHaveBeenCalledWith(expect.anything(), 'preview', expect.objectContaining({
    countries: ['ES'], carriers: ['electricity'], boundary_policy: 'closed',
  }));
  expect(view.getByText('Map preview status')).toBeVisible();
  expect(view.queryByText('Map-only preview')).not.toBeInTheDocument();
  expect(request.mock.calls.some(([, action]) => action.endsWith('/create'))).toBe(false);
});
