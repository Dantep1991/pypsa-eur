import { flowPeriodMetrics, flowPeriodHours, flowMetricsLabel } from './flowPeriodMetrics';
const line = { reportedLimits: new Map([['2052-01-01', {unit:'MW',forward:100,reverse:50}]]) };
const annual = (value, unit = 'GWh', target = line) => flowPeriodMetrics(target, value, unit, 'year', 1, '2052-01-01');

test('annual net energy uses directional MW limits, leap-year duration and equivalent FLH', () => {
  expect(flowPeriodHours('2050-01-01','year')).toBe(8760);
  expect(flowPeriodHours('2052-01-01','year')).toBe(8784);
  expect(annual(878.4)).toMatchObject({fullLoadHours:8784,periodHours:8784,utilisation:1,capacity:100});
  expect(annual(-219.6)).toMatchObject({fullLoadHours:4392,utilisation:.5,capacity:50});
  expect(flowMetricsLabel(annual(-219.6), true, true)).toBe('Net-equivalent 4,392 full-load hours · 50.0% annual utilisation');
});
test('MWh conversion, zero net, and overload are not clipped or confused with missing values', () => {
  expect(annual(878400,'MWh').utilisation).toBe(1);
  expect(annual(0).fullLoadHours).toBe(0);
  expect(annual(1756.8).utilisation).toBe(2);
  for (const value of [null, '', false, NaN, Infinity]) expect(annual(value)).toBeNull();
  expect(annual(100,'TJ')).toBeNull();
});
test('unreported, zero, unlimited and ambiguous capacities are never fabricated', () => {
  for (const forward of [0,null,undefined,Infinity,1e30,-100]) {
    expect(annual(1,'GWh',{reportedLimits:new Map([['2052-01-01',{unit:'MW',forward}]])})).toBeNull();
  }
  expect(annual(1,'GWh',{reportedLimits:new Map(),limits:[{property:'Max Flow',unit:'MW',value:100}]})).toBeNull();
  expect(annual(1,'GWh',{limits:[{property:'Max Flow Day',unit:'GWh',value:100}]})).toBeNull();
  expect(annual(1,'GWh',{limits:[{property:'Max Flow',unit:'MW',value:100},{property:'Max Flow',unit:'MW',value:200}]})).toBeNull();
  expect(annual(878.4,'GWh',{limits:[{property:'Max Flow',unit:'MW',value:100}]}).utilisation).toBe(1);
});
test('hourly and daily semantics remain compatible, month lengths are calendar-based', () => {
  expect(flowPeriodMetrics(line, 99,'MW','hour',1,'2052-01-01').utilisation).toBe(.99);
  expect(flowPeriodMetrics(line, 2.4,'GWh','day',1,'2052-01-01').utilisation).toBe(1);
  expect(flowPeriodHours('2052-02-01','month')).toBe(696);
  expect(flowPeriodHours('invalid','year')).toBeNull();
});
