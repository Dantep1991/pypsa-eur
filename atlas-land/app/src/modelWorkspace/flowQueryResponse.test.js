import {unpackFlowResponse} from './flowQueryResponse';
const packed={response_format:'nohm.flow-series.v1',periods:['2050-01-01T00:00:00Z','2050-01-01T02:00:00Z'],
  summary:{row_count:2},runs:[{run_id:'r'}],quality:{policy:'reject'},
  series:[{metadata:{entity_name:'A',from_node:'X',to_node:'Y',unit_name:'MW'},indexes:[0,1],values:[0,-7]}]};
test('compact transport preserves zero, sign, gaps, units and evidence receipt',()=>{
  const result=unpackFlowResponse(packed);
  expect(result.rows).toEqual([expect.objectContaining({value:0,actual_from_node:'X',time_bucket:packed.periods[0]}),
    expect.objectContaining({value:-7,actual_from_node:'Y',unit_name:'MW',time_bucket:packed.periods[1]})]);
  expect(result.quality).toEqual(packed.quality);
  expect(()=>unpackFlowResponse({...packed,summary:{row_count:3}})).toThrow('row count');
  expect(()=>unpackFlowResponse({...packed,series:[{...packed.series[0],indexes:[0,3]}]})).toThrow('Invalid');
});
test('multiple series retain chronological order and reject invalid timestamps',()=>{
  const result=unpackFlowResponse({...packed,summary:{row_count:4},series:[packed.series[0],
    {...packed.series[0],metadata:{...packed.series[0].metadata,entity_name:'B'},values:[9,3]}]});
  expect(result.rows.map(row=>row.time_bucket)).toEqual([packed.periods[0],packed.periods[0],packed.periods[1],packed.periods[1]]);
  expect(()=>unpackFlowResponse({...packed,periods:['bad',packed.periods[1]]})).toThrow('timestamp');
});
