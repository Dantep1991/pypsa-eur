// Read-only canonical endpoints from loaded source branches, never proximity links.
import {busKey,countryOf,nativeClusterNodes,ungroupFacilities} from './manualNetworkClusters';
export function nativeClusterTopology(facilities=[],connections=[]) {
  const keys=new Set(nativeClusterNodes(facilities).map(n=>n.key));
  const buses=ungroupFacilities(facilities).filter(b=>keys.has(busKey(b)));
  const scoped=new Map(),raw=new Map(),countries=new Set(buses.map(countryOf));
  for(const bus of buses)for(const id of [bus.id,bus.name,bus.nodeId,bus.bus].filter(i=>i!=null)) {
    scoped.set(busKey(bus,id),bus);
    if(!raw.has(String(id)))raw.set(String(id),new Map());
    raw.get(String(id)).set(busKey(bus),bus);
  }
  const resolve=(edge,id,hint)=>{
    const exact=scoped.get(busKey({...edge,...(hint?{sourceCountryCode:hint}:{})},id));
    if(exact&&(!edge.is_cross_border_bridge||hint)&&(!hint||countryOf(exact)===hint))return busKey(exact);
    const matches=[...(raw.get(String(id))?.values()||[])].filter(b=>!hint||countryOf(b)===hint);
    return matches.length===1?busKey(matches[0]):null;
  };
  const external=(edge,id,country,coordinate)=>edge.is_cross_border_bridge&&edge.is_reference_topology
    &&country&&!countries.has(country)&&String(id).startsWith(`border-${country}-`)
    &&Array.isArray(coordinate)&&coordinate.length>=2&&coordinate.every(v=>Number.isFinite(Number(v)))
    ?`external:${JSON.stringify([country,String(id)])}`:null;
  const result=new Map(),unresolved=[];
  for(const edge of connections) {
    if(edge.atlas_network_carrier&&edge.atlas_network_carrier!=='electricity')continue;
    const a=edge.from??edge.fromNode??edge.bus0,b=edge.to??edge.toNode??edge.bus1;
    const aCountry=edge.from_country_code||edge.fromCountryCode||edge.fromCountry||edge.country0;
    const bCountry=edge.to_country_code||edge.toCountryCode||edge.toCountry||edge.country1;
    const path=edge.coordinates||[];
    const from=resolve(edge,a,aCountry)||external(edge,a,aCountry,path[0]);
    const to=resolve(edge,b,bCountry)||external(edge,b,bCountry,path[path.length-1]);
    const id=busKey(edge,edge.id??edge.name);
    if(!from||!to){unresolved.push(id);continue;}
    if(from===to)continue;
    result.set(id,{id,from,to,fromExternal:from.startsWith('external:'),toExternal:to.startsWith('external:'),
      sourceIds:edge.source_edge_ids?.length?edge.source_edge_ids.map(String):[String(edge.id??edge.name)]});
  }
  return {connections:[...result.values()].sort((a,b)=>a.id.localeCompare(b.id)),unresolved};
}
