import {aggregateFlowHistory,historyAggregationResolutions} from './flowHistoryAggregation';

const line={id:'Line:A',name:'A',values:new Map([
  ['2052-01-01T00:00:00Z',100],['2052-01-01T01:00:00Z',-20],['2052-02-01T00:00:00Z',0]])};
const history={selection:{granularity:'hour',period:'2052'},unit:'MW',direction:1,lines:[line],periods:[...line.values.keys()]};

test.each([['day',366],['week',53],['month',12],['year',1]])('%s aggregates loaded power without inventing hours', (resolution,count)=>{
  const samples=aggregateFlowHistory(history,line.id,resolution);
  expect(samples).toHaveLength(count);
  expect(samples[0].value).toBe(resolution==='year'?80/3:40);
  expect(samples[0].reportedHours).toBe(resolution==='year'?3:2);
  expect(samples[0].firstPeriod).toBe('2052-01-01T00:00:00Z');
  if(resolution!=='year') expect(samples.filter(item=>item.value!=null)).toHaveLength(2);
  expect(samples.reduce((total,item)=>total+item.expectedHours,0)).toBe(8784);
});

test('blank days remain blank, explicit zero is retained, and near-capacity counts use hours not averages',()=>{
  const limits=new Map([...line.values.keys()].map(period=>[period,{unit:'MW',forward:100,reverse:20}]));
  const samples=aggregateFlowHistory({...history,lines:[{...line,reportedLimits:limits}]},line.id,'day');
  expect(samples[0]).toMatchObject({value:40,valid:2,near:2,maximumRatio:1,expectedHours:24});
  expect(samples[1]).toMatchObject({value:null,reportedHours:0});
  expect(samples.find(item=>item.period.startsWith('2052-02-01'))).toMatchObject({value:0,reportedHours:1});
});

test.each(['GWh','TJ'])('%s hourly energy is summed, not averaged',unit=>{
  expect(aggregateFlowHistory({...history,unit},line.id,'year')[0].value).toBe(80);
});

test('monthly power uses time weights and leap-year calendar lengths',()=>{
  const source={...history,selection:{granularity:'month',period:'2052'},periods:['2052-01-01','2052-02-01'],lines:[{...line,values:new Map([['2052-01-01',10],['2052-02-01',20]])}]};
  const sample=aggregateFlowHistory(source,line.id,'year')[0];
  expect(sample.value).toBeCloseTo((31*10+29*20)/60);
  expect(sample.expectedHours).toBe(8784);
  expect(sample.reportedHours).toBe(60*24);
});

test('unsupported units and splitting a weekly bucket into months are not guessed',()=>{
  expect(historyAggregationResolutions({...history,unit:'unknown'})).toEqual(['hour']);
  const weekly={...history,selection:{...history.selection,granularity:'week'}};
  expect(historyAggregationResolutions(weekly)).toEqual(['week','year']);
  expect(()=>aggregateFlowHistory(weekly,line.id,'month')).toThrow(/cannot be aggregated/);
});

test('annual native net energy is not reinterpreted',()=>{
  const annual={...history,unit:'GWh',selection:{...history.selection,granularity:'year'},periods:['2052-01-01'],lines:[{...line,values:new Map([['2052-01-01',-12]])}]};
  expect(aggregateFlowHistory(annual,line.id,'year')[0].value).toBe(-12);
});
