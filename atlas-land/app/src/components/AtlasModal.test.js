import React, { StrictMode, useState } from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import AtlasModal from './AtlasModal';
import App from '../App';

jest.mock('./EnhancedLeafletMapWithVoice', () => () => <div data-testid="atlas-map" />);

// JSDOM lacks native showModal/close. Model only opening/focus/closing here;
// browser QA verifies native top-layer inertness and Tab/Escape behaviour.
const dialogPrototype = window.HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close');
let originalFetch;
beforeEach(() => {
  jest.useFakeTimers();
  originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ready: true, status: 'healthy', files: [], countries: [], data: [] }) }));
  Object.defineProperty(dialogPrototype, 'showModal', { configurable: true, value: jest.fn(function () {
    this.setAttribute('open', '');
    this.querySelector('button')?.focus();
  }) });
  Object.defineProperty(dialogPrototype, 'close', { configurable: true, value: jest.fn(function () {
    this.removeAttribute('open');
  }) });
});
afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  jest.useRealTimers();
});
afterAll(() => {
  for (const [key, descriptor] of [['showModal', originalShow], ['close', originalClose]]) {
    if (descriptor) Object.defineProperty(dialogPrototype, key, descriptor);
    else delete dialogPrototype[key];
  }
});

function Harness({ revision = 0 }) {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>More Settings</button>
    {open && <AtlasModal title="Model settings" description="Draft settings" onClose={() => setOpen(false)}
      footer={<button>Build Network</button>}>
      <label>Scenario<input defaultValue="Baseline" /></label>
      <span>{revision}</span>
    </AtlasModal>}
  </>;
}
function open(view) {
  const opener = view.getByRole('button', { name: 'More Settings' });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: view.getByRole('dialog', { name: 'Model settings' }) };
}

test('opens a named modal, gives the close control focus and returns focus when dismissed', () => {
  const view = render(<Harness />);
  const { opener, dialog } = open(view);
  expect(dialog).toHaveAccessibleDescription('Draft settings');
  expect(dialog.open).toBe(true);
  const close = within(dialog).getByRole('button', { name: 'Close model settings' });
  expect(close).toHaveFocus();
  fireEvent.click(close);
  expect(view.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(dialogPrototype.close).toHaveBeenCalledTimes(1);
});

test('native cancel requests close, prevents uncontrolled dismissal and restores focus', () => {
  const view = render(<Harness />);
  const { opener, dialog } = open(view);
  const cancel = new Event('cancel', { bubbles: false, cancelable: true });
  fireEvent(dialog, cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(view.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

test('a settings re-render does not re-open the modal or steal the edited field focus', () => {
  const view = render(<Harness revision={0} />);
  open(view);
  const input = view.getByRole('textbox', { name: 'Scenario' });
  input.focus();
  fireEvent.change(input, { target: { value: 'Draft' } });
  view.rerender(<Harness revision={1} />);
  expect(input).toHaveFocus();
  expect(input).toHaveValue('Draft');
  expect(dialogPrototype.showModal).toHaveBeenCalledTimes(1);
});

test('Strict Mode can clean up and reopen without leaving the dialog closed', () => {
  const view = render(<StrictMode><Harness /></StrictMode>);
  const { opener, dialog } = open(view);
  expect(dialog.open).toBe(true);
  expect(within(dialog).getByRole('button', { name: 'Close model settings' })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close model settings' }));
  expect(opener).toHaveFocus();
});

test('real App settings expose switch states and retain edits without starting a model', async () => {
  const view = render(<App />);
  await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
  const { dialog } = open(view);
  const switches = within(dialog).getAllByRole('switch');
  expect(switches).toHaveLength(40);
  switches.forEach((control) => {
    expect(control).toHaveAccessibleName();
    expect(['true', 'false']).toContain(control.getAttribute('aria-checked'));
  });
  const solar = within(dialog).getByRole('switch', { name: 'Solar', exact: true });
  const previous = solar.getAttribute('aria-checked');
  fireEvent.click(solar);
  expect(solar).toHaveAttribute('aria-checked', String(previous !== 'true'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close model settings' }));
  const { dialog: reopened } = open(view);
  expect(within(reopened).getByRole('switch', { name: 'Solar', exact: true })).toHaveAttribute('aria-checked', String(previous !== 'true'));
  expect(global.fetch.mock.calls.filter(([url, options]) => options?.method === 'POST' && /build|solve/.test(String(url)))).toEqual([]);
});
