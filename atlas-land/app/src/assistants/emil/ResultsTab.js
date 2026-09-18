import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, Bot, User, Send, Loader2 } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useResultsState } from '../../hooks/useResultsState';
import { useResultsChat } from '../../hooks/useResultsChat';
import { renderMarkdown } from '../../components/shared/markdownUtils';
import { formatResultsTick, resultsAxisTicks } from '../../utils/resultsPreview';

export function ResultsObservationTooltip({ active, payload, unit }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="max-w-xs rounded-lg border border-slate-500 bg-slate-950 p-3 text-xs text-slate-100 shadow-xl">
      <p>{point.sourceDate}</p>
      <p className="font-semibold">{point.value} {unit || '(unit not supplied)'}</p>
      {(point.dimensions || []).map(({ field, value }) => <p key={field}>{field.replaceAll('_', ' ')}: {value}</p>)}
    </div>
  );
}

export default function ResultsTab({
  resultsChatMessages,
  setResultsChatMessages,
  activeAssistant,
  activeTab
}) {
  const {
    resultsAnalysis,
    resultsData,
    resultsLoading,
    resultsError,
    retryResults,
    resultsPage,
    setResultsPage,
    resultsPagination,
    resultsTableExpanded,
    setResultsTableExpanded,
    selectedParquetFile,
    setSelectedParquetFile,
    resultsFilters,
    setResultsFilters,
    resultsFilterOptions,
    resultsTimeSeries,
    resultsUnitLabel,
    resultsPreview,
    resultsActiveGroup,
    setResultsChartGroup,
  } = useResultsState({ active: activeAssistant === 'emil' && activeTab === 'results' });

  const resultsChatEndRef = useRef(null);
  const [showObservationRows, setShowObservationRows] = useState(false);
  const chartTicks = useMemo(() => resultsAxisTicks(resultsTimeSeries), [resultsTimeSeries]);
  const applyFileSelection = useCallback(fileId => {
    setSelectedParquetFile(fileId || null);
    setResultsChartGroup('');
    setResultsPage(1);
    setResultsFilters({ category_name: '', child_name: '', collection_name: '',
      sample_name: '', date_resolution: 'day' });
  }, [setSelectedParquetFile, setResultsPage, setResultsFilters, setResultsChartGroup]);
  const selectAnalysisFile = useCallback(fileId => {
    setResultsTableExpanded(true);
    applyFileSelection(fileId);
  }, [applyFileSelection, setResultsTableExpanded]);
  const {
    input: resultsChatInput, setInput: setResultsChatInput,
    loading: resultsChatLoading, progress: currentLogStep, send, stop,
  } = useResultsChat({
    active: activeAssistant === 'emil' && activeTab === 'results',
    setMessages: setResultsChatMessages, files: resultsAnalysis?.metadata?.parquet_files,
    selectFile: selectAnalysisFile,
  });
  const stopForSelection = () => stop('Stopped receiving the analysis after you changed the selection.');
  const handleParquetFileChange = fileId => { stopForSelection(); applyFileSelection(fileId); };
  const handleResultsChatSend = event => { event.preventDefault(); send(resultsChatInput); };
  useEffect(() => {
    if (activeAssistant === 'emil' && activeTab === 'results') {
      resultsChatEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  }, [resultsChatMessages, activeAssistant, activeTab]);

  return (
    <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white font-semibold mb-2 tracking-wide">Simulation Results</h3>
        <p className="text-sm text-tj-slate">View and analyze available simulation output files</p>
      </div>

      {/* AI Analysis Section */}
      {resultsLoading && !resultsAnalysis && (
        <div className="mb-6 bg-tj-navy-light/50 backdrop-blur-md rounded-xl p-4 border border-tj-gold/30">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-tj-gold animate-spin" />
            <span className="text-sm text-tj-gray">Loading analysis...</span>
          </div>
        </div>
      )}

      {resultsError && (
        <div role="alert" className="mb-6 bg-red-900/20 rounded-xl p-4 border border-red-500/50">
          <p className="text-sm text-slate-200">{resultsError}</p>
          <button type="button" onClick={retryResults} className="mt-2 text-tj-gold">Retry results</button>
        </div>
      )}

      {/* Results Chatbox - Ask Questions */}
      <div className="mb-6 bg-tj-navy-light/50 backdrop-blur-md rounded-xl border border-white/5 shadow-sm">
        <div className="p-4 border-b border-white/5 bg-tj-navy-light/30">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-tj-gold" />
            <h4 className="text-base font-semibold text-tj-gray">Ask about simulation results</h4>
          </div>
          <p className="text-xs text-tj-slate mt-1">I'm your intelligent energy modeller assistant. Ask me anything about the simulation results.</p>
        </div>

        {/* Chat Messages */}
        <div role="log" aria-label="Results conversation" className="h-[min(50vh,600px)] overflow-y-auto p-4 space-y-3 bg-tj-navy-dark/60 backdrop-blur-md">
          {resultsChatMessages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.sender === 'bot' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tj-navy-light/80 border border-tj-gold/30 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-tj-gold" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2 ${message.sender === 'user'
                    ? 'bg-tj-gold/20 text-tj-gold border border-tj-gold/50 shadow-[0_0_10px_rgba(219,187,28,0.1)]'
                    : message.isError
                      ? 'bg-red-900/20 text-red-400 border border-red-500/50 backdrop-blur-md'
                      : 'bg-tj-navy-dark/40 backdrop-blur-md text-tj-gray border border-white/5'
                  }`}
              >
                <div className="text-sm prose prose-sm max-w-none">
                  {renderMarkdown(message.text)}
                </div>
                {message.metadata && (
                  <div className="mt-2 pt-2 border-t border-white/5 text-xs text-tj-slate">
                    {Number.isSafeInteger(message.metadata.filtered_rows) && Number.isSafeInteger(message.metadata.total_rows) && (
                    <div>Analyzed {message.metadata.filtered_rows?.toLocaleString()} of {message.metadata.total_rows?.toLocaleString()} rows</div>
                    )}
                    {message.metadata.filtering_applied?.length > 0 && (
                      <div className="mt-1">
                        Filters: {message.metadata.filtering_applied.map(f => f.column).join(', ')}
                      </div>
                    )}
                  </div>
                )}
                <p className={`text-xs mt-1 ${message.sender === 'user' ? 'text-blue-100' : 'text-tj-slate'}`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {message.sender === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tj-navy-light/80 border border-white/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-tj-slate" />
                </div>
              )}
            </div>
          ))}
          {resultsChatLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tj-navy-light/80 border border-tj-gold/30 flex items-center justify-center">
                <Loader2 className="h-4 w-4 text-tj-gold animate-spin" />
              </div>
              <div className="bg-tj-navy-light/50 backdrop-blur-md rounded-xl px-4 py-2 border border-white/5 relative min-h-[40px] flex items-center">
                {currentLogStep ? (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1">
                    <div className="flex-1">
                      <div className="text-xs font-semibold tracking-wider uppercase text-tj-slate text-tj-gray">{currentLogStep.step}</div>
                      <div className="text-xs text-tj-slate">{currentLogStep.message}</div>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-tj-slate">Processing...</span>
                )}
              </div>
            </div>
          )}
          <div ref={resultsChatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="border-t border-white/5 p-4 bg-tj-navy-light/50 backdrop-blur-md">
          <form onSubmit={handleResultsChatSend} className="flex gap-2">
            <input
              type="text"
              value={resultsChatInput}
              onChange={(e) => setResultsChatInput(e.target.value)}
              placeholder="Ask a question about the simulation results..."
              aria-label="Results question"
              className="flex-1 px-4 py-2 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-tj-gold focus:border-transparent text-sm bg-tj-navy-dark/50 text-tj-gray"
              disabled={resultsChatLoading}
            />
            <button
              type="submit"
              disabled={!resultsChatInput.trim() || resultsChatLoading}
              className="px-4 py-2 bg-tj-gold/20 text-tj-gold border border-tj-gold/50 rounded-xl hover:bg-tj-gold/40 hover:shadow-[0_0_15px_rgba(219,187,28,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Ask
            </button>
            {resultsChatLoading && (
              <button type="button" onClick={() => stop()} className="px-3 py-2 border border-white/20 rounded-xl text-tj-gray">
                Stop analysis
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Detailed Results Table */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            aria-expanded={resultsTableExpanded}
            onClick={() => setResultsTableExpanded(!resultsTableExpanded)}
            className="flex items-center gap-2 text-base font-medium text-tj-gray hover:text-tj-gray transition-colors"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${resultsTableExpanded ? 'rotate-180' : ''}`}
            />
            <span>Detailed Results</span>
          </button>
          {resultsPagination && resultsTableExpanded && (
            <div className="flex items-center gap-2 text-sm text-tj-slate">
              <span>
                Page {resultsPagination.page} of {Math.max(1, resultsPagination.total_pages)}
                {resultsPagination.filtered ? (
                  <>
                    ({resultsPagination.total_rows.toLocaleString()} filtered / {resultsPagination.original_rows?.toLocaleString()} total rows)
                  </>
                ) : (
                  <>
                    ({resultsPagination.total_rows.toLocaleString()} total rows)
                  </>
                )}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => { stopForSelection(); setResultsPage(resultsPage - 1); }}
                  disabled={resultsLoading || resultsPage <= 1}
                  className="px-2 py-1 border border-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-tj-navy-dark/70/60 backdrop-blur-md"
                >
                  Previous
                </button>
                <button
                  onClick={() => { stopForSelection(); setResultsPage(resultsPage + 1); }}
                  disabled={resultsLoading || resultsPage >= resultsPagination.total_pages}
                  className="px-2 py-1 border border-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-tj-navy-dark/70/60 backdrop-blur-md"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {resultsTableExpanded && (
          <>
            {/* Parquet File Selection Dropdown */}
            {resultsAnalysis?.metadata?.parquet_files && resultsAnalysis.metadata.parquet_files.length > 0 && (
              <div className="mb-4 p-4 bg-tj-navy-dark/60 backdrop-blur-md rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <label htmlFor="parquet-file-select" className="text-sm font-semibold text-tj-gray">
                    Select Parquet File:
                  </label>
                  <select
                    id="parquet-file-select"
                    value={selectedParquetFile || ''}
                    onChange={(e) => handleParquetFileChange(e.target.value)}
                    className="flex-1 max-w-md px-3 py-2 text-sm border border-white/10 rounded-xl bg-tj-navy-light/50 backdrop-blur-md hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-tj-gold focus:border-tj-gold"
                  >
                    <option value="">None selected</option>
                    {resultsAnalysis.metadata.parquet_files.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                  {resultsPagination && (
                    <span className="text-xs text-tj-slate">
                      {resultsPagination.filtered ? (
                        <>({resultsPagination.total_rows.toLocaleString()} filtered rows)</>
                      ) : (
                        <>({resultsPagination.total_rows.toLocaleString()} rows)</>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Filters for time-series */}
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { key: 'category_name', label: 'Category' },
                { key: 'child_name', label: 'Child' },
                { key: 'collection_name', label: 'Collection' },
                { key: 'sample_name', label: 'Sample' },
                {
                  key: 'date_resolution', label: 'Date labels', options: [
                    { value: 'day', label: 'Day' },
                    { value: 'month', label: 'Month' },
                    { value: 'year', label: 'Year' },
                  ]
                },
              ].map((f) => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-tj-gray">{f.label}</label>
                  <select
                    aria-label={f.label}
                    value={resultsFilters[f.key]}
                    onChange={(e) => {
                      stopForSelection();
                      if (f.key !== 'date_resolution') setResultsPage(1);
                      setResultsFilters(prev => ({ ...prev, [f.key]: e.target.value }));
                    }}
                    className="px-3 py-2 text-sm border border-white/10 rounded-xl bg-tj-navy-light/50 backdrop-blur-md hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-tj-gold focus:border-tj-gold"
                  >
                    {f.options ? (
                      f.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))
                    ) : (
                      <>
                        <option value="">All</option>
                        {resultsFilterOptions[f.key]?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-tj-slate">
              <span className="font-semibold">Active filters:</span>
              {['category_name', 'child_name', 'collection_name', 'sample_name', 'date_resolution'].map(k => (
                resultsFilters[k] ? (
                  <span key={k} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                    {k === 'date_resolution' ? 'date labels' : k.replace('_', ' ')}: {resultsFilters[k]}
                  </span>
                ) : null
              ))}
              {Object.values(resultsFilters).some(Boolean) && (
                <button
                  onClick={() => {
                    stopForSelection();
                    setResultsPage(1);
                    setResultsFilters({ category_name: '', child_name: '', collection_name: '', sample_name: '', date_resolution: 'day' });
                  }}
                  className="px-2 py-1 text-tj-gold hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {resultsPreview.skipped > 0 && (
              <p role="status" className="mb-3 text-sm text-amber-200">
                {resultsPreview.skipped} loaded rows could not be plotted:
                {' '}{resultsPreview.excluded.value} invalid values,
                {' '}{resultsPreview.excluded.date} unsupported or invalid dates,
                {' '}{resultsPreview.excluded.unit} invalid units. Missing values are not treated as zero.
              </p>
            )}
            {resultsLoading && resultsData.length === 0 ? (
              <div role="status" className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
                <span className="ml-2 text-sm text-tj-slate">Loading data...</span>
              </div>
            ) : resultsTimeSeries.length > 0 ? (
              <div className="p-4 bg-tj-navy-light/50 backdrop-blur-md border border-white/5 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-tj-gray">Source observations — current page</h4>
                    <p className="text-xs text-tj-slate">
                      Showing {resultsTimeSeries.length} of {resultsPreview.observations} valid observations from {resultsData.length} loaded rows.
                      {' '}Values are not summed, averaged or interpolated. This is not a complete-file total.
                    </p>
                    <p className="text-xs text-tj-slate mt-1">
                      {resultsActiveGroup.clock === 'utc' ? 'Times shown in UTC.' : 'Source time: no timezone was supplied; no timezone conversion is inferred.'}
                      {' '}Units: {resultsUnitLabel || 'not supplied'}.
                    </p>
                    {resultsPreview.groups.length > 1 && (
                      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-tj-gray">
                        Chart unit / time basis
                        <select aria-label="Chart unit / time basis" value={resultsActiveGroup.key}
                          onChange={event => setResultsChartGroup(event.target.value)}
                          className="rounded-lg border border-white/20 bg-tj-navy-dark px-3 py-2">
                          {resultsPreview.groups.map(group => <option key={group.key} value={group.key}>{group.label} ({group.points.length})</option>)}
                        </select>
                        <span className="text-xs text-tj-slate">{resultsPreview.groups.length} separate groups; incompatible units or time bases are not combined.</span>
                      </label>
                    )}
                  </div>
                </div>
                <div style={{ width: '100%', height: 360 }}>
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 12, right: 20, bottom: 12, left: 15 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                      <XAxis type="number" dataKey="time" domain={['dataMin', 'dataMax']} scale="time"
                        ticks={chartTicks}
                        tick={{ fontSize: 12, fill: '#cbd5e1' }}
                        tickFormatter={value => formatResultsTick(value, resultsFilters.date_resolution)} />
                      <YAxis
                        type="number" dataKey="value" tick={{ fontSize: 12, fill: '#cbd5e1' }}
                        label={resultsUnitLabel ? { value: resultsUnitLabel, fill: '#cbd5e1', angle: -90, position: 'insideLeft', offset: 10 } : undefined}
                      />
                      <Tooltip content={<ResultsObservationTooltip unit={resultsUnitLabel} />} />
                      <Scatter name={resultsUnitLabel || 'Source values'} data={resultsTimeSeries} fill="#38bdf8" isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <button type="button" aria-expanded={showObservationRows}
                  onClick={() => setShowObservationRows(previous => !previous)}
                  className="mt-3 rounded-lg border border-white/20 px-3 py-2 text-sm text-tj-gray">
                  {showObservationRows ? 'Hide displayed observations' : 'View displayed observations'}
                </button>
                {showObservationRows && (
                  <div className="mt-3 max-h-72 overflow-auto" tabIndex={0} role="region" aria-label="Displayed observation rows">
                    <table className="w-full text-left text-xs text-slate-200">
                      <caption className="text-left pb-2">Current unit and time basis only. Equal timestamps or values remain separate source rows.</caption>
                      <thead><tr>{['Source timestamp', 'Value', 'Unit', 'Series metadata'].map(label => <th key={label} scope="col" className="p-2 border-b border-slate-500">{label}</th>)}</tr></thead>
                      <tbody>{resultsTimeSeries.map((point, index) => <tr key={index}>
                        <td className="p-2 align-top whitespace-nowrap">{point.sourceDate}</td>
                        <td className="p-2 align-top">{point.value}</td>
                        <td className="p-2 align-top">{resultsUnitLabel || 'Not supplied'}</td>
                        <td className="p-2 align-top">{point.dimensions.map(({ field, value }) => `${field.replaceAll('_', ' ')}: ${value}`).join(' · ') || 'Not supplied'}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-tj-slate">
                <p className="text-sm">
                  {!selectedParquetFile
                    ? 'Please select a parquet file to view the time series chart.'
                    : resultsData.length ? 'No valid observations can be plotted for this selection.' : 'No data available for the selected filters.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
