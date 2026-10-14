import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import NetworkResolutionSlider from './NetworkResolutionSlider';

const levels = ['Bidding zone', 'e-Highway', 'NUTS1', 'NUTS2', 'NUTS3', 'Full / Nodal / 220 kV']
  .map((label, index) => ({ label, filename: `level-${index}.nc`, isFullNodal: index === 5 }));
const setup = (props = {}) => {
  const onPreview = jest.fn();
  const onCommit = jest.fn();
  const view = render(<NetworkResolutionSlider levels={levels} index={4}
    onPreview={onPreview} onCommit={onCommit} {...props} />);
  return { ...view, onPreview, onCommit };
};

test('labels are positioned at each thumb stop, including both endpoints', () => {
  setup();
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'NUTS3');
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(6);
  expect(buttons[0].style.left).toBe('calc(0% + 8px)');
  expect(buttons[4].style.left).toBe('calc(80% - 4.8px)');
  expect(buttons[5].style.left).toBe('calc(100% - 8px)');
  expect(buttons[4]).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getAllByRole('button', { name: 'Nodal' })).toHaveLength(1);
});

test('range previews and label clicks delegate to the same resolution indices', () => {
  const { onPreview, onCommit } = setup();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });
  expect(onPreview).toHaveBeenCalledWith(2);
  fireEvent.click(screen.getByRole('button', { name: 'NUTS2' }));
  expect(onCommit).toHaveBeenCalledWith(3);
});

test('loading locks both controls and mixed mode does not highlight a uniform level', () => {
  const { onPreview, onCommit } = setup({ disabled: true, mixed: true });
  expect(screen.getByRole('slider')).toBeDisabled();
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Mixed country resolution');
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
  }
  expect(onPreview).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
});

test('large catalogues keep the track and labels together in one scrollable scale', () => {
  const { container } = setup({ levels: [...levels, ...[5, 10, 25, 50, 100, 250, 500].map((n) => ({ label: String(n), filename: `c${n}.nc` }))] });
  const scale = container.querySelector('.network-resolution-slider__scale');
  expect(scale.style.minWidth).toBe('688px');
  expect(scale).toContainElement(screen.getByRole('slider'));
  for (const button of screen.getAllByRole('button')) expect(scale).toContainElement(button);
});
