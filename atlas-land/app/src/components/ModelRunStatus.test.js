import React from 'react';
import { render, screen } from '@testing-library/react';
import ModelRunStatus from './ModelRunStatus';

const completed = { projectId: 'Fixture', modelVersion: 'v1', modelName: 'Base', status: 'completed', runCount: 1,
  latest: { runId: 'base', label: 'Base solved run', modelName: 'Base', outputVerified: true } };

test('only the bound Model completion is shown with its exact scope', () => {
  render(<ModelRunStatus runState={completed} hideAction />);
  expect(screen.getByRole('status').textContent).toContain('Completed');
  expect(screen.getByRole('status').textContent).toContain('for Base · v1');
  expect(screen.getByRole('status').textContent).toContain('output verified');
});

test('version-wide and mismatched completions are not shown as a Model status', () => {
  const { rerender } = render(<ModelRunStatus runState={{ ...completed, modelName: null }} hideAction />);
  expect(screen.queryByRole('status')).toBeNull();
  rerender(<ModelRunStatus runState={{ ...completed, modelName: 'Other' }} hideAction />);
  expect(screen.queryByRole('status')).toBeNull();
});

test('prepared work cannot show a completed or verified solution', () => {
  render(<ModelRunStatus runState={{ ...completed, status: 'prepared', latest: {
    runId: 'new', modelName: 'Base', label: 'New request', outputVerified: false,
  } }} hideAction />);
  expect(screen.getByRole('status').textContent).toContain('Prepared');
  expect(screen.getByRole('status').textContent).not.toContain('Completed');
  expect(screen.getByRole('status').textContent).not.toContain('output verified');
});
