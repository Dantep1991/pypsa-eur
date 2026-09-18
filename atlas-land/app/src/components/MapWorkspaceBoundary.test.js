import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MapWorkspaceBoundary from './MapWorkspaceBoundary';

let shouldFail;
function MapCandidate() {
  if (shouldFail) throw new Error('sensitive feature details');
  return <div>Interactive map ready</div>;
}

let consoleError;
beforeEach(() => {
  shouldFail = true;
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

test('contains a map exception without exposing it and retries the map in place', () => {
  render(<MapWorkspaceBoundary resetKey="Spain|Grid"><MapCandidate /></MapWorkspaceBoundary>);
  const recovery = screen.getByRole('alert', { name: 'Map recovery' });
  expect(recovery.textContent).toContain('loaded networks and settings are still available');
  expect(recovery.textContent).not.toContain('sensitive feature details');
  shouldFail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry map' }));
  expect(screen.getByText('Interactive map ready')).toBeTruthy();
});

test('a changed data snapshot automatically gets a fresh render attempt', () => {
  const view = render(
    <MapWorkspaceBoundary resetKey="Spain|Grid"><MapCandidate /></MapWorkspaceBoundary>,
  );
  expect(screen.getByRole('alert', { name: 'Map recovery' })).toBeTruthy();
  shouldFail = false;
  view.rerender(<MapWorkspaceBoundary resetKey="France|Grid"><MapCandidate /></MapWorkspaceBoundary>);
  expect(screen.getByText('Interactive map ready')).toBeTruthy();
});
