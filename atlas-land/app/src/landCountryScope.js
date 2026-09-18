// Validate the whole scope against the service's actual clipping boundaries.
// Never drop unknown countries: an empty request means unrestricted coverage.
export function landCountryScope(countries, status) {
  if (status?.ready === false) return { ready: false, message: 'Local land service unavailable.' };
  if (status?.ready !== true || !Array.isArray(status.countries)) {
    return { ready: false, message: 'Checking land-overlay country coverage…' };
  }
  const supported = new Set(status.countries.map(country => String(country.code || '').trim().toUpperCase()));
  const missing = [...new Set((countries || []).map(code => String(code || '').trim().toUpperCase()))]
    .filter(code => !supported.has(code));
  return missing.length
    ? { ready: false, missing, message: `Country boundaries unavailable for ${missing.join(', ')}. Land overlay paused for this selection; choose a supported custom scope.` }
    : { ready: true, missing: [], message: '' };
}
