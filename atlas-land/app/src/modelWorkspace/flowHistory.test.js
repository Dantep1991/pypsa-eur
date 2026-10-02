import {flowYearWindows,fetchFlowYear,historySamples,accumulateCapacityEvidence,capacityAtThreshold} from './flowHistory';

const selection={period:'2052',modelVersion:'v1',className:'Line',historyMetric:{propertyName:'Flow',unit:'MW',availableGranularities:['hour']}};
const line={id:'Line:A',name:'A',values:new Map(),coordinates:[[1,2],[3,4]]};
const source={selection,lines:[line]};
test('year windows cover every leap-year day once and stay under API bounds',()=>{
  const windows=flowYearWindows(2052,300),days=windows.reduce((sum,item)=>sum+(Date.parse(item.dateTo)-Date.parse(item.dateFrom))/86400000+1,0);
  expect(days).toBe(366);expect(windows[0].dateFrom).toBe('2052-01-01');expect(windows.at(-1).dateTo).toBe('2052-12-31');
  windows.forEach(item=>expect(((Date.parse(item.dateTo)-Date.parse(item.dateFrom))/86400000+1)*24*300).toBeLessThan(150000));
  expect(()=>flowYearWindows('invalid')).toThrow();
});
test('full-year queries are exact-entity scoped, retain all records, and report progress',async()=>{
  const fetchScene=jest.fn(async(_context,request)=>({periods:[request.dateFrom],unit:'MW',direction:1,
    lines:[{...line,values:new Map([[request.dateFrom,100]]),reportedLimits:new Map([[request.dateFrom,{unit:'MW',forward:100,reverse:100}]])}]}));
  const progress=jest.fn(),result=await fetchFlowYear({projectId:'Test'},source,['A'],{onProgress:progress},fetchScene);
  expect(fetchScene).toHaveBeenCalledTimes(14);expect(fetchScene.mock.calls[0][2].entityNames).toEqual(['A']);
  expect(result.lines[0].values.size).toBe(14);expect(result.stats.get(line.id)).toMatchObject({reportedHours:14,validHours:14,nearHours:14,expectedHours:8784});
  expect(progress).toHaveBeenLastCalledWith({completed:14,total:14,phase:'2052-12-31'});
});
test('missing declared limits do not count as spare capacity and reverse uses import limit',()=>{
  const stats=new Map();accumulateCapacityEvidence(stats,{unit:'MW',direction:1,lines:[{...line,
    values:new Map([['2052-01-01T00:00:00Z',-50],['2052-01-01T01:00:00Z',1]]),
    reportedLimits:new Map([['2052-01-01T00:00:00Z',{unit:'MW',forward:100,reverse:50}]])}]});
  expect(stats.get(line.id)).toMatchObject({reportedHours:2,validHours:1,nearHours:1});
});
test('daily mean retains sample count and does not invent missing hours',()=>{
  const samples=historySamples({unit:'MW',direction:1,lines:[{...line,values:new Map([['2052-01-01T00:00:00Z',100],['2052-01-01T02:00:00Z',-20]])}]},line.id,'day');
  expect(samples).toEqual([expect.objectContaining({value:40,count:2,valid:0})]);
});
test('cancellation stops before issuing any query',async()=>{
  const controller=new AbortController();controller.abort();const fetchScene=jest.fn();
  await expect(fetchFlowYear({projectId:'Test'},source,['A'],{signal:controller.signal},fetchScene)).rejects.toMatchObject({name:'AbortError'});
  expect(fetchScene).not.toHaveBeenCalled();
});
test('annual-only source cannot fabricate hourly evidence',async()=>{
  await expect(fetchFlowYear({projectId:'Test'},{...source,selection:{...selection,historyMetric:null}},['A'])).rejects.toThrow('no declared hourly');
});
test('calendar gaps stay blank rather than compressing time or inserting zero flow',()=>{
  const samples=historySamples({selection:{period:'2050'},unit:'MW',direction:1,
    lines:[{...line,values:new Map([['2050-01-01T00:00:00Z',50]])}]},line.id);
  expect(samples).toHaveLength(8760);expect(samples[0].value).toBe(50);
  expect(samples.at(-1)).toMatchObject({value:null,count:0,valid:0});
});
test('weekly summary navigation points to an actual in-year hour, not the previous-year Monday',()=>{
  const samples=historySamples({unit:'MW',direction:1,lines:[{...line,values:new Map([['2030-01-01T00:00:00Z',5]])}]},line.id,'week');
  expect(samples[0]).toMatchObject({period:'2029-12-31',firstPeriod:'2030-01-01T00:00:00Z'});
});

test('adjustable integer-percent thresholds reuse evidence and include equality and overloads',()=>{
  const stats=new Map(),values=new Map([['2050-01-01T00:00:00Z',95],['2050-01-01T01:00:00Z',99],['2050-01-01T02:00:00Z',105]]);
  accumulateCapacityEvidence(stats,{unit:'MW',direction:1,lines:[{...line,values,reportedLimits:new Map([...values.keys()].map(t=>[t,{unit:'MW',forward:100,reverse:100}]))}]});
  expect(capacityAtThreshold(stats.get(line.id),95)).toMatchObject({nearHours:3,share:1});
  expect(capacityAtThreshold(stats.get(line.id),99)).toMatchObject({nearHours:2});
  expect(capacityAtThreshold(stats.get(line.id),100)).toMatchObject({nearHours:1});
});
