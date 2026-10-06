import React from 'react';
import { CheckCircle2, Clock3, Loader2, PlayCircle, TriangleAlert } from 'lucide-react';

const PRESENTATION = {
  idle: { label: 'No runs for this Model', tone: 'text-tj-slate', Icon: Clock3 },
  prepared: { label: 'Prepared', tone: 'text-amber-200', Icon: Clock3 },
  running: { label: 'Running', tone: 'text-sky-200', Icon: Loader2, spin: true },
  verifying: { label: 'Verifying outputs', tone: 'text-sky-200', Icon: Loader2, spin: true },
  completed: { label: 'Completed', tone: 'text-emerald-200', Icon: CheckCircle2 },
  failed: { label: 'Failed', tone: 'text-red-200', Icon: TriangleAlert },
  orphaned: { label: 'Needs attention', tone: 'text-amber-200', Icon: TriangleAlert },
  unknown: { label: 'Status unavailable', tone: 'text-tj-slate', Icon: Clock3 },
};

export default function ModelRunStatus({ runState, onOpen, hideAction = false }) {
  if (runState && (!runState.modelName || (runState.latest && runState.latest.modelName !== runState.modelName))) return null;
  if (!runState) {
    return (
      <div role="status" className="mb-2.5 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] text-tj-slate">
        Checking the persisted run ledger for this model version…
      </div>
    );
  }
  const presentation = PRESENTATION[runState.status] || PRESENTATION.unknown;
  const { Icon } = presentation;
  const latest = runState.latest;
  return (
    <div className="mb-2.5 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex min-w-0 items-center gap-1.5 text-[10px] font-semibold ${presentation.tone}`}>
          <Icon className={`h-3.5 w-3.5 shrink-0${presentation.spin ? ' animate-spin' : ''}`} />
          <span className="truncate">{presentation.label}</span>
        </span>
        {!hideAction && <button type="button" onClick={onOpen} className="shrink-0 rounded-md border border-tj-gold/30 px-2 py-1 text-[9px] font-semibold text-tj-gold hover:bg-tj-gold/10">
          <PlayCircle className="mr-1 inline h-3 w-3" /> Open runs
        </button>}
      </div>
      <p className="mt-1 truncate text-[10px] text-white/85">
        {latest ? latest.label : `${runState.modelVersion} · persisted ledger`}
      </p>
      <p className="mt-0.5 text-[9px] leading-4 text-tj-slate">
        {latest?.phase ? `${latest.phase} · ` : ''}{runState.runCount} run{runState.runCount === 1 ? '' : 's'} for {runState.modelName} · {runState.modelVersion}
        {latest?.outputVerified ? ' · output verified' : ''}
      </p>
    </div>
  );
}

