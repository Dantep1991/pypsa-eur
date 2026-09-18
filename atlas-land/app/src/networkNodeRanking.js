const nodeKey = value => String(value || '').trim().toUpperCase();
const cleanKey = value => value.replace(/[-_]/g, '');

export function networkNodeDegrees(connections) {
  const degrees = new Map();
  const add = endpoint => {
    const id = nodeKey(endpoint);
    if (!id) return;
    const clean = cleanKey(id);
    degrees.set(id, (degrees.get(id) || 0) + 1);
    // An already-normalized id is one alias, not two connections.
    if (clean !== id) degrees.set(clean, (degrees.get(clean) || 0) + 1);
  };
  for (const connection of connections) { add(connection?.from); add(connection?.to); }
  return degrees;
}

// Compute graph priority once per source snapshot, not on every comparator
// invocation during a pan or zoom. The input/source order is never mutated.
export function rankNetworkNodes(nodes, connections) {
  if (nodes.length < 2) return [...nodes];
  const degrees = networkNodeDegrees(connections);
  return nodes.map((node, index) => {
    const id = nodeKey(node?.id);
    const clusterId = nodeKey(node?.cluster_id);
    const degree = Math.max(degrees.get(id) || 0, degrees.get(cleanKey(id)) || 0, degrees.get(clusterId) || 0);
    return { node, index, score: degree * 100 + Math.min(99, Number(node?.sameLocationCount || 1)) };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.node);
}

// Filtering a pre-ranked list gives the same top visible nodes as sorting the
// viewport again, without sorting or repeatedly normalizing node identifiers.
export function takeRankedVisibleNodes(ranked, visible, limit) {
  if (limit <= 0) return [];
  const wanted = new Set(visible);
  const result = [];
  for (const node of ranked) {
    if (!wanted.has(node)) continue;
    result.push(node);
    if (result.length >= limit) break;
  }
  return result;
}
