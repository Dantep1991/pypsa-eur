import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ModelDistillationControls from './ModelDistillationControls';
const preview = { project_id: 'P', model_version: 'v1', selection: { country_codes: ['EE'] }, source: { scene_fingerprint: 'abc' },
  capabilities: { mutates_source: false, executable: false }, counts: { by_status: { retained: 1, boundary_crossing: 7, excluded: 235, unresolved: 40 } } };
const base = { context: { projectId: 'P', version: 'v1' }, availableCountries: ['EE', 'DE'], selectedCountries: [], countryName: code => code,
  onSelectionChange: jest.fn(), onShowContextChange: jest.fn(), onClear: jest.fn(), onPreview: jest.fn(async () => preview), showContext: false };
beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); base.onPreview.mockResolvedValue(preview); });
test('countries add immediately and subset counts and context are in plain language', () => {
  render(<ModelDistillationControls {...base} previewStatus={{ state: 'ready', preview }} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'EE' } });
  expect(base.onSelectionChange).toHaveBeenCalledWith(['EE']);
  expect(screen.getByText('Inside selection')).toBeVisible();
  expect(screen.getByText('Connections to outside')).toBeVisible();
  expect(screen.getByText('Country mapping unavailable')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show rest of model faintly' }));
  expect(base.onShowContextChange).toHaveBeenCalledWith(true);
  expect(screen.queryByText(/Ghost excluded/)).not.toBeInTheDocument();
});
test('a saved view can be restored after remounting, by fetching a fresh canonical preview', async () => {
  const view = render(<ModelDistillationControls {...base} selectedCountries={['EE']} previewStatus={{ state: 'ready', preview }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save view' }));
  expect(screen.getByRole('status')).toHaveTextContent('Original model unchanged');
  view.unmount();
  render(<ModelDistillationControls {...base} previewStatus={{ state: 'idle' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Restore saved view' }));
  expect(base.onSelectionChange).toHaveBeenLastCalledWith(['EE']);
  expect(base.onPreview).toHaveBeenLastCalledWith(['EE']);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved view restored'));
});

test('automatic map status has no duplicate country selection or preview action', () => {
  render(<ModelDistillationControls {...base} automatic selectedCountries={['EE']} previewStatus={{ state: 'ready', preview }} />);
  expect(screen.queryByText(/Country selection shown on map|Model checks also apply/)).not.toBeInTheDocument();
  expect(screen.queryByText('What do these counts mean?')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /preview|restore|save/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show rest of model faintly' }));
  expect(base.onShowContextChange).toHaveBeenCalledWith(true);
});

test('automatic preview exposes loading and failure without another action', () => {
  const view = render(<ModelDistillationControls {...base} automatic previewStatus={{ state: 'loading', preview: null }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading country map preview');
  view.rerender(<ModelDistillationControls {...base} automatic previewStatus={{ state: 'error', error: 'Map service unavailable', preview: null }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Map service unavailable');
});
