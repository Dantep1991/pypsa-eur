import React from 'react';

const labels = { supply: 'Supply', storage: 'Storage', demand: 'Demand' };

export default function ModelLayerCoverage({ status, onCancel }) {
  const progress = status.progress || { current: 'Loading model topology', completed: 0, total: 1 };
  if (status.state === 'loading') return (
    <p className="atlas-model-layer-status" role="status">
      {progress.current} · {progress.objectsTotal != null
        ? `${progress.objectsCompleted}/${progress.objectsTotal} objects`
        : `${progress.completed}/${progress.total}`}
      {onCancel && <button type="button" className="ml-2 rounded border px-2 py-1" onClick={onCancel}>Cancel loading</button>}
    </p>
  );
  if (status.state === 'error' && status.error) return (
    <p className="atlas-model-layer-status" role="alert">
      {status.error}{status.meta ? ' The previous map is unchanged.' : ''}
    </p>
  );
  const evidence = Object.entries(status.meta?.layerEvidence || {});
  if (status.state !== 'ready' || !evidence.length) return null;
  const unresolved = evidence.some(([, data]) => data.resolved < data.mapped);
  return (
    <details className="atlas-model-layer-coverage">
      <summary>Layer coverage{unresolved ? ' · some values unresolved' : ''}</summary>
      {evidence.map(([layer, data]) => <p key={layer}>
        {labels[layer]}: {data.mapped}/{data.total} objects mapped · {data.resolved} values resolved
        {data.anchored > 0 ? ` · ${data.anchored} at linked-node locations` : ''}
      </p>)}
      <p>Input snapshot: {status.meta.requestedYear || status.meta.selectedYear}-01-01, 00:00.
        {' '}Unresolved values are not zero. Select a date and scenario in Model database for other inputs.</p>
    </details>
  );
}
