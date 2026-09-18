import React, { Suspense, lazy, useMemo, useState } from 'react';

class PanelBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="p-3 text-sm text-slate-200" role="alert">
      <p>Could not open {this.props.label}. Other Atlas controls remain available.</p>
      <button type="button" className="mt-2 rounded border border-tj-gold/40 px-3 py-1 text-tj-gold"
        onClick={this.props.retry}>Retry {this.props.label}</button>
    </div>;
  }
}

// Keep optional analysis tooling out of the initial map bundle. Each mounted
// panel owns its loading/error state; retry creates a fresh lazy import so a
// rejected chunk download is not permanently cached by React.lazy.
export function deferredPanel(load, label) {
  return function DeferredPanel(props) {
    const [attempt, setAttempt] = useState(0);
    const Panel = useMemo(() => lazy(load), [attempt]);
    return <PanelBoundary key={attempt} label={label} retry={() => setAttempt(value => value + 1)}>
      <Suspense fallback={<div className="p-3 text-sm text-slate-300" role="status">Loading {label}…</div>}>
        <Panel {...props} />
      </Suspense>
    </PanelBoundary>;
  };
}
