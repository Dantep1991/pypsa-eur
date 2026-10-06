import { normalizeOverlayCountryCodes } from '../atlasNetworkOverlay';

// Land and Access must follow the actual bound model view, not a remembered
// reference-network selection. All inputs are authoritative UI/model fields.
export function modelOverlayCountries({ scope = [], subset = [], showContext = false, countries = [] }) {
  return normalizeOverlayCountryCodes(scope.length ? scope : !showContext && subset.length ? subset : countries);
}
