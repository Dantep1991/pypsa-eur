import React, { StrictMode, useEffect, useRef } from 'react';
import { render } from '@testing-library/react';
import { shouldExecuteViewportCommand, applyViewportCommandOnce, clearAppliedViewportCommand } from './viewportCommand';

describe('viewport command consumption', () => {
  test('runs a new command exactly once', () => {
    expect(shouldExecuteViewportCommand(null, 'zoom-paris')).toBe(true);
    expect(shouldExecuteViewportCommand('zoom-paris', 'zoom-paris')).toBe(false);
  });

  test('allows a later command with a new id', () => {
    expect(shouldExecuteViewportCommand('zoom-paris', 'zoom-madrid')).toBe(true);
  });

  test('ignores missing command ids', () => {
    expect(shouldExecuteViewportCommand(null, null)).toBe(false);
    expect(shouldExecuteViewportCommand(null, '')).toBe(false);
  });
});

describe('one-shot Leaflet camera updates', () => {
  const makeMap = () => ({ stop: jest.fn(), setView: jest.fn(), setZoom: jest.fn() });

  test('claims the command before stop or movement can emit another render', () => {
    const consumed = { current: null };
    const map = makeMap();
    const move = jest.fn();
    const applied = jest.fn();
    map.stop.mockImplementation(() => {
      expect(applyViewportCommandOnce(consumed, 'paris', map, move, applied)).toBe(false);
    });
    expect(applyViewportCommandOnce(consumed, 'paris', map, move, applied)).toBe(true);
    expect(map.stop).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenCalledTimes(1);
    expect(applied).toHaveBeenCalledWith('paris');
    expect(map.stop.mock.invocationCallOrder[0]).toBeLessThan(move.mock.invocationCallOrder[0]);
  });

  test('Paris is not replayed by Strict Mode, fresh filter arrays, or manual zoom', () => {
    const map = makeMap();
    function Camera({ command, filters }) {
      const consumed = useRef(null);
      useEffect(() => {
        applyViewportCommandOnce(consumed, command.id, map, () => {
          map.setView([command.latitude, command.longitude], command.zoom);
        });
      }, [command, filters]);
      return null;
    }
    const command = { id: 'paris', latitude: 48.8566, longitude: 2.3522, zoom: 10 };
    const view = render(<StrictMode><Camera command={command} filters={[]} /></StrictMode>);
    map.setZoom(9); // User takes control after EMIL finishes.
    for (let i = 0; i < 30; i += 1) {
      view.rerender(<StrictMode><Camera command={{ ...command }} filters={[i]} /></StrictMode>);
    }
    expect(map.setView).toHaveBeenCalledTimes(1);
    expect(map.setView).toHaveBeenCalledWith([48.8566, 2.3522], 10);
    expect(map.stop).toHaveBeenCalledTimes(1);
    view.rerender(<StrictMode><Camera command={{ ...command, id: 'paris-again' }} filters={[]} /></StrictMode>);
    expect(map.setView).toHaveBeenCalledTimes(2);
  });

  test('acknowledgement clears a completed command but preserves a newer request', () => {
    const newer = { id: 'madrid' };
    expect(clearAppliedViewportCommand({ id: 'paris' }, 'paris')).toBeNull();
    expect(clearAppliedViewportCommand(newer, 'paris')).toBe(newer);
    expect(clearAppliedViewportCommand(null, 'paris')).toBeNull();
  });

  test('a map remount has no completed command left to execute', () => {
    const map = makeMap();
    let pending = { id: 'paris' };
    const move = jest.fn();
    applyViewportCommandOnce({ current: null }, pending.id, map, move, (id) => {
      pending = clearAppliedViewportCommand(pending, id);
    });
    applyViewportCommandOnce({ current: null }, pending?.id, map, move);
    expect(move).toHaveBeenCalledTimes(1);
  });
});
