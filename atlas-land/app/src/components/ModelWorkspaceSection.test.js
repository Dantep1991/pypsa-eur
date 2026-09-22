import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Layers } from 'lucide-react';
import ModelWorkspaceSection from './ModelWorkspaceSection';

test('starts collapsed and reveals its controls on demand', () => {
  render(
    <ModelWorkspaceSection title="Results" summary="Solved outputs" Icon={Layers}>
      <button type="button">Show on map</button>
    </ModelWorkspaceSection>,
  );

  const trigger = screen.getByRole('button', { name: /results solved outputs/i });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Show on map' })).not.toBeInTheDocument();

  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Show on map' })).toBeInTheDocument();
});
