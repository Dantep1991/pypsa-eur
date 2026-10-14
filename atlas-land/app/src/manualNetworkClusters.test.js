import { aggregateClusterRecords, busKey, nativeClusterNodes, projectManualNetworkClusters,
  readClusterSchemes, saveClusterScheme, validateClusterScheme } from './manualNetworkClusters';

const bus = (id, country = 'ES', longitude = 1) => ({ id, name: id, component_type: 'bus', sourceCountryCode: country,
  sourceNetworkFilename: `${country}-native.nc`, latitude: 40, longitude });
const a = bus('a'), b = bus('b'), c = bus('c','ES',3), foreign = bus('a','FR',4);
const group = { id: 'west', name: 'Western district', countryCodes: ['ES'], members: [busKey(a),busKey(b)], latitude: 40, longitude: 1 };
const scheme = { schema: 'nohm.atlas.manual-clusters.v1', id: 'saved', groups: [group] };
const generator = (id, node, value) => ({ ...node, id, name: id, component_type: 'generator', bus: node.id,
  carrier: 'wind', capacity_units: 'MW', p_nom: value, marginal_cost: value + 10 });

test('official bus-free NUTS regions keep geography but never become fake electrical nodes',()=>{
  const empty={id:'empty',name:'Empty NUTS region',members:[],countryCodes:['ES'],latitude:42,longitude:4,
    territoryOnly:true,geographyOnly:true,regionIds:['ES001'],geometry:{type:'Polygon',coordinates:[[[3,41],[4,41],[4,42],[3,42],[3,41]]]}};
  const result=projectManualNetworkClusters([a,b],[],{...scheme,groups:[group,empty]});
  expect(result.facilities.filter(f=>f.is_region_aggregate)).toHaveLength(1);
  expect(result.facilities.some(f=>f.region_code==='empty')).toBe(false);
  expect(result.connections).toEqual([]);expect(result.warnings).toEqual([]);
  expect(()=>validateClusterScheme({...scheme,groups:[{...group,geographyOnly:true}]})).toThrow(/cannot hide/);
});

test('explicit land-only regions preserve the requested identities without inventing assets or links',()=>{
  const empty={id:'land',name:'Land-only region',members:[],countryCodes:['ES'],latitude:42,longitude:4,
    territoryOnly:true,regionIds:['ES001'],geometry:{type:'Polygon',coordinates:[[[3,41],[4,41],[4,42],[3,42],[3,41]]]}};
  const result=projectManualNetworkClusters([a,b],[],{...scheme,groups:[group,empty]});
  expect(result.facilities.filter(f=>f.is_region_aggregate)).toHaveLength(2);
  expect(result.facilities.find(f=>f.region_code==='land')).toMatchObject({atlas_territory_only:true,atlas_source_count:0,atlas_source_ids:[]});
  expect(result.connections).toEqual([]);
  expect(()=>validateClusterScheme({...scheme,groups:[{...empty,territoryOnly:false}]})).toThrow();
});

test('country and source network scope disambiguate repeated native bus IDs', () => {
  expect(busKey(a)).not.toEqual(busKey(foreign));
  const grouped = projectManualNetworkClusters([a,b,foreign], [], scheme);
  expect(grouped.facilities).toHaveLength(2);
  expect(grouped.facilities.find(x => x.sourceCountryCode === 'FR').id).toBe('a');
});
test('source co-location members are retained and virtual buses are excluded', () => {
  const nodes = nativeClusterNodes([{ ...a, sameLocationFacilities: [a,b] }, { ...c, is_virtual: true }]);
  expect(nodes.map(n => n.key).sort()).toEqual([busKey(a),busKey(b)].sort());
});
test('sum capacity, mean cost and preserve unknown values including missing capacity', () => {
  expect(aggregateClusterRecords([{p_nom: 0, marginal_cost: 10}, {p_nom: 20,marginal_cost:30}],{p_nom:'sum',marginal_cost:'mean'}))
    .toMatchObject({p_nom:20, marginal_cost:20});
  expect(aggregateClusterRecords([{p_nom:10},{p_nom:null}]).p_nom).toBeNull();
  expect(aggregateClusterRecords([{voltage:220},{voltage:110}]).voltage).toBeNull();
});
test('aggregates assets/parallel links and retains internal links for exact expansion', () => {
  const assets = [generator('g1',a,10), generator('g2',b,20)];
  const links = [{...a,id:'internal',from:'a',to:'b',s_nom:50},
    {...a,id:'out1',from:'a',to:'c',s_nom:10}, {...a,id:'out2',from:'b',to:'c',s_nom:20}];
  const source = [a,b,c,...assets];
  const original = JSON.stringify(source);
  const result = projectManualNetworkClusters(source,links,scheme);
  expect(result.facilities.find(x => x.component_type === 'generator')).toMatchObject({p_nom:30,marginal_cost:80/3,atlas_source_count:2});
  expect(result.connections).toHaveLength(1);
  expect(result.connections[0]).toMatchObject({s_nom:30,source_edge_count:2});
  expect(result.internalConnections.map(x=>x.id)).toEqual(['internal']);
  expect(projectManualNetworkClusters(source,links,null)).toMatchObject({facilities:source,connections:links});
  expect(JSON.stringify(source)).toBe(original);
});
test('a saved group must not swallow partially loaded source buses', () => {
  const result = projectManualNetworkClusters([a,c], [], scheme);
  expect(result.facilities).toEqual([a,c]);
  expect(result.warnings[0]).toMatch(/does not match/);
});
test('overlap and invalid identities rejected before saving', () => {
  expect(() => validateClusterScheme({...scheme,groups:[group,{...group,id:'duplicate'}]})).toThrow(/more than one/);
  expect(() => validateClusterScheme({...scheme,groups:[{...group,members:['unsafe']}]})).toThrow();
});
test('saved manual groups are isolated per project and survive a fresh read', () => {
  const storage = {getItem:jest.fn(key => storage[key]),setItem:jest.fn((key,value)=>{storage[key]=value;})};
  saveClusterScheme(storage,{projectId:'one'},scheme);
  expect(readClusterSchemes(storage,{projectId:'one'})).toEqual([scheme]);
  expect(readClusterSchemes(storage,{projectId:'two'})).toEqual([]);
});
test('time series sum element-wise; incompatible or missing series never become zero',()=>{
  expect(aggregateClusterRecords([{p_set:[1,2]},{p_set:[3,4]}]).p_set).toEqual([4,6]);
  expect(aggregateClusterRecords([{p_set:[1,2]},{p_set:[3]}]).p_set).toBeNull();
  expect(aggregateClusterRecords([{p_nom:0,marginal_cost:5},{p_nom:0,marginal_cost:6}]).marginal_cost).toBeNull();
});
test('individual expansion restores native buses and their branches',()=>{
  const source=[a,b,c]; const links=[{...a,id:'internal',from:'a',to:'b'}];
  const expanded=projectManualNetworkClusters(source,links,{...scheme,expandedGroupIds:['west']});
  expect(expanded.facilities).toBe(source);expect(expanded.connections).toBe(links);
});
test('a multi-country group is not shown as complete when one country is filtered out',()=>{
  const multi = {...scheme,groups:[{...group,countryCodes:['ES','FR'],members:[busKey(a),busKey(foreign)]}]};
  const result=projectManualNetworkClusters([a],[],multi,[a,foreign]);
  expect(result.facilities).toEqual([a]);
  expect(result.warnings.length).toBe(1);
});
test('opposing dispatch is aligned before aggregation; ambiguous borders are never absorbed',()=>{
  const links=[{...a,id:'forward',from:'a',to:'c',p_nom:10,p_set:4},
    {...a,id:'reverse',from:'c',to:'b',p_nom:20,p_set:3}];
  const merged=projectManualNetworkClusters([a,b,c],links,scheme);
  expect(merged.connections[0]).toMatchObject({p_nom:30,p_set:1,source_edge_count:2});
  const bridge={...a,id:'bridge',from:'a',to:'a',is_cross_border_bridge:true};
  const uncertain=projectManualNetworkClusters([a,b,foreign],[bridge],scheme);
  expect(uncertain.connections).toEqual([bridge]);
  expect(uncertain.warnings[0]).toMatch(/unresolved/);
});

test('reported external border coordinates are retained while the known domestic endpoint groups',()=>{
  const border={...a,id:'reported-border',from:'a',to:'border-FR-foreign',
    from_country_code:'ES',to_country_code:'FR',is_cross_border_bridge:true,is_reference_topology:true,
    coordinates:[[1,40],[4,43]],s_nom:100};
  const result=projectManualNetworkClusters([a,b],[border],scheme);
  expect(result.connections[0]).toMatchObject({from:'atlas-cluster:saved:west',to:'border-FR-foreign',s_nom:100});
  expect(result.connections[0].coordinates).toEqual([[1,40],[4,43]]);
  expect(result.warnings).toEqual([]);
  const missing={...border,coordinates:[[1,40],[null,43]]};
  expect(projectManualNetworkClusters([a,b],[missing],scheme).connections).toEqual([missing]);
  const ambiguous={...border,to:'missing-native',to_country_code:'ES'};
  expect(projectManualNetworkClusters([a,b],[ambiguous],scheme).connections).toEqual([ambiguous]);
});

test('all 2048 groups project and expand without dropping source membership',()=>{
  const native=Array.from({length:2048},(_,i)=>bus(`n${i}`,'ES',i/100));
  const large={...scheme,groups:native.map((node,i)=>({id:`g${i}`,name:`Area ${i}`,countryCodes:['ES'],
    members:[busKey(node)],latitude:node.latitude,longitude:node.longitude}))};
  const result=projectManualNetworkClusters(native,[],large);
  expect(result.facilities).toHaveLength(2048);
  expect(result.facilities.reduce((total,node)=>total+node.atlas_source_count,0)).toBe(2048);
  expect(projectManualNetworkClusters(native,[],null).facilities).toBe(native);
});

test('physical branch provenance survives aggregation of an existing interface bundle',()=>{
  const edge={...a,id:'bundle',from:'a',to:'c',s_nom:100,source_edge_count:3,source_edge_ids:['physical-1','physical-2','physical-3']};
  const result=projectManualNetworkClusters([a,b,c],[edge],scheme);
  expect(result.connections[0]).toMatchObject({source_edge_count:3,source_edge_ids:edge.source_edge_ids});
  expect(result.connections[0].atlas_source_ids).toEqual([busKey(edge)]);
});
