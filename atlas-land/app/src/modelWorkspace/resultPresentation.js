// Presentation contracts, not intent routing. All identities come from the
// bound schema/query; these helpers never infer nodes from object names.
export function resultMapModes(quantity = {}) {
  const modes = [{ id: 'colour', label: 'Colour scale' }];
  if (['Line', 'Gas Pipeline'].includes(quantity.class_name)) {
    // Flow Back needs an explicit reverse-direction contract; the legacy
    // endpoint helper currently applies sign only. Keep it static until then.
    if (quantity.supports_flow_map && ['Flow', 'Net Flow', 'Flow In', 'Flow Out'].includes(quantity.property_name)) {
      modes.unshift({ id: 'flow', label: 'Directional flow' });
    }
  } else {
    modes.unshift({ id: 'bubbles', label: 'Magnitude bubbles' });
    if (quantity.class_name === 'Generator' && quantity.property_name === 'Generation'
      && ['GWh', 'MWh', 'kWh'].includes(quantity.unit)) {
      modes.unshift({ id: 'mix', label: 'Generation energy mix' });
    }
  }
  return modes;
}

export function resultMagnitudeRatio(value, maximum) {
  const magnitude = Math.abs(Number(value));
  const scale = Number(maximum);
  return Number.isFinite(magnitude) && Number.isFinite(scale) && scale > 0
    ? Math.min(1, magnitude / scale) : 0;
}

export const DEFAULT_RESULT_MARKER_SCALE = 1;

export function normalizeResultMarkerScale(scale) {
  if (scale == null) return DEFAULT_RESULT_MARKER_SCALE;
  const value = Number(scale);
  return Number.isFinite(value) ? Math.max(0.5, Math.min(2, value)) : DEFAULT_RESULT_MARKER_SCALE;
}

export function resultBubbleRadius(ratio, scale = DEFAULT_RESULT_MARKER_SCALE) {
  // Area encodes magnitude above a legibility floor. Zero remains an outline,
  // never an invented positive value; uniform display scaling preserves ratios.
  const value = Number(ratio);
  const radius = Number.isFinite(value) && value > 0
    ? Math.max(6, 36 * Math.sqrt(Math.min(1, value))) : 5;
  return radius * normalizeResultMarkerScale(scale);
}

export function resultCircleRadius(mode, ratio, scale = DEFAULT_RESULT_MARKER_SCALE) {
  return mode === 'colour' ? 7 * normalizeResultMarkerScale(scale) : resultBubbleRadius(ratio, scale);
}

export function resultPieDiameter(ratio, scale = DEFAULT_RESULT_MARKER_SCALE) {
  return 2 * Math.max(8, resultBubbleRadius(ratio)) * normalizeResultMarkerScale(scale);
}

export function generationEnergyValues(rows) {
  const nodes = new Map();
  const seen = new Set();
  const units = new Set();
  for (const row of rows) {
    const object = String(row.entity_name || row.group_value || '').trim();
    const value = Number(row.value);
    if (!object || !Number.isFinite(value)) continue;
    if (seen.has(object)) throw new Error('Generation mix contains duplicate objects or multiple periods.');
    seen.add(object);
    if (value < 0) throw new Error('Generation energy pies require non-negative values; use a colour or bubble view for signed results.');
    const unit = String(row.unit_name || '').trim();
    if (unit) units.add(unit);
    const node = String(row.node || '').trim();
    if (!node) continue; // Missing membership is not reconstructed from a name.
    const entityId = node.startsWith('Node:') ? node : `Node:${node}`;
    const aggregate = nodes.get(entityId) || { entity_id: entityId, node, value: 0, unit, categories: new Map() };
    aggregate.value += value;
    const key = String(row.category || 'Uncategorised');
    aggregate.categories.set(key, (aggregate.categories.get(key) || 0) + value);
    nodes.set(entityId, aggregate);
  }
  if (units.size > 1) throw new Error('Generation mix contains incompatible physical units.');
  return [...nodes.values()].map(({ categories, ...row }) => ({
    ...row,
    segments: [...categories].filter(([, value]) => value > 0).map(([label, value]) => ({
      key: label, label, value, share: row.value > 0 ? value / row.value : 0,
    })).sort((a, b) => b.value - a.value),
  }));
}

const nodeKey = value => String(value || '').replace(/^(Node|Gas ?Node):/, '');

export function resultLineWidth(ratio) {
  return 1.5 + 7 * Math.sqrt(Math.max(0, Math.min(1, Number(ratio) || 0)));
}

export function directionalResultLines(collection) {
  return (collection?.features || []).flatMap(feature => {
    const connection = feature.properties?.connection;
    if (!connection?.atlas_result_direction_supported || !Number.isFinite(Number(connection.atlas_result_direction_value))
      || Number(connection.atlas_result_direction_value) === 0 || feature.geometry?.type !== 'LineString') return [];
    const coordinates = feature.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const actualFrom = nodeKey(connection.atlas_result_from_node);
    const actualTo = nodeKey(connection.atlas_result_to_node);
    const from = nodeKey(connection.from || connection.fromNode);
    const to = nodeKey(connection.to || connection.toNode);
    if (!actualFrom || !actualTo || !from || !to) return [];
    const forward = actualFrom === from && actualTo === to;
    const reverse = actualFrom === to && actualTo === from;
    if (!forward && !reverse) return [];
    return [{
      id: connection.id, coordinates: reverse ? [...coordinates].reverse() : coordinates,
      magnitude: Math.abs(connection.atlas_result_value), color: connection.atlas_result_color,
    }];
  });
}
