import {manualClusterGeographyOverlay} from './manualClusterGeography';
import {busKey,projectManualNetworkClusters} from './manualNetworkClusters';

test('bus-free source polygons stay painted without electrical nodes or expansion gaps',()=>{
  const grid={id:'r1',name:'Grid region',members:[JSON.stringify(['BE','source.nc','a'])],countryCodes:['BE'],latitude:50,longitude:4,
    geometry:{type:'Polygon',coordinates:[]},regionIds:['BE1'],regionCount:1};
  const empty={...grid,id:'r2',name:'Empty region',members:[],regionIds:['BE2'],territoryOnly:true,geographyOnly:true};
  const scheme={id:'complete',groups:[grid,empty]};
  const overlay=manualClusterGeographyOverlay(scheme);
  expect(overlay.data.features).toHaveLength(2);
  expect(overlay.data.features[1].properties).toMatchObject({sourceCount:0,geographyOnly:true});
  expect(overlay.data.features[1].properties.name).toContain('no source grid assets');
  expect(manualClusterGeographyOverlay({...scheme,expandedGroupIds:['r2']}).data.features).toHaveLength(2);
});

test('200 source nodes become 20 nodes with complete data totals and only actual crossing interfaces',()=>{
  const nodes=Array.from({length:200},(_,i)=>({id:`bus${i}`,name:`bus${i}`,component_type:'bus',sourceCountryCode:'ES',
    sourceNetworkFilename:'native.nc',latitude:40+i/100,longitude:i/100,price:i,p_set:[1,2]}));
  const groups=Array.from({length:20},(_,i)=>({id:`r${i}`,name:`Region ${i+1}`,countryCodes:['ES'],
    members:nodes.slice(i*10,i*10+10).map(n=>busKey(n)),latitude:40+i/10,longitude:i/10,
    regionCount:10,geometry:{type:'Polygon',coordinates:[]}}));
  const assets=nodes.map((n,i)=>({...n,id:`gen${i}`,component_type:'generator',bus:n.id,p_nom:2,carrier:'wind',capacity_units:'MW'}));
  const links=nodes.slice(1).map((n,i)=>({...n,id:`line${i}`,from:nodes[i].id,to:n.id,type:'line',component_type:'line',carrier:'AC',s_nom:100}));
  const source=[...nodes,...assets];const before=JSON.stringify({source,links});
  const scheme={schema:'nohm.atlas.manual-clusters.v1',id:'twenty',groups};
  const result=projectManualNetworkClusters(source,links,scheme);
  expect(result.facilities.filter(f=>f.component_type==='bus')).toHaveLength(20);
  expect(result.facilities.find(f=>f.id==='atlas-cluster:twenty:r0')).toMatchObject({price:4.5,p_set:[10,20]});
  expect(result.facilities.filter(f=>f.component_type==='generator').reduce((s,f)=>s+f.p_nom,0)).toBe(400);
  expect(result.connections).toHaveLength(19);
  expect(result.internalConnections).toHaveLength(180);
  expect(result.connections.every(c=>c.from.startsWith('atlas-cluster:') && c.to.startsWith('atlas-cluster:'))).toBe(true);
  expect(result.connections.flatMap(c=>c.source_edge_ids)).toEqual(links.filter((_,i)=>(i+1)%10===0).map(c=>c.id));
  expect(manualClusterGeographyOverlay(scheme).data.features).toHaveLength(20);
  expect(new Set(manualClusterGeographyOverlay(scheme).data.features.map(f=>f.properties.color)).size).toBe(20);
  expect(manualClusterGeographyOverlay({...scheme,expandedGroupIds:['r0']}).data.features).toHaveLength(19);
  expect(JSON.stringify({source,links})).toBe(before);
});
