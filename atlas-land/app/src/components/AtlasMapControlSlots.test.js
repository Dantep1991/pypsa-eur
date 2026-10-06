import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, within } from '@testing-library/react';
import AtlasMapControlSlots from './AtlasMapControlSlots';
import AtlasControlPortal from './AtlasControlPortal';
import { AtlasWorkspacePanels, WorkspaceLauncher } from './AtlasWorkspacePanels';

function Dock() {
  const [network, networkRef] = useState(null), [layers, layersRef] = useState(null);
  const [overlays, overlaysRef] = useState(null), [presentation, presentationRef] = useState(null);
  const [nodes, setNodes] = useState(false);
  const [pieSize, setPieSize] = useState(1);
  const [showDataBubbles, setShowDataBubbles] = useState(true);
  return <>
    <AtlasWorkspacePanels>
      <aside aria-label="Model controls">
        <AtlasMapControlSlots {...{ networkRef, layersRef, overlaysRef, presentationRef }}
          showDataBubbles={showDataBubbles} onDataBubblesChange={setShowDataBubbles}
          piesAvailable pieSize={pieSize} onPieSizeChange={setPieSize} />
        <WorkspaceLauncher title="Geography Domain"><button>Apply geography</button></WorkspaceLauncher>
      </aside>
    </AtlasWorkspacePanels>
    <AtlasControlPortal consolidated target={network}><select aria-label="Network carrier"><option>Electricity</option></select></AtlasControlPortal>
    <AtlasControlPortal consolidated target={layers}><div role="group" aria-label="Map layers and display">
      <button aria-pressed={nodes} onClick={() => setNodes(!nodes)}>Nodes</button>
    </div></AtlasControlPortal>
    <AtlasControlPortal consolidated target={overlays}><button>Land</button><button>Access</button></AtlasControlPortal>
    <AtlasControlPortal consolidated target={presentation}><div role="toolbar" aria-label="Presentation and evidence tools"><button>Present</button><button>Scenes</button><button>Compare</button><button>Find a site</button></div></AtlasControlPortal>
  </>;
}

test('one Map display click opens the standard sidebar without inline or floating duplicates', () => {
  const view = render(<Dock />), menu = within(view.getByRole('complementary', { name: 'Model controls' }));
  expect(menu.queryByRole('combobox')).not.toBeInTheDocument();
  expect(view.queryByRole('button', { name: 'Nodes' })).not.toBeInTheDocument();
  fireEvent.click(menu.getByRole('button', { name: 'Map display', exact: true }));
  const sidebar = within(view.getByRole('complementary', { name: 'Map display', exact: true }));
  expect(menu.getByRole('button', { name: 'Map display' })).toHaveAttribute('aria-expanded', 'true');
  expect(sidebar.getByRole('combobox', { name: 'Network carrier' })).toBeInTheDocument();
  expect(sidebar.getByRole('group', { name: 'Map layers and display' })).toBeInTheDocument();
  for (const name of ['Nodes', 'Land', 'Access', 'Present', 'Scenes', 'Compare', 'Find a site']) {
    expect(view.getAllByRole('button', { name, exact: true })).toHaveLength(1);
    expect(sidebar.getByRole('button', { name, exact: true })).toBeInTheDocument();
  }
  fireEvent.click(sidebar.getByRole('button', { name: 'Nodes' }));
  expect(sidebar.getByRole('button', { name: 'Nodes' })).toHaveAttribute('aria-pressed', 'true');
});

test('Map display retains layer settings across close, reopen and workspace switches', () => {
  const view = render(<Dock />);
  const launcher = view.getByRole('button', { name: 'Map display', exact: true });
  fireEvent.click(launcher);
  fireEvent.click(view.getByRole('button', { name: 'Nodes' }));
  fireEvent.click(view.getByRole('button', { name: 'Close Map display' }));
  expect(view.queryByRole('button', { name: 'Nodes' })).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  fireEvent.click(launcher);
  expect(view.getByRole('button', { name: 'Nodes' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(view.getByRole('button', { name: 'Geography Domain' }));
  expect(view.queryByRole('complementary', { name: 'Map display' })).not.toBeInTheDocument();
  expect(view.getByRole('button', { name: 'Apply geography' })).toBeVisible();
  fireEvent.click(launcher);
  expect(view.queryByRole('button', { name: 'Apply geography' })).not.toBeInTheDocument();
  expect(view.getByRole('button', { name: 'Nodes' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(view.queryByRole('complementary', { name: 'Map display' })).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
});

test('a dock mounting or switching tabs never leaks a floating duplicate', () => {
  const view = render(<AtlasControlPortal consolidated target={null}><button>Scenes</button></AtlasControlPortal>);
  expect(view.queryByRole('button')).not.toBeInTheDocument();
  const target = document.createElement('aside'); document.body.appendChild(target);
  view.rerender(<AtlasControlPortal consolidated target={target}><button>Scenes</button></AtlasControlPortal>);
  expect(within(target).getByRole('button', { name: 'Scenes' })).toBeInTheDocument();
  expect(view.container.querySelector('button')).toBeNull();
  view.unmount(); target.remove();
});

test('pie sizing is in Map display and retained across closing and reopening the sidebar', () => {
  const view = render(<Dock />);
  fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
  const sidebar = within(view.getByRole('complementary', { name: 'Map display', exact: true }));
  fireEvent.input(sidebar.getByRole('slider', { name: 'Pie size' }), { target: { value: '180' } });
  fireEvent.click(sidebar.getByRole('button', { name: 'Close Map display' }));
  fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
  expect(view.getByRole('slider', { name: 'Pie size' })).toHaveValue('180');
  fireEvent.click(view.getByRole('button', { name: 'Reset pie size' }));
  expect(view.getByRole('slider', { name: 'Pie size' })).toHaveValue('100');
});

test('the standalone renderer keeps its existing fallback when no dock is configured', () => {
  const view = render(<AtlasControlPortal><button>Scenes</button></AtlasControlPortal>);
  expect(view.getByRole('button', { name: 'Scenes' })).toBeInTheDocument();
});

test('Map display exposes one keyboard-accessible reset action and respects the busy guard', () => {
  const onReset = jest.fn();
  const view = render(<AtlasWorkspacePanels><AtlasMapControlSlots onReset={onReset} /></AtlasWorkspacePanels>);
  fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
  const reset = view.getByRole('button', { name: 'Reset map display' });
  expect(reset).toHaveAttribute('type', 'button');
  fireEvent.click(reset); expect(onReset).toHaveBeenCalledTimes(1);
  expect(view.getByRole('complementary', { name: 'Map display', exact: true })).toBeVisible();
  view.rerender(<AtlasWorkspacePanels><AtlasMapControlSlots onReset={onReset} resetDisabled /></AtlasWorkspacePanels>);
  expect(reset).toBeDisabled();
  fireEvent.click(reset); expect(onReset).toHaveBeenCalledTimes(1);
});

test('bubbles and pies can be hidden independently of nodes and stay hidden across workspace switches', () => {
  const view = render(<Dock />);
  const launcher = view.getByRole('button', { name: 'Map display', exact: true });
  fireEvent.click(launcher);
  fireEvent.click(view.getByRole('button', { name: 'Nodes' }));
  fireEvent.click(view.getByRole('button', { name: 'Bubbles & pies' }));
  expect(view.getByRole('button', { name: 'Bubbles & pies' })).toHaveAttribute('aria-pressed', 'false');
  expect(view.getByRole('button', { name: 'Nodes' })).toHaveAttribute('aria-pressed', 'true');
  expect(view.queryByRole('slider', { name: 'Pie size' })).not.toBeInTheDocument();
  fireEvent.click(view.getByRole('button', { name: 'Geography Domain' }));
  fireEvent.click(launcher);
  expect(view.getByRole('button', { name: 'Bubbles & pies' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(view.getByRole('button', { name: 'Bubbles & pies' }));
  expect(view.getByRole('slider', { name: 'Pie size' })).toHaveValue('100');
});
