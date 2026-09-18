import React, { useMemo, useState } from 'react';
import { Network, Sparkles } from 'lucide-react';
import { ATLAS_RESOLUTION_LABELS, ATLAS_RESOLUTION_ORDER } from '../atlasAgentCommands';
import { MIXED_GRANULARITY_DEFAULTS } from '../mixedGranularity';

const TIER_OPTIONS = ATLAS_RESOLUTION_ORDER.map((value) => ({
  value,
  label: ATLAS_RESOLUTION_LABELS[value],
}));

export default function MixedGranularityControls({
  countryOptions,
  activeCountryCode,
  activePlan,
  busy,
  onApply,
}) {
  const [expanded, setExpanded] = useState(false);
  const [focusCode, setFocusCode] = useState('');
  const [levels, setLevels] = useState(MIXED_GRANULARITY_DEFAULTS);
  const effectiveFocus = focusCode || activePlan?.focusCode || activeCountryCode || countryOptions[0]?.countryCode || '';
  const activeSummary = useMemo(() => activePlan ? (
    `${activePlan.adjacent.length} direct · ${activePlan.outer.length} outer`
  ) : '', [activePlan]);
  const updateLevel = (tier, value) => setLevels((previous) => ({ ...previous, [tier]: value }));
  const apply = async () => {
    if (!effectiveFocus || busy) return;
    try {
      await onApply(effectiveFocus, levels);
      setExpanded(false);
    } catch (_) {
      // App owns the visible load error and keeps the previous map intact.
    }
  };

  return (
    <div className={`mt-3 rounded-xl border ${activePlan ? 'border-sky-300/30 bg-sky-300/[0.07]' : 'border-white/10 bg-white/[0.025]'}`}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        disabled={!countryOptions.length || busy}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Network aria-hidden="true" className={`h-4 w-4 shrink-0 ${activePlan ? 'text-sky-300' : 'text-tj-gold'}`} />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-white">Mixed TSO rings</span>
            <span className="block truncate text-[9px] text-slate-300">
              {activePlan ? `${activePlan.focusCode} · ${activeSummary}` : 'Focus · direct neighbours · outer ring'}
            </span>
          </span>
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-tj-gold">{expanded ? 'Close' : activePlan ? 'Edit' : 'Set up'}</span>
      </button>
      {expanded && (
        <div className="space-y-2.5 border-t border-white/10 px-3 py-3">
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-wider text-slate-300">TSO focus country</span>
            <select
              aria-label="Mixed granularity focus country"
              value={effectiveFocus}
              onChange={(event) => setFocusCode(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-white/15 bg-[#081523] px-2 py-2 text-xs text-white"
            >
              {countryOptions.map((option) => (
                <option key={option.countryCode} value={option.countryCode}>{option.countryName} ({option.countryCode})</option>
              ))}
            </select>
          </label>
          {[
            ['focus', 'Focus country'],
            ['adjacent', 'Direct grid neighbours'],
            ['outer', 'Neighbours of neighbours'],
          ].map(([tier, label]) => (
            <label key={tier} className="grid grid-cols-[1fr_116px] items-center gap-2">
              <span className="text-[10px] text-slate-200">{label}</span>
              <select
                aria-label={`${label} resolution`}
                value={levels[tier]}
                onChange={(event) => updateLevel(tier, event.target.value)}
                disabled={busy}
                className="rounded-lg border border-white/15 bg-[#081523] px-2 py-1.5 text-[10px] text-white"
              >
                {TIER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
          <p className="text-[9px] leading-4 text-slate-300">
            Rings follow transmission interconnections, including relevant subsea links. The complete view is published only after every local cache is ready.
          </p>
          <button
            type="button"
            onClick={apply}
            disabled={!effectiveFocus || busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-tj-gold/40 bg-tj-gold/10 px-3 py-2 text-[10px] font-semibold text-tj-gold hover:bg-tj-gold/15 disabled:opacity-50"
          >
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            {busy ? 'Building mixed view…' : 'Build mixed view'}
          </button>
        </div>
      )}
    </div>
  );
}
