import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ResultMarkerSizeControl from './ResultMarkerSizeControl';

test('starts at the readable default and supports both input events and reset', () => {
  const onChange = jest.fn();
  function Harness() {
    const [value, setValue] = useState(1);
    return <ResultMarkerSizeControl value={value} onChange={next => { setValue(next); onChange(next); }} />;
  }
  render(<Harness />);
  const slider = screen.getByRole('slider', { name: 'Circle size' });
  expect(slider).toHaveValue('100');
  expect(slider).toHaveAttribute('min', '50');
  expect(slider).toHaveAttribute('max', '200');
  expect(screen.getByRole('button', { name: 'Reset circle size' })).toBeDisabled();
  fireEvent.input(slider, { target: { value: '160' } });
  expect(onChange).toHaveBeenLastCalledWith(1.6);
  expect(slider).toHaveAttribute('aria-valuetext', '160 percent');
  fireEvent.change(slider, { target: { value: '50' } });
  expect(onChange).toHaveBeenLastCalledWith(0.5);
  fireEvent.click(screen.getByRole('button', { name: 'Reset circle size' }));
  expect(slider).toHaveValue('100');
});

test('two views share one scale and have distinct labelled slider identities', () => {
  function Harness() {
    const [value, setValue] = useState(1);
    return <><ResultMarkerSizeControl value={value} onChange={setValue} /><ResultMarkerSizeControl value={value} onChange={setValue} /></>;
  }
  render(<Harness />);
  const sliders = screen.getAllByRole('slider', { name: 'Circle size' });
  expect(sliders[0].id).not.toBe(sliders[1].id);
  fireEvent.input(sliders[0], { target: { value: '200' } });
  sliders.forEach(slider => expect(slider).toHaveValue('200'));
});
