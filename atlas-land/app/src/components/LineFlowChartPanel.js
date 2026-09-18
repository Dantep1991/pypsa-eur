import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLineFlowProfile } from '../hooks/useLineFlowProfile';

const TIME_VIEWS = ['hourly', 'daily', 'weekly', 'monthly'];

// Flow profile chart panel for line/link popup
export default function LineFlowChartPanel({ dirname, name, type, granularityPrefix }) {
  const [timeView, setTimeView] = React.useState('weekly');
  const { data: flowData, loading, error, retry } = useLineFlowProfile({ dirname, name, type, granularityPrefix, timeView });
  const sourceKey = JSON.stringify([dirname, name, type, granularityPrefix]);
  const adjustedSource = React.useRef(null);

  React.useEffect(() => {
    if (!TIME_VIEWS.includes(flowData?.recommended_view) || adjustedSource.current === sourceKey) return;
    // Auto-adjust only when the selected view has no data points.
    const p0Len = flowData?.p0?.data?.length || 0;
    const p1Len = flowData?.p1?.data?.length || 0;
    if ((p0Len > 1 || p1Len > 1) || flowData.recommended_view === timeView) return;
    adjustedSource.current = sourceKey;
    setTimeView(flowData.recommended_view);
  }, [flowData, timeView, sourceKey]);

  const getTickInterval = (len) => {
    if (len > 240) return Math.ceil(len / 12);
    if (len > 120) return Math.ceil(len / 10);
    if (len > 60) return Math.ceil(len / 8);
    return 'preserveStartEnd';
  };

  const renderChart = (profile, color) => {
    if (!profile || !profile.data) return null;
    const normalizedData = profile.data.map((d) => ({
      x: d.x ?? d.month ?? '',
      value: d.value,
      timestamp: d.timestamp || null,
    }));
    if (!normalizedData.length) return null;

    const gradId = `flow-grad-${color.replace('#', '')}`;
    const max = Math.max(...normalizedData.map(d => Math.abs(d.value)));
    const tickInterval = getTickInterval(normalizedData.length);
    const viewLabel = `${timeView.charAt(0).toUpperCase()}${timeView.slice(1)} avg`;
    return (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-tj-slate uppercase tracking-wider">{profile.label}</span>
          <span className="text-[9px] text-tj-slate/60">{viewLabel}</span>
        </div>
        <div style={{ width: '100%', height: 72 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={normalizedData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="10%" stopColor={color} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="x"
                tick={{ fill: '#8b96a7', fontSize: 8 }}
                tickLine={false}
                axisLine={{ stroke: '#ffffff15' }}
                interval={tickInterval}
              />
              <YAxis tick={{ fill: '#8b96a7', fontSize: 8 }} tickLine={false} axisLine={false} width={36}
                tickFormatter={v => `${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111c2d', border: `1px solid ${color}44`, borderRadius: 5, padding: '4px 8px', fontSize: 10 }}
                labelStyle={{ color: '#9ca3af' }} itemStyle={{ color }}
                labelFormatter={(label) => label}
                formatter={v => [`${v} ${profile.unit}`, profile.label]}
              />
              {/* zero reference line */}
              {max > 0 && <CartesianGrid vertical={false} stroke="#ffffff08" />}
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 px-2.5 py-2 min-w-[180px]">
      <div className="flex items-center justify-between mb-1.5 gap-1.5">
        <div className="text-[10px] text-tj-slate uppercase tracking-wider font-medium">Power Flow</div>
        <div className="inline-flex rounded-md border border-white/10 bg-black/20 p-0.5">
          {TIME_VIEWS.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={timeView === mode}
              onClick={() => { adjustedSource.current = sourceKey; setTimeView(mode); }}
              className={`px-1.5 py-0.5 text-[9px] rounded-sm transition-colors ${
                timeView === mode
                  ? 'bg-tj-gold/80 text-black font-semibold'
                  : 'text-tj-slate hover:text-tj-gray'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      {loading && (
        <div className="flex items-center justify-center h-16" role="status" aria-label="Loading flow profile">
          <div className="w-4 h-4 border-2 border-tj-slate/30 border-t-tj-slate rounded-full animate-spin" />
        </div>
      )}
      {error && <div role="alert" className="text-[11px] text-slate-200">
        <p>{error}</p><button type="button" onClick={retry} className="mt-1 text-tj-gold">Retry flow profile</button>
      </div>}
      {!loading && !error && !flowData?.p0?.data?.length && !flowData?.p1?.data?.length && (
        <div className="text-[11px] text-tj-slate italic">No flow data available</div>
      )}
      {!loading && !error && flowData && (
        <>
          {renderChart(flowData.p0, type === 'link' ? '#f59e0b' : '#3b82f6')}
          {flowData.p1 && renderChart(flowData.p1, '#34d399')}
        </>
      )}
    </div>
  );
}
