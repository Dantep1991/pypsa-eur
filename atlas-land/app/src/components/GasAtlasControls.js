import React from 'react';
import InfrastructureLoadStatus from './InfrastructureLoadStatus';
import { Database, Globe, PanelLeftClose, RefreshCw } from 'lucide-react';

const DOMAIN_ORDER = ['Grid', 'Supply', 'Demand', 'Storage'];

export default function GasAtlasControls({
  hidden,
  onCollapse,
  status,
  loading,
  checking = false,
  loaded = false,
  empty = false,
  error,
  countryFilter,
  onCountryChange,
  onReload,
}) {
  const domainCounts = status?.domains || {};
  const countries = Array.isArray(status?.countries) ? status.countries : [];
  const sources = Array.isArray(status?.sources) ? status.sources : [];

  return (
    <aside
      aria-hidden={hidden}
      inert={hidden ? '' : undefined}
      className={`absolute top-[76px] left-3 z-[510] w-[320px] max-w-[calc(100vw-1.5rem)] transition-all duration-200 ${hidden ? '-translate-x-[110%] opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}
    >
      <div className="bg-[#071421]/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-y-auto overflow-x-hidden max-h-[calc(100vh-7.25rem)] shadow-2xl scrollbar-hidden">
        <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-tj-slate">Gas workspace</p>
            <p className="text-sm font-semibold text-white">European methane network</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-2 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">Local PoC</span>
            <button
              type="button"
              onClick={onCollapse}
              className="h-7 w-7 rounded-lg border border-white/10 text-tj-slate transition hover:border-white/20 hover:bg-white/5 hover:text-white flex items-center justify-center"
              aria-label="Hide gas controls"
              title="Hide gas controls"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <InfrastructureLoadStatus label="Methane" loading={loading} checking={checking}
          loaded={loaded} empty={empty} error={error} onReload={onReload} />

        <section className="p-3 border-b border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-tj-gold" />
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-tj-gold/80">Geography Domain</p>
              <p className="text-xs font-semibold text-white">Network coverage</p>
            </div>
          </div>
          <label className="block">
            <span className="block mb-1 text-[10px] uppercase tracking-wider text-tj-slate">Country</span>
            <select
              value={countryFilter}
              onChange={(event) => onCountryChange(event.target.value)}
              disabled={loading || checking || !countries.length}
              className="w-full px-2.5 py-2 rounded-lg bg-[#081523] border border-white/10 text-white focus:outline-none focus:border-tj-gold/50 disabled:opacity-50"
              aria-label="Gas network country"
            >
              <option value="">All Europe</option>
              {countries.map((country) => <option key={country} value={country}>{country}</option>)}
            </select>
          </label>
          <p className="text-[10px] leading-4 text-slate-300">Database totals · all countries, not just the map selection</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DOMAIN_ORDER.map((domain) => (
              <div key={domain} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                <p className="text-[9px] uppercase tracking-wider text-tj-slate">{domain}</p>
                <p className="mt-0.5 text-sm font-semibold text-white">{status?.available ? Number(domainCounts[domain] || 0).toLocaleString() : '—'}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="p-3 border-b border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-tj-gold" />
              <div>
                <p className="text-[9px] uppercase tracking-[0.16em] text-tj-gold/80">Data provenance</p>
                <p className="text-xs font-semibold text-white">Merged local database</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onReload}
              disabled={loading}
              className="h-8 w-8 rounded-lg border border-white/10 text-tj-slate hover:text-white hover:bg-white/5 disabled:opacity-40 flex items-center justify-center"
              title="Reload gas data"
              aria-label="Reload gas data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="mt-2 space-y-1.5">
            {sources.map((source) => (
              <div key={source.source_key} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                <p className="text-[10px] font-medium text-white">{source.title}</p>
                <p className="mt-0.5 text-[9px] leading-3.5 text-tj-slate">{source.publisher}{source.version ? ` · ${source.version}` : ''}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-3.5 text-tj-slate">Routed topology is from SciGRID_gas. ENTSOG supplies the 2026 capacity, demand, production and storage snapshot.</p>
        </section>
      </div>
    </aside>
  );
}
