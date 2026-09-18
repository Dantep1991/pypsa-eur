import React from 'react';

export default class MapWorkspaceBoundary extends React.Component {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics in the browser console without exposing source data or
    // exception text in the user-facing recovery surface.
    console.error('Atlas map render failed.', error, info);
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      // A country, carrier, resolution or visible-record change may have
      // removed the malformed input. Retry that new snapshot automatically.
      this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
    }
  }

  retry = () => {
    this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
  };

  render() {
    if (this.state.failed) {
      return (
        <section
          role="alert"
          aria-label="Map recovery"
          className="absolute inset-0 z-[700] flex items-center justify-center bg-[#071421] px-6 text-center"
        >
          <div className="max-w-sm rounded-2xl border border-amber-300/25 bg-[#0b1b2a] p-5 shadow-2xl">
            <p className="text-sm font-semibold text-white">The map could not draw this data snapshot.</p>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              Your loaded networks and settings are still available. Retry the map, or change a country, layer or resolution.
            </p>
            <button
              type="button"
              onClick={this.retry}
              className="mt-4 min-h-[38px] rounded-lg border border-tj-gold/45 bg-tj-gold/10 px-4 text-xs font-semibold text-tj-gold hover:bg-tj-gold/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tj-gold"
            >
              Retry map
            </button>
          </div>
        </section>
      );
    }
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}
