import React from 'react';

const formatCoord = (v, pos, neg) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toFixed(2);
  return `${abs}°${v >= 0 ? pos : neg}`;
};

const formatCost = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

export default function PypsaRegionSolveControls({
  sourceDirname,
  center,
  onClearCenter,
  radiusKm,
  onRadiusChange,
  radiusLocked,
  canSolve,
  solving,
  onSolve,
  manifest,
  error,
  currentRegionDirname,
  onSaveCurrentRun,
  savingCurrentRun = false,
  opsMessage,
  onClose,
}) {
  const [saveLabel, setSaveLabel] = React.useState('');

  const statusTone =
    manifest?.status === 'ok' ? 'text-emerald-300' :
    manifest ? 'text-rose-300' : 'text-tj-slate';

  return (
    <div className="w-full max-w-full bg-tj-navy-dark/95 border border-white/10 rounded-lg shadow-xl p-3 text-tj-gray overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-white tracking-wide">Region Solve</div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-tj-slate hover:text-white text-xs px-1"
            aria-label="Close region solve panel"
          >
            ×
          </button>
        )}
      </div>

      <div className="text-[11px] text-tj-slate mb-2 min-w-0">
        Source: <span className="text-white/80 block truncate">{sourceDirname || '—'}</span>
      </div>

      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-tj-slate mb-1">Centre</div>
        <div className="grid grid-cols-[1fr_auto] items-start gap-2 text-xs min-w-0">
          <span className="text-white/80 min-w-0 break-words">
            {center
              ? `${formatCoord(center.lat, 'N', 'S')}, ${formatCoord(center.lon, 'E', 'W')}`
              : 'Right-click map and choose "Solve region here"'}
          </span>
          {center && (
            <button
              onClick={onClearCenter}
              className="text-[10px] text-tj-slate hover:text-white underline shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-tj-slate mb-1 min-w-0">
          <span>Radius{radiusLocked ? ' (locked)' : ''}</span>
          <span className="text-white/80 normal-case tracking-normal shrink-0">{radiusKm} km</span>
        </div>
        <input
          type="range"
          min={5}
          max={500}
          step={1}
          value={radiusKm}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          disabled={radiusLocked}
          className={`w-full accent-tj-gold ${radiusLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        {radiusLocked && (
          <div className="mt-1 text-[10px] text-tj-slate">
            Close the panel to reset and pick a new radius.
          </div>
        )}
      </div>

      {!manifest && (
        <button
          onClick={onSolve}
          disabled={!canSolve || solving}
          className={`w-full text-xs px-2 py-1.5 rounded border transition-colors ${
            canSolve && !solving
              ? 'bg-tj-gold text-tj-navy-dark border-tj-gold hover:shadow-[0_0_15px_rgba(219,187,28,0.4)]'
              : 'bg-white/5 text-tj-slate border-white/10 cursor-not-allowed'
          }`}
        >
          {solving ? 'Solving…' : 'Solve region'}
        </button>
      )}

      {error && (
        <div className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {opsMessage && (
        <div className="mt-3 text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1.5">
          {opsMessage}
        </div>
      )}

      {manifest && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-[10px] uppercase tracking-wider text-tj-slate mb-1">Result</div>
          <div className="grid grid-cols-2 gap-y-1 text-xs">
            <span className="text-tj-slate">Status</span>
            <span className={`text-right font-medium ${statusTone}`}>
              {manifest.status === 'ok' ? (manifest.condition || 'optimal') : (manifest.status || 'failed')}
            </span>
            <span className="text-tj-slate">Cost</span>
            <span className="text-right text-white/90">
              €{formatCost(manifest.total_cost_EUR)}
            </span>
            <span className="text-tj-slate">Buses</span>
            <span className="text-right text-white/90">
              {(manifest.solved_buses || []).length} solved ·{' '}
              {(manifest.boundary_buses || []).length} boundary ·{' '}
              {(manifest.unsolved_buses || []).length} unsolved
            </span>
            <span className="text-tj-slate">Snapshots</span>
            <span className="text-right text-white/90">
              {manifest.snapshots?.count ?? '—'}
            </span>
          </div>

          {manifest.islanded && (
            <div className="mt-2 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 leading-snug">
              <span className="font-semibold">Islanded region solve.</span>{' '}
              Flows across the cut are fixed at 0. Imports and exports from outside
              the circle are not modelled.
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-tj-slate">
          Rename Current Output
        </div>
        <input
          type="text"
          value={saveLabel}
          onChange={(e) => setSaveLabel(e.target.value)}
          placeholder="New name label (optional)"
          className="w-full px-2 py-1 text-xs border border-white/10 rounded bg-tj-navy-light/50 backdrop-blur-md"
        />
        <button
          type="button"
          onClick={() => onSaveCurrentRun && onSaveCurrentRun(saveLabel)}
          disabled={!currentRegionDirname || savingCurrentRun}
          className="w-full text-xs px-2 py-1.5 rounded border bg-emerald-500/15 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingCurrentRun ? 'Renaming…' : 'Rename sub solved network'}
        </button>
        <div className="text-[10px] text-tj-slate break-all">
          Current: <span className="text-white/75">{currentRegionDirname || 'none'}</span>
        </div>
      </div>
    </div>
  );
}
