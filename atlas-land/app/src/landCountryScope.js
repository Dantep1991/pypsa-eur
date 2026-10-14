// Use only service-supported boundaries, while retaining explicit coverage gaps.
// An all-unsupported selection must never become an empty/global request.
export function landCountryScope(countries, status) {
  const unavailable = { ready: false, countries: [], missing: [], partial: false };
  if (status?.ready === false) return { ...unavailable, message: 'Local land service unavailable.' };
  if (status?.ready !== true || !Array.isArray(status.countries)) {
    return { ...unavailable, message: 'Checking land-overlay country coverage…' };
  }
  const supported = new Set(status.countries.map(country => String(country.code || '').trim().toUpperCase()));
  const requested = [...new Set((countries || []).map(code => String(code || '').trim().toUpperCase()).filter(Boolean))];
  const covered = requested.filter(code => supported.has(code));
  const missing = requested.filter(code => !supported.has(code));
  const ready = !requested.length || covered.length > 0;
  return {
    ready, countries: covered, missing, partial: ready && missing.length > 0,
    message: !missing.length ? '' : ready
      ? `Land shown for ${covered.length} of ${requested.length} selected countries. Country boundaries unavailable for ${missing.join(', ')}; excluded from land results.`
      : `Country boundaries unavailable for ${missing.join(', ')}. No selected country has land coverage.`,
  };
}
