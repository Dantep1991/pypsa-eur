import {fetchFlowYear, historySamples, accumulateCapacityEvidence} from './flowHistory';
import {fetchLolaFlowScene, selectedFlowSamples, FLOW_RESOLUTIONS} from './lolaFlowData';
import {flowPeriodMetrics} from './flowPeriodMetrics';

// History follows the committed map selection, not an independent display
// reducer. Native daily energy must never be labelled as mean hourly power.
export function flowHistoryKey(projectId, scene, lineId) {
  const selection = scene.selection;
  return JSON.stringify([projectId, selection.modelVersion, selection.runId,
    selection.className, selection.propertyName, selection.reportFamily,
    selection.period, selection.granularity, scene.unit, selection.derivedNetFlow, lineId]);
}

export async function fetchFlowHistory(context, scene, name, options = {}, fetchScene = fetchLolaFlowScene) {
  const resolution = scene.selection.granularity;
  if (!FLOW_RESOLUTIONS.includes(resolution)) throw new Error('Choose a supported flow time resolution.');
  // Annual already contains the exact native/derived net observation, with its
  // own units and directional limits. Do not replace it with an hourly mean.
  if (resolution === 'year') return scene;
  const year = String(scene.selection.period);
  if (scene.selection.dateFrom === `${year}-01-01` && scene.selection.dateTo === `${year}-12-31`) {
    const lines = scene.lines.filter(line => line.name === name);
    if (!lines.length) throw new Error('History connection is absent from the loaded flows.');
    const history = {...scene, lines};
    if (resolution === 'hour') {
      const stats = new Map(); accumulateCapacityEvidence(stats, history);
      const expectedHours = (Date.UTC(Number(year)+1,0,1)-Date.UTC(Number(year),0,1))/3600000;
      stats.forEach(item => {item.expectedHours=expectedHours;item.share=item.validHours?item.nearHours/item.validHours:null;});
      return {...history, stats};
    }
    return history;
  }
  if (resolution === 'hour') return fetchFlowYear(context, scene, [name], options, fetchScene);
  const selection = {...scene.selection, dateFrom:`${scene.selection.period}-01-01`,
    dateTo:`${scene.selection.period}-12-31`};
  const topology = {schema:'nohm.atlas.flow-topology.v1',project_id:context.projectId,
    model_version:selection.modelVersion,class_name:selection.className,lines:scene.lines};
  const history = await fetchScene(context, selection, {...options,topology,entityNames:[name]});
  if (history.lines.some(line => line.name !== name) || history.unit !== scene.unit
    || history.selection.granularity !== resolution) {
    throw new Error('History does not match the selected connection, resolution and unit.');
  }
  return history;
}

export function flowHistorySamples(history, lineId, nearPercent=99) {
  const resolution = history.selection.granularity;
  if (resolution === 'hour') return historySamples(history, lineId, 'hour', nearPercent);
  const line = history.lines.find(item => item.id === lineId);
  const samples = selectedFlowSamples(history, lineId).map(sample => ({...sample,
    maximumRatio:flowPeriodMetrics(line,sample.value,history.unit,resolution,history.direction,sample.period)?.utilisation ?? null}));
  // Retain calendar gaps without deriving values or turning missing periods into
  // zero. Preserve the reported weekly anchor rather than assuming ISO weeks:
  // native services can use a different week start, including before Jan 1.
  const year = Number(history.selection.period);
  if (!/^\d{4}$/.test(String(history.selection.period)) || !samples.length) return samples;
  const instants = new Set(samples.map(sample => Date.parse(sample.period)));
  const end = Date.UTC(year+1,0,1);
  let date = new Date(Date.UTC(year,0,1));
  if (resolution === 'week') {
    const anchor = new Date(samples[0].period).getUTCDay();
    date.setUTCDate(date.getUTCDate()-((date.getUTCDay()-anchor+7)%7));
  }
  while (date.getTime() < end) {
    if (!instants.has(date.getTime())) samples.push({period:date.toISOString(),value:null,maximumRatio:null});
    if (resolution === 'year') break;
    if (resolution === 'month') date.setUTCMonth(date.getUTCMonth()+1);
    else date.setUTCDate(date.getUTCDate()+(resolution === 'week'?7:1));
  }
  return samples.sort((a,b) => Date.parse(a.period)-Date.parse(b.period));
}

export function historyPeriodSelection(scene, period) {
  const resolution = scene.selection.granularity;
  const start = new Date(period), end = new Date(period);
  if (!Number.isFinite(start.getTime())) throw new Error('Choose a valid history period.');
  if (resolution === 'week') end.setUTCDate(end.getUTCDate()+6);
  if (resolution === 'month') { end.setUTCMonth(end.getUTCMonth()+1); end.setUTCDate(0); }
  const yearStart = `${scene.selection.period}-01-01`, yearEnd = `${scene.selection.period}-12-31`;
  return {...scene.selection,
    dateFrom:resolution==='year'?yearStart:[start.toISOString().slice(0,10),yearStart].sort().at(-1),
    dateTo:resolution==='year'?yearEnd:[end.toISOString().slice(0,10),yearEnd].sort()[0]};
}
