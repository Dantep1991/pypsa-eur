import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelResultsControls from './ModelResultsControls';

const catalogStatus = {
  state: 'ready',
  catalog: {
    model_version: 'v3.0.0',
    runs: [{
      run_id: 'run-1',
      label: 'Run 1',
      compatible: true,
      periods: ['2030'],
      period_granularity: 'annual',
      quantities: [
        { id: 'Node.Price', class_name: 'Node', property_name: 'Price', unit: '$/MWh', periods: ['2030'] },
        { id: 'Node.Load', class_name: 'Node', property_name: 'Load', unit: 'GWh', periods: ['2030'] },
        { id: 'Line.Flow', class_name: 'Line', property_name: 'Flow', unit: 'GWh', periods: ['2030'] },
      ],
    }],
  },
};

test('filters quantities by category and exposes a node or region scope', () => {
  const onSelectionChange = jest.fn();
  render(
    <ModelResultsControls
      catalogStatus={catalogStatus}
      selection={{ runId: 'run-1', category: 'Node', quantityId: 'Node.Price', className: 'Node', propertyName: 'Price', unit: '$/MWh', period: '2030', scopeId: '' }}
      resultStatus={{ state: 'idle', scene: null }}
      scopeOptions={[{ id: 'Node:BE00', label: 'BE00 · BE' }]}
      onSelectionChange={onSelectionChange}
      onShow={() => {}}
      onClear={() => {}}
    />,
  );

  expect(screen.getByRole('option', { name: 'Node · Price ($/MWh)' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Line · Flow (GWh)' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'BE00 · BE' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Result category'), { target: { value: 'Line' } });
  expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({
    category: 'Line',
    quantityId: 'Line.Flow',
    className: 'Line',
  }));
});
