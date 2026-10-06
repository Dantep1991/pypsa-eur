import {updateFlowChoice,flowChoiceMatches} from './flow';
const previous={runId:'a',quantityId:'Line.Flow',period:'2050',granularity:'hour',category:'AC',dateFrom:'2050-06-01',dateTo:'2050-06-02'};
test('changing run clears its dependent selection but retains explicit overrides',()=>{
  expect(updateFlowChoice(previous,{runId:'b',quantityId:'Gas Pipeline.Flow In',period:'2040'}))
    .toMatchObject({runId:'b',quantityId:'Gas Pipeline.Flow In',period:'2040',dateFrom:'',dateTo:''});
  expect(updateFlowChoice(previous,{runId:'b'})).toEqual({runId:'b'});
});
test.each(['period','granularity','quantityId'])('changing %s resets stale date windows',key=>{
  const next=updateFlowChoice(previous,{[key]:'new'});
  expect(next.dateFrom).toBe('');expect(next.dateTo).toBe('');
});
test('explicit dates survive dependent resets and display-only changes do not reset data',()=>{
  expect(updateFlowChoice(previous,{granularity:'day',dateFrom:'2050-07-01'}).dateFrom).toBe('2050-07-01');
  expect(updateFlowChoice(previous,{category:'DC'}).dateFrom).toBe(previous.dateFrom);
});
test('annual net-flow canonicalisation does not wait forever for Line.Flow',()=>{
  expect(flowChoiceMatches({quantityId:'Line.Net Flow',requestedQuantityId:'Line.Flow',granularity:'year'},
    {quantityId:'Line.Flow',granularity:'year'})).toBe(true);
  expect(flowChoiceMatches({requestedQuantityId:'Gas Pipeline.Flow In'},{quantityId:'Line.Flow'})).toBe(false);
});
