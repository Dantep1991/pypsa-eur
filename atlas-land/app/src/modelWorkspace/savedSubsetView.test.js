import { readSubsetView, saveSubsetView } from './savedSubsetView';
const context = { projectId: 'Example', version: 'v1', modelName: 'Base' };
const preview = { project_id: 'Example', model_version: 'v1', model_scope: { model_name: 'Base' },
  selection: { country_codes: ['FR'] }, source: { scene_fingerprint: 'sha256:abc' }, capabilities: { mutates_source: false, executable: false } };
beforeEach(() => localStorage.clear());
test('only the selection is saved, with exact version and Model identity', () => {
  saveSubsetView(localStorage, preview, context, true);
  expect(readSubsetView(localStorage, context, ['FR'])).toMatchObject({ countries: ['FR'], showContext: true });
  expect(localStorage.getItem(localStorage.key(0))).not.toContain('classifications');
  expect(readSubsetView(localStorage, { ...context, version: 'v2' }, ['FR'])).toBeNull();
  expect(readSubsetView(localStorage, { ...context, modelName: 'Branch' }, ['FR'])).toBeNull();
  expect(readSubsetView(localStorage, context, ['DE'])).toBeNull();
});
test('unverified previews and a different source model cannot be saved', () => {
  expect(() => saveSubsetView(localStorage, { ...preview, capabilities: { executable: true } }, context)).toThrow(/verified/);
  expect(() => saveSubsetView(localStorage, preview, { ...context, modelName: 'Branch' })).toThrow(/verified/);
});
