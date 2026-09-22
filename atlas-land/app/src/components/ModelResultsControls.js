import React from 'react';
import { BarChart3, CheckCircle2, Loader2, X } from 'lucide-react';

const quantityLabel = quantity => `${quantity.class_name} · ${quantity.property_name}${quantity.unit ? ` (${quantity.unit})` : ''}`;

export default function ModelResultsControls({
  catalogStatus,
  selection,
  resultStatus,
  scopeOptions = [],
  onSelectionChange,
  onShow,
  onClear,
}) {
  const catalog = catalogStatus?.catalog;
  const compatibleRuns = (catalog?.runs || []).filter(run => run.compatible && run.quantities?.length);
  const run = compatibleRuns.find(item => item.run_id === selection?.runId) || compatibleRuns[0];
  const allQuantities = run?.quantities || [];
  const componentClasses = [...new Set(allQuantities.map(item => item.class_name).filter(Boolean))];
  const componentClass = componentClasses.includes(selection?.className)
    ? selection.className
    : (allQuantities.find(item => item.id === selection?.quantityId)?.class_name || componentClasses[0] || '');
  const quantities = allQuantities.filter(item => item.class_name === componentClass);
  const quantity = quantities.find(item => item.id === selection?.quantityId) || quantities[0];
  const categories = quantity?.categories || [];
  const category = categories.includes(selection?.category) ? selection.category : '';
  const periods = quantity?.periods?.length ? quantity.periods : (run?.periods || []);
  const busy = resultStatus?.state === 'loading';

  const selectRun = (runId) => {
    const nextRun = compatibleRuns.find(item => item.run_id === runId);
    const preferredClass = selection?.className || 'Node';
    const nextQuantity = nextRun?.quantities?.find(item => item.class_name === preferredClass && item.id === selection?.quantityId)
      || nextRun?.quantities?.find(item => item.class_name === preferredClass)
      || nextRun?.quantities?.find(item => item.id === 'Node.Price')
      || nextRun?.quantities?.[0];
    onSelectionChange({
      runId,
      runLabel: nextRun?.label || runId,
      category: nextQuantity?.categories?.includes(selection?.category) ? selection.category : '',
      categoryObjects: nextQuantity?.categories?.includes(selection?.category)
        ? (nextQuantity?.category_objects?.[selection.category] || [])
        : [],
      quantityId: nextQuantity?.id || '',
      reportFamily: nextQuantity?.report_family || '',
      className: nextQuantity?.class_name || '',
      propertyName: nextQuantity?.property_name || '',
      unit: nextQuantity?.unit || '',
      period: nextQuantity?.periods?.[0] || nextRun?.periods?.[0] || '',
      scopeId: selection?.scopeId || '',
      supportsFlowMap: Boolean(nextQuantity?.supports_flow_map),
    });
  };

  const selectComponentClass = (className) => {
    const next = allQuantities.find(item => item.class_name === className);
    if (!next) return;
    onSelectionChange({
      ...selection,
      runId: run?.run_id || '',
      runLabel: run?.label || run?.run_id || '',
      category: '',
      categoryObjects: [],
      quantityId: next.id,
      reportFamily: next.report_family || '',
      className: next.class_name,
      propertyName: next.property_name,
      unit: next.unit || '',
      period: next.periods?.[0] || run?.periods?.[0] || '',
      supportsFlowMap: Boolean(next.supports_flow_map),
    });
  };

  const selectQuantity = (quantityId) => {
    const next = quantities.find(item => item.id === quantityId);
    if (!next) return;
    onSelectionChange({
      ...selection,
      runId: run?.run_id || '',
      runLabel: run?.label || run?.run_id || '',
      category: next.categories?.includes(selection?.category) ? selection.category : '',
      categoryObjects: next.categories?.includes(selection?.category)
        ? (next.category_objects?.[selection.category] || [])
        : [],
      quantityId: next.id,
      reportFamily: next.report_family || '',
      className: next.class_name,
      propertyName: next.property_name,
      unit: next.unit || '',
      period: next.periods?.[0] || run?.periods?.[0] || '',
      supportsFlowMap: Boolean(next.supports_flow_map),
    });
  };

  if (catalogStatus?.state === 'loading') {
    return <div role="status" className="flex items-center gap-2 rounded-lg border border-sky-300/15 bg-sky-300/[0.05] px-3 py-2.5 text-[10px] text-sky-100"><Loader2 className="h-3.5 w-3.5 animate-spin" />Discovering retained model results…</div>;
  }
  if (catalogStatus?.state === 'error') {
    return <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2.5 text-[10px] leading-4 text-red-200">{catalogStatus.error}</div>;
  }
  if (!compatibleRuns.length) {
    return <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-[10px] leading-4 text-tj-slate">No retained result run is compatible with the loaded model version.</div>;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-2">
        <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <div>
          <p className="text-[10px] font-semibold text-white">Existing model results</p>
          <p className="mt-0.5 text-[9px] leading-3.5 text-tj-slate">Uses Emil's governed Visualisation catalog and queries, bound to {catalog.model_version}. No values are recalculated.</p>
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Result run</span>
        <select value={run?.run_id || ''} onChange={event => selectRun(event.target.value)} disabled={busy} className="w-full rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50">
          {compatibleRuns.map(item => <option key={item.run_id} value={item.run_id}>{item.label || item.run_id}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Component</span>
        <select value={componentClass} onChange={event => selectComponentClass(event.target.value)} disabled={busy} className="w-full rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50" aria-label="Result component">
          {componentClasses.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Quantity</span>
        <select value={quantity?.id || ''} onChange={event => selectQuantity(event.target.value)} disabled={busy} className="w-full rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50">
          {quantities.map(item => <option key={`${item.id}:${item.unit || ''}`} value={item.id}>{quantityLabel(item)}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Category</span>
        <select
          value={category}
          onChange={event => onSelectionChange({
            ...selection,
            category: event.target.value,
            categoryObjects: quantity?.category_objects?.[event.target.value] || [],
          })}
          disabled={busy || !categories.length}
          className="w-full rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50"
          aria-label="Result category"
        >
          <option value="">All categories</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Node / region</span>
        <select value={selection?.scopeId || ''} onChange={event => onSelectionChange({ ...selection, scopeId: event.target.value })} disabled={busy} className="w-full rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50" aria-label="Result node or region">
          <option value="">All nodes and regions</option>
          {scopeOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Result period</span>
        <select value={selection?.period || periods[0] || ''} onChange={event => onSelectionChange({ ...selection, period: event.target.value })} disabled={busy} className="w-full rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50">
          {periods.map(period => <option key={period} value={period}>{run.period_granularity === 'annual' ? `Annual ${period}` : period}</option>)}
        </select>
      </label>
      {resultStatus?.state === 'error' && <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-2 text-[9px] leading-3.5 text-red-200">{resultStatus.error}</div>}
      {resultStatus?.scene && (
        <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[9px] leading-3.5 text-tj-slate">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <span><strong className="text-white">{resultStatus.scene.selection?.id}</strong> shown for {resultStatus.scene.selection?.period_label}. {Number(resultStatus.scene.coverage?.mapped_row_count ?? resultStatus.scene.coverage?.projected_row_count ?? 0).toLocaleString()} mapped objects.</span>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onShow} disabled={busy || !quantity} className="atlas-primary-action flex-1 rounded-lg border border-tj-gold/40 bg-tj-gold px-3 py-2 text-[10px] font-semibold text-tj-navy-dark disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Loading result…</span> : 'Show on map'}
        </button>
        {resultStatus?.scene && <button type="button" onClick={onClear} disabled={busy} aria-label="Clear result layer" title="Clear result layer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-tj-slate hover:bg-white/5 hover:text-white disabled:opacity-40"><X className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  );
}
