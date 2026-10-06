import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import ModelResultLegend from './ModelResultLegend';

const scene = {
  selection: { class_name: 'Node', property_name: 'Price', map_mode: 'colour', period_label: '2050' },
  legend: { minimum: 12, maximum: 42, unit: 'EUR/MWh' },
  coverage: { mapped_row_count: 116 }, model_version: 'v1',
};

test('result card stays near the map bottom with a translucent background and opaque content', () => {
  const css = postcss.parse(fs.readFileSync(path.join(__dirname, 'ModelResultLegend.css'), 'utf8'));
  const resultRule = css.nodes.find(node => node.selector === ".atlas-result-legend[aria-label='Model result legend']");
  const declarations = Object.fromEntries(resultRule.nodes.map(node => [node.prop, node.value]));
  expect(declarations.bottom).toBe('max(16px, env(safe-area-inset-bottom))');
  expect(declarations.background).toBe('color-mix(in srgb, var(--atlas-map-surface) 72%, transparent)');
  expect(declarations.opacity).toBeUndefined();
  const shell = postcss.parse(fs.readFileSync(path.join(__dirname, '../index.css'), 'utf8'));
  shell.walkRules("[aria-label='Model result legend']", rule => {
    expect(rule.nodes.some(node => node.prop === 'background' && node.important)).toBe(false);
  });
});

test.each([
  ['decrease', '#22c55e', 'Lower: favourable · higher: unfavourable'],
  ['increase', '#ef4444', 'Higher: favourable · lower: unfavourable'],
  ['context_dependent', '#a3a3a3', 'Neutral · no favourable direction established'],
])('legend follows the %s model decision without reordering numeric endpoints', (preference, firstColour, label) => {
  const { container } = render(<ModelResultLegend scene={{ ...scene, color_policy: { preference },
    legend: { ...scene.legend, favourable_direction: preference } }} />);
  expect(container.querySelector('.atlas-result-legend__gradient').style.getPropertyValue('--atlas-result-colours').split(',')[0]).toBe(firstColour);
  expect(screen.getByText('12 EUR/MWh')).toBeVisible();
  expect(screen.getByText('42 EUR/MWh')).toBeVisible();
  expect(screen.getByText(label)).toBeVisible();
});

test.each(['colour', 'bubbles', 'mix'])('provides live circle sizing for %s without altering results', mode => {
  const onMarkerScaleChange = jest.fn(), onClear = jest.fn();
  const data = { ...scene, selection: { ...scene.selection, map_mode: mode } };
  const before = JSON.stringify(data);
  const view = render(<ModelResultLegend scene={data} markerScale={1} onMarkerScaleChange={onMarkerScaleChange} onClear={onClear} />);
  fireEvent.click(screen.getByText('Circle size', { selector: 'summary' }));
  const slider = screen.getByRole('slider', { name: 'Circle size' });
  expect(slider).toHaveValue('100');
  fireEvent.input(slider, { target: { value: '150' } });
  expect(onMarkerScaleChange).toHaveBeenCalledWith(1.5);
  expect(onClear).not.toHaveBeenCalled();
  expect(JSON.stringify(data)).toBe(before);
  view.rerender(<ModelResultLegend scene={data} markerScale={1.5} onMarkerScaleChange={onMarkerScaleChange} onClear={onClear} />);
  expect(slider).toHaveValue('150');
  fireEvent.click(screen.getByRole('button', { name: 'Reset circle size' }));
  expect(onMarkerScaleChange).toHaveBeenLastCalledWith(1);
  expect(screen.getByRole('complementary', { name: 'Model result legend' })).toHaveClass('atlas-result-legend');
  expect(screen.queryByText(/mapped|outside scope|Annual totals/)).not.toBeInTheDocument();
});

test('does not offer circle sizing for line results or an absent scene', () => {
  const view = render(<ModelResultLegend scene={{ ...scene, selection: { ...scene.selection, class_name: 'Line', map_mode: 'flow' } }} onMarkerScaleChange={jest.fn()} />);
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  view.rerender(<ModelResultLegend scene={null} onMarkerScaleChange={jest.fn()} />);
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

test('compact comparison legend retains the reversal swatch without the narrative card', () => {
  render(<ModelResultLegend scene={{ ...scene, comparison: { preference: 'increase', matched: 10 },
    selection: { ...scene.selection, class_name: 'Line', direction_supported: true } }} theme="light" />);
  expect(screen.getByText('Flow reversed')).toBeVisible();
  expect(screen.queryByText(/matched|Annual totals|Arrows|unmapped/)).not.toBeInTheDocument();
  expect(screen.getByText('Flow reversed').querySelector('i')).toHaveStyle({ background: '#1C7293' });
});

test('small nonzero derived values stay visible instead of being rounded to zero', () => {
  const view = render(<ModelResultLegend scene={{ ...scene, legend: { minimum: 0, maximum: 0.0014045199, unit: '%' } }} />);
  expect(screen.getByText('0.0014 %')).toBeVisible();
  expect(screen.getByText('0 %')).toBeVisible();
  view.rerender(<ModelResultLegend scene={{ ...scene, legend: { minimum: -0.0000007, maximum: 0.0000007, unit: '%' } }} />);
  expect(screen.getByText('7E-7 %')).toBeVisible();
  expect(screen.getByText('-7E-7 %')).toBeVisible();
});
