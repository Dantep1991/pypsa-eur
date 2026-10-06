import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import ModelGeographyTabs from './ModelGeographyTabs';

test('separates country controls and mixed resolution without resetting mounted inputs', () => {
  const view = render(<ModelGeographyTabs network={<input aria-label="Country" defaultValue="Spain" />}
    mixed={<input aria-label="Levels" defaultValue="3" />} />);
  expect(view.getByLabelText('Country')).toBeVisible();
  expect(view.getByLabelText('Levels')).not.toBeVisible();
  fireEvent.click(view.getByRole('tab', { name: 'Mixed resolution' }));
  fireEvent.change(view.getByLabelText('Levels'), { target: { value: '4' } });
  expect(view.getByLabelText('Country')).not.toBeVisible();
  fireEvent.click(view.getByRole('tab', { name: 'Network & countries' }));
  fireEvent.keyDown(view.getByRole('tab', { name: 'Network & countries' }), { key: 'ArrowRight' });
  expect(view.getByRole('tab', { name: 'Mixed resolution' })).toHaveFocus();
  expect(view.getByLabelText('Levels')).toHaveValue('4');
});
