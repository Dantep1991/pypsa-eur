import {flowPeriodIndex, flowRangeWindows, mergeFlowWindows} from './flowTimeline';

test('bucket identity respects exact hours, native weekly anchors and missing periods',()=>{
  expect(flowPeriodIndex(['2050-01-01T01:00:00Z'],'2050-01-01T02:00:00Z','hour')).toBe(-1);
  expect(flowPeriodIndex(['2050-01-01'],'2050-01-01T23:00:00Z','day')).toBe(0);
  expect(flowPeriodIndex(['2049-12-27','2050-01-03'],'2050-01-02','week')).toBe(0);
  expect(flowPeriodIndex(['2050-01-01'],'2050-02-01','day')).toBe(-1);
});
test('short ranges stay one request, annual hourly windows cover the calendar without truncation',()=>{
  expect(flowRangeWindows('2050-01-01','2050-01-01',208)).toHaveLength(1);
  const windows=flowRangeWindows('2052-01-01','2052-12-31',208);
  expect(windows.reduce((sum,w)=>sum+(Date.parse(w.dateTo)-Date.parse(w.dateFrom))/86400000+1,0)).toBe(366);
  windows.forEach(w=>expect(((Date.parse(w.dateTo)-Date.parse(w.dateFrom))/86400000+1)*208*24).toBeLessThanOrEqual(60000));
  const chunks=windows.map(w=>({selection:w,unit:'MW',direction:1,periods:[w.dateFrom],maximum:7,
    lines:[{id:'a',coordinates:[[1,2],[3,4]],values:new Map([[w.dateFrom,7]])}]}));
  const merged=mergeFlowWindows(chunks,{dateFrom:'2052-01-01',dateTo:'2052-12-31'});
  expect(merged.lines[0].values.size).toBe(windows.length);
  expect(merged.coverage.rows).toBe(windows.length);
  expect(()=>mergeFlowWindows([chunks[0],chunks[0]],{})).toThrow('Overlapping');
  expect(()=>mergeFlowWindows([chunks[0],{...chunks[1],unit:'GWh'}],{})).toThrow('incompatible');
});
