import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelControlHelp from './ModelControlHelp';

test('model explanation is hidden until its question-mark button is opened', () => {
  render(<ModelControlHelp label="Network geography"><p>Native bidding zones can be aggregated.</p></ModelControlHelp>);
  const button = screen.getByRole('button', { name: 'About Network geography' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Native bidding zones can be aggregated.')).toBeNull();

  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('note', { name: 'About Network geography' }).textContent).toContain('Native bidding zones can be aggregated.');

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('note', { name: 'About Network geography' })).toBeNull();
});
