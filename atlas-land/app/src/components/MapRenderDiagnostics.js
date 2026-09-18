import React, { useEffect, useState } from 'react';

export function mapDiagnosticsEnabled(search = '') {
  return new URLSearchParams(search).get('atlas-diagnostics') === '1';
}

export default function MapRenderDiagnostics({ metrics, retirement, busy, error }) {
  // Only the last completed sample is retained, never geometry or a trace log.
  const [last, setLast] = useState(null);
  const [lastRetirement, setLastRetirement] = useState(null);
  useEffect(() => { if (metrics) setLast(metrics); }, [metrics]);
  useEffect(() => { if (retirement?.metrics) setLastRetirement(retirement.metrics); }, [retirement]);
  const ms = (value) => Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'Not measured';
  return (
    <details className="absolute right-3 bottom-[84px] z-[560] w-[260px] max-w-[calc(100%-24px)] rounded-xl border border-sky-300/30 bg-[#071421]/95 p-3 text-[11px] leading-4 text-slate-200 shadow-xl">
      <summary className="cursor-pointer font-semibold text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">Line-render diagnostics · local</summary>
      <div className="mt-2 max-h-[45vh] overflow-y-auto" aria-label="Line render diagnostics">
        <p>{error ? 'Replacement drawing failed.' : busy ? 'Building replacement…' : 'Drawing idle.'}</p>
        {last ? <>
          <p className="mt-2 font-semibold text-white">Last completed line drawing</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
            <dt>Links</dt><dd>{last.features.toLocaleString()}</dd>
            <dt>Construction batches</dt><dd>{last.batches}</dd>
            <dt>Layer setup</dt><dd>{ms(last.setupMs)}</dd>
            <dt>Active construction</dt><dd>{ms(last.activeMs)}</dd>
            <dt>Longest batch</dt><dd>{ms(last.maxBatchMs)}</dd>
            <dt>Longest single link</dt><dd>{ms(last.maxFeatureMs)}</dd>
            <dt>Final canvas draw</dt><dd>{ms(last.paintMs)}</dd>
            <dt>Schedule cleanup</dt><dd>{ms(last.retireSetupMs)}</dd>
            <dt>Elapsed incl. yields</dt><dd>{ms(last.totalMs)}</dd>
          </dl>
        </> : <p className="mt-2">No completed line drawing measured yet.</p>}
        <p className="mt-2">{retirement?.error || (retirement?.retiring ? 'Retiring hidden drawing…' : 'Cleanup idle.')}</p>
        {lastRetirement && <>
          <p className="mt-2 font-semibold text-white">Last completed cleanup</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
            <dt>Removed layers</dt><dd>{lastRetirement.features.toLocaleString()}</dd>
            <dt>Cleanup batches</dt><dd>{lastRetirement.batches}</dd>
            <dt>Active cleanup</dt><dd>{ms(lastRetirement.activeMs)}</dd>
            <dt>Longest cleanup batch</dt><dd>{ms(lastRetirement.maxBatchMs)}</dd>
            <dt>Final cleanup</dt><dd>{ms(lastRetirement.finalizeMs)}</dd>
            <dt>Cleanup incl. yields</dt><dd>{ms(lastRetirement.elapsedMs)}</dd>
          </dl>
        </>}
        <p className="mt-2 text-[10px] leading-4">Line-layer timings only. Excludes downloads, JSON parsing, React preparation, nodes and browser compositing. Background tabs can delay animation frames.</p>
        <p className="mt-2 text-[10px] leading-4">No telemetry is sent. Remove atlas-diagnostics=1 from the URL and reload to disable.</p>
      </div>
    </details>
  );
}
