import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ModelPortalControls from './ModelPortalControls';
import { createWorkspaceRegistry } from '../agentWorkspace/registry';
import { WorkspaceAgentProvider } from '../agentWorkspace/react';

test('manual and agent portal controls invoke the same existing host action', async () => {
  const registry = createWorkspaceRegistry(); registry.bind('project:v1', {});
  const onOpen = jest.fn(target => window.dispatchEvent(new MessageEvent('message', {
    source: window.parent, origin: window.location.origin,
    data: { type: 'nohm.atlas.portal-state.v1', binding: 'project:v1', target, status: 'opened' },
  })));
  const view = render(<WorkspaceAgentProvider value={registry}><ModelPortalControls embedded onOpen={onOpen} targets={['explore-model', 'demand']} /></WorkspaceAgentProvider>);
  fireEvent.click(view.getByRole('button', { name: 'Open Demand profiles portal' }));
  expect(onOpen).toHaveBeenLastCalledWith('demand');
  let execution;
  act(() => { execution = registry.controllers.get('project_tools').execute('show', { target: 'explore-model' }); });
  await expect(execution).resolves.toBe('Project portal opened.');
  expect(onOpen).toHaveBeenLastCalledWith('explore-model');
  expect(registry.controllers.get('project_tools').fields.target.options.map(row => row.value)).toEqual(['explore-model', 'demand']);
});

test('portal confirmation rejects another parent, origin, model binding or target', () => {
  const registry = createWorkspaceRegistry(); registry.bind('project:v1', {});
  render(<WorkspaceAgentProvider value={registry}><ModelPortalControls embedded onOpen={jest.fn()} targets={['explore-model']} /></WorkspaceAgentProvider>);
  const data = { type: 'nohm.atlas.portal-state.v1', binding: 'project:v1', target: 'explore-model', status: 'opened' };
  for (const override of [{ source: {} }, { origin: 'http://other' },
    { data: { ...data, binding: 'other:v1' } }, { data: { ...data, target: 'unknown' } }]) {
    act(() => window.dispatchEvent(new MessageEvent('message', {
      source: window.parent, origin: window.location.origin, data, ...override,
    })));
    expect(registry.controllers.get('project_tools').state.portal).toBeNull();
  }
  act(() => window.dispatchEvent(new MessageEvent('message', { source: window.parent, origin: window.location.origin, data })));
  expect(registry.controllers.get('project_tools').state.portal).toMatchObject({ target: 'explore-model', status: 'opened' });
});

test('a standalone preview accurately disables portals rather than pretending to open them', async () => {
  const registry = createWorkspaceRegistry(); const onOpen = jest.fn();
  const view = render(<WorkspaceAgentProvider value={registry}><ModelPortalControls onOpen={onOpen} /></WorkspaceAgentProvider>);
  expect(view.getByRole('button', { name: 'Open Demand profiles portal' })).toBeDisabled();
  await expect(registry.controllers.get('project_tools').execute('show', { target: 'demand' })).rejects.toThrow('inside Nohm');
  expect(onOpen).not.toHaveBeenCalled();
});
