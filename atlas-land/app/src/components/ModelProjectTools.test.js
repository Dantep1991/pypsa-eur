import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ModelProjectTools from './ModelProjectTools';
import ModelPortalControls from './ModelPortalControls';
import { AtlasWorkspacePanels } from './AtlasWorkspacePanels';

test('one launcher holds the requested seven project tools in order', () => {
  const open = jest.fn();
  render(<AtlasWorkspacePanels><ModelProjectTools embedded onOpen={open} /></AtlasWorkspacePanels>);
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Model & project tools']);
  fireEvent.click(screen.getByRole('button', { name: 'Model & project tools', exact: true }));
  const panel = screen.getByRole('complementary', { name: 'Model & project tools', exact: true });
  const portals = within(panel).getAllByRole('button').filter(button => button.title);
  expect(portals.map(button => button.textContent)).toEqual([
    'Explore model', 'Run model', 'Demand profiles', 'Climate', 'Commodity', 'Synapse network', 'Visualisation',
  ]);
  portals.forEach(button => fireEvent.click(button));
  expect(open.mock.calls.map(call => call[0])).toEqual([
    'explore-model', 'model-runs', 'demand', 'climate', 'commodity', 'synapse-network', 'visualisation',
  ]);
  expect(screen.queryByText('Model Operations')).not.toBeInTheDocument();
  expect(screen.queryByText('No runs for this version')).not.toBeInTheDocument();
  expect(within(panel).queryByText('About this tool')).not.toBeInTheDocument();
});

test('a persisted active run remains visible without a second run entry', () => {
  render(<AtlasWorkspacePanels><ModelProjectTools embedded onOpen={jest.fn()} runState={{
    status: 'running', modelVersion: 'v1', modelName: 'Base', runCount: 1, latest: { modelName: 'Base', label: 'Approved run', phase: 'Solving' },
  }} /></AtlasWorkspacePanels>);
  fireEvent.click(screen.getByRole('button', { name: 'Model & project tools', exact: true }));
  expect(screen.getByRole('status')).toHaveTextContent('Running');
  expect(screen.getByRole('status')).toHaveTextContent('Solving');
  expect(screen.queryByRole('button', { name: 'Open runs' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Open Run model portal' })).toHaveLength(1);
});

test('project tools never show a version-wide completion as the selected Model', () => {
  render(<AtlasWorkspacePanels><ModelProjectTools embedded onOpen={jest.fn()} runState={{
    status: 'completed', modelVersion: 'v1', runCount: 1, latest: { label: 'Other completion', modelName: 'Other' },
  }} /></AtlasWorkspacePanels>);
  fireEvent.click(screen.getByRole('button', { name: 'Model & project tools', exact: true }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByText('Other completion')).not.toBeInTheDocument();
});

test('non-embedded links are disabled, and unknown/duplicate targets never launch', () => {
  const open = jest.fn();
  render(<ModelPortalControls onOpen={open} targets={['model-runs', 'unknown', 'model-runs']} />);
  const button = screen.getByRole('button', { name: 'Open Run model portal' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(open).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

test('standalone project tools explain the host requirement without an about footer', () => {
  render(<AtlasWorkspacePanels><ModelProjectTools onOpen={jest.fn()} /></AtlasWorkspacePanels>);
  fireEvent.click(screen.getByRole('button', { name: 'Model & project tools', exact: true }));
  const panel = screen.getByRole('complementary', { name: 'Model & project tools', exact: true });
  expect(within(panel).getByText('Open Atlas inside Nohm to use these tools.')).toBeInTheDocument();
  expect(within(panel).queryByText('About this tool')).not.toBeInTheDocument();
  expect(within(panel).getAllByRole('button').filter(button => button.title)).toHaveLength(7);
  within(panel).getAllByRole('button').filter(button => button.title).forEach(button => {
    expect(button).toBeDisabled();
  });
});
