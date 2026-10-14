import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import NetworkClusteringControls from './NetworkClusteringControls';
import SavedNetworkClusterControls from './SavedNetworkClusterControls';
import {busKey} from '../manualNetworkClusters';
const a={id:'a',component_type:'bus',sourceCountryCode:'ES',sourceNetworkFilename:'native.nc',latitude:40,longitude:1};
const b={...a,id:'b',longitude:2};
const result={schema:'nohm.atlas.manual-clusters.v1',sourceCount:2,assignedCount:2,level:'nuts2',sources:[],warnings:[],
  groups:[{id:'west',name:'West',members:[busKey(a)],countryCodes:['ES'],latitude:40,longitude:1},
    {id:'east',name:'East',members:[busKey(b)],countryCodes:['ES'],latitude:40,longitude:2}]};
beforeEach(()=>{ global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({state:'complete',result})}); });

test('direct NUTS grouping reports complete coverage including geography-only regions',async()=>{
  const empty={id:'empty',name:'Bus-free NUTS region',members:[],countryCodes:['ES'],latitude:41,longitude:3,
    territoryOnly:true,geographyOnly:true,regionIds:['ES001'],geometry:{type:'Polygon',coordinates:[]}};
  fetch.mockResolvedValue({ok:true,json:async()=>({state:'complete',result:{...result,level:'nuts3',
    groups:[...result.groups,empty],networkGroupCount:2,geographyOnlyGroupCount:1}})});
  const apply=jest.fn();
  render(<NetworkClusteringControls facilities={[a,b]} countries={['ES']} onLoadNative={async()=>({})} onSave={jest.fn()} onApply={apply}/>);
  fireEvent.change(screen.getByLabelText('Network cluster boundary level'),{target:{value:'nuts3'}});
  fireEvent.click(screen.getByRole('button',{name:'Build network grouping'}));
  await screen.findByText('3 groups · 2/2 buses assigned. Shown on map. Full country coverage · 2 grid-backed · 1 geography only.');
  expect(apply.mock.calls[0][0].groups).toHaveLength(3);
  expect(apply.mock.calls[0][0].groups[2]).toMatchObject({geographyOnly:true,members:[]});
  fireEvent.change(screen.getByLabelText('Source bus to reassign'),{target:{value:busKey(a)}});
  fireEvent.change(screen.getByLabelText('Destination network group'),{target:{value:'empty'}});
  fireEvent.click(screen.getByRole('button',{name:'Save manual grouping'}));
  await waitFor(()=>expect(apply.mock.calls.at(-1)[0].groups.find(g=>g.id==='empty')).toMatchObject({geographyOnly:false,territoryOnly:false,members:[busKey(a)]}));
});
test('loads native source, builds, edits and saves a manual grouping without applying it prematurely',async()=>{
  const load=jest.fn().mockResolvedValue({});const save=jest.fn();
  render(<NetworkClusteringControls facilities={[a,b]} countries={['ES']} onLoadNative={load} onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Build network grouping'}));
  await screen.findByText('2 groups · 2/2 buses assigned.');
  expect(load).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body).nodes).toHaveLength(2);
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Group name west'),{target:{value:'Western region'}});
  fireEvent.change(screen.getByLabelText('Manual grouping name'),{target:{value:'Demo geography'}});
  fireEvent.click(screen.getByRole('button',{name:'Save manual grouping'}));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({name:'Demo geography',groups:expect.arrayContaining([expect.objectContaining({name:'Western region'})])}));
});
test('supports 2048 clusters and source reassignment keeps each bus exactly once',async()=>{
  const save=jest.fn();render(<NetworkClusteringControls facilities={[a,b]} countries={['ES']} onLoadNative={async()=>({})} onSave={save}/>);
  fireEvent.change(screen.getByLabelText('Network cluster boundary level'),{target:{value:'spatial'}});
  expect(screen.getByLabelText('Number of network clusters')).toHaveAttribute('max','2048');
  fireEvent.click(screen.getByRole('button',{name:'Build network grouping'}));
  await screen.findByText('2 groups · 2/2 buses assigned.');
  fireEvent.change(screen.getByLabelText('Source bus to reassign'),{target:{value:busKey(a)}});
  fireEvent.change(screen.getByLabelText('Destination network group'),{target:{value:'east'}});
  fireEvent.click(screen.getByRole('button',{name:'Save manual grouping'}));
  expect(save.mock.calls[0][0].groups).toHaveLength(1);
  expect(save.mock.calls[0][0].groups[0].members.sort()).toEqual([busKey(a),busKey(b)].sort());
});
test('saved geography selector expands detail without changing the saved definition',()=>{
  const onChange=jest.fn();render(<SavedNetworkClusterControls schemes={[{...result,id:'demo',name:'Demo'}]} active={{id:'demo'}} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button',{name:'Expand original detail'}));
  expect(onChange).toHaveBeenCalledWith(null);
});
test('existing Eurostat evidence can be converted without guessing new memberships',async()=>{
  const evidence={data:{features:[{properties:{NUTS_ID:'ES11',cluster:1},geometry:{type:'Polygon',coordinates:[]}}]},meta:{year:2023}};
  render(<NetworkClusteringControls facilities={[a,b]} countries={['ES']} onLoadNative={async()=>({})} onSave={jest.fn()} regionalEvidence={evidence}/>);
  fireEvent.change(screen.getByLabelText('Network cluster boundary level'),{target:{value:'evidence'}});
  fireEvent.click(screen.getByRole('button',{name:'Build network grouping'}));
  await screen.findByText('2 groups · 2/2 buses assigned.');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({level:'evidence',boundaryFeatures:evidence.data.features,evidenceMeta:evidence.meta});
});

test('regional grouping is applied only after complete membership is returned',async()=>{
  const apply=jest.fn();
  render(<NetworkClusteringControls facilities={[a,b]} countries={['ES']} onLoadNative={async()=>({})} onSave={jest.fn()} onApply={apply}/>);
  expect(screen.getByLabelText('Source regions for clustering')).toHaveValue('nuts3');
  fireEvent.change(screen.getByLabelText('Number of network clusters'),{target:{value:'2'}});
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Build network grouping'}));
  await screen.findByText('2 groups · 2/2 buses assigned. Shown on map.');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({level:'regions',clusters:2,regionLevel:'nuts3'});
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({groups:result.groups}));
});

test('indicator group request converts and applies the exact supplied assignment snapshot',async()=>{
  const apply=jest.fn();const data={features:[{properties:{NUTS_ID:'ES001',cluster:1}}]};
  render(<NetworkClusteringControls facilities={[a,b]} countries={['ES']} onLoadNative={async()=>({})} onSave={jest.fn()} onApply={apply}
    evidenceRequest={{id:'request',data:{data,meta:{clusters:2}}}}/>);
  await screen.findByText('2 groups · 2/2 buses assigned. Shown on map.');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({level:'evidence',boundaryFeatures:data.features,evidenceMeta:{clusters:2}});
  expect(apply).toHaveBeenCalledTimes(1);
});

test('Eurostat growth uses the newly loaded native topology and exposes all-region checks',async()=>{
  const load=jest.fn().mockResolvedValue({}),apply=jest.fn();
  const checks={everyRegionSourceConnected:true,syntheticBranches:0,seedAdjustments:[],geographicUnitComponents:{west:1,east:1}};
  fetch.mockResolvedValue({ok:true,json:async()=>({state:'complete',result:{...result,networkChecks:checks,
    groups:result.groups.map(g=>({...g,networkConnectivity:{sourceBuses:1,inducedSourceComponents:1,crossingSourceBranchIds:['t']}}))}})});
  const props={facilities:[a,b],countries:['ES'],onLoadNative:load,onApply:apply,onSave:jest.fn(),
    growthRequest:{id:'growth',settings:{clusters:2,regionLevel:'nuts3',evidence:{indicators:['density'],year:2023}}}};
  render(<NetworkClusteringControls {...props} connections={[{...a,id:'t',from:'a',to:'b',type:'transformer'}]}/>);
  await screen.findByText('2 groups · 2/2 buses assigned. Shown on map.');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({level:'growth',gridConnections:[{from:busKey(a),to:busKey(b)}]});
  expect(screen.getByText(/Every region has an internally connected source grid/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Source bus to reassign'),{target:{value:busKey(a)}});
  fireEvent.change(screen.getByLabelText('Destination network group'),{target:{value:'east'}});
  expect(screen.queryByText(/Every region has an internally connected source grid/)).not.toBeInTheDocument();
  expect(screen.getByText('Connectivity checks need rebuilding after membership edits.')).toBeInTheDocument();
});

test('editing or merging does not discard unrelated land-only regions and empty merges can be saved',async()=>{
  const land=id=>({id,name:id,members:[],countryCodes:['ES'],latitude:41,longitude:Number(id.slice(-1)),territoryOnly:true,
    regionIds:[id],geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}});
  const saved=jest.fn();fetch.mockResolvedValue({ok:true,json:async()=>({state:'complete',result:{...result,groups:[...result.groups,land('land1'),land('land2')]}})});
  render(<NetworkClusteringControls facilities={[a,b]} countries={['ES']} onLoadNative={async()=>({})} onSave={saved}/>);
  fireEvent.click(screen.getByRole('button',{name:'Build network grouping'}));
  await screen.findByText('4 groups · 2/2 buses assigned.');
  fireEvent.change(screen.getByLabelText('Source bus to reassign'),{target:{value:busKey(a)}});
  fireEvent.change(screen.getByLabelText('Destination network group'),{target:{value:'east'}});
  expect(screen.getByLabelText('Group name land1')).toBeInTheDocument();
  expect(screen.getByLabelText('Group name land2')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Select group land1'));fireEvent.click(screen.getByLabelText('Select group land2'));
  fireEvent.click(screen.getByRole('button',{name:'Merge selected groups'}));
  fireEvent.click(screen.getByRole('button',{name:'Save manual grouping'}));
  expect(saved.mock.calls[0][0].groups).toHaveLength(2);
  const merged=saved.mock.calls[0][0].groups.find(g=>g.territoryOnly);
  expect(merged).toMatchObject({members:[],countryCodes:['ES'],geometry:{type:'GeometryCollection'},latitude:41,longitude:1.5});
});
