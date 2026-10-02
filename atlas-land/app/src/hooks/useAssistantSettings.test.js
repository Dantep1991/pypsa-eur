import React from 'react';
import { act, fireEvent, render, cleanup } from '@testing-library/react';
import { SHORT_ASSISTANT_QUERY, useAssistantSettings } from './useAssistantSettings';

function Panel() {
  const settings = useAssistantSettings();
  return <>
    <button ref={settings.toggleRef} aria-expanded={settings.expanded}
      aria-controls={settings.panelId} onClick={settings.toggle}>Settings</button>
    <div id={settings.panelId} ref={settings.panelRef} hidden={!settings.expanded}>
      <input aria-label="Microphone choice" defaultValue="My microphone" />
    </div>
    <div data-testid="conversation" hidden={settings.coverConversation}>Conversation</div>
  </>;
}

let originalMatchMedia;
let query;
let listener;
beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  query = { matches: false, addEventListener: jest.fn((type, fn) => { listener = fn; }), removeEventListener: jest.fn() };
  window.matchMedia = jest.fn(() => query);
});
afterEach(() => { cleanup(); window.matchMedia = originalMatchMedia; });

test('normal-height settings start collapsed and retain their values when reopened', () => {
  const view = render(<Panel />);
  const button = view.getByRole('button', { name: 'Settings' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(button);
  const input = view.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'External microphone' } });
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(view.queryByRole('textbox')).toBeNull();
  fireEvent.click(button);
  expect(view.getByRole('textbox').value).toBe('External microphone');
  expect(window.matchMedia).toHaveBeenCalledWith(SHORT_ASSISTANT_QUERY);
});

test('short-height settings start collapsed and alternate with the conversation', () => {
  query.matches = true;
  const view = render(<Panel />);
  const button = view.getByRole('button', { name: 'Settings' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(view.getByTestId('conversation').hidden).toBe(false);
  fireEvent.click(button);
  expect(view.getByTestId('conversation').hidden).toBe(true);
  expect(view.getByRole('textbox')).toBeDefined();
  fireEvent.click(button);
  expect(view.getByTestId('conversation').hidden).toBe(false);
});

test('height breakpoint moves focus out of collapsing settings and cleans up its listener', () => {
  const view = render(<Panel />);
  fireEvent.click(view.getByRole('button', { name: 'Settings' }));
  view.getByRole('textbox').focus();
  act(() => { query.matches = true; listener(); });
  expect(document.activeElement).toBe(view.getByRole('button', { name: 'Settings' }));
  expect(view.queryByRole('textbox')).toBeNull();
  act(() => { query.matches = false; listener(); });
  expect(view.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  view.unmount();
  expect(query.removeEventListener).toHaveBeenCalledWith('change', listener);
});
