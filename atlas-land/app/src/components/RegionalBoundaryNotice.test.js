import React from 'react';
import { render } from '@testing-library/react';
import RegionalBoundaryNotice from './RegionalBoundaryNotice';

test('no notice for complete boundaries or before geometry is read', () => {
  const view = render(<RegionalBoundaryNotice />);
  expect(view.queryByRole('status')).toBeNull();
});
test('reports missing outlines once, with exact per-region coverage in the description', () => {
  const view = render(<RegionalBoundaryNotice incomplete={[
    { name: 'First', shownCountries: ['AT', 'BG'], missingCountries: ['XK'], total: 3 },
    { name: 'Second', shownCountries: [], missingCountries: ['XK', 'XX'], total: 2 },
  ]} />);
  const notice = view.getByRole('status', { name: 'Regional boundary coverage' });
  expect(notice.textContent).toBe(' · Outline missing: XK, XX');
  expect(notice.title).toContain('First: 2/3 country outlines; missing XK');
  expect(notice.title).toContain('Second: 0/2 country outlines; missing XK, XX');
  view.rerender(<RegionalBoundaryNotice incomplete={[]} />);
  expect(view.queryByRole('status')).toBeNull();
});
