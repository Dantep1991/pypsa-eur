import { readAssetApi } from './modelAssets';

// One dated, version-bound input selection for Map display and Model database.
export function modelInputDate(meta = {}) {
  // A map planning horizon is not necessarily a model input year. Explicit
  // null inputYear permits constants or a single unambiguous linked-file year.
  const year = Number(Object.prototype.hasOwnProperty.call(meta, 'inputYear')
    ? meta.inputYear : meta.requestedYear || meta.selectedYear);
  return Number.isInteger(year) && year >= 1900 && year <= 2300 ? `${year}-01-01T00:00` : '';
}

export async function loadModelInputOverrides({ projectId, version, modelName, inputDate, classNames,
  apiBase, signal, timeoutMs = 30000 }, fetchImpl) {
  const changes = new Map();
  if (!modelName) return changes;
  if (!inputDate) throw new Error('Choose an input date for the active model scenarios.');
  const date = inputDate.length === 16 ? `${inputDate}:00` : inputDate;
  const params = new URLSearchParams({ version, model_name: modelName, input_date: date,
    class_names: [...new Set(classNames)].join(',') });
  const report = await readAssetApi(`/api/atlas/projects/${encodeURIComponent(projectId)}/scenario-preview?${params}`,
    { apiBase, signal, timeoutMs }, fetchImpl);
  if (signal?.aborted) throw new DOMException('Input loading cancelled', 'AbortError');
  if (report.schema !== 'nohm.atlas.scenario-preview.v1' || report.project_id !== projectId
      || report.model_version !== version || report.model_name !== modelName || report.input_date !== date
      || !Array.isArray(report.changes)) throw new Error('Scenario input values belong to another model selection.');
  report.changes.forEach(row => {
    const key = JSON.stringify([row.object_id, row.property]);
    if (changes.has(key)) throw new Error('Scenario inputs contain ambiguous property values.');
    changes.set(key, row.after);
  });
  return changes;
}

export function effectiveAssetInput(obj, property, baseValue, overrides) {
  return overrides?.get(JSON.stringify([`${obj.class_name}:${obj.name}`, property])) || baseValue;
}
