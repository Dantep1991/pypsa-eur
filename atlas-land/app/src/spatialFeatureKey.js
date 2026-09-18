const hashText = text => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

// Map inputs are immutable snapshots. Keep fingerprints weakly keyed by their
// coordinate arrays. Long routes/polygons use snapshot identity rather than
// serializing every vertex even on a cold load. A replacement array deliberately
// invalidates them, including geometrically equal refreshed source data. Points
// and two-endpoint lines keep cheap content keys because they may be rebuilt
// during view/selection updates. Removed snapshots remain garbage-collectable.
export function createSpatialFeatureKey() {
  const coordinatesCache = new WeakMap();
  const sourceIds = new WeakMap();
  let nextSource = 0;
  const sourceId = source => {
    if (!source || typeof source !== 'object') return '';
    if (!sourceIds.has(source)) sourceIds.set(source, ++nextSource);
    return sourceIds.get(source);
  };
  const fingerprint = value => {
    if (!value || typeof value !== 'object') return '';
    if (!coordinatesCache.has(value)) coordinatesCache.set(value, hashText(JSON.stringify(value)));
    return coordinatesCache.get(value);
  };
  return (prefix, collection, { ignoreSelection = false } = {}) => {
    const features = collection?.features || [];
    const identities = features.map(feature => {
      const coordinates = feature?.geometry?.coordinates;
      const type = feature?.geometry?.type || '';
      const coordinateHash = type === 'Point' || (type === 'LineString' && coordinates?.length <= 2)
        ? fingerprint(coordinates) : `snapshot:${sourceId(coordinates)}`;
      const props = feature?.properties || {};
      const style = props.style || {};
      // Facility details and selection can change without moving its geometry.
      // A source replacement must also refresh its popup and visual emphasis.
      return `${feature?.id ?? ''}|${feature?.geometry?.type || ''}|${coordinateHash}|${props.capacity?.value ?? ''}|${style.color || ''}|${style.weight ?? ''}|${style.opacity ?? ''}|${style.dashArray || ''}|${sourceId(props.facility)}|${ignoreSelection ? '' : props.isSelected ?? ''}|${props.extraOpacity ?? ''}|${props.color || ''}|${props.shape || ''}|${props.nodeEmphasis ?? ''}|${props.demandSizeRatio ?? ''}|${props.objectCount ?? ''}|${props.isEditable ?? ''}|${props.total ?? ''}|${props.capacityTotal ?? ''}|${props.sizeRatio ?? ''}|${fingerprint(props.segments)}`;
    });
    return `${prefix}-${features.length}-${hashText(identities.join('\n'))}`;
  };
}
