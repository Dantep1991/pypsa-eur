import React from 'react';
import { cleanup, render } from '@testing-library/react';
import MapRenderDiagnostics, { mapDiagnosticsEnabled } from './MapRenderDiagnostics';

afterEach(cleanup);

test.each(['', '?atlas-diagnostics=0', '?diagnostics=1', '?atlas-diagnostics=true'])('diagnostics stay off for %s', (search) => {
  expect(mapDiagnosticsEnabled(search)).toBe(false);
});

test('diagnostics require an explicit URL flag, including when embedded under a subpath', () => {
  expect(mapDiagnosticsEnabled('?atlas-diagnostics=1')).toBe(true);
  expect(mapDiagnosticsEnabled('?view=map&atlas-diagnostics=1')).toBe(true);
});

test('readout retains only the last completed sample and distinguishes new work and failures', () => {
  const sample = { features: 100, batches: 3, setupMs: 1, activeMs: 10, maxBatchMs: 5,
    maxFeatureMs: 2, paintMs: 4, totalMs: 45 };
  const view = render(<MapRenderDiagnostics />);
  expect(view.getByText(/No completed line drawing/)).toBeDefined();
  view.rerender(<MapRenderDiagnostics metrics={sample} />);
  expect(view.getByText('100')).toBeDefined();
  expect(view.getByText('45.0 ms')).toBeDefined();
  view.rerender(<MapRenderDiagnostics busy />);
  expect(view.getByText('Building replacement…')).toBeDefined();
  expect(view.getByText('Last completed line drawing')).toBeDefined();
  expect(view.getByText('100')).toBeDefined();
  view.rerender(<MapRenderDiagnostics error="Failed" />);
  expect(view.getByText('Replacement drawing failed.')).toBeDefined();
  view.rerender(<MapRenderDiagnostics metrics={{ ...sample, features: 200 }} />);
  expect(view.queryByText('100')).toBeNull();
  expect(view.getByText('200')).toBeDefined();
  expect(view.getByText(/Excludes downloads/)).toBeDefined();
  expect(view.getByText(/No telemetry is sent/)).toBeDefined();
});

test('cleanup is measured independently and cannot masquerade as a completed drawing', () => {
  const sample = { features: 500, batches: 3, activeMs: 6, maxBatchMs: 2, elapsedMs: 48 };
  const view = render(<MapRenderDiagnostics retirement={{ retiring: true }} />);
  expect(view.getByText('Retiring hidden drawing…')).toBeDefined();
  expect(view.getByText(/No completed line drawing/)).toBeDefined();
  view.rerender(<MapRenderDiagnostics retirement={{ retiring: false, metrics: sample }} />);
  expect(view.getByText('Last completed cleanup')).toBeDefined();
  expect(view.getByText('500')).toBeDefined();
  view.rerender(<MapRenderDiagnostics retirement={{ retiring: true }} />);
  expect(view.getByText('500')).toBeDefined();
  view.rerender(<MapRenderDiagnostics retirement={{ retiring: false, error: 'Cleanup failed' }} />);
  expect(view.getByText('Cleanup failed')).toBeDefined();
  expect(view.getByText('500')).toBeDefined();
});
