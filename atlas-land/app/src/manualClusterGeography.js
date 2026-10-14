// Dissolved geographic identities and source counts; never calculated grid flows.
const colours=['#dabd1d','#34b8a5','#a795d6','#e19b63','#88b69b','#d484a6','#aaa06e','#79a3b7'];
export function manualClusterGeographyOverlay(scheme) {
  const expanded=new Set(scheme?.expandedGroupIds || []);
  const groups=(scheme?.groups || []).filter(g=>g.geometry && (g.geographyOnly || !expanded.has(g.id)));
  if(!groups.length) return null;
  return {key:`${scheme.id}:${groups.map(g=>`${g.id}:${g.name}:${g.members.length}`).join('|')}`,
    opacity:35,meta:{clusters:groups.length,aggregation:true},
    data:{type:'FeatureCollection',features:groups.map((g,index)=>({type:'Feature',geometry:g.geometry,
      properties:{id:g.id,cluster:index+1,color:colours[index] || `hsl(${((index+1)*137.508)%360}, 42%, 62%)`,aggregate:true,
        name:`${g.name} · ${g.regionCount || 0} source regions · ${g.members.length} source buses${g.geographyOnly?' · geography only (no source grid assets)':''}`,
        countryCodes:g.countryCodes,regionIds:g.regionIds,sourceCount:g.members.length,geographyOnly:g.geographyOnly===true}}))}};
}
