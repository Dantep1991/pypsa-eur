import React from 'react';

// A dataset is one country/domain request, not necessarily one country.
// Progress describes staging only: the current map remains usable until commit.
export default function AtlasBatchProgress({ progress, onCancel, cancelLabel = 'Cancel network update' }) {
  if (!progress) return null;
  return (
    <div className="space-y-2 text-[11px] text-sky-100">
      <p>Loading network data · {progress.completed}/{progress.total} datasets</p>
      <progress aria-label="Network datasets loaded" value={progress.completed} max={progress.total || 1}
        className="block h-1.5 w-full accent-sky-300" />
      <p className="text-[10px] text-slate-300">The current map stays visible until the update is ready.</p>
      <button type="button" onClick={onCancel} aria-label={cancelLabel}
        className="min-h-[32px] rounded-lg border border-sky-200/30 px-2.5 py-1 text-[11px] font-semibold hover:bg-sky-200/10">
        Cancel update
      </button>
    </div>
  );
}
