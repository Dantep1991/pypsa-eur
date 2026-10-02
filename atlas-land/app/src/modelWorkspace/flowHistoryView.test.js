import {fetchFlowHistory,flowHistorySamples,flowHistoryKey,historyPeriodSelection} from './flowHistoryView';

const line={id:'Line:A',name:'A',from_node:'From',to_node:'To',values:new Map([['2052-01-01',12]])};
const scene={selection:{period:'2052',runId:'run',modelVersion:'v1',className:'Line',propertyName:'Flow',
  availableGranularities:['hour','day','week','month','year'],granularity:'day'},lines:[line],periods:[...line.values.keys()],unit:'GWh',direction:1};

test.each(['day','week','month'])('%s history queries the native resolution, exact connection, full year and unchanged units',async granularity=>{
  const source={...scene,selection:{...scene.selection,granularity}};
  const fetchScene=jest.fn(async(_context,selection)=>({...source,selection}));
  const history=await fetchFlowHistory({projectId:'Example'},source,'A',{},fetchScene);
  expect(fetchScene).toHaveBeenCalledTimes(1);
  expect(fetchScene.mock.calls[0][1]).toMatchObject({granularity,dateFrom:'2052-01-01',dateTo:'2052-12-31',propertyName:'Flow'});
  expect(fetchScene.mock.calls[0][2].entityNames).toEqual(['A']);
  expect(history.unit).toBe('GWh');
});

test('annual net does not replace the committed result with an hourly sum or mean',async()=>{
  const source={...scene,selection:{...scene.selection,granularity:'year',propertyName:'Net Flow',derivedNetFlow:true}};
  const fetchScene=jest.fn();
  expect(await fetchFlowHistory({projectId:'Example'},source,'A',{},fetchScene)).toBe(source);
  expect(fetchScene).not.toHaveBeenCalled();
});

test('native daily gas energy keeps its TJ unit and endpoint direction',async()=>{
  const source={...scene,unit:'TJ',selection:{...scene.selection,className:'Gas Pipeline',propertyName:'Flow In'}};
  const fetchScene=jest.fn(async(_context,selection)=>({...source,selection}));
  const history=await fetchFlowHistory({projectId:'Example'},source,'A',{},fetchScene);
  expect(history.unit).toBe('TJ');
  expect(flowHistorySamples(history,line.id)[0].value).toBe(12);
});

test.each([{unit:'MW'},{lines:[{...line,name:'Other'}]},{selection:{...scene.selection,granularity:'hour'}}])('incompatible history cannot be published: %j',async replacement=>{
  await expect(fetchFlowHistory({projectId:'Example'},scene,'A',{},async()=>({...scene,...replacement}))).rejects.toThrow('does not match');
});

test('daily calendar gaps stay blank and leap years retain all 366 days',()=>{
  const samples=flowHistorySamples(scene,line.id);
  expect(samples).toHaveLength(366);
  expect(samples[0]).toMatchObject({value:12});
  expect(samples[1]).toMatchObject({value:null});
});

test.each([['week',53],['month',12],['year',1]])('%s uses native values without averaging', (granularity,count)=>{
  const source={...scene,selection:{...scene.selection,granularity},
    lines:[{...line,values:new Map([[granularity==='week'?'2052-01-01':'2052-01-01',12]])}]};
  const samples=flowHistorySamples(source,line.id);
  // Weekly native bucket starts Monday 2052-01-01; calendar-derived gaps have no values.
  expect(samples).toHaveLength(count);
  expect(samples.filter(item=>item.value!=null).map(item=>item.value)).toEqual([12]);
});

test('weekly calendar uses the reported Tuesday anchor without adding duplicate Monday gaps',()=>{
  const source={...scene,selection:{...scene.selection,granularity:'week',period:'2050'},
    periods:['2049-12-28T00:00:00Z','2050-01-04T00:00:00Z'],
    lines:[{...line,values:new Map([['2049-12-28T00:00:00Z',12],['2050-01-04T00:00:00Z',24]])}]};
  const samples=flowHistorySamples(source,line.id);
  expect(samples).toHaveLength(53);
  expect(samples.filter(item=>item.value!=null).map(item=>item.value)).toEqual([12,24]);
  expect(samples.every(item=>new Date(item.period).getUTCDay()===2)).toBe(true);
  expect(historyPeriodSelection(source,samples[0].period)).toMatchObject({
    granularity:'week',dateFrom:'2050-01-01',dateTo:'2050-01-03'});
});

test.each(['granularity','propertyName','reportFamily','runId','modelVersion'])('history cache separates %s',field=>{
  expect(flowHistoryKey('Example',scene,line.id)).not.toBe(flowHistoryKey('Example',{...scene,selection:{...scene.selection,[field]:'different'}},line.id));
});

test('map navigation retains native Daily units and quantity',()=>{
  expect(historyPeriodSelection(scene,'2052-02-29')).toMatchObject({granularity:'day',propertyName:'Flow',dateFrom:'2052-02-29',dateTo:'2052-02-29'});
});

test.each([['week','2030-12-30','2030-12-30','2030-12-31'],['month','2052-02-01','2052-02-01','2052-02-29'],['year','2052-01-01','2052-01-01','2052-12-31']])('map %s navigation requests the complete in-year bucket',(granularity,period,dateFrom,dateTo)=>{
  const source={...scene,selection:{...scene.selection,granularity,period:period.slice(0,4)}};
  expect(historyPeriodSelection(source,period)).toMatchObject({granularity,dateFrom,dateTo});
});
