import { effectiveAssetInput, loadModelInputOverrides, modelInputDate } from './modelInputContext';
const selection = { projectId: 'P', version: 'v1', modelName: 'Selected', inputDate: '2030-01-01T00:00', classNames: ['Generator'] };
const report = changes => ({ schema: 'nohm.atlas.scenario-preview.v1', project_id: 'P', model_version: 'v1',
  model_name: 'Selected', input_date: '2030-01-01T00:00:00', changes });
const fetchReport = payload => jest.fn(async () => ({ ok: true, json: async () => payload }));

test('the active input year is explicit, not guessed from an unrelated solution', () => {
  expect(modelInputDate({ requestedYear: 2050, selectedYear: 2030 })).toBe('2050-01-01T00:00');
  expect(modelInputDate({ selectedYear: 2030 })).toBe('2030-01-01T00:00');
  expect(modelInputDate({})).toBe('');
  expect(modelInputDate({ requestedYear: 2030, selectedYear: 2030, inputYear: null })).toBe('');
  expect(modelInputDate({ requestedYear: 2030, inputYear: 2050 })).toBe('2050-01-01T00:00');
});
test('attached scenario overrides include real zeros and retain unresolved evidence', async () => {
  const fetch = fetchReport(report([{ object_id: 'Generator:G', property: 'Capacity', after: { status: 'resolved', value: 0, unit: 'MW' } }]));
  const overrides = await loadModelInputOverrides(selection, fetch);
  expect(fetch.mock.calls[0][0]).toContain('input_date=2030-01-01T00%3A00%3A00');
  expect(effectiveAssetInput({ class_name: 'Generator', name: 'G' }, 'Capacity', { value: 100 }, overrides).value).toBe(0);
  expect(effectiveAssetInput({ class_name: 'Generator', name: 'Other' }, 'Capacity', { value: 100 }, overrides).value).toBe(100);
});
test('foreign model bindings and duplicate overrides cannot publish', async () => {
  await expect(loadModelInputOverrides(selection, fetchReport({ ...report([]), model_name: 'Other' }))).rejects.toThrow(/another model/);
  const row = { object_id: 'Generator:G', property: 'Capacity', after: { value: 1 } };
  await expect(loadModelInputOverrides(selection, fetchReport(report([row, row])))).rejects.toThrow(/ambiguous/);
});
