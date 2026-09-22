import React from 'react';
import { DraftingCompass } from 'lucide-react';

export default function ModelBuilderDraftPreview({ preview }) {
  if (!preview) return null;
  const evidence = preview.evidence || {};
  const facts = [
    evidence.carrierCount ? `${evidence.carrierCount} carrier${evidence.carrierCount === 1 ? '' : 's'}` : null,
    evidence.countryCount ? `${evidence.countryCount} countr${evidence.countryCount === 1 ? 'y' : 'ies'}` : null,
    evidence.nodeDefinitionCount ? `${evidence.nodeDefinitionCount} node IDs` : null,
    evidence.assetCarrierCount ? `${evidence.assetCarrierCount} asset carrier${evidence.assetCarrierCount === 1 ? '' : 's'}` : null,
    evidence.connectionGroupCount ? `${evidence.connectionGroupCount} connection group${evidence.connectionGroupCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return (
    <aside
      aria-label="Model Builder draft preview"
      className="pointer-events-none absolute bottom-16 left-3 z-[560] w-[min(390px,calc(100%-84px))] rounded-xl border border-tj-gold/35 bg-[#071421]/94 px-3 py-2.5 text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 rounded-lg border border-tj-gold/35 bg-tj-gold/10 p-1.5 text-tj-gold">
          <DraftingCompass className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <strong className="text-[11px] font-semibold">Draft preview · {preview.stageLabel}</strong>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] text-tj-slate">
              {preview.stageIndex}/{preview.stageCount} · r{preview.revision}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-tj-slate">{preview.message}</p>
          {facts.length > 0 && <p className="mt-1.5 text-[9px] font-medium text-tj-gold">{facts.join(' · ')}</p>}
          <p className="mt-1 text-[9px] leading-3.5 text-sky-200">Definitions only · published topology retained</p>
        </div>
      </div>
    </aside>
  );
}
