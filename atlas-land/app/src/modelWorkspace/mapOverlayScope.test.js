import { modelOverlayCountries } from './mapOverlayScope';

test('bound view scope overrides source extent for both geographic overlays', () => {
  expect(modelOverlayCountries({ scope: ['FR', 'ES'], countries: ['DE', 'FR', 'ES'] })).toEqual(['ES', 'FR']);
});
test('subset previews clip to the preview unless the rest of the model is shown', () => {
  const state = { subset: ['ES'], countries: ['FR', 'ES'] };
  expect(modelOverlayCountries(state)).toEqual(['ES']);
  expect(modelOverlayCountries({ ...state, showContext: true })).toEqual(['ES', 'FR']);
});
test('full model view uses its declared countries, never a stale external country selection', () => {
  expect(modelOverlayCountries({ countries: ['DE', 'ES', 'DE'] })).toEqual(['DE', 'ES']);
  expect(modelOverlayCountries({})).toEqual([]);
});
