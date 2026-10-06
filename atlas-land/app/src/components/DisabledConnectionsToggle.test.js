import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import DisabledConnectionsToggle from './DisabledConnectionsToggle';

test('toggle communicates show/hide state and emits only a display preference', () => {
  const onChange = jest.fn();
  const view = render(<DisabledConnectionsToggle count={7} visible onChange={onChange} />);
  const button = view.getByRole('button', { name: 'Show disabled connections' });
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.textContent).toContain('Shown');
  fireEvent.click(button);
  expect(onChange).toHaveBeenCalledWith(false);
  view.rerender(<DisabledConnectionsToggle count={7} visible={false} onChange={onChange} />);
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(button.textContent).toContain('Hidden');
  fireEvent.click(button);
  expect(onChange).toHaveBeenLastCalledWith(true);
});
test('no extra map control appears for a model without disabled connections', () => {
  const view = render(<DisabledConnectionsToggle count={0} visible onChange={jest.fn()} />);
  expect(view.queryByRole('button')).toBeNull();
});
