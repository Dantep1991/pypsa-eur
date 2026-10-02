import { withAnnualNetFlow, subtractReverseFlow } from './annualFlow';
import { adaptLolaFlowRows, fetchLolaFlowScene, lolaFlowFrame } from './lolaFlowData';

const metric = name => ({ id:`Line.${name}`,class_name:'Line',property_name:name,report_family:'ST',
  unit:'GWh',available_granularities:['year'],periods:['2050'] });
const context = {projectId:'Example'};
const selection = {runId:'run',runModelVersion:'v1',modelVersion:'v1',className:'Line',propertyName:'Net Flow',
  unit:'GWh',granularity:'year',availableGranularities:['year'],period:'2050',derivedNetFlow:true,
  limitProperties:['Export Limit','Import Limit']};
const line = {id:'Line:Exact',name:'Exact',from_node:'A',to_node:'B',coordinates:[[1,2],[3,4]]};
const topology = {schema:'nohm.atlas.flow-topology.v1',project_id:'Example',model_version:'v1',class_name:'Line',lines:[line]};
const row = (name,value,unit='GWh') => ({entity_name:'Exact',class_name:'Line',property_name:name,time_bucket:'2050-01-01',value,unit_name:unit});
const payload = rows => ({project_id:'Example',runs:[{run_id:'run',schema_version_id:'v1'}],rows});

test('offers derived annual net flow only with matching forward/backward Line energy', () => {
  expect(withAnnualNetFlow([metric('Flow'),metric('Flow Back')]).at(-1)).toMatchObject({property_name:'Net Flow',derived_net_flow:true});
  const native=[metric('Flow'),metric('Flow Back'),metric('Net Flow')];
  expect(withAnnualNetFlow(native)).toBe(native);
  expect(withAnnualNetFlow([metric('Flow')])).toHaveLength(1);
  expect(withAnnualNetFlow([metric('Flow'),{...metric('Flow Back'),unit:'MW'}])).toHaveLength(2);
  expect(withAnnualNetFlow([metric('Flow'),{...metric('Flow Back'),report_family:'LT'}])).toHaveLength(2);
  expect(withAnnualNetFlow([metric('Flow In'),metric('Flow Out')].map(item=>({...item,class_name:'Gas Pipeline'})))).toHaveLength(2);
});

test('annual query derives net energy and loads same-year directional limits', async () => {
  const fetchImpl=jest.fn(async (_url,init)=>{
    const request=JSON.parse(init.body);
    const values={'Flow':100,'Flow Back':319,'Export Limit':100,'Import Limit':-50};
    return {ok:true,json:async()=>payload([row(request.property_name,values[request.property_name],request.property_name.includes('Limit')?'MW':'GWh')])};
  });
  const scene=await fetchLolaFlowScene(context,selection,{topology},fetchImpl);
  expect(scene.selection.propertyName).toBe('Net Flow');
  expect(scene.derivation).toBe('Reported Flow − Flow Back');
  const frame=lolaFlowFrame(scene,'2050-01-01');
  expect(frame.lines[0]).toMatchObject({value:-219,actualFrom:'B',actualTo:'A',annual:true,net:true,
    metrics:{fullLoadHours:4380,utilisation:.5}});
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  for(const [,init] of fetchImpl.mock.calls) expect(JSON.parse(init.body)).toMatchObject({run_ids:['run'],granularity:'year',date_from:'2050-01-01',date_to:'2050-12-31T23:59:59'});
});

test('native annual Net Flow is loaded directly without unnecessary forward/reverse queries',async()=>{
  const fetchImpl=jest.fn(async(_url,init)=>{
    const prop=JSON.parse(init.body).property_name;
    return {ok:true,json:async()=>payload([row(prop,prop==='Net Flow'?-219:50,prop.includes('Limit')?'MW':'GWh')])};
  });
  const scene=await fetchLolaFlowScene(context,{...selection,derivedNetFlow:false},{topology},fetchImpl);
  expect(scene.lines[0].values.get('2050-01-01')).toBe(-219);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test('equal opposing transfers have zero net; incomplete, negative, or foreign reverse data is rejected',async()=>{
  const forward=adaptLolaFlowRows(payload([row('Flow',100)]),topology,context,{...selection,propertyName:'Flow'});
  const back=adaptLolaFlowRows(payload([row('Flow Back',100)]),topology,context,{...selection,propertyName:'Flow Back'});
  expect(lolaFlowFrame(subtractReverseFlow(forward,back,selection),'2050-01-01').lines[0].magnitude).toBe(0);
  expect(()=>subtractReverseFlow(forward,{...back,lines:[]},selection)).toThrow('Missing data is not zero');
  expect(()=>subtractReverseFlow(forward,{...back,lines:[{...back.lines[0],values:new Map([['2050-02-01',100]])}]},selection)).toThrow('matching periods');
  expect(()=>subtractReverseFlow(forward,{...back,lines:[{...back.lines[0],values:new Map([['2050-01-01',-1]])}]},selection)).toThrow('non-negative');
  const fetchImpl=jest.fn(async (_url,init)=>({ok:true,json:async()=>payload([{...row(JSON.parse(init.body).property_name,100),run_id:'foreign'}])}));
  await expect(fetchLolaFlowScene(context,selection,{topology},fetchImpl)).rejects.toThrow('different simulation');
});
