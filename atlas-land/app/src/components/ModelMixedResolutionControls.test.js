import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import ModelMixedResolutionControls from './ModelMixedResolutionControls';

const props = { countries: ['ES', 'FR', 'PT'], nativeLabel: 'e-Highway',
  catalog: { native_resolution: 'ehighway' }, status: { state: 'idle' },
  countryName: code => ({ ES: 'Spain', FR: 'France', PT: 'Portugal' }[code]), onApply: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('geography is view-only; creation controls are available only with an explicit creation context', () => {
  const view = render(<ModelMixedResolutionControls {...props} />);
  expect(view.queryByRole('button', { name: 'Preview model schema' })).toBeNull();
  view.rerender(<ModelMixedResolutionControls {...props} modelContext={{ projectId: 'P', version: 'v1' }} />);
  expect(view.getByRole('button', { name: 'Preview model schema' })).toBeDisabled();
});

test('selecting Spain asks for levels and neighbour granularity before applying', () => {
  const view = render(<ModelMixedResolutionControls {...props} />);
  fireEvent.change(view.getByLabelText('Mixed-resolution focus country'), { target: { value: 'ES' } });
  expect(view.getByLabelText('Mixed-resolution number of levels')).toHaveValue('3');
  expect(view.getByLabelText('Direct neighbours granularity')).toHaveValue('native');
  expect(view.getByLabelText('Rest of model granularity')).toHaveValue('country');
  expect(props.onApply).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('Mixed-resolution number of levels'), { target: { value: '4' } });
  fireEvent.change(view.getByLabelText('Direct neighbours granularity'), { target: { value: 'bidding_zone' } });
  fireEvent.change(view.getByLabelText('2nd neighbour ring granularity'), { target: { value: 'country' } });
  fireEvent.click(view.getByRole('button', { name: 'Apply mixed view' }));
  expect(props.onApply).toHaveBeenCalledWith('ES', { levelCount: 4, resolutions: ['native', 'bidding_zone', 'country', 'country'] });
});

test.each([2, 3, 4, 5])('%i levels expose exactly one granularity choice per level', levels => {
  const view = render(<ModelMixedResolutionControls {...props} />);
  fireEvent.change(view.getByLabelText('Mixed-resolution number of levels'), { target: { value: String(levels) } });
  expect(view.getAllByRole('combobox')).toHaveLength(levels + 2);
});

test('unsupported finer geography is not offered', () => {
  const view = render(<ModelMixedResolutionControls {...props} nativeLabel="Country" catalog={{ native_resolution: 'country' }} />);
  expect(view.queryByRole('option', { name: 'Bidding Zone' })).not.toBeInTheDocument();
  expect(view.queryByRole('option', { name: /NUTS|Full/ })).not.toBeInTheDocument();
});

test('the applied choices survive reopening; changing focus does not display stale counts', () => {
  const profile = { focusCountry: 'ES', levelCount: 4, resolutions: ['native', 'bidding_zone', 'country', 'country'],
    levels: [{ tier: 'native', countries: ['ES'] }, { tier: 'bidding_zone', countries: ['FR', 'PT'] },
      { tier: 'country', countries: [] }, { tier: 'country', countries: [] }] };
  const preview = { meta: { preview: { profile, counts: { sourceNodes: 10, projectedNodes: 8, sourceLinks: 15, projectedLinks: 11 } } } };
  const view = render(<ModelMixedResolutionControls {...props} status={{ state: 'ready', preview }} />);
  expect(view.getByLabelText('Mixed-resolution focus country')).toHaveValue('ES');
  expect(view.getByLabelText('Mixed-resolution number of levels')).toHaveValue('4');
  expect(view.getByLabelText('Direct neighbours granularity')).toHaveValue('bidding_zone');
  expect(view.getByText(/10 mapped source nodes/)).toBeInTheDocument();
  fireEvent.change(view.getByLabelText('Mixed-resolution focus country'), { target: { value: 'FR' } });
  expect(view.queryByText(/10 mapped source nodes/)).not.toBeInTheDocument();
  expect(view.getByRole('status')).toHaveTextContent('Settings changed');
});

test('controls are disabled while a projection is being applied', () => {
  const view = render(<ModelMixedResolutionControls {...props} status={{ state: 'loading' }} />);
  view.getAllByRole('combobox').forEach(control => expect(control).toBeDisabled());
  expect(view.getByRole('button', { name: /Projecting/ })).toBeDisabled();
});

test.each(['ehighway', 'bidding_zone', 'country', 'mixed'])('%s models offer the same published regions as Network & countries', native => {
  const catalog = { native_resolution: native, regional_registry: { schemes: [{ id: 'published', name: 'Published regions',
    regions: [{ id: 'west', name: 'Western group', countries: ['ES', 'FR', 'PT'] }] }] } };
  const view = render(<ModelMixedResolutionControls {...props} catalog={catalog} />);
  fireEvent.change(view.getByLabelText('Rest of model granularity'), { target: { value: 'regional' } });
  expect(view.getByLabelText('Mixed regional scheme')).toHaveValue('published');
  expect(view.getByRole('button', { name: 'Apply mixed view' })).toBeDisabled();
  fireEvent.click(view.getByLabelText(/Western group/));
  fireEvent.click(view.getByRole('button', { name: 'Apply mixed view' }));
  expect(props.onApply).toHaveBeenCalledWith('ES', { levelCount: 3, resolutions: ['native', 'native', 'regional'],
    schemeId: 'published', regionIds: ['west'] });
});

test('changing published region selections invalidates applied counts', () => {
  const catalog = { native_resolution: 'ehighway', regional_registry: { schemes: [{ id: 'published', name: 'Published regions',
    regions: [{ id: 'west', name: 'Western group', countries: ['FR', 'PT'] }] }] } };
  const profile = { focusCountry: 'ES', levelCount: 2, resolutions: ['native', 'regional'], schemeId: 'published', regionIds: ['west'],
    levels: [{ countries: ['ES'] }, { countries: ['FR', 'PT'] }] };
  const view = render(<ModelMixedResolutionControls {...props} catalog={catalog}
    status={{ state: 'ready', preview: { meta: { preview: { profile, counts: { sourceNodes: 12 } } } } }} />);
  expect(view.getByText(/12 mapped source nodes/)).toBeInTheDocument();
  fireEvent.click(view.getByLabelText(/Western group/));
  expect(view.queryByText(/12 mapped source nodes/)).toBeNull();
  expect(view.getByRole('status')).toHaveTextContent('Settings changed');
});

test('the regional picker excludes focus and finer neighbour countries', () => {
  const catalog = { native_resolution: 'ehighway', regional_registry: { schemes: [{ id: 'published', name: 'Published', regions: [
    { id: 'focus', name: 'Focus group', countries: ['ES', 'FR'] }, { id: 'rest', name: 'Rest group', countries: ['BE'] }] }] } };
  const scene = { meta: { aggregationCatalog: catalog }, facilities: ['ES', 'FR', 'BE'].map(country => ({ country, id: country, component_type: 'Bus' })),
    connections: [{ from: 'ES', to: 'FR' }, { from: 'FR', to: 'BE' }] };
  const view = render(<ModelMixedResolutionControls {...props} countries={['ES', 'FR', 'BE']} catalog={catalog} scene={scene} />);
  fireEvent.change(view.getByLabelText('Mixed-resolution focus country'), { target: { value: 'ES' } });
  fireEvent.change(view.getByLabelText('Rest of model granularity'), { target: { value: 'regional' } });
  expect(view.getByLabelText(/Focus group/)).toBeDisabled();
  expect(view.getByLabelText(/Rest group/)).toBeEnabled();
});
