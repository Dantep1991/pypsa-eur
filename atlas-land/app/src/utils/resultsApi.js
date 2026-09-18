import { API_BASE_URL } from '../config/api';

async function readResultsJson(url, signal) {
  const response = await fetch(url, { signal });
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  if (!response.ok) throw new Error('Results service unavailable');
  const data = await response.json();
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  if (!data || typeof data !== 'object' || Array.isArray(data) || !data.success) {
    throw new Error('Invalid results response');
  }
  return data;
}

export const fetchResultsAnalysis = async ({ signal } = {}) => {
  const data = await readResultsJson(`${API_BASE_URL}/api/emil/list-parquet-files`, signal);
  if (!Array.isArray(data.parquet_files) || data.parquet_files.some(file =>
    !file || typeof file.id !== 'string' || !file.id || typeof file.name !== 'string')) {
    throw new Error('Invalid file list');
  }
  return { metadata: { parquet_files: data.parquet_files,
    parquet_files_count: data.metadata?.parquet_files_count ?? data.parquet_files.length,
    columns: Array.isArray(data.metadata?.columns) ? data.metadata.columns : [] } };
};

export const fetchResultsData = async (page, fileId = null, filters = null, { signal } = {}) => {
  const params = new URLSearchParams({ page: String(page), per_page: '100' });
  if (fileId) params.set('file_id', fileId);
  for (const field of ['category_name', 'child_name', 'collection_name', 'sample_name']) {
    if (filters?.[field]) params.set(field, filters[field]);
  }
  const data = await readResultsJson(`${API_BASE_URL}/api/emil/results-file-data?${params}`, signal);
  if (!Array.isArray(data.data) || data.data.length > 100
    || data.data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Invalid result rows');
  }
  const pagination = data.pagination;
  if (!pagination || !Number.isSafeInteger(pagination.page) || pagination.page !== page
    || !Number.isSafeInteger(pagination.total_pages) || pagination.total_pages < 0
    || !Number.isSafeInteger(pagination.total_rows) || pagination.total_rows < 0
    || (pagination.original_rows != null && (!Number.isSafeInteger(pagination.original_rows) || pagination.original_rows < 0))) {
    throw new Error('Invalid result pagination');
  }
  return { data: data.data, pagination: data.pagination, loadedFile: data.loaded_file,
    filtersApplied: data.filters_applied || [], columns: data.data.length ? Object.keys(data.data[0]) : [] };
};

export const fetchFilterOptions = async (fileId, { signal } = {}) => {
  const data = await readResultsJson(`${API_BASE_URL}/api/emil/results-file-filter-options?file_id=${encodeURIComponent(fileId)}`, signal);
  const options = data.filter_options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid filters');
  const selected = {};
  for (const key of ['category_name', 'child_name', 'collection_name', 'sample_name']) {
    if (options[key] != null && (!Array.isArray(options[key])
      || options[key].some(value => typeof value !== 'string'))) throw new Error('Invalid filters');
    selected[key] = options[key] || [];
  }
  return selected;
};

export { askAboutResults } from './resultsStream';
