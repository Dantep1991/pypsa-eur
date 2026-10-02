const text = (value) => String(value ?? '').trim();

export function modelGeographyPolicy(context, sceneMeta = null) {
  if (!text(context?.projectId)) return null;
  const projectName = text(context.projectName) || text(context.projectId);
  const nativeGeography = text(context?.nativeGeography?.label) || 'model-native geography';
  const sourceCountries = Array.isArray(sceneMeta?.countries)
    ? [...new Set(sceneMeta.countries.map(text).filter(Boolean))]
    : [];
  return {
    projectId: text(context.projectId),
    projectName,
    modelVersion: text(sceneMeta?.version) || text(context.version),
    nativeGeography,
    nativeResolution: context?.nativeGeography?.resolved ? text(context.nativeGeography.id) || 'native' : 'native',
    sourceCountries,
    canAddCountryNetworks: false,
    canIncreaseResolution: false,
    message: `This Atlas is bound to ${projectName} at ${nativeGeography}. Atlas can filter or distil its existing nodes, but it cannot add a separate full-granularity country network or split the topology to a finer level yet.`,
  };
}

export function assertModelGeographyOperation(policy, operation) {
  if (!policy) return true;
  const blocked = ['add-country-network', 'select-all-country-networks', 'change-resolution', 'mixed-resolution'];
  if (!blocked.includes(operation)) return true;
  throw new Error(policy.message);
}

// An empty selection means the full project extent. Country commands in a
// model-bound Atlas select existing model identities; they never load another
// country's standalone PyPSA cache.
export function resolveModelCountryScope(availableCountries, selectedCountries, requestedCountries, mode = 'replace') {
  const available = [...new Set((availableCountries || []).map(value => text(value).toUpperCase()).filter(Boolean))];
  const availableSet = new Set(available);
  const requested = [...new Set((requestedCountries || []).map(value => text(value).toUpperCase()).filter(Boolean))];
  if (!requested.length) throw new Error('Choose at least one country in this project.');
  const unavailable = requested.filter(code => !availableSet.has(code));
  if (unavailable.length) throw new Error(`${unavailable.join(', ')} ${unavailable.length === 1 ? 'is' : 'are'} not in this project model.`);
  const current = selectedCountries?.length ? selectedCountries : available;
  let next;
  if (mode === 'add') next = [...new Set([...current, ...requested])];
  else if (mode === 'remove') next = current.filter(code => !requested.includes(code));
  else next = requested;
  if (!next.length) throw new Error('Removing every country would leave an empty model view. Use Select all to restore the full project.');
  return next.length === available.length ? [] : next.sort();
}
