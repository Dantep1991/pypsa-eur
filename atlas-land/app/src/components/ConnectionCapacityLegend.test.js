import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ConnectionCapacityLegend from './ConnectionCapacityLegend';
import { connectionCapacityScales, formatCapacity } from '../connectionCapacity';

test('each physical unit has its own labelled legend with colour-aligned midpoint', () => {
  const scales = connectionCapacityScales([{ s_nom: 503 }, { s_nom: 1787 }, { p_nom: 400 }, { p_nom: 600 }]);
  render(<ConnectionCapacityLegend scales={scales} />);
  for (const scale of scales) {
    const group = within(screen.getByRole('group', { name: `${scale.units} capacity scale` }));
    expect(group.getByText(formatCapacity(scale.mid))).toBeTruthy();
    expect(group.getByText('2 rated links')).toBeTruthy();
  }
  expect(screen.getByText('Each unit has its own scale.')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Connection capacity legend' }).className).toContain('bottom-20');
});

test('uniform and absent ratings do not imply a varying capacity scale', () => {
  const view = render(<ConnectionCapacityLegend scales={connectionCapacityScales([{ p_nom: 600 }, { p_nom: 600 }])} />);
  expect(screen.getByText('All rated links: 600 MW')).toBeTruthy();
  expect(screen.queryByText(/Log scale/)).toBeNull();
  view.rerender(<ConnectionCapacityLegend scales={[]} />);
  expect(screen.queryByRole('region')).toBeNull();
});
