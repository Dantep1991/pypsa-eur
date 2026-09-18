import React, { StrictMode, useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { useMapTelemetry } from './useMapTelemetry';

function makeMap() {
  const events = new Map();
  const map = {
    zoom: 10, bounds: 'Paris',
    getZoom: () => map.zoom,
    getBounds: () => map.bounds,
    on: jest.fn((names, callback) => names.split(' ').forEach((name) => {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(callback);
    })),
    off: jest.fn((names, callback) => names.split(' ').forEach((name) => events.get(name)?.delete(callback))),
    emit: (name) => [...(events.get(name) || [])].forEach((callback) => callback({ target: map })),
    fitEurope: () => {
      map.emit('movestart');
      map.zoom = 4;
      map.bounds = 'Europe';
      map.emit('zoomend');
      map.emit('moveend');
    },
  };
  return map;
}

function Observer({ map, zoom, bounds, interaction }) {
  useMapTelemetry(map, { onZoomChange: zoom, onBoundsChange: bounds, onInteractionChange: interaction });
  return null;
}

test('publishes the actual first viewport even if the map already moved', () => {
  const map = makeMap();
  map.fitEurope();
  const bounds = jest.fn();
  const zoom = jest.fn();
  render(<Observer map={map} bounds={bounds} zoom={zoom} />);
  expect(bounds).toHaveBeenLastCalledWith('Europe');
  expect(zoom).toHaveBeenLastCalledWith(4);
});

test('country-fit effects cannot fall through a listener cleanup gap', () => {
  const map = makeMap();
  const bounds = jest.fn();
  function CountryFit({ europe }) {
    useEffect(() => { if (europe) map.fitEurope(); }, [europe]);
    return null;
  }
  function View({ europe = false }) {
    return <><CountryFit europe={europe} /><Observer map={map} bounds={(value) => bounds(value)} /></>;
  }
  const view = render(<View />);
  expect(bounds).toHaveBeenLastCalledWith('Paris');
  view.rerender(<View europe />);
  expect(bounds).toHaveBeenLastCalledWith('Europe');
  expect(map.off).not.toHaveBeenCalled();
});

test('fresh callbacks do not reattach listeners and only the latest callback runs', () => {
  const map = makeMap();
  const old = jest.fn();
  const current = jest.fn();
  const view = render(<Observer map={map} bounds={old} />);
  old.mockClear();
  for (let index = 0; index < 50; index += 1) {
    view.rerender(<Observer map={map} bounds={(value) => current(value)} />);
  }
  act(() => map.fitEurope());
  expect(old).not.toHaveBeenCalled();
  expect(current).toHaveBeenLastCalledWith('Europe');
  expect(map.on).toHaveBeenCalledTimes(2);
  expect(map.off).not.toHaveBeenCalled();
});

test('interaction settles and Strict Mode/unmount do not leak timers or events', () => {
  jest.useFakeTimers();
  const map = makeMap();
  const interaction = jest.fn();
  const bounds = jest.fn();
  const view = render(<StrictMode><Observer map={map} interaction={interaction} bounds={bounds} /></StrictMode>);
  act(() => map.fitEurope());
  expect(interaction).toHaveBeenLastCalledWith(true);
  act(() => jest.advanceTimersByTime(120));
  expect(interaction).toHaveBeenLastCalledWith(false);
  act(() => map.fitEurope());
  view.unmount();
  interaction.mockClear();
  bounds.mockClear();
  act(() => { map.fitEurope(); jest.runOnlyPendingTimers(); });
  expect(interaction).not.toHaveBeenCalled();
  expect(bounds).not.toHaveBeenCalled();
  jest.useRealTimers();
});
