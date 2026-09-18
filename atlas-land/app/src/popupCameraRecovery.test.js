import { fireEvent } from '@testing-library/react';
import L from 'leaflet';
import { installPopupCameraRecovery } from './popupCameraRecovery';

function fixture() {
  const container = document.createElement('div');
  const element = document.createElement('div');
  const button = document.createElement('button');
  button.className = 'leaflet-popup-close-button';
  element.append(button);
  container.append(element);
  document.body.append(container);
  const events = new Map();
  const popup = { getElement: () => element, options: { closeOnEscapeKey: true } };
  const map = {
    center: { lat: 50.5, lng: 4.5 }, zoom: 7,
    getContainer: () => container, getCenter: () => map.center, getZoom: () => map.zoom,
    on: (names, fn) => names.split(' ').forEach(name => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); }),
    off: (names, fn) => names.split(' ').forEach(name => events.get(name)?.delete(fn)),
    emit: (name, value = {}) => [...(events.get(name) || [])].forEach(fn => fn(value)),
    stop: jest.fn(),
    setView: jest.fn((center, zoom) => {
      map.emit('movestart'); map.center = { lat: center[0], lng: center[1] }; map.zoom = zoom; map.emit('moveend');
    }),
  };
  const dispose = installPopupCameraRecovery(map);
  const autoPan = (lat = 52) => { map.emit('autopanstart'); map.emit('movestart'); map.center = { lat, lng: 4.5 }; map.emit('moveend'); };
  const open = () => { autoPan(); map.emit('popupopen', { popup }); };
  const close = () => map.emit('popupclose', { popup });
  button.addEventListener('click', close);
  const cleanup = () => { dispose(); container.remove(); };
  return { map, container, element, button, popup, autoPan, open, close, cleanup, events };
}

test('closing after repeated popup auto-pans restores the original camera once', () => {
  const f = fixture();
  try {
    f.open(); f.autoPan(53);
    fireEvent.click(f.button);
    expect(f.map.setView).toHaveBeenCalledWith([50.5, 4.5], 7, { animate: false });
    expect(f.map.stop).toHaveBeenCalledTimes(1);
    f.close();
    expect(f.map.setView).toHaveBeenCalledTimes(1);
  } finally { f.cleanup(); }
});

test.each(['dragstart', 'zoomstart', 'resize', 'movestart'])('%s discards recovery before a later close', event => {
  const f = fixture();
  try {
    f.open(); f.map.emit(event); fireEvent.click(f.button);
    expect(f.map.setView).not.toHaveBeenCalled();
  } finally { f.cleanup(); }
});

test('automatic closure and popup replacement do not restore the old view', () => {
  const f = fixture();
  try {
    f.open(); f.close();
    expect(f.map.setView).not.toHaveBeenCalled();
    f.open(); fireEvent.click(f.button);
    expect(f.map.setView).toHaveBeenCalledWith([52, 4.5], 7, { animate: false });
  } finally { f.cleanup(); }
});

test('Escape restores only when the same key event actually closes the popup', async () => {
  const f = fixture();
  try {
    f.open();
    fireEvent.keyDown(f.container, { key: 'Escape' });
    await new Promise(resolve => setTimeout(resolve, 0));
    f.close();
    expect(f.map.setView).not.toHaveBeenCalled();
    f.open();
    f.container.addEventListener('keydown', f.close);
    fireEvent.keyDown(f.container, { key: 'Escape' });
    expect(f.map.setView).toHaveBeenCalledTimes(1);
  } finally { f.cleanup(); }
});

test('close without auto-pan and disabled Escape cannot move the camera', () => {
  const f = fixture();
  try {
    f.map.emit('popupopen', { popup: f.popup }); fireEvent.click(f.button);
    f.open(); f.popup.options.closeOnEscapeKey = false;
    f.container.addEventListener('keydown', f.close);
    fireEvent.keyDown(f.container, { key: 'Escape' });
    expect(f.map.setView).not.toHaveBeenCalled();
  } finally { f.cleanup(); }
});

test('native-event microtask checkpoints cannot disarm capture before the closing listener', async () => {
  const f = fixture();
  try {
    f.open();
    fireEvent.keyDown(f.container, { key: 'Escape' });
    await Promise.resolve();
    f.close();
    expect(f.map.setView).toHaveBeenCalledWith([50.5, 4.5], 7, { animate: false });
  } finally { f.cleanup(); }
});

test('unmount removes all observers and cancels an armed close', async () => {
  const f = fixture();
  f.open(); fireEvent.keyDown(f.container, { key: 'Escape' });
  f.cleanup();
  expect([...f.events.values()].every(set => set.size === 0)).toBe(true);
  f.close(); await Promise.resolve();
  expect(f.map.setView).not.toHaveBeenCalled();
});

test('real Leaflet auto-pan/close ordering restores the camera while ordinary closure leaves it shifted', () => {
  const container = document.createElement('div');
  Object.defineProperties(container, { clientWidth: { value: 1280 }, clientHeight: { value: 720 } });
  document.body.append(container);
  const map = L.map(container, { zoomAnimation: false, fadeAnimation: false }).setView([50.5, 4.5], 7);
  const panBy = map.panBy.bind(map);
  jest.spyOn(map, 'panBy').mockImplementation(offset => panBy(offset, { animate: false }));
  const show = () => L.popup({ autoPanPaddingTopLeft: [12, 190] })
    .setLatLng([53, 4.5]).setContent('Asset details').openOn(map);
  let dispose = () => {};
  try {
    const original = map.getCenter();
    show();
    const shifted = map.getCenter();
    expect(shifted.equals(original)).toBe(false);
    fireEvent.click(container.querySelector('.leaflet-popup-close-button'));
    expect(map.getCenter().equals(shifted)).toBe(true);
    map.setView(original, 7, { animate: false });
    dispose = installPopupCameraRecovery(map);
    show();
    expect(map.getCenter().equals(original)).toBe(false);
    fireEvent.click(container.querySelector('.leaflet-popup-close-button'));
    expect(map.getCenter().equals(original)).toBe(true);
    expect(map.getZoom()).toBe(7);
  } finally { dispose(); map.remove(); container.remove(); }
});
