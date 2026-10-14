import {nativeClusterTopology} from './nativeClusterTopology';
import {busKey} from './manualNetworkClusters';
const bus=(country,id)=>({id:`bus-${country}-${id}`,name:id,bus:id,component_type:'bus',
  sourceCountryCode:country,sourceNetworkFilename:`base_${country}_full.nc`,latitude:50,longitude:4});
const a=bus('BE','a'),b=bus('BE','b'),foreign=bus('FR','a');
const branch=(id,from,to)=>({id,from,to,sourceCountryCode:'BE',sourceNetworkFilename:'base_BE_full.nc',type:'transformer'});

test('keeps actual transformers and resolves raw and prefixed source-bus aliases',()=>{
  const result=nativeClusterTopology([a,b],[branch('t1',a.id,b.id),branch('t2','a','b')]);
  expect(result.connections).toHaveLength(2);expect(result.unresolved).toEqual([]);
  expect(result.connections[0]).toMatchObject({from:busKey(a),to:busKey(b),sourceIds:['t1']});
});
test('never invents a nearest-bus connection for an unresolved endpoint',()=>{
  const result=nativeClusterTopology([a,b],[branch('broken',a.id,'missing')]);
  expect(result.connections).toEqual([]);expect(result.unresolved).toHaveLength(1);
});
test('explicit source-country scope disambiguates repeated raw bus identities',()=>{
  const result=nativeClusterTopology([a,b,foreign],[branch('t1','a','b')]);
  expect(result.connections[0]).toMatchObject({from:busKey(a),to:busKey(b)});
  const ambiguous=nativeClusterTopology([a,b,foreign],[{id:'unknown-scope',from:'a',to:'b'}]);
  expect(ambiguous.connections).toEqual([]);
});
test('uses explicitly reported external reference endpoints only',()=>{
  const reference={...branch('border',a.id,'border-FR-x'),is_cross_border_bridge:true,is_reference_topology:true,
    from_country_code:'BE',to_country_code:'FR',coordinates:[[4,50],[2,49]]};
  expect(nativeClusterTopology([a,b],[reference]).connections[0]).toMatchObject({from:busKey(a),toExternal:true});
  expect(nativeClusterTopology([a,b],[{...reference,is_reference_topology:false}]).connections).toEqual([]);
});
