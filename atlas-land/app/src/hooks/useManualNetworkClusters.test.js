import {renderHook,act,waitFor} from '@testing-library/react';
import useManualNetworkClusters from './useManualNetworkClusters';
const scheme={schema:'nohm.atlas.manual-clusters.v1',id:'manual-demo',name:'Demo',
  groups:[{id:'g',name:'Group',members:['["ES","native.nc","a"]'],countryCodes:['ES'],latitude:40,longitude:1}]};
const metadata={id:scheme.id,name:scheme.name,groupCount:1};
beforeEach(()=>{window.localStorage.clear();global.fetch=jest.fn();});
test('retrieves project metadata, saves to durable service and loads complete membership on demand',async()=>{
  fetch.mockResolvedValueOnce({ok:true,json:async()=>({schemes:[metadata]})});
  const {result}=renderHook(()=>useManualNetworkClusters({projectId:'Integration'}));
  await waitFor(()=>expect(result.current.schemes).toEqual([metadata]));
  expect(fetch.mock.calls[0][0]).toContain('project=Integration');
  fetch.mockResolvedValueOnce({ok:true,json:async()=>({scheme})});
  expect(await result.current.load('manual-demo')).toEqual(scheme);
  fetch.mockResolvedValueOnce({ok:true,json:async()=>({scheme:metadata})});
  await act(async()=>{await result.current.save(scheme);});
  const submitted=JSON.parse(fetch.mock.calls[2][1].body);
  expect(submitted).toEqual({project:'Integration',scheme});
});
test('save failure is not reported as a successful stored grouping',async()=>{
  fetch.mockResolvedValueOnce({ok:true,json:async()=>({schemes:[]})});
  const {result}=renderHook(()=>useManualNetworkClusters({projectId:'Integration'}));
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  fetch.mockResolvedValueOnce({ok:false,json:async()=>({error:'Disk unavailable'})});
  await expect(result.current.save(scheme)).rejects.toThrow('Disk unavailable');
  expect(result.current.schemes).toEqual([]);
});
