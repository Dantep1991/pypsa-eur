import React from 'react';
import { render } from '@testing-library/react';
import ModelNetworkCoverage from './ModelNetworkCoverage';

test('coverage stays unknown until the renderer reports counts, and preserves actual zero', () => {
  const view = render(<ModelNetworkCoverage />);
  expect(view.container.textContent).toBe('Mapped locations —Mapped connections —');
  view.rerender(<ModelNetworkCoverage mappedLocations={118} mappedConnections={0} />);
  expect(view.container.textContent).toBe('Mapped locations 118Mapped connections 0');
});
