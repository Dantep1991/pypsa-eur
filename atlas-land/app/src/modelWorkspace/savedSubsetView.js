// A small browser preference, not a materialised model or a saved classification.
// Restoring always requests a fresh version/Model-bound canonical preview.
const key = context => `nohm.atlas.subset-view.v1:${JSON.stringify([context.projectId, context.version, context.modelName || ''])}`;
export function saveSubsetView(storage, preview, context, showContext) {
  if (!preview || preview.project_id !== context.projectId || preview.model_version !== context.version
    || (preview.model_scope && (preview.model_scope.model_name || '') !== (context.modelName || ''))
    || preview.capabilities?.mutates_source !== false || preview.capabilities?.executable !== false) {
    throw new Error('Only a verified preview of the current model can be saved.');
  }
  const saved = { schema: 'nohm.atlas.subset-view.v1', projectId: context.projectId, version: context.version,
    modelName: context.modelName || '', countries: preview.selection.country_codes,
    showContext: Boolean(showContext), savedAt: new Date().toISOString(), sourceFingerprint: preview.source.scene_fingerprint,
    confirmedSourceModel: preview.model_scope?.model_name || null };
  storage.setItem(key(context), JSON.stringify(saved));
  return saved;
}
export function readSubsetView(storage, context, availableCountries) {
  const raw = storage.getItem(key(context));
  if (!raw) return null;
  const saved = JSON.parse(raw);
  if (saved.schema !== 'nohm.atlas.subset-view.v1' || saved.projectId !== context.projectId || saved.version !== context.version
    || saved.modelName !== (context.modelName || '') || !Array.isArray(saved.countries) || !saved.countries.length
    || saved.countries.some(country => !availableCountries.includes(country))) return null;
  return saved;
}
