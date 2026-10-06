import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import ModelLayerCoverage from './ModelLayerCoverage';

test('reports actual layer work while loading', () => {
  const view = render(<ModelLayerCoverage status={{ state: 'loading', progress: { completed: 2, total: 4, current: 'Reading Storage locations' } }} />);
  expect(view.getByRole('status').textContent).toBe('Reading Storage locations · 2/4');
});

test('topology loading is visible and cancellable before the inventory reader starts', () => {
  const view = render(<ModelLayerCoverage onCancel={() => {}} status={{ state: 'loading', progress: null }} />);
  expect(view.getByRole('status').textContent).toContain('Loading model topology');
  expect(view.getByRole('button', { name: 'Cancel loading' })).toBeTruthy();
});

test('input progress reports objects rather than an apparently frozen two-stage counter', () => {
  const view = render(<ModelLayerCoverage status={{ state: 'loading', progress: {
    completed: 1, total: 2, current: 'Reading Generator Max Capacity', objectsCompleted: 50, objectsTotal: 2455,
  } }} />);
  expect(view.getByRole('status').textContent).toBe('Reading Generator Max Capacity · 50/2455 objects');
});

test('offers cancellation and explains a failed layer without claiming the previous map disappeared', () => {
  const onCancel = jest.fn();
  const view = render(<ModelLayerCoverage onCancel={onCancel} status={{ state: 'loading', progress: {
    completed: 1, total: 2, current: 'Reading inputs',
  } }} />);
  fireEvent.click(view.getByRole('button', { name: 'Cancel loading' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  view.rerender(<ModelLayerCoverage status={{ state: 'error', error: 'Model data request timed out.', meta: {} }} />);
  expect(view.getByRole('alert').textContent).toBe('Model data request timed out. The previous map is unchanged.');
});

test('coverage distinguishes input snapshots, unresolved values and linked-node placement', () => {
  const view = render(<ModelLayerCoverage status={{ state: 'ready', meta: { requestedYear: 2030,
    layerEvidence: { storage: { mapped: 8, total: 10, resolved: 4, anchored: 2 }, demand: { mapped: 3, total: 5, resolved: 0, anchored: 0 } },
  } }} />);
  expect(view.container.textContent).toContain('Layer coverage · some values unresolved');
  expect(view.container.textContent).toContain('Storage: 8/10 objects mapped · 4 values resolved · 2 at linked-node locations');
  expect(view.container.textContent).toContain('Demand: 3/5 objects mapped · 0 values resolved');
  expect(view.container.textContent).toContain('Input snapshot: 2030-01-01, 00:00');
  expect(view.container.textContent).toContain('Unresolved values are not zero');
  expect(view.container.querySelector('details').open).toBe(false);
});

test('does not label failed or absent layers as loaded', () => {
  const view = render(<ModelLayerCoverage status={{ state: 'error', meta: { layerEvidence: { supply: {} } } }} />);
  expect(view.container.textContent).toBe('');
  view.rerender(<ModelLayerCoverage status={{ state: 'ready', meta: {} }} />);
  expect(view.container.textContent).toBe('');
});
