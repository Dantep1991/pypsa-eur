import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import AtlasPresentation from './AtlasPresentation';
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
