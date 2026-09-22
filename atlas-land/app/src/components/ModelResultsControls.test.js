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
        { id: 'Node.Price', report_family: 'ST', class_name: 'Node', property_name: 'Price', unit: 'EUR/MWh', periods: ['2030'], categories: ['eMarket', 'Offshore'], category_objects: { eMarket: ['BE00', 'FR00'], Offshore: ['BE01'] } },
        { id: 'Node.Load', report_family: 'ST', class_name: 'Node', property_name: 'Load', unit: 'GWh', periods: ['2030'], categories: ['eMarket'] },
        { id: 'Line.Flow', report_family: 'ST', class_name: 'Line', property_name: 'Flow', unit: 'GWh', periods: ['2030'], categories: ['eMarket Reference'], supports_flow_map: true },
      ],
    }],
  },
};

test('keeps component classes separate from real Visualisation categories', () => {
  const onSelectionChange = jest.fn();
  render(
    <ModelResultsControls
      catalogStatus={catalogStatus}
      selection={{ runId: 'run-1', category: '', quantityId: 'Node.Price', reportFamily: 'ST', className: 'Node', propertyName: 'Price', unit: 'EUR/MWh', period: '2030', scopeId: '' }}
      resultStatus={{ state: 'idle', scene: null }}
      scopeOptions={[{ id: 'Node:BE00', label: 'BE00 · BE' }]}
      onSelectionChange={onSelectionChange}
      onShow={() => {}}
      onClear={() => {}}
    />,
  );

  expect(screen.getByRole('option', { name: 'Node · Price (EUR/MWh)' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Line · Flow (GWh)' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'All categories' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'eMarket' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Offshore' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'BE00 · BE' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Result component'), { target: { value: 'Line' } });
  expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({
    category: '',
    quantityId: 'Line.Flow',
    className: 'Line',
  }));

  fireEvent.change(screen.getByLabelText('Result category'), { target: { value: 'eMarket' } });
  expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({
    category: 'eMarket',
    categoryObjects: ['BE00', 'FR00'],
  }));
});
