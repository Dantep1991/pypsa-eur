import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import AtlasCbaControls from './AtlasCbaControls';
import { AtlasWorkspacePanels } from './AtlasWorkspacePanels';
import ModelWorkspaceSection from './ModelWorkspaceSection';

const study = { projectId: 'study', name: 'Theo study', cases: ['case', 'total-only'], summary: {
  tscDelta: { '2050': { case: { total: -123.45 }, 'total-only': { total: 0 } } },
  sewDelta: { '2050': { case: { cs_elec: 0, ps_elec: 1, cr_elec: 2, xsec: 3 } } }, quality: { certified: false },
} };
const clear = jest.fn(), show = jest.fn();
function Controls({ status = { state: 'idle' } }) {
  const [selection, setSelection] = useState({ studyId: 'study', caseId: 'case', band: '2050', component: 'total', map: 'country' });
  return <AtlasCbaControls catalog={{ studies: [study] }} selection={selection} onSelectionChange={setSelection}
    status={status} onShow={show} onClear={clear} markerScale={1} onMarkerScaleChange={jest.fn()} />;
}

test('shows exact cost delta and selectable consumer, producer, congestion, cross-sectoral and total values', () => {
  render(<Controls />);
  expect(screen.getByText('-123.45 M EUR')).toBeInTheDocument();
  expect(screen.getByText('Saved test · unvalidated')).toBeInTheDocument();
  const value = screen.getByLabelText('CBA value');
  expect(Array.from(value.options).map(option => option.value)).toEqual(['total', 'consumer', 'producer', 'congestion', 'cross_sectoral']);
  fireEvent.change(value, { target: { value: 'consumer' } });
  expect(value).toHaveValue('consumer');
  expect(screen.getByText('Higher rents are favourable for the selected group.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show on map' }));
  expect(show).toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Open assessment in Theo' })).toHaveAttribute('href', '/theo/cba/cost-benefit-analysis?project=study&assetProjectId=case');
});

test('congestion map selects congestion; selecting another value returns to country map', () => {
  render(<Controls />);
  fireEvent.change(screen.getByLabelText('CBA visualisation'), { target: { value: 'connections' } });
  expect(screen.getByLabelText('CBA value')).toHaveValue('congestion');
  expect(screen.queryByLabelText('Circle size')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('CBA value'), { target: { value: 'producer' } });
  expect(screen.getByLabelText('CBA visualisation')).toHaveValue('country');
  expect(screen.getByLabelText('Circle size')).toBeInTheDocument();
});

test('summary-only assessments disable unreported rents, retain actual zero costs and explain missing geography', () => {
  render(<Controls status={{ state: 'ready', data: { coverage: { mapped: 0, reported: 0 }, warnings: [], notes: ['No country breakdown saved.'] } }} />);
  fireEvent.change(screen.getByLabelText('CBA assessed project'), { target: { value: 'total-only' } });
  expect(screen.getByText('0 M EUR')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Consumer rents · not assessed' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'Congestion rent map' })).toBeDisabled();
  expect(screen.getByText('No country breakdown saved.')).toBeInTheDocument();
});

test('progress shows real phases and counts while preventing duplicate requests', () => {
  render(<Controls status={{ state: 'loading', progress: { phase: 'Resolving map positions', completed: 1, total: 2 } }} />);
  expect(screen.getByRole('status', { name: 'CBA loading progress' })).toHaveTextContent('Resolving map positions · 1/2');
  expect(screen.getByRole('button', { name: 'Show on map' })).toBeDisabled();
});

test('unassessed model launcher is greyed out with a clear reason', () => {
  render(<AtlasWorkspacePanels><ModelWorkspaceSection title="Cost-benefit analysis" disabled
    disabledReason="No assessed CBA projects are linked to this model."><Controls /></ModelWorkspaceSection></AtlasWorkspacePanels>);
  expect(screen.getByRole('button', { name: 'Cost-benefit analysis' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cost-benefit analysis' })).toHaveAttribute('title', 'No assessed CBA projects are linked to this model.');
  expect(screen.queryByLabelText('CBA study')).not.toBeInTheDocument();
});
