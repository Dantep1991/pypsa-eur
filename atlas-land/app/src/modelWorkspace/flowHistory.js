import { fetchLolaFlowScene } from './lolaFlowData';
import { flowPeriodMetrics, flowPeriodHours } from './flowPeriodMetrics';

export function flowYearWindows(year, connections = 1) {
  if (!/^\d{4}$/.test(String(year))) throw new Error('Choose a valid result year.');
  // Stay below both the API's 31-day bound and 150,000-row response ceiling.
  const days = Math.min(28, Math.floor(140000 / (Math.max(1, connections) * 24)));
  if (days < 1) throw new Error('Narrow the connection category before loading hourly evidence.');
  const end = Date.UTC(Number(year) + 1, 0, 1), windows = [];
  for (let start = Date.UTC(Number(year), 0, 1); start < end; start += days * 86400000) {
    windows.push({dateFrom:new Date(start).toISOString().slice(0,10),
      dateTo:new Date(Math.min(end, start + days * 86400000) - 86400000).toISOString().slice(0,10)});
  }
  return windows;
}

export function hourlyEvidenceSelection(scene) {
  const metric = scene?.selection.historyMetric;
  if (!metric?.availableGranularities?.includes('hour')) return null;
  return {...scene.selection, ...metric, granularity:'hour', derivedNetFlow:false,
    unit:metric.unitsByGranularity?.hour || metric.unit, category:scene.selection.category};
}

export function accumulateCapacityEvidence(stats, scene) {
  for (const line of scene.lines) {
    const item = stats.get(line.id) || {id:line.id,name:line.name,reportedHours:0,validHours:0,nearHours:0,utilisationCounts:Array(101).fill(0)};
    for (const [period,value] of line.values) {
      item.reportedHours++;
      const ratio = flowPeriodMetrics(line,value,scene.unit,'hour',scene.direction,period)?.utilisation;
      if (ratio != null) { item.validHours++; if (ratio >= .99) item.nearHours++;
        item.utilisationCounts[Math.min(100,Math.max(0,Math.floor(ratio*100+1e-9)))]++; }
    }
    stats.set(line.id,item);
  }
}

// Integer-percent display thresholds can be changed without rereading millions of rows.
export function capacityAtThreshold(item, percent=99) {
  if(!item) return null;
  const nearHours=item.utilisationCounts ? item.utilisationCounts.slice(percent).reduce((a,b)=>a+b,0) : item.nearHours;
  return {...item,nearHours,share:item.validHours?nearHours/item.validHours:null,nearPercent:percent};
}

export async function fetchFlowYear(context, scene, names, options = {}, fetchScene = fetchLolaFlowScene) {
  const selection = hourlyEvidenceSelection(scene);
  if (!selection) throw new Error('This run has no declared hourly flow quantity. Annual energy is not hourly history.');
  const windows = flowYearWindows(selection.period, names.length);
  const topology = {schema:'nohm.atlas.flow-topology.v1',project_id:context.projectId,
    model_version:selection.modelVersion,class_name:selection.className,lines:scene.lines};
  const stats = new Map(), lines = new Map(), periods = new Set(), warnings=[];
  for (let i=0;i<windows.length;i++) {
    if (options.signal?.aborted) throw new DOMException('Cancelled','AbortError');
    const chunk = await fetchScene(context,{...selection,...windows[i]}, {...options,topology,entityNames:names,allowEmptyHistoryWindow:true,
      onProgress: progress => options.onProgress?.({completed:i,total:windows.length,
        phase:`${windows[i].dateFrom} – ${windows[i].dateTo} · ${progress.phase}`})});
    if (options.signal?.aborted) throw new DOMException('Cancelled','AbortError');
    const first=Date.parse(windows[i].dateFrom),last=Date.parse(windows[i].dateTo)+86400000;
    if(chunk.lines.some(line=>!names.includes(line.name))||chunk.periods.some(period=>
      !Number.isFinite(Date.parse(period))||Date.parse(period)<first||Date.parse(period)>=last)) {
      throw new Error('Hourly evidence escaped the requested connection or date window.');
    }
    accumulateCapacityEvidence(stats,chunk);
    warnings.push(...(chunk.warnings||[]));
    if (options.collect !== false) {
      chunk.periods.forEach(period=>periods.add(period));
      chunk.lines.forEach(line=>{
        const existing=lines.get(line.id) || {...line,values:new Map(),reportedLimits:line.reportedLimits?new Map():undefined};
        for (const [period,value] of line.values) {
          if (existing.values.has(period)) throw new Error('Overlapping hourly history was returned.');
          existing.values.set(period,value);
        }
        line.reportedLimits?.forEach((limit,period)=>existing.reportedLimits.set(period,limit));
        lines.set(line.id,existing);
      });
    }
    options.onProgress?.({completed:i+1,total:windows.length,phase:windows[i].dateTo});
  }
  const expectedHours=flowPeriodHours(`${selection.period}-01-01`,'year');
  if(!stats.size) throw new Error('No hourly observations were returned for the selected year. No history was inferred.');
  stats.forEach(item=>{ item.expectedHours=expectedHours; item.share=item.validHours?item.nearHours/item.validHours:null; });
  return {selection,unit:selection.unit,direction:selection.propertyName==='Flow Back'?-1:1,
    periods:[...periods].sort(),lines:[...lines.values()],stats,warnings};
}

// Display aggregation only. Counts distinguish unreported observations from zero.
export function historySamples(history, lineId, resolution='hour', nearPercent=99) {
  const line=history?.lines.find(item=>item.id===lineId);
  if (!line) return [];
  const groups=new Map();
  for (const [period,value] of line.values) {
    const date=new Date(period), dateKey=date.toISOString().slice(0,10);
    let key=period;
    if (resolution==='day') key=dateKey;
    if (resolution==='month') key=`${dateKey.slice(0,7)}-01`;
    if (resolution==='week') { date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));key=date.toISOString().slice(0,10); }
    const item=groups.get(key)||{period:key,firstPeriod:period,value:0,count:0,near:0,valid:0,maximumRatio:null};
    if(Date.parse(period)<Date.parse(item.firstPeriod)) item.firstPeriod=period;
    const ratio=flowPeriodMetrics(line,value,history.unit,'hour',history.direction,period)?.utilisation;
    item.value+=value;item.count++;
    if(ratio!=null){item.valid++;item.near+=ratio>=nearPercent/100?1:0;item.maximumRatio=Math.max(item.maximumRatio??0,ratio);}
    groups.set(key,item);
  }
  if(resolution==='hour' && /^\d{4}$/.test(String(history.selection?.period))) {
    const year=Number(history.selection.period),end=Date.UTC(year+1,0,1);
    const instants=new Set([...groups.keys()].map(Date.parse));
    for(let date=Date.UTC(year,0,1);date<end;date+=3600000) {
      if(!instants.has(date)) { const period=new Date(date).toISOString();groups.set(period,{period,value:null,count:0,near:0,valid:0,maximumRatio:null}); }
    }
  }
  return [...groups.values()].sort((a,b)=>Date.parse(a.period)-Date.parse(b.period)).map(item=>({...item,value:item.count?item.value/item.count:null}));
}
