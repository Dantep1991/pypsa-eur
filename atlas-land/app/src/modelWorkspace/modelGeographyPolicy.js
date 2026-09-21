const text = (value) => String(value ?? '').trim();

export function modelGeographyPolicy(context, sceneMeta = null) {
  if (context?.mode !== 'model' || !text(context?.projectId)) return null;
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
    sourceCountries,
    canAddCountryNetworks: false,
    canIncreaseResolution: false,
    message: `This project is already aggregated at ${nativeGeography}. Atlas can filter or distil its existing nodes, but it cannot add a separate full-granularity country network or split the topology to a finer level yet.`,
  };
}

export function assertModelGeographyOperation(policy, operation) {
  if (!policy) return true;
  const blocked = ['add-country-network', 'select-all-country-networks', 'change-resolution', 'mixed-resolution'];
  if (!blocked.includes(operation)) return true;
  throw new Error(policy.message);
}
