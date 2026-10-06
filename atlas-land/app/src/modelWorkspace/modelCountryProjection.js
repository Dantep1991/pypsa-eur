import { supportedModelMixedResolutionTiers } from './mixedResolutionPreview';

// Structured geography arguments only. No interpretation of user language and
// no reference-network substitution. Preserve the other countries' tiers.
export function modelCountryProjection(scene, previous, countries, { resolution, otherResolution,
  resolutionsByCountry = {}, schemeId, regionIds } = {}) {
  const catalog = scene?.meta?.aggregationCatalog;
  if (!catalog) throw new Error('Load the model geography catalogue first.');
  const normalize = value => value === catalog.native_resolution ? 'native' : value;
  const available = supportedModelMixedResolutionTiers(catalog);
  const tier = value => {
    const normalized = normalize(value);
    if (!available.includes(normalized)) throw new Error(`This model supports ${available.join(', ')}; ${value} would require an unavailable finer topology.`);
    return normalized;
  };
  const known = scene.meta.countries;
  const options = previous?.aggregation?.options || {};
  const current = previous?.aggregation?.level || 'native';
  const byCountry = Object.fromEntries(known.map(code => [code,
    current === 'mixed' ? options.resolutionByCountry?.[code] || 'native' : current]));
  if (otherResolution) known.filter(code => !countries.includes(code)).forEach(code => { byCountry[code] = tier(otherResolution); });
  if (resolution) countries.forEach(code => { byCountry[code] = tier(resolution); });
  Object.entries(resolutionsByCountry).forEach(([code, value]) => {
    if (!known.includes(code)) throw new Error(`${code} is not in this project model.`);
    byCountry[code] = tier(value);
  });
  const distinct = [...new Set(Object.values(byCountry))];
  return { resolution: distinct.length === 1 ? distinct[0] : 'mixed', options: {
    ...options, ...(schemeId ? { schemeId } : {}), ...(regionIds ? { regionIds } : {}),
    resolutionByCountry: byCountry,
  } };
}
