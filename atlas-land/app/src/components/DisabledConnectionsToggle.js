import React from 'react';

export default function DisabledConnectionsToggle({ count, visible, onChange }) {
  if (!count) return null;
  return <button type="button" className="atlas-disabled-toggle" aria-label="Show disabled connections"
    aria-pressed={visible} title={`${visible ? 'Hide' : 'Show'} ${count} disabled connections. Display only; model inputs are unchanged.`}
    onClick={() => onChange(!visible)}>
    <span className="atlas-disabled-toggle__key" aria-hidden="true">┄</span>
    <span>Disabled links <span className="atlas-disabled-toggle__count">{count}</span></span>
    <span className="atlas-disabled-toggle__state">{visible ? 'Shown' : 'Hidden'}</span>
  </button>;
}
