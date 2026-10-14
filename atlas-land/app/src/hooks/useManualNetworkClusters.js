import { useCallback, useEffect, useState } from 'react';
import { readClusterSchemes, validateClusterScheme } from '../manualNetworkClusters';
import { API_BASE_URL } from '../config/api';
export default function useManualNetworkClusters(context) {
  const projectId = context?.projectId || 'reference';
  const [schemes, setSchemes] = useState(() => readClusterSchemes(window.localStorage, { projectId }));
  const [active, setActive] = useState(null);
  useEffect(() => {
    const controller=new AbortController();
    const cached=readClusterSchemes(window.localStorage,{projectId});
    setSchemes(cached);setActive(null);
    fetch(`${API_BASE_URL}/api/atlas/network-clusters/schemes?project=${encodeURIComponent(projectId)}`,{signal:controller.signal})
      .then(async response => { const data=await response.json();if(!response.ok) throw new Error(data.error);return data; })
      .then(data=>setSchemes([...data.schemes,...cached.filter(s=>!data.schemes.some(remote=>remote.id===s.id))]))
      .catch(()=>{});
    return ()=>controller.abort();
  }, [projectId]);
  const save = useCallback(async scheme => {
    validateClusterScheme(scheme);
    const response=await fetch(`${API_BASE_URL}/api/atlas/network-clusters/schemes`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:projectId,scheme}),
    });
    const data=await response.json();
    if(!response.ok) throw new Error(data.error || 'Could not save the grouping.');
    setSchemes(current=>[data.scheme,...current.filter(s=>s.id!==data.scheme.id)]);
  }, [projectId]);
  const load=useCallback(async id=>{
    const cached=readClusterSchemes(window.localStorage,{projectId}).find(s=>s.id===id);
    if(cached) return cached;
    const response=await fetch(`${API_BASE_URL}/api/atlas/network-clusters/schemes/${encodeURIComponent(id)}?project=${encodeURIComponent(projectId)}`);
    const data=await response.json();
    if(!response.ok) throw new Error(data.error || 'Could not read this grouping.');
    return validateClusterScheme(data.scheme);
  },[projectId]);
  return { schemes, active, setActive, save, load };
}
