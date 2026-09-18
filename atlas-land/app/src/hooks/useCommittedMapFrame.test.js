import React, { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { useCommittedMapFrame } from './useCommittedMapFrame';

function Frame({ value, ready }) {
  const frame = useCommittedMapFrame(value, ready);
  return <output>{frame ? `${frame.nodes}|${frame.zones}|${frame.pies}` : 'No complete frame'}</output>;
}
const frame = prefix => ({ nodes: `${prefix} nodes`, zones: `${prefix} zones`, pies: `${prefix} pies` });
test('all geometry companions commit together; pending and failed candidates keep the complete frame', () => {
  const view = render(<StrictMode><Frame value={frame('first')} ready={false} /></StrictMode>);
  expect(screen.getByRole('status').textContent).toBe('No complete frame');
  view.rerender(<StrictMode><Frame value={frame('first')} ready /></StrictMode>);
  expect(screen.getByRole('status').textContent).toBe('first nodes|first zones|first pies');
  for (const prefix of ['pending', 'superseded', 'failed']) {
    view.rerender(<StrictMode><Frame value={frame(prefix)} ready={false} /></StrictMode>);
    expect(screen.getByRole('status').textContent).toBe('first nodes|first zones|first pies');
  }
  view.rerender(<StrictMode><Frame value={frame('latest')} ready /></StrictMode>);
  expect(screen.getByRole('status').textContent).toBe('latest nodes|latest zones|latest pies');
});

test('changes without pending line work are immediate, including an empty network', () => {
  const view = render(<Frame value={frame('loaded')} ready />);
  view.rerender(<Frame value={frame('selected')} ready />);
  expect(screen.getByRole('status').textContent).toContain('selected nodes');
  view.rerender(<Frame value={null} ready />);
  expect(screen.getByRole('status').textContent).toBe('No complete frame');
  view.rerender(<Frame value={frame('pending')} ready={false} />);
  expect(screen.getByRole('status').textContent).toBe('No complete frame');
});
