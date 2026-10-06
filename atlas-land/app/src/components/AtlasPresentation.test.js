import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import AtlasPresentation from './AtlasPresentation';
import { atlasPresentationDocument, setAtlasFullscreen } from '../atlasFullscreen';
jest.mock('../atlasFullscreen', () => ({ atlasPresentationDocument: jest.fn(),
  setAtlasFullscreen: jest.fn().mockResolvedValue(undefined) }));
jest.mock('leaflet', () => {
  const shape = () => { const item = { addTo: () => item, bindTooltip: () => item, on: () => item, remove: jest.fn() }; return item; };
  return { layerGroup: shape, circle: shape, circleMarker: shape, polyline: shape };
});

const map = { getCenter: () => ({ lat: 48, lng: 2 }), getZoom: () => 5, stop: jest.fn(), flyTo: jest.fn(),
  getContainer: () => document.createElement('div') };
const props = { map, facilities: [{ id: 'FR', country: 'FR', latitude: 48, longitude: 2, component_type: 'Bus' }],
  connections: [], countries: ['FR'], resolution: 'NUTS3', captureScene: () => ({ foo: 'bar' }), restoreScene: jest.fn(),
  onPresentationMode: jest.fn(), onInspectMode: jest.fn(), onSelect: jest.fn() };
beforeAll(() => { window.matchMedia = () => ({ matches: false }); });
beforeEach(() => { jest.clearAllMocks(); atlasPresentationDocument.mockReturnValue(document); setAtlasFullscreen.mockResolvedValue(undefined); });

test('workspace panel handoffs report visibility and preserve saved scenes', () => {
  const onToolPanelOpenChange = jest.fn();
  let controller;
  const register = value => { controller = value; };
  const view = render(<AtlasPresentation {...props} onToolPanelOpenChange={onToolPanelOpenChange}
    toolPanelDismissRequest={0} registerAgentController={register} />);
  expect(onToolPanelOpenChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(view.getByRole('button', { name: 'Scenes', exact: true }));
  expect(onToolPanelOpenChange).toHaveBeenLastCalledWith(true);
  fireEvent.change(view.getByPlaceholderText('e.g. France in detail'), { target: { value: 'Saved map' } });
  fireEvent.click(view.getByRole('button', { name: 'Save current scene' }));
  view.rerender(<AtlasPresentation {...props} onToolPanelOpenChange={onToolPanelOpenChange}
    toolPanelDismissRequest={1} registerAgentController={register} />);
  expect(view.queryByRole('button', { name: 'Close presentation panel' })).not.toBeInTheDocument();
  expect(onToolPanelOpenChange).toHaveBeenLastCalledWith(false);
  expect(controller.getState().scenes).toEqual(['Saved map']);
  fireEvent.click(view.getByRole('button', { name: 'Find a site' }));
  expect(onToolPanelOpenChange).toHaveBeenLastCalledWith(true);
  view.unmount();
  expect(onToolPanelOpenChange).toHaveBeenLastCalledWith(false);
});

test('map display reset clears comparison, site options and active presentation without deleting saved scenes', async () => {
  let controller;
  const register = value => { controller = value; };
  const view = render(<AtlasPresentation {...props} registerAgentController={register} mapDisplayResetRequest={0} />);
  expect(setAtlasFullscreen).not.toHaveBeenCalled();
  await act(async () => { await controller.execute({ action: 'save_scene', name: 'Saved map' }); });
  await act(async () => { await controller.execute({ action: 'capture_baseline' }); });
  await act(async () => { await controller.execute({ action: 'set_comparison_split', split: 70 }); });
  await act(async () => { await controller.execute({ action: 'configure_sites', radius_km: 100, require_water: true, max_water_km: 10 }); });
  view.rerender(<AtlasPresentation {...props} registerAgentController={register} mapDisplayResetRequest={1} />);
  expect(controller.getState()).toMatchObject({ panel: '', baseline: null, comparing: false, split: 50,
    activeScene: null, radiusKm: 50, requireWater: false, maxWaterKm: 20, candidates: [],
    canResetPresentation: false, canUndo: false, scenes: ['Saved map'] });
  expect(setAtlasFullscreen).toHaveBeenCalledWith(false);
  expect(view.queryByRole('region', { name: 'sites panel' })).not.toBeInTheDocument();
  fireEvent.click(view.getByRole('button', { name: 'Scenes', exact: true }));
  expect(view.getByRole('button', { name: 'Saved map' })).toBeInTheDocument();
});

test('map display reset aborts site evidence so a late response cannot restore candidates', async () => {
  const originalFetch = global.fetch;
  let complete;
  global.fetch = jest.fn().mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  try {
    const view = render(<AtlasPresentation {...props} mapDisplayResetRequest={0} />);
    fireEvent.click(view.getByText('Find a site'));
    fireEvent.click(view.getByText('Screen around map centre'));
    const signal = global.fetch.mock.calls[0][1].signal;
    view.rerender(<AtlasPresentation {...props} mapDisplayResetRequest={1} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { complete({ ok: true, json: async () => ({ protected: true }) }); });
    fireEvent.click(view.getByText('Find a site'));
    expect(view.queryByText(/Land: /)).not.toBeInTheDocument();
  } finally { global.fetch = originalFetch; }
});

test('Present and Exit use the complete host fullscreen workspace', async () => {
  const view = render(<AtlasPresentation {...props} />);
  fireEvent.click(view.getByRole('button', { name: 'Present', exact: true }));
  await waitFor(() => expect(setAtlasFullscreen).toHaveBeenCalledWith(true));
  expect(props.onPresentationMode).toHaveBeenCalledWith(true);
  view.rerender(<AtlasPresentation {...props} presentationMode />);
  fireEvent.click(view.getByRole('button', { name: 'Exit presentation', exact: true }));
  await waitFor(() => expect(setAtlasFullscreen).toHaveBeenCalledWith(false));
  expect(props.onPresentationMode).toHaveBeenCalledWith(false);
});

test('host fullscreen exit updates presentation state and the map camera, then releases its listener', () => {
  const host = document.implementation.createHTMLDocument('Nohm host');
  atlasPresentationDocument.mockReturnValue(host);
  const remove = jest.spyOn(host, 'removeEventListener');
  const invalidateSize = jest.fn();
  const view = render(<AtlasPresentation {...props} map={{ ...map, invalidateSize }} presentationMode />);
  act(() => { host.dispatchEvent(new Event('fullscreenchange')); });
  expect(props.onPresentationMode).toHaveBeenCalledWith(false);
  expect(invalidateSize).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(remove).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
});

test('agent presentation uses the layout without attempting gesture-only browser fullscreen', async () => {
  let controller;
  render(<AtlasPresentation {...props} registerAgentController={value => { controller = value; }} />);
  await act(async () => { await controller.execute({ action: 'present' }); });
  expect(props.onPresentationMode).toHaveBeenCalledWith(true);
  expect(setAtlasFullscreen).not.toHaveBeenCalled();
});

test('a reloaded map restores Present layout when the Nohm host remains fullscreen', () => {
  const host = document.implementation.createHTMLDocument('Nohm host');
  Object.defineProperty(host, 'fullscreenElement', { value: host.documentElement });
  atlasPresentationDocument.mockReturnValue(host);
  render(<AtlasPresentation {...props} />);
  expect(props.onPresentationMode).toHaveBeenCalledWith(true);
  expect(setAtlasFullscreen).not.toHaveBeenCalled();
});

test('presentation mode keeps controls without duplicating the map title and counters', () => {
  const view = render(<AtlasPresentation {...props} presentationMode />);
  expect(view.getByRole('button', { name: 'Exit presentation' })).toBeInTheDocument();
  expect(view.getByRole('button', { name: 'Scenes' })).toBeInTheDocument();
  expect(view.queryByText('NOHM ATLAS')).not.toBeInTheDocument();
  expect(view.container.querySelector('.atlas-presentation-title')).toBeNull();
});

test('docked presentation keeps scenes across dock switches and does not duplicate controls or status', () => {
  const first = document.createElement('aside'), second = document.createElement('aside');
  document.body.append(first, second);
  let controller;
  const register = value => { controller = value; };
  const view = render(<AtlasPresentation {...props} consolidatedControls controlHost={first} registerAgentController={register} />);
  expect(view.container.querySelector('.atlas-experience-bar')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Scenes', exact: true }));
  fireEvent.change(view.getByPlaceholderText('e.g. France in detail'), { target: { value: 'Saved map' } });
  fireEvent.click(view.getByRole('button', { name: 'Save current scene' }));
  expect(controller.getState().scenes).toEqual(['Saved map']);
  view.rerender(<AtlasPresentation {...props} consolidatedControls controlHost={second} presentationMode registerAgentController={register} />);
  expect(first.querySelector('button')).toBeNull();
  expect(second.querySelectorAll('button')).toHaveLength(4);
  expect(view.getByRole('button', { name: 'Exit presentation' })).toBeInTheDocument();
  expect(controller.getState().scenes).toEqual(['Saved map']);
  expect(view.container.querySelector('.atlas-presentation-legend')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Exit presentation' }));
  expect(props.onPresentationMode).toHaveBeenCalledWith(false);
  view.unmount(); first.remove(); second.remove();
});

test('docked Compare opens the existing result comparison and Find a site still opens its panel', () => {
  const target = document.createElement('aside'); document.body.appendChild(target);
  const compare = jest.fn();
  const view = render(<AtlasPresentation {...props} consolidatedControls controlHost={target} onOpenResultComparison={compare} />);
  fireEvent.click(view.getByRole('button', { name: 'Compare', exact: true }));
  expect(compare).toHaveBeenCalledTimes(1);
  fireEvent.click(view.getByRole('button', { name: 'Find a site', exact: true }));
  expect(view.getByRole('region', { name: 'sites panel' })).toBeInTheDocument();
  view.unmount(); target.remove();
});

test('Visualise can keep its Compare launcher without a duplicate in the shared toolbar', () => {
  const view = render(<AtlasPresentation {...props} showComparisonAction={false} />);
  expect(view.queryByRole('button', { name: 'Compare', exact: true })).not.toBeInTheDocument();
  expect(view.getByRole('button', { name: 'Present' })).toBeInTheDocument();
  expect(view.getByRole('button', { name: 'Scenes' })).toBeInTheDocument();
  expect(view.getByRole('button', { name: 'Find a site' })).toBeInTheDocument();
});

test('selection opens one tabbed sidebar without requiring the removed Inspect toolbar button', () => {
  const view = render(<AtlasPresentation {...props} selection={{ kind: 'node', record: props.facilities[0] }} />);
  expect(view.queryByRole('button', { name: 'Inspect', exact: true })).not.toBeInTheDocument();
  expect(view.getAllByRole('region', { name: 'inspect panel' })).toHaveLength(1);
  expect(view.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  fireEvent.click(view.getByLabelText('Close presentation panel'));
  expect(props.onSelect).toHaveBeenCalledWith(null);
  expect(view.queryByRole('region', { name: 'inspect panel' })).not.toBeInTheDocument();
});

test('AI scene controls work while the agent is busy and expose observable state', async () => {
  let controller;
  const view = render(<AtlasPresentation {...props} agentBusy registerAgentController={value => { controller = value; }} />);
  await act(async () => { await controller.execute({ action: 'save_scene', name: 'France detail' }); });
  expect(controller.getState().scenes).toEqual(['France detail']);
  await act(async () => { await controller.execute({ action: 'restore_scene', name: 'France detail' }); });
  expect(props.restoreScene).toHaveBeenCalledWith({ foo: 'bar' });
  await expect(controller.execute({ action: 'restore_scene', name: 'Missing' })).rejects.toThrow('Choose a saved scene');
  await expect(controller.execute({ action: 'save_scene', name: 'France detail' })).rejects.toThrow('already exists');
  await act(async () => { await controller.execute({ action: 'delete_scene', name: 'France detail' }); });
  expect(controller.getState().scenes).toEqual([]);
  view.unmount(); expect(controller).toBeNull();
});

test('AI evidence controls validate prerequisites and preserve their parameters', async () => {
  let controller;
  render(<AtlasPresentation {...props} agentBusy registerAgentController={value => { controller = value; }} />);
  await expect(controller.execute({ action: 'show_comparison' })).rejects.toThrow('baseline');
  await act(async () => { await controller.execute({ action: 'capture_baseline' }); });
  expect(controller.getState().baseline).toBe('Saved baseline');
  await act(async () => { await controller.execute({ action: 'set_comparison_split', split: 70 }); });
  expect(controller.getState().split).toBe(70);
  await expect(controller.execute({ action: 'set_comparison_split', split: 101 })).rejects.toThrow('between');
  await act(async () => { await controller.execute({ action: 'inspect', asset_id: 'FR', asset_kind: 'node' }); });
  expect(props.onSelect).toHaveBeenCalledWith({ kind: 'node', record: props.facilities[0] });
  await expect(controller.execute({ action: 'inspect', asset_id: 'invented' })).rejects.toThrow('missing or ambiguous');
  await act(async () => { await controller.execute({ action: 'configure_sites', radius_km: 100, require_water: true, max_water_km: 10 }); });
  expect(controller.getState()).toMatchObject({ panel: 'sites', radiusKm: 100, requireWater: true, maxWaterKm: 10 });
  await act(async () => { await controller.execute({ action: 'present' }); });
  expect(props.onPresentationMode).toHaveBeenCalledWith(true);
});
test('named scenes are bounded and restore the captured state', () => {
  const view = render(<AtlasPresentation {...props} />);
  fireEvent.click(view.getByText('Scenes'));
  fireEvent.change(view.getByLabelText('Scene name'), { target: { value: 'France detail' } });
  fireEvent.click(view.getByText('Save current scene'));
  fireEvent.click(view.getByText('France detail'));
  expect(props.restoreScene).toHaveBeenCalledWith({ foo: 'bar' });
  for (let i = 0; i < 3; i += 1) fireEvent.click(view.getByText('Save current scene'));
  expect(view.getByText('Save current scene')).toBeDisabled();
});
test('baseline comparison needs a captured map and screening is explicitly indicative', () => {
  const view = render(<AtlasPresentation {...props} />);
  fireEvent.click(view.getByText('Compare'));
  expect(view.getByText('Show comparison')).toBeDisabled();
  fireEvent.click(view.getByText('Capture baseline'));
  expect(view.getByText('Show comparison')).toBeEnabled();
  fireEvent.click(view.getByText('Find a site'));
  expect(view.getByText(/not available parcels/)).toBeInTheDocument();
  expect(view.getByText('Screen around map centre')).toBeEnabled();
});
test('live land response is presented without claiming capacity or clearance', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ protected: true, land_cover: { label: 'Forest' } }) });
  try {
    const view = render(<AtlasPresentation {...props} />);
    fireEvent.click(view.getByText('Find a site'));
    fireEvent.click(view.getByText('Screen around map centre'));
    await waitFor(() => expect(view.getByText('Land: Forest')).toBeInTheDocument());
    expect(view.getByText('Protected-area flag — review exclusion')).toBeInTheDocument();
    expect(view.getByText(/Connection availability: Unknown/)).toBeInTheDocument();
    expect(global.fetch.mock.calls[0][0]).toContain('countries=FR');
  } finally { global.fetch = originalFetch; }
});
test('leaving the map aborts pending site evidence requests', () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
  try {
    const view = render(<AtlasPresentation {...props} />);
    fireEvent.click(view.getByText('Find a site'));
    fireEvent.click(view.getByText('Screen around map centre'));
    const signal = global.fetch.mock.calls[0][1].signal;
    view.unmount(); expect(signal.aborted).toBe(true);
  } finally { global.fetch = originalFetch; }
});
