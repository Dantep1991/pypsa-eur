import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AtlasWorkspacePanels, WorkspaceLauncher } from './AtlasWorkspacePanels';
import AtlasDomainSection from './AtlasDomainSection';
import AtlasWorkspaceRail from './AtlasWorkspaceRail';
import ModelWorkspaceSection from './ModelWorkspaceSection';

function Settings() {
  const [value, setValue] = useState('');
  return <input aria-label="Setting" value={value} onChange={event => setValue(event.target.value)} />;
}
const menu = props => <AtlasWorkspacePanels {...props}>
  <AtlasDomainSection title="Geography" open={false} onToggle={jest.fn()}><Settings /></AtlasDomainSection>
  <ModelWorkspaceSection title="Results" summary="Solved quantities"><button>Show on map</button></ModelWorkspaceSection>
</AtlasWorkspacePanels>;

test('unsupported regional clustering is disabled and gives a reason without mounting its controls', () => {
  render(<AtlasWorkspacePanels><AtlasDomainSection title="Regional clustering" disabled disabledReason="Native geography only"><Settings /></AtlasDomainSection></AtlasWorkspacePanels>);
  const button = screen.getByRole('button', { name: 'Regional clustering' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('title', 'Native geography only');
  fireEvent.click(button);
  expect(screen.queryByRole('textbox')).toBeNull();
});

test('navigation has only centred Model / Visualise labels', () => {
  const select = jest.fn();
  render(<AtlasWorkspaceRail activeArea="geography" onSelect={select} />);
  expect(screen.getAllByRole('button').map(item => item.textContent)).toEqual(['Model', 'Visualise']);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Model', exact: true }), { key: 'ArrowRight' });
  expect(select).toHaveBeenCalledWith('filters');
});

test('single click opens settings beside the menu; switching retains values and Escape restores focus', () => {
  render(menu());
  const geography = screen.getByRole('button', { name: 'Geography', exact: true });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(geography);
  const panel = screen.getByRole('complementary', { name: 'Geography', exact: true });
  fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'France' } });
  expect(panel).not.toContainElement(geography);
  fireEvent.click(screen.getByRole('button', { name: 'Results', exact: true }));
  expect(screen.getAllByRole('complementary')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Show on map' })).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(geography);
  expect(screen.getByRole('textbox')).toHaveValue('France');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(geography).toHaveFocus();
});

test('existing workspaces launch directly without an extra open button; disabled tools cannot launch', () => {
  const open = jest.fn();
  render(<AtlasWorkspacePanels>
    <ModelWorkspaceSection title="Model database" onOpen={open} />
    <ModelWorkspaceSection title="Later tool" disabled onOpen={open} />
  </AtlasWorkspacePanels>);
  fireEvent.click(screen.getByRole('button', { name: 'Model database' }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Later tool' }));
  expect(open).toHaveBeenCalledTimes(1);
});

test('opening an external workspace closes the generic side panel', () => {
  const view = render(menu({ externalPanelOpen: false }));
  fireEvent.click(screen.getByRole('button', { name: 'Results', exact: true }));
  view.rerender(menu({ externalPanelOpen: true }));
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

test('the current option stays highlighted after opening and closing its settings', () => {
  render(menu());
  const geography = screen.getByRole('button', { name: 'Geography', exact: true });
  const results = screen.getByRole('button', { name: 'Results', exact: true });
  fireEvent.click(geography);
  expect(geography).toHaveClass('is-active');
  expect(geography).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Close Geography' }));
  expect(geography).toHaveClass('is-active');
  expect(geography).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(results);
  expect(results).toHaveClass('is-active');
  expect(geography).not.toHaveClass('is-active');
  expect(geography).not.toHaveAttribute('aria-current');
});

test('direct external launchers retain their highlight and coordinate the previous card', () => {
  const activate = jest.fn(), open = jest.fn();
  render(<AtlasWorkspacePanels onActivate={activate}>
    <ModelWorkspaceSection title="Model database" onOpen={open} />
    <WorkspaceLauncher title="Geography"><Settings /></WorkspaceLauncher>
  </AtlasWorkspacePanels>);
  const database = screen.getByRole('button', { name: 'Model database' });
  fireEvent.click(database);
  expect(activate).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledTimes(1);
  expect(database).toHaveClass('is-active');
  expect(database).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Geography' }));
  expect(database).not.toHaveClass('is-active');
});

test('externally opened workspaces update the selection even when a different external card was already open', () => {
  const contents = <><ModelWorkspaceSection title="Model database" onOpen={jest.fn()} />
    <ModelWorkspaceSection title="Compare" onOpen={jest.fn()} /></>;
  const view = render(<AtlasWorkspacePanels externalPanelOpen externalPanelSelection="Compare">{contents}</AtlasWorkspacePanels>);
  expect(screen.getByRole('button', { name: 'Compare' })).toHaveClass('is-active');
  view.rerender(<AtlasWorkspacePanels externalPanelOpen externalPanelSelection="Model database">{contents}</AtlasWorkspacePanels>);
  expect(screen.getByRole('button', { name: 'Compare' })).not.toHaveClass('is-active');
  expect(screen.getByRole('button', { name: 'Model database' })).toHaveClass('is-active');
  view.rerender(<AtlasWorkspacePanels externalPanelOpen={false}>{contents}</AtlasWorkspacePanels>);
  expect(screen.getByRole('button', { name: 'Model database' })).toHaveClass('is-active');
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

function ChildPanelMenu() {
  const [child, setChild] = useState(null);
  return <>
    <AtlasWorkspacePanels externalPanelOpen={Boolean(child)} externalPanelSelection={child ? 'Map display' : null}
      externalPanelParent={child ? 'Map display' : null} onActivate={() => setChild(null)}>
      <WorkspaceLauncher title="Map display"><Settings />
        <button onClick={() => setChild('Land')}>Land</button>
        <button onClick={() => setChild('Access')}>Access</button>
      </WorkspaceLauncher>
      <WorkspaceLauncher title="Geography"><button>Apply geography</button></WorkspaceLauncher>
    </AtlasWorkspacePanels>
    {child && <section aria-label={`${child} controls`}><button onClick={() => setChild(null)}>Back to Map display</button></section>}
  </>;
}

test.each(['Land', 'Access'])('%s returns to the same Map display settings without overlapping cards', child => {
  render(<ChildPanelMenu />);
  const launcher = screen.getByRole('button', { name: 'Map display', exact: true });
  fireEvent.click(launcher);
  fireEvent.change(screen.getByRole('textbox', { name: 'Setting' }), { target: { value: 'Keep settings' } });
  fireEvent.click(screen.getByRole('button', { name: child, exact: true }));
  expect(screen.getByRole('region', { name: `${child} controls` })).toBeVisible();
  expect(screen.queryByRole('complementary', { name: 'Map display' })).not.toBeInTheDocument();
  expect(launcher).toHaveClass('is-active');
  expect(launcher).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Back to Map display' }));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Map display' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Setting' })).toHaveValue('Keep settings');
  expect(launcher).toHaveAttribute('aria-expanded', 'true');
  // The launcher is also a direct route back; another option closes the child.
  fireEvent.click(screen.getByRole('button', { name: child, exact: true }));
  fireEvent.click(launcher);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Setting' })).toHaveValue('Keep settings');
  fireEvent.click(screen.getByRole('button', { name: child, exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Geography' }));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply geography' })).toBeVisible();
  expect(launcher).not.toHaveClass('is-active');
});
