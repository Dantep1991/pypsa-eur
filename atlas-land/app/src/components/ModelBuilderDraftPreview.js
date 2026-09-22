import React from 'react';
import { DraftingCompass } from 'lucide-react';

export default function ModelBuilderDraftPreview({ preview, sceneStatus = null }) {
  if (!preview) return null;
  const evidence = preview.evidence || {};
  const facts = [
    evidence.carrierCount ? `${evidence.carrierCount} carrier${evidence.carrierCount === 1 ? '' : 's'}` : null,
    evidence.countryCount ? `${evidence.countryCount} countr${evidence.countryCount === 1 ? 'y' : 'ies'}` : null,
    evidence.nodeDefinitionCount ? `${evidence.nodeDefinitionCount} node IDs` : null,
    evidence.assetCarrierCount ? `${evidence.assetCarrierCount} asset carrier${evidence.assetCarrierCount === 1 ? '' : 's'}` : null,
    evidence.connectionGroupCount ? `${evidence.connectionGroupCount} connection group${evidence.connectionGroupCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  const stageLabels = {
    soul: 'Identity', dna: 'Demand Sectors', skeleton: 'Geography', organs: 'Assets',
    cardio_system: 'Connections', blood: 'Archetypes', blood_chemistry: 'Attribute Rules',
    circadian_system: 'Time', nervous_system: 'Rules', skin: 'Climate & Platform', muscles: 'Assembly',
  };
  const staleLabels = (preview.staleStageIds || []).map((stageId) => stageLabels[stageId]).filter(Boolean);
  const assembly = preview.assembly;
  const assemblyFacts = assembly ? [
    `${assembly.classCount} classes`,
    `${assembly.objectCount} objects`,
    `${assembly.membershipCount} memberships`,
    `${assembly.propertyRecordCount} properties`,
  ] : [];
  const sceneFacts = assembly?.sceneAvailable ? [
    `${assembly.mappedNodeCount}/${assembly.nodeCount} mapped nodes`,
    `${assembly.linkCount} links`,
    `${assembly.assetCount} assets`,
  ] : [];
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
          {assembly && (
            <div className="mt-1.5 rounded-md border border-cyan-300/20 bg-cyan-300/[0.07] px-2 py-1 text-[9px] leading-3.5 text-cyan-50">
              <span className="font-semibold capitalize">{assembly.status}</span>
              {' · '}{Math.min(assembly.completed, assembly.total)}/{assembly.total} phases
              {preview.mode === 'assembled-summary' && <span className="block text-cyan-100/80">{assemblyFacts.join(' · ')}</span>}
              {sceneFacts.length > 0 && <span className="block text-emerald-100/90">Draft map · {sceneFacts.join(' · ')}</span>}
            </div>
          )}
          {staleLabels.length > 0 && (
            <p className="mt-1.5 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[9px] leading-3.5 text-amber-100">
              Needs review after upstream change: {staleLabels.join(', ')}
            </p>
          )}
          <p className="mt-1 text-[9px] leading-3.5 text-sky-200">
            {assembly?.sceneAvailable
              ? 'Temporary exact-coordinate scene · not published'
              : assembly ? 'Temporary assembly · published topology retained' : 'Definitions only · published topology retained'}
          </p>
          {assembly?.sceneAvailable && sceneStatus?.state === 'loading' && (
            <p className="mt-1 text-[9px] text-emerald-100">Loading exact-coordinate temporary scene…</p>
          )}
          {assembly?.sceneAvailable && sceneStatus?.state === 'waiting' && (
            <p className="mt-1 text-[9px] text-emerald-100">Waiting for the published context before applying the temporary scene…</p>
          )}
          {assembly?.sceneAvailable && sceneStatus?.state === 'error' && (
            <p className="mt-1 rounded-md border border-rose-300/25 bg-rose-300/10 px-2 py-1 text-[9px] leading-3.5 text-rose-100">
              Draft map unavailable: {sceneStatus.error}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
