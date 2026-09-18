import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { COMPACT_ATLAS_QUERY, useAtlasWorkspaceLayout } from './useAtlasWorkspaceLayout';
import { useAtlasPanelCoordinator } from './useAtlasPanelCoordinator';

function mockViewport(matches) {
  const listeners = new Set();
  const query = {
    matches,
    addEventListener: jest.fn((type, fn) => listeners.add(fn)),
    removeEventListener: jest.fn((type, fn) => listeners.delete(fn)),
  };
  window.matchMedia = jest.fn(() => query);
  return {
    query,
    resize: (next) => act(() => {
      query.matches = next;
      listeners.forEach((fn) => fn());
    }),
  };
}

const originalMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = originalMatchMedia; });

test('compact windows start with a clear map; manual opening is retained until a breakpoint crossing', () => {
  const viewport = mockViewport(true);
  const { result, unmount } = renderHook(useAtlasWorkspaceLayout);
  expect(window.matchMedia).toHaveBeenCalledWith(COMPACT_ATLAS_QUERY);
  expect(result.current.domainsCollapsed).toBe(true);
  act(() => result.current.setDomainsCollapsed(false));
  expect(result.current.domainsCollapsed).toBe(false);
  viewport.resize(false);
  expect(result.current.domainsCollapsed).toBe(false);
  viewport.resize(true);
  expect(result.current.domainsCollapsed).toBe(true);
  viewport.resize(false);
  expect(result.current.domainsCollapsed).toBe(true);
  unmount();
  expect(viewport.query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
});

function usePanels(compact) {
  const [assistant, setAssistant] = useState(false);
  const [carriers, setCarriers] = useState(false);
  const [land, setLand] = useState({ panelOpen: true, enabled: true, countries: ['FR'] });
  const [access, setAccess] = useState({ panelOpen: false, enabled: true, metric: 'queued_mw' });
  const [domainsCollapsed, setDomainsCollapsed] = useState(false);
  const focus = useAtlasPanelCoordinator({ compact, setAssistant, setCarriers, setLand, setAccess, setDomainsCollapsed });
  return { assistant, carriers, land, access, domainsCollapsed, focus };
}

test.each(['assistant', 'carriers', 'land', 'access'])('compact %s panel collapses domains without changing data/filter state', (panel) => {
  const { result } = renderHook(() => usePanels(true));
  act(() => result.current.focus(panel));
  expect(result.current.domainsCollapsed).toBe(true);
  expect(result.current.assistant).toBe(panel === 'assistant');
  expect(result.current.carriers).toBe(panel === 'carriers');
  expect(result.current.land).toEqual({ panelOpen: panel === 'land', enabled: true, countries: ['FR'] });
  expect(result.current.access).toEqual({ panelOpen: panel === 'access', enabled: true, metric: 'queued_mw' });
  act(() => result.current.focus('domains'));
  expect(result.current.domainsCollapsed).toBe(false);
  expect(result.current.assistant).toBe(false);
  expect(result.current.carriers).toBe(false);
  expect(result.current.land.panelOpen).toBe(false);
  expect(result.current.access.panelOpen).toBe(false);
});

test('wide windows allow domains and one right-side panel simultaneously', () => {
  const { result } = renderHook(() => usePanels(false));
  act(() => result.current.focus('assistant'));
  act(() => result.current.focus('domains'));
  expect(result.current.assistant).toBe(true);
  expect(result.current.domainsCollapsed).toBe(false);
});

test('closing a panel never reopens domains and invalid targets fail before changing state', () => {
  const { result } = renderHook(() => usePanels(true));
  act(() => result.current.focus('assistant'));
  act(() => result.current.focus(null));
  expect(result.current.domainsCollapsed).toBe(true);
  expect(result.current.assistant).toBe(false);
  expect(() => result.current.focus('invalid')).toThrow('Unknown Atlas control panel');
});
