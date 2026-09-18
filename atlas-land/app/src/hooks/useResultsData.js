import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchResultsAnalysis, fetchResultsData, fetchFilterOptions } from '../utils/resultsApi';

export const RESULTS_REQUEST_TIMEOUT_MS = 30_000;
const EMPTY_ROWS = Object.freeze([]);
const EMPTY_OPTIONS = Object.freeze({});

// One current snapshot per request kind, never a file/page history. The key
// masks old data synchronously before effects start a replacement request.
function useResource(key, load, label) {
  const latest = useRef(load);
  useLayoutEffect(() => { latest.current = load; }, [load]);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (key === null) return undefined;
    const controller = new AbortController();
    let disposed = false;
    const publish = state => { if (!disposed) setSnapshot({ key, revision, ...state }); };
    publish({ loading: true, data: null, error: '' });
    const timer = setTimeout(() => {
      controller.abort();
      publish({ loading: false, data: null, error: `${label} timed out. Please retry.` });
    }, RESULTS_REQUEST_TIMEOUT_MS);
    Promise.resolve().then(() => {
      if (!controller.signal.aborted) return latest.current(controller.signal);
      return null;
    }).then(data => {
      if (!disposed && !controller.signal.aborted) publish({ loading: false, data, error: '' });
    }).catch(() => {
      if (!disposed && !controller.signal.aborted) publish({ loading: false, data: null,
        error: `Could not load ${label.toLowerCase()}. Please retry.` });
    }).finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [key, revision, label]);
  const current = key !== null && snapshot?.key === key && snapshot.revision === revision;
  return { data: current ? snapshot.data : null, error: current ? snapshot.error : '',
    loading: key !== null && (!current || snapshot.loading), retry };
}

export function useResultsData({ active, fileId, filters, page }) {
  const catalogue = useResource(active ? 'catalogue' : null, signal => fetchResultsAnalysis({ signal }), 'Result files');
  const fileKey = active && fileId ? JSON.stringify([fileId]) : null;
  const options = useResource(fileKey, signal => fetchFilterOptions(fileId, { signal }), 'Filter options');
  const queryKey = fileKey && JSON.stringify([fileId, page, filters.category_name,
    filters.child_name, filters.collection_name, filters.sample_name]);
  const rows = useResource(queryKey, signal => fetchResultsData(page, fileId, filters, { signal }), 'Result rows');
  const analysis = catalogue.data && { ...catalogue.data, metadata: { ...catalogue.data.metadata,
    columns: rows.data?.columns || [] } };
  return {
    resultsAnalysis: analysis, resultsData: rows.data?.data || EMPTY_ROWS,
    resultsPagination: rows.data?.pagination || null,
    resultsFilterOptions: options.data || EMPTY_OPTIONS,
    resultsLoading: catalogue.loading || options.loading || rows.loading,
    resultsError: [catalogue.error, options.error, rows.error].filter(Boolean).join(' '),
    retryResults: () => { for (const resource of [catalogue, options, rows]) if (resource.error) resource.retry(); },
  };
}
