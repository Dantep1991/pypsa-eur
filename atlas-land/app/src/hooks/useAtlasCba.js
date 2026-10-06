import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultCbaSelection, fetchCbaScene, fetchCbaStudies } from '../modelWorkspace/cbaScene';

export default function useAtlasCba(context) {
  const [catalog, setCatalog] = useState({ state: 'idle', studies: [], error: '' });
  const [selection, setSelection] = useState(null);
  const [status, setStatus] = useState({ state: 'idle', data: null, error: '' });
  const [markerScale, setMarkerScale] = useState(1);
  const request = useRef(null);
  const sourceKey = `${context?.projectId || ''}:${context?.version || ''}`;
  const currentKey = useRef(sourceKey);
  currentKey.current = sourceKey;
  const sourceProject = context?.mode === 'model' ? context.projectId : '';
  useEffect(() => {
    const controller = new AbortController();
    request.current?.abort();
    setStatus({ state: 'idle', data: null, error: '' });
    setSelection(null);
    if (!sourceProject) { setCatalog({ state: 'idle', studies: [], error: '' }); return undefined; }
    setCatalog({ state: 'loading', studies: [], error: '' });
    fetchCbaStudies({ mode: 'model', projectId: sourceProject }, { signal: controller.signal }).then(studies => {
      if (controller.signal.aborted) return;
      setCatalog({ state: 'ready', studies, error: '' });
      setSelection(defaultCbaSelection(studies[0]));
    }).catch(error => {
      if (!controller.signal.aborted) setCatalog({ state: 'error', studies: [], error: error.message });
    });
    return () => controller.abort();
  }, [sourceProject, sourceKey]);
  useEffect(() => () => request.current?.abort(), []);
  const clear = useCallback(() => {
    request.current?.abort();
    setStatus({ state: 'idle', data: null, error: '' });
  }, []);
  const reset = useCallback(() => {
    clear(); setMarkerScale(1); setSelection(defaultCbaSelection(catalog.studies[0]));
  }, [clear, catalog.studies]);
  const show = async (beforeShow, selectionOverride = null) => {
    const requested = selectionOverride || selection;
    const study = catalog.studies.find(item => item.projectId === requested?.studyId);
    if (!study || !context?.version) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const key = sourceKey;
    beforeShow?.();
    setStatus({ state: 'loading', data: null, error: '', progress: { phase: 'Reading Theo assessment', completed: 0, total: 2 } });
    try {
      const data = await fetchCbaScene(context, study, requested, { signal: controller.signal,
        onProgress: progress => { if (!controller.signal.aborted && currentKey.current === key) setStatus(previous => ({ ...previous, progress })); } });
      if (!controller.signal.aborted && currentKey.current === key) { setStatus({ state: 'ready', data, error: '' }); return data; }
    } catch (error) {
      if (!controller.signal.aborted && currentKey.current === key) setStatus({ state: 'error', data: null, error: error.message });
    }
  };
  return { catalog, selection, setSelection, status, markerScale, setMarkerScale, show, clear, reset,
    scene: status.state === 'ready' && status.data?.coverage.mapped && status.data.sourceProjectId === context?.projectId
      && status.data.sourceModelVersion === context?.version ? status.data : null };
}
